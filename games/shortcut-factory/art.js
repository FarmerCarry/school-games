/* Shortcut Factory drawing: the six toys (and their broken twins), the factory in five
 * colours, the belts and their machines, the shipping boxes and their order cards, the copy
 * machine, the recycling bin, the worker with hats, «بُرغي» the gremlin, the school's Dell
 * Arabic keyboard, keycaps and the HUD. Static pictures are drawn once into offscreen
 * canvases (at the screen's pixel scale) and then only blitted. No image files and no
 * getImageData. */
(function () {
  'use strict';
  const SF = window.SF, W = SF.W, H = SF.H, TAU = Math.PI * 2, INK = '#1c2250';
  const A = SF.art = {};
  A.INK = INK;
  let ps = 1;
  const store = new Map();
  A.reset = function () { store.clear(); };
  A.setScale = function (s) { if (s !== ps) { ps = s; store.clear(); } };

  /* ------------------------------------------------------------- helpers */
  function cv(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
  function rr(g, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function circle(g, x, y, r) { g.beginPath(); g.arc(x, y, Math.max(0.1, r), 0, TAU); }
  function ell(g, x, y, rx, ry, rot) { g.beginPath(); g.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot || 0, 0, TAU); }
  function ink(g, lw, color) { g.lineWidth = lw || 4; g.strokeStyle = color || INK; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke(); }
  function fill(g, c) { g.fillStyle = c; g.fill(); }
  function poly(g, pts) { g.beginPath(); for (let i = 0; i < pts.length; i += 2) g[i ? 'lineTo' : 'moveTo'](pts[i], pts[i + 1]); g.closePath(); }
  function rgb(hex) { const n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function shade(hex, a) { return 'rgb(' + rgb(hex).map(v => Math.round(a >= 0 ? v + (255 - v) * a : v * (1 + a))).join(',') + ')'; }
  function alpha(hex, a) { return 'rgba(' + rgb(hex).join(',') + ',' + a + ')'; }
  function starPath(g, x, y, R, r) {
    g.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, d = i % 2 ? r : R; g[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * d, y + Math.sin(a) * d); }
    g.closePath();
  }
  const AR = /[؀-ۿ]/;
  // Text in the shared Fredoka family (its Arabic letters come from Baloo Bhaijaan 2).
  function text(g, s, x, y, size, color, o) {
    o = o || {};
    g.font = (o.weight || 700) + ' ' + size + 'px Fredoka';
    g.textAlign = o.align || 'center';
    g.textBaseline = o.base || 'middle';
    g.direction = AR.test(s) ? 'rtl' : 'ltr';
    if (o.stroke) { g.lineJoin = 'round'; g.lineWidth = o.stroke; g.strokeStyle = o.ink || INK; g.strokeText(s, x, y); }
    g.fillStyle = color;
    g.fillText(s, x, y);
  }
  // A picture drawn once at the screen's pixel scale (times k), kept in a small cache.
  function cached(key, w, h, draw, k) {
    const s = ps * (k || 1), id = key + '@' + s;
    let c = store.get(id);
    if (c) return c;
    c = cv(w * s, h * s);
    const g = c.getContext('2d');
    g.setTransform(s, 0, 0, s, 0, 0);
    draw(g, w, h);
    c.s = s;
    store.set(id, c);
    if (store.size > 220) store.delete(store.keys().next().value);
    return c;
  }
  A.rr = rr; A.circle = circle; A.ell = ell; A.ink = ink; A.fill = fill; A.text = text; A.shade = shade; A.alpha = alpha; A.starPath = starPath; A.poly = poly;

  /* ----------------------------------------------------------- palettes */
  A.THEMES = {
    sun: { wall: '#ffeaa8', wall2: '#ffdc80', floor: '#ffb757', floor2: '#f19a33', trim: '#ff7a3d', pipe: '#3fa9ff', suit: '#3f7be0', desk: '#27357a', desk2: '#33459a' },
    mint: { wall: '#cdf7e3', wall2: '#a8eed0', floor: '#5fd3a8', floor2: '#40bb8f', trim: '#ff6f9c', pipe: '#ffc22e', suit: '#ff6f91', desk: '#1d5552', desk2: '#26716c' },
    sky: { wall: '#d6efff', wall2: '#b1e0ff', floor: '#6fa9ff', floor2: '#4f8ae6', trim: '#ffc22e', pipe: '#ff8a3d', suit: '#ff9f1a', desk: '#203d7a', desk2: '#2b52a0' },
    candy: { wall: '#ffe3f2', wall2: '#ffc7e6', floor: '#ff92cc', floor2: '#ec6fb2', trim: '#4fc8ff', pipe: '#a77bff', suit: '#7d52f0', desk: '#552668', desk2: '#6e3388' },
    night: { wall: '#5a4eb4', wall2: '#4c40a2', floor: '#332b80', floor2: '#2a236c', trim: '#ffd23f', pipe: '#3df5ff', suit: '#ff7ae0', desk: '#15123d', desk2: '#221d5a' }
  };
  A.theme = id => A.THEMES[id] || A.THEMES.sun;

  /* --------------------------------------------------------------- toys */
  const TOY = {
    duck: { a: '#ffd23f', b: '#ffb800', c: '#ff8a1f' },
    ball: { a: '#ff5d6c', b: '#4fb3ff', c: '#ffd23f' },
    car: { a: '#ff4d5e', b: '#9be7ff', c: '#3a3f63' },
    robot: { a: '#c4d3ea', b: '#4f7bff', c: '#ff5d6c' },
    teddy: { a: '#c98a4a', b: '#f2cf9d', c: '#7a4a25' },
    rocket: { a: '#f4f6ff', b: '#ff5d6c', c: '#4fb3ff' }
  };
  // A broken toy: the same toy, faded and cracked, with a bandage and a loose spring.
  const BROKEN = {
    duck: { a: '#cfc6a0', b: '#b5ab82', c: '#b49a7c' },
    ball: { a: '#b69b9e', b: '#93a6b6', c: '#c7bf98' },
    car: { a: '#ad8f93', b: '#b9cfd6', c: '#55596e' },
    robot: { a: '#a9afb9', b: '#8090b2', c: '#a88a8e' },
    teddy: { a: '#9d8a78', b: '#cbbca6', c: '#5f5045' },
    rocket: { a: '#cfd1d8', b: '#ab8a8e', c: '#90a7b6' }
  };
  function eye(g, x, y, r, broken) {
    if (broken) { g.beginPath(); g.moveTo(x - r, y - r); g.lineTo(x + r, y + r); g.moveTo(x + r, y - r); g.lineTo(x - r, y + r); ink(g, 3); return; }
    circle(g, x, y, r); fill(g, INK);
    circle(g, x + r * 0.35, y - r * 0.35, r * 0.38); fill(g, '#ffffff');
  }
  function drawToy(g, kind, broken) {
    const P = (broken ? BROKEN : TOY)[kind] || TOY.duck;
    g.lineJoin = 'round';
    // a soft shadow on the floor
    ell(g, 0, 31, 28, 6); fill(g, 'rgba(28,34,80,0.22)');
    if (kind === 'duck') {
      g.beginPath(); g.moveTo(-30, 4); g.quadraticCurveTo(-36, -14, -22, -12); g.quadraticCurveTo(-14, 26, 4, 28); g.quadraticCurveTo(30, 28, 30, 10); g.quadraticCurveTo(28, -2, 14, -2); g.closePath();
      ell(g, -2, 12, 28, 17);
      fill(g, P.a); ink(g, 4);
      ell(g, -6, 12, 13, 8, -0.2); fill(g, P.b); ink(g, 3);
      circle(g, 12, -12, 15); fill(g, P.a); ink(g, 4);
      g.beginPath(); g.moveTo(24, -14); g.quadraticCurveTo(38, -12, 36, -6); g.quadraticCurveTo(30, -2, 24, -5); g.closePath(); fill(g, P.c); ink(g, 3);
      eye(g, 15, -16, 3.6, broken);
      ell(g, 8, -6, 4, 2.5); fill(g, 'rgba(255,110,140,0.45)');
    } else if (kind === 'ball') {
      circle(g, 0, 2, 27); fill(g, '#ffffff');
      g.save(); circle(g, 0, 2, 27); g.clip();
      [P.a, P.b, P.c].forEach((c, i) => { g.beginPath(); g.moveTo(0, 2); g.arc(0, 2, 30, -Math.PI / 2 + i * TAU / 3, -Math.PI / 2 + i * TAU / 3 + TAU / 6); g.closePath(); fill(g, c); });
      g.restore();
      circle(g, 0, 2, 7); fill(g, '#ffffff'); ink(g, 2.5);
      circle(g, 0, 2, 27); ink(g, 4);
      ell(g, -10, -9, 7, 4, -0.6); fill(g, 'rgba(255,255,255,0.7)');
    } else if (kind === 'car') {
      g.beginPath(); g.moveTo(-18, -6); g.quadraticCurveTo(-14, -24, 0, -24); g.quadraticCurveTo(14, -24, 18, -6); g.closePath(); fill(g, P.a); ink(g, 4);
      g.beginPath(); g.moveTo(-12, -7); g.quadraticCurveTo(-9, -19, -1, -19); g.lineTo(-1, -7); g.closePath(); fill(g, P.b); ink(g, 2.5);
      g.beginPath(); g.moveTo(3, -7); g.lineTo(3, -19); g.quadraticCurveTo(10, -19, 13, -7); g.closePath(); fill(g, P.b); ink(g, 2.5);
      rr(g, -34, -8, 68, 26, 11); fill(g, P.a); ink(g, 4);
      rr(g, 24, -2, 8, 7, 3); fill(g, '#fff6a8'); ink(g, 2);
      rr(g, -32, 6, 10, 6, 3); fill(g, '#ffffff');
      [-19, 19].forEach(x => { circle(g, x, 18, 10); fill(g, P.c); ink(g, 3.5); circle(g, x, 18, 4); fill(g, '#dfe4f2'); });
    } else if (kind === 'robot') {
      g.beginPath(); g.moveTo(0, -30); g.lineTo(0, -40); ink(g, 3.5); circle(g, 0, -42, 5); fill(g, P.c); ink(g, 3);
      rr(g, -21, -32, 42, 30, 9); fill(g, P.a); ink(g, 4);
      rr(g, -15, -26, 30, 15, 6); fill(g, '#24305e');
      if (broken) { eye(g, -7, -19, 3.5, true); eye(g, 7, -19, 3.5, true); }
      else { circle(g, -7, -19, 4.5); fill(g, '#5ff3ff'); circle(g, 7, -19, 4.5); fill(g, '#5ff3ff'); }
      g.beginPath(); g.moveTo(-6, -7); g.lineTo(6, -7); ink(g, 2.5);
      rr(g, -17, -2, 34, 26, 7); fill(g, P.b); ink(g, 4);
      circle(g, 0, 10, 5); fill(g, P.c); ink(g, 2.5);
      [-1, 1].forEach(s => { g.beginPath(); g.moveTo(s * 17, 4); g.quadraticCurveTo(s * 28, 8, s * 26, 18); ink(g, 7); ink(g, 3.5, P.a); });
      rr(g, -13, 22, 9, 8, 3); fill(g, P.a); ink(g, 3); rr(g, 4, 22, 9, 8, 3); fill(g, P.a); ink(g, 3);
    } else if (kind === 'teddy') {
      ell(g, 0, 17, 20, 14); fill(g, P.a); ink(g, 4);
      ell(g, 0, 19, 10, 8); fill(g, P.b);
      [-1, 1].forEach(s => { circle(g, s * 17, -24, 9); fill(g, P.a); ink(g, 3.5); circle(g, s * 17, -24, 4); fill(g, P.b); });
      circle(g, 0, -10, 21); fill(g, P.a); ink(g, 4);
      ell(g, 0, -3, 10, 7.5); fill(g, P.b); ink(g, 2.5);
      ell(g, 0, -6, 4, 3); fill(g, P.c);
      eye(g, -8, -14, 3.4, broken); eye(g, 8, -14, 3.4, broken);
      [-1, 1].forEach(s => { circle(g, s * 18, 12, 6); fill(g, P.a); ink(g, 3); });
      if (!broken) { circle(g, 13, 2, 5); fill(g, '#ff6f91'); ink(g, 2); }
    } else {
      // rocket
      g.beginPath(); g.moveTo(-8, 22); g.quadraticCurveTo(0, 38, 8, 22); g.closePath(); fill(g, broken ? '#b7b0a8' : '#ffb020');
      poly(g, [-13, 6, -24, 22, -11, 20]); fill(g, P.b); ink(g, 3.5);
      poly(g, [13, 6, 24, 22, 11, 20]); fill(g, P.b); ink(g, 3.5);
      g.beginPath(); g.moveTo(0, -36); g.quadraticCurveTo(16, -20, 13, 22); g.lineTo(-13, 22); g.quadraticCurveTo(-16, -20, 0, -36); g.closePath(); fill(g, P.a); ink(g, 4);
      g.save(); g.clip(); rr(g, -20, -40, 40, 18, 2); fill(g, P.b); g.restore();
      g.beginPath(); g.moveTo(0, -36); g.quadraticCurveTo(16, -20, 13, 22); g.lineTo(-13, 22); g.quadraticCurveTo(-16, -20, 0, -36); g.closePath(); ink(g, 4);
      circle(g, 0, -2, 8); fill(g, P.c); ink(g, 3); circle(g, 2.5, -4.5, 2.4); fill(g, 'rgba(255,255,255,0.8)');
    }
    if (broken) {
      // cracks, a bandage and a loose spring
      g.beginPath(); g.moveTo(-14, -8); g.lineTo(-6, 0); g.lineTo(-12, 6); g.lineTo(-3, 14); ink(g, 3);
      g.beginPath(); g.moveTo(10, 4); g.lineTo(16, 10); g.lineTo(11, 16); ink(g, 2.5);
      g.save(); g.translate(4, -2); g.rotate(-0.6);
      rr(g, -15, -6, 30, 12, 4); fill(g, '#ffe3d1'); ink(g, 2.5);
      rr(g, -5, -6, 10, 12, 2); fill(g, '#ffc3a8');
      g.restore();
      g.beginPath(); g.moveTo(18, -18);
      for (let i = 0; i < 4; i++) { g.lineTo(26 + (i % 2) * 8, -22 - i * 5); }
      ink(g, 2.5, '#6b7399');
    }
  }
  // A toy centred on (x, y); s: scale.
  A.toy = function (ctx, kind, broken, x, y, s, rot) {
    const c = cached('toy' + kind + (broken ? '!' : ''), 96, 96, g => { g.translate(48, 50); drawToy(g, kind, broken); }, 1.4);
    s = s || 1;
    if (rot) { ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.drawImage(c, -48 * s, -50 * s, 96 * s, 96 * s); ctx.restore(); }
    else ctx.drawImage(c, x - 48 * s, y - 50 * s, 96 * s, 96 * s);
  };

  /* ------------------------------------------------------------ factory */
  // The wall, the dock floor and the control desk, drawn once per colour and belt count.
  A.back = function (ctx, theme, nBelts) {
    const T = A.theme(theme);
    const c = cached('back' + theme + nBelts, W, H, g => {
      g.fillStyle = T.wall; g.fillRect(0, 0, W, 292);
      for (let x = -40; x < W; x += 96) { g.fillStyle = T.wall2; g.fillRect(x, 0, 44, 292); }
      // a pipe along the top with bolts
      rr(g, -10, 60, W + 20, 14, 7); fill(g, T.pipe); ink(g, 3.5);
      for (let x = 60; x < W; x += 210) { rr(g, x, 55, 18, 24, 5); fill(g, shade(T.pipe, -0.2)); ink(g, 3); }
      // the dock floor
      g.fillStyle = T.floor; g.fillRect(0, 288, W, 214);
      for (let y = 318; y < 500; y += 46) { g.fillStyle = T.floor2; g.fillRect(0, y, W, 4); }
      for (let i = 0; i < 14; i++) { const x = (i * 197) % W, y = 298 + ((i * 3) % 4) * 46; g.fillStyle = T.floor2; g.fillRect(x, y, 4, 42); }
      g.fillStyle = 'rgba(28,34,80,0.25)'; g.fillRect(0, 288, W, 8);
      // the control desk
      g.fillStyle = T.desk; g.fillRect(0, 500, W, 220);
      rr(g, -10, 498, W + 20, 16, 8); fill(g, T.desk2); ink(g, 4);
      g.fillStyle = 'rgba(255,255,255,0.05)';
      for (let x = 0; x < W; x += 64) g.fillRect(x, 520, 32, 200);
    });
    ctx.drawImage(c, 0, 0, W, H);
  };
  // Gears behind the belts that turn while the belts run.
  A.gears = function (ctx, theme, t, still) {
    const T = A.theme(theme);
    [[214, 96, 30, 1], [1060, 104, 24, -1.3]].forEach(([x, y, r, k]) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(still ? 0 : t * 0.8 * k);
      ctx.beginPath();
      for (let i = 0; i < 16; i++) { const a = i / 16 * TAU, d = i % 2 ? r : r + 9; ctx.lineTo(Math.cos(a) * d, Math.sin(a) * d); }
      ctx.closePath(); fill(ctx, alpha(T.wall2 === '#4c40a2' ? '#8a7ff0' : '#ffffff', 0.55));
      circle(ctx, 0, 0, r * 0.35); fill(ctx, alpha(T.pipe, 0.5));
      ctx.restore();
    });
  };
  // One belt: the toys stand on it at y; its tread runs right to left with offset.
  A.belt = function (ctx, y, offset, theme, still) {
    const T = A.theme(theme), x0 = SF.BELT.x0, x1 = SF.BELT.x1, top = y + 27, w = x1 - x0, step = 34;
    const frame = cached('beltF' + theme, w + 16, 36, g => {
      rr(g, 2, 2, w + 12, 30, 14); fill(g, '#3b4166'); ink(g, 4);
      rr(g, 2, 28, w + 12, 6, 3); fill(g, T.trim);
    });
    const tread = cached('beltT', w + step, 18, g => {
      g.fillStyle = '#272c4a'; g.fillRect(0, 0, w + step, 18);
      g.fillStyle = '#4b5383'; g.beginPath();
      for (let x = 0; x < w + step * 2; x += step) { g.moveTo(x, 0); g.lineTo(x + 12, 0); g.lineTo(x + 4, 18); g.lineTo(x - 8, 18); g.closePath(); }
      g.fill();
    });
    ctx.drawImage(frame, x0 - 8, top - 6, w + 16, 36);
    // The tread runs right to left: its stripes sit at x0 + off + k * step.
    const off = ((-offset % step) + step) % step, k = tread.s;
    ctx.drawImage(tread, (step - off) * k, 0, w * k, 18 * k, x0, top + 2, w, 18);
  };
  // The toy maker on the right (toys come out of it) and the tunnel on the left.
  A.machines = function (ctx, theme, ys, t, still) {
    const T = A.theme(theme), y0 = ys[0] - 62, y1 = ys[ys.length - 1] + 62;
    const c = cached('mach' + theme + ys.join(','), W, 300, g => {
      g.translate(0, -y0 + 10);
      // tunnel
      rr(g, 6, y0, 150, y1 - y0, 22); fill(g, T.trim); ink(g, 5);
      ys.forEach(y => {
        rr(g, 30, y - 46, 132, 80, 30); fill(g, '#272c4a'); ink(g, 4);
        g.save(); rr(g, 30, y - 46, 132, 80, 30); g.clip();
        for (let i = -2; i < 10; i++) { poly(g, [30 + i * 22, y - 46, 42 + i * 22, y - 46, 22 + i * 22, y + 34, 10 + i * 22, y + 34]); fill(g, i % 2 ? '#ffd23f' : '#272c4a'); }
        rr(g, 44, y - 34, 118, 60, 22); fill(g, '#141833');
        g.restore();
      });
      // toy maker
      rr(g, 1124, y0 - 20, 152, y1 - y0 + 20, 22); fill(g, T.pipe); ink(g, 5);
      poly(g, [1150, y0 - 20, 1250, y0 - 20, 1232, y0 - 52, 1168, y0 - 52]); fill(g, shade(T.pipe, -0.15)); ink(g, 4);
      ys.forEach(y => {
        rr(g, 1110, y - 44, 60, 76, 18); fill(g, '#141833'); ink(g, 4);
        rr(g, 1182, y - 30, 70, 46, 12); fill(g, '#ffffff'); ink(g, 3.5);
        const r = 13; circle(g, 1217, y - 7, r); fill(g, '#ffe14d'); ink(g, 3);
        g.beginPath(); g.moveTo(1217, y - 7); g.lineTo(1217 + r * 0.7, y - 7 - r * 0.6); ink(g, 3);
      });
    });
    ctx.drawImage(c, 0, y0 - 10, W, 300);
    // blinking lights on the toy maker
    for (let i = 0; i < 3; i++) {
      const on = still ? i === 0 : Math.floor(t * 3 + i) % 3 === 0;
      circle(ctx, 1170 + i * 30, y0 - 4, 7); fill(ctx, on ? ['#ff5d6c', '#ffd23f', '#5be38f'][i] : '#2a2f4f'); ink(ctx, 2.5);
    }
  };

  /* ---------------------------------------------------------------- boxes */
  const CARD = { a: '#eab06c', b: '#d48f48', c: '#c27b36' };
  // The back of an open box (flaps open) and its inside; k: 0 open .. 1 closed for shipping.
  A.boxBack = function (ctx, x, y, k, glow) {
    if (glow) { rr(ctx, x - 146, y - 26, 292, 236, 26); fill(ctx, alpha(glow, 0.3)); }
    if (!k) { ctx.drawImage(cached('boxB', 280, 160, g => boxBack(g, 140, 30, 0)), x - 140, y - 30, 280, 160); return; }
    boxBack(ctx, x, y, k);
  };
  function boxBack(ctx, x, y, k) {
    const fl = 1 - k;
    // the back flap
    poly(ctx, [x - 124, y + 14, x + 124, y + 14, x + 112, y + 14 - 34 * fl, x - 112, y + 14 - 34 * fl]); fill(ctx, CARD.b); ink(ctx, 4);
    rr(ctx, x - 130, y + 12, 260, 112, 10); fill(ctx, CARD.c); ink(ctx, 4);
    rr(ctx, x - 120, y + 20, 240, 18, 6); fill(ctx, 'rgba(28,34,80,0.18)');
  }
  A.boxFront = function (ctx, x, y, k) {
    if (!k) { ctx.drawImage(cached('boxF', 340, 236, g => boxFront(g, 170, 26, 0)), x - 170, y - 26, 340, 236); return; }
    boxFront(ctx, x, y, k);
  };
  function boxFront(ctx, x, y, k) {
    const fl = 1 - k;
    rr(ctx, x - 136, y + 118, 272, 84, 12); fill(ctx, CARD.a); ink(ctx, 4.5);
    rr(ctx, x - 136, y + 118, 272, 10, 5); fill(ctx, 'rgba(255,255,255,0.25)');
    // side flaps fold in when the box closes
    poly(ctx, [x - 132, y + 16, x - 132 - 30 * fl, y + 4 - 22 * fl + 10 * k, x - 132 - 22 * fl + 112 * k, y - 18 * fl + 12 * k, x - 132 + 120 * k, y + 16]); fill(ctx, CARD.b); ink(ctx, 4);
    poly(ctx, [x + 132, y + 16, x + 132 + 30 * fl, y + 4 - 22 * fl + 10 * k, x + 132 + 22 * fl - 112 * k, y - 18 * fl + 12 * k, x + 132 - 120 * k, y + 16]); fill(ctx, CARD.b); ink(ctx, 4);
    if (k > 0.6) { rr(ctx, x - 22, y + 2, 44, 120 * (k - 0.6) / 0.4, 4); fill(ctx, 'rgba(255,240,190,0.9)'); }
  }
  // The order card on a box's front: the Arabic order and each toy with how many are in.
  A.orderCard = function (ctx, x, y, order, have, state, oid) {
    const kinds = SF.KINDS.filter(k => order[k] > 0);
    const key = 'card' + kinds.map(k => k + order[k] + '.' + (have[k] || 0)).join() + state + oid;
    const c = cached(key, 250, 76, g => {
      const ok = state === 'ready', bad = state === 'wrong';
      rr(g, 3, 3, 244, 70, 14); fill(g, ok ? '#c8f8d9' : '#ffffff'); ink(g, 3.5, ok ? '#20a85a' : bad ? '#ff4d5e' : INK);
      circle(g, 26, 22, 14); fill(g, ok ? '#20a85a' : '#ffd23f'); ink(g, 3);
      text(g, String(oid), 26, 23, 17, ok ? '#ffffff' : INK);
      text(g, SF.orderText(order), 135, 22, 20, INK);
      const n = kinds.length, gw = 74, x0 = 125 + (n - 1) * gw / 2;
      kinds.forEach((k, i) => {
        const gx = x0 - i * gw, h = Math.min(have[k] || 0, order[k]), done = h >= order[k];
        g.save(); g.translate(gx + 14, 52); g.scale(0.36, 0.36); g.translate(0, 2); drawToy(g, k, false); g.restore();
        text(g, h + '/' + order[k], gx - 18, 53, 18, done ? '#20a85a' : '#5a6290');
        if (done) { circle(g, gx + 28, 41, 8); fill(g, '#20a85a'); g.beginPath(); g.moveTo(gx + 24, 41); g.lineTo(gx + 27, 44); g.lineTo(gx + 32, 37); ink(g, 2.5, '#ffffff'); }
      });
    });
    ctx.drawImage(c, x - 125, y + 124, 250, 76);
  };
  // The round Enter button on a ready box.
  A.enterBadge = function (ctx, x, y, pulse) {
    const r = 33 + pulse * 3;
    circle(ctx, x, y + 4, r); fill(ctx, '#167a42');
    circle(ctx, x, y, r); fill(ctx, '#3ddc84'); ink(ctx, 4.5);
    text(ctx, 'Enter', x, y - 6, 17, '#ffffff', { stroke: 4 });
    // a little truck
    ctx.save(); ctx.translate(x, y + 14);
    rr(ctx, -14, -7, 16, 12, 2); fill(ctx, '#ffffff'); ink(ctx, 2);
    rr(ctx, 2, -3, 10, 8, 2); fill(ctx, '#ffffff'); ink(ctx, 2);
    circle(ctx, -9, 6, 3); fill(ctx, INK); circle(ctx, 7, 6, 3); fill(ctx, INK);
    ctx.restore();
  };

  /* ------------------------------------------------- copier, bin, stamp */
  A.copier = function (ctx, x, y, clip, bump, t, still) {
    const s = 1 + bump * 0.08, dy = bump * 4;
    ctx.save(); ctx.translate(x, y + 100); ctx.scale(2 - s, s); ctx.translate(-x, -y - 100);
    const body = cached('copier' + !!clip, 172, 200, g => {
      g.translate(86, 0);
      rr(g, -80, 78, 160, 116, 20); fill(g, '#ff7a59'); ink(g, 4.5);
      rr(g, -64, 120, 128, 42, 12); fill(g, '#ffffff'); ink(g, 3.5);
      text(g, 'آلة النسخ', 0, 141, 19, INK);
      rr(g, -50, 172, 100, 12, 6); fill(g, '#272c4a');
      circle(g, 60, 98, 9); fill(g, clip ? '#3ddc84' : '#b8bfd8'); ink(g, 3);
      // the glass dome shows what is on the clipboard
      rr(g, -72, 2, 144, 84, 26); fill(g, '#d9f6ff'); ink(g, 4.5);
      rr(g, -62, 10, 40, 12, 6); fill(g, 'rgba(255,255,255,0.8)');
      if (!clip) text(g, '?', 0, 46, 34, 'rgba(28,34,80,0.25)');
    });
    ctx.drawImage(body, x - 86, y, 172, 200);
    rr(ctx, x - 34, y + 176 - dy, 68, 16, 3); fill(ctx, '#ffffff'); ink(ctx, 2.5);
    circle(ctx, x - 60, y + 98, 6); fill(ctx, still || Math.floor(t * 2) % 2 ? '#ffd23f' : '#ff9a1f'); ink(ctx, 2.5);
    if (clip && clip.items.length) {
      const n = Math.min(3, clip.items.length), more = clip.items.length - n;
      for (let i = 0; i < n; i++) {
        const it = clip.items[i], px = x + (n - 1) * 22 - i * 44 - (more ? 10 : 0);
        A.toy(ctx, it.k, it.b, px, y + 48, 0.62);
      }
      if (more) text(ctx, '+' + more, x - 52, y + 50, 20, INK);
      // copy: two sheets; cut: scissors
      ctx.save(); ctx.translate(x + 64, y + 4);
      circle(ctx, 0, 0, 17); fill(ctx, clip.cut ? '#ff5d6c' : '#4fb3ff'); ink(ctx, 3);
      if (clip.cut) A.scissors(ctx, 0, 0, 0.55, '#ffffff');
      else { rr(ctx, -8, -9, 12, 15, 2); fill(ctx, '#ffffff'); ink(ctx, 2); rr(ctx, -3, -5, 12, 15, 2); fill(ctx, '#ffffff'); ink(ctx, 2); }
      ctx.restore();
    }
    ctx.restore();
  };
  A.scissors = function (ctx, x, y, k, color) {
    ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
    ctx.beginPath(); ctx.moveTo(-14, -14); ctx.lineTo(10, 8); ctx.moveTo(14, -14); ctx.lineTo(-10, 8); ink(ctx, 5, color || INK);
    circle(ctx, -12, 12, 7); ink(ctx, 4.5, color || INK); circle(ctx, 12, 12, 7); ink(ctx, 4.5, color || INK);
    ctx.restore();
  };
  // Three chasing arrows.
  A.recycle = function (ctx, x, y, r, color) {
    ctx.save(); ctx.translate(x, y);
    for (let i = 0; i < 3; i++) {
      ctx.save(); ctx.rotate(i * TAU / 3);
      ctx.beginPath(); ctx.arc(0, 0, r, -Math.PI / 2 + 0.35, -Math.PI / 2 + 1.75); ink(ctx, r * 0.32, color);
      const a = -Math.PI / 2 + 1.95, px = Math.cos(a) * r, py = Math.sin(a) * r;
      ctx.translate(px, py); ctx.rotate(a + Math.PI / 2);
      poly(ctx, [-r * 0.32, -r * 0.3, r * 0.32, -r * 0.3, 0, r * 0.32]); ctx.rotate(0); fill(ctx, color);
      ctx.restore();
    }
    ctx.restore();
  };
  A.bin = function (ctx, x, y, bump, t, still) {
    const lift = bump * 14;
    ctx.drawImage(cached('bin', 124, 136, g => {
      g.translate(62, -30);
      poly(g, [-58, 34, 58, 34, 48, 160, -48, 160]); fill(g, '#3fc46f'); ink(g, 4.5);
      for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(i * 20, 48); g.lineTo(i * 17, 148); ink(g, 3, 'rgba(28,34,80,0.25)'); }
      A.recycle(g, 0, 90, 24, '#ffffff');
    }), x - 62, y + 30, 124, 136);
    ctx.save(); ctx.translate(x - 62, y + 34); ctx.rotate(-bump * 0.5); ctx.translate(-(x - 62), -(y + 34));
    rr(ctx, x - 64, y + 16 - lift, 128, 22, 10); fill(ctx, '#2c9e55'); ink(ctx, 4);
    rr(ctx, x - 18, y + 6 - lift, 36, 12, 6); ink(ctx, 4);
    ctx.restore();
  };
  A.stampMark = function (ctx, x, y, k, rot) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot || -0.18); ctx.scale(k, k);
    circle(ctx, 0, 0, 86); ink(ctx, 10, '#e2364f'); circle(ctx, 0, 0, 70); ink(ctx, 4, '#e2364f');
    text(ctx, 'تم!', 0, -8, 52, '#e2364f');
    starPath(ctx, -38, 34, 11, 5); fill(ctx, '#e2364f'); starPath(ctx, 0, 42, 11, 5); fill(ctx, '#e2364f'); starPath(ctx, 38, 34, 11, 5); fill(ctx, '#e2364f');
    ctx.restore();
  };
  A.stamper = function (ctx, x, y, k) {
    ctx.save(); ctx.translate(x, y);
    rr(ctx, -46, -14, 92, 26, 8); fill(ctx, '#e2364f'); ink(ctx, 4);
    rr(ctx, -18, -66, 36, 54, 10); fill(ctx, '#ffd23f'); ink(ctx, 4);
    circle(ctx, 0, -78, 22); fill(ctx, '#ffd23f'); ink(ctx, 4);
    ctx.restore();
  };

  /* --------------------------------------------------------- characters */
  A.hat = function (g, id, x, y, t, still) {
    if (!id || id === 'none') return;
    g.save(); g.translate(x, y);
    if (id === 'cap') {
      g.beginPath(); g.moveTo(-34, 4); g.quadraticCurveTo(-32, -30, 0, -30); g.quadraticCurveTo(32, -30, 34, 4); g.closePath(); fill(g, '#ff5d6c'); ink(g, 4);
      g.beginPath(); g.moveTo(16, -2); g.quadraticCurveTo(52, -6, 58, 6); g.quadraticCurveTo(40, 10, 16, 6); g.closePath(); fill(g, '#e2364f'); ink(g, 4);
      circle(g, 0, -30, 5); fill(g, '#ffd23f'); ink(g, 3);
    } else if (id === 'hard') {
      g.beginPath(); g.arc(0, 2, 38, Math.PI, TAU); g.closePath(); fill(g, '#ffd23f'); ink(g, 4);
      rr(g, -46, -2, 92, 10, 5); fill(g, '#ffb800'); ink(g, 4);
      rr(g, -6, -34, 12, 32, 4); fill(g, '#ffe98a'); ink(g, 3);
    } else if (id === 'chef') {
      rr(g, -26, -16, 52, 22, 6); fill(g, '#ffffff'); ink(g, 4);
      [-18, 0, 18].forEach((dx, i) => { circle(g, dx, -30 - (i === 1 ? 8 : 0), 16); fill(g, '#ffffff'); ink(g, 4); });
      rr(g, -24, -20, 48, 14, 4); fill(g, '#ffffff');
    } else if (id === 'party') {
      poly(g, [-24, 4, 0, -62, 24, 4]); fill(g, '#b48cff'); ink(g, 4);
      g.save(); poly(g, [-24, 4, 0, -62, 24, 4]); g.clip();
      for (let j = 0; j < 5; j++) { rr(g, -30, -54 + j * 14, 60, 6, 3); fill(g, ['#ffd23f', '#5be38f', '#ff5d6c', '#4fd1ff', '#ffffff'][j]); }
      g.restore(); poly(g, [-24, 4, 0, -62, 24, 4]); ink(g, 4);
      circle(g, 0, -64, 8); fill(g, '#ffd23f'); ink(g, 3.5);
    } else if (id === 'crown') {
      poly(g, [-30, 4, -34, -32, -16, -14, 0, -40, 16, -14, 34, -32, 30, 4]); fill(g, '#ffd23f'); ink(g, 4);
      circle(g, 0, -8, 6); fill(g, '#ff5d6c'); ink(g, 2.5); circle(g, -18, -6, 4); fill(g, '#4fd1ff'); circle(g, 18, -6, 4); fill(g, '#5be38f');
    } else if (id === 'prop') {
      g.beginPath(); g.arc(0, 2, 35, Math.PI, TAU); g.closePath(); fill(g, '#4fd1ff'); ink(g, 4);
      g.save(); g.beginPath(); g.arc(0, 2, 35, Math.PI, TAU); g.closePath(); g.clip();
      rr(g, -40, -14, 80, 10, 2); fill(g, '#ff5d6c'); rr(g, -40, -26, 80, 6, 2); fill(g, '#ffd23f'); g.restore();
      g.beginPath(); g.arc(0, 2, 35, Math.PI, TAU); ink(g, 4);
      g.beginPath(); g.moveTo(0, -33); g.lineTo(0, -44); ink(g, 4);
      const a = still ? 0.3 : t * 14, sx = Math.cos(a);
      ell(g, 0, -46, 30 * Math.abs(sx) + 4, 6); fill(g, '#ffd23f'); ink(g, 3);
      circle(g, 0, -46, 5); fill(g, '#ff5d6c'); ink(g, 2.5);
    }
    g.restore();
  };
  // The worker at the desk. o: { hat, theme, mood: '' | 'happy' | 'oops' | 'wow', t, still, type (0..1 typing) }
  // At rest (most of the time) the worker is one picture drawn once.
  A.worker = function (ctx, x, y, o) {
    const blink = !o.still && ((o.t || 0) % 3.3) < 0.12;
    if (!o.mood && !(o.type > 0.02) && !blink && (o.still || o.hat !== 'prop')) {
      const rest = cached('worker' + o.hat + o.theme, 240, 290, g => worker(g, 90, 270, { hat: o.hat, theme: o.theme, t: 0, still: true }));
      ctx.drawImage(rest, x - 90, y - 270, 240, 290);
      return;
    }
    worker(ctx, x, y, o);
  };
  function worker(ctx, x, y, o) {
    const T = A.theme(o.theme), t = o.t || 0, still = o.still, mood = o.mood || '';
    const hop = mood === 'happy' && !still ? Math.abs(Math.sin(t * 9)) * 10 : 0;
    ctx.save(); ctx.translate(x, y - hop);
    // body and overalls
    rr(ctx, -46, -96, 92, 110, 34); fill(ctx, '#ffffff'); ink(ctx, 4.5);
    rr(ctx, -40, -66, 80, 82, 22); fill(ctx, T.suit); ink(ctx, 4);
    rr(ctx, -20, -54, 40, 26, 8); fill(ctx, shade(T.suit, 0.25)); ink(ctx, 3);
    [-1, 1].forEach(s => { rr(ctx, s * 26 - 6, -96, 12, 36, 5); fill(ctx, T.suit); ink(ctx, 3); circle(ctx, s * 26, -64, 4.5); fill(ctx, '#ffd23f'); ink(ctx, 2); });
    // arms to the keyboard (they bob while typing)
    const ty = still ? 0 : (o.type || 0) * Math.sin(t * 30) * 4;
    const wave = mood === 'happy' || mood === 'wow';
    ctx.beginPath(); ctx.moveTo(40, -70); ctx.quadraticCurveTo(84, -60, 104, -36 + ty); ink(ctx, 16); ink(ctx, 10, '#ffffff');
    circle(ctx, 106, -34 + ty, 11); fill(ctx, '#ffd2a8'); ink(ctx, 3.5);
    if (wave) {
      const a = still ? 0 : Math.sin(t * 12) * 0.4;
      ctx.save(); ctx.translate(-40, -74); ctx.rotate(a);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-30, -20, -26, -58); ink(ctx, 16); ink(ctx, 10, '#ffffff');
      circle(ctx, -26, -62, 11); fill(ctx, '#ffd2a8'); ink(ctx, 3.5);
      ctx.restore();
    } else {
      ctx.beginPath(); ctx.moveTo(-36, -70); ctx.quadraticCurveTo(-6, -40, 40, -30 - ty); ink(ctx, 16); ink(ctx, 10, '#ffffff');
      circle(ctx, 44, -30 - ty, 11); fill(ctx, '#ffd2a8'); ink(ctx, 3.5);
    }
    // head
    const hy = -136;
    circle(ctx, 0, hy, 42); fill(ctx, '#ffd2a8'); ink(ctx, 4.5);
    ctx.beginPath(); ctx.moveTo(-30, hy - 26); ctx.quadraticCurveTo(-8, hy - 52, 22, hy - 34); ctx.quadraticCurveTo(4, hy - 30, -30, hy - 26); fill(ctx, '#6b3d1f');
    const blink = !still && (t % 3.3) < 0.12;
    [-15, 15].forEach(ex => {
      if (mood === 'happy') { ctx.beginPath(); ctx.moveTo(ex - 7, hy - 4); ctx.quadraticCurveTo(ex, hy - 13, ex + 7, hy - 4); ink(ctx, 4); }
      else if (mood === 'wow') { starPath(ctx, ex, hy - 6, 9, 4); fill(ctx, '#ffd23f'); ink(ctx, 2.5); }
      else if (blink) { ctx.beginPath(); ctx.moveTo(ex - 7, hy - 6); ctx.lineTo(ex + 7, hy - 6); ink(ctx, 4); }
      else { ell(ctx, ex, hy - 6, 6.5, 8); fill(ctx, INK); circle(ctx, ex + 2, hy - 9, 2.4); fill(ctx, '#ffffff'); }
    });
    ell(ctx, -27, hy + 8, 7, 4.5); fill(ctx, 'rgba(255,100,130,0.45)'); ell(ctx, 27, hy + 8, 7, 4.5); fill(ctx, 'rgba(255,100,130,0.45)');
    if (mood === 'oops') {
      ell(ctx, 0, hy + 16, 7, 9); fill(ctx, '#7a1f3d'); ink(ctx, 3);
      ctx.beginPath(); ctx.moveTo(36, hy - 22); ctx.quadraticCurveTo(46, hy - 8, 38, hy - 4); ctx.quadraticCurveTo(30, hy - 8, 36, hy - 22); fill(ctx, '#7fd3ff'); ink(ctx, 2);
    } else if (mood === 'happy' || mood === 'wow') {
      ctx.beginPath(); ctx.moveTo(-14, hy + 8); ctx.quadraticCurveTo(0, hy + 30, 14, hy + 8); ctx.closePath(); fill(ctx, '#7a1f3d'); ink(ctx, 3);
    } else { ctx.beginPath(); ctx.moveTo(-11, hy + 10); ctx.quadraticCurveTo(0, hy + 20, 11, hy + 10); ink(ctx, 3.5); }
    A.hat(ctx, o.hat, 0, hy - 32, t, still);
    ctx.restore();
  }
  // «بُرغي» the gremlin robot. o: { phase, t, still, look (-1..1) }
  A.gremlin = function (ctx, x, y, o) {
    const t = o.t || 0, still = o.still, ph = o.phase;
    const bob = still ? 0 : Math.sin(t * 6) * 4, laugh = ph === 'mess', flee = ph === 'flee';
    ctx.save(); ctx.translate(x, y + bob);
    if (flee && !still) ctx.rotate(t * 12);
    // jet
    if (!flee) {
      const f = still ? 1 : 0.8 + Math.sin(t * 40) * 0.2;
      poly(ctx, [-12, 30, 12, 30, 0, 30 + 26 * f]); fill(ctx, '#ffb020');
      poly(ctx, [-6, 30, 6, 30, 0, 30 + 14 * f]); fill(ctx, '#fff3a8');
    }
    // antennae with springs
    [-1, 1].forEach(s => {
      ctx.beginPath(); ctx.moveTo(s * 14, -30);
      for (let i = 1; i <= 4; i++) ctx.lineTo(s * (14 + (i % 2 ? 6 : -2)) + (laugh && !still ? Math.sin(t * 20 + s) * 3 : 0), -30 - i * 6);
      ink(ctx, 3);
      circle(ctx, s * 16, -58, 6); fill(ctx, s < 0 ? '#ffd23f' : '#ff7ae0'); ink(ctx, 2.5);
    });
    // arms
    const up = laugh ? -1 : 0;
    [-1, 1].forEach(s => {
      ctx.beginPath(); ctx.moveTo(s * 32, 0); ctx.quadraticCurveTo(s * 50, 4 + up * 20, s * 48, 18 + up * 34); ink(ctx, 9); ink(ctx, 5, '#9f74ff');
      circle(ctx, s * 48, 20 + up * 34, 6); fill(ctx, '#ffd23f'); ink(ctx, 2.5);
    });
    rr(ctx, -34, -32, 68, 62, 22); fill(ctx, '#8f5cf7'); ink(ctx, 4.5);
    rr(ctx, -22, 10, 44, 14, 6); fill(ctx, '#b99bff');
    // the one big eye
    circle(ctx, 0, -10, 17); fill(ctx, '#ffffff'); ink(ctx, 3.5);
    if (laugh) { ctx.beginPath(); ctx.moveTo(-9, -8); ctx.quadraticCurveTo(0, -20, 9, -8); ink(ctx, 4); }
    else if (flee) { ctx.beginPath(); for (let a = 0; a < 12; a += 0.4) ctx.lineTo(Math.cos(a) * a * 1.1, -10 + Math.sin(a) * a * 1.1); ink(ctx, 2.5); }
    else { circle(ctx, (o.look || 0) * 6, -9, 7); fill(ctx, INK); circle(ctx, (o.look || 0) * 6 + 2.5, -12, 2.4); fill(ctx, '#ffffff'); }
    ctx.beginPath(); ctx.moveTo(-16, -30); ctx.lineTo(-2, -26); ink(ctx, 4);
    // the grin
    ctx.beginPath(); ctx.moveTo(-16, 12); ctx.quadraticCurveTo(0, flee ? 4 : 24, 16, 12); ctx.closePath(); fill(ctx, '#3b1d6e'); ink(ctx, 3);
    if (!flee) { rr(ctx, -9, 12, 6, 5, 1); fill(ctx, '#ffffff'); rr(ctx, 3, 12, 6, 5, 1); fill(ctx, '#ffffff'); }
    ctx.restore();
    if (flee) for (let i = 0; i < 3; i++) { const a = (still ? 0 : t * 5) + i * TAU / 3; starPath(ctx, x + Math.cos(a) * 44, y - 50 + Math.sin(a) * 12, 10, 4); fill(ctx, '#ffd23f'); ink(ctx, 2); }
  };
  // A white glove that points with its fingertip at (x, y).
  A.hand = function (ctx, x, y, press) {
    const c = cached('hand', 80, 100, g => {
      g.translate(30, 6);
      g.beginPath(); rr(g, -9, 0, 18, 52, 9); fill(g, '#ffffff'); ink(g, 5);
      rr(g, 6, 30, 16, 30, 8); fill(g, '#ffffff'); ink(g, 4.5);
      rr(g, 18, 34, 15, 28, 7); fill(g, '#ffffff'); ink(g, 4.5);
      g.save(); g.translate(-12, 48); g.rotate(0.65); rr(g, -14, -7, 28, 14, 7); fill(g, '#ffffff'); ink(g, 4.5); g.restore();
      rr(g, -16, 42, 50, 46, 18); fill(g, '#ffffff'); ink(g, 5);
      rr(g, -9, 2, 18, 40, 9); fill(g, '#ffffff');
      rr(g, -12, 80, 44, 14, 5); fill(g, '#ffd23f'); ink(g, 4);
    });
    ctx.drawImage(c, x - 30, y - 6 + (press || 0) * 12, 80, 100);
  };

  /* ------------------------------------------------------------ keyboard */
  // The school's Dell keyboard with the Arabic 101 layout (rows Tab .. Ctrl; Delete and the
  // arrows to the right). Each key: KeyboardEvent.code, Latin legend, Arabic legend, width.
  const KB = [
    [['Tab', 'Tab', '', 1.5], ['KeyQ', 'Q', 'ض'], ['KeyW', 'W', 'ص'], ['KeyE', 'E', 'ث'], ['KeyR', 'R', 'ق'], ['KeyT', 'T', 'ف'], ['KeyY', 'Y', 'غ'], ['KeyU', 'U', 'ع'],
      ['KeyI', 'I', 'ه'], ['KeyO', 'O', 'خ'], ['KeyP', 'P', 'ح'], ['BracketLeft', '[', 'ج'], ['BracketRight', ']', 'د'], ['Backslash', '\\', '', 1.5]],
    [['CapsLock', 'Caps', '', 1.75], ['KeyA', 'A', 'ش'], ['KeyS', 'S', 'س'], ['KeyD', 'D', 'ي'], ['KeyF', 'F', 'ب'], ['KeyG', 'G', 'ل'], ['KeyH', 'H', 'ا'], ['KeyJ', 'J', 'ت'],
      ['KeyK', 'K', 'ن'], ['KeyL', 'L', 'م'], ['Semicolon', ';', 'ك'], ['Quote', '\'', 'ط'], ['Enter', 'Enter', '', 2.25]],
    [['ShiftLeft', 'Shift', '', 2.25], ['KeyZ', 'Z', 'ئ'], ['KeyX', 'X', 'ء'], ['KeyC', 'C', 'ؤ'], ['KeyV', 'V', 'ر'], ['KeyB', 'B', 'لا'], ['KeyN', 'N', 'ى'], ['KeyM', 'M', 'ة'],
      ['Comma', ',', 'و'], ['Period', '.', 'ز'], ['Slash', '/', 'ظ'], ['ShiftRight', 'Shift', '', 2.75]],
    [['ControlLeft', 'Ctrl', '', 1.5], ['MetaLeft', '', '', 1.25], ['AltLeft', 'Alt', '', 1.25], ['Space', '', 'مسافة', 7], ['AltRight', 'Alt', '', 1.25], ['ContextMenu', '', '', 1.25], ['ControlRight', 'Ctrl', '', 1.5]]
  ];
  A.KEYS = {};
  KB.forEach((row, r) => { let x = 0; row.forEach(k => { A.KEYS[k[0]] = { code: k[0], lat: k[1], ar: k[2], x: x, row: r, w: k[3] || 1, letter: /^Key/.test(k[0]) }; x += k[3] || 1; }); });
  [['Delete', 'Delete', 15.35, 0, 1.3], ['ArrowUp', '↑', 16.45, 2, 1], ['ArrowLeft', '←', 15.45, 3, 1], ['ArrowDown', '↓', 16.45, 3, 1], ['ArrowRight', '→', 17.45, 3, 1]].forEach(a => {
    A.KEYS[a[0]] = { code: a[0], lat: a[1], ar: '', x: a[2], row: a[3], w: a[4], letter: false, arrow: true };
  });
  A.KB_UNITS = 18.45;
  // st: 'idle' | 'glow' | 'down' | 'ok' (glowing and held)
  function keyCap(g, k, x, y, w, h, st) {
    const r = Math.max(4, h * 0.18);
    const face = st === 'glow' ? '#ffe14d' : st === 'ok' ? '#7ef0a2' : st === 'down' ? '#5a6396' : '#2c3150';
    const side = st === 'glow' ? '#d99a00' : st === 'ok' ? '#2fae62' : '#141730';
    const dip = st === 'down' || st === 'ok' ? h * 0.07 : 0;
    rr(g, x, y + dip, w, h - dip, r); fill(g, side);
    rr(g, x + h * 0.07, y + dip + h * 0.05, w - h * 0.14, h - dip - h * 0.2, r * 0.8); fill(g, face);
    rr(g, x, y + dip, w, h - dip, r); ink(g, Math.max(2, h * 0.055), '#0b0d1f');
    const dark = st === 'glow' || st === 'ok', col = dark ? INK : '#ffffff', fy = y + dip, fh = h - dip - h * 0.16, pad = h * 0.15;
    if (k.letter) {
      text(g, k.lat, x + pad, fy + pad * 0.6, h * 0.36, col, { align: 'left', base: 'top' });
      text(g, k.ar, x + w - pad, fy + fh - pad * 0.15, h * 0.34, dark ? INK : 'rgba(255,255,255,0.75)', { align: 'right', base: 'bottom' });
    } else if (k.code === 'Space') text(g, k.ar, x + w / 2, fy + fh / 2 + 2, h * 0.3, 'rgba(255,255,255,0.6)');
    else if (k.arrow && k.lat.length === 1) text(g, k.lat, x + w / 2, fy + fh / 2 + 2, h * 0.42, col);
    else if (k.lat.length === 1) text(g, k.lat, x + pad, fy + fh - pad * 0.2, h * 0.32, col, { align: 'left', base: 'bottom' });
    else if (k.lat) text(g, k.lat, x + pad * 0.9, fy + fh / 2 + 2, h * (k.lat.length > 4 ? 0.26 : 0.3), col, { align: 'left', weight: 700 });
  }
  A.keyRect = function (code, x, y, u) {
    const k = A.KEYS[code], gap = u * 0.1;
    return k ? { x: x + k.x * u + gap / 2, y: y + k.row * u + gap / 2, w: k.w * u - gap, h: u - gap } : null;
  };
  // o: { glow: [codes], down: code -> bool, pulse: 0..1 }
  A.keyboard = function (ctx, x, y, u, o) {
    const bw = A.KB_UNITS * u, bh = 4 * u;
    const base = cached('kb' + u, bw + 24, bh + 24, g => {
      g.translate(12, 12);
      rr(g, -10, -10, bw + 20, bh + 20, u * 0.35); fill(g, '#3b4166'); ink(g, 4);
      rr(g, -4, -4, bw + 8, bh + 8, u * 0.28); fill(g, '#11142a');
      for (const code in A.KEYS) { const r = A.keyRect(code, 0, 0, u); keyCap(g, A.KEYS[code], r.x, r.y, r.w, r.h, 'idle'); }
    });
    ctx.drawImage(base, x - 12, y - 12, bw + 24, bh + 24);
    const glow = o.glow || [], downs = o.down || (() => false);
    for (const code in A.KEYS) {
      const g = glow.indexOf(code) >= 0, d = downs(code);
      if (!g && !d) continue;
      const r = A.keyRect(code, x, y, u);
      if (g) { rr(ctx, r.x - 6, r.y - 6, r.w + 12, r.h + 12, u * 0.3); fill(ctx, alpha('#ffe14d', 0.35 + 0.35 * (o.pulse || 0))); }
      keyCap(ctx, A.KEYS[code], r.x, r.y, r.w, r.h, g ? (d ? 'ok' : 'glow') : 'down');
    }
  };
  // A light keycap for cards and the HUD: label as printed on the key.
  A.cap = function (ctx, x, y, label, h, st) {
    h = h || 34;
    ctx.font = '700 ' + Math.round(h * 0.5) + 'px Fredoka';
    const w = Math.max(h, ctx.measureText(label).width + h * 0.6), dip = st === 'down' ? h * 0.1 : 0;
    rr(ctx, x - w / 2, y - h / 2 + h * 0.12, w, h, h * 0.24); fill(ctx, st === 'glow' ? '#d99a00' : '#9aa3c7');
    rr(ctx, x - w / 2, y - h / 2 + dip, w, h - h * 0.08, h * 0.24); fill(ctx, st === 'glow' ? '#ffe14d' : st === 'down' ? '#ffe14d' : '#ffffff'); ink(ctx, Math.max(2.5, h * 0.08));
    text(ctx, label, x, y - h * 0.02 + dip, Math.round(h * 0.5), INK);
    return w;
  };
  function capW(ctx, k, h) { return k === 'انقر' ? h : Math.max(h, ctx.measureText(k).width + h * 0.6); }
  A.capsW = function (ctx, keys, h) {
    ctx.font = '700 ' + Math.round(h * 0.5) + 'px Fredoka';
    return keys.reduce((a, k) => a + capW(ctx, k, h), 0) + h * 0.55 * (keys.length - 1);
  };
  // A row of keycaps joined with «+», centred on x; returns its width.
  A.caps = function (ctx, x, y, keys, h, st) {
    ctx.font = '700 ' + Math.round(h * 0.5) + 'px Fredoka';
    const ws = keys.map(k => capW(ctx, k, h)), plus = h * 0.55;
    const total = ws.reduce((a, b) => a + b, 0) + plus * (keys.length - 1);
    let cx = x - total / 2;
    // Keys read left to right as on the keyboard: Ctrl first.
    keys.forEach((k, i) => {
      if (k === 'انقر') A.mouse(ctx, cx + ws[i] / 2, y, h / 40, st === 'down');
      else A.cap(ctx, cx + ws[i] / 2, y, k, h, st);
      cx += ws[i];
      if (i < keys.length - 1) { text(ctx, '+', cx + plus / 2, y, h * 0.6, INK); cx += plus; }
    });
    return total;
  };
  A.mouse = function (ctx, x, y, k, click) {
    ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
    rr(ctx, -15, -22, 30, 44, 15); fill(ctx, '#ffffff'); ink(ctx, 3.5);
    ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(0, -4); ink(ctx, 3);
    ctx.save(); rr(ctx, -15, -22, 30, 44, 15); ctx.clip(); rr(ctx, -15, -22, 15, 18, 0); fill(ctx, click ? '#ffd23f' : '#cfe0ff'); ctx.restore();
    rr(ctx, -15, -22, 30, 44, 15); ink(ctx, 3.5);
    ctx.restore();
  };

  /* --------------------------------------------------------------- HUD */
  A.coin = function (ctx, x, y, r) {
    circle(ctx, x, y, r); fill(ctx, '#ffd23f'); ink(ctx, Math.max(2, r * 0.22));
    circle(ctx, x, y, r * 0.6); ink(ctx, Math.max(1.5, r * 0.14), '#e0a800');
  };
  A.pill = function (ctx, x, y, w, h, color, border) { rr(ctx, x, y, w, h, h / 2); fill(ctx, color); ink(ctx, 4, border || INK); };
  A.boxIcon = function (ctx, x, y, s, done) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    rr(ctx, -14, -10, 28, 22, 4); fill(ctx, done ? '#3ddc84' : '#eab06c'); ink(ctx, 3);
    poly(ctx, [-14, -10, -18, -16, 18, -16, 14, -10]); fill(ctx, done ? '#2fae62' : '#d48f48'); ink(ctx, 3);
    if (done) { ctx.beginPath(); ctx.moveTo(-6, 1); ctx.lineTo(-1, 6); ctx.lineTo(8, -4); ink(ctx, 3.5, '#ffffff'); }
    ctx.restore();
  };
  A.clock = function (ctx, x, y, r, k) {
    circle(ctx, x, y, r); fill(ctx, '#ffffff'); ink(ctx, 3);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - r * 0.65); ctx.moveTo(x, y); ctx.lineTo(x + Math.sin(k * TAU) * r * 0.55, y - Math.cos(k * TAU) * r * 0.55); ink(ctx, 2.5);
  };
  A.arrowUndo = function (ctx, x, y, r, redo, color) {
    ctx.save(); ctx.translate(x, y); if (redo) ctx.scale(-1, 1);
    ctx.beginPath(); ctx.arc(0, 4, r, Math.PI * 1.05, Math.PI * 2.1); ink(ctx, r * 0.36, INK); ink(ctx, r * 0.2, color || '#ffffff');
    poly(ctx, [-r * 1.45, 4, -r * 0.55, 4, -r, -r * 0.7]); fill(ctx, color || '#ffffff'); ink(ctx, 2.5);
    ctx.restore();
  };
})();
