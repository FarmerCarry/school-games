/* ضربة إلى الفضاء: all canvas art, drawn live every frame in a bold,
 * outlined cartoon style. No images, no cached bitmaps, nothing read back.
 * draw(ctx, s) paints the whole 1280 × 720 scene from the game state.
 */
(function () {
  'use strict';
  var P = window.GolfPhysics;
  var W = 1280, H = 720, PPM = 24, INK = '#24133f', TAU = Math.PI * 2;

  var THEMES = [
    { sky: ['#3aa6f2', '#c4f3ff'], far: '#8ccbe0', mid: '#5cc27e', near: '#3fa95e', farFn: 'round', midFn: 'round', decor: 'tree',
      dirt: '#a45f35', dirtDark: '#81452a', top: '#6fd64b', topDark: '#3c9b37', green: '#9cef6a', sun: 'sun' },
    { sky: ['#ff8f5a', '#ffe6ad'], far: '#ee9d68', mid: '#f5b870', near: '#e7a258', farFn: 'mesa', midFn: 'round', decor: 'cactus',
      dirt: '#d4874a', dirtDark: '#b46a37', top: '#f8d27c', topDark: '#d9a24f', green: '#a6e36a', sun: 'bigsun' },
    { sky: ['#5ea8ff', '#e8f5ff'], far: '#a7bde9', mid: '#5a87b3', near: '#d9ebff', farFn: 'peaks', midFn: 'peaks', decor: 'pine',
      dirt: '#7e8fbd', dirtDark: '#66739f', top: '#ffffff', topDark: '#b9d2f0', green: '#a4e7a8', sun: 'pale' },
    { sky: ['#8a74ff', '#ffc8ec'], far: '#f4eaff', mid: '#c2b1f5', near: '#ffffff', farFn: 'bumps', midFn: 'bumps', decor: 'island',
      dirt: '#ddd2fb', dirtDark: '#c4b6f1', top: '#ffffff', topDark: '#d2c6f6', green: '#b5f29a', sun: 'rainbow' },
    { sky: ['#0d0a2c', '#2d2370'], far: '#4a4286', mid: '#5a5494', near: '#6d68a6', farFn: 'peaks', midFn: 'round', decor: 'rock',
      dirt: '#8580b6', dirtDark: '#6c679c', top: '#cfcbea', topDark: '#9d98c8', green: '#9be8c4', sun: 'earth' }
  ];
  var SPACE_SKY = ['#0b0726', '#2a1a6b'];

  // Ball styles: body, shade, trail colour.
  var SKINS = {
    classic: ['#ffffff', '#d7e2f0', '#ffffff'],
    gold: ['#ffd93b', '#e9a51d', '#ffe36b'],
    melon: ['#5fc84a', '#2f7d36', '#ff7a8a'],
    earth: ['#3d9df2', '#1f6dc1', '#8fd6ff'],
    donut: ['#f2b672', '#c98445', '#ff8fc7'],
    planet: ['#ffb052', '#e0742e', '#ffd28a'],
    comet: ['#c9f6ff', '#6fd0f5', '#7ff2ff'],
    rainbow: ['#ffffff', '#ffd6ec', '#ff6fb1']
  };
  var RAINBOW = ['#ff5d5d', '#ffb84d', '#ffe94d', '#6fdc6f', '#4dc3ff', '#9b7bff'];
  var BALLOONS = ['#ff4f6d', '#ffcf3a', '#3fd0c9', '#a77bff'];

  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var mix = function (a, b, t) {
    var x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
    var r = Math.round(((x >> 16) & 255) * (1 - t) + ((y >> 16) & 255) * t);
    var g = Math.round(((x >> 8) & 255) * (1 - t) + ((y >> 8) & 255) * t);
    var bl = Math.round((x & 255) * (1 - t) + (y & 255) * t);
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
  };
  function hash(n) { var x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  function circle(c, x, y, r) { c.beginPath(); c.arc(x, y, Math.max(0.1, r), 0, TAU); }
  // Several circles as one shape: each is its own subpath, so the fill has no gaps.
  function blob(c, list) {
    c.beginPath();
    for (var n = 0; n < list.length; n += 3) { c.moveTo(list[n] + list[n + 2], list[n + 1]); c.arc(list[n], list[n + 1], list[n + 2], 0, TAU); }
  }
  function fillCircle(c, x, y, r, color) { circle(c, x, y, r); c.fillStyle = color; c.fill(); }
  function inked(c, width) { c.lineWidth = width; c.strokeStyle = INK; c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke(); }

  // The view: world metres to screen pixels.
  var view = { k: PPM, ox: 0, oy: 0, minX: 0, maxX: 0 };
  function setView(s) {
    var k = PPM * s.cam.zoom;
    view.k = k; view.ox = W / 2 - s.cam.x * k; view.oy = H / 2 + s.cam.y * k;
    view.minX = (0 - view.ox) / k; view.maxX = (W - view.ox) / k;
  }
  function sx(x) { return view.ox + x * view.k; }
  function sy(y) { return view.oy - y * view.k; }

  /* --------------------------------------------------------------- sky */
  var STARS = [];
  for (var i = 0; i < 110; i++) STARS.push([hash(i * 3 + 1), hash(i * 3 + 2), hash(i * 3 + 3)]);
  var CLOUDS = [];
  for (var j = 0; j < 22; j++) CLOUDS.push({ u: hash(j + 40) * 2600, alt: 14 + j * 11 + hash(j + 70) * 8, s: 0.6 + hash(j + 90) * 0.7 });

  function altitudeMix(s) {
    if (s.world === 4) return 1;
    return clamp((s.cam.y - 30) / (P.SPACE - 40), 0, 1);
  }

  function sky(c, s, th) {
    var a = altitudeMix(s);
    var top = mix(th.sky[0], SPACE_SKY[0], s.world === 4 ? 0 : a), bottom = mix(th.sky[1], SPACE_SKY[1], s.world === 4 ? 0 : Math.min(1, a * 1.2));
    var g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, top); g.addColorStop(1, bottom);
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    var starAlpha = s.world === 4 ? 1 : clamp((a - 0.25) / 0.5, 0, 1);
    if (starAlpha > 0) {
      var t = s.reduced ? 0 : s.time;
      c.fillStyle = '#fff8e0';
      for (var n = 0; n < STARS.length; n++) {
        var st = STARS[n], x = ((st[0] * 1600 - s.cam.x * 0.6) % 1600 + 1600) % 1600 - 160;
        var y = ((st[1] * 900 + s.cam.y * 1.2) % 900 + 900) % 900 - 90;
        c.globalAlpha = starAlpha * (0.45 + 0.55 * Math.abs(Math.sin(t * (0.6 + st[2]) + n)));
        var r = st[2] > 0.9 ? 2.6 : 1.3;
        if (st[2] > 0.95) { c.fillRect(x - 0.8, y - 5, 1.6, 10); c.fillRect(x - 5, y - 0.8, 10, 1.6); }
        c.fillRect(x - r / 2, y - r / 2, r, r);
      }
      c.globalAlpha = 1;
    }
    skyBody(c, s, th, a);
    if (a > 0.35 && s.world !== 4) planet(c, 330, 150 + (1 - a) * 300, 54, clamp((a - 0.35) / 0.3, 0, 1));
  }

  function skyBody(c, s, th, a) {
    var y = 130 + (s.cam.y - 4) * 0.9, x = s.phase === 'title' ? 560 : 1085;
    if (y > H + 120) return;
    c.save();
    c.globalAlpha = th.sun === 'earth' ? 1 : clamp(1 - a * 1.8, 0, 1);
    if (!c.globalAlpha) { c.restore(); return; }
    if (th.sun === 'earth') {
      x = 1040; y = 150 + (s.cam.y - 4) * 0.4;
      fillCircle(c, x, y, 74, 'rgba(120,190,255,0.18)');
      fillCircle(c, x, y, 58, '#3d8ff0');
      c.save(); circle(c, x, y, 58); c.clip();
      c.fillStyle = '#5fd27a';
      c.beginPath(); c.ellipse(x - 18, y - 14, 26, 18, 0.4, 0, TAU); c.fill();
      c.beginPath(); c.ellipse(x + 26, y + 22, 18, 24, -0.3, 0, TAU); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.8)';
      c.beginPath(); c.ellipse(x - 4, y - 44, 40, 8, 0, 0, TAU); c.fill();
      c.beginPath(); c.ellipse(x + 10, y + 6, 30, 6, 0.2, 0, TAU); c.fill();
      fillCircle(c, x + 30, y + 30, 50, 'rgba(10,8,40,0.35)');
      c.restore();
      circle(c, x, y, 58); inked(c, 4);
    } else if (th.sun === 'rainbow') {
      for (var r = 0; r < RAINBOW.length; r++) {
        c.beginPath(); c.arc(1060, y + 150, 210 - r * 14, Math.PI, TAU);
        c.lineWidth = 14; c.strokeStyle = RAINBOW[r]; c.globalAlpha = 0.45 * (1 - a); c.stroke();
      }
      c.globalAlpha = 1 - a;
      fillCircle(c, 1090, y - 20, 40, '#fff6c8');
    } else {
      var big = th.sun === 'bigsun', pale = th.sun === 'pale';
      var rad = big ? 70 : 48, col = pale ? '#fffbe6' : big ? '#ffe36b' : '#ffe14d';
      var t = s.reduced ? 0 : s.time * 0.3;
      c.fillStyle = pale ? 'rgba(255,255,255,0.35)' : 'rgba(255,240,150,0.45)';
      c.beginPath();
      for (var k = 0; k < 24; k++) {
        var ang = t + k * TAU / 24, rr = k % 2 ? rad * 1.25 : rad * 1.6;
        c[k ? 'lineTo' : 'moveTo'](x + Math.cos(ang) * rr, y + Math.sin(ang) * rr);
      }
      c.closePath(); c.fill();
      fillCircle(c, x, y, rad, col);
      fillCircle(c, x - rad * 0.3, y - rad * 0.3, rad * 0.35, 'rgba(255,255,255,0.45)');
    }
    c.restore();
  }

  function planet(c, x, y, r, alpha) {
    c.save(); c.globalAlpha = alpha;
    c.beginPath(); c.ellipse(x, y, r * 1.9, r * 0.45, -0.25, Math.PI, TAU);
    c.lineWidth = 10; c.strokeStyle = '#ffd9a0'; c.stroke();
    fillCircle(c, x, y, r, '#ff9f5a');
    c.save(); circle(c, x, y, r); c.clip();
    c.fillStyle = '#ffbf73'; c.fillRect(x - r, y - r * 0.45, r * 2, r * 0.3);
    c.fillStyle = '#e8743d'; c.fillRect(x - r, y + r * 0.15, r * 2, r * 0.25);
    fillCircle(c, x + r * 0.5, y + r * 0.5, r, 'rgba(40,10,60,0.25)');
    c.restore();
    circle(c, x, y, r); inked(c, 4);
    c.beginPath(); c.ellipse(x, y, r * 1.9, r * 0.45, -0.25, 0, Math.PI);
    c.lineWidth = 10; c.strokeStyle = '#ffd9a0'; c.stroke();
    c.restore();
  }

  /* --------------------------------------------------------- parallax */
  var SHAPES = {
    round: function (u) { return 0.6 * Math.sin(u) + 0.3 * Math.sin(u * 2.3 + 1.7) + 0.1 * Math.sin(u * 5.1); },
    peaks: function (u) { var a = u / 2.2, b = u / 0.9 + 0.4; return 0.9 * (1 - 2 * Math.abs(a - Math.floor(a) - 0.5)) * 2 - 0.9 + 0.25 * (1 - 2 * Math.abs(b - Math.floor(b) - 0.5)); },
    mesa: function (u) { return clamp(1.7 * Math.sin(u * 0.8) + 0.3 * Math.sin(u * 2.7), -1, 0.65); },
    bumps: function (u) { return Math.pow(Math.abs(Math.sin(u * 1.2)), 0.5) * 0.8 + 0.2 * Math.sin(u * 0.37); }
  };

  function ridge(c, offset, base, amp, wl, fn, color, outline) {
    if (base - amp > H) return;
    var f = SHAPES[fn];
    c.beginPath(); c.moveTo(-20, H + 20);
    for (var x = -20; x <= W + 32; x += 16) c.lineTo(x, base - amp * f((x + offset) / wl));
    c.lineTo(W + 32, H + 20); c.closePath();
    c.fillStyle = color; c.fill();
    if (outline) { c.lineWidth = 3; c.strokeStyle = outline; c.stroke(); }
  }

  function backdrop(c, s, th) {
    var lift = (s.cam.y - 4) * PPM, x = s.cam.x * PPM;
    var farY = 455 + lift * 0.12, midY = 515 + lift * 0.25, nearY = 575 + lift * 0.42;
    clouds(c, s, 0);
    ridge(c, x * 0.06, farY, 120, 260, th.farFn, th.far);
    if (th.farFn === 'peaks' && farY - 120 < H) snowCaps(c, x * 0.06, farY, 120, 260, s.world === 4 ? '#6a62a6' : '#ffffff');
    ridge(c, x * 0.16 + 300, midY, 70, 150, th.midFn, th.mid);
    decor(c, th.decor, x * 0.16 + 300, midY, 70, 150, th.midFn, mix(th.mid, INK, 0.25), s.world);
    clouds(c, s, 1);
    ridge(c, x * 0.36 + 900, nearY, 42, 190, 'round', th.near);
  }

  function snowCaps(c, offset, base, amp, wl, color) {
    var f = SHAPES.peaks, x, h;
    c.beginPath();
    for (x = -20; x <= W + 32; x += 8) { h = f((x + offset) / wl); c.lineTo(x, base - amp * h); }
    for (x = W + 32; x >= -20; x -= 8) {
      h = f((x + offset) / wl);
      var depth = Math.max(0, h - 0.5) * amp * 0.75 * (0.75 + 0.25 * Math.sin(x * 0.21));
      c.lineTo(x, base - amp * h + depth);
    }
    c.closePath(); c.fillStyle = color; c.fill();
  }

  function decor(c, kind, offset, base, amp, wl, fn, color, world) {
    var f = SHAPES[fn], gap = 64;
    var first = Math.floor((offset - 40) / gap);
    c.fillStyle = color;
    for (var n = first; n < first + W / gap + 3; n++) {
      if (hash(n + world * 50) < 0.45) continue;
      var x = n * gap - offset + hash(n + 9) * 30, y = base - amp * f((x + offset) / wl) + 6, h = 22 + hash(n + 3) * 22;
      if (y > H + 40) continue;
      c.beginPath();
      if (kind === 'tree') { c.moveTo(x + h * 0.45, y - h * 0.7); c.arc(x, y - h * 0.7, h * 0.45, 0, TAU); c.rect(x - 3, y - h * 0.5, 6, h * 0.5); }
      else if (kind === 'pine') { c.moveTo(x, y - h * 1.4); c.lineTo(x + h * 0.45, y); c.lineTo(x - h * 0.45, y); }
      else if (kind === 'cactus') { c.rect(x - 4, y - h, 8, h); c.rect(x - 12, y - h * 0.65, 6, h * 0.3); c.rect(x + 6, y - h * 0.8, 6, h * 0.3); }
      else if (kind === 'island') { c.moveTo(x + h * 0.8, y - h); c.ellipse(x, y - h, h * 0.8, h * 0.3, 0, 0, TAU); }
      else { c.moveTo(x - h * 0.6, y); c.ellipse(x, y, h * 0.6, h * 0.35, 0, Math.PI, TAU); }
      c.fill();
    }
  }

  function clouds(c, s, layer) {
    if (s.world === 4) return;
    var drift = s.reduced ? 0 : s.time * 6, par = layer ? 0.42 : 0.22;
    for (var n = layer; n < CLOUDS.length; n += 2) {
      var cl = CLOUDS[n];
      var y = H / 2 - (cl.alt - s.cam.y) * PPM * (layer ? 0.55 : 0.4);
      if (y < -80 || y > H + 60) continue;
      var x = ((cl.u - s.cam.x * PPM * par + drift * (layer ? 1.4 : 1)) % 2600 + 2600) % 2600 - 300;
      if (x < -260 || x > W + 260) continue;
      puff(c, x, y, cl.s * (layer ? 1.15 : 0.85), s.world === 3 ? '#fff7ff' : '#ffffff', layer ? 0.95 : 0.7);
    }
  }

  function puff(c, x, y, sc, color, alpha) {
    c.save(); c.globalAlpha = alpha; c.translate(x, y); c.scale(sc, sc);
    c.fillStyle = 'rgba(80,90,160,0.18)';
    c.beginPath(); c.ellipse(4, 22, 112, 16, 0, 0, TAU); c.fill();
    c.fillStyle = color;
    blob(c, [-62, 8, 34, -18, -12, 46, 34, -4, 40, 74, 12, 28]);
    c.rect(-90, 8, 186, 30);
    c.fill();
    c.restore();
  }

  /* ----------------------------------------------------------- ground */
  var px = new Float32Array(240), py = new Float32Array(240);
  function terrain(c, s, th) {
    var course = s.course, k = view.k, n = 0;
    for (var x = -12; x <= W + 12 && n < 240; x += 6) {
      px[n] = x; py[n] = sy(P.heightAt(course, (x - view.ox) / k)); n++;
    }
    var lowest = H;
    for (var i = 0; i < n; i++) lowest = Math.min(lowest, py[i]);
    if (lowest > H + 40) return;
    var band = clamp(k * 0.55, 7, 26);
    path(c, n, 0); c.lineTo(W + 20, H + 40); c.lineTo(-20, H + 40); c.closePath();
    var deep = c.createLinearGradient(0, lowest, 0, Math.max(lowest + 1, H + 40));
    deep.addColorStop(0, th.dirt); deep.addColorStop(1, mix(th.dirt, INK, 0.35));
    c.fillStyle = deep; c.fill();
    // Earth layers that follow the surface.
    c.globalAlpha = 0.5;
    stroke(c, n, band + k * 1.2, th.dirtDark, Math.max(4, k * 0.35));
    stroke(c, n, band + k * 2.8, th.dirtDark, Math.max(3, k * 0.22));
    c.globalAlpha = 1;
    pebbles(c, s, th, band);
    stroke(c, n, band * 0.5, th.top, band);
    stroke(c, n, band, th.topDark, 3);
    stroke(c, n, 0, INK, 3.5);
    if (k > 30 && s.world !== 3 && s.world !== 4) tufts(c, s, th);
  }
  function path(c, n, dy) {
    c.beginPath(); c.moveTo(px[0], py[0] + dy);
    for (var i = 1; i < n; i++) c.lineTo(px[i], py[i] + dy);
  }
  function stroke(c, n, dy, color, width) {
    path(c, n, dy); c.lineWidth = width; c.strokeStyle = color; c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke();
  }
  function pebbles(c, s, th, band) {
    var k = view.k, step = k > 20 ? 2.5 : 6, first = Math.floor(view.minX / step);
    c.fillStyle = th.dirtDark;
    for (var n = first; n * step < view.maxX + step; n++) {
      var x = n * step + hash(n) * step, depth = band / k + 0.8 + hash(n + 5) * 3.5;
      var y = sy(P.heightAt(s.course, x) - depth);
      if (y > H + 10) continue;
      c.beginPath(); c.ellipse(sx(x), y, 2 + hash(n + 2) * k * 0.12, 1.5 + hash(n + 3) * k * 0.08, 0, 0, TAU); c.fill();
    }
  }
  function tufts(c, s, th) {
    var first = Math.floor(view.minX / 1.7);
    c.strokeStyle = th.topDark; c.lineWidth = 2.5; c.lineCap = 'round';
    c.beginPath();
    for (var n = first; n * 1.7 < view.maxX; n++) {
      if (hash(n + 33) < 0.5) continue;
      var x = n * 1.7, X = sx(x), Y = sy(P.heightAt(s.course, x)) - 1, h = view.k * 0.25;
      c.moveTo(X - 4, Y); c.lineTo(X - 6, Y - h); c.moveTo(X, Y); c.lineTo(X, Y - h * 1.3); c.moveTo(X + 4, Y); c.lineTo(X + 6, Y - h);
    }
    c.stroke();
  }

  // A run of the surface from x0 to x1, offset down by dy pixels.
  function surfaceRun(c, s, x0, x1, dy) {
    var steps = Math.max(2, Math.ceil((x1 - x0) * view.k / 6));
    c.beginPath();
    for (var i = 0; i <= steps; i++) {
      var x = x0 + (x1 - x0) * i / steps, X = sx(x), Y = sy(P.heightAt(s.course, x)) + dy;
      c[i ? 'lineTo' : 'moveTo'](X, Y);
    }
  }

  function flats(c, s, th, list) {
    var k = view.k, band = clamp(k * 0.55, 7, 26), t = s.reduced ? 0 : s.time;
    for (var n = 0; n < list.length; n++) {
      var f = list[n];
      if (f.x + f.hw < view.minX - 4 || f.x - f.hw > view.maxX + 4) continue;
      var x0 = f.x - f.hw, x1 = f.x + f.hw;
      if (f.type === 'water') {
        var top = sy(f.level), deep = Math.max(10, k * 1.1);
        c.fillStyle = '#2f8fe8';
        c.beginPath(); c.roundRect(sx(x0) - 4, top, (x1 - x0) * k + 8, deep, [0, 0, 12, 12]); c.fill();
        c.fillStyle = '#7fd4ff'; c.fillRect(sx(x0) - 4, top, (x1 - x0) * k + 8, Math.max(3, k * 0.18));
        c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = 2.5; c.beginPath();
        for (var w = 0; w < 3; w++) {
          var wx = sx(x0 + (x1 - x0) * (0.2 + w * 0.3)) + Math.sin(t * 2 + w) * 6;
          c.moveTo(wx - 8, top + deep * 0.45); c.quadraticCurveTo(wx, top + deep * 0.3, wx + 8, top + deep * 0.45);
        }
        c.stroke();
        c.beginPath(); c.moveTo(sx(x0) - 4, top); c.lineTo(sx(x1) + 4, top); inked(c, 3);
      } else if (f.type === 'sand' || f.type === 'ice' || f.type === 'green') {
        var col = f.type === 'sand' ? '#ffe39a' : f.type === 'ice' ? '#bff3ff' : th.green;
        surfaceRun(c, s, x0, x1, band * 0.5); c.lineWidth = band; c.strokeStyle = col; c.lineCap = 'butt'; c.stroke();
        if (f.type === 'green') {
          c.globalAlpha = 0.35; c.strokeStyle = '#ffffff'; c.lineWidth = band;
          for (var g = 0; g < 4; g++) { surfaceRun(c, s, x0 + g * f.hw / 2, x0 + g * f.hw / 2 + f.hw / 4, band * 0.5); c.stroke(); }
          c.globalAlpha = 1;
        } else if (f.type === 'sand') {
          c.fillStyle = '#e2b55c';
          for (var d = 0; d < 9; d++) fillCircle(c, sx(x0 + (d + 0.5) * (x1 - x0) / 9), sy(f.level) + band * (0.35 + 0.3 * (d % 2)), Math.max(1.5, k * 0.07), '#e2b55c');
        } else {
          c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = Math.max(2, k * 0.1);
          surfaceRun(c, s, x0 + f.hw * 0.3, x0 + f.hw * 0.9, band * 0.3); c.stroke();
        }
        surfaceRun(c, s, x0, x1, 0); inked(c, 3.5);
        if (f.type === 'green') flag(c, s, f);
      } else if (f.type === 'crater') {
        surfaceRun(c, s, x0, x1, band * 0.5); c.lineWidth = band; c.strokeStyle = '#a7a2d2'; c.lineCap = 'butt'; c.stroke();
        surfaceRun(c, s, x0, x1, 0); inked(c, 3.5);
      }
    }
  }

  function flag(c, s, f) {
    var k = view.k, X = sx(f.holeX), Y = sy(f.level);
    c.fillStyle = INK; c.beginPath(); c.ellipse(X, Y + 1, Math.max(4, k * 0.5), Math.max(2, k * 0.16), 0, 0, TAU); c.fill();
    var pole = Math.max(30, k * 3.4), wave = s.reduced ? 0 : Math.sin(s.time * 5 + f.x) * 0.25;
    c.beginPath(); c.moveTo(X, Y); c.lineTo(X, Y - pole); c.lineWidth = Math.max(2.5, k * 0.12); c.strokeStyle = '#f4f1ff'; c.stroke();
    var fw = pole * 0.45, fh = pole * 0.28;
    c.beginPath(); c.moveTo(X, Y - pole);
    c.quadraticCurveTo(X + fw * 0.5, Y - pole + fh * (0.1 + wave), X + fw, Y - pole + fh * 0.5);
    c.quadraticCurveTo(X + fw * 0.5, Y - pole + fh * (0.9 + wave), X, Y - pole + fh);
    c.closePath(); c.fillStyle = '#ff3f5e'; c.fill(); inked(c, 2.5);
  }

  /* ---------------------------------------------------------- objects */
  function pad(c, s, f, world) {
    var k = view.k, X = sx(f.x), Y = sy(f.level), w = f.hw * k * 1.1;
    var pulse = s.padPulse && s.padPulse.x === f.x ? clamp(1 - s.padPulse.t / 0.35, 0, 1) : 0;
    var squash = 1 - pulse * 0.45 + (pulse > 0 ? Math.sin(pulse * 12) * 0.12 * pulse : 0);
    c.save(); c.translate(X, Y);
    if (world === 0) {
      // A bouncy mushroom.
      var hgt = w * 0.9 * squash;
      c.beginPath(); c.roundRect(-w * 0.22, -hgt, w * 0.44, hgt, 6); c.fillStyle = '#fff1d6'; c.fill(); inked(c, 3);
      c.beginPath(); c.ellipse(0, -hgt, w * 0.62, w * 0.42 * squash, 0, Math.PI, TAU); c.closePath(); c.fillStyle = '#ff4f5e'; c.fill(); inked(c, 3.5);
      fillCircle(c, -w * 0.28, -hgt - w * 0.18 * squash, w * 0.1, '#ffffff');
      fillCircle(c, w * 0.12, -hgt - w * 0.28 * squash, w * 0.12, '#ffffff');
      fillCircle(c, w * 0.38, -hgt - w * 0.08 * squash, w * 0.07, '#ffffff');
    } else {
      var colors = [null, ['#ffcf3a', '#e05a3a'], ['#7fe3ff', '#3f7fd8'], ['#ff8fd0', '#8a6cff'], ['#7dffcf', '#6d4fd6']][world];
      var hs = w * 0.55 * squash;
      c.beginPath();
      for (var z = 0; z <= 6; z++) c.lineTo((z % 2 ? 1 : -1) * w * 0.32, -z * hs / 6);
      c.lineWidth = Math.max(3, k * 0.18); c.strokeStyle = '#8a8fb0'; c.stroke();
      c.beginPath(); c.roundRect(-w * 0.62, -hs - w * 0.18, w * 1.24, w * 0.2, 6); c.fillStyle = colors[0]; c.fill(); inked(c, 3);
      c.beginPath(); c.roundRect(-w * 0.5, -w * 0.08, w, w * 0.12, 4); c.fillStyle = colors[1]; c.fill(); inked(c, 2.5);
    }
    c.restore();
  }

  function prop(c, s, o) {
    var k = view.k, X = sx(o.x), G = sy(o.ground), C = sy(o.ground + o.lift), R = o.r * k;
    if (X < -R * 2 || X > W + R * 2) return;
    var hit = s.propHit && s.propHit.id === o.id ? clamp(1 - s.propHit.t / 0.4, 0, 1) : 0;
    var wob = hit ? Math.sin(hit * 20) * 0.08 * hit : 0;
    c.save(); c.translate(X, G); c.rotate(wob); c.translate(-X, -G);
    if (o.type === 'tree') {
      c.beginPath(); c.roundRect(X - R * 0.18, C, R * 0.36, G - C + 4, 4); c.fillStyle = '#8a5531'; c.fill(); inked(c, 3);
      var crown = [X - R * 0.45, C + R * 0.15, R * 0.62, X + R * 0.45, C + R * 0.1, R * 0.66, X, C - R * 0.3, R * 0.75];
      blob(c, crown); inked(c, 7);
      blob(c, crown); c.fillStyle = '#3fb653'; c.fill();
      fillCircle(c, X - R * 0.2, C - R * 0.5, R * 0.3, '#7fe06a');
      fillCircle(c, X + R * 0.5, C + R * 0.25, R * 0.15, '#ff5f6f');
      fillCircle(c, X - R * 0.55, C + R * 0.3, R * 0.13, '#ff5f6f');
    } else if (o.type === 'cactus') {
      var cw = R * 0.62;
      c.beginPath();
      c.roundRect(X - cw / 2, C - R * 0.9, cw, G - C + R * 0.9 + 4, cw / 2);
      c.roundRect(X - cw * 1.55, C - R * 0.2, cw * 0.55, R * 0.95, cw * 0.27);
      c.roundRect(X - cw * 1.55, C + R * 0.45, cw * 1.2, cw * 0.5, cw * 0.25);
      c.roundRect(X + cw, C - R * 0.6, cw * 0.55, R * 0.8, cw * 0.27);
      c.roundRect(X + cw * 0.35, C + R * 0.05, cw * 1.2, cw * 0.5, cw * 0.25);
      c.fillStyle = '#3fbf6e'; c.fill(); inked(c, 3);
      c.fillStyle = '#7ee39a'; c.fillRect(X - cw * 0.12, C - R * 0.7, cw * 0.18, G - C + R * 0.4);
      fillCircle(c, X, C - R * 0.95, R * 0.24, '#ff6fa8'); circle(c, X, C - R * 0.95, R * 0.24); inked(c, 2.5);
    } else if (o.type === 'pine') {
      c.beginPath(); c.rect(X - R * 0.15, C + R * 0.6, R * 0.3, G - C - R * 0.6 + 4); c.fillStyle = '#7a4a2c'; c.fill(); inked(c, 3);
      for (var t = 0; t < 3; t++) {
        var ty = C + R * (0.9 - t * 0.75), tw = R * (1.15 - t * 0.28);
        c.beginPath(); c.moveTo(X, ty - R * 1.05); c.lineTo(X + tw, ty); c.lineTo(X - tw, ty); c.closePath();
        c.fillStyle = '#2f8a6a'; c.fill(); inked(c, 3);
        c.beginPath(); c.moveTo(X, ty - R * 1.05); c.lineTo(X + tw * 0.42, ty - R * 0.6); c.lineTo(X - tw * 0.42, ty - R * 0.6); c.closePath();
        c.fillStyle = '#ffffff'; c.fill();
      }
    } else if (o.type === 'puff') {
      c.save(); c.translate(X, C);
      var sq = 1 + hit * 0.25;
      c.scale(sq, 1 / sq);
      var fluff = [-R * 0.55, R * 0.15, R * 0.55, R * 0.5, R * 0.2, R * 0.6, 0, -R * 0.2, R * 0.75];
      blob(c, fluff); inked(c, 7);
      blob(c, fluff); c.fillStyle = '#ffffff'; c.fill();
      fillCircle(c, -R * 0.3, R * 0.1, R * 0.12, '#ffb3d9'); fillCircle(c, R * 0.42, R * 0.1, R * 0.12, '#ffb3d9');
      c.beginPath(); c.arc(-R * 0.18, -R * 0.08, R * 0.08, Math.PI, TAU); c.arc(R * 0.3, -R * 0.08, R * 0.08, Math.PI, TAU);
      c.moveTo(-R * 0.05, R * 0.12); c.quadraticCurveTo(R * 0.06, R * 0.26, R * 0.17, R * 0.12);
      c.lineWidth = Math.max(2, R * 0.06); c.strokeStyle = INK; c.stroke();
      c.restore();
    } else {
      // Crystal cluster.
      var cols = ['#8ff7ff', '#c79bff', '#7dffc6'];
      for (var q = -1; q <= 1; q++) {
        var cx = X + q * R * 0.55, top = C - R * (q ? 0.5 : 1.1), base = G + 3, half = R * (q ? 0.28 : 0.38);
        c.beginPath(); c.moveTo(cx, top); c.lineTo(cx + half, top + half * 1.2); c.lineTo(cx + half * 0.8, base); c.lineTo(cx - half * 0.8, base); c.lineTo(cx - half, top + half * 1.2); c.closePath();
        c.fillStyle = cols[q + 1]; c.fill(); inked(c, 3);
        c.fillStyle = 'rgba(255,255,255,0.6)'; c.fillRect(cx - half * 0.35, top + half * 1.3, half * 0.25, (base - top) * 0.5);
      }
    }
    c.restore();
  }

  function coin(c, s, o) {
    var k = view.k, X = sx(o.x), Y = sy(o.y);
    if (X < -20 || X > W + 20 || Y < -20 || Y > H + 20) return;
    var t = s.reduced ? 0 : s.time, r = clamp(k * 0.5, 6, 15);
    if (s.ball && !s.ball.done && s.magnet) {
      // Coins near the ball lean towards it.
      var dx = s.ball.x - o.x, dy = s.ball.y - o.y, d = Math.hypot(dx, dy), reach = s.magnet + 2.5;
      if (d < reach) { var pull = (1 - d / reach) * 0.6; X += dx * k * pull; Y -= dy * k * pull; }
    }
    if (o.gem) {
      var gr = r * 1.35, bob = Math.sin(t * 3 + o.id) * 3;
      c.beginPath(); c.moveTo(X, Y - gr + bob); c.lineTo(X + gr * 0.8, Y - gr * 0.25 + bob); c.lineTo(X, Y + gr + bob); c.lineTo(X - gr * 0.8, Y - gr * 0.25 + bob); c.closePath();
      c.fillStyle = '#c86bff'; c.fill(); inked(c, 3);
      c.beginPath(); c.moveTo(X, Y - gr + bob); c.lineTo(X + gr * 0.3, Y - gr * 0.25 + bob); c.lineTo(X, Y + gr * 0.4 + bob); c.lineTo(X - gr * 0.3, Y - gr * 0.25 + bob); c.closePath();
      c.fillStyle = '#f2c9ff'; c.fill();
      return;
    }
    var sw = Math.abs(Math.cos(t * 3 + o.id * 0.7));
    c.beginPath(); c.ellipse(X, Y, r * (0.25 + 0.75 * sw), r, 0, 0, TAU);
    c.fillStyle = '#ffcf26'; c.fill(); inked(c, 2.5);
    if (sw > 0.35) {
      c.beginPath(); c.ellipse(X, Y, r * 0.62 * sw, r * 0.62, 0, 0, TAU); c.lineWidth = 2; c.strokeStyle = '#e59a12'; c.stroke();
      c.fillStyle = '#fff4a8'; c.fillRect(X - r * 0.35 * sw, Y - r * 0.55, r * 0.22 * sw, r * 0.5);
    }
  }

  function ring(c, s, o, half) {
    var k = view.k, X = sx(o.x), Y = sy(o.y), R = o.r * k;
    if (X < -R || X > W + R || Y < -R * 1.2 || Y > H + R * 1.2) return;
    var used = s.ball && s.ball.used['r' + o.id];
    c.save();
    c.globalAlpha = used ? 0.35 : 1;
    var lw = Math.max(5, k * 0.45);
    c.beginPath(); c.ellipse(X, Y, R * 0.38, R, 0, half ? -Math.PI / 2 : Math.PI / 2, half ? Math.PI / 2 : Math.PI * 1.5);
    c.lineWidth = lw + 5; c.strokeStyle = INK; c.lineCap = 'round'; c.stroke();
    c.lineWidth = lw; c.strokeStyle = half ? '#ffb020' : '#ff7a1a'; c.stroke();
    if (half) {
      c.lineWidth = Math.max(2, lw * 0.35); c.strokeStyle = '#fff3b0'; c.stroke();
      if (!used) {
        var t = s.reduced ? 0 : (s.time * 2) % 1;
        c.fillStyle = 'rgba(255,240,140,0.85)';
        for (var a = 0; a < 2; a++) {
          var ax = X - R * 0.2 + ((t + a * 0.5) % 1) * R * 0.6;
          c.beginPath(); c.moveTo(ax, Y - R * 0.3); c.lineTo(ax + R * 0.22, Y); c.lineTo(ax, Y + R * 0.3); c.lineTo(ax + R * 0.08, Y); c.closePath(); c.fill();
        }
      }
    }
    c.restore();
  }

  function balloon(c, s, o) {
    if (s.ball && s.ball.used['b' + o.id]) return;
    var k = view.k, bob = s.reduced ? 0 : Math.sin(s.time * 1.8 + o.id) * 0.25;
    var X = sx(o.x), Y = sy(o.y + bob), R = Math.max(10, o.r * k);
    if (X < -R * 2 || X > W + R * 2 || Y < -R * 2 || Y > H + R * 4) return;
    c.beginPath(); c.moveTo(X, Y + R * 1.1); c.quadraticCurveTo(X - R * 0.4, Y + R * 1.8, X + R * 0.1, Y + R * 2.6);
    c.lineWidth = 2; c.strokeStyle = INK; c.stroke();
    c.beginPath(); c.ellipse(X, Y, R * 0.88, R * 1.08, 0, 0, TAU);
    c.fillStyle = BALLOONS[o.hue % 4]; c.fill(); inked(c, 3);
    c.beginPath(); c.moveTo(X - R * 0.16, Y + R * 1.22); c.lineTo(X + R * 0.16, Y + R * 1.22); c.lineTo(X, Y + R * 1.02); c.closePath(); c.fillStyle = BALLOONS[o.hue % 4]; c.fill(); inked(c, 2);
    c.beginPath(); c.ellipse(X - R * 0.32, Y - R * 0.42, R * 0.18, R * 0.3, -0.5, 0, TAU); c.fillStyle = 'rgba(255,255,255,0.7)'; c.fill();
  }

  // Distance posts, the world best flag and the next world's gate.
  function markers(c, s) {
    var k = view.k, step = k > 14 ? 50 : k > 7 ? 100 : 250;
    c.font = '700 ' + Math.round(clamp(k * 0.75, 13, 22)) + 'px Fredoka';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (var d = Math.max(step, Math.ceil(view.minX / step) * step); d < view.maxX + 4; d += step) {
      var X = sx(d), G = sy(P.heightAt(s.course, d)), h = clamp(k * 2.2, 26, 54), bw = clamp(k * 1.9, 30, 52);
      c.beginPath(); c.moveTo(X, G); c.lineTo(X, G - h); c.lineWidth = 4; c.strokeStyle = '#8a5a35'; c.stroke();
      c.beginPath(); c.roundRect(X - bw / 2, G - h - bw * 0.42, bw, bw * 0.55, 6); c.fillStyle = '#fff5dc'; c.fill(); inked(c, 2.5);
      c.fillStyle = INK; c.fillText(String(d), X, G - h - bw * 0.14);
    }
    if (s.bestX > 20) banner(c, s, s.bestX, 'أفضل ' + Math.floor(s.bestX), '#ffcf26', INK);
    if (s.unlockX) banner(c, s, s.unlockX, 'عالم جديد: ' + s.unlockName, '#8a5cff', '#ffffff');
  }

  function banner(c, s, x, text, bg, fg) {
    var X = sx(x);
    if (X < -160 || X > W + 160) return;
    var k = view.k, G = sy(P.heightAt(s.course, x)), h = clamp(k * 5, 70, 140);
    c.beginPath(); c.moveTo(X, G); c.lineTo(X, G - h); c.lineWidth = 5; c.strokeStyle = '#f4f1ff'; c.stroke(); inked(c, 1.5);
    c.font = '700 20px Fredoka'; c.direction = 'rtl';
    var w = c.measureText(text).width + 26;
    c.beginPath(); c.moveTo(X, G - h); c.lineTo(X + w, G - h); c.lineTo(X + w - 10, G - h + 17); c.lineTo(X + w, G - h + 34); c.lineTo(X, G - h + 34); c.closePath();
    c.fillStyle = bg; c.fill(); inked(c, 3);
    c.fillStyle = fg; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, X + w / 2 - 4, G - h + 18);
    c.direction = 'ltr';
  }

  /* ------------------------------------------------------- the golfer */
  // Design units: about 165 tall, feet at (0, 0), facing right. Angles are
  // screen angles (y down) from the shoulder to the club head.
  var SHOULDER = { x: 6, y: -100 }, REACH = 100, ADDRESS = Math.atan2(92, 54);
  function golfer(c, s) {
    var k = view.k, scale = k / 46, X = sx(-1.3), Y = sy(P.heightAt(s.course, -1.3));
    if (X < -200 || X > W + 200 || Y > H + 220 || Y < -40) return;
    var g = s.golfer || {}, angle = g.angle == null ? ADDRESS : g.angle;
    var t = s.reduced ? 0 : s.time, breathe = Math.sin(t * 3) * 1.5, jump = g.jump || 0;
    c.save(); c.translate(X, Y - jump * scale); c.scale(scale, scale);
    // Shadow
    c.fillStyle = 'rgba(36,19,63,0.22)'; c.beginPath(); c.ellipse(4, 2, 44, 8, 0, 0, TAU); c.fill();
    // Legs and shoes
    c.lineCap = 'round';
    limb(c, -4, -60, -16, -10, 17, '#3b3fa3');
    limb(c, 10, -60, 20, -10, 17, '#3b3fa3');
    shoe(c, -18, -6); shoe(c, 22, -6);
    // Body, bent a little towards the ball
    c.save(); c.translate(2, -58); c.rotate(0.16);
    c.beginPath(); c.roundRect(-17, -50 + breathe * 0.4, 36, 54, 14); c.fillStyle = '#ff4f6d'; c.fill(); inked(c, 4);
    c.fillStyle = '#ffd23f'; c.fillRect(-15, -24 + breathe * 0.4, 32, 7);
    c.restore();
    // Back arm sits behind the club
    var hx = SHOULDER.x + Math.cos(angle) * 40, hy = SHOULDER.y + breathe + Math.sin(angle) * 40;
    var cx = SHOULDER.x + Math.cos(angle) * REACH, cy = SHOULDER.y + breathe + Math.sin(angle) * REACH;
    limb(c, SHOULDER.x - 6, SHOULDER.y + breathe, hx, hy, 12, '#e8a274');
    // Club
    c.beginPath(); c.moveTo(hx, hy); c.lineTo(cx, cy); c.lineWidth = 6; c.strokeStyle = INK; c.stroke();
    c.lineWidth = 3; c.strokeStyle = '#d7dcef'; c.stroke();
    c.save(); c.translate(cx, cy); c.rotate(angle);
    c.beginPath(); c.roundRect(-6, -4, 18, 13, 4); c.fillStyle = '#c3c9e6'; c.fill(); inked(c, 3);
    c.restore();
    // Head
    var headX = 20, headY = -128 + breathe;
    fillCircle(c, headX - 18, headY - 2, 10, '#3a2433');
    circle(c, headX, headY, 24); c.fillStyle = '#e8a274'; c.fill(); inked(c, 4);
    fillCircle(c, headX + 12, headY + 9, 5, 'rgba(255,90,110,0.45)');
    var look = s.phase === 'flight' || s.phase === 'landed' ? -0.6 : 0.9;
    c.beginPath(); c.ellipse(headX + 9, headY - 2, 5, 6.5, 0, 0, TAU); c.fillStyle = '#ffffff'; c.fill(); inked(c, 2);
    fillCircle(c, headX + 10.5, headY - 2 + look * 2.5, 3, INK);
    c.beginPath(); c.arc(headX + 10, headY + 7, 6, 0.2, Math.PI - 0.6); c.lineWidth = 2.5; c.strokeStyle = INK; c.stroke();
    // Cap
    c.beginPath(); c.arc(headX - 1, headY - 6, 24, Math.PI * 1.05, TAU * 0.99); c.closePath(); c.fillStyle = '#2bd1c1'; c.fill(); inked(c, 4);
    c.beginPath(); c.roundRect(headX + 8, headY - 12, 26, 8, 4); c.fillStyle = '#1fa89a'; c.fill(); inked(c, 3);
    fillCircle(c, headX - 2, headY - 28, 4, '#ffd23f');
    // Space helmet on the moon
    if (s.world === 4) {
      circle(c, headX + 2, headY - 2, 34); c.fillStyle = 'rgba(190,240,255,0.25)'; c.fill(); inked(c, 3.5);
      c.beginPath(); c.arc(headX + 2, headY - 2, 27, -2.4, -1.6); c.lineWidth = 5; c.strokeStyle = 'rgba(255,255,255,0.8)'; c.stroke();
    }
    // Front arm
    limb(c, SHOULDER.x + 4, SHOULDER.y + 2 + breathe, hx, hy, 12, '#f0ad80');
    fillCircle(c, hx, hy, 7.5, '#f0ad80'); circle(c, hx, hy, 7.5); inked(c, 3);
    c.restore();
  }
  function limb(c, x1, y1, x2, y2, width, color) {
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2);
    c.lineWidth = width + 7; c.strokeStyle = INK; c.lineCap = 'round'; c.stroke();
    c.lineWidth = width; c.strokeStyle = color; c.stroke();
  }
  function shoe(c, x, y) {
    c.beginPath(); c.roundRect(x - 12, y - 8, 26, 12, 6); c.fillStyle = '#ffffff'; c.fill(); inked(c, 3.5);
    c.fillStyle = '#ff4f6d'; c.fillRect(x - 9, y - 6, 18, 3);
  }

  // The swing gauge: a band around the golfer. The club head is the needle.
  var GAUGE_FROM = 2.2, GAUGE_TO = 4.5;
  function gaugeAngle(value) { return GAUGE_FROM + (GAUGE_TO - GAUGE_FROM) * clamp(value, 0, 1); }
  function gauge(c, s) {
    if (!s.gauge || !s.gauge.show) return;
    var k = view.k, scale = k / 46, X = sx(-1.3) + SHOULDER.x * scale, Y = sy(P.heightAt(s.course, -1.3)) + SHOULDER.y * scale;
    var R = (REACH + 6) * scale, w = 20 * scale, bands = P.bands, v = s.gauge.value;
    var parts = [[0, bands.good, '#8fa3d9'], [bands.good, bands.great, '#ffe14d'], [bands.great, bands.perfect, '#ff9b2f'], [bands.perfect, 1, '#ffd000']];
    c.save();
    c.beginPath(); c.arc(X, Y, R, GAUGE_FROM - 0.03, GAUGE_TO + 0.03); c.lineWidth = w + 9; c.strokeStyle = INK; c.lineCap = 'round'; c.stroke();
    c.lineCap = 'butt';
    for (var n = 0; n < parts.length; n++) {
      c.beginPath(); c.arc(X, Y, R, gaugeAngle(parts[n][0]), gaugeAngle(parts[n][1]));
      c.lineWidth = w; c.strokeStyle = parts[n][2]; c.stroke();
    }
    // The gold zone pulses and sparkles.
    var hot = v >= bands.perfect, pulse = s.reduced ? 0.5 : 0.5 + 0.5 * Math.sin(s.time * 10);
    c.beginPath(); c.arc(X, Y, R, gaugeAngle(bands.perfect), gaugeAngle(1));
    c.lineWidth = w * (hot ? 1.5 : 0.5 + pulse * 0.3); c.strokeStyle = hot ? '#fff6a0' : 'rgba(255,255,255,0.65)'; c.stroke();
    var sa = gaugeAngle(1) + 0.18;
    star(c, X + Math.cos(sa) * R, Y + Math.sin(sa) * R, 13 * scale * (hot ? 1.4 : 1), '#ffd000');
    // Filled part
    c.beginPath(); c.arc(X, Y, R - w * 0.75, GAUGE_FROM, gaugeAngle(v)); c.lineWidth = 5 * scale; c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineCap = 'round'; c.stroke();
    c.restore();
  }
  function star(c, x, y, r, color) {
    c.beginPath();
    for (var n = 0; n < 10; n++) {
      var a = -Math.PI / 2 + n * Math.PI / 5, rr = n % 2 ? r * 0.45 : r;
      c[n ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    c.closePath(); c.fillStyle = color; c.fill(); inked(c, 2.5);
  }

  /* ------------------------------------------------------------ ball */
  function ballRadius() { return clamp(view.k * 0.34, 11, 16); }

  function drawBall(c, skin, x, y, r, spin) {
    var sk = SKINS[skin] || SKINS.classic;
    c.save(); c.translate(x, y);
    if (skin === 'planet') {
      c.beginPath(); c.ellipse(0, 0, r * 1.75, r * 0.5, -0.35, Math.PI, TAU); c.lineWidth = r * 0.32; c.strokeStyle = INK; c.stroke();
      c.lineWidth = r * 0.18; c.strokeStyle = '#ffe0a8'; c.stroke();
    }
    if (skin === 'comet') fillCircle(c, 0, 0, r * 1.45, 'rgba(127,242,255,0.3)');
    circle(c, 0, 0, r); c.fillStyle = sk[0]; c.fill();
    c.save(); circle(c, 0, 0, r); c.clip(); c.rotate(spin);
    if (skin === 'classic') {
      c.fillStyle = sk[1];
      for (var n = 0; n < 7; n++) { var a = n * TAU / 7; fillCircle(c, Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, r * 0.13, sk[1]); }
      fillCircle(c, 0, 0, r * 0.13, sk[1]);
    } else if (skin === 'gold') {
      star(c, 0, 0, r * 0.62, '#fff07a');
    } else if (skin === 'melon') {
      c.strokeStyle = sk[1]; c.lineWidth = r * 0.2;
      for (var m = -2; m <= 2; m++) { c.beginPath(); c.ellipse(m * r * 0.42, 0, r * 0.18, r * 1.1, 0, 0, TAU); c.stroke(); }
    } else if (skin === 'earth') {
      c.fillStyle = '#5fd27a';
      c.beginPath(); c.ellipse(-r * 0.3, -r * 0.2, r * 0.45, r * 0.32, 0.5, 0, TAU); c.fill();
      c.beginPath(); c.ellipse(r * 0.45, r * 0.4, r * 0.3, r * 0.4, -0.4, 0, TAU); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.85)'; c.fillRect(-r, -r * 0.82, r * 2, r * 0.18);
    } else if (skin === 'donut') {
      c.fillStyle = '#ff8fc7'; c.beginPath(); c.arc(0, 0, r * 0.88, 0, TAU); c.fill();
      for (var d = 0; d < 9; d++) { c.fillStyle = RAINBOW[d % 6]; c.save(); c.rotate(d * 0.7); c.fillRect(r * 0.45, -1.5, r * 0.25, 3); c.restore(); }
      fillCircle(c, 0, 0, r * 0.3, sk[1]);
    } else if (skin === 'planet') {
      c.fillStyle = '#ffd28a'; c.fillRect(-r, -r * 0.45, r * 2, r * 0.25);
      c.fillStyle = sk[1]; c.fillRect(-r, r * 0.15, r * 2, r * 0.3);
    } else if (skin === 'comet') {
      fillCircle(c, -r * 0.3, -r * 0.2, r * 0.25, sk[1]); fillCircle(c, r * 0.35, r * 0.3, r * 0.18, sk[1]);
    } else if (skin === 'rainbow') {
      for (var q = 0; q < 6; q++) { c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, r, q * TAU / 6, (q + 1) * TAU / 6); c.closePath(); c.fillStyle = RAINBOW[q]; c.fill(); }
      fillCircle(c, 0, 0, r * 0.35, '#ffffff');
    }
    c.restore();
    c.beginPath(); c.arc(0, 0, r * 0.98, 0.3, 2.2); c.lineWidth = r * 0.22; c.strokeStyle = 'rgba(36,19,63,0.18)'; c.stroke();
    circle(c, 0, 0, r); inked(c, Math.max(2.5, r * 0.2));
    c.beginPath(); c.ellipse(-r * 0.38, -r * 0.42, r * 0.28, r * 0.17, -0.7, 0, TAU); c.fillStyle = 'rgba(255,255,255,0.85)'; c.fill();
    if (skin === 'planet') {
      c.beginPath(); c.ellipse(0, 0, r * 1.75, r * 0.5, -0.35, 0, Math.PI); c.lineWidth = r * 0.32; c.strokeStyle = INK; c.stroke();
      c.lineWidth = r * 0.18; c.strokeStyle = '#ffe0a8'; c.stroke();
    }
    c.restore();
  }

  function ballLayer(c, s) {
    var b = s.ball;
    if (!b) return;
    var r = ballRadius(), sk = SKINS[s.skin] || SKINS.classic;
    var X = sx(b.x), Y = sy(b.y - b.r) - r;
    if (b.hole && b.done) return;
    // Shadow on the ground
    var ground = P.heightAt(s.course, b.x), above = b.y - b.r - ground;
    if (above < 40 && !b.done) {
      var sh = clamp(1 - above / 40, 0.15, 1), GY = sy(ground);
      c.fillStyle = 'rgba(36,19,63,' + (0.3 * sh).toFixed(3) + ')';
      c.beginPath(); c.ellipse(X, GY, r * (0.6 + sh * 0.6), r * 0.3 * sh + 2, 0, 0, TAU); c.fill();
    }
    // Trail
    var tr = s.trail;
    if (tr && tr.length > 1) {
      c.lineCap = 'round'; c.lineJoin = 'round';
      var rainbow = s.skin === 'rainbow';
      for (var n = 1; n < tr.length; n++) {
        var f = n / tr.length;
        c.beginPath(); c.moveTo(sx(tr[n - 1].x), sy(tr[n - 1].y - b.r) - r); c.lineTo(sx(tr[n].x), sy(tr[n].y - b.r) - r);
        c.lineWidth = r * 1.5 * f; c.strokeStyle = rainbow ? RAINBOW[n % 6] : sk[2]; c.globalAlpha = f * 0.75; c.stroke();
      }
      c.globalAlpha = 1;
    }
    // Rocket flame
    if (s.flame > 0) {
      var sp = Math.hypot(b.vx, b.vy) || 1, ux = b.vx / sp, uy = -b.vy / sp, fl = r * (2.2 + Math.sin(s.time * 50) * 0.4) * clamp(s.flame / 0.25, 0.3, 1);
      c.beginPath(); c.moveTo(X - uy * r * 0.7, Y + ux * r * 0.7); c.lineTo(X - ux * (r + fl), Y - uy * (r + fl)); c.lineTo(X + uy * r * 0.7, Y - ux * r * 0.7); c.closePath();
      c.fillStyle = '#ff7a1a'; c.fill(); inked(c, 2.5);
      c.beginPath(); c.moveTo(X - uy * r * 0.4, Y + ux * r * 0.4); c.lineTo(X - ux * (r + fl * 0.6), Y - uy * (r + fl * 0.6)); c.lineTo(X + uy * r * 0.4, Y - ux * r * 0.4); c.closePath();
      c.fillStyle = '#ffe14d'; c.fill();
    }
    speedLines(c, s, X, Y, r);
    // Squash on impact, stretch with speed.
    c.save(); c.translate(X, Y);
    var speed = Math.hypot(b.vx, b.vy), angle = Math.atan2(-b.vy, b.vx), stretch = s.reduced ? 1 : 1 + clamp(speed / 120, 0, 0.25);
    if (s.squash && s.squash.t < 0.18 && !s.reduced) { var q = 1 - s.squash.t / 0.18; angle = s.squash.angle; stretch = 1 - 0.38 * q; }
    c.rotate(angle); c.scale(stretch, 1 / stretch); c.rotate(-angle);
    drawBall(c, s.skin, 0, 0, r, b.x / 0.55 * 0.5);
    c.restore();
    if (b.armed && !b.done) { circle(c, X, Y, r + 7); c.lineWidth = 3; c.strokeStyle = '#7dff8a'; c.stroke(); }
  }

  function reticle(c, s) {
    var rt = s.reticle;
    if (!rt) return;
    var X = sx(rt.x), Y = sy(rt.y), perfect = rt.t <= P.PERFECT_WINDOW, armed = s.ball && s.ball.armed;
    var rr = 14 + rt.t / P.ARM_WINDOW * 34;
    c.save();
    c.beginPath(); c.ellipse(X, Y, rr * 1.4, rr * 0.45, 0, 0, TAU);
    c.lineWidth = 7; c.strokeStyle = INK; c.stroke();
    c.lineWidth = 4; c.strokeStyle = armed ? '#7dff8a' : perfect ? '#ffd000' : '#ffffff'; c.stroke();
    if (perfect && !armed && s.hints) {
      c.font = '700 26px Fredoka'; c.direction = 'rtl'; c.textAlign = 'center'; c.textBaseline = 'bottom';
      c.lineWidth = 7; c.strokeStyle = INK; c.strokeText('الآن!', X, Y - rr * 0.5 - 8);
      c.fillStyle = '#ffd000'; c.fillText('الآن!', X, Y - rr * 0.5 - 8); c.direction = 'ltr';
    }
    c.restore();
  }

  function tee(c, s) {
    if (s.ball && s.phase !== 'ready' && s.phase !== 'title' && s.phase !== 'swing') return;
    var X = sx(0), Y = sy(P.heightAt(s.course, 0)), r = ballRadius();
    c.beginPath(); c.moveTo(X - r * 0.6, Y - r * 0.55); c.lineTo(X + r * 0.6, Y - r * 0.55); c.lineTo(X + 2, Y + 4); c.lineTo(X - 2, Y + 4); c.closePath();
    c.fillStyle = '#ffd23f'; c.fill(); inked(c, 2.5);
    drawBall(c, s.skin, X, Y - r * 0.55 - r + 1, r, 0);
  }

  function landing(c, s) {
    var l = s.landed;
    if (!l) return;
    var X = sx(l.x), Y = sy(P.heightAt(s.course, l.x)), k = view.k;
    var grow = s.reduced ? 1 : clamp(l.t / 0.35, 0, 1), ease = 1 - Math.pow(1 - grow, 3);
    var h = clamp(k * 4.5, 70, 130) * ease;
    c.beginPath(); c.moveTo(X, Y); c.lineTo(X, Y - h); c.lineWidth = 5; c.strokeStyle = '#f4f1ff'; c.stroke(); inked(c, 1.5);
    c.beginPath(); c.moveTo(X, Y - h); c.lineTo(X + 44 * ease, Y - h + 14); c.lineTo(X, Y - h + 28); c.closePath(); c.fillStyle = '#ffd000'; c.fill(); inked(c, 3);
    if (ease > 0.5) {
      c.font = '700 34px Fredoka'; c.textAlign = 'center'; c.textBaseline = 'bottom'; c.direction = 'rtl';
      var text = Math.floor(l.d) + ' م';
      c.lineWidth = 8; c.strokeStyle = INK; c.strokeText(text, X, Y - h - 8);
      c.fillStyle = '#ffffff'; c.fillText(text, X, Y - h - 8); c.direction = 'ltr';
    }
  }

  /* ------------------------------------------------- particles & text */
  function particles(c, s) {
    var list = s.particles;
    for (var n = 0; n < list.length; n++) {
      var p = list[n], f = p.t / p.life, X = sx(p.x), Y = sy(p.y);
      if (X < -40 || X > W + 40 || Y < -40 || Y > H + 40) continue;
      c.globalAlpha = clamp(1 - f, 0, 1);
      if (p.kind === 'dust') fillCircle(c, X, Y, p.size * (0.6 + f * 1.2), p.color);
      else if (p.kind === 'ring') { circle(c, X, Y, p.size * (0.3 + f * 1.7)); c.lineWidth = 5 * (1 - f) + 1; c.strokeStyle = p.color; c.stroke(); }
      else if (p.kind === 'flame') fillCircle(c, X, Y, p.size * (1 - f * 0.7), f < 0.3 ? '#ffe14d' : f < 0.6 ? '#ff8a1a' : '#a8a2c9');
      else if (p.kind === 'spark') star(c, X, Y, p.size * (1 - f * 0.5), p.color);
      else { c.save(); c.translate(X, Y); c.rotate(p.rot); c.fillStyle = p.color; c.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); c.restore(); }
    }
    c.globalAlpha = 1;
  }

  function popups(c, s) {
    var list = s.popups;
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.direction = 'rtl'; c.lineJoin = 'round';
    for (var n = 0; n < list.length; n++) {
      var p = list[n], f = p.t / p.life;
      var pop = s.reduced ? 1 : f < 0.15 ? 0.5 + f / 0.15 * 0.75 : f < 0.25 ? 1.25 - (f - 0.15) * 2.5 : 1;
      var X = p.screen ? p.x : sx(p.x), Y = (p.screen ? p.y : sy(p.y)) - f * 40;
      c.globalAlpha = f > 0.75 ? (1 - f) / 0.25 : 1;
      c.font = '700 ' + Math.round(p.size * pop) + 'px Fredoka';
      c.lineWidth = Math.max(5, p.size * 0.22); c.strokeStyle = INK; c.strokeText(p.text, X, Y);
      c.fillStyle = p.color; c.fillText(p.text, X, Y);
    }
    c.globalAlpha = 1; c.direction = 'ltr';
  }

  // Whoosh streaks around a fast ball, pointing back along its path.
  function speedLines(c, s, X, Y, r) {
    var b = s.ball;
    if (!b || b.done || s.reduced) return;
    var speed = Math.hypot(b.vx, b.vy);
    if (speed < 30) return;
    var a = clamp((speed - 30) / 40, 0, 1) * 0.8, ux = b.vx / speed, uy = -b.vy / speed, t = s.time;
    c.strokeStyle = 'rgba(255,255,255,' + a.toFixed(3) + ')'; c.lineWidth = 3; c.lineCap = 'round';
    c.beginPath();
    for (var n = 0; n < 5; n++) {
      var side = (n - 2) * r * 0.9, phase = (t * 3 + n * 0.37) % 1, back = r * (1.6 + phase * 3.5), len = r * (1.5 + (n % 2));
      var x = X - ux * back - uy * side, y = Y - uy * back + ux * side;
      c.moveTo(x, y); c.lineTo(x - ux * len, y - uy * len);
    }
    c.stroke();
  }

  function spaceLine(c, s) {
    var Y = sy(P.SPACE);
    if (Y < -30 || Y > H + 30) return;
    c.save();
    c.setLineDash([18, 14]); c.lineDashOffset = s.reduced ? 0 : -s.time * 40;
    c.beginPath(); c.moveTo(0, Y); c.lineTo(W, Y); c.lineWidth = 4; c.strokeStyle = s.space ? '#7dff8a' : '#ffd000'; c.stroke();
    c.setLineDash([]);
    c.font = '700 24px Fredoka'; c.direction = 'rtl'; c.textAlign = 'center'; c.textBaseline = 'bottom';
    var labelY = Y < 150 ? Y + 36 : Y - 8;
    c.lineWidth = 7; c.strokeStyle = INK; c.strokeText('حافة الفضاء', 470, labelY);
    c.fillStyle = s.space ? '#7dff8a' : '#ffffff'; c.fillText('حافة الفضاء', 470, labelY);
    c.restore();
  }

  /* ------------------------------------------------------------- draw */
  function draw(ctx, s) {
    var th = THEMES[s.world] || THEMES[0];
    ctx.save();
    ctx.direction = 'ltr';
    setView(s);
    sky(ctx, s, th);
    if (s.shake) ctx.translate(s.shake.x, s.shake.y);
    backdrop(ctx, s, th);
    spaceLine(ctx, s);
    var f = P.features(s.course, view.minX - 8, view.maxX + 8), n;
    for (n = 0; n < f.props.length; n++) if (f.props[n].type === 'puff') prop(ctx, s, f.props[n]);
    terrain(ctx, s, th);
    flats(ctx, s, th, f.flats);
    markers(ctx, s);
    for (n = 0; n < f.props.length; n++) if (f.props[n].type !== 'puff') prop(ctx, s, f.props[n]);
    for (n = 0; n < f.flats.length; n++) if (f.flats[n].type === 'pad' && f.flats[n].x > view.minX - 4 && f.flats[n].x < view.maxX + 4) pad(ctx, s, f.flats[n], s.world);
    for (n = 0; n < f.rings.length; n++) ring(ctx, s, f.rings[n], false);
    var got = s.ball ? s.ball.got : null;
    for (n = 0; n < f.coins.length; n++) if (!got || !got[f.coins[n].id]) coin(ctx, s, f.coins[n]);
    for (n = 0; n < f.balloons.length; n++) balloon(ctx, s, f.balloons[n]);
    gauge(ctx, s);
    golfer(ctx, s);
    tee(ctx, s);
    reticle(ctx, s);
    if (s.ball && s.phase !== 'ready' && s.phase !== 'swing') ballLayer(ctx, s);
    for (n = 0; n < f.rings.length; n++) ring(ctx, s, f.rings[n], true);
    landing(ctx, s);
    particles(ctx, s);
    popups(ctx, s);
    ctx.restore();
    if (s.flash > 0) { ctx.fillStyle = 'rgba(255,255,255,' + Math.min(0.85, s.flash).toFixed(3) + ')'; ctx.fillRect(0, 0, W, H); }
  }

  // A small preview of a ball style for the shop buttons.
  function preview(ctx, skin, size) {
    ctx.clearRect(0, 0, size, size);
    drawBall(ctx, skin, size / 2, size / 2, size * (skin === 'planet' ? 0.26 : 0.36), 0.3);
  }

  window.GolfArt = { draw: draw, preview: preview, PPM: PPM, gaugeAngle: gaugeAngle, ADDRESS: ADDRESS };
})();
