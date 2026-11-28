/* Keyboard Obby HUD, drawn on a 2D canvas over the 3D view (1280x720 logical): the
 * on-screen keyboard printed like the school's Dell Arabic keyboard (always shown, the next
 * key lit), the big prompt bubble with the key's letter (and the word being spelled), the
 * coin and time chips, the path progress, the jelly jar and the floating words.
 * The keyboard's keys are drawn once into an offscreen canvas per size and language and
 * then only blitted; per frame only the lit keys and a few shapes are drawn. */
(function () {
  'use strict';
  var _W='#ffffff',_G='#ffd23f',_Y='#ffcc00',_R='#ff5d6c',_B='#4fd1ff',_P='#ff7eb6',_wa=function(a){return'rgba(255,255,255,'+a+')'},_ia=function(a){return'rgba(28,34,80,'+a+')'};
  var _M=Math,_sn=_M.sin,_cs=_M.cos,_mn=_M.min,_mx=_M.max,_ab=_M.abs,_fl=_M.floor,_rd=_M.round,_sq=_M.sqrt,_PI=_M.PI;
  var KO = window.KO, INK = '#1c2250', TAU = _PI * 2;
  var H = KO.hud = {};
  var cache = {};
  H.reset = function () { cache = {}; };
  function cv(w, h) { var c = document.createElement('canvas'); c.width = _mx(1, Math.ceil(w)); c.height = _mx(1, Math.ceil(h)); return c; }
  function rr(g, x, y, w, h, r) {
    r = _mn(r, w / 2, h / 2);
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function circle(g, x, y, r) { g.beginPath(); g.arc(x, y, r, 0, TAU); }
  function ink(g, lw, color) { g.lineWidth = lw || 5; g.strokeStyle = color || INK; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke(); }
  function fill(g, c) { g.fillStyle = c; g.fill(); }
  var AR = /[؀-ۿ]/;
  function text(g, s, x, y, size, color, o) {
    o = o || {};
    g.font = (o.weight || 700) + ' ' + _rd(size) + 'px Fredoka';
    g.textAlign = o.align || 'center';
    g.textBaseline = o.base || 'middle';
    g.direction = AR.test(s) ? 'rtl' : 'ltr';
    if (o.stroke) { g.lineJoin = 'round'; g.lineWidth = o.stroke; g.strokeStyle = o.ink || INK; g.strokeText(s, x, y); }
    g.fillStyle = color;
    g.fillText(s, x, y);
  }
  H.text = text; H.rr = rr; H.ink = ink; H.fill = fill; H.circle = circle;
  function starPath(g, x, y, R, r) {
    g.beginPath();
    for (var i = 0; i < 10; i++) { var a = -_PI / 2 + i * _PI / 5, d = i % 2 ? r : R; g[i ? 'lineTo' : 'moveTo'](x + _cs(a) * d, y + _sn(a) * d); }
    g.closePath();
  }
  H.star = function (g, x, y, r, on) { starPath(g, x, y, r, r * 0.46); fill(g, on ? _G : _wa(0.5)); ink(g, _mx(3, r * 0.16)); };
  H.coin = function (g, x, y, r) { circle(g, x, y, r); fill(g, _G); ink(g, _mx(3, r * 0.22)); circle(g, x, y, r * 0.55); ink(g, _mx(2, r * 0.12), '#ffb020'); };
  H.gem = function (g, x, y, r) {
    g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r * 0.8, y - r * 0.2); g.lineTo(x, y + r); g.lineTo(x - r * 0.8, y - r * 0.2); g.closePath();
    fill(g, '#ff4fd8'); ink(g, _mx(3, r * 0.2));
  };

  /* ------------------------------------------------------------ keyboard */
  // One key cap at (x, y) of size w x h; st: 'idle' | 'target' | 'ok' | 'wrong' | 'next'.
  function keyCap(g, k, x, y, w, h, st, lang, zone) {
    var game = k.finger >= 0, r = _mx(4, h * 0.16);
    var face = st === 'target' ? '#ffe14d' : st === 'wrong' ? '#ff6b6b' : st === 'ok' ? '#7ef0a2' : st === 'next' ? '#4b5383' : '#2c3150';
    var side = st === 'target' ? '#d99a00' : st === 'wrong' ? '#c73a46' : st === 'ok' ? '#2fae62' : '#181b30';
    var dip = st === 'ok' || st === 'wrong' ? h * 0.06 : 0;
    rr(g, x, y + dip, w, h - dip, r); fill(g, side);
    rr(g, x + h * 0.06, y + dip + h * 0.04, w - h * 0.12, h - dip - h * 0.18, r * 0.8); fill(g, face);
    rr(g, x, y + dip, w, h - dip, r); ink(g, _mx(2, h * 0.05), '#0d1024');
    if (zone) { rr(g, x + w * 0.22, y + h - h * 0.13, w * 0.56, h * 0.07, 2); fill(g, zone); }
    var dark = st === 'target' || st === 'ok' || st === 'wrong', color = dark ? INK : _W;
    var fy = y + dip, fh = h - dip - h * 0.14;
    KO.legends(g, k, x + h * 0.04, fy + h * 0.02, w - h * 0.08, fh, lang, color, dark ? _ia(0.6) : _wa(0.5));
    if (k.code === 'KeyF' || k.code === 'KeyJ') { rr(g, x + w * 0.36, fy + fh - h * 0.06, w * 0.28, h * 0.05, 2); fill(g, dark ? _ia(0.5) : _wa(0.6)); }
  }
  function kbBase(u, lang, ps) {
    var key = 'K' + u + lang + ps;
    if (cache[key]) return cache[key];
    var pad = u * 0.3, w = KO.KB_W * u, h = KO.KB_ROWS * u, margin = 6;
    var cw = w + (pad + margin) * 2, ch = h + (pad + margin) * 2;
    var c = cv(cw * ps, ch * ps), g = c.getContext('2d'), gap = u * 0.1;
    g.scale(ps, ps);
    rr(g, margin, margin, w + pad * 2, h + pad * 2, u * 0.4); fill(g, '#3b4166'); ink(g, 5);
    rr(g, margin + 5, margin + 5, w + pad * 2 - 10, h + pad * 2 - 10, u * 0.32); fill(g, '#11142a');
    var ox = pad + margin, oy = pad + margin;
    KO.KEYS.forEach(function (k) { keyCap(g, k, ox + k.x * u + gap / 2, oy + k.row * u + gap / 2, k.w * u - gap, u - gap, 'idle', lang, k.finger >= 0 && k.finger < 8 ? KO.ZONES[k.finger] : ''); });
    return (cache[key] = { c: c, ox: ox, oy: oy, w: cw, h: ch });
  }
  function glowSprite() {
    if (cache.glow) return cache.glow;
    var c = cv(96, 96), g = c.getContext('2d'), gr = g.createRadialGradient(48, 48, 3, 48, 48, 46);
    gr.addColorStop(0, 'rgba(255,225,77,0.85)'); gr.addColorStop(0.55, 'rgba(255,225,77,0.3)'); gr.addColorStop(1, 'rgba(255,225,77,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 96, 96);
    return (cache.glow = c);
  }
  H.kbSize = function (u) { return { w: KO.KB_W * u, h: KO.KB_ROWS * u }; };
  H.keyCenter = function (code, x, y, u) { var k = KO.KEY[code]; return k ? { x: x + k.cx * u, y: y + k.cz * u } : null; };
  // o: { lang, target, pulse 0..1, flash: { code: [state, t] }, ps }
  H.keyboard = function (g, x, y, u, o) {
    var gap = u * 0.1, lang = o.lang || 'ar', base = kbBase(u, lang, o.ps || 1);
    g.drawImage(base.c, x - base.ox, y - base.oy, base.w, base.h);
    function cap(code, st) {
      var k = KO.KEY[code];
      if (k) keyCap(g, k, x + k.x * u + gap / 2, y + k.row * u + gap / 2, k.w * u - gap, u - gap, st, lang, '');
    }
    if (o.ahead && o.ahead !== o.target) cap(o.ahead, 'next');
    if (o.flash) for (var code in o.flash) { var f = o.flash[code]; if (f[1] > 0 && code !== o.target) cap(code, f[0]); }
    if (o.target) {
      var k = KO.KEY[o.target];
      if (k) {
        var kx = x + k.x * u + gap / 2, ky = y + k.row * u + gap / 2, grow = (o.pulse || 0) * u * 0.1;
        var rad = u * (1 + k.w * 0.4);
        g.drawImage(glowSprite(), kx + k.w * u / 2 - rad, ky + u / 2 - rad, rad * 2, rad * 2);
        cap(o.target, o.flash && o.flash[o.target] && o.flash[o.target][1] > 0 ? o.flash[o.target][0] : 'target');
        rr(g, kx - 3 - grow, ky - 3 - grow, k.w * u - gap + 6 + grow * 2, u - gap + 6 + grow * 2, u * 0.22); ink(g, _mx(3, u * 0.1), '#fff7c2');
      }
    }
  };

  /* -------------------------------------------------------------- bubble */
  // The prompt: a big key with the letter to press, and the word when the path spells one.
  // o: { code, lang, word: { text, at (letters done) } | null, pulse, bump }
  H.bubble = function (g, cx, y, o) {
    var k = KO.KEY[o.code];
    if (!k) return;
    var label = KO.label(o.code, o.lang), wide = k.code === 'Space', capW = wide ? 230 : 112, capH = 104;
    var hasWord = !!(o.word && o.word.text), bw = _mx(capW + 44, hasWord ? 340 : 0), bh = capH + 34 + (hasWord ? 62 : 0);
    var s = 1 + (o.bump || 0) * 0.12;
    g.save(); g.translate(cx, y + bh / 2); g.scale(s, s); g.translate(-cx, -(y + bh / 2));
    rr(g, cx - bw / 2, y, bw, bh, 34); fill(g, _wa(0.96)); ink(g, 6);
    // The tail points down at the world.
    g.beginPath(); g.moveTo(cx - 20, y + bh - 3); g.lineTo(cx, y + bh + 22); g.lineTo(cx + 20, y + bh - 3); fill(g, _W);
    g.beginPath(); g.moveTo(cx - 22, y + bh); g.lineTo(cx, y + bh + 24); g.lineTo(cx + 22, y + bh); ink(g, 6);
    rr(g, cx - 19, y + bh - 8, 38, 8, 2); fill(g, _W);
    var top = y + 16;
    if (hasWord) { word(g, o.word, cx, y + 44, o.lang); top = y + 82; }
    var kx = cx - capW / 2, glow = o.pulse || 0;
    rr(g, kx, top + 6, capW, capH, 22); fill(g, '#d99a00');
    rr(g, kx, top, capW, capH, 22); fill(g, glow > 0.5 ? '#ffe55c' : '#ffdd3d'); ink(g, 5);
    rr(g, kx + 9, top + 7, capW - 18, capH - 22, 16); fill(g, _wa(0.35));
    var size = wide ? 54 : label.length > 1 ? 58 : AR.test(label) ? 78 : 76;
    text(g, label, cx, top + capH / 2 + (AR.test(label) ? -2 : 2), size, INK);
    // The key's other legend, small, where the real key prints it.
    if (k.letter || k.digit) {
      if (o.lang === 'en' || k.digit) { if (k.ar) text(g, k.ar, kx + capW - 12, top + capH - 14, 26, _ia(0.6), { align: 'right', base: 'alphabetic' }); }
      else text(g, k.lat, kx + 12, top + 10, 24, _ia(0.6), { align: 'left', base: 'top' });
    }
    g.restore();
    return bh;
  };
  // A word with the letters done in green, the letter to type in yellow on a dark chip.
  // Cached per (text, at, lang) so zero per-frame measureText() or ctx.clip() runs during play!
  function word(g, w, cx, cy, lang) {
    var key = 'W|' + w.text + '|' + w.at + '|' + (lang || '');
    var spr = cache[key];
    if (!spr) {
      var size = 44, txt = w.text, rtl = AR.test(txt), cw = 320, ch = 84;
      var c = cv(cw, ch), cg = c.getContext('2d');
      cg.font = '700 ' + size + 'px Fredoka';
      cg.direction = rtl ? 'rtl' : 'ltr';
      cg.textAlign = 'center'; cg.textBaseline = 'middle';
      var chars = Array.from(txt), total = cg.measureText(txt).width, ZWJ = '‍';
      var done = chars.slice(0, w.at).join(''), cur = chars.slice(0, w.at + 1).join('');
      var wDone = w.at > 0 ? cg.measureText(done + (rtl ? ZWJ : '')).width : 0, wCur = cg.measureText(cur + (rtl && w.at + 1 < chars.length ? ZWJ : '')).width;
      var mx = cw / 2, my = ch / 2, x0 = mx - total / 2, x1 = mx + total / 2;
      var a = rtl ? x1 - wCur : x0 + wDone, b = rtl ? x1 - wDone : x0 + wCur;
      if (w.at < chars.length) { rr(cg, a - 6, my - 30, b - a + 12, 60, 14); fill(cg, INK); }
      text(cg, txt, mx, my, size, '#9aa3c7');
      function part(from, to, color) {
        cg.save(); cg.beginPath(); cg.rect(_mn(from, to), my - 40, _ab(to - from), 80); cg.clip();
        text(cg, txt, mx, my, size, color); cg.restore();
      }
      if (w.at > 0) part(rtl ? x1 - wDone : x0, rtl ? x1 : x0 + wDone, '#2fae62');
      if (w.at < chars.length) part(a, b, '#ffe14d');
      spr = cache[key] = { c: c, w: cw, h: ch };
    }
    g.drawImage(spr.c, cx - spr.w / 2, cy - spr.h / 2, spr.w, spr.h);
  }

  /* ---------------------------------------------------------------- chips */
  H.chip = function (g, x, y, w, icon, label, bump) {
    var s = 1 + (bump || 0) * 0.15;
    g.save(); g.translate(x + w / 2, y + 28); g.scale(s, s); g.translate(-(x + w / 2), -(y + 28));
    rr(g, x, y, w, 56, 28); fill(g, _ia(0.82)); ink(g, 4, _W);
    if (icon === 'coin') H.coin(g, x + 30, y + 28, 16);
    else if (icon === 'clock') { circle(g, x + 30, y + 28, 16); fill(g, _W); ink(g, 4); g.beginPath(); g.moveTo(x + 30, y + 28); g.lineTo(x + 30, y + 18); g.moveTo(x + 30, y + 28); g.lineTo(x + 38, y + 31); ink(g, 3.5); }
    else if (icon === 'oops') { circle(g, x + 30, y + 28, 16); fill(g, '#ff6b6b'); ink(g, 4); text(g, '!', x + 30, y + 29, 26, _W); }
    text(g, label, x + 54 + (w - 60) / 2, y + 30, 30, _W, { align: 'center' });
    g.restore();
  };
  // The path: a bar from the start to the goal flag, checkpoint ticks, optional PB ghost, the hero's place.
  H.progress = function (g, x, y, w, p, cps, n, color, ghostP) {
    rr(g, x, y - 12, w, 24, 12); fill(g, _ia(0.6)); ink(g, 4, _W);
    if (p > 0) { rr(g, x + 4, y - 8, _mx(16, (w - 8) * p), 16, 8); fill(g, _G); }
    (cps || []).forEach(function (s) { var cx = x + 4 + (w - 8) * (s + 1) / n; rr(g, cx - 3, y - 15, 6, 30, 3); fill(g, '#46e08e'); ink(g, 2.5); });
    rr(g, x + w + 8, y - 30, 5, 40, 2); fill(g, _W); ink(g, 2);
    g.beginPath(); g.moveTo(x + w + 13, y - 30); g.lineTo(x + w + 40, y - 22); g.lineTo(x + w + 13, y - 13); g.closePath(); fill(g, _G); ink(g, 3);
    if (ghostP >= 0) {
      var gx = x + 4 + (w - 8) * _mn(1, ghostP);
      g.save(); g.globalAlpha = 0.72;
      rr(g, gx - 12, y - 12, 24, 24, 7); fill(g, '#7ff6ff'); ink(g, 3, _W);
      g.restore();
    }
    var hx = x + 4 + (w - 8) * p;
    rr(g, hx - 15, y - 15, 30, 30, 8); fill(g, color || '#4fc3ff'); ink(g, 4);
    circle(g, hx - 5, y - 2, 3.6); fill(g, INK); circle(g, hx + 6, y - 2, 3.6); fill(g, INK);
  };
  // The jelly jar: how high the jelly is (the red line is the key tops; glows ice-cyan when frozen).
  H.jar = function (g, x, y, w, h, level, colors, t, still, frozen) {
    rr(g, x, y, w, h, w / 2); fill(g, frozen ? 'rgba(215,248,255,0.95)' : _wa(0.88)); ink(g, 5, frozen ? '#38d9ff' : INK);
    var fillH = _mx(0, _mn(1, level)) * (h - 16);
    if (fillH > 1) {
      g.save(); rr(g, x + 6, y + 6, w - 12, h - 12, (w - 12) / 2); g.clip();
      g.fillStyle = frozen ? '#5ad6ff' : colors[0]; g.fillRect(x, y + h - 8 - fillH, w, fillH + 8);
      g.fillStyle = frozen ? _W : colors[2];
      var wave = still || frozen ? 0 : _sn(t * 4) * 2;
      g.fillRect(x, y + h - 10 - fillH + wave, w, 5);
      g.restore();
    }
    rr(g, x - 6, y + 10, w + 12, 6, 3); fill(g, frozen ? '#7ff6ff' : level > 0.75 ? '#ff4d6d' : '#ff8fa3'); ink(g, 2.5);
    if (frozen) text(g, '❄', x + w / 2, y - 18, 28, '#7ff6ff', { stroke: 6 });
  };
  // Streak Jetpack badge: fills up to 5 clean keys, then glows when jetpack is active.
  H.streak = function (g, x, y, combo, jet, pulse) {
    var w = jet ? 196 : 150, h = 44;
    rr(g, x, y, w, h, 22); fill(g, jet ? '#ff6b2b' : _ia(0.82)); ink(g, 4, jet ? '#ffe14d' : _W);
    if (jet) {
      text(g, 'نفاث ×' + combo + ' 🚀', x + w / 2, y + 23, 23, '#fff7c2', { stroke: 5 });
    } else {
      for (var i = 0; i < KO.JET_STREAK; i++) {
        circle(g, x + 22 + i * 26, y + 22, 8);
        fill(g, i < combo ? _G : _wa(0.28));
        ink(g, 2.5);
      }
    }
  };
  // Gentle keyboard nudge pill shown when a young child clicks the lit key in World 1.
  H.nudge = function (g, cx, y, alpha) {
    g.save(); g.globalAlpha = _mx(0, _mn(1, alpha));
    rr(g, cx - 220, y, 440, 52, 26); fill(g, '#ffe14d'); ink(g, 5);
    text(g, 'اضغط المفتاح على الكيبورد!', cx, y + 27, 26, INK);
    g.restore();
  };
  // A popped-up word over the world.
  H.float = function (g, s, x, y, size, color, alpha) {
    g.globalAlpha = _mx(0, _mn(1, alpha));
    text(g, s, x, y, size, color, { stroke: _mx(6, size * 0.22) });
    g.globalAlpha = 1;
  };
  // A shop tile: the hero in a colour, or wearing a hat (drawn flat, like the 3D one).
  H.heroIcon = function (canvas, color, hat) {
    var g = canvas.getContext('2d'), s = canvas.width / 100;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, canvas.width, canvas.height);
    g.scale(s, s);
    var x = 50, y = 92;
    rr(g, x - 26, y - 14, 18, 14, 5); fill(g, INK); rr(g, x + 8, y - 14, 18, 14, 5); fill(g, INK);
    rr(g, x - 32, y - 62, 64, 52, 12); fill(g, color); ink(g, 4);
    rr(g, x - 27, y - 68, 54, 12, 5); fill(g, color); fill(g, _wa(0.4)); ink(g, 4);
    rr(g, x - 20, y - 52, 15, 18, 5); fill(g, _W); ink(g, 3); rr(g, x + 5, y - 52, 15, 18, 5); fill(g, _W); ink(g, 3);
    circle(g, x - 11, y - 42, 4.5); fill(g, INK); circle(g, x + 14, y - 42, 4.5); fill(g, INK);
    circle(g, x - 24, y - 28, 4); fill(g, '#ff8fb8'); circle(g, x + 24, y - 28, 4); fill(g, '#ff8fb8');
    g.beginPath(); g.arc(x, y - 30, 7, 0.15 * _PI, 0.85 * _PI); ink(g, 3.5);
    var t = y - 68;
    function box(bx, by, bw, bh, c, r) { rr(g, bx, by, bw, bh, r == null ? 3 : r); fill(g, c); ink(g, 3); }
    switch (hat) {
      case 'cap': box(x - 26, t - 14, 52, 16, _R, 8); box(x - 4, t - 2, 40, 6, _R, 3); break;
      case 'bow': box(x - 24, t - 12, 18, 16, '#ff6fb5', 6); box(x + 6, t - 12, 18, 16, '#ff6fb5', 6); box(x - 6, t - 9, 12, 11, '#ff3d8e', 4); break;
      case 'party': g.beginPath(); g.moveTo(x - 20, t + 2); g.lineTo(x, t - 40); g.lineTo(x + 20, t + 2); g.closePath(); fill(g, _B); ink(g, 3.5); circle(g, x, t - 42, 6); fill(g, _G); ink(g, 3); box(x - 13, t - 14, 26, 6, '#ff5d9e', 2); break;
      case 'flower': [[0, -10], [0, 10], [-10, 0], [10, 0]].forEach(function (d) { circle(g, x + 18 + d[0], t - 2 + d[1], 7); fill(g, '#ff6fb5'); ink(g, 3); }); circle(g, x + 18, t - 2, 6); fill(g, _G); ink(g, 3); break;
      case 'phones': g.beginPath(); g.arc(x, t + 10, 34, _PI * 1.05, _PI * 1.95); ink(g, 7); ink(g, 4, '#2c3150'); box(x - 40, t + 6, 13, 24, _R, 5); box(x + 27, t + 6, 13, 24, _R, 5); break;
      case 'crown': g.beginPath(); g.moveTo(x - 22, t + 2); g.lineTo(x - 22, t - 18); g.lineTo(x - 11, t - 8); g.lineTo(x, t - 24); g.lineTo(x + 11, t - 8); g.lineTo(x + 22, t - 18); g.lineTo(x + 22, t + 2); g.closePath(); fill(g, _G); ink(g, 3.5); circle(g, x, t - 5, 4); fill(g, _R); break;
      case 'wizard': box(x - 30, t - 4, 60, 8, '#6b4bd6', 4); g.beginPath(); g.moveTo(x - 20, t - 3); g.lineTo(x + 6, t - 50); g.lineTo(x + 20, t - 3); g.closePath(); fill(g, '#7d5cff'); ink(g, 3.5); circle(g, x + 6, t - 50, 5); fill(g, _G); ink(g, 2.5); circle(g, x + 2, t - 20, 3.5); fill(g, _G); break;
      case 'prop': box(x - 24, t - 14, 48, 16, '#ff9a3d', 8); box(x - 2, t - 24, 4, 10, INK, 1); box(x - 26, t - 28, 52, 6, _R, 3); break;
      default: box(x - 2, t - 14, 4, 14, INK, 1); circle(g, x, t - 18, 6); fill(g, _G); ink(g, 3);
    }
  };
  // The level's name when it starts.
  H.banner = function (g, title, sub, k, color) {
    var y = 330 - (1 - k) * 24;
    rr(g, 450, y - 48, 380, 96, 34); fill(g, color || '#ff5d9e'); ink(g, 6);
    text(g, title, 640, y - 13, 44, _W, { stroke: 9 });
    text(g, sub, 640, y + 29, 26, _W, { stroke: 6 });
  };
})();
