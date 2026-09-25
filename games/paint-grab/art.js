/* Paint Grab — art: colors, territory patterns, cute blob heads with faces. All drawn in code. */
(function () {
  'use strict';
  var PG = window.PG = window.PG || {};
  var Art = PG.Art = {};

  function hexToRgb(h) { h = h.replace('#', ''); return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)]; }
  function mix(c, d, t) { return [Math.round(c[0] + (d[0] - c[0]) * t), Math.round(c[1] + (d[1] - c[1]) * t), Math.round(c[2] + (d[2] - c[2]) * t)]; }
  function css(c, a) { return a == null ? 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')' : 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function u32(c) { return ((255 << 24) | (c[2] << 16) | (c[1] << 8) | c[0]) >>> 0; }
  function hsl(h, s, l) {
    s /= 100; l /= 100;
    var k = function (n) { return (n + h / 30) % 12; };
    var a = s * Math.min(l, 1 - l);
    var f = function (n) { return l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); };
    return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
  }
  Art.hexToRgb = hexToRgb; Art.mix = mix; Art.css = css; Art.u32 = u32;
  var WHITE = [255, 255, 255], BLACK = [20, 16, 40];

  function tones(base) {
    return {
      base: base, light: mix(base, WHITE, 0.38), dark: mix(base, BLACK, 0.2), shade: mix(base, BLACK, 0.34),
      ink: mix(base, BLACK, 0.55), flash: mix(base, WHITE, 0.72)
    };
  }

  // Build a resolved skin used by the renderer.
  Art.makeSkin = function (colorIdx, faceIdx, patIdx, extra) {
    var col = PG.COLORS[colorIdx] || PG.COLORS[0];
    var base = hexToRgb(col.hex);
    var t = tones(base);
    var sk = {
      colorIdx: colorIdx, faceIdx: faceIdx, patIdx: patIdx,
      special: col.special || null,
      face: (PG.FACES[faceIdx] || PG.FACES[0]).id,
      pattern: (PG.PATTERNS[patIdx] || PG.PATTERNS[0]).id,
      rgb: t,
      c: { base: css(t.base), light: css(t.light), dark: css(t.dark), ink: css(t.ink), trail: css(t.light, 0.82), trailEdge: css(t.base, 0.9) },
      u: { base: u32(t.base), light: u32(t.light), dark: u32(t.dark), shade: u32(t.shade), flash: u32(t.flash) },
      brows: extra && extra.brows || null
    };
    if (sk.special === 'rainbow') {
      sk.rainbow = [];
      for (var i = 0; i < 60; i++) {
        var rb = tones(hsl(i * 6, 90, 68));
        sk.rainbow.push({ base: u32(rb.base), light: u32(rb.light), dark: u32(rb.dark), shade: u32(rb.shade), flash: u32(rb.flash) });
      }
    }
    if (sk.special === 'gold') {
      var g2 = tones([255, 214, 70]);
      sk.gold2 = { base: u32(g2.light), light: u32(mix(g2.light, WHITE, 0.6)) };
    }
    return sk;
  };

  // Texel color for cell (cx,cy), sub-texel (px,py) in 0..3
  Art.texel = function (sk, cx, cy, px, py) {
    var U = sk.u;
    if (sk.rainbow) U = sk.rainbow[((cx + cy) >> 1) % 60];
    var k = 0;
    switch (sk.pattern) {
      case 'checker': k = (cx + cy) & 1; break;
      case 'stripes': k = ((cx + cy) >> 1) & 1; break;
      case 'dots': k = ((cx & 1) === 0 && (cy & 1) === 0 && px >= 1 && px <= 2 && py >= 1 && py <= 2) ? 1 : 0; break;
      case 'tiles': k = ((cx % 3 === 0 && px === 0) || (cy % 3 === 0 && py === 0)) ? 2 : 0; break;
      case 'bricks': k = (((cy & 1) === 1 && py === 3) || (((cx + ((cy >> 1) & 1) * 2) & 3) === 0 && px === 0)) ? 1 : 0; break;
      case 'zigzag': { var v = cy % 6, z = v < 3 ? v : 6 - v; k = ((cx + z) % 6) < 2 ? 1 : 0; break; }
    }
    if (sk.special === 'gold') {
      var hsh = ((cx * 73856093) ^ (cy * 19349663)) >>> 0;
      if ((hsh % 11) === 0 && px === 1 && py === 1) return sk.gold2.light;
      if (k === 0 && (hsh % 3) === 0) return sk.gold2.base;
    }
    return k === 1 ? U.light : k === 2 ? U.dark : U.base;
  };
  Art.shadeOf = function (sk, cx, cy) { return sk.rainbow ? sk.rainbow[((cx + cy) >> 1) % 60].shade : sk.u.shade; };
  Art.flashOf = function (sk, cx, cy) { return sk.rainbow ? sk.rainbow[((cx + cy) >> 1) % 60].flash : sk.u.flash; };
  Art.baseOf = function (sk, cx, cy) { return sk.rainbow ? sk.rainbow[((cx + cy) >> 1) % 60].base : sk.u.base; };

  /* ------------------------------------------------------------ blob heads */
  var INK = '#2b2350';

  function eye(ctx, x, y, r, lx, ly, blink) {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (blink ? 0.15 : 1.08), 0, 0, 6.2832);
    ctx.fill();
    ctx.lineWidth = r * 0.28; ctx.strokeStyle = INK; ctx.stroke();
    if (blink) return;
    ctx.fillStyle = INK;
    ctx.beginPath(); ctx.arc(x + lx * r * 0.38, y + ly * r * 0.38, r * 0.52, 0, 6.2832); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(x + lx * r * 0.38 - r * 0.2, y + ly * r * 0.38 - r * 0.22, r * 0.18, 0, 6.2832); ctx.fill();
  }
  function smile(ctx, r, w, open) {
    ctx.strokeStyle = INK; ctx.lineWidth = r * 0.09; ctx.lineCap = 'round';
    if (open) {
      ctx.fillStyle = '#8a2446';
      ctx.beginPath(); ctx.moveTo(-r * w, r * 0.22); ctx.quadraticCurveTo(0, r * 0.78, r * w, r * 0.22); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ff8fb1';
      ctx.beginPath(); ctx.ellipse(0, r * 0.44, r * w * 0.45, r * 0.12, 0, 0, 6.2832); ctx.fill();
    } else {
      ctx.beginPath(); ctx.moveTo(-r * w, r * 0.28); ctx.quadraticCurveTo(0, r * 0.56, r * w, r * 0.28); ctx.stroke();
    }
  }
  function cheeks(ctx, r) {
    ctx.fillStyle = 'rgba(255,110,150,0.45)';
    ctx.beginPath(); ctx.ellipse(-r * 0.62, r * 0.22, r * 0.16, r * 0.1, 0, 0, 6.2832); ctx.fill();
    ctx.beginPath(); ctx.ellipse(r * 0.62, r * 0.22, r * 0.16, r * 0.1, 0, 0, 6.2832); ctx.fill();
  }
  function star(ctx, x, y, R, rIn) {
    ctx.beginPath();
    for (var i = 0; i < 10; i++) {
      var a = -Math.PI / 2 + i * Math.PI / 5, rr = i & 1 ? rIn : R;
      if (i) ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); else ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
  }
  function heart(ctx, x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.9);
    ctx.bezierCurveTo(x - s * 1.4, y - s * 0.1, x - s * 0.6, y - s * 1.2, x, y - s * 0.35);
    ctx.bezierCurveTo(x + s * 0.6, y - s * 1.2, x + s * 1.4, y - s * 0.1, x, y + s * 0.9);
    ctx.closePath();
  }
  Art.star = star; Art.heart = heart;

  // Parts drawn behind the body (ears etc.)
  function back(ctx, sk, r, t) {
    var f = sk.face;
    ctx.lineWidth = r * 0.12; ctx.strokeStyle = sk.c.ink; ctx.lineJoin = 'round';
    if (f === 'cat') {
      ctx.fillStyle = sk.c.base;
      [-1, 1].forEach(function (s) {
        ctx.beginPath(); ctx.moveTo(s * r * 0.85, -r * 0.35); ctx.lineTo(s * r * 0.75, -r * 1.25); ctx.lineTo(s * r * 0.2, -r * 0.8); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ffb3cc';
        ctx.beginPath(); ctx.moveTo(s * r * 0.7, -r * 0.55); ctx.lineTo(s * r * 0.68, -r * 1.02); ctx.lineTo(s * r * 0.36, -r * 0.78); ctx.closePath(); ctx.fill();
        ctx.fillStyle = sk.c.base;
      });
    } else if (f === 'bunny') {
      [-1, 1].forEach(function (s) {
        ctx.save(); ctx.translate(s * r * 0.4, -r * 0.7); ctx.rotate(s * (0.18 + Math.sin(t * 5) * 0.06));
        ctx.fillStyle = sk.c.base;
        ctx.beginPath(); ctx.ellipse(0, -r * 0.6, r * 0.26, r * 0.7, 0, 0, 6.2832); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ffb3cc';
        ctx.beginPath(); ctx.ellipse(0, -r * 0.6, r * 0.12, r * 0.5, 0, 0, 6.2832); ctx.fill();
        ctx.restore();
      });
    } else if (f === 'ninja') {
      ctx.fillStyle = '#e8414f';
      var wv = Math.sin(t * 12) * r * 0.12;
      ctx.beginPath(); ctx.moveTo(r * 0.8, -r * 0.25); ctx.quadraticCurveTo(r * 1.3, -r * 0.2 + wv, r * 1.55, r * 0.05 + wv); ctx.lineTo(r * 1.4, r * 0.25 + wv); ctx.quadraticCurveTo(r * 1.1, r * 0.05, r * 0.8, r * 0.05); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  }

  function front(ctx, sk, r, lx, ly, t, blink) {
    var f = sk.face;
    var ex = r * 0.36, ey = -r * 0.12, er = r * 0.27;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    switch (f) {
      case 'happy':
        ctx.strokeStyle = INK; ctx.lineWidth = r * 0.11;
        ctx.beginPath(); ctx.arc(-ex, ey + r * 0.06, er * 0.8, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
        ctx.beginPath(); ctx.arc(ex, ey + r * 0.06, er * 0.8, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
        cheeks(ctx, r); smile(ctx, r, 0.34, true);
        break;
      case 'cool':
        ctx.fillStyle = INK;
        ctx.beginPath(); ctx.ellipse(-ex, ey, er * 1.25, er * 0.95, 0, 0, 6.2832); ctx.fill();
        ctx.beginPath(); ctx.ellipse(ex, ey, er * 1.25, er * 0.95, 0, 0, 6.2832); ctx.fill();
        ctx.fillRect(-ex, ey - er * 0.5, ex * 2, er * 0.35);
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath(); ctx.ellipse(-ex - er * 0.4, ey - er * 0.35, er * 0.35, er * 0.18, -0.4, 0, 6.2832); ctx.fill();
        ctx.beginPath(); ctx.ellipse(ex - er * 0.4, ey - er * 0.35, er * 0.35, er * 0.18, -0.4, 0, 6.2832); ctx.fill();
        ctx.strokeStyle = INK; ctx.lineWidth = r * 0.09;
        ctx.beginPath(); ctx.moveTo(-r * 0.25, r * 0.36); ctx.quadraticCurveTo(r * 0.1, r * 0.5, r * 0.32, r * 0.28); ctx.stroke();
        break;
      case 'cat':
        eye(ctx, -ex, ey, er, lx, ly, blink); eye(ctx, ex, ey, er, lx, ly, blink);
        ctx.fillStyle = '#ff7aa2'; ctx.beginPath(); ctx.moveTo(-r * 0.08, r * 0.15); ctx.lineTo(r * 0.08, r * 0.15); ctx.lineTo(0, r * 0.25); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = INK; ctx.lineWidth = r * 0.07;
        ctx.beginPath(); ctx.moveTo(0, r * 0.25); ctx.quadraticCurveTo(-r * 0.12, r * 0.42, -r * 0.24, r * 0.3); ctx.moveTo(0, r * 0.25); ctx.quadraticCurveTo(r * 0.12, r * 0.42, r * 0.24, r * 0.3); ctx.stroke();
        ctx.lineWidth = r * 0.04;
        ctx.beginPath(); ctx.moveTo(-r * 0.4, r * 0.22); ctx.lineTo(-r * 0.85, r * 0.12); ctx.moveTo(-r * 0.4, r * 0.3); ctx.lineTo(-r * 0.85, r * 0.36);
        ctx.moveTo(r * 0.4, r * 0.22); ctx.lineTo(r * 0.85, r * 0.12); ctx.moveTo(r * 0.4, r * 0.3); ctx.lineTo(r * 0.85, r * 0.36); ctx.stroke();
        break;
      case 'stars':
        ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = INK; ctx.lineWidth = r * 0.07;
        var sp = 1 + Math.sin(t * 8) * 0.08;
        star(ctx, -ex, ey, er * 1.25 * sp, er * 0.55 * sp); ctx.fill(); ctx.stroke();
        star(ctx, ex, ey, er * 1.25 * sp, er * 0.55 * sp); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#8a2446'; ctx.beginPath(); ctx.ellipse(0, r * 0.38, r * 0.14, r * 0.17, 0, 0, 6.2832); ctx.fill(); ctx.stroke();
        break;
      case 'tongue':
        ctx.strokeStyle = INK; ctx.lineWidth = r * 0.1;
        ctx.beginPath(); ctx.moveTo(-ex - er * 0.7, ey - er * 0.6); ctx.lineTo(-ex + er * 0.6, ey); ctx.lineTo(-ex - er * 0.7, ey + er * 0.6); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ex + er * 0.7, ey - er * 0.6); ctx.lineTo(ex - er * 0.6, ey); ctx.lineTo(ex + er * 0.7, ey + er * 0.6); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-r * 0.3, r * 0.28); ctx.quadraticCurveTo(0, r * 0.42, r * 0.3, r * 0.28); ctx.stroke();
        ctx.fillStyle = '#ff6f91';
        ctx.beginPath(); ctx.moveTo(-r * 0.12, r * 0.34); ctx.lineTo(-r * 0.12, r * 0.52); ctx.arc(0, r * 0.52, r * 0.12, Math.PI, 0, true); ctx.lineTo(r * 0.12, r * 0.34); ctx.closePath(); ctx.fill();
        ctx.lineWidth = r * 0.06; ctx.stroke();
        cheeks(ctx, r);
        break;
      case 'hearts':
        ctx.fillStyle = '#ff3d6e'; ctx.strokeStyle = INK; ctx.lineWidth = r * 0.06;
        var hp = 1 + Math.max(0, Math.sin(t * 7)) * 0.15;
        heart(ctx, -ex, ey, er * 0.95 * hp); ctx.fill(); ctx.stroke();
        heart(ctx, ex, ey, er * 0.95 * hp); ctx.fill(); ctx.stroke();
        cheeks(ctx, r); smile(ctx, r, 0.28, false);
        break;
      case 'crown':
        eye(ctx, -ex, ey, er, lx, ly, blink); eye(ctx, ex, ey, er, lx, ly, blink);
        smile(ctx, r, 0.3, false);
        break;
      case 'ninja':
        ctx.fillStyle = '#e8414f';
        ctx.fillRect(-r * 0.97, ey - er * 1.1, r * 1.94, er * 2.2);
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.ellipse(-ex, ey, er * 0.9, er * 0.55, 0.15, 0, 6.2832); ctx.fill();
        ctx.beginPath(); ctx.ellipse(ex, ey, er * 0.9, er * 0.55, -0.15, 0, 6.2832); ctx.fill();
        ctx.fillStyle = INK;
        ctx.beginPath(); ctx.arc(-ex + lx * er * 0.35, ey + ly * er * 0.2, er * 0.4, 0, 6.2832); ctx.fill();
        ctx.beginPath(); ctx.arc(ex + lx * er * 0.35, ey + ly * er * 0.2, er * 0.4, 0, 6.2832); ctx.fill();
        ctx.strokeStyle = INK; ctx.lineWidth = r * 0.08;
        ctx.beginPath(); ctx.moveTo(-r * 0.18, r * 0.4); ctx.lineTo(r * 0.18, r * 0.4); ctx.stroke();
        break;
      case 'robot':
        ctx.fillStyle = INK;
        ctx.fillRect(-ex - er, ey - er, er * 2, er * 2); ctx.fillRect(ex - er, ey - er, er * 2, er * 2);
        ctx.fillStyle = blink ? '#1d5a70' : '#5ff2ff';
        ctx.fillRect(-ex - er * 0.6 + lx * er * 0.25, ey - er * 0.6 + ly * er * 0.25, er * 1.2, er * 1.2);
        ctx.fillRect(ex - er * 0.6 + lx * er * 0.25, ey - er * 0.6 + ly * er * 0.25, er * 1.2, er * 1.2);
        ctx.fillStyle = '#fff'; ctx.strokeStyle = INK; ctx.lineWidth = r * 0.06;
        ctx.fillRect(-r * 0.3, r * 0.28, r * 0.6, r * 0.2); ctx.strokeRect(-r * 0.3, r * 0.28, r * 0.6, r * 0.2);
        ctx.beginPath(); ctx.moveTo(-r * 0.1, r * 0.28); ctx.lineTo(-r * 0.1, r * 0.48); ctx.moveTo(r * 0.1, r * 0.28); ctx.lineTo(r * 0.1, r * 0.48); ctx.stroke();
        break;
      case 'alien':
        eye(ctx, -ex * 1.1, ey + r * 0.05, er * 0.8, lx, ly, blink);
        eye(ctx, ex * 1.1, ey + r * 0.05, er * 0.8, lx, ly, blink);
        eye(ctx, 0, ey - r * 0.3, er * 0.95, lx, ly, blink);
        ctx.strokeStyle = INK; ctx.lineWidth = r * 0.08;
        ctx.beginPath(); ctx.arc(0, r * 0.3, r * 0.16, 0.2, Math.PI - 0.2); ctx.stroke();
        break;
      case 'bunny':
        eye(ctx, -ex, ey, er, lx, ly, blink); eye(ctx, ex, ey, er, lx, ly, blink);
        ctx.fillStyle = '#ff7aa2'; ctx.beginPath(); ctx.ellipse(0, r * 0.16, r * 0.09, r * 0.06, 0, 0, 6.2832); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.strokeStyle = INK; ctx.lineWidth = r * 0.05;
        ctx.fillRect(-r * 0.11, r * 0.3, r * 0.1, r * 0.16); ctx.strokeRect(-r * 0.11, r * 0.3, r * 0.1, r * 0.16);
        ctx.fillRect(r * 0.01, r * 0.3, r * 0.1, r * 0.16); ctx.strokeRect(r * 0.01, r * 0.3, r * 0.1, r * 0.16);
        ctx.lineWidth = r * 0.07; ctx.beginPath(); ctx.moveTo(-r * 0.22, r * 0.28); ctx.quadraticCurveTo(0, r * 0.36, r * 0.22, r * 0.28); ctx.stroke();
        cheeks(ctx, r);
        break;
      default: // classic
        eye(ctx, -ex, ey, er, lx, ly, blink); eye(ctx, ex, ey, er, lx, ly, blink);
        smile(ctx, r, 0.22, false);
    }
    // bot personality brows
    if (sk.brows === 'angry') {
      ctx.strokeStyle = INK; ctx.lineWidth = r * 0.11;
      ctx.beginPath(); ctx.moveTo(-ex - er, ey - er * 1.5); ctx.lineTo(-ex + er * 0.8, ey - er * 0.9);
      ctx.moveTo(ex + er, ey - er * 1.5); ctx.lineTo(ex - er * 0.8, ey - er * 0.9); ctx.stroke();
    } else if (sk.brows === 'worried') {
      ctx.strokeStyle = INK; ctx.lineWidth = r * 0.09;
      ctx.beginPath(); ctx.moveTo(-ex - er, ey - er * 1.0); ctx.lineTo(-ex + er * 0.7, ey - er * 1.6);
      ctx.moveTo(ex + er, ey - er * 1.0); ctx.lineTo(ex - er * 0.7, ey - er * 1.6); ctx.stroke();
    }
  }

  function top(ctx, sk, r, t) {
    var f = sk.face;
    if (f === 'crown') {
      ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = INK; ctx.lineWidth = r * 0.08; ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(-r * 0.5, -r * 0.78); ctx.lineTo(-r * 0.58, -r * 1.3); ctx.lineTo(-r * 0.25, -r * 1.02); ctx.lineTo(0, -r * 1.42);
      ctx.lineTo(r * 0.25, -r * 1.02); ctx.lineTo(r * 0.58, -r * 1.3); ctx.lineTo(r * 0.5, -r * 0.78); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ff5b6e'; ctx.beginPath(); ctx.arc(0, -r * 0.98, r * 0.09, 0, 6.2832); ctx.fill();
    } else if (f === 'robot' || f === 'alien') {
      ctx.strokeStyle = INK; ctx.lineWidth = r * 0.08;
      var sw = Math.sin(t * 6) * r * 0.1;
      var xs = f === 'robot' ? [0] : [-0.4, 0.4];
      xs.forEach(function (xx) {
        ctx.beginPath(); ctx.moveTo(xx * r, -r * 0.9); ctx.lineTo(xx * r * 1.3 + sw, -r * 1.4); ctx.stroke();
        ctx.fillStyle = f === 'robot' ? '#ff5b6e' : '#b6ff5c';
        ctx.beginPath(); ctx.arc(xx * r * 1.3 + sw, -r * 1.45, r * 0.14, 0, 6.2832); ctx.fill(); ctx.stroke();
      });
    }
  }

  // Draw a blob head centred at (0,0) — caller translates. opts: look angle, t, sx/sy squash, blink
  Art.drawHead = function (ctx, sk, r, opts) {
    opts = opts || {};
    var t = opts.t || 0;
    var la = opts.look, lx = 0, ly = 0;
    if (la != null) { lx = Math.cos(la); ly = Math.sin(la); }
    ctx.save();
    ctx.scale(opts.sx || 1, opts.sy || 1);
    // shadow
    if (!opts.noShadow) {
      ctx.fillStyle = 'rgba(40,20,80,0.18)';
      ctx.beginPath(); ctx.ellipse(0, r * 0.95, r * 0.9, r * 0.28, 0, 0, 6.2832); ctx.fill();
    }
    back(ctx, sk, r, t);
    // body
    ctx.fillStyle = sk.special === 'rainbow' ? rainbowFill(ctx, r, t) : sk.c.base;
    ctx.strokeStyle = sk.c.ink; ctx.lineWidth = r * 0.13;
    ctx.beginPath();
    ctx.moveTo(-r, 0);
    ctx.bezierCurveTo(-r, -r * 1.1, r, -r * 1.1, r, 0);
    ctx.bezierCurveTo(r, r * 0.92, -r, r * 0.92, -r, 0);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // belly shading + highlight
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.beginPath(); ctx.ellipse(0, r * 0.42, r * 0.78, r * 0.28, 0, 0, 3.1416); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath(); ctx.ellipse(-r * 0.45, -r * 0.5, r * 0.22, r * 0.13, -0.6, 0, 6.2832); ctx.fill();
    front(ctx, sk, r, lx, ly, t, opts.blink);
    top(ctx, sk, r, t);
    ctx.restore();
  };

  function rainbowFill(ctx, r, t) {
    var g = ctx.createLinearGradient(-r, -r, r, r);
    var o = (t * 60) % 360;
    for (var i = 0; i <= 4; i++) g.addColorStop(i / 4, css(hsl((o + i * 70) % 360, 90, 66)));
    return g;
  }

  // Small swatch of a territory pattern onto a canvas (for the skins screen)
  Art.drawSwatch = function (cv, sk, cells) {
    cells = cells || 8;
    var ctx = cv.getContext('2d');
    var W = cells * 4;
    var img = ctx.createImageData(W, W);
    var u = new Uint32Array(img.data.buffer);
    for (var cy = 0; cy < cells; cy++) for (var cx = 0; cx < cells; cx++) for (var py = 0; py < 4; py++) for (var px = 0; px < 4; px++)
      u[(cy * 4 + py) * W + cx * 4 + px] = Art.texel(sk, cx, cy, px, py);
    var tmp = document.createElement('canvas'); tmp.width = W; tmp.height = W;
    tmp.getContext('2d').putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(tmp, 0, 0, cv.width, cv.height);
  };
})();
