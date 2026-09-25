/*
 * Sneaky Levels — all drawing (canvas, no images). Player, skins, world,
 * traps, HUD pieces. Everything is drawn in logical 1280x720 coordinates.
 */
(function () {
  'use strict';
  var E = window.TrollEngine, T = E.T, PH = E.PH;
  var Art = {};
  var FONT = 'Fredoka, "Segoe UI", Tahoma, sans-serif';
  Art.FONT = FONT;

  Art.SKINS = [
    { id: 'blob', name: 'بلوب', stars: 0, body: '#ffffff' },
    { id: 'party', name: 'المحتفل', stars: 5, body: '#ffffff' },
    { id: 'shades', name: 'الرائع', stars: 12, body: '#ffffff' },
    { id: 'cat', name: 'القطّ', stars: 20, body: '#ffe7c2' },
    { id: 'ninja', name: 'النينجا', stars: 30, body: '#3b3b4f' },
    { id: 'crown', name: 'الملك', stars: 40, body: '#ffffff' },
    { id: 'alien', name: 'الفضائي', stars: 50, body: '#8dff8a' },
    { id: 'gold', name: 'الذهبي', stars: 60, body: '#ffd23f' },
    { id: 'rainbow', name: 'قوس قزح', stars: 72, body: '#ff6b6b' }
  ];
  Art.skinById = function (id) {
    for (var i = 0; i < Art.SKINS.length; i++) if (Art.SKINS[i].id === id) return Art.SKINS[i];
    return Art.SKINS[0];
  };

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }
  Art.rr = rr;

  Art.star = function (ctx, x, y, r, fill, stroke, lw) {
    ctx.beginPath();
    for (var i = 0; i < 10; i++) {
      var a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r * 0.48 : r;
      ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
    }
    ctx.closePath();
    if (stroke) { ctx.lineWidth = lw || 3; ctx.strokeStyle = stroke; ctx.lineJoin = 'round'; ctx.stroke(); }
    ctx.fillStyle = fill; ctx.fill();
  };

  /* --------------------------------------------------------- player */
  // o: { sx, sy, face, skin, t, flip, ink, run, air, blink, look, scale, alpha, dizzy }
  Art.drawPlayer = function (ctx, x, y, o) {
    var skin = Art.skinById(o.skin || 'blob');
    var ink = o.ink || '#1c1226';
    ctx.save();
    ctx.translate(x, y);
    if (o.flip) ctx.scale(1, -1);
    var sc = o.scale == null ? 1 : o.scale;
    ctx.scale((o.sx || 1) * sc, (o.sy || 1) * sc);
    if (o.alpha != null) ctx.globalAlpha = o.alpha;
    var face = o.face || 1, t = o.t || 0;
    var w = 30, h = 36;
    // feet
    var ph = o.run ? Math.sin(t * 22) : 0;
    ctx.fillStyle = ink;
    if (o.air) {
      ctx.beginPath(); ctx.ellipse(-7, -1, 5, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(7, -3, 5, 4, 0, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.beginPath(); ctx.ellipse(-7 + ph * 3, -2 - Math.max(0, ph) * 3, 6, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(7 - ph * 3, -2 - Math.max(0, -ph) * 3, 6, 4, 0, 0, Math.PI * 2); ctx.fill();
    }
    // ninja scarf tails (behind)
    if (skin.id === 'ninja') {
      ctx.fillStyle = '#ff3b5c';
      var wav = Math.sin(t * 12) * 4;
      ctx.beginPath(); ctx.moveTo(-face * 12, -28); ctx.lineTo(-face * 30, -32 + wav); ctx.lineTo(-face * 28, -24 + wav); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-face * 12, -26); ctx.lineTo(-face * 26, -20 - wav); ctx.lineTo(-face * 22, -16 - wav); ctx.closePath(); ctx.fill();
    }
    // body
    var body = skin.body;
    if (skin.id === 'rainbow') body = 'hsl(' + ((t * 120) % 360) + ',95%,65%)';
    rr(ctx, -w / 2, -h - 2, w, h, 11);
    ctx.fillStyle = body; ctx.fill();
    ctx.lineWidth = 3.5; ctx.strokeStyle = ink; ctx.stroke();
    // shine
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    rr(ctx, -w / 2 + 5, -h + 3, 6, 10, 3); ctx.fill();
    if (skin.id === 'gold') {
      ctx.fillStyle = '#fff6c9';
      var sp = (t * 2) % 3;
      if (sp < 1) { Art.star(ctx, 9, -h + 4, 4 + sp * 2, '#ffffff'); }
    }
    // cheeks
    ctx.fillStyle = 'rgba(255,105,140,0.55)';
    ctx.beginPath(); ctx.ellipse(face * 3 - 9, -13, 4, 2.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(face * 3 + 9, -13, 4, 2.6, 0, 0, Math.PI * 2); ctx.fill();
    // eyes
    var ex = face * 4, ey = -22 + (o.look || 0) * 2;
    var eyeInk = skin.id === 'ninja' ? '#ffffff' : ink;
    if (o.dizzy) {
      ctx.strokeStyle = eyeInk; ctx.lineWidth = 2.5;
      [-6, 6].forEach(function (dx) {
        ctx.beginPath();
        for (var a = 0; a < 9; a++) { var ang = a * 0.9 + t * 10, rad = a * 0.55; ctx.lineTo(ex + dx + Math.cos(ang) * rad, ey + Math.sin(ang) * rad); }
        ctx.stroke();
      });
    } else if (skin.id === 'shades') {
      ctx.fillStyle = ink;
      rr(ctx, ex - 13, ey - 5, 26, 9, 4); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(ex - 9, ey - 3, 5, 2);
    } else {
      var bl = o.blink ? 0.15 : 1;
      ctx.fillStyle = eyeInk;
      ctx.beginPath(); ctx.ellipse(ex - 6, ey, 3.4, 5 * bl, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(ex + 6, ey, 3.4, 5 * bl, 0, 0, Math.PI * 2); ctx.fill();
      if (bl === 1) {
        ctx.fillStyle = skin.id === 'ninja' ? ink : '#ffffff';
        ctx.fillRect(ex - 6 + face, ey - 3, 1.8, 1.8); ctx.fillRect(ex + 6 + face, ey - 3, 1.8, 1.8);
      }
    }
    // mouth
    ctx.strokeStyle = eyeInk; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    ctx.beginPath();
    if (o.air || o.dizzy) { ctx.ellipse(ex, -11, 2.5, 3, 0, 0, Math.PI * 2); ctx.stroke(); }
    else { ctx.arc(ex, -13, 4, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke(); }
    // accessories
    drawAccessory(ctx, skin.id, face, t, ink, h);
    ctx.restore();
  };

  function drawAccessory(ctx, id, face, t, ink, h) {
    var top = -h - 2;
    ctx.lineWidth = 3; ctx.strokeStyle = ink; ctx.lineJoin = 'round';
    if (id === 'party') {
      ctx.save(); ctx.translate(2, top + 2); ctx.rotate(0.18 * face);
      ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(9, 0); ctx.lineTo(0, -22); ctx.closePath();
      ctx.fillStyle = '#ff4d6d'; ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath(); ctx.moveTo(-5, -7); ctx.lineTo(5, -7); ctx.lineTo(3.4, -12); ctx.lineTo(-3.4, -12); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.arc(0, -23, 4, 0, Math.PI * 2); ctx.fillStyle = '#3fe0c5'; ctx.fill(); ctx.stroke();
      ctx.restore();
    } else if (id === 'cat') {
      [-1, 1].forEach(function (s) {
        ctx.beginPath(); ctx.moveTo(s * 13, top + 4); ctx.lineTo(s * 12, top - 10); ctx.lineTo(s * 3, top + 1); ctx.closePath();
        ctx.fillStyle = '#ffe7c2'; ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(s * 11, top + 2); ctx.lineTo(s * 11, top - 5); ctx.lineTo(s * 6, top + 1); ctx.closePath();
        ctx.fillStyle = '#ff8fb1'; ctx.fill();
      });
      ctx.strokeStyle = ink; ctx.lineWidth = 1.5;
      [-1, 1].forEach(function (s) {
        ctx.beginPath(); ctx.moveTo(face * 4 + s * 8, -12); ctx.lineTo(face * 4 + s * 18, -14); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(face * 4 + s * 8, -10); ctx.lineTo(face * 4 + s * 18, -9); ctx.stroke();
      });
    } else if (id === 'ninja') {
      ctx.fillStyle = '#ff3b5c';
      ctx.fillRect(-15, -31, 30, 6);
    } else if (id === 'crown') {
      ctx.beginPath();
      ctx.moveTo(-11, top + 3); ctx.lineTo(-12, top - 11); ctx.lineTo(-5, top - 4); ctx.lineTo(0, top - 14);
      ctx.lineTo(5, top - 4); ctx.lineTo(12, top - 11); ctx.lineTo(11, top + 3); ctx.closePath();
      ctx.fillStyle = '#ffd23f'; ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ff4d6d'; ctx.beginPath(); ctx.arc(0, top - 2, 2.6, 0, Math.PI * 2); ctx.fill();
    } else if (id === 'alien') {
      [-1, 1].forEach(function (s) {
        ctx.beginPath(); ctx.moveTo(s * 6, top + 1); ctx.lineTo(s * 10, top - 12 + Math.sin(t * 6 + s) * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(s * 10, top - 14 + Math.sin(t * 6 + s) * 2, 4, 0, Math.PI * 2); ctx.fillStyle = '#ff5ca8'; ctx.fill(); ctx.stroke();
      });
    } else if (id === 'gold') {
      // tiny halo shine
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(0, top - 6, 10, 3, 0, 0, Math.PI * 2); ctx.stroke();
    } else if (id === 'rainbow') {
      ctx.fillStyle = '#ffffff';
      Art.star(ctx, face * -8, top - 2, 5, '#ffffff', ink, 2);
    }
  }

  /* --------------------------------------------------------- world */
  Art.buildStatic = function (w, pal, res) {
    var c = document.createElement('canvas');
    c.width = Math.round(E.W * res); c.height = Math.round(E.H * res);
    var g = c.getContext('2d');
    g.setTransform(res, 0, 0, res, 0, 0);
    g.fillStyle = pal.bg; g.fillRect(0, 0, E.W, E.H);
    // soft diagonal stripes
    g.save();
    g.fillStyle = pal.bg2; g.globalAlpha = 0.55;
    for (var k = -E.H; k < E.W + E.H; k += 120) {
      g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 50, 0); g.lineTo(k + 50 - E.H, E.H); g.lineTo(k - E.H, E.H); g.closePath(); g.fill();
    }
    g.restore();
    // solids
    var x, y;
    g.fillStyle = pal.ink;
    for (y = 0; y < E.ROWS; y++) for (x = 0; x < E.COLS; x++) if (w.grid[y * E.COLS + x]) g.fillRect(x * T, y * T, T + 0.5, T + 0.5);
    // top highlight on exposed edges
    g.fillStyle = pal.ink2;
    for (y = 0; y < E.ROWS; y++) for (x = 0; x < E.COLS; x++) {
      if (!w.grid[y * E.COLS + x]) continue;
      if (y > 0 && !w.grid[(y - 1) * E.COLS + x] && !w.owner[(y - 1) * E.COLS + x]) g.fillRect(x * T, y * T, T + 0.5, 5);
    }
    // subtle dotted texture inside big solid areas so they don't look flat
    g.fillStyle = pal.ink2; g.globalAlpha = 0.45;
    for (y = 1; y < E.ROWS; y++) for (x = 0; x < E.COLS; x++) {
      if (!w.grid[y * E.COLS + x] || !w.grid[(y - 1) * E.COLS + x]) continue;
      if ((x + y) % 2) continue;
      g.beginPath(); g.arc(x * T + 20, y * T + 20, 3, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
    return c;
  };

  function twinkle(ctx, x, y, r, a) {
    ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.quadraticCurveTo(x, y, x, y + r);
    ctx.quadraticCurveTo(x, y, x - r, y); ctx.quadraticCurveTo(x, y, x, y - r);
    ctx.fill(); ctx.restore();
  }

  Art.drawGroups = function (ctx, w, pal, t) {
    for (var i = 0; i < w.groups.length; i++) {
      var g = w.groups[i];
      if (!g.active) continue;
      if (g.invis && !g.revealed) {
        // hidden block: an occasional faint twinkle is the only clue ("trust the sparkle")
        for (var q = 0; q < g.tiles.length; q++) {
          var tq = g.tiles[q], ph = Math.sin(t * 2.3 + tq.x * 1.9 + tq.y * 0.7);
          if (ph < 0.55) continue;
          var ta = Math.pow((ph - 0.55) / 0.45, 2) * 0.85;
          twinkle(ctx, tq.x * T + g.ox + 20 + ((tq.x * 7) % 11) - 5, tq.y * T + g.oy + 12, 3 + ta * 6, ta);
        }
        continue;
      }
      var jx = 0, jy = 0;
      if (g.shakeT > 0) { jx = Math.sin(t * 90 + i) * 2.5; jy = Math.cos(t * 70 + i) * 1.5; }
      var tiles = g.tiles;
      ctx.fillStyle = pal.ink;
      for (var k = 0; k < tiles.length; k++) {
        var tx = tiles[k].x * T + g.ox + jx, ty = tiles[k].y * T + g.oy + jy;
        ctx.fillRect(tx - 0.5, ty - 0.5, T + 1, T + 1);
      }
      ctx.fillStyle = pal.ink2;
      for (k = 0; k < tiles.length; k++) {
        var tl = tiles[k];
        var above = (tl.y - 1) * E.COLS + tl.x;
        var sameAbove = w.owner[above] === g || (g.oy === 0 && g.ox === 0 && w.grid[above]);
        if (!sameAbove) ctx.fillRect(tl.x * T + g.ox + jx, tl.y * T + g.oy + jy, T + 0.5, 5);
      }
      if (g.invis) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.setLineDash([6, 5]); ctx.lineWidth = 2;
        for (k = 0; k < tiles.length; k++) ctx.strokeRect(tiles[k].x * T + g.ox + 3, tiles[k].y * T + g.oy + 3, T - 6, T - 6);
        ctx.restore();
      }
    }
  };

  Art.drawSpikes = function (ctx, w, pal) {
    ctx.fillStyle = pal.ink;
    for (var i = 0; i < w.spikes.length; i++) {
      var s = w.spikes[i];
      if (s.g && !s.g.active) continue;
      if (s.out <= 0.001) continue;
      var ox = s.g ? s.g.ox : 0, oy = s.g ? s.g.oy : 0;
      var cx = s.x + ox, cy = s.y + oy;
      var clip = s.out < 0.999;
      if (clip) { ctx.save(); ctx.beginPath(); ctx.rect(cx, cy, T, T); ctx.clip(); }
      var sh = (1 - s.out) * T;
      ctx.beginPath();
      for (var k = 0; k < 2; k++) {
        var a = k * 20;
        if (s.dir === 'u') { ctx.moveTo(cx + a, cy + T + sh); ctx.lineTo(cx + a + 10, cy + 12 + sh); ctx.lineTo(cx + a + 20, cy + T + sh); }
        else if (s.dir === 'd') { ctx.moveTo(cx + a, cy - sh); ctx.lineTo(cx + a + 10, cy + T - 12 - sh); ctx.lineTo(cx + a + 20, cy - sh); }
        else if (s.dir === 'l') { ctx.moveTo(cx + T + sh, cy + a); ctx.lineTo(cx + 12 + sh, cy + a + 10); ctx.lineTo(cx + T + sh, cy + a + 20); }
        else { ctx.moveTo(cx - sh, cy + a); ctx.lineTo(cx + T - 12 - sh, cy + a + 10); ctx.lineTo(cx - sh, cy + a + 20); }
      }
      ctx.fill();
      if (clip) ctx.restore();
    }
  };

  Art.drawSprings = function (ctx, w, pal) {
    for (var i = 0; i < w.springs.length; i++) {
      var s = w.springs[i];
      if (s.g && !s.g.active) continue;
      s.anim = Math.max(0, s.anim - 0.05);
      var x = s.x + (s.g ? s.g.ox : 0), y = s.y + (s.g ? s.g.oy : 0);
      ctx.save();
      ctx.translate(x + T / 2, s.hang ? y : y + T);
      if (s.hang) ctx.scale(1, -1);
      var comp = s.anim > 0.5 ? 1 - (s.anim - 0.5) * 2 : 1 + s.anim * 0.8;
      var ht = 16 * comp;
      ctx.fillStyle = pal.ink; ctx.fillRect(-16, -5, 32, 5);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(-8, -5);
      for (var k = 1; k <= 4; k++) ctx.lineTo(k % 2 ? 8 : -8, -5 - ht * k / 4);
      ctx.stroke();
      rr(ctx, -17, -9 - ht, 34, 7, 3); ctx.fillStyle = '#ff4d6d'; ctx.fill();
      ctx.lineWidth = 2.5; ctx.strokeStyle = pal.ink; ctx.stroke();
      ctx.restore();
    }
  };

  Art.drawDoor = function (ctx, d, pal, t, glow) {
    var x = d.x + (d.g ? d.g.ox : 0), y = d.y + (d.g ? d.g.oy : 0);
    if (d.g && !d.g.active) return;
    ctx.save();
    ctx.translate(x + 20, d.hang ? y : y + 60);
    if (d.hang) ctx.scale(1, -1);
    // frame
    ctx.fillStyle = pal.ink;
    ctx.beginPath(); ctx.moveTo(-20, 0); ctx.lineTo(-20, -44); ctx.arc(0, -44, 20, Math.PI, 0); ctx.lineTo(20, 0); ctx.closePath(); ctx.fill();
    // inner
    ctx.fillStyle = glow ? '#ffffff' : pal.bg2;
    ctx.beginPath(); ctx.moveTo(-13, 0); ctx.lineTo(-13, -42); ctx.arc(0, -42, 13, Math.PI, 0); ctx.lineTo(13, 0); ctx.closePath(); ctx.fill();
    if (d.bit) {
      // the fake door shows its silly face
      ctx.fillStyle = pal.ink;
      ctx.beginPath(); ctx.arc(-5, -40, 3, 0, Math.PI * 2); ctx.arc(5, -40, 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(0, -28, 7, 0, Math.PI); ctx.fill();
      ctx.fillStyle = '#ff5c8a'; ctx.beginPath(); ctx.ellipse(0, -21, 4, 6, 0, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = pal.ink;
      ctx.beginPath(); ctx.arc(7, -24, 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  };

  Art.drawSaw = function (ctx, s, pal) {
    ctx.save();
    ctx.translate(s.x, s.y); ctx.rotate(s.rot);
    var r = s.r;
    ctx.fillStyle = pal.ink;
    ctx.beginPath();
    for (var i = 0; i < 12; i++) {
      var a0 = i / 12 * Math.PI * 2, a1 = (i + 0.5) / 12 * Math.PI * 2;
      ctx.lineTo(Math.cos(a0) * r * 0.78, Math.sin(a0) * r * 0.78);
      ctx.lineTo(Math.cos(a1) * r, Math.sin(a1) * r);
    }
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-r * 0.2, 0); ctx.lineTo(r * 0.2, 0); ctx.moveTo(0, -r * 0.2); ctx.lineTo(0, r * 0.2); ctx.stroke();
    ctx.restore();
  };

  Art.drawGZones = function (ctx, w, pal, t) {
    if (!w.gz.length) return;
    ctx.save();
    for (var i = 0; i < w.gz.length; i++) {
      var z = w.gz[i];
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.fillRect(z.x + 4, z.y, T - 8, T);
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      var dir = -w.gs; // where you'll go after the flip
      var off = ((t * 40) % 20);
      for (var k = -1; k < 2; k++) {
        var cy = z.y + T / 2 + (k * 20 + off * dir) ;
        if (cy < z.y + 6 || cy > z.y + T - 6) continue;
        ctx.beginPath(); ctx.moveTo(z.x + 12, cy - dir * 5); ctx.lineTo(z.x + 20, cy + dir * 5); ctx.lineTo(z.x + 28, cy - dir * 5); ctx.stroke();
      }
    }
    ctx.restore();
  };

  window.TrollArt = Art;
})();
