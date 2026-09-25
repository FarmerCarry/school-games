/*
 * Rail Rush — models.js
 * Everything visual that is built from code: merged low-poly geometry
 * (track chunks, buildings, trains, ramps, barriers, tunnels), the runner,
 * the patrol bot, hoverboards, canvas icons and the particle system.
 * Plain script: exposes window.RR.* helpers.
 */
(function () {
  'use strict';
  var T = window.THREE;
  var RR = window.RR = window.RR || {};

  /* ------------------------------------------------------------ random */
  function mulberry(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  RR.mulberry = mulberry;

  /* ------------------------------------------------ geometry merging */
  function wedgeGeo() {
    // x -0.5..0.5, slope rising from y=0 at z=+0.5 to y=1 at z=-0.5
    var A = [-0.5, 0, 0.5], B = [0.5, 0, 0.5], C = [-0.5, 0, -0.5], D = [0.5, 0, -0.5], E = [-0.5, 1, -0.5], F = [0.5, 1, -0.5];
    var tris = [A, B, F, A, F, E, C, E, F, C, F, D, A, C, D, A, D, B, A, E, C, B, D, F];
    var arr = [];
    tris.forEach(function (p) { arr.push(p[0], p[1], p[2]); });
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(arr, 3));
    g.computeVertexNormals();
    return g;
  }

  var GEO = {
    box: new T.BoxGeometry(1, 1, 1).toNonIndexed(),
    cyl6: new T.CylinderGeometry(0.5, 0.5, 1, 6).toNonIndexed(),
    cyl10: new T.CylinderGeometry(0.5, 0.5, 1, 10).toNonIndexed(),
    cone4: new T.ConeGeometry(0.5, 1, 4).toNonIndexed(),
    cone6: new T.ConeGeometry(0.5, 1, 6).toNonIndexed(),
    ico: new T.IcosahedronGeometry(0.5, 0),
    ico1: new T.IcosahedronGeometry(0.5, 1),
    plane: new T.PlaneGeometry(1, 1).toNonIndexed(),
    wedge: wedgeGeo()
  };
  Object.keys(GEO).forEach(function (k) { GEO[k].computeBoundingBox(); });
  RR.GEO = GEO;

  var _m = new T.Matrix4(), _q = new T.Quaternion(), _e = new T.Euler(), _p = new T.Vector3(),
    _s = new T.Vector3(), _v = new T.Vector3(), _n3 = new T.Matrix3(), _c = new T.Color();

  function Builder() { this.p = []; this.n = []; this.c = []; }
  // add(geo, color, x,y,z, sx,sy,sz, rx,ry,rz, grad)  grad: bottom brightness (0..1) for fake AO
  Builder.prototype.add = function (geo, color, x, y, z, sx, sy, sz, rx, ry, rz, grad) {
    _e.set(rx || 0, ry || 0, rz || 0, 'XYZ');
    _q.setFromEuler(_e);
    _p.set(x, y, z);
    _s.set(sx, sy, sz);
    _m.compose(_p, _q, _s);
    _n3.getNormalMatrix(_m);
    _c.set(color);
    var pos = geo.attributes.position, nor = geo.attributes.normal, cnt = pos.count;
    var bb = geo.boundingBox, y0 = bb.min.y, yr = (bb.max.y - bb.min.y) || 1;
    for (var i = 0; i < cnt; i++) {
      _v.fromBufferAttribute(pos, i);
      var k = grad ? grad + (1 - grad) * ((_v.y - y0) / yr) : 1;
      _v.applyMatrix4(_m);
      this.p.push(_v.x, _v.y, _v.z);
      _v.fromBufferAttribute(nor, i).applyMatrix3(_n3).normalize();
      this.n.push(_v.x, _v.y, _v.z);
      this.c.push(_c.r * k, _c.g * k, _c.b * k);
    }
    return this;
  };
  // Box with bottom at y (easier to stack).
  Builder.prototype.box = function (color, x, y, z, w, h, d, grad, rx, ry, rz) {
    return this.add(GEO.box, color, x, y + h / 2, z, w, h, d, rx, ry, rz, grad);
  };
  Builder.prototype.geometry = function () {
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new T.Float32BufferAttribute(this.c, 3));
    g.computeBoundingSphere();
    return g;
  };
  RR.Builder = Builder;

  /* ------------------------------------------------------ constants */
  var LANE = 2.5;
  RR.LANE_W = LANE;
  RR.CHUNK = 40;
  RR.CAR_LEN = 10;
  RR.CAR_GAP = 0.5;
  RR.TRAIN_TOP = 3.0;
  RR.RAMP_LEN = 8;

  var BUILD_COLORS = ['#ff8fa3', '#ffd166', '#06d6a0', '#4cc9f0', '#b8a1ff', '#ff9f1c', '#f4f1de', '#90e0ef', '#f78c6b', '#83e377', '#ffadad', '#a0c4ff'];

  /* ------------------------------------------------- track chunks */
  // Returns { main, win } geometries for one 40 m chunk (z -20..20).
  RR.ZONES = [
    { name: 'وسط المدينة', grass: '#7fcf5a', gantry: ['#ff7a1a', '#3a86ff', '#ef476f'] },
    { name: 'الشاطئ المشمس', grass: '#ffe3a6', gantry: ['#1fb6ff', '#ff6fb5', '#ffd23f'] },
    { name: 'التلال الخضراء', grass: '#86d95e', gantry: ['#ff7a1a', '#9b5de5', '#06d6a0'] }
  ];
  RR.buildChunk = function (seed, zone) {
    zone = zone || 0;
    var Z = RR.ZONES[zone];
    var r = mulberry(seed * 7919 + 13 + zone * 1013);
    var b = new Builder(), w = new Builder();
    var L = RR.CHUNK, hz = L / 2;
    function R(a, c) { return a + r() * (c - a); }
    function pick(a) { return a[Math.floor(r() * a.length)]; }

    // Track bed + three tracks
    b.box('#b7a592', 0, -0.4, 0, 9.4, 0.4, L);
    for (var li = -1; li <= 1; li++) {
      var lx = li * LANE;
      b.box('#a18d79', lx, 0, 0, 2.5, 0.05, L);
      for (var s = 0; s < 32; s++) b.box('#8a5a3c', lx, 0.05, -hz + 0.62 + s * 1.25, 2.05, 0.1, 0.34);
      b.box('#6f7480', lx - 0.62, 0.05, 0, 0.22, 0.06, L);
      b.box('#6f7480', lx + 0.62, 0.05, 0, 0.22, 0.06, L);
      b.box('#dfe6ee', lx - 0.62, 0.11, 0, 0.12, 0.1, L);
      b.box('#dfe6ee', lx + 0.62, 0.11, 0, 0.12, 0.1, L);
    }
    var fenceKind = r() < 0.5 ? 0 : 1;
    [-1, 1].forEach(function (side) {
      // platform
      b.box('#efe2cf', side * 6.05, -0.4, 0, 2.9, 0.9, L, 0.85);
      b.box('#ffcf3a', side * 4.75, 0.5, 0, 0.3, 0.02, L);
      // grass strip
      b.box(Z.grass, side * 9.6, -0.4, 0, 4.6, 0.75, L);
      // wall or fence at the back of the platform
      if (fenceKind === 0) {
        b.box('#e07a5f', side * 7.55, 0.5, 0, 0.35, 0.9, L, 0.8);
        b.box('#f4d6c6', side * 7.55, 1.4, 0, 0.5, 0.12, L);
      } else {
        for (var f = 0; f < 8; f++) b.box('#5c6b8a', side * 7.55, 0.5, -hz + 2.5 + f * 5, 0.14, 1.3, 0.14);
        b.box('#8ea0c4', side * 7.55, 1.55, 0, 0.08, 0.1, L);
        b.box('#8ea0c4', side * 7.55, 1.05, 0, 0.08, 0.1, L);
      }
      // lamp posts
      for (var lp = 0; lp < 2; lp++) {
        var lz = -hz + 10 + lp * 20;
        b.box('#4a5568', side * 6.4, 0.5, lz, 0.16, 4.2, 0.16);
        b.box('#4a5568', side * 5.95, 4.6, lz, 1.0, 0.12, 0.14);
        w.box('#fff3c4', side * 5.55, 4.4, lz, 0.4, 0.2, 0.3);
      }
      if (zone === 1) { beachSide(b, w, side, r, L); return; }
      if (zone === 2) { hillSide(b, w, side, r, L); return; }
      // trees on grass strip
      var tz = -hz + R(2, 6);
      while (tz < hz - 2) {
        if (r() < 0.7) {
          var th = R(1.4, 2.2), ts = R(1.8, 2.8);
          b.box('#8b5a3c', side * R(8.6, 10.2), 0.35, tz, 0.3, th, 0.3);
          b.add(GEO.ico, pick(['#3fbf5f', '#56d364', '#2fa84f', '#7ed957']), side * R(8.6, 10.2), 0.35 + th + ts * 0.3, tz, ts, ts * 1.1, ts, 0, r() * 3, 0, 0.75);
        }
        tz += R(5, 9);
      }
      // buildings, front row
      var z = hz - R(0, 1.5);
      while (z > -hz + 5) {
        var bw = Math.min(R(7, 12), z + hz - 0.5);
        if (bw < 5) break;
        var bd = R(9, 15), bh = R(7, 26);
        var x0 = 12.1, cx = side * (x0 + bd / 2), cz = z - bw / 2;
        var col = pick(BUILD_COLORS);
        b.box(col, cx, 0, cz, bd, bh, bw, 0.72);
        b.box(pick(['#ffffff', '#3d405b', '#f2cc8f', '#e5e5e5']), cx, bh, cz, bd + 0.5, 0.45, bw + 0.5);
        // ground floor shop band + awning
        if (r() < 0.6) {
          b.box('#3d405b', side * (x0 - 0.02), 0, cz, 0.1, 2.6, bw - 1);
          var aw = pick(['#ef476f', '#118ab2', '#06d6a0', '#ffd166', '#ff7a1a']);
          b.box(aw, side * (x0 - 0.6), 2.7, cz, 1.2, 0.18, bw - 0.6, 0, 0, 0, side * 0.25);
        }
        // roof extras
        if (r() < 0.45) {
          b.add(GEO.cyl10, '#b08968', cx + R(-2, 2), bh + 1.45, cz + R(-2, 2), 1.8, 2.0, 1.8, 0, 0, 0, 0.8);
          b.add(GEO.cone6, '#7f5539', cx, bh + 3.0, cz, 2.2, 1.0, 2.2);
        } else if (r() < 0.5) {
          b.box('#adb5bd', cx + R(-2, 2), bh + 0.45, cz + R(-2, 2), 1.6, 1.0, 1.4);
          b.box('#adb5bd', cx + R(-2, 2), bh + 0.45, cz + R(-2, 2), 1.2, 0.8, 1.2);
        }
        // windows on the track-facing side and the front face
        var cols = Math.max(1, Math.floor((bw - 1.5) / 1.8)), rows = Math.max(1, Math.floor((bh - 3.5) / 2.3));
        var ry = side > 0 ? -Math.PI / 2 : Math.PI / 2;
        for (var cI = 0; cI < cols; cI++) {
          for (var rI = 0; rI < rows; rI++) {
            var wz = cz - (cols - 1) * 0.9 + cI * 1.8;
            var wy = 3.8 + rI * 2.3;
            var lit = r();
            var wc = lit < 0.25 ? '#8c97b5' : lit < 0.8 ? '#e9eefc' : '#ffffff';
            w.add(GEO.plane, wc, side * (x0 - 0.03), wy, wz, 1.05, 1.35, 1, 0, ry, 0);
          }
        }
        var fcols = Math.max(1, Math.floor((bd - 1.5) / 2.2));
        for (var fc = 0; fc < fcols; fc++) {
          for (var fr = 0; fr < rows; fr++) {
            var fx = cx - side * ((fcols - 1) * 1.1) + side * fc * 2.2;
            w.add(GEO.plane, r() < 0.3 ? '#8c97b5' : '#e9eefc', fx, 3.8 + fr * 2.3, z + 0.03, 1.05, 1.35, 1);
          }
        }
        z -= bw + R(0.4, 2.5);
      }
      // back row: tall simple towers
      var z2 = hz - R(0, 4);
      while (z2 > -hz + 6) {
        var tw = R(8, 14), tdp = R(8, 14), tht = R(18, 42);
        if (z2 - tw < -hz) tw = z2 + hz;
        if (tw < 6) break;
        var tcx = side * R(31, 38), tcz = z2 - tw / 2;
        b.box(pick(['#a0c4ff', '#bdb2ff', '#ffc6ff', '#caffbf', '#fdffb6', '#9bf6ff', '#ffd6a5']), tcx, 0, tcz, tdp, tht, tw, 0.65);
        for (var tr = 0; tr < Math.floor((tht - 4) / 3.2); tr++) {
          w.add(GEO.plane, r() < 0.35 ? '#8c97b5' : '#e9eefc', tcx, 4 + tr * 3.2, z2 + 0.03, tdp - 2, 1.1, 1);
        }
        z2 -= tw + R(1, 6);
      }
      // far ground
      b.box('#8fd46e', side * 32, -0.4, 0, 40, 0.8, L);
    });
    // catenary gantry
    if (r() < 0.7) {
      var gz = R(-12, 12);
      var gc = pick(Z.gantry);
      b.box('#56627a', -4.25, 0.5, gz, 0.35, 9.4, 0.35);
      b.box('#56627a', 4.25, 0.5, gz, 0.35, 9.4, 0.35);
      b.box(gc, 0, 9.5, gz, 9.2, 0.5, 0.5);
      b.box('#2b2d42', -1.5, 9.1, gz, 0.4, 0.4, 0.25);
      w.box('#7dff9b', -1.5, 9.15, gz + 0.14, 0.24, 0.24, 0.02);
      b.box('#2b2d42', 1.5, 9.1, gz, 0.4, 0.4, 0.25);
      w.box('#ffe45c', 1.5, 9.15, gz + 0.14, 0.24, 0.24, 0.02);
    }
    return { main: b.geometry(), win: w.geometry() };
  };

  function palm(b, x, z, h, r) {
    var lean = (r() - 0.5) * 0.5, segs = 5, px = x, py = 0.3;
    for (var i = 0; i < segs; i++) {
      var sh = h / segs;
      b.add(GEO.cyl6, i % 2 ? '#a87444' : '#8b5a33', px, py + sh / 2, z, 0.42 - i * 0.04, sh * 1.05, 0.42 - i * 0.04, 0, 0, -lean * (i / segs));
      px += Math.sin(lean * (i / segs)) * sh; py += sh;
    }
    for (var k = 0; k < 6; k++) {
      var a = k / 6 * Math.PI * 2 + r();
      b.add(GEO.cone4, k % 2 ? '#2fb84f' : '#3fd464', px + Math.cos(a) * 1.4, py - 0.5, z + Math.sin(a) * 1.4, 0.22, 3.0, 0.95, 0, -a, -(Math.PI / 2 + 0.35));
    }
    b.add(GEO.ico, '#6b4423', px + 0.2, py - 0.3, z + 0.1, 0.35, 0.35, 0.35);
    b.add(GEO.ico, '#6b4423', px - 0.2, py - 0.35, z - 0.15, 0.35, 0.35, 0.35);
  }
  function hipHouse(b, w, cx, cz, wd, dp, h, col, roof, side, r) {
    b.box(col, cx, 0.35, cz, dp, h, wd, 0.75);
    b.add(GEO.cone4, roof, cx, 0.35 + h + 1.1, cz, dp * 1.45, 2.2, wd * 1.45, 0, Math.PI / 4, 0, 0.8);
    // windows toward the track and toward the camera
    var ry = side > 0 ? -Math.PI / 2 : Math.PI / 2, inner = cx - side * dp / 2 - side * 0.03;
    var floors = Math.max(1, Math.floor((h - 0.6) / 2.3));
    for (var f = 0; f < floors; f++) {
      for (var c = 0; c < 2; c++) {
        w.add(GEO.plane, r() < 0.3 ? '#8c97b5' : '#e9eefc', inner, 1.6 + f * 2.3, cz - wd / 4 + c * wd / 2, 1.0, 1.1, 1, 0, ry, 0);
      }
      w.add(GEO.plane, '#e9eefc', cx, 1.6 + f * 2.3, cz + wd / 2 + 0.03, 1.0, 1.1, 1);
    }
    b.box('#7a4a2a', inner + side * 0.02, 0.35, cz, 0.08, 1.9, 0.9);
  }
  function beachSide(b, w, side, r, L) {
    var hz = L / 2;
    function R(a, c) { return a + r() * (c - a); }
    if (side < 0) {
      // sand, surf and sea
      b.box('#ffe3a6', -24, -0.4, 0, 24, 0.72, L);
      b.box('#ffffff', -36.2, -0.4, 0, 0.8, 0.6, L);
      b.box('#3ec5f0', -186, -0.9, 0, 300, 1.0, L, 0.9);
      b.box('#8fe3ff', -45, -0.38, 0, 16, 0.02, L);
      var uz = -hz + R(2, 6);
      while (uz < hz - 3) {
        var ux = R(-30, -14), uc = ['#ff4d6d', '#ffd23f', '#3a86ff', '#06d6a0', '#ff9f1c'][Math.floor(r() * 5)];
        b.add(GEO.cyl6, '#ffffff', ux, 1.25, uz, 0.12, 2.5, 0.12);
        b.add(GEO.cone6, uc, ux, 2.55, uz, 3.2, 0.9, 3.2, 0, r(), 0, 0.85);
        b.add(GEO.cone6, '#ffffff', ux, 2.62, uz, 1.3, 0.75, 1.3, 0, r(), 0);
        b.box(uc, ux + 1.4, 0.33, uz + R(-0.5, 0.5), 1.0, 0.04, 2.0);
        uz += R(7, 12);
      }
      for (var p = 0; p < 3; p++) palm(b, R(-13, -9), -hz + 5 + p * 13 + R(-2, 2), R(6, 8.5), r);
      if (r() < 0.5) {
        var bx = R(-80, -50), bz = R(-12, 12);
        b.box('#ffffff', bx, -0.6, bz, 3, 1.2, 7, 0.8);
        b.add(GEO.cone4, r() < 0.5 ? '#ff4d6d' : '#ffd23f', bx, 4.2, bz, 0.4, 6.5, 4.5, 0, 0, 0);
      }
      if (r() < 0.4) {
        var lx = R(-26, -18), lz = R(-10, 10);
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q) { b.box('#ffffff', lx + q[0] * 0.9, 0.3, lz + q[1] * 0.9, 0.2, 3.2, 0.2); });
        b.box('#ff4d6d', lx, 3.4, lz, 2.4, 1.4, 2.4, 0.8);
        b.add(GEO.cone4, '#ffffff', lx, 4.6, lz, 3.4, 1.0, 3.4, 0, Math.PI / 4, 0);
      }
    } else {
      // promenade + beach houses
      b.box('#ffe3a6', 32, -0.4, 0, 40, 0.8, L);
      var z = hz - R(0, 2);
      var cols = ['#ffadad', '#a0c4ff', '#caffbf', '#fdffb6', '#ffc6ff', '#9bf6ff', '#ffd6a5'];
      while (z > -hz + 5) {
        var wd = R(6, 9), dp = R(6, 9), h = R(3.5, 7.5);
        if (z - wd < -hz) break;
        hipHouse(b, w, 13 + dp / 2 + R(0, 2), z - wd / 2, wd, dp, h, cols[Math.floor(r() * cols.length)], ['#e76f51', '#2a9d8f', '#3a86ff', '#9b5de5'][Math.floor(r() * 4)], 1, r);
        z -= wd + R(2, 5);
      }
      for (var q = 0; q < 3; q++) palm(b, R(9, 11.5), -hz + 6 + q * 13 + R(-2, 2), R(6, 8), r);
      if (r() < 0.5) {
        var kz = R(-14, 14);
        b.box('#ffffff', 10.5, 0.35, kz, 1.8, 1.6, 2.4);
        for (var a = 0; a < 4; a++) b.box(a % 2 ? '#ffffff' : '#ff6fb5', 10.2, 2.2, kz - 1.05 + a * 0.7, 2.6, 0.12, 0.7, 0, 0, 0, 0.3);
        b.add(GEO.cone6, '#ffcf99', 10.5, 2.9, kz, 0.5, 0.8, 0.5, Math.PI, 0, 0);
        b.add(GEO.ico1, '#ff9ec7', 10.5, 3.45, kz, 0.6, 0.6, 0.6);
      }
    }
  }
  function hillSide(b, w, side, r, L) {
    var hz = L / 2;
    function R(a, c) { return a + r() * (c - a); }
    b.box('#86d95e', side * 32, -0.4, 0, 40, 0.8, L);
    // rolling hills far away
    for (var i = 0; i < 2; i++) {
      var hs = R(28, 46);
      b.add(GEO.ico1, ['#5cc451', '#6fd35f', '#4fb548'][Math.floor(r() * 3)], side * R(48, 70), -hs * 0.18, R(-hz, hz), hs * 1.3, hs * 0.55, hs, 0, r() * 3, 0, 0.8);
    }
    // picket fence
    for (var f = 0; f < 14; f++) b.box('#ffffff', side * 12.2, 0.35, -hz + 1.5 + f * 2.9, 0.12, 1.0, 0.18);
    b.box('#ffffff', side * 12.2, 0.95, 0, 0.08, 0.12, L);
    // houses
    var z = hz - R(0, 3);
    var cols = ['#fff3e0', '#ffd6a5', '#caffbf', '#bde0fe', '#ffc8dd', '#fdffb6'];
    while (z > -hz + 6) {
      var wd = R(6, 8.5), dp = R(6, 8.5), h = R(3.2, 5.2);
      if (z - wd < -hz) break;
      hipHouse(b, w, side * (15 + dp / 2 + R(0, 3)), z - wd / 2, wd, dp, h, cols[Math.floor(r() * cols.length)], ['#d62828', '#e76f51', '#6d597a', '#355070'][Math.floor(r() * 4)], side, r);
      z -= wd + R(4, 8);
    }
    // round trees and flowers
    var tz = -hz + R(1, 4);
    while (tz < hz - 1) {
      var tx = side * R(8.6, 11.2), th = R(1.2, 2), ts = R(2, 3.2);
      b.box('#8b5a3c', tx, 0.35, tz, 0.3, th, 0.3);
      b.add(GEO.ico1, ['#3fbf5f', '#56d364', '#2fa84f', '#7ed957'][Math.floor(r() * 4)], tx, 0.35 + th + ts * 0.35, tz, ts, ts * 0.95, ts, 0, r() * 3, 0, 0.7);
      tz += R(3.5, 7);
    }
    for (var fl = 0; fl < 10; fl++) {
      b.box(['#ff4d6d', '#ffd23f', '#ffffff', '#c77dff'][Math.floor(r() * 4)], side * R(8.2, 11.8), 0.36, R(-hz, hz), 0.25, 0.12, 0.25);
    }
    if (r() < 0.35) {
      var mx = side * R(26, 34), mz = R(-10, 10);
      b.add(GEO.cone6, '#f4f1de', mx, 5, mz, 3, 10, 3, 0, 0, 0, 0.8);
      b.box('#e63946', mx, 9.6, mz, 1.6, 1.6, 1.6);
      for (var bl = 0; bl < 4; bl++) b.add(GEO.box, '#ffffff', mx - side * 0.9, 10.4, mz, 0.15, 7, 0.9, bl * Math.PI / 2 + 0.4, 0, 0);
    }
  }

  /* ------------------------------------------------------- trains */
  var TRAIN_STYLES = [
    { main: '#ff4d5a', stripe: '#ffffff', roof: '#eceff4', trim: '#ffd23f' },
    { main: '#3a86ff', stripe: '#ffd23f', roof: '#eceff4', trim: '#ffffff' },
    { main: '#1fbfae', stripe: '#fff3b0', roof: '#eceff4', trim: '#0b6e67' },
    { main: '#9b5de5', stripe: '#ffb3de', roof: '#eceff4', trim: '#ffffff' },
    { main: '#ff9f1c', stripe: '#ffffff', roof: '#eceff4', trim: '#3d405b' }
  ];
  RR.TRAIN_STYLES = TRAIN_STYLES.length;
  var CONTAINER_COLORS = ['#e63946', '#2a9d8f', '#f4a261', '#457b9d', '#8ac926'];

  // kind: 'cab' | 'mid' | 'cargo'. Car is 10 long, z -5..5, front (+z) faces the runner.
  RR.buildCar = function (styleIdx, kind, moving) {
    var st = TRAIN_STYLES[styleIdx % TRAIN_STYLES.length];
    var b = new Builder();
    // bogies and wheels
    [-3.3, 3.3].forEach(function (bz) {
      b.box('#3a3f4b', 0, 0.12, bz, 1.9, 0.45, 2.4);
      [-0.55, 0.55].forEach(function (wz) {
        [-1, 1].forEach(function (sx) {
          b.add(GEO.cyl10, '#2b2d42', sx * 0.92, 0.36, bz + wz, 0.6, 0.18, 0.6, 0, 0, Math.PI / 2);
          b.add(GEO.cyl6, '#c0c7d1', sx * 1.02, 0.36, bz + wz, 0.22, 0.04, 0.22, 0, 0, Math.PI / 2);
        });
      });
    });
    if (kind === 'cargo') {
      var cc = CONTAINER_COLORS[styleIdx % CONTAINER_COLORS.length];
      b.box('#4a4f5c', 0, 0.55, 0, 2.3, 0.35, 10);
      b.box(cc, 0, 0.9, 0, 2.26, 2.1, 9.7, 0.7);
      for (var k = 0; k < 15; k++) {
        var rz = -4.55 + k * 0.65;
        b.box(cc, -1.15, 0.95, rz, 0.06, 2.0, 0.16, 0.6);
        b.box(cc, 1.15, 0.95, rz, 0.06, 2.0, 0.16, 0.6);
      }
      b.box('#ffffff', 0, 2.3, 4.86, 1.9, 0.18, 0.02);
      b.box('#2b2d42', -0.4, 1.0, 4.86, 0.06, 1.9, 0.03);
      b.box('#2b2d42', 0.4, 1.0, 4.86, 0.06, 1.9, 0.03);
      b.box('#ffffff', 0, 2.3, -4.86, 1.9, 0.18, 0.02);
      return b.geometry();
    }
    // passenger car body
    b.box(st.main, 0, 0.55, 0, 2.3, 2.3, 10, 0.78);
    b.box(st.stripe, 0, 0.95, 0, 2.34, 0.28, 9.96);
    b.box(st.trim, 0, 1.28, 0, 2.33, 0.08, 9.94);
    b.box(st.roof, 0, 2.85, 0, 2.2, 0.15, 9.9);
    b.box('#c9ced8', 0, 2.99, -2.5, 1.0, 0.04, 2.0);
    b.box('#c9ced8', 0, 2.99, 2.5, 1.0, 0.04, 2.0);
    // side windows + door
    [-1, 1].forEach(function (sx) {
      [-3.4, -1.7, 1.7, 3.4].forEach(function (wz) {
        b.box('#26335a', sx * 1.16, 1.62, wz, 0.03, 0.85, 1.3);
        b.box('#7fb3ff', sx * 1.175, 2.2, wz - 0.3, 0.02, 0.18, 0.5);
      });
      b.box('#e9ecef', sx * 1.16, 0.62, 0, 0.03, 2.0, 1.4);
      b.box('#26335a', sx * 1.175, 1.62, -0.35, 0.02, 0.85, 0.5);
      b.box('#26335a', sx * 1.175, 1.62, 0.35, 0.02, 0.85, 0.5);
    });
    if (kind === 'cab') {
      // rounded nose, big windshield, headlights
      b.box(st.main, 0, 0.55, 5.05, 2.2, 1.6, 0.25, 0.8);
      b.box('#1f2a44', 0, 1.62, 5.02, 1.85, 0.95, 0.12);
      b.box('#7fb3ff', -0.5, 2.25, 5.09, 0.5, 0.14, 0.02);
      b.box(moving ? '#fffbe0' : '#fff2a8', -0.72, 0.85, 5.18, 0.38, 0.26, 0.06);
      b.box(moving ? '#fffbe0' : '#fff2a8', 0.72, 0.85, 5.18, 0.38, 0.26, 0.06);
      b.box('#2b2d42', 0, 0.35, 5.1, 2.2, 0.3, 0.3);
      b.box(st.stripe, 0, 1.25, 5.15, 0.9, 0.14, 0.04);
      b.box(st.trim, 0, 2.62, 5.0, 1.2, 0.18, 0.08);
    } else {
      b.box('#3d405b', 0, 0.8, 5.02, 1.2, 1.9, 0.06);
    }
    b.box('#3d405b', 0, 0.8, -5.02, 1.2, 1.9, 0.06);
    return b.geometry();
  };

  RR.buildRamp = function () {
    var b = new Builder();
    var L = RR.RAMP_LEN, H = RR.TRAIN_TOP;
    b.add(GEO.wedge, '#8d99ae', 0, 0, 0, 2.3, H - 0.05, L, 0, 0, 0, 0.7);
    var ang = Math.atan2(H, L), sl = Math.sqrt(H * H + L * L), n = 9;
    for (var k = 0; k < n; k++) {
      var t = (k + 0.5) / n;
      var col = k % 2 ? '#2d2d2d' : '#ffd23f';
      b.add(GEO.box, col, 0, H * t + 0.02, L / 2 - L * t, 2.1, 0.08, sl / n * 0.98, ang, 0, 0);
    }
    // support legs at the tall end
    b.box('#56627a', -0.95, 0, -L / 2 + 0.3, 0.2, H - 0.1, 0.2);
    b.box('#56627a', 0.95, 0, -L / 2 + 0.3, 0.2, H - 0.1, 0.2);
    return b.geometry();
  };

  RR.buildBarrier = function (kind) {
    var b = new Builder();
    if (kind === 'low') {
      [-1, 1].forEach(function (sx) {
        b.box('#555b6e', sx * 0.95, 0.05, 0, 0.5, 0.1, 0.6);
        b.box('#f1f1f1', sx * 0.95, 0.1, 0, 0.16, 0.9, 0.16);
      });
      for (var i = 0; i < 5; i++) {
        b.box(i % 2 ? '#ffffff' : '#ff3b3b', -0.92 + i * 0.46, 0.5, 0, 0.46, 0.46, 0.16);
      }
      b.box('#ffd23f', -0.95, 1.0, 0, 0.2, 0.12, 0.2);
      b.box('#ffd23f', 0.95, 1.0, 0, 0.2, 0.12, 0.2);
    } else {
      [-1, 1].forEach(function (sx) {
        b.box('#555b6e', sx * 1.1, 0, 0, 0.5, 0.12, 0.6);
        b.box('#4a5568', sx * 1.1, 0.1, 0, 0.2, 2.85, 0.2);
      });
      for (var j = 0; j < 7; j++) {
        b.box(j % 2 ? '#2b2d42' : '#ffcf1a', -1.0 + j * (2.0 / 6), 1.35, 0, 2.0 / 7 + 0.03, 1.5, 0.14, 0, 0, 0, 0.5);
      }
      b.box('#ffffff', 0, 1.3, 0, 2.2, 0.1, 0.18);
      b.box('#ffffff', 0, 2.85, 0, 2.2, 0.1, 0.18);
      // big "go under" arrow sign
      b.box('#ffffff', 0, 1.62, 0.1, 0.9, 0.9, 0.04);
      b.add(GEO.cone4, '#ff3b3b', 0, 1.98, 0.14, 0.62, 0.52, 0.04, Math.PI, Math.PI / 4, 0);
      b.box('#ff3b3b', 0, 2.2, 0.14, 0.18, 0.28, 0.04);
    }
    return b.geometry();
  };

  RR.buildTunnel = function () {
    var b = new Builder(), w = new Builder();
    var L = 60, H = 9.4;
    [-1, 1].forEach(function (s) {
      b.box('#707486', s * 5.8, -0.4, 0, 1.2, H + 0.4, L, 0.6);
      b.box('#5b5f70', s * 5.15, 0.5, 0, 0.1, 1.0, L);
      for (var k = 0; k < 10; k++) {
        w.box('#fff1b8', s * 5.18, 6.2, -L / 2 + 3 + k * 6, 0.05, 0.3, 1.4);
        b.box('#5b5f70', s * 5.17, 0.5, -L / 2 + 3 + k * 6, 0.1, H - 0.5, 0.35);
      }
    });
    b.box('#5f6373', 0, H, 0, 12.8, 1.4, L);
    for (var r = 0; r < 12; r++) b.box('#4f5262', 0, H - 0.3, -L / 2 + 2.5 + r * 5, 10.6, 0.3, 0.4);
    // portals at both ends
    [-1, 1].forEach(function (end) {
      var pz = end * (L / 2 + 0.5);
      b.box('#c8553d', -8.2, -0.4, pz, 5.8, 14.6, 1.6, 0.7);
      b.box('#c8553d', 8.2, -0.4, pz, 5.8, 14.6, 1.6, 0.7);
      b.box('#c8553d', 0, H, pz, 11.2, 4.8, 1.6, 0.8);
      b.box('#ffcf3a', 0, H - 0.4, pz + end * 0.82, 10.8, 0.45, 0.1);
      b.box('#ffcf3a', -5.35, -0.4, pz + end * 0.82, 0.45, H, 0.1);
      b.box('#ffcf3a', 5.35, -0.4, pz + end * 0.82, 0.45, H, 0.1);
      b.box('#f4d6c6', 0, 14.2, pz, 22.4, 0.6, 2.0);
      for (var bi = 0; bi < 6; bi++) {
        b.box('#a8432e', -10.5 + bi * 4.2, 1.5 + (bi % 3) * 3.6, pz + end * 0.81, 1.4, 0.5, 0.05);
      }
    });
    return { main: b.geometry(), win: w.geometry() };
  };

  /* --------------------------------------------- sky decorations */
  RR.buildClouds = function () {
    var b = new Builder(), r = mulberry(99);
    for (var i = 0; i < 14; i++) {
      var ang = (i / 14) * Math.PI * 2 + r() * 0.3;
      var dist = 260 + r() * 60;
      var cx = Math.sin(ang) * dist, cz = -Math.cos(ang) * dist, cy = 45 + r() * 45;
      var n = 4 + Math.floor(r() * 4), sz = 10 + r() * 10;
      for (var k = 0; k < n; k++) {
        var s = sz * (0.6 + r() * 0.6);
        b.add(GEO.ico1, '#ffffff', cx + (k - n / 2) * sz * 0.55 + r() * 4, cy + r() * sz * 0.3, cz + r() * 6, s * 1.4, s, s, 0, r() * 3, 0, 0.82);
      }
    }
    return b.geometry();
  };

  RR.buildSkyline = function () {
    var b = new Builder(), r = mulberry(7);
    for (var ring = 0; ring < 2; ring++) {
      for (var i = 0; i < 70; i++) {
        var ang = (i / 70) * Math.PI * 2 + ring * 0.04;
        var dist = 380 + ring * 25;
        var h = ring ? 30 + r() * 70 : 20 + r() * 45;
        var wdt = 14 + r() * 20;
        var col = ring ? '#c7cde6' : '#aab4d4';
        b.add(GEO.box, col, Math.sin(ang) * dist, h / 2 - 6, -Math.cos(ang) * dist, wdt, h, wdt, 0, -ang, 0, 0.85);
      }
    }
    return b.geometry();
  };

  /* ------------------------------------------------ canvas textures */
  function canvasTex(size, draw) {
    var c = document.createElement('canvas');
    c.width = c.height = size;
    var g = c.getContext('2d');
    draw(g, size);
    return c;
  }
  RR.canvasTex = canvasTex;

  RR.glowCanvas = function (inner, outer) {
    return canvasTex(64, function (g, s) {
      var gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      gr.addColorStop(0, inner || 'rgba(255,255,255,1)');
      gr.addColorStop(0.35, outer || 'rgba(255,255,255,0.5)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, s, s);
    });
  };

  RR.ringCanvas = function () {
    return canvasTex(128, function (g, s) {
      var gr = g.createRadialGradient(s / 2, s / 2, s * 0.28, s / 2, s / 2, s / 2);
      gr.addColorStop(0, 'rgba(255,255,255,0)');
      gr.addColorStop(0.55, 'rgba(255,255,255,0.15)');
      gr.addColorStop(0.78, 'rgba(255,255,255,1)');
      gr.addColorStop(0.86, 'rgba(255,255,255,0.5)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, s, s);
    });
  };
  RR.shadowCanvas = function () {
    return canvasTex(64, function (g, s) {
      var gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      gr.addColorStop(0, 'rgba(20,20,40,0.55)');
      gr.addColorStop(0.6, 'rgba(20,20,40,0.35)');
      gr.addColorStop(1, 'rgba(20,20,40,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, s, s);
    });
  };

  function starPath(g, cx, cy, ro, ri, n) {
    g.beginPath();
    for (var i = 0; i < n * 2; i++) {
      var a = -Math.PI / 2 + i * Math.PI / n, rr = i % 2 ? ri : ro;
      g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    g.closePath();
  }
  RR.starCanvas = function () {
    return canvasTex(64, function (g, s) {
      starPath(g, s / 2, s / 2, s * 0.46, s * 0.2, 5);
      g.fillStyle = '#ffe14d'; g.fill();
      g.lineWidth = 4; g.strokeStyle = '#ff9f1c'; g.stroke();
    });
  };

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  var ICON_COLORS = { magnet: '#ff4d5a', sneakers: '#2ee06f', doubler: '#ffc629', board: '#3aa0ff', mystery: '#b35cff' };
  RR.ICON_COLORS = ICON_COLORS;
  // Draws a power-up icon into ctx at (0,0,s,s). bubble=true adds the glowing bubble.
  RR.drawIcon = function (g, type, s, bubble) {
    g.save();
    if (bubble) {
      var gr = g.createRadialGradient(s * 0.42, s * 0.38, s * 0.05, s / 2, s / 2, s * 0.5);
      gr.addColorStop(0, 'rgba(255,255,255,0.95)');
      gr.addColorStop(0.7, 'rgba(255,255,255,0.55)');
      gr.addColorStop(0.92, ICON_COLORS[type]);
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.beginPath(); g.arc(s / 2, s / 2, s * 0.49, 0, Math.PI * 2); g.fill();
    }
    g.translate(s / 2, s / 2);
    var u = s / 100;
    g.lineJoin = 'round'; g.lineCap = 'round';
    if (type === 'magnet') {
      g.rotate(-0.5);
      g.lineWidth = 22 * u; g.strokeStyle = '#2b2d42';
      g.beginPath(); g.arc(0, 2 * u, 20 * u, 0, Math.PI); g.lineTo(-20 * u, -22 * u); g.moveTo(20 * u, 2 * u); g.lineTo(20 * u, -22 * u); g.stroke();
      g.lineWidth = 15 * u; g.strokeStyle = '#ff3b3b';
      g.beginPath(); g.arc(0, 2 * u, 20 * u, 0, Math.PI); g.lineTo(-20 * u, -12 * u); g.moveTo(20 * u, 2 * u); g.lineTo(20 * u, -12 * u); g.stroke();
      g.fillStyle = '#e8edf5';
      g.fillRect(-28 * u, -30 * u, 16 * u, 14 * u); g.fillRect(12 * u, -30 * u, 16 * u, 14 * u);
      g.strokeStyle = '#2b2d42'; g.lineWidth = 3 * u;
      g.strokeRect(-28 * u, -30 * u, 16 * u, 14 * u); g.strokeRect(12 * u, -30 * u, 16 * u, 14 * u);
    } else if (type === 'sneakers') {
      g.rotate(-0.15);
      g.fillStyle = '#2b2d42';
      roundRect(g, -34 * u, -6 * u, 68 * u, 26 * u, 10 * u); g.fill();
      g.fillStyle = '#2ee06f';
      g.beginPath();
      g.moveTo(-30 * u, 10 * u); g.lineTo(-28 * u, -24 * u); g.quadraticCurveTo(-14 * u, -30 * u, -6 * u, -20 * u);
      g.lineTo(10 * u, -6 * u); g.quadraticCurveTo(32 * u, -4 * u, 32 * u, 10 * u); g.closePath(); g.fill();
      g.lineWidth = 4 * u; g.strokeStyle = '#14532d'; g.stroke();
      g.fillStyle = '#ffffff';
      roundRect(g, -34 * u, 9 * u, 68 * u, 11 * u, 5 * u); g.fill();
      g.strokeStyle = '#ffffff'; g.lineWidth = 3.5 * u;
      g.beginPath(); g.moveTo(-10 * u, -16 * u); g.lineTo(-2 * u, -12 * u); g.moveTo(-6 * u, -10 * u); g.lineTo(2 * u, -6 * u); g.stroke();
      // wing
      g.fillStyle = '#ffffff';
      g.beginPath(); g.moveTo(-30 * u, -12 * u); g.lineTo(-46 * u, -26 * u); g.lineTo(-40 * u, -14 * u); g.lineTo(-48 * u, -12 * u); g.lineTo(-38 * u, -6 * u); g.closePath(); g.fill();
    } else if (type === 'doubler') {
      starPath(g, 0, 0, 40 * u, 20 * u, 5);
      g.fillStyle = '#ffc629'; g.fill();
      g.lineWidth = 5 * u; g.strokeStyle = '#e07a00'; g.stroke();
      g.fillStyle = '#7a2e00';
      g.font = 'bold ' + Math.round(26 * u) + 'px Fredoka, "Segoe UI", sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('2x', 0, 4 * u);
    } else if (type === 'board') {
      g.rotate(-0.6);
      g.fillStyle = '#2b2d42';
      roundRect(g, -40 * u, -15 * u, 80 * u, 30 * u, 15 * u); g.fill();
      g.fillStyle = '#3aa0ff';
      roundRect(g, -37 * u, -12 * u, 74 * u, 24 * u, 12 * u); g.fill();
      g.fillStyle = '#ffd23f';
      g.fillRect(-6 * u, -12 * u, 12 * u, 24 * u);
      g.fillStyle = '#ffffff';
      g.fillRect(-26 * u, -5 * u, 10 * u, 4 * u); g.fillRect(16 * u, -5 * u, 10 * u, 4 * u);
    } else if (type === 'mystery') {
      g.fillStyle = '#2b2d42';
      roundRect(g, -30 * u, -18 * u, 60 * u, 50 * u, 6 * u); g.fill();
      g.fillStyle = '#b35cff';
      roundRect(g, -27 * u, -12 * u, 54 * u, 41 * u, 4 * u); g.fill();
      g.fillStyle = '#c77dff';
      roundRect(g, -32 * u, -24 * u, 64 * u, 16 * u, 4 * u); g.fill();
      g.fillStyle = '#ffd23f';
      g.fillRect(-6 * u, -24 * u, 12 * u, 53 * u);
      g.beginPath(); g.ellipse(-12 * u, -30 * u, 12 * u, 7 * u, -0.5, 0, Math.PI * 2); g.ellipse(12 * u, -30 * u, 12 * u, 7 * u, 0.5, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ffffff';
      g.font = 'bold ' + Math.round(26 * u) + 'px Fredoka, "Segoe UI", sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('?', -16 * u, 9 * u);
    } else if (type === 'coin') {
      g.fillStyle = '#e09a00'; g.beginPath(); g.arc(0, 0, 44 * u, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(0, -3 * u, 40 * u, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#e09a00'; g.lineWidth = 6 * u; g.beginPath(); g.arc(0, -3 * u, 28 * u, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#fff6c9'; g.fillRect(-4 * u, -20 * u, 8 * u, 34 * u);
    }
    g.restore();
  };

  /* ------------------------------------------------------ particles */
  // GPU points with per-particle size, colour and fade. Positions in world space.
  RR.createParticles = function (max) {
    var geo = new T.BufferGeometry();
    var pos = new Float32Array(max * 3), col = new Float32Array(max * 3), size = new Float32Array(max), alpha = new Float32Array(max);
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    geo.setAttribute('color', new T.BufferAttribute(col, 3));
    geo.setAttribute('size', new T.BufferAttribute(size, 1));
    geo.setAttribute('alpha', new T.BufferAttribute(alpha, 1));
    geo.setDrawRange(0, 0);
    var mat = new T.ShaderMaterial({
      uniforms: { uScale: { value: 400 } },
      vertexShader: [
        'attribute float size; attribute float alpha; attribute vec3 color;',
        'varying vec3 vC; varying float vA; uniform float uScale;',
        'void main(){ vC = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0);',
        ' gl_PointSize = size * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }'
      ].join('\n'),
      fragmentShader: [
        'varying vec3 vC; varying float vA;',
        'void main(){ vec2 d = gl_PointCoord - 0.5; float r = dot(d,d); if (r > 0.25) discard;',
        ' float a = vA * smoothstep(0.25, 0.12, r); gl_FragColor = vec4(vC * (1.0 + 0.35 * (0.25 - r) * 4.0), a);',
        ' #include <colorspace_fragment>',
        '}'
      ].join('\n'),
      transparent: true, depthWrite: false
    });
    var pts = new T.Points(geo, mat);
    pts.frustumCulled = false;
    var list = [];
    for (var i = 0; i < max; i++) list.push({ on: false, x: 0, y: 0, d: 0, vx: 0, vy: 0, vd: 0, life: 0, max: 1, size: 0.3, g: 0, r: 1, gg: 1, b: 1, drag: 0, grow: 0 });
    var cursor = 0, tmpC = new T.Color();
    var sys = {
      points: pts, material: mat,
      // o: {count, color|colors, speed, up, life, size, gravity, spread, vd (forward vel), drag, grow}
      burst: function (x, y, d, o) {
        var n = o.count || 10;
        for (var k = 0; k < n; k++) {
          var p = list[cursor]; cursor = (cursor + 1) % max;
          var a = Math.random() * Math.PI * 2, e = (Math.random() - 0.3) * Math.PI;
          var sp = (o.speed || 4) * (0.4 + Math.random() * 0.6);
          p.on = true;
          p.x = x + (Math.random() - 0.5) * (o.jitter || 0);
          p.y = y + (Math.random() - 0.5) * (o.jitter || 0);
          p.d = d + (Math.random() - 0.5) * (o.jitter || 0);
          p.vx = Math.cos(a) * Math.cos(e) * sp;
          p.vy = Math.sin(e) * sp + (o.up || 0);
          p.vd = Math.sin(a) * Math.cos(e) * sp + (o.vd || 0);
          p.life = p.max = (o.life || 0.6) * (0.6 + Math.random() * 0.5);
          p.size = (o.size || 0.3) * (0.6 + Math.random() * 0.7);
          p.g = o.gravity == null ? 12 : o.gravity;
          p.drag = o.drag || 0;
          p.grow = o.grow || 0;
          tmpC.set(o.colors ? o.colors[Math.floor(Math.random() * o.colors.length)] : (o.color || '#ffffff'));
          p.r = tmpC.r; p.gg = tmpC.g; p.b = tmpC.b;
        }
      },
      update: function (dt) {
        for (var k = 0; k < max; k++) {
          var p = list[k];
          if (!p.on) continue;
          p.life -= dt;
          if (p.life <= 0) { p.on = false; continue; }
          var dr = 1 - p.drag * dt;
          p.vx *= dr; p.vy *= dr; p.vd *= dr;
          p.vy -= p.g * dt;
          p.x += p.vx * dt; p.y += p.vy * dt; p.d += p.vd * dt;
          p.size += p.grow * dt;
        }
      },
      // pD = runner distance used to convert d into render z.
      render: function (pD) {
        var n = 0;
        for (var k = 0; k < max; k++) {
          var p = list[k];
          if (!p.on) continue;
          pos[n * 3] = p.x; pos[n * 3 + 1] = p.y; pos[n * 3 + 2] = pD - p.d;
          col[n * 3] = p.r; col[n * 3 + 1] = p.gg; col[n * 3 + 2] = p.b;
          size[n] = p.size;
          var t = p.life / p.max;
          alpha[n] = t < 0.5 ? t * 2 : 1;
          n++;
        }
        geo.setDrawRange(0, n);
        geo.attributes.position.needsUpdate = true;
        geo.attributes.color.needsUpdate = true;
        geo.attributes.size.needsUpdate = true;
        geo.attributes.alpha.needsUpdate = true;
      },
      clear: function () { for (var k = 0; k < max; k++) list[k].on = false; }
    };
    return sys;
  };

  /* ---------------------------------------------------------- outfits */
  RR.OUTFITS = [
    { id: 'rookie', name: 'المبتدئ', price: 0, c: { skin: '#f5c79c', hood: '#ff7a1a', hood2: '#ffd23f', pants: '#3056c9', shoes: '#ff3b5c', sole: '#ffffff', cap: '#e63946', brim: '#ffffff', hair: '#4a2c1a', acc: '#ffd23f', acc2: '#ffffff' }, acc: ['cap'] },
    { id: 'skater', name: 'المتزلّج', price: 300, c: { skin: '#d99a6c', hood: '#16c2b5', hood2: '#0e7c86', pants: '#2b2d42', shoes: '#f7f7f7', sole: '#e63946', cap: '#2b2d42', brim: '#ff7a1a', hair: '#1b1b1b', acc: '#ffd23f', acc2: '#ff7a1a' }, acc: ['cap', 'backpack'] },
    { id: 'bubble', name: 'العلكة الوردية', price: 600, c: { skin: '#ffd9b8', hood: '#ff6fb5', hood2: '#ffc2e2', pants: '#7b5cff', shoes: '#ffffff', sole: '#ff6fb5', cap: '#9b5de5', brim: '#ffc2e2', hair: '#6b3b2a', acc: '#7b5cff', acc2: '#ffffff' }, acc: ['cap', 'phones'] },
    { id: 'dino', name: 'الديناصور', price: 1000, c: { skin: '#f5c79c', hood: '#3ec95b', hood2: '#b6f07a', pants: '#2f7a3b', shoes: '#ffb703', sole: '#ffffff', cap: '#3ec95b', brim: '#b6f07a', hair: '#4a2c1a', acc: '#ffb703', acc2: '#3ec95b' }, acc: ['cap', 'spikes'] },
    { id: 'robo', name: 'الفتى الآلي', price: 1500, c: { skin: '#f0c9a4', hood: '#aab4c3', hood2: '#5b6b82', pants: '#5b6b82', shoes: '#3ad1ff', sole: '#2b2d42', cap: '#aab4c3', brim: '#aab4c3', hair: '#8a96a8', acc: '#3ad1ff', acc2: '#5b6b82' }, acc: ['antenna', 'visor', 'backpack'] },
    { id: 'ninja', name: 'النينجا', price: 2200, c: { skin: '#e8b58c', hood: '#23264a', hood2: '#e63946', pants: '#23264a', shoes: '#111322', sole: '#e63946', cap: '#23264a', brim: '#23264a', hair: '#111111', acc: '#e63946', acc2: '#ffffff' }, acc: ['band'] },
    { id: 'astro', name: 'رائد الفضاء', price: 3000, c: { skin: '#f5c79c', hood: '#f4f4f4', hood2: '#ff7a1a', pants: '#e9ecef', shoes: '#6c757d', sole: '#ff7a1a', cap: '#f4f4f4', brim: '#f4f4f4', hair: '#7a4a2a', acc: '#cfd8e3', acc2: '#ff7a1a' }, acc: ['helmet', 'tank'] },
    { id: 'royal', name: 'العدّاء الملكي', price: 4200, c: { skin: '#f5c79c', hood: '#7b2cbf', hood2: '#ffd23f', pants: '#3c096c', shoes: '#ffd23f', sole: '#ffffff', cap: '#7b2cbf', brim: '#7b2cbf', hair: '#e0a458', acc: '#ffd23f', acc2: '#e63946' }, acc: ['crown', 'cape'] },
    { id: 'lava', name: 'بطل البركان', price: 5500, c: { skin: '#d99a6c', hood: '#2b2b2b', hood2: '#ff5400', pants: '#1a1a1a', shoes: '#ff5400', sole: '#ffd23f', cap: '#ff5400', brim: '#2b2b2b', hair: '#1a1a1a', acc: '#ff7b00', acc2: '#ffd23f' }, acc: ['cap', 'flames'] },
    { id: 'rainbow', name: 'نجم قوس قزح', price: 8000, c: { skin: '#f5c79c', hood: '#ff4d6d', hood2: '#ffffff', pants: '#4361ee', shoes: '#ffffff', sole: '#ffd23f', cap: '#ffffff', brim: '#ffd23f', hair: '#4a2c1a', acc: '#ffffff', acc2: '#ff4d6d' }, acc: ['cap', 'phones', 'cape'], rainbow: true }
  ];

  RR.BOARDS = [
    { id: 'classic', name: 'الكلاسيكي', price: 0, deck: '#ff7a1a', stripe: '#ffd23f', under: '#2b2d42', glow: '#ffb347' },
    { id: 'ocean', name: 'موج البحر', price: 250, deck: '#1fb6ff', stripe: '#ffffff', under: '#0a3d62', glow: '#6ff0ff' },
    { id: 'bolt', name: 'البرق', price: 600, deck: '#ffd23f', stripe: '#2b2d42', under: '#2b2d42', glow: '#fff36b' },
    { id: 'galaxy', name: 'المجرّة', price: 1200, deck: '#5a189a', stripe: '#ff9ef5', under: '#10002b', glow: '#c77dff' },
    { id: 'candy', name: 'الحلوى', price: 2000, deck: '#ff8fc7', stripe: '#7cf5d2', under: '#ffffff', glow: '#ffb3e6' },
    { id: 'gold', name: 'الذهب', price: 3500, deck: '#ffcc33', stripe: '#fff6c9', under: '#b8860b', glow: '#ffe98a' }
  ];

  /* --------------------------------------------------------- runner */
  RR.createRunner = function () {
    var slots = ['skin', 'hood', 'hood2', 'pants', 'shoes', 'sole', 'cap', 'brim', 'hair', 'acc', 'acc2'];
    var M = {};
    slots.forEach(function (k) { M[k] = new T.MeshLambertMaterial({ color: 0xffffff }); });
    M.eye = new T.MeshBasicMaterial({ color: '#1b1b2f' });
    M.white = new T.MeshBasicMaterial({ color: '#ffffff' });
    M.mouth = new T.MeshBasicMaterial({ color: '#7a1f2b' });
    M.cheek = new T.MeshBasicMaterial({ color: '#ff9aa2' });
    M.glow = new T.MeshBasicMaterial({ color: '#3ad1ff' });
    M.flame = new T.MeshBasicMaterial({ color: '#ffb000' });
    M.bubble = new T.MeshLambertMaterial({ color: '#cfefff', transparent: true, opacity: 0.35, depthWrite: false });
    var BOX = new T.BoxGeometry(1, 1, 1), SPH = new T.SphereGeometry(0.5, 16, 12), CYL = new T.CylinderGeometry(0.5, 0.5, 1, 12),
      CONE = new T.ConeGeometry(0.5, 1, 6), DOME = new T.SphereGeometry(0.5, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      RING = new T.CylinderGeometry(0.5, 0.5, 1, 16, 1, true);

    function part(geo, mat, parent, x, y, z, sx, sy, sz) {
      var m = new T.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.scale.set(sx, sy, sz);
      parent.add(m);
      return m;
    }
    function group(parent, x, y, z) { var g = new T.Group(); g.position.set(x, y, z); parent.add(g); return g; }

    var root = new T.Group();
    var boardG = group(root, 0, 0, 0);
    var pivot = group(root, 0, 0.55, 0);
    var body = group(pivot, 0, -0.55, 0);
    var hips = group(body, 0, 0.66, 0);
    part(BOX, M.pants, hips, 0, 0.02, 0, 0.44, 0.2, 0.27);
    var torso = group(hips, 0, 0.08, 0);
    part(BOX, M.hood, torso, 0, 0.26, 0, 0.52, 0.5, 0.32);
    part(BOX, M.hood2, torso, 0, 0.03, 0, 0.54, 0.08, 0.34);
    part(BOX, M.hood2, torso, 0, 0.15, -0.165, 0.3, 0.12, 0.03);
    part(BOX, M.hood2, torso, 0, 0.44, 0.17, 0.36, 0.18, 0.1);
    var headG = group(torso, 0, 0.5, 0);
    part(CYL, M.skin, headG, 0, 0.04, 0, 0.14, 0.1, 0.14);
    part(SPH, M.skin, headG, 0, 0.3, 0, 0.58, 0.54, 0.54);
    var hair = part(SPH, M.hair, headG, 0, 0.33, 0.05, 0.6, 0.5, 0.52);
    part(SPH, M.skin, headG, -0.29, 0.28, 0.02, 0.1, 0.14, 0.1);
    part(SPH, M.skin, headG, 0.29, 0.28, 0.02, 0.1, 0.14, 0.1);
    var eyes = group(headG, 0, 0, 0);
    [-1, 1].forEach(function (s) {
      part(SPH, M.eye, eyes, s * 0.1, 0.31, -0.245, 0.09, 0.13, 0.06);
      part(SPH, M.white, eyes, s * 0.1 - 0.02, 0.34, -0.27, 0.03, 0.04, 0.02);
      part(SPH, M.cheek, eyes, s * 0.17, 0.22, -0.225, 0.08, 0.05, 0.03);
    });
    part(BOX, M.mouth, eyes, 0, 0.19, -0.265, 0.09, 0.03, 0.02);
    // accessories
    var A = {};
    A.cap = group(headG, 0, 0.4, 0);
    part(DOME, M.cap, A.cap, 0, 0, 0.01, 0.62, 0.48, 0.6);
    part(BOX, M.brim, A.cap, 0, 0.0, -0.36, 0.46, 0.045, 0.32).rotation.x = -0.18;
    part(SPH, M.brim, A.cap, 0, 0.24, 0.01, 0.07, 0.05, 0.07);
    part(BOX, M.brim, A.cap, 0, 0.06, 0.29, 0.18, 0.06, 0.04);
    A.backpack = group(torso, 0, 0.24, 0.2);
    part(BOX, M.acc, A.backpack, 0, 0, 0.04, 0.4, 0.44, 0.2);
    part(BOX, M.acc2, A.backpack, 0, 0.12, 0.15, 0.36, 0.14, 0.04);
    part(BOX, M.acc2, A.backpack, 0, -0.1, 0.15, 0.2, 0.12, 0.04);
    A.phones = group(headG, 0, 0.3, 0);
    part(BOX, M.acc, A.phones, 0, 0.36, 0, 0.64, 0.06, 0.1);
    part(BOX, M.acc, A.phones, -0.31, 0.2, 0, 0.06, 0.3, 0.1);
    part(BOX, M.acc, A.phones, 0.31, 0.2, 0, 0.06, 0.3, 0.1);
    part(CYL, M.acc2, A.phones, -0.32, 0, 0, 0.24, 0.1, 0.24).rotation.z = Math.PI / 2;
    part(CYL, M.acc2, A.phones, 0.32, 0, 0, 0.24, 0.1, 0.24).rotation.z = Math.PI / 2;
    A.spikes = group(torso, 0, 0, 0);
    [[0.62, 0.23, 0.18], [0.42, 0.25, 0.2], [0.22, 0.2, 0.19], [0.92, 0.18, 0.25]].forEach(function (s, i) {
      var sp = part(CONE, M.acc, A.spikes, 0, s[0] + (i === 3 ? 0.08 : 0), s[1] - 0.02, s[2], 0.26, s[2]);
      sp.rotation.x = Math.PI / 2 - 0.3;
    });
    var tail = part(CONE, M.acc2, A.spikes, 0, -0.08, 0.36, 0.22, 0.55, 0.22);
    tail.rotation.x = Math.PI / 2 + 0.5;
    A.antenna = group(headG, 0, 0.6, 0);
    part(CYL, M.acc2, A.antenna, 0, 0.1, 0, 0.04, 0.3, 0.04);
    var antBall = part(SPH, M.glow, A.antenna, 0, 0.28, 0, 0.12, 0.12, 0.12);
    A.visor = group(headG, 0, 0, 0);
    part(BOX, M.glow, A.visor, 0, 0.31, -0.24, 0.5, 0.12, 0.08);
    A.band = group(headG, 0, 0.42, 0);
    part(RING, M.acc, A.band, 0, 0, 0, 0.6, 0.09, 0.57);
    var tails = [part(BOX, M.acc, A.band, -0.06, -0.02, 0.4, 0.06, 0.05, 0.36), part(BOX, M.acc, A.band, 0.07, -0.06, 0.38, 0.06, 0.05, 0.3)];
    A.helmet = group(headG, 0, 0.3, 0);
    part(SPH, M.bubble, A.helmet, 0, 0.02, 0, 0.86, 0.86, 0.86);
    part(RING, M.acc2, A.helmet, 0, -0.34, 0, 0.5, 0.1, 0.5);
    A.tank = group(torso, 0, 0.26, 0.24);
    part(CYL, M.acc, A.tank, -0.1, 0, 0, 0.18, 0.46, 0.18);
    part(CYL, M.acc, A.tank, 0.1, 0, 0, 0.18, 0.46, 0.18);
    part(BOX, M.acc2, A.tank, 0, 0.0, 0.02, 0.36, 0.08, 0.2);
    A.crown = group(headG, 0, 0.56, 0);
    part(RING, M.acc, A.crown, 0, 0, 0, 0.44, 0.14, 0.44);
    for (var ci = 0; ci < 5; ci++) {
      var ca = ci / 5 * Math.PI * 2;
      part(CONE, M.acc, A.crown, Math.sin(ca) * 0.2, 0.13, Math.cos(ca) * 0.2, 0.08, 0.14, 0.08);
    }
    part(SPH, M.acc2, A.crown, 0, 0.02, -0.22, 0.07, 0.07, 0.04);
    A.cape = group(torso, 0, 0.5, 0.17);
    var capeMesh = part(BOX, M.acc2, A.cape, 0, -0.34, 0.02, 0.5, 0.72, 0.03);
    A.flames = group(torso, 0, 0, 0);
    [[-0.2, 0.52, 0.12], [0.2, 0.52, 0.12], [0, 0.4, 0.2]].forEach(function (f) {
      var fl = part(CONE, M.flame, A.flames, f[0], f[1], f[2], 0.14, 0.34, 0.14);
      fl.rotation.x = 0.5;
    });
    // arms
    function arm(side) {
      var p = group(torso, side * 0.33, 0.44, 0);
      part(BOX, M.hood, p, 0, -0.19, 0, 0.15, 0.42, 0.16);
      part(BOX, M.hood2, p, 0, -0.39, 0, 0.165, 0.06, 0.175);
      part(SPH, M.skin, p, 0, -0.47, 0, 0.17, 0.17, 0.17);
      return p;
    }
    function leg(side) {
      var p = group(hips, side * 0.12, 0, 0);
      part(BOX, M.pants, p, 0, -0.16, 0, 0.18, 0.34, 0.2);
      var knee = group(p, 0, -0.32, 0);
      part(BOX, M.pants, knee, 0, -0.14, 0, 0.16, 0.28, 0.18);
      part(BOX, M.shoes, knee, 0, -0.29, -0.05, 0.21, 0.14, 0.34);
      part(BOX, M.sole, knee, 0, -0.355, -0.05, 0.22, 0.05, 0.35);
      p.knee = knee;
      return p;
    }
    var armL = arm(-1), armR = arm(1), legL = leg(-1), legR = leg(1);

    // hoverboard
    var boardMats = { deck: new T.MeshLambertMaterial(), stripe: new T.MeshLambertMaterial(), under: new T.MeshLambertMaterial(), glow: new T.MeshBasicMaterial({ transparent: true, opacity: 0.8, depthWrite: false, blending: T.AdditiveBlending }) };
    var board = group(boardG, 0, 0.18, 0);
    part(BOX, boardMats.under, board, 0, -0.03, 0, 0.66, 0.05, 1.3);
    part(BOX, boardMats.deck, board, 0, 0.02, 0, 0.66, 0.07, 1.3);
    part(CYL, boardMats.deck, board, 0, 0.02, -0.65, 0.66, 0.07, 0.66);
    part(CYL, boardMats.deck, board, 0, 0.02, 0.65, 0.66, 0.07, 0.66);
    part(BOX, boardMats.stripe, board, 0, 0.06, 0, 0.14, 0.02, 1.85);
    var glowPlane = part(new T.PlaneGeometry(1, 1), boardMats.glow, board, 0, -0.1, 0, 0.9, 2.1, 1);
    glowPlane.rotation.x = -Math.PI / 2;
    boardG.visible = false;

    var runner = {
      root: root, pivot: pivot, body: body, hips: hips, torso: torso, head: headG, hair: hair,
      armL: armL, armR: armR, legL: legL, legR: legR, acc: A, mats: M, board: boardG, boardInner: board,
      outfit: null, t: 0,
      pose: { thL: 0, thR: 0, shL: 0, shR: 0, arL: 0, arR: 0, azL: 0, azR: 0, tor: 0, head: 0, bodyY: 0, legZ: 0 },
      setOutfit: function (o) {
        this.outfit = o;
        slots.forEach(function (k) { M[k].color.set(o.c[k]); });
        Object.keys(A).forEach(function (k) { A[k].visible = o.acc.indexOf(k) >= 0; });
        hair.visible = !(o.acc.indexOf('helmet') >= 0);
        M.glow.color.set(o.id === 'robo' ? '#3ad1ff' : '#ffffff');
      },
      setBoard: function (bd) {
        boardMats.deck.color.set(bd.deck);
        boardMats.stripe.color.set(bd.stripe);
        boardMats.under.color.set(bd.under);
        boardMats.glow.color.set(bd.glow);
      },
      // Called every frame with the animation state.
      // st: { mode:'run'|'air'|'roll'|'idle'|'crash'|'stumble'|'board', phase, dt, vy, rollT, lean, time }
      animate: function (st) {
        var P = this.pose, dt = st.dt, t = st.time;
        var tg = { thL: 0, thR: 0, shL: -0.1, shR: -0.1, arL: 0, arR: 0, azL: 0.08, azR: -0.08, tor: 0, head: 0, bodyY: 0, legZ: 0 };
        var ph = st.phase;
        if (st.mode === 'run') {
          var s = Math.sin(ph);
          tg.thL = s * 0.95; tg.thR = -s * 0.95;
          var bL = 0.5 + 0.5 * Math.cos(ph - 1.75 * Math.PI), bR = 0.5 + 0.5 * Math.cos(ph - 0.75 * Math.PI);
          tg.shL = -(0.15 + 1.45 * bL * bL); tg.shR = -(0.15 + 1.45 * bR * bR);
          tg.arL = -s * 1.0; tg.arR = s * 1.0; tg.azL = 0.15; tg.azR = -0.15;
          tg.tor = 0.18; tg.head = -0.12;
          tg.bodyY = Math.abs(Math.cos(ph)) * 0.07;
        } else if (st.mode === 'air') {
          var up = st.vy > 0;
          tg.thL = up ? 1.2 : 0.7; tg.thR = up ? -0.2 : 0.3;
          tg.shL = up ? -1.5 : -0.6; tg.shR = up ? -1.2 : -0.9;
          tg.arL = up ? 2.6 : 1.6; tg.arR = up ? 2.3 : 1.2; tg.azL = 0.5; tg.azR = -0.5;
          tg.tor = 0.1; tg.head = -0.1;
        } else if (st.mode === 'roll') {
          tg.thL = tg.thR = 2.1; tg.shL = tg.shR = -2.3;
          tg.arL = tg.arR = 1.3; tg.azL = 0.2; tg.azR = -0.2;
          tg.tor = 0.7; tg.head = 0.3; tg.bodyY = -0.18;
        } else if (st.mode === 'board') {
          var sw = Math.sin(t * 3);
          tg.thL = 0.35; tg.thR = -0.25; tg.shL = -0.5; tg.shR = -0.35;
          tg.arL = 0.3 + sw * 0.1; tg.arR = -0.2; tg.azL = 1.1 + sw * 0.15; tg.azR = -1.0 - sw * 0.15;
          tg.tor = 0.25; tg.bodyY = 0.12 - 0.06 + Math.sin(t * 5) * 0.03; tg.legZ = 0.12;
        } else if (st.mode === 'stumble') {
          var f = Math.sin(t * 30);
          tg.thL = f * 0.8; tg.thR = -f * 0.8; tg.shL = tg.shR = -0.8;
          tg.arL = 2.2 + f * 0.5; tg.arR = 2.2 - f * 0.5; tg.azL = 0.9; tg.azR = -0.9;
          tg.tor = -0.35; tg.head = 0.25;
        } else if (st.mode === 'crash') {
          tg.thL = 1.3; tg.thR = 0.5; tg.shL = -0.9; tg.shR = -0.3;
          tg.arL = 2.8; tg.arR = 2.4; tg.azL = 1.2; tg.azR = -1.2;
          tg.tor = -0.3; tg.head = 0.4;
        } else if (st.mode === 'idle' || st.mode === 'cheer') {
          var br = Math.sin(t * 2.2);
          tg.bodyY = br * 0.015;
          tg.arL = 0.05; tg.arR = 0.05; tg.azL = 0.14; tg.azR = -0.14;
          tg.tor = -0.02 + br * 0.015; tg.head = -0.05 + Math.sin(t * 0.9) * 0.08;
          var wave = st.mode === 'cheer' ? 1 : Math.max(0, Math.sin(t * 0.8) * 3 - 2);
          if (wave > 0) {
            tg.arR = 2.9 * wave; tg.azR = -0.3 - 0.35 * Math.sin(t * 14) * wave;
          }
          if (st.mode === 'cheer') { tg.arL = 2.9; tg.azL = 0.3 + 0.35 * Math.sin(t * 14); tg.bodyY = Math.abs(Math.sin(t * 8)) * 0.18; }
        }
        var k = st.snap ? 1 : 1 - Math.exp(-dt * (st.mode === 'run' ? 30 : 16));
        for (var key in tg) P[key] += (tg[key] - P[key]) * k;
        legL.rotation.x = P.thL; legR.rotation.x = P.thR;
        legL.knee.rotation.x = P.shL; legR.knee.rotation.x = P.shR;
        legL.rotation.z = P.legZ; legR.rotation.z = -P.legZ;
        armL.rotation.x = P.arL; armR.rotation.x = P.arR;
        armL.rotation.z = -P.azL; armR.rotation.z = -P.azR;
        torso.rotation.x = -P.tor;
        headG.rotation.x = -P.head;
        body.position.y = -0.55 + P.bodyY;
        // accessory motion
        if (A.cape.visible) A.cape.rotation.x = -(0.5 + 0.25 * Math.sin(t * 16)) * (st.mode === 'idle' || st.mode === 'cheer' ? 0.2 : 1);
        if (A.band.visible) { tails[0].rotation.x = 0.3 * Math.sin(t * 20); tails[1].rotation.x = 0.3 * Math.sin(t * 20 + 1); }
        if (A.antenna.visible) antBall.material.color.setHSL(0.52, 1, 0.5 + 0.2 * Math.sin(t * 6));
        if (A.flames.visible) M.flame.color.setHSL(0.08 + 0.04 * Math.sin(t * 20), 1, 0.55);
        if (this.outfit && this.outfit.rainbow) {
          M.hood.color.setHSL((t * 0.15) % 1, 0.85, 0.6);
          M.pants.color.setHSL((t * 0.15 + 0.5) % 1, 0.75, 0.5);
          M.acc2.color.setHSL((t * 0.15 + 0.25) % 1, 0.9, 0.6);
          M.shoes.color.setHSL((t * 0.15 + 0.75) % 1, 0.9, 0.65);
        }
      }
    };
    return runner;
  };

  /* ------------------------------------------------------ patrol bot */
  RR.createBot = function () {
    var g = new T.Group();
    var white = new T.MeshLambertMaterial({ color: '#f1f5ff' }), blue = new T.MeshLambertMaterial({ color: '#3a86ff' }),
      dark = new T.MeshBasicMaterial({ color: '#1b1f3b' }), eye = new T.MeshBasicMaterial({ color: '#6ff7ff' }),
      red = new T.MeshBasicMaterial({ color: '#ff3b3b' }), blu = new T.MeshBasicMaterial({ color: '#3a86ff' });
    var SPH = new T.SphereGeometry(0.5, 16, 12), BOX = new T.BoxGeometry(1, 1, 1);
    function p(geo, m, x, y, z, sx, sy, sz) { var ms = new T.Mesh(geo, m); ms.position.set(x, y, z); ms.scale.set(sx, sy, sz); g.add(ms); return ms; }
    p(SPH, white, 0, 0, 0, 0.9, 0.85, 0.9);
    p(SPH, blue, 0, -0.08, 0, 0.94, 0.3, 0.94);
    p(SPH, dark, 0, 0.1, -0.3, 0.62, 0.34, 0.4);
    var e1 = p(SPH, eye, -0.13, 0.12, -0.48, 0.12, 0.14, 0.05), e2 = p(SPH, eye, 0.13, 0.12, -0.48, 0.12, 0.14, 0.05);
    var sL = p(BOX, red, -0.1, 0.47, 0, 0.18, 0.14, 0.2), sR = p(BOX, blu, 0.1, 0.47, 0, 0.18, 0.14, 0.2);
    p(BOX, blue, -0.52, 0, 0, 0.26, 0.08, 0.5);
    p(BOX, blue, 0.52, 0, 0, 0.26, 0.08, 0.5);
    g.visible = false;
    return {
      root: g,
      animate: function (t) {
        var on = Math.floor(t * 8) % 2;
        sL.material = on ? red : dark; sR.material = on ? dark : blu;
        var bl = (t % 3) < 0.12 ? 0.2 : 1;
        e1.scale.y = e2.scale.y = 0.14 * bl;
      }
    };
  };
})();
