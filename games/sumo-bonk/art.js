/* Sumo Bonk — all art is drawn in code here (sumos, hats, stages, sky, water). */
(function () {
  'use strict';

  var OUT = '#2b1d3a';
  var TAU = Math.PI * 2;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rgb(h) {
    h = h.replace('#', '');
    return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)];
  }
  function shade(h, a) {
    var c = rgb(h);
    for (var i = 0; i < 3; i++) {
      c[i] = a < 0 ? c[i] * (1 + a) : c[i] + (255 - c[i]) * a;
      c[i] = Math.round(clamp(c[i], 0, 255));
    }
    return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
  }
  function ell(ctx, x, y, rx, ry, rot) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot || 0, 0, TAU); }
  function circ(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, Math.max(0.1, r), 0, TAU); }
  function rrect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function fs(ctx, fill, stroke, lw) {
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 4; ctx.stroke(); }
  }
  function line(ctx, x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }

  var STAR = (function () {
    var p = new Path2D();
    for (var i = 0; i < 10; i++) {
      var a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.45 : 1;
      if (i === 0) p.moveTo(Math.cos(a) * r, Math.sin(a) * r); else p.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    p.closePath();
    return p;
  })();
  function star(ctx, x, y, r, rot, fill, stroke, lw) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot || 0); ctx.scale(r, r);
    if (fill) { ctx.fillStyle = fill; ctx.fill(STAR); }
    if (stroke) { ctx.lineWidth = (lw || 3) / r; ctx.strokeStyle = stroke; ctx.lineJoin = 'round'; ctx.stroke(STAR); }
    ctx.restore();
  }

  /* ------------------------------------------------------------ roster */
  var SUMOS = [
    { name: 'Momo', body: '#ff8fb1', belt: '#d61f5a', band: '#ffffff', face: 'blush' },
    { name: 'Splash', body: '#5fc4ff', belt: '#1c47a8', band: '#ffd23f', face: 'teeth' },
    { name: 'Wasabi', body: '#8be066', belt: '#17703a', band: '#ff5a5f', face: 'stache' },
    { name: 'Tango', body: '#ffa047', belt: '#6a2db0', band: '#ffffff', face: 'grin' },
    { name: 'Plum', body: '#b98aff', belt: '#ffc400', band: '#ff5fae', face: 'sleepy' },
    { name: 'Butter', body: '#ffdf5e', belt: '#2a62d6', band: '#ff5a5f', face: 'freckles' },
    { name: 'Minty', body: '#52dcc2', belt: '#ff4f9a', band: '#ffffff', face: 'lashes' },
    { name: 'Chili', body: '#ff5b4f', belt: '#35244a', band: '#ffd23f', face: 'brows' }
  ];
  SUMOS.forEach(function (s) {
    s.light = shade(s.body, 0.5); s.mid = shade(s.body, 0.22); s.dark = shade(s.body, -0.22);
    s.beltDark = shade(s.belt, -0.35); s.beltLight = shade(s.belt, 0.3); s.bandDark = shade(s.band, -0.25);
  });

  // stars: needed star count. special: unlocked by an achievement instead.
  var HATS = [
    { id: 'none', name: 'No Hat', stars: 0 },
    { id: 'party', name: 'Party Cone', stars: 0 },
    { id: 'propeller', name: 'Propeller Cap', stars: 5 },
    { id: 'tophat', name: 'Top Hat', stars: 12 },
    { id: 'chef', name: 'Chef Hat', stars: 20 },
    { id: 'flower', name: 'Flower', stars: 28 },
    { id: 'cowboy', name: 'Cowboy Hat', stars: 38 },
    { id: 'viking', name: 'Viking Horns', stars: 48 },
    { id: 'cone', name: 'Traffic Cone', stars: 60 },
    { id: 'bunny', name: 'Bunny Ears', stars: 72 },
    { id: 'wizard', name: 'Wizard Hat', stars: 86 },
    { id: 'pineapple', name: 'Pineapple', stars: 100 },
    { id: 'cake', name: 'Birthday Cake', stars: 116 },
    { id: 'duck', name: 'Rubber Duck', stars: 132 },
    { id: 'pirate', name: 'Pirate Hat', stars: 150 },
    { id: 'crown', name: 'Gold Crown', special: 'crown', how: 'Beat the HARD CPU' },
    { id: 'halo', name: 'Halo', special: 'halo', how: 'Win a match 5 - 0' }
  ];
  var KEEP_BUN = { none: 1, flower: 1, bunny: 1, halo: 1 };

  /* -------------------------------------------------------------- hats */
  // Origin = top-centre of the head, facing right.
  function drawHat(ctx, id, T) {
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    switch (id) {
      case 'party': {
        ctx.beginPath(); ctx.moveTo(-17, 6); ctx.lineTo(19, 6); ctx.lineTo(4, -50); ctx.closePath();
        fs(ctx, '#ff4fa3', OUT, 4);
        ctx.save(); ctx.clip();
        ctx.fillStyle = '#ffe14a';
        for (var i = 0; i < 4; i++) { circ(ctx, -6 + i * 7, -2 - i * 12, 4); ctx.fill(); circ(ctx, 8 - i * 3, -8 - i * 11, 3); ctx.fill(); }
        ctx.restore();
        ctx.beginPath(); ctx.moveTo(-17, 6); ctx.lineTo(19, 6); ctx.lineTo(4, -50); ctx.closePath(); fs(ctx, null, OUT, 4);
        var b = Math.sin(T * 9) * 2;
        circ(ctx, 4 + b, -54, 8); fs(ctx, '#7de3ff', OUT, 3.5);
        break;
      }
      case 'propeller': {
        ctx.beginPath(); ctx.arc(0, 8, 27, Math.PI, 0); ctx.closePath();
        var cols = ['#ff5a5f', '#ffd23f', '#4aa8ff', '#5fdc7a'];
        ctx.save(); ctx.clip();
        for (var k = 0; k < 4; k++) { ctx.fillStyle = cols[k]; ctx.beginPath(); ctx.moveTo(0, 8); ctx.arc(0, 8, 30, Math.PI + k * Math.PI / 4, Math.PI + (k + 1) * Math.PI / 4); ctx.closePath(); ctx.fill(); }
        ctx.restore();
        ctx.beginPath(); ctx.arc(0, 8, 27, Math.PI, 0); ctx.closePath(); fs(ctx, null, OUT, 4);
        ctx.fillStyle = '#ffd23f'; rrect(ctx, 20, 2, 18, 7, 3); fs(ctx, '#ffd23f', OUT, 3);
        ctx.strokeStyle = OUT; ctx.lineWidth = 4; line(ctx, 0, -18, 0, -30);
        var sp = Math.cos(T * 26);
        ell(ctx, -15 * sp, -31, 15 * Math.abs(sp) + 2, 4.5); fs(ctx, '#ff5a5f', OUT, 3);
        ell(ctx, 15 * sp, -31, 15 * Math.abs(sp) + 2, 4.5); fs(ctx, '#4aa8ff', OUT, 3);
        circ(ctx, 0, -31, 4); fs(ctx, '#ffd23f', OUT, 3);
        break;
      }
      case 'tophat': {
        ell(ctx, 0, 4, 33, 7); fs(ctx, '#2a2438', OUT, 4);
        rrect(ctx, -20, -46, 40, 50, 5); fs(ctx, '#2a2438', OUT, 4);
        ctx.fillStyle = '#ff4f6d'; ctx.fillRect(-18, -8, 36, 9);
        ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(-14, -42, 7, 30);
        break;
      }
      case 'chef': {
        circ(ctx, -15, -20, 15); fs(ctx, '#ffffff', OUT, 4);
        circ(ctx, 15, -20, 15); fs(ctx, '#ffffff', OUT, 4);
        circ(ctx, 0, -32, 18); fs(ctx, '#ffffff', OUT, 4);
        ctx.fillStyle = '#fff'; ctx.fillRect(-20, -22, 40, 16);
        rrect(ctx, -22, -10, 44, 16, 4); fs(ctx, '#f4f1ea', OUT, 4);
        ctx.strokeStyle = '#d9d2c3'; ctx.lineWidth = 2; line(ctx, -8, -8, -8, 4); line(ctx, 6, -8, 6, 4);
        break;
      }
      case 'flower': {
        ctx.save(); ctx.translate(14, -2); ctx.rotate(Math.sin(T * 3) * 0.15);
        ell(ctx, -12, 4, 10, 5, -0.5); fs(ctx, '#4fcf6a', OUT, 3);
        for (var q = 0; q < 6; q++) {
          ctx.save(); ctx.rotate(q * TAU / 6); ell(ctx, 0, -12, 7, 11); fs(ctx, q % 2 ? '#ffffff' : '#ffc2e0', OUT, 3); ctx.restore();
        }
        circ(ctx, 0, 0, 7.5); fs(ctx, '#ffd23f', OUT, 3);
        ctx.restore();
        break;
      }
      case 'cowboy': {
        ctx.beginPath(); ctx.moveTo(-46, -4); ctx.quadraticCurveTo(0, 18, 46, -4); ctx.quadraticCurveTo(40, 8, 0, 10); ctx.quadraticCurveTo(-40, 8, -46, -4); ctx.closePath();
        fs(ctx, '#b86b32', OUT, 4);
        ctx.beginPath(); ctx.moveTo(-22, 4); ctx.lineTo(-19, -30); ctx.quadraticCurveTo(-9, -40, 0, -30); ctx.quadraticCurveTo(9, -40, 19, -30); ctx.lineTo(22, 4); ctx.closePath();
        fs(ctx, '#c97a3c', OUT, 4);
        ctx.fillStyle = '#6a3514'; ctx.fillRect(-21, -6, 42, 7);
        star(ctx, 0, -2, 5, 0, '#ffd23f', null);
        break;
      }
      case 'viking': {
        ctx.save();
        [-1, 1].forEach(function (s) {
          ctx.beginPath(); ctx.moveTo(s * 20, -6); ctx.quadraticCurveTo(s * 46, -8, s * 44, -44); ctx.quadraticCurveTo(s * 36, -18, s * 16, -18); ctx.closePath();
          fs(ctx, '#fff4d6', OUT, 4);
        });
        ctx.restore();
        ctx.beginPath(); ctx.arc(0, 8, 28, Math.PI, 0); ctx.closePath(); fs(ctx, '#aab4c8', OUT, 4);
        ctx.fillStyle = 'rgba(255,255,255,0.35)'; ell(ctx, -10, -8, 6, 10, 0.4); ctx.fill();
        rrect(ctx, -30, 0, 60, 10, 4); fs(ctx, '#e0a93a', OUT, 3.5);
        ctx.fillStyle = OUT; for (var r = -20; r <= 20; r += 10) { circ(ctx, r, 5, 1.8); ctx.fill(); }
        break;
      }
      case 'cone': {
        rrect(ctx, -26, -2, 52, 10, 3); fs(ctx, '#ff7a1a', OUT, 4);
        ctx.beginPath(); ctx.moveTo(-18, 0); ctx.lineTo(18, 0); ctx.lineTo(5, -52); ctx.lineTo(-5, -52); ctx.closePath();
        fs(ctx, '#ff7a1a', null);
        ctx.save(); ctx.clip(); ctx.fillStyle = '#ffffff'; ctx.fillRect(-30, -20, 60, 8); ctx.fillRect(-30, -38, 60, 7); ctx.restore();
        ctx.beginPath(); ctx.moveTo(-18, 0); ctx.lineTo(18, 0); ctx.lineTo(5, -52); ctx.lineTo(-5, -52); ctx.closePath(); fs(ctx, null, OUT, 4);
        break;
      }
      case 'bunny': {
        var fl = Math.sin(T * 4) * 0.12;
        [[-10, -0.25 + fl], [12, 0.3 - fl]].forEach(function (e) {
          ctx.save(); ctx.translate(e[0], 6); ctx.rotate(e[1]);
          ell(ctx, 0, -30, 10, 30); fs(ctx, '#ffffff', OUT, 4);
          ell(ctx, 0, -28, 5, 22); ctx.fillStyle = '#ffb3cf'; ctx.fill();
          ctx.restore();
        });
        break;
      }
      case 'wizard': {
        ell(ctx, 0, 4, 38, 8); fs(ctx, '#5b3fd6', OUT, 4);
        ctx.beginPath(); ctx.moveTo(-22, 4); ctx.lineTo(22, 4); ctx.quadraticCurveTo(10, -30, 20 + Math.sin(T * 3) * 3, -64); ctx.quadraticCurveTo(-4, -40, -22, 4); ctx.closePath();
        fs(ctx, '#6d4cf0', OUT, 4);
        star(ctx, -2, -16, 7, 0.2, '#ffe14a', null);
        star(ctx, 9, -38, 5, -0.3, '#ffe14a', null);
        circ(ctx, 20 + Math.sin(T * 3) * 3, -65, 5); fs(ctx, '#ffe14a', OUT, 3);
        break;
      }
      case 'pineapple': {
        for (var lf = -2; lf <= 2; lf++) {
          ctx.save(); ctx.translate(0, -34); ctx.rotate(lf * 0.38);
          ctx.beginPath(); ctx.moveTo(-6, 4); ctx.lineTo(0, -26 + Math.abs(lf) * 5); ctx.lineTo(6, 4); ctx.closePath();
          fs(ctx, lf % 2 ? '#3fae4a' : '#5fd068', OUT, 3);
          ctx.restore();
        }
        ell(ctx, 0, -14, 21, 25); fs(ctx, '#ffc93a', OUT, 4);
        ctx.save(); ell(ctx, 0, -14, 21, 25); ctx.clip();
        ctx.strokeStyle = '#d9912a'; ctx.lineWidth = 2.5;
        for (var d = -40; d < 40; d += 11) { line(ctx, d, -40, d + 30, 12); line(ctx, d + 30, -40, d, 12); }
        ctx.restore();
        break;
      }
      case 'cake': {
        rrect(ctx, -24, -26, 48, 32, 6); fs(ctx, '#ffe3b0', OUT, 4);
        ctx.beginPath(); ctx.moveTo(-24, -12);
        for (var cx = -24; cx <= 24; cx += 8) ctx.quadraticCurveTo(cx + 4, -4 + ((cx / 8) % 2 ? 4 : 0), cx + 8, -12);
        ctx.lineTo(24, -26); ctx.lineTo(-24, -26); ctx.closePath(); fs(ctx, '#ff8fc8', null);
        rrect(ctx, -24, -26, 48, 32, 6); fs(ctx, null, OUT, 4);
        ctx.fillStyle = '#fff'; for (var sp2 = -16; sp2 <= 16; sp2 += 8) { ctx.fillRect(sp2, -22, 3, 3); }
        rrect(ctx, -3, -48, 7, 22, 2); fs(ctx, '#7ad7ff', OUT, 2.5);
        var fk = 1 + Math.sin(T * 20) * 0.15;
        ell(ctx, 0.5, -56, 5 * fk, 8 * fk); fs(ctx, '#ffb830', '#ff6a1a', 2);
        break;
      }
      case 'duck': {
        ell(ctx, -2, -12, 25, 16); fs(ctx, '#ffdd33', OUT, 4);
        ctx.beginPath(); ctx.moveTo(-26, -14); ctx.lineTo(-36, -22); ctx.lineTo(-24, -24); ctx.closePath(); fs(ctx, '#ffdd33', OUT, 3.5);
        circ(ctx, 12, -32, 14); fs(ctx, '#ffdd33', OUT, 4);
        ctx.beginPath(); ctx.moveTo(22, -32); ctx.quadraticCurveTo(36, -30, 34, -24); ctx.quadraticCurveTo(26, -22, 22, -26); ctx.closePath(); fs(ctx, '#ff8a1a', OUT, 3);
        circ(ctx, 15, -36, 3); ctx.fillStyle = OUT; ctx.fill();
        ell(ctx, -6, -12, 11, 6, -0.2); fs(ctx, '#ffc800', null);
        break;
      }
      case 'pirate': {
        ctx.beginPath(); ctx.moveTo(-40, 2); ctx.quadraticCurveTo(-30, -44, 0, -40); ctx.quadraticCurveTo(30, -44, 40, 2); ctx.quadraticCurveTo(0, -8, -40, 2); ctx.closePath();
        fs(ctx, '#2a2438', OUT, 4);
        ctx.strokeStyle = '#e0a93a'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(-34, -4); ctx.quadraticCurveTo(0, -14, 34, -4); ctx.stroke();
        circ(ctx, 2, -22, 8); fs(ctx, '#ffd23f', OUT, 3);
        star(ctx, 2, -22, 5, 0, '#fff4c0', null);
        break;
      }
      case 'crown': {
        ctx.beginPath(); ctx.moveTo(-24, 4); ctx.lineTo(-26, -26); ctx.lineTo(-13, -12); ctx.lineTo(0, -34); ctx.lineTo(13, -12); ctx.lineTo(26, -26); ctx.lineTo(24, 4); ctx.closePath();
        fs(ctx, '#ffcf2e', OUT, 4);
        ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(-18, -6, 5, 8);
        circ(ctx, 0, -6, 5); fs(ctx, '#ff4f6d', OUT, 2.5);
        circ(ctx, -14, -2, 3.5); fs(ctx, '#4ab0ff', OUT, 2);
        circ(ctx, 14, -2, 3.5); fs(ctx, '#5fdc7a', OUT, 2);
        [-26, 0, 26].forEach(function (x, i) { circ(ctx, x, i === 1 ? -36 : -28, 3.5); fs(ctx, '#fff', OUT, 2); });
        var tw = (Math.sin(T * 5) + 1) / 2;
        star(ctx, 20, -40, 4 + tw * 4, T, 'rgba(255,255,255,' + (0.4 + tw * 0.6) + ')', null);
        break;
      }
      case 'halo': {
        var hb = Math.sin(T * 3) * 3;
        ctx.save(); ctx.translate(0, -18 + hb);
        ctx.shadowColor = '#fff38a'; ctx.shadowBlur = 14;
        ell(ctx, 0, 0, 26, 7); ctx.strokeStyle = '#ffe14a'; ctx.lineWidth = 7; ctx.stroke();
        ctx.shadowBlur = 0;
        ell(ctx, 0, 0, 26, 7); ctx.strokeStyle = '#fff8c4'; ctx.lineWidth = 2.5; ctx.stroke();
        ctx.restore();
        break;
      }
    }
  }

  /* ------------------------------------------------------------- sumo */
  // Local space (facing right): body centre at 0,0, feet at y≈50.
  var HEAD_X = 10, HEAD_Y = -62, HEAD_R = 31;

  function drawArm(ctx, sx, sy, a, S) {
    var len = 27, ex = sx + Math.sin(a) * len, ey = sy + Math.cos(a) * len;
    ctx.lineCap = 'round';
    ctx.strokeStyle = OUT; ctx.lineWidth = 26; line(ctx, sx, sy, ex, ey);
    ctx.strokeStyle = S.body; ctx.lineWidth = 19; line(ctx, sx, sy, ex, ey);
    circ(ctx, ex + Math.sin(a) * 3, ey + Math.cos(a) * 3, 11.5); fs(ctx, S.mid, OUT, 3.5);
  }

  function legPositions(p, T) {
    var m = p.legMode || 'stand', ph = (p.legPh || 0);
    switch (m) {
      case 'run': return [-24 + Math.sin(ph) * 15, 44 - Math.max(0, Math.cos(ph)) * 11, 26 - Math.sin(ph) * 15, 44 - Math.max(0, -Math.cos(ph)) * 11];
      case 'air': return [-22 + Math.sin(T * 12) * 4, 38, 24 - Math.sin(T * 12) * 4, 36];
      case 'dive': return [-38, 30, -30, 40];
      case 'teeter': return [-26, 44, 34 + Math.sin(T * 14) * 6, 30 + Math.cos(T * 14) * 5];
      case 'stomp': { var s = Math.sin(T * 5); return [-30, 44 - Math.max(0, -s) * 26, 30, 44 - Math.max(0, s) * 26]; }
      case 'float': return [-24, 44, 26, 44];
      default: return [-30, 44, 30, 44];
    }
  }

  function drawEyes(ctx, p, S, hx, hy, T) {
    var mood = p.mood || 'idle';
    var e1x = hx + 3, e2x = hx + 20, ey = hy - 1;
    ctx.lineCap = 'round';
    if (mood === 'dizzy') {
      ctx.strokeStyle = OUT; ctx.lineWidth = 3;
      [e1x, e2x].forEach(function (x, i) {
        ctx.beginPath();
        for (var k = 0; k < 18; k++) { var a = k * 0.7 + T * 10 * (i ? 1 : -1), r = k * 0.45; if (k === 0) ctx.moveTo(x + Math.cos(a) * r, ey + Math.sin(a) * r); else ctx.lineTo(x + Math.cos(a) * r, ey + Math.sin(a) * r); }
        ctx.stroke();
      });
      return;
    }
    if (mood === 'hurt') {
      ctx.strokeStyle = OUT; ctx.lineWidth = 3.5;
      [e1x, e2x].forEach(function (x) { line(ctx, x - 5, ey - 5, x + 5, ey + 5); line(ctx, x + 5, ey - 5, x - 5, ey + 5); });
      return;
    }
    if (mood === 'win' || mood === 'happy') {
      ctx.strokeStyle = OUT; ctx.lineWidth = 3.5;
      [e1x, e2x].forEach(function (x) { ctx.beginPath(); ctx.arc(x, ey + 3, 6, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); });
      return;
    }
    var big = mood === 'scared' ? 1.25 : 1;
    var pr = mood === 'scared' ? 2.4 : mood === 'angry' ? 3 : 3.7;
    var lx = (p.lookX || 0) * 2.4 + 1.2, ly = (p.lookY || 0) * 2.4;
    var blink = p.blink > 0 && mood !== 'scared';
    [e1x, e2x].forEach(function (x, i) {
      var y = ey - i;
      if (blink) { ctx.strokeStyle = OUT; ctx.lineWidth = 3; line(ctx, x - 6, y + 1, x + 6, y + 1); return; }
      ell(ctx, x, y, 6.6 * big, 8.2 * big); fs(ctx, '#fff', OUT, 2.6);
      circ(ctx, x + lx, y + ly + 1, pr); ctx.fillStyle = OUT; ctx.fill();
      circ(ctx, x + lx + 1.2, y + ly - 0.6, 1.1); ctx.fillStyle = '#fff'; ctx.fill();
      if (S.face === 'sleepy' && mood === 'idle') {
        ctx.save(); ell(ctx, x, y, 6.6, 8.2); ctx.clip(); ctx.fillStyle = S.body; ctx.fillRect(x - 8, y - 10, 16, 8.5); ctx.restore();
        ctx.strokeStyle = OUT; ctx.lineWidth = 2.6; line(ctx, x - 6.5, y - 1.5, x + 6.5, y - 1.5);
      }
      if (S.face === 'lashes') { ctx.strokeStyle = OUT; ctx.lineWidth = 2; line(ctx, x + 4, y - 7, x + 7, y - 11); line(ctx, x, y - 8, x + 1, y - 12); }
    });
    // brows
    var thick = S.face === 'brows' ? 6 : 3.6;
    var ang = mood === 'angry' ? 0.45 : mood === 'scared' ? -0.35 : 0.05;
    ctx.strokeStyle = OUT; ctx.lineWidth = thick;
    [[e1x, -1], [e2x, 1]].forEach(function (b) {
      var x = b[0], s = b[1], yy = ey - 12 * big - (mood === 'scared' ? 3 : 0);
      var da = ang * s;
      line(ctx, x - 6 * Math.cos(da), yy - 6 * Math.sin(da), x + 6 * Math.cos(da), yy + 6 * Math.sin(da));
    });
  }

  function drawMouth(ctx, p, S, hx, hy, T) {
    var mood = p.mood || 'idle';
    var mx = hx + 12, my = hy + 15;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    switch (mood) {
      case 'angry':
        rrect(ctx, mx - 9, my - 4, 18, 9, 3); fs(ctx, '#fff', OUT, 2.6);
        ctx.strokeStyle = OUT; ctx.lineWidth = 1.6; line(ctx, mx - 9, my + 0.5, mx + 9, my + 0.5); line(ctx, mx - 3, my - 4, mx - 3, my + 5); line(ctx, mx + 3, my - 4, mx + 3, my + 5);
        break;
      case 'air':
        ell(ctx, mx, my, 4.5, 5.5); fs(ctx, '#7a1f3d', OUT, 2.6);
        break;
      case 'scared':
        ell(ctx, mx, my + 1, 7, 9); fs(ctx, '#7a1f3d', OUT, 2.6);
        ell(ctx, mx, my + 6, 4, 2.5); ctx.fillStyle = '#ff7a9a'; ctx.fill();
        break;
      case 'hurt': case 'dizzy':
        ctx.strokeStyle = OUT; ctx.lineWidth = 2.8; ctx.beginPath();
        for (var i = 0; i <= 6; i++) { var x = mx - 9 + i * 3; var y = my + (i % 2 ? -2.5 : 2.5); if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
        ctx.stroke();
        break;
      case 'win':
        ctx.beginPath(); ctx.moveTo(mx - 11, my - 4); ctx.quadraticCurveTo(mx, my - 2, mx + 11, my - 4); ctx.quadraticCurveTo(mx + 9, my + 12, mx, my + 12); ctx.quadraticCurveTo(mx - 9, my + 12, mx - 11, my - 4); ctx.closePath();
        fs(ctx, '#7a1f3d', OUT, 2.6);
        ell(ctx, mx, my + 8, 5, 3); ctx.fillStyle = '#ff7a9a'; ctx.fill();
        break;
      case 'sad':
        ctx.strokeStyle = OUT; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(mx, my + 6, 6, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
        break;
      default: {
        var wdt = S.face === 'grin' ? 10 : 7;
        ctx.strokeStyle = OUT; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(mx, my - 3, wdt, Math.PI * 0.2, Math.PI * 0.8); ctx.stroke();
        if (S.face === 'teeth') { rrect(ctx, mx - 4, my + 2.5, 8, 5, 1); fs(ctx, '#fff', OUT, 1.8); line(ctx, mx, my + 3, mx, my + 7); }
      }
    }
    if (S.face === 'stache') {
      ctx.save(); ctx.translate(mx, my - 6);
      ell(ctx, -6, 0, 8, 4, 0.25); fs(ctx, '#3a2a1a', null);
      ell(ctx, 6, 0, 8, 4, -0.25); fs(ctx, '#3a2a1a', null);
      ctx.restore();
    }
  }

  function drawTails(ctx, pts, S) {
    if (!pts || pts.length < 2) return;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (var pass = 0; pass < 2; pass++) {
      for (var t = 0; t < 2; t++) {
        ctx.beginPath();
        for (var i = 0; i < pts.length; i++) {
          var q = pts[i], off = t * i * 3.2;
          if (!i) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x + off * 0.3, q.y + off);
        }
        ctx.strokeStyle = pass ? S.band : OUT;
        ctx.lineWidth = pass ? 6.5 : 11;
        ctx.stroke();
      }
    }
  }

  // Transform a local sumo point to world space (same maths as drawSumo).
  function localToWorld(p, lx, ly) {
    var f = p.f < 0 ? -1 : 1, sq = clamp(p.sq || 0, -0.35, 0.45), pv = p.pv || 0;
    var x = lx * (1 + sq * 0.6) * f, y = (ly - pv) * (1 - sq);
    var c = Math.cos(p.lean || 0), s = Math.sin(p.lean || 0);
    return { x: p.x + x * c - y * s, y: p.y + pv + x * s + y * c };
  }

  function drawSumo(ctx, p, T) {
    var S = SUMOS[p.sumo] || SUMOS[0];
    var f = p.f < 0 ? -1 : 1;
    var sq = clamp(p.sq || 0, -0.35, 0.45), pv = p.pv || 0;
    drawTails(ctx, p.tails, S);
    ctx.save();
    ctx.translate(p.x, p.y + pv);
    ctx.rotate(p.lean || 0);
    ctx.scale((1 + sq * 0.6) * f, 1 - sq);
    ctx.translate(0, -pv);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';

    var bx = p.bx || 0, by = p.by || 0;
    var hx = HEAD_X + (p.hx || 0), hy = HEAD_Y + (p.hy || 0);

    // legs
    var L = legPositions(p, T);
    ctx.strokeStyle = OUT; ctx.lineWidth = 31;
    line(ctx, -21, 22, L[0], L[1]); line(ctx, 21, 22, L[2], L[3]);
    ctx.strokeStyle = S.dark; ctx.lineWidth = 24;
    line(ctx, -21, 22, L[0], L[1]); line(ctx, 21, 22, L[2], L[3]);
    ell(ctx, L[0] + 4, L[1] + 2, 17, 8.5); fs(ctx, S.mid, OUT, 3.5);
    ell(ctx, L[2] + 5, L[3] + 2, 17, 8.5); fs(ctx, S.mid, OUT, 3.5);

    // back arm
    drawArm(ctx, -30, -20, p.armB || 0, S);

    // body
    var g = ctx.createRadialGradient(-16 + bx * 0.3, -26, 6, 0, -4, 72);
    g.addColorStop(0, S.light); g.addColorStop(0.45, S.body); g.addColorStop(1, S.dark);
    ell(ctx, bx * 0.25, -6, 61, 48); ctx.fillStyle = g; ctx.fill();
    // belly
    ell(ctx, 16 + bx, 6 + by, 35, 29); ctx.fillStyle = S.mid; ctx.fill();
    ell(ctx, 10 + bx, -2 + by, 16, 10, -0.3); ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fill();
    ctx.strokeStyle = shade(S.body, -0.35); ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(22 + bx, 12 + by, 4, 0.2, Math.PI - 0.2); ctx.stroke();
    // chest lines
    ctx.strokeStyle = shade(S.body, -0.2); ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(8 + bx * 0.5, -22, 9, 0.3, Math.PI - 0.6); ctx.stroke();
    ctx.beginPath(); ctx.arc(32 + bx * 0.5, -22, 8, 0.6, Math.PI - 0.3); ctx.stroke();
    // belt (mawashi)
    ctx.save();
    ell(ctx, bx * 0.25, -6, 61, 48); ctx.clip();
    var bt = 20 + by * 0.4;
    ctx.fillStyle = S.belt; ctx.fillRect(-70, bt, 140, 22);
    ctx.fillStyle = S.beltLight; ctx.fillRect(-70, bt + 2, 140, 4);
    ctx.fillStyle = S.beltDark; ctx.fillRect(-70, bt + 17, 140, 5);
    ctx.restore();
    ell(ctx, bx * 0.25, -6, 61, 48); fs(ctx, null, OUT, 5);
    // front flap
    rrect(ctx, 14 + bx * 0.6, bt + 12, 22, 22, 4); fs(ctx, S.belt, OUT, 3);
    ctx.strokeStyle = S.beltDark; ctx.lineWidth = 2;
    line(ctx, 20 + bx * 0.6, bt + 16, 20 + bx * 0.6, bt + 31); line(ctx, 25 + bx * 0.6, bt + 16, 25 + bx * 0.6, bt + 31); line(ctx, 30 + bx * 0.6, bt + 16, 30 + bx * 0.6, bt + 31);

    // head
    circ(ctx, hx - 27, hy + 4, 8); fs(ctx, S.mid, OUT, 3.5); // ear
    var hg = ctx.createRadialGradient(hx - 8, hy - 12, 4, hx, hy, 36);
    hg.addColorStop(0, S.light); hg.addColorStop(0.55, S.body); hg.addColorStop(1, S.dark);
    circ(ctx, hx, hy, HEAD_R); ctx.fillStyle = hg; ctx.fill();
    // hair cap + band
    ctx.save(); circ(ctx, hx, hy, HEAD_R); ctx.clip();
    ell(ctx, hx - 9, hy - 31, 37, 20); ctx.fillStyle = OUT; ctx.fill();
    ctx.fillStyle = S.band; ctx.fillRect(hx - 40, hy - 18, 80, 9);
    ctx.fillStyle = S.bandDark; ctx.fillRect(hx - 40, hy - 11, 80, 2.5);
    ctx.restore();
    circ(ctx, hx, hy, HEAD_R); fs(ctx, null, OUT, 5);
    // knot
    circ(ctx, hx - 29, hy - 12, 6); fs(ctx, S.band, OUT, 3);
    var hatId = (HATS[p.hat] || HATS[0]).id;
    if (KEEP_BUN[hatId]) {
      ell(ctx, hx - 5, hy - 34, 12, 9); fs(ctx, OUT, null);
      ctx.fillStyle = '#4a3a5e'; ell(ctx, hx - 8, hy - 37, 4, 2.5); ctx.fill();
    }
    // face
    var cheek = S.face === 'blush' ? 8 : 6;
    ctx.fillStyle = 'rgba(255,70,110,0.32)';
    circ(ctx, hx + 26, hy + 8, cheek); ctx.fill();
    circ(ctx, hx - 5, hy + 9, cheek); ctx.fill();
    if (S.face === 'freckles') {
      ctx.fillStyle = 'rgba(150,80,30,0.7)';
      [[hx + 24, hy + 6], [hx + 28, hy + 10], [hx + 22, hy + 11], [hx - 6, hy + 7], [hx - 2, hy + 11]].forEach(function (d) { circ(ctx, d[0], d[1], 1.6); ctx.fill(); });
    }
    drawEyes(ctx, p, S, hx, hy, T);
    circ(ctx, hx + 13, hy + 7, 4); fs(ctx, S.dark, null);
    drawMouth(ctx, p, S, hx, hy, T);
    // sweat when teetering/scared
    if (p.sweat) {
      var sw = (T * 3) % 1;
      ctx.globalAlpha = 1 - sw;
      ell(ctx, hx - 20, hy - 14 + sw * 16, 3.5, 5.5); fs(ctx, '#8fdcff', OUT, 1.5);
      ell(ctx, hx + 30, hy - 20 + ((sw + 0.5) % 1) * 16, 3, 5); fs(ctx, '#8fdcff', OUT, 1.5);
      ctx.globalAlpha = 1;
    }

    // hat
    if (hatId !== 'none') {
      ctx.save(); ctx.translate(hx + 1, hy - HEAD_R + 3); ctx.rotate(p.hatTilt || 0);
      drawHat(ctx, hatId, T);
      ctx.restore();
    }

    // front arm
    drawArm(ctx, 32, -18, p.armF || 0, S);

    // dizzy stars
    if (p.dizzy > 0) {
      for (var k = 0; k < 3; k++) {
        var a = T * 7 + k * TAU / 3;
        star(ctx, hx + Math.cos(a) * 30, hy - 36 + Math.sin(a) * 8, 7, a, '#ffe14a', OUT, 2.5);
      }
    }
    ctx.restore();
  }

  function drawFloatie(ctx, x, y, T) {
    ctx.save(); ctx.translate(x, y);
    ell(ctx, 0, 0, 66, 17); ctx.lineWidth = 18; ctx.strokeStyle = OUT; ctx.stroke();
    ell(ctx, 0, 0, 66, 17); ctx.lineWidth = 13; ctx.strokeStyle = '#ff5a7a'; ctx.stroke();
    ctx.save(); ell(ctx, 0, 0, 74, 24); ctx.clip();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 13;
    for (var i = 0; i < 4; i++) {
      var a = i * Math.PI / 2 + 0.4;
      ctx.beginPath(); ctx.ellipse(0, 0, 66, 17, 0, a, a + 0.35); ctx.stroke();
    }
    ctx.restore();
    ctx.restore();
  }

  /* ------------------------------------------------------------ themes */
  var THEMES = {
    day: { sky: ['#3fb0ff', '#9fdcff', '#e3f7ff'], sun: '#fff6b0', far: '#a7d8f2', near: '#70c98a', water: ['#34b4f0', '#1667bd'], foam: '#e8fbff' },
    sunset: { sky: ['#ff6d82', '#ffa06a', '#ffe0a2'], sun: '#fff0b8', far: '#f3a08f', near: '#b95d7f', water: ['#e0708e', '#6e3590'], foam: '#ffe6ee' },
    snow: { sky: ['#72bff8', '#c0e6ff', '#f3fbff'], sun: '#ffffff', far: '#e2f3ff', near: '#b5d9f2', water: ['#3e97d8', '#154a8f'], foam: '#ffffff' },
    pink: { sky: ['#ff86c6', '#ffc0e0', '#fff0f7'], sun: '#fff7d6', far: '#f5b2dd', near: '#c77ad8', water: ['#8a7cff', '#4636bb'], foam: '#f2eaff' },
    dusk: { sky: ['#4a44d6', '#9a6cf0', '#ffb0d8'], sun: '#fff3d0', far: '#8e6fe2', near: '#5b41b0', water: ['#5d62ec', '#261f70'], foam: '#e2e0ff' },
    candy: { sky: ['#57d2ff', '#b6efff', '#fff3c0'], sun: '#fffbd0', far: '#ffd2ec', near: '#ff97c8', water: ['#2fc6e8', '#1570b6'], foam: '#ffffff' },
    windy: { sky: ['#3aa2ee', '#8cd0ff', '#ddf3ff'], sun: '#fff8c0', far: '#9fcbe8', near: '#57a86d', water: ['#2e9ed8', '#15579c'], foam: '#e8fbff' },
    lagoon: { sky: ['#27c2bf', '#8cefdc', '#eafff8'], sun: '#fffbd0', far: '#8fe0c9', near: '#3cad89', water: ['#1db3b7', '#0b6789'], foam: '#e0fffb' },
    party: { sky: ['#6b4cf0', '#b77cff', '#ffc2e6'], sun: '#fff3c0', far: '#a88bf3', near: '#7b5bd8', water: ['#6d7bff', '#2a2a8a'], foam: '#eee8ff' }
  };

  function rng(seed) { var s = seed; return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

  // Static sky layer, drawn once per theme into an offscreen canvas.
  function paintSky(c2, th, W, H, waterY) {
    var g = c2.createLinearGradient(0, 0, 0, waterY);
    g.addColorStop(0, th.sky[0]); g.addColorStop(0.55, th.sky[1]); g.addColorStop(1, th.sky[2]);
    c2.fillStyle = g; c2.fillRect(0, 0, W, H);
    // sun glow
    var sx = W * 0.8, sy = 120;
    var sg = c2.createRadialGradient(sx, sy, 10, sx, sy, 220);
    sg.addColorStop(0, 'rgba(255,255,230,0.9)'); sg.addColorStop(0.25, 'rgba(255,250,210,0.35)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
    c2.fillStyle = sg; c2.fillRect(0, 0, W, H);
    circ(c2, sx, sy, 52); c2.fillStyle = th.sun; c2.fill();
    // far mountains
    var r = rng(7);
    c2.fillStyle = th.far;
    c2.beginPath(); c2.moveTo(0, waterY);
    for (var x = 0; x <= W + 80; x += 80) c2.lineTo(x, waterY - 110 - r() * 120);
    c2.lineTo(W, waterY); c2.closePath(); c2.fill();
    // near hills
    c2.fillStyle = th.near;
    c2.beginPath(); c2.moveTo(0, waterY);
    for (var x2 = -40; x2 <= W + 120; x2 += 120) {
      var hh = 40 + r() * 70;
      c2.quadraticCurveTo(x2 + 60, waterY - hh * 2, x2 + 120, waterY - 10);
    }
    c2.lineTo(W, waterY); c2.closePath(); c2.fill();
    c2.fillStyle = 'rgba(255,255,255,0.12)';
    c2.fillRect(0, waterY - 30, W, 30);
  }

  function drawCloud(ctx, x, y, s, col) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(x, y, 26 * s, 0, TAU);
    ctx.arc(x + 30 * s, y - 14 * s, 32 * s, 0, TAU);
    ctx.arc(x + 64 * s, y - 2 * s, 26 * s, 0, TAU);
    ctx.arc(x + 34 * s, y + 10 * s, 26 * s, 0, TAU);
    ctx.fill();
  }

  function drawWater(ctx, th, W, H, waterY, T, x0, x1) {
    x0 = x0 == null ? -60 : x0; x1 = x1 == null ? W + 60 : x1;
    var g = ctx.createLinearGradient(0, waterY - 10, 0, H + 40);
    g.addColorStop(0, th.water[0]); g.addColorStop(1, th.water[1]);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(x0, H + 80);
    for (var x = x0; x <= x1; x += 20) ctx.lineTo(x, waterY + Math.sin(x * 0.02 + T * 2) * 5 + Math.sin(x * 0.047 - T * 1.3) * 3);
    ctx.lineTo(x1, H + 80); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = th.foam; ctx.lineWidth = 4; ctx.globalAlpha = 0.85;
    ctx.beginPath();
    for (var x2 = x0; x2 <= x1; x2 += 20) { var y = waterY + Math.sin(x2 * 0.02 + T * 2) * 5 + Math.sin(x2 * 0.047 - T * 1.3) * 3; if (x2 === x0) ctx.moveTo(x2, y); else ctx.lineTo(x2, y); }
    ctx.stroke();
    ctx.globalAlpha = 0.25; ctx.lineWidth = 3;
    for (var k = 0; k < 3; k++) {
      ctx.beginPath();
      var yy = waterY + 26 + k * 22;
      for (var x3 = x0; x3 <= x1; x3 += 30) { var y3 = yy + Math.sin(x3 * 0.03 + T * (1.5 + k * 0.4) + k) * 3; if (x3 === x0) ctx.moveTo(x3, y3); else ctx.lineTo(x3, y3); }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /* --------------------------------------------------------- platforms */
  function islandUnder(ctx, x, y, w, depth, col, col2) {
    var r = rng(Math.round(w) + 3);
    ctx.beginPath(); ctx.moveTo(x - w / 2 + 6, y);
    var n = 7;
    for (var i = 0; i <= n; i++) {
      var t = i / n, px = x + w / 2 - 6 - t * (w - 12);
      var dd = Math.sin(t * Math.PI) * depth * (0.75 + r() * 0.35);
      ctx.lineTo(px, y + 8 + dd);
    }
    ctx.closePath(); fs(ctx, col, OUT, 4);
    ctx.save(); ctx.clip();
    ctx.fillStyle = col2;
    for (var j = 0; j < 4; j++) { ell(ctx, x - w / 3 + j * w / 4.5, y + 20 + (j % 2) * 18, 16 + j * 3, 5); ctx.fill(); }
    ctx.restore();
  }

  function drawPlatform(ctx, pl, T, A) {
    var x = pl.x, y = pl.y, w = pl.w, h = pl.h;
    if (w < 2) return;
    ctx.lineJoin = 'round';
    switch (pl.kind) {
      case 'dohyo': case 'ice': case 'grass': {
        var top = pl.kind === 'ice' ? '#dff8ff' : pl.kind === 'grass' ? '#7ed957' : '#f0cc8e';
        var side = pl.kind === 'ice' ? '#9ee3fb' : pl.kind === 'grass' ? '#a8703f' : '#d9a765';
        var rock = pl.kind === 'ice' ? '#7fcdf0' : '#8a5a3c', rock2 = pl.kind === 'ice' ? '#a8e2fa' : '#6e452c';
        islandUnder(ctx, x, y + h - 6, w * 0.92, Math.min(150, 50 + w * 0.14), rock, rock2);
        if (pl.kind === 'ice') {
          ctx.fillStyle = '#c9f2ff';
          for (var ic = 0; ic < Math.floor(w / 60); ic++) {
            var ix = x - w / 2 + 30 + ic * 60, il = 16 + ((ic * 37) % 20);
            ctx.beginPath(); ctx.moveTo(ix - 8, y + h); ctx.lineTo(ix + 8, y + h); ctx.lineTo(ix, y + h + il); ctx.closePath(); fs(ctx, '#c9f2ff', OUT, 3);
          }
        }
        rrect(ctx, x - w / 2, y, w, h, 12); fs(ctx, side, OUT, 5);
        rrect(ctx, x - w / 2 + 3, y + 2.5, w - 6, 11, 6); ctx.fillStyle = top; ctx.fill();
        if (pl.kind === 'dohyo') {
          // straw rope bumps
          ctx.fillStyle = '#e8c27a'; ctx.strokeStyle = 'rgba(90,50,20,0.5)'; ctx.lineWidth = 2;
          for (var bx = x - w / 2 + 16; bx < x + w / 2 - 8; bx += 22) { ell(ctx, bx, y + h - 9, 10, 6); ctx.fill(); ctx.stroke(); }
          ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(x - 3, y + 4, 6, 7);
          ctx.fillRect(x - w * 0.18, y + 4, 4, 7); ctx.fillRect(x + w * 0.18 - 4, y + 4, 4, 7);
        } else if (pl.kind === 'ice') {
          ctx.fillStyle = 'rgba(255,255,255,0.9)';
          ctx.fillRect(x - w / 2 + 20, y + 5, w * 0.25, 3); ctx.fillRect(x + w * 0.1, y + 5, w * 0.12, 3);
          // snow caps
          ctx.fillStyle = '#ffffff';
          ell(ctx, x - w / 2 + 16, y + 1, 22, 7); ctx.fill(); ell(ctx, x + w / 2 - 18, y + 1, 24, 7); ctx.fill();
        } else {
          // grass tufts that bend in the wind
          var bend = (A && A.wind ? A.wind / 650 : 0) * 7;
          ctx.strokeStyle = '#4fb53a'; ctx.lineWidth = 3;
          for (var gx = x - w / 2 + 10; gx < x + w / 2 - 6; gx += 14) {
            var wig = Math.sin(T * 4 + gx * 0.1) * 1.5;
            line(ctx, gx, y + 3, gx + bend + wig, y - 7);
          }
        }
        if (pl.crack > 0) {
          ctx.strokeStyle = 'rgba(80,40,20,0.6)'; ctx.lineWidth = 2.5;
          [-1, 1].forEach(function (s) { var ex = x + s * (w / 2 - 12); line(ctx, ex, y + 2, ex - s * 8, y + 14); line(ctx, ex - s * 8, y + 14, ex + s * 2, y + h - 4); });
        }
        break;
      }
      case 'plank': {
        // fulcrum (not rotated)
        ctx.beginPath(); ctx.moveTo(x - 70, A.waterY + 20); ctx.lineTo(x - 40, y + 60); ctx.lineTo(x + 40, y + 60); ctx.lineTo(x + 70, A.waterY + 20); ctx.closePath();
        fs(ctx, '#9a8aa8', OUT, 5);
        ctx.beginPath(); ctx.moveTo(x - 46, y + 64); ctx.lineTo(x, y + 12); ctx.lineTo(x + 46, y + 64); ctx.closePath(); fs(ctx, '#b3a4c0', OUT, 5);
        ctx.save(); ctx.translate(x, y); ctx.rotate(pl.a);
        rrect(ctx, -w / 2, 0, w, h, 8); fs(ctx, '#d99254', OUT, 5);
        ctx.fillStyle = '#eeb070'; ctx.fillRect(-w / 2 + 4, 3, w - 8, 5);
        ctx.strokeStyle = 'rgba(110,55,20,0.45)'; ctx.lineWidth = 2;
        line(ctx, -w / 2 + 10, h * 0.62, w / 2 - 10, h * 0.62);
        for (var px = -w / 2 + 60; px < w / 2 - 20; px += 120) line(ctx, px, 2, px, h - 2);
        ctx.fillStyle = '#6b4a3a';
        for (var nb = -w / 2 + 22; nb < w / 2; nb += 120) { circ(ctx, nb, h / 2, 3); ctx.fill(); }
        // end markers
        ctx.fillStyle = '#ff5a7a'; ctx.fillRect(-w / 2 + 3, 3, 14, h - 6); ctx.fillRect(w / 2 - 17, 3, 14, h - 6);
        circ(ctx, 0, h / 2, 7); fs(ctx, '#ffd23f', OUT, 3);
        ctx.restore();
        break;
      }
      case 'cloud': {
        var n = Math.max(3, Math.round(w / 55));
        ctx.fillStyle = 'rgba(40,30,90,0.18)';
        for (var ci = 0; ci < n; ci++) { var cx = x - w / 2 + 24 + ci * (w - 48) / (n - 1); circ(ctx, cx, y + 36, 30); ctx.fill(); }
        ctx.beginPath();
        for (var cj = 0; cj < n; cj++) {
          var cx2 = x - w / 2 + 24 + cj * (w - 48) / (n - 1);
          ctx.moveTo(cx2 + 30, y + 22); ctx.arc(cx2, y + 22, 30, 0, TAU);
          ctx.moveTo(cx2 + 20 + 22, y + 40); ctx.arc(cx2 + 20, y + 40, 22, 0, TAU);
        }
        ctx.strokeStyle = OUT; ctx.lineWidth = 9; ctx.stroke();
        ctx.fillStyle = '#ffffff'; ctx.fill();
        rrect(ctx, x - w / 2 + 4, y - 2, w - 8, 18, 9); ctx.fillStyle = '#ffffff'; ctx.fill();
        ctx.strokeStyle = OUT; ctx.lineWidth = 4.5; line(ctx, x - w / 2 + 12, y - 2, x + w / 2 - 12, y - 2);
        ctx.fillStyle = '#e4ecff';
        for (var ck = 0; ck < n; ck++) { var cx3 = x - w / 2 + 24 + ck * (w - 48) / (n - 1); ell(ctx, cx3 + 6, y + 36, 16, 6); ctx.fill(); }
        // little propellers keep the cloud afloat
        [-1, 1].forEach(function (s) {
          var px2 = x + s * (w / 2 - 50), py = y + 72;
          rrect(ctx, px2 - 9, y + 50, 18, 20, 5); fs(ctx, '#ff8fb1', OUT, 3.5);
          var sp = Math.cos(T * 28 + s);
          ell(ctx, px2 - 16 * sp, py + 4, 16 * Math.abs(sp) + 3, 5); fs(ctx, '#ffd23f', OUT, 3);
          ell(ctx, px2 + 16 * sp, py + 4, 16 * Math.abs(sp) + 3, 5); fs(ctx, '#7de3ff', OUT, 3);
          circ(ctx, px2, py + 4, 4.5); fs(ctx, '#ffffff', OUT, 2.5);
        });
        break;
      }
      case 'tramp': {
        islandUnder(ctx, x, y + 70, w * 0.8, 110, '#8a5a3c', '#6e452c');
        // legs
        ctx.strokeStyle = OUT; ctx.lineWidth = 10;
        [-0.42, -0.14, 0.14, 0.42].forEach(function (f) { line(ctx, x + f * w, y + 20, x + f * w, y + 78); });
        ctx.strokeStyle = '#5b6b8c'; ctx.lineWidth = 5;
        [-0.42, -0.14, 0.14, 0.42].forEach(function (f) { line(ctx, x + f * w, y + 20, x + f * w, y + 78); });
        // mat with dips
        var dips = pl.dips || [];
        ctx.beginPath(); ctx.moveTo(x - w / 2 + 6, y + 4);
        for (var mx = -w / 2 + 6; mx <= w / 2 - 6; mx += 12) {
          var dy = 0;
          for (var d = 0; d < dips.length; d++) { var dd = dips[d]; var k = (x + mx - dd.x) / 70; dy += dd.a * Math.exp(-k * k); }
          ctx.lineTo(x + mx, y + 4 + dy);
        }
        ctx.lineTo(x + w / 2 - 6, y + 4);
        ctx.strokeStyle = OUT; ctx.lineWidth = 12; ctx.stroke();
        ctx.strokeStyle = '#3a4ee0'; ctx.lineWidth = 7; ctx.stroke();
        // frame
        rrect(ctx, x - w / 2 - 8, y + 6, w + 16, 16, 8); fs(ctx, '#ffffff', OUT, 4.5);
        ctx.save(); rrect(ctx, x - w / 2 - 8, y + 6, w + 16, 16, 8); ctx.clip();
        ctx.fillStyle = '#ff4f6d';
        for (var sx = x - w / 2 - 20; sx < x + w / 2 + 20; sx += 36) { ctx.beginPath(); ctx.moveTo(sx, y + 22); ctx.lineTo(sx + 18, y + 6); ctx.lineTo(sx + 30, y + 6); ctx.lineTo(sx + 12, y + 22); ctx.closePath(); ctx.fill(); }
        ctx.restore();
        rrect(ctx, x - w / 2 - 8, y + 6, w + 16, 16, 8); fs(ctx, null, OUT, 4.5);
        break;
      }
      case 'pillar': {
        var bot = A.waterY + 40;
        rrect(ctx, x - w / 2, y, w, bot - y, 10); fs(ctx, '#a99fc0', OUT, 5);
        ctx.save(); rrect(ctx, x - w / 2, y, w, bot - y, 10); ctx.clip();
        ctx.strokeStyle = 'rgba(60,40,90,0.3)'; ctx.lineWidth = 3;
        for (var by2 = y + 34, row = 0; by2 < bot; by2 += 34, row++) {
          line(ctx, x - w / 2, by2, x + w / 2, by2);
          for (var bx2 = x - w / 2 + (row % 2 ? 30 : 60); bx2 < x + w / 2; bx2 += 60) line(ctx, bx2, by2, bx2, by2 + 34);
        }
        ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x - w / 2 + 8, y, 10, bot - y);
        ctx.restore();
        // mossy top
        rrect(ctx, x - w / 2 - 4, y - 2, w + 8, 16, 8); fs(ctx, '#6fd36a', OUT, 4.5);
        ctx.fillStyle = '#6fd36a';
        for (var mx2 = x - w / 2 + 8; mx2 < x + w / 2 - 8; mx2 += 26) { ell(ctx, mx2 + 6, y + 15, 9, 6); ctx.fill(); }
        break;
      }
    }
  }

  // Decorations behind the stage.
  function drawBackDecor(ctx, A, T) {
    if (A.type === 'windy') {
      var pl = A.plats[0];
      var px = pl.x + pl.w / 2 - 26, py = pl.y;
      ctx.strokeStyle = OUT; ctx.lineWidth = 8; line(ctx, px, py, px, py - 150);
      ctx.strokeStyle = '#e8e3f0'; ctx.lineWidth = 4; line(ctx, px, py, px, py - 150);
      var wv = A.wind / 650; var dir = wv >= 0 ? 1 : -1; var mag = Math.min(1, Math.abs(wv) + 0.15);
      ctx.save(); ctx.translate(px, py - 146); ctx.scale(dir, 1); ctx.rotate((1 - mag) * 1.2 + Math.sin(T * 12) * 0.05);
      for (var i = 0; i < 4; i++) {
        ctx.beginPath(); ctx.moveTo(i * 20, -11 + i * 1.5); ctx.lineTo(i * 20 + 20, -9.5 + i * 1.5); ctx.lineTo(i * 20 + 20, 9.5 - i * 1.5); ctx.lineTo(i * 20, 11 - i * 1.5); ctx.closePath();
        fs(ctx, i % 2 ? '#ffffff' : '#ff5a3c', OUT, 3);
      }
      ctx.restore();
    }
  }

  // Little cheering blobs on side clouds (react to bonks).
  var FANS = [
    { x: 70, c: '#ff8fb1' }, { x: 118, c: '#ffd23f' }, { x: 166, c: '#6ec8ff' }, { x: 212, c: '#8be066' },
    { x: 1068, c: '#b98aff' }, { x: 1114, c: '#ffa047' }, { x: 1162, c: '#52dcc2' }, { x: 1210, c: '#ff5b4f' }
  ];
  function drawFans(ctx, T, hype, W) {
    var y0 = 262;
    drawCloud(ctx, 40, y0 + 34, 1.35, 'rgba(255,255,255,0.9)');
    drawCloud(ctx, 150, y0 + 40, 1.2, 'rgba(255,255,255,0.9)');
    drawCloud(ctx, 1030, y0 + 38, 1.25, 'rgba(255,255,255,0.9)');
    drawCloud(ctx, 1140, y0 + 34, 1.35, 'rgba(255,255,255,0.9)');
    for (var i = 0; i < FANS.length; i++) {
      var f = FANS[i];
      var hop = Math.abs(Math.sin(T * (4 + hype * 6) + i * 1.7)) * (3 + hype * 16);
      var y = y0 - hop;
      ell(ctx, f.x, y + 12, 17, 15); fs(ctx, f.c, OUT, 3.5);
      var look = i < 4 ? 1 : -1;
      circ(ctx, f.x + 4 * look - 4, y + 8, 3.6); fs(ctx, '#fff', null); circ(ctx, f.x + 4 * look + 5, y + 8, 3.6); fs(ctx, '#fff', null);
      circ(ctx, f.x + 5 * look - 4, y + 8, 1.8); fs(ctx, OUT, null); circ(ctx, f.x + 5 * look + 5, y + 8, 1.8); fs(ctx, OUT, null);
      if (hype > 0.3) { ell(ctx, f.x + 2 * look, y + 17, 4, 4); fs(ctx, '#7a1f3d', null); }
      else { ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(f.x + 2 * look, y + 14, 4, 0.3, Math.PI - 0.3); ctx.stroke(); }
      if (hype > 0.2) {
        ctx.strokeStyle = OUT; ctx.lineWidth = 3;
        line(ctx, f.x - 14, y + 8, f.x - 22, y - 6 - hype * 6); line(ctx, f.x + 14, y + 8, f.x + 22, y - 6 - hype * 6);
      }
    }
  }

  function drawTrophy(ctx, x, y, s, T) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.lineJoin = 'round';
    // handles
    ctx.strokeStyle = OUT; ctx.lineWidth = 13;
    ctx.beginPath(); ctx.arc(-40, -30, 18, Math.PI * 0.5, Math.PI * 1.5); ctx.stroke();
    ctx.beginPath(); ctx.arc(40, -30, 18, -Math.PI * 0.5, Math.PI * 0.5); ctx.stroke();
    ctx.strokeStyle = '#ffc22e'; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.arc(-40, -30, 18, Math.PI * 0.5, Math.PI * 1.5); ctx.stroke();
    ctx.beginPath(); ctx.arc(40, -30, 18, -Math.PI * 0.5, Math.PI * 0.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-46, -56); ctx.lineTo(46, -56); ctx.quadraticCurveTo(44, 6, 0, 14); ctx.quadraticCurveTo(-44, 6, -46, -56); ctx.closePath();
    fs(ctx, '#ffcf2e', OUT, 5);
    ctx.fillStyle = 'rgba(255,255,255,0.45)'; ell(ctx, -22, -32, 7, 18, 0.2); ctx.fill();
    rrect(ctx, -8, 12, 16, 22, 3); fs(ctx, '#ffb400', OUT, 4);
    rrect(ctx, -30, 32, 60, 18, 5); fs(ctx, '#8a5a3c', OUT, 4);
    ctx.fillStyle = '#ffd23f'; ctx.fillRect(-14, 37, 28, 7);
    star(ctx, 0, -28, 14, Math.sin(T * 2) * 0.2, '#fff4b0', OUT, 3);
    ctx.restore();
  }

  window.SBArt = {
    OUT: OUT, SUMOS: SUMOS, HATS: HATS, THEMES: THEMES,
    drawSumo: drawSumo, drawHat: drawHat, drawPlatform: drawPlatform, drawBackDecor: drawBackDecor,
    paintSky: paintSky, drawCloud: drawCloud, drawWater: drawWater, drawFans: drawFans, drawFloatie: drawFloatie,
    drawTrophy: drawTrophy, star: star, rrect: rrect, ell: ell, circ: circ, fs: fs, line: line, shade: shade,
    localToWorld: localToWorld, HEAD_X: HEAD_X, HEAD_Y: HEAD_Y
  };
})();
