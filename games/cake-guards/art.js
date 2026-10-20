/* Cake Guards drawing: everything is drawn in code at the 1280x720 logical size. */
(function (CG) {
  'use strict';
  const A = CG.art = {}, TAU = Math.PI * 2;
  function rng(seed) { let s = (seed >>> 0) || 1; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }
  function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); }
  function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
  A.circle = circle;

  /* --------------------------------------------------------- background */
  // Ground, decorations and roads: everything that never changes during a level.
  A.background = function (ctx, world) {
    const W = CG.WORLDS[world.def.w], rand = rng(7 + world.def.w * 101 + world.roads[0].len);
    ctx.fillStyle = W.ground; ctx.fillRect(0, 0, CG.W, CG.H);
    // Soft patches give the ground some texture.
    ctx.fillStyle = W.ground2;
    for (let i = 0; i < 70; i++) {
      ctx.globalAlpha = 0.35 + rand() * 0.4;
      ctx.beginPath(); ctx.ellipse(rand() * CG.W, rand() * CG.H, 20 + rand() * 50, 10 + rand() * 22, rand() * 3, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    const clear = (x, y, m) => CG.roadDist(world.roads, x, y) > CG.ROAD + m && world.pads.every(p => Math.hypot(p.x - x, p.y - y) > CG.PAD + m) &&
      Math.hypot(x - world.cake.x, y - world.cake.y) > 80;
    for (let i = 0, n = 0; i < 400 && n < 46; i++) {
      const x = 20 + rand() * (CG.W - 40), y = CG.TOP + 10 + rand() * (CG.BAR - CG.TOP - 20);
      if (!clear(x, y, 22)) continue;
      n++;
      decoration(ctx, world.def.w, x, y, rand, W.deco);
    }
    // The road: a soft shadow, a rim, the top and a line of sprinkles down the middle.
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const stroke = (color, width, dy) => {
      ctx.strokeStyle = color; ctx.lineWidth = width;
      for (const r of world.roads) { ctx.beginPath(); r.pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y + dy) : ctx.moveTo(p.x, p.y + dy)); ctx.stroke(); }
    };
    stroke('rgba(0,0,0,0.13)', CG.ROAD * 2 + 14, 5);
    stroke(W.edge, CG.ROAD * 2 + 8, 0);
    stroke(W.road, CG.ROAD * 2, 0);
    ctx.setLineDash([2, 20]);
    stroke('rgba(255,255,255,0.55)', 6, 0);
    ctx.setLineDash([]);
  };

  function decoration(ctx, w, x, y, rand, cols) {
    const c = cols[Math.floor(rand() * cols.length)];
    const kind = Math.floor(rand() * 3);
    ctx.save(); ctx.translate(x, y);
    if (w === 0 && kind === 0) {           // flower
      ctx.fillStyle = c;
      for (let i = 0; i < 5; i++) { circle(ctx, Math.cos(i * TAU / 5) * 6, Math.sin(i * TAU / 5) * 6, 5); ctx.fill(); }
      ctx.fillStyle = '#ffd23f'; circle(ctx, 0, 0, 4); ctx.fill();
    } else if (kind === 1) {               // lollipop or cone
      if (w === 2) {
        ctx.fillStyle = '#e8b06a'; ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(8, 0); ctx.lineTo(0, 20); ctx.fill();
        ctx.fillStyle = c; circle(ctx, 0, -3, 9); ctx.fill();
      } else {
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 18); ctx.stroke();
        ctx.fillStyle = c; circle(ctx, 0, -2, 9); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, -2, 5, 0, 4.5); ctx.stroke();
      }
    } else {                               // gumdrops, chocolate bits or snow mounds
      for (let i = 0; i < 3; i++) {
        const dx = (rand() - 0.5) * 22, dy = (rand() - 0.5) * 12;
        ctx.fillStyle = w === 1 ? (i % 2 ? '#6b4226' : '#8c5a36') : w === 2 ? '#ffffff' : cols[i % cols.length];
        ctx.beginPath(); ctx.ellipse(dx, dy, 7, 6, 0, Math.PI, 0); ctx.fill();
        ctx.fillRect(dx - 7, dy - 0.5, 14, 3);
      }
    }
    ctx.restore();
  }

  /* --------------------------------------------------------------- pads */
  // state: '' resting, 'hover', 'ok' (a tower is being placed and fits), 'no' (too expensive)
  A.pad = function (ctx, x, y, state, t) {
    ctx.fillStyle = 'rgba(0,0,0,0.14)'; ctx.beginPath(); ctx.ellipse(x, y + 5, CG.PAD, CG.PAD * 0.8, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = state === 'ok' ? '#fffbe0' : '#fff3df'; circle(ctx, x, y, CG.PAD); ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = state === 'ok' ? '#3ddc84' : state === 'no' ? '#ff6b6b' : state === 'hover' ? '#ffcc00' : '#e2c79f';
    if (state === 'ok') ctx.lineWidth = 4 + Math.sin(t * 6) * 1.5;
    circle(ctx, x, y, CG.PAD - 2); ctx.stroke();
    ctx.fillStyle = 'rgba(214,164,99,0.45)';
    for (let i = 0; i < 6; i++) { circle(ctx, x + Math.cos(i + 0.5) * 16, y + Math.sin(i + 0.5) * 16, 2.5); ctx.fill(); }
    if (state === 'hover' || state === 'ok') {
      ctx.strokeStyle = state === 'ok' ? '#3ddc84' : '#e0a800'; ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x - 9, y); ctx.lineTo(x + 9, y); ctx.moveTo(x, y - 9); ctx.lineTo(x, y + 9); ctx.stroke();
    }
  };
  A.range = function (ctx, x, y, r, ok) {
    ctx.fillStyle = ok ? 'rgba(255,255,255,0.18)' : 'rgba(255,90,90,0.16)';
    ctx.strokeStyle = ok ? 'rgba(255,255,255,0.75)' : 'rgba(255,90,90,0.7)';
    ctx.lineWidth = 3; ctx.setLineDash([10, 8]);
    circle(ctx, x, y, r); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
  };

  /* ------------------------------------------------------------- towers */
  function pips(ctx, lv, y) {
    ctx.fillStyle = '#ffcc00'; ctx.strokeStyle = '#7a4b00'; ctx.lineWidth = 1.5;
    for (let i = 0; i <= lv; i++) {
      const px = (i - lv / 2) * 11;
      ctx.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 2.4 : 5.4;
        ctx.lineTo(px + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  }
  A.tower = function (ctx, tw, x, y, t, scale) {
    const s = (scale || 1) * (1 + tw.lv * 0.08), kick = tw.kick || 0, a = tw.angle;
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(0, 10, 24, 10, 0, 0, TAU); ctx.fill();
    if (tw.lv === 2) { ctx.fillStyle = '#ffcc00'; circle(ctx, 0, 4, 25); ctx.fill(); }
    ctx.fillStyle = CG.TOWERS[tw.type].color; circle(ctx, 0, 4, 22); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.12)'; circle(ctx, 0, 8, 18); ctx.fill();
    DRAW[tw.type](ctx, a, kick, t, tw.lv);
    pips(ctx, tw.lv, 24);
    ctx.restore();
  };
  const DRAW = {
    pop: function (ctx, a, kick) {
      ctx.save(); ctx.rotate(a); ctx.fillStyle = '#d33d4f'; rrect(ctx, 4 - kick * 6, -6, 24, 12, 4); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(10 - kick * 6, -6, 4, 12); ctx.restore();
      // The striped popcorn box with its heap on top.
      ctx.fillStyle = '#fff'; rrect(ctx, -13, -10, 26, 22, 4); ctx.fill();
      ctx.fillStyle = '#e8354b'; for (let i = 0; i < 3; i++) ctx.fillRect(-11 + i * 9, -10, 4, 22);
      ctx.fillStyle = '#fffbe8';
      [[-8, -12], [0, -16], [8, -12], [-3, -9], [5, -9]].forEach(p => { circle(ctx, p[0], p[1], 6); ctx.fill(); });
      ctx.fillStyle = '#ffd23f'; circle(ctx, 2, -14, 2.5); ctx.fill(); circle(ctx, -7, -10, 2); ctx.fill();
    },
    bubble: function (ctx, a, kick, t) {
      ctx.save(); ctx.rotate(a);
      ctx.strokeStyle = '#2a8fd6'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(20 - kick * 4, 0); ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; circle(ctx, 26 - kick * 4, 0, 7); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = '#bde9ff'; rrect(ctx, -11, -14, 22, 26, 9); ctx.fill();
      ctx.fillStyle = '#6fd3ff'; rrect(ctx, -11, -2, 22, 14, 7); ctx.fill();
      ctx.fillStyle = '#2a8fd6'; ctx.fillRect(-6, -19, 12, 6);
      ctx.fillStyle = 'rgba(255,255,255,0.8)'; circle(ctx, -4, -6, 3); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.5;
      circle(ctx, 8 + Math.sin(t * 2) * 3, -24 - (t * 14 % 16), 3); ctx.stroke();
    },
    cake: function (ctx, a, kick) {
      ctx.save(); ctx.rotate(a);
      ctx.fillStyle = '#8c5a36'; rrect(ctx, 0, -4, 26 - kick * 8, 8, 4); ctx.fill();
      ctx.fillStyle = '#ff9ec8'; circle(ctx, 26 - kick * 8, 0, 7); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#b77745'; ctx.beginPath(); ctx.moveTo(-12, -2); ctx.lineTo(12, -2); ctx.lineTo(9, 13); ctx.lineTo(-9, 13); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1.5;
      for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * 6, -1); ctx.lineTo(i * 4.5, 12); ctx.stroke(); }
      ctx.fillStyle = '#ff7eb6';
      circle(ctx, -7, -5, 7); ctx.fill(); circle(ctx, 7, -5, 7); ctx.fill(); circle(ctx, 0, -10, 8); ctx.fill();
      ctx.fillStyle = '#e8354b'; circle(ctx, 0, -18, 4); ctx.fill();
    },
    cane: function (ctx, a, kick, t, lv) {
      ctx.fillStyle = '#a77bff';
      ctx.beginPath(); for (let i = 0; i < 6; i++) ctx.lineTo(Math.cos(i * TAU / 6) * 13, 4 + Math.sin(i * TAU / 6) * 9); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(0, -3); ctx.lineTo(4, 2); ctx.fill();
      // The cane leans towards its target.
      ctx.save(); ctx.rotate(Math.max(-0.5, Math.min(0.5, Math.cos(a) * 0.4)));
      ctx.lineCap = 'round'; ctx.lineWidth = 7; ctx.strokeStyle = '#fff';
      ctx.beginPath(); ctx.moveTo(0, 2); ctx.lineTo(0, -16); ctx.arc(-6, -16, 6, 0, Math.PI, true); ctx.stroke();
      ctx.strokeStyle = '#e8354b'; ctx.lineWidth = 7; ctx.setLineDash([4, 5]);
      ctx.beginPath(); ctx.moveTo(0, 2); ctx.lineTo(0, -16); ctx.arc(-6, -16, 6, 0, Math.PI, true); ctx.stroke();
      ctx.setLineDash([]);
      if (kick > 0) { ctx.fillStyle = 'rgba(255,240,150,' + kick + ')'; circle(ctx, -12, -16, 6 + kick * 6); ctx.fill(); }
      ctx.restore();
      if (lv) { ctx.fillStyle = 'rgba(255,255,255,0.7)'; circle(ctx, 9, -6 - Math.sin(t * 4) * 2, 2); ctx.fill(); }
    }
  };
  // A tower picture for the buttons of the tower bar.
  A.towerIcon = function (canvas, type) {
    const ctx = canvas.getContext('2d'), s = canvas.width / 64;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.clearRect(0, 0, 64, 64);
    A.tower(ctx, { type: type, lv: 0, angle: -0.4, kick: 0 }, 32, 34, 0.5, 0.95);
  };

  /* -------------------------------------------------------------- blobs */
  A.blob = function (ctx, b, t, calm) {
    const e = CG.ENEMIES[b.type], r = e.r, wob = calm ? 0 : Math.sin(t * 9 + b.id * 1.7) * 0.08;
    ctx.save(); ctx.translate(b.x, b.y);
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(0, r * 0.75, r * 0.95, r * 0.35, 0, 0, TAU); ctx.fill();
    ctx.save(); ctx.scale(1 + wob, 1 - wob);
    ctx.fillStyle = e.color; ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.88, 0, 0, TAU); ctx.fill();
    if (b.type === 's') { ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -r * 0.85); ctx.lineTo(0, r * 0.85); ctx.stroke(); }
    ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.ellipse(-r * 0.35, -r * 0.4, r * 0.32, r * 0.2, -0.5, 0, TAU); ctx.fill();
    if (e.armor && !e.boss) {
      // A hard candy shell over the top half.
      ctx.strokeStyle = '#e8f1ff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, r - 1, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
      ctx.fillStyle = '#e8f1ff'; [-0.6, 0, 0.6].forEach(k => { circle(ctx, Math.sin(k) * (r - 1), -Math.cos(k) * (r - 1), 2.5); ctx.fill(); });
    }
    // Eyes look the way the blob is going.
    const ex = b.dx * r * 0.18, ey = b.dy * r * 0.18, er = Math.max(3, r * 0.26);
    ctx.fillStyle = '#fff'; circle(ctx, -r * 0.33 + ex, -r * 0.12 + ey, er); ctx.fill(); circle(ctx, r * 0.33 + ex, -r * 0.12 + ey, er); ctx.fill();
    ctx.fillStyle = '#2b1d3a';
    circle(ctx, -r * 0.33 + ex * 1.6, -r * 0.1 + ey * 1.6, er * 0.55); ctx.fill(); circle(ctx, r * 0.33 + ex * 1.6, -r * 0.1 + ey * 1.6, er * 0.55); ctx.fill();
    ctx.strokeStyle = '#2b1d3a'; ctx.lineWidth = Math.max(1.5, r * 0.1); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(0, r * 0.25, r * 0.22, 0.2, Math.PI - 0.2); ctx.stroke();
    if (e.boss) {
      ctx.fillStyle = '#ffcc00'; ctx.strokeStyle = '#a06a00'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-r * 0.55, -r * 0.7);
      [[-r * 0.55, -r * 1.25], [-r * 0.27, -r * 0.95], [0, -r * 1.35], [r * 0.27, -r * 0.95], [r * 0.55, -r * 1.25], [r * 0.55, -r * 0.7]].forEach(p => ctx.lineTo(p[0], p[1]));
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    if (b.hitT > 0) { ctx.globalAlpha = Math.min(1, b.hitT * 6); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.88, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
    ctx.restore();
    if (b.slowT > 0) {
      ctx.strokeStyle = 'rgba(150,225,255,0.85)'; ctx.fillStyle = 'rgba(150,225,255,0.18)'; ctx.lineWidth = 2;
      circle(ctx, 0, 0, r + 6); ctx.fill(); ctx.stroke();
    }
    if (b.hp < b.max) {
      const w = Math.max(24, r * 1.6), k = Math.max(0, b.hp / b.max);
      ctx.fillStyle = 'rgba(40,20,50,0.75)'; rrect(ctx, -w / 2, -r - 14, w, 6, 3); ctx.fill();
      ctx.fillStyle = k > 0.5 ? '#3ddc84' : k > 0.25 ? '#ffcc00' : '#ff5d5d'; rrect(ctx, -w / 2 + 1, -r - 13, (w - 2) * k, 4, 2); ctx.fill();
    }
    ctx.restore();
  };

  /* -------------------------------------------------------------- shots */
  A.shot = function (ctx, s) {
    if (s.kind === 'pop') {
      ctx.fillStyle = '#fffbe8'; circle(ctx, s.x, s.y, 5); ctx.fill();
      ctx.fillStyle = '#ffd23f'; circle(ctx, s.x + 1.5, s.y - 1, 2); ctx.fill();
    } else if (s.kind === 'bubble') {
      ctx.fillStyle = 'rgba(160,225,255,0.35)'; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2;
      circle(ctx, s.x, s.y, 8); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; circle(ctx, s.x - 3, s.y - 3, 2); ctx.fill();
    } else if (s.kind === 'cake') {
      const k = Math.min(1, s.t / s.T), h = Math.sin(k * Math.PI) * 70;
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(s.x, s.y + 4, 8, 4, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#b77745'; ctx.fillRect(s.x - 6, s.y - h - 2, 12, 8);
      ctx.fillStyle = '#ff7eb6'; circle(ctx, s.x, s.y - h - 4, 7); ctx.fill();
    }
  };

  /* --------------------------------------------------------------- cake */
  // The cake the blobs want. Missing slices show as bites out of its side, cut into
  // a cached picture of the cake (cutting them on the game canvas would cut the ground too).
  function cakeBody(ctx, style, bites) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(0, 30, 58, 16, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(0, 26, 54, 13, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#d9e4f2'; ctx.beginPath(); ctx.ellipse(0, 28, 54, 11, 0, 0, Math.PI); ctx.fill();
    const tier = (w, h, top) => {
      ctx.fillStyle = style.sponge; rrect(ctx, -w / 2, top, w, h, 8); ctx.fill();
      if (style.rainbow) ['#ff7eb6', '#ffd23f', '#62d26f', '#6fd3ff'].forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(-w / 2 + 2, top + 6 + i * (h - 10) / 4, w - 4, (h - 10) / 4 - 1); });
      ctx.fillStyle = style.cream; rrect(ctx, -w / 2 - 2, top - 3, w + 4, 10, 5); ctx.fill();
      for (let i = 0; i < 5; i++) { circle(ctx, -w / 2 + 6 + i * (w - 12) / 4, top + 7, 4); ctx.fill(); }
    };
    tier(88, 34, -10);
    tier(58, 26, -36);
    ctx.fillStyle = style.top; circle(ctx, 0, -40, 6); ctx.fill();
    for (let i = -1; i <= 1; i++) { ctx.fillStyle = ['#6fd3ff', '#ffd23f', '#62d26f'][i + 1]; ctx.fillRect(i * 16 - 2.5, -56, 5, 16); }
    if (!bites) return;
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < bites; i++) { circle(ctx, BITES[i][0], BITES[i][1], 12); ctx.fill(); }
    ctx.globalCompositeOperation = 'source-over';
  }
  // Where each bite is taken, in order: both tiers, from both sides.
  const BITES = [[46, 6], [31, -26], [-46, 14], [-31, -22], [44, 24], [8, 28]];
  function flames(ctx, t, calm) {
    for (let i = -1; i <= 1; i++) {
      const f = calm ? 0 : Math.sin(t * 12 + i * 2) * 1.2;
      ctx.fillStyle = '#ff9f43'; ctx.beginPath(); ctx.ellipse(i * 16, -61, 3.5 + f * 0.3, 6 + f, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff3b0'; ctx.beginPath(); ctx.ellipse(i * 16, -60, 1.6, 3, 0, 0, TAU); ctx.fill();
    }
  }
  const cache = { key: '', canvas: null };
  A.resetCaches = function () { cache.key = ''; };
  // k: pixels per logical pixel of the game canvas, so the cached cake stays sharp.
  A.cake = function (ctx, x, y, style, hearts, t, calm, k) {
    const bites = Math.min(6, Math.ceil((CG.HEARTS - hearts) / 3.4)), key = style.name + bites + '@' + k;
    if (cache.key !== key) {
      const c = cache.canvas || (cache.canvas = document.createElement('canvas')), g = c.getContext('2d');
      c.width = c.height = Math.ceil(140 * k);
      g.setTransform(k, 0, 0, k, 70 * k, 76 * k);
      cakeBody(g, style, bites);
      cache.key = key;
    }
    ctx.drawImage(cache.canvas, x - 70, y + 6 - 76, 140, 140);
    ctx.save(); ctx.translate(x, y + 6); flames(ctx, t, calm); ctx.restore();
  };
  // A cake picture for the cake choice on the title screen.
  A.cakeIcon = function (canvas, style) {
    const ctx = canvas.getContext('2d'), s = canvas.width / 140;
    ctx.setTransform(s, 0, 0, s, 70 * s, 82 * s);
    ctx.clearRect(-70, -82, 140, 140);
    cakeBody(ctx, style, 0);
    flames(ctx, 0, true);
  };
})(globalThis.CG = globalThis.CG || {});
