/* Chaos Island drawing. Each island's sky, sea, ground, tree trunk and tower are drawn
 * once into an offscreen canvas per pixel scale; platforms, the house, coins and hazard
 * sprites are drawn once into small canvases and then only blitted. Per frame there are
 * blits and a few plain paths (islanders, jelly, wind, lightning): no shadowBlur, no
 * getImageData. No image files. */
(function () {
  'use strict';
  var CI = window.CI, W = CI.W, H = CI.H, TAU = Math.PI * 2, INK = '#1c2250', G = CI.GROUND;
  var A = CI.art = {};
  var SS = 2;
  A.INK = INK;

  function cv(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
  function circle(g, x, y, r) { g.beginPath(); g.arc(x, y, r, 0, TAU); }
  function ell(g, x, y, rx, ry, rot) { g.beginPath(); g.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot || 0, 0, TAU); }
  function rr(g, x, y, w, h, r, more) {
    r = Math.min(r, w / 2, h / 2);
    if (!more) g.beginPath();
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function ink(g, lw) { g.lineWidth = lw || 5; g.strokeStyle = INK; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke(); }
  function fill(g, c) { g.fillStyle = c; g.fill(); }
  function rgb(hex) { var n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function shade(hex, a) { return 'rgb(' + rgb(hex).map(function (v) { return Math.round(a >= 0 ? v + (255 - v) * a : v * (1 + a)); }).join(',') + ')'; }
  function alpha(hex, a) { return 'rgba(' + rgb(hex).join(',') + ',' + a + ')'; }
  function starPath(g, x, y, R, r, rot) {
    g.beginPath();
    for (var i = 0; i < 10; i++) { var a = (rot || 0) - Math.PI / 2 + i * Math.PI / 5, d = i % 2 ? r : R; g[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * d, y + Math.sin(a) * d); }
    g.closePath();
  }
  function seeded(n) { return function () { n = (n * 16807) % 2147483647; return (n - 1) / 2147483646; }; }
  function vgrad(g, stops, y0, y1) { var gr = g.createLinearGradient(0, y0, 0, y1); stops.forEach(function (s) { gr.addColorStop(s[0], s[1]); }); return gr; }
  A.rr = rr; A.circle = circle; A.shade = shade; A.starPath = starPath;

  var cache = {};
  function sprite(key, w, h, draw) {
    if (cache[key]) return cache[key];
    var c = cv(w * SS, h * SS), g = c.getContext('2d');
    g.scale(SS, SS); draw(g, w, h);
    return (cache[key] = c);
  }
  A.reset = function () { cache = {}; bgs = {}; if (A.resetText) A.resetText(); };

  /* ---------------------------------------------------------------- themes */
  var TH = A.THEMES = {
    beach: { sky: ['#3fbcff', '#a8ecff'], sea: '#22b8d8', seaDeep: '#1287b8', foam: '#eafcff', top: '#ffe7a3', soil: '#ffd27a', soilDark: '#e8ad55',
      speck: '#d99a45', leaf: '#5cc94a', leafDark: '#3a9a35', trunk: '#c08347', wood: '#c9874a', woodDark: '#9b5f2e', post: '#a8693a',
      wall: '#fff0c9', wallDark: '#f2d79a', roof: '#ff7a59', door: '#a35f33', cloud: '#ffffff', jelly: '#7cf06a', far: '#7fd6c9' },
    snow: { sky: ['#7cc6ff', '#e6f6ff'], sea: '#6fc3e6', seaDeep: '#3f93c4', foam: '#ffffff', top: '#ffffff', soil: '#e8f4ff', soilDark: '#bcd8ef',
      speck: '#a7c8e6', leaf: '#2f8f5b', leafDark: '#1f6a43', trunk: '#8a5a36', wood: '#9ad8ff', woodDark: '#5eb0e6', post: '#bfe9ff',
      wall: '#c8875a', wallDark: '#a5683f', roof: '#ffffff', door: '#6d3f22', cloud: '#ffffff', jelly: '#9af0ff', far: '#d9ecff' },
    candy: { sky: ['#ff9bd6', '#ffe4f4'], sea: '#ff86c4', seaDeep: '#e3559f', foam: '#fff0f8', top: '#ff7eb6', soil: '#f4c27a', soilDark: '#d99a52',
      speck: '#fff', leaf: '#ff6fae', leafDark: '#e04b8f', trunk: '#fff4f8', wood: '#f6d39a', woodDark: '#d9a85d', post: '#ffffff',
      wall: '#c8813f', wallDark: '#a6662c', roof: '#ffffff', door: '#7a4a24', cloud: '#ffc7e8', jelly: '#ffd64f', far: '#ffc1e3' },
    sky: { sky: ['#3d8dff', '#bfe4ff'], sea: '#ffffff', seaDeep: '#d6ecff', foam: '#ffffff', top: '#7bdc55', soil: '#a98a6a', soilDark: '#7d6249',
      speck: '#8f7357', leaf: '#53c94f', leafDark: '#33963a', trunk: '#4fb64a', wood: '#b9c3d6', woodDark: '#8592ad', post: '#c8d0e0',
      wall: '#ffe9b8', wallDark: '#e9c77d', roof: '#5aa9ff', door: '#8a5532', cloud: '#ffffff', jelly: '#c38bff', far: '#e8f4ff' }
  };
  A.theme = function (isl) { return TH[isl.id]; };

  /* ----------------------------------------------------------- background */
  // The sky, the far sea, the island's ground, and the tree trunk and tower posts behind
  // the platforms: drawn once per island and pixel scale.
  var bgs = {};
  A.bg = function (isl, ps) {
    var key = isl.id + '@' + ps;
    if (bgs[key]) return bgs[key];
    var c = cv(W * ps, H * ps), g = c.getContext('2d'), t = TH[isl.id], r = seeded(isl.id.length * 977 + 13);
    g.scale(ps, ps);
    g.fillStyle = vgrad(g, [[0, t.sky[0]], [1, t.sky[1]]], 0, 560); g.fillRect(0, 0, W, H);
    if (isl.id === 'beach' || isl.id === 'sky') {
      // A smiling sun.
      var sx = 1000, sy = 92;
      g.fillStyle = 'rgba(255,255,255,0.25)'; circle(g, sx, sy, 92); g.fill();
      circle(g, sx, sy, 58); fill(g, '#ffe14d'); ink(g, 6);
      circle(g, sx - 18, sy - 6, 5); fill(g, INK); circle(g, sx + 18, sy - 6, 5); fill(g, INK);
      g.beginPath(); g.arc(sx, sy + 6, 16, 0.2, Math.PI - 0.2); ink(g, 4);
      circle(g, sx - 30, sy + 10, 7); fill(g, 'rgba(255,120,120,0.45)'); circle(g, sx + 30, sy + 10, 7); fill(g, 'rgba(255,120,120,0.45)');
    }
    if (isl.id === 'candy') {
      // A rainbow made of candy stripes.
      ['#ff5d6c', '#ffb43f', '#ffe14d', '#6fe08a', '#5bc6ff', '#b48cff'].forEach(function (col, i) {
        g.beginPath(); g.arc(640, 640, 560 - i * 22, Math.PI * 1.08, Math.PI * 1.92); g.lineWidth = 22; g.strokeStyle = alpha(col, 0.45); g.stroke();
      });
    }
    if (isl.id === 'snow') {
      // Snowy mountains far away.
      g.fillStyle = '#cfe6fb';
      g.beginPath(); g.moveTo(0, 520); [[90, 380], [200, 470], [330, 330], [470, 470], [600, 360], [760, 480], [900, 340], [1040, 460], [1160, 370], [1280, 450], [1280, 520]].forEach(function (p) { g.lineTo(p[0], p[1]); }); g.closePath(); g.fill();
      g.fillStyle = '#ffffff';
      [[90, 380], [330, 330], [600, 360], [900, 340], [1160, 370]].forEach(function (p) { g.beginPath(); g.moveTo(p[0] - 34, p[1] + 40); g.lineTo(p[0], p[1]); g.lineTo(p[0] + 34, p[1] + 40); g.lineTo(p[0] + 12, p[1] + 30); g.lineTo(p[0], p[1] + 42); g.lineTo(p[0] - 12, p[1] + 30); g.closePath(); g.fill(); });
    }
    // Soft clouds far away.
    for (var i = 0; i < 6; i++) farCloud(g, 80 + i * 220 + r() * 60, 150 + r() * 180, 0.6 + r() * 0.5, isl.id === 'candy' ? '#ffd9ef' : '#ffffff');
    // The sea (or, on the flying island, a sea of clouds).
    var seaTop = isl.id === 'sky' ? 560 : 530;
    if (isl.id === 'sky') {
      g.fillStyle = '#eaf5ff'; g.fillRect(0, seaTop, W, H - seaTop);
      for (var k = 0; k < 22; k++) { var cx = k * 64 + r() * 30, cy = seaTop + 10 + r() * 40; circle(g, cx, cy, 40 + r() * 26); fill(g, k % 2 ? '#ffffff' : '#f4f9ff'); }
    } else {
      g.fillStyle = vgrad(g, [[0, shade(t.sea, 0.25)], [1, t.seaDeep]], seaTop, H); g.fillRect(0, seaTop, W, H - seaTop);
      g.fillStyle = alpha('#ffffff', 0.35); g.fillRect(0, seaTop, W, 4);
      // A tiny island on the horizon.
      g.fillStyle = t.far; ell(g, 260, seaTop + 4, 80, 14); g.fill(); ell(g, 980, seaTop + 6, 60, 10); g.fill();
      if (isl.id === 'snow') for (var f = 0; f < 5; f++) { rr(g, 60 + f * 260 + r() * 80, seaTop + 40 + r() * 60, 70, 14, 7); fill(g, '#ffffff'); }
    }
    drawTrunk(g, isl, t);
    drawTower(g, isl, t);
    drawGround(g, isl, t, r);
    return (bgs[key] = c);
  };
  function farCloud(g, x, y, s, col) {
    g.fillStyle = alpha(col, 0.75);
    [[0, 0, 40], [36, -10, 34], [70, 4, 30], [-34, 6, 28]].forEach(function (p) { circle(g, x + p[0] * s, y + p[1] * s, p[2] * s); g.fill(); });
  }
  // The island: the top layer you walk on, the earth below, and the slopes into the sea.
  function islandPath(g) {
    g.beginPath();
    g.moveTo(CI.EDGE_L, G);
    g.lineTo(CI.EDGE_R, G);
    g.quadraticCurveTo(CI.EDGE_R + 22, G + 4, CI.EDGE_R + 32, G + 40);
    g.lineTo(CI.EDGE_R + 44, H + 10); g.lineTo(CI.EDGE_L - 44, H + 10); g.lineTo(CI.EDGE_L - 32, G + 40);
    g.quadraticCurveTo(CI.EDGE_L - 22, G + 4, CI.EDGE_L, G);
    g.closePath();
  }
  function drawGround(g, isl, t, r) {
    islandPath(g);
    g.fillStyle = vgrad(g, [[0, t.soil], [1, t.soilDark]], G, H); g.fill();
    ink(g, 6);
    g.save(); islandPath(g); g.clip();
    // Specks, pebbles and shells (sprinkles on the candy island).
    for (var i = 0; i < 90; i++) {
      var x = CI.EDGE_L - 30 + r() * (CI.EDGE_R - CI.EDGE_L + 60), y = G + 26 + r() * 100;
      if (isl.id === 'candy') { g.save(); g.translate(x, y); g.rotate(r() * 3); rr(g, -7, -2.5, 14, 5, 2.5); fill(g, ['#ff5d6c', '#5bc6ff', '#ffe14d', '#6fe08a', '#ffffff'][i % 5]); g.restore(); }
      else if (isl.id === 'sky') { ell(g, x, y, 8 + r() * 10, 5 + r() * 5); fill(g, i % 3 ? t.speck : '#6d5540'); }
      else { circle(g, x, y, 2 + r() * 3); fill(g, alpha(t.speck, 0.6)); }
    }
    // The walking layer on top.
    g.beginPath(); g.moveTo(CI.EDGE_L - 40, G - 2); g.lineTo(CI.EDGE_R + 40, G - 2); g.lineTo(CI.EDGE_R + 40, G + 16);
    for (var k = CI.EDGE_R + 40; k > CI.EDGE_L - 40; k -= 26) g.quadraticCurveTo(k - 13, G + (isl.id === 'candy' ? 34 : 22), k - 26, G + 16);
    g.closePath(); fill(g, t.top);
    if (isl.id === 'sky') for (var q = 0; q < 26; q++) { var vx = CI.EDGE_L + r() * (CI.EDGE_R - CI.EDGE_L); g.beginPath(); g.moveTo(vx, G + 18); g.quadraticCurveTo(vx + 8, G + 50, vx - 4, G + 80 + r() * 30); g.lineWidth = 5; g.strokeStyle = '#3e9b3b'; g.stroke(); }
    g.restore();
    g.beginPath(); g.moveTo(CI.EDGE_L, G); g.lineTo(CI.EDGE_R, G); ink(g, 6);
    // Things on the sand: shells and a starfish, snowmen stones, candy drops, flowers.
    var deco = isl.id === 'beach' ? [[470, 'star'], [860, 'shell'], [1150, 'shell']] : isl.id === 'snow' ? [[430, 'stone'], [760, 'stone']] : isl.id === 'candy' ? [[700, 'drop'], [940, 'drop']] : [[400, 'flower'], [830, 'flower'], [960, 'flower']];
    deco.forEach(function (d) {
      var x = d[0], y = G + 10;
      if (d[1] === 'star') { starPath(g, x, y + 4, 12, 5, 0.3); fill(g, '#ff8a5c'); ink(g, 3); }
      else if (d[1] === 'shell') { g.beginPath(); g.moveTo(x - 11, y + 8); g.quadraticCurveTo(x, y - 12, x + 11, y + 8); g.closePath(); fill(g, '#ffd0e0'); ink(g, 3); }
      else if (d[1] === 'stone') { ell(g, x, y + 6, 12, 7); fill(g, '#9fb3c8'); ink(g, 3); }
      else if (d[1] === 'drop') { ell(g, x, y + 4, 10, 8); fill(g, '#6fe08a'); ink(g, 3); }
      else { g.beginPath(); g.moveTo(x, y + 8); g.lineTo(x, y - 8); g.lineWidth = 3; g.strokeStyle = '#2f8a33'; g.stroke(); for (var p = 0; p < 5; p++) { circle(g, x + Math.cos(p * 1.26) * 6, y - 10 + Math.sin(p * 1.26) * 6, 4); fill(g, '#ff9ad5'); } circle(g, x, y - 10, 3.5); fill(g, '#ffe14d'); }
    });
  }
  function drawTrunk(g, isl, t) {
    var x = isl.tree.x, top = isl.tree.top;
    if (isl.id === 'beach') {
      // A palm trunk in chunky rings, bending a little.
      for (var y = G; y > top + 6; y -= 26) {
        var k = (G - y) / (G - top), bx = x + Math.sin(k * 2.2) * 14, w = 26 - k * 6;
        g.beginPath(); g.moveTo(bx - w, y); g.lineTo(bx - w + 4, y - 28); g.lineTo(bx + w - 4, y - 28); g.lineTo(bx + w, y); g.closePath();
        fill(g, k * 10 % 2 < 1 ? t.trunk : shade(t.trunk, -0.08)); ink(g, 4);
      }
    } else if (isl.id === 'snow') {
      g.beginPath(); rr(g, x - 16, top + 30, 32, G - top - 30, 8); fill(g, t.trunk); ink(g, 5);
      // The pine's tiers behind its branches.
      [[top - 10, 70], [top + 80, 110], [top + 170, 140]].forEach(function (tier) {
        g.beginPath(); g.moveTo(x, tier[0]); g.lineTo(x + tier[1], tier[0] + 130); g.lineTo(x - tier[1], tier[0] + 130); g.closePath();
        fill(g, t.leafDark); ink(g, 5);
        g.beginPath(); g.moveTo(x, tier[0] + 4); g.lineTo(x + tier[1] * 0.35, tier[0] + 46); g.lineTo(x - tier[1] * 0.35, tier[0] + 46); g.closePath(); fill(g, '#ffffff');
      });
    } else if (isl.id === 'candy') {
      // A striped lollipop stick.
      g.save(); rr(g, x - 13, top + 20, 26, G - top - 20, 13); fill(g, '#ffffff'); g.clip();
      for (var s = top; s < G; s += 34) { g.beginPath(); g.moveTo(x - 20, s); g.lineTo(x + 20, s + 20); g.lineTo(x + 20, s + 34); g.lineTo(x - 20, s + 14); g.closePath(); fill(g, '#ff5d9e'); }
      g.restore(); rr(g, x - 13, top + 20, 26, G - top - 20, 13); ink(g, 5);
    } else {
      // A giant flower stem with leaves.
      g.beginPath(); g.moveTo(x - 9, G); g.bezierCurveTo(x - 30, G - 120, x + 30, top + 140, x - 6, top + 20); g.lineTo(x + 8, top + 20);
      g.bezierCurveTo(x + 44, top + 140, x - 16, G - 120, x + 9, G); g.closePath(); fill(g, t.trunk); ink(g, 5);
    }
  }
  function drawTower(g, isl, t) {
    var tw = isl.tower, top = isl.plats.filter(function (p) { return p.kind === 'top'; })[0], ys = isl.plats.filter(function (p) { return p.kind === 'plank' || p.kind === 'top'; }).map(function (p) { return p.y; });
    ys.push(G); ys.sort(function (a, b) { return a - b; });
    var x0 = tw.x0 + 12, x1 = tw.x1 - 12;
    // Cross braces between the levels: it reads as a ladder you can climb.
    g.lineWidth = 7; g.lineCap = 'round';
    for (var i = 0; i < ys.length - 1; i++) {
      g.strokeStyle = INK; g.beginPath(); g.moveTo(x0, ys[i] + 18); g.lineTo(x1, ys[i + 1] - 6); g.moveTo(x1, ys[i] + 18); g.lineTo(x0, ys[i + 1] - 6); g.lineWidth = 11; g.stroke();
      g.strokeStyle = isl.id === 'candy' ? '#f6d39a' : shade(t.post, -0.12); g.lineWidth = 6; g.stroke();
    }
    [x0, x1].forEach(function (px) {
      rr(g, px - 10, top.y - 4, 20, G - top.y + 4, 8); fill(g, t.post); ink(g, 5);
      if (isl.id === 'candy') { g.save(); rr(g, px - 10, top.y - 4, 20, G - top.y + 4, 8); g.clip(); for (var s = top.y - 10; s < G; s += 30) { g.beginPath(); g.moveTo(px - 12, s); g.lineTo(px + 12, s + 16); g.lineTo(px + 12, s + 28); g.lineTo(px - 12, s + 12); g.closePath(); fill(g, '#ff4d6d'); } g.restore(); rr(g, px - 10, top.y - 4, 20, G - top.y + 4, 8); ink(g, 5); }
      else if (isl.id === 'snow') { rr(g, px - 4, top.y + 8, 5, G - top.y - 20, 3); fill(g, 'rgba(255,255,255,0.8)'); }
      else if (isl.id === 'sky') { for (var b = top.y + 30; b < G; b += 60) { ell(g, px + 5, b, 6, 4); fill(g, '#7bbf6a'); } }
    });
    // A flag on top.
    var fx = isl.house.side < 0 ? x1 : x0;
    g.beginPath(); g.moveTo(fx, top.y - 2); g.lineTo(fx, top.y - 96); g.lineWidth = 6; g.strokeStyle = INK; g.stroke();
    g.beginPath(); g.moveTo(fx, top.y - 94); g.lineTo(fx + (isl.house.side < 0 ? -50 : 50), top.y - 80); g.lineTo(fx, top.y - 64); g.closePath();
    fill(g, isl.id === 'snow' ? '#ff5d6c' : isl.id === 'candy' ? '#5bc6ff' : isl.id === 'sky' ? '#ffd23f' : '#ff5d6c'); ink(g, 4);
  }

  /* -------------------------------------------------------------- the sea */
  // The waves on both sides of the island, moving gently.
  A.sea = function (ctx, isl, time, still) {
    var t = TH[isl.id], sky = isl.id === 'sky', y0 = 624;
    for (var side = 0; side < 2; side++) {
      var x0 = side ? CI.EDGE_R + 22 : -10, x1 = side ? W + 10 : CI.EDGE_L - 22;
      ctx.beginPath(); ctx.moveTo(x0, H);
      for (var x = x0; side ? x <= x1 : x <= x1; x += 16) ctx.lineTo(x, y0 + Math.sin(x * 0.05 + (still ? 0 : time * 2.4)) * 4);
      ctx.lineTo(x1, H); ctx.closePath();
      ctx.fillStyle = sky ? 'rgba(255,255,255,0.92)' : alpha(t.sea, 0.9); ctx.fill();
      ctx.lineWidth = 4; ctx.strokeStyle = t.foam; ctx.stroke();
    }
    // Foam where the waves meet the island.
    var f = still ? 0 : Math.sin(time * 2) * 3;
    ctx.fillStyle = sky ? '#ffffff' : 'rgba(255,255,255,0.85)';
    ell(ctx, CI.EDGE_L - 26 + f, y0 + 2, 20, 6); ctx.fill(); ell(ctx, CI.EDGE_R + 26 - f, y0 + 2, 20, 6); ctx.fill();
  };

  /* ------------------------------------------------------------ platforms */
  function platSprite(isl, p) {
    var th = isl.id, t = TH[th], key = 'p' + th + p.kind + p.w;
    var wide = p.kind === 'crown' ? 80 : p.kind === 'cloud' ? 30 : p.kind === 'leaf' ? 30 : 10, h = p.kind === 'crate' ? G - p.y + 6 : p.kind === 'crown' ? 120 : 70;
    var sw = p.w + wide * 2;
    var c = sprite(key, sw, h + 20, function (g) {
      g.translate(wide, 10);
      var w = p.w;
      if (p.kind === 'leaf') {
        if (th === 'beach') {
          // A palm frond: a thick blade with leaflets hanging below.
          for (var i = 0; i < 9; i++) { var lx = -20 + i * (w + 40) / 8; g.beginPath(); g.moveTo(lx, 8); g.quadraticCurveTo(lx + 8, 30, lx + 2 + (i - 4) * 3, 40); g.lineTo(lx + 14, 10); g.closePath(); fill(g, t.leafDark); ink(g, 3); }
          g.beginPath(); g.moveTo(-24, 10); g.quadraticCurveTo(w / 2, -12, w + 24, 10); g.quadraticCurveTo(w / 2, 22, -24, 10); fill(g, t.leaf); ink(g, 5);
          g.beginPath(); g.moveTo(-14, 8); g.quadraticCurveTo(w / 2, -2, w + 14, 8); g.lineWidth = 3; g.strokeStyle = shade(t.leaf, 0.35); g.stroke();
        } else if (th === 'snow') {
          rr(g, -10, 2, w + 20, 18, 9); fill(g, t.leafDark); ink(g, 5);
          for (var n = 0; n < 7; n++) { g.beginPath(); g.moveTo(-6 + n * (w + 12) / 6, 18); g.lineTo(n * (w + 12) / 6, 34); g.lineTo(6 + n * (w + 12) / 6, 18); fill(g, t.leaf); }
          rr(g, -12, -4, w + 24, 12, 6); fill(g, '#ffffff'); ink(g, 4);
        } else if (th === 'candy') {
          rr(g, -4, 0, w + 8, 22, 11); fill(g, '#ffffff'); g.save(); g.clip();
          for (var s = -20; s < w + 20; s += 22) { g.beginPath(); g.moveTo(s, 0); g.lineTo(s + 12, 0); g.lineTo(s + 2, 22); g.lineTo(s - 10, 22); g.closePath(); fill(g, '#ff6fae'); }
          g.restore(); rr(g, -4, 0, w + 8, 22, 11); ink(g, 5);
        } else {
          g.beginPath(); g.moveTo(-26, 8); g.quadraticCurveTo(w / 2, -18, w + 26, 8); g.quadraticCurveTo(w / 2, 34, -26, 8); fill(g, t.leaf); ink(g, 5);
          g.beginPath(); g.moveTo(-18, 8); g.lineTo(w + 18, 8); g.lineWidth = 3; g.strokeStyle = t.leafDark; g.stroke();
        }
      } else if (p.kind === 'crown') {
        if (th === 'beach') {
          // The crown of the palm: fronds all round and coconuts.
          [[-70, 46, -0.5], [w + 70, 46, 0.5], [-50, 70, -0.9], [w + 50, 70, 0.9]].forEach(function (f) {
            g.beginPath(); g.moveTo(w / 2, 10); g.quadraticCurveTo((w / 2 + f[0]) / 2, -8, f[0], f[1]); g.quadraticCurveTo((w / 2 + f[0]) / 2, 22, w / 2, 16); fill(g, t.leafDark); ink(g, 4);
          });
          [[w / 2 - 20, 30], [w / 2 + 2, 36], [w / 2 + 22, 30]].forEach(function (k) { circle(g, k[0], k[1], 12); fill(g, '#8a5a2b'); ink(g, 4); circle(g, k[0] - 4, k[1] - 4, 3); fill(g, '#c08a55'); });
          g.beginPath(); g.moveTo(-26, 10); g.quadraticCurveTo(w / 2, -14, w + 26, 10); g.quadraticCurveTo(w / 2, 24, -26, 10); fill(g, t.leaf); ink(g, 5);
        } else if (th === 'snow') {
          g.beginPath(); g.moveTo(w / 2, -40); g.lineTo(w + 16, 18); g.lineTo(-16, 18); g.closePath(); fill(g, t.leafDark); ink(g, 5);
          rr(g, -14, -2, w + 28, 14, 7); fill(g, '#ffffff'); ink(g, 4);
          starPath(g, w / 2, -46, 16, 7); fill(g, '#ffd23f'); ink(g, 4);
        } else if (th === 'candy') {
          // A huge swirl lollipop, its top flat to stand on.
          circle(g, w / 2, 30, w / 2 + 12); fill(g, '#ffe14d'); ink(g, 5);
          g.beginPath(); for (var a = 0; a < 18; a += 0.2) { var rad = 4 + a * (w / 2 + 6) / 18; g.lineTo(w / 2 + Math.cos(a) * rad, 30 + Math.sin(a) * rad); }
          g.lineWidth = 9; g.strokeStyle = '#ff5d9e'; g.stroke();
          rr(g, -10, -2, w + 20, 14, 7); fill(g, '#ffffff'); ink(g, 4);
        } else {
          for (var pe = 0; pe < 10; pe++) { var pa = pe / 10 * TAU; ell(g, w / 2 + Math.cos(pa) * (w / 2), 14 + Math.sin(pa) * 22, 26, 14, pa); fill(g, pe % 2 ? '#ff9ad5' : '#ffb8e3'); ink(g, 3); }
          ell(g, w / 2, 8, w / 2 - 6, 14); fill(g, '#ffe14d'); ink(g, 5);
          for (var dd = 0; dd < 8; dd++) { circle(g, w / 2 - 40 + dd * 11, 8 + (dd % 2) * 5, 2.5); fill(g, '#e8a317'); }
        }
      } else if (p.kind === 'plank' || p.kind === 'top') {
        if (th === 'snow') { rr(g, -4, 0, w + 8, 20, 6); fill(g, t.wood); ink(g, 5); rr(g, 6, 4, w * 0.5, 5, 2.5); fill(g, 'rgba(255,255,255,0.85)'); }
        else if (th === 'candy') { rr(g, -4, 0, w + 8, 20, 5); fill(g, t.wood); ink(g, 5); for (var gx = 14; gx < w; gx += 18) { g.beginPath(); g.moveTo(gx, 3); g.lineTo(gx, 17); g.lineWidth = 2.5; g.strokeStyle = t.woodDark; g.stroke(); } }
        else if (th === 'sky') { g.beginPath(); g.moveTo(-6, 0); g.lineTo(w + 6, 0); g.lineTo(w - 6, 22); g.lineTo(w * 0.6, 30); g.lineTo(w * 0.3, 26); g.lineTo(6, 22); g.closePath(); fill(g, t.wood); ink(g, 5); rr(g, -6, -4, w + 12, 9, 4); fill(g, '#7bdc55'); ink(g, 3); }
        else {
          rr(g, -4, 0, w + 8, 18, 5); fill(g, t.wood); ink(g, 5);
          g.beginPath(); g.moveTo(8, 9); g.lineTo(w * 0.45, 9); g.moveTo(w * 0.55, 6); g.lineTo(w - 8, 6); g.lineWidth = 2.5; g.strokeStyle = t.woodDark; g.stroke();
          circle(g, 6, 9, 2.5); fill(g, INK); circle(g, w - 6, 9, 2.5); fill(g, INK);
        }
      } else if (p.kind === 'crate') {
        var hh = G - p.y;
        if (th === 'sky') { g.beginPath(); g.moveTo(-4, 0); g.lineTo(w + 4, 0); g.lineTo(w - 4, hh * 0.7); g.lineTo(w / 2, hh); g.lineTo(4, hh * 0.7); g.closePath(); fill(g, '#a98a6a'); ink(g, 5); rr(g, -6, -4, w + 12, 10, 5); fill(g, '#7bdc55'); ink(g, 3); }
        else if (th === 'candy') { rr(g, 0, 0, w, hh, 14); fill(g, '#6fe08a'); ink(g, 5); ell(g, w / 2 - 10, 14, 10, 5); fill(g, 'rgba(255,255,255,0.6)'); for (var sp = 0; sp < 6; sp++) { circle(g, 10 + sp * 9, hh - 12 - (sp % 2) * 12, 3); fill(g, '#ffffff'); } }
        else {
          rr(g, 0, 0, w, hh, 6); fill(g, th === 'snow' ? '#b77a4a' : '#d9944f'); ink(g, 5);
          g.beginPath(); g.moveTo(6, 6); g.lineTo(w - 6, hh - 6); g.moveTo(w - 6, 6); g.lineTo(6, hh - 6); g.lineWidth = 6; g.strokeStyle = INK; g.stroke(); g.lineWidth = 3; g.strokeStyle = th === 'snow' ? '#d39a6a' : '#f0b878'; g.stroke();
          if (th === 'snow') { rr(g, -6, -6, w + 12, 14, 7); fill(g, '#ffffff'); ink(g, 4); }
        }
      } else if (p.kind === 'cloud') {
        var col = th === 'candy' ? '#ffc7e8' : '#ffffff';
        [[w * 0.2, 14, 22], [w * 0.5, 6, 28], [w * 0.8, 14, 22], [w * 0.35, 24, 20], [w * 0.65, 24, 20]].forEach(function (b) { circle(g, b[0], b[1] + 6, b[2]); g.lineWidth = 10; g.strokeStyle = INK; g.stroke(); });
        [[w * 0.2, 14, 22], [w * 0.5, 6, 28], [w * 0.8, 14, 22], [w * 0.35, 24, 20], [w * 0.65, 24, 20]].forEach(function (b) { circle(g, b[0], b[1] + 6, b[2]); fill(g, col); });
        rr(g, -4, -2, w + 8, 16, 8); fill(g, col); g.beginPath(); g.moveTo(0, -1); g.lineTo(w, -1); ink(g, 4);
        circle(g, w * 0.4, 22, 3.5); fill(g, INK); circle(g, w * 0.6, 22, 3.5); fill(g, INK);
        g.beginPath(); g.arc(w * 0.5, 26, 6, 0.3, Math.PI - 0.3); ink(g, 3);
      } else if (p.kind === 'cake') {
        rr(g, -6, 0, w + 12, 30, 15); fill(g, '#e8a35b'); ink(g, 5);
        g.beginPath(); g.moveTo(-6, 12); for (var dx = -6; dx <= w + 6; dx += 12) g.quadraticCurveTo(dx + 6, 22, dx + 12, 12); g.lineTo(w + 6, 0); g.lineTo(-6, 0); g.closePath(); fill(g, '#ff7eb6');
        rr(g, -6, 0, w + 12, 30, 15); ink(g, 5);
        for (var sk = 0; sk < 9; sk++) { rr(g, 4 + sk * (w - 8) / 9, 4 + (sk % 2) * 4, 9, 3.5, 1.7); fill(g, ['#5bc6ff', '#ffe14d', '#ffffff'][sk % 3]); }
      }
    });
    return { c: c, ox: wide, oy: 10, w: sw, h: h + 20 };
  }
  A.plat = function (ctx, isl, p, time, still, wind) {
    if (p.gone || p.kind === 'ground' || p.kind === 'roof') return;
    var s = platSprite(isl, p), x = p.x, y = p.y, sway = 0;
    if (p.crack) { x += still ? 0 : Math.sin(time * 46) * 2.2; y += still ? 0 : Math.cos(time * 39) * 1.2; }
    if ((p.kind === 'leaf' || p.kind === 'crown') && !still) sway = Math.sin(time * 1.6 + p.x * 0.01) * 1.5 + wind * 6;
    if (sway) { ctx.save(); ctx.translate(x + p.w / 2, y); ctx.rotate(sway * 0.01); ctx.translate(-x - p.w / 2, -y); }
    ctx.drawImage(s.c, x - s.ox, y - s.oy, s.w, s.h);
    if (sway) ctx.restore();
    if (p.crack) cracks(ctx, p, x, y, time, still);
  };
  // Glowing cracks on a platform about to fall.
  function cracks(ctx, p, x, y, time, still) {
    var glow = still ? 1 : 0.6 + 0.4 * Math.sin(time * 14);
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (var pass = 0; pass < 2; pass++) {
      ctx.beginPath();
      for (var k = 0; k < 3; k++) {
        var cx = x + p.w * (0.2 + k * 0.3);
        ctx.moveTo(cx, y - 1); ctx.lineTo(cx + 7, y + 7); ctx.lineTo(cx - 4, y + 12); ctx.lineTo(cx + 5, y + 19);
      }
      ctx.lineWidth = pass ? 3 : 9; ctx.strokeStyle = pass ? 'rgba(255,250,200,' + glow + ')' : 'rgba(255,120,20,' + (0.8 * glow) + ')';
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ---------------------------------------------------------------- house */
  // The house at the end of the island, its door shut or open. Open, the front becomes a
  // window into the room, and A.houseFront draws its frame over anyone inside.
  function houseSprite(isl, open) {
    var h = isl.house, t = TH[isl.id], w = h.x1 - h.x0, hh = G - h.roofY;
    return sprite('house' + isl.id + (open ? 'o' : 'c'), w + 40, hh + 40, function (g) {
      g.translate(20, 20);
      var door = h.side < 0 ? w - 78 : 14, wallTop = 16;
      rr(g, 0, wallTop, w, hh - wallTop, 6); fill(g, t.wall); ink(g, 5);
      if (isl.id === 'snow') for (var lg = wallTop + 16; lg < hh; lg += 20) { g.beginPath(); g.moveTo(4, lg); g.lineTo(w - 4, lg); g.lineWidth = 3; g.strokeStyle = t.wallDark; g.stroke(); }
      if (isl.id === 'candy') { g.beginPath(); for (var ic = 0; ic <= w; ic += 18) g.lineTo(ic, wallTop + 10 + (ic / 18 % 2) * 10); g.lineWidth = 6; g.strokeStyle = '#ffffff'; g.stroke(); }
      if (open) {
        // The room inside, lit and cosy: wallpaper, a window, a lamp and a rug.
        rr(g, 14, wallTop + 22, w - 28, hh - wallTop - 22, 10); fill(g, '#7a4a8c'); ink(g, 4);
        for (var st = 30; st < w - 20; st += 24) { rr(g, st, wallTop + 26, 10, hh - wallTop - 60, 5); fill(g, '#8d5aa0'); }
        rr(g, 14, hh - 30, w - 28, 30, 6); fill(g, '#b5733f');
        ell(g, w / 2, hh - 8, w * 0.34, 8); fill(g, '#ff7eb6'); ink(g, 3);
        rr(g, w / 2 - 30, wallTop + 36, 60, 40, 8); fill(g, '#bfeaff'); ink(g, 4);
        g.beginPath(); g.moveTo(w / 2, wallTop + 36); g.lineTo(w / 2, wallTop + 76); g.moveTo(w / 2 - 30, wallTop + 56); g.lineTo(w / 2 + 30, wallTop + 56); ink(g, 3);
        var lx = h.side < 0 ? 40 : w - 40;
        g.beginPath(); g.moveTo(lx, hh - 30); g.lineTo(lx, hh - 70); ink(g, 4);
        g.beginPath(); g.moveTo(lx - 16, hh - 70); g.lineTo(lx - 8, hh - 88); g.lineTo(lx + 8, hh - 88); g.lineTo(lx + 16, hh - 70); g.closePath(); fill(g, '#ffe14d'); ink(g, 3);
        circle(g, lx, hh - 66, 26); fill(g, 'rgba(255,230,120,0.25)');
      } else {
        // A round window and the shut door.
        circle(g, h.side < 0 ? 52 : w - 52, wallTop + 44, 22); fill(g, '#bfeaff'); ink(g, 5);
        g.beginPath(); g.moveTo(h.side < 0 ? 30 : w - 74, wallTop + 44); g.lineTo(h.side < 0 ? 74 : w - 30, wallTop + 44); g.moveTo(h.side < 0 ? 52 : w - 52, wallTop + 22); g.lineTo(h.side < 0 ? 52 : w - 52, wallTop + 66); ink(g, 3);
        rr(g, door, hh - 98, 64, 98, 14); fill(g, t.door); ink(g, 5);
        rr(g, door + 12, hh - 84, 40, 26, 8); fill(g, shade(t.door, 0.25)); ink(g, 3);
        circle(g, h.side < 0 ? door + 12 : door + 52, hh - 44, 5); fill(g, '#ffd23f'); ink(g, 2.5);
        // A flower box under the window.
        var fx = h.side < 0 ? 52 : w - 52;
        rr(g, fx - 30, wallTop + 70, 60, 14, 4); fill(g, '#c9874a'); ink(g, 4);
        [-18, 0, 18].forEach(function (d, i) {
          for (var pe = 0; pe < 5; pe++) { circle(g, fx + d + Math.cos(pe * 1.26) * 5, wallTop + 64 + Math.sin(pe * 1.26) * 5, 4); fill(g, ['#ff5d6c', '#ffd23f', '#ff9ad5'][i]); }
          circle(g, fx + d, wallTop + 64, 2.5); fill(g, '#ffffff');
        });
      }
      // The flat roof (you can stand on it) with a little trapdoor.
      rr(g, -12, 0, w + 24, 20, 8); fill(g, t.roof); ink(g, 5);
      if (isl.id === 'snow') { rr(g, -14, -8, w + 28, 14, 7); fill(g, '#ffffff'); ink(g, 4); }
      if (isl.id === 'candy') { for (var dr = 0; dr < w + 20; dr += 22) { g.beginPath(); g.arc(dr - 6, 18, 9, 0, Math.PI); fill(g, '#ffffff'); } rr(g, -12, 0, w + 24, 20, 8); ink(g, 4); }
      rr(g, w / 2 - 26, 4, 52, 9, 3); fill(g, shade(t.roof, -0.2));
    });
  }
  A.house = function (ctx, isl, open) {
    var h = isl.house, s = houseSprite(isl, open);
    ctx.drawImage(s, h.x0 - 20, h.roofY - 20, s.width / SS, s.height / SS);
    if (open) {
      // The door, swung wide open on its hinge beside the doorway.
      var dx = h.side < 0 ? h.x1 + 2 : h.x0 - 2, d = h.side < 0 ? 1 : -1, t = TH[isl.id];
      ctx.beginPath(); ctx.moveTo(dx, G - 98); ctx.lineTo(dx + d * 30, G - 106); ctx.lineTo(dx + d * 30, G - 2); ctx.lineTo(dx, G); ctx.closePath();
      fill(ctx, t.door); ink(ctx, 5);
      circle(ctx, dx + d * 22, G - 46, 4); fill(ctx, '#ffd23f');
    }
  };
  // Ice: a shiny glaze over the sand and every platform, with little icicles.
  A.ice = function (ctx, w, time, still) {
    ctx.fillStyle = 'rgba(190,235,255,0.75)'; ctx.fillRect(CI.EDGE_L, G - 1, CI.EDGE_R - CI.EDGE_L, 13);
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(CI.EDGE_L + 10, G + 2, CI.EDGE_R - CI.EDGE_L - 20, 3);
    w.plats.forEach(function (p) {
      if (p.gone || p.kind === 'ground' || p.kind === 'cloud') return;
      rr(ctx, p.x - 2, p.y - 4, p.w + 4, 9, 4.5); fill(ctx, 'rgba(200,240,255,0.95)'); ink(ctx, 2.5);
      for (var x = p.x + 10; x < p.x + p.w - 6; x += 22) { ctx.beginPath(); ctx.moveTo(x, p.y + 4); ctx.lineTo(x + 4, p.y + 16 + (x % 3) * 3); ctx.lineTo(x + 8, p.y + 4); ctx.closePath(); fill(ctx, 'rgba(220,245,255,0.95)'); }
    });
    if (!still) for (var i = 0; i < 6; i++) { var sx = CI.EDGE_L + ((i * 211 + time * 40) % (CI.EDGE_R - CI.EDGE_L)), a = Math.max(0, Math.sin(time * 3 + i * 1.7)); starPath(ctx, sx, G + 6, 7 * a, 2.5 * a, 0); fill(ctx, 'rgba(255,255,255,' + a + ')'); }
  };
  // The frame of an open front, drawn over the islanders who are inside.
  A.houseFront = function (ctx, isl) {
    var h = isl.house, w = h.x1 - h.x0, hh = G - h.roofY;
    ctx.drawImage(sprite('front' + isl.id, w + 40, hh + 40, function (g) { g.translate(20 - h.x0, 20 - h.roofY); houseFront(g, isl); }), h.x0 - 20, h.roofY - 20, w + 40, hh + 40);
  };
  function houseFront(ctx, isl) {
    var h = isl.house, t = TH[isl.id], w = h.x1 - h.x0, hh = G - h.roofY, x = h.x0, y = h.roofY;
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, hh); rr(ctx, x + 14, y + 38, w - 28, hh - 38, 10, true); ctx.fillStyle = t.wall; ctx.fill('evenodd');
    ctx.beginPath(); ctx.rect(x, y + 16, w, hh - 16); ink(ctx, 5);
    rr(ctx, x + 14, y + 38, w - 28, hh - 38, 10); ink(ctx, 4);
    rr(ctx, x - 12, y, w + 24, 20, 8); fill(ctx, t.roof); ink(ctx, 5);
    if (isl.id === 'snow') { rr(ctx, x - 14, y - 8, w + 28, 14, 7); fill(ctx, '#ffffff'); ink(ctx, 4); }
    ctx.restore();
  }
  // A glowing arrow over the open door: "in here!"
  A.doorHint = function (ctx, isl, time, still) {
    var h = isl.house, x = (h.x0 + h.x1) / 2, y = h.roofY - 70 + (still ? 0 : Math.sin(time * 6) * 8);
    ctx.save(); ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.moveTo(x - 26, y - 30); ctx.lineTo(x + 26, y - 30); ctx.lineTo(x + 26, y); ctx.lineTo(x + 44, y); ctx.lineTo(x, y + 42); ctx.lineTo(x - 44, y); ctx.lineTo(x - 26, y); ctx.closePath();
    fill(ctx, '#ffd23f'); ink(ctx, 6);
    ctx.restore();
    var g = still ? 0.6 : 0.4 + 0.3 * Math.sin(time * 8);
    rr(ctx, h.x0 + 10, h.roofY + 34, h.x1 - h.x0 - 20, G - h.roofY - 34, 12); ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(255,210,63,' + g + ')'; ctx.stroke();
  };

  /* ------------------------------------------------------------ islanders */
  var HATS = A.HATS = ['', 'straw', 'cap', 'party', 'propeller', 'crown', 'flower'];
  // A round islander: squash and stretch from its motion, big eyes that look where it goes.
  // o: { color, hat, extra, face, vx, vy, ground, land, bonk, inv, ghost, time, still, scale, mood, marker, label, blink }
  A.islander = function (ctx, x, y, o) {
    var s = o.scale || 1, t = o.time || 0, still = o.still;
    if (o.ghost) return ghost(ctx, x, y, o);
    var k = 0, sx = 1, sy = 1;
    if (!o.ground) { k = Math.max(-0.16, Math.min(0.2, -o.vy / 4200)); sx = 1 - k; sy = 1 + k; }
    if (o.land > 0) { var q = o.land / 0.22; sx += 0.24 * q; sy -= 0.2 * q; }
    var walk = o.ground && Math.abs(o.vx) > 30 && !still, bob = walk ? Math.abs(Math.sin(t * 16)) * 4 : 0;
    if (!walk && o.ground && !still) { var br = Math.sin(t * 3 + (o.seed || 0)) * 0.03; sx += br; sy -= br; }
    if (o.inv > 0 && !still && Math.floor(t * 12) % 2 === 0) ctx.globalAlpha = 0.45;
    ctx.save();
    ctx.translate(x, y); ctx.scale(s, s);
    // A soft shadow on the ground.
    if (o.ground) { ell(ctx, 0, 1, 24, 6); ctx.fillStyle = 'rgba(28,34,80,0.22)'; ctx.fill(); }
    var lean = o.lean || 0;
    ctx.translate(0, -bob); ctx.rotate(lean);
    var face = o.face || 1, R = 25;
    // Cape behind the body.
    if (o.extra === 'cape') {
      var flap = still ? 0 : Math.sin(t * 9) * 4 - Math.min(14, Math.abs(o.vx) / 22);
      ctx.beginPath(); ctx.moveTo(-16 * face, -40); ctx.quadraticCurveTo(-34 * face + flap * face, -18, -30 * face + flap * face, 2); ctx.lineTo(8 * face, -6); ctx.closePath();
      fill(ctx, '#ff4d6d'); ink(ctx, 4);
    }
    // Feet, then the body (a cached picture per colour, facing, face and extra) squashed.
    var step = walk ? Math.sin(t * 16) * 7 : 0, foot = footSprite(o.color);
    ctx.drawImage(foot, -22 + step, -12, 24, 18); ctx.drawImage(foot, -2 - step, -12, 24, 18);
    var dizzy = o.bonk > 0, blink = !still && (Math.floor(t * 0.7 + (o.seed || 0)) % 5 === 0) && ((t * 0.7 + (o.seed || 0)) % 1 < 0.08);
    var state = dizzy ? 'd' : !o.ground && o.vy > 200 ? 'f' : blink ? 'b' : o.mood === 'up' ? 'u' : 'n';
    ctx.save(); ctx.translate(0, -24); ctx.scale(sx, sy);
    if (s > 1.6) body(ctx, o.color, face, state, o.extra, dizzy ? t : 0);
    else ctx.drawImage(bodySprite(o.color, face, state, o.extra), -36, -36, 72, 72);
    ctx.restore();
    // A zap leaves the hair standing up in yellow spikes for a moment.
    if (o.bonk > 0 && o.bonkKind === 'clouds') {
      var hb = -24 - R * 0.96 * sy + 12;
      ctx.beginPath(); ctx.moveTo(-20, hb);
      for (var z = 0; z < 7; z++) ctx.lineTo(-18 + z * 6, hb - (z % 2 ? 6 : 22));
      ctx.lineTo(20, hb); ctx.closePath(); fill(ctx, '#ffe14d'); ink(ctx, 3.5);
    }
    // Hat, on the top of the squashed head.
    if (o.hat && !(o.bonk > 0 && o.bonkKind === 'clouds')) hat(ctx, o.hat, 0, -24 - R * 0.96 * sy + 4, face, t, still);
    ctx.restore();
    // Spinning stars when bonked.
    if (o.bonk > 0) {
      for (var i = 0; i < 3; i++) {
        var a2 = (still ? 0 : t * 7) + i * TAU / 3, bx = x + Math.cos(a2) * 26 * s, by = y - (64 + Math.sin(a2) * 7) * s;
        starPath(ctx, bx, by, 9 * s, 4 * s, a2); fill(ctx, '#ffe14d'); ink(ctx, 2.5);
      }
    }
    ctx.globalAlpha = 1;
    if (o.marker) marker(ctx, x, y - (o.hat ? 92 : 78) * s - (still ? 0 : Math.abs(Math.sin(t * 4)) * 5), o.marker, o.color);
  };
  function footSprite(color) {
    return sprite('foot' + color, 24, 18, function (g) { ell(g, 12, 9, 9, 6); fill(g, shade(color, -0.35)); ink(g, 3.5); });
  }
  function bodySprite(color, face, state, extra) {
    return sprite('body' + color + face + state + extra, 72, 72, function (g) { g.translate(36, 36); body(g, color, face, state, extra, 0); });
  }
  // The round body with its face: n normal, b blinking, u looking up, f falling (mouth
  // open), d dizzy after a bonk.
  function body(ctx, color, face, state, extra, t) {
    var R = 25, ex = face * 4;
    ell(ctx, 0, 0, R, R * 0.96); fill(ctx, color); ink(ctx, 5);
    ell(ctx, -8, -10, 9, 6, -0.5); fill(ctx, 'rgba(255,255,255,0.55)');
    ell(ctx, 0, 14, 16, 7); fill(ctx, shade(color, 0.3));
    if (extra === 'scarf') {
      ctx.beginPath(); ctx.moveTo(-22, 6); ctx.quadraticCurveTo(0, 16, 22, 6); ctx.lineTo(21, 13); ctx.quadraticCurveTo(0, 23, -21, 13); ctx.closePath(); fill(ctx, '#5bc6ff'); ink(ctx, 3.5);
      rr(ctx, -6 * face - 4, 10, 9, 20, 4); fill(ctx, '#ff5d6c'); ink(ctx, 3);
    }
    [-9, 9].forEach(function (dx) {
      var cx = dx + ex, cy = -4;
      if (state === 'b') { ctx.beginPath(); ctx.moveTo(cx - 6, cy); ctx.lineTo(cx + 6, cy); ink(ctx, 3.5); return; }
      ell(ctx, cx, cy, 7.5, 9); fill(ctx, '#ffffff'); ink(ctx, 3);
      if (state === 'd') { ctx.beginPath(); for (var a = 0; a < 9; a += 0.5) ctx.lineTo(cx + Math.cos(a + t * 8) * a * 0.6, cy + Math.sin(a + t * 8) * a * 0.6); ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke(); }
      else {
        var py = state === 'u' ? -3 : state === 'f' ? 2 : 0;
        circle(ctx, cx + face * 2.5, cy + py, 4.2); fill(ctx, INK); circle(ctx, cx + face * 2.5 - 1.2, cy + py - 1.5, 1.5); fill(ctx, '#fff');
      }
    });
    if (extra === 'glasses') {
      rr(ctx, -18 + ex, -11, 15, 12, 4); fill(ctx, INK); rr(ctx, 3 + ex, -11, 15, 12, 4); fill(ctx, INK);
      ctx.beginPath(); ctx.moveTo(-3 + ex, -7); ctx.lineTo(3 + ex, -7); ink(ctx, 3); rr(ctx, -15 + ex, -9, 5, 3, 1.5); fill(ctx, '#fff');
    }
    ell(ctx, -17 + ex * 0.5, 7, 4.5, 3); fill(ctx, 'rgba(255,90,120,0.4)'); ell(ctx, 17 + ex * 0.5, 7, 4.5, 3); fill(ctx, 'rgba(255,90,120,0.4)');
    if (state === 'd' || state === 'f') { ell(ctx, ex * 0.7, 9, 4.5, 5.5); fill(ctx, INK); }
    else { ctx.beginPath(); ctx.arc(ex * 0.7, 6, 7, 0.25, Math.PI - 0.25); ink(ctx, 3.2); }
  }
  // A hat: a cached picture, with the propeller's blade spinning on top.
  function hat(ctx, kind, x, y, face, t, still) {
    ctx.drawImage(sprite('hat' + kind + face, 96, 72, function (g) { g.translate(48, 52); hatArt(g, kind, face); }), x - 48, y - 52, 96, 72);
    if (kind === 'propeller') {
      var sp = still ? 1 : Math.cos(t * 20);
      ell(ctx, x, y - 26, 22 * Math.abs(sp) + 3, 5); fill(ctx, '#ff5d6c'); ink(ctx, 3);
    }
  }
  function hatArt(ctx, kind, face) {
    if (kind === 'straw') {
      ell(ctx, 0, 2, 32, 8); fill(ctx, '#ffd36b'); ink(ctx, 4);
      rr(ctx, -16, -16, 32, 18, 9); fill(ctx, '#ffd36b'); ink(ctx, 4); rr(ctx, -16, -4, 32, 6, 3); fill(ctx, '#ff5d6c');
    } else if (kind === 'cap') {
      ctx.beginPath(); ctx.moveTo(-19, 3); ctx.quadraticCurveTo(-18, -20, 0, -20); ctx.quadraticCurveTo(18, -20, 19, 3); ctx.closePath(); fill(ctx, '#ff5d6c'); ink(ctx, 4);
      ell(ctx, face * 22, 2, 16, 5); fill(ctx, '#ff5d6c'); ink(ctx, 4); circle(ctx, 0, -19, 4); fill(ctx, '#ffffff'); ink(ctx, 2.5);
    } else if (kind === 'party') {
      ctx.beginPath(); ctx.moveTo(-15, 3); ctx.lineTo(0, -38); ctx.lineTo(15, 3); ctx.closePath(); fill(ctx, '#b48cff'); ink(ctx, 4);
      ctx.save(); ctx.clip(); for (var i = -40; i < 10; i += 12) { ctx.beginPath(); ctx.moveTo(-20, i); ctx.lineTo(20, i + 10); ctx.lineWidth = 4; ctx.strokeStyle = '#ffe14d'; ctx.stroke(); } ctx.restore();
      ctx.beginPath(); ctx.moveTo(-15, 3); ctx.lineTo(0, -38); ctx.lineTo(15, 3); ctx.closePath(); ink(ctx, 4);
      circle(ctx, 0, -40, 6); fill(ctx, '#ff5d9e'); ink(ctx, 3);
    } else if (kind === 'propeller') {
      ctx.beginPath(); ctx.arc(0, 3, 18, Math.PI, 0); ctx.closePath(); fill(ctx, '#4fc3ff'); ink(ctx, 4);
      ctx.beginPath(); ctx.moveTo(0, -15); ctx.lineTo(0, -25); ink(ctx, 3);
    } else if (kind === 'crown') {
      ctx.beginPath(); ctx.moveTo(-17, 3); ctx.lineTo(-19, -18); ctx.lineTo(-9, -8); ctx.lineTo(0, -24); ctx.lineTo(9, -8); ctx.lineTo(19, -18); ctx.lineTo(17, 3); ctx.closePath();
      fill(ctx, '#ffd23f'); ink(ctx, 4); circle(ctx, 0, -4, 4); fill(ctx, '#ff5d6c'); ink(ctx, 2);
    } else if (kind === 'flower') {
      for (var p = 0; p < 5; p++) { circle(ctx, 12 + Math.cos(p * 1.26) * 7, -6 + Math.sin(p * 1.26) * 7, 5.5); fill(ctx, '#ff9ad5'); ink(ctx, 2.5); }
      circle(ctx, 12, -6, 4.5); fill(ctx, '#ffe14d'); ink(ctx, 2.5);
    }
  }
  A.hat = hat;
  // A cute little ghost: the same eyes, a wavy hem, floating.
  function ghost(ctx, x, y, o) {
    var t = o.time || 0, s = o.scale || 1, bob = o.still ? 0 : Math.sin(t * 3 + (o.seed || 0)) * 5, face = o.face || 1;
    ctx.save(); ctx.translate(x, y - 6 + bob); ctx.scale(s, s); ctx.globalAlpha = 0.78;
    ctx.beginPath(); ctx.moveTo(-22, -4); ctx.lineTo(-22, -30); ctx.arc(0, -30, 22, Math.PI, 0); ctx.lineTo(22, -4);
    for (var i = 0; i < 4; i++) ctx.quadraticCurveTo(22 - i * 11 - 5.5, (o.still ? 4 : 4 + Math.sin(t * 8 + i) * 3) + 4, 22 - (i + 1) * 11, -4);
    ctx.closePath(); fill(ctx, '#ffffff'); ink(ctx, 4);
    ell(ctx, 0, -10, 10, 4); fill(ctx, alpha(o.color, 0.5));
    [-8, 8].forEach(function (dx) { ell(ctx, dx + face * 3, -30, 5, 7); fill(ctx, INK); circle(ctx, dx + face * 3 - 1, -32, 1.6); fill(ctx, '#fff'); });
    ell(ctx, face * 3, -18, 4, 3); fill(ctx, INK);
    if (o.hat) hat(ctx, o.hat, 0, -50, face, t, o.still);
    ctx.restore(); ctx.globalAlpha = 1;
    if (o.marker) marker(ctx, x, y - 92 * s + bob, o.marker, o.color);
  }
  // The child's marker over the head: a bouncing arrow, with 1 or 2 in two-player games.
  A.marker = marker;
  function marker(ctx, x, y, label, color) {
    ctx.beginPath(); ctx.moveTo(x - 17, y - 14); ctx.lineTo(x + 17, y - 14); ctx.lineTo(x, y + 8); ctx.closePath(); fill(ctx, label === 'me' ? '#ffffff' : color); ink(ctx, 5);
    if (label === '1' || label === '2') {
      circle(ctx, x, y - 28, 16); fill(ctx, color); ink(ctx, 4);
      text(ctx, label, x, y - 27, 22, '#fff', false, 4);
    }
  }

  /* ------------------------------------------------------------- hazards */
  function marshSprite() {
    return sprite('marsh', 76, 76, function (g) {
      rr(g, 8, 10, 60, 56, 24); fill(g, '#fff6fb'); ink(g, 5);
      ell(g, 38, 18, 26, 8); fill(g, '#ffd9ec');
      ell(g, 24, 30, 6, 4); fill(g, 'rgba(255,255,255,0.9)');
      ell(g, 30, 40, 4, 5.5); fill(g, INK); ell(g, 46, 40, 4, 5.5); fill(g, INK);
      ell(g, 38, 52, 4, 3.5); fill(g, INK);
      ell(g, 22, 48, 5, 3); fill(g, 'rgba(255,120,170,0.5)'); ell(g, 54, 48, 5, 3); fill(g, 'rgba(255,120,170,0.5)');
    });
  }
  function nutSprite() {
    return sprite('nut', 60, 60, function (g) {
      circle(g, 30, 30, 23); fill(g, '#8a5a2b'); ink(g, 5);
      circle(g, 24, 22, 4); fill(g, INK); circle(g, 34, 21, 4); fill(g, INK); circle(g, 29, 30, 4); fill(g, INK);
      ell(g, 20, 36, 6, 4, 0.5); fill(g, 'rgba(255,220,170,0.4)');
    });
  }
  function ballSprite() {
    return sprite('ball', 100, 100, function (g) {
      var cols = ['#ff4d6d', '#ffffff', '#4fc3ff', '#ffffff', '#ffd23f', '#ffffff'];
      for (var i = 0; i < 6; i++) { g.beginPath(); g.moveTo(50, 50); g.arc(50, 50, 44, i * TAU / 6, (i + 1) * TAU / 6); g.closePath(); fill(g, cols[i]); }
      circle(g, 50, 50, 44); ink(g, 5);
      circle(g, 50, 50, 9); fill(g, '#ffffff'); ink(g, 3);
      ell(g, 34, 30, 12, 7, -0.6); fill(g, 'rgba(255,255,255,0.65)');
    });
  }
  function snowSprite() {
    return sprite('snowb', 64, 64, function (g) {
      circle(g, 32, 32, 26); fill(g, '#ffffff'); ink(g, 5);
      [[22, 24], [40, 20], [36, 40], [20, 40], [30, 31]].forEach(function (p) { circle(g, p[0], p[1], 3); fill(g, '#cde6ff'); });
      ell(g, 23, 21, 6, 4, -0.5); fill(g, '#eaf6ff');
    });
  }
  // A target on the surface where something will land: a shadow that grows and a ring.
  A.target = function (ctx, x, y, r, k, time, still, color) {
    k = Math.max(0, Math.min(1, k));
    ell(ctx, x, y + 2, r * (0.45 + 0.75 * k), r * 0.28 * (0.45 + 0.75 * k)); ctx.fillStyle = 'rgba(28,34,80,' + (0.18 + 0.32 * k) + ')'; ctx.fill();
    var pulse = still ? 0 : Math.sin(time * 14) * 0.08;
    ell(ctx, x, y + 2, r * (1.15 + pulse), r * 0.34 * (1.15 + pulse)); ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.stroke();
    ctx.lineWidth = 3; ctx.strokeStyle = color || (k > 0.6 ? '#ff4d4d' : '#ffd23f'); ctx.stroke();
  };
  A.drop = function (ctx, h, time, still, isl) {
    var s = h.art === 'meteor' ? marshSprite() : nutSprite(), size = h.art === 'meteor' ? 76 : 60, y = h.y;
    if (h.state === 'warn') {
      // A coconut is first shaken up out of the palm, high into the sky.
      var k = (time - h.born) / 0.55;
      if (h.art !== 'meteor' && isl && k < 1) {
        var tx = isl.tree.x, ty = isl.tree.top - 10;
        ctx.save(); ctx.translate(tx + (h.x - tx) * k * 0.35, ty - k * (ty + 60) + Math.sin(k * Math.PI) * -40); ctx.rotate(still ? 0 : time * 10);
        ctx.drawImage(s, -size / 2, -size / 2, size, size); ctx.restore();
      }
      return;
    }
    if (h.state === 'land') ctx.globalAlpha = Math.max(0, 1 - h.fade / 0.8);
    if (h.state === 'fall' && h.art === 'meteor' && !still) {
      // A sparkly candy trail.
      for (var i = 1; i <= 4; i++) { circle(ctx, h.x + Math.sin(i * 2.1) * 6, y - i * 26, 10 - i * 1.8); ctx.fillStyle = ['#ffb3de', '#b5f0ff', '#fff3a8', '#d9c4ff'][i - 1]; ctx.fill(); }
    }
    ctx.save(); ctx.translate(h.x, y);
    if (h.art !== 'meteor') ctx.rotate(still ? 0 : time * 8);
    ctx.drawImage(s, -size / 2, -size / 2, size, size);
    ctx.restore(); ctx.globalAlpha = 1;
  };
  A.ball = function (ctx, h, time, still) {
    if (time < h.enter) return;
    ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(still ? 0 : h.spin);
    ctx.drawImage(ballSprite(), -50, -50, 100, 100); ctx.restore();
  };
  A.snowball = function (ctx, h, time, still) {
    if (time < h.enter) return;
    ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(still ? 0 : h.spin);
    ctx.drawImage(snowSprite(), -32, -32, 64, 64); ctx.restore();
  };
  // A warning sign at the edge of the screen: "!" with an arrow where it comes from.
  A.edgeSign = function (ctx, x, y, dir, time, still, icon) {
    var p = still ? 1 : 1 + Math.sin(time * 12) * 0.08;
    ctx.save(); ctx.translate(x, y); ctx.scale(p, p);
    circle(ctx, 0, 0, 30); fill(ctx, '#ffd23f'); ink(ctx, 6);
    text(ctx, '!', 0, 2, 40, INK, false, 0);
    ctx.beginPath(); ctx.moveTo(dir * 38, -14); ctx.lineTo(dir * 62, 0); ctx.lineTo(dir * 38, 14); ctx.closePath(); fill(ctx, '#ffffff'); ink(ctx, 5);
    ctx.restore();
    if (icon) icon();
  };
  A.ballIcon = function (ctx, x, y, s) { ctx.drawImage(ballSprite(), x - 50 * s, y - 50 * s, 100 * s, 100 * s); };
  A.snowIcon = function (ctx, x, y, s) { ctx.drawImage(snowSprite(), x - 32 * s, y - 32 * s, 64 * s, 64 * s); };
  A.marshIcon = function (ctx, x, y, s) { ctx.drawImage(marshSprite(), x - 38 * s, y - 38 * s, 76 * s, 76 * s); };
  A.nutIcon = function (ctx, x, y, s) { ctx.drawImage(nutSprite(), x - 30 * s, y - 30 * s, 60 * s, 60 * s); };

  // A storm cloud: grey and sleepy while drifting, dark and cross while it charges.
  A.stormCloud = function (ctx, c, time, still) {
    var charge = c.state === 'charge' && c.h ? Math.min(1, (time - c.h.born) / (c.h.fire - c.h.born)) : 0, fade = c.state === 'leave' ? Math.max(0, 1 - c.fade) : 1;
    var flick = charge > 0.5 && !still && Math.floor(time * 18) % 2 === 0;
    var col = flick ? '#fff7b0' : charge ? shade('#9aa4c4', -0.45 * charge) : '#b7c0da', x = c.x, y = c.y + (still ? 0 : Math.sin(time * 1.5 + c.id) * 3);
    ctx.save(); ctx.globalAlpha = fade;
    var puffs = [[-50, 6, 30], [-18, -10, 38], [24, -6, 34], [54, 8, 28], [0, 14, 34]];
    puffs.forEach(function (p) { circle(ctx, x + p[0], y + p[1], p[2]); ctx.lineWidth = 11; ctx.strokeStyle = INK; ctx.stroke(); });
    puffs.forEach(function (p) { circle(ctx, x + p[0], y + p[1], p[2]); fill(ctx, col); });
    var ey = y + 4;
    [-14, 14].forEach(function (dx) { ell(ctx, x + dx, ey, 4.5, charge ? 3.5 : 5.5); fill(ctx, INK); });
    if (charge) { ctx.beginPath(); ctx.moveTo(x - 24, ey - 14); ctx.lineTo(x - 8, ey - 8); ctx.moveTo(x + 24, ey - 14); ctx.lineTo(x + 8, ey - 8); ink(ctx, 4); }
    ctx.beginPath(); if (charge) ctx.arc(x, ey + 18, 7, Math.PI + 0.4, -0.4); else ctx.arc(x, ey + 8, 6, 0.3, Math.PI - 0.3); ink(ctx, 3.5);
    ctx.restore();
  };
  // The lit column under a charging cloud, then the zap itself.
  A.zap = function (ctx, h, time, still) {
    var k = Math.min(1, (time - h.born) / (h.fire - h.born));
    var top = h.y0 || 170;
    if (time < h.fire) {
      var a = 0.16 + 0.24 * k + (still ? 0 : Math.sin(time * (10 + k * 14)) * 0.08);
      ctx.fillStyle = 'rgba(255,236,90,' + a + ')'; ctx.fillRect(h.x - h.hw, top, h.hw * 2, G - top);
      ctx.save(); ctx.beginPath(); ctx.rect(h.x - h.hw, top, h.hw * 2, G - top); ctx.clip();
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.25 + 0.2 * k) + ')'; ctx.lineWidth = 10;
      var off = still ? 0 : (time * 120) % 40;
      for (var y = 70 + off; y < G + 40; y += 40) { ctx.beginPath(); ctx.moveTo(h.x - h.hw - 20, y); ctx.lineTo(h.x + h.hw + 20, y - 40); ctx.stroke(); }
      ctx.restore();
      ell(ctx, h.x, G + 2, h.hw, 10); ctx.lineWidth = 5; ctx.strokeStyle = k > 0.6 ? '#ff4d4d' : '#ffd23f'; ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(255,255,220,0.55)'; ctx.fillRect(h.x - h.hw, top, h.hw * 2, G - top);
      var r = seeded(Math.floor(time * 30) + h.id), px = h.x, py = top;
      ctx.beginPath(); ctx.moveTo(px, py);
      while (py < G) { py += 40 + r() * 30; px = h.x + (r() - 0.5) * h.hw * 1.2; ctx.lineTo(px, Math.min(G, py)); }
      ctx.lineWidth = 18; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.stroke();
      ctx.lineWidth = 11; ctx.strokeStyle = '#ffe14d'; ctx.stroke();
      ctx.lineWidth = 4; ctx.strokeStyle = '#ffffff'; ctx.stroke();
    }
  };
  // The cartoon tornado: a wobbling funnel, wide at the top, with white swirls running
  // round it and leaves caught in it.
  A.twister = function (ctx, h, time, still, isl) {
    var g = h.grow, x = h.x, spin = still ? 0 : time * 9, top = 110 + (1 - g) * 300, bot = G - 4, n = 10;
    ctx.save(); ctx.globalAlpha = 0.45 + 0.55 * g;
    var L = [], R = [];
    for (var i = 0; i <= n; i++) {
      var k = i / n, y = bot - k * (bot - top), half = (14 + k * k * 78 + k * 12) * (0.4 + 0.6 * g), wob = still ? 0 : Math.sin(spin * 0.5 + k * 5) * 14 * k;
      L.push([x + wob - half, y]); R.push([x + wob + half, y]);
    }
    ctx.beginPath(); ctx.moveTo(L[0][0], L[0][1]);
    L.forEach(function (p) { ctx.lineTo(p[0], p[1]); });
    for (var r = R.length - 1; r >= 0; r--) ctx.lineTo(R[r][0], R[r][1]);
    ctx.closePath(); fill(ctx, '#d3dbef'); ink(ctx, 6);
    // Swirl stripes going round the funnel.
    ctx.save(); ctx.clip();
    for (var sI = 0; sI < 7; sI++) {
      var y0 = bot - ((sI / 7 + (still ? 0 : time * 0.6)) % 1) * (bot - top), k2 = (bot - y0) / (bot - top);
      var hw = (14 + k2 * k2 * 78 + k2 * 12) * (0.4 + 0.6 * g), cx = x + (still ? 0 : Math.sin(spin * 0.5 + k2 * 5) * 14 * k2);
      ctx.beginPath(); ctx.ellipse(cx, y0, hw * 0.95, 6 + k2 * 10, 0, 0.15, Math.PI - 0.15);
      ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.stroke();
      ctx.beginPath(); ctx.ellipse(cx, y0 + 12, hw * 0.9, 6 + k2 * 10, 0, 0.3, Math.PI - 0.3);
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(120,135,180,0.55)'; ctx.stroke();
    }
    ctx.restore();
    ell(ctx, x, top, (104 * (0.4 + 0.6 * g)), 16 * g + 4); fill(ctx, '#eef2fb'); ink(ctx, 5);
    ell(ctx, x, bot + 2, 46 * g + 10, 8); ctx.fillStyle = 'rgba(28,34,80,0.22)'; ctx.fill();
    for (var l = 0; l < 6; l++) {
      var la = spin * 0.8 + l * 1.05, lk = (l + 0.5) / 6, ly = bot - 30 - lk * (bot - top - 40), lr = (24 + lk * 70) * g;
      ell(ctx, x + Math.cos(la) * lr, ly + Math.sin(la) * 8, 9, 4.5, la); fill(ctx, l % 2 ? TH[isl.id].leaf : '#c08347'); ink(ctx, 2);
    }
    ctx.restore();
  };

  /* ---------------------------------------------------------------- jelly */
  // The wobbly flood: translucent, with a bright top and bubbles; the dashed line shows
  // where it will rise next.
  A.jelly = function (ctx, isl, j, time, still) {
    if (j.y >= CI.SEA + 30) return;
    var col = TH[isl.id].jelly, y = j.y;
    ctx.beginPath(); ctx.moveTo(0, H);
    for (var x = 0; x <= W; x += 20) ctx.lineTo(x, y + (still ? 0 : Math.sin(x * 0.02 + time * 3) * 5 + Math.sin(x * 0.047 - time * 2) * 3));
    ctx.lineTo(W, H); ctx.closePath();
    ctx.fillStyle = alpha(col, 0.55); ctx.fill();
    ctx.lineWidth = 6; ctx.strokeStyle = INK; ctx.stroke();
    ctx.beginPath();
    for (var x2 = 0; x2 <= W; x2 += 20) ctx.lineTo(x2, y + 9 + (still ? 0 : Math.sin(x2 * 0.02 + time * 3) * 5 + Math.sin(x2 * 0.047 - time * 2) * 3));
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.stroke();
    for (var b = 0; b < 10; b++) {
      var bx = (b * 137 + 40) % W, by = H - ((time * 30 + b * 71) % Math.max(20, H - y - 10));
      if (by > y + 16) { circle(ctx, bx, by, 4 + b % 3 * 2); ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fill(); }
    }
  };
  A.jellyLine = function (ctx, isl, L, time, still) {
    var col = TH[isl.id].jelly, p = still ? 1 : 0.65 + 0.35 * Math.sin(time * 8);
    ctx.save(); ctx.setLineDash([26, 14]); ctx.lineDashOffset = still ? 0 : -time * 40;
    ctx.beginPath(); ctx.moveTo(30, L); ctx.lineTo(W - 30, L); ctx.lineWidth = 12; ctx.strokeStyle = INK; ctx.stroke();
    ctx.lineWidth = 7; ctx.strokeStyle = alpha(col, 0.55 + 0.45 * p); ctx.stroke(); ctx.restore();
    [44, W - 44].forEach(function (x) {
      var y = L + 26 - (still ? 0 : Math.abs(Math.sin(time * 5)) * 10);
      ctx.beginPath(); ctx.moveTo(x - 18, y); ctx.lineTo(x, y - 24); ctx.lineTo(x + 18, y); ctx.lineTo(x + 8, y); ctx.lineTo(x + 8, y + 18); ctx.lineTo(x - 8, y + 18); ctx.lineTo(x - 8, y); ctx.closePath();
      fill(ctx, col); ink(ctx, 4);
    });
  };

  /* ----------------------------------------------------------------- wind */
  // Big arrows at the edge before a gust, streaks across the island during it.
  A.wind = function (ctx, wd, time, still) {
    var warnK = time >= wd.warn && time < wd.start, d = wd.dir;
    if (warnK) {
      var k = (time - wd.warn) / Math.max(0.01, wd.start - wd.warn), x0 = d > 0 ? 40 : W - 40, blink = still || Math.floor(time * 6) % 2 === 0;
      if (blink) for (var i = 0; i < 3; i++) arrow(ctx, x0 + d * (i * 70 + k * 40), 200 + i * 130, d, 1.1);
    }
    if (wd.prof > 0) {
      ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,' + (0.55 * wd.prof) + ')'; ctx.lineCap = 'round'; ctx.lineWidth = 5;
      var off = still ? 0 : time * 900;
      for (var s = 0; s < 14; s++) {
        var y = 120 + s * 37, x = ((s * 211 + off * (0.8 + (s % 3) * 0.2)) % (W + 300)) - 150;
        if (d < 0) x = W - x;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x - d * 50, y - 8, x - d * 110, y + (s % 2 ? 6 : -4)); ctx.stroke();
      }
      ctx.restore();
    }
  };
  function arrow(ctx, x, y, dir, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(dir * s, s);
    ctx.beginPath(); ctx.moveTo(-40, -12); ctx.lineTo(8, -12); ctx.lineTo(8, -28); ctx.lineTo(40, 0); ctx.lineTo(8, 28); ctx.lineTo(8, 12); ctx.lineTo(-40, 12); ctx.closePath();
    fill(ctx, 'rgba(255,255,255,0.92)'); ink(ctx, 5);
    ctx.restore();
  }
  A.arrow = arrow;

  /* ---------------------------------------------------------------- coins */
  A.coin = function (ctx, x, y, r, spin, big) {
    var sx = Math.max(0.18, Math.abs(Math.cos(spin))), R = 20;
    var c = sprite('coin' + (big ? 1 : 0), 2 * R + 8, 2 * R + 8, function (g) {
      g.translate(R + 4, R + 4);
      circle(g, 0, 0, R); fill(g, big ? '#ffb43f' : '#ffd23f'); ink(g, R * 0.2);
      circle(g, 0, 0, R * 0.62); g.lineWidth = R * 0.16; g.strokeStyle = big ? '#e07a17' : '#e8a317'; g.stroke();
      if (big) { starPath(g, 0, 0, R * 0.5, R * 0.22); fill(g, '#fff6c2'); }
      else { g.beginPath(); g.moveTo(-R * 0.15, -R * 0.35); g.lineTo(-R * 0.15, R * 0.35); g.moveTo(R * 0.15, -R * 0.35); g.lineTo(R * 0.15, R * 0.35); g.lineWidth = R * 0.14; g.strokeStyle = '#e8a317'; g.stroke(); }
    }), k = r / R;
    ctx.drawImage(c, x - (R + 4) * k * sx, y - (R + 4) * k, (2 * R + 8) * k * sx, (2 * R + 8) * k);
  };

  /* ------------------------------------------------------------------ HUD */
  A.heart = function (ctx, x, y, s, full) {
    ctx.drawImage(sprite('heart' + full, 48, 44, function (g) {
      g.translate(24, 24);
      g.beginPath(); g.moveTo(0, 14); g.bezierCurveTo(-24, -2, -16, -22, 0, -10); g.bezierCurveTo(16, -22, 24, -2, 0, 14); g.closePath();
      fill(g, full ? '#ff4d6d' : 'rgba(255,255,255,0.35)'); ink(g, 4);
      if (full) { ell(g, -8, -8, 4, 3, -0.6); fill(g, 'rgba(255,255,255,0.7)'); }
    }), x - 24 * s, y - 24 * s, 48 * s, 44 * s);
  };
  function text(ctx, str, x, y, size, color, rtl, outline) {
    ctx.font = '700 ' + size + 'px Fredoka';
    ctx.direction = rtl ? 'rtl' : 'ltr';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (outline !== 0) { ctx.lineWidth = outline || Math.max(4, size * 0.2); ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.strokeText(str, x, y); }
    ctx.fillStyle = color; ctx.fillText(str, x, y);
    ctx.direction = 'ltr';
  }
  A.text = text;
  // The same text as a cached picture (HUD numbers, names, callouts): no glyph work per frame.
  var labels = {}, nLabels = 0;
  A.label = function (ctx, str, x, y, size, color, rtl, outline) {
    size = Math.round(size);
    var key = str + '|' + size + '|' + color + '|' + outline, c = labels[key];
    if (!c) {
      if (nLabels > 240) { labels = {}; nLabels = 0; }
      ctx.save(); ctx.font = '700 ' + size + 'px Fredoka'; ctx.direction = rtl ? 'rtl' : 'ltr';
      var ow = outline === 0 ? 0 : outline || Math.max(4, size * 0.2), w = ctx.measureText(str).width + ow * 2 + 8, h = size * 1.7;
      ctx.restore();
      c = cv(w * SS, h * SS);
      var g = c.getContext('2d'); g.scale(SS, SS);
      text(g, str, w / 2, h / 2, size, color, rtl, outline);
      c.lw = w; c.lh = h; labels[key] = c; nLabels++;
    }
    ctx.drawImage(c, x - c.lw / 2, y - c.lh / 2, c.lw, c.lh);
  };
  A.resetText = function () { labels = {}; nLabels = 0; cache = {}; };
  // A keycap the coach can light up.
  A.key = function (ctx, x, y, label, lit, time, still, w) {
    w = w || 64;
    var down = lit && !still && Math.floor(time * 4) % 2 === 0 ? 4 : 0;
    ctx.drawImage(sprite('keyb' + w, w + 12, 76, function (g) { rr(g, 6, 12, w, 60, 14); fill(g, '#9aa3c7'); }), x - w / 2 - 6, y - 36, w + 12, 76);
    ctx.drawImage(sprite('key' + label + w + (lit ? 1 : 0), w + 12, 70, function (g) {
      rr(g, 6, 6, w, 56, 14); fill(g, lit ? '#ffd23f' : '#ffffff'); ink(g, 5);
      text(g, label, 6 + w / 2, 32, label.length > 2 ? 22 : 32, INK, /[؀-ۿ]/.test(label), 0);
    }), x - w / 2 - 6, y - 36 + down, w + 12, 70);
    if (lit && !still) { rr(ctx, x - w / 2 - 8, y - 38, w + 16, 76, 20); ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(255,210,63,' + (0.5 + 0.5 * Math.sin(time * 10)) + ')'; ctx.stroke(); }
  };
  // Small pictures of each disaster, for the badge and the card.
  A.icon = function (ctx, kind, x, y, s, time, still) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    if (kind === 'flood') { ctx.beginPath(); ctx.moveTo(-26, 4); for (var i = -26; i <= 26; i += 13) ctx.quadraticCurveTo(i + 6, -6, i + 13, 4); ctx.lineTo(26, 24); ctx.lineTo(-26, 24); ctx.closePath(); fill(ctx, alpha('#7cf06a', 0.9)); ink(ctx, 4); ctx.beginPath(); ctx.moveTo(-10, -6); ctx.lineTo(0, -24); ctx.lineTo(10, -6); ctx.closePath(); fill(ctx, '#ffd23f'); ink(ctx, 4); }
    else if (kind === 'meteors') A.marshIcon(ctx, 0, 0, 0.6);
    else if (kind === 'wind') { arrow(ctx, 0, -8, 1, 0.55); arrow(ctx, -6, 14, 1, 0.45); }
    else if (kind === 'ice') A.snowIcon(ctx, 0, 0, 0.75);
    else if (kind === 'quake') { rr(ctx, -26, -8, 52, 16, 5); fill(ctx, '#c9874a'); ink(ctx, 4); ctx.beginPath(); ctx.moveTo(-6, -8); ctx.lineTo(2, 0); ctx.lineTo(-4, 4); ctx.lineTo(4, 10); ctx.lineWidth = 4; ctx.strokeStyle = '#ff7a1a'; ctx.stroke(); A.nutIcon(ctx, 14, -22, 0.4); }
    else if (kind === 'clouds') { ctx.scale(0.45, 0.45); A.stormCloud(ctx, { x: 0, y: -14, id: 1, state: 'drift', fade: 0 }, 0, true); ctx.beginPath(); ctx.moveTo(6, 14); ctx.lineTo(-10, 38); ctx.lineTo(6, 38); ctx.lineTo(-6, 64); ctx.lineWidth = 16; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 9; ctx.strokeStyle = '#ffe14d'; ctx.stroke(); }
    else if (kind === 'balls') A.ballIcon(ctx, 0, 0, 0.5);
    else if (kind === 'tornado') { ctx.beginPath(); ctx.moveTo(-4, 24); ctx.quadraticCurveTo(-10, 0, -30, -24); ctx.lineTo(30, -24); ctx.quadraticCurveTo(10, 0, 4, 24); ctx.closePath(); fill(ctx, '#d3dbef'); ink(ctx, 4); [-14, -2, 10].forEach(function (yy, k3) { ctx.beginPath(); ctx.ellipse(0, yy, 22 - k3 * 7, 4, 0, 0.2, Math.PI - 0.2); ctx.lineWidth = 3; ctx.strokeStyle = '#ffffff'; ctx.stroke(); }); }
    ctx.restore();
  };

  /* -------------------------------------------------- card pictures */
  // What to do, as a picture: drawn into the card's canvas (440 x 220) every frame it shows.
  A.cardPic = function (c, kinds, time, still, theme, side) {
    var g = c.getContext('2d'), w = c.width, h = c.height, t = TH[theme] || TH.beach;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h);
    g.fillStyle = vgrad(g, [[0, t.sky[0]], [1, t.sky[1]]], 0, h); g.fillRect(0, 0, w, h);
    var n = kinds.length;
    kinds.forEach(function (kind, i) {
      g.save();
      if (n > 1) { g.translate(i * w / 2, 0); g.beginPath(); g.rect(0, 0, w / 2, h); g.clip(); g.translate(w / 4, h / 2); g.scale(0.62, 0.62); g.translate(-w / 2, -h / 2); }
      // The house is drawn where it stands on this island.
      if (kind === 'tornado' && side > 0) { g.translate(w, 0); g.scale(-1, 1); }
      pic(g, kind, w, h, time, still, t);
      g.restore();
    });
    if (n > 1) { circle(g, w / 2, h / 2, 26); fill(g, '#ffffff'); ink(g, 5); text(g, '+', w / 2, h / 2 + 2, 40, INK, false, 0); }
  };
  function picKid(g, x, y, o) { A.islander(g, x, y, Object.assign({ color: '#ffd23f', hat: '', extra: '', face: 1, vx: 0, vy: 0, ground: true, land: 0, bonk: 0, inv: 0, time: 0, still: true, scale: 1 }, o)); }
  function pic(g, kind, w, h, time, still, t) {
    var gy = h - 34, bounce = still ? 0 : Math.sin(time * 4), up = still ? 0 : Math.abs(Math.sin(time * 3));
    g.fillStyle = t.top; g.fillRect(0, gy, w, h - gy); g.beginPath(); g.moveTo(0, gy); g.lineTo(w, gy); ink(g, 5);
    if (kind === 'flood') {
      rr(g, 270, 82, 110, 16, 6); fill(g, t.wood); ink(g, 5);
      g.lineWidth = 6; g.strokeStyle = INK; g.beginPath(); g.moveTo(290, 98); g.lineTo(290, gy); g.moveTo(360, 98); g.lineTo(360, gy); g.stroke();
      picKid(g, 325, 82, { mood: 'up' });
      var jy = gy - 30 - up * 30;
      g.beginPath(); g.moveTo(0, h); for (var x = 0; x <= w; x += 20) g.lineTo(x, jy + Math.sin(x * 0.05 + time * 3) * 4); g.lineTo(w, h); g.closePath(); g.fillStyle = alpha(t.jelly, 0.6); g.fill(); ink(g, 5);
      bigArrow(g, 180, 150 - up * 16, 'up');
    } else if (kind === 'meteors') {
      A.target(g, 150, gy, 52, 0.8, time, still);
      A.marshIcon(g, 150, 60 + up * 50, 0.9);
      picKid(g, 300 + up * 20, gy, { face: 1 });
      bigArrow(g, 240, 120, 'right');
    } else if (kind === 'wind') {
      arrow(g, 80, 70, 1, 0.9); arrow(g, 60, 150, 1, 0.9);
      picKid(g, 270, gy, { face: -1, lean: 0.25, vx: -60 });
      bigArrow(g, 360, 120, 'left');
    } else if (kind === 'ice') {
      g.fillStyle = 'rgba(160,220,255,0.6)'; g.fillRect(0, gy, w, 10);
      var sx = 360 - ((still ? 0 : time * 120) % 200);
      A.snowIcon(g, sx, gy - 26, 0.9);
      picKid(g, 200, gy - 70 - up * 24, { ground: false, vy: -200 });
      g.save(); g.setLineDash([10, 9]); g.beginPath(); g.moveTo(130, gy - 10); g.quadraticCurveTo(200, gy - 170, 270, gy - 10); g.lineWidth = 5; g.strokeStyle = INK; g.stroke(); g.restore();
    } else if (kind === 'quake') {
      g.save(); g.translate(still ? 0 : Math.sin(time * 40) * 3, 0);
      rr(g, 80, 90, 140, 18, 6); fill(g, t.wood); ink(g, 5);
      cracks(g, { w: 140 }, 80, 90, time, still);
      g.restore();
      picKid(g, 320, gy, { face: 1 });
      bigArrow(g, 250, 140, 'right');
    } else if (kind === 'clouds') {
      A.stormCloud(g, { x: 150, y: 46, id: 2, state: 'charge', h: { born: 0, fire: 1 }, fade: 0 }, 0.8, true);
      g.fillStyle = 'rgba(255,236,90,0.55)'; g.fillRect(105, 70, 90, gy - 70);
      picKid(g, 320, gy, { face: 1 });
      bigArrow(g, 245, 140, 'right');
    } else if (kind === 'balls') {
      g.save(); g.setLineDash([10, 9]); g.beginPath(); g.moveTo(20, gy - 60); g.quadraticCurveTo(110, gy - 220, 190, gy - 10); g.lineWidth = 5; g.strokeStyle = INK; g.stroke(); g.restore();
      A.target(g, 190, gy, 50, 0.8, time, still);
      A.ballIcon(g, 110 + bounce * 20, 70 + up * 20, 0.6);
      picKid(g, 340, gy, { face: 1 });
      bigArrow(g, 268, 130, 'right');
    } else if (kind === 'tornado') {
      rr(g, 30, 64, 150, 24, 8); fill(g, t.roof); ink(g, 5);
      rr(g, 40, 84, 130, gy - 84, 6); fill(g, t.wall); ink(g, 5);
      rr(g, 56, 104, 98, gy - 104, 10); fill(g, '#ffd98a'); ink(g, 4);
      picKid(g, 105, gy, { face: -1 });
      A.icon(g, 'tornado', 360, 120, 2.2, time, still);
      bigArrow(g, 240, 130, 'left');
    }
  }
  function bigArrow(g, x, y, dir) {
    g.save(); g.translate(x, y); g.rotate(dir === 'up' ? -Math.PI / 2 : dir === 'left' ? Math.PI : 0);
    g.beginPath(); g.moveTo(-34, -13); g.lineTo(4, -13); g.lineTo(4, -30); g.lineTo(38, 0); g.lineTo(4, 30); g.lineTo(4, 13); g.lineTo(-34, 13); g.closePath();
    fill(g, '#ffd23f'); ink(g, 6); g.restore();
  }

  /* ---------------------------------------------------- menu pictures */
  // The little island on each title-screen tile.
  A.isleIcon = function (c, isl) {
    var g = c.getContext('2d'), t = TH[isl.id], w = c.width, h = c.height;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = vgrad(g, [[0, t.sky[0]], [1, t.sky[1]]], 0, h); g.fillRect(0, 0, w, h);
    g.fillStyle = isl.id === 'sky' ? '#ffffff' : t.sea; g.fillRect(0, h * 0.72, w, h);
    g.beginPath(); g.moveTo(w * 0.12, h * 0.74); g.quadraticCurveTo(w * 0.5, h * 0.52, w * 0.88, h * 0.74); g.lineTo(w * 0.8, h); g.lineTo(w * 0.2, h); g.closePath(); fill(g, t.soil); ink(g, 4);
    g.beginPath(); g.moveTo(w * 0.12, h * 0.74); g.quadraticCurveTo(w * 0.5, h * 0.52, w * 0.88, h * 0.74); g.lineWidth = 8; g.strokeStyle = t.top; g.stroke(); ink(g, 3);
    var tx = w * 0.62, ty = h * 0.62;
    if (isl.id === 'beach') { g.beginPath(); g.moveTo(tx, ty); g.quadraticCurveTo(tx + 6, ty - 30, tx, ty - 50); ink(g, 9); g.lineWidth = 6; g.strokeStyle = t.trunk; g.stroke(); [[-1, 0], [1, 0], [-0.6, 1], [0.6, 1]].forEach(function (f) { g.beginPath(); g.moveTo(tx, ty - 50); g.quadraticCurveTo(tx + f[0] * 20, ty - 64 + f[1] * 6, tx + f[0] * 34, ty - 40 + f[1] * 10); g.lineWidth = 9; g.strokeStyle = INK; g.stroke(); g.lineWidth = 5; g.strokeStyle = t.leaf; g.stroke(); }); }
    else if (isl.id === 'snow') { g.beginPath(); g.moveTo(tx, ty - 58); g.lineTo(tx + 22, ty); g.lineTo(tx - 22, ty); g.closePath(); fill(g, t.leafDark); ink(g, 3); g.beginPath(); g.moveTo(tx, ty - 58); g.lineTo(tx + 8, ty - 38); g.lineTo(tx - 8, ty - 38); g.closePath(); fill(g, '#fff'); }
    else if (isl.id === 'candy') { g.beginPath(); g.moveTo(tx, ty); g.lineTo(tx, ty - 34); g.lineWidth = 5; g.strokeStyle = INK; g.stroke(); circle(g, tx, ty - 44, 14); fill(g, '#ffe14d'); ink(g, 3); g.beginPath(); g.arc(tx, ty - 44, 7, 0, 5); g.lineWidth = 4; g.strokeStyle = '#ff5d9e'; g.stroke(); }
    else { g.beginPath(); g.moveTo(tx, ty); g.lineTo(tx, ty - 34); g.lineWidth = 5; g.strokeStyle = '#33963a'; g.stroke(); for (var p = 0; p < 6; p++) { circle(g, tx + Math.cos(p) * 9, ty - 44 + Math.sin(p) * 9, 6); fill(g, '#ff9ad5'); } circle(g, tx, ty - 44, 6); fill(g, '#ffe14d'); ink(g, 2); }
    rr(g, w * 0.24, h * 0.5, w * 0.2, h * 0.14, 3); fill(g, t.wall); ink(g, 3);
    rr(g, w * 0.22, h * 0.46, w * 0.24, h * 0.06, 2); fill(g, t.roof); ink(g, 3);
  };
  // A wardrobe tile: the child's islander wearing the item (or its colour).
  A.itemIcon = function (c, item, look) {
    var g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height);
    var s = c.width / 96;
    g.scale(s, s);
    var o = { color: item.kind === 'color' ? item.color : look.color, hat: item.kind === 'hat' ? item.hat : '', extra: item.kind === 'extra' ? item.extra : '', face: 1, vx: 0, vy: 0, ground: true, land: 0, bonk: 0, inv: 0, time: 0, still: true, scale: 1.25 };
    if (item.kind === 'hat' || item.kind === 'extra') { if (!o.hat && item.kind === 'extra') o.hat = look.hat; if (!o.extra && item.kind === 'hat') o.extra = ''; }
    A.islander(g, 48, 92, o);
    if ((item.kind === 'hat' && !item.hat) || (item.kind === 'extra' && !item.extra)) {
      circle(g, 74, 22, 14); fill(g, '#ffffff'); ink(g, 4);
      g.beginPath(); g.moveTo(66, 14); g.lineTo(82, 30); ink(g, 4);
    }
  };

  /* ---------------------------------------------------------------- podium */
  A.podium = function (ctx, x, y) {
    [[-150, 90, '#c9d3ea', '2'], [0, 140, '#ffd23f', '1'], [150, 60, '#ffb36b', '3']].forEach(function (p) {
      rr(ctx, x + p[0] - 70, y - p[1], 140, p[1] + 20, 14); fill(ctx, p[2]); ink(ctx, 6);
      text(ctx, p[3], x + p[0], y - p[1] + 62, 40, '#ffffff', false, 6);
    });
  };
  A.podiumTop = function (rank) { return [140, 90, 60][rank]; };
  A.podiumX = function (rank) { return [0, -150, 150][rank]; };
})();
