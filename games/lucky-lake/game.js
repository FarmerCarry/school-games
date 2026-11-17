/*
 * Lucky Lake (بحيرة الحظ) — Action Monster & Treasure Claw Arcade UI & Renderer
 * Uses Kit, Kit.art, Kit.juice, and LLEngine.
 */
(function () {
  'use strict';

  var E = window.LLEngine;
  var canvas = document.getElementById('game');
  Kit.art.init({ canvas: canvas, mode: '2d', theme: 'day' });
  var view = Kit.fit(canvas, E.W, E.H, { onResize: function () { pausePainted = false; } });
  var ctx = view.ctx;

  Kit.muteButton();
  var store = Kit.store('lucky-lake');
  var save = E.loadSave(store.get('save', null));
  var saveBanner = Kit.saveStatus({ retry: function () { persistSave(); } });
  var dda = Kit.dda('lucky-lake', { id: 'main', target: 0.72, tiers: 5, start: 0.35 });

  var fx = Kit.art.fx(320);
  var boatSprings = [Kit.art.spring(240, 13), Kit.art.spring(240, 13)];

  function $(id) { return document.getElementById(id); }
  function onClick(id, fn) { $(id).addEventListener('click', fn); }

  var elHud = $('hud'), elHudWater = $('hudWater'), elHudTimer = $('hudTimer').querySelector('b');
  var elHudScore = $('hudScore'), elHudStars = $('hudStars'), elHudCoins = $('hudCoins').querySelector('b');
  var elHudStreak = $('hudStreak'), elBtnFinishFree = $('btnFinishFree'), elToast = $('catchToast');
  var scrTitle = $('scrTitle'), scrShop = $('scrShop'), scrBook = $('scrBook'), scrPause = $('scrPause'), scrResult = $('scrResult');

  var screen = 'title', mode = 'solo', diff = 'normal', freeFish = false, waterIdx = 0;
  var world = null;
  var previewWorld = E.createWorld({ water: 0, mode: 'solo', diff: 'normal', save: save, seed: 777 });
  var roundOpen = false, pausePainted = false, toastTimer = 0, waveClock = 0;
  var seedCounter = (Date.now() & 0x7fffffff) || 12345;

  // Surgical canvas-only pointer tracking so HTML buttons never trigger casts
  var mouseAim = null, pendingClick = null, mouseHeld = false;

  function persistSave() {
    if (store.set('save', save)) saveBanner.saved();
    else saveBanner.failed();
  }

  function sfxSplash(big) {
    Kit.audio.noise({ dur: big ? 0.21 : 0.13, vol: big ? 0.24 : 0.14, filter: big ? 1600 : 2400, to: 320 });
  }

  function showToast(msg, isBoss) {
    elToast.textContent = msg;
    elToast.className = isBoss ? 'll-toast boss' : 'll-toast';
    elToast.hidden = false;
    toastTimer = isBoss ? 2.4 : 1.5;
  }

  function closeRound(outcome, scoreVal) {
    if (!roundOpen) return;
    roundOpen = false;
    Kit.stats.end(outcome, scoreVal);
  }

  /* ------------------------------------------------- Sprite Baking (Kit.art) */

  function getBackdrop(idx) {
    var w = E.WATERS[idx] || E.WATERS[0];
    return Kit.art.sprite('bg:' + w.id, E.W, E.H, function (c, bw, bh) {
      var skyG = c.createLinearGradient(0, 0, 0, E.WATER_Y);
      skyG.addColorStop(0, w.sky[0]); skyG.addColorStop(1, w.sky[1]);
      c.fillStyle = skyG; c.fillRect(0, 0, bw, E.WATER_Y + 6);

      c.save();
      c.fillStyle = idx === 2 ? '#ffbe0b' : idx === 4 ? '#f72585' : '#fff3b0';
      c.globalAlpha = 0.85;
      c.beginPath(); c.arc(idx % 2 === 0 ? 1040 : 240, 74, 38, 0, Math.PI * 2); c.fill();
      c.restore();

      c.fillStyle = Kit.art.shade(w.water[1], -0.22);
      if (idx === 0) {
        c.beginPath();
        c.moveTo(30, E.WATER_Y); c.quadraticCurveTo(150, 114, 275, E.WATER_Y);
        c.moveTo(955, E.WATER_Y); c.quadraticCurveTo(1100, 108, 1250, E.WATER_Y);
        c.fill();
        var palms = [135, 1095];
        for (var pm = 0; pm < palms.length; pm++) {
          var px0 = palms[pm];
          c.strokeStyle = '#7f4f24'; c.lineWidth = 6;
          c.beginPath(); c.moveTo(px0, 132); c.quadraticCurveTo(px0 + 6, 102, px0 + 14, 86); c.stroke();
          c.fillStyle = '#2ec4b6';
          for (var lf = -2; lf <= 2; lf++) {
            c.beginPath(); c.ellipse(px0 + 14 + lf * 11, 86 + Math.abs(lf) * 3, 14, 5, lf * 0.35, 0, Math.PI * 2); c.fill();
          }
        }
      } else if (idx === 1) {
        c.beginPath(); c.moveTo(70, E.WATER_Y); c.lineTo(120, 108); c.lineTo(220, 124); c.lineTo(260, E.WATER_Y); c.fill();
      } else if (idx === 2) {
        c.beginPath(); c.moveTo(80, E.WATER_Y); c.lineTo(175, 96); c.lineTo(220, 96); c.lineTo(315, E.WATER_Y); c.fill();
        c.fillStyle = '#ff5722';
        c.beginPath(); c.moveTo(175, 96); c.lineTo(198, 128); c.lineTo(220, 96); c.fill();
      } else if (idx === 3) {
        c.fillStyle = '#e0f7ff';
        c.beginPath(); c.moveTo(60, E.WATER_Y); c.lineTo(130, 105); c.lineTo(185, 132); c.lineTo(240, 98); c.lineTo(310, E.WATER_Y); c.fill();
      } else {
        c.fillStyle = '#3a0ca3';
        c.fillRect(110, 108, 28, 68); c.fillRect(150, 126, 22, 50); c.fillRect(1080, 102, 32, 74);
      }

      var watG = c.createLinearGradient(0, E.WATER_Y, 0, E.FLOOR_Y);
      watG.addColorStop(0, w.water[0]); watG.addColorStop(0.48, w.water[1]); watG.addColorStop(1, w.water[2]);
      c.fillStyle = watG; c.fillRect(0, E.WATER_Y, bw, bh - E.WATER_Y);

      c.save();
      c.globalAlpha = 0.09; c.fillStyle = '#ffffff';
      for (var r = 0; r < 5; r++) {
        var rx = 160 + r * 240;
        c.beginPath();
        c.moveTo(rx, E.WATER_Y); c.lineTo(rx + 65, E.WATER_Y);
        c.lineTo(rx + 155, E.FLOOR_Y); c.lineTo(rx - 25, E.FLOOR_Y);
        c.closePath(); c.fill();
      }
      c.restore();

      for (var p = 0; p < 8; p++) {
        var px = 80 + p * 160;
        c.beginPath();
        c.moveTo(px - 18, E.FLOOR_Y + 6);
        c.quadraticCurveTo(px - 22, E.FLOOR_Y - 34, px - 8, E.FLOOR_Y - 38);
        c.quadraticCurveTo(px, E.FLOOR_Y - 52, px + 8, E.FLOOR_Y - 36);
        c.quadraticCurveTo(px + 22, E.FLOOR_Y - 30, px + 18, E.FLOOR_Y + 6);
        c.closePath();
        Kit.art.outlined(c, p % 2 === 0 ? w.accent : '#ef476f', 2.5);
      }

      c.beginPath(); c.moveTo(0, E.FLOOR_Y);
      for (var sx = 0; sx <= bw; sx += 80) {
        c.quadraticCurveTo(sx + 40, E.FLOOR_Y - 8 + (sx % 160 === 0 ? 6 : -5), sx + 80, E.FLOOR_Y);
      }
      c.lineTo(bw, bh); c.lineTo(0, bh); c.closePath();
      Kit.art.outlined(c, w.floor, 3);
    }, { scale: 1 });
  }

  function getBoatSprite(boatIdx, pIdx) {
    var b = E.BOATS[boatIdx] || E.BOATS[0];
    var hullColor = pIdx === 1 ? '#ff9f1c' : b.color;
    return Kit.art.sprite('boat:' + boatIdx + ':' + pIdx, 152, 84, function (c) {
      c.beginPath(); c.arc(90, 24, 9, 0, Math.PI * 2); Kit.art.outlined(c, '#ffe0bd', 2.4);
      c.beginPath(); c.arc(90, 18, 9, Math.PI, 0); c.closePath();
      Kit.art.outlined(c, pIdx === 1 ? '#ef476f' : '#ffd166', 2.2);

      Kit.art.round(c, 42, 14, 44, 28, 9); Kit.art.outlined(c, '#ffffff', 3);
      Kit.art.round(c, 49, 19, 28, 13, 5); c.fillStyle = '#4cc9f0'; c.fill();

      if (boatIdx === 1) {
        Kit.art.round(c, 10, 25, 28, 16, 6); Kit.art.outlined(c, '#ffd166', 2.5);
      } else if (boatIdx === 2) {
        c.strokeStyle = '#1b1640'; c.lineWidth = 4;
        c.beginPath(); c.moveTo(64, 3); c.lineTo(64, 15); c.stroke();
        c.beginPath(); c.moveTo(64, 3); c.lineTo(90, 9); c.lineTo(64, 14); c.closePath();
        Kit.art.outlined(c, '#ef476f', 2);
      } else if (boatIdx === 3) {
        c.beginPath(); c.moveTo(54, 15); c.lineTo(68, 1); c.lineTo(82, 15); c.closePath();
        Kit.art.outlined(c, hullColor, 2.5);
      }

      c.beginPath(); c.moveTo(10, 38); c.lineTo(142, 38); c.lineTo(124, 66); c.lineTo(28, 66); c.closePath();
      Kit.art.outlined(c, hullColor, 3.2);
      c.fillStyle = 'rgba(255,255,255,0.32)'; c.fillRect(20, 40, 112, 5);
      c.fillStyle = pIdx === 1 ? '#fff3b0' : '#ffd166'; c.fillRect(26, 48, 98, 6);

      c.beginPath(); c.arc(76, 68, 10, 0, Math.PI * 2); Kit.art.outlined(c, '#ffd166', 3);
    }, { pad: 6 });
  }

  function getClawSprite(magLvl) {
    return Kit.art.sprite('claw:' + magLvl, 44, 44, function (c) {
      c.strokeStyle = '#1b1640'; c.lineWidth = 5;
      c.beginPath();
      c.moveTo(22, 10); c.quadraticCurveTo(6, 22, 12, 37);
      c.moveTo(22, 10); c.quadraticCurveTo(38, 22, 32, 37);
      c.stroke();
      c.strokeStyle = magLvl >= 2 ? '#ffd166' : '#e2e8f0'; c.lineWidth = 2.4; c.stroke();
      c.beginPath(); c.arc(22, 12, 8, 0, Math.PI * 2);
      Kit.art.outlined(c, magLvl > 0 ? '#ff4d6d' : '#38bdf8', 2.8);
    }, { pad: 4 });
  }

  function getEntitySprite(ent) {
    var key = 'ent:' + (ent.specId || ent.kind), r = ent.r || 24;
    var isRound = ent.kind === 'chest' || ent.pearl || ent.hazard;
    var bw = Math.round(r * (isRound ? 2.15 : 2.7)), bh = Math.round(r * (isRound ? 2.05 : 2.0));

    return Kit.art.sprite(key, bw, bh, function (c, w, h) {
      var cx = w / 2, cy = h / 2, c1 = ent.color || '#ffbe0b', c2 = ent.color2 || '#ffffff';

      if (ent.pearl) {
        c.beginPath(); c.arc(cx, cy, r * 0.85, 0, Math.PI * 2); Kit.art.outlined(c, '#caf0f8', 2.5);
        c.beginPath(); c.arc(cx, cy, r * 0.56, 0, Math.PI * 2); Kit.art.outlined(c, '#ffd6ff', 2.2);
        c.fillStyle = 'rgba(255,255,255,0.75)';
        c.beginPath(); c.arc(cx - r * 0.24, cy - r * 0.24, r * 0.2, 0, Math.PI * 2); c.fill();
        return;
      }
      if (ent.kind === 'jelly') {
        c.strokeStyle = c2; c.lineWidth = 3;
        for (var t = -1; t <= 1; t++) {
          c.beginPath(); c.moveTo(cx + t * 8, cy + 2); c.lineTo(cx + t * 11 - 3, cy + 12); c.lineTo(cx + t * 9 + 3, cy + 20); c.stroke();
        }
        c.beginPath(); c.arc(cx, cy - 2, r * 0.72, Math.PI, 0); c.closePath();
        Kit.art.outlined(c, c1, 2.8);
        return;
      }
      if (ent.kind === 'mine') {
        c.strokeStyle = '#1b1640'; c.lineWidth = 5;
        for (var a = 0; a < 8; a++) {
          var ang = (a / 8) * Math.PI * 2;
          c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(ang) * (r * 0.95), cy + Math.sin(ang) * (r * 0.95)); c.stroke();
        }
        c.beginPath(); c.arc(cx, cy, r * 0.64, 0, Math.PI * 2); Kit.art.outlined(c, c1, 3);
        c.beginPath(); c.arc(cx, cy, r * 0.25, 0, Math.PI * 2); c.fillStyle = c2; c.fill();
        return;
      }
      if (ent.kind === 'chest') {
        Kit.art.round(c, cx - r * 0.82, cy - r * 0.5, r * 1.64, r * 1.2, 8); Kit.art.outlined(c, c2, 3);
        c.beginPath();
        c.arc(cx - r * 0.35, cy - r * 0.48, 6, 0, Math.PI * 2);
        c.arc(cx, cy - r * 0.54, 7, 0, Math.PI * 2);
        c.arc(cx + r * 0.35, cy - r * 0.48, 6, 0, Math.PI * 2);
        Kit.art.outlined(c, '#ffe66d', 2);
        Kit.art.round(c, cx - r * 0.86, cy - r * 0.68, r * 1.72, r * 0.48, 8); Kit.art.outlined(c, c1, 3);
        Kit.art.round(c, cx - 6, cy - 10, 12, 14, 4); Kit.art.outlined(c, '#ffe66d', 2.4);
        return;
      }
      if (ent.kind === 'crab') {
        c.strokeStyle = '#1b1640'; c.lineWidth = 3.5;
        for (var lg = -1; lg <= 1; lg += 2) {
          c.beginPath(); c.moveTo(cx + lg * 10, cy + 6); c.lineTo(cx + lg * 22, cy + 15);
          c.moveTo(cx + lg * 12, cy + 2); c.lineTo(cx + lg * 24, cy + 8); c.stroke();
        }
        c.beginPath();
        c.arc(cx - r * 0.68, cy - r * 0.48, 8.5, 0.4, Math.PI * 1.9);
        c.arc(cx + r * 0.68, cy - r * 0.48, 8.5, -0.4, Math.PI * 1.5);
        Kit.art.outlined(c, c2, 2.6);
        c.beginPath(); c.ellipse(cx, cy + 3, r * 0.78, r * 0.54, 0, 0, Math.PI * 2); Kit.art.outlined(c, c1, 3);
        c.fillStyle = '#1b1640';
        c.beginPath(); c.arc(cx - 7, cy - 2, 3.2, 0, Math.PI * 2); c.arc(cx + 7, cy - 2, 3.2, 0, Math.PI * 2); c.fill();
        return;
      }
      if (ent.kind === 'sub') {
        Kit.art.round(c, cx - 8, cy - r * 0.84, 16, 15, 4); Kit.art.outlined(c, c2, 2.6);
        c.beginPath(); c.ellipse(cx, cy, r * 0.92, r * 0.58, 0, 0, Math.PI * 2); Kit.art.outlined(c, c1, 3);
        c.beginPath(); c.arc(cx + r * 0.3, cy - 2, r * 0.24, 0, Math.PI * 2); Kit.art.outlined(c, '#caf0f8', 2.5);
        return;
      }
      if (ent.kind === 'octo' || ent.kind === 'boss_octo') {
        for (var k = -2; k <= 2; k++) {
          c.beginPath();
          c.moveTo(cx + k * (r * 0.28), cy + r * 0.1);
          c.quadraticCurveTo(cx + k * (r * 0.42), cy + r * 0.75, cx + k * (r * 0.24), cy + r * 0.82);
          c.strokeStyle = '#1b1640'; c.lineWidth = 7; c.stroke();
          c.strokeStyle = c2; c.lineWidth = 3.5; c.stroke();
        }
        c.beginPath(); c.arc(cx, cy - r * 0.12, r * 0.68, 0, Math.PI * 2); Kit.art.outlined(c, c1, 3.2);
        if (ent.boss) {
          c.beginPath(); c.moveTo(cx - 14, cy - r * 0.75); c.lineTo(cx, cy - r * 0.98); c.lineTo(cx + 14, cy - r * 0.75); c.closePath();
          Kit.art.outlined(c, '#ffd166', 2.5);
        }
        c.fillStyle = '#fff'; c.beginPath(); c.arc(cx + r * 0.22, cy - r * 0.12, 6, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#1b1640'; c.beginPath(); c.arc(cx + r * 0.25, cy - r * 0.12, 3, 0, Math.PI * 2); c.fill();
        return;
      }

      // Sleek Fish / Swordfish / Fierce Shark / Boss Leviathan (facing right)
      var isPredator = ent.kind.indexOf('shark') >= 0 || ent.boss;
      c.beginPath();
      c.moveTo(cx - r * 0.68, cy); c.lineTo(cx - r * 1.22, cy - r * 0.56);
      c.lineTo(cx - r * 0.98, cy); c.lineTo(cx - r * 1.22, cy + r * 0.56);
      c.closePath(); Kit.art.outlined(c, c2, 2.8);

      c.beginPath();
      c.moveTo(cx - r * 0.24, cy - r * 0.38);
      c.quadraticCurveTo(cx - r * 0.18, cy - r * 0.96, cx - r * 0.34, cy - r * 0.94);
      c.lineTo(cx + r * 0.24, cy - r * 0.40); c.closePath();
      Kit.art.outlined(c, ent.boss ? '#ffd166' : c2, 2.8);

      if (ent.boss) {
        c.beginPath();
        c.moveTo(cx + r * 0.08, cy - r * 0.44); c.lineTo(cx + r * 0.18, cy - r * 0.78);
        c.lineTo(cx + r * 0.30, cy - r * 0.56); c.lineTo(cx + r * 0.44, cy - r * 0.80);
        c.lineTo(cx + r * 0.48, cy - r * 0.40); c.closePath();
        Kit.art.outlined(c, '#ffd166', 2.4);
      }
      if (ent.kind === 'sword') {
        c.beginPath(); c.moveTo(cx + r * 0.7, cy - 3); c.lineTo(cx + r * 1.28, cy); c.lineTo(cx + r * 0.7, cy + 4); c.closePath();
        Kit.art.outlined(c, '#ffd166', 2.4);
      }

      c.beginPath();
      if (isPredator) {
        c.moveTo(cx + r * 0.98, cy + 2);
        c.quadraticCurveTo(cx + r * 0.25, cy - r * 0.66, cx - r * 0.78, cy);
        c.quadraticCurveTo(cx + r * 0.2, cy + r * 0.64, cx + r * 0.98, cy + 2);
      } else {
        c.ellipse(cx, cy, r * 0.84, r * (ent.kind === 'eel' ? 0.36 : 0.54), 0, 0, Math.PI * 2);
      }
      c.closePath(); Kit.art.outlined(c, c1, ent.boss ? 3.6 : 3);

      c.save(); c.fillStyle = 'rgba(255,255,255,0.28)';
      c.beginPath(); c.ellipse(cx + r * 0.05, cy - r * 0.22, r * 0.48, r * 0.14, -0.08, 0, Math.PI * 2); c.fill();
      c.restore();

      c.beginPath(); c.moveTo(cx + r * 0.05, cy + r * 0.18); c.lineTo(cx - r * 0.18, cy + r * 0.62); c.lineTo(cx + r * 0.25, cy + r * 0.26); c.closePath();
      Kit.art.outlined(c, c2, 2.2);

      if (isPredator) {
        c.fillStyle = '#ffffff';
        c.beginPath();
        c.moveTo(cx + r * 0.22, cy + r * 0.14); c.lineTo(cx + r * 0.72, cy + r * 0.12);
        c.lineTo(cx + r * 0.60, cy + r * 0.28); c.lineTo(cx + r * 0.48, cy + r * 0.15);
        c.lineTo(cx + r * 0.36, cy + r * 0.28); c.closePath();
        c.fill(); c.strokeStyle = '#1b1640'; c.lineWidth = 1.8; c.stroke();
      }

      c.beginPath(); c.arc(cx + r * 0.44, cy - r * 0.12, ent.boss ? 7 : 5, 0, Math.PI * 2); Kit.art.outlined(c, '#ffffff', 2);
      c.fillStyle = '#1b1640';
      c.beginPath(); c.arc(cx + r * 0.47, cy - r * 0.12, ent.boss ? 3.5 : 2.6, 0, Math.PI * 2); c.fill();
      if (isPredator) {
        c.strokeStyle = '#1b1640'; c.lineWidth = 3;
        c.beginPath(); c.moveTo(cx + r * 0.28, cy - r * 0.28); c.lineTo(cx + r * 0.58, cy - r * 0.20); c.stroke();
      }
    }, { pad: 6 });
  }

  /* ------------------------------------------------- Rendering */

  function drawWorldScene(wObj) {
    var wDef = E.WATERS[wObj.water] || E.WATERS[0];
    var bg = getBackdrop(wObj.water);
    if (bg && bg.canvas) ctx.drawImage(bg.canvas, 0, 0, E.W, E.H);

    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.lineWidth = 4;
    ctx.beginPath();
    for (var wx = 0; wx <= E.W; wx += 32) {
      var wy = E.WATER_Y + Math.sin(wx * 0.025 + waveClock * 2.8) * 3.5;
      if (wx === 0) ctx.moveTo(wx, wy); else ctx.lineTo(wx, wy);
    }
    ctx.stroke();
    ctx.restore();

    for (var i = 0; i < wObj.fish.length; i++) {
      var f = wObj.fish[i];
      if (f.boss || f.pearl) {
        Kit.art.blit(ctx, Kit.art.glow(f.boss ? wDef.accent : '#72efdd', f.boss ? 58 : 30), f.x, f.y, { alpha: 0.45 });
      }
      var flipX = f.kind === 'chest' || f.pearl || f.hazard ? 1 : (f.dir < 0 ? -1 : 1);
      Kit.art.blit(ctx, getEntitySprite(f), f.x, f.y, { sx: flipX, rot: f.kind === 'chest' ? 0 : Math.sin(f.phase) * 0.06 });
    }

    var clawSpr = getClawSprite(save.upgrades.magnet | 0);
    for (var pi = 0; pi < wObj.players.length; pi++) {
      var p = wObj.players[pi], bob = Math.sin(waveClock * 3 + pi * 1.7) * 2.5;
      var sprBoat = getBoatSprite(wObj.gear.boatIdx, pi), sp = boatSprings[pi] || boatSprings[0];

      if (screen === 'play' && p.state === 'ready') {
        ctx.save();
        ctx.strokeStyle = pi === 1 ? 'rgba(255,159,28,0.55)' : 'rgba(114,239,221,0.6)';
        ctx.lineWidth = 3; ctx.setLineDash([8, 8]);
        ctx.beginPath();
        ctx.moveTo(p.x, E.TURRET_Y);
        ctx.lineTo(p.x + Math.cos(p.aimAngle) * 320, Math.min(E.FLOOR_Y - 12, E.TURRET_Y + Math.sin(p.aimAngle) * 320));
        ctx.stroke(); ctx.setLineDash([]);

        ctx.strokeStyle = pi === 1 ? '#ff9f1c' : '#72efdd'; ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(Kit.clamp(p.aimX, 50, E.W - 50), Kit.clamp(p.aimY, E.WATER_Y + 26, E.FLOOR_Y - 16), Math.min(44, 14 + wObj.gear.magRadius * 0.45), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      if (p.state !== 'ready') {
        ctx.save();
        ctx.strokeStyle = p.state === 'tug' ? '#ffd166' : (p.stunTimer > 0 ? '#ff4d6d' : '#e2e8f0');
        ctx.lineWidth = p.state === 'tug' ? 5 : 3.2;
        ctx.beginPath(); ctx.moveTo(p.x, E.TURRET_Y + bob); ctx.lineTo(p.hook.x, p.hook.y); ctx.stroke();
        ctx.restore();
        if (p.carrying) Kit.art.blit(ctx, getEntitySprite(p.carrying), p.hook.x, p.hook.y + 14, { rot: Math.sin(waveClock * 14) * 0.16 });
        Kit.art.blit(ctx, clawSpr, p.hook.x, p.hook.y, { rot: Math.atan2(p.hook.y - E.TURRET_Y, p.hook.x - p.x) - Math.PI / 2 });
      }

      Kit.art.blit(ctx, sprBoat, p.x, E.BOAT_Y + bob, { sx: sp.sx, sy: sp.sy });
      if (p.state === 'ready') {
        Kit.art.blit(ctx, clawSpr, p.x, E.TURRET_Y + 8 + bob, { rot: p.aimAngle - Math.PI / 2, sx: 0.82, sy: 0.82 });
      }

      if (wObj.players.length > 1) {
        ctx.save();
        ctx.font = '700 15px Fredoka'; ctx.textAlign = 'center';
        ctx.fillStyle = pi === 0 ? '#4cc9f0' : '#ffd166'; ctx.strokeStyle = '#1b1640'; ctx.lineWidth = 4;
        var lbl = pi === 0 ? 'لاعب 1' : 'لاعب 2';
        ctx.strokeText(lbl, p.x, E.BOAT_Y - 46 + bob); ctx.fillText(lbl, p.x, E.BOAT_Y - 46 + bob);
        ctx.restore();
      }

      if (p.state === 'tug' && p.tug) {
        var bx = Kit.clamp(p.x, 120, E.W - 120), by = E.BOAT_Y - 68;
        ctx.save();
        Kit.art.round(ctx, bx - 92, by - 14, 184, 26, 12); Kit.art.outlined(ctx, '#1b1640', 3);
        Kit.art.round(ctx, bx - 88, by - 10, Math.max(10, Math.round(176 * p.tug.progress)), 18, 9);
        ctx.fillStyle = p.tug.progress > 0.7 ? '#3ddc84' : '#ffd166'; ctx.fill();
        ctx.font = '700 16px Fredoka'; ctx.textAlign = 'center'; ctx.strokeStyle = '#1b1640'; ctx.lineWidth = 4;
        var promptTxt = pi === 1 ? 'اسحب الزعيم! Enter ⚡' : 'اسحب الزعيم! نقر / Space ⚡';
        ctx.strokeText(promptTxt, bx, by - 24); ctx.fillStyle = '#ffffff'; ctx.fillText(promptTxt, bx, by - 24);
        ctx.restore();
      }
    }
  }

  function render() {
    if (screen === 'pause' && pausePainted) return;
    if (screen === 'pause') pausePainted = true;
    ctx.save();
    Kit.art.shake.apply(ctx);
    drawWorldScene(world || previewWorld);
    fx.draw(ctx);
    Kit.art.pop.draw(ctx);
    Kit.art.flash.draw(ctx, E.W, E.H);
    ctx.restore();
  }

  /* ------------------------------------------------- HUD & Screens */

  function totalEarnedStars() {
    var sum = 0;
    for (var i = 0; i < save.waters.length; i++) sum += save.waters[i].stars | 0;
    return sum;
  }

  function discoveredCount() { return Object.keys(save.book).length; }
  function starText(n) { return (n >= 1 ? '★' : '☆') + (n >= 2 ? '★' : '☆') + (n >= 3 ? '★' : '☆'); }

  function refreshTitleUI() {
    document.querySelector('#titleCoins b').textContent = Kit.fmt(save.coins);
    document.querySelector('#titleStars b').textContent = totalEarnedStars() + '/15';
    document.querySelector('#titleAlbum b').textContent = discoveredCount() + '/' + E.SPECIES.length;
    $('howto1p').hidden = mode !== 'solo';
    $('howto2p').hidden = mode === 'solo';
    $('btnFreeFish').setAttribute('aria-pressed', String(freeFish));

    var grid = $('waterGrid');
    grid.innerHTML = '';
    for (var i = 0; i < E.WATERS.length; i++) {
      (function (idx) {
        var w = E.WATERS[idx], rec = save.waters[idx] || { stars: 0, boss: false };
        var card = document.createElement('button');
        card.type = 'button';
        card.className = 'll-water-card' + (idx === waterIdx ? ' active' : '');
        card.setAttribute('data-water', String(idx));
        card.innerHTML =
          '<span class="ll-water-dot" style="background:linear-gradient(90deg,' + w.water[0] + ',' + w.accent + ')"></span>' +
          '<b>' + w.name + (rec.boss ? ' 👑' : '') + '</b><small>' + w.sub + '</small>' +
          '<span class="ll-water-stars" dir="ltr">' + starText(rec.stars) + '</span>';
        card.addEventListener('click', function () {
          waterIdx = idx;
          previewWorld = E.createWorld({ water: waterIdx, mode: 'solo', diff: diff, save: save, seed: 700 + idx });
          Kit.juice.tap();
          refreshTitleUI();
        });
        grid.appendChild(card);
      })(i);
    }
  }

  function refreshShopUI() {
    $('shopCoins').textContent = Kit.fmt(save.coins);
    var bShelf = $('boatShelf');
    bShelf.innerHTML = '';
    for (var i = 0; i < E.BOATS.length; i++) {
      (function (idx) {
        var b = E.BOATS[idx], owned = !!save.boats[idx], eq = save.boat === idx;
        var card = document.createElement('div');
        card.className = 'll-item-card' + (eq ? ' equipped' : '');
        card.innerHTML = '<b>' + b.name + '</b><small>' + b.desc + '</small>';
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'll-buy-btn' + (owned ? ' good' : '');
        btn.disabled = eq || (!owned && save.coins < b.cost);
        btn.textContent = eq ? 'مُجهّز ✓' : owned ? 'اختر القارب' : ('اشترِ · 🪙 ' + b.cost);
        btn.addEventListener('click', function () {
          if (E.buyBoat(save, idx)) {
            Kit.juice.select(); persistSave();
            previewWorld = E.createWorld({ water: waterIdx, mode: 'solo', diff: diff, save: save, seed: 800 + idx });
            refreshShopUI(); refreshTitleUI();
          } else Kit.juice.error();
        });
        card.appendChild(btn);
        bShelf.appendChild(card);
      })(i);
    }

    var uShelf = $('upgradeShelf'), keys = ['magnet', 'reel', 'shock'];
    uShelf.innerHTML = '';
    for (var k = 0; k < keys.length; k++) {
      (function (key) {
        var def = E.UPGRADES[key], lvl = save.upgrades[key] | 0, maxed = lvl >= def.max, cost = maxed ? 0 : def.costs[lvl];
        var card = document.createElement('div');
        card.className = 'll-item-card' + (maxed ? ' equipped' : '');
        var pips = '<div class="ll-pips">';
        for (var p = 0; p < def.max; p++) pips += '<i class="ll-pip' + (p < lvl ? ' on' : '') + '"></i>';
        card.innerHTML = '<b>' + def.name + '</b><small>' + def.desc + '</small>' + pips + '</div>';
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'll-buy-btn' + (maxed ? ' good' : '');
        btn.disabled = maxed || save.coins < cost;
        btn.textContent = maxed ? 'الحد الأقصى ✓' : ('تطوير · 🪙 ' + cost);
        btn.addEventListener('click', function () {
          if (E.buyUpgrade(save, key)) {
            Kit.juice.levelUp(); persistSave(); refreshShopUI(); refreshTitleUI();
          } else Kit.juice.error();
        });
        card.appendChild(btn);
        uShelf.appendChild(card);
      })(keys[k]);
    }
  }

  function refreshBookUI() {
    $('bookCount').textContent = discoveredCount() + '/' + E.SPECIES.length;
    var grid = $('bookGrid');
    grid.innerHTML = '';
    for (var i = 0; i < E.SPECIES.length; i++) {
      var sp = E.SPECIES[i], rec = save.book[sp.id], card = document.createElement('div');
      card.className = 'll-badge-card' + (rec ? ' caught' : '') + (sp.boss ? ' boss' : '');
      var mini = document.createElement('canvas');
      mini.width = 72; mini.height = 50;
      var spr = getEntitySprite(sp), mc = mini.getContext('2d');
      if (spr && spr.canvas) {
        mc.save(); if (!rec) mc.filter = 'brightness(0.12)';
        mc.drawImage(spr.canvas, 8, 4, 56, 42); mc.restore();
      }
      var title = document.createElement('b'), sub = document.createElement('small');
      title.textContent = rec ? (sp.name + (sp.boss ? ' 👑' : '')) : '؟؟؟';
      sub.textContent = rec ? ('صِيد ' + rec.count + '× · ' + rec.maxWeight + ' كغ') : E.WATERS[sp.water].name;
      card.appendChild(mini); card.appendChild(title); card.appendChild(sub);
      grid.appendChild(card);
    }
  }

  function refreshHud() {
    if (!world) return;
    elHudWater.textContent = E.WATERS[world.water].name;
    elHudTimer.textContent = world.freeFish ? 'حر' : String(Math.ceil(world.timeLeft));
    if (world.mode === 'versus' && world.players[1]) {
      elHudScore.innerHTML = 'ل1: <b dir="ltr">' + Kit.fmt(world.players[0].score) + '</b> · ل2: <b dir="ltr">' + Kit.fmt(world.players[1].score) + '</b>';
      elHudStars.hidden = true;
    } else {
      var nextGoal = world.goals[Math.min(2, E.tripStars(world))];
      elHudScore.innerHTML = '⭐ <b dir="ltr">' + Kit.fmt(world.score) + '</b> / <span dir="ltr">' + Kit.fmt(nextGoal) + '</span>';
      elHudStars.hidden = false;
      elHudStars.textContent = starText(E.tripStars(world));
    }
    elHudCoins.textContent = Kit.fmt(save.coins);
    var bestStreak = Math.max(world.players[0].streak, world.players[1] ? world.players[1].streak : 0);
    elHudStreak.hidden = bestStreak < 2;
    if (bestStreak >= 2) elHudStreak.querySelector('b').textContent = bestStreak + '×';
    elBtnFinishFree.hidden = !world.freeFish;
  }

  function showScreen(next) {
    screen = next;
    pausePainted = false;
    scrTitle.hidden = next !== 'title'; scrShop.hidden = next !== 'shop'; scrBook.hidden = next !== 'book';
    scrPause.hidden = next !== 'pause'; scrResult.hidden = next !== 'result';
    elHud.hidden = next !== 'play' && next !== 'pause';
    if (next === 'title') { world = null; refreshTitleUI(); }
    else if (next === 'shop') refreshShopUI();
    else if (next === 'book') refreshBookUI();
  }

  /* ------------------------------------------------- Trip Lifecycle */

  function startTrip() {
    closeRound('quit', world ? world.score : 0);
    mouseAim = null; pendingClick = null; mouseHeld = false; toastTimer = 0;
    elToast.hidden = true;
    Kit.keys.reset();

    seedCounter = (seedCounter * 1664525 + 1013904223) >>> 0;
    world = E.createWorld({
      water: waterIdx, mode: mode, diff: diff, freeFish: freeFish,
      save: save, ddaLevel: dda.level, seed: seedCounter || 42
    });
    var roundId = E.WATERS[waterIdx].id + '_' + mode;
    Kit.stats.round(roundId);
    roundOpen = true;
    showScreen('play');
    refreshHud();
  }

  function pauseTrip() {
    if (screen !== 'play') return;
    mouseHeld = false; pendingClick = null; Kit.keys.reset();
    showScreen('pause');
  }

  function resumeTrip() {
    if (screen !== 'pause') return;
    mouseHeld = false; pendingClick = null; Kit.keys.reset();
    showScreen('play');
  }

  function restartTrip() { Kit.juice.select(); startTrip(); }

  function finishTrip(isVoluntaryFree) {
    if (!world) return;
    var stars = E.recordTripEnd(save, world);
    persistSave();

    if (isVoluntaryFree) {
      closeRound('end', world.score); Kit.juice.star(Math.max(1, stars));
    } else if (world.mode === 'versus') {
      var win = E.versusWinner(world);
      closeRound(win === 0 ? 'draw' : 'end', Math.max(world.players[0].score, world.players[1].score));
      Kit.juice.levelUp();
    } else {
      closeRound(stars >= 1 ? 'win' : 'lose', world.score);
      if (stars >= 1) Kit.juice.star(stars); else Kit.juice.fail();
    }

    var resTitle = $('resTitle'), resStars = $('resStars'), resStats = $('resStats');
    if (world.mode === 'versus') {
      var wPlayer = E.versusWinner(world);
      resTitle.textContent = wPlayer === 1 ? 'فاز اللاعب 1! 🏆' : wPlayer === 2 ? 'فاز اللاعب 2! 🏆' : 'تعادل بطولي! 🤝';
      resStars.textContent = '⚔️ 🏆 ⚔️';
      resStats.innerHTML =
        '<div>اللاعب 1: <b dir="ltr">' + Kit.fmt(world.players[0].score) + '</b> نقطة (' + world.players[0].catches + ' صيد)</div>' +
        '<div>اللاعب 2: <b dir="ltr">' + Kit.fmt(world.players[1].score) + '</b> نقطة (' + world.players[1].catches + ' صيد)</div>' +
        '<div>غنائم الذهب المضافة: 🪙 <b dir="ltr">+' + Kit.fmt(world.coins) + '</b></div>';
    } else {
      resTitle.textContent = stars === 3 ? 'صيد أسطوري خارق! 👑' : stars >= 1 ? 'رحلة ناجحة يا قبطان!' : 'حاول مجدداً لصيد أكبر!';
      resStars.textContent = starText(stars);
      resStats.innerHTML =
        '<div>مجموع النقاط: <b dir="ltr">' + Kit.fmt(world.score) + '</b></div>' +
        '<div>الوحوش والكنوز: <b dir="ltr">' + world.trip + '</b>' + (world.bossCaught ? ' · 👑 اصطدت الزعيم!' : '') + '</div>' +
        '<div>غنائم الذهب: 🪙 <b dir="ltr">+' + Kit.fmt(world.coins) + '</b></div>';
    }
    $('btnNextWater').hidden = waterIdx >= E.WATERS.length - 1;
    showScreen('result');
  }

  /* ------------------------------------------------- Event Processing & Update */

  function handleWorldEvents() {
    for (var i = 0; i < world.events.length; i++) {
      var ev = world.events[i], sp = boatSprings[ev.player || 0] || boatSprings[0];
      if (ev.type === 'cast') {
        sp.kick(-3.2); Kit.juice.whoosh(0.75); sfxSplash(false);
        fx.burst(ev.x, E.WATER_Y + 4, { n: 8, color: '#caf0f8', speed: 140, size: 7, life: 0.4 });
      } else if (ev.type === 'hooked') {
        Kit.juice.pop(0.5);
        fx.burst(ev.x, ev.y, { n: 10, color: '#72efdd', speed: 150, size: 7, life: 0.45 });
      } else if (ev.type === 'bossHooked') {
        Kit.juice.impact(0.88); sfxSplash(true); Kit.art.shake.add(0.32);
        showToast('⚡ علق الزعيم: ' + ev.name + '! اسحبه بسرعة!', true);
      } else if (ev.type === 'coopBoost') {
        Kit.juice.streak(4);
        Kit.art.pop('مساندة خارقة! ⚡', ev.x, ev.y - 20, { color: '#3ddc84', size: 24 });
      } else if (ev.type === 'catch' || ev.type === 'bossLanded') {
        E.recordCatch(save, ev.specId, ev.weight, ev.coins); persistSave();
        Kit.track.hit();
        if (world.mode === 'solo') dda.result(1);
        sp.kick(ev.boss ? 6.5 : 3.8); sfxSplash(ev.boss);
        if (ev.boss) {
          Kit.juice.levelUp(); Kit.art.shake.add(0.45); Kit.art.flash('#ffd166', 180);
          fx.burst(ev.x, ev.y, { n: 28, color: '#ffd166', shape: 'star', speed: 260, size: 12, life: 0.9 });
          showToast('👑 زعيم الأعماق: ' + ev.name + '! +' + ev.coins + ' 🪙', true);
        } else {
          Kit.juice.coin(Math.min(5, ev.streak || 1));
          if (ev.streak >= 2) Kit.juice.streak(ev.streak);
          fx.burst(ev.x, ev.y, { n: 14, color: '#ffd166', shape: 'star', speed: 190, size: 9, life: 0.65 });
          showToast(ev.name + '! +' + ev.coins + ' 🪙' + (ev.streak >= 2 ? ' · سلسلة ' + ev.streak + '×' : ''), false);
        }
        Kit.art.pop('+' + ev.score, ev.x, ev.y - 16, { color: '#ffd166', size: ev.boss ? 34 : 26 });
      } else if (ev.type === 'pearl') {
        save.coins += ev.coins; persistSave(); Kit.track.hit(); Kit.juice.chime(2);
        fx.burst(ev.x, ev.y, { n: 14, color: '#ffd6ff', shape: 'spark', speed: 180, size: 9, life: 0.6 });
        Kit.art.pop('لؤلؤة ×' + ev.streak + '!', ev.x, ev.y, { color: '#72efdd', size: 24 });
      } else if (ev.type === 'shockZap') {
        save.coins += ev.coins; persistSave(); Kit.track.hit(); Kit.juice.impact(0.55); Kit.juice.coin(3);
        fx.burst(ev.x, ev.y, { n: 16, color: '#4cc9f0', shape: 'spark', speed: 220, size: 9, life: 0.55 });
        showToast('⚡ تفجير اللغم! +' + ev.coins + ' 🪙', false);
      } else if (ev.type === 'bounce') {
        Kit.juice.pop(0.8); Kit.art.pop('ارتداد آمن!', ev.x, ev.y - 12, { color: '#72efdd', size: 22 });
      } else if (ev.type === 'hazardHit') {
        Kit.track.miss(); if (world.mode === 'solo') dda.result(0);
        Kit.juice.error(); Kit.art.shake.add(0.28);
        fx.burst(ev.x, ev.y, { n: 16, color: '#ff4d6d', shape: 'spark', speed: 200, size: 9, life: 0.5 });
        showToast('⚡ صعقة! تجنّب ' + ev.name, false);
      } else if (ev.type === 'emptyCast') {
        Kit.track.miss();
      } else if (ev.type === 'bossEscape') {
        if (world.mode === 'solo') dda.result(0.25);
        Kit.juice.fail();
        showToast('أفلت الزعيم! ارمِ الخطاف مجدداً!', false);
      } else if (ev.type === 'tripEnd') {
        world.events.length = 0; finishTrip(false); return;
      }
    }
    world.events.length = 0;
  }

  function gatherInputs() {
    var k = Kit.keys;
    if (mode === 'solo') {
      var mx = (k.anyDown(['KeyD', 'ArrowRight']) ? 1 : 0) - (k.anyDown(['KeyA', 'ArrowLeft']) ? 1 : 0);
      var tilt = (k.anyDown(['KeyS', 'ArrowDown']) ? 1 : 0) - (k.anyDown(['KeyW', 'ArrowUp']) ? 1 : 0);
      if (mx !== 0 || tilt !== 0) mouseAim = null;
      var clickNow = pendingClick; pendingClick = null;
      return [{
        moveX: mx, aimTilt: tilt, pointerAim: mouseAim, followX: mouseAim ? mouseAim.x : null,
        clickTarget: clickNow, castPress: k.anyPressed(['Space', 'Enter']), castHold: k.anyDown(['Space', 'Enter']) || mouseHeld
      }];
    }
    pendingClick = null;
    return [
      { moveX: (k.down('KeyD') ? 1 : 0) - (k.down('KeyA') ? 1 : 0), aimTilt: (k.down('KeyS') ? 1 : 0) - (k.down('KeyW') ? 1 : 0), castPress: k.pressed('Space'), castHold: k.down('Space') },
      { moveX: (k.down('ArrowRight') ? 1 : 0) - (k.down('ArrowLeft') ? 1 : 0), aimTilt: (k.down('ArrowDown') ? 1 : 0) - (k.down('ArrowUp') ? 1 : 0), castPress: k.pressed('Enter'), castHold: k.down('Enter') }
    ];
  }

  function update(dt) {
    if (screen === 'pause' || screen === 'result' || screen === 'shop' || screen === 'book') {
      Kit.keys.endFrame(); return;
    }
    waveClock += dt;
    fx.update(dt); Kit.art.pop.update(dt); Kit.art.shake.update(dt); Kit.art.flash.update(dt);
    boatSprings[0].update(dt); boatSprings[1].update(dt);

    if (screen === 'title') {
      E.stepWorld(previewWorld, dt, []);
      if (previewWorld.over) previewWorld = E.createWorld({ water: waterIdx, mode: 'solo', diff: diff, save: save, seed: 700 + waterIdx });
      Kit.keys.endFrame(); return;
    }
    if (screen === 'play' && world) {
      if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) elToast.hidden = true; }
      E.stepWorld(world, dt, gatherInputs());
      handleWorldEvents();
      if (screen === 'play') refreshHud();
    }
    Kit.keys.endFrame();
  }

  /* ------------------------------------------------- DOM & Input Listeners */

  canvas.addEventListener('pointermove', function (e) {
    if (screen !== 'play' || mode !== 'solo') return;
    var pt = view.toLogical(e.clientX, e.clientY);
    if (pt.y > E.WATER_Y - 24) mouseAim = pt;
  });
  canvas.addEventListener('pointerdown', function (e) {
    if (e.button !== 0 || screen !== 'play') return;
    var pt = view.toLogical(e.clientX, e.clientY);
    mouseHeld = true;
    if (mode === 'solo') { mouseAim = pt; pendingClick = pt; }
  });
  window.addEventListener('pointerup', function () { mouseHeld = false; });
  window.addEventListener('pointercancel', function () { mouseHeld = false; });

  window.addEventListener('keydown', function (e) {
    if (!Kit.isGameKeyEvent(e)) return;
    if (e.code === 'Escape') {
      if (screen === 'play') { pauseTrip(); e.preventDefault(); }
      else if (screen === 'pause') { resumeTrip(); e.preventDefault(); }
      else if (screen === 'shop' || screen === 'book') { Kit.juice.back(); showScreen('title'); e.preventDefault(); }
      return;
    }
    if (!e.repeat && e.code === 'KeyP') {
      if (screen === 'play') pauseTrip(); else if (screen === 'pause') resumeTrip();
    } else if (!e.repeat && e.code === 'KeyR') {
      if (screen === 'play' || screen === 'pause' || screen === 'result') restartTrip();
    }
  });

  var modeBtns = document.querySelectorAll('[data-mode]');
  for (var mi = 0; mi < modeBtns.length; mi++) {
    modeBtns[mi].addEventListener('click', function () {
      mode = this.getAttribute('data-mode');
      for (var j = 0; j < modeBtns.length; j++) modeBtns[j].classList.toggle('on', modeBtns[j] === this);
      Kit.juice.tap(); refreshTitleUI();
    });
  }

  var diffBtns = document.querySelectorAll('[data-diff]');
  for (var di = 0; di < diffBtns.length; di++) {
    diffBtns[di].addEventListener('click', function () {
      diff = this.getAttribute('data-diff');
      for (var j = 0; j < diffBtns.length; j++) diffBtns[j].classList.toggle('on', diffBtns[j] === this);
      Kit.juice.tap();
    });
  }

  onClick('btnFreeFish', function () { freeFish = !freeFish; Kit.juice.toggle(freeFish); refreshTitleUI(); });
  onClick('btnPlay', function () { Kit.juice.select(); startTrip(); });
  onClick('btnShop', function () { Kit.juice.tap(); showScreen('shop'); });
  onClick('btnShopClose', function () { Kit.juice.back(); showScreen('title'); });
  onClick('btnBook', function () { Kit.juice.tap(); showScreen('book'); });
  onClick('btnBookClose', function () { Kit.juice.back(); showScreen('title'); });
  onClick('btnPause', function () { Kit.juice.tap(); pauseTrip(); });
  onClick('btnResume', function () { Kit.juice.select(); resumeTrip(); });
  onClick('btnRestart', function () { restartTrip(); });
  onClick('btnMenu', function () { closeRound('quit', world ? world.score : 0); Kit.juice.back(); showScreen('title'); });
  onClick('btnFinishFree', function () { finishTrip(true); });
  onClick('btnAgain', function () { Kit.juice.select(); startTrip(); });
  onClick('btnNextWater', function () { if (waterIdx < E.WATERS.length - 1) waterIdx += 1; Kit.juice.select(); startTrip(); });
  onClick('btnResultShop', function () { Kit.juice.tap(); showScreen('shop'); });
  onClick('btnResultMenu', function () { Kit.juice.back(); showScreen('title'); });

  Kit.lifecycle({
    pause: function () { if (screen === 'play') pauseTrip(); },
    reset: function () { mouseHeld = false; pendingClick = null; }
  });

  window.__game = {
    get state() {
      var a = world;
      return {
        screen: screen, mode: mode, diff: diff, freeFish: freeFish, water: waterIdx, waterId: E.WATERS[waterIdx].id,
        paused: screen === 'pause', tripOpen: roundOpen,
        time: a ? Math.round(a.time * 1000) / 1000 : 0, timeLeft: a ? Math.round(a.timeLeft * 100) / 100 : 0,
        trip: a ? a.trip : 0, score: a ? a.score : 0, coins: save.coins,
        stars: a ? E.tripStars(a) : 0, bossCaught: a ? a.bossCaught : false,
        p1: a ? a.players[0] : null, p2: a && a.players[1] ? a.players[1] : null, fish: a ? a.fish : []
      };
    },
    point: function (lx, ly) {
      var r = canvas.getBoundingClientRect();
      return { x: r.left + lx * view.scale, y: r.top + ly * view.scale };
    }
  };

  refreshTitleUI();
  Kit.art.loop(update, render);
  Kit.ready();
})();
