/*
 * Maze Dash — playable masks (skins) and the blob drawing routine.
 * window.MDMasks = { list, draw(ctx, cx, cy, size, id, opts) }
 * opts: { sx, sy (squash/stretch), lx, ly (look direction -1..1), t (seconds), blink (bool) }
 */
(function () {
  'use strict';

  // unlock: { coins: n } or { stars: n } or { height: n }
  var list = [
    { id: 0, name: 'البطل الأصفر', body: '#ffe600', dark: '#b88a00', unlock: { coins: 0 } },
    { id: 1, name: 'النينجا', body: '#3a3f8f', dark: '#1d2150', unlock: { coins: 50 } },
    { id: 2, name: 'الضفدع', body: '#5ee84a', dark: '#2b8f1f', unlock: { coins: 100 } },
    { id: 3, name: 'القط', body: '#ff9a2e', dark: '#b85a00', unlock: { coins: 150 } },
    { id: 4, name: 'الروبوت', body: '#c9d3e6', dark: '#6f7d99', unlock: { coins: 220 } },
    { id: 5, name: 'البطريق', body: '#2a2d3a', dark: '#11131a', unlock: { coins: 300 } },
    { id: 6, name: 'الفضائي', body: '#b6ff3a', dark: '#5f9900', unlock: { coins: 380 } },
    { id: 7, name: 'الأخطبوط', body: '#ff6fcf', dark: '#b0287f', unlock: { coins: 470 } },
    { id: 8, name: 'التنين', body: '#9d5cff', dark: '#5a22b0', unlock: { coins: 570 } },
    { id: 9, name: 'البطيخة', body: '#ff4d5e', dark: '#2f9e3a', unlock: { coins: 700 } },
    { id: 10, name: 'الملك', body: '#ffcf3a', dark: '#b07a00', unlock: { stars: 60 } },
    { id: 11, name: 'قوس قزح', body: '#ff4d9d', dark: '#8a2ad0', unlock: { height: 150 } }
  ];

  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function eyes(ctx, s, lx, ly, blink, white, pupil, gap, ey, er) {
    var e = er || s * 0.13;
    for (var k = -1; k <= 1; k += 2) {
      var ex = k * s * (gap || 0.2) + lx * s * 0.05, yy = (ey || -s * 0.06) + ly * s * 0.04;
      if (blink) {
        ctx.fillStyle = pupil; ctx.fillRect(ex - e, yy - s * 0.02, e * 2, s * 0.05);
        continue;
      }
      ctx.fillStyle = white;
      ctx.beginPath(); ctx.arc(ex, yy, e, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = pupil;
      ctx.beginPath(); ctx.arc(ex + lx * e * 0.4, yy + ly * e * 0.4, e * 0.55, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(ex + lx * e * 0.4 - e * 0.2, yy + ly * e * 0.4 - e * 0.25, e * 0.2, 0, Math.PI * 2); ctx.fill();
    }
  }

  function draw(ctx, cx, cy, size, id, o) {
    o = o || {};
    var m = list[id] || list[0];
    var s = size, sx = o.sx || 1, sy = o.sy || 1, lx = o.lx || 0, ly = o.ly || 0, t = o.t || 0, blink = !!o.blink;
    var body = m.body;
    if (id === 11) body = 'hsl(' + ((t * 120) % 360) + ',95%,62%)';
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(sx, sy);
    var h = s / 2;

    // back decorations (behind body)
    if (id === 3) { // cat ears
      ctx.fillStyle = m.body;
      for (var k = -1; k <= 1; k += 2) {
        ctx.beginPath(); ctx.moveTo(k * h * 0.85, -h * 0.55); ctx.lineTo(k * h * 0.72, -h * 1.25); ctx.lineTo(k * h * 0.25, -h * 0.8); ctx.fill();
        ctx.fillStyle = '#ffc2d6';
        ctx.beginPath(); ctx.moveTo(k * h * 0.72, -h * 0.7); ctx.lineTo(k * h * 0.68, -h * 1.05); ctx.lineTo(k * h * 0.42, -h * 0.82); ctx.fill();
        ctx.fillStyle = m.body;
      }
    }
    if (id === 8) { // dragon horns + wings
      ctx.fillStyle = '#ffe28a';
      for (k = -1; k <= 1; k += 2) {
        ctx.beginPath(); ctx.moveTo(k * h * 0.5, -h * 0.8); ctx.lineTo(k * h * 0.75, -h * 1.3); ctx.lineTo(k * h * 0.2, -h * 0.9); ctx.fill();
      }
      ctx.fillStyle = '#c79bff';
      var fl = Math.sin(t * 14) * 0.15;
      for (k = -1; k <= 1; k += 2) {
        ctx.beginPath(); ctx.moveTo(k * h * 0.9, -h * 0.2); ctx.lineTo(k * h * (1.45 + fl), -h * 0.7); ctx.lineTo(k * h * 1.3, h * 0.1); ctx.fill();
      }
    }
    if (id === 4) { // antenna
      ctx.strokeStyle = '#6f7d99'; ctx.lineWidth = s * 0.06;
      ctx.beginPath(); ctx.moveTo(0, -h * 0.9); ctx.lineTo(0, -h * 1.3); ctx.stroke();
      ctx.fillStyle = (Math.floor(t * 3) % 2) ? '#ff3f6c' : '#ffe600';
      ctx.beginPath(); ctx.arc(0, -h * 1.35, s * 0.09, 0, Math.PI * 2); ctx.fill();
    }
    if (id === 6) { // alien antennae
      ctx.strokeStyle = '#5f9900'; ctx.lineWidth = s * 0.05;
      for (k = -1; k <= 1; k += 2) {
        ctx.beginPath(); ctx.moveTo(k * h * 0.35, -h * 0.9); ctx.lineTo(k * h * 0.6, -h * 1.35); ctx.stroke();
        ctx.fillStyle = '#ff5ad1'; ctx.beginPath(); ctx.arc(k * h * 0.6, -h * 1.38, s * 0.08, 0, Math.PI * 2); ctx.fill();
      }
    }
    if (id === 7) { // octopus legs
      ctx.fillStyle = m.body;
      for (k = 0; k < 4; k++) {
        var lxp = -h * 0.75 + k * h * 0.5, wig = Math.sin(t * 10 + k) * h * 0.1;
        rr(ctx, lxp - h * 0.13 + wig, h * 0.5, h * 0.26, h * 0.62, h * 0.13); ctx.fill();
      }
    }

    // body
    ctx.fillStyle = m.dark;
    rr(ctx, -h, -h + s * 0.06, s, s, s * 0.3); ctx.fill();
    ctx.fillStyle = body;
    rr(ctx, -h, -h, s, s * 0.94, s * 0.3); ctx.fill();
    // shine
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    rr(ctx, -h * 0.7, -h * 0.82, s * 0.32, s * 0.12, s * 0.06); ctx.fill();

    switch (id) {
      case 0: // yellow hero: dark visor mask
        ctx.fillStyle = '#1a1030';
        rr(ctx, -h * 0.92, -h * 0.42, s * 0.92, s * 0.36, s * 0.14); ctx.fill();
        eyes(ctx, s, lx, ly, blink, '#fff', '#1a1030', 0.22, -s * 0.03, s * 0.1);
        ctx.fillStyle = '#ff5a8a';
        ctx.beginPath(); ctx.arc(0, h * 0.42, s * 0.09, 0, Math.PI); ctx.fill();
        break;
      case 1: // ninja: face slit + headband ties
        ctx.fillStyle = '#ffd9b0';
        rr(ctx, -h * 0.8, -h * 0.35, s * 0.8, s * 0.3, s * 0.12); ctx.fill();
        ctx.fillStyle = '#ff3355';
        ctx.fillRect(-h, -h * 0.72, s, s * 0.12);
        var tie = Math.sin(t * 12) * s * 0.05;
        ctx.beginPath(); ctx.moveTo(h * 0.9, -h * 0.66); ctx.lineTo(h * 1.45, -h * 0.9 + tie); ctx.lineTo(h * 1.4, -h * 0.6 + tie); ctx.fill();
        eyes(ctx, s, lx, ly, blink, '#fff', '#111', 0.2, -s * 0.05, s * 0.09);
        break;
      case 2: // frog
        for (k = -1; k <= 1; k += 2) {
          ctx.fillStyle = m.body; ctx.beginPath(); ctx.arc(k * h * 0.45, -h * 0.8, s * 0.2, 0, Math.PI * 2); ctx.fill();
        }
        eyes(ctx, s, lx, ly, blink, '#fff', '#102a08', 0.225, -h * 0.8, s * 0.14);
        ctx.strokeStyle = '#1f6b14'; ctx.lineWidth = s * 0.05;
        ctx.beginPath(); ctx.arc(0, h * 0.05, s * 0.28, 0.2, Math.PI - 0.2); ctx.stroke();
        ctx.fillStyle = 'rgba(255,120,150,0.6)';
        ctx.beginPath(); ctx.arc(-h * 0.62, h * 0.2, s * 0.08, 0, Math.PI * 2); ctx.arc(h * 0.62, h * 0.2, s * 0.08, 0, Math.PI * 2); ctx.fill();
        break;
      case 3: // cat
        eyes(ctx, s, lx, ly, blink, '#fff', '#1a1030', 0.22, -s * 0.06, s * 0.12);
        ctx.fillStyle = '#ff5a8a';
        ctx.beginPath(); ctx.moveTo(-s * 0.06, h * 0.18); ctx.lineTo(s * 0.06, h * 0.18); ctx.lineTo(0, h * 0.28); ctx.fill();
        ctx.strokeStyle = '#6b3000'; ctx.lineWidth = s * 0.025;
        ctx.beginPath();
        ctx.moveTo(-h * 0.35, h * 0.25); ctx.lineTo(-h * 0.95, h * 0.15); ctx.moveTo(-h * 0.35, h * 0.33); ctx.lineTo(-h * 0.95, h * 0.4);
        ctx.moveTo(h * 0.35, h * 0.25); ctx.lineTo(h * 0.95, h * 0.15); ctx.moveTo(h * 0.35, h * 0.33); ctx.lineTo(h * 0.95, h * 0.4);
        ctx.stroke();
        break;
      case 4: // robot screen face
        ctx.fillStyle = '#1b2440';
        rr(ctx, -h * 0.78, -h * 0.55, s * 0.78, s * 0.6, s * 0.1); ctx.fill();
        ctx.fillStyle = '#34f5ff';
        if (blink) { ctx.fillRect(-h * 0.5, -h * 0.2, s * 0.18, s * 0.04); ctx.fillRect(h * 0.14, -h * 0.2, s * 0.18, s * 0.04); }
        else {
          ctx.fillRect(-h * 0.52 + lx * s * 0.05, -h * 0.35 + ly * s * 0.04, s * 0.18, s * 0.18);
          ctx.fillRect(h * 0.16 + lx * s * 0.05, -h * 0.35 + ly * s * 0.04, s * 0.18, s * 0.18);
        }
        ctx.fillRect(-h * 0.3, h * 0.15, s * 0.3, s * 0.05);
        break;
      case 5: // penguin
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.ellipse(0, h * 0.12, h * 0.68, h * 0.78, 0, 0, Math.PI * 2); ctx.fill();
        eyes(ctx, s, lx, ly, blink, '#fff', '#111', 0.2, -s * 0.12, s * 0.1);
        ctx.fillStyle = '#ffae00';
        ctx.beginPath(); ctx.moveTo(-s * 0.1, h * 0.05); ctx.lineTo(s * 0.1, h * 0.05); ctx.lineTo(0, h * 0.28); ctx.fill();
        break;
      case 6: // alien: three eyes
        eyes(ctx, s, lx, ly, blink, '#fff', '#2a0040', 0.27, -s * 0.02, s * 0.09);
        ctx.save(); ctx.translate(0, -s * 0.2);
        eyes(ctx, s, lx, ly, blink, '#fff', '#2a0040', 0, 0, s * 0.11);
        ctx.restore();
        ctx.fillStyle = '#2a0040';
        ctx.beginPath(); ctx.ellipse(0, h * 0.4, s * 0.1, s * 0.06, 0, 0, Math.PI * 2); ctx.fill();
        break;
      case 7: // octopus
        eyes(ctx, s, lx, ly, blink, '#fff', '#3a0030', 0.22, -s * 0.08, s * 0.13);
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.beginPath(); ctx.arc(-h * 0.55, -h * 0.65, s * 0.05, 0, Math.PI * 2); ctx.arc(h * 0.5, -h * 0.72, s * 0.04, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#7a1050'; ctx.lineWidth = s * 0.04;
        ctx.beginPath(); ctx.arc(0, h * 0.15, s * 0.12, 0.3, Math.PI - 0.3); ctx.stroke();
        break;
      case 8: // dragon
        ctx.fillStyle = '#e6d0ff';
        ctx.beginPath(); ctx.ellipse(0, h * 0.35, h * 0.55, h * 0.35, 0, 0, Math.PI * 2); ctx.fill();
        eyes(ctx, s, lx, ly, blink, '#ffe600', '#2a0050', 0.22, -s * 0.12, s * 0.11);
        ctx.fillStyle = '#5a22b0';
        ctx.beginPath(); ctx.arc(-s * 0.08, h * 0.28, s * 0.03, 0, Math.PI * 2); ctx.arc(s * 0.08, h * 0.28, s * 0.03, 0, Math.PI * 2); ctx.fill();
        break;
      case 9: // watermelon slice face
        ctx.fillStyle = '#2f9e3a';
        rr(ctx, -h, h * 0.62, s, s * 0.14, s * 0.07); ctx.fill();
        ctx.fillStyle = '#b7f5a6'; ctx.fillRect(-h * 0.92, h * 0.58, s * 0.92, s * 0.04);
        ctx.fillStyle = '#2a0a0a';
        var seeds = [[-0.55, 0.3], [0.5, 0.25], [-0.1, 0.45], [0.7, -0.6], [-0.75, -0.55]];
        seeds.forEach(function (q) { ctx.beginPath(); ctx.ellipse(q[0] * h, q[1] * h, s * 0.03, s * 0.05, 0.3, 0, Math.PI * 2); ctx.fill(); });
        eyes(ctx, s, lx, ly, blink, '#fff', '#2a0a0a', 0.2, -s * 0.1, s * 0.11);
        break;
      case 10: // king: crown + mustache
        eyes(ctx, s, lx, ly, blink, '#fff', '#3a2000', 0.21, -s * 0.06, s * 0.11);
        ctx.fillStyle = '#6b3a00';
        ctx.beginPath(); ctx.ellipse(-s * 0.1, h * 0.25, s * 0.12, s * 0.05, 0.3, 0, Math.PI * 2); ctx.ellipse(s * 0.1, h * 0.25, s * 0.12, s * 0.05, -0.3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffd400';
        ctx.beginPath();
        ctx.moveTo(-h * 0.7, -h * 0.85); ctx.lineTo(-h * 0.75, -h * 1.4); ctx.lineTo(-h * 0.35, -h * 1.1); ctx.lineTo(0, -h * 1.5);
        ctx.lineTo(h * 0.35, -h * 1.1); ctx.lineTo(h * 0.75, -h * 1.4); ctx.lineTo(h * 0.7, -h * 0.85); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ff3f6c'; ctx.beginPath(); ctx.arc(0, -h * 1.05, s * 0.06, 0, Math.PI * 2); ctx.fill();
        break;
      case 11: // rainbow: star mask
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        rr(ctx, -h * 0.9, -h * 0.42, s * 0.9, s * 0.34, s * 0.14); ctx.fill();
        eyes(ctx, s, lx, ly, blink, '#fff', '#401060', 0.22, -s * 0.04, s * 0.1);
        ctx.strokeStyle = '#401060'; ctx.lineWidth = s * 0.045;
        ctx.beginPath(); ctx.arc(0, h * 0.25, s * 0.13, 0.2, Math.PI - 0.2); ctx.stroke();
        break;
      default:
        eyes(ctx, s, lx, ly, blink, '#fff', '#111');
    }
    ctx.restore();
  }

  window.MDMasks = { list: list, draw: draw, rr: rr };
})();
