/* Cake Guards art: baked candy worlds, cute bouncing jelly blobs, 3 chunky turrets, frosting cannon globs & reticle. */
(function (CG) {
  'use strict';
  const A = CG.art = {}, TAU = Math.PI * 2, INK = '#1b1640';
  function rng(seed) { let s = (seed >>> 0) || 1; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }
  function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); }
  function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
  A.circle = circle;
  const ink = (ctx, fill, lw) => Kit.art.outlined(ctx, fill, lw || 3);
  function star(ctx, x, y, r) {
    ctx.beginPath();
    for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rad = k % 2 ? r * 0.42 : r; ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad); }
    ctx.closePath();
  }

  const kept = Object.create(null), glows = Object.create(null);
  function keep(key, w, h, draw) {
    const hit = kept[key]; if (hit && hit.canvas) return hit;
    const s = Kit.art.sprite(key, w, h, draw); if (s && s.canvas) kept[key] = s; return s;
  }
  function glowOf(col, rad) {
    if (Kit.art.quality.tier === 0) return null;
    const k = col + ':' + rad, hit = glows[k]; if (hit && hit.canvas) return hit;
    const s = Kit.art.glow(col, rad); if (s && s.canvas) glows[k] = s; return s;
  }

  /* --------------------------------------------------------- background */
  function grassTile(W) {
    return keep('grass:' + W.ground, 128, 128, (c, w, h) => {
      c.fillStyle = W.ground; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 24; i++) {
        c.fillStyle = i % 3 === 0 ? '#fff' : i % 3 === 1 ? Kit.art.shade(W.ground, -0.22) : W.ground2;
        c.globalAlpha = i % 3 === 0 ? 0.25 : 0.65;
        c.beginPath(); c.ellipse((i * 47 + 11) % w, (i * 29 + (i % 4) * 13) % h, 7 + (i % 5) * 4, 3.5 + (i % 3) * 2.4, i * 0.7, 0, TAU); c.fill();
      }
      c.globalAlpha = 1;
    });
  }
  A.background = function (ctx, world) {
    const W = CG.WORLDS[world.def.w], rand = rng(7 + world.def.w * 101 + world.roads[0].len);
    const tile = grassTile(W);
    if (tile && tile.canvas) for (let y = 0; y < CG.H; y += 128) for (let x = 0; x < CG.W; x += 128) ctx.drawImage(tile.canvas, x, y, 128, 128);
    else { ctx.fillStyle = W.ground; ctx.fillRect(0, 0, CG.W, CG.H); }
    for (let i = 0; i < 54; i++) {
      const a = 0.35 + rand() * 0.35, x = rand() * CG.W, y = rand() * CG.H, rx = 20 + rand() * 48, ry = 10 + rand() * 20, rot = rand() * 3;
      ctx.fillStyle = W.ground2; ctx.globalAlpha = a; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    const clear = (x, y, m) => CG.roadDist(world.roads, x, y) > CG.ROAD + m && world.pads.every(p => Math.hypot(p.x - x, p.y - y) > CG.PAD + m) && Math.hypot(x - world.cake.x, y - world.cake.y) > 80;
    for (let i = 0, n = 0; i < 320 && n < 40; i++) {
      const x = 20 + rand() * (CG.W - 40), y = CG.TOP + 10 + rand() * (CG.BAR - CG.TOP - 20);
      if (!clear(x, y, 22)) continue;
      n++; deco(ctx, world.def.w, x, y, rand, W.deco);
    }
    ctx.lineJoin = ctx.lineCap = 'round';
    const stroke = (col, w, dy) => {
      ctx.strokeStyle = col; ctx.lineWidth = w;
      for (const r of world.roads) { ctx.beginPath(); r.pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y + dy) : ctx.moveTo(p.x, p.y + dy)); ctx.stroke(); }
    };
    stroke('rgba(27,22,64,.22)', CG.ROAD * 2 + 26, 8);
    stroke(Kit.art.shade(W.edge, -0.4), CG.ROAD * 2 + 16, 4);
    stroke(W.edge, CG.ROAD * 2 + 9, 0);
    stroke(W.road, CG.ROAD * 2 - 1, 0);
    stroke(Kit.art.shade(W.road, 0.22), CG.ROAD * 2 - 16, -2);
    const bits = ['#ff7eb6', '#fff', '#6fd3ff', '#ffd23f', '#ff9f43'];
    for (const r of world.roads) for (const s of r.segs) {
      const n = Math.floor(s.len / 38);
      for (let i = 0; i < n; i++) {
        const t = (i + 0.35) / Math.max(1, n), x = s.x + s.dx * s.len * t, y = s.y + s.dy * s.len * t, side = ((i * 3) % 5) - 2;
        circle(ctx, x - s.dy * side * 5, y + s.dx * side * 5, 3.2); ink(ctx, bits[i % bits.length], 1.4);
      }
    }
  };
  function deco(ctx, w, x, y, rand, cols) {
    const c = cols[Math.floor(rand() * cols.length)], kind = Math.floor(rand() * 2);
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = 'rgba(27,22,64,.2)'; ctx.beginPath(); ctx.ellipse(0, 12, 12, 4, 0, 0, TAU); ctx.fill();
    if (kind === 0 && w === 0) {
      for (let i = 0; i < 5; i++) { circle(ctx, Math.cos(i * TAU / 5) * 6.5, Math.sin(i * TAU / 5) * 6.5 - 2, 5); ink(ctx, c, 2); }
      circle(ctx, 0, -2, 4); ink(ctx, '#ffd23f', 1.8);
    } else if (w === 1) {
      rrect(ctx, -8, -5, 16, 17, 4); ink(ctx, '#6b4226', 2.2); circle(ctx, 0, -11, 5); ink(ctx, c, 2);
    } else {
      rrect(ctx, -3, 2, 6, 15, 2); ink(ctx, w === 2 ? '#e8b06a' : '#fff', 1.8); circle(ctx, 0, -4, 9.5); ink(ctx, c, 2.2);
      ctx.fillStyle = 'rgba(255,255,255,.65)'; circle(ctx, -3, -7, 2.8); ctx.fill();
    }
    ctx.restore();
  }

  /* --------------------------------------------------------------- pads */
  function padSp(st) {
    return keep('pad:' + (st || 'rest'), 84, 84, (c, w, h) => {
      c.translate(w / 2, h / 2);
      circle(c, 0, 2, CG.PAD - 1); ink(c, st === 'ok' ? '#fff6c8' : '#fff7ea', 3);
      c.strokeStyle = st === 'ok' ? '#3ddc84' : st === 'hover' ? '#ffcc00' : '#e2c79f'; c.lineWidth = 3.5; circle(c, 0, 2, CG.PAD - 8); c.stroke();
      if (st === 'hover' || st === 'ok') {
        c.strokeStyle = st === 'ok' ? '#1f9a4a' : '#a06a00'; c.lineWidth = 5; c.lineCap = 'round';
        c.beginPath(); c.moveTo(-9, 2); c.lineTo(9, 2); c.moveTo(0, -7); c.lineTo(0, 11); c.stroke();
      }
    });
  }
  A.pad = function (ctx, x, y, st, t) {
    Kit.art.shadow(ctx, x - 34, y - 28, 68, 56, 0.4);
    Kit.art.blit(ctx, padSp(st), x, y - 2);
    if (st === 'ok' || st === 'hover') {
      const p = t ? 0.4 + (Math.sin(t * 5) + 1) * 0.28 : 0.6;
      ctx.strokeStyle = st === 'ok' ? 'rgba(61,220,132,' + p + ')' : 'rgba(255,204,0,' + p + ')';
      ctx.lineWidth = 4; circle(ctx, x, y, CG.PAD + 7); ctx.stroke();
    }
  };
  A.range = function (ctx, x, y, r, ok, t) {
    const p = t ? 0.55 + (Math.sin(t * 4) + 1) * 0.22 : 0.85;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = ok ? 'rgba(255,255,255,.15)' : 'rgba(255,84,112,.14)'; ctx.fill();
    ctx.lineWidth = 3; ctx.setLineDash([10, 8]); ctx.strokeStyle = ok ? 'rgba(255,255,255,' + p + ')' : 'rgba(255,84,112,' + p + ')'; ctx.stroke(); ctx.setLineDash([]);
  };

  /* ------------------------------------------------------------- towers */
  function twBody(type, lv) {
    return keep('twb:' + type + lv, 112, 128, (c, w, h) => {
      const grow = 1 + lv * 0.11;
      c.save(); c.translate(w / 2, h / 2); c.scale(grow, grow);
      if (lv >= 2) { circle(c, 0, 4, 29); ink(c, '#ffcc00', 3); }
      else if (lv === 1) { circle(c, 0, 5, 26); ink(c, '#ffe38a', 2.6); }
      circle(c, 0, 6, 22); ink(c, Kit.art.shade(CG.TOWERS[type].color, -0.12), 3);
      if (type === 'pop') {
        rrect(c, -14, -8, 28, 22, 5); ink(c, '#fffaf0', 2.4);
        c.fillStyle = '#e8354b'; for (let i = 0; i < 3; i++) c.fillRect(-12 + i * 9, -8, 4.5, 22);
        [[-8, -12], [1, -16], [9, -11], [-2, -8], [6, -7]].forEach(p => { circle(c, p[0], p[1], 6.2); ink(c, '#fffbe8', 2); });
      } else if (type === 'bubble') {
        rrect(c, -12, -16, 24, 30, 10); ink(c, '#bde9ff', 2.6);
        c.fillStyle = '#6fd3ff'; rrect(c, -12, -2, 24, 16, 8); c.fill();
        rrect(c, -7, -22, 14, 8, 3); ink(c, '#2a8fd6', 2);
      } else {
        c.beginPath(); c.moveTo(-14, -2); c.lineTo(14, -2); c.lineTo(10, 16); c.lineTo(-10, 16); c.closePath(); ink(c, '#c4844e', 2.4);
        circle(c, -7, -6, 7.5); ink(c, '#ff8ec4', 2); circle(c, 7, -6, 7.5); ink(c, '#ff8ec4', 2);
        circle(c, 0, -12, 8.5); ink(c, '#ffb3d6', 2); circle(c, 0, -20, 4.5); ink(c, '#e8354b', 1.8);
      }
      for (let i = 0; i <= lv; i++) { star(c, (i - lv / 2) * 13, 30, 6.2); ink(c, '#ffcc00', 1.6); }
      c.restore();
    });
  }
  function twGun(type, lv) {
    return keep('twg:' + type + lv, 78, 40, (c, w, h) => {
      c.translate(w / 2, h / 2);
      const trim = lv >= 2 ? '#ffcc00' : null;
      if (type === 'pop') { rrect(c, -2, -7, 32, 14, 5); ink(c, trim || '#d33d4f', 2.4); circle(c, 28, 0, 5); ink(c, '#2b1d3a', 2); }
      else if (type === 'bubble') { c.strokeStyle = INK; c.lineWidth = 5; c.lineCap = 'round'; c.beginPath(); c.moveTo(0, 0); c.lineTo(22, 0); c.stroke(); circle(c, 28, 0, 8); c.strokeStyle = '#fff'; c.lineWidth = 3; c.stroke(); }
      else { rrect(c, -2, -6, 28, 12, 5); ink(c, trim || '#8c5a36', 2.4); circle(c, 28, 0, 8); ink(c, '#ff7eb6', 2.2); }
    });
  }
  function puffSp() {
    return keep('puff', 40, 40, (c, w, h) => {
      c.translate(w / 2, h / 2); circle(c, 0, 0, 8); ink(c, '#fff6c2', 2);
      c.fillStyle = '#ffd23f'; for (let i = 0; i < 6; i++) { circle(c, Math.cos(i) * 12, Math.sin(i) * 12, 3.2); c.fill(); }
    });
  }
  A.tower = function (ctx, tw, x, y, t, scale) {
    const lv = tw.lv | 0, sc = scale || 1.36, kick = tw.kick || 0, a = tw.angle || 0;
    const bob = !t || Kit.motion.reduced() ? 0 : Math.sin(t * 2.5 + x * 0.013) * 2.2;
    Kit.art.shadow(ctx, x - 34 * sc, y + bob - 22 * sc, 68 * sc, 56 * sc, 0.45);
    Kit.art.blit(ctx, twBody(tw.type, lv), x, y + bob, { sx: sc * (1 + kick * 0.06), sy: sc * (1 - kick * 0.08) });
    Kit.art.blit(ctx, twGun(tw.type, lv), x + Math.cos(a) * (4 - kick * 6) * sc, y + bob + Math.sin(a) * (4 - kick * 6) * sc, { rot: a, sx: sc, sy: sc });
    if (kick > 0.08) Kit.art.blit(ctx, puffSp(), x + Math.cos(a) * 34 * sc, y + bob + Math.sin(a) * 34 * sc, { alpha: Math.min(1, kick), sx: 0.55 + kick * 0.7, sy: 0.55 + kick * 0.7 });
  };
  A.towerIcon = function (canvas, type) {
    const ctx = canvas.getContext('2d'), s = canvas.width / 64;
    ctx.setTransform(s, 0, 0, s, 0, 0); ctx.clearRect(0, 0, 64, 64);
    A.tower(ctx, { type, lv: 0, angle: -0.5, kick: 0 }, 32, 38, 0, 0.46);
  };

  /* -------------------------------------------------------------- blobs */
  const lids = new WeakMap();
  function blobSp(type, shut) {
    const e = CG.ENEMIES[type], r = e.r;
    return keep('blob:' + type + (shut ? ':z' : ''), Math.ceil(r * 3.4), Math.ceil(r * 3.8), (c, w, h) => {
      c.translate(w / 2, h * 0.56);
      c.beginPath(); c.ellipse(0, 0, r, r * 0.9, 0, 0, TAU); ink(c, e.color, Math.max(2.5, r * 0.15));
      c.beginPath(); c.ellipse(-r * 0.3, -r * 0.38, r * 0.28, r * 0.15, -0.55, 0, TAU); c.fillStyle = 'rgba(255,255,255,.7)'; c.fill();
      if (type === 's') { c.strokeStyle = 'rgba(255,255,255,.8)'; c.lineWidth = Math.max(2, r * 0.12); c.beginPath(); c.moveTo(0, -r * 0.8); c.lineTo(0, r * 0.8); c.stroke(); }
      if (e.armor && !e.boss) { c.strokeStyle = '#f4f8ff'; c.lineWidth = Math.max(3, r * 0.16); c.beginPath(); c.arc(0, 0, r - 1.5, Math.PI * 1.08, Math.PI * 1.92); c.stroke(); }
      const er = Math.max(3.4, r * 0.28);
      if (shut) {
        c.strokeStyle = INK; c.lineWidth = Math.max(1.7, r * 0.1); c.lineCap = 'round';
        c.beginPath(); c.arc(-r * 0.32, 0, er * 0.85, 0.4, 2.7); c.stroke();
        c.beginPath(); c.arc(r * 0.32, 0, er * 0.85, 0.4, 2.7); c.stroke();
      } else { circle(c, -r * 0.32, -r * 0.08, er); ink(c, '#fff', 1.7); circle(c, r * 0.32, -r * 0.08, er); ink(c, '#fff', 1.7); }
      c.fillStyle = 'rgba(255,110,150,.45)'; circle(c, -r * 0.55, r * 0.16, r * 0.14); c.fill(); circle(c, r * 0.55, r * 0.16, r * 0.14); c.fill();
      c.strokeStyle = INK; c.lineWidth = Math.max(1.6, r * 0.09); c.beginPath(); c.arc(0, r * 0.16, r * 0.24, 0.25, Math.PI - 0.25); c.stroke();
      if (e.boss) {
        c.beginPath(); c.moveTo(-r * 0.62, -r * 0.62);
        [[-r * 0.62, -r * 1.2], [-r * 0.3, -r * 0.82], [0, -r * 1.32], [r * 0.3, -r * 0.82], [r * 0.62, -r * 1.2], [r * 0.62, -r * 0.62]].forEach(p => c.lineTo(p[0], p[1]));
        c.closePath(); ink(c, '#ffcc00', 2);
      }
    });
  }
  A.blob = function (ctx, b, t, calm) {
    const e = CG.ENEMIES[b.type], r = e.r;
    let slot = lids.get(b); if (!slot) { slot = {}; lids.set(b, slot); }
    const shut = Kit.art.blink(slot) > 0.55;
    const hop = calm ? 0 : Math.abs(Math.sin(t * 8.2 + b.id * 1.3));
    const y = b.y - hop * Math.min(8, r * 0.42), kn = b.knockT > 0 ? 0.22 : 0;
    const bob = 1 + (hop - 0.4) * 0.12 - kn, sx = (1 / Math.sqrt(Math.max(0.5, bob))) * 1.15, sy = bob * 1.15;
    Kit.art.shadow(ctx, b.x - r * 1.1, b.y - r * 0.15, r * 2.3, r * 1.6, 0.38 + hop * 0.12);
    Kit.art.blit(ctx, blobSp(b.type, shut), b.x, y, { sx, sy });
    if (!shut) {
      const er = Math.max(3.2, r * 0.26) * 0.5, ox = b.dx * r * 0.14, oy = b.dy * r * 0.1;
      ctx.fillStyle = INK;
      circle(ctx, b.x - r * 0.32 * sx + ox, y - r * 0.08 * sy + oy, er); ctx.fill();
      circle(ctx, b.x + r * 0.32 * sx + ox, y - r * 0.08 * sy + oy, er); ctx.fill();
      ctx.fillStyle = '#fff';
      circle(ctx, b.x - r * 0.32 * sx + ox - er * 0.35, y - r * 0.08 * sy + oy - er * 0.35, er * 0.38); ctx.fill();
      circle(ctx, b.x + r * 0.32 * sx + ox - er * 0.35, y - r * 0.08 * sy + oy - er * 0.35, er * 0.38); ctx.fill();
    }
    if (b.hitT > 0) { ctx.globalAlpha = Math.min(0.75, b.hitT * 5); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(b.x, y, r * sx, r * 0.9 * sy, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
    if (b.slowT > 0) { ctx.strokeStyle = 'rgba(120,210,255,.9)'; ctx.fillStyle = 'rgba(160,230,255,.16)'; ctx.lineWidth = 3; circle(ctx, b.x, b.y, r + 6); ctx.fill(); ctx.stroke(); }
    if (b.hp < b.max) {
      const bw = Math.max(26, r * 1.7), k = Math.max(0, b.hp / b.max);
      ctx.fillStyle = 'rgba(27,22,64,.8)'; rrect(ctx, b.x - bw / 2, y - r - 16, bw, 7, 3); ctx.fill();
      ctx.fillStyle = k > 0.5 ? '#3ddc84' : k > 0.25 ? '#ffcc00' : '#ff5470';
      rrect(ctx, b.x - bw / 2 + 1.5, y - r - 14.5, (bw - 3) * k, 4, 2); ctx.fill();
    }
  };

  /* --------------------------------------------------- shots & reticle */
  function shotSp(kind) {
    return keep('shot:' + kind, 36, 36, (c, w, h) => {
      c.translate(w / 2, h / 2);
      if (kind === 'pop') { circle(c, 0, 0, 8); ink(c, '#fffbe8', 2); c.fillStyle = '#ffd23f'; circle(c, 2, -2, 2.4); c.fill(); }
      else if (kind === 'bubble') { circle(c, 0, 0, 10); c.fillStyle = 'rgba(160,225,255,.5)'; c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 2.5; c.stroke(); }
      else if (kind === 'frost') {
        circle(c, 0, 0, 11); ink(c, '#ff8ac8', 2.4);
        circle(c, -2, -2, 6); c.fillStyle = '#fff5fa'; c.fill();
        c.fillStyle = '#ffd23f'; circle(c, 4, 2, 2.2); c.fill();
        c.fillStyle = '#6fd3ff'; circle(c, -4, 4, 2); c.fill();
      } else { rrect(c, -6, -1, 12, 8, 2); ink(c, '#c4844e', 1.6); circle(c, 0, -4, 7.5); ink(c, '#ff7eb6', 1.8); }
    });
  }
  A.shot = function (ctx, s) {
    const spr = shotSp(s.kind);
    if (s.kind === 'cake' || s.kind === 'frost') {
      const k = Math.min(1, s.t / s.T), arc = Math.sin(k * Math.PI) * (s.kind === 'frost' ? 54 : 70);
      Kit.art.shadow(ctx, s.x - 11, s.y - 6, 22, 16, 0.3);
      const g = glowOf(s.kind === 'frost' ? '#ffb3dc' : '#ff9ec8', 18);
      if (g) Kit.art.blit(ctx, g, s.x, s.y - arc, { alpha: 0.55 });
      Kit.art.blit(ctx, spr, s.x, s.y - arc, { sx: 1.15, sy: 1.15 });
      return;
    }
    const g = glowOf(s.kind === 'pop' ? '#ffe08a' : '#c8ecff', 15);
    if (g) Kit.art.blit(ctx, g, s.x, s.y, { alpha: 0.5 });
    Kit.art.blit(ctx, spr, s.x, s.y);
  };
  A.coin = function (ctx, x, y, r) {
    circle(ctx, x, y, r); ink(ctx, '#ffd23f', 2.2);
    circle(ctx, x - r * 0.25, y - r * 0.25, r * 0.28); ctx.fillStyle = '#fff8c8'; ctx.fill();
  };
  A.reticle = function (ctx, x, y, t, ready, calm) {
    const pr = calm ? 0 : Math.sin(t * 9) * 3;
    ctx.save(); ctx.translate(x, y);
    ctx.strokeStyle = ready ? 'rgba(255,126,182,.9)' : 'rgba(255,255,255,.55)'; ctx.lineWidth = 3.5;
    circle(ctx, 0, 0, 22 + pr); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-30 - pr, 0); ctx.lineTo(-14, 0); ctx.moveTo(14, 0); ctx.lineTo(30 + pr, 0);
    ctx.moveTo(0, -30 - pr); ctx.lineTo(0, -14); ctx.moveTo(0, 14); ctx.lineTo(0, 30 + pr); ctx.stroke();
    circle(ctx, 0, 0, 4); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.restore();
  };

  /* --------------------------------------------------------------- cake */
  const BITES = [[46, 6], [31, -26], [-46, 14], [-31, -22], [44, 24], [8, 28]];
  function cakeBody(ctx, style, bites) {
    ctx.beginPath(); ctx.ellipse(0, 32, 58, 14, 0, 0, TAU); ctx.fillStyle = 'rgba(27,22,64,.2)'; ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, 28, 56, 14, 0, 0, TAU); ink(ctx, '#fff', 2.4);
    const tier = (w, h, top) => {
      rrect(ctx, -w / 2, top, w, h, 8); ink(ctx, style.sponge, 2.4);
      if (style.rainbow) ['#ff7eb6', '#ffd23f', '#62d26f', '#6fd3ff'].forEach((col, i) => { ctx.fillStyle = col; ctx.fillRect(-w / 2 + 3, top + 6 + i * (h - 10) / 4, w - 6, (h - 10) / 4 - 1); });
      rrect(ctx, -w / 2 - 3, top - 4, w + 6, 12, 6); ink(ctx, style.cream, 2);
      for (let i = 0; i < 5; i++) { circle(ctx, -w / 2 + 8 + i * (w - 16) / 4, top + 2, 4); ink(ctx, '#fff', 1.4); }
    };
    tier(92, 36, -8); tier(60, 28, -36);
    circle(ctx, 0, -42, 7); ink(ctx, style.top, 2);
    for (let i = -1; i <= 1; i++) { ctx.fillStyle = ['#6fd3ff', '#ffd23f', '#62d26f'][i + 1]; rrect(ctx, i * 16 - 3, -58, 6, 16, 2); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.4; ctx.stroke(); }
    if (!bites) return;
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < bites; i++) { circle(ctx, BITES[i][0], BITES[i][1], 13); ctx.fill(); }
    ctx.globalCompositeOperation = 'source-over';
  }
  function flames(ctx, t, calm) {
    const g = glowOf('#ffb03a', 20);
    for (let i = -1; i <= 1; i++) {
      const f = calm ? 0.85 : 0.8 + Math.sin(t * 10 + i * 2) * 0.2;
      if (g) Kit.art.blit(ctx, g, i * 16, -64, { alpha: 0.42 * f, sx: 0.85, sy: 1 });
      ctx.beginPath(); ctx.ellipse(i * 16, -62, 4 * f, 8 * f, 0, 0, TAU); ink(ctx, '#ff9f43', 1.5);
    }
  }
  const cakeCache = { key: '', canvas: null };
  A.resetCaches = function () { cakeCache.key = ''; for (const k in kept) delete kept[k]; for (const k in glows) delete glows[k]; };
  A.warm = function () {
    for (const tp of CG.TOWER_ORDER) { twBody(tp, 0); twGun(tp, 0); }
    blobSp('g', false); blobSp('z', false); shotSp('pop'); shotSp('frost'); padSp(''); padSp('ok');
  };
  A.cake = function (ctx, x, y, style, hearts, t, calm, k, sx, sy) {
    const bites = Math.min(6, Math.ceil((CG.HEARTS - hearts) / 3.4)), key = style.name + bites + '@' + k;
    if (cakeCache.key !== key) {
      const c = cakeCache.canvas || (cakeCache.canvas = document.createElement('canvas')), g = c.getContext('2d');
      c.width = c.height = Math.ceil(150 * k); g.setTransform(k, 0, 0, k, 75 * k, 78 * k);
      cakeBody(g, style, bites); cakeCache.key = key;
    }
    ctx.save(); ctx.translate(x, y + 30); ctx.scale(sx || 1, sy || 1); ctx.translate(-x, -(y + 30));
    ctx.drawImage(cakeCache.canvas, x - 75, y + 8 - 78, 150, 150);
    ctx.translate(x, y + 6); flames(ctx, t, calm); ctx.restore();
  };
  A.cakeIcon = function (canvas, style) {
    const ctx = canvas.getContext('2d'), s = canvas.width / 150;
    ctx.setTransform(s, 0, 0, s, 75 * s, 84 * s); ctx.clearRect(-75, -84, 150, 150);
    cakeBody(ctx, style, 0); flames(ctx, 0, true);
  };
})(globalThis.CG = globalThis.CG || {});
