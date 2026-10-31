/* سباق التوربو — draws the track once, then only what moves. */
(function () {
  'use strict';
  var W = 1280, H = 720;
  var TK = window.TK, D = window.TKD;
  var trackCv = null, trackId = -1, bridgeCv = null, skidCv, skidG, skidOn;
  var sprites = {};

  function rng(seed) {
    var a = seed >>> 0 || 1;
    return function () {
      a = (a * 1664525 + 1013904223) >>> 0;
      return a / 4294967296;
    };
  }

  function strokePath(g, pts, width, color, from, to) {
    var n = pts.length, i, a = from || 0, b = to == null ? n : to;
    g.beginPath();
    g.moveTo(pts[a % n].x, pts[a % n].y);
    for (i = a + 1; i <= b; i++) g.lineTo(pts[i % n].x, pts[i % n].y);
    if (to == null) g.closePath();
    g.strokeStyle = color;
    g.lineWidth = width;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.stroke();
  }

  function buildTrack(track) {
    var c = document.createElement('canvas');
    c.width = W; c.height = H;
    var g = c.getContext('2d'), toy = track.theme === 'toy';
    var rnd = rng(track.id * 91 + 5), i, p, s;
    g.fillStyle = toy ? '#1f8a45' : '#140f38';
    g.fillRect(0, 0, W, H);
    if (!toy) {
      g.fillStyle = '#fff';
      for (i = 0; i < 80; i++) { g.globalAlpha = 0.35 + rnd() * 0.6; g.fillRect(rnd() * W, rnd() * H, rnd() < 0.2 ? 3 : 2, rnd() < 0.2 ? 3 : 2); }
      g.globalAlpha = 1;
    }
    for (i = 0; i < 520; i++) {
      g.fillStyle = toy ? (rnd() < 0.5 ? 'rgba(255,255,255,0.07)' : 'rgba(0,60,20,0.12)') : 'rgba(120,90,255,0.08)';
      g.beginPath();
      g.arc(rnd() * W, rnd() * H, 1 + rnd() * 2.2, 0, 6.3);
      g.fill();
    }
    track.decor.forEach(function (d) { decor(g, d); });
    strokePath(g, track.pts, track.width + 16, 'rgba(0,0,0,0.25)');
    strokePath(g, track.pts, track.width, toy ? '#5b6478' : '#3a4468');
    strokePath(g, track.pts, track.width * 0.62, toy ? '#6d7690' : '#4a5680');
    // Centre wear.
    g.globalAlpha = 0.25;
    strokePath(g, track.line, 10, toy ? '#8b93a8' : '#6a76a0');
    g.globalAlpha = 1;
    // Zones: ice sheen and the moon ramp, painted along the centre.
    track.zones.forEach(function (z) {
      g.globalAlpha = z.kind === 'ice' ? 0.55 : 0.9;
      var pts = [], ss;
      for (ss = z.s0; ss <= z.s1; ss += 16) pts.push(TK.pointAt(track, ss));
      var zoneColor = z.kind === 'ice' ? '#d7fbff' : z.kind === 'ramp' ? '#ffe08a' : '#e25b86';
      if (pts.length > 1) strokePath(g, pts, track.width * (z.kind === 'ice' ? 0.7 : 0.55), zoneColor, 0, pts.length - 1);
      g.globalAlpha = 1;
    });
    // Crayon kerbs, or moon kerbs on the space cup.
    var step = 22, n = 0;
    for (s = 0; s < track.total; s += step) {
      p = TK.pointAt(track, s);
      var half = track.width * 0.5 - 2;
      [-1, 1].forEach(function (side) {
        g.save();
        g.translate(p.x + p.nx * side * half, p.y + p.ny * side * half);
        g.rotate(Math.atan2(p.ty, p.tx));
        g.fillStyle = (n & 1) ? (toy ? '#ff3a3a' : '#ffb000') : '#fff';
        roundRect(g, -9, -6, 18, 12, 3); g.fill();
        g.restore();
      });
      n++;
    }
    // Start grid.
    p = TK.pointAt(track, 8);
    g.save();
    g.translate(p.x, p.y);
    g.rotate(Math.atan2(p.ty, p.tx));
    for (i = 0; i < 8; i++) {
      g.fillStyle = i & 1 ? '#111' : '#fff';
      g.fillRect(-track.width * 0.42 + i * (track.width * 0.84 / 8), -5, track.width * 0.84 / 8 + 0.5, 10);
    }
    g.restore();
    trackCv = c; trackId = track.id;
    bridgeCv = null;
    if (track.bridge) {
      var bcv = document.createElement('canvas');
      bcv.width = W; bcv.height = H;
      var bg = bcv.getContext('2d');
      var i0 = (track.bridge.over0 * track.pts.length) | 0;
      var over = track.pts.slice(i0).concat(track.pts.slice(0, 2));
      strokePath(bg, over, track.width + 18, 'rgba(0,0,0,0.45)', 0, over.length - 1);
      strokePath(bg, over, track.width, '#f4f1ea', 0, over.length - 1);
      strokePath(bg, over, track.width - 16, '#d7d2ea', 0, over.length - 1);
      strokePath(bg, over, 7, '#ffb000', 0, over.length - 1);
      bridgeCv = bcv;
    }
    return c;
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function decor(g, d) {
    g.save();
    g.translate(d.x, d.y);
    g.rotate(d.r || 0);
    g.scale(d.s, d.s);
    g.fillStyle = d.c;
    if (d.k === 'block') {
      g.fillRect(-16, -12, 32, 24);
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(-16, -12, 32, 6);
    } else if (d.k === 'crayon') {
      g.fillRect(-6, -20, 12, 34);
      g.fillStyle = '#fff';
      g.beginPath(); g.moveTo(-6, -20); g.lineTo(0, -32); g.lineTo(6, -20); g.fill();
    } else if (d.k === 'ball') {
      g.beginPath(); g.arc(0, 0, 14, 0, 6.3); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 3; g.stroke();
    } else if (d.k === 'planet') {
      g.beginPath(); g.arc(0, 0, 16, 0, 6.3); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 3;
      g.beginPath(); g.ellipse(0, 0, 26, 8, 0.4, 0, 6.3); g.stroke();
    } else if (d.k === 'cup') {
      g.fillRect(-10, -6, 20, 16);
      g.fillRect(-4, 10, 8, 6);
      g.fillStyle = '#fff'; g.globalAlpha = 0.4; g.fillRect(-10, -6, 20, 5); g.globalAlpha = 1;
    } else if (d.k === 'cookie') {
      g.beginPath(); g.arc(0, 0, 13, 0, 6.3); g.fill();
      g.fillStyle = '#7a4a12';
      g.beginPath(); g.arc(-4, -2, 2, 0, 6.3); g.arc(4, 3, 2, 0, 6.3); g.fill();
    } else {
      star(g, 0, 0, 5, 12, 6, d.c);
    }
    g.restore();
  }

  function star(g, x, y, r0, r1, n, color) {
    var i, a;
    g.beginPath();
    for (i = 0; i < n * 2; i++) {
      a = i / (n * 2) * Math.PI * 2 - Math.PI / 2;
      g.lineTo(x + Math.cos(a) * (i & 1 ? r0 : r1), y + Math.sin(a) * (i & 1 ? r0 : r1));
    }
    g.closePath();
    g.fillStyle = color;
    g.fill();
  }

  function sprite(color, body) {
    var key = color + ':' + body;
    if (sprites[key]) return sprites[key];
    var c = document.createElement('canvas');
    c.width = c.height = 96;
    var g = c.getContext('2d');
    g.translate(48, 48);
    // Shadow.
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.beginPath(); g.ellipse(2, 8, 30, 16, 0, 0, 6.3); g.fill();
    // Wheels.
    g.fillStyle = '#222';
    [[-16, -16], [16, -16], [-16, 14], [16, 14]].forEach(function (w) {
      roundRect(g, w[0] - 6, w[1] - 8, 12, 16, 3); g.fill();
      g.fillStyle = '#555'; g.fillRect(w[0] - 4, w[1] - 5, 8, 4); g.fillStyle = '#222';
    });
    // Body. Each shape is a different toy.
    g.fillStyle = color;
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = 3;
    if (body === 1) { roundRect(g, -26, -16, 52, 32, 16); g.fill(); g.stroke(); }
    else if (body === 2) { roundRect(g, -30, -13, 60, 26, 8); g.fill(); g.stroke(); }
    else if (body === 3) { roundRect(g, -24, -18, 46, 36, 12); g.fill(); g.stroke(); }
    else if (body === 4) { roundRect(g, -28, -14, 58, 28, 14); g.fill(); g.stroke(); }
    else if (body === 5) {
      g.beginPath(); g.moveTo(-24, -16); g.lineTo(22, -16); g.lineTo(30, 0); g.lineTo(22, 16); g.lineTo(-24, 16); g.closePath();
      g.fill(); g.stroke();
    } else { roundRect(g, -26, -15, 54, 30, 10); g.fill(); g.stroke(); }
    // Spoiler.
    g.fillStyle = '#222';
    g.fillRect(-30, -18, 8, 36);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillRect(-8, -8, 22, 7);
    // Helmet, visor stripe, no face.
    g.fillStyle = '#f4f7ff';
    g.beginPath(); g.arc(6, -2, 11, 0, 6.3); g.fill();
    g.strokeStyle = '#243'; g.lineWidth = 2; g.stroke();
    g.fillStyle = color;
    g.fillRect(2, -6, 12, 5);
    sprites[key] = c;
    return c;
  }

  function clearSkid() {
    if (!skidCv) {
      skidCv = document.createElement('canvas');
      skidCv.width = W; skidCv.height = H;
      skidG = skidCv.getContext('2d');
    }
    skidG.clearRect(0, 0, W, H);
    skidOn = skidCv;
  }

  function skid(race) {
    if (!skidG) clearSkid();
    var ks = race.karts, i, k;
    skidG.lineCap = 'round';
    for (i = 0; i < ks.length; i++) {
      k = ks[i];
      if (k.hopT > 0 || k.finished) { k._sx = k.x; k._sy = k.y; continue; }
      if (k.drifting || Math.abs(k.vl) > 22) {
        skidG.strokeStyle = 'rgba(30,30,40,0.35)';
        skidG.lineWidth = 5;
        skidG.beginPath();
        skidG.moveTo(k._sx == null ? k.x : k._sx, k._sy == null ? k.y : k._sy);
        skidG.lineTo(k.x, k.y);
        skidG.stroke();
      }
      k._sx = k.x; k._sy = k.y;
    }
  }

  function drawKart(g, k, ghost) {
    var img = sprite(k.color, k.body % 6);
    g.save();
    g.translate(k.x, k.y);
    g.rotate(k.ang);
    if (ghost) g.globalAlpha = 0.35;
    if (k.finished) g.globalAlpha = 0.75;
    if (k.hopT > 0) g.translate(0, -10 - Math.sin((0.5 - k.hopT) * 8) * 6);
    if (k.boostT > 0) {
      g.fillStyle = k.boostMul > 1.4 ? '#c86bff' : k.boostMul > 1.28 ? '#ff9a1f' : '#7ecbff';
      g.globalAlpha = ghost ? 0.3 : 0.9;
      g.beginPath(); g.ellipse(-34, 0, 16 + Math.random() * 6, 8, 0, 0, 6.3); g.fill();
      g.beginPath(); g.ellipse(-48, (Math.random() - 0.5) * 6, 10, 5, 0, 0, 6.3); g.fill();
      g.globalAlpha = ghost ? 0.35 : 1;
    }
    if (k.shield) {
      g.strokeStyle = 'rgba(140,220,255,0.9)';
      g.lineWidth = 3;
      g.beginPath(); g.arc(0, 0, 28, 0, 6.3); g.stroke();
    }
    g.drawImage(img, -36, -36, 72, 72);
    if (k.sticker && k.sticker !== 'none') {
      g.fillStyle = '#fff';
      if (k.sticker === 'star') star(g, 8, 6, 2, 6, 5, '#fff');
      else if (k.sticker === 'bolt') { g.fillStyle = '#ffe14a'; g.beginPath(); g.moveTo(4, 10); g.lineTo(12, 2); g.lineTo(8, 2); g.lineTo(14, -8); g.lineTo(6, 2); g.lineTo(10, 2); g.fill(); }
      else if (k.sticker === 'heart') { g.fillStyle = '#ff5a8a'; g.beginPath(); g.arc(6, 6, 4, 0, 6.3); g.arc(12, 6, 4, 0, 6.3); g.fill(); }
      else if (k.sticker === 'cookie') { g.fillStyle = '#d08a3a'; g.beginPath(); g.arc(10, 8, 5, 0, 6.3); g.fill(); }
    }
    if (k.hat && k.hat !== 'none') {
      g.fillStyle = '#333';
      if (k.hat === 'cap') { g.fillRect(-2, -16, 16, 5); g.fillRect(10, -16, 8, 3); }
      else if (k.hat === 'crown') { g.fillStyle = '#ffd23f'; g.fillRect(0, -20, 16, 6); g.fillRect(2, -24, 3, 6); g.fillRect(8, -26, 3, 8); g.fillRect(13, -24, 3, 6); }
      else if (k.hat === 'moon') { g.fillStyle = '#ffe9a0'; g.beginPath(); g.arc(8, -16, 7, 0.6, 5.4); g.fill(); }
      else if (k.hat === 'ears') { g.fillStyle = '#c47a45'; g.beginPath(); g.arc(2, -16, 5, 0, 6.3); g.arc(14, -16, 5, 0, 6.3); g.fill(); }
      else if (k.hat === 'prop') { g.strokeStyle = '#eee'; g.lineWidth = 2; g.beginPath(); g.moveTo(-4, -18); g.lineTo(20, -18); g.stroke(); }
    }
    g.restore();
  }

  function marker(g, k, label) {
    g.save();
    g.translate(k.x, k.y - 38 - Math.sin(performance.now() / 200) * 3);
    g.fillStyle = k.color;
    g.beginPath(); g.moveTo(0, 10); g.lineTo(-8, -4); g.lineTo(8, -4); g.fill();
    g.font = '700 16px Fredoka';
    g.direction = 'rtl';
    g.textAlign = 'center';
    g.fillStyle = '#fff';
    g.strokeStyle = '#1a1230';
    g.lineWidth = 4;
    g.strokeText(label, 0, -8);
    g.fillText(label, 0, -8);
    g.restore();
  }

  var ORD = ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس'];

  function ink(g, text, x, y) {
    g.strokeStyle = '#1a1230';
    g.strokeText(text, x, y);
    g.fillText(text, x, y);
  }

  function hud(g, race, who) {
    var k = race.karts[who];
    if (!k) return;
    var lap = Math.min(race.laps, k.lap + 1);
    var right = who === 0;
    g.save();
    g.lineWidth = 5;
    g.lineJoin = 'round';
    // The lap line keeps the Arabic word and the Western digits in reading order.
    g.direction = 'rtl';
    g.textAlign = right ? 'right' : 'left';
    g.font = '700 30px Fredoka';
    g.fillStyle = '#fff';
    var lapTxt = 'لفة \u200E' + lap + ' / ' + race.laps;
    ink(g, lapTxt, right ? 1244 : 108, right ? 96 : 108);
    g.font = '500 22px Fredoka';
    g.fillStyle = '#ffe08a';
    ink(g, ORD[k.place - 1] || '', right ? 1244 : 108, right ? 128 : 140);
    g.direction = 'ltr';
    g.textAlign = 'center';
    g.font = '700 64px Fredoka';
    g.fillStyle = k.color;
    ink(g, String(k.place), right ? 1108 : 168, right ? 86 : 86);
    if (who === 0) {
      var t = Math.max(0, race.time), m = (t / 60) | 0, sec = (t % 60) | 0;
      var clock = m + ':' + (sec < 10 ? '0' : '') + sec;
      g.font = '700 28px Fredoka';
      g.textAlign = 'left';
      g.fillStyle = '#fff';
      ink(g, clock, 96, 40);
    }
    var ix = right ? 1190 : 28, iy = 628;
    g.fillStyle = 'rgba(16,12,40,0.82)';
    roundRect(g, ix, iy, 68, 68, 14); g.fill();
    g.strokeStyle = '#ffe08a'; g.lineWidth = 4;
    g.stroke();
    if (k.item) itemIcon(g, k.item, ix + 34, iy + 34);
    else {
      g.font = '500 16px Fredoka';
      g.direction = 'rtl';
      g.textAlign = 'center';
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.fillText('أداة', ix + 34, iy + 40);
    }
    if (who === 0) {
      var frac = Math.min(1, k.charge / 1.7);
      var col = k.charge >= 1.45 ? '#c86bff' : k.charge >= 0.95 ? '#ff9a1f' : '#3aa0ff';
      g.fillStyle = 'rgba(0,0,0,0.45)';
      roundRect(g, ix, iy - 22, 68, 14, 7); g.fill();
      g.fillStyle = col;
      roundRect(g, ix, iy - 22, Math.max(8, 68 * frac), 14, 7); g.fill();
    }
    g.restore();
  }

  function itemIcon(g, id, x, y) {
    g.save();
    g.translate(x, y);
    if (id === 'jelly') { g.fillStyle = '#7dff6a'; g.beginPath(); g.ellipse(0, 4, 16, 10, 0, 0, 6.3); g.fill(); }
    else if (id === 'spring') { g.strokeStyle = '#ddd'; g.lineWidth = 4; g.beginPath(); g.moveTo(-10, 12); g.lineTo(-10, -4); g.lineTo(0, 6); g.lineTo(10, -8); g.lineTo(10, 12); g.stroke(); }
    else if (id === 'shield') { g.strokeStyle = '#9ae7ff'; g.lineWidth = 4; g.beginPath(); g.arc(0, 0, 16, 0, 6.3); g.stroke(); }
    else if (id === 'cookie') { g.fillStyle = '#e39a3a'; g.beginPath(); g.arc(0, 0, 14, 0, 6.3); g.fill(); g.fillStyle = '#7a4510'; g.beginPath(); g.arc(-4, -2, 2.5, 0, 6.3); g.arc(5, 4, 2.5, 0, 6.3); g.fill(); }
    else { g.fillStyle = '#ff5a5a'; g.beginPath(); g.moveTo(16, 0); g.lineTo(-12, -10); g.lineTo(-6, 0); g.lineTo(-12, 10); g.fill(); }
    g.restore();
  }

  function draw(ctx, view) {
    var race = view.race;
    if (!race) return;
    if (trackId !== race.track.id || !trackCv) buildTrack(race.track);
    ctx.save();
    ctx.translate(view.shakeX || 0, view.shakeY || 0);
    ctx.drawImage(trackCv, 0, 0);
    if (skidOn) ctx.drawImage(skidOn, 0, 0);
    // Pads and boxes sit on the asphalt and pulse.
    var pulse = 0.75 + Math.sin(performance.now() / 180) * 0.25, i, p;
    ctx.globalAlpha = 0.9;
    for (i = 0; i < race.track.pads.length; i++) {
      p = TK.pointAt(race.track, race.track.pads[i]);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(Math.atan2(p.ty, p.tx));
      ctx.fillStyle = '#7af0ff';
      ctx.globalAlpha = pulse;
      ctx.fillRect(-18, -race.track.width * 0.28, 36, race.track.width * 0.56);
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-6, -12); ctx.lineTo(-6, 12); ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    for (i = 0; i < race.boxes.length; i++) {
      var box = race.boxes[i];
      if (race.time < box.hot) continue;
      p = TK.pointAt(race.track, box.s);
      ctx.save();
      ctx.translate(p.x, p.y + Math.sin(performance.now() / 220 + i) * 3);
      ctx.fillStyle = '#ffb000';
      roundRect(ctx, -16, -16, 32, 32, 6); ctx.fill();
      ctx.strokeStyle = '#7a4a00'; ctx.lineWidth = 3; ctx.stroke();
      ctx.font = '700 22px Fredoka';
      ctx.direction = 'ltr';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.fillText('?', 0, 8);
      ctx.restore();
    }
    race.puddles.forEach(function (pud) {
      ctx.fillStyle = 'rgba(90, 230, 80, 0.75)';
      ctx.beginPath(); ctx.ellipse(pud.x, pud.y, pud.r, pud.r * 0.72, 0, 0, 6.3); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath(); ctx.ellipse(pud.x - 6, pud.y - 4, 6, 3, 0, 0, 6.3); ctx.fill();
    });
    var under = [], over = [];
    race.karts.forEach(function (k) { (k.z ? over : under).push(k); });
    under.sort(function (a, b) { return a.y - b.y; });
    under.forEach(function (k) { drawKart(ctx, k, false); });
    if (bridgeCv) ctx.drawImage(bridgeCv, 0, 0);
    over.sort(function (a, b) { return a.y - b.y; });
    over.forEach(function (k) { drawKart(ctx, k, false); });
    if (view.ghost) drawKart(ctx, view.ghost, true);
    race.rockets.forEach(function (r) {
      ctx.save();
      ctx.translate(r.x, r.y);
      ctx.rotate(Math.atan2(r.vy, r.vx));
      ctx.fillStyle = '#ff5a5a';
      ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-10, -7); ctx.lineTo(-4, 0); ctx.lineTo(-10, 7); ctx.fill();
      ctx.restore();
    });
    if (view.parts) view.parts(ctx);
    // Who is who.
    if (race.karts[0] && !race.karts[0].cpu) marker(ctx, race.karts[0], '١');
    if (race.karts[1] && !race.karts[1].cpu) marker(ctx, race.karts[1], '٢');
    if (view.play && view.count == null) {
      hud(ctx, race, 0);
      if (race.karts[1] && !race.karts[1].cpu) hud(ctx, race, 1);
    }
    if (view.count != null) {
      ctx.font = '700 140px Fredoka';
      ctx.textAlign = 'center';
      ctx.direction = 'ltr';
      ctx.lineWidth = 12;
      ctx.strokeStyle = '#1a1230';
      ctx.fillStyle = view.count === 'انطلق!' ? '#ffe08a' : '#fff';
      ctx.strokeText(String(view.count), 640, 400);
      ctx.fillText(String(view.count), 640, 400);
    }
    ctx.restore();
  }

  window.TKR = {
    draw: draw, skid: skid, clearSkid: clearSkid, sprite: sprite, buildTrack: buildTrack, star: star
  };
})();
