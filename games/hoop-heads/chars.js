/* Hoop Heads - characters. Every head is drawn in code, centred on (0,0),
   radius r, facing RIGHT (the caller flips the canvas for left-facing).
   o = { t: seconds, lx, ly: look direction (-1..1), mood: 'normal'|'happy'|'sad'|'dizzy'|'effort', blink: bool } */
(function () {
  'use strict';
  var INK = '#1d1235';
  var TAU = Math.PI * 2;

  function circ(c, x, y, r) { c.beginPath(); c.arc(x, y, r, 0, TAU); }
  function ell(c, x, y, rx, ry, rot) { c.beginPath(); c.ellipse(x, y, rx, ry, rot || 0, 0, TAU); }
  function rr(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
  }
  function fs(c, fill, lw) { c.fillStyle = fill; c.fill(); if (lw) { c.lineWidth = lw; c.strokeStyle = INK; c.stroke(); } }
  function radial(c, r, a, b) {
    var g = c.createRadialGradient(-r * 0.35, -r * 0.45, r * 0.1, 0, 0, r * 1.1);
    g.addColorStop(0, a); g.addColorStop(1, b); return g;
  }
  function line(c, x1, y1, x2, y2, lw, col) {
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2);
    c.lineWidth = lw; c.strokeStyle = col || INK; c.lineCap = 'round'; c.stroke();
  }

  // Generic cartoon eye (white + pupil). s = eye radius.
  function eye(c, o, x, y, s, opt) {
    opt = opt || {};
    var lw = Math.max(1.5, s * 0.22);
    var mood = o.mood;
    if (mood === 'happy') {
      c.beginPath(); c.arc(x, y + s * 0.35, s * 0.75, Math.PI * 1.15, Math.PI * 1.85);
      c.lineWidth = lw * 1.3; c.strokeStyle = INK; c.lineCap = 'round'; c.stroke();
      return;
    }
    if (mood === 'dizzy') {
      c.beginPath();
      for (var i = 0; i <= 24; i++) {
        var a = i / 24 * TAU * 1.8 + o.t * 8, rad = s * 0.85 * i / 24;
        if (i === 0) c.moveTo(x, y); else c.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
      }
      c.lineWidth = lw; c.strokeStyle = INK; c.stroke();
      return;
    }
    if (o.blink) { line(c, x - s * 0.8, y, x + s * 0.8, y, lw * 1.2); return; }
    circ(c, x, y, s); fs(c, opt.white || '#fff', lw);
    var pr = s * (opt.pupil || 0.5);
    var px = x + (o.lx || 0) * (s - pr) * 0.75, py = y + (o.ly || 0) * (s - pr) * 0.75;
    circ(c, px, py, pr); c.fillStyle = opt.pupilCol || INK; c.fill();
    circ(c, px - pr * 0.35, py - pr * 0.35, pr * 0.35); c.fillStyle = '#fff'; c.fill();
    if (mood === 'effort' || mood === 'sad' || opt.brow) {
      var dir = mood === 'sad' ? -1 : 1;
      line(c, x - s * 1.0, y - s * 1.25 - dir * s * 0.25, x + s * 0.9, y - s * 1.25 + dir * s * 0.3, lw * 1.2);
    }
  }

  function mouth(c, o, x, y, w, opt) {
    opt = opt || {};
    var lw = Math.max(1.5, w * 0.12);
    var mood = o.mood;
    c.lineCap = 'round'; c.lineJoin = 'round';
    if (mood === 'happy') {
      c.beginPath(); c.moveTo(x - w, y - w * 0.15); c.quadraticCurveTo(x, y + w * 1.35, x + w, y - w * 0.15); c.closePath();
      fs(c, '#7a1030', lw);
      c.save(); c.clip();
      circ(c, x, y + w * 0.75, w * 0.5); c.fillStyle = '#ff7a9a'; c.fill();
      if (opt.teeth !== false) { c.fillStyle = '#fff'; c.fillRect(x - w * 0.8, y - w * 0.3, w * 1.6, w * 0.28); }
      c.restore();
      c.beginPath(); c.moveTo(x - w, y - w * 0.15); c.quadraticCurveTo(x, y + w * 1.35, x + w, y - w * 0.15); c.closePath();
      c.lineWidth = lw; c.strokeStyle = INK; c.stroke();
    } else if (mood === 'sad') {
      c.beginPath(); c.moveTo(x - w * 0.7, y + w * 0.35); c.quadraticCurveTo(x, y - w * 0.35, x + w * 0.7, y + w * 0.35);
      c.lineWidth = lw; c.strokeStyle = INK; c.stroke();
    } else if (mood === 'effort') {
      rr(c, x - w * 0.7, y - w * 0.25, w * 1.4, w * 0.55, w * 0.18); fs(c, '#fff', lw);
      line(c, x - w * 0.7, y + w * 0.02, x + w * 0.7, y + w * 0.02, lw * 0.6);
    } else if (mood === 'dizzy') {
      c.beginPath(); c.moveTo(x - w * 0.7, y);
      for (var i = 1; i <= 6; i++) c.lineTo(x - w * 0.7 + i * w * 1.4 / 6, y + (i % 2 ? -1 : 1) * w * 0.18);
      c.lineWidth = lw; c.strokeStyle = INK; c.stroke();
    } else {
      c.beginPath(); c.moveTo(x - w * 0.75, y - w * 0.1); c.quadraticCurveTo(x, y + w * 0.7, x + w * 0.75, y - w * 0.1);
      c.lineWidth = lw; c.strokeStyle = INK; c.stroke();
    }
  }
  function cheeks(c, r, x1, x2, y, col) {
    c.globalAlpha = 0.45; c.fillStyle = col || '#ff6b8a';
    ell(c, x1, y, r * 0.14, r * 0.09); c.fill(); ell(c, x2, y, r * 0.14, r * 0.09); c.fill();
    c.globalAlpha = 1;
  }
  function std(c, r, o, dx, eyeY, eyeS, gap, mouthY, mouthW, opt) {
    eye(c, o, dx - gap, eyeY, eyeS, opt); eye(c, o, dx + gap, eyeY, eyeS * 1.05, opt);
    mouth(c, o, dx + r * 0.04, mouthY, mouthW, opt);
  }

  /* ------------------------------------------------------------ heads */
  var CHARS = [
    { id: 'robo', name: 'روبو', spd: 2, jmp: 3, sht: 5, headR: 46, skin: '#8a97ad', shoe: '#2f9bff',
      desc: 'دقيق جدًا في التصويب',
      draw: function (c, r, o) {
        var lw = r * 0.08;
        line(c, 0, -r * 0.8, r * 0.08, -r * 1.22, lw);
        circ(c, r * 0.08, -r * 1.28, r * 0.15); fs(c, (Math.sin(o.t * 5) > 0 ? '#ff4d6d' : '#ffd23f'), lw * 0.8);
        rr(c, -r * 1.04, -r * 0.28, r * 0.24, r * 0.52, r * 0.08); fs(c, '#5d6d86', lw);
        rr(c, r * 0.8, -r * 0.28, r * 0.24, r * 0.52, r * 0.08); fs(c, '#5d6d86', lw);
        rr(c, -r * 0.9, -r * 0.88, r * 1.8, r * 1.72, r * 0.4);
        var g = c.createLinearGradient(0, -r, 0, r); g.addColorStop(0, '#dfe7f3'); g.addColorStop(1, '#8391aa');
        fs(c, g, lw);
        rr(c, -r * 0.55, -r * 0.5, r * 1.3, r * 0.64, r * 0.26); fs(c, '#1d2b4a', lw * 0.8);
        var ex = r * 0.12 + (o.lx || 0) * r * 0.08, ey = -r * 0.18 + (o.ly || 0) * r * 0.06;
        c.fillStyle = '#5ff2ff'; c.strokeStyle = '#5ff2ff'; c.lineWidth = r * 0.09; c.lineCap = 'round';
        [-r * 0.26, r * 0.26].forEach(function (d) {
          var x = ex + d;
          if (o.mood === 'happy') { c.beginPath(); c.arc(x, ey + r * 0.08, r * 0.12, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); }
          else if (o.mood === 'dizzy') { line(c, x - r * 0.1, ey - r * 0.1, x + r * 0.1, ey + r * 0.1, r * 0.07, '#5ff2ff'); line(c, x - r * 0.1, ey + r * 0.1, x + r * 0.1, ey - r * 0.1, r * 0.07, '#5ff2ff'); }
          else if (o.blink || o.mood === 'effort') { line(c, x - r * 0.12, ey, x + r * 0.12, ey, r * 0.07, '#5ff2ff'); }
          else { rr(c, x - r * 0.09, ey - r * 0.13, r * 0.18, r * 0.26, r * 0.07); c.fill(); }
        });
        rr(c, -r * 0.22, r * 0.3, r * 0.7, r * 0.3, r * 0.1); fs(c, '#4b5a73', lw * 0.7);
        if (o.mood === 'happy') { c.beginPath(); c.arc(r * 0.13, r * 0.32, r * 0.18, 0.2, Math.PI - 0.2); c.strokeStyle = '#5ff2ff'; c.lineWidth = r * 0.06; c.stroke(); }
        else for (var i = 0; i < 4; i++) line(c, -r * 0.1 + i * r * 0.15, r * 0.36, -r * 0.1 + i * r * 0.15, r * 0.54, r * 0.04, '#aab6c9');
        circ(c, -r * 0.7, -r * 0.66, r * 0.06); c.fillStyle = '#5d6d86'; c.fill();
        circ(c, r * 0.7, -r * 0.66, r * 0.06); c.fill();
      } },

    { id: 'alien', name: 'زيزو', spd: 4, jmp: 4, sht: 2, headR: 48, skin: '#7ddc4a', shoe: '#b55cff',
      desc: 'سريع ويقفز عاليًا',
      draw: function (c, r, o) {
        var lw = r * 0.08, sw = Math.sin(o.t * 4) * r * 0.08;
        line(c, -r * 0.3, -r * 0.8, -r * 0.55 + sw, -r * 1.3, lw);
        line(c, r * 0.3, -r * 0.8, r * 0.6 - sw, -r * 1.28, lw);
        circ(c, -r * 0.55 + sw, -r * 1.34, r * 0.14); fs(c, '#ff5fae', lw * 0.8);
        circ(c, r * 0.6 - sw, -r * 1.32, r * 0.14); fs(c, '#ffd23f', lw * 0.8);
        ell(c, 0, 0, r * 0.98, r * 0.95); fs(c, radial(c, r, '#b8ff7a', '#4fb52a'), lw);
        // big almond eyes
        var mood = o.mood;
        [[-r * 0.2, -1], [r * 0.42, 1]].forEach(function (e) {
          var x = e[0], y = -r * 0.12;
          if (mood === 'happy' || mood === 'dizzy' || o.blink) { eye(c, o, x, y, r * 0.2); return; }
          ell(c, x, y, r * 0.2, r * 0.28, e[1] * -0.35); fs(c, INK, lw * 0.5);
          ell(c, x + (o.lx || 0) * r * 0.05 - r * 0.05, y - r * 0.1 + (o.ly || 0) * r * 0.05, r * 0.07, r * 0.09); c.fillStyle = '#fff'; c.fill();
        });
        mouth(c, o, r * 0.12, r * 0.42, r * 0.2, { teeth: false });
        cheeks(c, r, -r * 0.45, r * 0.72, r * 0.25, '#2f9e1a');
      } },

    { id: 'granny', name: 'تيتا', spd: 3, jmp: 2, sht: 5, headR: 46, skin: '#f4c7a1', shoe: '#ff5fae',
      desc: 'الجدة القنّاصة',
      draw: function (c, r, o) {
        var lw = r * 0.08;
        circ(c, -r * 0.15, -r * 1.0, r * 0.36); fs(c, '#d8dbe6', lw);
        circ(c, 0, 0, r); fs(c, radial(c, r, '#ffe1c4', '#eab089'), lw);
        c.beginPath(); c.arc(0, 0, r, Math.PI * 1.02, Math.PI * 1.98); c.quadraticCurveTo(r * 0.3, -r * 0.35, -r * 0.1, -r * 0.45);
        c.quadraticCurveTo(-r * 0.6, -r * 0.4, -r, -r * 0.05); c.closePath(); fs(c, '#d8dbe6', lw);
        for (var i = 0; i < 4; i++) { circ(c, -r * 0.75 + i * r * 0.42, -r * 0.62 - Math.sin(i * 1.3) * r * 0.08, r * 0.18); fs(c, '#e8ebf3', lw * 0.6); }
        std(c, r, o, r * 0.12, -r * 0.05, r * 0.16, r * 0.3, r * 0.45, r * 0.22);
        c.lineWidth = lw * 0.8; c.strokeStyle = '#b54cd8';
        circ(c, r * 0.12 - r * 0.3, -r * 0.05, r * 0.26); c.stroke();
        circ(c, r * 0.12 + r * 0.3, -r * 0.05, r * 0.26); c.stroke();
        line(c, r * 0.08, -r * 0.08, r * 0.16, -r * 0.08, lw * 0.8, '#b54cd8');
        cheeks(c, r, -r * 0.35, r * 0.72, r * 0.3);
        circ(c, -r * 0.92, r * 0.3, r * 0.1); fs(c, '#ffd23f', lw * 0.5);
      } },

    { id: 'pizza', name: 'بيتزا', spd: 3, jmp: 3, sht: 4, headR: 48, skin: '#f0b98d', shoe: '#ff4d4d',
      desc: 'متوازن ولذيذ',
      draw: function (c, r, o) {
        var lw = r * 0.08;
        circ(c, 0, 0, r); fs(c, '#d9892e', lw);
        circ(c, 0, 0, r * 0.82); fs(c, radial(c, r, '#fff27a', '#ffc93a'), 0);
        c.fillStyle = '#ffe27a';
        for (var d = 0; d < 5; d++) { var a = d * 1.3 + 0.4; ell(c, Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.55 + r * 0.1, r * 0.16, r * 0.1, a); c.fill(); }
        [[-r * 0.55, -r * 0.45], [r * 0.6, -r * 0.4], [-r * 0.5, r * 0.45], [r * 0.52, r * 0.5], [-r * 0.05, -r * 0.62]].forEach(function (p) {
          circ(c, p[0], p[1], r * 0.14); fs(c, '#e0433a', lw * 0.4);
          circ(c, p[0] - r * 0.04, p[1] - r * 0.04, r * 0.04); c.fillStyle = '#ff8a7a'; c.fill();
        });
        [[r * 0.15, -r * 0.7], [-r * 0.75, 0.05 * r]].forEach(function (p) { ell(c, p[0], p[1], r * 0.09, r * 0.05, 0.6); c.fillStyle = '#3aa655'; c.fill(); });
        std(c, r, o, r * 0.12, -r * 0.1, r * 0.17, r * 0.28, r * 0.35, r * 0.25);
        c.beginPath(); c.moveTo(r * 0.12 - r * 0.38, r * 0.2);
        c.quadraticCurveTo(r * 0.12 - r * 0.2, r * 0.08, r * 0.12, r * 0.18); c.quadraticCurveTo(r * 0.12 + r * 0.2, r * 0.08, r * 0.12 + r * 0.38, r * 0.2);
        c.quadraticCurveTo(r * 0.12, r * 0.3, r * 0.12 - r * 0.38, r * 0.2); fs(c, '#6b3a1d', lw * 0.4);
      } },

    { id: 'astro', name: 'كابتن نجم', spd: 3, jmp: 5, sht: 2, headR: 50, skin: '#f2f4fa', shoe: '#ff9f1c',
      desc: 'يقفز كأنه على القمر',
      draw: function (c, r, o) {
        var lw = r * 0.08;
        circ(c, 0, 0, r); fs(c, radial(c, r, '#ffffff', '#c7cee0'), lw);
        rr(c, -r * 1.08, -r * 0.22, r * 0.2, r * 0.44, r * 0.08); fs(c, '#ff9f1c', lw * 0.7);
        ell(c, r * 0.14, r * 0.02, r * 0.72, r * 0.6); fs(c, '#243a78', lw);
        c.save(); ell(c, r * 0.14, r * 0.02, r * 0.72, r * 0.6); c.clip();
        var g = c.createLinearGradient(0, -r * 0.6, 0, r * 0.6); g.addColorStop(0, '#3e62c9'); g.addColorStop(1, '#162552');
        c.fillStyle = g; c.fillRect(-r, -r, r * 2, r * 2);
        circ(c, r * 0.14, r * 0.1, r * 0.5); c.fillStyle = 'rgba(255,214,170,0.9)'; c.fill();
        std(c, r, o, r * 0.18, -r * 0.02, r * 0.13, r * 0.22, r * 0.3, r * 0.17);
        c.globalAlpha = 0.55; c.fillStyle = '#fff';
        ell(c, -r * 0.2, -r * 0.3, r * 0.2, r * 0.07, -0.6); c.fill();
        c.globalAlpha = 1; c.restore();
        circ(c, -r * 0.1, -r * 0.8, r * 0.1); fs(c, '#ff4d6d', lw * 0.6);
        c.fillStyle = '#ffd23f'; star(c, -r * 0.62, r * 0.55, r * 0.14); c.fill();
      } },

    { id: 'dino', name: 'دينو', spd: 4, jmp: 3, sht: 3, headR: 46, skin: '#3fbf6a', shoe: '#ffd23f',
      desc: 'ديناصور سريع',
      draw: function (c, r, o) {
        var lw = r * 0.08;
        c.fillStyle = '#ff9f1c';
        for (var i = 0; i < 4; i++) {
          var a = Math.PI * 1.1 + i * 0.3, x = Math.cos(a) * r * 0.95, y = Math.sin(a) * r * 0.95;
          c.beginPath(); c.moveTo(x - r * 0.18, y + r * 0.06); c.lineTo(Math.cos(a) * r * 1.35, Math.sin(a) * r * 1.35); c.lineTo(x + r * 0.16, y + r * 0.1); c.closePath();
          fs(c, '#ff9f1c', lw * 0.7);
        }
        c.beginPath(); c.arc(-r * 0.12, 0, r * 0.9, Math.PI * 0.55, Math.PI * 1.75);
        c.quadraticCurveTo(r * 1.2, -r * 0.7, r * 1.12, r * 0.08); c.quadraticCurveTo(r * 1.08, r * 0.62, r * 0.2, r * 0.85); c.closePath();
        fs(c, radial(c, r, '#8ef0a6', '#2f9e55'), lw);
        c.fillStyle = '#c9f7cf'; ell(c, r * 0.35, r * 0.55, r * 0.5, r * 0.22, -0.1); c.fill();
        circ(c, r * 0.95, -r * 0.1, r * 0.05); c.fillStyle = INK; c.fill();
        circ(c, r * 0.8, -r * 0.14, r * 0.05); c.fill();
        eye(c, o, r * 0.1, -r * 0.35, r * 0.22, { brow: false });
        if (o.mood === 'happy') mouth(c, o, r * 0.55, r * 0.28, r * 0.35);
        else {
          c.beginPath(); c.moveTo(r * 0.1, r * 0.3); c.quadraticCurveTo(r * 0.6, r * (o.mood === 'sad' ? 0.18 : 0.5), r * 1.02, r * 0.2);
          c.lineWidth = lw; c.strokeStyle = INK; c.lineCap = 'round'; c.stroke();
          c.fillStyle = '#fff';
          for (var t = 0; t < 3; t++) { var tx = r * (0.35 + t * 0.2); c.beginPath(); c.moveTo(tx, r * 0.36 + t * 0.01 * r); c.lineTo(tx + r * 0.06, r * 0.5 - t * 0.04 * r); c.lineTo(tx + r * 0.12, r * 0.34); c.fill(); }
        }
        cheeks(c, r, -r * 0.3, 2 * r, r * 0.1);
      } },

    { id: 'king', name: 'الملك', spd: 2, jmp: 4, sht: 4, headR: 48, skin: '#f4c7a1', shoe: '#b54cd8',
      desc: 'ملك الملعب',
      draw: function (c, r, o) {
        var lw = r * 0.08;
        circ(c, 0, 0, r); fs(c, radial(c, r, '#ffe1c4', '#eab089'), lw);
        c.beginPath(); c.moveTo(-r * 0.75, -r * 0.55); c.lineTo(-r * 0.75, -r * 1.25); c.lineTo(-r * 0.4, -r * 0.95); c.lineTo(0, -r * 1.35);
        c.lineTo(r * 0.4, -r * 0.95); c.lineTo(r * 0.75, -r * 1.25); c.lineTo(r * 0.75, -r * 0.55); c.closePath();
        var g = c.createLinearGradient(0, -r * 1.3, 0, -r * 0.5); g.addColorStop(0, '#fff27a'); g.addColorStop(1, '#f2a900');
        fs(c, g, lw);
        circ(c, 0, -r * 0.78, r * 0.11); fs(c, '#ff4d6d', lw * 0.5);
        circ(c, -r * 0.45, -r * 0.72, r * 0.08); fs(c, '#2f9bff', lw * 0.5);
        circ(c, r * 0.45, -r * 0.72, r * 0.08); fs(c, '#3ddc84', lw * 0.5);
        // beard
        c.fillStyle = '#a85a2a';
        c.beginPath(); c.moveTo(-r * 0.85, r * 0.05);
        for (var i = 0; i <= 8; i++) { var a = Math.PI * (1 - i / 8); c.quadraticCurveTo(Math.cos(a + 0.2) * r * 1.1, r * 0.4 + Math.sin(a + 0.2) * r * 0.9, Math.cos(a) * r * 0.9, r * 0.2 + Math.sin(a) * r * 0.85); }
        c.closePath(); fs(c, '#a85a2a', lw);
        eye(c, o, r * 0.12 - r * 0.3, -r * 0.18, r * 0.15, { brow: true }); eye(c, o, r * 0.12 + r * 0.3, -r * 0.18, r * 0.16, { brow: true });
        circ(c, r * 0.2, r * 0.1, r * 0.13); fs(c, '#ff8f7a', lw * 0.5);
        c.save(); c.translate(0, r * 0.05); mouth(c, o, r * 0.2, r * 0.32, r * 0.22); c.restore();
      } },

    { id: 'penguin', name: 'ثلجي', spd: 5, jmp: 2, sht: 3, headR: 46, skin: '#2b2f45', shoe: '#ff9f1c',
      desc: 'أسرع لاعب في الثلج',
      draw: function (c, r, o) {
        var lw = r * 0.08;
        circ(c, 0, 0, r); fs(c, radial(c, r, '#4a5070', '#1e2236'), lw);
        c.beginPath(); c.moveTo(r * 0.15, -r * 0.4);
        c.bezierCurveTo(-r * 0.5, -r * 0.75, -r * 0.8, r * 0.1, -r * 0.2, r * 0.8);
        c.quadraticCurveTo(r * 0.4, r * 0.95, r * 0.9, r * 0.4);
        c.bezierCurveTo(r * 1.1, -r * 0.2, r * 0.8, -r * 0.75, r * 0.15, -r * 0.4); c.closePath(); fs(c, '#ffffff', 0);
        // beanie
        c.beginPath(); c.arc(0, -r * 0.1, r * 1.02, Math.PI * 1.08, Math.PI * 1.92); c.closePath(); fs(c, '#2f9bff', lw);
        rr(c, -r * 1.02, -r * 0.62, r * 2.04, r * 0.26, r * 0.1); fs(c, '#ffffff', lw * 0.8);
        circ(c, 0, -r * 1.2, r * 0.2); fs(c, '#ff5fae', lw * 0.7);
        for (var i = -2; i <= 2; i++) line(c, i * r * 0.3, -r * 0.62, i * r * 0.26, -r * 0.95, lw * 0.4, '#8fd0ff');
        std(c, r, o, r * 0.18, -r * 0.1, r * 0.15, r * 0.26, r * 0.5, r * 0.16);
        c.beginPath(); c.moveTo(r * 0.1, r * 0.14); c.quadraticCurveTo(r * 0.55, r * 0.12, r * 0.72, r * 0.26); c.quadraticCurveTo(r * 0.45, r * 0.42, r * 0.1, r * 0.3); c.closePath();
        fs(c, '#ffab2e', lw * 0.7);
        cheeks(c, r, -r * 0.28, r * 0.72, r * 0.22);
      } },

    { id: 'cat', name: 'قطّوز', spd: 4, jmp: 4, sht: 2, headR: 46, skin: '#ff9f40', shoe: '#2fd3c3',
      desc: 'رشيق كالقطط',
      draw: function (c, r, o) {
        var lw = r * 0.08;
        [[-1, -0.55], [1, 0.55]].forEach(function (e) {
          var x = e[1] * r;
          c.beginPath(); c.moveTo(x - r * 0.38, -r * 0.6); c.lineTo(x + e[0] * r * 0.12, -r * 1.3); c.lineTo(x + r * 0.38, -r * 0.6); c.closePath(); fs(c, '#ff9f40', lw);
          c.beginPath(); c.moveTo(x - r * 0.2, -r * 0.7); c.lineTo(x + e[0] * r * 0.08, -r * 1.08); c.lineTo(x + r * 0.2, -r * 0.7); c.closePath(); c.fillStyle = '#ffb3c6'; c.fill();
        });
        circ(c, 0, 0, r); fs(c, radial(c, r, '#ffc27a', '#f07f1f'), lw);
        c.fillStyle = '#d9620f';
        for (var i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(i * r * 0.25 - r * 0.07, -r * 0.98); c.lineTo(i * r * 0.22, -r * 0.62); c.lineTo(i * r * 0.25 + r * 0.07, -r * 0.98); c.fill(); }
        rr(c, -r * 1.0, -r * 0.62, r * 2, r * 0.22, r * 0.08); fs(c, '#ff4d6d', lw * 0.7);
        c.fillStyle = '#fff'; c.fillRect(-r * 0.2, -r * 0.6, r * 0.4, r * 0.18);
        c.fillStyle = '#fff4e6'; ell(c, r * 0.25, r * 0.42, r * 0.45, r * 0.32); c.fill();
        std(c, r, o, r * 0.14, -r * 0.1, r * 0.17, r * 0.3, r * 0.52, r * 0.16);
        c.beginPath(); c.moveTo(r * 0.14, r * 0.3); c.lineTo(r * 0.02, r * 0.2); c.lineTo(r * 0.26, r * 0.2); c.closePath(); fs(c, '#ff6b8a', lw * 0.4);
        [-1, 1].forEach(function (s) {
          line(c, r * 0.14 + s * r * 0.4, r * 0.3, r * 0.14 + s * r * 0.95, r * 0.22, lw * 0.4);
          line(c, r * 0.14 + s * r * 0.4, r * 0.4, r * 0.14 + s * r * 0.95, r * 0.46, lw * 0.4);
        });
      } },

    { id: 'monster', name: 'فروي', spd: 3, jmp: 5, sht: 2, headR: 50, skin: '#9b5cff', shoe: '#3ddc84',
      desc: 'وحش القفز اللطيف',
      draw: function (c, r, o) {
        var lw = r * 0.08;
        [[-0.5, -1], [0.55, 1]].forEach(function (h) {
          c.beginPath(); c.moveTo(h[0] * r - r * 0.16, -r * 0.8); c.quadraticCurveTo(h[0] * r + h[1] * r * 0.1, -r * 1.35, h[0] * r + h[1] * r * 0.3, -r * 1.3);
          c.quadraticCurveTo(h[0] * r + h[1] * r * 0.1, -r * 1.0, h[0] * r + r * 0.16, -r * 0.75); c.closePath(); fs(c, '#fff4d6', lw * 0.8);
        });
        c.beginPath();
        var n = 22;
        for (var i = 0; i <= n; i++) {
          var a = i / n * TAU, rad = r * (i % 2 ? 0.94 : 1.06) + Math.sin(o.t * 6 + i) * r * 0.015;
          if (i === 0) c.moveTo(Math.cos(a) * rad, Math.sin(a) * rad); else c.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
        }
        c.closePath(); fs(c, radial(c, r, '#c49bff', '#7a3fe0'), lw);
        eye(c, o, r * 0.18, -r * 0.2, r * 0.36, { pupil: 0.45, pupilCol: '#1d8a4a' });
        mouth(c, o, r * 0.2, r * 0.42, r * 0.3);
        if (o.mood !== 'happy') {
          c.fillStyle = '#fff';
          c.beginPath(); c.moveTo(r * 0.0, r * 0.4); c.lineTo(r * 0.06, r * 0.56); c.lineTo(r * 0.12, r * 0.42); c.fill(); c.stroke();
          c.beginPath(); c.moveTo(r * 0.3, r * 0.42); c.lineTo(r * 0.36, r * 0.56); c.lineTo(r * 0.42, r * 0.4); c.fill(); c.stroke();
        }
        cheeks(c, r, -r * 0.3, r * 0.72, r * 0.3, '#ff5fae');
      } },

    /* ---------------- secret characters ---------------- */
    { id: 'melon', name: 'بطيخة', spd: 4, jmp: 4, sht: 4, headR: 48, skin: '#f0b98d', shoe: '#ff4d6d', secret: true,
      unlock: { type: 'cup', cup: 'b', text: 'اربح الكأس البرونزية' },
      desc: 'منعشة وقوية',
      draw: function (c, r, o) {
        var lw = r * 0.08;
        circ(c, 0, 0, r); fs(c, radial(c, r, '#8bea6c', '#2e9a3a'), lw);
        c.save(); circ(c, 0, 0, r); c.clip();
        c.strokeStyle = '#1f6e2a'; c.lineWidth = r * 0.12;
        for (var i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(i * r * 0.42, -r * 1.1); c.bezierCurveTo(i * r * 0.55 + r * 0.15, -r * 0.4, i * r * 0.55 - r * 0.15, r * 0.4, i * r * 0.42, r * 1.1); c.stroke(); }
        c.restore();
        c.beginPath(); c.moveTo(0, -r * 0.95); c.quadraticCurveTo(r * 0.05, -r * 1.3, r * 0.3, -r * 1.3); c.lineWidth = lw; c.strokeStyle = '#6b3a1d'; c.stroke();
        ell(c, r * 0.42, -r * 1.2, r * 0.2, r * 0.1, -0.4); fs(c, '#3ddc84', lw * 0.6);
        ell(c, r * 0.14, r * 0.02, r * 0.7, r * 0.6); c.fillStyle = 'rgba(255,255,255,0.28)'; c.fill();
        std(c, r, o, r * 0.14, -r * 0.1, r * 0.17, r * 0.3, r * 0.4, r * 0.24);
        cheeks(c, r, -r * 0.35, r * 0.72, r * 0.25);
      } },

    { id: 'sun', name: 'شمسون', spd: 4, jmp: 5, sht: 3, headR: 46, skin: '#ffb938', shoe: '#ff4d6d', secret: true,
      unlock: { type: 'dunks', n: 15, text: 'سجّل 15 دانك' },
      desc: 'ساخن جدًا في القفز',
      draw: function (c, r, o) {
        var lw = r * 0.08;
        c.save(); c.rotate(o.t * 0.8);
        for (var i = 0; i < 12; i++) {
          c.rotate(TAU / 12);
          c.beginPath(); c.moveTo(r * 0.85, -r * 0.18); c.lineTo(r * 1.38, 0); c.lineTo(r * 0.85, r * 0.18); c.closePath(); fs(c, i % 2 ? '#ffd23f' : '#ff9f1c', lw * 0.6);
        }
        c.restore();
        circ(c, 0, 0, r); fs(c, radial(c, r, '#fff27a', '#ffb31a'), lw);
        if (o.mood === 'dizzy' || o.mood === 'sad') std(c, r, o, r * 0.14, -r * 0.12, r * 0.17, r * 0.3, r * 0.4, r * 0.25);
        else {
          c.beginPath(); c.moveTo(-r * 0.5, -r * 0.3); c.lineTo(r * 0.85, -r * 0.3); c.lineTo(r * 0.78, -r * 0.05);
          c.quadraticCurveTo(r * 0.5, r * 0.1, r * 0.3, -r * 0.08); c.lineTo(r * 0.0, -r * 0.08);
          c.quadraticCurveTo(-r * 0.2, r * 0.1, -r * 0.45, -r * 0.05); c.closePath(); fs(c, '#1d1235', lw * 0.5);
          c.fillStyle = 'rgba(255,255,255,0.5)'; c.fillRect(-r * 0.35, -r * 0.24, r * 0.15, r * 0.06); c.fillRect(r * 0.4, -r * 0.24, r * 0.15, r * 0.06);
          mouth(c, o.mood === 'normal' ? { mood: 'happy', t: o.t } : o, r * 0.18, r * 0.35, r * 0.28);
        }
        cheeks(c, r, -r * 0.45, r * 0.8, r * 0.2, '#ff5f3d');
      } },

    { id: 'falcon', name: 'صقر', spd: 4, jmp: 3, sht: 5, headR: 46, skin: '#a0622d', shoe: '#ffd23f', secret: true,
      unlock: { type: 'threes', n: 20, text: 'سجّل 20 رمية ثلاثية' },
      desc: 'عين الصقر لا تخطئ',
      draw: function (c, r, o) {
        var lw = r * 0.08;
        for (var i = 0; i < 3; i++) { c.beginPath(); c.moveTo(-r * 0.6 + i * r * 0.2, -r * 0.7); c.quadraticCurveTo(-r * 1.0 + i * r * 0.15, -r * 1.2, -r * 1.2 + i * r * 0.25, -r * 1.05 + i * r * 0.1); c.quadraticCurveTo(-r * 0.8, -r * 0.8, -r * 0.3 + i * r * 0.2, -r * 0.6); fs(c, '#7a4518', lw * 0.6); }
        circ(c, 0, 0, r); fs(c, radial(c, r, '#c98647', '#7a4518'), lw);
        c.beginPath(); c.moveTo(-r * 0.2, -r * 0.55); c.quadraticCurveTo(r * 1.0, -r * 0.7, r * 0.95, r * 0.1); c.quadraticCurveTo(r * 0.8, r * 0.9, -r * 0.1, r * 0.85); c.quadraticCurveTo(-r * 0.5, r * 0.1, -r * 0.2, -r * 0.55); c.closePath();
        fs(c, '#fff4de', 0);
        eye(c, o, r * 0.02, -r * 0.18, r * 0.17, { brow: true, white: '#fff27a' }); eye(c, o, r * 0.5, -r * 0.18, r * 0.18, { brow: true, white: '#fff27a' });
        c.beginPath(); c.moveTo(r * 0.12, r * 0.08); c.quadraticCurveTo(r * 0.7, -r * 0.05, r * 0.95, r * 0.25); c.quadraticCurveTo(r * 0.98, r * 0.5, r * 0.78, r * 0.55);
        c.quadraticCurveTo(r * 0.75, r * 0.32, r * 0.2, r * 0.36); c.closePath(); fs(c, '#ffb31a', lw * 0.8);
        if (o.mood === 'happy') { c.beginPath(); c.moveTo(r * 0.2, r * 0.4); c.quadraticCurveTo(r * 0.5, r * 0.62, r * 0.75, r * 0.5); c.lineWidth = lw * 0.8; c.strokeStyle = INK; c.stroke(); }
      } },

    { id: 'blaze', name: 'لهيب', spd: 5, jmp: 4, sht: 4, headR: 46, skin: '#ff7a3d', shoe: '#ffd23f', secret: true, fireStart: true,
      unlock: { type: 'cup', cup: 's', text: 'اربح الكأس الفضية' },
      desc: 'يبدأ كل مباراة وهو مشتعل تقريبًا',
      draw: function (c, r, o) {
        var lw = r * 0.08;
        c.beginPath(); c.moveTo(-r * 0.95, -r * 0.1);
        for (var i = 0; i <= 6; i++) {
          var x = -r * 0.95 + i * r * 0.32, h = r * (0.9 + (i % 2) * 0.35 + Math.sin(o.t * 12 + i * 2) * 0.12);
          c.quadraticCurveTo(x - r * 0.1, -r * 0.6, x + r * 0.06, -h - r * 0.2);
          c.quadraticCurveTo(x + r * 0.1, -r * 0.6, x + r * 0.16, -r * 0.5);
        }
        c.lineTo(r * 0.95, -r * 0.1); c.closePath();
        var fg = c.createLinearGradient(0, -r * 1.4, 0, 0); fg.addColorStop(0, '#fff27a'); fg.addColorStop(0.5, '#ff9f1c'); fg.addColorStop(1, '#ff3d3d');
        fs(c, fg, lw * 0.7);
        circ(c, 0, 0, r * 0.95); fs(c, radial(c, r, '#ffb37a', '#ff5a2a'), lw);
        std(c, r, o, r * 0.14, -r * 0.08, r * 0.17, r * 0.3, r * 0.4, r * 0.26);
        line(c, r * 0.14 - r * 0.46, -r * 0.4, r * 0.14 - r * 0.14, -r * 0.3, lw);
        line(c, r * 0.14 + r * 0.46, -r * 0.4, r * 0.14 + r * 0.14, -r * 0.3, lw);
      } },

    { id: 'legend', name: 'الأسطورة', spd: 5, jmp: 5, sht: 5, headR: 48, skin: '#f2b92e', shoe: '#ffffff', secret: true,
      unlock: { type: 'cup', cup: 'g', text: 'اربح الكأس الذهبية' },
      desc: 'الأفضل في كل شيء',
      draw: function (c, r, o) {
        var lw = r * 0.08;
        circ(c, 0, 0, r); var g = c.createLinearGradient(-r, -r, r, r); g.addColorStop(0, '#fff6b0'); g.addColorStop(0.45, '#ffc93a'); g.addColorStop(1, '#c98a00');
        fs(c, g, lw);
        rr(c, -r * 1.0, -r * 0.62, r * 2, r * 0.28, r * 0.1); fs(c, '#ff4d6d', lw * 0.8);
        c.fillStyle = '#fff'; star(c, 0, -r * 0.48, r * 0.16); c.fill();
        std(c, r, o, r * 0.14, -r * 0.05, r * 0.17, r * 0.3, r * 0.42, r * 0.26, { brow: true });
        c.globalAlpha = 0.5 + 0.5 * Math.sin(o.t * 5); c.fillStyle = '#fff';
        star(c, -r * 0.6, r * 0.2, r * 0.12); c.fill(); star(c, r * 0.75, -r * 0.8, r * 0.1); c.fill();
        c.globalAlpha = 1;
      } }
  ];

  function star(c, x, y, r) {
    c.beginPath();
    for (var i = 0; i < 10; i++) {
      var a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r * 0.45 : r;
      if (i === 0) c.moveTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad); else c.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
    }
    c.closePath();
  }

  window.HH = window.HH || {};
  HH.CHARS = CHARS;
  HH.INK = INK;
  HH.art = { circ: circ, ell: ell, rr: rr, fs: fs, line: line, star: star };
})();
