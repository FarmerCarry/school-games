/*
 * Beat Dash — art drawn in code: cube faces, the rocket, difficulty faces, stars.
 * All drawing functions work in a unit box centred on (0,0) and are scaled by the caller.
 */
(function (root) {
  'use strict';
  var BD = root.BD || (root.BD = {});
  var INK = '#1b1033';

  BD.FACES = [
    { id: 'smile', name: 'مبتسم' },
    { id: 'cool', name: 'النظّارة', need: { lvl: 0 } },
    { id: 'cat', name: 'قطقوط', need: { lvl: 1 } },
    { id: 'robot', name: 'روبو', need: { lvl: 2 } },
    { id: 'alien', name: 'فضائي', need: { lvl: 3 } },
    { id: 'ninja', name: 'نينجا', need: { lvl: 4 } },
    { id: 'wow', name: 'واو!', need: { attempts: 25 } },
    { id: 'starry', name: 'عيون النجوم', need: { stars: 3 } },
    { id: 'grr', name: 'غاضب', need: { stars: 6 } },
    { id: 'panda', name: 'باندا', need: { stars: 9 } },
    { id: 'dizzy', name: 'دوخة', need: { attempts: 100 } },
    { id: 'king', name: 'الملك', need: { stars: 15 } }
  ];
  BD.COLORS = [
    { c: '#ffd93b', name: 'مشمس' },
    { c: '#35e0ff', name: 'سماوي' },
    { c: '#ff5ad1', name: 'علكة' },
    { c: '#7dff5a', name: 'ليموني' },
    { c: '#ff8a2a', name: 'برتقالي', need: { attempts: 10 } },
    { c: '#ffffff', name: 'ثلجي', need: { stars: 1 } },
    { c: '#b36bff', name: 'عنبي', need: { lvl: 0 } },
    { c: '#ff3b4f', name: 'كرزي', need: { stars: 2 } },
    { c: '#2f6bff', name: 'محيطي', need: { lvl: 1 } },
    { c: '#1de9b6', name: 'نعناعي', need: { stars: 4 } },
    { c: '#ffb3e6', name: 'حلوى', need: { attempts: 50 } },
    { c: '#3b3f58', name: 'ظلّ', need: { lvl: 2 } },
    { c: '#c6ff00', name: 'كهربائي', need: { stars: 7 } },
    { c: '#ff9ecb', name: 'خوخي', need: { jumps: 500 } },
    { c: '#8a5a2b', name: 'كاكاو', need: { stars: 10 } },
    { c: '#ffc300', name: 'ذهبي', need: { lvl: 3 } },
    { c: '#00ffa2', name: 'نيون', need: { stars: 12 } },
    { c: '#ff2bd6', name: 'فوشيا', need: { lvl: 4 } }
  ];

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  BD.rr = rr;

  function eye(ctx, x, y, r) {
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.35, r * 0.38, 0, Math.PI * 2); ctx.fill();
  }
  function starPath(ctx, x, y, r1, r2, n, rot) {
    ctx.beginPath();
    for (var i = 0; i < n * 2; i++) {
      var a = rot + i * Math.PI / n - Math.PI / 2, r = i % 2 ? r2 : r1;
      if (i) ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); else ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
  }
  BD.starPath = starPath;

  // Face features in a box from -0.5..0.5. blink: 0..1
  BD.drawFace = function (ctx, id, blink) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    var b = blink || 0;
    function eyes(y, r, gap) {
      if (b > 0.5) {
        ctx.strokeStyle = INK; ctx.lineWidth = 0.06;
        ctx.beginPath(); ctx.moveTo(-gap - r, y); ctx.lineTo(-gap + r, y); ctx.moveTo(gap - r, y); ctx.lineTo(gap + r, y); ctx.stroke();
      } else { eye(ctx, -gap, y, r); eye(ctx, gap, y, r); }
    }
    ctx.strokeStyle = INK; ctx.fillStyle = INK; ctx.lineWidth = 0.06;
    switch (id) {
      case 'cool':
        ctx.fillStyle = INK;
        rr(ctx, -0.36, -0.2, 0.32, 0.2, 0.06); ctx.fill();
        rr(ctx, 0.04, -0.2, 0.32, 0.2, 0.06); ctx.fill();
        ctx.fillRect(-0.4, -0.18, 0.8, 0.05);
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.fillRect(-0.3, -0.16, 0.08, 0.04); ctx.fillRect(0.1, -0.16, 0.08, 0.04);
        ctx.beginPath(); ctx.moveTo(-0.12, 0.2); ctx.quadraticCurveTo(0.08, 0.3, 0.2, 0.14); ctx.stroke();
        break;
      case 'cat':
        ctx.fillStyle = INK;
        ctx.beginPath(); ctx.moveTo(-0.46, -0.46); ctx.lineTo(-0.2, -0.46); ctx.lineTo(-0.46, -0.2); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(0.46, -0.46); ctx.lineTo(0.2, -0.46); ctx.lineTo(0.46, -0.2); ctx.closePath(); ctx.fill();
        eyes(-0.08, 0.085, 0.18);
        ctx.fillStyle = '#ff7eb6'; ctx.beginPath(); ctx.moveTo(-0.05, 0.07); ctx.lineTo(0.05, 0.07); ctx.lineTo(0, 0.12); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-0.12, 0.17); ctx.quadraticCurveTo(-0.06, 0.24, 0, 0.15); ctx.quadraticCurveTo(0.06, 0.24, 0.12, 0.17); ctx.stroke();
        ctx.lineWidth = 0.03;
        ctx.beginPath(); ctx.moveTo(-0.2, 0.1); ctx.lineTo(-0.42, 0.06); ctx.moveTo(-0.2, 0.15); ctx.lineTo(-0.42, 0.17);
        ctx.moveTo(0.2, 0.1); ctx.lineTo(0.42, 0.06); ctx.moveTo(0.2, 0.15); ctx.lineTo(0.42, 0.17); ctx.stroke();
        break;
      case 'robot':
        ctx.fillStyle = INK; rr(ctx, -0.36, -0.24, 0.72, 0.24, 0.08); ctx.fill();
        ctx.fillStyle = '#ff3b4f'; ctx.fillRect(-0.28, -0.15, 0.56 * (b > 0.5 ? 0.2 : 1), 0.07);
        ctx.fillStyle = INK;
        for (var i = 0; i < 4; i++) ctx.fillRect(-0.2 + i * 0.11, 0.14, 0.07, 0.12);
        ctx.beginPath(); ctx.arc(-0.38, 0.38, 0.04, 0, 7); ctx.arc(0.38, 0.38, 0.04, 0, 7); ctx.fill();
        break;
      case 'alien':
        eye(ctx, -0.2, -0.05, 0.09); eye(ctx, 0.2, -0.05, 0.09); eye(ctx, 0, -0.24, 0.1);
        ctx.beginPath(); ctx.ellipse(0, 0.2, 0.07, 0.05, 0, 0, 7); ctx.fill();
        break;
      case 'ninja':
        ctx.fillStyle = INK; ctx.fillRect(-0.5, -0.22, 1, 0.24);
        ctx.beginPath(); ctx.moveTo(0.46, -0.16); ctx.lineTo(0.62, -0.3); ctx.lineTo(0.6, -0.08); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.moveTo(-0.3, -0.12); ctx.lineTo(-0.08, -0.08); ctx.lineTo(-0.3, -0.04); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(0.3, -0.12); ctx.lineTo(0.08, -0.08); ctx.lineTo(0.3, -0.04); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-0.1, 0.22); ctx.lineTo(0.1, 0.22); ctx.stroke();
        break;
      case 'wow':
        eye(ctx, -0.18, -0.1, 0.12); eye(ctx, 0.18, -0.1, 0.12);
        ctx.beginPath(); ctx.ellipse(0, 0.2, 0.08, 0.1, 0, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-0.3, -0.3); ctx.lineTo(-0.1, -0.34); ctx.moveTo(0.3, -0.3); ctx.lineTo(0.1, -0.34); ctx.stroke();
        break;
      case 'starry':
        ctx.fillStyle = '#ffe14d'; ctx.strokeStyle = INK; ctx.lineWidth = 0.035;
        starPath(ctx, -0.18, -0.08, 0.14, 0.06, 5, 0); ctx.fill(); ctx.stroke();
        starPath(ctx, 0.18, -0.08, 0.14, 0.06, 5, 0); ctx.fill(); ctx.stroke();
        ctx.fillStyle = INK; ctx.beginPath(); ctx.moveTo(-0.16, 0.12); ctx.quadraticCurveTo(0, 0.36, 0.16, 0.12); ctx.closePath(); ctx.fill();
        break;
      case 'grr':
        eyes(-0.04, 0.08, 0.18);
        ctx.lineWidth = 0.07;
        ctx.beginPath(); ctx.moveTo(-0.34, -0.24); ctx.lineTo(-0.08, -0.14); ctx.moveTo(0.34, -0.24); ctx.lineTo(0.08, -0.14); ctx.stroke();
        ctx.fillStyle = INK; rr(ctx, -0.18, 0.14, 0.36, 0.14, 0.04); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.fillRect(-0.14, 0.14, 0.28, 0.05);
        break;
      case 'panda':
        ctx.fillStyle = INK;
        ctx.beginPath(); ctx.arc(-0.4, -0.4, 0.13, 0, 7); ctx.arc(0.4, -0.4, 0.13, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.ellipse(-0.18, -0.06, 0.13, 0.16, -0.5, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.ellipse(0.18, -0.06, 0.13, 0.16, 0.5, 0, 7); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-0.17, -0.07, 0.05, 0, 7); ctx.arc(0.17, -0.07, 0.05, 0, 7); ctx.fill();
        ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(0, 0.14, 0.06, 0.04, 0, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-0.08, 0.24); ctx.quadraticCurveTo(0, 0.3, 0.08, 0.24); ctx.stroke();
        break;
      case 'dizzy':
        ctx.lineWidth = 0.04;
        [-0.18, 0.18].forEach(function (x) {
          ctx.beginPath();
          for (var k = 0; k < 28; k++) { var a = k * 0.5, r = 0.01 + k * 0.0045; if (k) ctx.lineTo(x + Math.cos(a) * r, -0.08 + Math.sin(a) * r); else ctx.moveTo(x, -0.08); }
          ctx.stroke();
        });
        ctx.beginPath(); ctx.moveTo(-0.18, 0.2); ctx.quadraticCurveTo(-0.09, 0.12, 0, 0.2); ctx.quadraticCurveTo(0.09, 0.28, 0.18, 0.2); ctx.stroke();
        break;
      case 'king':
        ctx.fillStyle = '#ffc300'; ctx.strokeStyle = INK; ctx.lineWidth = 0.04;
        ctx.beginPath(); ctx.moveTo(-0.32, -0.2); ctx.lineTo(-0.32, -0.46); ctx.lineTo(-0.16, -0.32); ctx.lineTo(0, -0.5); ctx.lineTo(0.16, -0.32); ctx.lineTo(0.32, -0.46); ctx.lineTo(0.32, -0.2); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ff3b4f'; ctx.beginPath(); ctx.arc(0, -0.3, 0.045, 0, 7); ctx.fill();
        eyes(0.02, 0.075, 0.17);
        ctx.strokeStyle = INK; ctx.lineWidth = 0.06;
        ctx.beginPath(); ctx.moveTo(-0.14, 0.2); ctx.quadraticCurveTo(0, 0.32, 0.14, 0.2); ctx.stroke();
        break;
      default: // smile
        eyes(-0.08, 0.09, 0.17);
        ctx.lineWidth = 0.065;
        ctx.beginPath(); ctx.moveTo(-0.17, 0.15); ctx.quadraticCurveTo(0, 0.32, 0.17, 0.15); ctx.stroke();
    }
  };

  // The player cube. size in px, centred at the current origin.
  BD.drawCube = function (ctx, size, face, c1, c2, blink) {
    var h = size / 2;
    ctx.fillStyle = c1;
    ctx.fillRect(-h, -h, size, size);
    ctx.fillStyle = c2;
    ctx.globalAlpha = 0.9;
    ctx.fillRect(-h * 0.62, -h * 0.62, size * 0.62, size * 0.62);
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fillRect(-h, -h, size, size * 0.12);
    ctx.lineWidth = Math.max(2, size * 0.07);
    ctx.strokeStyle = INK;
    ctx.strokeRect(-h + ctx.lineWidth / 2, -h + ctx.lineWidth / 2, size - ctx.lineWidth, size - ctx.lineWidth);
    ctx.save();
    ctx.scale(size, size);
    BD.drawFace(ctx, face, blink);
    ctx.restore();
  };

  // Rocket body (pointing right) with the cube riding in it.
  BD.drawRocket = function (ctx, size, face, c1, c2, t) {
    var s = size;
    ctx.save();
    // flame
    var fl = 0.35 + 0.15 * Math.sin(t * 40);
    ctx.fillStyle = '#ffb000';
    ctx.beginPath(); ctx.moveTo(-0.62 * s, -0.16 * s); ctx.lineTo((-0.62 - fl) * s, 0); ctx.lineTo(-0.62 * s, 0.16 * s); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff4a0';
    ctx.beginPath(); ctx.moveTo(-0.62 * s, -0.08 * s); ctx.lineTo((-0.62 - fl * 0.55) * s, 0); ctx.lineTo(-0.62 * s, 0.08 * s); ctx.closePath(); ctx.fill();
    // mini cube in the cockpit
    ctx.save(); ctx.translate(-0.08 * s, -0.3 * s); BD.drawCube(ctx, s * 0.5, face, c1, c2, 0); ctx.restore();
    // body
    ctx.fillStyle = c1; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(2, s * 0.07);
    ctx.beginPath();
    ctx.moveTo(-0.62 * s, -0.22 * s);
    ctx.lineTo(0.3 * s, -0.22 * s);
    ctx.quadraticCurveTo(0.72 * s, -0.1 * s, 0.72 * s, 0.06 * s);
    ctx.quadraticCurveTo(0.6 * s, 0.26 * s, 0.2 * s, 0.26 * s);
    ctx.lineTo(-0.62 * s, 0.26 * s);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = c2;
    ctx.fillRect(-0.5 * s, -0.02 * s, 0.9 * s, 0.12 * s);
    // fins
    ctx.fillStyle = c2;
    ctx.beginPath(); ctx.moveTo(-0.62 * s, 0.26 * s); ctx.lineTo(-0.36 * s, 0.26 * s); ctx.lineTo(-0.66 * s, 0.5 * s); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(-0.5 * s, -0.18 * s, 0.7 * s, 0.06 * s);
    ctx.restore();
  };

  // Difficulty face on a circle, for the level select card.
  BD.DIFFS = {
    easy: { label: 'سهل', col: '#3ddc84', ink: '#0a4a26' },
    normal: { label: 'متوسط', col: '#35c6ff', ink: '#08395a' },
    hard: { label: 'صعب', col: '#ffb300', ink: '#5a3a00' },
    harder: { label: 'أصعب', col: '#ff4d5a', ink: '#5a0010' },
    insane: { label: 'جنوني', col: '#c05cff', ink: '#3a0060' }
  };
  BD.drawDiffFace = function (ctx, kind, size) {
    var d = BD.DIFFS[kind] || BD.DIFFS.easy, r = size / 2;
    ctx.save();
    ctx.translate(r, r);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.arc(0, r * 0.06, r * 0.92, 0, 7); ctx.fill();
    ctx.fillStyle = d.col; ctx.beginPath(); ctx.arc(0, 0, r * 0.9, 0, 7); ctx.fill();
    ctx.lineWidth = r * 0.08; ctx.strokeStyle = '#fff'; ctx.stroke();
    ctx.scale(r, r);
    ctx.fillStyle = d.ink; ctx.strokeStyle = d.ink; ctx.lineCap = 'round'; ctx.lineWidth = 0.1;
    function e(x, y, rr) { ctx.fillStyle = d.ink; ctx.beginPath(); ctx.arc(x, y, rr, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x - rr * 0.3, y - rr * 0.3, rr * 0.35, 0, 7); ctx.fill(); }
    if (kind === 'easy') {
      e(-0.28, -0.15, 0.13); e(0.28, -0.15, 0.13);
      ctx.beginPath(); ctx.moveTo(-0.35, 0.18); ctx.quadraticCurveTo(0, 0.55, 0.35, 0.18); ctx.stroke();
    } else if (kind === 'normal') {
      e(-0.28, -0.12, 0.12); e(0.28, -0.12, 0.12);
      ctx.beginPath(); ctx.moveTo(-0.28, 0.25); ctx.quadraticCurveTo(0, 0.42, 0.28, 0.25); ctx.stroke();
    } else if (kind === 'hard') {
      e(-0.28, -0.08, 0.12); e(0.28, -0.08, 0.12);
      ctx.beginPath(); ctx.moveTo(-0.45, -0.38); ctx.lineTo(-0.12, -0.3); ctx.moveTo(0.45, -0.38); ctx.lineTo(0.12, -0.3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-0.22, 0.32); ctx.lineTo(0.22, 0.32); ctx.stroke();
    } else if (kind === 'harder') {
      e(-0.28, -0.05, 0.12); e(0.28, -0.05, 0.12);
      ctx.beginPath(); ctx.moveTo(-0.48, -0.4); ctx.lineTo(-0.1, -0.22); ctx.moveTo(0.48, -0.4); ctx.lineTo(0.1, -0.22); ctx.stroke();
      ctx.fillStyle = d.ink; BD.rr(ctx, -0.3, 0.2, 0.6, 0.24, 0.08); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(-0.24, 0.2, 0.48, 0.08);
    } else {
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-0.28, -0.08, 0.2, 0, 7); ctx.arc(0.28, -0.08, 0.2, 0, 7); ctx.fill();
      ctx.fillStyle = d.ink; ctx.beginPath(); ctx.arc(-0.24, -0.04, 0.09, 0, 7); ctx.arc(0.24, -0.04, 0.09, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-0.55, -0.42); ctx.lineTo(-0.12, -0.26); ctx.moveTo(0.55, -0.42); ctx.lineTo(0.12, -0.26); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-0.3, 0.36); ctx.lineTo(-0.15, 0.26); ctx.lineTo(0, 0.36); ctx.lineTo(0.15, 0.26); ctx.lineTo(0.3, 0.36); ctx.stroke();
    }
    ctx.restore();
  };

  BD.starSVG = function (on) {
    return '<svg viewBox="0 0 24 24"><path d="M12 2.2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.3l-6.1 3.5 1.4-6.8L2.2 9.3l6.9-.8z" fill="' +
      (on ? '#ffe14d' : 'rgba(0,0,0,0.35)') + '" stroke="' + (on ? '#8a5a00' : 'rgba(255,255,255,0.5)') + '" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  };
})(typeof window !== 'undefined' ? window : globalThis);
