/*
 * Munch Rope - all the art, drawn in code (no images).
 * window.MunchArt = { CANDIES, HATS, drawMunch, drawCandy, drawHat, starPath,
 *                     makeBackground, drawStand }
 */
(function () {
  'use strict';
  var TAU = Math.PI * 2;

  var CANDIES = [
    { name: 'Cherry Swirl', need: 0, a: '#ff3b5c', b: '#ffffff', wrap: '#ff8fa3', edge: '#a3122f' },
    { name: 'Lemon Zing', need: 4, a: '#ffc400', b: '#fff6c2', wrap: '#ffe066', edge: '#a37400' },
    { name: 'Blue Razz', need: 10, a: '#1f7bff', b: '#c4e2ff', wrap: '#79b8ff', edge: '#0b3f91' },
    { name: 'Grape Pop', need: 18, a: '#9b4dff', b: '#ecdcff', wrap: '#c99bff', edge: '#4c1a99' },
    { name: 'Mint Chill', need: 28, a: '#13c28a', b: '#e2fff4', wrap: '#86efc9', edge: '#06714f' },
    { name: 'Choco Chip', need: 40, a: '#7a4a2a', b: '#b77a4c', wrap: '#e8b98a', edge: '#3d2210', chips: true },
    { name: 'Rainbow', need: 54, rainbow: true, a: '#ff3b5c', b: '#ffffff', wrap: '#ffffff', edge: '#5b3b8c' },
    { name: 'Golden', need: 72, a: '#ffb800', b: '#fff1b0', wrap: '#ffe27a', edge: '#8a5a00', gold: true }
  ];
  var RAINBOW = ['#ff3b5c', '#ff9f1a', '#ffd21f', '#2fd35a', '#1fa8ff', '#9b5cff'];

  var HATS = [
    { name: 'No Hat', need: 0, id: 'none' },
    { name: 'Pink Bow', need: 6, id: 'bow' },
    { name: 'Party Hat', need: 14, id: 'party' },
    { name: 'Ball Cap', need: 24, id: 'cap' },
    { name: 'Flower', need: 34, id: 'flower' },
    { name: 'Top Hat', need: 48, id: 'tophat' },
    { name: 'Crown', need: 64, id: 'crown' }
  ];

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function starPath(ctx, x, y, R, r, rot) {
    ctx.beginPath();
    for (var i = 0; i < 10; i++) {
      var a = rot - Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r : R;
      var px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
  }

  /* ------------------------------------------------------------ candy */
  function drawCandy(ctx, x, y, rot, skinIdx, scale, t) {
    var sk = CANDIES[skinIdx] || CANDIES[0];
    var r = 22 * (scale || 1);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    // wrapper twists
    for (var s = -1; s <= 1; s += 2) {
      ctx.beginPath();
      ctx.moveTo(s * r * 0.7, -r * 0.28);
      ctx.quadraticCurveTo(s * r * 1.25, -r * 0.1, s * r * 1.72, -r * 0.62);
      ctx.quadraticCurveTo(s * r * 1.58, 0, s * r * 1.72, r * 0.62);
      ctx.quadraticCurveTo(s * r * 1.25, r * 0.1, s * r * 0.7, r * 0.28);
      ctx.closePath();
      ctx.fillStyle = sk.wrap; ctx.fill();
      ctx.lineWidth = 2.5 * (scale || 1); ctx.strokeStyle = sk.edge; ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(s * r * 1.15, -r * 0.2); ctx.lineTo(s * r * 1.5, -r * 0.42);
      ctx.moveTo(s * r * 1.15, r * 0.2); ctx.lineTo(s * r * 1.5, r * 0.42);
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2 * (scale || 1); ctx.stroke();
    }
    // body
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU);
    ctx.fillStyle = sk.b; ctx.fill();
    ctx.save(); ctx.clip();
    var n = 8;
    for (var i = 0; i < n; i++) {
      if (sk.rainbow) ctx.fillStyle = RAINBOW[i % RAINBOW.length];
      else if (i % 2) continue; else ctx.fillStyle = sk.a;
      var a0 = i * TAU / n, a1 = (i + 1) * TAU / n;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(Math.cos(a0 + 0.6) * r * 0.7, Math.sin(a0 + 0.6) * r * 0.7, Math.cos(a0) * r * 1.2, Math.sin(a0) * r * 1.2);
      ctx.lineTo(Math.cos(a1) * r * 1.2, Math.sin(a1) * r * 1.2);
      ctx.quadraticCurveTo(Math.cos(a1 + 0.6) * r * 0.7, Math.sin(a1 + 0.6) * r * 0.7, 0, 0);
      ctx.fill();
    }
    if (sk.chips) {
      ctx.fillStyle = '#3b1f0d';
      for (i = 0; i < 7; i++) { var ca = i * 2.4, cr = r * (0.25 + (i % 3) * 0.22); ctx.beginPath(); ctx.arc(Math.cos(ca) * cr, Math.sin(ca) * cr, r * 0.12, 0, TAU); ctx.fill(); }
    }
    ctx.restore();
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU);
    ctx.lineWidth = 3 * (scale || 1); ctx.strokeStyle = sk.edge; ctx.stroke();
    ctx.restore();
    // highlight (not rotated)
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath(); ctx.ellipse(-r * 0.38, -r * 0.42, r * 0.3, r * 0.17, -0.6, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(r * 0.05, -r * 0.62, r * 0.07, 0, TAU); ctx.fill();
    if (sk.gold && t != null) {
      var tw = (Math.sin(t * 5) + 1) / 2;
      ctx.fillStyle = 'rgba(255,255,255,' + (0.4 + tw * 0.6) + ')';
      starPath(ctx, r * 0.55, -r * 0.5, r * 0.32 * (0.6 + tw * 0.5), r * 0.08, 0); ctx.fill();
    }
    ctx.restore();
  }

  /* ------------------------------------------------------------ hats */
  function drawHat(ctx, id, t) {
    // drawn at the top of Munch's head, origin = head top centre, pointing up
    t = t || 0;
    ctx.lineWidth = 3; ctx.strokeStyle = '#2a1a3a';
    if (id === 'bow') {
      ctx.save(); ctx.translate(26, 6); ctx.rotate(0.3);
      ctx.fillStyle = '#ff5fa2';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-26, -24, -24, 8); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(26, -24, 24, 8); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -1, 7, 0, TAU); ctx.fillStyle = '#ff2f86'; ctx.fill(); ctx.stroke();
      ctx.restore();
    } else if (id === 'party') {
      ctx.save(); ctx.translate(-14, 6); ctx.rotate(-0.22);
      ctx.beginPath(); ctx.moveTo(-22, 0); ctx.lineTo(0, -60); ctx.lineTo(22, 0); ctx.closePath();
      ctx.fillStyle = '#3ec7ff'; ctx.fill();
      ctx.save(); ctx.clip();
      ctx.fillStyle = '#ffd21f';
      for (var i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(-6 + (i % 2) * 12, -8 - i * 13, 5, 0, TAU); ctx.fill(); }
      ctx.restore();
      ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -62, 8, 0, TAU); ctx.fillStyle = '#ff4fa3'; ctx.fill(); ctx.stroke();
      ctx.restore();
    } else if (id === 'cap') {
      ctx.fillStyle = '#ff4b4b';
      ctx.beginPath(); ctx.arc(0, 4, 36, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(34, 2, 26, 8, 0.05, 0, TAU); ctx.fillStyle = '#d42f2f'; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -32, 5, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = '700 20px Fredoka, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('M', 0, -6);
    } else if (id === 'flower') {
      ctx.save(); ctx.translate(-30, 10);
      ctx.fillStyle = '#fff';
      for (i = 0; i < 6; i++) { var a = i * TAU / 6 + t * 0.5; ctx.beginPath(); ctx.ellipse(Math.cos(a) * 12, Math.sin(a) * 12, 10, 7, a, 0, TAU); ctx.fill(); ctx.stroke(); }
      ctx.beginPath(); ctx.arc(0, 0, 8, 0, TAU); ctx.fillStyle = '#ffd21f'; ctx.fill(); ctx.stroke();
      ctx.restore();
    } else if (id === 'tophat') {
      ctx.fillStyle = '#2d2a4a';
      ctx.beginPath(); ctx.ellipse(0, 2, 40, 9, 0, 0, TAU); ctx.fill(); ctx.stroke();
      rr(ctx, -24, -46, 48, 48, 6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ff4fa3'; ctx.fillRect(-23, -12, 46, 10);
    } else if (id === 'crown') {
      ctx.beginPath();
      ctx.moveTo(-30, 4); ctx.lineTo(-34, -30); ctx.lineTo(-16, -14); ctx.lineTo(0, -38); ctx.lineTo(16, -14); ctx.lineTo(34, -30); ctx.lineTo(30, 4); ctx.closePath();
      var g = ctx.createLinearGradient(0, -38, 0, 4); g.addColorStop(0, '#fff3a0'); g.addColorStop(1, '#ffb800');
      ctx.fillStyle = g; ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ff3b6b'; ctx.beginPath(); ctx.arc(0, -8, 6, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#29b6ff'; ctx.beginPath(); ctx.moveTo(-18 + 4, -6); ctx.arc(-18, -6, 4, 0, TAU); ctx.moveTo(18 + 4, -6); ctx.arc(18, -6, 4, 0, TAU); ctx.fill();
    }
  }

  /* ------------------------------------------------------------ Munch */
  // m: { t, blink, mouth, mood: 'idle'|'happy'|'sad'|'eat', lookX, lookY, sq, ant, chew, hat, tear }
  function drawMunch(ctx, m, x, y, scale) {
    var R = 56;
    ctx.save();
    ctx.translate(x, y + R * scale);
    ctx.scale(scale, scale);
    var breathe = Math.sin(m.t * 2.4) * 0.025;
    var sq = m.sq + breathe;
    var sx = 1 + sq * 0.8, sy = 1 - sq;
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath(); ctx.ellipse(0, 2, R * 0.95 * sx, 9, 0, 0, TAU); ctx.fill();
    // feet
    ctx.fillStyle = '#3f9a22'; ctx.strokeStyle = '#1f5510'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.ellipse(-26 * sx, -4, 17, 10, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(26 * sx, -4, 17, 10, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.translate(0, -R * sy);
    ctx.scale(sx, sy);
    // antenna (behind head)
    var aa = m.ant || 0;
    var ax = Math.sin(aa) * 44, ay = -R - Math.cos(aa) * 40 + 4;
    ctx.strokeStyle = '#1f5510'; ctx.lineWidth = 9; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, -R + 8); ctx.quadraticCurveTo(ax * 0.2, -R - 18, ax, ay); ctx.stroke();
    ctx.strokeStyle = '#5cc233'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(0, -R + 8); ctx.quadraticCurveTo(ax * 0.2, -R - 18, ax, ay); ctx.stroke();
    ctx.beginPath(); ctx.arc(ax, ay, 11, 0, TAU);
    ctx.fillStyle = m.mood === 'sad' ? '#c9b25a' : '#ffe14d'; ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = '#1f5510'; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.arc(ax - 3, ay - 4, 3.5, 0, TAU); ctx.fill();
    // body
    var g = ctx.createRadialGradient(-18, -22, 8, 0, 0, R + 4);
    g.addColorStop(0, '#b6f07a'); g.addColorStop(0.55, '#6fd13f'); g.addColorStop(1, '#46a824');
    ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU);
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = '#1f5510'; ctx.stroke();
    // belly + spots
    ctx.fillStyle = 'rgba(230,255,190,0.55)';
    ctx.beginPath(); ctx.ellipse(0, 26, 34, 22, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(40,120,20,0.35)';
    ctx.beginPath(); ctx.moveTo(38 + 6, -24); ctx.arc(38, -24, 6, 0, TAU); ctx.moveTo(28 + 4, -38); ctx.arc(28, -38, 4, 0, TAU); ctx.moveTo(-40 + 4.5, 10); ctx.arc(-40, 10, 4.5, 0, TAU); ctx.fill();
    // cheeks
    var blush = m.mood === 'happy' || m.mood === 'eat' ? 0.75 : 0.45;
    ctx.fillStyle = 'rgba(255,110,150,' + blush + ')';
    ctx.beginPath(); ctx.moveTo(-37 + 9, 10); ctx.ellipse(-37, 10, 9, 6, 0, 0, TAU); ctx.moveTo(37 + 9, 10); ctx.ellipse(37, 10, 9, 6, 0, 0, TAU); ctx.fill();

    // eyes
    var ey = -14, ex = 21;
    if (m.mood === 'happy' || m.mood === 'eat') {
      ctx.strokeStyle = '#1b1030'; ctx.lineWidth = 6; ctx.lineCap = 'round';
      for (var s = -1; s <= 1; s += 2) { ctx.beginPath(); ctx.arc(s * ex, ey + 6, 11, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
    } else {
      var big = m.excite ? 1 + m.excite * 0.14 : 1;
      for (s = -1; s <= 1; s += 2) {
        ctx.save(); ctx.translate(s * ex, ey); ctx.scale(big, big);
        ctx.beginPath(); ctx.ellipse(0, 0, 16, 19, 0, 0, TAU);
        ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = '#1f5510'; ctx.stroke();
        ctx.save(); ctx.beginPath(); ctx.ellipse(0, 0, 14, 17, 0, 0, TAU); ctx.clip();
        var px = (m.lookX || 0) * 6.5, py = (m.lookY || 0) * 7.5;
        if (m.mood === 'sad') py = 6;
        ctx.fillStyle = '#1b1030'; ctx.beginPath(); ctx.arc(px, py, 9, 0, TAU); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(px - 3 + 3.4, py - 4); ctx.arc(px - 3, py - 4, 3.4, 0, TAU); ctx.moveTo(px + 3 + 1.6, py + 3); ctx.arc(px + 3, py + 3, 1.6, 0, TAU); ctx.fill();
        // eyelid (blink / sad droop)
        var lid = Math.max(m.blink || 0, m.mood === 'sad' ? 0.42 : 0);
        if (lid > 0) {
          ctx.fillStyle = '#5cc233';
          ctx.fillRect(-20, -22, 40, 40 * lid);
          ctx.strokeStyle = '#1f5510'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(-18, -22 + 40 * lid); ctx.lineTo(18, -22 + 40 * lid); ctx.stroke();
        }
        ctx.restore();
        ctx.restore();
      }
      if (m.mood === 'sad') {
        ctx.strokeStyle = '#1f5510'; ctx.lineWidth = 5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-34, -38); ctx.lineTo(-12, -44); ctx.moveTo(34, -38); ctx.lineTo(12, -44); ctx.stroke();
      }
    }

    // mouth
    var mo = m.mouth || 0;
    ctx.lineCap = 'round';
    if (m.mood === 'sad' && mo < 0.1) {
      ctx.strokeStyle = '#1b1030'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(0, 36, 14, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    } else if (mo < 0.06) {
      ctx.strokeStyle = '#1b1030'; ctx.lineWidth = 5;
      if (m.chew) {
        // chewing: wavy closed mouth with bulging cheeks
        ctx.beginPath(); ctx.moveTo(-16, 20);
        ctx.quadraticCurveTo(-8, 20 + Math.sin(m.t * 30) * 4, 0, 20);
        ctx.quadraticCurveTo(8, 20 - Math.sin(m.t * 30) * 4, 16, 20); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.arc(0, 12, 16, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
      }
    } else {
      var mw = 16 + 12 * mo, mh = 5 + 24 * mo;
      ctx.beginPath(); ctx.ellipse(0, 20 + mh * 0.2, mw, mh, 0, 0, TAU);
      ctx.fillStyle = '#6a0f2a'; ctx.fill();
      ctx.save(); ctx.clip();
      ctx.fillStyle = '#ff6f91'; ctx.beginPath(); ctx.ellipse(0, 20 + mh * 1.0, mw * 0.7, mh * 0.55, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff';
      var ty = 20 + mh * 0.2 - mh;
      ctx.fillRect(-mw * 0.5, ty - 2, 8, 9); ctx.fillRect(mw * 0.5 - 8, ty - 2, 8, 9);
      ctx.restore();
      ctx.lineWidth = 4; ctx.strokeStyle = '#1b1030';
      ctx.beginPath(); ctx.ellipse(0, 20 + mh * 0.2, mw, mh, 0, 0, TAU); ctx.stroke();
    }
    // tear
    if (m.mood === 'sad' && m.tear > 0) {
      var tyy = -2 + m.tear * 40;
      ctx.fillStyle = 'rgba(120,200,255,' + Math.max(0, 1 - m.tear) + ')';
      ctx.beginPath(); ctx.moveTo(30, tyy - 10); ctx.quadraticCurveTo(38, tyy + 2, 30, tyy + 5); ctx.quadraticCurveTo(22, tyy + 2, 30, tyy - 10); ctx.fill();
    }
    // hat
    if (m.hat && m.hat !== 'none') { ctx.save(); ctx.translate(0, -R + 6); drawHat(ctx, m.hat, m.t); ctx.restore(); }
    ctx.restore();
  }

  // Munch's little stand. theme: 'cardboard' | 'gift'
  function drawStand(ctx, x, y, theme) {
    var top = y + 56, w = 132, h = 40;
    ctx.save();
    if (theme === 'gift') {
      rr(ctx, x - w / 2, top, w, h, 8); ctx.fillStyle = '#3ec7ff'; ctx.fill();
      ctx.fillStyle = '#ffd21f'; ctx.fillRect(x - 10, top, 20, h);
      ctx.fillRect(x - w / 2, top + h / 2 - 7, w, 14);
      rr(ctx, x - w / 2, top, w, h, 8); ctx.lineWidth = 4; ctx.strokeStyle = '#1b3f73'; ctx.stroke();
    } else {
      rr(ctx, x - w / 2, top, w, h, 6); ctx.fillStyle = '#c98d4b'; ctx.fill();
      ctx.fillStyle = 'rgba(255,240,200,0.55)'; ctx.fillRect(x - 12, top, 24, h);
      ctx.strokeStyle = 'rgba(90,50,10,0.35)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x - w / 2 + 6, top + h * 0.5); ctx.lineTo(x - 18, top + h * 0.5); ctx.stroke();
      rr(ctx, x - w / 2, top, w, h, 6); ctx.lineWidth = 4; ctx.strokeStyle = '#6b3f14'; ctx.stroke();
    }
    ctx.restore();
  }

  /* ------------------------------------------------------ backgrounds */
  function seeded(seed) { return function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }

  function makeBackground(theme, W, H, pxScale) {
    var cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(W * pxScale)); cv.height = Math.max(1, Math.round(H * pxScale));
    var ctx = cv.getContext('2d');
    ctx.scale(pxScale, pxScale);
    var rnd = seeded(theme === 'gift' ? 99 : 7), i, x, y;
    if (theme === 'gift') {
      var g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#ff8fc4'); g.addColorStop(1, '#f25ca8');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      // diagonal stripes
      ctx.save(); ctx.globalAlpha = 0.13; ctx.fillStyle = '#fff';
      for (x = -H; x < W; x += 90) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 40, 0); ctx.lineTo(x + 40 + H, H); ctx.lineTo(x + H, H); ctx.fill(); }
      ctx.restore();
      // polka dots
      for (y = 30; y < H; y += 80) for (x = ((y / 80) % 2) * 50 + 20; x < W; x += 100) {
        ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.beginPath(); ctx.arc(x, y, 9, 0, TAU); ctx.fill();
      }
      // little confetti stars
      for (i = 0; i < 26; i++) {
        ctx.fillStyle = ['rgba(255,230,90,0.45)', 'rgba(120,220,255,0.45)', 'rgba(255,255,255,0.4)'][i % 3];
        starPath(ctx, rnd() * W, rnd() * H, 9, 4, rnd() * 3); ctx.fill();
      }
      // ribbon bands
      ctx.fillStyle = 'rgba(255,214,60,0.28)';
      ctx.fillRect(W * 0.18, 0, 46, H);
      ctx.fillRect(0, H * 0.82, W, 40);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(W * 0.18 + 8, 0, 6, H); ctx.fillRect(0, H * 0.82 + 7, W, 5);
    } else {
      var g2 = ctx.createLinearGradient(0, 0, 0, H);
      g2.addColorStop(0, '#e9bd82'); g2.addColorStop(1, '#d59d5c');
      ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H);
      // corrugation
      for (x = 0; x < W; x += 14) { ctx.fillStyle = 'rgba(120,70,20,0.045)'; ctx.fillRect(x, 0, 7, H); }
      // fibres
      for (i = 0; i < 260; i++) {
        ctx.fillStyle = rnd() < 0.5 ? 'rgba(120,70,20,0.10)' : 'rgba(255,240,210,0.12)';
        ctx.fillRect(rnd() * W, rnd() * H, 2 + rnd() * 6, 1.5);
      }
      // box folds
      ctx.strokeStyle = 'rgba(110,60,15,0.18)'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(0, 60); ctx.lineTo(W, 60); ctx.moveTo(0, H - 50); ctx.lineTo(W, H - 50); ctx.stroke();
      ctx.fillStyle = 'rgba(110,60,15,0.08)'; ctx.fillRect(0, 0, W, 60); ctx.fillRect(0, H - 50, W, 50);
      // tape
      ctx.save();
      ctx.fillStyle = 'rgba(255,248,215,0.5)';
      ctx.translate(W / 2, 0); ctx.fillRect(-60, 0, 120, 60);
      ctx.restore();
      ctx.save(); ctx.translate(90, H - 110); ctx.rotate(-0.6); ctx.fillStyle = 'rgba(255,248,215,0.45)'; ctx.fillRect(-70, -18, 140, 36); ctx.restore();
      ctx.save(); ctx.translate(W - 90, 150); ctx.rotate(0.55); ctx.fillStyle = 'rgba(255,248,215,0.45)'; ctx.fillRect(-70, -18, 140, 36); ctx.restore();
      // marker doodles
      ctx.strokeStyle = 'rgba(80,45,10,0.22)'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      // up arrows
      for (i = 0; i < 2; i++) {
        var bx = i ? W - 140 : 140, by = H - 190;
        ctx.beginPath(); ctx.moveTo(bx - 14, by + 40); ctx.lineTo(bx - 14, by + 10); ctx.lineTo(bx - 28, by + 10); ctx.lineTo(bx, by - 18); ctx.lineTo(bx + 28, by + 10); ctx.lineTo(bx + 14, by + 10); ctx.lineTo(bx + 14, by + 40); ctx.closePath(); ctx.stroke();
      }
      // smiley, heart, star doodles
      ctx.beginPath(); ctx.arc(W - 210, H - 300, 26, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(W - 210, H - 296, 14, 0.2, Math.PI - 0.2); ctx.stroke();
      ctx.fillStyle = 'rgba(80,45,10,0.22)'; ctx.beginPath(); ctx.moveTo(W - 219 + 3, H - 308); ctx.arc(W - 219, H - 308, 3, 0, TAU); ctx.moveTo(W - 201 + 3, H - 308); ctx.arc(W - 201, H - 308, 3, 0, TAU); ctx.fill();
      ctx.beginPath(); var hx = 230, hy = 250; ctx.moveTo(hx, hy + 18); ctx.bezierCurveTo(hx - 30, hy - 4, hx - 12, hy - 26, hx, hy - 8); ctx.bezierCurveTo(hx + 12, hy - 26, hx + 30, hy - 4, hx, hy + 18); ctx.stroke();
      starPath(ctx, W - 330, 110, 20, 8, 0.2); ctx.stroke();
      ctx.font = '700 26px Fredoka, sans-serif'; ctx.fillStyle = 'rgba(80,45,10,0.2)'; ctx.textAlign = 'center';
      ctx.fillText('THIS SIDE UP', 140, H - 118); ctx.fillText('YUMMY INSIDE', W - 140, H - 118);
    }
    // soft vignette
    var v = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 1.05);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(60,20,0,0.28)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    return cv;
  }

  window.MunchArt = {
    CANDIES: CANDIES, HATS: HATS, RAINBOW: RAINBOW,
    drawMunch: drawMunch, drawCandy: drawCandy, drawHat: drawHat, drawStand: drawStand,
    starPath: starPath, roundRect: rr, makeBackground: makeBackground
  };
})();
