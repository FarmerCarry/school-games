/* Procedural pets, guardians and the strip world. Sprites are painted once. */
(function (ER) {
  'use strict';
  const A = ER.art = {};
  const TILE = 48;
  const PAL = ['#8fd46a', '#ffe08a', '#e7f4ff', '#f0c56b', '#ff9ec8', '#d5f1ff', '#3a2d6b'];
  const PAL2 = ['#63b53a', '#f2c14e', '#c5dcf2', '#e0a84a', '#ff6fa8', '#b9e4ff', '#2a2154'];
  const INK = '#2a2348';
  const RCOL = ['#fff6d8', '#fff6d8', '#7ec8ff', '#d28bff', '#ffd23f', '#ff6d8f'];
  const cache = new Map();
  const parts = [];
  let floaters = [];

  function rng(n) { n = (n * 1103515245 + 12345) >>> 0; return (n % 1000) / 1000; }
  function X(c, x) { return (x - c.x) * TILE * c.z; }
  function Y(c, y) { return (y - c.y) * TILE * c.z; }
  A.worldPoint = function (cam, px, py) { return { x: cam.x + px / (TILE * cam.z), y: cam.y + py / (TILE * cam.z) }; };

  function eggPath(ctx, x, y, rx, ry) {
    ctx.beginPath();
    ctx.moveTo(x, y - ry);
    ctx.bezierCurveTo(x + rx, y - ry, x + rx * 0.92, y + ry * 0.55, x, y + ry);
    ctx.bezierCurveTo(x - rx * 0.92, y + ry * 0.55, x - rx, y - ry, x, y - ry);
  }
  function eye(ctx, x, y, open, look) {
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(x, y, 5.2, open ? 6 : 1.4, 0, 0, 7); ctx.fill();
    if (open) { ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(x + look, y + 0.5, 2.3, 0, 7); ctx.fill(); }
  }

  const BODY = [
    (ctx, s) => { ctx.beginPath(); ctx.ellipse(0, 4, 16 * s, 14 * s, 0, 0, 7); },
    (ctx, s) => { ctx.beginPath(); ctx.ellipse(0, 2, 12 * s, 18 * s, 0, 0, 7); },
    (ctx, s) => { ctx.beginPath(); ctx.ellipse(0, 6, 20 * s, 11 * s, 0, 0, 7); }
  ];
  function drawPet(ctx, b, s, v, size) {
    const id = b * 6 + s;
    const shape = id % 3, ears = (id * 3) % 4, tail = (id * 5) % 3, pat = (id * 7) % 4;
    const gold = v === 2 || v === 3, giant = v === 1 || v === 3;
    const sc = (giant ? 1.28 : 1) * (size / 96);
    ctx.save();
    ctx.translate(size / 2, size / 2 + 6);
    ctx.scale(sc, sc);
    ctx.fillStyle = 'rgba(40,30,60,0.18)';
    ctx.beginPath(); ctx.ellipse(0, 22, 16, 5, 0, 0, 7); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.lineJoin = 'round';
    const coat = gold ? '#ffd23f' : ['#fff', '#ffb703', '#8ecae6', '#c77dff', '#95d5b2', '#ff8fab', '#f4a261'][id % 7];
    const mark = gold ? '#fff1a8' : ['#ffe8a3', '#fb8500', '#219ebc', '#7b2cbf', '#52b788', '#ff5d8f', '#e76f51'][id % 7];
    if (tail === 1) { ctx.fillStyle = coat; ctx.beginPath(); ctx.arc(-16, 8, 7, 0, 7); ctx.fill(); ctx.stroke(); }
    if (tail === 2) { ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-14, 8); ctx.quadraticCurveTo(-26, 0, -20, -8); ctx.stroke(); ctx.lineWidth = 3; }
    ctx.fillStyle = coat;
    BODY[shape](ctx, 1); ctx.fill(); ctx.stroke();
    ctx.fillStyle = mark;
    if (pat === 1) { ctx.beginPath(); ctx.arc(-6, 2, 3.2, 0, 7); ctx.arc(5, 6, 2.6, 0, 7); ctx.arc(2, -2, 2.2, 0, 7); ctx.fill(); }
    if (pat === 2) { ctx.fillRect(-14, 0, 28, 3); ctx.fillRect(-12, 7, 24, 3); }
    if (pat === 3) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(0, 8, 8, 6, 0, 0, 7); ctx.fill(); }
    if (ears === 1) { ctx.fillStyle = coat; ctx.beginPath(); ctx.arc(-8, -14, 5, 0, 7); ctx.arc(8, -14, 5, 0, 7); ctx.fill(); ctx.stroke(); }
    if (ears === 2) { ctx.fillStyle = coat; ctx.beginPath(); ctx.moveTo(-10, -8); ctx.lineTo(-14, -22); ctx.lineTo(-2, -12); ctx.moveTo(10, -8); ctx.lineTo(14, -22); ctx.lineTo(2, -12); ctx.fill(); ctx.stroke(); }
    if (ears === 3) { ctx.fillStyle = coat; ctx.beginPath(); ctx.ellipse(-12, -8, 6, 8, -0.6, 0, 7); ctx.ellipse(12, -8, 6, 8, 0.6, 0, 7); ctx.fill(); ctx.stroke(); }
    eye(ctx, -5, -2, 1, 1); eye(ctx, 6, -2, 1, 1);
    ctx.fillStyle = '#e76f51'; ctx.beginPath(); ctx.arc(1, 4, 2.1, 0, 7); ctx.fill();
    if (gold) { ctx.fillStyle = '#fff'; ctx.fillRect(-2, -20, 4, 8); ctx.beginPath(); ctx.moveTo(-6, -14); ctx.lineTo(0, -22); ctx.lineTo(6, -14); ctx.fill(); }
    ctx.restore();
  }
  A.sprite = function (b, s, v) {
    const k = b + ':' + s + ':' + v;
    let c = cache.get(k);
    if (c) return c;
    c = document.createElement('canvas');
    const giant = v === 1 || v === 3;
    c.width = c.height = giant ? 128 : 96;
    const g = c.getContext('2d');
    drawPet(g, b, s, v, c.width);
    cache.set(k, c);
    return c;
  };

  A.burst = function (x, y, n, colors, speed) {
    if (A.reduced) return;
    for (let i = 0; i < n && parts.length < 150; i++) {
      const a = Math.random() * 6.28, sp = (speed || 2.2) * (0.45 + Math.random());
      parts.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.2, life: 0.45 + Math.random() * 0.3, max: 0.7, size: 0.08 + Math.random() * 0.08, color: colors[i % colors.length], g: 5, tile: 1 });
    }
  };
  A.float = function (x, y, text, color) { floaters.push({ x: x, y: y, text: text, color: color || '#fff', life: 0.8 }); if (floaters.length > 24) floaters.shift(); };
  A.tick = function (w, dt) {
    if (!A.reduced && w && w.mode === '1p') {
      const p = w.players[0];
      if (p && p.egg && Math.random() < 0.7) {
        const col = RCOL[p.egg.species];
        if (parts.length < 150) parts.push({ x: p.x, y: p.y - 0.9, vx: (Math.random() - 0.5) * 0.4, vy: -0.6, life: 0.35, max: 0.35, size: 0.12, color: col, g: 0, tile: 1 });
      }
    }
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      p.vy += (p.g || 0) * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    }
    for (let i = floaters.length - 1; i >= 0; i--) { floaters[i].life -= dt; floaters[i].y -= dt * 0.8; if (floaters[i].life <= 0) floaters.splice(i, 1); }
  };
  A.clearFx = function () { parts.length = 0; floaters = []; };

  function ground(ctx, w, cam) {
    const z = cam.z, vw = 1280 / (TILE * z), x0 = cam.x, x1 = cam.x + vw;
    ctx.fillStyle = '#8fd46a';
    ctx.fillRect(0, 0, 1280, 720);
    if (w.mode === '1p') {
      const themes = ['#9adf72', '#f7c4dc', '#c9b6ff', '#ffe29a'];
      ctx.fillStyle = themes[w.baseTheme] || '#9adf72';
      ctx.fillRect(X(cam, 0), Y(cam, 0), ER.BASE * TILE * z, ER.H * TILE * z);
      ctx.fillStyle = 'rgba(255,244,180,0.45)';
      ctx.fillRect(X(cam, 0), Y(cam, 0), w.safeL * TILE * z, ER.H * TILE * z);
      for (let i = 0; i < 7; i++) {
        const x = ER.BASE + i * ER.BW;
        ctx.fillStyle = PAL[i];
        ctx.fillRect(X(cam, x), Y(cam, 0), ER.BW * TILE * z, ER.H * TILE * z);
        ctx.fillStyle = PAL2[i];
        if (i === 1) ctx.fillRect(X(cam, x), Y(cam, 12.2), ER.BW * TILE * z, 2.8 * TILE * z);
        if (i === 2) { ctx.globalAlpha = 0.35; ctx.fillRect(X(cam, x), Y(cam, 0), ER.BW * TILE * z, ER.H * TILE * z); ctx.globalAlpha = 1; }
        if (i === 4) { ctx.fillStyle = '#ff5a3c'; ctx.fillRect(X(cam, x + 2), Y(cam, 13.2), (ER.BW - 4) * TILE * z, 0.7 * TILE * z); }
      }
      const a = (x0 | 0) - 1, b = (x1 | 0) + 2;
      for (let x = a; x < b; x += 2) {
        const bio = ER.biomeAt(x + 0.2);
        const y = 2 + rng(x * 13 + 2) * 10;
        const px = X(cam, x), py = Y(cam, y), s = TILE * z;
        ctx.fillStyle = bio < 0 ? '#fff' : '#fff';
        if (bio === 0 || bio < 0) { ctx.fillStyle = rng(x) > 0.5 ? '#ffd166' : '#fff'; ctx.beginPath(); ctx.arc(px, py, 3, 0, 7); ctx.fill(); }
        else if (bio === 2) { ctx.globalAlpha = 0.7; ctx.fillStyle = '#fff'; ctx.fillRect(px, py, 2, 6); ctx.globalAlpha = 1; }
        else if (bio === 6) { ctx.fillStyle = '#fff6b0'; ctx.fillRect(px, py, 2, 2); }
        else if (bio === 5) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(px, py, 10, 6, 0, 0, 7); ctx.fill(); }
        void s;
      }
    } else {
      ctx.fillStyle = PAL[0]; ctx.fillRect(0, Y(cam, 0), 1280, ER.H * TILE * z);
      ctx.fillStyle = PAL[1]; ctx.fillRect(X(cam, 22), Y(cam, 0), 14 * TILE * z, ER.H * TILE * z);
      ctx.fillStyle = PAL[2]; ctx.fillRect(X(cam, 36), Y(cam, 0), 8 * TILE * z, ER.H * TILE * z);
      ctx.fillStyle = 'rgba(255,244,180,0.4)';
      ctx.fillRect(X(cam, 0), Y(cam, 0), w.safeL * TILE * z, ER.H * TILE * z);
      ctx.fillRect(X(cam, w.safeR), Y(cam, 0), (w.w - w.safeR) * TILE * z, ER.H * TILE * z);
    }
  }

  function drawEgg(ctx, x, y, species, bob, sc) {
    const col = RCOL[species] || '#fff';
    ctx.save();
    ctx.translate(x, y + Math.sin(bob) * 3);
    ctx.scale(sc || 1, sc || 1);
    ctx.fillStyle = col; ctx.globalAlpha = 0.35;
    ctx.beginPath(); ctx.arc(0, 2, 22, 0, 7); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#fffdf6'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
    eggPath(ctx, 0, 0, 11, 15); ctx.fill(); ctx.stroke();
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(-2, 2, 4, 0, 7); ctx.fill();
    ctx.restore();
  }

  function guard(ctx, g, t) {
    ctx.save();
    ctx.translate(0, g.air ? -18 : 0);
    ctx.fillStyle = INK; ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.lineJoin = 'round';
    const k = g.kind, hop = Math.sin(t * 6 + g.x) * (g.state === 'chase' ? 2 : 0);
    ctx.translate(0, hop);
    if (k === 'hen') {
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(0, 2, 18, 14, 0, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ff5a3c'; ctx.beginPath(); ctx.moveTo(-4, -12); ctx.lineTo(0, -22); ctx.lineTo(4, -12); ctx.fill();
      ctx.fillStyle = '#ffb703'; ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(20, 3); ctx.lineTo(10, 6); ctx.fill();
    } else if (k === 'crab') {
      ctx.fillStyle = '#ff6b4a'; ctx.beginPath(); ctx.ellipse(0, 4, 18, 12, 0, 0, 7); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(-16, -2, 5, 0, 7); ctx.arc(16, -2, 5, 0, 7); ctx.stroke();
    } else if (k === 'penguin') {
      ctx.fillStyle = '#2a2348'; ctx.beginPath(); ctx.ellipse(0, 2, 14, 18, 0, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(0, 6, 8, 12, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#ffb703'; ctx.beginPath(); ctx.moveTo(0, 2); ctx.lineTo(8, 6); ctx.lineTo(0, 8); ctx.fill();
    } else if (k === 'camel') {
      ctx.fillStyle = '#e6b15a'; ctx.beginPath(); ctx.ellipse(0, 6, 24, 12, 0, 0, 7); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(-8, -4, 8, 8, 0, 0, 7); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(6, -8, 10, 9, 0, 0, 7); ctx.fill(); ctx.stroke();
    } else if (k === 'salamander') {
      ctx.fillStyle = '#ff8fab'; ctx.beginPath(); ctx.ellipse(2, 4, 22, 10, 0, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-6, 2, 3, 0, 7); ctx.arc(4, 4, 2.4, 0, 7); ctx.fill();
    } else if (k === 'owl') {
      ctx.save(); ctx.rotate(g.spin ? (g.ang + Math.PI) : 0);
      ctx.fillStyle = '#c9b6a0'; ctx.beginPath(); ctx.ellipse(0, 2, 16, 16, 0, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-6, 0, 6, 0, 7); ctx.arc(6, 0, 6, 0, 7); ctx.fill(); ctx.stroke();
      eye(ctx, -6, 0, 1, 0); eye(ctx, 6, 0, 1, 0);
      ctx.restore();
    } else {
      ctx.fillStyle = '#d7d5f0'; ctx.fillRect(-14, -10, 28, 24); ctx.strokeRect(-14, -10, 28, 24);
      ctx.fillStyle = '#8d89c9'; ctx.fillRect(-16, -16, 6, 8); ctx.fillRect(10, -16, 6, 8);
      ctx.fillStyle = '#7ec8ff'; ctx.fillRect(-8, -4, 16, 6);
    }
    const open = g.state !== 'sleep';
    if (k !== 'owl') { eye(ctx, -6, -1, open, g.facing * 1.5); eye(ctx, 5, -1, open, g.facing * 1.5); }
    ctx.restore();
  }

  function label(ctx, text, x, y, size, color, rtl) {
    ctx.save();
    ctx.direction = rtl ? 'rtl' : 'ltr';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '700 ' + size + 'px Fredoka';
    ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.fillStyle = color || '#fff';
    ctx.strokeText(text, x, y); ctx.fillText(text, x, y);
    ctx.restore();
  }

  A.draw = function (ctx, w, cam, time, zoom) {
    ctx.save();
    ctx.clearRect(0, 0, 1280, 720);
    ground(ctx, w, cam);
    if (zoom > 1) {
      const p = w.players[0];
      const sx = X(cam, p.x), sy = Y(cam, p.y);
      ctx.translate(sx, sy); ctx.scale(zoom, zoom); ctx.translate(-sx, -sy);
    }
    const z = cam.z;
    if (w.mode === '1p') {
      for (let i = 1; i < 7; i++) {
        const gx = ER.BASE + i * ER.BW, open = ER.speedOf(w.speedXP) + 1e-6 >= ER.GATES[i];
        const x = X(cam, gx), y = Y(cam, 4.2);
        ctx.fillStyle = open ? '#7dce64' : '#8d6a4a';
        ctx.fillRect(x - 6, Y(cam, 0), 12, ER.H * TILE * z);
        ctx.fillStyle = '#fff8e8'; ctx.fillRect(x - 46, y, 92, 36);
        ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.strokeRect(x - 46, y, 92, 36);
        label(ctx, open ? ER.BIOMES[i].name : 'تحتاج سرعة ' + ER.GATES[i], x, y + 18, 16, open ? '#2a7a38' : '#8a3b12', true);
      }
      for (let i = 0; i < w.pens; i++) {
        const pad = w.pads[i];
        const x = X(cam, pad.x), y = Y(cam, pad.y);
        ctx.fillStyle = '#f4e1b5'; ctx.beginPath(); ctx.ellipse(x, y + 8, 22, 12, 0, 0, 7); ctx.fill();
        ctx.strokeStyle = INK; ctx.stroke();
        const pet = w.pets.find(p => p.pad === i);
        if (pet) {
          const spr = A.sprite(pet.b, pet.s, pet.v);
          const bob = Math.sin(time * 4 + i) * 3;
          ctx.drawImage(spr, x - spr.width / 2, y - spr.height / 2 - 8 + bob);
        }
        if (pad.pile >= 1) {
          const n = Math.min(5, Math.floor(pad.pile / 4) + 1);
          for (let k = 0; k < n; k++) { ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(x + 16, y - 4 - k * 4, 5, 0, 7); ctx.fill(); ctx.stroke(); }
          label(ctx, ER.fmt(pad.pile), x, y + 22, 14, '#fff', false);
        }
      }
      for (let i = 0; i < w.mills.length; i++) {
        const m = w.mills[i], on = (m.mult === 1) || (m.mult === 2 && w.millLv >= 2) || (m.mult === 5 && w.millLv >= 3);
        const x = X(cam, m.x), y = Y(cam, m.y);
        ctx.fillStyle = on ? '#6c8cff' : '#b9b4c9';
        ctx.fillRect(x - 28, y - 16, 56, 32); ctx.strokeStyle = INK; ctx.strokeRect(x - 28, y - 16, 56, 32);
        label(ctx, on ? '×' + m.mult : 'مقفل', x, y, 16, '#fff', false);
      }
      if (w.shop) {
        const x = X(cam, w.shop.x), y = Y(cam, w.shop.y);
        ctx.fillStyle = '#ff8a3d'; ctx.fillRect(x - 26, y - 28, 52, 40); ctx.strokeRect(x - 26, y - 28, 52, 40);
        ctx.fillStyle = '#fff'; ctx.fillRect(x - 18, y - 46, 36, 18);
        label(ctx, 'المتجر', x, y - 8, 16, '#fff', true);
      }
      w.incs.forEach((inc, i) => {
        const x = X(cam, 2.2 + i * 2.3), y = Y(cam, 8.6);
        ctx.fillStyle = '#ffe8c2'; ctx.fillRect(x - 18, y - 10, 36, 28); ctx.strokeRect(x - 18, y - 10, 36, 28);
        if (inc) {
          const left = Math.max(0, (inc.end - w.now) / 1000), total = ER.hatchDur(inc.s, w.hatchLv);
          const u = 1 - Math.min(1, left / total);
          drawEgg(ctx, x, y - 8, inc.s, time * (2 + u * 8), 0.8 + u * 0.15);
          if (u > 0.7) { ctx.strokeStyle = INK; ctx.beginPath(); ctx.moveTo(x, y - 20); ctx.lineTo(x - 4, y - 8); ctx.stroke(); }
        }
      });
    }
    for (const pud of w.puddles) {
      ctx.fillStyle = 'rgba(255,70,40,0.45)';
      ctx.beginPath(); ctx.ellipse(X(cam, pud.x), Y(cam, pud.y), 18 * z, 10 * z, 0, 0, 7); ctx.fill();
    }
    for (const g of w.guards) {
      if (g.state === 'watch' || g.state === 'stir') {
        ctx.save();
        ctx.translate(X(cam, g.x), Y(cam, g.y));
        ctx.rotate(g.ang);
        ctx.fillStyle = g.state === 'watch' ? 'rgba(255,70,90,0.28)' : 'rgba(255,190,60,0.18)';
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, g.cone * TILE * z, -g.sweep / 2, g.sweep / 2); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }
    for (const n of w.nests) {
      if (!n.egg) continue;
      const x = X(cam, n.x), y = Y(cam, n.y);
      ctx.fillStyle = '#e6c07a'; ctx.beginPath(); ctx.ellipse(x, y + 10, 16, 7, 0, 0, 7); ctx.fill();
      drawEgg(ctx, x, y - 6, n.species, time * 3 + n.id, n.daily ? 1.15 : 1);
      if (n.daily) label(ctx, 'اليوم', x, y - 34, 14, '#ffd23f', true);
      const rate = ER.petRate(n.biome, n.species, 0);
      label(ctx, rate + '/ث', x, y + 24, 13, '#fff', false);
    }
    for (const f of w.flights) drawEgg(ctx, X(cam, f.x), Y(cam, f.y), f.species, time * 4, 1);
    for (const it of w.items) {
      ctx.save(); ctx.translate(X(cam, it.x), Y(cam, it.y));
      if (it.kind === 'peel') { ctx.fillStyle = '#ffe14a'; ctx.beginPath(); ctx.ellipse(0, 0, 10, 5, 0.6, 0, 7); ctx.fill(); ctx.stroke(); }
      else { drawEgg(ctx, 0, 0, 0, 0, 0.7); }
      ctx.restore();
    }
    for (const g of w.guards) {
      if (g.air) { ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.beginPath(); ctx.ellipse(X(cam, g.x), Y(cam, g.y) + 16 * z, 12 * z, 5 * z, 0, 0, 7); ctx.fill(); }
      ctx.save(); ctx.translate(X(cam, g.x), Y(cam, g.y)); ctx.scale(z, z);
      if (g.state === 'slip') ctx.rotate(g.ang);
      guard(ctx, g, time);
      ctx.restore();
      if (g.state === 'sleep') label(ctx, 'Zzz', X(cam, g.x), Y(cam, g.y) - 32, 16, '#fff', false);
      if (g.state === 'stir') label(ctx, '؟', X(cam, g.x), Y(cam, g.y) - 34, 22, '#ffd23f', true);
      if (g.state === 'chase') label(ctx, '!', X(cam, g.x), Y(cam, g.y) - 36, 26, '#ff5a6a', false);
    }
    if (w.fox) {
      const x = X(cam, w.fox.x), y = Y(cam, w.fox.y);
      ctx.fillStyle = '#ff8a3d'; ctx.beginPath(); ctx.ellipse(x, y, 14, 9, 0, 0, 7); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + 8, y - 6); ctx.lineTo(x + 16, y - 16); ctx.lineTo(x + 4, y - 4); ctx.fill();
      label(ctx, 'ثعلب!', x, y - 24, 16, '#fff', true);
    }
    if (w.stolen) {
      const d = ER.denPos(w);
      label(ctx, 'وكر', X(cam, d.x), Y(cam, d.y) - 16, 16, '#fff', true);
      ctx.fillStyle = '#6b4a2a'; ctx.beginPath(); ctx.ellipse(X(cam, d.x), Y(cam, d.y), 16, 10, 0, 0, 7); ctx.fill();
    }
    w.players.forEach((p, i) => {
      const hop = (w.mode === '1p' && ER.biomeAt(p.x) === 6) ? Math.abs(Math.sin(time * 8)) * 8 : 0;
      const x = X(cam, p.x), y = Y(cam, p.y) - hop;
      const sq = 1 + Math.sin(p.step) * (A.reduced ? 0 : 0.08);
      ctx.save(); ctx.translate(x, y); ctx.scale((1 / sq) * p.facing * z, sq * z);
      ctx.fillStyle = 'rgba(40,30,60,0.2)'; ctx.beginPath(); ctx.ellipse(0, 18, 12, 4, 0, 0, 7); ctx.fill();
      ctx.fillStyle = i === 1 ? '#ff8a2a' : '#3d7dff';
      ctx.fillRect(-9, -2, 18, 16); ctx.strokeRect(-9, -2, 18, 16);
      ctx.fillStyle = '#ffd7b5'; ctx.beginPath(); ctx.arc(0, -12, 9, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#5a3a22'; ctx.fillRect(-8, -20, 16, 6);
      eye(ctx, -3, -12, 1, 1); eye(ctx, 4, -12, 1, 1);
      if (w.rebirths > 0 && i === 0) { ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.moveTo(-8, -22); ctx.lineTo(0, -30); ctx.lineTo(8, -22); ctx.fill(); ctx.stroke(); }
      if (p.bubble) { ctx.strokeStyle = '#8fd8ff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 24, 0, 7); ctx.stroke(); }
      ctx.restore();
      if (p.egg) drawEgg(ctx, x, y - 36 - Math.sin(time * 6) * 3, p.egg.species, 0, 0.85);
      if (w.mode === '2p') label(ctx, i === 0 ? '1' : '2', x, y - 48, 16, '#fff', false);
      if (p.immune > 0) ctx.globalAlpha = 0.5 + 0.5 * Math.sin(time * 24);
      ctx.globalAlpha = 1;
    });
    for (const p of parts) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(X(cam, p.x), Y(cam, p.y), Math.max(2, p.size * TILE * z), 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const f of floaters) {
      ctx.globalAlpha = Math.max(0, f.life);
      label(ctx, f.text, X(cam, f.x), Y(cam, f.y), 22, f.color, /[ء-ي]/.test(f.text));
    }
    ctx.globalAlpha = 1;
    const near = w.players[0];
    if (near) {
      let best = null, bd = 2.4;
      for (const n of w.nests) if (n.egg) {
        const d = Math.hypot(n.x - near.x, n.y - near.y);
        if (d < bd) { bd = d; best = n; }
      }
      if (best) label(ctx, 'عملاق 1/8 · ذهبي 1/30', X(cam, best.x), Y(cam, best.y) + 42, 14, '#fff', true);
    }
    ctx.restore();
  };
})(globalThis.EggRush = globalThis.EggRush || {});
