/*
 * Drift King — world renderer (sky, clouds, floating road, coins, car, particles).
 */
(function (root) {
  'use strict';
  var DK = root.DK || (root.DK = {});
  var M = Math, abs = M.abs, min = M.min, max = M.max, flr = M.floor, sin = M.sin, cos = M.cos, PI = M.PI, TAU = PI * 2; function ran() { return M.random(); }
  function disc(c, x, y, r, f) { if (f) c.fillStyle = f; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
  function poly(c, p, f) { if (f) c.fillStyle = f; c.beginPath(); c.moveTo(p[0], p[1]); for (var i = 2; i < p.length; i += 2) c.lineTo(p[i], p[i + 1]); c.closePath(); c.fill(); }

  var ISO = DK.ISO, PX = ISO.PX, PY = ISO.PY, PZ = ISO.PZ;
  var W = 1280, H = 720, CX = 640, CY = 455;
  var T = 0.75;           // road slab thickness
  var mix = DK.mix, shade = DK.shade;

  /* ------------------------------------------------------------ palettes */
  var PAL = [
    { name: 'صباح مشمس', top: '#62bff5', bot: '#d8f4ff', cloud: '#ffffff', cloudSh: '#c9e3fb', road: '#fff8ec', band: '#fbe9d6', side: '#ff9ec3', side2: '#f0739f', ice: '#ffffff', curb: '#ff6f9f', night: 0, shadow: 0.9, sun: '#fff5b0' },
    { name: 'سماء النعناع', top: '#4fcfc9', bot: '#e9fff4', cloud: '#ffffff', cloudSh: '#c0eee1', road: '#f6fff8', band: '#e0f6e9', side: '#83e2b8', side2: '#44bf92', ice: '#f7fff9', curb: '#29b387', night: 0, shadow: 1.1, sun: '#fff9c9' },
    { name: 'الغروب الذهبي', top: '#ff7a73', bot: '#ffd99c', cloud: '#fff1e2', cloudSh: '#ffbf9f', road: '#fff3e6', band: '#fde0c8', side: '#ffa66e', side2: '#ea7652', ice: '#fff8ef', curb: '#e8544a', night: 0.1, shadow: 1.9, sun: '#ffdf7a' },
    { name: 'الشفق البنفسجي', top: '#50388f', bot: '#ff98b6', cloud: '#f6d1ea', cloudSh: '#bf93d4', road: '#f8eeff', band: '#eadcff', side: '#b69aff', side2: '#8b6aef', ice: '#fbf6ff', curb: '#ff78bf', night: 0.45, shadow: 1.6, sun: '#ffc1d6' },
    { name: 'ليل النجوم', top: '#0b1240', bot: '#323d8c', cloud: '#5c66b3', cloudSh: '#3a4387', road: '#e0e6ff', band: '#cdd6fb', side: '#6d7eff', side2: '#4655d2', ice: '#eef1ff', curb: '#ffd84d', night: 1, shadow: 1.2, sun: '#fdf6d8' },
    { name: 'فجر الحلوى', top: '#ff9bd6', bot: '#fff1b5', cloud: '#ffffff', cloudSh: '#ffcfe6', road: '#fffaf1', band: '#ffeede', side: '#ffc46a', side2: '#f59a43', ice: '#fffdf8', curb: '#ff6fb0', night: 0, shadow: 1.3, sun: '#fff4b8' }
  ];
  DK.PAL = PAL;
  DK.zoneName = function (z) { return PAL[z % PAL.length].name; };
  function palOf(z) { return PAL[((z % PAL.length) + PAL.length) % PAL.length]; }
  DK.palOf = palOf;
  var KEYS = ['top', 'bot', 'cloud', 'cloudSh', 'road', 'band', 'side', 'side2', 'ice', 'curb', 'sun'];
  var cur = {};
  function blendPal(d) {
    var zl = DK.ZONE_LEN, z = flr(d / zl), f = (d - z * zl) / zl;
    var a = palOf(z), b = palOf(z + 1);
    var t = f > 0.82 ? (f - 0.82) / 0.18 : 0;
    t = t * t * (3 - 2 * t);
    for (var k = 0; k < KEYS.length; k++) cur[KEYS[k]] = t ? mix(a[KEYS[k]], b[KEYS[k]], t) : a[KEYS[k]];
    cur.night = a.night + (b.night - a.night) * t;
    cur.shadow = a.shadow + (b.shadow - a.shadow) * t;
    return cur;
  }
  DK.blendPal = blendPal;

  /* ------------------------------------------------------------- camera */
  var cam = { x: 0, y: 0, S: 48, sx: 0, sy: 0, ox: 0, oy: 0 };
  DK.cam = cam;
  function setCam(c, shx, shy) {
    cam.x = c.x; cam.y = c.y; cam.S = c.S;
    cam.ox = CX + shx - (c.x - c.y) * PX * c.S;
    cam.oy = CY + shy - (c.x + c.y) * PY * c.S;
  }
  function sx(x, y) { return cam.ox + (x - y) * PX * cam.S; }
  function sy(x, y, z) { return cam.oy + ((x + y) * PY - (z || 0) * PZ) * cam.S; }
  DK.sx = sx; DK.sy = sy;

  /* ------------------------------------------------------ background */
  var bg = null;
  function makeBg() {
    var r = DK.rng(777);
    bg = { clouds: [], stars: [], isles: [], balloons: [] };
    for (var i = 0; i < 16; i++) {
      var layer = i < 7 ? 0.22 : 0.5;
      var c = { x: r() * 1700, y: r() * 1100, s: (layer < 0.3 ? 0.55 : 1) * (0.7 + r() * 0.7), layer: layer, puffs: [] };
      var n = 5 + flr(r() * 3);
      for (var k = 0; k < n; k++) c.puffs.push([(k - (n - 1) / 2) * 30 + (r() - 0.5) * 16, -sin(k / (n - 1) * PI) * 26 * (0.6 + r() * 0.6), 22 + r() * 20]);
      bg.clouds.push(c);
    }
    for (i = 0; i < 70; i++) bg.stars.push([r() * W, r() * H, 0.6 + r() * 1.8, r() * 6]);
    for (i = 0; i < 3; i++) bg.isles.push({ x: r() * 1700, y: r() * 1100, s: 0.7 + r() * 0.5, kind: i });
    for (i = 0; i < 3; i++) bg.balloons.push({ x: r() * 1700, y: r() * 1100, s: 0.7 + r() * 0.4, col: ['#ff6f91', '#ffc93c', '#6fd6ff'][i], ph: r() * 6 });
  }
  function wrapPos(v, span) { return ((v % span) + span) % span; }

  var skyG = null, skyKey = '';
  function drawSky(ctx, p, time) {
    // only rebuild the gradient when the colours change (zone transitions)
    if (p.top + p.bot !== skyKey || !skyG) {
      skyKey = p.top + p.bot;
      skyG = ctx.createLinearGradient(0, 0, 0, H);
      skyG.addColorStop(0, p.top); skyG.addColorStop(1, p.bot);
    }
    ctx.fillStyle = skyG;
    ctx.fillRect(0, 0, W, H);
    if (!bg) makeBg();
    // stars
    if (p.night > 0.05) {
      ctx.fillStyle = '#ffffff';
      for (var i = 0; i < bg.stars.length; i++) {
        var s = bg.stars[i];
        ctx.globalAlpha = p.night * (0.45 + 0.55 * abs(sin(time * 1.3 + s[3])));
        ctx.fillRect(s[0], s[1], s[2], s[2]);
      }
      ctx.globalAlpha = 1;
    }
    // sun / moon
    var mx = 1080, my = 120;
    ctx.globalAlpha = 0.25; disc(ctx, mx, my, 95, p.sun);
    ctx.globalAlpha = 0.35; disc(ctx, mx, my, 70);
    ctx.globalAlpha = 1; disc(ctx, mx, my, 50);
    if (p.night > 0.5) {
      ctx.globalAlpha = (p.night - 0.5) * 2;
      disc(ctx, mx + 20, my - 14, 44, p.top);
      ctx.globalAlpha = 1;
    }
  }

  function drawCloud(ctx, c, x, y, p) {
    var s = c.s, k, q;
    ctx.fillStyle = p.cloudSh;
    ctx.beginPath();
    for (k = 0; k < c.puffs.length; k++) { q = c.puffs[k]; ctx.moveTo(x + q[0] * s + q[2] * s, y + (q[1] + 9) * s); ctx.arc(x + q[0] * s, y + (q[1] + 9) * s, q[2] * s, 0, PI * 2); }
    ctx.fill();
    ctx.fillStyle = p.cloud;
    ctx.beginPath();
    for (k = 0; k < c.puffs.length; k++) { q = c.puffs[k]; ctx.moveTo(x + q[0] * s + q[2] * s, y + q[1] * s); ctx.arc(x + q[0] * s, y + q[1] * s, q[2] * s, 0, PI * 2); }
    ctx.fill();
  }

  function drawIsle(ctx, it, x, y, p) {
    var s = it.s;
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    poly(ctx, [-50, 0, 50, 0, 18, 46, 0, 70, -20, 40], shade(p.side2, 0.9));
    ctx.fillStyle = p.side;
    ctx.beginPath(); ctx.ellipse(0, 0, 54, 18, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = p.ice;
    ctx.beginPath(); ctx.ellipse(0, -3, 48, 14, 0, 0, TAU); ctx.fill();
    var trees = it.kind === 1 ? [[-18, -6], [14, -2]] : [[-6, -4]];
    for (var k = 0; k < trees.length; k++) {
      var t = trees[k];
      ctx.fillStyle = '#9b6b4d'; ctx.fillRect(t[0] - 3, t[1] - 18, 6, 18);
      disc(ctx, t[0], t[1] - 26, 14, it.kind === 2 ? '#ff9ec3' : '#5ccf86');
      disc(ctx, t[0] - 4, t[1] - 30, 6, 'rgba(255,255,255,0.35)');
    }
    ctx.restore();
  }

  function drawBalloon(ctx, b, x, y, time) {
    y += sin(time * 1.2 + b.ph) * 8;
    ctx.save(); ctx.translate(x, y); ctx.scale(b.s, b.s);
    ctx.strokeStyle = 'rgba(80,60,60,0.6)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-12, 22); ctx.lineTo(-7, 42); ctx.moveTo(12, 22); ctx.lineTo(7, 42); ctx.stroke();
    ctx.fillStyle = '#a0704f'; ctx.fillRect(-9, 40, 18, 12);
    ctx.fillStyle = b.col;
    ctx.beginPath(); ctx.moveTo(-14, 24); ctx.bezierCurveTo(-40, 0, -30, -40, 0, -40); ctx.bezierCurveTo(30, -40, 40, 0, 14, 24); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath(); ctx.moveTo(-5, 24); ctx.bezierCurveTo(-14, 0, -12, -36, 0, -40); ctx.bezierCurveTo(12, -36, 14, 0, 5, 24); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function drawBackground(ctx, p, time) {
    var csx = (cam.x - cam.y) * PX * cam.S, csy = (cam.x + cam.y) * PY * cam.S;
    var spanX = 1700, spanY = 1100, i, c, x, y;
    for (i = 0; i < 7; i++) {
      c = bg.clouds[i];
      x = wrapPos(c.x - csx * c.layer + time * 6, spanX) - 200;
      y = wrapPos(c.y - csy * c.layer, spanY) - 180;
      drawCloud(ctx, c, x, y, p);
    }
    for (i = 0; i < bg.balloons.length; i++) {
      var b = bg.balloons[i];
      x = wrapPos(b.x - csx * 0.32, spanX) - 200;
      y = wrapPos(b.y - csy * 0.32 - time * 10, spanY) - 180;
      drawBalloon(ctx, b, x, y, time);
    }
    for (i = 0; i < bg.isles.length; i++) {
      var it = bg.isles[i];
      x = wrapPos(it.x - csx * 0.4, spanX) - 200;
      y = wrapPos(it.y - csy * 0.4, spanY) - 180;
      drawIsle(ctx, it, x, y, p);
    }
    for (i = 7; i < bg.clouds.length; i++) {
      c = bg.clouds[i];
      x = wrapPos(c.x - csx * c.layer + time * 10, spanX) - 200;
      y = wrapPos(c.y - csy * c.layer, spanY) - 180;
      drawCloud(ctx, c, x, y, p);
    }
  }

  /* ----------------------------------------------------------- road */
  // Pieces of a segment: [s0, s1] along ranges (split by a gap).
  function pieces(seg) {
    var a = -seg.ext0, b = seg.len + seg.ext1;
    if (seg.gap) return [[a, seg.gap.a, seg.i === 0, false], [seg.gap.b, b, true, true]];
    return [[a, b, seg.i === 0, false]];
  }
  // world corners for along range s0..s1 and lateral -h..h
  function quad(seg, s0, s1, l0, l1, z, out) {
    var dx = DK.DX[seg.dir], dy = DK.DY[seg.dir], lx = DK.LX[seg.dir], ly = DK.LY[seg.dir];
    var ax = seg.sx, ay = seg.sy;
    out[0] = sx(ax + dx * s0 + lx * l0, ay + dy * s0 + ly * l0); out[1] = sy(ax + dx * s0 + lx * l0, ay + dy * s0 + ly * l0, z);
    out[2] = sx(ax + dx * s1 + lx * l0, ay + dy * s1 + ly * l0); out[3] = sy(ax + dx * s1 + lx * l0, ay + dy * s1 + ly * l0, z);
    out[4] = sx(ax + dx * s1 + lx * l1, ay + dy * s1 + ly * l1); out[5] = sy(ax + dx * s1 + lx * l1, ay + dy * s1 + ly * l1, z);
    out[6] = sx(ax + dx * s0 + lx * l1, ay + dy * s0 + ly * l1); out[7] = sy(ax + dx * s0 + lx * l1, ay + dy * s0 + ly * l1, z);
    return out;
  }
  var Q = new Array(8), Q2 = new Array(8);
  function fillQuad(ctx, q) { poly(ctx, q); }
  // vertical face below a top edge from world point a to b
  function sideFace(ctx, x0, y0, x1, y1, colTop, colMain, th) {
    var ax = sx(x0, y0), ay = sy(x0, y0, 0), bx = sx(x1, y1), by = sy(x1, y1, 0);
    var d1 = 0.2 * PZ * cam.S, d2 = th * PZ * cam.S;
    poly(ctx, [ax, ay, bx, by, bx, by + d2, ax, ay + d2], colMain);
    ctx.fillStyle = colTop;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(bx, by + d1);
    // wavy icing edge
    var n = max(2, M.round(abs(bx - ax) / 18));
    for (var k = n; k >= 0; k--) {
      var t = k / n;
      ctx.lineTo(ax + (bx - ax) * t, ay + (by - ay) * t + d1 + (k % 2 ? 5 : 0) * cam.S / 48);
    }
    ctx.closePath(); ctx.fill();
  }
  function visibleSeg(seg) {
    var x0 = min(seg.sx, seg.ex) - seg.w - 2, x1 = max(seg.sx, seg.ex) + seg.w + 2;
    var y0 = min(seg.sy, seg.ey) - seg.w - 2, y1 = max(seg.sy, seg.ey) + seg.w + 2;
    var l = sx(x0, y1), r = sx(x1, y0), t = sy(x0, y0, 0), b = sy(x1, y1, -T);
    return r > -60 && l < W + 60 && b > -60 && t < H + 120;
  }

  function drawRoad(ctx, road, G) {
    var segs = road.segs, i, k, seg, pc, p;
    var vis = G._vis || (G._vis = []);
    vis.length = 0;
    for (i = 0; i < segs.length; i++) if (visibleSeg(segs[i])) vis.push(segs[i]);
    // soft shadow on the sky below
    ctx.fillStyle = 'rgba(30,20,70,0.06)';
    var offx = 26 * cam.S / 48 * G.pal.shadow, offy = 120 * cam.S / 48;
    for (i = 0; i < vis.length; i++) {
      seg = vis[i]; pc = pieces(seg);
      for (k = 0; k < pc.length; k++) {
        quad(seg, pc[k][0], pc[k][1], -seg.w / 2, seg.w / 2, 0, Q);
        for (var m = 0; m < 8; m += 2) { Q[m] += offx; Q[m + 1] += offy; }
        fillQuad(ctx, Q);
      }
    }
    // side faces, far -> near
    for (i = vis.length - 1; i >= 0; i--) {
      seg = vis[i]; p = palOf(seg.zone); pc = pieces(seg);
      var dx = DK.DX[seg.dir], dy = DK.DY[seg.dir], lx = DK.LX[seg.dir], ly = DK.LY[seg.dir];
      var vl = seg.dir === 0 ? -1 : 1;   // visible lateral side: A -> right(-1*left), B -> left
      var hw = seg.w / 2 * vl;
      for (k = pc.length - 1; k >= 0; k--) {
        var s0 = pc[k][0], s1 = pc[k][1];
        var e0 = max(s0, (k === 0 && seg.i > 0) ? seg.ext0 : s0);
        var ax = seg.sx + dx * e0 + lx * hw, ay = seg.sy + dy * e0 + ly * hw;
        var bx = seg.sx + dx * s1 + lx * hw, by = seg.sy + dy * s1 + ly * hw;
        sideFace(ctx, bx, by, ax, ay, p.ice, seg.dir === 0 ? p.side : p.side2, T);
        // start cap (after a gap / very first segment) faces the camera
        if (pc[k][2]) {
          var cx0 = seg.sx + dx * s0 - lx * seg.w / 2, cy0 = seg.sy + dy * s0 - ly * seg.w / 2;
          var cx1 = seg.sx + dx * s0 + lx * seg.w / 2, cy1 = seg.sy + dy * s0 + ly * seg.w / 2;
          sideFace(ctx, cx0, cy0, cx1, cy1, p.ice, seg.dir === 0 ? p.side2 : p.side, T);
        }
      }
    }
    // tops
    for (i = vis.length - 1; i >= 0; i--) {
      seg = vis[i]; p = palOf(seg.zone); pc = pieces(seg);
      ctx.fillStyle = p.road;
      for (k = 0; k < pc.length; k++) { quad(seg, pc[k][0], pc[k][1], -seg.w / 2, seg.w / 2, 0, Q); fillQuad(ctx, Q); }
    }
    // bands, curbs and ramps
    ctx.lineCap = 'butt';
    for (i = vis.length - 1; i >= 0; i--) {
      seg = vis[i]; p = palOf(seg.zone); pc = pieces(seg);
      ctx.fillStyle = p.band;
      var b0 = seg.i === 0 ? 0 : seg.ext0, b1 = seg.len - seg.ext1;
      for (var s = M.ceil(b0 / 2) * 2 + 0.5; s + 1 < b1; s += 2) {
        if (seg.gap && s + 1 > seg.gap.a - 1.6 && s < seg.gap.b) continue;
        quad(seg, s, s + 1, -seg.w / 2, seg.w / 2, 0, Q); fillQuad(ctx, Q);
      }
      drawCurbs(ctx, seg, p);
      if (seg.gap) drawRamp(ctx, seg, G.time);
      if (seg.i === 0) drawStartLine(ctx, seg);
    }
  }

  function drawCurbs(ctx, seg, p) {
    var h = seg.w / 2 - 0.1;
    var startLeft = seg.dir === 1, endLeft = seg.dir === 0; // which side the neighbours attach to
    var first = seg.i === 0;
    var lw = 0.14 * cam.S;
    ctx.lineWidth = lw;
    function edge(side, s0, s1) {
      if (s1 <= s0) return;
      quad(seg, s0, s1, side * h, side * h, 0, Q);
      ctx.beginPath(); ctx.moveTo(Q[0], Q[1]); ctx.lineTo(Q[2], Q[3]);
      ctx.strokeStyle = '#ffffff'; ctx.setLineDash([]); ctx.stroke();
      ctx.strokeStyle = p.curb; ctx.setLineDash([0.45 * cam.S, 0.45 * cam.S]); ctx.stroke();
    }
    var ranges = seg.gap ? [[-seg.ext0, seg.gap.a], [seg.gap.b, seg.len + seg.ext1]] : [[-seg.ext0, seg.len + seg.ext1]];
    for (var r = 0; r < ranges.length; r++) {
      var a = ranges[r][0], b = ranges[r][1];
      // left side (+1)
      var la = (r === 0 && !first) ? (startLeft ? seg.ext0 + 0.1 : -seg.ext0 + 0.1) : a + 0.1;
      var lb = (r === ranges.length - 1) ? (endLeft ? seg.len - seg.ext1 + 0.1 : seg.len + seg.ext1 - 0.1) : b - 0.02;
      edge(1, la, lb);
      var ra = (r === 0 && !first) ? (startLeft ? -seg.ext0 + 0.1 : seg.ext0 + 0.1) : a + 0.1;
      var rb = (r === ranges.length - 1) ? (endLeft ? seg.len + seg.ext1 - 0.1 : seg.len - seg.ext1 + 0.1) : b - 0.02;
      edge(-1, ra, rb);
    }
    ctx.setLineDash([]);
  }

  function drawRamp(ctx, seg, time) {
    var g = seg.gap, h = seg.w / 2 - 0.22;
    var s0 = g.a - g.ramp, s1 = g.a;
    var dx = DK.DX[seg.dir], dy = DK.DY[seg.dir], lx = DK.LX[seg.dir], ly = DK.LY[seg.dir];
    function P(s, l, z) { var x = seg.sx + dx * s + lx * l, y = seg.sy + dy * s + ly * l; return [sx(x, y), sy(x, y, z)]; }
    var a = P(s0, -h, 0), b = P(s0, h, 0), c = P(s1, h, g.h), d = P(s1, -h, g.h);
    var c0 = P(s1, h, 0), d0 = P(s1, -h, 0);
    // glowing cyan sky-jump wedge
    var vis = seg.dir === 0 ? -1 : 1;
    var sA = vis < 0 ? a : b, sT = vis < 0 ? d : c, sB = vis < 0 ? d0 : c0;
    poly(ctx, [sA[0], sA[1], sT[0], sT[1], sB[0], sB[1]], '#0c88b8');
    poly(ctx, [a[0], a[1], b[0], b[1], c[0], c[1], d[0], d[1]], '#24e5ff');
    // animated energy chevrons sliding up the cyan ramp
    var phase = ((time || 0) * 1.8) % 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.92)'; ctx.lineWidth = 0.1 * cam.S; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (var k = 0; k < 3; k++) {
      var f = (k / 3 + phase * (1 / 3));
      var f0 = max(0.05, f - 0.12), f1 = min(0.95, f + 0.08);
      var pL = P(s0 + (s1 - s0) * f0, -h * 0.58, g.h * f0);
      var pM = P(s0 + (s1 - s0) * f1, 0, g.h * f1);
      var pR = P(s0 + (s1 - s0) * f0, h * 0.58, g.h * f0);
      ctx.beginPath(); ctx.moveTo(pL[0], pL[1]); ctx.lineTo(pM[0], pM[1]); ctx.lineTo(pR[0], pR[1]); ctx.stroke();
    }
    // glowing takeoff lip
    ctx.strokeStyle = '#c8fbff'; ctx.lineWidth = 0.12 * cam.S;
    ctx.beginPath(); ctx.moveTo(d[0], d[1]); ctx.lineTo(c[0], c[1]); ctx.stroke();
    ctx.lineCap = 'butt';
  }

  function drawStartLine(ctx, seg) {
    var n = 8, h = seg.w / 2;
    for (var k = 0; k < n; k++) {
      for (var r = 0; r < 2; r++) {
        ctx.fillStyle = (k + r) % 2 ? '#2d2a3e' : '#ffffff';
        quad(seg, 1.2 + r * 0.4, 1.6 + r * 0.4, -h + k * (seg.w / n), -h + (k + 1) * (seg.w / n), 0, Q);
        fillQuad(ctx, Q);
      }
    }
  }

  /* --------------------------------------------------------- objects */
  function drawCoin(ctx, c, time, p) {
    var bob = sin(time * 4 + c.t) * 0.08;
    var X = sx(c.x, c.y), Y = sy(c.x, c.y, c.z + bob), G = sy(c.x, c.y, 0);
    var S = cam.S;
    var onRoad = c.z < 1;
    if (onRoad) {
      ctx.fillStyle = 'rgba(60,40,90,0.18)';
      ctx.beginPath(); ctx.ellipse(X + 0.35 * S * p.shadow, G + 0.05 * S, 0.3 * S * (1 + p.shadow * 0.5), 0.11 * S, 0.3, 0, PI * 2); ctx.fill();
    }
    if (c.kind === 1) {
      // gem
      var r = 0.3 * S, w = r * (0.55 + 0.45 * abs(cos(time * 3 + c.t)));
      poly(ctx, [X, Y - r, X + w, Y - r * 0.2, X, Y + r, X - w, Y - r * 0.2], '#35e0ff');
      poly(ctx, [X, Y - r, X + w * 0.5, Y - r * 0.2, X, Y + r * 0.4, X - w * 0.5, Y - r * 0.2], '#b6f6ff');
      ctx.strokeStyle = '#1b86c9'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(X, Y - r); ctx.lineTo(X + w, Y - r * 0.2); ctx.lineTo(X, Y + r); ctx.lineTo(X - w, Y - r * 0.2); ctx.closePath(); ctx.stroke();
      var tw = (sin(time * 6 + c.t) + 1) * 0.5;
      ctx.fillStyle = 'rgba(255,255,255,' + tw + ')';
      star(ctx, X + w * 0.6, Y - r * 0.7, 0.12 * S);
      return;
    }
    var rr = 0.26 * S, ww = rr * max(0.12, abs(cos(time * 3.2 + c.t)));
    ctx.fillStyle = '#e59a12';
    ctx.beginPath(); ctx.ellipse(X + 2, Y, ww, rr, 0, 0, PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath(); ctx.ellipse(X, Y, ww, rr, 0, 0, PI * 2); ctx.fill();
    ctx.fillStyle = '#fff09a';
    ctx.beginPath(); ctx.ellipse(X - ww * 0.15, Y - rr * 0.1, ww * 0.55, rr * 0.6, 0, 0, PI * 2); ctx.fill();
    ctx.fillStyle = '#f0a91a';
    if (ww > rr * 0.4) ctx.fillRect(X - ww * 0.12, Y - rr * 0.4, ww * 0.24, rr * 0.8);
  }
  function star(ctx, x, y, r) {
    ctx.beginPath();
    for (var k = 0; k < 8; k++) {
      var a = k * PI / 4, rr = k % 2 ? r * 0.35 : r;
      ctx.lineTo(x + cos(a) * rr, y + sin(a) * rr);
    }
    ctx.closePath(); ctx.fill();
  }
  DK.star = star;

  // simple iso box for props (pillars)
  function propBox(ctx, x, y, z0, z1, h, colTop, colL, colR) {
    var ax = x - h, bx = x + h, ay = y - h, by = y + h;
    poly(ctx, [sx(ax, by), sy(ax, by, z1), sx(bx, by), sy(bx, by, z1), sx(bx, by), sy(bx, by, z0), sx(ax, by), sy(ax, by, z0)], colL);
    poly(ctx, [sx(bx, ay), sy(bx, ay, z1), sx(bx, by), sy(bx, by, z1), sx(bx, by), sy(bx, by, z0), sx(bx, ay), sy(bx, ay, z0)], colR);
    poly(ctx, [sx(ax, ay), sy(ax, ay, z1), sx(bx, ay), sy(bx, ay, z1), sx(bx, by), sy(bx, by, z1), sx(ax, by), sy(ax, by, z1)], colTop);
  }

  // Text painted on a vertical plane spanning the lateral axis of a segment.
  function planeText(ctx, dir, x, y, z, str, size, fill, stroke) {
    var S = cam.S;
    var ux, uy;
    if (dir === 0) { ux = PX; uy = -PY; } else { ux = PX; uy = PY; }
    ctx.save();
    ctx.transform(ux, uy, 0, 1, sx(x, y), sy(x, y, z));
    ctx.font = '700 ' + M.round(size * S) + 'px Fredoka';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'rtl';
    if (stroke) { ctx.lineWidth = size * S * 0.2; ctx.strokeStyle = stroke; ctx.lineJoin = 'round'; ctx.strokeText(str, 0, 0); }
    ctx.fillStyle = fill; ctx.fillText(str, 0, 0);
    ctx.restore();
  }

  function gatePost(ctx, it, side) {
    var lx = DK.LX[it.dir], ly = DK.LY[it.dir], h = it.w / 2 + 0.15;
    var p = palOf(it.zone);
    var x = it.x + lx * h * side, y = it.y + ly * h * side;
    propBox(ctx, x, y, 0, 2.3, 0.13, '#ffffff', p.side, p.side2);
  }
  function gateBanner(ctx, it, time) {
    var lx = DK.LX[it.dir], ly = DK.LY[it.dir], h = it.w / 2 + 0.15;
    var p = palOf(it.zone);
    var z0 = 1.75, z1 = 2.55;
    var ax = it.x - lx * h, ay = it.y - ly * h, bx = it.x + lx * h, by = it.y + ly * h;
    var wave = sin(time * 3) * 0.04;
    ctx.fillStyle = p.curb;
    ctx.beginPath();
    ctx.moveTo(sx(ax, ay), sy(ax, ay, z1)); ctx.lineTo(sx(bx, by), sy(bx, by, z1 + wave));
    ctx.lineTo(sx(bx, by), sy(bx, by, z0 + wave)); ctx.lineTo(sx(ax, ay), sy(ax, ay, z0)); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.06 * cam.S; ctx.stroke();
    planeText(ctx, it.dir, it.x, it.y, (z0 + z1) / 2, p.name, 0.36, '#ffffff', 'rgba(40,20,70,0.45)');
  }

  function drawFlag(ctx, bf, time) {
    var seg = bf.seg;
    var h = seg.w / 2;
    var n = 8;
    for (var k = 0; k < n; k++) {
      ctx.fillStyle = k % 2 ? '#2d2a3e' : '#ffd23f';
      quad(seg, bf.s - 0.2, bf.s + 0.2, -h + k * (seg.w / n), -h + (k + 1) * (seg.w / n), 0, Q2);
      fillQuad(ctx, Q2);
    }
  }
  function drawFlagPole(ctx, bf, time) {
    var seg = bf.seg, S = cam.S;
    var side = seg.dir === 0 ? 1 : -1;
    var p = DK.Road.prototype.point(seg, bf.s, side * (seg.w / 2 + 0.2));
    var X = sx(p.x, p.y), Y0 = sy(p.x, p.y, 0), Y1 = sy(p.x, p.y, 2.6);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.09 * S; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(X, Y0); ctx.lineTo(X, Y1); ctx.stroke();
    var wv = sin(time * 5) * 0.08 * S;
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath(); ctx.moveTo(X, Y1); ctx.quadraticCurveTo(X + 0.8 * S, Y1 - wv, X + 1.6 * S, Y1 + 0.1 * S + wv);
    ctx.lineTo(X + 1.6 * S, Y1 + 0.85 * S + wv); ctx.quadraticCurveTo(X + 0.8 * S, Y1 + 0.75 * S - wv, X, Y1 + 0.75 * S); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#c98a00'; ctx.lineWidth = 2; ctx.stroke();
    ctx.font = '700 ' + M.round(0.36 * S) + 'px Fredoka';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'rtl';
    ctx.fillStyle = '#5a3a00';
    ctx.fillText('الأفضل', X + 0.8 * S, Y1 + 0.42 * S);
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath(); ctx.arc(X, Y1, 0.12 * S, 0, PI * 2); ctx.fill();
  }

  /* -------------------------------------------------------- particles */
  function drawParticle(ctx, q) {
    var X = sx(q.x, q.y), Y = sy(q.x, q.y, q.z);
    var f = q.life / q.max;
    var S = cam.S;
    var r = (q.size + (1 - f) * q.grow) * S;
    switch (q.type) {
      case 1: // spark / star
        ctx.globalAlpha = min(1, f * 1.5);
        ctx.fillStyle = q.col;
        star(ctx, X, Y, r);
        break;
      case 2: // confetti / sprinkle
        ctx.globalAlpha = min(1, f * 2);
        ctx.fillStyle = q.col;
        ctx.save(); ctx.translate(X, Y); ctx.rotate(q.rot + (1 - f) * 8); ctx.fillRect(-r, -r * 0.4, r * 2, r * 0.8); ctx.restore();
        break;
      case 3: // bubble ring
        ctx.globalAlpha = min(1, f * 1.6);
        ctx.strokeStyle = q.col; ctx.lineWidth = max(1.5, r * 0.25);
        ctx.beginPath(); ctx.arc(X, Y, r, 0, PI * 2); ctx.stroke();
        break;
      case 4: // fire (colour shifts)
        ctx.globalAlpha = min(1, f * 1.4) * 0.9;
        disc(ctx, X, Y, r, f > 0.7 ? '#fff27a' : f > 0.45 ? '#ffae3b' : f > 0.25 ? '#ff6a3d' : '#9a8aa8');
        break;
      default: // puff
        ctx.globalAlpha = min(1, f * 1.3) * (q.alpha || 0.8);
        disc(ctx, X, Y, r, q.col);
    }
    ctx.globalAlpha = 1;
  }

  /* ------------------------------------------------------------ skids */
  function drawSkids(ctx, sk) {
    if (!sk.n) return;
    ctx.lineCap = 'round';
    ctx.lineWidth = 0.13 * cam.S;
    var N = sk.cap;
    for (var pass = 0; pass < 2; pass++) {
      ctx.strokeStyle = pass === 0 ? 'rgba(80,60,110,0.13)' : 'rgba(80,60,110,0.26)';
      ctx.beginPath();
      var half = sk.n >> 1;
      for (var k = 0; k < sk.n; k++) {
        if ((k < sk.n - half) !== (pass === 0)) continue;
        var idx = (sk.head - sk.n + k + N) % N, o = idx * 4;
        var a = sk.d;
        ctx.moveTo(sx(a[o], a[o + 1]), sy(a[o], a[o + 1], 0));
        ctx.lineTo(sx(a[o + 2], a[o + 3]), sy(a[o + 2], a[o + 3], 0));
      }
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
  }

  /* -------------------------------------------------------- main draw */
  // depth-sorted draw list built from pooled entries (no per-frame object allocations)
  var drawList = [], dlPool = [], dlN = 0;
  function dl(d, k, o, side) {
    var e = dlPool[dlN] || (dlPool[dlN] = { d: 0, k: 0, o: null, side: 0 });
    dlN++;
    e.d = d; e.k = k; e.o = o; e.side = side || 0;
    drawList.push(e);
  }
  function byDepth(a, b) { return a.d - b.d; }
  DK.drawWorld = function (ctx, G) {
    var p = G.pal = blendPal(G.skyDist);
    setCam(G.cam, G.shake.x, G.shake.y);
    drawSky(ctx, p, G.time);
    drawBackground(ctx, p, G.time);
    var car = G.car;
    var falling = car.state === 'fall';
    var carS = { x: sx(car.x, car.y), y: sy(car.x, car.y, 0), S: cam.S };
    if (falling && car.fall.behind) drawCarFull(ctx, G, carS, false);
    drawRoad(ctx, G.road, G);
    if (G.bestFlag) drawFlag(ctx, G.bestFlag, G.time);
    drawSkids(ctx, G.skids);
    // depth sorted objects
    drawList.length = 0; dlN = 0;
    var i, c;
    var coins = G.road.coins;
    for (i = 0; i < coins.length; i++) {
      c = coins[i];
      if (c.taken) continue;
      var X = sx(c.x, c.y), Y = sy(c.x, c.y, c.z);
      if (X < -40 || X > W + 40 || Y < -40 || Y > H + 40) continue;
      dl(c.x + c.y, 0, c);
    }
    var items = G.road.items;
    for (i = 0; i < items.length; i++) {
      var it = items[i];
      var lx = DK.LX[it.dir], ly = DK.LY[it.dir], h = it.w / 2 + 0.15;
      dl(it.x + it.y + (lx + ly) * h, 1, it, 1);
      dl(it.x + it.y - (lx + ly) * h, 1, it, -1);
      dl(it.x + it.y + 0.01, 2, it);
    }
    if (G.bestFlag) {
      var bf = G.bestFlag, side = bf.seg.dir === 0 ? 1 : -1;
      var pp = DK.Road.prototype.point(bf.seg, bf.s, side * (bf.seg.w / 2 + 0.2));
      dl(pp.x + pp.y, 3, bf);
    }
    var parts = G.parts;
    for (i = 0; i < parts.length; i++) if (parts[i].life > 0) dl(parts[i].x + parts[i].y + parts[i].z * 0.3, 4, parts[i]);
    if (G.ghost && G.ghost.vis) dl(G.ghost.x + G.ghost.y + 0.04, 6, G.ghost);
    if (!(falling && car.fall.behind)) dl(car.x + car.y + 0.05, 5, null);
    drawList.sort(byDepth);
    for (i = 0; i < drawList.length; i++) {
      var e = drawList[i];
      switch (e.k) {
        case 0: drawCoin(ctx, e.o, G.time, p); break;
        case 1: gatePost(ctx, e.o, e.side); break;
        case 2: gateBanner(ctx, e.o, G.time); break;
        case 3: drawFlagPole(ctx, e.o, G.time); break;
        case 4: drawParticle(ctx, e.o); break;
        case 5: drawCarFull(ctx, G, carS, !falling); break;
        case 6: drawGhostCar(ctx, e.o); break;
      }
    }
    // popups
    for (i = 0; i < G.popups.length; i++) drawPopup(ctx, G.popups[i]);
  };

  function drawCarFull(ctx, G, carS, withShadow) {
    var car = G.car, model = G.model, vis = G.carVis;
    var hover = model.hover ? 0.2 + sin(G.time * 4) * 0.05 : 0;
    if (withShadow && car.state !== 'fall') {
      var ground = !car.air || G.groundUnder;
      if (ground) {
        var sl = G.pal.shadow, S = cam.S * 1.15;
        var lift = car.z + hover;
        ctx.fillStyle = 'rgba(50,30,90,' + (0.22 / (1 + lift * 0.6)).toFixed(3) + ')';
        DK.carShadow(ctx, model, { x: carS.x + lift * 0.5 * S, y: carS.y + lift * 0.15 * S, S: S, yaw: vis.yaw }, 0.75 * S * sl, 0.28 * S * sl);
      }
    }
    DK.drawCar(ctx, model, { x: carS.x, y: carS.y, S: cam.S * 1.15, yaw: vis.yaw, pitch: vis.pitch, roll: vis.roll, sq: vis.sq, z: car.z + hover });
    if (G.turbo > 0 && car.state === 'drive') {
      var cy2 = cos(vis.yaw), sy2 = sin(vis.yaw), sz = (G.turbo > 1 ? 0.24 : 0.18) + sin(G.time * 40) * 0.04;
      for (var ti = -1; ti <= 1; ti += 2) {
        var tx = car.x - cy2 * 0.92 - sy2 * (ti * 0.24), ty = car.y - sy2 * 0.92 + cy2 * (ti * 0.24);
        var fx = sx(tx, ty), fy = sy(tx, ty, car.z + 0.26);
        disc(ctx, fx, fy, sz * cam.S, 'rgba(40,195,255,0.88)');
        disc(ctx, fx, fy, sz * 0.52 * cam.S, '#e6fbff');
      }
    }
    if (model.id === 'rocket' || model.id === 'hotrod') {
      var bx = car.x + cos(vis.yaw) * -0.9, by = car.y + sin(vis.yaw) * -0.9;
      disc(ctx, sx(bx, by), sy(bx, by, car.z + (model.id === 'rocket' ? 0.42 : 0.3)), (0.14 + ran() * 0.08) * cam.S, 'rgba(255,190,60,0.85)');
    }
  }
  function drawGhostCar(ctx, gh) {
    var gx = sx(gh.x, gh.y), gy = sy(gh.x, gh.y, 0), S = cam.S;
    if (gx < -120 || gx > W + 120 || gy < -120 || gy > H + 120) return;
    ctx.strokeStyle = 'rgba(80,230,255,0.45)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.ellipse(gx, gy, 0.72 * S, 0.38 * S, 0, 0, PI * 2); ctx.stroke();
    DK.drawCar(ctx, gh.model, { x: gx, y: gy, S: S * 1.15, yaw: gh.yaw, pitch: gh.z > 0.1 ? -0.12 : 0, roll: 0, sq: 1, z: gh.z, alpha: 0.44 });
    ctx.font = '700 15px Fredoka'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'rtl';
    ctx.fillStyle = 'rgba(220,250,255,0.88)'; ctx.fillText('الأفضل', gx, sy(gh.x, gh.y, gh.z + 1.35));
  }

  var AR = /[\u0600-\u06FF]/;
  function drawPopup(ctx, q) {
    var f = q.t / q.life;
    var X = sx(q.x, q.y), Y = sy(q.x, q.y, q.z) - f * 70;
    var sc = f < 0.15 ? 0.5 + f / 0.15 * 0.7 : f < 0.25 ? 1.2 - (f - 0.15) * 2 : 1;
    ctx.save();
    ctx.globalAlpha = f > 0.75 ? (1 - f) / 0.25 : 1;
    ctx.translate(X, Y); ctx.scale(sc, sc);
    ctx.font = '700 ' + q.size + 'px Fredoka';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = AR.test(q.text) ? 'rtl' : 'ltr';
    ctx.lineJoin = 'round'; ctx.lineWidth = q.size * 0.22; ctx.strokeStyle = q.stroke || 'rgba(50,20,80,0.85)';
    ctx.strokeText(q.text, 0, 0);
    ctx.fillStyle = q.col; ctx.fillText(q.text, 0, 0);
    if (q.sub) {
      ctx.font = '700 ' + M.round(q.size * 0.55) + 'px Fredoka';
      ctx.lineWidth = q.size * 0.14;
      ctx.direction = AR.test(q.sub) ? 'rtl' : 'ltr';
      ctx.strokeText(q.sub, 0, q.size * 0.78);
      ctx.fillStyle = '#ffffff'; ctx.fillText(q.sub, 0, q.size * 0.78);
    }
    ctx.restore();
  }
})(typeof window !== 'undefined' ? window : globalThis);
