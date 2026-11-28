/* Recess Kitchen — Canvas 2D renderer: sunlit canteen, giant lunchbox goals,
 * bouncy cartoon chefs with giant spatulas, silly hats, expressive snacks, and chaos FX. */
(function () {
  'use strict';
  var RK = window.RK;
  var INK = '#3b2416';

  var bgCache = null;
  var bgModKey = '';

  function buildStaticBg(moon, chili) {
    var c = document.createElement('canvas');
    c.width = RK.W;
    c.height = RK.H;
    var g = c.getContext('2d');

    // Warm sunlit kitchen wall (or starry twilight for Moon Bounce / spicy warm for Chili Turbo)
    var sky = g.createLinearGradient(0, 0, 0, RK.FLOOR_Y);
    if (moon) {
      sky.addColorStop(0, '#1e1b4b');
      sky.addColorStop(0.55, '#3b2d7a');
      sky.addColorStop(1, '#58419c');
    } else if (chili) {
      sky.addColorStop(0, '#ffe3a8');
      sky.addColorStop(0.55, '#ffb469');
      sky.addColorStop(1, '#ff8e53');
    } else {
      sky.addColorStop(0, '#fff7dc');
      sky.addColorStop(0.55, '#ffebba');
      sky.addColorStop(1, '#ffd891');
    }
    g.fillStyle = sky;
    g.fillRect(0, 0, RK.W, RK.H);

    // Sunlit window / tile grid
    g.save();
    g.strokeStyle = moon ? 'rgba(255,255,255,0.08)' : 'rgba(205,135,55,0.13)';
    g.lineWidth = 2;
    for (var x = 0; x <= RK.W; x += 64) {
      g.beginPath(); g.moveTo(x, 70); g.lineTo(x, RK.FLOOR_Y); g.stroke();
    }
    for (var y = 70; y <= RK.FLOOR_Y; y += 64) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(RK.W, y); g.stroke();
    }
    g.restore();

    if (moon) {
      // Big smiling crescent moon + twinkling stars in skylight
      g.fillStyle = '#fff5b8';
      g.beginPath(); g.arc(640, 210, 62, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#312668';
      g.beginPath(); g.arc(664, 198, 52, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,220,0.8)';
      var stars = [[180,150],[310,120],[470,175],[820,130],[990,170],[1110,135],[250,260],[1030,255]];
      for (var si = 0; si < stars.length; si++) {
        g.beginPath(); g.arc(stars[si][0], stars[si][1], 4 + (si % 3), 0, Math.PI * 2); g.fill();
      }
    } else {
      // Diagonal sunlit rays through canteen windows
      g.save();
      g.fillStyle = 'rgba(255,252,220,0.28)';
      g.beginPath(); g.moveTo(220, 65); g.lineTo(410, 65); g.lineTo(540, RK.FLOOR_Y); g.lineTo(310, RK.FLOOR_Y); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(760, 65); g.lineTo(950, 65); g.lineTo(1080, RK.FLOOR_Y); g.lineTo(850, RK.FLOOR_Y); g.closePath(); g.fill();
      g.restore();

      // Sunny kitchen window frames
      var wins = [290, 820];
      for (var wi = 0; wi < wins.length; wi++) {
        var wx = wins[wi];
        g.fillStyle = '#bceeff';
        g.strokeStyle = '#d99852';
        g.lineWidth = 8;
        roundRect(g, wx, 130, 170, 150, 18);
        g.fill(); g.stroke();
        // Fluffy cloud in window
        g.fillStyle = 'rgba(255,255,255,0.85)';
        g.beginPath();
        g.arc(wx + 60, 198, 22, 0, Math.PI * 2);
        g.arc(wx + 90, 190, 26, 0, Math.PI * 2);
        g.arc(wx + 118, 200, 20, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = '#d99852';
        g.lineWidth = 6;
        g.beginPath(); g.moveTo(wx + 85, 130); g.lineTo(wx + 85, 280); g.moveTo(wx, 205); g.lineTo(wx + 170, 205); g.stroke();
      }
    }

    // Center school kitchen shelf with decorative spice jars
    g.fillStyle = '#d68942';
    g.strokeStyle = INK;
    g.lineWidth = 4;
    roundRect(g, 520, 240, 240, 18, 8); g.fill(); g.stroke();
    var jars = [['#ff5964', 550], ['#ffd23f', 605], ['#3ddc84', 660], ['#45b7ff', 715]];
    for (var ji = 0; ji < jars.length; ji++) {
      g.fillStyle = jars[ji][0];
      roundRect(g, jars[ji][1], 198, 30, 40, 8); g.fill(); g.stroke();
      g.fillStyle = '#fff3d6';
      roundRect(g, jars[ji][1] + 4, 190, 22, 10, 4); g.fill(); g.stroke();
    }

    // Festive red & cream striped canteen awning across top
    var sw = 80;
    for (var ax = 0; ax < RK.W; ax += sw) {
      g.fillStyle = ((ax / sw) | 0) % 2 === 0 ? '#ff4d5a' : '#fff8ea';
      g.beginPath();
      g.moveTo(ax, 0);
      g.lineTo(ax + sw, 0);
      g.lineTo(ax + sw, 56);
      g.quadraticCurveTo(ax + sw * 0.5, 82, ax, 56);
      g.closePath();
      g.fill();
      g.strokeStyle = INK;
      g.lineWidth = 4;
      g.stroke();
    }

    // Giant canteen counter base
    var cGrad = g.createLinearGradient(0, RK.FLOOR_Y, 0, RK.H);
    cGrad.addColorStop(0, '#f3b165');
    cGrad.addColorStop(0.24, '#e08b3b');
    cGrad.addColorStop(1, '#b56022');
    g.fillStyle = cGrad;
    g.fillRect(0, RK.FLOOR_Y, RK.W, RK.H - RK.FLOOR_Y);

    // Glossy stainless griddle strip along the top of counter
    g.fillStyle = '#e7edf5';
    g.fillRect(0, RK.FLOOR_Y - 4, RK.W, 18);
    g.fillStyle = '#fff';
    g.fillRect(0, RK.FLOOR_Y - 2, RK.W, 5);
    g.strokeStyle = INK;
    g.lineWidth = 4.5;
    g.beginPath(); g.moveTo(0, RK.FLOOR_Y - 4); g.lineTo(RK.W, RK.FLOOR_Y - 4); g.stroke();
    g.beginPath(); g.moveTo(0, RK.FLOOR_Y + 14); g.lineTo(RK.W, RK.FLOOR_Y + 14); g.stroke();

    // Center court garnish line
    g.fillStyle = 'rgba(255,255,255,0.45)';
    g.fillRect(RK.W * 0.5 - 3, RK.FLOOR_Y + 16, 6, RK.H - RK.FLOOR_Y - 16);

    // Counter cabinet paneling details
    g.strokeStyle = 'rgba(90,42,14,0.28)';
    g.lineWidth = 4;
    for (var cx = 140; cx < RK.W - 140; cx += 200) {
      roundRect(g, cx, RK.FLOOR_Y + 28, 170, 74, 12);
      g.stroke();
    }

    return c;
  }

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

  function drawFloorModifier(ctx, w) {
    var p = w.params;
    if (p.butter) {
      // Melted golden butter slicks shimmering on counter!
      ctx.save();
      ctx.fillStyle = 'rgba(255, 224, 66, 0.85)';
      ctx.strokeStyle = '#d48a00';
      ctx.lineWidth = 3;
      roundRect(ctx, RK.GOAL_W, RK.FLOOR_Y - 7, RK.W - RK.GOAL_W * 2, 16, 8);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      for (var bx = 180; bx < RK.W - 180; bx += 190) {
        var shift = Math.sin(w.time * 2 + bx) * 6;
        roundRect(ctx, bx + shift, RK.FLOOR_Y - 4, 72, 5, 3);
        ctx.fill();
      }
      ctx.restore();
    } else if (p.trampoline) {
      // Springy shiny baking tray trampoline across counter!
      ctx.save();
      var bounce = Math.sin(w.time * 7) * 2;
      ctx.fillStyle = '#ff6b4a';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 4;
      roundRect(ctx, RK.GOAL_W + 8, RK.FLOOR_Y - 12 + bounce, RK.W - RK.GOAL_W * 2 - 16, 18, 9);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffe066';
      for (var tx = RK.GOAL_W + 40; tx < RK.W - RK.GOAL_W - 40; tx += 95) {
        ctx.beginPath();
        ctx.moveTo(tx, RK.FLOOR_Y - 8 + bounce);
        ctx.lineTo(tx + 14, RK.FLOOR_Y - 1 + bounce);
        ctx.lineTo(tx + 28, RK.FLOOR_Y - 8 + bounce);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawLunchboxGoal(ctx, side, w) {
    var isLeft = side === 0;
    var chomp = w.lunchChomp[side];
    var gx = isLeft ? 0 : RK.W - RK.GOAL_W;
    var gy = RK.GOAL_TOP;
    var color = isLeft ? '#2596ff' : '#ff525e';
    var dark = isLeft ? '#1562b8' : '#b82534';
    var light = isLeft ? '#80caff' : '#ff9ca3';

    ctx.save();

    // Inner dark hungry mouth cavity
    ctx.fillStyle = '#3d1022';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 5;
    roundRect(ctx, gx + (isLeft ? -8 : 6), gy + 12, RK.GOAL_W + 2, RK.GOAL_H - 12, 16);
    ctx.fill(); ctx.stroke();

    // Pink playful tongue inside lunchbox
    ctx.fillStyle = '#ff6b8b';
    ctx.beginPath();
    ctx.ellipse(isLeft ? gx + 48 : gx + RK.GOAL_W - 48, RK.FLOOR_Y - 16, 42, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    // Outer lunchbox body shell (back wall & bottom lip)
    ctx.fillStyle = color;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 5;
    if (isLeft) {
      roundRect(ctx, -12, gy, 44, RK.GOAL_H, 14);
    } else {
      roundRect(ctx, RK.W - 32, gy, 44, RK.GOAL_H, 14);
    }
    ctx.fill(); ctx.stroke();

    // Animated hinged lunchbox lid with googly eyes + teeth!
    ctx.save();
    var hingeX = isLeft ? 22 : RK.W - 22;
    var hingeY = gy + 8;
    ctx.translate(hingeX, hingeY);
    var lidAngle = (isLeft ? -1 : 1) * (0.08 + Math.sin(w.time * 3.5 + side) * 0.04 - chomp * 0.42);
    ctx.rotate(lidAngle);

    // Lid roof
    ctx.fillStyle = color;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 5;
    if (isLeft) {
      roundRect(ctx, -26, -24, RK.GOAL_W + 18, 34, 14);
    } else {
      roundRect(ctx, -(RK.GOAL_W - 8), -24, RK.GOAL_W + 18, 34, 14);
    }
    ctx.fill(); ctx.stroke();

    // Lid highlight
    ctx.fillStyle = light;
    roundRect(ctx, isLeft ? -14 : -(RK.GOAL_W - 22), -18, RK.GOAL_W - 14, 10, 5);
    ctx.fill();

    // Cute chomping teeth under lid
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    for (var ti = 0; ti < 3; ti++) {
      var tx = isLeft ? (18 + ti * 24) : (-36 - ti * 24);
      ctx.beginPath();
      ctx.moveTo(tx, 10);
      ctx.lineTo(tx + 9, 24);
      ctx.lineTo(tx + 18, 10);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    }

    // Googly eyes on lid tracking nearest snack!
    var snack = w.snacks[0];
    var eyeBaseX = isLeft ? 54 : -54;
    for (var ei = 0; ei < 2; ei++) {
      var ex = eyeBaseX + (ei === 0 ? -13 : 13);
      var ey = -28;
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.arc(ex, ey, 13, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      var ang = snack ? Math.atan2(snack.y - gy, snack.x - (isLeft ? 70 : RK.W - 70)) : 0;
      ctx.fillStyle = INK;
      ctx.beginPath(); ctx.arc(ex + Math.cos(ang) * 4, ey + Math.sin(ang) * 4, 5.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(ex + Math.cos(ang) * 4 - 2, ey + Math.sin(ang) * 4 - 2, 2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    // Team color badge strip on bottom
    ctx.fillStyle = dark;
    ctx.fillRect(gx + 6, RK.FLOOR_Y - 12, RK.GOAL_W - 12, 10);
    ctx.restore();
  }

  function drawHat(ctx, hatId, r) {
    ctx.save();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    if (hatId === 0) {
      // Classic puffy chef toque
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(-r * 0.42, -r * 1.15, r * 0.34, 0, Math.PI * 2);
      ctx.arc(r * 0.42, -r * 1.15, r * 0.34, 0, Math.PI * 2);
      ctx.arc(0, -r * 1.32, r * 0.40, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff8ef';
      roundRect(ctx, -r * 0.52, -r * 1.1, r * 1.04, r * 0.42, 6);
      ctx.fill(); ctx.stroke();
    } else if (hatId === 1) {
      // Burger crown hat!
      ctx.fillStyle = '#f2a444';
      ctx.beginPath(); ctx.arc(0, -r * 0.96, r * 0.56, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#6ad44a';
      ctx.fillRect(-r * 0.60, -r * 0.96, r * 1.2, r * 0.14); ctx.strokeRect(-r * 0.60, -r * 0.96, r * 1.2, r * 0.14);
      ctx.fillStyle = '#7d3e1d';
      roundRect(ctx, -r * 0.56, -r * 0.84, r * 1.12, r * 0.18, 5); ctx.fill(); ctx.stroke();
    } else if (hatId === 2) {
      // Pizza beret!
      ctx.fillStyle = '#ffbe3b';
      ctx.beginPath();
      ctx.moveTo(-r * 0.68, -r * 0.72);
      ctx.lineTo(r * 0.72, -r * 0.78);
      ctx.lineTo(0, -r * 1.48);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#e03e2d';
      ctx.beginPath(); ctx.arc(-r * 0.14, -r * 0.95, r * 0.12, 0, Math.PI * 2); ctx.arc(r * 0.18, -r * 1.04, r * 0.11, 0, Math.PI * 2); ctx.fill();
    } else if (hatId === 3) {
      // Frosted Donut Halo!
      ctx.fillStyle = '#f5a94c';
      ctx.beginPath(); ctx.ellipse(0, -r * 1.05, r * 0.64, r * 0.28, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ff6db8';
      ctx.beginPath(); ctx.ellipse(0, -r * 1.1, r * 0.56, r * 0.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffe599';
      ctx.beginPath(); ctx.ellipse(0, -r * 1.05, r * 0.2, r * 0.08, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    } else if (hatId === 4) {
      // Copper Saucepan Helmet!
      ctx.fillStyle = '#d97a38';
      roundRect(ctx, -r * 0.58, -r * 1.32, r * 1.16, r * 0.62, 10); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#f7a563';
      ctx.fillRect(-r * 0.42, -r * 1.24, r * 0.24, r * 0.46);
      // Saucepan handle sticking out
      ctx.fillStyle = '#5c3b28';
      roundRect(ctx, r * 0.54, -r * 1.08, r * 0.64, r * 0.18, 6); ctx.fill(); ctx.stroke();
    } else {
      // Golden Master Crown!
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.moveTo(-r * 0.56, -r * 0.72);
      ctx.lineTo(-r * 0.66, -r * 1.38);
      ctx.lineTo(-r * 0.22, -r * 1.04);
      ctx.lineTo(0, -r * 1.50);
      ctx.lineTo(r * 0.22, -r * 1.04);
      ctx.lineTo(r * 0.66, -r * 1.38);
      ctx.lineTo(r * 0.56, -r * 0.72);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ff4d6d';
      ctx.beginPath(); ctx.arc(0, -r * 0.96, r * 0.12, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawChef(ctx, c, w) {
    var isP1 = c.side === 0;
    var main = isP1 ? '#29a8ff' : '#ff5765';
    var light = isP1 ? '#87d4ff' : '#ff9da6';
    var r = c.r;

    // Ground contact shadow
    var shadowScale = Math.max(0.35, 1 - (RK.FLOOR_Y - c.r - c.y) / 360);
    ctx.fillStyle = 'rgba(72, 36, 12, 0.22)';
    ctx.beginPath();
    ctx.ellipse(c.x, RK.FLOOR_Y - 2, r * 0.95 * shadowScale, 10 * shadowScale, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.spin);
    ctx.scale(c.squashX, c.squashY);

    // Giant Spatula! Swings dramatically when flipping!
    ctx.save();
    var dir = isP1 ? 1 : -1;
    var swing = c.spatulaT > 0 ? Math.sin((1 - c.spatulaT / 0.30) * Math.PI) * 1.85 : 0;
    ctx.translate(dir * r * 0.55, r * 0.08);
    ctx.rotate(dir * (0.45 - swing));

    // Spatula arc swoosh glow during whack
    if (c.spatulaT > 0.04) {
      ctx.save();
      ctx.strokeStyle = isP1 ? 'rgba(75,205,255,0.65)' : 'rgba(255,110,120,0.65)';
      ctx.lineWidth = 14 * c.scale;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.48, isP1 ? -1.4 : Math.PI - 0.1, isP1 ? 0.1 : Math.PI + 1.4);
      ctx.stroke();
      ctx.restore();
    }

    // Wooden handle + gleaming metal spatula blade
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4;
    ctx.fillStyle = '#c97834';
    roundRect(ctx, -6 * c.scale, -r * 0.95, 12 * c.scale, r * 0.95, 5);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#dde7f2';
    roundRect(ctx, -20 * c.scale, -r * 1.62, 40 * c.scale, r * 0.74, 8);
    ctx.fill(); ctx.stroke();
    // Spatula slots
    ctx.fillStyle = '#6c7c94';
    ctx.fillRect(-10 * c.scale, -r * 1.48, 5 * c.scale, r * 0.44);
    ctx.fillRect(5 * c.scale, -r * 1.48, 5 * c.scale, r * 0.44);
    ctx.restore();

    // Little bouncy chef shoes
    ctx.fillStyle = '#3b2416';
    var footKick = c.grounded ? 0 : Math.sin(w.time * 18) * 6;
    ctx.beginPath();
    ctx.ellipse(-r * 0.34, r * 0.88 + footKick, r * 0.25, r * 0.16, 0, 0, Math.PI * 2);
    ctx.ellipse(r * 0.34, r * 0.88 - footKick, r * 0.25, r * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();

    // Plump cartoon apron body
    ctx.fillStyle = main;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.arc(0, r * 0.12, r * 0.84, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    // White chef bib apron on belly
    ctx.fillStyle = '#fff9f0';
    ctx.beginPath();
    ctx.arc(0, r * 0.34, r * 0.56, 0, Math.PI, false);
    ctx.lineTo(-r * 0.45, r * 0.15);
    ctx.lineTo(r * 0.45, r * 0.15);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // Cute round face
    ctx.fillStyle = '#ffd9b3';
    ctx.beginPath();
    ctx.arc(0, -r * 0.32, r * 0.58, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    // Rosy cheeks
    ctx.fillStyle = 'rgba(255, 110, 128, 0.55)';
    ctx.beginPath();
    ctx.ellipse(-r * 0.34, -r * 0.20, r * 0.13, r * 0.08, 0, 0, Math.PI * 2);
    ctx.ellipse(r * 0.34, -r * 0.20, r * 0.13, r * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();

    // Expressive cartoon eyes tracking nearest snack
    var sn = w.snacks[0];
    var ang = sn ? Math.atan2(sn.y - c.y, sn.x - c.x) : (isP1 ? 0 : Math.PI);
    var eyeX = isP1 ? r * 0.08 : -r * 0.08;
    for (var ei = -1; ei <= 1; ei += 2) {
      var ex = eyeX + ei * r * 0.22;
      var ey = -r * 0.38;
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(ex, ey, r * 0.16, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = INK;
      ctx.beginPath(); ctx.arc(ex + Math.cos(ang) * r * 0.05, ey + Math.sin(ang) * r * 0.05, r * 0.075, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(ex + Math.cos(ang) * r * 0.05 - 2, ey + Math.sin(ang) * r * 0.05 - 2, r * 0.03, 0, Math.PI * 2); ctx.fill();
    }

    // Mouth expression
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    if (c.expr === 'wow' || c.expr === 'cheer') {
      ctx.fillStyle = '#ff5964';
      ctx.beginPath(); ctx.arc(eyeX, -r * 0.12, r * 0.14, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    } else if (c.expr === 'dizzy') {
      ctx.beginPath(); ctx.arc(eyeX, -r * 0.04, r * 0.13, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(eyeX, -r * 0.16, r * 0.15, 0.15, Math.PI - 0.15); ctx.stroke();
    }

    // Highlight shine + Silly Chef Hat!
    ctx.fillStyle = light;
    ctx.beginPath(); ctx.arc(-r * 0.45, r * 0.05, r * 0.12, 0, Math.PI * 2); ctx.fill();
    drawHat(ctx, c.hat, r);
    ctx.restore();

    // Crisp player indicator arrow above P1 (and P2 in duo)
    if (!w.demo && (isP1 || w.duo)) {
      ctx.save();
      var bob = Math.sin(w.time * 6) * 4;
      var iy = c.y - r * 1.95 + bob;
      ctx.fillStyle = main;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(c.x, iy + 13);
      ctx.lineTo(c.x - 11, iy);
      ctx.lineTo(c.x + 11, iy);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.restore();
    }
  }

  function drawSnack(ctx, s, w) {
    // Motion trail
    if (s.trail.length > 1) {
      ctx.save();
      for (var ti = 0; ti < s.trail.length; ti++) {
        var pt = s.trail[ti];
        var alpha = ((ti + 1) / s.trail.length) * 0.35;
        ctx.fillStyle = s.golden ? ('rgba(255,215,40,' + alpha + ')') : (w.params.chili ? ('rgba(255,80,40,' + alpha + ')') : ('rgba(255,255,255,' + alpha + ')'));
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, s.r * (0.4 + 0.55 * (ti / s.trail.length)), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // Ground shadow
    var sh = Math.max(0.28, 1 - (RK.FLOOR_Y - s.r - s.y) / 420);
    ctx.fillStyle = 'rgba(72,36,12,0.22)';
    ctx.beginPath();
    ctx.ellipse(s.x, RK.FLOOR_Y - 2, s.r * 0.9 * sh, 9 * sh, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(s.x, s.y);

    // Golden x2 / Sudden Death aura!
    if (s.golden) {
      var pulse = 1 + Math.sin(w.time * 10) * 0.1;
      ctx.fillStyle = 'rgba(255, 224, 66, 0.32)';
      ctx.beginPath(); ctx.arc(0, 0, s.r * 1.42 * pulse, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff59d';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(0, 0, s.r * 1.18 * pulse, 0, Math.PI * 2); ctx.stroke();
    }

    ctx.rotate(s.rot);
    ctx.scale(s.squashX, s.squashY);
    var r = s.r;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4.5;
    ctx.lineJoin = 'round';

    if (s.kind === 'donut') {
      // Giant Bouncy Frosted Donut!
      ctx.fillStyle = s.golden ? '#ffd23f' : '#f2a854';
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = s.golden ? '#fff282' : '#ff6eb8';
      ctx.beginPath(); ctx.arc(0, 0, r * 0.84, 0, Math.PI * 2); ctx.fill();
      // Rainbow sprinkles
      var spCols = ['#ffe14f', '#45d4ff', '#7ed957', '#fff', '#ff4d6d'];
      for (var k = 0; k < 10; k++) {
        var ka = (k / 10) * Math.PI * 2;
        ctx.save();
        ctx.rotate(ka);
        ctx.fillStyle = spCols[k % spCols.length];
        roundRect(ctx, r * 0.48, -3, r * 0.22, 6, 3);
        ctx.fill();
        ctx.restore();
      }
      // Donut hole
      ctx.fillStyle = '#fff3d6';
      ctx.beginPath(); ctx.arc(0, 0, r * 0.30, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    } else if (s.kind === 'pizza') {
      // Golden Cheesy Pizza!
      ctx.fillStyle = '#e59a45';
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = s.golden ? '#ffe852' : '#ffd23f';
      ctx.beginPath(); ctx.arc(0, 0, r * 0.82, 0, Math.PI * 2); ctx.fill();
      // Pepperoni slices + basil
      ctx.fillStyle = '#e63946';
      var peps = [[-0.36,-0.22],[0.34,-0.25],[0,0.34],[-0.28,0.28],[0.32,0.22]];
      for (var pi = 0; pi < peps.length; pi++) {
        ctx.beginPath(); ctx.arc(peps[pi][0] * r, peps[pi][1] * r, r * 0.16, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = '#3ddc84';
      ctx.beginPath(); ctx.ellipse(0, -0.35 * r, r * 0.14, r * 0.08, 0.4, 0, Math.PI * 2); ctx.fill();
    } else {
      // Sizzling Juicy Burger!
      // Bottom bun
      ctx.fillStyle = s.golden ? '#ffd23f' : '#eda045';
      roundRect(ctx, -r * 0.92, r * 0.28, r * 1.84, r * 0.56, r * 0.28); ctx.fill(); ctx.stroke();
      // Patty
      ctx.fillStyle = '#783c1c';
      roundRect(ctx, -r * 0.98, 0, r * 1.96, r * 0.36, r * 0.18); ctx.fill(); ctx.stroke();
      // Melted cheese triangle
      ctx.fillStyle = '#ffd93b';
      ctx.beginPath();
      ctx.moveTo(-r * 0.92, 2); ctx.lineTo(r * 0.92, 2);
      ctx.lineTo(r * 0.42, r * 0.34); ctx.lineTo(0, r * 0.14); ctx.lineTo(-r * 0.45, r * 0.36);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // Lettuce wave
      ctx.fillStyle = '#6ad94e';
      roundRect(ctx, -r * 0.98, -r * 0.18, r * 1.96, r * 0.24, r * 0.12); ctx.fill(); ctx.stroke();
      // Top sesame bun
      ctx.fillStyle = s.golden ? '#ffe14f' : '#f4ad4c';
      ctx.beginPath();
      ctx.arc(0, -r * 0.12, r * 0.92, Math.PI, 0);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // Sesame seeds
      ctx.fillStyle = '#fff8dc';
      ctx.beginPath();
      ctx.ellipse(-r * 0.38, -r * 0.56, r * 0.11, r * 0.06, -0.4, 0, Math.PI * 2);
      ctx.ellipse(0, -r * 0.68, r * 0.11, r * 0.06, 0, 0, Math.PI * 2);
      ctx.ellipse(r * 0.38, -r * 0.54, r * 0.11, r * 0.06, 0.4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Silly little googly eyes on the snack!
    if (s.kind !== 'donut') {
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.arc(-r * 0.22, -r * 0.12, r * 0.17, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(r * 0.22, -r * 0.12, r * 0.17, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = INK;
      ctx.beginPath(); ctx.arc(-r * 0.22, -r * 0.12, r * 0.07, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(r * 0.22, -r * 0.12, r * 0.07, 0, Math.PI * 2); ctx.fill();
    }

    ctx.restore();
  }

  function drawRouletteBanner(ctx, w) {
    if (w.phase !== 'goal') return;
    var mod = RK.ROULETTE_MODS[w.rouletteIdx] || RK.ROULETTE_MODS[0];
    var locked = w.goalTimer <= 0.38;
    var pop = locked ? 1.08 : 1.0;

    ctx.save();
    ctx.translate(RK.W * 0.5, 236);
    ctx.scale(pop, pop);

    // Goal text above wheel
    ctx.font = '700 44px Fredoka, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var gText = w.lastGoalPts > 1 ? 'هدف ذهبي ×2! ⭐' : 'هدف لذيذ! 🍔';
    ctx.lineWidth = 9;
    ctx.strokeStyle = INK;
    ctx.strokeText(gText, 0, -76);
    ctx.fillStyle = w.lastScorer === 0 ? '#5ad0ff' : '#ff7b85';
    ctx.fillText(gText, 0, -76);

    // Roulette pill card
    ctx.fillStyle = locked ? mod.color : '#1b2244';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 5;
    roundRect(ctx, -230, -34, 460, 74, 37);
    ctx.fill(); ctx.stroke();

    ctx.font = '700 30px Fredoka, sans-serif';
    ctx.fillStyle = locked ? '#22140c' : '#ffe14f';
    ctx.fillText(mod.name, 0, 5);
    ctx.restore();
  }

  function drawPopups(ctx, popups) {
    for (var i = 0; i < popups.length; i++) {
      var p = popups[i];
      var a = Math.max(0, p.life / p.max);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = '700 ' + p.size + 'px Fredoka, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 7;
      ctx.strokeStyle = INK;
      ctx.strokeText(p.text, p.x, p.y);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y);
      ctx.restore();
    }
  }

  function drawCoach(ctx, w, idleSec, screen) {
    if (screen !== 'play' || w.phase !== 'play' || idleSec < 1.8 || w.humanJumps > 0) return;
    ctx.save();
    var pulse = 1 + Math.sin(w.time * 7) * 0.08;
    var c = w.chefs[0];
    ctx.translate(c.x, c.y - c.r * 2.5);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = 'rgba(16, 20, 43, 0.88)';
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = 3.5;
    roundRect(ctx, -118, -26, 236, 52, 26);
    ctx.fill(); ctx.stroke();
    ctx.font = '700 22px Fredoka, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText('مسافة أو انقر للقفز!', 0, 1);
    ctx.restore();
  }

  function draw(ctx, w, fx, screen) {
    var key = (w.params.moon ? 'M' : '') + (w.params.chili ? 'C' : '');
    if (!bgCache || bgModKey !== key) {
      bgCache = buildStaticBg(w.params.moon, w.params.chili);
      bgModKey = key;
    }

    ctx.save();
    if (fx && fx.shake) {
      ctx.translate(fx.shake.x, fx.shake.y);
    }

    ctx.drawImage(bgCache, 0, 0);
    drawFloorModifier(ctx, w);
    drawLunchboxGoal(ctx, 0, w);
    drawLunchboxGoal(ctx, 1, w);

    // Chefs
    drawChef(ctx, w.chefs[0], w);
    drawChef(ctx, w.chefs[1], w);

    // Snacks
    for (var i = 0; i < w.snacks.length; i++) {
      drawSnack(ctx, w.snacks[i], w);
    }

    // Particles & popups
    if (fx && fx.particles) fx.particles.draw(ctx);
    if (fx && fx.popups) drawPopups(ctx, fx.popups);

    // Kitchen Chaos Roulette overlay on goal
    if (screen === 'play') {
      drawRouletteBanner(ctx, w);
      drawCoach(ctx, w, fx ? fx.idleSec : 0, screen);
    }

    ctx.restore();
  }

  RK.art = { draw: draw, drawHat: drawHat };
})();
