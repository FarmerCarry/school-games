/* Castle Crash drawing. Skies and blocks are painted once, then blitted. */
(function (root) {
  'use strict';
  var W = 1280, H = 720, GROUND = 640;
  var skies = {}, blocks = {};
  var parts = [];
  var pi = 0;
  for (var i = 0; i < 360; i++) parts.push({ on: 0 });

  function rnd(a, b) { return a + Math.random() * (b - a); }

  function sky(world) {
    if (skies[world]) return skies[world];
    var c = document.createElement('canvas');
    c.width = W; c.height = H;
    var g = c.getContext('2d');
    var pal = [
      ['#8fd4ff', '#fff4c8', '#7ec85a', '#3e8f45', '#6b4428'],
      ['#d9f4ff', '#ffffff', '#e7f6ff', '#b9d4ea', '#8aa4b8'],
      ['#ffd27a', '#fff0c2', '#f0a04a', '#d47b32', '#c46a3a']
    ][world] || ['#8fd4ff', '#fff4c8', '#7ec85a', '#3e8f45', '#6b4428'];
    var grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, pal[0]); grd.addColorStop(0.55, pal[1]); grd.addColorStop(1, pal[1]);
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,0.85)';
    [[180, 90, 36], [420, 60, 24], [760, 110, 40], [1040, 70, 28]].forEach(function (p) {
      g.beginPath(); g.arc(p[0], p[1], p[2], 0, 6.3); g.arc(p[0] + p[2], p[1] + 4, p[2] * 0.8, 0, 6.3); g.fill();
    });
    function hill(color, y, amp, step) {
      g.fillStyle = color; g.beginPath(); g.moveTo(0, H);
      for (var x = 0; x <= W; x += step) g.lineTo(x, y + Math.sin(x * 0.01) * amp);
      g.lineTo(W, H); g.fill();
    }
    hill(pal[2], 470, 28, 40);
    hill(pal[3], 530, 18, 30);
    g.fillStyle = pal[4];
    g.fillRect(0, GROUND, W, H - GROUND);
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.fillRect(0, GROUND, W, 8);
    skies[world] = c;
    return c;
  }

  function blockSprite(mat, w, h, crack) {
    var key = mat + ':' + w + ':' + h + ':' + crack;
    if (blocks[key]) return blocks[key];
    var c = document.createElement('canvas');
    c.width = Math.ceil(w) + 4; c.height = Math.ceil(h) + 4;
    var g = c.getContext('2d');
    g.translate(2, 2);
    var col = { wood: '#e0a15a', ice: '#bfefff', stone: '#c9b59a', soda: '#ff5a6a' }[mat] || '#e0a15a';
    var edge = { wood: '#8a4b22', ice: '#3a8fb5', stone: '#6d5b48', soda: '#9d1830' }[mat] || '#8a4b22';
    g.fillStyle = col;
    g.strokeStyle = edge;
    g.lineWidth = 3;
    roundRect(g, 0, 0, w, h, 6);
    g.fill(); g.stroke();
    if (mat === 'wood') {
      g.strokeStyle = 'rgba(120,60,20,0.45)'; g.lineWidth = 2;
      for (var y = 8; y < h; y += 10) { g.beginPath(); g.moveTo(4, y); g.lineTo(w - 4, y + 2); g.stroke(); }
    } else if (mat === 'ice') {
      g.fillStyle = 'rgba(255,255,255,0.75)';
      g.beginPath(); g.ellipse(w * 0.35, h * 0.3, w * 0.18, h * 0.12, -0.4, 0, 6.3); g.fill();
    } else if (mat === 'stone') {
      g.strokeStyle = 'rgba(80,60,40,0.45)'; g.lineWidth = 2;
      g.strokeRect(6, 6, w - 12, h * 0.45);
      g.beginPath(); g.moveTo(w * 0.5, 6); g.lineTo(w * 0.5, h * 0.5); g.stroke();
    } else if (mat === 'soda') {
      g.fillStyle = '#fff';
      g.fillRect(w * 0.25, h * 0.3, w * 0.5, h * 0.28);
      g.fillStyle = '#ffd23a';
      g.beginPath(); g.arc(w * 0.38, h * 0.72, 4, 0, 6.3); g.arc(w * 0.62, h * 0.66, 3, 0, 6.3); g.fill();
    }
    if (crack) {
      g.strokeStyle = 'rgba(40,20,10,0.8)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(w * 0.2, h * 0.15); g.lineTo(w * 0.45, h * 0.5); g.lineTo(w * 0.3, h * 0.9); g.stroke();
      if (crack > 1) { g.beginPath(); g.moveTo(w * 0.7, h * 0.1); g.lineTo(w * 0.55, h * 0.55); g.lineTo(w * 0.8, h * 0.85); g.stroke(); }
    }
    blocks[key] = c;
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

  function puff(x, y, color, n) {
    for (var i = 0; i < n && i < 24; i++) {
      var p = parts[pi]; pi = (pi + 1) % parts.length;
      var a = rnd(0, 6.3), s = rnd(30, 180);
      p.on = 1; p.x = x; p.y = y; p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s - 40;
      p.life = rnd(0.35, 0.8); p.max = p.life; p.size = rnd(3, 7); p.color = color; p.g = 500; p.kind = 'dust';
    }
  }
  function confetti(x, y) {
    var cols = ['#ff5a7a', '#ffe56a', '#7CFF6B', '#7ad7ff', '#c59bff'];
    for (var i = 0; i < 18; i++) {
      var p = parts[pi]; pi = (pi + 1) % parts.length;
      var a = rnd(0, 6.3), s = rnd(80, 280);
      p.on = 1; p.x = x; p.y = y; p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s - 120;
      p.life = rnd(0.5, 1); p.max = p.life; p.size = rnd(4, 8); p.color = cols[i % cols.length]; p.g = 420; p.kind = 'bit'; p.rot = rnd(0, 6);
    }
  }

  function burstFrom(ev) {
    if (!ev) return;
    if (ev.t === 'pop') confetti(ev.x, ev.y);
    else if (ev.t === 'break') puff(ev.x, ev.y, ev.mat === 'ice' ? '#e8fbff' : '#e7c49a', ev.mat === 'stone' ? 14 : 10);
    else if (ev.t === 'blast') puff(ev.x, ev.y, '#ffe56a', 20);
    else if (ev.t === 'fire') puff(ev.x, ev.y, '#fff', 6);
  }

  function stepParts(dt) {
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i]; if (!p.on) continue;
      p.life -= dt; if (p.life <= 0) { p.on = 0; continue; }
      p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += dt * 6;
    }
  }

  function drawGloopy(g, b, t, hat) {
    var squash = 1 + Math.sin(t * 6 + b.id) * 0.04;
    var stretch = 1 / squash;
    if (Math.abs(b.vy) > 80) { squash = 0.8; stretch = 1.2; }
    g.save();
    g.translate(b.x, b.y);
    g.scale(stretch, squash);
    g.fillStyle = '#7CFF6B';
    g.beginPath(); g.ellipse(0, 2, 18, 16, 0, 0, 6.3); g.fill();
    g.fillStyle = '#3d9a40';
    g.beginPath(); g.ellipse(0, 8, 12, 5, 0, 0, 3.14); g.fill();
    g.fillStyle = '#fff';
    g.beginPath(); g.arc(-6, -2, 5, 0, 6.3); g.arc(6, -2, 5, 0, 6.3); g.fill();
    g.fillStyle = '#1b2430';
    g.beginPath(); g.arc(-5, -1, 2.2, 0, 6.3); g.arc(7, -1, 2.2, 0, 6.3); g.fill();
    g.strokeStyle = '#1b2430'; g.lineWidth = 2;
    g.beginPath(); g.arc(0, 4, 4, 0.15, 3); g.stroke();
    // Toy helmet.
    g.fillStyle = hat || '#ff5a6a';
    g.beginPath(); g.ellipse(0, -10, 16, 8, 0, 3.14, 6.28); g.fill();
    g.fillRect(-16, -12, 32, 5);
    g.restore();
  }

  function drawSling(g, session, drag, fork) {
    var s = session.sling, dir = session.dir || 1;
    var x = s.x, y = s.y;
    g.strokeStyle = fork || '#8a4b22'; g.lineWidth = 8; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x - 16 * dir, y - 46); g.lineTo(x, y + 8); g.lineTo(x + 16 * dir, y - 46); g.stroke();
    g.strokeStyle = '#5c3016'; g.lineWidth = 10;
    g.beginPath(); g.moveTo(x, y + 8); g.lineTo(x, y + 70); g.stroke();
    var px = drag ? drag.x : x - 8 * dir, py = drag ? drag.y : y;
    g.strokeStyle = '#3a2418'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(x - 16 * dir, y - 46); g.lineTo(px, py); g.lineTo(x + 16 * dir, y - 46); g.stroke();
    if (!session.shots.length && session.phase === 'aim') {
      var ammo = (root.CC && root.CC.AMMO[session.ammo]) || { r: 16 };
      var col = { ball: '#ff4d4d', marble: '#b06bff', bowl: '#2a2a2a', boom: '#ffd23a', ice: '#3ec6ff' }[session.ammo] || '#ff4d4d';
      g.fillStyle = col;
      g.beginPath(); g.arc(px, py, ammo.r || 14, 0, 6.3); g.fill();
    }
  }

  function draw(ctx, session, opts) {
    opts = opts || {};
    var world = (session.level && session.level.world) || 1;
    if (session.mode === 'duel') world = 1;
    ctx.drawImage(sky(world - 1), 0, 0);
    var bodies = session.world.bodies, i, b;
    for (i = 0; i < bodies.length; i++) {
      b = bodies[i];
      if (b.role === 'ground' || b.dead) continue;
      if (b.role === 'block') {
        var spr = blockSprite(b.mat, b.user.w || b.hw * 2 || 48, b.user.h || b.hh * 2 || 46, b.user.crack || 0);
        ctx.save();
        ctx.translate(b.x, b.y); ctx.rotate(b.a);
        ctx.drawImage(spr, -spr.width / 2, -spr.height / 2);
        ctx.restore();
      } else if (b.role === 'gloopy') drawGloopy(ctx, b, session.time || 0, opts.hat);
      else if (b.role === 'shot') {
        var col2 = { ball: '#ff4d4d', marble: '#b06bff', bowl: '#222', boom: '#ffd23a', ice: '#3ec6ff' }[b.user.ammo] || '#fff';
        ctx.fillStyle = col2;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 6.3); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.beginPath(); ctx.arc(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.28, 0, 6.3); ctx.fill();
      }
    }
    drawSling(ctx, session, opts.drag, opts.fork);
    if (opts.dots && session.phase === 'aim') {
      ctx.fillStyle = 'rgba(20,30,40,0.55)';
      for (i = 0; i < opts.dots.length; i += 2) {
        if ((i / 2) % 3) continue;
        ctx.beginPath(); ctx.arc(opts.dots[i], opts.dots[i + 1], 3.2, 0, 6.3); ctx.fill();
      }
    }
    for (i = 0; i < parts.length; i++) {
      var p = parts[i]; if (!p.on) continue;
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      if (p.kind === 'bit') {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); ctx.restore();
      } else {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 6.3); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    if (session.mode === 'duel') {
      var wx = 640 + session.wind * 0.8;
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#16324a'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(620, 120); ctx.lineTo(wx, 120); ctx.stroke();
      var sgn = session.wind >= 0 ? 1 : -1;
      ctx.beginPath(); ctx.moveTo(wx, 120); ctx.lineTo(wx - sgn * 12, 112); ctx.lineTo(wx - sgn * 12, 128); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ff5a6a';
      ctx.beginPath(); ctx.moveTo(250, 150); ctx.lineTo(290, 168); ctx.lineTo(250, 186); ctx.fill();
      ctx.fillRect(246, 150, 6, 70);
    }
    // Speech bubble when a gloopy was just hit.
    var evs = session.events || [];
    for (i = 0; i < evs.length; i++) if (evs[i].t === 'pop') {
      ctx.direction = 'rtl'; ctx.textAlign = 'center'; ctx.font = '700 28px Fredoka';
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#16324a'; ctx.lineWidth = 4;
      ctx.strokeText('واااه!', evs[i].x, evs[i].y - 36);
      ctx.fillText('واااه!', evs[i].x, evs[i].y - 36);
    }
  }

  root.CCR = { draw: draw, sky: sky, stepParts: stepParts, burstFrom: burstFrom, puff: puff, W: W, H: H, GROUND: GROUND };
})(typeof window !== 'undefined' ? window : globalThis);
