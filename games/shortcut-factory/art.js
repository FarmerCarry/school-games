/* Shortcut Factory — Toy Claw Rush! Canvas 2D renderer:
 * Cheerful sunlit toy factory, animated multi-lane conveyors, mechanical gantry claw,
 * cute plushies, Mystery Capsules, Golden Robots, Magnet Orbs, Fizz-Crates & Fever glow! */
(function () {
  'use strict';
  var SF = window.SF;
  var INK = '#1f2340';

  var bgCache = null;
  var bgWing = -1;

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function buildBg(wingIdx) {
    var wing = SF.WINGS[wingIdx] || SF.WINGS[0];
    var c = document.createElement('canvas');
    c.width = SF.W;
    c.height = SF.H;
    var g = c.getContext('2d');

    var grad = g.createLinearGradient(0, 0, 0, SF.H);
    grad.addColorStop(0, wing.bg1);
    grad.addColorStop(1, wing.bg2);
    g.fillStyle = grad;
    g.fillRect(0, 0, SF.W, SF.H);

    // Subtle cheerful workshop wall panels + vertical steel pilasters
    g.strokeStyle = 'rgba(31, 35, 64, 0.07)';
    g.lineWidth = 3;
    for (var x = 80; x < SF.W; x += 160) {
      g.beginPath(); g.moveTo(x, 80); g.lineTo(x, SF.H); g.stroke();
    }
    // Warm factory ceiling pipes & pressure gauges behind skylights
    g.fillStyle = wingIdx === 1 ? '#b08cf2' : (wingIdx === 2 ? '#f4a940' : '#7ec4e6');
    g.strokeStyle = 'rgba(31, 35, 64, 0.28)';
    g.lineWidth = 3;
    g.fillRect(0, 108, SF.W, 13);
    g.strokeRect(-2, 108, SF.W + 4, 13);
    g.fillStyle = 'rgba(255,255,255,0.45)';
    g.fillRect(0, 110, SF.W, 4);
    for (var px = 76; px < SF.W; px += 224) {
      g.fillStyle = '#ffd23f';
      g.strokeStyle = 'rgba(31, 35, 64, 0.35)';
      roundRect(g, px - 9, 105, 18, 19, 4); g.fill(); g.stroke();
    }

    // Bright factory skylight sunbeams
    g.fillStyle = 'rgba(255,255,255,0.28)';
    g.beginPath(); g.moveTo(110, 128); g.lineTo(270, 128); g.lineTo(420, 604); g.lineTo(200, 604); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(990, 128); g.lineTo(1150, 128); g.lineTo(1280, 604); g.lineTo(1060, 604); g.closePath(); g.fill();

    // 4 Cheerful sunlit factory skylights with blue sky, fluffy clouds, distant hills & toy silhouettes!
    var skyTop = wingIdx === 1 ? '#8b7dff' : (wingIdx === 2 ? '#ffb84d' : '#4ec3ff');
    var skyBot = wingIdx === 1 ? '#d8caff' : (wingIdx === 2 ? '#fff0a8' : '#c6f3ff');
    var winXs = [108, 378, 752, 1022];
    for (var wi = 0; wi < winXs.length; wi++) {
      var wx = winXs[wi], wy = 132, ww = 152, wh = 104;
      g.save();
      roundRect(g, wx, wy, ww, wh, 20);
      g.clip();
      var sg = g.createLinearGradient(0, wy, 0, wy + wh);
      sg.addColorStop(0, skyTop);
      sg.addColorStop(1, skyBot);
      g.fillStyle = sg;
      g.fillRect(wx, wy, ww, wh);
      // Warm sun glow in outer skylights
      if (wi === 0 || wi === 3) {
        g.fillStyle = 'rgba(255, 245, 160, 0.85)';
        g.beginPath(); g.arc(wx + (wi === 0 ? 34 : 118), wy + 28, 18, 0, Math.PI * 2); g.fill();
      }
      // Fluffy clouds
      g.fillStyle = 'rgba(255,255,255,0.88)';
      var cx0 = wx + 46 + (wi % 2) * 34, cy0 = wy + 40 + (wi % 2) * 10;
      g.beginPath();
      g.arc(cx0, cy0, 16, 0, Math.PI * 2);
      g.arc(cx0 + 18, cy0 - 6, 20, 0, Math.PI * 2);
      g.arc(cx0 + 38, cy0, 15, 0, Math.PI * 2);
      g.fill();
      // Cheerful distant green factory park hills
      g.fillStyle = wingIdx === 1 ? '#9370db' : '#7ad66b';
      g.beginPath();
      g.moveTo(wx, wy + wh);
      g.quadraticCurveTo(wx + ww * 0.35, wy + wh - 34, wx + ww * 0.72, wy + wh - 16);
      g.quadraticCurveTo(wx + ww * 0.9, wy + wh - 24, wx + ww, wy + wh - 12);
      g.lineTo(wx + ww, wy + wh); g.closePath(); g.fill();
      // Cute pastel toy shelf silhouette perched on inside sill
      g.fillStyle = 'rgba(31, 35, 64, 0.16)';
      if (wi % 2 === 0) {
        g.beginPath(); g.arc(wx + 32, wy + wh - 14, 11, 0, Math.PI * 2); g.arc(wx + 24, wy + wh - 24, 5, 0, Math.PI * 2); g.arc(wx + 40, wy + wh - 24, 5, 0, Math.PI * 2); g.fill();
      } else {
        roundRect(g, wx + 106, wy + wh - 28, 22, 22, 5); g.fill();
        g.fillRect(wx + 115, wy + wh - 36, 4, 8);
      }
      // Diagonal glass shine
      g.fillStyle = 'rgba(255,255,255,0.28)';
      g.beginPath(); g.moveTo(wx + 22, wy); g.lineTo(wx + 52, wy); g.lineTo(wx + 12, wy + wh); g.lineTo(wx - 12, wy + wh); g.closePath(); g.fill();
      g.restore();

      // Window mullions & sturdy toy-factory frame
      g.strokeStyle = '#5a6b96';
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(wx + ww * 0.5, wy + 2); g.lineTo(wx + ww * 0.5, wy + wh - 2);
      g.moveTo(wx + 2, wy + wh * 0.54); g.lineTo(wx + ww - 2, wy + wh * 0.54);
      g.stroke();
      g.strokeStyle = '#3b486b';
      g.lineWidth = 6;
      roundRect(g, wx, wy, ww, wh, 20); g.stroke();
      // Window sill with rivets
      g.fillStyle = '#5a6b96';
      g.strokeStyle = INK;
      g.lineWidth = 3;
      roundRect(g, wx - 10, wy + wh - 4, ww + 20, 12, 5); g.fill(); g.stroke();
    }

    // Center factory wall badge gauge cleanly below title tagline zone
    g.save();
    g.fillStyle = 'rgba(255, 255, 255, 0.78)';
    g.strokeStyle = 'rgba(59, 72, 107, 0.55)';
    g.lineWidth = 4;
    g.beginPath(); g.arc(SF.W * 0.5, 212, 24, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = '#ff5d8f';
    g.beginPath(); g.arc(SF.W * 0.5, 212, 5, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#3b486b'; g.lineWidth = 3; g.lineCap = 'round';
    g.beginPath(); g.moveTo(SF.W * 0.5, 212); g.lineTo(SF.W * 0.5 + 11, 200); g.stroke();
    g.restore();

    // Overhead steel gantry beam
    var beam = g.createLinearGradient(0, SF.RAIL_Y - 22, 0, SF.RAIL_Y + 18);
    beam.addColorStop(0, '#5a6b96');
    beam.addColorStop(0.5, '#3b486b');
    beam.addColorStop(1, '#26304d');
    g.fillStyle = beam;
    g.fillRect(0, SF.RAIL_Y - 22, SF.W, 40);
    // Yellow-and-black factory caution stripes on gantry beam
    g.fillStyle = '#ffd23f';
    for (var sx = 0; sx < SF.W; sx += 56) {
      g.beginPath();
      g.moveTo(sx, SF.RAIL_Y - 22);
      g.lineTo(sx + 26, SF.RAIL_Y - 22);
      g.lineTo(sx + 14, SF.RAIL_Y - 8);
      g.lineTo(sx - 12, SF.RAIL_Y - 8);
      g.closePath();
      g.fill();
    }
    g.strokeStyle = INK;
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(0, SF.RAIL_Y - 22); g.lineTo(SF.W, SF.RAIL_Y - 22);
    g.moveTo(0, SF.RAIL_Y + 18); g.lineTo(SF.W, SF.RAIL_Y + 18);
    g.stroke();

    // Richly detailed Factory Floor Deck (y = 604..720) with hazard trim, riveted steel plates & glowing prize chute!
    var fy = 604;
    // Conveyor support legs connecting belt 3 to floor
    g.fillStyle = '#2d3757';
    g.strokeStyle = INK;
    g.lineWidth = 3.5;
    for (var lx = 150; lx <= 1130; lx += 245) {
      g.fillRect(lx - 10, 594, 20, 14);
      g.strokeRect(lx - 10, 594, 20, 14);
    }
    // Floor steel body
    var fGrad = g.createLinearGradient(0, fy, 0, SF.H);
    fGrad.addColorStop(0, '#3a4770');
    fGrad.addColorStop(0.35, '#2b3556');
    fGrad.addColorStop(1, '#1d243d');
    g.fillStyle = fGrad;
    g.fillRect(0, fy, SF.W, SF.H - fy);

    // Hazard-stripe top lip along floor edge
    g.fillStyle = '#242d4a';
    g.fillRect(0, fy, SF.W, 14);
    g.fillStyle = '#ffd23f';
    for (var hx = -20; hx < SF.W + 40; hx += 48) {
      g.beginPath();
      g.moveTo(hx, fy); g.lineTo(hx + 22, fy); g.lineTo(hx + 10, fy + 14); g.lineTo(hx - 12, fy + 14);
      g.closePath(); g.fill();
    }
    g.strokeStyle = INK;
    g.lineWidth = 3.5;
    g.beginPath();
    g.moveTo(0, fy); g.lineTo(SF.W, fy);
    g.moveTo(0, fy + 14); g.lineTo(SF.W, fy + 14);
    g.stroke();

    // Riveted steel floor plate panels
    for (var px2 = 34; px2 < SF.W - 34; px2 += 242) {
      var pw = 216, ph = 80;
      g.fillStyle = 'rgba(255,255,255,0.045)';
      g.strokeStyle = 'rgba(15, 20, 38, 0.55)';
      g.lineWidth = 3;
      roundRect(g, px2, fy + 24, pw, ph, 12); g.fill(); g.stroke();
      g.fillStyle = '#6c7ba8';
      var rvs = [[px2 + 12, fy + 36], [px2 + pw - 12, fy + 36], [px2 + 12, fy + ph + 12], [px2 + pw - 12, fy + ph + 12]];
      for (var ri = 0; ri < rvs.length; ri++) {
        g.beginPath(); g.arc(rvs[ri][0], rvs[ri][1], 4, 0, Math.PI * 2); g.fill();
      }
    }

    // Center glowing Toy Collection Chute housing!
    var chX = 486, chW = 308, chY = fy + 20, chH = 88;
    g.fillStyle = '#192038';
    g.strokeStyle = INK;
    g.lineWidth = 4;
    roundRect(g, chX, chY, chW, chH, 18); g.fill(); g.stroke();
    var chGlow = g.createLinearGradient(0, chY + 8, 0, chY + chH - 8);
    chGlow.addColorStop(0, 'rgba(76, 201, 240, 0.42)');
    chGlow.addColorStop(0.55, 'rgba(61, 220, 132, 0.22)');
    chGlow.addColorStop(1, 'rgba(255, 210, 63, 0.14)');
    g.fillStyle = chGlow;
    roundRect(g, chX + 10, chY + 10, chW - 20, chH - 20, 12); g.fill();
    g.strokeStyle = '#4cc9f0';
    g.lineWidth = 2.5;
    roundRect(g, chX + 10, chY + 10, chW - 20, chH - 20, 12); g.stroke();
    // Glowing intake bars & side status LEDs
    g.fillStyle = 'rgba(127, 230, 255, 0.35)';
    for (var bx = chX + 34; bx <= chX + chW - 44; bx += 46) {
      roundRect(g, bx, chY + 24, 14, chH - 48, 6); g.fill();
    }
    var leds = [[chX - 24, '#3ddc84'], [chX - 44, '#ffd23f'], [chX + chW + 24, '#3ddc84'], [chX + chW + 44, '#ffd23f']];
    for (var li2 = 0; li2 < leds.length; li2++) {
      g.fillStyle = leds[li2][1];
      g.strokeStyle = INK; g.lineWidth = 2.5;
      g.beginPath(); g.arc(leds[li2][0], fy + 46, 7, 0, Math.PI * 2); g.fill(); g.stroke();
    }

    return c;
  }

  function drawGear(ctx, x, y, r, teeth, rot, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.fillStyle = color;
    ctx.strokeStyle = 'rgba(31, 35, 64, 0.24)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (var i = 0; i < teeth * 2; i++) {
      var a = (i / (teeth * 2)) * Math.PI * 2;
      var rad = i % 2 === 0 ? r : r * 0.78;
      if (i === 0) ctx.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
      else ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath(); ctx.arc(0, 0, r * 0.36, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(31, 35, 64, 0.25)';
    ctx.beginPath(); ctx.arc(0, 0, r * 0.14, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawConveyors(ctx, w) {
    for (var li = 0; li < SF.LANES.length; li++) {
      var lane = SF.LANES[li];
      var by = lane.y + 18;
      var bh = 38;

      // Belt drop shadow
      ctx.fillStyle = 'rgba(25, 30, 58, 0.16)';
      ctx.fillRect(0, by + bh, SF.W, 10);

      // Belt housing
      ctx.fillStyle = '#384366';
      ctx.fillRect(0, by, SF.W, bh);
      // Colored factory lane trim stripe
      ctx.fillStyle = w.fever > 0 ? '#ffd23f' : lane.tint;
      ctx.fillRect(0, by + bh - 11, SF.W, 11);

      // Animated directional chevron treads
      ctx.save();
      ctx.strokeStyle = '#6c7ba8';
      ctx.lineWidth = 4.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      var off = w.beltOffset[li];
      var dir = lane.dir;
      for (var x = -64 + off; x < SF.W + 64; x += 64) {
        ctx.beginPath();
        ctx.moveTo(x - dir * 8, by + 6);
        ctx.lineTo(x + dir * 6, by + 13);
        ctx.lineTo(x - dir * 8, by + 20);
        ctx.stroke();
      }
      ctx.restore();

      // Belt ink borders
      ctx.strokeStyle = INK;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, by); ctx.lineTo(SF.W, by);
      ctx.moveTo(0, by + bh); ctx.lineTo(SF.W, by + bh);
      ctx.stroke();

      // End chute portals on left & right walls
      ctx.fillStyle = '#252e4a';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 4;
      roundRect(ctx, -10, lane.y - 44, 48, 102, 12); ctx.fill(); ctx.stroke();
      roundRect(ctx, SF.W - 38, lane.y - 44, 48, 102, 12); ctx.fill(); ctx.stroke();
    }
  }

  function drawToy(ctx, toy, w) {
    var feverBoot = toy.kind === 'boot' && w.fever > 0;
    var r = toy.r;
    ctx.save();
    ctx.translate(toy.x, toy.y);

    // Shadow on belt when not being carried
    if (!toy.pulled) {
      ctx.fillStyle = 'rgba(20, 24, 48, 0.25)';
      ctx.beginPath();
      ctx.ellipse(0, 22, r * 0.82, 8, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = INK;
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    if (feverBoot) {
      // Fever transforms rubber boots into shining Golden Coin Stacks!
      var p = 1 + Math.sin(w.time * 12 + toy.id) * 0.08;
      ctx.scale(p, p);
      ctx.fillStyle = '#ffd23f';
      for (var ci = 0; ci < 3; ci++) {
        ctx.beginPath();
        ctx.ellipse(0, 10 - ci * 12, 26, 11, 0, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
      }
      ctx.fillStyle = '#fff9c4';
      ctx.beginPath(); ctx.arc(-6, -14, 6, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      return;
    }

    var k = toy.kind;
    if (k === 'duck') {
      // Yellow rubber ducky!
      ctx.fillStyle = '#ffd93b';
      ctx.beginPath(); ctx.ellipse(-2, 8, 28, 19, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(10, -14, 17, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ff7b1c';
      ctx.beginPath(); ctx.moveTo(24, -17); ctx.lineTo(38, -11); ctx.lineTo(24, -6); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = INK;
      ctx.beginPath(); ctx.arc(16, -17, 3.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(15, -18.5, 1.5, 0, Math.PI * 2); ctx.fill();
    } else if (k === 'bear') {
      // Cute Teddy Bear plushie!
      ctx.fillStyle = '#cf7e42';
      ctx.beginPath(); ctx.arc(-20, -24, 12, 0, Math.PI * 2); ctx.arc(20, -24, 12, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 10, 24, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -10, 22, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#f5cfa0';
      ctx.beginPath(); ctx.ellipse(0, -4, 12, 9, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = INK;
      ctx.beginPath(); ctx.arc(-8, -14, 3.5, 0, Math.PI * 2); ctx.arc(8, -14, 3.5, 0, Math.PI * 2); ctx.arc(0, -7, 3.2, 0, Math.PI * 2); ctx.fill();
      // Red bowtie
      ctx.fillStyle = '#ff4d6d';
      ctx.beginPath(); ctx.moveTo(-12, 5); ctx.lineTo(12, 13); ctx.lineTo(12, 5); ctx.lineTo(-12, 13); ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (k === 'bunny') {
      // Pastel Pink Bunny plushie!
      ctx.fillStyle = '#ff99c8';
      ctx.beginPath(); ctx.ellipse(-11, -30, 8, 20, -0.15, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(11, -30, 8, 20, 0.15, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 6, 25, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffd6ea';
      ctx.beginPath(); ctx.ellipse(0, 14, 14, 11, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = INK;
      ctx.beginPath(); ctx.arc(-9, -1, 3.8, 0, Math.PI * 2); ctx.arc(9, -1, 3.8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff4d88';
      ctx.beginPath(); ctx.arc(0, 5, 3.2, 0, Math.PI * 2); ctx.fill();
    } else if (k === 'dino') {
      // Friendly Green Plush Dino!
      ctx.fillStyle = '#ff9f1c';
      ctx.beginPath();
      ctx.moveTo(-26, -12); ctx.lineTo(-34, -22); ctx.lineTo(-18, -22);
      ctx.moveTo(-18, -24); ctx.lineTo(-22, -36); ctx.lineTo(-8, -28);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#5cd64b';
      roundRect(ctx, -26, -24, 52, 48, 20); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#c8ff9e';
      ctx.beginPath(); ctx.ellipse(6, 12, 16, 11, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(10, -10, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = INK;
      ctx.beginPath(); ctx.arc(12, -10, 3.2, 0, Math.PI * 2); ctx.fill();
    } else if (k === 'unicorn') {
      // Star Unicorn plushie!
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath(); ctx.moveTo(-4, -24); ctx.lineTo(4, -48); ctx.lineTo(12, -22); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(0, 2, 27, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#c48bff';
      ctx.beginPath(); ctx.arc(-20, -12, 12, 0, Math.PI * 2); ctx.arc(-24, 4, 11, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ff66b2';
      ctx.beginPath(); ctx.ellipse(12, 8, 9, 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = INK;
      ctx.beginPath(); ctx.arc(6, -6, 3.8, 0, Math.PI * 2); ctx.fill();
    } else if (k === 'capsule') {
      // Glowing Mystery Capsule!
      var glow = 1 + Math.sin(w.time * 8 + toy.id) * 0.08;
      ctx.fillStyle = 'rgba(56, 232, 255, 0.28)';
      ctx.beginPath(); ctx.arc(0, 0, r * 1.32 * glow, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#38e8ff';
      ctx.beginPath(); ctx.arc(0, 0, 29, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ff5ca8';
      ctx.beginPath(); ctx.arc(0, 0, 29, 0, Math.PI); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.fillRect(-29, -4, 58, 8); ctx.strokeRect(-29, -4, 58, 8);
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    } else if (k === 'goldbot') {
      // Shining Golden Robot!
      ctx.fillStyle = 'rgba(255, 210, 63, 0.34)';
      ctx.beginPath(); ctx.arc(0, 0, r * 1.38, 0, Math.PI * 2); ctx.fill();
      // Antenna
      ctx.beginPath(); ctx.moveTo(0, -26); ctx.lineTo(0, -40); ctx.stroke();
      ctx.fillStyle = '#ff4d6d';
      ctx.beginPath(); ctx.arc(0, -42, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      // Golden robot chassis
      ctx.fillStyle = '#ffd23f';
      roundRect(ctx, -26, -26, 52, 50, 12); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff7a8';
      ctx.fillRect(-18, -20, 12, 36);
      // Visor + glowing cyan eyes
      ctx.fillStyle = INK;
      roundRect(ctx, -18, -14, 36, 16, 7); ctx.fill();
      ctx.fillStyle = '#5ef2ff';
      ctx.beginPath(); ctx.arc(-8, -6, 4.5, 0, Math.PI * 2); ctx.arc(8, -6, 4.5, 0, Math.PI * 2); ctx.fill();
    } else if (k === 'magnet') {
      // Electric Magnet Orb!
      var mp = 1 + Math.sin(w.time * 10 + toy.id) * 0.1;
      ctx.strokeStyle = 'rgba(0, 212, 255, 0.6)';
      ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.arc(0, 0, r * 1.24 * mp, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 4;
      ctx.fillStyle = '#e8fbff';
      ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      // Red/silver U-magnet inside orb
      ctx.strokeStyle = '#ff3b5c';
      ctx.lineWidth = 9;
      ctx.beginPath(); ctx.arc(0, -2, 13, Math.PI, 0, false); ctx.lineTo(13, 12); ctx.moveTo(-13, -2); ctx.lineTo(-13, 12); ctx.stroke();
      ctx.fillStyle = '#dfe7f5';
      ctx.fillRect(-18, 8, 10, 7); ctx.fillRect(8, 8, 10, 7);
    } else if (k === 'fizz') {
      // Fizzy Orange Soda Crate (chain-pops boots!)
      ctx.fillStyle = '#ff7b24';
      roundRect(ctx, -28, -26, 56, 50, 10); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffe14f';
      ctx.fillRect(-24, -8, 48, 14);
      // Sparkling star emblem
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(0, -18); ctx.lineTo(5, -5); ctx.lineTo(18, 0); ctx.lineTo(5, 5);
      ctx.lineTo(0, 18); ctx.lineTo(-5, 5); ctx.lineTo(-18, 0); ctx.lineTo(-5, -5);
      ctx.closePath(); ctx.fill();
    } else if (k === 'boot') {
      // Silly Muddy Green Rubber Boot!
      ctx.fillStyle = '#6f8f4e';
      ctx.beginPath();
      ctx.moveTo(-14, -26); ctx.lineTo(8, -26); ctx.lineTo(8, 2);
      ctx.lineTo(26, 6); ctx.quadraticCurveTo(32, 14, 24, 22);
      ctx.lineTo(-18, 22); ctx.lineTo(-18, -22);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // Yellow rubber sole + goofy white patch
      ctx.fillStyle = '#d9b44a';
      ctx.fillRect(-18, 16, 44, 6); ctx.strokeRect(-18, 16, 44, 6);
      // Silly eyes so kids smile even when dodging it
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(-4, -10, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = INK;
      ctx.beginPath(); ctx.arc(-3, -10, 2.2, 0, Math.PI * 2); ctx.fill();
    }

    ctx.restore();
  }

  function drawClaw(ctx, w, screen) {
    var cl = w.claw;
    var gripScale = 1 + w.upg.grip * 0.08;

    // Crisp vertical drop guide laser beam while swinging!
    if (cl.state === 'swing' && (screen === 'play' || screen === 'title')) {
      ctx.save();
      ctx.strokeStyle = w.fever > 0 ? 'rgba(255, 210, 63, 0.72)' : 'rgba(47, 182, 236, 0.48)';
      ctx.lineWidth = w.fever > 0 ? 5 : 3.5;
      ctx.setLineDash([12, 10]);
      ctx.beginPath();
      ctx.moveTo(cl.x, cl.y + 34);
      ctx.lineTo(cl.x, SF.FLOOR_Y - 12);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Steel tether cable from gantry trolley down to claw head
    ctx.strokeStyle = INK;
    ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(cl.x, SF.RAIL_Y + 8); ctx.lineTo(cl.x, cl.y); ctx.stroke();
    ctx.strokeStyle = '#cad6eb';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(cl.x, SF.RAIL_Y + 8); ctx.lineTo(cl.x, cl.y); ctx.stroke();

    // Trolley carriage riding the overhead rail
    ctx.save();
    ctx.translate(cl.x, SF.RAIL_Y);
    ctx.fillStyle = w.fever > 0 ? '#ff5da2' : '#ff9f1c';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4;
    roundRect(ctx, -46, -24, 92, 46, 14); ctx.fill(); ctx.stroke();
    // Expressive LED face screen on trolley!
    ctx.fillStyle = INK;
    roundRect(ctx, -28, -14, 56, 22, 8); ctx.fill();
    ctx.fillStyle = w.fever > 0 ? '#ffe14f' : '#5ef2ff';
    if (cl.state === 'drop') {
      // Excited > < eyes on drop!
      ctx.fillRect(-16, -6, 10, 5);
      ctx.fillRect(6, -6, 10, 5);
    } else {
      ctx.beginPath(); ctx.arc(-11, -3, 5, 0, Math.PI * 2); ctx.arc(11, -3, 5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    // Mechanical Claw Head + Articulated Prongs
    ctx.save();
    ctx.translate(cl.x, cl.y);
    ctx.rotate(cl.sway);
    ctx.scale(gripScale, gripScale);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4.5;
    ctx.lineJoin = 'round';

    var openAng = 0.22 + cl.jaw * 0.48;
    for (var side = -1; side <= 1; side += 2) {
      ctx.save();
      ctx.translate(side * 16, 10);
      ctx.rotate(-side * openAng);
      ctx.fillStyle = '#dce6f5';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(side * 24, 24);
      ctx.lineTo(side * 8, 46);
      ctx.lineTo(side * -2, 38);
      ctx.lineTo(side * 10, 22);
      ctx.lineTo(side * -6, 6);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.restore();
    }

    // Claw hub dome
    ctx.fillStyle = w.fever > 0 ? '#ffd23f' : '#ffb830';
    ctx.beginPath(); ctx.arc(0, 4, 22, Math.PI, 0); ctx.lineTo(22, 14); ctx.lineTo(-22, 14); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(0, 2, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();

    // Draw caught toys clutched inside claw!
    for (var i = 0; i < cl.caught.length; i++) {
      drawToy(ctx, cl.caught[i], w);
    }
  }

  function drawFeverOverlay(ctx, w) {
    if (w.fever <= 0) return;
    ctx.save();
    var pulse = 0.20 + Math.sin(w.time * 12) * 0.08;
    ctx.strokeStyle = 'rgba(255, 210, 63, ' + (0.65 + pulse) + ')';
    ctx.lineWidth = 18;
    ctx.strokeRect(9, 9, SF.W - 18, SF.H - 18);

    // Falling golden rain coins
    for (var i = 0; i < w.goldRain.length; i++) {
      var g = w.goldRain[i];
      ctx.fillStyle = '#ffd23f';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(g.x, g.y, g.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff9c4';
      ctx.beginPath(); ctx.arc(g.x - 4, g.y - 4, 5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawZapsAndBoots(ctx, w) {
    // Electric cyan magnet arcs!
    for (var zi = 0; zi < w.zaps.length; zi++) {
      var z = w.zaps[zi];
      ctx.save();
      ctx.globalAlpha = Math.max(0, z.life / z.max);
      ctx.strokeStyle = '#38f2ff';
      ctx.lineWidth = 6;
      ctx.beginPath();
      var mx = (z.x1 + z.x2) * 0.5 + (zi % 2 ? 18 : -18);
      var my = (z.y1 + z.y2) * 0.5 - 16;
      ctx.moveTo(z.x1, z.y1); ctx.lineTo(mx, my); ctx.lineTo(z.x2, z.y2);
      ctx.stroke();
      ctx.restore();
    }

    // Tossed silly boots flying away!
    for (var bi = 0; bi < w.tossedBoots.length; bi++) {
      var b = w.tossedBoots[bi];
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      drawToy(ctx, { kind: 'boot', x: 0, y: 0, r: 30, pulled: true, id: 0 }, { fever: 0, time: 0 });
      ctx.restore();
    }
  }

  function drawPopups(ctx, popups) {
    for (var i = 0; i < popups.length; i++) {
      var p = popups[i];
      ctx.save();
      ctx.globalAlpha = Math.min(1, Math.max(0, (p.life / p.max) * 2.6));
      ctx.font = '700 ' + p.size + 'px Fredoka, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 9;
      ctx.strokeStyle = '#151830';
      ctx.strokeText(p.text, p.x, p.y + 2);
      ctx.strokeText(p.text, p.x, p.y);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y);
      ctx.restore();
    }
  }

  function drawCoach(ctx, w, idleSec, screen) {
    if (screen !== 'play' || idleSec < 1.8 || w.drops > 0) return;
    ctx.save();
    var pulse = 1 + Math.sin(w.time * 7) * 0.08;
    ctx.translate(w.claw.x, SF.CLAW_HOME_Y + 94);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = 'rgba(22, 26, 56, 0.9)';
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = 3.5;
    roundRect(ctx, -124, -26, 248, 52, 26);
    ctx.fill(); ctx.stroke();
    ctx.font = '700 22px Fredoka, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText('انقر أو مسافة لإسقاط المخلب!', 0, 1);
    ctx.restore();
  }

  function draw(ctx, w, fx, screen) {
    var wingIdx = w.cfg ? w.cfg.wing : 0;
    if (!bgCache || bgWing !== wingIdx) {
      bgCache = buildBg(wingIdx);
      bgWing = wingIdx;
    }

    ctx.save();
    if (fx && fx.shake) ctx.translate(fx.shake.x, fx.shake.y);

    ctx.drawImage(bgCache, 0, 0);

    // Animated warm workshop gears flanking the skylights
    drawGear(ctx, 72, 206, 46, 10, w.time * 0.45, 'rgba(255, 196, 77, 0.58)');
    drawGear(ctx, 318, 224, 34, 8, -w.time * 0.72, 'rgba(90, 175, 235, 0.50)');
    drawGear(ctx, 962, 224, 34, 8, w.time * 0.72, 'rgba(90, 175, 235, 0.50)');
    drawGear(ctx, 1206, 206, 48, 10, -w.time * 0.42, 'rgba(255, 196, 77, 0.58)');

    // Pulsing glow inside bottom collection chute
    ctx.save();
    var chPulse = 0.22 + Math.sin(w.time * 4.5) * 0.14;
    ctx.fillStyle = w.fever > 0 ? ('rgba(255, 210, 63, ' + (chPulse + 0.18) + ')') : ('rgba(94, 242, 255, ' + chPulse + ')');
    roundRect(ctx, 500, 638, 280, 52, 10);
    ctx.fill();
    ctx.restore();

    drawConveyors(ctx, w);

    // Belt toys (sorted by lane depth)
    for (var i = 0; i < w.toys.length; i++) {
      if (!w.toys[i].pulled) drawToy(ctx, w.toys[i], w);
    }

    drawZapsAndBoots(ctx, w);
    drawClaw(ctx, w, screen);
    drawFeverOverlay(ctx, w);

    if (fx && fx.particles) fx.particles.draw(ctx);
    if (fx && fx.popups) drawPopups(ctx, fx.popups);
    if (screen === 'play') drawCoach(ctx, w, fx ? fx.idleSec : 0, screen);

    ctx.restore();
  }

  SF.art = { draw: draw };
})();
