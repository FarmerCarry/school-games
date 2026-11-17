/* Hoop Heads: Turbo Super-Dunk Brawl — Kit.art sprite baker, big-head athletes, arenas & HUD. */
(function () {
  'use strict';
  var HH = window.HH = window.HH || {};
  var FONT = "Fredoka, sans-serif";
  var NUM_FONT = "Fredoka, sans-serif";

  var fx = null;
  var blinkSlots = [{}, {}];
  var trailPts = [];
  var callouts = [];

  HH.initArt = function () {
    if (Kit.art && typeof Kit.art.fx === 'function') fx = Kit.art.fx(280);
  };

  HH.resetBg = function () {
    trailPts.length = 0;
    callouts.length = 0;
  };

  HH.addCallout = function (text, x, y, color, size) {
    if (callouts.length >= 12) callouts.shift();
    callouts.push({
      text: text,
      x: x,
      y: y,
      color: color || '#ffd23f',
      size: size || 30,
      life: 0.95,
      max: 0.95
    });
  };

  HH.updateArt = function (m, dt) {
    if (fx) fx.update(dt);
    if (Kit.art) {
      if (Kit.art.pop && Kit.art.pop.update) Kit.art.pop.update(dt);
      if (Kit.art.flash && Kit.art.flash.update) Kit.art.flash.update(dt);
      if (Kit.art.shake && Kit.art.shake.update) Kit.art.shake.update(dt);
    }
    for (var i = callouts.length - 1; i >= 0; i--) {
      callouts[i].life -= dt;
      if (!(Kit.motion && Kit.motion.reduced && Kit.motion.reduced())) {
        callouts[i].y -= 42 * dt;
      }
      if (callouts[i].life <= 0) callouts.splice(i, 1);
    }

    if (!m) return;
    var b = m.ball;
    var activeSuperDunk = (m.players[0].dunk && m.players[0].dunk.isSuper) || (m.players[1].dunk && m.players[1].dunk.isSuper);
    if ((!b.holder && (Math.hypot(b.vx, b.vy) > 220 || b.state === 'shot')) || activeSuperDunk) {
      trailPts.push({
        x: b.x,
        y: b.y,
        r: b.r,
        life: activeSuperDunk ? 0.34 : 0.24,
        max: activeSuperDunk ? 0.34 : 0.24,
        superDunk: !!activeSuperDunk
      });
      if (trailPts.length > 22) trailPts.shift();
    }
    for (var j = trailPts.length - 1; j >= 0; j--) {
      trailPts[j].life -= dt;
      if (trailPts[j].life <= 0) trailPts.splice(j, 1);
    }
  };

  HH.consumeVisualEvents = function (m) {
    if (!m || !m.events) return;
    while (m.events.length) {
      var ev = m.events.shift();
      if (ev.type === 'score') {
        var label = ev.superDunk ? 'دانك النيزك! +' + ev.pts + ' ☄️'
          : ev.dunk ? 'سلام دانك! +' + ev.pts + ' 💥'
          : ev.pts >= 3 ? 'ثلاثية نارية! +' + ev.pts + ' 🔥'
          : ev.perfect ? 'سلة نظيفة! +' + ev.pts + ' ✨'
          : '+' + ev.pts + ' سلة!';
        var col = ev.superDunk ? '#ff5400' : ev.pts >= 3 ? '#00f5d4' : '#ffd23f';
        HH.addCallout(label, ev.x, ev.y - 44, col, ev.superDunk ? 36 : 31);
        if (fx) {
          fx.burst(ev.x, ev.y, { n: ev.superDunk ? 34 : 20, color: '#ffd23f', shape: 'star', speed: ev.superDunk ? 340 : 230, size: 11, life: 0.75 });
          fx.burst(ev.x, ev.y + 10, { n: 14, color: ev.who === 0 ? '#00f5d4' : '#ff5470', shape: 'confetti', speed: 200, size: 10, life: 0.7 });
        }
        if (Kit.art) {
          Kit.art.shake.add(ev.superDunk ? 0.45 : ev.dunk ? 0.28 : 0.14);
          if (ev.superDunk || ev.dunk) Kit.art.flash('#fff5cc', ev.superDunk ? 180 : 100);
        }
      } else if (ev.type === 'shoot' && ev.perfect) {
        HH.addCallout(ev.magnet ? 'مغناطيس السلة! 🧲' : 'رمية متقنة! 🔥', ev.x, ev.y - 12, '#ffe66d', 25);
        if (fx) fx.burst(ev.x, ev.y, { n: 10, color: '#ffd23f', shape: 'spark', speed: 150, size: 8, life: 0.45 });
      } else if (ev.type === 'superStart') {
        HH.addCallout('رمية النيزك الخارقة! ☄️', ev.x, ev.y - 24, '#ff6d00', 34);
        if (fx) fx.burst(ev.x, ev.y, { n: 28, color: '#ff5400', shape: 'star', speed: 320, size: 12, life: 0.65 });
        if (Kit.art) {
          Kit.art.shake.add(0.36);
          Kit.art.hitstop(55);
        }
      } else if (ev.type === 'superReady') {
        HH.addCallout('عداد النار ممتلئ! 🔥', ev.x, ev.y, '#ff9f1c', 26);
        if (fx) fx.burst(ev.x, ev.y + 30, { n: 16, color: '#ffbd00', shape: 'star', speed: 190, size: 9, life: 0.6 });
      } else if (ev.type === 'steal') {
        HH.addCallout('خطف سريع! ⚡', ev.x, ev.y, '#00f5d4', 27);
        if (fx) fx.burst(ev.x, ev.y, { n: 14, color: '#00f5d4', shape: 'spark', speed: 220, size: 9, life: 0.45 });
        if (Kit.art) Kit.art.shake.add(0.14);
      } else if (ev.type === 'block') {
        HH.addCallout('تصدٍّ عملاق! 🛡️', ev.x, ev.y - 16, '#ff477e', 30);
        if (fx) fx.burst(ev.x, ev.y, { n: 20, color: '#ff477e', shape: 'star', speed: 260, size: 10, life: 0.55 });
        if (Kit.art) {
          Kit.art.shake.add(0.24);
          Kit.art.hitstop(45);
        }
      } else if (ev.type === 'power') {
        var pw = HH.findById(HH.POWERS, ev.kind);
        HH.addCallout(pw.icon + ' ' + pw.name, ev.x, ev.y - 16, pw.color, 28);
        if (fx) fx.burst(ev.x, ev.y, { n: 18, color: pw.color, shape: 'star', speed: 220, size: 10, life: 0.6 });
      } else if (ev.type === 'iceBlock' || ev.type === 'iceBreak') {
        HH.addCallout(ev.type === 'iceBreak' ? 'تحطم الجليد! 💥' : 'درع الجليد! ❄️', ev.x, ev.y - 24, '#7dd3fc', 26);
        if (fx) fx.burst(ev.x, ev.y, { n: 18, color: '#bae6fd', shape: 'spark', speed: 230, size: 9, life: 0.5 });
      } else if (ev.type === 'overtime') {
        HH.addCallout('وقت إضافي! السلة الذهبية ⚡', HH.W / 2, 230, '#ffd23f', 36);
      } else if (ev.type === 'buzzer') {
        HH.addCallout('صافرة النهاية! 🚨', HH.W / 2, 210, '#ff5470', 32);
      }
    }
  };

  function rr(c, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function strokeText(c, txt, x, y, size, fill, strokeW, fontFam) {
    c.font = '800 ' + (size | 0) + 'px ' + (fontFam || FONT);
    c.lineJoin = 'round';
    c.lineWidth = strokeW || 5;
    c.strokeStyle = '#1b1640';
    c.strokeText(txt, x, y);
    c.fillStyle = fill || '#ffffff';
    c.fillText(txt, x, y);
  }

  /* --------------------------------------------------------------- Arenas */
  function getCourtBake(courtId) {
    var ct = HH.findById(HH.COURTS, courtId);
    return Kit.art.bake('court_' + ct.id, HH.W, HH.H, function (c, w, h) {
      // Sky gradient
      var g = c.createLinearGradient(0, 0, 0, HH.FLOOR);
      g.addColorStop(0, ct.sky[0]);
      g.addColorStop(0.55, ct.sky[1]);
      g.addColorStop(1, ct.sky[2]);
      c.fillStyle = g;
      c.fillRect(0, 0, w, HH.FLOOR);

      // Theme backdrop scenery
      if (ct.id === 'recess') {
        // Sun & clouds
        c.fillStyle = '#fff59d';
        c.beginPath(); c.arc(1060, 125, 56, 0, 6.283); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.88)';
        var clouds = [[210, 120, 44], [520, 95, 36], [850, 135, 40]];
        for (var ci = 0; ci < clouds.length; ci++) {
          var cl = clouds[ci];
          c.beginPath();
          c.arc(cl[0], cl[1], cl[2], 0, 6.283);
          c.arc(cl[0] + cl[2] * 0.8, cl[1] + 6, cl[2] * 0.78, 0, 6.283);
          c.arc(cl[0] - cl[2] * 0.75, cl[1] + 8, cl[2] * 0.72, 0, 6.283);
          c.fill();
        }
        // School building & trees
        rr(c, 370, 235, 540, 185, 16);
        c.fillStyle = '#ffd166'; c.fill();
        c.lineWidth = 4; c.strokeStyle = '#1b1640'; c.stroke();
        rr(c, 355, 218, 570, 28, 10);
        c.fillStyle = '#ef476f'; c.fill(); c.stroke();
        for (var wi = 0; wi < 6; wi++) {
          if (wi === 2 || wi === 3) continue;
          rr(c, 398 + wi * 84, 268, 56, 62, 8);
          c.fillStyle = '#8ecae6'; c.fill(); c.stroke();
        }
        // Clock tower emblem
        c.fillStyle = '#ffffff';
        c.beginPath(); c.arc(640, 288, 30, 0, 6.283); c.fill(); c.stroke();
        c.beginPath(); c.moveTo(640, 288); c.lineTo(640, 270); c.moveTo(640, 288); c.lineTo(654, 288); c.stroke();
        // Playground trees
        var trees = [150, 290, 990, 1130];
        for (var ti = 0; ti < trees.length; ti++) {
          c.fillStyle = '#2ec4b6';
          c.beginPath(); c.arc(trees[ti], 365, 54, 0, 6.283); c.fill(); c.stroke();
          c.fillStyle = '#52b788';
          c.beginPath(); c.arc(trees[ti] - 18, 355, 34, 0, 6.283); c.fill();
        }
      } else if (ct.id === 'neon') {
        // Stars & neon skyscrapers
        c.fillStyle = '#ffffff';
        for (var si = 0; si < 36; si++) {
          c.globalAlpha = 0.35 + (si % 5) * 0.12;
          c.beginPath(); c.arc((si * 173) % w, 24 + ((si * 89) % 210), 1.6 + (si % 3), 0, 6.283); c.fill();
        }
        c.globalAlpha = 1;
        var blds = [[80, 210, 130], [230, 165, 110], [370, 235, 145], [550, 180, 180], [760, 220, 130], [920, 160, 125], [1070, 205, 140]];
        for (var bi = 0; bi < blds.length; bi++) {
          var bld = blds[bi];
          c.fillStyle = '#190e36';
          c.fillRect(bld[0], bld[1], bld[2], 440 - bld[1]);
          c.strokeStyle = bi % 2 ? '#00f5d4' : '#ff2a85';
          c.lineWidth = 3;
          c.strokeRect(bld[0], bld[1], bld[2], 440 - bld[1]);
          c.fillStyle = bi % 2 ? '#00f5d4' : '#ffbe0b';
          for (var wy = bld[1] + 18; wy < 405; wy += 28) {
            for (var wx = bld[0] + 16; wx < bld[0] + bld[2] - 20; wx += 28) {
              c.fillRect(wx, wy, 12, 14);
            }
          }
        }
      } else if (ct.id === 'volcano') {
        // Volcano cone & glowing lava rivers
        c.fillStyle = '#ff9f1c';
        c.beginPath(); c.arc(640, 190, 95, 0, 6.283); c.fill();
        c.fillStyle = '#3b1518';
        c.beginPath();
        c.moveTo(220, 440); c.lineTo(545, 165); c.lineTo(735, 165); c.lineTo(1060, 440);
        c.closePath(); c.fill();
        c.strokeStyle = '#1b1640'; c.lineWidth = 4; c.stroke();
        // Lava flow
        c.strokeStyle = '#ff5400'; c.lineWidth = 14;
        c.beginPath();
        c.moveTo(610, 172); c.quadraticCurveTo(580, 280, 515, 420);
        c.moveTo(668, 172); c.quadraticCurveTo(705, 290, 770, 420);
        c.stroke();
        c.strokeStyle = '#ffd23f'; c.lineWidth = 6; c.stroke();
      } else {
        // Space station dome, planet & stars
        c.fillStyle = '#ffffff';
        for (var k = 0; k < 55; k++) {
          c.globalAlpha = 0.3 + (k % 4) * 0.16;
          c.beginPath(); c.arc((k * 137) % w, 18 + ((k * 71) % 340), 1.5 + (k % 3), 0, 6.283); c.fill();
        }
        c.globalAlpha = 1;
        // Ringed planet
        c.fillStyle = '#ff70a6';
        c.beginPath(); c.arc(960, 165, 62, 0, 6.283); c.fill();
        c.strokeStyle = '#ffd670'; c.lineWidth = 9;
        c.beginPath(); c.ellipse(960, 165, 112, 24, -0.24, 0, 6.283); c.stroke();
        // Station arch frame
        c.strokeStyle = '#4ea8de'; c.lineWidth = 8;
        c.beginPath(); c.arc(640, 560, 560, Math.PI * 1.12, Math.PI * 1.88); c.stroke();
      }

      // Cheering bleachers & big-head crowd silhouettes
      rr(c, 36, 405, w - 72, 95, 18);
      c.fillStyle = 'rgba(27,22,64,0.52)'; c.fill();
      var crowdCols = ['#ff5470', '#00f5d4', '#ffd23f', '#a855f7', '#38bdf8', '#fb923c'];
      for (var cr = 0; cr < 24; cr++) {
        var cx = 88 + cr * 48;
        var cy = 438 + (cr % 2) * 14;
        c.fillStyle = crowdCols[cr % crowdCols.length];
        c.beginPath(); c.arc(cx, cy, 15, 0, 6.283); c.fill();
        c.strokeStyle = '#1b1640'; c.lineWidth = 2.5; c.stroke();
      }

      // Court wall apron
      c.fillStyle = '#1b1640';
      c.fillRect(0, 488, w, h - 488);

      // Court floor planks / stripes
      var floorTop = 502;
      c.fillStyle = ct.floorA;
      c.fillRect(0, floorTop, w, h - floorTop);
      c.fillStyle = ct.floorB;
      for (var st = 0; st < 14; st++) {
        if (st % 2 === 0) c.fillRect(st * 96, floorTop, 48, h - floorTop);
      }
      // Subtle court gloss band
      var fg = c.createLinearGradient(0, floorTop, 0, h);
      fg.addColorStop(0, 'rgba(255,255,255,0.20)');
      fg.addColorStop(0.45, 'rgba(255,255,255,0.03)');
      fg.addColorStop(1, 'rgba(0,0,0,0.24)');
      c.fillStyle = fg;
      c.fillRect(0, floorTop, w, h - floorTop);

      // Painted keys under both hoops
      c.fillStyle = ct.keyCol;
      c.globalAlpha = 0.42;
      c.beginPath();
      c.moveTo(48, floorTop + 14); c.lineTo(310, floorTop + 14);
      c.lineTo(350, HH.FLOOR + 48); c.lineTo(24, HH.FLOOR + 48); c.closePath(); c.fill();
      c.beginPath();
      c.moveTo(w - 48, floorTop + 14); c.lineTo(w - 310, floorTop + 14);
      c.lineTo(w - 350, HH.FLOOR + 48); c.lineTo(w - 24, HH.FLOOR + 48); c.closePath(); c.fill();
      c.globalAlpha = 1;

      // Crisp court lines & 3-point markers (at x = HOOP_LX + THREE_DIST = 618 and HOOP_RX - THREE_DIST = 662)
      c.strokeStyle = ct.line;
      c.lineWidth = 5;
      c.strokeRect(46, floorTop + 14, w - 92, HH.FLOOR + 34 - floorTop);
      // Center line & center circle
      c.beginPath();
      c.moveTo(w / 2, floorTop + 14);
      c.lineTo(w / 2, HH.FLOOR + 48);
      c.stroke();
      c.beginPath();
      c.ellipse(w / 2, HH.FLOOR - 2, 92, 26, 0, 0, 6.283);
      c.fillStyle = ct.keyCol;
      c.globalAlpha = 0.55; c.fill(); c.globalAlpha = 1;
      c.stroke();

      // 3-point arc floor ticks so players see 3pt zone
      c.setLineDash([12, 10]);
      c.beginPath();
      c.ellipse(HH.HOOP_LX, HH.FLOOR - 4, HH.THREE_DIST, 54, 0, -0.48, 0.48);
      c.stroke();
      c.beginPath();
      c.ellipse(HH.HOOP_RX, HH.FLOOR - 4, HH.THREE_DIST, 54, 0, Math.PI - 0.48, Math.PI + 0.48);
      c.stroke();
      c.setLineDash([]);
    });
  }

  /* ------------------------------------------------- Big-Head Character Sprites */
  function getHeadSprite(ch, expr) {
    // Bounded static keys: 6 chars × 3 expressions = 18 cached sprites
    var key = 'hh_head_' + ch.id + '_' + expr;
    return Kit.art.sprite(key, 124, 124, function (c, w, h) {
      var cx = w / 2, cy = h / 2 + 6, r = ch.headR || 45;
      c.lineJoin = 'round';
      c.lineCap = 'round';

      // Character-specific top crests behind/on head
      if (ch.id === 'shark') {
        c.fillStyle = ch.skin;
        c.beginPath();
        c.moveTo(cx - 10, cy - r + 6);
        c.quadraticCurveTo(cx + 6, cy - r - 24, cx + 22, cy - r + 10);
        c.closePath();
        c.fill();
        c.lineWidth = 4; c.strokeStyle = '#1b1640'; c.stroke();
      } else if (ch.id === 'robo') {
        c.strokeStyle = '#1b1640'; c.lineWidth = 5;
        c.beginPath(); c.moveTo(cx, cy - r + 2); c.lineTo(cx, cy - r - 15); c.stroke();
        c.fillStyle = ch.trim;
        c.beginPath(); c.arc(cx, cy - r - 18, 7, 0, 6.283); c.fill(); c.stroke();
      } else if (ch.id === 'raptor') {
        c.fillStyle = '#ff6d00';
        for (var sp = -1; sp <= 1; sp++) {
          c.beginPath();
          c.moveTo(cx + sp * 14 - 7, cy - r + 6);
          c.lineTo(cx + sp * 14, cy - r - 13);
          c.lineTo(cx + sp * 14 + 7, cy - r + 6);
          c.closePath();
          c.fill();
          c.lineWidth = 3.5; c.strokeStyle = '#1b1640'; c.stroke();
        }
      } else if (ch.id === 'titan') {
        c.fillStyle = '#ffd23f';
        c.beginPath();
        c.moveTo(cx - 22, cy - r + 8);
        c.lineTo(cx - 16, cy - r - 14);
        c.lineTo(cx - 4, cy - r - 3);
        c.lineTo(cx + 4, cy - r - 17);
        c.lineTo(cx + 14, cy - r - 3);
        c.lineTo(cx + 24, cy - r - 12);
        c.lineTo(cx + 24, cy - r + 8);
        c.closePath();
        c.fill();
        c.lineWidth = 3.5; c.strokeStyle = '#1b1640'; c.stroke();
      }

      // Main big cartoon head
      c.fillStyle = ch.skin;
      c.beginPath();
      c.arc(cx, cy, r, 0, 6.283);
      c.fill();

      // Lower cheek shading
      c.save();
      c.beginPath(); c.arc(cx, cy, r - 2, 0, 6.283); c.clip();
      c.fillStyle = ch.skinDark;
      c.beginPath(); c.ellipse(cx - 6, cy + r * 0.72, r * 0.95, r * 0.48, 0, 0, 6.283); c.fill();
      if (ch.id === 'ninja') {
        // Ninja lower face mask
        c.fillStyle = '#231942';
        c.fillRect(cx - r, cy + 4, r * 2, r);
      }
      c.restore();

      // Bold cartoon outline
      c.lineWidth = 4.5;
      c.strokeStyle = '#1b1640';
      c.beginPath(); c.arc(cx, cy, r, 0, 6.283); c.stroke();

      // Spiky ninja hair
      if (ch.id === 'ninja') {
        c.fillStyle = '#1a1423';
        c.beginPath();
        c.moveTo(cx - r + 6, cy - 16);
        c.lineTo(cx - 28, cy - r - 12);
        c.lineTo(cx - 8, cy - r + 2);
        c.lineTo(cx + 8, cy - r - 16);
        c.lineTo(cx + 22, cy - r + 2);
        c.lineTo(cx + r - 8, cy - 18);
        c.closePath();
        c.fill(); c.stroke();
      }

      // Sporty headband across forehead
      rr(c, cx - r + 2, cy - 26, r * 2 - 4, 14, 7);
      c.fillStyle = ch.band;
      c.fill();
      c.lineWidth = 3.5; c.strokeStyle = '#1b1640'; c.stroke();

      // Visor / Eyes (facing right in sprite space; flipped via sx when facing left)
      if (ch.id === 'robo') {
        rr(c, cx - 14, cy - 10, 44, 20, 8);
        c.fillStyle = '#0b132b'; c.fill(); c.stroke();
        c.fillStyle = expr === 'hype' ? '#ffd23f' : '#00f5d4';
        if (expr === 'blink') {
          c.fillRect(cx - 6, cy - 1, 30, 4);
        } else {
          c.beginPath(); c.arc(cx + 2, cy, 5.5, 0, 6.283); c.arc(cx + 20, cy, 5.5, 0, 6.283); c.fill();
        }
      } else if (ch.id === 'astro') {
        rr(c, cx - 16, cy - 12, 48, 28, 13);
        var vg = c.createLinearGradient(cx - 16, cy - 12, cx + 32, cy + 16);
        vg.addColorStop(0, '#ffbe0b'); vg.addColorStop(1, '#fb5607');
        c.fillStyle = vg; c.fill(); c.stroke();
        c.fillStyle = 'rgba(255,255,255,0.65)';
        c.beginPath(); c.ellipse(cx - 2, cy - 4, 10, 4, -0.35, 0, 6.283); c.fill();
      } else {
        for (var e = 0; e < 2; e++) {
          var ex = cx + (e === 0 ? 0 : 21);
          var ey = cy - 2;
          if (expr === 'blink') {
            c.strokeStyle = '#1b1640'; c.lineWidth = 4;
            c.beginPath(); c.moveTo(ex - 7, ey); c.lineTo(ex + 7, ey); c.stroke();
          } else {
            c.fillStyle = '#ffffff';
            c.beginPath(); c.ellipse(ex, ey, 9.5, 11, 0, 0, 6.283); c.fill();
            c.lineWidth = 3; c.strokeStyle = '#1b1640'; c.stroke();
            c.fillStyle = '#1b1640';
            c.beginPath(); c.arc(ex + 2.5, ey, expr === 'hype' ? 5.5 : 4.5, 0, 6.283); c.fill();
            c.fillStyle = '#ffffff';
            c.beginPath(); c.arc(ex + 0.5, ey - 3, 2, 0, 6.283); c.fill();
          }
        }
      }

      // Expressive mouth (except ninja mask / astro visor)
      if (ch.id !== 'ninja' && ch.id !== 'astro') {
        if (ch.id === 'shark' || ch.id === 'raptor') {
          c.fillStyle = '#ffffff';
          rr(c, cx - 2, cy + 14, 28, 12, 5);
          c.fill(); c.lineWidth = 2.8; c.strokeStyle = '#1b1640'; c.stroke();
          c.beginPath();
          c.moveTo(cx + 6, cy + 14); c.lineTo(cx + 6, cy + 26);
          c.moveTo(cx + 14, cy + 14); c.lineTo(cx + 14, cy + 26);
          c.stroke();
        } else if (expr === 'hype') {
          c.fillStyle = '#ef476f';
          c.beginPath(); c.arc(cx + 10, cy + 16, 9, 0, Math.PI); c.closePath(); c.fill();
          c.lineWidth = 3; c.strokeStyle = '#1b1640'; c.stroke();
        } else {
          c.strokeStyle = '#1b1640'; c.lineWidth = 3.5;
          c.beginPath(); c.arc(cx + 9, cy + 13, 8, 0.15, Math.PI - 0.25); c.stroke();
        }
      }

      // Top glossy highlight
      c.fillStyle = 'rgba(255,255,255,0.28)';
      c.beginPath(); c.ellipse(cx - 12, cy - r * 0.58, 15, 7, -0.4, 0, 6.283); c.fill();
    }, { pad: 4 });
  }

  function getBallSprite(skinId) {
    var sk = HH.findById(HH.BALLS, skinId);
    return Kit.art.sprite('hh_ball_' + sk.id, 56, 56, function (c, w, h) {
      var cx = w / 2, cy = h / 2, r = 22;
      var g = c.createRadialGradient(cx - 7, cy - 8, 3, cx, cy, r);
      g.addColorStop(0, sk.c1);
      g.addColorStop(1, sk.c2);
      c.fillStyle = g;
      c.beginPath(); c.arc(cx, cy, r, 0, 6.283); c.fill();

      c.save();
      c.beginPath(); c.arc(cx, cy, r - 1, 0, 6.283); c.clip();
      c.strokeStyle = sk.seam;
      c.lineWidth = 2.6;
      c.beginPath();
      c.moveTo(cx - r, cy); c.lineTo(cx + r, cy);
      c.moveTo(cx, cy - r); c.lineTo(cx, cy + r);
      c.stroke();
      c.beginPath(); c.arc(cx - r * 0.72, cy, r * 0.72, -1.1, 1.1); c.stroke();
      c.beginPath(); c.arc(cx + r * 0.72, cy, r * 0.72, Math.PI - 1.1, Math.PI + 1.1); c.stroke();
      c.restore();

      c.lineWidth = 3.5;
      c.strokeStyle = '#1b1640';
      c.beginPath(); c.arc(cx, cy, r, 0, 6.283); c.stroke();

      c.fillStyle = 'rgba(255,255,255,0.38)';
      c.beginPath(); c.ellipse(cx - 7, cy - 8, 7, 4, -0.5, 0, 6.283); c.fill();
    }, { pad: 4 });
  }

  HH.drawBall = function (ctx, x, y, r, rot, skinId) {
    var spr = getBallSprite(skinId || 'classic');
    var scale = (r || HH.BALL_R) / 22;
    Kit.art.blit(ctx, spr, x, y, { rot: rot || 0, sx: scale, sy: scale });
  };

  /* --------------------------------------------------- Hoops & Power-Ups */
  function drawHoop(ctx, hoop, court, backPass) {
    var s = hoop.side;
    var shakeX = hoop.rattle > 0 ? Math.sin(hoop.rattle * 38) * hoop.rattle * 6 : 0;
    var hx = hoop.x + shakeX;
    var hy = hoop.y;
    var boardX = s === 0 ? hx - 46 : hx + 46;
    var poleX = s === 0 ? 44 : HH.W - 44;

    if (backPass) {
      // Stanchion post & angled arm
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#1b1640';
      ctx.lineWidth = 18;
      ctx.beginPath();
      ctx.moveTo(poleX, HH.FLOOR + 16);
      ctx.lineTo(poleX, 228);
      ctx.lineTo(boardX, 248);
      ctx.stroke();

      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 11;
      ctx.stroke();

      // Padded pole base
      rr(ctx, poleX - 16, 440, 32, 162, 10);
      ctx.fillStyle = s === 0 ? '#2563eb' : '#e11d48';
      ctx.fill();
      ctx.lineWidth = 4; ctx.strokeStyle = '#1b1640'; ctx.stroke();

      // Backboard
      var bx = s === 0 ? boardX - 10 : boardX - 4;
      rr(ctx, bx, 182, 14, 134, 6);
      ctx.fillStyle = '#f8fafc';
      ctx.fill();
      ctx.lineWidth = 4; ctx.strokeStyle = '#1b1640'; ctx.stroke();

      // Shooter's inner red/cyan accent bar
      ctx.fillStyle = court.rim;
      ctx.fillRect(bx + 3, 248, 8, 44);
      ctx.restore();
      return;
    }

    // Front pass: swishing diamond net, rim & Ice Shield dome!
    ctx.save();
    var kick = hoop.netKick || 0;
    var sway = Math.sin(kick * 14) * kick * 10;
    var bottomW = HH.RIM_R * 0.68 + kick * 8;
    var netH = 48 + kick * 10;

    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.lineWidth = 2.6;
    for (var ni = 0; ni <= 5; ni++) {
      var u = ni / 5;
      var topX = hx - HH.RIM_R + u * HH.RIM_R * 2;
      var botX = hx - bottomW + u * bottomW * 2 + sway;
      ctx.beginPath();
      ctx.moveTo(topX, hy + 2);
      ctx.quadraticCurveTo((topX + botX) * 0.5 + sway * 0.4, hy + netH * 0.55, botX, hy + netH);
      ctx.stroke();
      if (ni < 5) {
        var nextTop = hx - HH.RIM_R + (ni + 1) / 5 * HH.RIM_R * 2;
        ctx.beginPath();
        ctx.moveTo(topX, hy + 15);
        ctx.lineTo((topX + nextTop) * 0.5 + sway * 0.25, hy + 30);
        ctx.lineTo(nextTop, hy + 15);
        ctx.stroke();
      }
    }

    // Steel rim with spring joint
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1b1640';
    ctx.lineWidth = 11;
    ctx.beginPath();
    ctx.moveTo(hx - HH.RIM_R, hy);
    ctx.lineTo(hx + HH.RIM_R, hy);
    ctx.stroke();

    ctx.strokeStyle = court.rim;
    ctx.lineWidth = 6.5;
    ctx.beginPath();
    ctx.moveTo(hx - HH.RIM_R, hy);
    ctx.lineTo(hx + HH.RIM_R, hy);
    ctx.stroke();

    // Ice Shield Dome when frozen!
    if (hoop.iceT > 0) {
      ctx.save();
      var pulse = 1 + Math.sin(hoop.iceT * 8) * 0.04;
      ctx.translate(hx, hy - 6);
      ctx.scale(pulse, pulse);
      ctx.fillStyle = 'rgba(56, 189, 248, 0.38)';
      ctx.beginPath();
      ctx.arc(0, 0, 50, 0, 6.283);
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#bae6fd';
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath(); ctx.ellipse(-16, -18, 14, 6, -0.5, 0, 6.283); c_fill(ctx);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      strokeText(ctx, '❄️ ' + Math.ceil(hoop.iceT), 0, -58, 19, '#e0f2fe', 4, NUM_FONT);
      ctx.restore();
    }
    ctx.restore();
  }
  function c_fill(ctx) { ctx.fill(); }

  /* --------------------------------------------------- Big-Head Player Draw */
  function drawPlayer(ctx, m, p) {
    var ch = p.ch;
    var airH = Math.max(0, HH.FLOOR - p.y);
    var shadowScale = Math.max(0.35, 1 - airH / 340);
    Kit.art.shadow(ctx, p.x - 42 * shadowScale, HH.FLOOR - 14, 84 * shadowScale, 26, 0.5 * shadowScale);

    ctx.save();
    ctx.translate(p.x, p.y);

    // Fire Super Ready ground/body flame aura!
    if (p.super >= 100 || (p.dunk && p.dunk.isSuper)) {
      var glow = Kit.art.glow('#ff6d00', 76);
      Kit.art.blit(ctx, glow, 0, -58, { alpha: 0.65 + Math.sin(p.animT * 14) * 0.2 });
    }

    // Brief pickup shield ring so kids see fair steal protection
    if (p.protect > 0 && m.ball.holder === p) {
      ctx.strokeStyle = 'rgba(255, 210, 63, 0.72)';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.ellipse(0, -48, 52, 62, 0, 0, 6.283);
      ctx.stroke();
    }

    // Squash & stretch
    var sq = p.landSquash || 0;
    var sy = 1 - sq * 0.28 + (!p.onGround ? Math.min(0.12, Math.abs(p.vy) / 3600) : 0);
    var sx = 1 / Math.sqrt(sy);
    ctx.scale(sx, sy);

    var runPhase = Math.abs(p.vx) > 25 && p.onGround ? Math.sin(p.animT * 15) : 0;
    var dir = p.facing >= 0 ? 1 : -1;

    // Rocket Shoes booster flames!
    if (p.rocketT > 0) {
      for (var rf = -1; rf <= 1; rf += 2) {
        ctx.fillStyle = '#ff5400';
        ctx.beginPath();
        ctx.moveTo(rf * 14 - 7, -4);
        ctx.lineTo(rf * 14, 16 + Math.sin(p.animT * 32 + rf) * 7);
        ctx.lineTo(rf * 14 + 7, -4);
        ctx.closePath();
        ctx.fill();
      }
    }

    // Springy oversized sneakers
    for (var leg = -1; leg <= 1; leg += 2) {
      var lx = leg * 14 + runPhase * leg * 10;
      var ly = -8 - Math.max(0, -runPhase * leg * 9);
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(runPhase * leg * 0.22);
      rr(ctx, -14, -7, 28, 15, 7);
      ctx.fillStyle = ch.shoe;
      ctx.fill();
      ctx.lineWidth = 3.5; ctx.strokeStyle = '#1b1640'; ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-13, 3, 26, 4);
      ctx.restore();
    }

    // Sporty jersey torso
    rr(ctx, -23, -52, 46, 38, 14);
    ctx.fillStyle = ch.jersey;
    ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = '#1b1640'; ctx.stroke();

    // Jersey trim & number
    ctx.fillStyle = ch.trim;
    ctx.fillRect(-19, -24, 38, 5);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    strokeText(ctx, ch.num || '1', -dir * 4, -33, 16, '#ffffff', 3.5, NUM_FONT);

    // Expressive cartoon arms
    ctx.strokeStyle = '#1b1640';
    ctx.lineCap = 'round';
    var armY = -42;
    var handX = dir * 30;
    var handY = -36;
    if (p.dunk) {
      handX = dir * 24; handY = -92;
    } else if (p.aimT > 0) {
      handX = dir * 22; handY = -82;
    } else if (p.blockT > 0) {
      handX = dir * 18; handY = -96;
    } else if (p.dashT > 0) {
      handX = dir * 44; handY = -44;
    }
    ctx.lineWidth = 12;
    ctx.beginPath(); ctx.moveTo(dir * 16, armY); ctx.lineTo(handX, handY); ctx.stroke();
    ctx.strokeStyle = ch.skin;
    ctx.lineWidth = 6.5;
    ctx.stroke();

    // Fluttering headband tails behind big head
    var headY = -88 + Math.abs(runPhase) * 3;
    var tailWave = Math.sin(p.animT * 12) * 7;
    ctx.strokeStyle = '#1b1640';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(-dir * 34, headY - 18);
    ctx.quadraticCurveTo(-dir * 54, headY - 14 + tailWave, -dir * 66, headY - 4 + tailWave);
    ctx.stroke();
    ctx.strokeStyle = ch.band;
    ctx.lineWidth = 5.5;
    ctx.stroke();

    // Big-Head Sprite with Kit.art.blink!
    var blinkV = Kit.art ? Kit.art.blink(blinkSlots[p.idx]) : 0;
    var expr = (p.dunk || p.super >= 100 || m.phase === 'celebrate') ? 'hype' : (blinkV > 0.55 ? 'blink' : 'open');
    var headSpr = getHeadSprite(ch, expr);
    var headTilt = clamp(p.vx / 1800, -0.18, 0.18) + (p.dunk ? dir * 0.22 : 0);
    Kit.art.blit(ctx, headSpr, 0, headY, { sx: dir, sy: 1, rot: headTilt });

    // P1 / P2 floating crown marker + Magnet / Dunk indicator
    if (m.mode !== 'demo') {
      var tagCol = p.idx === 0 ? '#00f5d4' : (m.mode === 'duo' ? '#ffbe0b' : '#ff5470');
      var tagTxt = p.idx === 0 ? 'أنت' : (m.mode === 'duo' ? 'لاعب 2' : 'الخصم');
      ctx.textAlign = 'center';
      strokeText(ctx, tagTxt, 0, headY - 62, 15, tagCol, 3.5);

      if (p.idx === 0 && m.ball.holder === p && m.phase === 'play' && HH.canDunk(m, p)) {
        var dunkMsg = p.super >= 100 ? '☄️ دانك النيزك!' : '💥 دانك!';
        strokeText(ctx, dunkMsg, 0, headY - 82, 17, '#ffd23f', 4);
      } else if (p.magnet > 0) {
        strokeText(ctx, '🧲', dir * -42, headY - 38, 20, '#ffffff', 3);
      }
    }

    ctx.restore();
  }

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* --------------------------------------------------- Power-up Orb & Ball */
  function drawOrb(ctx, orb) {
    if (!orb) return;
    var pw = HH.findById(HH.POWERS, orb.id);
    var glow = Kit.art.glow(pw.color, 52);
    Kit.art.blit(ctx, glow, orb.x, orb.y, { alpha: 0.72 });

    ctx.save();
    ctx.translate(orb.x, orb.y);
    var s = 1 + Math.sin(orb.t * 6) * 0.07;
    ctx.scale(s, s);

    ctx.fillStyle = pw.color;
    ctx.beginPath(); ctx.arc(0, 0, 28, 0, 6.283); ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = '#1b1640'; ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.34)';
    ctx.beginPath(); ctx.ellipse(-8, -10, 10, 5, -0.45, 0, 6.283); ctx.fill();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '26px sans-serif';
    ctx.fillText(pw.icon, 0, 2);
    strokeText(ctx, pw.name, 0, 42, 15, '#ffffff', 4);
    ctx.restore();
  }

  function drawBallAndTrail(ctx, m) {
    var b = m.ball;
    if (b.hidden) return;
    var tr = HH.findById(HH.TRAILS, m.trailSkin);

    // Motion trail
    for (var i = 0; i < trailPts.length; i++) {
      var pt = trailPts[i];
      var a = pt.life / pt.max;
      var col = pt.superDunk ? '#ff5400' : tr.colors[i % tr.colors.length];
      ctx.save();
      ctx.globalAlpha = a * (pt.superDunk ? 0.72 : 0.45);
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.r * (0.45 + a * 0.55), 0, 6.283);
      ctx.fill();
      ctx.restore();
    }

    if (m.megaT > 0 || b.perfect || (m.players[0].dunk && m.players[0].dunk.isSuper) || (m.players[1].dunk && m.players[1].dunk.isSuper)) {
      var gCol = m.megaT > 0 ? '#ff7b00' : '#ffd23f';
      Kit.art.blit(ctx, Kit.art.glow(gCol, b.r * 2.3), b.x, b.y, { alpha: 0.65 });
    }
    HH.drawBall(ctx, b.x, b.y, b.r, b.rot, m.ballSkin);
  }

  /* --------------------------------------------------- Broadcast Scoreboard HUD */
  function drawHUD(ctx, m, info) {
    if (!m || m.mode === 'demo') return;
    var p0 = m.players[0], p1 = m.players[1];

    ctx.save();
    // Broadcast center scoreboard pill (x: 345..935, y: 12..94 — clear of mute & pause buttons!)
    var sx = 340, sy = 12, sw = 600, sh = 82;
    rr(ctx, sx, sy, sw, sh, 22);
    ctx.fillStyle = 'rgba(20, 16, 48, 0.88)';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#1b1640';
    ctx.stroke();

    // Top gloss strip
    rr(ctx, sx + 6, sy + 4, sw - 12, 24, 14);
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fill();

    // Center clock box
    rr(ctx, HH.W / 2 - 74, sy + 8, 148, 48, 14);
    ctx.fillStyle = m.overtime ? '#dc2626' : (m.time <= 10 ? '#e11d48' : '#312e81');
    ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#1b1640'; ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (m.overtime) {
      strokeText(ctx, 'هدف ذهبي ⚡', HH.W / 2, sy + 32, 19, '#ffd23f', 4);
    } else {
      var secs = Math.max(0, Math.ceil(m.time));
      var mm = Math.floor(secs / 60);
      var ss = secs % 60;
      var clk = mm + ':' + (ss < 10 ? '0' + ss : ss);
      strokeText(ctx, clk, HH.W / 2, sy + 33, 28, m.time <= 10 ? '#ffe66d' : '#ffffff', 4.5, NUM_FONT);
    }

    // Mode / Target subtitle under clock
    var subLbl = info && info.mode ? info.mode : ('أول من يصل إلى ' + m.target);
    strokeText(ctx, subLbl, HH.W / 2, sy + 71, 13, '#cbd5e1', 3);

    // P1 (Left hoop defender, attacks right) — displayed on left side of scoreboard
    strokeText(ctx, String(p0.score), HH.W / 2 - 118, sy + 34, 38, '#00f5d4', 5, NUM_FONT);
    ctx.textAlign = 'left';
    strokeText(ctx, p0.ch.name, sx + 18, sy + 27, 17, '#ffffff', 4);

    // P2 (Right side of scoreboard)
    ctx.textAlign = 'center';
    strokeText(ctx, String(p1.score), HH.W / 2 + 118, sy + 34, 38, '#ff70a6', 5, NUM_FONT);
    ctx.textAlign = 'right';
    strokeText(ctx, p1.ch.name, sx + sw - 18, sy + 27, 17, '#ffffff', 4);

    // Dual Fire Super Bars (عداد النار)
    drawSuperBar(ctx, sx + 18, sy + 49, 156, 16, p0.super, false);
    drawSuperBar(ctx, sx + sw - 174, sy + 49, 156, 16, p1.super, true);

    // Intro / Overtime banner
    if (m.phase === 'intro') {
      strokeText(ctx, 'استعد للدانك! 🏀', HH.W / 2, 190, 42, '#ffd23f', 6);
    }
    ctx.restore();
  }

  function drawSuperBar(ctx, x, y, w, h, val, alignRight) {
    rr(ctx, x, y, w, h, 8);
    ctx.fillStyle = '#0f172a';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#1b1640';
    ctx.stroke();

    var pct = clamp((val || 0) / 100, 0, 1);
    if (pct > 0) {
      var fw = Math.max(8, (w - 4) * pct);
      var fx0 = alignRight ? (x + w - 2 - fw) : (x + 2);
      rr(ctx, fx0, y + 2, fw, h - 4, 6);
      ctx.fillStyle = pct >= 1 ? '#ff6d00' : '#f59e0b';
      ctx.fill();
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var txt = pct >= 1 ? '🔥 النيزك جاهز!' : '🔥 عداد النار';
    strokeText(ctx, txt, x + w / 2, y + h / 2 + 0.5, 11, pct >= 1 ? '#fff3b0' : '#e2e8f0', 2.8);
  }

  /* --------------------------------------------------- Master Scene Render */
  HH.render = function (ctx, view, m, info) {
    if (!ctx || !m) return;
    ctx.save();

    if (Kit.art && Kit.art.shake) Kit.art.shake.apply(ctx);

    var ct = HH.findById(HH.COURTS, m.court || 'recess');
    var bg = getCourtBake(ct.id);
    if (bg && bg.canvas) {
      ctx.drawImage(bg.canvas, 0, 0, HH.W, HH.H);
    }

    // Backboards & stanchions behind players
    drawHoop(ctx, m.hoops[0], ct, true);
    drawHoop(ctx, m.hoops[1], ct, true);

    // Mid-court floating Power-Up Orb
    drawOrb(ctx, m.orb);

    // Big-Head Players
    drawPlayer(ctx, m, m.players[0]);
    drawPlayer(ctx, m, m.players[1]);

    // Basketball + motion trail
    drawBallAndTrail(ctx, m);

    // Front rims, nets & Ice Shield domes
    drawHoop(ctx, m.hoops[0], ct, false);
    drawHoop(ctx, m.hoops[1], ct, false);

    // Particles & Callouts
    if (fx) fx.draw(ctx);
    if (Kit.art && Kit.art.pop && Kit.art.pop.draw) Kit.art.pop.draw(ctx);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (var i = 0; i < callouts.length; i++) {
      var co = callouts[i];
      ctx.globalAlpha = clamp(co.life / co.max, 0, 1);
      strokeText(ctx, co.text, co.x, co.y, co.size, co.color, 5);
    }
    ctx.restore();

    if (Kit.art) Kit.art.vignette(ctx, HH.W, HH.H, 0.26);
    if (Kit.art && Kit.art.flash && Kit.art.flash.draw) Kit.art.flash.draw(ctx, HH.W, HH.H);

    // Match score flash overlay (respects reduced motion)
    if (m.flash > 0 && !(Kit.motion && Kit.motion.reduced && Kit.motion.reduced())) {
      ctx.fillStyle = 'rgba(255, 245, 190, ' + Math.min(0.28, m.flash * 0.75) + ')';
      ctx.fillRect(0, 0, HH.W, HH.H);
    }

    drawHUD(ctx, m, info);
    ctx.restore();
  };
})();
