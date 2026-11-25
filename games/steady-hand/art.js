/* Steady Hand (سلك الشرارة) art: everything is drawn in code. The background and the
 * wire track of a level are drawn once into a picture (A.track) and copied every frame;
 * glows are small gradient sprites made once per colour and stamped, never shadowBlur.
 * Only the moving things (the spark, coins, lanterns, bars, doors, sparks) are drawn
 * each frame. */
(function () {
  'use strict';
  var SH = window.SH, W = SH.W, H = SH.H, TAU = Math.PI * 2;
  var A = SH.art = {};
  var INK = A.INK = '#141a44';
  A.HOT = '#ff4d7a';
  var cache = {}, tracks = {}, rgbaCache = {}, rtlCache = {};
  var DASH = [4, 6], CARRY_DASH = [10, 12], ORB_DASH = [6, 8], SW_DASH = [8, 10], SOLID = [];
  var SW_COLS = ['#2ee8a5', '#38c7ff', '#ffdf4d'];
  var HAND_PARTS = [[22, 5, 17, 54, 8.5], [37, 36, 15, 30, 7.5], [50, 40, 14, 28, 7], [14, 46, 52, 48, 19]], HAND_PASSES = [INK, '#fff'];
  A.reset = () => { cache = {}; tracks = {}; flatC = null; };

  function canvas(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
  A.pic = (c, w, h, ps) => {
    var pw = Math.ceil(w * ps), ph = Math.ceil(h * ps), g;
    c = c || canvas(pw, ph);
    if (c.width !== pw || c.height !== ph) { c.width = pw; c.height = ph; }
    g = c.getContext('2d'); g.setTransform(ps, 0, 0, ps, 0, 0); g.clearRect(0, 0, w, h);
    return [c, g];
  };
  function rgba(hex, a) {
    var k = hex + a, v = rgbaCache[k];
    if (!v) { var n = parseInt(hex.slice(1), 16); v = rgbaCache[k] = 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')'; }
    return v;
  }
  A.rgba = rgba;
  // Seeded numbers for the backgrounds, so a level always looks the same.
  function seeded(seed) { var s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  A.rr = (g, x, y, w, h, r) => {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  };
  A.circle = (g, x, y, r) => { g.beginPath(); g.arc(x, y, Math.max(0.1, r), 0, TAU); };
  var F = A.F = (g, c) => { g.fillStyle = c; g.fill(); }, S = A.S = (g, w, c) => { g.lineWidth = w; if (c) g.strokeStyle = c; g.stroke(); };
  // Text with a thick dark outline. Arabic is drawn right to left, in one piece.
  A.text = (g, s, x, y, size, color, o) => {
    o = o || {};
    g.font = (o.weight || 700) + ' ' + size + 'px Fredoka';
    g.textAlign = o.align || 'center'; g.textBaseline = 'middle';
    var rtl = rtlCache[s];
    if (rtl === undefined) rtl = rtlCache[s] = /[؀-ۿ]/.test(s);
    var dir = rtl ? 'rtl' : 'ltr';
    if (g.direction !== dir) g.direction = dir;
    if (o.stroke !== false) { g.lineJoin = 'round'; g.lineWidth = o.lw || Math.max(4, size * 0.22); g.strokeStyle = o.stroke || INK; g.strokeText(s, x, y); }
    g.fillStyle = color || '#fff'; g.fillText(s, x, y);
    if (rtl) g.direction = 'ltr';
  };

  /* -------------------------------------------------------------- glows */
  // A soft round glow of one colour, 64 px across; stamped with 'lighter'.
  A.glowSprite = color => {
    var key = 'glow' + color;
    if (!cache[key]) {
      var c = canvas(64, 64), g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, rgba(color, 0.9)); gr.addColorStop(0.25, rgba(color, 0.45)); gr.addColorStop(0.6, rgba(color, 0.12)); gr.addColorStop(1, rgba(color, 0));
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      cache[key] = c;
    }
    return cache[key];
  };
  A.glow = (g, x, y, r, color, alpha) => {
    var op = g.globalCompositeOperation, ga = g.globalAlpha;
    g.globalCompositeOperation = 'lighter'; g.globalAlpha = ga * (alpha == null ? 1 : alpha);
    g.drawImage(A.glowSprite(color), x - r, y - r, r * 2, r * 2);
    g.globalCompositeOperation = op; g.globalAlpha = ga;
  };

  /* --------------------------------------------------------- background */
  function background(g, wd, seed) {
    var gr = g.createLinearGradient(0, 0, W * 0.4, H);
    gr.addColorStop(0, wd.bg0); gr.addColorStop(1, wd.bg1);
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    // A faint circuit board: lines with corners and little solder dots.
    var rnd = seeded(seed), i;
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (i = 0; i < 46; i++) {
      var x = Math.round(rnd() * 32) * 40, y = Math.round(rnd() * 18) * 40, len = 40 + Math.round(rnd() * 4) * 40, dir = rnd() < 0.5;
      g.beginPath(); g.moveTo(x, y);
      var x2 = dir ? x + len : x, y2 = dir ? y : y + len;
      g.lineTo(x2, y2);
      var turn = rnd() < 0.6;
      if (turn) { g.lineTo(x2 + (dir ? 20 : 20 * (rnd() < 0.5 ? 1 : -1)), y2 + (dir ? 20 * (rnd() < 0.5 ? 1 : -1) : 20)); }
      g.lineWidth = 3; g.strokeStyle = rgba(wd.color, 0.07); g.stroke();
      A.circle(g, x, y, 4.5); g.fillStyle = rgba(wd.color, 0.1); g.fill();
    }
    // Twinkles.
    for (i = 0; i < 60; i++) { A.circle(g, rnd() * W, rnd() * H, 0.8 + rnd() * 1.6); g.fillStyle = 'rgba(255,255,255,' + (0.1 + rnd() * 0.25).toFixed(2) + ')'; g.fill(); }
    var v = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.38)');
    g.fillStyle = v; g.fillRect(0, 0, W, H);
  }
  // Strokes the centre line in runs of equal width (round joins make the union of the
  // segments one smooth tube). grow: px added to the full width.
  function runs(g, L, grow, from, to) {
    var segs = L.segs, i = from || 0, end = to == null ? segs.length : to;
    while (i < end) {
      var hw = segs[i].hw, j = i;
      g.beginPath(); g.moveTo(segs[i].ax, segs[i].ay);
      while (j < end && Math.abs(segs[j].hw - hw) < 0.6) { g.lineTo(segs[j].bx, segs[j].by); j++; }
      g.lineWidth = Math.max(1, hw * 2 + grow); g.stroke();
      i = j;
    }
  }
  A.runs = runs;
  function segRange(L, s0, s1) {
    var a = 0, b = L.segs.length;
    while (a < b && L.segs[a].s + L.segs[a].l < s0) a++;
    var e = a;
    while (e < b && L.segs[e].s < s1) e++;
    return [a, e];
  }
  A.segRange = segRange;
  function mix(a, b, k) {
    var x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
    var ch = s => Math.round(((x >> s) & 255) * (1 - k) + ((y >> s) & 255) * k);
    return 'rgb(' + ch(16) + ',' + ch(8) + ',' + ch(0) + ')';
  }
  var flatC = null;
  function flatRuns(g, L, ps, grow, color, alpha, from, to) {
    var segs = L.segs, a = from || 0, b = to == null ? segs.length : to, varying = false;
    for (var i = a + 1; i < b; i++) if (Math.abs(segs[i].hw - segs[a].hw) >= 0.6) { varying = true; break; }
    if (!varying) { g.strokeStyle = rgba(color, alpha); runs(g, L, grow, from, to); return; }
    var p = A.pic(flatC, W, H, ps || 1), fg = p[1];
    flatC = p[0];
    fg.lineCap = 'round'; fg.lineJoin = 'round'; fg.strokeStyle = color;
    runs(fg, L, grow, from, to);
    var ga = g.globalAlpha; g.globalAlpha = ga * alpha;
    g.drawImage(flatC, 0, 0, W, H);
    g.globalAlpha = ga;
  }
  // The wire track: glowing electric walls around a dark, safe channel.
  function drawTrack(g, L, wd, ps) {
    g.lineCap = 'round'; g.lineJoin = 'round';
    flatRuns(g, L, ps, 46, wd.deep, 0.16);
    flatRuns(g, L, ps, 26, wd.deep, 0.3);
    g.strokeStyle = wd.color; runs(g, L, 12);
    g.strokeStyle = mix(wd.color, '#ffffff', 0.92); runs(g, L, 4);
    g.strokeStyle = '#0a0e2c'; runs(g, L, 0);
    g.strokeStyle = mix('#0a0e2c', wd.color, 0.09); runs(g, L, -12);
    // Carry stretches: bands across the channel, like a crossing.
    L.carry.forEach(c => {
      var r = segRange(L, c[0], c[1]);
      flatRuns(g, L, ps, -6, '#ffbe3c', 0.16, r[0], r[1]);
      g.setLineDash(CARRY_DASH); g.lineCap = 'butt';
      g.strokeStyle = 'rgba(255,200,80,0.32)'; runs(g, L, -10, r[0], r[1]);
      g.setLineDash(SOLID); g.lineCap = 'round';
    });
    // A dotted guide along the middle.
    g.fillStyle = 'rgba(255,255,255,0.2)';
    for (var s = 40; s < L.len - 30; s += 26) { var p = SH.at(L, s); A.circle(g, p.x, p.y, 2.2); g.fill(); }
    // The start: a glowing socket under the spark.
    var st = L.start;
    A.circle(g, st.x, st.y, 21); g.lineWidth = 5; g.strokeStyle = rgba(wd.color, 0.75); g.stroke();
    A.circle(g, st.x, st.y, 13); g.fillStyle = rgba(wd.color, 0.22); g.fill();
  }
  // The picture of a level's background and track at pixel scale ps (cached).
  A.track = (L, ps) => {
    var key = L.i + '|' + ps + '|' + L.P.width.toFixed(3);
    if (!tracks[key]) {
      tracks = {};
      var p = A.pic(null, W, H, ps), wd = SH.WORLDS[L.world];
      background(p[1], wd, 7 + L.i * 131);
      drawTrack(p[1], L, wd, ps);
      tracks[key] = p[0];
    }
    return tracks[key];
  };
  // A plain world background (menus), cached.
  A.backdrop = (world, ps) => {
    var key = 'bd' + world + '|' + ps;
    if (!cache[key]) {
      var p = A.pic(null, W, H, ps);
      background(p[1], SH.WORLDS[world], 99 + world * 17);
      cache[key] = p[0];
    }
    return cache[key];
  };
  A.trackOnly = drawTrack;

  /* ------------------------------------------------------- moving walls */
  // Breathing walls: the wall colour creeps in over the channel and out again.
  // Each side is a ribbon between the wall and where the wall is now, with a bright edge.
  var pHe = new Float64Array(64);
  var pPt = (g, p, s, d, m) => { var x = p.x + p.nx * s * d, y = p.y + p.ny * s * d; if (m) g.lineTo(x, y); else g.moveTo(x, y); };
  A.pulses = (g, L, t) => {
    if (!L.pulses.length) return;
    g.lineCap = 'round'; g.lineJoin = 'round';
    var edge = rgba(A.HOT, 0.35), pts = L.pts, segs = L.segs, sLast = segs.length - 1;
    for (var j = 0; j < L.pulses.length; j++) {
      var pu = L.pulses[j], r = pu._r || (pu._r = segRange(L, pu.s0, pu.s1));
      var a0 = r[0], len = Math.min(r[1], pts.length - 1) - a0 + 1;
      if (len < 2) continue;
      if (len > pHe.length) pHe = new Float64Array(len + 16);
      var k = SH.pulseAt(pu, t), n, side = -1, q, sg;
      for (n = 0; n < len; n++) {
        q = pts[a0 + n]; sg = segs[Math.min(a0 + n, sLast)];
        pHe[n] = q.hw * (1 - (sg.p === j ? sg.amp : 0) * k);
      }
      var fill = rgba(A.HOT, ((0.5 + 0.3 * k) * 100 | 0) / 100);
      for (; side <= 1; side += 2) {
        g.beginPath();
        for (n = 0; n < len; n++) { q = pts[a0 + n]; pPt(g, q, side, q.hw + 2, n); }
        for (n = len - 1; n >= 0; n--) pPt(g, pts[a0 + n], side, pHe[n], 1);
        g.closePath(); F(g, fill);
        g.beginPath();
        for (n = 0; n < len; n++) pPt(g, pts[a0 + n], side, pHe[n], n);
        S(g, 9, edge); S(g, 3.5, '#ffe3ea');
      }
    }
  };
  function bar(g, x1, y1, x2, y2, th, color) {
    g.lineCap = 'round';
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2);
    S(g, th + 10, rgba(color, 0.28)); S(g, th, color); S(g, Math.max(2, th - 7), '#fff4f7');
  }
  // A sliding gate: a bar that slides out of a housing beside the track and back in.
  A.slide = (g, o, t) => {
    var b = SH.slideBar(o, t), hw = o.half - 12, th = o.th + 14;
    bar(g, b[0], b[1], b[2], b[3], o.th, A.HOT);
    g.save(); g.translate(o.x, o.y); g.rotate(Math.atan2(o.ny * o.side, o.nx * o.side));
    A.rr(g, hw + 10, -th / 2, 2 * hw + 34, th, th / 2); F(g, '#20264f'); S(g, 3, rgba(A.HOT, 0.9));
    g.beginPath();
    for (var x = hw + 26; x < 3 * hw + 36; x += 16) { g.moveTo(x, -th / 2 + 5); g.lineTo(x + 7, 0); g.lineTo(x, th / 2 - 5); }
    S(g, 3, rgba(A.HOT, 0.55));
    g.restore();
  };
  A.spin = (g, o, t) => {
    for (var a = 0; a < o.arms; a++) {
      var ang = SH.spinAngle(o, t, a);
      bar(g, o.px, o.py, o.px + Math.cos(ang) * o.len, o.py + Math.sin(ang) * o.len, o.th, '#ff7a2e');
    }
    A.circle(g, o.px, o.py, 14); F(g, '#ffe2b8'); S(g, 5, '#ff7a2e');
    A.circle(g, o.px, o.py, 4); F(g, INK);
  };
  // A door: two halves meeting in the middle; a = how open (0 shut).
  A.door = (g, d, a, t, still) => {
    var e = d.half, m = d.half * a, col = '#ff9f1c';
    bar(g, d.x - d.nx * e, d.y - d.ny * e, d.x - d.nx * m, d.y - d.ny * m, d.th, col);
    bar(g, d.x + d.nx * m, d.y + d.ny * m, d.x + d.nx * e, d.y + d.ny * e, d.th, col);
    if (a < 0.05) {
      // A little lock in the middle.
      var k = still ? 1 : 1 + 0.06 * Math.sin(t * 6);
      g.save(); g.translate(d.x, d.y); g.scale(k, k);
      g.beginPath(); g.arc(0, -5, 6, Math.PI, 0); S(g, 3.5, INK);
      A.rr(g, -9, -5, 18, 14, 4); F(g, '#ffd23f'); S(g, 3);
      g.restore();
    }
  };
  // A patrolling shock orb riding a dashed rail between two wall bumpers.
  A.orb = (g, o, t, still) => {
    g.lineCap = 'round';
    g.setLineDash(ORB_DASH);
    g.beginPath(); g.moveTo(o.ax, o.ay); g.lineTo(o.bx, o.by); S(g, 3, rgba(A.HOT, 0.4));
    g.setLineDash(SOLID);
    A.circle(g, o.ax, o.ay, 6.5); F(g, '#20264f'); S(g, 2.5, A.HOT);
    A.circle(g, o.bx, o.by, 6.5); F(g, '#20264f'); S(g, 2.5, A.HOT);
    var p = SH.orbPos(o, t), x = p[0], y = p[1];
    var dx = o.bx - o.ax, dy = o.by - o.ay, len = Math.hypot(dx, dy) || 1;
    var dir = still ? 0 : -Math.sin(TAU * (t * o.f + o.ph));
    var lx = (dx / len) * dir * 2.2, ly = (dy / len) * dir * 2.2;
    A.glow(g, x, y, 28, A.HOT, 0.72);
    var rot = still ? 0 : t * 4.2;
    g.beginPath();
    for (var i = 0; i < 16; i++) {
      var a = rot + i * Math.PI / 8, rr = i % 2 ? 10 : 16;
      if (i) g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); else g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    g.closePath(); F(g, A.HOT); S(g, 2, '#ffd6e4');
    A.circle(g, x, y, 10.5); F(g, '#ff85b3'); S(g, 2, '#fff');
    A.circle(g, x - 3.6 + lx, y - 0.8 + ly, 2.2); F(g, INK);
    A.circle(g, x + 3.6 + lx, y - 0.8 + ly, 2.2); F(g, INK);
    g.beginPath(); g.moveTo(x - 5.6 + lx, y - 4 + ly); g.lineTo(x - 1.4 + lx, y - 2.5 + ly);
    g.moveTo(x + 5.6 + lx, y - 4 + ly); g.lineTo(x + 1.4 + lx, y - 2.5 + ly);
    S(g, 1.8, INK);
  };
  // Switch pad + glowing cable leading to its linked energy barrier.
  A.swPad = (g, sw, st, idx, t, still, flash) => {
    var col = SW_COLS[idx % SW_COLS.length], on = st.on;
    var mx = (sw.x + sw.gx) * 0.5 + sw.gnx * 26, my = (sw.y + sw.gy) * 0.5 + sw.gny * 26;
    g.save();
    g.lineCap = 'round';
    g.beginPath(); g.moveTo(sw.x, sw.y); g.quadraticCurveTo(mx, my, sw.gx, sw.gy);
    if (on || flash) {
      S(g, flash ? 11 : 8, rgba(col, flash ? 0.55 : 0.3));
      S(g, 3.5, col);
      if (!still) { g.setLineDash(SW_DASH); g.lineDashOffset = -t * 54; S(g, 2, '#fff'); g.setLineDash(SOLID); }
    } else {
      g.setLineDash(SW_DASH);
      if (!still) g.lineDashOffset = -t * 28;
      S(g, 3, rgba(col, 0.55));
      g.setLineDash(SOLID);
    }
    g.restore();
    if (!on && !still) {
      var rp = (t * 0.9 + idx * 0.3) % 1, ga = g.globalAlpha;
      g.globalAlpha = ga * (1 - rp) * 0.75;
      A.circle(g, sw.x, sw.y, 14 + rp * 14); S(g, 3 * (1 - rp) + 0.5, col);
      g.globalAlpha = ga;
    }
    if (on || flash) A.glow(g, sw.x, sw.y, flash ? 38 : 30, col, flash ? 0.95 : 0.75);
    A.circle(g, sw.x, sw.y, 16); F(g, '#18204d'); S(g, 3.5, col);
    A.circle(g, sw.x, sw.y, 10); F(g, on ? '#fff' : col); S(g, 2, INK);
    if (on) {
      g.beginPath(); g.moveTo(sw.x - 4.5, sw.y + 0.5); g.lineTo(sw.x - 1, sw.y + 4); g.lineTo(sw.x + 5, sw.y - 3.5);
      g.lineCap = 'round'; g.lineJoin = 'round'; S(g, 2.8, INK);
    } else {
      A.circle(g, sw.x, sw.y, 3.6); F(g, '#fff');
    }
    if (sw.dur > 0 && st.left > 0) {
      var frac = Math.min(1, st.left / sw.dur);
      g.beginPath(); g.arc(sw.x, sw.y, 19.5, -Math.PI / 2, -Math.PI / 2 + TAU * frac);
      S(g, 3.5, st.left < 1.2 ? A.HOT : '#fff');
    }
  };
  // Switch-linked barrier: two halves matching the switch pad's colour, plus timer badge.
  A.swDoor = (g, sw, st, idx, t, still, badge) => {
    var col = SW_COLS[idx % SW_COLS.length], a = st.a, e = sw.ghalf, m = sw.ghalf * a;
    bar(g, sw.gx - sw.gnx * e, sw.gy - sw.gny * e, sw.gx - sw.gnx * m, sw.gy - sw.gny * m, sw.th, col);
    bar(g, sw.gx + sw.gnx * m, sw.gy + sw.gny * m, sw.gx + sw.gnx * e, sw.gy + sw.gny * e, sw.th, col);
    if (a < 0.05) {
      var k = still ? 1 : 1 + 0.06 * Math.sin(t * 6);
      g.save(); g.translate(sw.gx, sw.gy); g.scale(k, k);
      A.circle(g, 0, 0, 11); F(g, '#18204d'); S(g, 3, col);
      A.circle(g, 0, 0, 5.5); F(g, col); S(g, 2, '#fff');
      g.restore();
    }
    if (sw.dur > 0 && st.left > 0 && badge) {
      var frac = Math.min(1, st.left / sw.dur), warn = st.left < 1.2;
      A.circle(g, badge.x, badge.y, 17); F(g, 'rgba(10,14,44,0.88)'); S(g, 3, warn ? A.HOT : col);
      g.beginPath(); g.moveTo(badge.x, badge.y); g.arc(badge.x, badge.y, 12.5, -Math.PI / 2, -Math.PI / 2 + TAU * frac); g.closePath();
      F(g, warn ? A.HOT : col);
    }
  };

  /* -------------------------------------------------------------- items */
  A.coin = (g, x, y, t, still, got) => {
    var bob = still ? 0 : Math.sin(t * 3 + x * 0.05) * 3, sq = still ? 1 : Math.abs(Math.cos(t * 2.2 + x));
    y += bob;
    A.glow(g, x, y, 30, '#ffcf3a', 0.8);
    g.save(); g.translate(x, y); g.scale(0.35 + 0.65 * sq, 1);
    A.circle(g, 0, 0, 14); F(g, '#ffd23f'); S(g, 3, '#b86a00');
    A.circle(g, 0, 0, 9); S(g, 2, '#ffef9a');
    g.scale(1.25, 1.25); g.beginPath(); g.moveTo(1.5, -6); g.lineTo(-3, 1); g.lineTo(0.5, 1); g.lineTo(-1.5, 6); g.lineTo(3.5, -1); g.lineTo(0, -1); g.closePath();
    F(g, '#b86a00');
    g.restore();
  };
  A.lantern = (g, cp, lit, t, still, pop) => {
    var x = cp.lx, y = cp.ly, k = 1.2 + (pop || 0) * 0.5;
    if (lit) A.glow(g, x, y - 4, 40 * k, '#ffd23f', 0.9);
    g.save(); g.translate(x, y); g.scale(k, k);
    A.rr(g, -3, 4, 6, 14, 2); F(g, '#a9b0e0');
    A.rr(g, -10, -14, 20, 20, 6); F(g, lit ? '#fff3a8' : '#323a7a'); S(g, 3, lit ? '#ffb800' : '#c9d0ff');
    A.rr(g, -12, -19, 24, 6, 3); F(g, lit ? '#ffb800' : '#c9d0ff');
    if (lit) {
      var f = still ? 0 : Math.sin(t * 12 + x) * 1.2;
      g.beginPath(); g.moveTo(0, -11 + f); g.quadraticCurveTo(5, -4, 0, 2); g.quadraticCurveTo(-5, -4, 0, -11 + f);
      F(g, '#ff8a1f');
    }
    g.restore();
    // A faint line across the track where the checkpoint is.
    g.setLineDash(DASH);
    g.beginPath(); g.moveTo(cp.x - cp.nx * (cp.hw - 3), cp.y - cp.ny * (cp.hw - 3)); g.lineTo(cp.x + cp.nx * (cp.hw - 3), cp.y + cp.ny * (cp.hw - 3));
    S(g, 2, lit ? 'rgba(255,214,60,0.55)' : 'rgba(255,255,255,0.18)');
    g.setLineDash(SOLID);
  };
  // The lamp at the end of the track: a light bulb whose screw base points on along the
  // way (dx, dy); lit when the spark arrives.
  A.bulb = (g, x, y, r, dx, dy, lit, t, still) => {
    if (lit) {
      A.glow(g, x, y, r * 4.4, '#fff1a0', 0.95);
      if (!still) {
        g.save(); g.translate(x, y); g.rotate(t * 0.6);
        g.fillStyle = 'rgba(255,240,150,0.2)';
        for (var i = 0; i < 10; i++) { g.rotate(TAU / 10); g.beginPath(); g.moveTo(0, -r * 0.6); g.lineTo(-r * 0.34, -r * 3.6); g.lineTo(r * 0.34, -r * 3.6); g.closePath(); g.fill(); }
        g.restore();
      }
    } else A.glow(g, x, y, r * 2.2, '#fff3b0', 0.35 + (still ? 0 : 0.12 * Math.sin(t * 3)));
    g.save(); g.translate(x, y); g.rotate(Math.atan2(dy, dx));
    g.lineJoin = 'round';
    // The screw base and its dark tip.
    A.rr(g, r * 0.86, -r * 0.46, r * 0.62, r * 0.92, r * 0.16); F(g, '#c9d0e8'); S(g, 3, INK);
    g.beginPath(); g.moveTo(r * 1.06, -r * 0.46); g.lineTo(r * 1.06, r * 0.46); g.moveTo(r * 1.26, -r * 0.46); g.lineTo(r * 1.26, r * 0.46); S(g, 2.5);
    g.beginPath(); g.arc(r * 1.48, 0, r * 0.24, -Math.PI / 2, Math.PI / 2); F(g, INK);
    // The glass.
    g.beginPath(); g.arc(0, 0, r, 0.6, TAU - 0.6); g.lineTo(r * 0.88, -r * 0.46); g.lineTo(r * 0.88, r * 0.46); g.closePath();
    F(g, lit ? '#fff7c2' : 'rgba(255,248,214,0.28)'); S(g, 4, lit ? '#ffcf3a' : '#fff3c4');
    // A shine and the filament.
    g.beginPath(); g.arc(0, 0, r * 0.7, Math.PI * 1.05, Math.PI * 1.4); g.lineCap = 'round'; S(g, 3, 'rgba(255,255,255,0.75)');
    g.beginPath(); g.moveTo(r * 0.86, -r * 0.2); g.lineTo(r * 0.1, -r * 0.3); g.lineTo(-r * 0.12, -r * 0.12); g.lineTo(r * 0.06, 0); g.lineTo(-r * 0.12, r * 0.12); g.lineTo(r * 0.1, r * 0.3); g.lineTo(r * 0.86, r * 0.2);
    S(g, 3, lit ? '#ff8a1f' : '#ffd86b');
    g.restore();
  };

  /* -------------------------------------------------------------- spark */
  // The spark's body: a glowing ball of its colour (cached per colour).
  function body(col) {
    var key = 'body' + col.body;
    if (!cache[key]) {
      var c = canvas(96, 96), g = c.getContext('2d');
      var gr = g.createRadialGradient(48, 48, 0, 48, 48, 48);
      gr.addColorStop(0, rgba(col.glow, 0.75)); gr.addColorStop(0.3, rgba(col.glow, 0.35)); gr.addColorStop(1, rgba(col.glow, 0));
      g.fillStyle = gr; g.fillRect(0, 0, 96, 96);
      var b = g.createRadialGradient(43, 42, 2, 48, 48, 16);
      b.addColorStop(0, '#fff'); b.addColorStop(0.45, col.body); b.addColorStop(1, col.glow);
      A.circle(g, 48, 48, 15); g.fillStyle = b; g.fill();
      g.lineWidth = 2; g.strokeStyle = 'rgba(20,26,68,0.35)'; g.stroke();
      cache[key] = c;
    }
    return cache[key];
  }
  // o: { col, face: '' | 'happy' | 'dizzy' | 'win', lx, ly (look direction), t, still, blink, scale }
  A.spark = (g, x, y, o) => {
    var col = o.col, t = o.t, still = o.still, s = o.scale || 1;
    g.save(); g.translate(x, y); g.scale(s, s);
    // A crown of little sparks on top.
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (var i = -1; i <= 1; i++) {
      var a = -Math.PI / 2 + i * 0.6, f = still ? 0 : Math.sin(t * 18 + i * 2) * 1.5, r0 = 13, r1 = 22 + f;
      var ca = Math.cos(a), sa = Math.sin(a), px = -sa, py = ca;
      g.beginPath(); g.moveTo(ca * r0, sa * r0);
      g.lineTo(ca * (r0 + 4) + px * 3, sa * (r0 + 4) + py * 3);
      g.lineTo(ca * (r0 + 6) - px * 2, sa * (r0 + 6) - py * 2);
      g.lineTo(ca * r1, sa * r1);
      g.lineWidth = 3.2; g.strokeStyle = col.body; g.stroke();
      g.lineWidth = 1.4; g.strokeStyle = '#fff'; g.stroke();
    }
    g.drawImage(body(col), -48, -48);
    // The face.
    var lx = Math.max(-1, Math.min(1, o.lx || 0)) * 2, ly = Math.max(-1, Math.min(1, o.ly || 0)) * 2;
    if (o.face === 'dizzy') {
      g.lineWidth = 2.6; g.strokeStyle = INK;
      [-5.5, 5.5].forEach(ex => { g.beginPath(); g.moveTo(ex - 3, -5); g.lineTo(ex + 3, 1); g.moveTo(ex + 3, -5); g.lineTo(ex - 3, 1); g.stroke(); });
      g.beginPath(); g.moveTo(-5, 7); g.quadraticCurveTo(-2.5, 4, 0, 7); g.quadraticCurveTo(2.5, 10, 5, 7); g.stroke();
    } else {
      var closed = o.blink || o.face === 'happy' || o.face === 'win';
      [-5.5, 5.5].forEach(ex => {
        if (closed) { g.beginPath(); g.arc(ex, -1, 3.2, Math.PI * 1.1, Math.PI * 1.9); g.lineWidth = 2.6; g.strokeStyle = INK; g.stroke(); }
        else {
          g.beginPath(); g.ellipse(ex, -2, 3.6, 4.6, 0, 0, TAU); g.fillStyle = '#fff'; g.fill();
          A.circle(g, ex + lx * 0.7, -1.6 + ly * 0.7, 2.3); g.fillStyle = INK; g.fill();
          A.circle(g, ex + lx * 0.7 + 0.8, -2.6 + ly * 0.7, 0.8); g.fillStyle = '#fff'; g.fill();
        }
      });
      A.circle(g, -9.5, 4.5, 2.4); A.circle(g, 9.5, 4.5, 2.4); g.fillStyle = 'rgba(255,90,140,0.55)'; g.fill();
      g.beginPath();
      if (o.face === 'win') { g.arc(0, 4, 5, 0, Math.PI); g.closePath(); g.fillStyle = INK; g.fill(); }
      else { g.arc(0, 3.5, o.face === 'happy' ? 4.6 : 3.6, 0.15 * Math.PI, 0.85 * Math.PI); g.lineWidth = 2.4; g.strokeStyle = INK; g.stroke(); }
    }
    g.restore();
  };
  // Jagged electric arcs between two points (redrawn with new jags each frame).
  A.arc = (g, x1, y1, x2, y2, rnd, color, width) => {
    var dx = x2 - x1, dy = y2 - y1, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l, n = Math.max(3, Math.round(l / 9));
    g.beginPath(); g.moveTo(x1, y1);
    for (var i = 1; i < n; i++) { var k = i / n, j = (rnd() - 0.5) * Math.min(18, l * 0.4); g.lineTo(x1 + dx * k + nx * j, y1 + dy * k + ny * j); }
    g.lineTo(x2, y2);
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.lineWidth = (width || 3) + 4; g.strokeStyle = rgba(color, 0.35); g.stroke();
    g.lineWidth = width || 3; g.strokeStyle = '#fff'; g.stroke();
  };
  // Little trail shapes: 0 dot, 1 star, 2 heart, 3 bolt (4, the rainbow, uses dots).
  A.trailBit = (g, kind, x, y, r, color, rot) => {
    g.fillStyle = color;
    if (kind === 1) { A.star(g, x, y, r * 1.5, r * 0.65, rot); g.fill(); }
    else if (kind === 2) {
      g.save(); g.translate(x, y); g.rotate(rot * 0.3); g.scale(r / 6, r / 6);
      g.beginPath(); g.moveTo(0, 5); g.bezierCurveTo(-8, -1, -4, -8, 0, -3); g.bezierCurveTo(4, -8, 8, -1, 0, 5); g.fill(); g.restore();
    } else if (kind === 3) {
      g.save(); g.translate(x, y); g.rotate(rot); g.scale(r / 5, r / 5);
      g.beginPath(); g.moveTo(1.5, -6); g.lineTo(-3, 1); g.lineTo(0.5, 1); g.lineTo(-1.5, 6); g.lineTo(3.5, -1); g.lineTo(0, -1); g.closePath(); g.fill(); g.restore();
    } else { A.circle(g, x, y, r); g.fill(); }
  };
  A.star = (g, x, y, r, ri, rot) => {
    g.beginPath();
    for (var i = 0; i < 10; i++) { var a = (rot || 0) - Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? ri : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    g.closePath();
  };

  /* -------------------------------------------------------- coach icons */
  // The wordless coach's hand, fingertip at (x, y); press 0..1 squashes it.
  A.hand = (g, x, y, press, alpha) => {
    g.save(); g.globalAlpha = alpha == null ? 1 : alpha;
    g.translate(x - 24.4, y - 4 + (press || 0) * 8); g.scale(0.8, 0.8);
    // Fingers, palm and thumb: first a thick dark outline, then white on top.
    g.lineWidth = 9; g.lineJoin = 'round';
    for (var pass = 0; pass < 2; pass++) {
      var c = HAND_PASSES[pass]; g.fillStyle = g.strokeStyle = c;
      for (var i = 0; i < 4; i++) { var p = HAND_PARTS[i]; A.rr(g, p[0], p[1], p[2], p[3], p[4]); g.fill(); if (!pass) g.stroke(); }
      g.save(); g.translate(16, 59); g.rotate(0.66); A.rr(g, -13, -7, 27, 14, 7); g.fill(); if (!pass) g.stroke(); g.restore();
    }
    g.restore();
  };
  // A school mouse; pressed lights its left button.
  A.mouseIcon = (g, x, y, s, pressed, color) => {
    g.save(); g.translate(x, y); g.scale(s, s);
    g.beginPath(); g.moveTo(0, -26); g.quadraticCurveTo(4, -40, 16, -42); g.lineWidth = 4; g.strokeStyle = '#fff'; g.stroke();
    A.rr(g, -18, -26, 36, 52, 18); g.fillStyle = '#fff'; g.fill(); g.lineWidth = 4; g.strokeStyle = INK; g.stroke();
    g.beginPath(); g.moveTo(-18, -4); g.lineTo(18, -4); g.moveTo(0, -26); g.lineTo(0, -4); g.lineWidth = 3; g.stroke();
    if (pressed) {
      g.beginPath(); g.moveTo(0, -24); g.lineTo(0, -6); g.lineTo(-16, -6); g.quadraticCurveTo(-16, -24, 0, -24); g.closePath();
      g.fillStyle = color || '#ffd23f'; g.fill(); g.lineWidth = 3; g.strokeStyle = INK; g.stroke();
    }
    g.restore();
  };
  A.keycap = (g, x, y, label, w, lit) => {
    w = w || 56;
    A.rr(g, x - w / 2, y - 22, w, 48, 10); g.fillStyle = '#9aa3c7'; g.fill();
    A.rr(g, x - w / 2, y - 26, w, 46, 10); g.fillStyle = lit ? '#ffd23f' : '#fff'; g.fill(); g.lineWidth = 3; g.strokeStyle = INK; g.stroke();
    A.text(g, label, x, y - 3, label.length > 2 ? 22 : 26, INK, { stroke: false });
  };
})();
