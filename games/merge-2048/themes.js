/* دمج 2048 — themes + tile art (all drawn in code).
 * window.M2048 = { themes, byId, tileColor, drawTile, emoji, tileName, EMOJI_FONT }
 */
(function () {
  'use strict';

  var EMOJI_FONT = '"Segoe UI Emoji","Segoe UI Symbol","Apple Color Emoji","Noto Color Emoji",sans-serif';

  // [fill, text] per power of two: index 0 = 2, 1 = 4, ... last entry repeats.
  var THEMES = [
    {
      id: 'classic', name: 'أرقام', req: 0, style: 'chunky', icon: 2048,
      bg: ['#7b5cff', '#3b1fa3'], page: '#3b1fa3', deco: 'bubbles',
      board: '#2b1673', boardLip: '#170a45', cell: 'rgba(255,255,255,0.11)',
      tiles: [
        ['#fff3d1', '#8a5a2b'], ['#ffe08a', '#8a5a10'], ['#ffb347', '#ffffff'], ['#ff8a3d', '#ffffff'],
        ['#ff5e57', '#ffffff'], ['#ff2e63', '#ffffff'], ['#f542b3', '#ffffff'], ['#b84dff', '#ffffff'],
        ['#7b61ff', '#ffffff'], ['#3d8bff', '#ffffff'], ['#ffc400', '#ffffff'], ['#17c3b2', '#ffffff'],
        ['#2ecc71', '#ffffff'], ['#222a4f', '#ffffff']
      ]
    },
    {
      id: 'candy', name: 'حلوى', req: 128, style: 'candy', icon: 64,
      bg: ['#ffc2e2', '#ff7fbf'], page: '#ff8fc5', deco: 'sprinkles',
      board: '#fff0f7', boardLip: '#e35d9f', cell: '#ffd3e8',
      tiles: [
        ['#ffe4f0', '#d23c7e'], ['#ffc9e3', '#c2306e'], ['#b8f0dc', '#138a5e'], ['#7fe0bd', '#ffffff'],
        ['#ffe9a8', '#b07800'], ['#ffc94d', '#ffffff'], ['#d8c7ff', '#6a3fd1'], ['#a88bff', '#ffffff'],
        ['#ff9ec7', '#ffffff'], ['#ff5fa2', '#ffffff'], ['#ff3d8b', '#ffffff'], ['#5fd3ff', '#ffffff'],
        ['#36c98f', '#ffffff'], ['#8a4dff', '#ffffff']
      ]
    },
    {
      id: 'evo', name: 'تطوّر', req: 256, style: 'emoji', icon: 64,
      bg: ['#8fe0ff', '#b8f07a'], page: '#9ee6b0', deco: 'meadow',
      board: '#9a6332', boardLip: '#5e3514', cell: '#b98049',
      emoji: ['🥚', '🐣', '🐥', '🐔', '🦅', '🐉', '🦖', '🦄', '🧞', '👑', '🌟', '🚀', '🌍', '🌞', '🌌', '💎'],
      names: ['بيضة', 'كتكوت يفقس', 'كتكوت', 'دجاجة', 'نسر', 'تنّين', 'ديناصور', 'حصان سحري', 'جنّي', 'ملك', 'نجمة', 'صاروخ', 'كوكب', 'شمس', 'مجرّة', 'ماسة'],
      tiles: [
        ['#fffaf0', '#6b4a2a'], ['#fff2c2', '#6b4a2a'], ['#ffe27a', '#6b4a2a'], ['#ffc9a3', '#6b4a2a'],
        ['#bfe3ff', '#23507a'], ['#a8f0b0', '#1d6b2f'], ['#d6f59a', '#4d6b12'], ['#f5c8ff', '#7a2d8f'],
        ['#b9c3ff', '#2d3a8f'], ['#ff7aa8', '#ffffff'], ['#7b61ff', '#ffffff'], ['#ff7a59', '#ffffff'],
        ['#26379a', '#ffffff'], ['#4fb8ff', '#ffffff'], ['#6b4dff', '#ffffff'], ['#3fe0ff', '#0b3a4a']
      ]
    },
    {
      id: 'fruit', name: 'فواكه', req: 512, style: 'emoji', icon: 64,
      bg: ['#5ff0d2', '#1aa7c9'], page: '#2bbccb', deco: 'dots',
      board: '#fff7e8', boardLip: '#d99a52', cell: '#fbe2c4',
      emoji: ['🍒', '🍓', '🍇', '🍋', '🍊', '🍎', '🍑', '🍍', '🥥', '🍉', '🎂', '🍦', '🍭', '🍩', '🏆', '💎'],
      names: ['كرز', 'فراولة', 'عنب', 'ليمون', 'برتقال', 'تفاح', 'خوخ', 'أناناس', 'جوز هند', 'بطيخ', 'كعكة', 'بوظة', 'مصاصة', 'دونات', 'كأس', 'ماسة'],
      tiles: [
        ['#ffe0e4', '#8f1d2c'], ['#ffd1d1', '#8f1d2c'], ['#e8d6ff', '#4b2a8f'], ['#fff6a8', '#7a6500'],
        ['#ffdcae', '#8f4a00'], ['#ffc8c8', '#8f1d2c'], ['#ffe3cc', '#8f4a00'], ['#fff0a0', '#6b5a00'],
        ['#e9d8c4', '#5e3514'], ['#c9f7c0', '#1d6b2f'], ['#ffd1f0', '#8f1d6b'], ['#d6f3ff', '#1d5a8f'],
        ['#ffb3e6', '#8f1d6b'], ['#ffd9a8', '#8f4a00'], ['#ffe066', '#7a5200'], ['#bff4ff', '#0b3a4a']
      ]
    },
    {
      id: 'neon', name: 'نيون', req: 1024, style: 'neon', icon: 128,
      bg: ['#140a3a', '#05020f'], page: '#07031a', deco: 'grid',
      board: '#0d0a24', boardLip: '#6b3cff', cell: '#17123a',
      tiles: [
        ['#3ff0ff'], ['#39ff88'], ['#b6ff3b'], ['#ffe53b'], ['#ff9f1c'], ['#ff3b6b'], ['#ff3bd4'],
        ['#b23bff'], ['#7b7bff'], ['#3b9bff'], ['#ffffff'], ['#3ff0ff'], ['#39ff88'], ['#ff3bd4']
      ]
    },
    {
      id: 'gold', name: 'كنز', req: 2048, style: 'metal', icon: 2048,
      bg: ['#4a1a8a', '#12052e'], page: '#1d0845', deco: 'sparkle',
      board: '#3b1d0f', boardLip: '#c98a2b', cell: 'rgba(255,215,120,0.13)',
      tiles: [
        ['#c98a4b', '#3b1d05'], ['#dca46a', '#3b1d05'], ['#b9c3cf', '#26303d'], ['#dfe6ee', '#26303d'],
        ['#f2c14e', '#4a2d00'], ['#ffd76a', '#4a2d00'], ['#f49a9a', '#5c1414'], ['#4fd1a5', '#0b3d2c'],
        ['#5b8cff', '#ffffff'], ['#b27bff', '#ffffff'], ['#ff4d6d', '#ffffff'], ['#bff4ff', '#0b3a4a'],
        ['#ffd700', '#4a2d00'], ['#ff9ec7', '#5c1430']
      ]
    }
  ];

  var byId = {};
  THEMES.forEach(function (t) { byId[t.id] = t; });

  function idx(v) { var k = Math.round(Math.log(v) / Math.LN2) - 1; return k < 0 ? 0 : k; }
  function entry(theme, v) { var k = idx(v); return theme.tiles[Math.min(k, theme.tiles.length - 1)]; }
  function tileColor(theme, v) { return entry(theme, v)[0]; }
  function emoji(theme, v) { if (!theme.emoji) return null; var k = idx(v); return theme.emoji[Math.min(k, theme.emoji.length - 1)]; }
  function tileName(theme, v) { if (!theme.names) return null; var k = idx(v); return theme.names[Math.min(k, theme.names.length - 1)]; }

  /* ------------------------------------------------------ color helpers */
  function hexRgb(h) {
    h = h.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  // amt > 0 mixes toward white, < 0 toward black
  function shade(hex, amt) {
    if (hex.charAt(0) !== '#') return hex;
    var c = hexRgb(hex), t = amt < 0 ? 0 : 255, p = Math.abs(amt);
    return 'rgb(' + Math.round(c[0] + (t - c[0]) * p) + ',' + Math.round(c[1] + (t - c[1]) * p) + ',' + Math.round(c[2] + (t - c[2]) * p) + ')';
  }
  function rgba(hex, a) { var c = hexRgb(hex); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }

  function rr(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function star(c, x, y, r) {
    c.beginPath();
    for (var i = 0; i < 8; i++) {
      var a = i * Math.PI / 4 - Math.PI / 2, rad = i % 2 ? r * 0.38 : r;
      c.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
    }
    c.closePath();
  }

  function numSize(v, s, big) {
    var d = String(v).length;
    var f = [0, 0.56, 0.52, 0.43, 0.345, 0.285, 0.24, 0.21][Math.min(d, 7)];
    return s * f * (big || 1);
  }

  function drawNumber(c, v, cx, cy, s, color, shadow) {
    var fs = numSize(v, s);
    c.font = '700 ' + fs + 'px Fredoka';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    var ty = cy + fs * 0.04;
    if (shadow) { c.fillStyle = shadow; c.fillText(String(v), cx, ty + s * 0.035); }
    c.fillStyle = color;
    c.fillText(String(v), cx, ty);
  }

  /* ------------------------------------------------------ tile drawing */
  // Draws one tile with its top-left at (0,0) and size s. Tiles may paint a
  // little outside the square (glow), so callers leave padding around it.
  function drawTile(c, theme, v, s) {
    var e = entry(theme, v), fill = e[0], txt = e[1] || '#fff';
    var r = s * 0.17;
    c.save();
    if (theme.style === 'neon') { drawNeon(c, theme, v, s, fill); c.restore(); return; }

    var d = Math.max(3, s * 0.075); // chunky lip depth
    var fh = s - d;
    var hot = v >= 2048;
    // glow for big tiles
    if (v >= 512) {
      c.save();
      c.shadowColor = hot ? '#fff3a0' : shade(fill, 0.3);
      c.shadowBlur = s * (hot ? 0.22 : 0.12);
      rr(c, 0, 0, s, s, r); c.fillStyle = shade(fill, -0.3); c.fill();
      c.restore();
    }
    // lip
    rr(c, 0, d, s, fh, r); c.fillStyle = shade(fill, -0.3); c.fill();
    // face
    var g = c.createLinearGradient(0, 0, 0, fh);
    if (theme.style === 'metal') {
      g.addColorStop(0, shade(fill, 0.55)); g.addColorStop(0.45, fill); g.addColorStop(1, shade(fill, -0.18));
    } else {
      g.addColorStop(0, shade(fill, 0.14)); g.addColorStop(1, fill);
    }
    rr(c, 0, 0, s, fh, r); c.fillStyle = g; c.fill();

    // candy stripes / sprinkles
    if (theme.style === 'candy') {
      c.save(); rr(c, 0, 0, s, fh, r); c.clip();
      c.strokeStyle = 'rgba(255,255,255,0.22)'; c.lineWidth = s * 0.09;
      for (var i = -3; i < 6; i++) { c.beginPath(); c.moveTo(i * s * 0.28, fh + 4); c.lineTo(i * s * 0.28 + fh, -4); c.stroke(); }
      c.restore();
    }
    if (theme.style === 'metal') {
      c.save(); rr(c, 0, 0, s, fh, r); c.clip();
      c.fillStyle = 'rgba(255,255,255,0.35)';
      c.beginPath(); c.moveTo(s * 0.55, 0); c.lineTo(s * 0.8, 0); c.lineTo(s * 0.35, fh); c.lineTo(s * 0.1, fh); c.closePath(); c.fill();
      c.restore();
      rr(c, s * 0.04, s * 0.04, s * 0.92, fh - s * 0.08, r * 0.8);
      c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = Math.max(1, s * 0.02); c.stroke();
    }
    // gloss
    rr(c, s * 0.08, s * 0.055, s * 0.84, fh * 0.36, r * 0.75);
    c.fillStyle = theme.style === 'candy' ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.26)';
    c.fill();
    // tiny shine dot
    c.fillStyle = 'rgba(255,255,255,0.7)';
    c.beginPath(); c.ellipse(s * 0.2, s * 0.17, s * 0.05, s * 0.032, -0.5, 0, Math.PI * 2); c.fill();

    if (theme.style === 'emoji') {
      var em = emoji(theme, v);
      var es = s * 0.56;
      c.font = es + 'px ' + EMOJI_FONT;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = 'rgba(0,0,0,0.18)';
      c.fillText(em, s / 2, fh * 0.47 + s * 0.05);
      c.fillStyle = '#000';
      c.fillText(em, s / 2, fh * 0.47);
      // number pill (bottom-right corner)
      var fs = Math.max(10, s * (String(v).length > 3 ? 0.15 : 0.17));
      c.font = '700 ' + fs + 'px Fredoka';
      var tw = c.measureText(String(v)).width;
      var pw = tw + fs * 0.8, ph = fs * 1.2;
      var px = s - pw - s * 0.05, py = fh - ph - s * 0.045;
      rr(c, px, py, pw, ph, ph / 2); c.fillStyle = 'rgba(40,20,10,0.55)'; c.fill();
      c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(String(v), px + pw / 2, py + ph / 2 + fs * 0.05);
    } else {
      var sh = theme.style === 'metal' ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.2)';
      if (theme.style === 'metal') {
        // engraved look: light below, dark on top
        drawNumber(c, v, s / 2, fh / 2, s, txt, sh);
      } else if (txt === '#ffffff') {
        drawNumber(c, v, s / 2, fh / 2, s, txt, 'rgba(0,0,0,0.28)');
      } else {
        drawNumber(c, v, s / 2, fh / 2, s, txt, 'rgba(0,0,0,0.13)');
      }
    }
    if (hot) {
      c.fillStyle = '#ffffff';
      star(c, s * 0.84, s * 0.16, s * 0.08); c.fill();
      star(c, s * 0.12, fh * 0.8, s * 0.055); c.fill();
    }
    c.restore();
  }

  function drawNeon(c, theme, v, s, col) {
    var r = s * 0.17, lw = Math.max(2, s * 0.045);
    rr(c, lw, lw, s - lw * 2, s - lw * 2, r);
    c.fillStyle = '#100c2a'; c.fill();
    c.fillStyle = rgba(col, 0.13); c.fill();
    c.shadowColor = col; c.shadowBlur = s * 0.16;
    c.strokeStyle = col; c.lineWidth = lw;
    c.stroke(); c.stroke();
    c.shadowBlur = 0;
    rr(c, lw * 2.4, lw * 2.4, s - lw * 4.8, s - lw * 4.8, r * 0.7);
    c.strokeStyle = rgba(col, 0.35); c.lineWidth = Math.max(1, lw * 0.4); c.stroke();
    var fs = numSize(v, s, 0.95);
    c.font = '700 ' + fs + 'px Fredoka';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.shadowColor = col; c.shadowBlur = s * 0.14;
    c.fillStyle = col;
    c.fillText(String(v), s / 2, s / 2 + fs * 0.04);
    c.shadowBlur = 0;
    c.fillStyle = 'rgba(255,255,255,0.85)';
    c.font = '700 ' + (fs * 0.96) + 'px Fredoka';
    c.fillText(String(v), s / 2, s / 2 + fs * 0.04);
  }

  window.M2048 = {
    themes: THEMES, byId: byId, tileColor: tileColor, drawTile: drawTile, emoji: emoji,
    tileName: tileName, EMOJI_FONT: EMOJI_FONT, shade: shade, rgba: rgba, rr: rr, star: star
  };
})();
