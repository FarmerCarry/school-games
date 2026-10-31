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
    farProps(g, track, rnd);
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
    nearProps(g, track, rnd);
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

  // Distance from a point to the centreline. Used only while baking a track.
  function offRoad(track, x, y, pad) {
    var pts = track.pts, i, a, b, dx, dy, L2, u, px, py, best = 1e9;
    for (i = 0; i < pts.length; i++) {
      a = pts[i]; b = pts[(i + 1) % pts.length];
      dx = b.x - a.x; dy = b.y - a.y; L2 = dx * dx + dy * dy || 1;
      u = ((x - a.x) * dx + (y - a.y) * dy) / L2;
      if (u < 0) u = 0; else if (u > 1) u = 1;
      px = a.x + dx * u - x; py = a.y + dy * u - y;
      if (px * px + py * py < best) best = px * px + py * py;
    }
    return best > (track.width * 0.5 + pad) * (track.width * 0.5 + pad);
  }

  function onGrass(track, x, y, pad) {
    return x > 18 && y > 18 && x < W - 18 && y < H - 18 && offRoad(track, x, y, pad);
  }

  function tree(g, x, y, sc, toy) {
    g.save(); g.translate(x, y); g.scale(sc, sc);
    g.fillStyle = toy ? '#6b3f22' : '#241a4a';
    g.fillRect(-3, 0, 6, 16);
    g.fillStyle = toy ? '#147a34' : '#3a6fd0';
    g.beginPath(); g.arc(-8, -8, 12, 0, 6.3); g.arc(9, -6, 13, 0, 6.3); g.arc(0, -16, 13, 0, 6.3); g.fill();
    g.fillStyle = toy ? '#3cba58' : '#8be9ff';
    g.beginPath(); g.arc(-2, -18, 6, 0, 6.3); g.fill();
    g.restore();
  }

  function bush(g, x, y, sc, toy) {
    g.save(); g.translate(x, y); g.scale(sc, sc);
    g.fillStyle = toy ? '#0f6a30' : '#2a4ea8';
    g.beginPath(); g.arc(-9, 2, 11, 0, 6.3); g.arc(9, 3, 12, 0, 6.3); g.arc(0, -7, 11, 0, 6.3); g.fill();
    g.restore();
  }

  function tyres(g, x, y) {
    var i;
    g.save(); g.translate(x, y);
    for (i = 0; i < 3; i++) {
      g.fillStyle = '#1c1c1c';
      g.beginPath(); g.ellipse(0, 8 - i * 7, 13, 6, 0, 0, 6.3); g.fill();
      g.strokeStyle = '#555'; g.lineWidth = 2; g.stroke();
      g.fillStyle = '#333';
      g.beginPath(); g.ellipse(0, 8 - i * 7, 5, 2.2, 0, 0, 6.3); g.fill();
    }
    g.restore();
  }

  function cone(g, x, y) {
    g.save(); g.translate(x, y);
    g.fillStyle = '#ff5418';
    g.beginPath(); g.moveTo(0, -16); g.lineTo(8, 8); g.lineTo(-8, 8); g.closePath(); g.fill();
    g.fillStyle = '#fff';
    g.fillRect(-6, -3, 12, 3);
    g.fillRect(-4, -10, 8, 3);
    g.restore();
  }

  // Trees, bushes and tyre stacks, baked under the asphalt so the road stays clean.
  function farProps(g, track, rnd) {
    var toy = track.theme === 'toy', i, s, side, p, dist, x, y, kind;
    for (i = 0; i < 16; i++) {
      s = (i + 0.37) / 16 * track.total;
      side = (i & 1) ? 1 : -1;
      p = TK.pointAt(track, s);
      dist = track.width * 0.5 + 28 + rnd() * 52;
      x = p.x + p.nx * side * dist;
      y = p.y + p.ny * side * dist;
      if (!onGrass(track, x, y, 22)) continue;
      kind = (i + track.id) % 5;
      if (kind < 2) tree(g, x, y, 0.8 + rnd() * 0.45, toy);
      else if (kind < 4) bush(g, x, y, 0.75 + rnd() * 0.5, toy);
      else tyres(g, x, y);
    }
  }

  function standRoom(track, p, side) {
    var reach = track.width * 0.5 + 108, i, x, y, room, worst = 1e9;
    var cx = p.x + p.nx * side * reach, cy = p.y + p.ny * side * reach;
    var spots = [[0, 0], [80, 0], [-80, 0], [0, -34], [0, 46]];
    for (i = 0; i < spots.length; i++) {
      x = cx + p.tx * spots[i][0] + p.nx * side * spots[i][1];
      y = cy + p.ty * spots[i][0] + p.ny * side * spots[i][1];
      room = Math.min(x, y, W - x, H - y);
      if (room < 6 || !offRoad(track, x, y, 8)) return 0;
      if (room < worst) worst = room;
    }
    return worst;
  }

  // Grandstand and flags by the start, plus a short row of cones. Drawn once.
  function nearProps(g, track, rnd) {
    var toy = track.theme === 'toy';
    var reach = track.width * 0.5 + 108;
    var stations = [Math.min(90, track.total * 0.04), 130, 170, 220, 280];
    var best = null, st, bi, side, room, p, x, y;
    for (st = 0; st < stations.length && !best; st++) {
      p = TK.pointAt(track, stations[st]);
      for (bi = 0; bi < 2; bi++) {
        side = bi ? -1 : 1;
        room = standRoom(track, p, side);
        if (room && (!best || room > best.room)) {
          best = { side: side, room: room, p: p, x: p.x + p.nx * side * reach, y: p.y + p.ny * side * reach };
        }
      }
    }
    if (best) {
      g.save();
      g.translate(best.x, best.y);
      g.rotate(Math.atan2(best.p.ty, best.p.tx));
      if (best.side < 0) g.scale(1, -1);
      g.fillStyle = toy ? '#6a4630' : '#2c2358';
      roundRect(g, -72, 4, 144, 40, 6); g.fill();
      var seats = ['#ff5a7a', '#ffe14a', '#4dabff', '#3ddc84', '#fff'], r, c;
      for (r = 0; r < 3; r++) for (c = 0; c < 8; c++) {
        g.fillStyle = seats[(c + r + track.id) % seats.length];
        g.fillRect(-64 + c * 17, 10 + r * 10, 10, 7);
      }
      g.fillStyle = toy ? '#e23b3b' : '#6d4cff';
      g.fillRect(-80, -8, 160, 12);
      var cols = ['#ff3a3a', '#ffe14a', '#3ec6ff'];
      for (c = 0; c < 3; c++) {
        var fx = -48 + c * 48;
        g.strokeStyle = '#f7f7f7'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(fx, -8); g.lineTo(fx, -30); g.stroke();
        g.fillStyle = cols[c];
        g.beginPath(); g.moveTo(fx, -30); g.lineTo(fx + 14, -22); g.lineTo(fx, -14); g.fill();
      }
      g.restore();
    } else {
      // Flags alone, closer in, when a grandstand would leave the grass.
      var cols2 = ['#ff3a3a', '#ffe14a', '#3ec6ff'], fi;
      for (fi = 0; fi < 3; fi++) {
        var fp = TK.pointAt(track, 40 + fi * 28);
        x = fp.x + fp.nx * (track.width * 0.5 + 26);
        y = fp.y + fp.ny * (track.width * 0.5 + 26);
        if (!onGrass(track, x, y, 4)) continue;
        g.strokeStyle = '#f7f7f7'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 26); g.stroke();
        g.fillStyle = cols2[fi];
        g.beginPath(); g.moveTo(x, y - 26); g.lineTo(x + 14, y - 18); g.lineTo(x, y - 10); g.fill();
      }
    }
    var other = best ? -best.side : 1, i, q, si, placed;
    for (i = 0; i < 5; i++) {
      q = TK.pointAt(track, 150 + i * 42);
      placed = false;
      for (si = 0; si < 2 && !placed; si++) {
        side = other * (si ? -1 : 1);
        x = q.x + q.nx * side * (track.width * 0.5 + 18);
        y = q.y + q.ny * side * (track.width * 0.5 + 18);
        if (onGrass(track, x, y, 4)) { cone(g, x, y); placed = true; }
      }
    }
    // One extra stack and a bush opposite the grandstand, still off the kerb.
    q = TK.pointAt(track, track.total * 0.55);
    x = q.x + q.nx * (track.width * 0.5 + 40);
    y = q.y + q.ny * (track.width * 0.5 + 40);
    if (onGrass(track, x, y, 16)) tyres(g, x, y);
    x = q.x - q.nx * (track.width * 0.5 + 36 + rnd() * 10);
    y = q.y - q.ny * (track.width * 0.5 + 36);
    if (onGrass(track, x, y, 16)) bush(g, x, y, 1, toy);
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
    g.scale(1.25, 1.25);
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
    g.translate(k.x, k.y - 58 - Math.sin(performance.now() / 200) * 3);
    g.lineJoin = 'round';
    g.lineWidth = 3;
    g.strokeStyle = '#fff';
    g.fillStyle = k.color;
    g.beginPath();
    g.moveTo(0, 16);
    g.lineTo(-13, 1); g.lineTo(-6, 1); g.lineTo(-6, -12);
    g.lineTo(6, -12); g.lineTo(6, 1); g.lineTo(13, 1);
    g.closePath();
    g.fill(); g.stroke();
    g.font = '700 18px Fredoka';
    g.direction = 'ltr';
    g.textAlign = 'center';
    g.lineWidth = 4;
    g.strokeStyle = '#1a1230';
    g.strokeText(label, 0, -16);
    g.fillStyle = k.color;
    g.fillText(label, 0, -16);
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
    if (race.karts[0] && !race.karts[0].cpu) marker(ctx, race.karts[0], 'P1');
    if (race.karts[1] && !race.karts[1].cpu) marker(ctx, race.karts[1], 'P2');
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
