/*
 * Sneaky Levels — all drawing (canvas, no images). Player, skins, world,
 * traps, HUD pieces. Everything is drawn in logical 1280x720 coordinates.
 */
(function () {
  'use strict';
  var E = window.TrollEngine, T = E.T, PH = E.PH;
  var Art = {};
  var FONT = 'Fredoka, "Segoe UI", Tahoma, sans-serif';
  Art.FONT = FONT;

  Art.SKINS = [
    { id: 'blob', name: 'بلوب', stars: 0, body: '#ffffff' },
    { id: 'party', name: 'المحتفل', stars: 5, body: '#ffffff' },
    { id: 'shades', name: 'الرائع', stars: 12, body: '#ffffff' },
    { id: 'cat', name: 'القطّ', stars: 20, body: '#ffe7c2' },
    { id: 'ninja', name: 'النينجا', stars: 30, body: '#3b3b4f' },
    { id: 'crown', name: 'الملك', stars: 40, body: '#ffffff' },
    { id: 'alien', name: 'الفضائي', stars: 50, body: '#8dff8a' },
    { id: 'gold', name: 'الذهبي', stars: 60, body: '#ffd23f' },
    { id: 'rainbow', name: 'قوس قزح', stars: 72, body: '#ff6b6b' },
    { id: 'astro', name: 'رائد الفضاء', stars: 90, body: '#ffffff' }
  ];
  // Plug-ins from world files (w6-ice.js ...), all optional:
  //   Art.ACC[skinId](ctx, face, t, ink, top): a new skin's accessory (push the skin on Art.SKINS);
  //   Art.GROUND[theme]: a world's ground look. The sky plate is baked per theme in Art.backdrop;
  //   Art.SFX[name](A): a sound for L.sfx(name), A = Kit.audio;
  //   Art.EV[type](d, ui): a world's own engine event (w.emit), ui = { fx, shake, say, sfx, pal, loud };
  //   Art.CAUSE[cause]: Arabic death texts for a world's own w.die(cause);
  //   a group with g.own is drawn by its plug-in, not as ground (boxes, coloured blocks...);
  //   Art.mod({ bake(g, w, pal), draw(ctx, w, pal, t, k), front(ctx, w, pal, t), hud(ctx, w, pal, t, ui) }):
  //     bake draws once into the level canvas, draw with the traps, front over the player,
  //     hud with the HUD (ui = { txt, bubble, rr }).
  Art.ACC = {}; Art.SFX = {}; Art.EV = {}; Art.CAUSE = {}; Art.MODS = [];
  Art.mod = function (m) { Art.MODS.push(m); return m; };
  Art.skinById = function (id) {
    for (var i = 0; i < Art.SKINS.length; i++) if (Art.SKINS[i].id === id) return Art.SKINS[i];
    return Art.SKINS[0];
  };

  function rr(ctx, x, y, w, h, r) { window.Kit.art.round(ctx, x, y, w, h, r); }
  Art.rr = rr;

  Art.star = function (ctx, x, y, r, fill, stroke, lw) {
    ctx.beginPath();
    for (var i = 0; i < 10; i++) {
      var a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r * 0.48 : r;
      ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
    }
    ctx.closePath();
    if (stroke) { ctx.lineWidth = lw || 3; ctx.strokeStyle = stroke; ctx.lineJoin = 'round'; ctx.stroke(); }
    ctx.fillStyle = fill; ctx.fill();
  };

  /* --------------------------------------------------------- player */
  // o: { sx, sy, face, skin, t, flip, ink, run, air, blink, look, scale, alpha, dizzy }
  Art.drawPlayer = function (ctx, x, y, o) {
    var skin = Art.skinById(o.skin || 'blob');
    var ink = o.ink || '#1c1226';
    ctx.save();
    ctx.translate(x, y);
    if (o.flip) ctx.scale(1, -1);
    var sc = o.scale == null ? 1 : o.scale;
    var crisp = o.crisp == null ? 1.12 : o.crisp;
    ctx.scale((o.sx || 1) * sc * crisp, (o.sy || 1) * sc * crisp);
    if (o.alpha != null) ctx.globalAlpha = o.alpha;
    var face = o.face || 1, t = o.t || 0;
    var w = 30, h = 36;
    // feet
    var ph = o.run ? Math.sin(t * 22) : 0;
    ctx.fillStyle = ink;
    if (o.air) {
      ctx.beginPath(); ctx.ellipse(-7, -1, 5, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(7, -3, 5, 4, 0, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.beginPath(); ctx.ellipse(-7 + ph * 3, -2 - Math.max(0, ph) * 3, 6, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(7 - ph * 3, -2 - Math.max(0, -ph) * 3, 6, 4, 0, 0, Math.PI * 2); ctx.fill();
    }
    // ninja scarf tails (behind)
    if (skin.id === 'ninja') {
      ctx.fillStyle = '#ff3b5c';
      var wav = Math.sin(t * 12) * 4;
      ctx.beginPath(); ctx.moveTo(-face * 12, -28); ctx.lineTo(-face * 30, -32 + wav); ctx.lineTo(-face * 28, -24 + wav); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-face * 12, -26); ctx.lineTo(-face * 26, -20 - wav); ctx.lineTo(-face * 22, -16 - wav); ctx.closePath(); ctx.fill();
    }
    // body
    var body = skin.body;
    if (skin.id === 'rainbow') body = 'hsl(' + ((t * 120) % 360) + ',95%,65%)';
    rr(ctx, -w / 2, -h - 2, w, h, 11);
    ctx.fillStyle = body; ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = ink; ctx.stroke();
    // shine
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    rr(ctx, -w / 2 + 5, -h + 3, 6, 10, 3); ctx.fill();
    if (skin.id === 'gold') {
      ctx.fillStyle = '#fff6c9';
      var sp = (t * 2) % 3;
      if (sp < 1) { Art.star(ctx, 9, -h + 4, 4 + sp * 2, '#ffffff'); }
    }
    // cheeks
    ctx.fillStyle = 'rgba(255,105,140,0.55)';
    ctx.beginPath(); ctx.ellipse(face * 3 - 9, -13, 4, 2.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(face * 3 + 9, -13, 4, 2.6, 0, 0, Math.PI * 2); ctx.fill();
    // eyes
    var ex = face * 4, ey = -22 + (o.look || 0) * 2;
    var eyeInk = skin.id === 'ninja' ? '#ffffff' : ink;
    if (o.dizzy) {
      ctx.strokeStyle = eyeInk; ctx.lineWidth = 2.5;
      [-6, 6].forEach(function (dx) {
        ctx.beginPath();
        for (var a = 0; a < 9; a++) { var ang = a * 0.9 + t * 10, rad = a * 0.55; ctx.lineTo(ex + dx + Math.cos(ang) * rad, ey + Math.sin(ang) * rad); }
        ctx.stroke();
      });
    } else if (skin.id === 'shades') {
      ctx.fillStyle = ink;
      rr(ctx, ex - 13, ey - 5, 26, 9, 4); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(ex - 9, ey - 3, 5, 2);
    } else {
      var bl = o.blink ? 0.15 : 1;
      ctx.fillStyle = eyeInk;
      ctx.beginPath(); ctx.ellipse(ex - 6, ey, 3.4, 5 * bl, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(ex + 6, ey, 3.4, 5 * bl, 0, 0, Math.PI * 2); ctx.fill();
      if (bl === 1) {
        ctx.fillStyle = skin.id === 'ninja' ? ink : '#ffffff';
        ctx.fillRect(ex - 6 + face, ey - 3, 1.8, 1.8); ctx.fillRect(ex + 6 + face, ey - 3, 1.8, 1.8);
      }
    }
    // mouth
    ctx.strokeStyle = eyeInk; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    ctx.beginPath();
    if (o.air || o.dizzy) { ctx.ellipse(ex, -11, 2.5, 3, 0, 0, Math.PI * 2); ctx.stroke(); }
    else { ctx.arc(ex, -13, 4, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke(); }
    // accessories
    drawAccessory(ctx, skin.id, face, t, ink, h);
    ctx.restore();
  };

  function drawAccessory(ctx, id, face, t, ink, h) {
    var top = -h - 2;
    ctx.lineWidth = 3; ctx.strokeStyle = ink; ctx.lineJoin = 'round';
    if (id === 'party') {
      ctx.save(); ctx.translate(2, top + 2); ctx.rotate(0.18 * face);
      ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(9, 0); ctx.lineTo(0, -22); ctx.closePath();
      ctx.fillStyle = '#ff4d6d'; ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath(); ctx.moveTo(-5, -7); ctx.lineTo(5, -7); ctx.lineTo(3.4, -12); ctx.lineTo(-3.4, -12); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.arc(0, -23, 4, 0, Math.PI * 2); ctx.fillStyle = '#3fe0c5'; ctx.fill(); ctx.stroke();
      ctx.restore();
    } else if (id === 'cat') {
      [-1, 1].forEach(function (s) {
        ctx.beginPath(); ctx.moveTo(s * 13, top + 4); ctx.lineTo(s * 12, top - 10); ctx.lineTo(s * 3, top + 1); ctx.closePath();
        ctx.fillStyle = '#ffe7c2'; ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(s * 11, top + 2); ctx.lineTo(s * 11, top - 5); ctx.lineTo(s * 6, top + 1); ctx.closePath();
        ctx.fillStyle = '#ff8fb1'; ctx.fill();
      });
      ctx.strokeStyle = ink; ctx.lineWidth = 1.5;
      [-1, 1].forEach(function (s) {
        ctx.beginPath(); ctx.moveTo(face * 4 + s * 8, -12); ctx.lineTo(face * 4 + s * 18, -14); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(face * 4 + s * 8, -10); ctx.lineTo(face * 4 + s * 18, -9); ctx.stroke();
      });
    } else if (id === 'ninja') {
      ctx.fillStyle = '#ff3b5c';
      ctx.fillRect(-15, -31, 30, 6);
    } else if (id === 'crown') {
      ctx.beginPath();
      ctx.moveTo(-11, top + 3); ctx.lineTo(-12, top - 11); ctx.lineTo(-5, top - 4); ctx.lineTo(0, top - 14);
      ctx.lineTo(5, top - 4); ctx.lineTo(12, top - 11); ctx.lineTo(11, top + 3); ctx.closePath();
      ctx.fillStyle = '#ffd23f'; ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ff4d6d'; ctx.beginPath(); ctx.arc(0, top - 2, 2.6, 0, Math.PI * 2); ctx.fill();
    } else if (id === 'alien') {
      [-1, 1].forEach(function (s) {
        ctx.beginPath(); ctx.moveTo(s * 6, top + 1); ctx.lineTo(s * 10, top - 12 + Math.sin(t * 6 + s) * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(s * 10, top - 14 + Math.sin(t * 6 + s) * 2, 4, 0, Math.PI * 2); ctx.fillStyle = '#ff5ca8'; ctx.fill(); ctx.stroke();
      });
    } else if (id === 'gold') {
      // tiny halo shine
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(0, top - 6, 10, 3, 0, 0, Math.PI * 2); ctx.stroke();
    } else if (id === 'rainbow') {
      ctx.fillStyle = '#ffffff';
      Art.star(ctx, face * -8, top - 2, 5, '#ffffff', ink, 2);
    } else if (Art.ACC[id]) {
      Art.ACC[id](ctx, face, t, ink, top);
    } else if (id === 'astro') {
      // a glass helmet with a shine and a little antenna
      ctx.beginPath(); ctx.moveTo(face * 9, top - 4); ctx.lineTo(face * 13, top - 13); ctx.stroke();
      ctx.fillStyle = '#ff4d6d'; ctx.beginPath(); ctx.arc(face * 13, top - 14, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(0, -21, 22, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(170,225,255,0.3)'; ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(0, -21, 16, -2.7, -1.9); ctx.stroke();
    }
  }

  /* --------------------------------------------------------- world */
  var TAU = Math.PI * 2;
  // A fixed number in [0, 1) per tile, so a moving trap tile carries exactly the
  // same marks as the ground it pretends to be.
  function hash(x, y, k) {
    var h = Math.imul(x * 73 + y * 151 + k * 31 + 7, 0x9e3779b1);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
  }

  // One backdrop per world: sky gradient plus two silhouette layers, baked once
  // and dropped when the world changes. Tier 0 is a still plate (clouds included).
  // Higher tiers draw the clouds live so they can drift. Tiles are never part of it.
  var BD = null, BD_KEY = '';
  var LOOK = {
    sun: ['#ffe9a8', '#ff9a1f', '#c45a14', 'hills'],
    sea: ['#d9fff6', '#2eb8ae', '#0e6e78', 'waves'],
    candy: ['#ffe4f6', '#ff78b4', '#e23d88', 'candy'],
    forest: ['#e9ffb4', '#74c83a', '#2d7a20', 'trees'],
    space: ['#6a58c8', '#1c1044', '#0e0828', 'stars'],
    ice: ['#f5fbff', '#7ec8f2', '#eaf7ff', 'snow'],
    castle: ['#ffd8c8', '#e07858', '#7a3830', 'fort'],
    toys: ['#fff3b4', '#f0b020', '#d07018', 'hills'],
    tower: ['#d8e6ff', '#4a8af0', '#1e3878', 'fort'],
    music: ['#e6ffee', '#3ed488', '#146848', 'waves'],
    haunt: ['#f6e6ff', '#c070e4', '#fffafc', 'ghosts'],
    royal: ['#ffd4d8', '#e25868', '#ffd23f', 'fort']
  };
  function hill(g, w, h, y0, amp, n) {
    var i, x, step = w / n;
    g.beginPath(); g.moveTo(0, h); g.lineTo(0, y0);
    for (i = 1; i <= n; i++) { x = step * i; g.quadraticCurveTo(x - step * 0.5, y0 - amp, x, y0); }
    g.lineTo(w, h); g.closePath(); g.fill();
  }
  function faceGhost(g, x, y, s) {
    g.fillStyle = '#fffafc'; g.beginPath();
    g.arc(x, y, s, Math.PI, 0);
    g.quadraticCurveTo(x + s * 0.7, y + s * 1.15, x + s * 0.35, y + s * 0.85);
    g.quadraticCurveTo(x, y + s * 1.2, x - s * 0.35, y + s * 0.85);
    g.quadraticCurveTo(x - s * 0.7, y + s * 1.15, x - s, y);
    g.fill();
    g.lineWidth = Math.max(2, s * 0.12); g.strokeStyle = '#6a3a88'; g.stroke();
    g.fillStyle = '#2a1840'; g.beginPath();
    g.arc(x - s * 0.32, y - s * 0.08, s * 0.13, 0, TAU);
    g.arc(x + s * 0.32, y - s * 0.08, s * 0.13, 0, TAU); g.fill();
    g.fillStyle = '#ff8fb5'; g.beginPath();
    g.arc(x - s * 0.5, y + s * 0.16, s * 0.11, 0, TAU);
    g.arc(x + s * 0.5, y + s * 0.16, s * 0.11, 0, TAU); g.fill();
    g.strokeStyle = '#2a1840'; g.lineWidth = Math.max(1.5, s * 0.08); g.beginPath();
    g.arc(x, y + s * 0.18, s * 0.2, 0.2 * Math.PI, 0.8 * Math.PI); g.stroke();
  }
  function sil(g, w, h, kind, layer, col) {
    var y0 = h * (layer ? 0.78 : 0.62), amp = layer ? h * 0.16 : h * 0.1, i, x, s, yy, j, top;
    g.save(); g.fillStyle = col; g.globalAlpha = layer ? 0.92 : 0.42;
    if (kind === 'stars') {
      g.fillStyle = '#fff6c9'; g.globalAlpha = layer ? 0.95 : 0.55;
      if (!layer) {
        for (i = 0; i < 16; i++) { x = (i * 97) % w; yy = 16 + (i * 41) % (h * 0.55); s = 1.5 + (i % 3); g.beginPath(); g.arc(x, yy, s, 0, TAU); g.fill(); }
      } else {
        g.beginPath(); g.arc(w * 0.72, h * 0.26, h * 0.11, 0, TAU); g.fill();
        g.strokeStyle = '#ffffff'; g.globalAlpha = 0.4; g.lineWidth = 6;
        g.beginPath(); g.ellipse(w * 0.72, h * 0.26, h * 0.2, h * 0.045, -0.45, 0, TAU); g.stroke();
      }
    } else if (kind === 'ghosts') {
      if (!layer) hill(g, w, h, h * 0.72, h * 0.08, 4);
      else { g.globalAlpha = 1; for (i = 0; i < 3; i++) faceGhost(g, w * (0.2 + i * 0.26), h * 0.4, h * 0.065); }
    } else if (kind === 'waves') {
      g.globalAlpha = layer ? 0.5 : 0.28; g.strokeStyle = col; g.lineWidth = layer ? 8 : 5; g.beginPath();
      for (i = 0; i < (layer ? 3 : 2); i++) {
        yy = h * (0.42 + i * 0.1); g.moveTo(0, yy);
        for (x = 0; x <= w; x += 20) g.lineTo(x, yy + Math.sin(x / 36 + i) * (layer ? 7 : 4));
      }
      g.stroke();
      g.fillStyle = col; g.globalAlpha = layer ? 0.85 : 0.4;
      hill(g, w, h, h * (layer ? 0.86 : 0.74), layer ? 22 : 12, 5);
    } else if (kind === 'trees') {
      hill(g, w, h, y0, amp * 0.4, 5);
      g.globalAlpha = layer ? 0.9 : 0.4; g.fillStyle = col;
      for (i = 0; i < (layer ? 6 : 4); i++) {
        x = (i + 0.5) * w / (layer ? 6 : 4); s = layer ? 22 : 14;
        g.fillRect(x - 3, y0 - s * 2.2, 6, s * 2.2);
        g.beginPath(); g.arc(x, y0 - s * 2.1, s, 0, TAU); g.fill();
      }
    } else if (kind === 'candy') {
      hill(g, w, h, y0, amp * 0.45, 4);
      if (layer) {
        for (i = 0; i < 4; i++) {
          x = w * (0.14 + i * 0.22); s = 18;
          g.globalAlpha = 0.9; g.fillStyle = '#fffafc'; g.fillRect(x - 3, y0 - 64, 6, 64);
          g.beginPath(); g.arc(x, y0 - 70, s, 0, TAU); g.fill();
          g.strokeStyle = i % 2 ? '#ff5a9a' : '#7d5cff'; g.lineWidth = 3; g.beginPath();
          g.arc(x, y0 - 70, s * 0.55, 0.4, 2.4); g.stroke();
        }
      }
    } else if (kind === 'snow') {
      g.fillStyle = layer ? '#f4fbff' : '#c5e6f8';
      hill(g, w, h, y0 - 8, amp * 1.25, 3);
      if (layer) { g.fillStyle = '#ffffff'; g.globalAlpha = 0.95; hill(g, w, h, y0 - amp * 0.85, amp * 0.35, 3); }
    } else if (kind === 'fort') {
      g.beginPath();
      for (i = 0; i < (layer ? 4 : 3); i++) {
        x = w * (0.06 + i * 0.3); s = layer ? 64 : 40; top = h * (layer ? 0.4 : 0.52);
        g.rect(x, top, s, h - top); g.rect(x - 6, top - 12, s + 12, 12);
        for (j = 0; j < s; j += 14) g.rect(x + j, top - 22, 7, 12);
      }
      g.fill();
    } else hill(g, w, h, y0, amp, layer ? 4 : 3);
    if (!layer && kind !== 'stars' && kind !== 'ghosts') {
      g.globalAlpha = 0.9; g.fillStyle = '#fff3b0';
      g.beginPath(); g.arc(w * 0.8, h * 0.18, kind === 'snow' ? 16 : 26, 0, TAU); g.fill();
    }
    g.restore();
  }
  function paintPlate(g, w, h, theme, tier) {
    var L = LOOK[theme] || LOOK.sun, sky = window.Kit.art.sky(theme, w, h, [L[0], L[1]]), i;
    if (sky.canvas) g.drawImage(sky.canvas, 0, 0, w, h);
    else { g.fillStyle = L[1]; g.fillRect(0, 0, w, h); }
    sil(g, w, h, L[3], 0, L[2]);
    sil(g, w, h, L[3], 1, L[2]);
    if (!tier) {
      g.fillStyle = 'rgba(255,255,255,0.88)';
      for (i = 0; i < 3; i++) {
        g.beginPath(); g.arc(70 + i * 190, 42 + (i % 2) * 18, 14, 0, TAU); g.arc(88 + i * 190, 38 + (i % 2) * 18, 10, 0, TAU); g.fill();
      }
    }
  }
  Art.invalidate = function () { BD = null; BD_KEY = ''; };
  Art.backdrop = function (theme, tier) {
    var key = (theme || 'sun') + ':' + (tier > 0 ? 1 : 0);
    if (BD && BD_KEY === key && BD.canvas) return BD;
    BD = null; BD_KEY = key;
    BD = window.Kit.art.bake('tlbd:' + key, 640, 360, function (g, w, h) { paintPlate(g, w, h, theme || 'sun', tier > 0 ? 1 : 0); });
    return BD;
  };
  var CLOUD = null;
  Art.drawSkyBits = function (ctx, t, tier) {
    var reduced, drift, i, x, y, s, c;
    if (!tier) return;
    reduced = window.Kit.motion && window.Kit.motion.reduced();
    if (!CLOUD || !CLOUD.canvas) CLOUD = window.Kit.art.sprite('tl-cloud', 86, 36, function (g) {
      g.fillStyle = '#ffffff'; g.beginPath();
      g.arc(24, 22, 12, 0, TAU); g.arc(42, 16, 14, 0, TAU); g.arc(60, 22, 11, 0, TAU); g.fill();
    });
    c = CLOUD; if (!c || !c.canvas) return;
    drift = reduced ? 0 : Math.sin(t * 0.18) * 28;
    ctx.save();
    for (i = 0; i < (tier > 1 ? 4 : 2); i++) {
      x = ((i * 320 + drift * (0.55 + (i % 2) * 0.7)) % 1480 + 1480) % 1480 - 90;
      y = 54 + (i % 3) * 34; s = 0.85 + (i % 2) * 0.28;
      ctx.globalAlpha = 0.75;
      ctx.drawImage(c.canvas, x, y, 86 * s, 36 * s);
    }
    ctx.restore();
  };

  var SPRINKLES = ['#ff8fc7', '#ffe14d', '#7ff5e0', '#ffffff'];
  var GROUND = {
    sun: { top: '#c4561f', line: '#ffc46b', bumps: 1, mark: 'pebble' },
    sea: { top: '#ffe2a0', bumps: 1, mark: 'ring', stroke: 2.5 },
    candy: { top: '#fff3f9', drips: 1, mark: 'sprinkle', stroke: 5 },
    forest: { top: '#5fc23c', line: '#a3e85e', bumps: 1, mark: 'pebble' },
    space: { top: '#d6ccff', line: '#ffffff', mark: 'ring', stroke: 2.5 }
  };
  Art.GROUND = GROUND;

  // Does cell (x, y) sit flush against the tiles being drawn? Only the cell
  // above a tile is asked; above the screen counts as fixed ceiling. grp is a
  // group drawn live, or null for the fixed ground (baked once: unrevealed '!'
  // blocks never count, so the ground under them does not give them away), or
  // OPEN for fixed ground whose trap block has left (see Art.drawOpened).
  var OPEN = {};
  function solidAt(w, grp, x, y) {
    if (grp === OPEN) return false;
    var i = y * E.COLS + x, fixed = y < 0 || !!w.grid[i], h = y < 0 ? null : w.owner[i];
    if (h && h.invis && !(grp && h.revealed)) h = null;
    if (!grp) return fixed || !!h;
    if (h) return h === grp || (h.active && h.ox === grp.ox && h.oy === grp.oy);
    return fixed && !grp.ox && !grp.oy;
  }

  // Adds a rectangle whose edges sit on whole device pixels (k per logical px).
  // Such edges are not anti-aliased, so baked and live tiles match pixel for pixel.
  function prect(ctx, x, y, w, h, k) {
    var x0 = Math.round(x * k) / k, y0 = Math.round(y * k) / k;
    ctx.rect(x0, y0, Math.round((x + w) * k) / k - x0, Math.round((y + h) * k) / k - y0);
  }

  // Every solid tile, fixed or part of a trap, is drawn by this one routine, so a
  // fake block or shy floor looks exactly like the real ground. Each layer is one
  // path with pixel-snapped edges, so tiles never show seams between them.
  function blob(g, x, y, r) { g.moveTo(x + r, y); g.arc(x, y, r, 0, TAU); }
  function drawTiles(ctx, w, grp, tiles, ox, oy, pal, k) {
    var st = GROUND[pal.theme] || GROUND.sun, n = tiles.length;
    var i, b, x, y, px, py, l, r, v, c, m, list;
    var body = st.top ? window.Kit.art.shade(st.top, -0.34) : pal.bg;
    var side = st.top ? window.Kit.art.shade(st.top, -0.55) : pal.ink;
    ctx.save();
    ctx.fillStyle = body; ctx.beginPath();
    for (i = 0; i < n; i++) prect(ctx, tiles[i].x * T + ox, tiles[i].y * T + oy, T, T, k);
    ctx.fill();
    // Right and bottom shade on every tile: a crack of AO where tiles meet,
    // and a side face on the rim. Same routine for real ground and fake blocks.
    ctx.fillStyle = side; ctx.beginPath();
    for (i = 0; i < n; i++) {
      px = tiles[i].x * T + ox; py = tiles[i].y * T + oy;
      prect(ctx, px + T - 5, py, 5, T, k); prect(ctx, px, py + T - 6, T, 6, k);
    }
    ctx.fill();
    ctx.fillStyle = pal.ink; ctx.beginPath(); m = 0;
    for (i = 0; i < n; i++) {
      x = tiles[i].x; y = tiles[i].y; px = x * T + ox; py = y * T + oy;
      if (!solidAt(w, grp, x - 1, y)) { prect(ctx, px, py, 3, T, k); m++; }
      if (!solidAt(w, grp, x + 1, y)) { prect(ctx, px + T - 3, py, 3, T, k); m++; }
      if (!solidAt(w, grp, x, y + 1)) { prect(ctx, px, py + T - 3, T, 3, k); m++; }
    }
    if (m) ctx.fill();
    // the themed top on every exposed top (and an optional bright line above it)
    for (c = 0; c < (st.line ? 2 : 1); c++) {
      ctx.fillStyle = c ? st.line : (st.top ? window.Kit.art.shade(st.top, 0.32) : pal.bg); ctx.beginPath(); m = 0;
      for (i = 0; i < n; i++) {
        x = tiles[i].x; y = tiles[i].y;
        if (solidAt(w, grp, x, y - 1)) continue;
        px = x * T + ox; py = y * T + oy; m++;
        prect(ctx, px, py, T, c ? 2 : 9, k);
        if (c) continue;
        if (st.bumps) for (b = 0; b < 4; b++) { ctx.moveTo(px + b * 10 + 10, py + 5); ctx.arc(px + b * 10 + 5, py + 5, 5, 0, Math.PI); }
        if (st.drips) for (b = 0; b < 2; b++) {
          v = hash(x, y, b); var dx = px + 7 + b * 18 + v * 8, dl = 4 + v * 12;
          prect(ctx, dx - 3, py + 4, 6, dl, k); ctx.moveTo(dx + 3, py + 4 + dl); ctx.arc(dx, py + 4 + dl, 3, 0, Math.PI);
        }
      }
      if (!m) break; // nothing exposed (skip empty fills for live groups)
      ctx.fill();
      if (!c && window.Kit.art.quality.tier > 0) {
        for (i = 0; i < n; i++) {
          x = tiles[i].x; y = tiles[i].y;
          if (solidAt(w, grp, x, y - 1)) continue;
          window.Kit.art.gloss(ctx, x * T + ox + 3, y * T + oy + 3, T - 8, 8);
        }
      }
    }
    // small marks inside the ground, on a checkerboard like the original dots
    list = st.mark === 'sprinkle' ? SPRINKLES : [pal.ink2];
    ctx.globalAlpha = 0.45; ctx.lineCap = 'round'; ctx.lineWidth = st.stroke || 1;
    for (c = 0; c < list.length; c++) {
      ctx.beginPath(); m = 0;
      for (i = 0; i < n; i++) {
        x = tiles[i].x; y = tiles[i].y;
        if ((x + y) % 2 || !solidAt(w, grp, x, y - 1)) continue;
        v = hash(x, y, 5);
        if (list.length > 1 && Math.floor(v * list.length) !== c) continue;
        m++; px = x * T + ox + 10 + v * 20; py = y * T + oy + 10 + hash(x, y, 6) * 20;
        if (st.mark === 'ring') blob(ctx, px, py, 3 + v * 3);
        else if (st.mark === 'sprinkle') { l = Math.cos(v * 9) * 5; r = Math.sin(v * 9) * 5; ctx.moveTo(px - l, py - r); ctx.lineTo(px + l, py + r); }
        else { ctx.moveTo(px + 4 + v * 3, py); ctx.ellipse(px, py, 4 + v * 3, 3 + v, 0, 0, TAU); } // pebble
      }
      if (!m) continue;
      if (st.stroke) { ctx.strokeStyle = list[c]; ctx.stroke(); } else { ctx.fillStyle = list[c]; ctx.fill(); }
    }
    ctx.restore();
  }

  // Bakes the scenery and fixed ground of a level. Pass the previous canvas to
  // reuse it instead of allocating a new full-screen canvas each time.
  Art.buildStatic = function (w, pal, res, seed, c) {
    c = c || document.createElement('canvas');
    c.width = Math.round(E.W * res); c.height = Math.round(E.H * res);
    var g = c.getContext('2d'), tiles = [], tier = window.Kit.art.quality.tier, bd;
    g.setTransform(res, 0, 0, res, 0, 0);
    bd = Art.backdrop(pal.theme, tier);
    if (bd && bd.canvas) g.drawImage(bd.canvas, 0, 0, E.W, E.H);
    else { g.fillStyle = pal.bg; g.fillRect(0, 0, E.W, E.H); }
    if (tier > 0) window.Kit.art.vignette(g, E.W, E.H, 0.2);
    for (var y = 0; y < E.ROWS; y++) for (var x = 0; x < E.COLS; x++) if (w.grid[y * E.COLS + x]) tiles.push({ x: x, y: y });
    drawTiles(g, w, null, tiles, 0, 0, pal, res);
    for (var m = 0; m < Art.MODS.length; m++) if (Art.MODS[m].bake) { g.save(); Art.MODS[m].bake(g, w, pal); g.restore(); }
    return c;
  };

  // Fixed ground under a trap block is baked without its top, as one mass with
  // the block. Once the block has moved off or vanished, those tiles are drawn
  // again over the baked canvas with their grass, sand or frosting.
  var opened = [];
  Art.drawOpened = function (ctx, w, pal, k) {
    var n = 0, i, q, g, x, y;
    for (i = 0; i < w.groups.length; i++) {
      g = w.groups[i];
      if (g.invis || g.own || (g.active && !g.ox && !g.oy)) continue;
      for (q = 0; q < g.tiles.length; q++) {
        x = g.tiles[q].x; y = g.tiles[q].y + 1;
        if (y >= E.ROWS || !w.grid[y * E.COLS + x]) continue;
        if (!opened[n]) opened[n] = {};
        opened[n].x = x; opened[n++].y = y;
      }
    }
    opened.length = n;
    if (n) drawTiles(ctx, w, OPEN, opened, 0, 0, pal, k);
  };

  function twinkle(ctx, x, y, r, a) {
    ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.quadraticCurveTo(x, y, x, y + r);
    ctx.quadraticCurveTo(x, y, x - r, y); ctx.quadraticCurveTo(x, y, x, y - r);
    ctx.fill(); ctx.restore();
  }

  // k: device pixels per logical pixel of ctx (for pixel-snapped tile edges).
  Art.drawGroups = function (ctx, w, pal, t, k) {
    for (var i = 0; i < w.groups.length; i++) {
      var g = w.groups[i];
      if (!g.active) continue;
      if (g.invis && !g.revealed) {
        // hidden block: an occasional faint twinkle is the only clue ("trust the sparkle")
        for (var q = 0; q < g.tiles.length; q++) {
          var tq = g.tiles[q], ph = Math.sin(t * 2.3 + tq.x * 1.9 + tq.y * 0.7);
          if (ph < 0.55) continue;
          var ta = Math.pow((ph - 0.55) / 0.45, 2) * 0.85;
          twinkle(ctx, tq.x * T + g.ox + 20 + ((tq.x * 7) % 11) - 5, tq.y * T + g.oy + 12, 3 + ta * 6, ta);
        }
        continue;
      }
      if (g.own) continue;
      var jx = 0, jy = 0;
      if (g.shakeT > 0) { jx = Math.sin(t * 90 + i) * 2.5; jy = Math.cos(t * 70 + i) * 1.5; }
      var tiles = g.tiles;
      drawTiles(ctx, w, g, tiles, g.ox + jx, g.oy + jy, pal, k);
      if (g.invis) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.setLineDash([6, 5]); ctx.lineWidth = 2;
        for (q = 0; q < tiles.length; q++) ctx.strokeRect(tiles[q].x * T + g.ox + 3, tiles[q].y * T + g.oy + 3, T - 6, T - 6);
        ctx.restore();
      }
    }
  };

  Art.drawSpikes = function (ctx, w, pal) {
    ctx.fillStyle = pal.ink;
    for (var i = 0; i < w.spikes.length; i++) {
      var s = w.spikes[i];
      if (s.g && !s.g.active) continue;
      if (s.out <= 0.001) continue;
      var ox = s.g ? s.g.ox : 0, oy = s.g ? s.g.oy : 0;
      var cx = s.x + ox, cy = s.y + oy;
      var clip = s.out < 0.999;
      if (clip) { ctx.save(); ctx.beginPath(); ctx.rect(cx, cy, T, T); ctx.clip(); }
      var sh = (1 - s.out) * T;
      ctx.beginPath();
      for (var k = 0; k < 2; k++) {
        var a = k * 20;
        if (s.dir === 'u') { ctx.moveTo(cx + a, cy + T + sh); ctx.lineTo(cx + a + 10, cy + 12 + sh); ctx.lineTo(cx + a + 20, cy + T + sh); }
        else if (s.dir === 'd') { ctx.moveTo(cx + a, cy - sh); ctx.lineTo(cx + a + 10, cy + T - 12 - sh); ctx.lineTo(cx + a + 20, cy - sh); }
        else if (s.dir === 'l') { ctx.moveTo(cx + T + sh, cy + a); ctx.lineTo(cx + 12 + sh, cy + a + 10); ctx.lineTo(cx + T + sh, cy + a + 20); }
        else { ctx.moveTo(cx - sh, cy + a); ctx.lineTo(cx + T - 12 - sh, cy + a + 10); ctx.lineTo(cx - sh, cy + a + 20); }
      }
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2; ctx.stroke();
      if (clip) ctx.restore();
    }
  };

  Art.drawSprings = function (ctx, w, pal) {
    for (var i = 0; i < w.springs.length; i++) {
      var s = w.springs[i];
      if (s.g && !s.g.active) continue;
      s.anim = Math.max(0, s.anim - 0.05);
      var x = s.x + (s.g ? s.g.ox : 0), y = s.y + (s.g ? s.g.oy : 0);
      ctx.save();
      ctx.translate(x + T / 2, s.hang ? y : y + T);
      if (s.hang) ctx.scale(1, -1);
      var comp = s.anim > 0.5 ? 1 - (s.anim - 0.5) * 2 : 1 + s.anim * 0.8;
      var ht = 16 * comp;
      ctx.fillStyle = pal.ink; ctx.fillRect(-16, -5, 32, 5);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(-8, -5);
      for (var k = 1; k <= 4; k++) ctx.lineTo(k % 2 ? 8 : -8, -5 - ht * k / 4);
      ctx.stroke();
      rr(ctx, -17, -9 - ht, 34, 7, 3); ctx.fillStyle = '#ff4d6d'; ctx.fill();
      ctx.lineWidth = 2.5; ctx.strokeStyle = pal.ink; ctx.stroke();
      ctx.restore();
    }
  };

  Art.drawDoor = function (ctx, d, pal, t, glow) {
    var x = d.x + (d.g ? d.g.ox : 0), y = d.y + (d.g ? d.g.oy : 0);
    if (d.g && !d.g.active) return;
    ctx.save();
    ctx.translate(x + 20, d.hang ? y : y + 60);
    if (d.hang) ctx.scale(1, -1);
    // frame
    ctx.fillStyle = pal.ink;
    ctx.beginPath(); ctx.moveTo(-20, 0); ctx.lineTo(-20, -44); ctx.arc(0, -44, 20, Math.PI, 0); ctx.lineTo(20, 0); ctx.closePath(); ctx.fill();
    // inner
    ctx.fillStyle = glow ? '#ffffff' : pal.bg2;
    ctx.beginPath(); ctx.moveTo(-13, 0); ctx.lineTo(-13, -42); ctx.arc(0, -42, 13, Math.PI, 0); ctx.lineTo(13, 0); ctx.closePath(); ctx.fill();
    if (d.bit) {
      // the fake door shows its silly face
      ctx.fillStyle = pal.ink;
      ctx.beginPath(); ctx.arc(-5, -40, 3, 0, Math.PI * 2); ctx.arc(5, -40, 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(0, -28, 7, 0, Math.PI); ctx.fill();
      ctx.fillStyle = '#ff5c8a'; ctx.beginPath(); ctx.ellipse(0, -21, 4, 6, 0, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = pal.ink;
      ctx.beginPath(); ctx.arc(7, -24, 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  };

  Art.drawSaw = function (ctx, s, pal) {
    ctx.save();
    ctx.translate(s.x, s.y); ctx.rotate(s.rot);
    var r = s.r;
    ctx.fillStyle = pal.ink;
    ctx.beginPath();
    for (var i = 0; i < 12; i++) {
      var a0 = i / 12 * Math.PI * 2, a1 = (i + 0.5) / 12 * Math.PI * 2;
      ctx.lineTo(Math.cos(a0) * r * 0.78, Math.sin(a0) * r * 0.78);
      ctx.lineTo(Math.cos(a1) * r, Math.sin(a1) * r);
    }
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-r * 0.2, 0); ctx.lineTo(r * 0.2, 0); ctx.moveTo(0, -r * 0.2); ctx.lineTo(0, r * 0.2); ctx.stroke();
    ctx.restore();
  };

  Art.drawGZones = function (ctx, w, pal, t) {
    if (!w.gz.length) return;
    ctx.save();
    for (var i = 0; i < w.gz.length; i++) {
      var z = w.gz[i];
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.fillRect(z.x + 4, z.y, T - 8, T);
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      var dir = -w.gs; // where you'll go after the flip
      var off = ((t * 40) % 20);
      for (var k = -1; k < 2; k++) {
        var cy = z.y + T / 2 + (k * 20 + off * dir) ;
        if (cy < z.y + 6 || cy > z.y + T - 6) continue;
        ctx.beginPath(); ctx.moveTo(z.x + 12, cy - dir * 5); ctx.lineTo(z.x + 20, cy + dir * 5); ctx.lineTo(z.x + 28, cy - dir * 5); ctx.stroke();
      }
    }
    ctx.restore();
  };

  window.TrollArt = Art;
})();
