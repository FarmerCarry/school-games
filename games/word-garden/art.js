/* حديقة الكلمات drawing: the garden scenes, the school keyboard, every word's picture,
 * the plants that grow, bees, butterflies and the garden's decorations. Static layers
 * (scenes, the keyboard with its legends, picture cards) are rendered once per pixel
 * scale into offscreen canvases; per frame there are only blits and a few paths.
 * No image files, no getImageData, nothing touches the page while this file loads.
 * Words are DOM text (game.js): this file never draws Arabic letter by letter. */
(function () {
  'use strict';
  var WG = window.WG, W = WG.W, H = WG.H, TAU = Math.PI * 2, INK = '#1c2250';
  var A = WG.art = {};
  A.INK = INK;
  A.FONT = 'Fredoka';
  A.RAINBOW = ['#ff5d6c', '#ff9f43', '#ffd23f', '#5be38f', '#4fd1ff', '#b48cff'];
  A.TINT = { r: '#ff4d4d', g: '#5ccf4a', b: '#4d8dff', y: '#ffd43b', w: '#ffffff' };

  function cv(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
  function rr(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function rgb(hex) { var n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function shade(hex, a) { return 'rgb(' + rgb(hex).map(function (v) { return Math.round(a >= 0 ? v + (255 - v) * a : v * (1 + a)); }).join(',') + ')'; }
  function alpha(hex, a) { return 'rgba(' + rgb(hex).join(',') + ',' + a + ')'; }
  function seeded(n) { return function () { n = (n * 16807) % 2147483647; return (n - 1) / 2147483646; }; }
  function font(size, weight) { return (weight || 700) + ' ' + size + 'px ' + A.FONT; }
  A.rr = rr; A.shade = shade; A.font = font;

  /* ------------------------------------------------------ path helpers */
  // G is the context the helpers draw on: a filled shape with the ink outline on top.
  var G, LW = 3;
  function use(g, lw) { G = g; LW = lw || 3; g.lineJoin = 'round'; g.lineCap = 'round'; }
  function st(w, c) { G.lineWidth = w || LW; G.strokeStyle = c || INK; G.stroke(); }
  function fl(c) { if (c) { G.fillStyle = c; G.fill(); } }
  function O(x, y, rx, ry, c, rot, noInk) { G.beginPath(); G.ellipse(x, y, rx, ry, rot || 0, 0, TAU); fl(c); if (!noInk) st(); }
  function C(x, y, r, c, noInk) { O(x, y, r, r, c, 0, noInk); }
  function B(x, y, w, h, r, c, noInk) { rr(G, x, y, w, h, r); fl(c); if (!noInk) st(); }
  function P(pts, c, noInk) { G.beginPath(); for (var i = 0; i < pts.length; i += 2) G[i ? 'lineTo' : 'moveTo'](pts[i], pts[i + 1]); G.closePath(); fl(c); if (!noInk) st(); }
  // An SVG path: filled (c) and inked; w is the ink width (0: no ink).
  function S(d, c, w) { var p = new Path2D(d); if (c) { G.fillStyle = c; G.fill(p); } if (w !== 0) { G.lineWidth = w || LW; G.strokeStyle = INK; G.stroke(p); } }
  // A thick coloured line with an ink edge (tails, stems, handles).
  function T(d, w, c) { var p = new Path2D(d); G.lineWidth = w + LW * 2; G.strokeStyle = INK; G.stroke(p); G.lineWidth = w; G.strokeStyle = c; G.stroke(p); }
  function L(d, w, c) { var p = new Path2D(d); G.lineWidth = w || LW; G.strokeStyle = c || INK; G.stroke(p); }
  function dot(x, y, r, c) { G.beginPath(); G.arc(x, y, r, 0, TAU); G.fillStyle = c || INK; G.fill(); }
  function eyes(x, y, d, r) { r = r || 2.8; dot(x - d, y, r); dot(x + d, y, r); dot(x - d + r * 0.35, y - r * 0.35, r * 0.35, '#fff'); dot(x + d + r * 0.35, y - r * 0.35, r * 0.35, '#fff'); }
  function smile(x, y, w) { G.beginPath(); G.arc(x, y - w * 0.55, w, 0.5, Math.PI - 0.5); st(2.2); }
  function cheeks(x, y, d) { dot(x - d, y, 3, 'rgba(255,105,150,0.45)'); dot(x + d, y, 3, 'rgba(255,105,150,0.45)'); }
  function star(g, x, y, R, r, rot) {
    g.beginPath();
    for (var i = 0; i < 10; i++) { var a = (rot || 0) - Math.PI / 2 + i * Math.PI / 5, d = i % 2 ? r : R; g[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * d, y + Math.sin(a) * d); }
    g.closePath();
  }
  A.star = star;

  var cache = {}, cacheN = 0;
  A.reset = function () { cache = {}; cacheN = 0; };
  function layer(key, ps, w, h, draw) {
    var k = key + '@' + ps;
    if (cache[k]) return cache[k];
    if (++cacheN > 90) { cache = {}; cacheN = 1; }
    var c = cv(w * ps, h * ps), g = c.getContext('2d');
    g.scale(ps, ps); draw(g);
    return (cache[k] = c);
  }

  /* ---------------------------------------------------------- pictures */
  // Every picture is drawn in a 100 x 100 box; c is its main colour (a phrase can change it).
  A.PICS = {
    /* animals */
    cat: function (c) {
      c = c || '#ffa94d';
      T('M70 84 Q94 84 91 62 Q90 50 82 52', 7, c);
      O(50, 76, 24, 16, c);
      P([28, 34, 27, 9, 47, 24], c); P([72, 34, 73, 9, 53, 24], c);
      P([31, 27, 30, 15, 40, 23], '#ffb3c6', 1); P([69, 27, 70, 15, 60, 23], '#ffb3c6', 1);
      C(50, 46, 23, c);
      eyes(50, 42, 9); P([46, 50, 54, 50, 50, 54], '#ff8fab'); smile(46, 57, 4); smile(54, 57, 4);
      L('M30 50 L16 47 M30 54 L16 56 M70 50 L84 47 M70 54 L84 56', 1.8); cheeks(50, 53, 14);
    },
    dog: function (c) {
      c = c || '#d49a5b';
      O(50, 82, 20, 12, c);
      C(50, 46, 24, c);
      O(27, 48, 8, 17, '#8a5a2b', 0.25); O(73, 48, 8, 17, '#8a5a2b', -0.25);
      O(50, 58, 13, 10, '#f6dcb8'); O(50, 52, 5, 3.6, INK);
      eyes(50, 40, 10); smile(50, 63, 5); S('M48 62 Q50 70 52 62 Z', '#ff6b8a', 1.6); cheeks(50, 57, 17);
    },
    duck: function (c) {
      c = c || '#ffd43b';
      S('M8 84 Q20 78 32 84 T56 84 T80 84 T96 84', null, 2.5);
      O(54, 66, 30, 17, c);
      S('M80 58 Q94 50 92 62 Q88 66 82 66 Z', c);
      C(36, 40, 16, c);
      P([22, 40, 6, 44, 22, 48], '#ff922b');
      O(58, 64, 14, 8, shade(c, -0.12), -0.25); eyes(34, 36, 0.01); dot(34, 36, 3); cheeks(40, 46, 0.01);
    },
    lion: function (c) {
      c = c || '#ffc048';
      for (var i = 0; i < 12; i++) { var a = i / 12 * TAU; C(50 + Math.cos(a) * 25, 50 + Math.sin(a) * 25, 11, '#e8792a'); }
      C(50, 50, 28, '#e8792a', 1);
      C(33, 31, 7, c); C(67, 31, 7, c);
      C(50, 51, 21, c);
      eyes(50, 46, 8); P([45, 53, 55, 53, 50, 58], '#7a3e16'); smile(46, 61, 4); smile(54, 61, 4); cheeks(50, 56, 14);
    },
    elephant: function (c) {
      c = c || '#a3b4c6';
      B(42, 70, 11, 20, 4, c); B(70, 70, 11, 20, 4, c);
      O(60, 62, 28, 20, c);
      O(48, 46, 15, 19, shade(c, -0.12));
      C(32, 46, 19, c);
      T('M20 54 Q12 70 20 82 Q24 86 26 80', 8, c);
      S('M26 62 Q30 70 36 66', '#fff', 2);
      eyes(30, 42, 0.01); dot(30, 42, 3); cheeks(36, 52, 0.01);
    },
    fish: function (c) {
      c = c || '#ff922b';
      P([74, 55, 94, 38, 94, 72], c);
      O(46, 55, 30, 21, c);
      S('M44 36 Q54 26 64 38', c, 2.5);
      L('M52 42 Q58 55 52 68 M62 44 Q67 55 62 66', 2, shade(c, -0.25));
      C(28, 50, 6, '#fff'); dot(27, 51, 3); smile(24, 62, 4);
      C(14, 26, 4, 'rgba(160,220,255,.7)'); C(8, 14, 3, 'rgba(160,220,255,.7)');
    },
    rabbit: function (c) {
      c = c || '#eef0f4';
      O(50, 84, 22, 12, c);
      O(39, 24, 7, 21, c); O(61, 24, 7, 21, c);
      O(39, 26, 3, 14, '#ffb3c6', 0, 1); O(61, 26, 3, 14, '#ffb3c6', 0, 1);
      C(50, 56, 21, c);
      eyes(50, 52, 8); O(50, 60, 3.5, 2.6, '#ff8fab'); B(46.5, 64, 7, 6, 1.5, '#fff', 0); L('M50 63 L50 69', 1.5);
      cheeks(50, 61, 13);
    },
    horse: function (c) {
      c = c || '#b8733d';
      P([34, 24, 36, 6, 46, 20], c); P([66, 24, 64, 6, 54, 20], c);
      O(50, 46, 19, 30, c);
      S('M40 18 Q50 8 60 18 Q56 30 50 26 Q44 30 40 18 Z', '#5c3317');
      O(50, 70, 17, 13, '#f0c39b');
      dot(44, 70, 2.4); dot(56, 70, 2.4); eyes(50, 44, 10); smile(50, 78, 5);
    },
    cow: function (c) {
      c = c || '#ffffff';
      S('M28 26 Q20 14 26 10 Q30 18 34 24 Z', '#f1e3c6'); S('M72 26 Q80 14 74 10 Q70 18 66 24 Z', '#f1e3c6');
      O(22, 38, 11, 6, c, -0.4); O(78, 38, 11, 6, c, 0.4);
      O(50, 46, 24, 24, c);
      O(38, 34, 7, 9, INK, 0.4, 1); O(64, 50, 6, 7, INK, 0, 1);
      O(50, 66, 18, 12, '#ffb3c6');
      dot(44, 66, 2.6); dot(56, 66, 2.6); eyes(50, 44, 10);
    },
    sheep: function (c) {
      c = c || '#ffffff';
      for (var i = 0; i < 10; i++) { var a = i / 10 * TAU; C(50 + Math.cos(a) * 27, 54 + Math.sin(a) * 22, 13, c); }
      O(50, 54, 30, 24, c, 0, 1);
      O(28, 46, 8, 5, '#495057', 0.5); O(72, 46, 8, 5, '#495057', -0.5);
      O(50, 52, 14, 17, '#495057');
      C(50, 36, 9, c); dot(45, 50, 2.6, '#fff'); dot(55, 50, 2.6, '#fff'); smile(50, 62, 4);
    },
    hen: function (c) {
      c = c || '#ffffff';
      L('M44 82 L44 94 L38 96 M44 94 L50 96 M58 82 L58 94 L52 96 M58 94 L64 96', 3, '#ff922b');
      S('M76 56 Q94 36 88 64 Q86 72 76 72 Z', c);
      O(52, 62, 26, 22, c);
      C(38, 30, 4.5, '#ff4d4d'); C(45, 27, 5, '#ff4d4d'); C(52, 30, 4.5, '#ff4d4d');
      C(44, 42, 14, c);
      P([30, 42, 20, 46, 30, 50], '#ffd43b'); O(31, 54, 3, 5, '#ff4d4d');
      O(56, 64, 12, 8, '#f1f3f5', -0.3); dot(42, 39, 2.8); cheeks(48, 47, 0.01);
    },
    bee: function (c) {
      c = c || '#ffd43b';
      O(40, 30, 11, 16, 'rgba(225,245,255,.92)', -0.3); O(60, 30, 11, 16, 'rgba(225,245,255,.92)', 0.3);
      P([80, 58, 92, 60, 80, 64], INK);
      O(52, 60, 28, 20, c);
      G.save(); G.beginPath(); G.ellipse(52, 60, 28, 20, 0, 0, TAU); G.clip();
      G.fillStyle = INK; G.fillRect(48, 36, 8, 50); G.fillRect(64, 36, 7, 50); G.restore();
      O(52, 60, 28, 20, null);
      C(26, 58, 14, c);
      L('M22 46 Q18 34 12 32 M30 45 Q32 34 38 30', 2.2); dot(12, 32, 2.5); dot(38, 30, 2.5);
      eyes(25, 56, 5, 2.4); smile(25, 64, 3.5);
    },
    butterfly: function (c) {
      c = c || '#ff7eb6';
      O(32, 36, 20, 17, c, -0.5); O(68, 36, 20, 17, c, 0.5);
      O(36, 66, 14, 12, '#b48cff', 0.5); O(64, 66, 14, 12, '#b48cff', -0.5);
      C(30, 34, 6, '#ffd43b'); C(70, 34, 6, '#ffd43b'); C(36, 67, 4, '#fff'); C(64, 67, 4, '#fff');
      O(50, 52, 5, 24, '#5c3d99');
      L('M48 30 Q42 16 36 14 M52 30 Q58 16 64 14', 2.2); dot(36, 14, 2.5); dot(64, 14, 2.5);
    },
    frog: function (c) {
      c = c || '#69db7c';
      O(28, 84, 12, 6, c); O(72, 84, 12, 6, c);
      O(50, 62, 32, 24, c);
      C(33, 36, 11, c); C(67, 36, 11, c);
      C(33, 36, 6, '#fff'); C(67, 36, 6, '#fff'); dot(34, 37, 3.2); dot(68, 37, 3.2);
      G.beginPath(); G.arc(50, 56, 18, 0.25, Math.PI - 0.25); st(2.6);
      cheeks(50, 64, 22); O(50, 72, 16, 9, shade(c, 0.35), 0, 1);
    },
    monkey: function (c) {
      c = c || '#a0612d';
      C(22, 48, 10, c); C(78, 48, 10, c); C(22, 48, 5, '#f3c99a', 1); C(78, 48, 5, '#f3c99a', 1);
      C(50, 48, 27, c);
      S('M50 40 Q40 30 33 40 Q26 52 34 64 Q42 74 50 74 Q58 74 66 64 Q74 52 67 40 Q60 30 50 40 Z', '#f3c99a', 2.2);
      eyes(50, 46, 8); dot(47, 56, 1.6); dot(53, 56, 1.6); smile(50, 66, 6);
    },
    bear: function (c) {
      c = c || '#9a6534';
      C(28, 28, 10, c); C(72, 28, 10, c); C(28, 28, 5, '#d9a877', 1); C(72, 28, 5, '#d9a877', 1);
      C(50, 52, 28, c);
      O(50, 62, 13, 10, '#e2b98a'); O(50, 57, 5, 3.6, INK);
      eyes(50, 46, 10); smile(46, 67, 4); smile(54, 67, 4); cheeks(50, 58, 19);
    },
    owl: function (c) {
      c = c || '#b07a4a';
      P([28, 30, 26, 14, 40, 24], c); P([72, 30, 74, 14, 60, 24], c);
      O(50, 56, 26, 34, c);
      O(50, 68, 16, 18, '#f5deb3', 0, 1);
      O(26, 60, 7, 16, shade(c, -0.15), 0.25); O(74, 60, 7, 16, shade(c, -0.15), -0.25);
      C(39, 42, 11, '#fff'); C(61, 42, 11, '#fff'); dot(40, 43, 5); dot(60, 43, 5); dot(41.5, 41.5, 1.6, '#fff'); dot(61.5, 41.5, 1.6, '#fff');
      P([46, 50, 54, 50, 50, 58], '#ff922b');
    },
    turtle: function (c) {
      c = c || '#40c057';
      O(30, 76, 7, 9, '#94d82d'); O(66, 76, 7, 9, '#94d82d');
      C(84, 60, 11, '#94d82d');
      S('M14 72 Q14 36 46 36 Q78 36 78 72 Z', c);
      L('M30 72 L36 54 L56 54 L62 72 M36 54 L30 40 M56 54 L62 40 M46 36 L46 46', 2.4, shade(c, -0.35));
      B(10, 68, 74, 8, 4, shade(c, -0.25));
      dot(87, 57, 2.8); smile(86, 64, 3);
    },
    mouse: function (c) {
      c = c || '#b0b8c4';
      T('M78 72 Q96 70 92 52', 3, '#ff9fb8');
      O(56, 68, 26, 18, c);
      C(28, 36, 12, c); C(28, 36, 6, '#ffb3c6', 1);
      C(56, 38, 10, c); C(56, 38, 5, '#ffb3c6', 1);
      O(36, 56, 18, 14, c, -0.3);
      dot(20, 62, 3.4, '#ff8fab'); eyes(34, 52, 0.01); dot(34, 52, 3);
      L('M22 58 L8 54 M22 62 L8 64', 1.6);
    },
    whale: function (c) {
      c = c || '#4c8dff';
      L('M44 20 Q42 10 36 8 M46 20 Q48 10 54 6', 3, '#74c0fc');
      S('M74 54 Q88 40 96 44 Q90 52 92 60 Q84 60 76 64 Z', c);
      S('M12 60 Q12 28 46 28 Q80 28 80 58 Q80 80 46 80 Q12 80 12 60 Z', c);
      S('M16 66 Q46 84 76 66 Q70 80 46 80 Q22 80 16 66 Z', '#dbe9ff', 2);
      eyes(30, 52, 0.01); dot(30, 52, 3); smile(36, 62, 6); cheeks(38, 58, 0.01);
    },
    camel: function (c) {
      c = c || '#e3a868';
      L('M38 72 L36 94 M48 72 L48 94 M64 72 L64 94 M74 70 L76 94', 6, INK); L('M38 72 L36 94 M48 72 L48 94 M64 72 L64 94 M74 70 L76 94', 3, c);
      S('M30 66 Q30 50 42 48 Q46 30 54 46 Q60 30 68 46 Q82 48 82 64 Q80 76 56 76 Q32 76 30 66 Z', c);
      T('M34 58 Q24 50 22 32', 9, c);
      O(18, 28, 11, 7, c);
      eyes(16, 25, 0.01); dot(16, 25, 2.6); smile(12, 31, 3);
    },
    /* food */
    apple: function (c) {
      c = c || '#ff4d4d';
      S('M50 30 Q34 20 22 32 Q10 48 20 70 Q30 90 44 86 Q50 84 56 86 Q70 90 80 70 Q90 48 78 32 Q66 20 50 30 Z', c);
      T('M50 30 Q50 18 56 12', 3, '#8a5a2b');
      S('M54 22 Q66 8 78 16 Q66 28 54 22 Z', '#5ccf4a', 2.4);
      S('M28 44 Q30 36 38 34', null, 0); L('M28 46 Q30 38 38 36', 4, 'rgba(255,255,255,.7)');
    },
    banana: function (c) {
      c = c || '#ffd43b';
      S('M20 30 Q18 72 54 82 Q80 86 90 70 Q70 74 54 66 Q34 56 30 28 Z', c);
      L('M30 34 Q34 60 60 72', 2, shade(c, -0.2));
      B(17, 22, 10, 9, 3, '#8a5a2b'); C(90, 70, 3, '#5c3d1e');
    },
    orange: function (c) {
      c = c || '#ff922b';
      C(50, 56, 30, c);
      dot(40, 48, 1.4, shade(c, -0.25)); dot(60, 62, 1.4, shade(c, -0.25)); dot(52, 72, 1.4, shade(c, -0.25)); dot(66, 46, 1.4, shade(c, -0.25));
      L('M36 46 Q38 38 46 36', 4, 'rgba(255,255,255,.65)');
      S('M52 28 Q64 14 76 22 Q64 32 52 28 Z', '#5ccf4a', 2.4); dot(50, 27, 3, '#8a5a2b');
    },
    grapes: function (c) {
      c = c || '#a259d9';
      T('M50 22 Q52 12 58 8', 3, '#8a5a2b');
      S('M52 20 Q66 6 78 16 Q66 26 52 20 Z', '#5ccf4a', 2.4);
      [[36, 32], [50, 30], [64, 32], [30, 46], [44, 46], [58, 46], [70, 46], [38, 60], [52, 60], [64, 60], [44, 73], [58, 73], [51, 85]].forEach(function (p) { C(p[0], p[1], 8, c); dot(p[0] - 2.5, p[1] - 2.5, 2, 'rgba(255,255,255,.6)'); });
    },
    strawberry: function (c) {
      c = c || '#ff4d6d';
      S('M50 88 Q22 70 20 46 Q20 30 36 30 L64 30 Q80 30 80 46 Q78 70 50 88 Z', c);
      [[36, 44], [50, 42], [64, 44], [30, 56], [44, 56], [58, 56], [70, 56], [40, 68], [54, 68], [48, 78]].forEach(function (p) { O(p[0], p[1], 1.6, 2.4, '#ffe066', 0, 1); });
      S('M30 30 L38 18 L44 28 L50 14 L56 28 L62 18 L70 30 Z', '#5ccf4a', 2.4);
    },
    watermelon: function (c) {
      c = c || '#ff5c74';
      S('M8 40 L92 40 Q90 86 50 86 Q10 86 8 40 Z', '#40c057');
      S('M16 40 L84 40 Q82 78 50 78 Q18 78 16 40 Z', '#e9fac8', 0);
      S('M20 40 L80 40 Q78 72 50 72 Q22 72 20 40 Z', c, 0);
      [[34, 50], [50, 52], [66, 50], [42, 62], [58, 62]].forEach(function (p) { O(p[0], p[1], 2, 3.4, INK, 0, 1); });
    },
    lemon: function (c) {
      c = c || '#ffe066';
      S('M14 56 Q12 50 20 48 Q30 30 50 30 Q70 30 80 48 Q88 50 86 56 Q88 62 80 64 Q70 82 50 82 Q30 82 20 64 Q12 62 14 56 Z', c);
      L('M32 46 Q38 38 48 37', 4, 'rgba(255,255,255,.7)');
      S('M50 30 Q60 14 74 18 Q64 30 50 30 Z', '#5ccf4a', 2.4);
    },
    carrot: function (c) {
      c = c || '#ff8a1f';
      S('M50 30 Q38 6 44 4 Q52 14 50 30 Z', '#5ccf4a', 2.4); S('M50 30 Q58 6 66 8 Q60 20 50 30 Z', '#5ccf4a', 2.4); S('M50 30 Q34 16 30 22 Q40 28 50 30 Z', '#5ccf4a', 2.4);
      S('M34 32 Q50 24 66 32 Q62 64 52 92 Q48 94 46 90 Q38 64 34 32 Z', c);
      L('M40 46 L48 46 M54 58 L60 58 M44 70 L50 70', 2.4, shade(c, -0.3));
    },
    tomato: function (c) {
      c = c || '#fa3e3e';
      O(50, 58, 32, 27, c);
      L('M30 50 Q32 42 40 40', 4, 'rgba(255,255,255,.65)');
      S('M50 32 L42 26 L36 34 L46 34 L40 42 L50 37 L60 42 L54 34 L64 34 L58 26 Z', '#5ccf4a', 2.2);
      T('M50 32 Q50 24 54 20', 3, '#3f9e3a');
    },
    cherry: function (c) {
      c = c || '#e8243c';
      L('M34 64 Q40 30 62 16 M66 66 Q62 36 62 16', 3.2, '#3f9e3a');
      S('M62 16 Q76 4 88 12 Q76 22 62 16 Z', '#5ccf4a', 2.4);
      C(32, 70, 15, c); C(68, 72, 15, c);
      dot(27, 65, 3, 'rgba(255,255,255,.7)'); dot(63, 67, 3, 'rgba(255,255,255,.7)');
    },
    pear: function (c) {
      c = c || '#b5e34a';
      S('M50 18 Q40 18 38 36 Q36 48 26 60 Q18 76 32 86 Q50 94 68 86 Q82 76 74 60 Q64 48 62 36 Q60 18 50 18 Z', c);
      T('M50 18 Q50 10 54 6', 3, '#8a5a2b');
      S('M54 12 Q66 2 76 10 Q66 18 54 12 Z', '#5ccf4a', 2.2);
      L('M32 66 Q32 58 38 54', 4, 'rgba(255,255,255,.65)');
    },
    corn: function (c) {
      c = c || '#ffd43b';
      O(50, 46, 16, 34, c);
      for (var y = 22; y < 78; y += 8) for (var x = 40; x <= 60; x += 7) dot(x, y, 2.6, shade(c, -0.18));
      S('M50 92 Q24 76 26 36 Q40 50 44 82 Z', '#5ccf4a', 2.4); S('M50 92 Q76 76 74 36 Q60 50 56 82 Z', '#5ccf4a', 2.4);
    },
    bread: function (c) {
      c = c || '#e3a25a';
      S('M14 76 L14 44 Q14 24 34 26 Q50 14 66 26 Q86 24 86 44 L86 76 Q86 82 80 82 L20 82 Q14 82 14 76 Z', c);
      S('M20 44 Q20 32 34 32 Q50 22 66 32 Q80 32 80 44 Z', shade(c, 0.35), 0);
      L('M30 50 L38 42 M46 50 L54 42 M62 50 L70 42', 3, shade(c, -0.3));
    },
    cheese: function (c) {
      c = c || '#ffd43b';
      S('M10 74 L10 52 L86 28 L90 74 Z', c);
      S('M10 52 L86 28 L90 40 L10 56 Z', shade(c, 0.4), 2);
      C(30, 64, 6, shade(c, -0.2)); C(56, 60, 8, shade(c, -0.2)); C(76, 68, 4, shade(c, -0.2)); C(44, 72, 3, shade(c, -0.2));
    },
    milk: function (c) {
      c = c || '#4d8dff';
      S('M28 36 L50 18 L72 36 Z', '#e9ecef');
      B(28, 36, 44, 56, 4, '#ffffff');
      B(28, 50, 44, 24, 0, c);
      S('M44 54 Q50 46 56 54 Q60 62 50 66 Q40 62 44 54 Z', '#fff', 2);
      B(44, 10, 12, 10, 2, c);
    },
    egg: function (c) {
      c = c || '#fff4dc';
      S('M50 14 Q74 14 78 52 Q80 86 50 86 Q20 86 22 52 Q26 14 50 14 Z', c);
      L('M34 40 Q36 30 44 26', 4, 'rgba(255,255,255,.9)');
      eyes(50, 56, 9); smile(50, 66, 5); cheeks(50, 64, 16);
    },
    cake: function (c) {
      c = c || '#ff8fb8';
      B(18, 50, 64, 38, 8, '#ffe0b8');
      S('M18 58 L18 50 Q18 42 26 42 L74 42 Q82 42 82 50 L82 58 Q76 66 70 58 Q64 66 58 58 Q52 66 46 58 Q40 66 34 58 Q28 66 24 58 Q20 64 18 58 Z', c);
      B(46, 18, 8, 24, 3, '#74c0fc');
      S('M50 4 Q56 12 50 16 Q44 12 50 4 Z', '#ffa94d', 2);
      dot(30, 74, 2.5, '#ff6b9d'); dot(50, 76, 2.5, '#5ccf4a'); dot(70, 74, 2.5, '#4d8dff');
    },
    candy: function (c) {
      c = c || '#ff5fa2';
      P([30, 54, 10, 40, 10, 68], c); P([70, 54, 90, 40, 90, 68], c);
      C(50, 54, 22, c);
      L('M36 46 Q50 34 62 48 Q66 60 52 64 Q42 62 46 54', 4, '#fff');
    },
    pizza: function (c) {
      c = c || '#ffd43b';
      S('M50 92 L16 22 Q50 8 84 22 Z', c);
      S('M16 22 Q50 8 84 22 L80 30 Q50 18 20 30 Z', '#d98a3a', 2.4);
      C(42, 40, 6, '#e8243c'); C(60, 44, 6, '#e8243c'); C(50, 64, 6, '#e8243c'); dot(34, 34, 2, '#3f9e3a'); dot(58, 58, 2, '#3f9e3a');
    },
    /* home and school */
    book: function (c) {
      c = c || '#4d8dff';
      B(24, 16, 54, 72, 6, '#ffffff');
      B(20, 12, 54, 72, 6, c);
      B(20, 12, 10, 72, 4, shade(c, -0.25));
      B(38, 28, 28, 14, 4, '#ffffff'); L('M42 35 L62 35', 2.4);
      star(G, 52, 62, 9, 4); fl('#ffd43b'); st(2.2);
    },
    pencil: function (c) {
      c = c || '#ffd43b';
      G.save(); G.translate(50, 50); G.rotate(-0.75);
      B(-28, -9, 52, 18, 2, c);
      B(-42, -9, 14, 18, 4, '#ff8fb8'); B(-32, -9, 6, 18, 1, '#c8cfda');
      P([24, -9, 42, 0, 24, 9], '#f3c99a'); P([35, -4, 42, 0, 35, 4], INK, 1);
      L('M-26 0 L22 0', 2, shade(c, -0.25));
      G.restore();
    },
    door: function (c) {
      c = c || '#c0773b';
      B(22, 8, 56, 88, 4, '#8a5a2b');
      B(27, 13, 46, 83, 3, c);
      B(33, 20, 34, 24, 4, shade(c, -0.15)); B(33, 52, 34, 34, 4, shade(c, -0.15));
      C(64, 56, 4, '#ffd43b');
    },
    chair: function (c) {
      c = c || '#ff7a3d';
      L('M30 60 L26 94 M70 60 L74 94 M36 66 L34 92 M64 66 L66 92', 6, INK); L('M30 60 L26 94 M70 60 L74 94', 3, shade(c, -0.2));
      B(26, 8, 48, 46, 8, c);
      B(33, 16, 34, 30, 5, shade(c, 0.3), 0);
      B(20, 52, 60, 12, 5, shade(c, -0.15));
    },
    bed: function (c) {
      c = c || '#4d8dff';
      B(8, 30, 14, 62, 5, '#b8733d'); B(78, 50, 14, 42, 5, '#b8733d');
      B(14, 56, 72, 24, 6, '#ffffff');
      B(18, 44, 22, 14, 6, '#fff9db');
      S('M36 52 L86 52 L86 74 Q60 82 36 74 Z', c);
      L('M44 60 L80 60', 2.4, shade(c, 0.35));
    },
    clock: function (c) {
      c = c || '#ff6b6b';
      L('M30 84 L24 94 M70 84 L76 94', 5);
      C(30, 22, 9, '#ffd43b'); C(70, 22, 9, '#ffd43b');
      C(50, 54, 33, c);
      C(50, 54, 25, '#fff');
      for (var i = 0; i < 12; i++) { var a = i / 12 * TAU; dot(50 + Math.cos(a) * 20, 54 + Math.sin(a) * 20, i % 3 ? 1.4 : 2.4); }
      L('M50 54 L50 38 M50 54 L62 60', 3.4); dot(50, 54, 3);
    },
    cup: function (c) {
      c = c || '#ff7eb6';
      L('M40 24 Q36 16 42 8 M54 24 Q50 16 56 8', 3, '#adb5bd');
      T('M74 44 Q92 44 90 58 Q88 72 72 70', 6, c);
      S('M22 32 L78 32 L74 80 Q72 88 64 88 L36 88 Q28 88 26 80 Z', c);
      O(50, 32, 28, 6, shade(c, -0.25));
      C(50, 60, 9, '#fff', 1); S('M44 58 Q50 70 56 58', null, 2.4); dot(46, 56, 1.6); dot(54, 56, 1.6);
    },
    ball: function (c) {
      var t = c;
      c = c || '#4d8dff';
      C(50, 52, 34, t ? c : '#ffffff');
      if (!t) {
        G.save(); G.beginPath(); G.arc(50, 52, 34, 0, TAU); G.clip();
        S('M50 18 Q24 40 34 86 L10 86 L10 18 Z', '#ff4d4d', 0); S('M50 18 Q76 40 66 86 L90 86 L90 18 Z', c, 0); S('M50 18 Q42 52 50 86 Q58 52 50 18 Z', '#ffd43b', 0);
        G.restore();
        L('M50 18 Q24 40 34 86 M50 18 Q76 40 66 86 M50 18 Q42 52 50 86 Q58 52 50 18', 2.4);
        C(50, 52, 34, null);
      } else L('M24 34 Q50 56 76 34 M20 60 Q50 80 80 60', 4, 'rgba(255,255,255,.75)');
      L('M30 34 Q34 28 40 26', 4, 'rgba(255,255,255,.8)');
    },
    house: function (c) {
      c = c || '#ffd43b';
      B(64, 14, 10, 22, 2, '#c0773b');
      B(20, 46, 60, 46, 4, c);
      S('M12 50 L50 14 L88 50 Z', '#ff5d6c');
      B(42, 64, 16, 28, 3, '#b8733d'); dot(54, 78, 1.8);
      B(26, 56, 12, 12, 2, '#9fe0ff'); B(62, 56, 12, 12, 2, '#9fe0ff');
    },
    hat: function (c) {
      c = c || '#ffcf6b';
      O(50, 70, 44, 14, c);
      S('M26 70 Q24 30 50 30 Q76 30 74 70 Z', c);
      B(25, 54, 50, 10, 3, c === '#ffcf6b' ? '#ff5d6c' : shade(c, -0.3));
      S('M70 54 Q82 46 84 56 Q80 62 70 62 Z', '#ffd43b', 2);
    },
    gift: function (c) {
      c = c || '#ff5d6c';
      S('M50 30 Q34 8 26 20 Q24 30 50 30 Q76 30 74 20 Q66 8 50 30 Z', '#ffd43b');
      B(20, 44, 60, 46, 4, c);
      B(16, 30, 68, 16, 4, shade(c, -0.15));
      B(44, 30, 12, 60, 0, '#ffd43b');
    },
    table: function (c) {
      c = c || '#c0773b';
      L('M22 50 L20 92 M78 50 L80 92 M34 50 L36 84 M66 50 L64 84', 6, INK); L('M22 50 L20 92 M78 50 L80 92', 3, shade(c, -0.2));
      B(8, 38, 84, 14, 5, c);
      B(30, 26, 16, 12, 3, '#ff7eb6'); B(56, 22, 12, 16, 3, '#9fe0ff');
    },
    key: function (c) {
      c = c || '#fcc419';
      C(28, 50, 18, c); C(28, 50, 7, '#fff');
      B(42, 45, 50, 10, 3, c);
      B(70, 54, 7, 14, 2, c); B(82, 54, 7, 10, 2, c);
    },
    lamp: function (c) {
      c = c || '#ff922b';
      L('M50 52 L50 82', 7, INK); L('M50 52 L50 82', 3, '#adb5bd');
      O(50, 86, 20, 6, '#868e96');
      L('M20 64 L10 70 M80 64 L90 70 M50 66 L50 66', 3, '#ffd43b');
      S('M34 18 L66 18 L80 54 L20 54 Z', c);
      L('M30 30 L70 30', 2.4, shade(c, 0.4));
    },
    bag: function (c) {
      c = c || '#ff4d4d';
      T('M34 30 Q34 12 50 12 Q66 12 66 30', 5, shade(c, -0.25));
      B(20, 26, 60, 66, 14, c);
      B(30, 56, 40, 28, 8, shade(c, -0.15));
      L('M36 64 L64 64', 2.4); C(50, 40, 4, '#ffd43b');
    },
    umbrella: function (c) {
      c = c || '#b48cff';
      T('M50 50 L50 82 Q50 92 42 92 Q36 92 36 86', 4, '#8a5a2b');
      S('M8 50 Q10 14 50 12 Q90 14 92 50 Q84 44 78 50 Q72 44 64 50 Q58 44 50 50 Q42 44 36 50 Q28 44 22 50 Q16 44 8 50 Z', c);
      L('M50 12 Q36 28 36 50 M50 12 Q64 28 64 50 M50 12 Q22 26 22 50 M50 12 Q78 26 78 50', 2, shade(c, -0.25));
      dot(50, 10, 3);
    },
    window: function (c) {
      c = c || '#9fe0ff';
      B(16, 14, 68, 70, 6, '#ffffff');
      B(24, 22, 52, 54, 2, c);
      L('M50 22 L50 76 M24 49 L76 49', 5, '#ffffff'); L('M50 22 L50 76 M24 49 L76 49', 2);
      L('M30 30 L40 30', 3, 'rgba(255,255,255,.9)');
      S('M10 10 Q30 40 16 86 L10 86 Z', '#ff7eb6'); S('M90 10 Q70 40 84 86 L90 86 Z', '#ff7eb6');
      B(8, 84, 84, 8, 3, '#c0773b');
    },
    spoon: function (c) {
      c = c || '#c8cfda';
      G.save(); G.translate(50, 50); G.rotate(-0.7);
      B(-6, 2, 12, 46, 6, c);
      O(0, -22, 15, 22, c);
      O(-4, -28, 4, 8, 'rgba(255,255,255,.85)', 0, 1);
      G.restore();
    },
    shoe: function (c) {
      c = c || '#4d8dff';
      S('M10 78 L10 50 Q10 40 22 40 L40 40 Q46 56 62 60 L82 64 Q92 66 92 78 Z', c);
      B(8, 76, 86, 10, 5, '#ffffff');
      L('M34 48 L44 46 M38 54 L48 52', 2.6, '#fff');
      B(12, 40, 26, 8, 3, shade(c, -0.25));
    },
    /* outside */
    sun: function (c) {
      c = c || '#ffd43b';
      for (var i = 0; i < 10; i++) { var a = i / 10 * TAU; P([50 + Math.cos(a - 0.16) * 30, 50 + Math.sin(a - 0.16) * 30, 50 + Math.cos(a) * 46, 50 + Math.sin(a) * 46, 50 + Math.cos(a + 0.16) * 30, 50 + Math.sin(a + 0.16) * 30], '#ffa94d'); }
      C(50, 50, 28, c);
      eyes(50, 46, 9); smile(50, 58, 8); cheeks(50, 55, 16);
    },
    moon: function (c) {
      c = c || '#ffe066';
      S('M62 10 Q24 14 22 50 Q24 88 64 90 Q38 78 38 50 Q38 22 62 10 Z', c);
      dot(32, 46, 2.6); smile(32, 58, 4); dot(34, 54, 2.6, 'rgba(255,105,150,0.45)');
      star(G, 74, 30, 9, 4, 0.2); fl('#ffd43b'); st(2.2); star(G, 80, 66, 6, 2.6); fl('#fff'); st(2);
    },
    star: function (c) {
      c = c || '#ffd43b';
      star(G, 50, 54, 42, 19); fl(c); st();
      eyes(50, 52, 8); smile(50, 62, 6); cheeks(50, 60, 14);
      L('M84 12 L84 24 M78 18 L90 18 M14 76 L14 86 M9 81 L19 81', 2.6, '#ffd43b');
    },
    tree: function (c) {
      c = c || '#4fc45a';
      B(42, 56, 16, 38, 4, '#a8693f');
      C(30, 50, 18, c); C(70, 50, 18, c); C(50, 30, 24, c); C(50, 56, 20, c, 1);
      C(38, 40, 4.5, '#ff4d4d'); C(64, 34, 4.5, '#ff4d4d'); C(58, 56, 4.5, '#ff4d4d');
    },
    flower: function (c) {
      c = c || '#ff6bab';
      T('M50 52 Q48 76 50 96', 4, '#3f9e3a');
      S('M50 80 Q28 68 30 60 Q44 64 50 80 Z', '#5ccf4a', 2.2); S('M50 74 Q70 62 72 56 Q58 58 50 74 Z', '#5ccf4a', 2.2);
      for (var i = 0; i < 6; i++) { var a = i / 6 * TAU; C(50 + Math.cos(a) * 16, 34 + Math.sin(a) * 16, 12, c); }
      C(50, 34, 11, '#ffd43b'); eyes(50, 32, 4, 1.8); smile(50, 38, 3);
    },
    cloud: function (c) {
      c = c || '#ffffff';
      S('M22 70 Q6 70 8 56 Q10 42 26 44 Q28 26 46 26 Q60 24 66 38 Q84 32 88 50 Q96 66 80 70 Z', c);
      eyes(48, 52, 9); smile(48, 60, 6); cheeks(48, 58, 16);
    },
    rain: function (c) {
      c = c || '#74c0fc';
      S('M22 50 Q6 50 8 38 Q10 26 26 28 Q28 12 46 12 Q60 10 66 22 Q84 18 88 34 Q94 50 80 50 Z', '#d0d7e6');
      [[24, 64], [44, 72], [64, 62], [34, 86], [56, 88], [76, 80]].forEach(function (p) { S('M' + p[0] + ' ' + (p[1] - 8) + ' Q' + (p[0] + 6) + ' ' + p[1] + ' ' + p[0] + ' ' + (p[1] + 4) + ' Q' + (p[0] - 6) + ' ' + p[1] + ' ' + p[0] + ' ' + (p[1] - 8) + ' Z', c, 2); });
      dot(40, 34, 2.4); dot(56, 34, 2.4); smile(48, 42, 4);
    },
    snow: function (c) {
      c = c || '#74c0fc';
      G.save(); G.translate(50, 50);
      for (var i = 0; i < 6; i++) { G.save(); G.rotate(i * TAU / 6); L('M0 0 L0 -40 M0 -24 L-10 -34 M0 -24 L10 -34 M0 -12 L-8 -18 M0 -12 L8 -18', 9, INK); G.restore(); }
      for (i = 0; i < 6; i++) { G.save(); G.rotate(i * TAU / 6); L('M0 0 L0 -40 M0 -24 L-10 -34 M0 -24 L10 -34 M0 -12 L-8 -18 M0 -12 L8 -18', 4, c); G.restore(); }
      C(0, 0, 8, '#ffffff'); G.restore();
    },
    leaf: function (c) {
      c = c || '#5ccf4a';
      T('M30 80 L16 94', 4, '#3f9e3a');
      S('M30 80 Q12 40 50 20 Q76 8 90 10 Q90 40 74 60 Q56 84 30 80 Z', c);
      L('M30 80 Q56 50 84 16 M46 62 L42 44 M58 48 L54 30 M54 64 L72 60 M66 48 L80 44', 2.4, shade(c, -0.3));
    },
    car: function (c) {
      c = c || '#ff4d4d';
      S('M8 70 L8 56 Q8 48 18 46 L28 44 L40 28 Q44 24 52 24 L66 24 Q72 24 76 30 L84 44 Q94 46 94 58 L94 70 Z', c);
      S('M34 44 L44 30 L56 30 L56 44 Z', '#9fe0ff', 2.4); S('M62 30 L70 30 L78 44 L62 44 Z', '#9fe0ff', 2.4);
      B(86, 52, 8, 6, 2, '#ffe066');
      C(28, 72, 11, '#495057'); C(28, 72, 4.5, '#dee2e6'); C(74, 72, 11, '#495057'); C(74, 72, 4.5, '#dee2e6');
    },
    bus: function (c) {
      c = c || '#ffc21a';
      B(6, 24, 88, 52, 10, c);
      for (var i = 0; i < 4; i++) B(12 + i * 17, 32, 13, 16, 3, '#9fe0ff');
      B(80, 32, 10, 34, 3, '#9fe0ff');
      B(6, 54, 88, 6, 0, shade(c, -0.25), 0);
      C(26, 78, 10, '#495057'); C(26, 78, 4, '#dee2e6'); C(72, 78, 10, '#495057'); C(72, 78, 4, '#dee2e6');
    },
    train: function (c) {
      c = c || '#ff4d4d';
      B(20, 12, 14, 22, 3, '#495057'); O(27, 10, 9, 4, '#495057');
      B(10, 32, 46, 34, 6, '#4d8dff');
      B(52, 18, 38, 48, 6, c);
      B(60, 26, 22, 16, 3, '#9fe0ff');
      P([10, 66, 2, 80, 14, 74], '#ffd43b');
      B(6, 64, 88, 8, 3, '#343a40');
      C(26, 78, 10, '#495057'); C(48, 78, 10, '#495057'); C(74, 78, 10, '#495057');
      dot(26, 78, 3, '#dee2e6'); dot(48, 78, 3, '#dee2e6'); dot(74, 78, 3, '#dee2e6');
    },
    boat: function (c) {
      c = c || '#ff4d4d';
      L('M48 14 L48 70', 6); L('M48 14 L48 70', 3, '#8a5a2b');
      S('M52 16 L84 62 L52 62 Z', '#ffffff'); S('M44 22 L18 62 L44 62 Z', '#ffd43b');
      S('M10 68 L90 68 L80 84 L20 84 Z', c);
      L('M4 92 Q14 86 24 92 T44 92 T64 92 T84 92 T100 92', 3, '#4dabf7');
    },
    plane: function (c) {
      c = c || '#ffffff';
      S('M40 54 L24 86 L38 86 L60 56 Z', '#4d8dff');
      S('M8 48 Q8 36 26 36 L82 38 Q96 40 96 50 Q96 60 82 60 L26 60 Q8 60 8 48 Z', c);
      S('M14 40 L8 18 L20 18 L32 38 Z', '#ff4d4d');
      S('M42 42 L28 16 L42 16 L62 42 Z', '#4d8dff');
      C(70, 48, 4, '#9fe0ff'); C(58, 48, 4, '#9fe0ff'); C(46, 48, 4, '#9fe0ff'); S('M84 42 Q92 44 92 50 L84 50 Z', '#9fe0ff', 2);
    },
    bike: function (c) {
      c = c || '#ff4d4d';
      C(24, 66, 18, null); C(76, 66, 18, null);
      G.lineWidth = 5; G.strokeStyle = '#495057'; G.beginPath(); G.arc(24, 66, 15, 0, TAU); G.moveTo(91, 66); G.arc(76, 66, 15, 0, TAU); G.stroke();
      L('M24 66 L42 40 L70 40 L76 66 M42 40 L50 66 L70 40 M50 66 L24 66', 7); L('M24 66 L42 40 L70 40 L76 66 M42 40 L50 66 L70 40 M50 66 L24 66', 3.6, c);
      L('M40 40 L36 28 M70 40 L66 24 L76 22', 4);
      B(28, 24, 16, 6, 3, '#495057');
      dot(24, 66, 3); dot(76, 66, 3);
    },
    rocket: function (c) {
      c = c || '#ffffff';
      S('M40 78 Q50 100 60 78 Z', '#ffa94d'); S('M44 78 Q50 92 56 78 Z', '#ffe066', 0);
      S('M36 60 L22 80 L38 76 Z', '#ff4d4d'); S('M64 60 L78 80 L62 76 Z', '#ff4d4d');
      S('M50 8 Q70 26 66 78 L34 78 Q30 26 50 8 Z', c);
      S('M50 8 Q60 16 63 26 L37 26 Q40 16 50 8 Z', '#ff4d4d', 2.6);
      C(50, 44, 9, '#9fe0ff');
    },
    balloon: function (c) {
      c = c || '#ff5fa2';
      L('M50 74 Q42 84 52 92 Q58 98 50 100', 2);
      S('M50 8 Q78 8 78 38 Q78 66 50 72 Q22 66 22 38 Q22 8 50 8 Z', c);
      P([46, 78, 50, 70, 54, 78], shade(c, -0.2));
      L('M34 26 Q36 18 44 16', 4, 'rgba(255,255,255,.75)');
    },
    waterfall: function (c) {
      c = c || '#4dabf7';
      S('M4 92 L4 24 Q14 14 26 20 L30 44 L28 92 Z', '#a5917c'); S('M96 92 L96 20 Q84 12 72 18 L70 44 L72 92 Z', '#a5917c');
      S('M28 18 L72 18 L74 84 L26 84 Z', c);
      L('M38 22 L38 76 M50 22 L50 80 M62 22 L62 76', 3, 'rgba(255,255,255,.7)');
      O(50, 86, 40, 9, '#74c0fc');
      C(30, 80, 6, '#ffffff'); C(50, 82, 7, '#ffffff'); C(70, 80, 6, '#ffffff');
      S('M4 24 Q14 14 26 20 Q20 28 4 30 Z', '#5ccf4a', 2); S('M96 20 Q84 12 72 18 Q80 26 96 28 Z', '#5ccf4a', 2);
    }
  };
  A.hasPic = function (id) { return Object.prototype.hasOwnProperty.call(A.PICS, id); };
  // Draws picture id (with its change: a colour, small, big or tall) to fill size s at (x, y).
  A.pic = function (g, id, mod, x, y, s) {
    var f = A.PICS[id];
    if (!f) return;
    var k = mod === 's' ? 0.62 : mod === 'B' ? 1.08 : 0.92, kx = k, ky = mod === 't' ? 1.08 : k;
    use(g, 3);
    g.save(); g.translate(x, y + (mod === 's' ? s * 0.16 : 0)); g.scale(s / 100 * kx, s / 100 * ky); g.translate(-50, -52);
    f(A.TINT[mod] || null);
    g.restore();
  };
  // The picture card of a word: white with a pastel middle, cached per pixel scale.
  var CARD_BG = ['#fff3bf', '#d3f9d8', '#d0ebff', '#ffe3e3', '#e5dbff', '#fff0f6'];
  A.CARD = { w: 280, h: 230 };
  A.card = function (id, mod, ps) {
    var K = A.CARD;
    return layer('card-' + id + '.' + mod, ps, K.w + 16, K.h + 16, function (g) {
      rr(g, 8, 14, K.w, K.h, 30); g.fillStyle = 'rgba(28,34,80,0.3)'; g.fill();
      rr(g, 8, 8, K.w, K.h, 30); g.fillStyle = '#ffffff'; g.fill(); g.lineWidth = 6; g.strokeStyle = INK; g.stroke();
      var h = 0; for (var i = 0; i < id.length; i++) h += id.charCodeAt(i);
      rr(g, 22, 22, K.w - 28, K.h - 28, 20); g.fillStyle = CARD_BG[h % CARD_BG.length]; g.fill();
      A.pic(g, id, mod, 8 + K.w / 2, 8 + K.h / 2, 196);
    });
  };

  /* ----------------------------------------------------------- plants */
  // A plant at (x, y) (the soil), size s (1: about 110 px tall), grown k 0..1.
  function stem(g, x, y, h, w, c) { use(g, 3); T('M' + x + ' ' + y + ' Q' + (x - 3) + ' ' + (y - h / 2) + ' ' + x + ' ' + (y - h), w, c || '#3f9e3a'); }
  function leaves(g, x, y, s, k) {
    if (k <= 0) return;
    var l = 18 * s * k;
    S('M' + x + ' ' + y + ' Q' + (x - l * 1.3) + ' ' + (y - l * 0.2) + ' ' + (x - l * 1.6) + ' ' + (y - l) + ' Q' + (x - l * 0.4) + ' ' + (y - l * 0.9) + ' ' + x + ' ' + y + ' Z', '#5ccf4a', 2.4);
    S('M' + x + ' ' + (y - 4) + ' Q' + (x + l * 1.3) + ' ' + (y - l * 0.3) + ' ' + (x + l * 1.5) + ' ' + (y - l * 1.1) + ' Q' + (x + l * 0.4) + ' ' + (y - l) + ' ' + x + ' ' + (y - 4) + ' Z', '#5ccf4a', 2.4);
  }
  function grow(k, a, b) { return Math.max(0, Math.min(1, (k - a) / (b - a))); }
  function petals(g, x, y, n, r, d, c, rot) { for (var i = 0; i < n; i++) { var a = (rot || 0) + i / n * TAU; O(x + Math.cos(a) * d, y + Math.sin(a) * d, r, r * 0.62, c, a); } }
  A.PLANTS = {
    tulip: function (g, x, y, s, k, c) {
      var h = 86 * s * grow(k, 0.1, 0.7); stem(g, x, y, h, 4 * s); leaves(g, x, y - 12 * s, s, grow(k, 0.2, 0.6));
      var b = grow(k, 0.5, 1) * s; if (b <= 0) return;
      S('M' + x + ' ' + (y - h + 4 * b) + ' Q' + (x - 18 * b) + ' ' + (y - h - 2 * b) + ' ' + (x - 15 * b) + ' ' + (y - h - 26 * b) + ' L' + (x - 7 * b) + ' ' + (y - h - 18 * b) + ' L' + x + ' ' + (y - h - 30 * b) + ' L' + (x + 7 * b) + ' ' + (y - h - 18 * b) + ' L' + (x + 15 * b) + ' ' + (y - h - 26 * b) + ' Q' + (x + 18 * b) + ' ' + (y - h - 2 * b) + ' ' + x + ' ' + (y - h + 4 * b) + ' Z', c || '#ff4d6d', 2.6);
    },
    daisy: function (g, x, y, s, k, c) {
      var h = 70 * s * grow(k, 0.1, 0.7); stem(g, x, y, h, 3.6 * s); leaves(g, x, y - 10 * s, s * 0.8, grow(k, 0.2, 0.6));
      var b = grow(k, 0.5, 1) * s; if (b <= 0) return;
      use(g, 2.2); petals(g, x, y - h, 8, 9 * b, 10 * b, c || '#ffffff'); C(x, y - h, 7 * b, '#ffd43b');
    },
    sunflower: function (g, x, y, s, k) {
      var h = 100 * s * grow(k, 0.1, 0.7); stem(g, x, y, h, 5 * s); leaves(g, x, y - 26 * s, s * 1.1, grow(k, 0.2, 0.6));
      var b = grow(k, 0.5, 1) * s; if (b <= 0) return;
      use(g, 2.2); petals(g, x, y - h, 12, 11 * b, 15 * b, '#ffd43b'); C(x, y - h, 11 * b, '#8a5a2b'); dot(x - 3 * b, y - h - 3 * b, 2 * b, '#5c3d1e');
    },
    carrot: function (g, x, y, s, k) {
      var b = grow(k, 0.1, 1) * s; if (b <= 0) return;
      use(g, 2.4);
      for (var i = -1; i <= 1; i++) T('M' + x + ' ' + (y - 8 * b) + ' Q' + (x + i * 14 * b) + ' ' + (y - 30 * b) + ' ' + (x + i * 20 * b) + ' ' + (y - 48 * b), 4 * b + 1, '#5ccf4a');
      S('M' + (x - 12 * b) + ' ' + (y - 8 * b) + ' Q' + x + ' ' + (y - 14 * b) + ' ' + (x + 12 * b) + ' ' + (y - 8 * b) + ' L' + x + ' ' + (y + 8 * b) + ' Z', '#ff8a1f');
    },
    tomato: function (g, x, y, s, k) {
      var h = 60 * s * grow(k, 0.1, 0.6); stem(g, x, y, h, 4 * s); leaves(g, x, y - 16 * s, s, grow(k, 0.2, 0.6)); leaves(g, x, y - 36 * s, s * 0.8, grow(k, 0.3, 0.7));
      var b = grow(k, 0.55, 1) * s; if (b <= 0) return;
      use(g, 2.2); C(x - 14 * s, y - 30 * s, 8 * b, '#fa3e3e'); C(x + 13 * s, y - 44 * s, 8 * b, '#fa3e3e'); C(x, y - h - 4 * b, 9 * b, '#fa3e3e');
    },
    cactus: function (g, x, y, s, k) {
      var b = grow(k, 0.1, 0.8) * s; if (b <= 0) return;
      use(g, 2.6);
      T('M' + (x - 12 * b) + ' ' + (y - 30 * b) + ' L' + (x - 22 * b) + ' ' + (y - 30 * b) + ' L' + (x - 22 * b) + ' ' + (y - 50 * b), 9 * b, '#40c057');
      T('M' + (x + 12 * b) + ' ' + (y - 44 * b) + ' L' + (x + 22 * b) + ' ' + (y - 44 * b) + ' L' + (x + 22 * b) + ' ' + (y - 60 * b), 9 * b, '#40c057');
      B(x - 12 * b, y - 76 * b, 24 * b, 78 * b, 12 * b, '#40c057');
      var f = grow(k, 0.7, 1) * s; if (f > 0) { petals(g, x, y - 78 * b, 5, 6 * f, 6 * f, '#ff7eb6'); C(x, y - 78 * b, 3.4 * f, '#ffd43b'); }
    },
    pumpkin: function (g, x, y, s, k) {
      var v = grow(k, 0.1, 0.5) * s; use(g, 2.4);
      if (v > 0) { T('M' + (x - 30 * v) + ' ' + y + ' Q' + x + ' ' + (y - 24 * v) + ' ' + (x + 28 * v) + ' ' + (y - 6 * v), 3, '#3f9e3a'); S('M' + (x + 20 * v) + ' ' + (y - 10 * v) + ' Q' + (x + 34 * v) + ' ' + (y - 34 * v) + ' ' + (x + 40 * v) + ' ' + (y - 8 * v) + ' Z', '#5ccf4a', 2.2); }
      var b = grow(k, 0.45, 1) * s; if (b <= 0) return;
      O(x - 10 * b, y - 16 * b, 13 * b, 16 * b, '#ff922b'); O(x + 10 * b, y - 16 * b, 13 * b, 16 * b, '#ff922b'); O(x, y - 16 * b, 13 * b, 17 * b, '#ffa94d');
      B(x - 2.5 * b, y - 38 * b, 5 * b, 8 * b, 2, '#3f9e3a');
    },
    appletree: function (g, x, y, s, k) {
      var h = 64 * s * grow(k, 0.1, 0.6); use(g, 3);
      if (h > 0) B(x - 6 * s, y - h, 12 * s, h + 2, 4, '#a8693f');
      var b = grow(k, 0.4, 1) * s; if (b <= 0) return;
      C(x - 18 * b, y - h - 4 * b, 18 * b, '#4fc45a'); C(x + 18 * b, y - h - 4 * b, 18 * b, '#4fc45a'); C(x, y - h - 22 * b, 22 * b, '#4fc45a'); C(x, y - h - 6 * b, 18 * b, '#4fc45a', 1);
      var a = grow(k, 0.8, 1) * s; if (a > 0) { C(x - 14 * b, y - h - 10 * b, 4.5 * a, '#ff4d4d'); C(x + 12 * b, y - h - 22 * b, 4.5 * a, '#ff4d4d'); C(x + 18 * b, y - h, 4.5 * a, '#ff4d4d'); }
    }
  };
  // A grown plant is drawn once into a sprite (per kind and pixel scale) and blitted:
  // a garden full of flowers costs a few image copies a frame, not hundreds of paths.
  var SPR = { w: 124, h: 176, ox: 62, oy: 160 };
  A.ps = 1;
  A.plant = function (g, kind, x, y, s, k, sway) {
    var f = A.PLANTS[kind] || A.PLANTS.tulip;
    if (k >= 1 && typeof document !== 'undefined') {
      var ps = Math.min(3, Math.ceil(A.ps * Math.max(1, s) * 2) / 2), c = layer('plant-' + kind, ps, SPR.w, SPR.h, function (pg) { use(pg, 3); f(pg, SPR.ox, SPR.oy, 1, 1); });
      g.save(); g.translate(x, y); if (sway) g.rotate(sway);
      g.drawImage(c, -SPR.ox * s, -SPR.oy * s, SPR.w * s, SPR.h * s);
      g.restore();
      return;
    }
    use(g, 3);
    if (sway) { g.save(); g.translate(x, y); g.rotate(sway); g.translate(-x, -y); f(g, x, y, s, k); g.restore(); } else f(g, x, y, s, k);
  };
  // The long garden bed the word plants grow in (its top edge at y).
  A.bed = function (g, y, ps) {
    g.drawImage(layer('bed', ps, W, 60, function (bg) {
      var r = seeded(5);
      use(bg, 5); B(14, 4, W - 28, 50, 22, '#8b5a2b');
      B(24, 8, W - 48, 10, 5, 'rgba(255,255,255,0.12)', 1);
      for (var i = 0; i < 40; i++) dot(30 + r() * (W - 60), 22 + r() * 26, 2 + r() * 2, 'rgba(60,30,10,0.35)');
    }), 0, y - 4, W, 60);
  };
  // A soil mound with a seed (or a hole once the plant grows).
  A.mound = function (g, x, y, seed) {
    use(g, 2.6);
    O(x, y, 34, 9, '#7a4a24');
    if (seed) { O(x, y - 4, 6, 4.5, '#e8b46a', -0.4); }
  };

  /* --------------------------------------------- bees and butterflies */
  A.bee = function (g, x, y, t, dir, s) {
    s = s || 1; use(g, 2);
    g.save(); g.translate(x, y); g.scale(dir * s, s);
    var f = 0.6 + 0.4 * Math.abs(Math.sin(t * 40));
    O(-2, -9, 6, 8 * f, 'rgba(225,245,255,.9)', -0.3); O(5, -9, 6, 8 * f, 'rgba(225,245,255,.9)', 0.3);
    O(0, 0, 11, 8, '#ffd43b');
    g.fillStyle = INK; g.fillRect(-3, -7, 3, 14); g.fillRect(3, -7, 3, 14);
    O(0, 0, 11, 8, null); dot(-7, -1, 1.6);
    g.restore();
  };
  A.butterfly = function (g, x, y, t, c, s) {
    s = s || 1; use(g, 2);
    var f = 0.35 + 0.65 * Math.abs(Math.sin(t * 9));
    g.save(); g.translate(x, y); g.scale(s, s);
    O(-8 * f, -5, 9 * f, 8, c, -0.4); O(8 * f, -5, 9 * f, 8, c, 0.4);
    O(-6 * f, 7, 6 * f, 5, shade(c, -0.15), 0.4); O(6 * f, 7, 6 * f, 5, shade(c, -0.15), -0.4);
    O(0, 0, 2.4, 10, INK);
    g.restore();
  };

  /* ------------------------------------------------------- decorations */
  A.DECOS = {
    fence: function (g, x, y, s, t) {
      use(g, 2.6);
      B(x - 70 * s, y - 34 * s, 140 * s, 8 * s, 3, '#f8f0e3'); B(x - 70 * s, y - 16 * s, 140 * s, 8 * s, 3, '#f8f0e3');
      for (var i = 0; i < 6; i++) { var px = x - 66 * s + i * 26 * s; P([px, y, px, y - 44 * s, px + 7 * s, y - 52 * s, px + 14 * s, y - 44 * s, px + 14 * s, y], '#ffffff'); }
    },
    birdhouse: function (g, x, y, s, t) {
      use(g, 2.6);
      B(x - 4 * s, y - 70 * s, 8 * s, 70 * s, 3, '#a8693f');
      B(x - 22 * s, y - 108 * s, 44 * s, 42 * s, 5, '#ffd43b');
      P([x - 28 * s, y - 104 * s, x, y - 128 * s, x + 28 * s, y - 104 * s], '#ff5d6c');
      C(x, y - 90 * s, 7 * s, INK); B(x - 2 * s, y - 80 * s, 4 * s, 8 * s, 1, '#a8693f');
      var hop = Math.abs(Math.sin(t * 2)) * 4 * s; C(x + 34 * s, y - 104 * s - hop, 8 * s, '#4dabf7'); dot(x + 37 * s, y - 106 * s - hop, 1.6 * s); P([x + 41 * s, y - 104 * s - hop, x + 47 * s, y - 102 * s - hop, x + 41 * s, y - 100 * s - hop], '#ff922b');
    },
    pond: function (g, x, y, s, t) {
      use(g, 2.8);
      O(x, y, 96 * s, 30 * s, '#4dabf7');
      O(x + 8 * s, y + 4 * s, 70 * s, 18 * s, '#74c0fc', 0, 1);
      var r = Math.sin(t * 1.5) * 3 * s;
      O(x - 40 * s, y - 2 * s + r, 16 * s, 6 * s, '#5ccf4a'); O(x + 44 * s, y + 6 * s - r, 13 * s, 5 * s, '#5ccf4a');
      petals(g, x - 40 * s, y - 6 * s + r, 5, 4 * s, 4 * s, '#ff9fd0');
      C(x + 20 * s, y - 8 * s, 10 * s, '#69db7c'); C(x + 15 * s, y - 16 * s, 4 * s, '#fff'); C(x + 25 * s, y - 16 * s, 4 * s, '#fff'); dot(x + 15 * s, y - 16 * s, 1.8 * s); dot(x + 25 * s, y - 16 * s, 1.8 * s);
    },
    bench: function (g, x, y, s, t) {
      use(g, 2.6);
      L('M' + (x - 44 * s) + ' ' + y + ' L' + (x - 44 * s) + ' ' + (y - 30 * s) + ' M' + (x + 44 * s) + ' ' + y + ' L' + (x + 44 * s) + ' ' + (y - 30 * s), 6 * s, INK);
      B(x - 56 * s, y - 64 * s, 112 * s, 12 * s, 4, '#c0773b'); B(x - 56 * s, y - 48 * s, 112 * s, 12 * s, 4, '#c0773b');
      B(x - 60 * s, y - 32 * s, 120 * s, 12 * s, 4, '#d98a4a');
    },
    fountain: function (g, x, y, s, t) {
      use(g, 2.8);
      O(x, y - 10 * s, 70 * s, 18 * s, '#ced4da'); O(x, y - 14 * s, 58 * s, 11 * s, '#74c0fc');
      B(x - 8 * s, y - 64 * s, 16 * s, 52 * s, 4, '#dee2e6');
      O(x, y - 64 * s, 30 * s, 8 * s, '#ced4da');
      var p = Math.sin(t * 6) * 3 * s;
      L('M' + x + ' ' + (y - 66 * s) + ' Q' + (x - 26 * s) + ' ' + (y - 104 * s + p) + ' ' + (x - 46 * s) + ' ' + (y - 18 * s) + ' M' + x + ' ' + (y - 66 * s) + ' Q' + (x + 26 * s) + ' ' + (y - 104 * s - p) + ' ' + (x + 46 * s) + ' ' + (y - 18 * s), 5 * s, '#74c0fc');
      C(x, y - 84 * s + p, 6 * s, '#a5d8ff');
    },
    windmill: function (g, x, y, s, t) {
      use(g, 3);
      P([x - 26 * s, y, x - 14 * s, y - 120 * s, x + 14 * s, y - 120 * s, x + 26 * s, y], '#fff0d6');
      B(x - 9 * s, y - 34 * s, 18 * s, 34 * s, 8, '#a8693f');
      P([x - 20 * s, y - 118 * s, x, y - 140 * s, x + 20 * s, y - 118 * s], '#ff5d6c');
      g.save(); g.translate(x, y - 116 * s); g.rotate(t * 0.8);
      for (var i = 0; i < 4; i++) { g.rotate(TAU / 4); B(-7 * s, -78 * s, 14 * s, 66 * s, 3, '#ffffff'); }
      g.restore(); C(x, y - 116 * s, 7 * s, '#ffd43b');
    }
  };
  A.deco = function (g, id, x, y, s, t) { if (A.DECOS[id]) A.DECOS[id](g, x, y, s, t); };
  // A small picture of a shop item (or a world) drawn into a canvas once.
  A.icon = function (canvas, kind, id, mod) {
    var g = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h);
    if (kind === 'plant') { g.save(); g.scale(w / 100, h / 100); A.plant(g, id, 50, 92, id === 'sunflower' ? 0.72 : id === 'appletree' ? 0.82 : 0.86, 1); g.restore(); }
    else if (kind === 'deco') {
      var S2 = { fence: [50, 82, 0.62], birdhouse: [44, 96, 0.62], pond: [50, 64, 0.46], bench: [50, 84, 0.72], fountain: [50, 90, 0.7], windmill: [50, 98, 0.52] }[id] || [50, 90, 0.6];
      g.save(); g.scale(w / 100, h / 100); A.deco(g, id, S2[0], S2[1], S2[2], 0.6); g.restore();
    } else A.pic(g, id, mod || '', w / 2, h / 2, Math.min(w, h) * 0.98);
  };

  /* --------------------------------------------------------------- scenes */
  function bgCloud(g, x, y, s, a) {
    g.fillStyle = 'rgba(255,255,255,' + a + ')';
    [[0, 0, 34], [32, -10, 30], [62, 4, 26], [-30, 6, 24]].forEach(function (p) { g.beginPath(); g.arc(x + p[0] * s, y + p[1] * s, p[2] * s, 0, TAU); g.fill(); });
  }
  A.driftClouds = function (g, time, still, top) {
    for (var i = 0; i < 3; i++) {
      var x = ((still ? 0 : time) * (7 + i * 3) + i * 450) % (W + 300) - 150;
      bgCloud(g, x, (top || 40) + i * 46, 0.7 + (i % 2) * 0.25, 0.6);
    }
  };
  function hills(g, y0, r) {
    g.lineJoin = 'round';
    g.beginPath(); g.moveTo(0, y0);
    for (var x = 0; x <= W; x += 40) g.lineTo(x, y0 - 28 - Math.sin(x / 190 + r) * 26 - Math.sin(x / 80 + 1) * 6);
    g.lineTo(W, H); g.lineTo(0, H); g.closePath(); g.fillStyle = '#a6e27c'; g.fill(); g.lineWidth = 5; g.strokeStyle = INK; g.stroke();
    g.beginPath(); g.moveTo(0, y0 + 10);
    for (x = 0; x <= W; x += 40) g.lineTo(x, y0 + 4 - Math.sin(x / 150 + 2 + r) * 14);
    g.lineTo(W, H); g.lineTo(0, H); g.closePath();
    var gr = g.createLinearGradient(0, y0, 0, H); gr.addColorStop(0, '#78d35f'); gr.addColorStop(1, '#4fb44f');
    g.fillStyle = gr; g.fill(); g.stroke();
  }
  function tufts(g, r, y0, n, x0, x1) {
    for (var i = 0; i < n; i++) {
      var tx = x0 + r() * (x1 - x0), ty = y0 + r() * (H - y0 - 10);
      g.beginPath(); g.moveTo(tx, ty); g.lineTo(tx - 4, ty - 10); g.moveTo(tx, ty); g.lineTo(tx + 4, ty - 11);
      g.lineWidth = 3; g.strokeStyle = 'rgba(28,110,50,0.45)'; g.lineCap = 'round'; g.stroke();
    }
  }
  function sky(g, h, top, bottom) {
    var s = g.createLinearGradient(0, 0, 0, h); s.addColorStop(0, top || '#5cc8ff'); s.addColorStop(1, bottom || '#d8f6ff');
    g.fillStyle = s; g.fillRect(0, 0, W, H);
  }
  function sun(g, x, y, r) {
    g.save(); g.translate(x, y);
    for (var i = 0; i < 12; i++) { g.rotate(TAU / 12); g.fillStyle = 'rgba(255,240,150,0.35)'; g.beginPath(); g.moveTo(-14, -r - 6); g.lineTo(0, -r * 2.6); g.lineTo(14, -r - 6); g.closePath(); g.fill(); }
    g.restore();
    use(g, 5); C(x, y, r, '#ffe066'); C(x, y, r * 0.72, '#fff3a8', 1);
  }
  A.scene = function (kind, ps) {
    return layer('scene-' + kind, ps, W, H, function (g) {
      var r = seeded(kind.length * 7 + 3);
      if (kind === 'play') {
        sky(g, 400);
        for (var i = 0; i < 4; i++) bgCloud(g, 120 + r() * 1040, 40 + r() * 230, 0.6 + r() * 0.5, 0.55);
        hills(g, 372, 0.4);
        tufts(g, r, 452, 26, 0, 240); tufts(g, r, 452, 26, 1040, W); tufts(g, r, 470, 30, 260, 1020);
        // bushes and flowers by the keyboard
        [[60, 560], [190, 640], [1100, 600], [1220, 520], [80, 700], [1200, 700]].forEach(function (p, j) {
          use(g, 4); C(p[0] - 22, p[1], 26, '#46b94e'); C(p[0] + 22, p[1], 26, '#46b94e'); C(p[0], p[1] - 18, 30, '#52c95a'); C(p[0], p[1], 24, '#52c95a', 1);
          use(g, 2); petals(g, p[0] - 10, p[1] - 22, 5, 5, 5, A.RAINBOW[j % 6]); C(p[0] - 10, p[1] - 22, 3, '#ffd43b');
        });
      } else if (kind === 'title') {
        sky(g, 520);
        sun(g, 1120, 150, 54);
        for (i = 0; i < 5; i++) bgCloud(g, 200 + r() * 1000, 60 + r() * 260, 0.7 + r() * 0.6, 0.55);
        hills(g, 560, 1.3);
        tufts(g, r, 590, 60, 0, W);
      } else if (kind === 'map') {
        sky(g, 140, '#5cc8ff', '#c9f1ff');
        hills(g, 120, 2.2);
        tufts(g, r, 140, 70, 0, W);
      } else {
        sky(g, 330);
        sun(g, 1150, 80, 46);
        for (i = 0; i < 4; i++) bgCloud(g, 120 + r() * 900, 50 + r() * 160, 0.6 + r() * 0.5, 0.55);
        hills(g, 330, 3.1);
        tufts(g, r, 360, 50, 0, W);
      }
    });
  };
  // The word sign: a big card the DOM word sits on.
  A.BOARD = { x: 100, y: 96, w: 740, h: 208 };
  // Its glow (when a word is spelled) under the cached sign.
  A.board = function (g, glow, ps) {
    var b = A.BOARD;
    if (glow > 0) { rr(g, b.x - 10, b.y - 10, b.w + 20, b.h + 20, 42); g.fillStyle = 'rgba(255,214,61,' + (0.55 * glow).toFixed(3) + ')'; g.fill(); }
    g.drawImage(layer('board', ps, b.w + 16, b.h + 26, function (bg) { bg.translate(8 - b.x, 8 - b.y); sign(bg); }), b.x - 8, b.y - 8, b.w + 16, b.h + 26);
  };
  function sign(g) {
    var b = A.BOARD;
    rr(g, b.x, b.y + 9, b.w, b.h, 34); g.fillStyle = 'rgba(28,34,80,0.3)'; g.fill();
    rr(g, b.x, b.y, b.w, b.h, 34); g.fillStyle = '#fffdf5'; g.fill(); g.lineWidth = 6; g.strokeStyle = INK; g.stroke();
    rr(g, b.x + 12, b.y + 12, b.w - 24, b.h - 24, 24); g.lineWidth = 3; g.strokeStyle = 'rgba(92,207,74,0.45)'; g.setLineDash([12, 10]); g.stroke(); g.setLineDash([]);
    use(g, 2.6);
    S('M' + (b.x + 14) + ' ' + (b.y + 30) + ' Q' + (b.x + 6) + ' ' + (b.y + 6) + ' ' + (b.x + 34) + ' ' + (b.y + 12) + ' Q' + (b.x + 30) + ' ' + (b.y + 28) + ' ' + (b.x + 14) + ' ' + (b.y + 30) + ' Z', '#5ccf4a');
    S('M' + (b.x + b.w - 14) + ' ' + (b.y + b.h - 30) + ' Q' + (b.x + b.w - 6) + ' ' + (b.y + b.h - 6) + ' ' + (b.x + b.w - 34) + ' ' + (b.y + b.h - 12) + ' Q' + (b.x + b.w - 30) + ' ' + (b.y + b.h - 28) + ' ' + (b.x + b.w - 14) + ' ' + (b.y + b.h - 30) + ' Z', '#5ccf4a');
  };

  /* ----------------------------------------------------------- keyboard */
  var KB = WG.KB, KEYS = WG.KEYS;
  A.KB_BOX = { x: KB.x - 14, y: KB.y - 14, w: 15 * KB.unit + 24, h: 5 * KB.unit + 24 };
  function keycap(g, k, top, side, lw) {
    rr(g, k.x, k.y + 3, k.w, k.h, 9); g.fillStyle = side; g.fill();
    rr(g, k.x, k.y, k.w, k.h - 3, 9); g.fillStyle = top; g.fill();
    rr(g, k.x, k.y, k.w, k.h + 3, 9); g.lineWidth = lw || 2.5; g.strokeStyle = INK; g.stroke();
  }
  function winLogo(g, x, y, s, color) {
    g.fillStyle = color;
    g.fillRect(x - s, y - s, s - 1.5, s - 1.5); g.fillRect(x + 1.5, y - s, s - 1.5, s - 1.5);
    g.fillRect(x - s, y + 1.5, s - 1.5, s - 1.5); g.fillRect(x + 1.5, y + 1.5, s - 1.5, s - 1.5);
  }
  // Legends where the real keycaps print them: Latin large top-left, Arabic bottom-right,
  // digits bottom-left with the Arabic-Indic digit bottom-right, symbols top-left.
  var SHOW_AR_SHIFT = /^(أ|إ|آ|لأ|لإ|لآ|؟|،|؛)$/;
  function legends(g, k, lang, color, dim) {
    var x = k.x, y = k.y, w = k.w, h = k.h - 3, arOn = lang !== 'en', enOn = lang !== 'ar';
    g.textBaseline = 'middle';
    function put(s, px, py, size, align, rtl, a) {
      g.globalAlpha = a; g.font = font(size); g.direction = rtl ? 'rtl' : 'ltr'; g.textAlign = align; g.fillStyle = color; g.fillText(s, px, py);
    }
    if (k.label) {
      g.globalAlpha = 1;
      if (k.label === 'win') { winLogo(g, x + w / 2, y + h / 2, 7, color); return; }
      if (k.label === 'menu') { rr(g, x + w / 2 - 7, y + h / 2 - 9, 14, 18, 3); g.lineWidth = 2; g.strokeStyle = color; g.stroke(); return; }
      var right = k.code === 'Backspace' || k.code === 'Enter' || k.code === 'ShiftRight' || k.code === 'ControlRight';
      put(k.label, right ? x + w - 7 : x + 7, y + 13, 12.5, right ? 'right' : 'left', false, 0.85);
      g.globalAlpha = 1;
      return;
    }
    if (k.code === 'Space') return;
    if (/^[a-z]$/.test(k.en)) {
      put(k.enS, x + 6, y + 14, 19, 'left', false, enOn ? 1 : dim);
      put(k.ar, x + w - 6, y + h - 14, k.ar.length > 1 ? 17 : 20, 'right', true, arOn ? 1 : dim);
      if (SHOW_AR_SHIFT.test(k.arS)) put(k.arS, x + w - 6, y + 12, 12, 'right', true, arOn ? 0.75 : dim * 0.75);
    } else {
      put(k.enS, x + 7, y + 13, 13, 'left', false, 0.8);
      put(k.en, x + 7, y + h - 12, 15, 'left', false, enOn ? 1 : dim);
      if (k.ar && k.ar !== k.en) put(k.ar, x + w - 6, y + h - 13, /[0-9٠-٩]/.test(k.ar) ? 14 : 19, 'right', true, arOn ? 1 : dim);
      if (SHOW_AR_SHIFT.test(k.arS)) put(k.arS, x + w - 6, y + 12, 12, 'right', true, arOn ? 0.75 : dim * 0.75);
    }
    g.globalAlpha = 1;
  }
  function bump(g, k, color) { rr(g, k.x + k.w / 2 - 7, k.y + k.h - 10, 14, 3.5, 2); g.fillStyle = color; g.fill(); }
  // The whole keyboard with its legends, once per language and pixel scale, cropped to its box.
  A.KB_CROP = { x: A.KB_BOX.x - 4, y: A.KB_BOX.y - 4, w: A.KB_BOX.w + 8, h: H - A.KB_BOX.y + 4 };
  A.keyboardBase = function (lang, ps) {
    var C2 = A.KB_CROP;
    return layer('kb-' + lang, ps, C2.w, C2.h, function (g) {
      g.translate(-C2.x, -C2.y);
      var b = A.KB_BOX;
      rr(g, b.x, b.y + 6, b.w, b.h + 30, 26); g.fillStyle = 'rgba(28,34,80,0.35)'; g.fill();
      rr(g, b.x, b.y, b.w, b.h + 30, 26); g.fillStyle = '#2a2f4f'; g.fill(); g.lineWidth = 6; g.strokeStyle = INK; g.stroke();
      for (var code in KEYS) {
        var k = KEYS[code];
        keycap(g, k, '#3d4473', '#232848');
        legends(g, k, lang, '#ffffff', 0.38);
        if (code === 'KeyF' || code === 'KeyJ') bump(g, k, 'rgba(255,255,255,0.75)');
      }
    });
  };
  // One key lit: the hinted key glows yellow; a pressed key flashes (green right, red wrong).
  A.keyLit = function (g, code, lang, kind, power, time, still) {
    var k = KEYS[code];
    if (!k) return;
    var top = kind === 'good' ? '#5be38f' : kind === 'bad' ? '#ff5d6c' : '#ffd23f', side = kind === 'good' ? '#2f9e5a' : kind === 'bad' ? '#b8323f' : '#e0a400';
    if (kind === 'glow') {
      var p = still ? 0.7 : 0.5 + 0.5 * Math.sin(time * 8), grow2 = 4 + 6 * p * power;
      rr(g, k.x - grow2, k.y - grow2, k.w + grow2 * 2, k.h + grow2 * 2 + 3, 14); g.fillStyle = 'rgba(255,214,61,' + (0.4 + 0.3 * p).toFixed(3) + ')'; g.fill();
    }
    g.save(); g.translate(0, kind === 'good' ? 3 : 0);
    keycap(g, k, top, side, 3);
    legends(g, k, lang, INK, 0.5);
    if (code === 'KeyF' || code === 'KeyJ') bump(g, k, INK);
    g.restore();
  };
  A.keyCenter = function (code) { var k = KEYS[code]; return k ? { x: k.x + k.w / 2, y: k.y + k.h / 2 } : null; };

  /* --------------------------------------------------------------- bits */
  // A letter flying from its key to the word: a round yellow bubble.
  A.flyer = function (g, x, y, ch, lang, s) {
    use(g, 4);
    g.save(); g.translate(x, y); g.scale(s, s);
    C(0, 0, 30, '#ffd23f');
    g.font = font(ch.length > 1 ? 32 : 40); g.direction = lang === 'ar' ? 'rtl' : 'ltr'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = INK; g.fillText(ch, 0, lang === 'ar' ? 4 : 2);
    g.restore();
  };
  // A seed flying to its spot in the garden bed.
  A.seed = function (g, x, y, rot) { use(g, 2.4); O(x, y, 8, 6, '#e8b46a', rot); };
  A.pill = function (g, x, y, w, h, color) {
    rr(g, x, y + 4, w, h, h / 2); g.fillStyle = 'rgba(28,34,80,0.35)'; g.fill();
    rr(g, x, y, w, h, h / 2); g.fillStyle = color || '#ffffff'; g.fill(); g.lineWidth = 4; g.strokeStyle = INK; g.stroke();
  };
  A.text = function (g, s, x, y, size, color, outline) {
    g.font = font(size); g.direction = WG.isArabic(String(s)[0]) ? 'rtl' : 'ltr'; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (outline !== 0) { g.lineJoin = 'round'; g.lineWidth = outline || Math.max(4, size * 0.18); g.strokeStyle = INK; g.strokeText(s, x, y); }
    g.fillStyle = color; g.fillText(s, x, y);
  };
})();
