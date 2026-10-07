/* Original vector art for Skybound Golf. No textures, fonts, or network assets. */
(function () {
  'use strict';

  var W = 1280, H = 720, BASE = 540;
  var PALETTES = [
    { sky: ['#49caec', '#a9eef2'], far: '#67c5c5', mid: '#3dabac', hill: '#8ed255', hill2: '#62bb61', grass: '#b9e938', edge: '#73b738', soil: '#a86435', soilDark: '#8b492b', leaf: '#52ad63', leafLight: '#9bd53e', trunk: '#95663b' },
    { sky: ['#ffbd7d', '#ffe9b2'], far: '#e9aa77', mid: '#d18a68', hill: '#edb967', hill2: '#dc9853', grass: '#f4d36d', edge: '#cc9950', soil: '#cf864d', soilDark: '#b97048', leaf: '#4fab82', leafLight: '#8ad49a', trunk: '#a16a43' },
    { sky: ['#80c8ee', '#e5d9ff'], far: '#b5bbec', mid: '#959ed4', hill: '#90d5b2', hill2: '#76b8b2', grass: '#c5ef67', edge: '#72b89c', soil: '#977fba', soilDark: '#796b9b', leaf: '#92cdb6', leafLight: '#c1eb93', trunk: '#9581aa' },
    { sky: ['#1a275c', '#73659a'], far: '#686ba1', mid: '#565d93', hill: '#8c87b1', hill2: '#737ba9', grass: '#d0ccec', edge: '#9c96c3', soil: '#777a9f', soilDark: '#5a6289', leaf: '#b8abe3', leafLight: '#e0d3ff', trunk: '#8f90b6' }
  ];

  // Ball styles bought in the shop: body, shading, trail and the golfer's cap.
  var SKINS = {
    classic: ['#fffef3', '#dce8e5', '', '#ff7458', '#ec5f4b'],
    gold: ['#ffe36b', '#f2b42f', '#ffe066', '#f7b733', '#de9622'],
    melon: ['#79cf55', '#3f9a45', '#ff8a8a', '#5cb84c', '#3f9a45'],
    planet: ['#ffb36b', '#e0794d', '#ffd08a', '#9a72e6', '#7a55c8'],
    comet: ['#c9f4ff', '#7fcbec', '#8fe3ff', '#4aaee0', '#2f8cc2'],
    rainbow: ['#ffffff', '#ffd6ec', '', '#ff5fa2', '#e0458a']
  };
  var RAINBOW = ['#ff5d5d', '#ffb84d', '#ffe94d', '#6fdc6f', '#4dc3ff', '#9b7bff'];
  function skin(s) { return SKINS[s && s.skin] || SKINS.classic; }

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function hash(n) { var x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  function ellipse(c, x, y, rx, ry, color) { c.beginPath(); c.ellipse(x, y, Math.max(.01, rx), Math.max(.01, ry), 0, 0, Math.PI * 2); if (color) c.fillStyle = color; c.fill(); }
  function circle(c, x, y, r, color) { ellipse(c, x, y, r, r, color); }
  function line(c, points, color, width) { c.beginPath(); c.moveTo(points[0][0], points[0][1]); for (var i = 1; i < points.length; i++) c.lineTo(points[i][0], points[i][1]); c.strokeStyle = color; c.lineWidth = width; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke(); }
  function shape(c, points, color) { c.beginPath(); c.moveTo(points[0][0], points[0][1]); for (var i = 1; i < points.length; i++) c.lineTo(points[i][0], points[i][1]); c.closePath(); c.fillStyle = color; c.fill(); }
  function pill(c, x, y, w, h, r, color) { c.beginPath(); c.roundRect(x, y, w, h, r); c.fillStyle = color; c.fill(); }
  function cloud(c, x, y, sc, opacity) {
    c.save(); c.translate(x, y); c.scale(sc, sc); c.globalAlpha *= opacity;
    c.beginPath(); c.moveTo(-69, 17); c.bezierCurveTo(-100, 17, -99, -1, -75, -6); c.bezierCurveTo(-79, -28, -42, -38, -28, -22); c.bezierCurveTo(-15, -65, 48, -64, 54, -22); c.bezierCurveTo(80, -27, 101, -10, 88, 3); c.bezierCurveTo(117, 9, 111, 24, 77, 25); c.bezierCurveTo(26, 33, -38, 29, -69, 17); c.closePath(); c.fillStyle = '#fffef0'; c.fill();
    c.beginPath(); c.moveTo(-75, 17); c.bezierCurveTo(-50, 8, -43, 5, -22, 10); c.bezierCurveTo(-11, -14, 23, -16, 35, 7); c.bezierCurveTo(55, -1, 67, 7, 77, 17); c.bezierCurveTo(17, 28, -42, 25, -75, 17); c.fillStyle = '#d9f2f2'; c.fill(); c.restore();
  }

  function hillLayer(c, base, amp, scale, phase, color) {
    c.beginPath(); c.moveTo(-20, H + 20);
    for (var x = -20; x <= W + 20; x += 20) {
      var y = base + Math.sin((x + phase) / scale) * amp + Math.cos((x + phase * .8) / (scale * .51)) * amp * .18;
      c.lineTo(x, y);
    }
    c.lineTo(W + 20, H + 20); c.closePath(); c.fillStyle = color; c.fill();
  }

  function tinyPine(c, x, y, h, color) {
    c.fillStyle = color; c.beginPath(); c.moveTo(x, y - h); c.bezierCurveTo(x - h * .15, y - h * .86, x - h * .18, y - h * .62, x - h * .13, y - h * .55); c.bezierCurveTo(x - h * .34, y - h * .37, x - h * .18, y - h * .05, x, y); c.bezierCurveTo(x + h * .24, y - h * .12, x + h * .26, y - h * .34, x + h * .13, y - h * .55); c.bezierCurveTo(x + h * .15, y - h * .67, x + h * .13, y - h * .89, x, y - h); c.fill();
  }

  // Distant layers that never move relative to each other: sky, moon stars,
  // islands, hills and water. They are cached once per world (see scenery).
  function background(c, p, world) {
    var up = 0, pan = -45 * .38;
    var grad = c.createLinearGradient(0, 0, 0, H); grad.addColorStop(0, p.sky[0]); grad.addColorStop(1, p.sky[1]); c.fillStyle = grad; c.fillRect(0, 0, W, H);
    if (world === 3) {
      // Kept clear of the top rows, which are stretched over the sky above.
      for (var k = 0; k < 78; k++) {
        c.globalAlpha = .28 + hash(k + 918) * .55;
        circle(c, hash(k + 54) * 1500 % 1350, 8 + hash(k + 874) * 412, hash(k + 391) > .93 ? 2.8 : 1.1, '#fffbe4');
      }
      c.globalAlpha = 1;
    }
    if (world === 2) {
      for (var n = 0; n < 4; n++) {
        var ix = ((n * 411 + 131 - pan * .34) % 1700 + 1700) % 1700 - 160, iy = 312 + hash(n + 61) * 127 + up * .32, iw = 58 + hash(n + 94) * 55;
        shape(c, [[ix - iw, iy], [ix + iw, iy], [ix + iw * .57, iy + 26], [ix + iw * .24, iy + 63], [ix - iw * .22, iy + 41], [ix - iw * .59, iy + 23]], '#9098bf');
        shape(c, [[ix - iw, iy], [ix - iw * .2, iy + 11], [ix + iw * .24, iy + 63], [ix - iw * .22, iy + 41], [ix - iw * .59, iy + 23]], '#a5aaca');
        ellipse(c, ix, iy, iw, 15, '#c5eaa3'); tinyPine(c, ix + iw * .24, iy - 3, iw * .7, '#78b3a8');
      }
      cloud(c, 730 - pan * .14, 427 + up * .25, 2.1, .6);
    }
    if (world === 1) {
      for (var m = -1; m < 5; m++) {
        var mx = m * 348 - pan * .18, my = 335 + hash(m + 77) * 35 + up * .52;
        shape(c, [[mx - 140, 490 + up], [mx - 96, my + 37], [mx - 54, my + 31], [mx - 39, my - 22], [mx + 65, my - 22], [mx + 94, my + 61], [mx + 134, my + 72], [mx + 175, 490 + up]], p.far);
        line(c, [[mx - 31, my - 12], [mx + 55, my - 12]], '#f1bd84', 9);
      }
    } else hillLayer(c, 340 + up * .55, 43, 196, pan * .21, p.far);
    hillLayer(c, 402 + up * .64, 30, 117, pan * .39 + 823, p.mid);
    if (world === 0) {
      for (var l = -2; l < 29; l++) {
        var tx = l * 55 - (pan * .7 % 55), ty = 417 + Math.sin((tx + pan * .39 + 823) / 117) * 24 + up * .67;
        tinyPine(c, tx, ty, 24 + hash(l + 25) * 49, '#399f9c');
      }
      // A glimpse of water gives the layered hills a sense of distance.
      ellipse(c, 785 - pan * .28, 477 + up * .78, 353, 24, '#77dbe0');
      line(c, [[515 - pan * .28, 473 + up * .78], [678 - pan * .28, 473 + up * .78]], '#d3f3df', 3);
    }
    hillLayer(c, 470 + up * .78, 42, 222, pan * .7 + 402, p.hill);
    hillLayer(c, 499 + up * .89, 21, 129, pan * 1.05 - 96, p.hill2);
  }

  // The sun, Earth and clouds are drawn live at full resolution, so flights
  // drift past them and the 1080p view stays crisp.
  function skyObjects(c, s, world, up) {
    var t = s.reducedMotion ? 0 : (s.time || 0), pan = s.cam.x * .38;
    if (world === 3) {
      // On the title the Earth moves left, clear of the logo.
      var title = s.phase === 'title';
      c.save(); c.translate(title ? 480 : 1087 - pan * .12, (title ? 180 : 166) + up * .25); c.rotate(-.22);
      circle(c, 0, 0, 61, '#9bdae0'); circle(c, -7, -5, 52, '#5cabce');
      c.save(); c.beginPath(); c.arc(-7, -5, 52, 0, Math.PI * 2); c.clip();
      shape(c, [[-42, -40], [-15, -53], [7, -35], [3, -16], [28, -11], [29, 8], [5, 11], [-9, 31], [-20, 18], [-25, -3], [-51, -5]], '#93d5a6');
      shape(c, [[29, 17], [49, 7], [69, 37], [43, 54], [26, 35]], '#93d5a6');
      line(c, [[-63, -18], [-32, -22], [-10, -18], [25, -27], [59, -20]], '#e2f6df', 7); c.restore();
      c.globalAlpha = .2; c.lineWidth = 13; c.strokeStyle = '#d5deed'; c.beginPath(); c.arc(0, 0, 65, 0, Math.PI * 2); c.stroke(); c.restore();
      return;
    }
    var sunX = world === 1 ? 1070 : 1125, sunY = 142 + up * .2;
    circle(c, sunX, sunY, world === 1 ? 64 : 43, world === 1 ? '#fff0b2' : '#edfbcc');
    c.globalAlpha = .14; circle(c, sunX, sunY, world === 1 ? 86 : 58, '#fffdf0'); c.globalAlpha = 1;
    for (var j = -1; j < 5; j++) {
      var cx = ((j * 353 + 100 - pan * .6 + t * (3 + j * .3)) % 1800 + 1800) % 1800 - 220;
      cloud(c, cx, 157 + hash(j + 7) * 122 + up * .9, .64 + hash(j + 10) * .73, world === 1 ? .48 : .95);
    }
  }

  // One half-resolution distant backdrop, reused across worlds and frames.
  // 640 * 360 * 4 = 921,600 backing bytes, independent of DPR/distance.
  // Keeping this opaque and small avoids a large first-paint surface transfer;
  // the foreground and ball are still drawn at the full fitted resolution.
  // As the ball climbs and the camera zooms out, the cached hills sink, the
  // revealed sky reuses the cache's top row, and the sky darkens into space.
  var backdrop = null, backdropWorld = -1;
  function scenery(c, s, p, world, flying) {
    if (!backdrop) {
      backdrop = document.createElement('canvas'); backdrop.width = W / 2; backdrop.height = H / 2;
      backdrop.addEventListener('contextrestored', function () {
        backdropWorld = -1;
        // The game may be paused; request one frame to rebuild the lost pixels.
        if (window.GolfArt.onContextRestored) window.GolfArt.onContextRestored();
      });
    }
    if (backdropWorld !== world) {
      var b = backdrop.getContext('2d', {alpha:false});
      b.setTransform(.5,0,0,.5,0,0);
      background(b, p, world);
      b.fillStyle = world === 3 ? 'rgba(40,45,83,.20)' : 'rgba(242,247,222,.27)';
      b.fillRect(0,0,W,H); backdropWorld = world;
    }
    var cam = s.cam, up = flying ? clamp((108 / cam.zoom - 108 + cam.y) * .9, 0, 330) : 0, dy = Math.round(up * .7);
    if (dy) c.drawImage(backdrop, 0, 0, W / 2, 1, 0, 0, W, dy);
    c.drawImage(backdrop, 0, dy, W, H);
    var night = clamp((up - 90) / 400, 0, .4);
    if (world !== 3 && night) {
      var dark = c.createLinearGradient(0, 0, 0, H * .8); dark.addColorStop(0, 'rgba(23,41,98,' + night + ')'); dark.addColorStop(1, 'rgba(23,41,98,0)');
      c.fillStyle = dark; c.fillRect(0, 0, W, H);
    }
    if (world === 3 ? dy : night > .1) {
      // Stars fade in high up; on the moon they fill the sky above the cache.
      c.fillStyle = '#fffbe4';
      for (var a = 0; a < 30; a++) {
        var sy = world === 3 ? dy - hash(a + 45) * 420 : hash(a + 45) * 300;
        if (sy < 0) continue;
        c.globalAlpha = world === 3 ? .3 + hash(a + 9) * .5 : (night - .1) * 2.5;
        circle(c, hash(a + 351) * W, sy, 1.4);
      }
      c.globalAlpha = 1;
    }
    skyObjects(c, s, world, up);
  }

  function flower(c, x, y, size, p, moon) {
    if (moon) {
      ellipse(c, x, y + 1, size * 1.9, size * .55, '#8f8bb4');
      line(c, [[x - size, y], [x - size * .8, y - size * .5], [x + size, y - size * .5]], '#b8b5d6', .8); return;
    }
    line(c, [[x, y], [x + 1, y - size * 2.2]], p.edge, Math.max(1, size * .24));
    for (var n = 0; n < 5; n++) { var a = n * Math.PI * .4; ellipse(c, x + 1 + Math.cos(a) * size * .65, y - size * 2.2 + Math.sin(a) * size * .65, size * .54, size * .42, '#fffce3'); }
    circle(c, x + 1, y - size * 2.2, size * .35, '#fbc35e');
  }

  function tree(c, x, y, h, p, world, seed, time) {
    c.save(); c.translate(x, y); var scale = h / 100; c.scale(scale, scale);
    ellipse(c, 0, 0, 29, 5, world === 3 ? '#656589' : 'rgba(40,96,49,.14)');
    if (world === 1) {
      line(c, [[0, -2], [0, -91]], '#398f71', 15);
      line(c, [[0, -36], [-22, -36], [-22, -64]], '#398f71', 12);
      line(c, [[0, -51], [24, -51], [24, -78]], '#398f71', 12);
      line(c, [[-3, -7], [-3, -89]], '#75ba85', 3); line(c, [[-24, -62], [-24, -39]], '#75ba85', 2);
      circle(c, 24, -80, 5, '#ed8f8e'); circle(c, 27, -84, 3, '#ffd794');
    } else if (world === 3) {
      // Friendly crystal clusters preserve the same obstacle silhouette.
      shape(c, [[-28, 0], [-34, -38], [-22, -60], [-10, -39], [-7, 0]], '#a999da');
      shape(c, [[-9, 0], [-16, -76], [0, -105], [20, -76], [15, 0]], '#d4c3f1');
      shape(c, [[0, -105], [20, -76], [15, 0], [2, -2]], '#a895d9');
      shape(c, [[16, 0], [13, -44], [30, -69], [40, -40], [29, 0]], '#bdb0e6');
      line(c, [[-9, -72], [0, -93]], '#f2e3ff', 3);
    } else {
      line(c, [[1, -2], [1, -68]], p.trunk, 12); line(c, [[0, -28], [-20, -49]], p.trunk, 6); line(c, [[1, -40], [24, -62]], p.trunk, 6);
      line(c, [[-3, -4], [-3, -43]], '#c19b62', 2.5);
      c.translate(Math.sin(time * 1.3 + seed) * .8, 0);
      circle(c, -22, -67, 23, p.leaf); circle(c, 20, -66, 25, p.leaf); circle(c, 0, -86, 27, p.leaf); circle(c, 2, -61, 30, p.leaf);
      circle(c, -18, -77, 21, p.leafLight); circle(c, 5, -89, 24, p.leafLight); circle(c, 23, -75, 19, p.leafLight); circle(c, 1, -69, 23, p.leafLight);
      c.globalAlpha = .38; circle(c, -8, -96, 8, '#eef6ac'); circle(c, 22, -83, 6, '#eef6ac'); c.globalAlpha = 1;
    }
    c.restore();
  }

  function flag(c, x, y, scale, time, world) {
    scale = Math.max(.34, scale); c.save(); c.translate(x, y); c.scale(scale, scale);
    ellipse(c, 0, 1, 12, 3.5, '#34514b'); ellipse(c, -1, 0, 6, 2.2, '#253942');
    line(c, [[0, -1], [0, -71]], '#faf7dd', 4); line(c, [[-1.1, -1], [-1.1, -71]], '#5c7767', 1);
    c.beginPath(); c.moveTo(2, -72); c.bezierCurveTo(18, -72 + Math.sin(time * 3) * 2, 28, -58 + Math.sin(time * 3 + 1) * 3, 40, -59); c.bezierCurveTo(28, -50, 19, -47, 2, -47); c.closePath(); c.fillStyle = '#ff674e'; c.fill();
    c.beginPath(); c.moveTo(2, -70); c.lineTo(2, -51); c.quadraticCurveTo(15, -49, 20, -56); c.fillStyle = '#ff8466'; c.fill();
    circle(c, 0, -73, 3, '#fff6d7'); c.restore();
  }

  function terrain(c, s, p, world, tr) {
    var cam = s.cam, scale = tr.scale, min = cam.x - 12 / scale, max = cam.x + (W + 12) / scale;
    var h = tr.height, startY = tr.sy(h(min)), points = [];
    for (var px = -24; px <= W + 24; px += 12) { var wx = cam.x + px / scale; points.push([px, tr.sy(h(wx))]); }
    c.beginPath(); c.moveTo(-24, H + 20); points.forEach(function (a) { c.lineTo(a[0], a[1]); }); c.lineTo(W + 24, H + 20); c.closePath();
    var dirt = c.createLinearGradient(0, Math.min(BASE, startY), 0, H); dirt.addColorStop(0, p.soil); dirt.addColorStop(1, p.soilDark); c.fillStyle = dirt; c.fill();
    c.save(); c.clip();
    // Subtle subsoil strata and stones make the course feel cut from a toy world.
    for (var stratum = 0; stratum < 3; stratum++) {
      c.beginPath(); c.moveTo(-25, BASE + stratum * 65 + cam.y * scale);
      for (var gx = -25; gx <= W + 25; gx += 28) c.lineTo(gx, BASE + 50 + stratum * 65 + Math.sin((gx + cam.x * scale) / 73) * 5 + cam.y * scale);
      c.strokeStyle = world === 3 ? 'rgba(42,48,89,.13)' : 'rgba(87,39,21,.10)'; c.lineWidth = 10; c.stroke();
    }
    if (scale > 1.2) for (var rock = Math.floor(min / 13); rock < max / 13 + 1; rock++) {
      var rx = tr.sx(rock * 13 + hash(rock + 99) * 7), ry = tr.sy(h(rock * 13)) + (21 + hash(rock + 85) * 26) * cam.zoom;
      ellipse(c, rx, ry, (3 + hash(rock + 1) * 6) * cam.zoom, (2 + hash(rock + 6) * 4) * cam.zoom, world === 3 ? '#9797b6' : '#bd7b45');
      ellipse(c, rx - 14 * cam.zoom, ry + 38 * cam.zoom, 3 * cam.zoom, 2.2 * cam.zoom, world === 3 ? '#5c6285' : '#8b4c2e');
    }
    c.restore();
    line(c, points, p.soilDark, Math.max(14,24 * cam.zoom));
    line(c, points, p.edge, Math.max(11,20 * cam.zoom)); line(c, points.map(function (a) { return [a[0], a[1] - 3 * cam.zoom]; }), p.grass, Math.max(7,12 * cam.zoom));
    if (scale > 1.8) {
      for (var decor = Math.floor(min / 9); decor < max / 9 + 1; decor++) {
        var dx = decor * 9 + hash(decor + 880) * 7, xx = tr.sx(dx), yy = tr.sy(h(dx)) - 3 * cam.zoom;
        if (hash(decor + 39) > .72) flower(c, xx, yy, (2.6 + hash(decor + 7) * 1.4) * cam.zoom, p, world === 3);
        else if (world !== 3 && hash(decor + 40) > .38) { c.save(); c.translate(xx, yy); c.scale(cam.zoom, cam.zoom); line(c, [[-4, 0], [-6, -4], [-2, -2], [0, -7], [1, -1], [5, -4], [4, 0]], p.edge, 1.4); c.restore(); }
      }
    }
    var features = window.GolfPhysics && s.course ? window.GolfPhysics.features(s.course, min, max) : [];
    // The title keeps the course left of the menu, around the golfer.
    var right = s.phase === 'title' ? 660 : W + 30;
    features.forEach(function (f) {
      var x = tr.sx(f.x), y = tr.sy(h(f.x)), width = Math.max(8, (f.width || 8) * scale), z = cam.zoom;
      if (x > right) return;
      if (f.type === 'green') {
        ellipse(c, x, y - 2 * z, width * .5, 5.8 * z, world === 3 ? '#dedaee' : '#c6ed63');
        flag(c, tr.sx(f.holeX == null ? f.x : f.holeX), tr.sy(h(f.holeX == null ? f.x : f.holeX)), z, s.reducedMotion ? 0 : (s.time || 0), world);
      } else if (f.type === 'sand') {
        ellipse(c, x, y + z, width * .53, 6 * z, '#d5a562'); ellipse(c, x, y - z, width * .5, 5.5 * z, '#ffe2a0');
        line(c, [[x - width * .31, y - z], [x - width * .18, y - 2 * z]], '#fff1bb', 2 * z);
      } else if (f.type === 'pad') {
        c.save(); c.translate(x, y); c.scale(z, z); ellipse(c, 0, 1, width / z * .58, 5, 'rgba(44,75,65,.2)');
        pill(c, -width / z * .5, -8, width / z, 10, 4, '#257d86'); pill(c, -width / z * .53, -11, width / z * 1.06, 7, 3, '#ffe45a');
        for (var b = -1; b <= 1; b++) line(c, [[b * 12 - 3, -12], [b * 12, -16], [b * 12 + 3, -12]], '#fff9c9', 2); c.restore();
      } else if (f.type === 'tree') tree(c, x, y, (f.height || 16) * scale, p, world, f.x, s.reducedMotion ? 0 : (s.time || 0));
    });
    if (s.best > 12 && tr.sx(s.best) > -30 && tr.sx(s.best) < right) {
      var bx = tr.sx(s.best), by = tr.sy(h(s.best)); c.save(); c.setLineDash([4, 6]); line(c, [[bx, by - 10], [bx, by - 86 * Math.max(.5, cam.zoom)]], '#fbefaa', 2); c.restore();
      c.save(); c.translate(bx, by - 92 * Math.max(.5, cam.zoom)); c.scale(.65, .65); shape(c, [[-12, 5], [-15, -9], [-5, -3], [0, -15], [5, -3], [15, -9], [12, 5]], '#ffda63'); line(c, [[-12, 8], [12, 8]], '#f5be44', 3); c.restore();
    }
  }

  // Uncollected stars, batched into one path: two canvas calls in any view.
  function stars(c, s, tr) {
    var cam = s.cam, t = s.reducedMotion ? 0 : (s.time || 0), r = Math.max(9, 2 * tr.scale), got = s.got || {};
    var list = window.GolfPhysics && s.course ? window.GolfPhysics.stars(s.course, cam.x - 12 / tr.scale, cam.x + (W + 12) / tr.scale) : [];
    c.beginPath();
    list.forEach(function (star) {
      if (got[star.id]) return;
      var x = tr.sx(star.x), y = tr.sy(star.y) + Math.sin(t * 3 + star.id) * 2;
      for (var i = 0; i < 10; i++) {
        var a = i * Math.PI / 5 - Math.PI / 2, d = i % 2 ? r * .45 : r;
        c[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * d, y + Math.sin(a) * d);
      }
      c.closePath();
    });
    c.fillStyle = '#ffe14d'; c.fill(); c.strokeStyle = '#c47a12'; c.lineWidth = 2; c.stroke();
  }

  function shoe(c, x, y, angle) {
    c.save(); c.translate(x, y); c.rotate(angle || 0);
    c.beginPath(); c.moveTo(-11, -10); c.lineTo(4, -10); c.quadraticCurveTo(8, -5, 19, -4); c.quadraticCurveTo(25, -1, 22, 4); c.lineTo(-13, 4); c.quadraticCurveTo(-16, 1, -11, -10); c.fillStyle = '#fffbe7'; c.fill();
    line(c, [[-13, 4], [22, 4]], '#3e5054', 2.5); line(c, [[3, -6], [-1, -2]], '#b7bab0', 1.8); line(c, [[9, -4], [5, 0]], '#b7bab0', 1.8); c.restore();
  }

  function golfer(c, x, y, scale, time, swing, putting, cap) {
    cap = cap || SKINS.classic;
    c.save(); c.translate(x, y); c.scale(scale, scale);
    var recoil = swing > 0 && swing < 1 ? Math.sin(swing * Math.PI) : 0;
    var breathe = Math.sin(time * 2) * .7;
    ellipse(c, 5, 4, 39, 7, 'rgba(40,78,43,.18)');
    // Shoes, warm skin, cream shorts, and stitched socks.
    line(c, [[-7, -34], [-15 - recoil * 3, -14], [-17, -6]], '#efa36d', 11);
    line(c, [[14, -32], [20 + recoil * 4, -18], [21, -6]], '#ffc085', 11);
    line(c, [[-17, -14], [-17, -6]], '#fff8dd', 10); line(c, [[21, -14], [21, -6]], '#fff8dd', 10);
    shoe(c, -16, -1, -.06); shoe(c, 20, -1, recoil * -.12);
    c.save(); c.translate(recoil * -4, breathe);
    c.beginPath(); c.moveTo(-16, -54); c.lineTo(21, -54); c.lineTo(25, -31); c.lineTo(9, -28); c.lineTo(3, -41); c.lineTo(0, -29); c.lineTo(-18, -30); c.closePath(); c.fillStyle = '#fff2c8'; c.fill();
    line(c, [[-10, -52], [-12, -36]], '#ddcba0', 2); line(c, [[7, -48], [3, -41]], '#ddcba0', 1.5); line(c, [[10, -30], [24, -33]], '#dfc99d', 2);
    // A slightly forward leaning polo silhouette.
    c.beginPath(); c.moveTo(-12, -91); c.bezierCurveTo(-29, -79, -26, -62, -22, -51); c.quadraticCurveTo(1, -44, 25, -53); c.lineTo(18, -83); c.quadraticCurveTo(9, -98, -12, -91); c.closePath(); c.fillStyle = '#f2634b'; c.fill();
    c.beginPath(); c.moveTo(-12, -90); c.quadraticCurveTo(-24, -68, -22, -52); c.lineTo(-12, -50); c.quadraticCurveTo(-11, -74, -4, -91); c.fillStyle = '#df5141'; c.fill();
    line(c, [[-19, -52], [19, -53]], '#f88466', 2);
    pill(c, -2, -100, 17, 19, 5, '#efa76e');
    shape(c, [[-5, -89], [3, -83], [6, -89], [13, -87], [9, -79], [2, -84], [-5, -79], [-11, -86]], '#ffa183');
    line(c, [[2, -82], [4, -71]], '#ce4b3d', 1.5); circle(c, 3, -76, 1.2, '#ffc294');
    // Head and tousled chocolate hair, with a visible ear and small cheek.
    c.save(); c.translate(3 + recoil * 1.5, -98); c.rotate(.12 - recoil * .15);
    circle(c, -9, -15, 21, '#553624'); circle(c, -20, -6, 9, '#553624'); circle(c, -7, 0, 17, '#553624');
    c.beginPath(); c.moveTo(-13, -23); c.bezierCurveTo(1, -36, 24, -23, 25, -8); c.bezierCurveTo(25, 4, 16, 14, 7, 14); c.bezierCurveTo(-4, 14, -16, 4, -13, -23); c.fillStyle = '#ffbe83'; c.fill();
    ellipse(c, -13, -3, 8, 10, '#ffbd82'); ellipse(c, -14, -3, 4, 5.5, '#ed9562');
    c.beginPath(); c.moveTo(-17, -22); c.lineTo(17, -22); c.quadraticCurveTo(12, -6, 2, -16); c.quadraticCurveTo(-2, -5, -10, -10); c.lineTo(-12, -1); c.lineTo(-17, -6); c.fillStyle = '#553624'; c.fill();
    ellipse(c, 11, -1, 5.2, 7.3, '#fffcee'); ellipse(c, 13.2, -.2, 2.7, 4.8, '#382b27'); circle(c, 14, -2, 1.2, '#fff');
    c.beginPath(); c.moveTo(7, -10); c.quadraticCurveTo(12, -13, 17, -9); c.strokeStyle = '#613a28'; c.lineWidth = 2; c.lineCap = 'round'; c.stroke();
    ellipse(c, 20, 4.5, 4.2, 2.5, '#fca179');
    c.beginPath(); c.moveTo(8, 8); c.quadraticCurveTo(13, 12, 17, 8); c.strokeStyle = '#8d5035'; c.lineWidth = 1.5; c.stroke();
    // Cap is an original rounded dome, panel seams, and a generous curved bill.
    c.beginPath(); c.moveTo(-28, -22); c.bezierCurveTo(-28, -60, 21, -57, 27, -26); c.lineTo(24, -20); c.quadraticCurveTo(-2, -17, -28, -22); c.fillStyle = cap[3]; c.fill();
    c.beginPath(); c.moveTo(-28, -22); c.bezierCurveTo(-27, -46, -14, -50, -6, -49); c.quadraticCurveTo(-20, -36, -17, -21); c.fillStyle = cap[4]; c.fill();
    c.beginPath(); c.moveTo(-5, -49); c.quadraticCurveTo(6, -40, 7, -22); c.strokeStyle = cap[4]; c.lineWidth = 1.4; c.stroke();
    c.beginPath(); c.moveTo(-1, -22); c.bezierCurveTo(21, -29, 44, -22, 43, -14); c.bezierCurveTo(34, -10, 11, -13, -1, -22); c.fillStyle = cap[4]; c.fill();
    line(c, [[4, -21], [24, -23], [37, -19]], 'rgba(255,255,255,.35)', 1.5); ellipse(c, -4, -50, 4.1, 2.6, cap[4]);
    c.restore();
    // Both hands meet the grip; club follows a smooth overshooting swing.
    var clubAngle = .16;
    if (swing > 0 && swing < 1.8) clubAngle = -Math.sin(clamp(swing / .28, 0, 1) * Math.PI / 2) * 2.5 * Math.max(0, 1 - (swing - .3) / 1.5);
    var handX = 22 - recoil * 7, handY = -57 - recoil * 15;
    line(c, [[12, -82], [16 - recoil * 7, -68], [handX, handY]], '#fbb279', 12);
    line(c, [[-11, -79], [0 - recoil * 8, -65], [handX - 3, handY]], '#ffbd82', 13);
    c.beginPath(); c.moveTo(-18, -83); c.quadraticCurveTo(-12, -93, -4, -87); c.lineTo(2, -75); c.lineTo(-12, -70); c.closePath(); c.fillStyle = '#ff795c'; c.fill(); line(c, [[-12, -71], [1, -76]], '#e65946', 1.6);
    c.save(); c.translate(handX, handY); c.rotate(clubAngle);
    line(c, [[0, -2], [41, 43]], '#3c444d', 4); line(c, [[7, 8], [39, 43]], '#c9d5ce', 2.2); line(c, [[-3, -5], [7, 7]], '#344447', 5);
    c.save(); c.translate(43, 44); c.rotate(-.4); pill(c, -7, -4, 21, 10, 4, '#354453'); line(c, [[-3, -3], [11, -3]], '#5a6875', 2); c.restore(); c.restore();
    circle(c, handX - 1, handY, 5.7, '#ffbc81'); line(c, [[handX - 1, handY + 1], [handX + 2, handY + 4]], '#ea9b65', 1.2);
    c.restore(); c.restore();
  }

  function golfBall(c, x, y, r, time, bright, look) {
    r = Math.max(2, r); look = look || SKINS.classic;
    if (bright) { c.globalAlpha = .2; circle(c, x, y, r + 7, '#fffbd9'); c.globalAlpha = .08; circle(c, x, y, r + 15, '#fffbd9'); c.globalAlpha = 1; }
    circle(c, x, y, r + 3, '#fff9db'); circle(c, x, y, r + 1.8, '#24464d'); circle(c, x, y, r, look[0]);
    c.save(); c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.clip();
    if (look === SKINS.rainbow) { c.globalAlpha = .8; for (var i = 0; i < 6; i++) circle(c, x - r + i * r * .4, y + r * 1.4, r * (1.6 - i * .12), RAINBOW[i]); c.globalAlpha = 1; }
    c.beginPath(); c.arc(x - r * .22, y - r * .3, r * 1.1, .2, Math.PI * .8); c.lineTo(x + r, y + r); c.lineTo(x - r, y + r); c.fillStyle = look[1]; c.globalAlpha = look === SKINS.classic ? 1 : .55; c.fill(); c.globalAlpha = 1;
    if (look === SKINS.melon) { line(c, [[x - r * .45, y - r], [x - r * .15, y + r]], '#2f7a3a', r * .28); line(c, [[x + r * .3, y - r], [x + r * .5, y + r]], '#2f7a3a', r * .28); }
    if (r > 5.8 && look === SKINS.classic) { circle(c, x - r * .3, y - r * .25, r * .12, '#bcd5d9'); circle(c, x + r * .36, y - r * .32, r * .11, '#bcd5d9'); circle(c, x + r * .12, y + r * .3, r * .11, '#bcd5d9'); circle(c, x - r * .41, y + r * .42, r * .095, '#bcd5d9'); }
    c.restore();
    if (look === SKINS.planet) { c.beginPath(); c.ellipse(x, y, r * 1.75, r * .42, -.35, 0, Math.PI * 2); c.strokeStyle = '#fff1c9'; c.lineWidth = Math.max(1.5, r * .22); c.stroke(); }
  }

  function flight(c, s, tr) {
    var ball = s.ball; if (!ball) return;
    var t = s.reducedMotion ? 0 : (s.time || 0), x = tr.sx(ball.x), y = tr.sy(ball.y), r = Math.max(8, (ball.r || .7) * tr.scale), trail = s.trail || [];
    var look = skin(s), color = look[2] || (s.quality >= .9 ? '#fff9b1' : '#fffef0');
    if (trail.length > 1) {
      c.save(); c.lineCap = 'round';
      for (var i = 1; i < trail.length; i++) {
        var a = (i / trail.length); c.globalAlpha = a * (look[2] ? .75 : .55);
        line(c, [[tr.sx(trail[i - 1].x), tr.sy(trail[i - 1].y)], [tr.sx(trail[i].x), tr.sy(trail[i].y)]], look === SKINS.rainbow ? RAINBOW[i % 6] : color, (2 + a * 4) * Math.max(.6, s.cam.zoom));
      }
      c.restore();
    }
    var gy = tr.sy(tr.height(ball.x)), gap = Math.max(0, ball.y - tr.height(ball.x));
    if (gap < 25) { c.globalAlpha = .2 * (1 - gap / 25); ellipse(c, x, gy - 2, r * (1.6 + gap * .04), r * .37, '#275c4d'); c.globalAlpha = 1; }
    if (s.phase === 'ready' || s.phase === 'title') { line(c, [[x, gy - 1], [x, y + r]], '#d9914d', 3 * Math.max(.6, s.cam.zoom)); line(c, [[x - 4, y + r], [x + 4, y + r]], '#f0c278', 2); }
    golfBall(c, x, y, r, t, s.phase === 'flight' && !s.reducedMotion, look);
    if (s.phase === 'flight' && s.quality >= .9 && !s.reducedMotion) {
      c.save(); c.translate(x, y); c.rotate(t * 2); c.globalAlpha = .7;
      for (var n = 0; n < 4; n++) { c.rotate(Math.PI * .5); shape(c, [[r + 7, 0], [r + 13, -2], [r + 19, 0], [r + 13, 2]], '#fff8bf'); } c.restore();
    }
    if (x > W - 8 || y < 7 || x < 8) {
      var ax = clamp(x, 25, W - 25), ay = clamp(y, 125, 530); c.save(); c.translate(ax, ay); circle(c, 0, 0, 18, '#fff6d7'); line(c, [[-5, 4], [0, -5], [5, 4]], '#37586a', 3); c.restore();
    }
  }

  function particles(c, s, tr) {
    if (s.impact && !s.reducedMotion) {
      var impact = s.impact, progress = impact.age / .32;
      c.globalAlpha = (1-progress)*.7;
      c.beginPath(); c.ellipse(tr.sx(impact.x),tr.sy(impact.y),8+progress*(12+impact.strength*16),3+progress*6,0,0,Math.PI*2);
      c.strokeStyle = '#fff4ba'; c.lineWidth = 2; c.stroke(); c.globalAlpha = 1;
    }
    (s.particles || []).forEach(function (p) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
      c.globalAlpha = clamp(p.life / (p.max || p.life || 1), 0, 1);
      var x = tr.sx(p.x), y = tr.sy(p.y), size = Math.max(1.2, (p.size || 1) * tr.scale);
      if (p.square) { c.save(); c.translate(x, y); c.rotate((s.reducedMotion ? 0 : (s.time || 0)) * (p.vx || 1)); c.fillStyle = p.color || '#fff6bd'; c.fillRect(-size, -size, size * 2, size * 2); c.restore(); }
      else circle(c, x, y, size, p.color || '#fff6bd');
    }); c.globalAlpha = 1;
  }

  function putting(c, s, p, world) {
    var putt = s.putt || { x: .1, target: .82 }, time = s.reducedMotion ? 0 : (s.time || 0), x = 220 + 850 * (putt.ballX == null ? (putt.x == null ? .1 : putt.x) : putt.ballX), hole = 220 + 850 * (putt.target == null ? .82 : putt.target);
    var yy = 510;
    c.fillStyle = p.soil; c.fillRect(0, yy, W, H - yy);
    c.beginPath(); c.moveTo(0, yy); c.bezierCurveTo(240, yy - 6, 1130, yy - 6, W, yy); c.lineTo(W, H); c.lineTo(0, H); c.closePath(); c.fillStyle = p.soil; c.fill();
    c.fillStyle = p.edge; c.fillRect(0, yy, W, 18); c.fillStyle = p.grass; c.fillRect(0, yy - 7, W, 12);
    ellipse(c, 665, yy - 9, 510, 14, world === 3 ? '#ddd8f1' : '#c9ed70');
    for (var i = 0; i < 18; i++) { var rx = hash(i + 781) * W, ry = yy + 32 + hash(i + 808) * 145; ellipse(c, rx, ry, 4 + hash(i + 891) * 7, 3 + hash(i + 71) * 3, world === 3 ? '#9292b3' : '#ba7a47'); }
    // Gentle distance ticks make stopping near the cup readable without numeric overlays.
    for (var j = 0; j < 10; j++) { var tx = 240 + j * 85; line(c, [[tx, yy - 15], [tx, yy - 10]], world === 3 ? '#aaa2c8' : '#a0c852', 2); }
    flower(c, 160, yy - 7, 4, p, world === 3); flower(c, 1150, yy - 7, 5, p, world === 3);
    flag(c, hole, yy - 8, 1.4, time, world);
    ellipse(c, hole, yy - 6, 13, 4, '#304743');
    golfer(c, 220 + 850 * Math.min(putt.start == null ? .12 : putt.start, .27) - 75, yy - 10, 1.3, time, s.phase === 'putt-roll' ? (s.shotAge || 0) : 0, true, skin(s));
    if (!putt.sunk) golfBall(c, x, yy - 16, 8, time, s.phase === 'putt-roll', skin(s));
    if (putt.sunk && putt.hold < .38) {
      var drop = s.reducedMotion ? 1 : clamp(putt.hold / .38,0,1);
      c.save(); c.beginPath(); c.rect(hole-20,yy-40,40,34); c.clip();
      golfBall(c,hole,yy-16+drop*19,8*(1-drop*.65),0,false,skin(s)); c.restore();
    }
  }

  function draw(c, s) {
    if (!s) return;
    var world = typeof s.world === 'number' ? s.world : s.course && typeof s.course.worldIndex === 'number' ? s.course.worldIndex : 0;
    world = clamp(Math.floor(world), 0, 3); var p = PALETTES[world];
    var cam = s.cam || { x: -45, y: 0, zoom: 1 }; if (!cam.zoom) cam.zoom = 1; s.cam = cam;
    var scale = 5 * cam.zoom;
    var tr = { scale: scale, sx: function (x) { return (x - cam.x) * scale; }, sy: function (y) { return BASE - (y - cam.y) * scale; }, height: function (x) { return window.GolfPhysics && s.course ? window.GolfPhysics.heightAt(s.course, x) : 0; } };
    c.save(); c.lineCap = 'round'; c.lineJoin = 'round'; c.globalAlpha = 1;
    var putt = s.phase === 'putting' || s.phase === 'putt-roll' || s.putt && s.putt.active;
    scenery(c, s, p, world, !putt);
    if (putt) {
      c.save();
      var settle = s.reducedMotion ? 0 : (1-(s.putt.arrival || 0))*10;
      c.translate(0,settle); putting(c, s, p, world); c.restore();
    }
    else {
      terrain(c, s, p, world, tr);
      var gx = tr.sx(-7), gy = tr.sy(tr.height(-7));
      if (s.phase === 'title') {
        golfer(c, 280, gy - 3, 1.8, s.reducedMotion ? 0 : (s.time || 0), 0, false, skin(s));
        // Title's miniature tee ball keeps the illustration self-contained.
        line(c, [[395, gy - 2], [395, gy - 14]], '#d99a54', 4); golfBall(c, 395, gy - 23, 9, 0, false, skin(s));
      } else {
        stars(c, s, tr);
        if (gx > -150 && gx < W + 100) golfer(c, gx - 22 * cam.zoom, gy - 2 * cam.zoom, cam.zoom, s.reducedMotion ? 0 : (s.time || 0), s.phase === 'flight' ? (s.shotAge || 0) : 0, false, skin(s));
        flight(c, s, tr);
      }
      particles(c, s, tr);
    }
    c.restore();
  }

  window.GolfArt = { draw: draw, golfer: golfer, ball: golfBall, palettes: PALETTES };
}());
