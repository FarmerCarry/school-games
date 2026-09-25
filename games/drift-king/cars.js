/*
 * Drift King — car catalogue + tiny low-poly 3D renderer for isometric canvas.
 * Cars are built from convex parts (boxes / frustums / prisms) and balls.
 * Local axes: x = forward, y = left, z = up. 1 unit = road unit.
 */
(function (root) {
  'use strict';
  var DK = root.DK || (root.DK = {});

  /* --------------------------------------------------------- colour utils */
  var rgbCache = {};
  function rgb(hex) {
    var c = rgbCache[hex];
    if (c) return c;
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    c = [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)];
    rgbCache[hex] = c;
    return c;
  }
  function shade(hex, k) {
    var c = rgb(hex);
    var r = Math.min(255, c[0] * k) | 0, g = Math.min(255, c[1] * k) | 0, b = Math.min(255, c[2] * k) | 0;
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }
  function mix(h1, h2, t) {
    var a = rgb(h1), b = rgb(h2);
    var r = (a[0] + (b[0] - a[0]) * t) | 0, g = (a[1] + (b[1] - a[1]) * t) | 0, bl = (a[2] + (b[2] - a[2]) * t) | 0;
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
  }
  DK.rgb = rgb; DK.shade = shade; DK.mix = mix;

  /* ------------------------------------------------------------ geometry */
  // Frustum box: bottom l x w at z0, top l2 x w2 at z1, top shifted by dx along x.
  function fbox(cx, cy, z0, z1, l, w, l2, w2, dx, col, faceCols) {
    if (l2 == null) l2 = l;
    if (w2 == null) w2 = w;
    dx = dx || 0;
    var v = [
      [cx - l / 2, cy - w / 2, z0], [cx + l / 2, cy - w / 2, z0], [cx + l / 2, cy + w / 2, z0], [cx - l / 2, cy + w / 2, z0],
      [cx + dx - l2 / 2, cy - w2 / 2, z1], [cx + dx + l2 / 2, cy - w2 / 2, z1], [cx + dx + l2 / 2, cy + w2 / 2, z1], [cx + dx - l2 / 2, cy + w2 / 2, z1]
    ];
    var fc = faceCols || {};
    var faces = [
      { i: [0, 3, 2, 1], c: fc.bottom || col },
      { i: [4, 5, 6, 7], c: fc.top || col },
      { i: [1, 2, 6, 5], c: fc.front || fc.side || col },
      { i: [0, 4, 7, 3], c: fc.back || fc.side || col },
      { i: [0, 1, 5, 4], c: fc.right || fc.side || col },
      { i: [3, 7, 6, 2], c: fc.left || fc.side || col }
    ];
    return poly(v, faces);
  }
  function box(cx, cy, cz, l, w, h, col, fc) { return fbox(cx, cy, cz - h / 2, cz + h / 2, l, w, l, w, 0, col, fc); }

  // n-gon prism. axis 'y' (wheels) or 'z' (discs). Optional top radius r2 (cone).
  function prism(cx, cy, cz, r, len, n, axis, col, capCol, r2) {
    var v = [], faces = [], k;
    if (r2 == null) r2 = r;
    for (k = 0; k < n; k++) {
      var a = (k + 0.5) / n * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      if (axis === 'y') {
        v.push([cx + r * ca, cy - len / 2, cz + r * sa]);
        v.push([cx + r * ca, cy + len / 2, cz + r * sa]);
      } else {
        v.push([cx + r * ca, cy + r * sa, cz - len / 2]);
        v.push([cx + r2 * ca, cy + r2 * sa, cz + len / 2]);
      }
    }
    for (k = 0; k < n; k++) {
      var k2 = (k + 1) % n;
      faces.push({ i: [k * 2, k2 * 2, k2 * 2 + 1, k * 2 + 1], c: col });
    }
    var c0 = [], c1 = [];
    for (k = 0; k < n; k++) { c0.push(k * 2); c1.push(k * 2 + 1); }
    faces.push({ i: c0, c: capCol || col });
    faces.push({ i: c1, c: capCol || col });
    return poly(v, faces);
  }

  // Fix winding so that face normals point outwards.
  function poly(v, faces) {
    var cx = 0, cy = 0, cz = 0, k;
    for (k = 0; k < v.length; k++) { cx += v[k][0]; cy += v[k][1]; cz += v[k][2]; }
    cx /= v.length; cy /= v.length; cz /= v.length;
    faces.forEach(function (f) {
      var a = v[f.i[0]], b = v[f.i[1]], c = v[f.i[2]];
      var ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      var wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
      var nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      var fx = 0, fy = 0, fz = 0;
      f.i.forEach(function (ix) { fx += v[ix][0]; fy += v[ix][1]; fz += v[ix][2]; });
      fx /= f.i.length; fy /= f.i.length; fz /= f.i.length;
      if (nx * (fx - cx) + ny * (fy - cy) + nz * (fz - cz) < 0) f.i.reverse();
    });
    return { t: 'p', v: v, f: faces, c: [cx, cy, cz] };
  }
  function ball(cx, cy, cz, r, col) { return { t: 'b', c: [cx, cy, cz], r: r, col: col }; }

  function wheels(xf, xr, y, r, wdt, col, hub, rr) {
    var out = [];
    var rim = hub || '#e8e8f0';
    [[xf, y, r], [xf, -y, r], [xr, y, rr || r], [xr, -y, rr || r]].forEach(function (p) {
      out.push(prism(p[0], p[1], p[2], p[2], wdt, 8, 'y', col, rim));
    });
    return out;
  }
  var TIRE = '#2d2a3e';
  var GLASS = '#aee6ff';
  var LIGHT = '#fff6a8';

  /* ---------------------------------------------------------- the cars */
  var CARS = [
    {
      id: 'red', name: 'الحمراء الصغيرة', price: 0, color: '#ff4d5e', smoke: 'puff', pitch: 1,
      rear: [-0.46, 0.36], len: 1.45,
      build: function () {
        var c = '#ff4d5e';
        return [].concat(
          wheels(0.46, -0.46, 0.37, 0.2, 0.17, TIRE),
          [
            fbox(0, 0, 0.12, 0.46, 1.45, 0.8, 1.4, 0.76, 0, c),
            fbox(-0.12, 0, 0.46, 0.78, 0.78, 0.7, 0.5, 0.6, -0.08, c, { side: GLASS, front: GLASS, back: GLASS }),
            box(0.73, 0.24, 0.32, 0.04, 0.16, 0.1, LIGHT), box(0.73, -0.24, 0.32, 0.04, 0.16, 0.1, LIGHT),
            box(-0.73, 0, 0.36, 0.04, 0.6, 0.08, '#ffffff')
          ]);
      }
    },
    {
      id: 'taxi', name: 'التاكسي', price: 60, color: '#ffc61a', smoke: 'puff', pitch: 1.05,
      rear: [-0.5, 0.37], len: 1.55,
      build: function () {
        var c = '#ffc61a', parts = wheels(0.5, -0.5, 0.38, 0.2, 0.17, TIRE);
        parts.push(fbox(0, 0, 0.12, 0.46, 1.55, 0.82, 1.5, 0.78, 0, c));
        parts.push(fbox(-0.08, 0, 0.46, 0.8, 0.86, 0.72, 0.62, 0.62, -0.04, c, { side: GLASS, front: GLASS, back: GLASS }));
        parts.push(box(-0.06, 0, 0.88, 0.34, 0.2, 0.16, '#ffffff', { front: '#2d2a3e', back: '#2d2a3e' }));
        for (var k = 0; k < 5; k++) {
          var col = k % 2 ? '#2d2a3e' : '#ffffff';
          parts.push(box(-0.5 + k * 0.25, 0.415, 0.36, 0.25, 0.02, 0.1, col));
          parts.push(box(-0.5 + k * 0.25, -0.415, 0.36, 0.25, 0.02, 0.1, col));
        }
        parts.push(box(0.78, 0.25, 0.32, 0.04, 0.16, 0.1, LIGHT), box(0.78, -0.25, 0.32, 0.04, 0.16, 0.1, LIGHT));
        return parts;
      }
    },
    {
      id: 'sport', name: 'البرق الوردي', price: 150, color: '#ff5fb0', smoke: 'pink', pitch: 1.35,
      rear: [-0.52, 0.38], len: 1.7,
      build: function () {
        var c = '#ff5fb0', parts = wheels(0.55, -0.52, 0.4, 0.2, 0.2, TIRE, '#ffe34d');
        parts.push(fbox(0.02, 0, 0.1, 0.38, 1.7, 0.86, 1.5, 0.8, -0.08, c));
        parts.push(fbox(0.62, 0, 0.1, 0.3, 0.45, 0.8, 0.3, 0.72, 0.05, c));
        parts.push(fbox(-0.2, 0, 0.38, 0.62, 0.8, 0.68, 0.38, 0.5, -0.1, c, { side: '#7fd3ff', front: '#7fd3ff', back: '#7fd3ff' }));
        parts.push(box(-0.8, 0.26, 0.5, 0.06, 0.06, 0.18, '#2d2a3e'), box(-0.8, -0.26, 0.5, 0.06, 0.06, 0.18, '#2d2a3e'));
        parts.push(box(-0.82, 0, 0.62, 0.24, 0.9, 0.05, '#ffe34d'));
        parts.push(box(0.1, 0, 0.385, 0.9, 0.16, 0.012, '#ffffff'));
        return parts;
      }
    },
    {
      id: 'ice', name: 'عربة البوظة', price: 250, color: '#ffd1e6', smoke: 'sprinkle', pitch: 0.9,
      rear: [-0.55, 0.4], len: 1.75,
      build: function () {
        var parts = wheels(0.55, -0.55, 0.42, 0.21, 0.17, TIRE, '#ff8fc2');
        parts.push(fbox(-0.15, 0, 0.12, 1.02, 1.35, 0.88, 1.35, 0.88, 0, '#fff7fb', { top: '#ffd1e6' }));
        parts.push(box(-0.15, 0, 0.42, 1.36, 0.9, 0.14, '#ff8fc2'));
        parts.push(fbox(0.64, 0, 0.12, 0.48, 0.42, 0.84, 0.4, 0.8, 0, '#ff8fc2'));
        parts.push(fbox(0.52, 0, 0.48, 0.86, 0.2, 0.8, 0.05, 0.74, -0.06, GLASS));
        parts.push(box(-0.15, 0.452, 0.72, 0.6, 0.02, 0.26, '#8fe3ff'));
        parts.push(prism(-0.25, 0, 1.24, 0.07, 0.46, 8, 'z', '#f2b161', '#f2b161', 0.26));
        parts.push(ball(-0.25, 0, 1.56, 0.25, '#ff9ecb'));
        parts.push(ball(-0.25, 0, 1.8, 0.2, '#9df0cf'));
        parts.push(ball(-0.25, 0, 1.98, 0.08, '#ff3b5c'));
        return parts;
      }
    },
    {
      id: 'patrol', name: 'الدورية', price: 400, color: '#3d7bff', smoke: 'blue', pitch: 1.1,
      rear: [-0.5, 0.38], len: 1.6,
      build: function () {
        var parts = wheels(0.5, -0.5, 0.39, 0.2, 0.17, TIRE);
        parts.push(fbox(0, 0, 0.12, 0.46, 1.6, 0.82, 1.55, 0.8, 0, '#ffffff', { front: '#2d3a66', back: '#2d3a66' }));
        parts.push(box(-0.05, 0.415, 0.3, 0.7, 0.02, 0.2, '#3d7bff'), box(-0.05, -0.415, 0.3, 0.7, 0.02, 0.2, '#3d7bff'));
        parts.push(fbox(-0.08, 0, 0.46, 0.8, 0.86, 0.74, 0.6, 0.62, -0.04, '#ffffff', { side: GLASS, front: GLASS, back: GLASS }));
        parts.push(box(-0.08, 0.13, 0.86, 0.22, 0.24, 0.12, '#4d8dff'));
        parts.push(box(-0.08, -0.13, 0.86, 0.22, 0.24, 0.12, '#ff5a6e'));
        parts.push(box(0.8, 0, 0.3, 0.05, 0.7, 0.12, '#2d3a66'));
        return parts;
      }
    },
    {
      id: 'monster', name: 'الشاحنة الوحش', price: 550, color: '#44d468', smoke: 'dust', pitch: 0.7,
      rear: [-0.55, 0.52], len: 1.8,
      build: function () {
        var c = '#44d468', parts = wheels(0.55, -0.55, 0.5, 0.4, 0.34, TIRE, '#ffcf3a');
        parts.push(box(0, 0, 0.48, 1.2, 0.5, 0.12, '#6b6480'));
        parts.push(fbox(0, 0, 0.58, 0.9, 1.7, 0.86, 1.62, 0.84, 0, c));
        parts.push(fbox(-0.2, 0, 0.9, 1.24, 0.72, 0.76, 0.5, 0.66, -0.06, c, { side: GLASS, front: GLASS, back: GLASS }));
        parts.push(box(0.88, 0, 0.66, 0.08, 0.9, 0.14, '#6b6480'));
        parts.push(box(0.87, 0.26, 0.82, 0.04, 0.16, 0.1, LIGHT), box(0.87, -0.26, 0.82, 0.04, 0.16, 0.1, LIGHT));
        parts.push(box(0.3, 0.435, 0.74, 0.6, 0.02, 0.08, '#ffcf3a'), box(0.3, -0.435, 0.74, 0.6, 0.02, 0.08, '#ffcf3a'));
        return parts;
      }
    },
    {
      id: 'hotrod', name: 'الصاروخ الناري', price: 750, color: '#8a4dff', smoke: 'fire', pitch: 0.8,
      rear: [-0.55, 0.42], len: 1.8,
      build: function () {
        var c = '#8a4dff', parts = wheels(0.6, -0.55, 0.42, 0.18, 0.16, TIRE, '#d9dcef', 0.28);
        parts.push(fbox(-0.05, 0, 0.18, 0.46, 1.8, 0.62, 1.7, 0.58, 0, c));
        parts.push(fbox(-0.5, 0, 0.46, 0.78, 0.55, 0.62, 0.4, 0.56, -0.05, c, { side: GLASS, front: GLASS, back: GLASS }));
        parts.push(box(0.32, 0, 0.54, 0.5, 0.34, 0.16, '#c9cde0'));
        parts.push(box(0.2, 0.2, 0.62, 0.08, 0.08, 0.3, '#e8ebf7'), box(0.4, 0.2, 0.62, 0.08, 0.08, 0.3, '#e8ebf7'));
        parts.push(box(0.2, -0.2, 0.62, 0.08, 0.08, 0.3, '#e8ebf7'), box(0.4, -0.2, 0.62, 0.08, 0.08, 0.3, '#e8ebf7'));
        parts.push(box(0.45, 0.315, 0.3, 0.55, 0.02, 0.12, '#ff9d2e'), box(0.25, 0.315, 0.36, 0.35, 0.02, 0.08, '#ffe14d'));
        parts.push(box(0.45, -0.315, 0.3, 0.55, 0.02, 0.12, '#ff9d2e'), box(0.25, -0.315, 0.36, 0.35, 0.02, 0.08, '#ffe14d'));
        return parts;
      }
    },
    {
      id: 'duck', name: 'البطة المسرعة', price: 1000, color: '#ffe23d', smoke: 'bubble', pitch: 1.5,
      rear: [-0.45, 0.36], len: 1.5,
      build: function () {
        var c = '#ffe23d', parts = wheels(0.45, -0.45, 0.36, 0.17, 0.15, '#ff9a2e', '#ffffff');
        parts.push(fbox(0, 0, 0.12, 0.62, 1.4, 0.8, 1.1, 0.7, -0.08, c));
        parts.push(fbox(-0.72, 0, 0.5, 0.82, 0.14, 0.3, 0.06, 0.12, -0.08, c));
        parts.push(ball(0.42, 0, 0.9, 0.3, c));
        parts.push(fbox(0.78, 0, 0.8, 0.92, 0.2, 0.26, 0.14, 0.2, 0.04, '#ff9a2e'));
        parts.push(ball(0.62, 0.17, 1.0, 0.06, '#2d2a3e'), ball(0.62, -0.17, 1.0, 0.06, '#2d2a3e'));
        parts.push(fbox(-0.1, 0.4, 0.4, 0.58, 0.5, 0.06, 0.3, 0.06, -0.08, '#ffd000'));
        parts.push(fbox(-0.1, -0.4, 0.4, 0.58, 0.5, 0.06, 0.3, 0.06, -0.08, '#ffd000'));
        return parts;
      }
    },
    {
      id: 'bus', name: 'حافلة المدرسة', price: 1300, color: '#ffb21a', smoke: 'puff', pitch: 0.75,
      rear: [-0.7, 0.4], len: 2.1,
      build: function () {
        var c = '#ffb21a', parts = wheels(0.66, -0.66, 0.4, 0.21, 0.17, TIRE);
        parts.push(fbox(-0.08, 0, 0.12, 1.02, 1.9, 0.86, 1.9, 0.84, 0, c, { top: '#fff0c4' }));
        parts.push(fbox(0.95, 0, 0.12, 0.5, 0.35, 0.84, 0.3, 0.82, 0, c));
        parts.push(box(-0.08, 0.432, 0.78, 1.7, 0.02, 0.24, GLASS), box(-0.08, -0.432, 0.78, 1.7, 0.02, 0.24, GLASS));
        parts.push(box(0.87, 0, 0.78, 0.02, 0.74, 0.26, GLASS));
        parts.push(box(-0.08, 0.432, 0.5, 1.9, 0.02, 0.07, '#2d2a3e'), box(-0.08, -0.432, 0.5, 1.9, 0.02, 0.07, '#2d2a3e'));
        parts.push(box(1.11, 0.26, 0.34, 0.04, 0.14, 0.1, LIGHT), box(1.11, -0.26, 0.34, 0.04, 0.14, 0.1, LIGHT));
        return parts;
      }
    },
    {
      id: 'ufo', name: 'الصحن الطائر', price: 1700, color: '#b8c4d9', smoke: 'spark', pitch: 1.6, hover: true,
      rear: [-0.3, 0.3], len: 1.6,
      build: function () {
        var parts = [];
        parts.push(prism(0, 0, 0.36, 0.55, 0.16, 12, 'z', '#8f9ab3', '#8f9ab3', 0.8));
        parts.push(prism(0, 0, 0.5, 0.8, 0.12, 12, 'z', '#c9d3e6', '#dfe6f3', 0.62));
        parts.push(ball(0, 0, 0.66, 0.4, '#9cf5c8'));
        parts.push(ball(0.05, 0, 0.72, 0.17, '#5fdc7a'));
        for (var k = 0; k < 6; k++) {
          var a = k / 6 * Math.PI * 2;
          parts.push(ball(Math.cos(a) * 0.72, Math.sin(a) * 0.72, 0.5, 0.07, k % 2 ? '#ffe34d' : '#ff6fb5'));
        }
        return parts;
      }
    },
    {
      id: 'rocket', name: 'الصاروخ الفضائي', price: 2200, color: '#f4f6ff', smoke: 'fire', pitch: 1.25,
      rear: [-0.6, 0.3], len: 1.9,
      build: function () {
        var parts = wheels(0.5, -0.55, 0.34, 0.17, 0.15, TIRE);
        parts.push(fbox(-0.1, 0, 0.42, 0.6, 1.3, 0.56, 1.16, 0.3, 0, '#f4f6ff'));
        parts.push(fbox(-0.1, 0, 0.16, 0.42, 1.3, 0.56, 1.3, 0.56, 0, '#f4f6ff'));
        parts.push(fbox(0.78, 0, 0.16, 0.66, 0.46, 0.56, 0.02, 0.1, 0.18, '#ff4d5e'));
        parts.push(fbox(0.12, 0, 0.62, 0.84, 0.5, 0.36, 0.3, 0.26, -0.04, GLASS));
        parts.push(fbox(-0.66, 0.36, 0.2, 0.8, 0.4, 0.3, 0.14, 0.06, -0.12, '#ff4d5e'));
        parts.push(fbox(-0.66, -0.36, 0.2, 0.8, 0.4, 0.3, 0.14, 0.06, -0.12, '#ff4d5e'));
        parts.push(fbox(-0.66, 0, 0.6, 1.0, 0.4, 0.06, 0.14, 0.06, -0.12, '#ff4d5e'));
        parts.push(box(-0.8, 0, 0.42, 0.1, 0.4, 0.3, '#6b6480'));
        return parts;
      }
    },
    {
      id: 'king', name: 'سيارة الملك', price: 3000, color: '#ffc93c', smoke: 'gold', pitch: 1.15,
      rear: [-0.52, 0.38], len: 1.65,
      build: function () {
        var c = '#ffc93c', parts = wheels(0.52, -0.52, 0.39, 0.21, 0.18, '#5a2d82', '#ffc93c');
        parts.push(fbox(0, 0, 0.12, 0.46, 1.65, 0.82, 1.58, 0.78, 0, c));
        parts.push(box(0, 0.412, 0.3, 1.3, 0.02, 0.07, '#b83bff'), box(0, -0.412, 0.3, 1.3, 0.02, 0.07, '#b83bff'));
        parts.push(fbox(-0.1, 0, 0.46, 0.76, 0.84, 0.72, 0.6, 0.6, -0.04, c, { side: '#d6b3ff', front: '#d6b3ff', back: '#d6b3ff' }));
        var cz = 0.84;
        parts.push(box(-0.1, 0, cz, 0.44, 0.44, 0.12, '#ffdb4d'));
        [[0.18, 0.18], [0.18, -0.18], [-0.18, 0.18], [-0.18, -0.18]].forEach(function (p) {
          parts.push(fbox(-0.1 + p[0], p[1], cz + 0.06, cz + 0.28, 0.1, 0.1, 0.02, 0.02, 0, '#ffdb4d'));
        });
        parts.push(ball(-0.1, 0, cz + 0.12, 0.11, '#ff3b8b'));
        parts.push(box(0.8, 0.25, 0.32, 0.04, 0.16, 0.1, LIGHT), box(0.8, -0.25, 0.32, 0.04, 0.16, 0.1, LIGHT));
        return parts;
      }
    }
  ];
  CARS.forEach(function (c) { c.parts = c.build(); });
  DK.CARS = CARS;
  DK.carById = function (id) {
    for (var k = 0; k < CARS.length; k++) if (CARS[k].id === id) return CARS[k];
    return CARS[0];
  };

  /* ------------------------------------------------------------ renderer */
  // Iso projection constants (shared with the world renderer).
  var PX = 0.866, PY = 0.5, PZ = 0.9;
  var VX = 0.9, VY = 0.9, VZ = 1;           // direction towards the camera
  var LX = -0.35, LY = 0.62, LZ = 0.7;       // light direction
  var ll = Math.sqrt(LX * LX + LY * LY + LZ * LZ); LX /= ll; LY /= ll; LZ /= ll;
  DK.ISO = { PX: PX, PY: PY, PZ: PZ, VX: VX, VY: VY, VZ: VZ };

  var tmpV = [];
  for (var q = 0; q < 64; q++) tmpV.push([0, 0, 0, 0, 0]);
  var order = [];

  // Draw a car.
  //  o: { x, y (screen px of ground point under car centre), S (px per unit),
  //       yaw, pitch, roll, sq (vertical squash), z (world height), alpha }
  DK.drawCar = function (ctx, car, o) {
    var S = o.S;
    var cy = Math.cos(o.yaw), sy = Math.sin(o.yaw);
    var cp = Math.cos(o.pitch || 0), sp = Math.sin(o.pitch || 0);
    var cr = Math.cos(o.roll || 0), sr = Math.sin(o.roll || 0);
    var sq = o.sq || 1, stretch = 1 / Math.sqrt(sq);
    var zOff = o.z || 0;
    // rotation matrix R = Yaw * Pitch(about y) * Roll(about x)
    var m00 = cy * cp, m01 = cy * sp * sr - sy * cr, m02 = cy * sp * cr + sy * sr;
    var m10 = sy * cp, m11 = sy * sp * sr + cy * cr, m12 = sy * sp * cr - cy * sr;
    var m20 = -sp, m21 = cp * sr, m22 = cp * cr;
    function tf(p, out) {
      var lx = p[0] * stretch, ly = p[1] * stretch, lz = p[2] * sq - 0.3;
      var X = m00 * lx + m01 * ly + m02 * lz;
      var Y = m10 * lx + m11 * ly + m12 * lz;
      var Z = m20 * lx + m21 * ly + m22 * lz + 0.3 + zOff;
      out[0] = X; out[1] = Y; out[2] = Z;
      out[3] = o.x + (X - Y) * PX * S;
      out[4] = o.y + ((X + Y) * PY - Z * PZ) * S;
      return out;
    }
    var parts = car.parts;
    order.length = 0;
    var cc = [0, 0, 0, 0, 0];
    for (var k = 0; k < parts.length; k++) {
      var pt = parts[k];
      tf(pt.c, cc);
      order.push({ p: pt, d: cc[0] * VX + cc[1] * VY + cc[2] * VZ, sx: cc[3], sy: cc[4] });
    }
    order.sort(function (a, b) { return a.d - b.d; });
    if (o.alpha != null) ctx.globalAlpha = o.alpha;
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(1, S * 0.025);
    ctx.strokeStyle = 'rgba(40,30,70,0.35)';
    for (var n = 0; n < order.length; n++) {
      var e = order[n], P = e.p;
      if (P.t === 'b') {
        var r = P.r * S * stretch;
        ctx.fillStyle = shade(P.col, 0.88);
        ctx.beginPath(); ctx.arc(e.sx, e.sy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = shade(P.col, 1.08);
        ctx.beginPath(); ctx.arc(e.sx - r * 0.18, e.sy - r * 0.2, r * 0.72, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.beginPath(); ctx.arc(e.sx - r * 0.35, e.sy - r * 0.4, r * 0.22, 0, Math.PI * 2); ctx.fill();
        continue;
      }
      var V = P.v;
      for (var j = 0; j < V.length; j++) tf(V[j], tmpV[j]);
      for (var fi = 0; fi < P.f.length; fi++) {
        var F = P.f[fi], I = F.i;
        var a = tmpV[I[0]], b = tmpV[I[1]], c = tmpV[I[2]];
        var ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
        var wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
        var nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
        if (nx * VX + ny * VY + nz * VZ <= 1e-6) continue;
        var nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        var lit = (nx * LX + ny * LY + nz * LZ) / nl;
        ctx.fillStyle = shade(F.c, 0.66 + 0.42 * Math.max(-0.2, lit));
        ctx.beginPath();
        ctx.moveTo(a[3], a[4]);
        for (var t = 1; t < I.length; t++) ctx.lineTo(tmpV[I[t]][3], tmpV[I[t]][4]);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  };

  // Long shadow polygon for a car footprint (convex hull of base + shifted base).
  var hullPts = [];
  DK.carShadow = function (ctx, car, o, sdx, sdy) {
    var L = (car.len || 1.5) * 0.52, W = 0.44;
    var cy = Math.cos(o.yaw), sy = Math.sin(o.yaw);
    var S = o.S;
    hullPts.length = 0;
    [[L, W], [L, -W], [-L, -W], [-L, W]].forEach(function (p) {
      var X = p[0] * cy - p[1] * sy, Y = p[0] * sy + p[1] * cy;
      var sx = o.x + (X - Y) * PX * S, sY = o.y + (X + Y) * PY * S;
      hullPts.push([sx, sY], [sx + sdx, sY + sdy]);
    });
    var h = hull(hullPts);
    ctx.beginPath();
    ctx.moveTo(h[0][0], h[0][1]);
    for (var k = 1; k < h.length; k++) ctx.lineTo(h[k][0], h[k][1]);
    ctx.closePath();
    ctx.fill();
  };
  function hull(pts) {
    pts.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    function cross(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
    var lower = [], upper = [], k;
    for (k = 0; k < pts.length; k++) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pts[k]) <= 0) lower.pop();
      lower.push(pts[k]);
    }
    for (k = pts.length - 1; k >= 0; k--) {
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pts[k]) <= 0) upper.pop();
      upper.push(pts[k]);
    }
    upper.pop(); lower.pop();
    return lower.concat(upper);
  }
  DK.hull = hull;
})(typeof window !== 'undefined' ? window : globalThis);
