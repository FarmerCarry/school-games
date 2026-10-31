/* Castle Crash drawing. Camera, forts, sling and juice. No physics. */
(function (root) {
  'use strict';
  var W = 1280, H = 720, GROUND = 640;
  var skies = {}, farLayers = {}, blocks = {}, grounds = {}, pats = {};
  var parts = [];
  var pi = 0;
  var trails = [];
  var cam = { x: 640, y: 470, z: 1.85 };
  for (var i = 0; i < 420; i++) parts.push({ on: 0 });

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function sky(world) {
    if (skies[world]) return skies[world];
    var c = document.createElement('canvas');
    c.width = W; c.height = H;
    var g = c.getContext('2d');
    var pal = [
      ['#7ec8ff', '#fff6d0', '#cfe7ff'],
      ['#d7f2ff', '#f4fbff', '#e7f4ff'],
      ['#ffb15a', '#ffe7b0', '#ffd7a0']
    ][world] || ['#7ec8ff', '#fff6d0', '#cfe7ff'];
    var grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, pal[0]);
    grd.addColorStop(0.55, pal[1]);
    grd.addColorStop(1, pal[2]);
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,0.9)';
    [[160, 84, 34], [430, 56, 22], [780, 96, 40], [1080, 64, 26]].forEach(function (p) {
      g.beginPath();
      g.arc(p[0], p[1], p[2], 0, 6.3);
      g.arc(p[0] + p[2] * 0.9, p[1] + 6, p[2] * 0.75, 0, 6.3);
      g.fill();
    });
    if (world === 2) {
      g.fillStyle = 'rgba(255,244,210,0.9)';
      g.beginPath(); g.arc(1040, 120, 36, 0, 6.3); g.fill();
    }
    skies[world] = c;
    return c;
  }

  function farLayer(world) {
    if (farLayers[world]) return farLayers[world];
    var c = document.createElement('canvas');
    c.width = 1800; c.height = 520;
    var g = c.getContext('2d');
    var ridge = world === 2 ? '#f08a3a' : world === 1 ? '#9eb4c6' : '#7ea2c4';
    var ridge2 = world === 2 ? '#c4652e' : world === 1 ? '#7f93a6' : '#5e86ad';
    function hills(color, base, amp, freq) {
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(0, 520);
      for (var x = 0; x <= 1800; x += 12) {
        g.lineTo(x, base - Math.abs(Math.sin(x * freq)) * amp - Math.sin(x * freq * 0.4 + 1) * amp * 0.4);
      }
      g.lineTo(1800, 520);
      g.fill();
    }
    hills(ridge, 250, 90, 0.008);
    hills(ridge2, 310, 54, 0.014);
    g.fillStyle = world === 2 ? 'rgba(90, 40, 28, 0.55)' : 'rgba(36, 58, 92, 0.45)';
    for (var x = 40; x < 1800; x += 300) {
      g.fillRect(x, 250, 16, 70);
      g.fillRect(x + 36, 228, 20, 92);
      g.fillRect(x + 64, 246, 14, 74);
      g.fillRect(x - 6, 242, 92, 12);
      g.beginPath();
      g.moveTo(x + 28, 228);
      g.lineTo(x + 46, 198);
      g.lineTo(x + 64, 228);
      g.fill();
    }
    farLayers[world] = c;
    return c;
  }

  function groundPat(world) {
    if (grounds[world]) return grounds[world];
    var c = document.createElement('canvas');
    c.width = 128; c.height = 64;
    var g = c.getContext('2d');
    var dirt = ['#8a5a32', '#d7e7ee', '#c9844a'][world] || '#8a5a32';
    var grass = ['#3e9a46', '#eef7fb', '#e0a050'][world] || '#3e9a46';
    var spec = ['#6e4424', '#c5d5e0', '#a86a32'][world] || '#6e4424';
    g.fillStyle = dirt;
    g.fillRect(0, 0, 128, 64);
    g.fillStyle = grass;
    g.fillRect(0, 0, 128, 16);
    g.fillStyle = spec;
    [[12, 28, 4], [40, 40, 3], [70, 26, 5], [100, 46, 3], [24, 50, 3], [88, 34, 4]].forEach(function (p) {
      g.beginPath(); g.arc(p[0], p[1], p[2], 0, 6.3); g.fill();
    });
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 2;
    for (var x = 6; x < 128; x += 14) {
      g.beginPath(); g.moveTo(x, 14); g.lineTo(x + 3, 4); g.stroke();
    }
    grounds[world] = c;
    return c;
  }

  function blockSprite(mat, w, h, crack) {
    var key = mat + ':' + w + ':' + h + ':' + crack;
    if (blocks[key]) return blocks[key];
    var c = document.createElement('canvas');
    c.width = Math.ceil(w) + 8; c.height = Math.ceil(h) + 8;
    var g = c.getContext('2d');
    g.translate(4, 4);
    var col = { wood: '#e8a85a', ice: '#c9f4ff', stone: '#cbb89a', soda: '#ff5d6c' }[mat] || '#e8a85a';
    var edge = { wood: '#7a3e16', ice: '#2f86b0', stone: '#5e4c3c', soda: '#9a1830' }[mat] || '#7a3e16';
    g.fillStyle = col;
    g.strokeStyle = edge;
    g.lineWidth = 4;
    roundRect(g, 0, 0, w, h, Math.min(8, h / 3));
    g.fill(); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.28)';
    g.fillRect(4, 3, w - 8, Math.max(3, h * 0.18));
    if (mat === 'wood') {
      g.strokeStyle = 'rgba(120,60,20,0.5)'; g.lineWidth = 2;
      for (var y = 10; y < h - 4; y += 9) { g.beginPath(); g.moveTo(5, y); g.lineTo(w - 5, y + 2); g.stroke(); }
    } else if (mat === 'ice') {
      g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(w * 0.25, h * 0.2); g.lineTo(w * 0.55, h * 0.75); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.7)';
      g.beginPath(); g.ellipse(w * 0.32, h * 0.28, w * 0.16, h * 0.1, -0.5, 0, 6.3); g.fill();
    } else if (mat === 'stone') {
      g.strokeStyle = 'rgba(70,52,36,0.55)'; g.lineWidth = 2;
      g.strokeRect(5, 5, w * 0.42, h * 0.42);
      g.strokeRect(w * 0.5, h * 0.48, w * 0.4, h * 0.4);
    } else if (mat === 'soda') {
      g.fillStyle = '#fff3';
      g.fillRect(w * 0.22, h * 0.22, w * 0.56, h * 0.28);
      g.fillStyle = '#ffe14a';
      g.beginPath(); g.arc(w * 0.35, h * 0.7, 5, 0, 6.3); g.arc(w * 0.62, h * 0.64, 3.5, 0, 6.3); g.fill();
    }
    if (crack) {
      g.strokeStyle = 'rgba(30,16,8,0.9)'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(w * 0.18, h * 0.12); g.lineTo(w * 0.46, h * 0.5); g.lineTo(w * 0.28, h * 0.92); g.stroke();
      if (crack > 1) {
        g.beginPath(); g.moveTo(w * 0.75, h * 0.08); g.lineTo(w * 0.52, h * 0.48); g.lineTo(w * 0.86, h * 0.88); g.stroke();
        g.beginPath(); g.moveTo(w * 0.4, h * 0.2); g.lineTo(w * 0.62, h * 0.7); g.stroke();
      }
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

  function spawn(n, fn) {
    for (var i = 0; i < n; i++) {
      var p = parts[pi]; pi = (pi + 1) % parts.length;
      p.on = 1; fn(p, i);
    }
  }
  function puff(x, y, color, n) {
    spawn(n, function (p) {
      var a = rnd(0, 6.3), s = rnd(40, 220);
      p.x = x; p.y = y; p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s - 60;
      p.life = rnd(0.35, 0.85); p.max = p.life; p.size = rnd(4, 9); p.color = color; p.g = 520; p.kind = 'dust'; p.rot = 0;
    });
  }
  function debris(x, y, mat) {
    var col = { wood: '#c4843a', ice: '#e7fbff', stone: '#a89880', soda: '#ff8a96' }[mat] || '#c4843a';
    spawn(10, function (p) {
      var a = rnd(0, 6.3), s = rnd(80, 320);
      p.x = x; p.y = y; p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s - 140;
      p.life = rnd(0.45, 0.95); p.max = p.life; p.size = rnd(6, 14); p.color = col; p.g = 900; p.kind = 'chip'; p.rot = rnd(0, 6);
    });
    puff(x, y, mat === 'ice' ? '#f4fdff' : '#efe0c4', 12);
  }
  function confetti(x, y) {
    var cols = ['#ff5a7a', '#ffe56a', '#7CFF6B', '#7ad7ff', '#c59bff'];
    spawn(22, function (p, i) {
      var a = rnd(0, 6.3), s = rnd(90, 320);
      p.x = x; p.y = y; p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s - 160;
      p.life = rnd(0.6, 1.1); p.max = p.life; p.size = rnd(5, 10); p.color = cols[i % cols.length]; p.g = 460; p.kind = 'bit'; p.rot = rnd(0, 6);
    });
  }

  function burstFrom(ev) {
    if (!ev) return;
    if (ev.t === 'pop') {
      confetti(ev.x, ev.y);
      spawn(1, function (p) {
        p.x = ev.x; p.y = ev.y - 36; p.vx = 0; p.vy = -28; p.life = 0.7; p.max = 0.7;
        p.size = 0; p.color = '#fff'; p.g = 0; p.kind = 'say'; p.rot = 0;
      });
    }
    else if (ev.t === 'break') debris(ev.x, ev.y, ev.mat);
    else if (ev.t === 'crack') puff(ev.x, ev.y, '#efe6d4', 6);
    else if (ev.t === 'blast') { puff(ev.x, ev.y, '#ffe56a', 18); puff(ev.x, ev.y, '#ff8a3a', 10); }
    else if (ev.t === 'fire') puff(ev.x, ev.y, '#fff', 8);
    else if (ev.t === 'tap') {
      if (ev.ammo === 'marble') puff(ev.x, ev.y, '#d7a6ff', 16);
      else if (ev.ammo === 'bowl') puff(ev.x, ev.y + 10, '#d7d2c8', 14);
      else if (ev.ammo === 'ice') puff(ev.x, ev.y, '#e9fbff', 16);
      else if (ev.ammo === 'ball') puff(ev.x, ev.y, '#fff', 10);
      else puff(ev.x, ev.y, '#ffe56a', 8);
    }
  }

  function stepParts(dt) {
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i]; if (!p.on) continue;
      p.life -= dt; if (p.life <= 0) { p.on = 0; continue; }
      p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += dt * 8;
    }
  }

  function scaredOf(session, b) {
    var bodies = session.world.bodies, i, o, dx, dy;
    for (i = 0; i < bodies.length; i++) {
      o = bodies[i];
      if (!o || o.dead) continue;
      if (o.role !== 'block' && o.role !== 'shot') continue;
      dx = o.x - b.x; dy = o.y - b.y;
      if (dx * dx + dy * dy > 170 * 170) continue;
      if (o.role === 'shot') return true;
      if ((o.user && o.user.crack) || o.vx * o.vx + o.vy * o.vy > 36 * 36 || Math.abs(o.w) > 0.35) return true;
    }
    return false;
  }

  function drawGloopy(g, b, t, hat, scared) {
    var r = (b.r || 18) * 1.42;
    var squash = 1 + Math.sin(t * 6 + b.x * 0.01) * 0.05;
    var stretch = 1 / squash;
    if (Math.abs(b.vy) > 80) { squash = 0.75; stretch = 1.25; }
    if (scared) squash *= 0.9;
    g.save();
    g.translate(b.x, b.y);
    g.scale(stretch, squash);
    g.fillStyle = 'rgba(40, 80, 40, 0.25)';
    g.beginPath(); g.ellipse(0, r * 0.85, r * 0.7, r * 0.22, 0, 0, 6.3); g.fill();
    g.fillStyle = '#8dff78';
    g.beginPath(); g.ellipse(0, 2, r, r * 0.9, 0, 0, 6.3); g.fill();
    g.fillStyle = '#3faf46';
    g.beginPath(); g.ellipse(0, r * 0.42, r * 0.62, r * 0.28, 0, 0, 3.2); g.fill();
    g.fillStyle = '#ff9eb5';
    g.beginPath(); g.ellipse(-r * 0.48, r * 0.15, r * 0.16, r * 0.1, 0, 0, 6.3); g.ellipse(r * 0.48, r * 0.15, r * 0.16, r * 0.1, 0, 0, 6.3); g.fill();
    g.fillStyle = '#fff';
    var ey = scared ? -r * 0.18 : -r * 0.08;
    var er = scared ? r * 0.32 : r * 0.26;
    g.beginPath(); g.arc(-r * 0.32, ey, er, 0, 6.3); g.arc(r * 0.32, ey, er, 0, 6.3); g.fill();
    g.fillStyle = '#1b2430';
    var py = scared ? ey - er * 0.15 : ey + er * 0.1;
    g.beginPath(); g.arc(-r * 0.28, py, scared ? r * 0.1 : r * 0.12, 0, 6.3); g.arc(r * 0.36, py, scared ? r * 0.1 : r * 0.12, 0, 6.3); g.fill();
    g.strokeStyle = '#1b2430'; g.lineWidth = Math.max(2, r * 0.1);
    g.beginPath();
    if (scared) g.arc(0, r * 0.28, r * 0.16, 3.4, 6.1);
    else g.arc(0, r * 0.12, r * 0.22, 0.2, 2.9);
    g.stroke();
    if (scared) {
      g.strokeStyle = '#16324a'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(-r * 0.55, -r * 0.5); g.lineTo(-r * 0.15, -r * 0.36); g.moveTo(r * 0.55, -r * 0.5); g.lineTo(r * 0.15, -r * 0.36); g.stroke();
      g.fillStyle = '#7ad7ff';
      g.beginPath(); g.ellipse(r * 0.72, -r * 0.05, r * 0.1, r * 0.16, 0.4, 0, 6.3); g.fill();
    }
    g.fillStyle = hat || '#ff5a6a';
    g.beginPath(); g.ellipse(0, -r * 0.72, r * 0.95, r * 0.42, 0, 3.15, 6.28); g.fill();
    g.fillRect(-r * 0.95, -r * 0.78, r * 1.9, r * 0.22);
    g.fillStyle = '#ffe56a';
    g.fillRect(-r * 0.12, -r * 1.15, r * 0.24, r * 0.28);
    g.restore();
  }

  function drawAmmo(g, kind, x, y, r, t) {
    g.save();
    g.translate(x, y);
    if (kind === 'bowl') {
      g.fillStyle = '#1c1c1c';
      g.beginPath(); g.arc(0, 0, r, 0, 6.3); g.fill();
      g.fillStyle = '#3a3a3a';
      g.beginPath(); g.arc(-r * 0.28, -r * 0.12, r * 0.16, 0, 6.3); g.arc(r * 0.22, -r * 0.2, r * 0.14, 0, 6.3); g.arc(0, r * 0.28, r * 0.14, 0, 6.3); g.fill();
      g.strokeStyle = '#ff4d4d'; g.lineWidth = 3;
      g.beginPath(); g.arc(0, 0, r * 0.72, 0.4, 1.6); g.stroke();
    } else if (kind === 'ice') {
      g.fillStyle = '#bff3ff';
      g.strokeStyle = '#1d6f96'; g.lineWidth = 3;
      g.beginPath();
      for (var k = 0; k < 6; k++) {
        var a = -Math.PI / 2 + k * Math.PI / 3;
        var px = Math.cos(a) * r, py = Math.sin(a) * r;
        if (k === 0) g.moveTo(px, py); else g.lineTo(px, py);
      }
      g.closePath(); g.fill(); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.8)';
      g.beginPath(); g.moveTo(0, -r * 0.7); g.lineTo(r * 0.2, 0); g.lineTo(0, r * 0.15); g.fill();
    } else if (kind === 'boom') {
      g.fillStyle = '#ff9a1f';
      g.beginPath(); g.arc(0, 0, r, 0, 6.3); g.fill();
      g.fillStyle = '#ff4d4d';
      g.beginPath(); g.arc(-r * 0.2, r * 0.05, r * 0.45, 0, 6.3); g.fill();
      g.strokeStyle = '#5a3312'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(r * 0.2, -r * 0.55); g.quadraticCurveTo(r * 0.8, -r * 0.9, r * 0.55, -r * 1.15); g.stroke();
      var spark = 0.5 + 0.5 * Math.sin((t || 0) * 18);
      g.fillStyle = spark > 0.5 ? '#fff6b0' : '#ff4d4d';
      g.beginPath(); g.arc(r * 0.55, -r * 1.15, 4 + spark * 2, 0, 6.3); g.fill();
    } else if (kind === 'marble') {
      g.fillStyle = '#b06bff';
      g.beginPath(); g.arc(0, 0, r, 0, 6.3); g.fill();
      g.fillStyle = '#7a3fd0';
      g.beginPath(); g.arc(-r * 0.55, -r * 0.15, r * 0.38, 0, 6.3); g.arc(r * 0.5, r * 0.1, r * 0.34, 0, 6.3); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.7)';
      g.beginPath(); g.arc(-r * 0.3, -r * 0.35, r * 0.18, 0, 6.3); g.fill();
    } else {
      g.fillStyle = '#ff4d4d';
      g.beginPath(); g.arc(0, 0, r, 0, 6.3); g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 3;
      g.beginPath(); g.arc(0, 0, r * 0.55, -0.4, 2.2); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.75)';
      g.beginPath(); g.arc(-r * 0.32, -r * 0.32, r * 0.28, 0, 6.3); g.fill();
    }
    g.restore();
  }

  function drawSling(g, session, drag, fork) {
    var s = session.sling, dir = session.dir || 1;
    var x = s.x, y = s.y;
    var left = { x: x - 34 * dir, y: y - 86 };
    var right = { x: x + 34 * dir, y: y - 86 };
    var cup = drag ? drag : { x: x - 12 * dir, y: y + 8 };
    var stretch = Math.hypot(cup.x - x, cup.y - y);
    g.lineCap = 'round';
    g.strokeStyle = '#4a2a12'; g.lineWidth = 18;
    g.beginPath(); g.moveTo(x, y - 8); g.lineTo(x, GROUND + 8); g.stroke();
    g.strokeStyle = fork || '#8a4b22'; g.lineWidth = 14;
    g.beginPath(); g.moveTo(left.x, left.y); g.lineTo(x, y - 6); g.lineTo(right.x, right.y); g.stroke();
    g.fillStyle = fork || '#8a4b22';
    g.beginPath(); g.arc(left.x, left.y, 8, 0, 6.3); g.arc(right.x, right.y, 8, 0, 6.3); g.fill();
    g.strokeStyle = stretch > 40 ? '#ff5a6a' : '#c4374a';
    g.lineWidth = clamp(9 - stretch / 34, 3, 9);
    g.beginPath(); g.moveTo(left.x, left.y); g.lineTo(cup.x - 8 * dir, cup.y); g.stroke();
    g.beginPath(); g.moveTo(right.x, right.y); g.lineTo(cup.x + 8 * dir, cup.y); g.stroke();
    g.fillStyle = '#6b3a22';
    g.beginPath(); g.ellipse(cup.x, cup.y + 8, 18, 11, 0, 0, 6.3); g.fill();
    g.strokeStyle = '#3a2012'; g.lineWidth = 3;
    g.beginPath(); g.ellipse(cup.x, cup.y + 8, 18, 11, 0, 0, 6.3); g.stroke();
    if (!session.shots.length && session.phase === 'aim') {
      var ammo = (root.CC && root.CC.AMMO[session.ammo]) || { r: 16 };
      drawAmmo(g, session.ammo, cup.x, cup.y, (ammo.r || 14) * 1.05, session.time || 0);
    }
  }

  function noteTrails(session) {
    var i, b, t, last;
    for (i = 0; i < trails.length; i++) trails[i].live = 0;
    for (i = 0; i < session.shots.length; i++) {
      b = session.shots[i];
      t = null;
      for (var k = 0; k < trails.length; k++) if (trails[k].b === b) t = trails[k];
      if (!t) { t = { b: b, pts: [], live: 1, ammo: b.user.ammo }; trails.push(t); }
      t.live = 1;
      last = t.pts[t.pts.length - 1];
      if (!last || (last.x - b.x) * (last.x - b.x) + (last.y - b.y) * (last.y - b.y) > 40) {
        t.pts.push({ x: b.x, y: b.y });
        if (t.pts.length > 12) t.pts.shift();
      }
    }
    for (i = trails.length - 1; i >= 0; i--) if (!trails[i].live) trails.splice(i, 1);
  }

  function drawTrails(ctx) {
    var cols = { ball: '#ff8d8d', marble: '#d2a6ff', bowl: '#888', boom: '#ffd23a', ice: '#b7f3ff' };
    for (var i = 0; i < trails.length; i++) {
      var t = trails[i], pts = t.pts;
      for (var k = 0; k < pts.length; k++) {
        ctx.globalAlpha = (k + 1) / pts.length * 0.8;
        ctx.fillStyle = cols[t.ammo] || '#fff';
        ctx.beginPath();
        ctx.arc(pts[k].x, pts[k].y, 3 + k * 0.35, 0, 6.3);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function fortFocus(session) {
    var bodies = session.world.bodies, i, b, sx = 0, sy = 0, n = 0, side;
    for (i = 0; i < bodies.length; i++) {
      b = bodies[i];
      if (!b || b.dead || b.role !== 'block') continue;
      if (session.mode === 'duel') {
        side = session.phase === 'fly' ? (session.side === 0 ? 1 : 0) : session.side;
        if (b.user && b.user.side !== side && session.phase !== 'aim') continue;
      } else if (b.user && b.user.fort !== session.fort) continue;
      sx += b.x; sy += b.y; n++;
    }
    if (!n) return { x: session.mode === 'duel' ? 640 : 660, y: 480 };
    return { x: sx / n, y: sy / n };
  }

  function desired(session) {
    var focus = fortFocus(session);
    if (session.mode === 'duel') {
      var x = 640, y = 500, z = 1.32;
      if (session.phase === 'fly' && session.shots.length) {
        var s = session.shots[0];
        x = 640 * 0.75 + s.x * 0.25;
        y = clamp(500 * 0.8 + s.y * 0.2, 450, 560);
        z = 1.36;
      }
      return { x: x, y: y, z: z };
    }
    var sling = session.sling;
    var follow = session.phase === 'fly' && session.shots.length;
    var settle = !follow && session.phase !== 'aim';
    if (follow) {
      var b = session.shots[session.shots.length - 1];
      return {
        x: b.x * 0.7 + focus.x * 0.3,
        y: clamp(b.y * 0.4 + 500 * 0.6, 430, 560),
        z: 2.08
      };
    }
    if (settle) return { x: focus.x, y: 478, z: 2.22 };
    var span = Math.max(420, (focus.x + 170) - (sling.x - 40));
    var zAim = clamp((W - 60) / span, 1.78, 2.02);
    return {
      x: (sling.x + focus.x) * 0.5 + 55,
      y: GROUND - 280 / zAim,
      z: Math.min(zAim, 1.86)
    };
  }

  function stepCam(session, dt) {
    if (!session) return;
    var t = desired(session);
    var k = 1 - Math.exp(-2.8 * Math.max(0.016, dt));
    cam.x += (t.x - cam.x) * k;
    cam.y += (t.y - cam.y) * k;
    cam.z += (t.z - cam.z) * k;
  }
  function snap(session) {
    if (!session) return;
    var t = desired(session);
    cam.x = t.x; cam.y = t.y; cam.z = t.z;
  }
  function toWorld(sx, sy) {
    return { x: (sx - W / 2) / cam.z + cam.x, y: (sy - H / 2) / cam.z + cam.y };
  }
  function toScreen(wx, wy) {
    return { x: (wx - cam.x) * cam.z + W / 2, y: (wy - cam.y) * cam.z + H / 2 };
  }

  function drawPad(ctx, b) {
    var top = b.y - b.hh;
    ctx.fillStyle = '#6d4a2c';
    ctx.beginPath();
    ctx.moveTo(b.x - b.hw - 24, b.y + b.hh);
    ctx.quadraticCurveTo(b.x - b.hw - 8, top + 16, b.x - b.hw + 36, top);
    ctx.lineTo(b.x + b.hw - 36, top);
    ctx.quadraticCurveTo(b.x + b.hw + 8, top + 16, b.x + b.hw + 24, b.y + b.hh);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#46a24c';
    ctx.fillRect(b.x - b.hw + 36, top, b.hw * 2 - 72, 12);
  }

  function draw(ctx, session, opts) {
    opts = opts || {};
    var world = (session.level && session.level.world) || 1;
    if (session.mode === 'duel') world = 1;
    var wi = world - 1;
    ctx.drawImage(sky(wi), 0, 0);
    var far = farLayer(wi);
    var shift = cam.x * 0.18;
    var fx = -((shift % 1800) + 1800) % 1800;
    ctx.drawImage(far, fx, 36);
    if (fx + 1800 < W) ctx.drawImage(far, fx + 1800, 36);
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(cam.z, cam.z);
    ctx.translate(-cam.x, -cam.y);
    if (!pats[wi]) pats[wi] = ctx.createPattern(groundPat(wi), 'repeat');
    var pat = pats[wi];
    ctx.fillStyle = ['#6b4428', '#b7c9d4', '#a8683a'][wi] || '#6b4428';
    ctx.fillRect(-600, GROUND, 2600, 220);
    if (pat) { ctx.fillStyle = pat; ctx.fillRect(-600, GROUND, 2600, 70); }
    if (session.mode === 'duel') {
      ctx.fillStyle = 'rgba(90, 140, 70, 0.35)';
      ctx.beginPath();
      ctx.moveTo(380, GROUND);
      ctx.quadraticCurveTo(640, GROUND - 70, 900, GROUND);
      ctx.fill();
    }
    noteTrails(session);
    var bodies = session.world.bodies, i, b;
    for (i = 0; i < bodies.length; i++) {
      b = bodies[i];
      if (!b || b.role === 'ground' || b.dead) continue;
      if (b.role === 'pad') drawPad(ctx, b);
    }
    drawTrails(ctx);
    for (i = 0; i < bodies.length; i++) {
      b = bodies[i];
      if (!b || b.role === 'ground' || b.role === 'pad' || b.dead) continue;
      if (b.role === 'block') {
        var spr = blockSprite(b.mat, b.user.w || b.hw * 2 || 48, b.user.h || b.hh * 2 || 46, b.user.crack || 0);
        ctx.save();
        ctx.translate(b.x, b.y); ctx.rotate(b.a);
        ctx.drawImage(spr, -spr.width / 2, -spr.height / 2);
        ctx.restore();
      } else if (b.role === 'gloopy') drawGloopy(ctx, b, session.time || 0, opts.hat, scaredOf(session, b));
      else if (b.role === 'shot') drawAmmo(ctx, b.user.ammo, b.x, b.y, b.r, session.time || 0);
    }
    drawSling(ctx, session, opts.drag, opts.fork);
    if (opts.dots && session.phase === 'aim') {
      ctx.fillStyle = 'rgba(20,30,40,0.6)';
      for (i = 0; i < opts.dots.length; i += 2) {
        if ((i / 2) % 3) continue;
        ctx.beginPath(); ctx.arc(opts.dots[i], opts.dots[i + 1], 4.2, 0, 6.3); ctx.fill();
      }
    }
    for (i = 0; i < parts.length; i++) {
      var p = parts[i]; if (!p.on) continue;
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      if (p.kind === 'say') {
        ctx.direction = 'rtl'; ctx.textAlign = 'center'; ctx.font = '700 22px Fredoka';
        ctx.lineWidth = 4; ctx.strokeStyle = '#16324a'; ctx.strokeText('واااه!', p.x, p.y); ctx.fillText('واااه!', p.x, p.y);
      } else if (p.kind === 'bit' || p.kind === 'chip') {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot || 0);
        ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.6); ctx.restore();
      } else {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 6.3); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    if (session.mode === 'duel') {
      var wx = 640 + session.wind * 1.1;
      ctx.strokeStyle = '#16324a'; ctx.fillStyle = '#fff'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(560, 78); ctx.lineTo(wx, 78); ctx.stroke();
      var sgn = session.wind >= 0 ? 1 : -1;
      ctx.beginPath(); ctx.moveTo(wx, 78); ctx.lineTo(wx - sgn * 14, 68); ctx.lineTo(wx - sgn * 14, 88); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    if (opts.combo > 1) {
      ctx.direction = 'rtl'; ctx.textAlign = 'center'; ctx.font = '700 54px Fredoka';
      ctx.lineWidth = 8; ctx.strokeStyle = '#16324a'; ctx.fillStyle = '#ffe56a';
      var label = opts.combo > 2 ? 'انهيار ×' + opts.combo : 'ضربة مزدوجة!';
      ctx.strokeText(label, 640, 150);
      ctx.fillText(label, 640, 150);
    }
  }

  function reset() {
    trails.length = 0;
    for (var i = 0; i < parts.length; i++) parts[i].on = 0;
  }

  root.CCR = {
    draw: draw, sky: sky, stepParts: stepParts, burstFrom: burstFrom, puff: puff,
    stepCam: stepCam, snap: snap, toWorld: toWorld, toScreen: toScreen, reset: reset,
    W: W, H: H, GROUND: GROUND
  };
})(typeof window !== 'undefined' ? window : globalThis);
