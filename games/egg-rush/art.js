/* Egg Rush (سباق البيض): the 3D view (three.js r159). Track ribbon, scenery, obstacles,
 * chunky runners with a spoon and a wobbling egg, particles, egg splats and the cameras.
 * Everything is vertex-coloured Lambert geometry merged into few draw calls. */
(function () {
  'use strict';
  var ER = window.ER, M = Math;

  // Whether WebGL here is drawn by the processor (SwiftShader, llvmpipe, Basic Render Driver).
  ER.softwareGL = function () {
    try {
      var c = document.createElement('canvas'), gl = c.getContext('webgl2') || c.getContext('webgl');
      if (!gl) return false;
      var ext = gl.getExtension('WEBGL_debug_renderer_info');
      var name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
      var lose = gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
      return /swiftshader|llvmpipe|softpipe|software|basic render|\bwarp\b/i.test(name);
    } catch (e) { return false; }
  };

  var THEMES = [
    { sky: 0x4fb2ff, horizon: 0xd5f0ff, ground: 0x7fd65a, ground2: 0x6cc54b, track: 0xe8553f, line: 0xffffff, curbA: 0xffffff, curbB: 0xe8343a, fog: 0xd5f0ff },
    { sky: 0x62bdfc, horizon: 0xfff0c8, ground: 0x93d24e, ground2: 0x7fbf3f, track: 0xc98b4f, line: 0xf4e3bf, curbA: 0x8a5a33, curbB: 0xb98149, fog: 0xfff0c8 },
    { sky: 0x34b4ff, horizon: 0xd9f7ff, ground: 0xf6d998, ground2: 0xefcd84, track: 0x27b3c4, line: 0xffffff, curbA: 0xffffff, curbB: 0xff7a5c, fog: 0xd9f7ff }
  ];
  ER.THEMES = THEMES;

  ER.createView = function (canvas, opts) {
    var T = window.THREE;
    if (!T) throw new Error('three.js is unavailable');
    opts = opts || {};
    var software = !!opts.software;
    var renderer = new T.WebGLRenderer({ canvas: canvas, antialias: !software, powerPreference: 'high-performance' });
    var ratio = software ? 0.75 : M.min(window.devicePixelRatio || 1, 1.5);
    renderer.setPixelRatio(ratio);
    renderer.setScissorTest(false);
    var scene = new T.Scene();
    scene.fog = new T.Fog(0xd5f0ff, 45, 150);
    var cams = [new T.PerspectiveCamera(58, 16 / 9, 0.1, 400), new T.PerspectiveCamera(66, 8 / 9, 0.1, 400)];
    var hemi = new T.HemisphereLight(0xffffff, 0x8a7d6a, 1.7), sun = new T.DirectionalLight(0xffffff, 2.1);
    sun.position.set(30, 60, 20);
    scene.add(hemi, sun, sun.target);
    var LIT = new T.MeshLambertMaterial({ vertexColors: true });
    var C = new T.Color(), V = new T.Vector3(), V2 = new T.Vector3(), Q = new T.Quaternion(), E = new T.Euler(), S = new T.Vector3(), MT = new T.Matrix4();
    var F = {}; // reused track frame
    var view = { renderer: renderer, scene: scene, calm: false, software: software };

    /* --------------------------------------------- geometry helpers */
    function part(g, c, x, y, z, rx, ry, rz, s) {
      E.set(rx || 0, ry || 0, rz || 0);
      Q.setFromEuler(E);
      if (s == null) S.set(1, 1, 1); else if (typeof s === 'number') S.set(s, s, s); else S.set(s[0], s[1], s[2]);
      return { g: g, c: c, m: new T.Matrix4().compose(new T.Vector3(x || 0, y || 0, z || 0), Q.clone(), S.clone()) };
    }
    // Cylinder from point a to point b.
    function limb(a, b, r, c, seg) {
      var d = new T.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = d.length();
      var g = new T.CylinderGeometry(r, r, len, seg || 8);
      var q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize());
      return { g: g, c: c, m: new T.Matrix4().compose(new T.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), q, new T.Vector3(1, 1, 1)) };
    }
    // Merges parts {g, c (hex | fn(x,y,z) per vertex | {face: fn}), m} into one coloured geometry.
    function merge(parts) {
      var list = [], n = 0;
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i], g = p.g.index ? p.g.toNonIndexed() : p.g.clone();
        var cnt = g.attributes.position.count, col = new Float32Array(cnt * 3), pos = g.attributes.position;
        if (typeof p.c === 'function') {
          for (var v = 0; v < cnt; v++) { C.set(p.c(pos.getX(v), pos.getY(v), pos.getZ(v))); col[v * 3] = C.r; col[v * 3 + 1] = C.g; col[v * 3 + 2] = C.b; }
        } else if (p.c && p.c.face) {
          for (v = 0; v < cnt; v += 3) {
            C.set(p.c.face((pos.getX(v) + pos.getX(v + 1) + pos.getX(v + 2)) / 3, (pos.getY(v) + pos.getY(v + 1) + pos.getY(v + 2)) / 3, (pos.getZ(v) + pos.getZ(v + 1) + pos.getZ(v + 2)) / 3, v / 3));
            for (var k = 0; k < 3; k++) { col[(v + k) * 3] = C.r; col[(v + k) * 3 + 1] = C.g; col[(v + k) * 3 + 2] = C.b; }
          }
        } else {
          C.set(p.c == null ? 0xffffff : p.c);
          for (v = 0; v < cnt; v++) { col[v * 3] = C.r; col[v * 3 + 1] = C.g; col[v * 3 + 2] = C.b; }
        }
        if (p.m) g.applyMatrix4(p.m);
        list.push({ g: g, col: col });
        n += cnt;
      }
      var P = new Float32Array(n * 3), N = new Float32Array(n * 3), CC = new Float32Array(n * 3), o = 0;
      list.forEach(function (it) {
        P.set(it.g.attributes.position.array, o * 3);
        N.set(it.g.attributes.normal.array, o * 3);
        CC.set(it.col, o * 3);
        o += it.g.attributes.position.count;
        it.g.dispose();
      });
      var out = new T.BufferGeometry();
      out.setAttribute('position', new T.BufferAttribute(P, 3));
      out.setAttribute('normal', new T.BufferAttribute(N, 3));
      out.setAttribute('color', new T.BufferAttribute(CC, 3));
      out.computeBoundingSphere();
      return out;
    }
    // Raw quads (for the track ribbon): verts [x,y,z]*4, colour, normal up.
    function Quads() { this.p = []; this.c = []; }
    Quads.prototype.quad = function (a, b, c, d, hex) {
      C.set(hex);
      var pts = [a, b, c, a, c, d];
      for (var i = 0; i < 6; i++) { this.p.push(pts[i][0], pts[i][1], pts[i][2]); this.c.push(C.r, C.g, C.b); }
    };
    Quads.prototype.geometry = function () {
      var g = new T.BufferGeometry(), n = this.p.length / 3, nor = new Float32Array(n * 3);
      for (var i = 0; i < n; i++) nor[i * 3 + 1] = 1;
      g.setAttribute('position', new T.BufferAttribute(new Float32Array(this.p), 3));
      g.setAttribute('normal', new T.BufferAttribute(nor, 3));
      g.setAttribute('color', new T.BufferAttribute(new Float32Array(this.c), 3));
      g.computeBoundingSphere();
      return g;
    };
    var SPH = new T.SphereGeometry(1, 16, 12), SPH_LO = new T.SphereGeometry(1, 10, 8), CYL = new T.CylinderGeometry(1, 1, 1, 12);
    var CONE = new T.ConeGeometry(1, 1, 12), BOX = new T.BoxGeometry(1, 1, 1), HEMI = new T.SphereGeometry(1, 16, 8, 0, M.PI * 2, 0, M.PI / 2);
    function hash(x, y, z) { var h = M.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453; return h - M.floor(h); }

    /* --------------------------------------------- sky + clouds */
    var skyGeo = new T.SphereGeometry(300, 24, 12), skyCol = new Float32Array(skyGeo.attributes.position.count * 3);
    skyGeo.setAttribute('color', new T.BufferAttribute(skyCol, 3));
    var sky = new T.Mesh(skyGeo, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide, fog: false, depthWrite: false }));
    sky.renderOrder = -1;
    scene.add(sky);
    function paintSky(th) {
      var pos = skyGeo.attributes.position, a = new T.Color(th.sky), b = new T.Color(th.horizon);
      for (var i = 0; i < pos.count; i++) {
        var k = M.max(0, M.min(1, pos.getY(i) / 300 * 1.8));
        C.copy(b).lerp(a, M.pow(k, 0.7));
        skyCol[i * 3] = C.r; skyCol[i * 3 + 1] = C.g; skyCol[i * 3 + 2] = C.b;
      }
      skyGeo.attributes.color.needsUpdate = true;
    }
    var cloudGeo = merge([part(SPH_LO, 0xffffff, 0, 0, 0, 0, 0, 0, [6, 3.2, 4]), part(SPH_LO, 0xffffff, 5, -0.6, 1, 0, 0, 0, [4.4, 2.6, 3.4]),
      part(SPH_LO, 0xffffff, -5, -0.8, 0, 0, 0, 0, [4, 2.2, 3]), part(SPH_LO, 0xf1f7ff, 1, -1.6, 0, 0, 0, 0, [8, 1.2, 4])]);
    var clouds = new T.InstancedMesh(cloudGeo, new T.MeshBasicMaterial({ vertexColors: true, fog: false }), 10);
    scene.add(clouds);

    /* --------------------------------------------- track world */
    var world = null; // { group, track, theme, movers... }
    function tf(tr, s, x, y, out) {
      out = out || [0, 0, 0];
      if (s < 0) { ER.frame(tr, 0, F); F.x -= M.sin(F.th) * s; F.z += M.cos(F.th) * s; }
      else ER.frame(tr, s, F);
      out[0] = F.x + M.cos(F.th) * x; out[1] = y; out[2] = F.z + M.sin(F.th) * x;
      return out;
    }
    function headingAt(tr, s) { return ER.frame(tr, M.max(0, s), F).th; }

    function buildRibbon(tr, th, w) {
      var q = new Quads(), STEP = 2, s0 = -40, s1 = tr.len + 70;
      var strips = [[-5.0, -4.3, 'curb'], [-4.3, -2.2, 't'], [-2.2, -2.1, 'l'], [-2.1, -0.05, 't'], [-0.05, 0.05, 'l'], [0.05, 2.1, 't'], [2.1, 2.2, 'l'], [2.2, 4.3, 't'], [4.3, 5.0, 'curb']];
      var tA = new T.Color(th.track), tB = new T.Color(th.track).multiplyScalar(0.93), tAh = tA.getHex(), tBh = tB.getHex();
      for (var s = s0, idx = 0; s < s1; s += STEP, idx++) {
        for (var k = 0; k < strips.length; k++) {
          var st = strips[k], y = st[2] === 'l' ? 0.035 : st[2] === 'curb' ? 0.045 : 0.03;
          var col = st[2] === 'curb' ? (idx % 2 ? th.curbA : th.curbB) : st[2] === 'l' ? th.line : (M.floor(idx / 2) % 2 ? tAh : tBh);
          q.quad(tf(tr, s, st[0], y), tf(tr, s, st[1], y), tf(tr, s + STEP, st[1], y), tf(tr, s + STEP, st[0], y), col);
        }
        // Low verge under the curbs.
        q.quad(tf(tr, s, -6.2, 0.01), tf(tr, s, -5.0, 0.01), tf(tr, s + STEP, -5.0, 0.01), tf(tr, s + STEP, -6.2, 0.01), th.ground2);
        q.quad(tf(tr, s, 5.0, 0.01), tf(tr, s, 6.2, 0.01), tf(tr, s + STEP, 6.2, 0.01), tf(tr, s + STEP, 5.0, 0.01), th.ground2);
      }
      // Start line and a chequered finish.
      q.quad(tf(tr, -0.3, -4.3, 0.04), tf(tr, -0.3, 4.3, 0.04), tf(tr, 0.3, 4.3, 0.04), tf(tr, 0.3, -4.3, 0.04), 0xffffff);
      for (var row = 0; row < 3; row++) for (var c = 0; c < 12; c++) {
        var x0 = -4.3 + c * (8.6 / 12), x1 = x0 + 8.6 / 12, sa = tr.len - 0.9 + row * 0.6, sb = sa + 0.6;
        q.quad(tf(tr, sa, x0, 0.045), tf(tr, sa, x1, 0.045), tf(tr, sb, x1, 0.045), tf(tr, sb, x0, 0.045), (row + c) % 2 ? 0x222222 : 0xffffff);
      }
      return new T.Mesh(q.geometry(), LIT);
    }

    // Arches at the start, each checkpoint and the finish.
    var FLAGS = [0xff4d4d, 0xffd23f, 0x4cd964, 0x2ea8ff, 0xff6fb5, 0xff9f1c];
    function archParts(tr, s, big, list, w) {
      var th = headingAt(tr, s), h = big ? 5.2 : 4.4, half = 5.4, post = w === 1 ? 0x9a6234 : 0xffffff;
      var A = tf(tr, s, -half, 0), B = tf(tr, s, half, 0);
      list.push(part(CYL, post, A[0], h / 2, A[2], 0, 0, 0, [0.22, h, 0.22]), part(CYL, post, B[0], h / 2, B[2], 0, 0, 0, [0.22, h, 0.22]));
      list.push(part(SPH_LO, FLAGS[1], A[0], h + 0.2, A[2], 0, 0, 0, 0.35), part(SPH_LO, FLAGS[1], B[0], h + 0.2, B[2], 0, 0, 0, 0.35));
      var mid = tf(tr, s, 0, 0);
      var bannerCol = big ? { face: function (x, y) { return (M.floor((x + 6) * 1.6) + M.floor((y + 1) * 1.6)) % 2 ? 0x222222 : 0xffffff; } } : (w === 1 ? 0xd94b3b : w === 2 ? 0x2fb7c4 : 0x2b59c3);
      list.push(part(big ? new T.BoxGeometry(11.4, 1.0, 0.25, 18, 2, 1) : BOX, bannerCol, mid[0], h - 0.3, mid[2], 0, -th, 0, big ? 1 : [11.4, 0.7, 0.2]));
      // Bunting triangles under the banner.
      for (var i = 0; i < 11; i++) {
        var x = -5 + i, p = tf(tr, s, x, 0);
        list.push(part(CONE, FLAGS[i % FLAGS.length], p[0], h - 1.05, p[2], M.PI, -th, 0, [0.32, 0.6, 0.06]));
      }
    }

    // Obstacle models in local space (facing -z, track x along +x).
    function coneParts(w, list, at) {
      var x = at[0], z = at[2], r = at[3];
      if (w === 0) {
        list.push(part(BOX, 0xff7b1a, x, 0.03, z, 0, r, 0, [0.7, 0.06, 0.7]), part(CONE, 0xff8a1f, x, 0.36, z, 0, r, 0, [0.3, 0.66, 0.3]),
          part(CYL, 0xffffff, x, 0.38, z, 0, r, 0, [0.2, 0.1, 0.2]));
      } else if (w === 1) {
        list.push(part(SPH, function (px, py, pz) { return M.abs(M.sin(M.atan2(pz, px) * 4)) > 0.85 ? 0xe06a10 : 0xff8c1a; }, x, 0.32, z, 0, r, 0, [0.42, 0.32, 0.42]),
          part(CYL, 0x4f8a2b, x, 0.68, z, 0.2, r, 0, [0.05, 0.16, 0.05]), part(SPH_LO, 0x5fae3a, x + 0.1, 0.62, z, 0, r, 0, [0.14, 0.04, 0.1]));
      } else {
        list.push(part(CYL, 0xf3c46e, x, 0.25, z, 0, r, 0, [0.42, 0.5, 0.42]), part(CYL, 0xeab65c, x, 0.6, z, 0, r, 0, [0.26, 0.24, 0.26]));
        for (var i = 0; i < 4; i++) list.push(part(CYL, 0xf7cf80, x + M.cos(i * 1.57 + r) * 0.34, 0.6, z + M.sin(i * 1.57 + r) * 0.34, 0, 0, 0, [0.1, 0.22, 0.1]));
        list.push(part(CYL, 0x8a5a33, x, 0.85, z, 0, 0, 0, [0.02, 0.3, 0.02]), part(BOX, 0xff4d4d, x + 0.1, 0.94, z, 0, r, 0, [0.2, 0.12, 0.02]));
      }
    }
    function hurdleParts(tr, it, w, list) {
      var n = it.full ? 9 : 4, th = headingAt(tr, it.s), x0 = it.x - it.hw, x1 = it.x + it.hw;
      if (w === 0) {
        var A = tf(tr, it.s, x0 + 0.15, 0), B = tf(tr, it.s, x1 - 0.15, 0);
        [A, B].forEach(function (P) { list.push(part(BOX, 0xdddddd, P[0], 0.25, P[2], 0, -th, 0, [0.1, 0.5, 0.1]), part(BOX, 0x666666, P[0], 0.03, P[2], 0, -th, 0, [0.12, 0.06, 0.7])); });
        for (var i = 0; i < n; i++) {
          var xa = x0 + (x1 - x0) * i / n, xb = x0 + (x1 - x0) * (i + 1) / n, mid = tf(tr, it.s, (xa + xb) / 2, 0);
          list.push(part(BOX, i % 2 ? 0xffffff : 0xe8343a, mid[0], 0.48, mid[2], 0, -th, 0, [xb - xa, 0.16, 0.08]));
        }
      } else if (w === 1) {
        for (i = 0; i < n; i++) {
          xa = x0 + (x1 - x0) * i / n; xb = x0 + (x1 - x0) * (i + 1) / n; mid = tf(tr, it.s, (xa + xb) / 2, 0);
          list.push(part(new T.BoxGeometry(1, 1, 1, 1, 3, 1), function (px, py) { return py > 0.3 ? 0xf2d16b : py < -0.3 ? 0xd4a842 : 0xe6c25a; }, mid[0], 0.27, mid[2], 0, -th, 0, [(xb - xa) * 0.96, 0.54, 0.5]));
          list.push(part(BOX, 0xb5442f, mid[0], 0.27, mid[2], 0, -th, 0, [0.05, 0.56, 0.52]));
        }
      } else {
        for (i = 0; i < n; i++) {
          xa = x0 + (x1 - x0) * i / n; xb = x0 + (x1 - x0) * (i + 1) / n; mid = tf(tr, it.s, (xa + xb) / 2, 0);
          list.push(part(CYL, i % 2 ? 0xa8774c : 0x96683f, mid[0], 0.24, mid[2], 0, -th, M.PI / 2, [0.24, (xb - xa) * 1.0, 0.24]));
        }
      }
    }
    function puddleParts(tr, it, w, list) {
      var p = tf(tr, it.s, it.x, 0), th = headingAt(tr, it.s);
      var col = w === 1 ? 0x7a4b26 : w === 2 ? 0x37d3e8 : 0x47a8f0, hi = w === 1 ? 0x9a6a3e : 0xbdf0ff;
      list.push(part(new T.CircleGeometry(1, 20), col, p[0], 0.05, p[2], -M.PI / 2, 0, -th, [it.hw, it.hd, 1]));
      list.push(part(new T.CircleGeometry(1, 12), hi, p[0] - 0.3, 0.055, p[2] - 0.2, -M.PI / 2, 0, -th, [it.hw * 0.35, it.hd * 0.2, 1]));
    }

    var critterGeo = [], ballGeo = [];
    function getCritterGeo(w) {
      if (critterGeo[w]) return critterGeo[w];
      var g;
      if (w === 2) {
        g = merge([part(SPH, 0xff5a3c, 0, 0.22, 0, 0, 0, 0, [0.36, 0.18, 0.28]), part(SPH_LO, 0xffffff, -0.1, 0.42, -0.2, 0, 0, 0, 0.07), part(SPH_LO, 0xffffff, 0.1, 0.42, -0.2, 0, 0, 0, 0.07),
          part(SPH_LO, 0x111111, -0.1, 0.43, -0.25, 0, 0, 0, 0.035), part(SPH_LO, 0x111111, 0.1, 0.43, -0.25, 0, 0, 0, 0.035),
          limb([-0.1, 0.3, -0.18], [-0.1, 0.4, -0.2], 0.02, 0xff5a3c), limb([0.1, 0.3, -0.18], [0.1, 0.4, -0.2], 0.02, 0xff5a3c),
          part(SPH_LO, 0xff3a2a, -0.4, 0.26, -0.18, 0, 0, 0.4, [0.14, 0.09, 0.1]), part(SPH_LO, 0xff3a2a, 0.4, 0.26, -0.18, 0, 0, -0.4, [0.14, 0.09, 0.1]),
          limb([-0.3, 0.15, 0], [-0.45, 0, 0.05], 0.025, 0xd8402a), limb([0.3, 0.15, 0], [0.45, 0, 0.05], 0.025, 0xd8402a)]);
      } else {
        var body = w === 0 ? 0xfff8ee : 0xffffff;
        g = merge([part(SPH, body, 0, 0.42, 0.05, 0, 0, 0, [0.26, 0.24, 0.32]), part(SPH, body, 0, 0.7, -0.18, 0, 0, 0, 0.16),
          part(CONE, 0xffa31a, 0, 0.68, -0.36, -M.PI / 2, 0, 0, [0.06, 0.12, 0.05]), part(SPH_LO, 0xff2d2d, 0, 0.88, -0.17, 0, 0, 0, [0.04, 0.08, 0.1]),
          part(SPH_LO, 0xff2d2d, 0, 0.6, -0.3, 0, 0, 0, [0.03, 0.06, 0.03]),
          part(SPH_LO, 0x111111, -0.1, 0.74, -0.28, 0, 0, 0, 0.03), part(SPH_LO, 0x111111, 0.1, 0.74, -0.28, 0, 0, 0, 0.03),
          part(SPH_LO, 0xf3ece0, -0.24, 0.45, 0.06, 0, 0, 0.3, [0.06, 0.14, 0.2]), part(SPH_LO, 0xf3ece0, 0.24, 0.45, 0.06, 0, 0, -0.3, [0.06, 0.14, 0.2]),
          part(SPH_LO, body, 0, 0.5, 0.36, 0.5, 0, 0, [0.12, 0.14, 0.08]),
          limb([-0.08, 0.2, 0.05], [-0.08, 0.0, 0.02], 0.025, 0xffa31a), limb([0.08, 0.2, 0.05], [0.08, 0.0, 0.02], 0.025, 0xffa31a)]);
      }
      critterGeo[w] = g;
      return g;
    }
    function getBallGeo(w) {
      if (ballGeo[w]) return ballGeo[w];
      var ico = new T.IcosahedronGeometry(1, 1), g;
      if (w === 0) {
        var pent = new T.IcosahedronGeometry(1, 0).attributes.position, dirs = [];
        for (var i = 0; i < pent.count; i++) { var d = new T.Vector3(pent.getX(i), pent.getY(i), pent.getZ(i)).normalize(); if (!dirs.some(function (q) { return q.distanceTo(d) < 0.01; })) dirs.push(d); }
        g = merge([part(ico, { face: function (x, y, z) { V.set(x, y, z).normalize(); for (var k = 0; k < dirs.length; k++) if (V.dot(dirs[k]) > 0.93) return 0x222222; return 0xffffff; } }, 0, 0, 0, 0, 0, 0, 0.55)]);
      } else if (w === 1) {
        g = merge([part(new T.CylinderGeometry(1, 1, 1, 14, 1), function (x, y, z) { return M.abs(y) > 0.45 ? 0xd9b25a : 0xeacb6e; }, 0, 0, 0, 0, 0, M.PI / 2, [0.55, 0.9, 0.55])]);
      } else {
        var BB = [0xff4d4d, 0xffffff, 0x2ea8ff, 0xffd23f, 0xffffff, 0x4cd964];
        g = merge([part(new T.SphereGeometry(1, 18, 12), { face: function (x, y, z) { if (M.abs(y) > 0.9) return 0xffffff; var a = (M.atan2(z, x) + M.PI) / (M.PI * 2); return BB[M.floor(a * 6) % 6]; } }, 0, 0, 0, 0, 0, 0, 0.55)]);
      }
      ballGeo[w] = g;
      return g;
    }
    var waterMat = new T.MeshLambertMaterial({ color: 0x8fe3ff, transparent: true, opacity: 0.72, emissive: 0x1c5a80 });
    var waterGeo = new T.CylinderGeometry(0.25, 0.7, 1, 10, 1, true);
    var goldMat = new T.MeshLambertMaterial({ color: 0xffc81a, emissive: 0x7a4a00 });

    // Scenery props per world.
    function treeGeo(c1, c2) {
      return merge([part(CYL, 0x8a5a33, 0, 1.0, 0, 0, 0, 0, [0.22, 2, 0.22]), part(SPH_LO, c1, 0, 2.6, 0, 0, 0, 0, [1.5, 1.4, 1.5]),
        part(SPH_LO, c2, 0.7, 2.2, 0.4, 0, 0, 0, [1.0, 0.9, 1.0]), part(SPH_LO, c2, -0.6, 2.3, -0.3, 0, 0, 0, [0.9, 0.9, 0.9])]);
    }
    function palmGeo() {
      var list = [], x = 0, y = 0;
      for (var i = 0; i < 6; i++) { list.push(part(CYL, i % 2 ? 0xb9874f : 0xa8773f, x, y + 0.45, 0, 0, 0, -0.08 * i, [0.2 - i * 0.012, 0.9, 0.2 - i * 0.012])); x += 0.07 * i; y += 0.88; }
      for (var k = 0; k < 6; k++) { var a = k * 1.047; list.push(part(SPH_LO, k % 2 ? 0x3fbf4a : 0x2fa83c, x + M.cos(a) * 1.1, y - 0.15, M.sin(a) * 1.1, 0, -a, 0.35, [1.3, 0.12, 0.4])); }
      list.push(part(SPH_LO, 0x7a4a22, x, y - 0.3, 0.2, 0, 0, 0, 0.2), part(SPH_LO, 0x7a4a22, x + 0.2, y - 0.35, -0.1, 0, 0, 0, 0.2));
      return merge(list);
    }
    function propSets(w) {
      if (w === 0) {
        return [
          { g: treeGeo(0x4cc35a, 0x3aa84a), n: 60, near: 8, far: 30, s: [0.8, 1.3] },
          { g: merge([part(SPH_LO, 0x52c75e, 0, 0.4, 0, 0, 0, 0, [0.8, 0.6, 0.8]), part(SPH_LO, 0x45b553, 0.6, 0.3, 0, 0, 0, 0, [0.6, 0.5, 0.6]), part(SPH_LO, 0xff7ab8, 0.3, 0.75, 0.2, 0, 0, 0, 0.12), part(SPH_LO, 0xffe14d, -0.3, 0.7, 0.3, 0, 0, 0, 0.12)]), n: 50, near: 6.8, far: 14, s: [0.8, 1.4] },
          { g: merge([part(CYL, 0xffffff, 0, 1.6, 0, 0, 0, 0, [0.06, 3.2, 0.06]), part(BOX, 0xff4d4d, 0.45, 2.8, 0, 0, 0, 0, [0.9, 0.55, 0.04]), part(BOX, 0xffffff, 0.45, 2.8, 0, 0, 0, 0, [0.3, 0.56, 0.05])]), n: 14, near: 6.5, far: 7.2, s: [1, 1] }
        ];
      }
      if (w === 1) {
        return [
          { g: treeGeo(0x5cbf3f, 0x4aa833), n: 40, near: 12, far: 34, s: [0.9, 1.4] },
          { g: merge([part(CYL, 0xf0c95a, 0, 0.7, 0, 0, 0, 0, [1.0, 1.4, 1.0]), part(CONE, 0xe8bd4c, 0, 1.75, 0, 0, 0, 0, [1.05, 0.8, 1.05])]), n: 24, near: 8, far: 24, s: [0.7, 1.2] },
          { g: merge([part(BOX, 0xa8743f, 0, 0.45, 0, 0, 0, 0, [0.14, 0.9, 0.14]), part(BOX, 0xc48a4d, 1, 0.65, 0, 0, 0, 0, [2, 0.12, 0.06]), part(BOX, 0xc48a4d, 1, 0.35, 0, 0, 0, 0, [2, 0.12, 0.06])]), n: 0, fence: true, s: [1, 1] },
          { g: merge([part(CYL, 0x4f8a2b, 0, 0.6, 0, 0, 0, 0, [0.04, 1.2, 0.04]), part(CYL, 0x5a3a1a, 0, 1.25, 0, M.PI / 2, 0, 0, [0.16, 0.06, 0.16]), part(CYL, 0xffd23f, 0, 1.25, 0.02, M.PI / 2, 0, 0, [0.3, 0.03, 0.3])]), n: 70, near: 6.6, far: 10, s: [0.8, 1.3] }
        ];
      }
      return [
        { g: palmGeo(), n: 34, near: 8, far: 26, s: [0.8, 1.2] },
        { g: merge([part(CYL, 0xffffff, 0, 1.1, 0, 0, 0, 0, [0.04, 2.2, 0.04]), part(new T.ConeGeometry(1, 0.5, 10), { face: function (x, y, z) { var a = (M.atan2(z, x) + M.PI) / (M.PI * 2); return M.floor(a * 10) % 2 ? 0xffffff : 0xff5a8a; } }, 0, 2.2, 0, 0, 0, 0, [1.3, 1, 1.3]),
          part(BOX, 0x2ea8ff, 0.6, 0.02, 0.6, 0, 0.4, 0, [0.9, 0.03, 1.7])]), n: 26, near: 7, far: 18, s: [0.9, 1.1] },
        { g: merge([part(SPH_LO, 0x9aa3ad, 0, 0.2, 0, 0, 0, 0, [0.7, 0.45, 0.6]), part(SPH_LO, 0xb3bbc4, 0.5, 0.15, 0.2, 0, 0, 0, [0.4, 0.3, 0.4])]), n: 30, near: 6.6, far: 20, s: [0.7, 1.4] }
      ];
    }
    function landmark(w, list, tr) {
      // A big building near the start, off to the left.
      var p = tf(tr, 10, -22, 0), th = headingAt(tr, 10);
      if (w === 0) {
        list.push(part(BOX, 0xfff1d6, p[0], 4, p[2], 0, -th, 0, [10, 8, 16]), part(BOX, 0xe8553f, p[0], 8.4, p[2], 0, -th, 0, [10.6, 0.8, 16.6]));
        for (var i = 0; i < 4; i++) for (var j = 0; j < 2; j++) { var q = tf(tr, 2 + i * 4, -16.95, 0); list.push(part(BOX, 0x7fd0ff, q[0], 2.4 + j * 3, q[2], 0, -th, 0, [0.1, 1.6, 2])); }
        var dq = tf(tr, 18, -16.95, 0); list.push(part(BOX, 0x2b59c3, dq[0], 1.2, dq[2], 0, -th, 0, [0.12, 2.4, 1.6]));
        var cq = tf(tr, 10, -16.95, 0); list.push(part(CYL, 0xffffff, cq[0], 7, cq[2], 0, -th, M.PI / 2, [0.7, 0.1, 0.7]));
      } else if (w === 1) {
        list.push(part(BOX, 0xd94b3b, p[0], 3.5, p[2], 0, -th, 0, [9, 7, 12]), part(new T.CylinderGeometry(0, 6.4, 3.4, 4, 1), 0x6b3b2a, p[0], 8.7, p[2], 0, -th + M.PI / 4, 0, [1, 1, 1.35]));
        var dd = tf(tr, 10, -17.45, 0); list.push(part(BOX, 0xffffff, dd[0], 2.4, dd[2], 0, -th, 0, [0.12, 4.8, 4.4]), part(BOX, 0xb33a2c, dd[0], 2.4, dd[2], 0, -th, 0, [0.14, 4.2, 3.8]));
        var sil = tf(tr, 0, -28, 0); list.push(part(CYL, 0xe0e0e0, sil[0], 5, sil[2], 0, 0, 0, [2, 10, 2]), part(SPH, 0xc0392b, sil[0], 10, sil[2], 0, 0, 0, [2, 1.4, 2]));
      } else {
        list.push(part(BOX, 0xffe066, p[0], 1.8, p[2], 0, -th, 0, [4, 3.6, 4]), part(new T.CylinderGeometry(0, 3.6, 2, 4, 1), 0xff5a8a, p[0], 4.6, p[2], 0, -th + M.PI / 4, 0, [1, 1, 1]));
        var h2 = tf(tr, 22, -20, 0); list.push(part(BOX, 0x7fe0ff, h2[0], 1.8, h2[2], 0, -th, 0, [4, 3.6, 4]), part(new T.CylinderGeometry(0, 3.6, 2, 4, 1), 0xffffff, h2[0], 4.6, h2[2], 0, -th + M.PI / 4, 0, [1, 1, 1]));
        var lh = tf(tr, 0, 26, 0); list.push(part(CYL, { face: function (x, y) { return M.floor((y + 0.5) * 6) % 2 ? 0xffffff : 0xff4d4d; } }, lh[0], 6, lh[2], 0, 0, 0, [1.4, 12, 1.4]), part(CYL, 0xffe14d, lh[0], 12.6, lh[2], 0, 0, 0, [1.1, 1.2, 1.1]), part(CONE, 0xff4d4d, lh[0], 13.8, lh[2], 0, 0, 0, [1.4, 1.4, 1.4]));
      }
      // Bleachers with fans at the start (right side).
      for (var t = 0; t < 3; t++) {
        var b = tf(tr, 6, 9 + t * 1.2, 0);
        list.push(part(BOX, t % 2 ? 0x2b59c3 : 0x3a6fd8, b[0], 0.4 + t * 0.5, b[2], 0, -th, 0, [1.2, 0.8 + t, 18]));
      }
    }
    // Fans: instanced bobbing blobs on the bleachers and at the finish.
    var fanGeo = merge([part(SPH_LO, 0xffffff, 0, 0.35, 0, 0, 0, 0, [0.3, 0.38, 0.3]), part(SPH_LO, 0xffd9b0, 0, 0.85, 0, 0, 0, 0, 0.22), part(SPH_LO, 0x111111, -0.07, 0.88, -0.19, 0, 0, 0, 0.04), part(SPH_LO, 0x111111, 0.07, 0.88, -0.19, 0, 0, 0, 0.04),
      limb([0.25, 0.5, 0], [0.4, 1.0, 0], 0.06, 0xffffff), limb([-0.25, 0.5, 0], [-0.4, 1.0, 0], 0.06, 0xffffff)]);
    var FANC = [0xff4d4d, 0xffd23f, 0x4cd964, 0x2ea8ff, 0xff6fb5, 0xff9f1c, 0x9b59ff, 0xffffff];

    function clearWorld() {
      if (!world) return;
      scene.remove(world.group);
      world.group.traverse(function (o) { if (o.isMesh && o.geometry && !o.userData.keep) o.geometry.dispose(); });
      world = null;
    }

    view.setTrack = function (index) {
      if (world && world.track.i === index) return;
      clearWorld();
      var tr = ER.track(index), w = tr.world, th = THEMES[w], group = new T.Group();
      world = { track: tr, w: w, theme: th, group: group };
      scene.fog.color.setHex(th.fog);
      paintSky(th);
      sky.material.needsUpdate = true;
      // Ground: centred under the track's bounding box.
      var minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
      for (var i = 0; i <= tr.len; i += 5) { minX = M.min(minX, tr.px[i]); maxX = M.max(maxX, tr.px[i]); minZ = M.min(minZ, tr.pz[i]); maxZ = M.max(maxZ, tr.pz[i]); }
      var cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2, ext = M.max(maxX - minX, maxZ - minZ) / 2 + 60;
      world.center = [cx, cz];
      if (w === 2) {
        var island = new T.Mesh(new T.CircleGeometry(ext + 20, 48), new T.MeshLambertMaterial({ color: th.ground }));
        island.rotation.x = -M.PI / 2; island.position.set(cx, -0.02, cz); group.add(island);
        var sea = new T.Mesh(new T.PlaneGeometry(1400, 1400), new T.MeshLambertMaterial({ color: 0x29b6f6, emissive: 0x0a3f66 }));
        sea.rotation.x = -M.PI / 2; sea.position.set(cx, -0.25, cz); group.add(sea);
        var foam = new T.Mesh(new T.RingGeometry(ext + 19, ext + 24, 48), new T.MeshLambertMaterial({ color: 0xe9fbff }));
        foam.rotation.x = -M.PI / 2; foam.position.set(cx, -0.15, cz); group.add(foam);
        world.sea = sea;
      } else {
        var ground = new T.Mesh(new T.PlaneGeometry(1400, 1400), new T.MeshLambertMaterial({ color: th.ground }));
        ground.rotation.x = -M.PI / 2; ground.position.set(cx, -0.02, cz); group.add(ground);
      }
      group.add(buildRibbon(tr, th, w));
      // Static props: arches, obstacles that never move, landmark buildings.
      var R = ER.rng(500 + index), list = [];
      archParts(tr, 0, false, list, w);
      for (i = 1; i < tr.cps.length; i++) archParts(tr, tr.cps[i], false, list, w);
      archParts(tr, tr.len, true, list, w);
      landmark(w, list, tr);
      var balls = [], critters = [], sprinklers = [];
      tr.items.forEach(function (it) {
        if (it.k === 'cone') { var p = tf(tr, it.s, it.x, 0); coneParts(w, list, [p[0], 0, p[2], -headingAt(tr, it.s) + R() * 6]); }
        else if (it.k === 'hurdle') hurdleParts(tr, it, w, list);
        else if (it.k === 'puddle') puddleParts(tr, it, w, list);
        else if (it.k === 'ball') balls.push(it);
        else if (it.k === 'critter') critters.push(it);
        else if (it.k === 'sprinkler') {
          sprinklers.push(it);
          var sp = tf(tr, it.s, it.x, 0);
          list.push(part(CYL, 0x3a8f3a, sp[0], 0.06, sp[2], 0, 0, 0, [0.45, 0.12, 0.45]), part(CYL, 0x9aa3ad, sp[0], 0.2, sp[2], 0, 0, 0, [0.12, 0.3, 0.12]), part(SPH_LO, 0xd0d6dc, sp[0], 0.38, sp[2], 0, 0, 0, 0.14));
        }
      });
      group.add(new T.Mesh(merge(list), LIT));
      // Scenery along both sides.
      propSets(w).forEach(function (set) {
        var mats = [];
        if (set.fence) {
          for (var s = -30; s < tr.len + 60; s += 2) for (var side = -1; side <= 1; side += 2) mats.push(placeM(tr, s, side * 6.6, 0, -headingAt(tr, s) + M.PI / 2 * 0, 1, true));
        } else {
          var tries = 0;
          while (mats.length < set.n && tries++ < set.n * 8) {
            var ss = -30 + R() * (tr.len + 90), sd = R() < 0.5 ? -1 : 1, off = sd * (set.near + R() * (set.far - set.near));
            var P = tf(tr, ss, off, 0);
            if (clearOfTrack(tr, P[0], P[2], set.near - 0.5)) mats.push(placeM(tr, ss, off, R() * 6.28, 0, set.s[0] + R() * (set.s[1] - set.s[0])));
          }
        }
        if (!mats.length) return;
        var inst = new T.InstancedMesh(set.g, LIT, mats.length);
        inst.userData.keep = true;
        mats.forEach(function (m, k) { inst.setMatrixAt(k, m); });
        inst.instanceMatrix.needsUpdate = true;
        inst.computeBoundingSphere();
        group.add(inst);
      });
      // Fans on the bleachers and beside the finish.
      var fanSpots = [];
      for (i = 0; i < 24; i++) fanSpots.push([6 - 8 + (i % 8) * 2.1, 9 + M.floor(i / 8) * 1.2, 0.8 + M.floor(i / 8) * 1.0]);
      for (i = 0; i < 16; i++) fanSpots.push([tr.len - 14 + (i % 8) * 2.4, (i < 8 ? -1 : 1) * 7.6, 0]);
      var fans = new T.InstancedMesh(fanGeo, new T.MeshLambertMaterial({ vertexColors: true }), fanSpots.length);
      fans.userData.keep = true;
      fanSpots.forEach(function (f, k) { C.setHex(FANC[k % FANC.length]); fans.setColorAt(k, C); });
      world.fans = fans; world.fanSpots = fanSpots.map(function (f, k) { var P = tf(tr, f[0], f[1], f[2]); return { p: P, th: headingAt(tr, f[0]), side: f[1] > 0 ? 1 : -1, ph: k * 1.7 }; });
      group.add(fans);
      // Moving obstacles.
      if (balls.length) { world.balls = new T.InstancedMesh(getBallGeo(w), LIT, balls.length); world.balls.userData.keep = true; world.ballItems = balls; group.add(world.balls); }
      if (critters.length) { world.critters = new T.InstancedMesh(getCritterGeo(w), LIT, critters.length); world.critters.userData.keep = true; world.critterItems = critters; group.add(world.critters); }
      if (sprinklers.length) { world.water = new T.InstancedMesh(waterGeo, waterMat, sprinklers.length); world.water.userData.keep = true; world.sprItems = sprinklers; group.add(world.water); }
      [world.balls, world.critters, world.water].forEach(function (m) { if (m) m.frustumCulled = false; });
      fans.frustumCulled = false;
      // Golden eggs.
      world.gold = new T.InstancedMesh(goldEggGeo, goldMat, M.max(1, tr.gold.length));
      world.gold.userData.keep = true; world.gold.frustumCulled = false;
      group.add(world.gold);
      // Clouds around.
      for (i = 0; i < 10; i++) {
        var a = i / 10 * M.PI * 2 + R();
        MT.compose(V.set(cx + M.cos(a) * (ext + 70), 38 + R() * 25, cz + M.sin(a) * (ext + 70)), Q.identity(), S.set(1.4 + R(), 1.2 + R() * 0.5, 1.4 + R()));
        clouds.setMatrixAt(i, MT);
      }
      clouds.instanceMatrix.needsUpdate = true;
      clouds.computeBoundingSphere();
      sun.position.set(cx + 40, 80, cz + 30); sun.target.position.set(cx, 0, cz);
      scene.add(group);
      splats.forEach(function (sp) { sp.mesh.visible = false; sp.t = -1; });
      clearParticles();
      snapCam = true;
    };
    function placeM(tr, s, x, rot, y, sc) {
      var P = tf(tr, s, x, y || 0);
      return new T.Matrix4().compose(new T.Vector3(P[0], P[1], P[2]), new T.Quaternion().setFromEuler(new T.Euler(0, -headingAt(tr, s) + (rot || 0), 0)), new T.Vector3(sc || 1, sc || 1, sc || 1));
    }
    function clearOfTrack(tr, x, z, min) {
      for (var i = 0; i <= tr.len; i += 4) { var dx = tr.px[i] - x, dz = tr.pz[i] - z; if (dx * dx + dz * dz < min * min) return false; }
      return true;
    }

    /* --------------------------------------------- eggs */
    function eggShape(r) {
      var g = new T.SphereGeometry(1, 16, 12), p = g.attributes.position;
      for (var i = 0; i < p.count; i++) {
        var y = p.getY(i), k = y > 0 ? 1 - 0.2 * y : 1;
        p.setXYZ(i, p.getX(i) * k * r, (y > 0 ? y * 1.3 : y * 1.05) * r, p.getZ(i) * k * r);
      }
      g.computeVertexNormals();
      return g;
    }
    var EGG_R = 0.2, eggBase = eggShape(EGG_R), goldEggGeo = eggShape(0.32);
    var RAINBOW = [0xff4d4d, 0xff9f1c, 0xffd23f, 0x4cd964, 0x2ea8ff, 0x9b59ff];
    var eggGeoCache = {};
    function eggGeo(i) {
      if (eggGeoCache[i]) return eggGeoCache[i];
      var sk = ER.EGGS[i] || ER.EGGS[0], fn;
      if (sk.base === 'rainbow') fn = function (x, y) { return RAINBOW[M.max(0, M.min(5, M.floor((y / EGG_R + 1.05) / 2.4 * 6)))]; };
      else if (sk.spot) fn = function (x, y, z) { return hash(M.round(x * 40), M.round(y * 40), M.round(z * 40)) > 0.72 ? sk.spot : sk.base; };
      else fn = function () { return sk.base; };
      eggGeoCache[i] = merge([{ g: eggBase, c: fn }]);
      return eggGeoCache[i];
    }

    /* --------------------------------------------- runners */
    var SKIN = 0xffcf9f, SKIN2 = [0xffcf9f, 0xe9a877, 0xc68356, 0xffdcb8];
    var rigCache = {};
    function headParts(sk, tone) {
      var hair = sk.hair, cap = sk.capColor, list = [
        part(SPH, tone, 0, 0.38, 0, 0, 0, 0, 0.42),
        part(SPH, 0xffffff, -0.15, 0.43, -0.33, 0, 0, 0, [0.12, 0.14, 0.08]), part(SPH, 0xffffff, 0.15, 0.43, -0.33, 0, 0, 0, [0.12, 0.14, 0.08]),
        part(SPH_LO, 0x1b1b2a, -0.15, 0.42, -0.4, 0, 0, 0, [0.065, 0.08, 0.04]), part(SPH_LO, 0x1b1b2a, 0.15, 0.42, -0.4, 0, 0, 0, [0.065, 0.08, 0.04]),
        part(SPH_LO, 0xffffff, -0.13, 0.45, -0.43, 0, 0, 0, 0.02), part(SPH_LO, 0xffffff, 0.17, 0.45, -0.43, 0, 0, 0, 0.02),
        part(SPH_LO, 0xff8fa3, -0.27, 0.3, -0.3, 0, 0, 0, [0.07, 0.05, 0.04]), part(SPH_LO, 0xff8fa3, 0.27, 0.3, -0.3, 0, 0, 0, [0.07, 0.05, 0.04]),
        part(new T.TorusGeometry(0.08, 0.022, 6, 10, M.PI), 0x8a2c2c, 0, 0.27, -0.39, 0, 0, M.PI),
        part(SPH_LO, tone, -0.41, 0.36, 0, 0, 0, 0, [0.07, 0.1, 0.08]), part(SPH_LO, tone, 0.41, 0.36, 0, 0, 0, 0, [0.07, 0.1, 0.08])
      ];
      var top = part(HEMI, hair, 0, 0.42, 0.03, -0.25, 0, 0, [0.45, 0.42, 0.45]);
      switch (sk.hat) {
        case 'cap': list.push(part(HEMI, cap, 0, 0.47, 0.02, -0.1, 0, 0, [0.45, 0.38, 0.45]), part(CYL, cap, 0, 0.55, -0.36, 0.12, 0, 0, [0.28, 0.04, 0.22]), part(SPH_LO, 0xffffff, 0, 0.85, 0.02, 0, 0, 0, 0.06)); break;
        case 'crest': list.push(part(HEMI, hair, 0, 0.44, 0.02, -0.15, 0, 0, [0.46, 0.44, 0.46]), part(SPH_LO, cap, 0, 0.92, -0.05, 0, 0, 0, [0.06, 0.12, 0.1]), part(SPH_LO, cap, 0, 0.88, 0.1, 0, 0, 0, [0.06, 0.1, 0.09]), part(SPH_LO, cap, 0, 0.84, -0.18, 0, 0, 0, [0.06, 0.09, 0.08])); break;
        case 'band': list.push(top, part(new T.TorusGeometry(0.42, 0.05, 6, 20), cap, 0, 0.55, 0, M.PI / 2 - 0.15, 0, 0), part(SPH_LO, 0xff4d4d, 0, 0.62, 0.42, 0, 0, 0, [0.08, 0.06, 0.06])); break;
        case 'spikes': list.push(part(HEMI, hair, 0, 0.44, 0.02, -0.15, 0, 0, [0.46, 0.44, 0.46])); for (var i = 0; i < 4; i++) list.push(part(CONE, cap, 0, 0.88 - i * 0.04, -0.2 + i * 0.17, -0.3 + i * 0.25, 0, 0, [0.07, 0.18, 0.05])); break;
        case 'bun': list.push(top, part(SPH, hair, 0, 0.82, 0.18, 0, 0, 0, 0.16), part(new T.TorusGeometry(0.1, 0.03, 6, 12), cap, 0, 0.75, 0.15, 1.2, 0, 0)); break;
        case 'ears': list.push(top, part(SPH, hair, -0.16, 1.0, 0.05, 0, 0, 0.2, [0.09, 0.3, 0.06]), part(SPH, hair, 0.16, 1.0, 0.05, 0, 0, -0.2, [0.09, 0.3, 0.06]), part(SPH_LO, cap, -0.16, 1.0, 0.0, 0, 0, 0.2, [0.05, 0.22, 0.03]), part(SPH_LO, cap, 0.16, 1.0, 0.0, 0, 0, -0.2, [0.05, 0.22, 0.03])); break;
        case 'helmet': list.push(part(HEMI, 0xffffff, 0, 0.36, 0.06, -0.5, 0, 0, [0.52, 0.52, 0.52]), part(new T.TorusGeometry(0.47, 0.05, 6, 20), 0xc9d3e0, 0, 0.36, 0.0, M.PI / 2 + 0.5, 0, 0), part(CYL, 0x9aa3ad, 0.25, 0.92, 0.1, 0, 0, -0.3, [0.02, 0.25, 0.02]), part(SPH_LO, cap, 0.3, 1.05, 0.1, 0, 0, 0, 0.07)); break;
        case 'crown': list.push(top); for (var c = 0; c < 6; c++) { var a = c * 1.047; list.push(part(CONE, cap, M.cos(a) * 0.24, 0.92, M.sin(a) * 0.24 + 0.03, 0, 0, 0, [0.07, 0.18, 0.07])); } list.push(part(CYL, cap, 0, 0.82, 0.03, 0, 0, 0, [0.27, 0.1, 0.27]), part(SPH_LO, 0xff4d4d, 0, 0.82, -0.25, 0, 0, 0, 0.05)); break;
        default: list.push(top);
      }
      return list;
    }
    function rigGeos(skinIndex, toneIndex) {
      var key = skinIndex + ':' + toneIndex;
      if (rigCache[key]) return rigCache[key];
      var sk = ER.RUNNERS[skinIndex] || ER.RUNNERS[0], tone = SKIN2[toneIndex % SKIN2.length];
      var g = {
        torso: merge([part(SPH, sk.shirt, 0, 0.95, 0, 0, 0, 0, [0.38, 0.42, 0.33]), part(CYL, sk.shorts, 0, 0.62, 0, 0, 0, 0, [0.34, 0.26, 0.3]),
          part(BOX, 0xffffff, 0, 0.98, -0.31, -0.15, 0, 0, [0.28, 0.22, 0.03]), part(CYL, sk.shorts, 0, 0.98, -0.33, M.PI / 2 - 0.15, 0, 0, [0.06, 0.02, 0.06]),
          part(CYL, tone, 0, 1.3, 0, 0, 0, 0, [0.12, 0.14, 0.12])]),
        head: merge(headParts(sk, tone)),
        leg: merge([limb([0, 0, 0], [0, -0.4, 0], 0.1, tone), part(CYL, 0xffffff, 0, -0.38, 0, 0, 0, 0, [0.105, 0.08, 0.105]), part(SPH_LO, sk.shorts === 0xffffff ? 0xff4d4d : 0xffffff, 0, -0.47, -0.07, 0, 0, 0, [0.13, 0.09, 0.2]),
          part(BOX, 0x333333, 0, -0.545, -0.05, 0, 0, 0, [0.22, 0.03, 0.36])]),
        arm: merge([limb([0, 0, 0], [0, -0.38, 0], 0.085, sk.shirt), part(SPH_LO, tone, 0, -0.42, 0, 0, 0, 0, 0.1)]),
        // Spoon arm in the spoon group's space (group at the chest, in front of the body).
        spoon: merge([limb([0.3, 0.06, 0.28], [0.08, -0.04, -0.2], 0.085, sk.shirt), part(SPH_LO, tone, 0.06, -0.04, -0.24, 0, 0, 0, 0.1),
          limb([0.05, -0.03, -0.28], [0, 0.0, -0.58], 0.028, 0xc9d3e0), part(SPH, 0xdde4ee, 0, 0.0, -0.72, 0, 0, 0, [0.24, 0.07, 0.24]), part(SPH_LO, 0xaab4c2, 0, 0.035, -0.72, 0, 0, 0, [0.19, 0.03, 0.19])])
      };
      rigCache[key] = g;
      return g;
    }
    function makeRig() {
      var root = new T.Group(), body = new T.Group();
      root.add(body);
      var r = { root: root, body: body, skin: -1, egg: -1, eggVis: true, pop: 1, land: 0 };
      r.torso = new T.Mesh(undefined, LIT); body.add(r.torso);
      r.head = new T.Mesh(undefined, LIT); r.head.position.set(0, 1.25, 0); body.add(r.head);
      r.legL = new T.Mesh(undefined, LIT); r.legL.position.set(-0.15, 0.58, 0); body.add(r.legL);
      r.legR = new T.Mesh(undefined, LIT); r.legR.position.set(0.15, 0.58, 0); body.add(r.legR);
      r.arm = new T.Mesh(undefined, LIT); r.arm.position.set(-0.4, 1.12, 0); body.add(r.arm);
      r.spoonG = new T.Group(); r.spoonG.position.set(0.2, 1.04, -0.3); r.spoonG.rotation.y = -0.5; body.add(r.spoonG);
      r.spoon = new T.Mesh(undefined, LIT); r.spoonG.add(r.spoon);
      r.eggM = new T.Mesh(undefined, LIT); r.eggM.position.set(0, 0.06 + EGG_R * 0.9, -0.72); r.spoonG.add(r.eggM);
      r.fly = new T.Mesh(undefined, LIT); r.fly.visible = false; scene.add(r.fly);
      r.flyV = new T.Vector3(); r.flyT = -1;
      scene.add(root);
      return r;
    }
    function dress(rig, skin, eggSkin, tone) {
      if (rig.skin !== skin || rig.tone !== tone) {
        var g = rigGeos(skin, tone);
        rig.torso.geometry = g.torso; rig.head.geometry = g.head; rig.legL.geometry = g.leg; rig.legR.geometry = g.leg; rig.arm.geometry = g.arm; rig.spoon.geometry = g.spoon;
        rig.skin = skin; rig.tone = tone;
      }
      if (rig.egg !== eggSkin) { rig.eggM.geometry = eggGeo(eggSkin); rig.fly.geometry = rig.eggM.geometry; rig.egg = eggSkin; }
    }
    var rigs = [makeRig(), makeRig(), makeRig(), makeRig()];
    // Who runs: [{ skin, egg, tone }] (players first).
    view.setRunners = function (list) {
      for (var i = 0; i < rigs.length; i++) {
        var on = i < list.length;
        rigs[i].root.visible = on;
        if (on) { dress(rigs[i], list[i].skin, list[i].egg || 0, list[i].tone || 0); rigs[i].eggM.visible = true; rigs[i].fly.visible = false; rigs[i].flyT = -1; rigs[i].pop = 1; }
        else rigs[i].fly.visible = false;
      }
      view.count = list.length;
    };

    /* --------------------------------------------- shadows */
    var shadowMat = new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false });
    var shadows = new T.InstancedMesh(new T.CircleGeometry(0.5, 16).rotateX(-M.PI / 2), shadowMat, 48);
    shadows.frustumCulled = false; shadows.renderOrder = 1;
    scene.add(shadows);
    var nShadow = 0;
    function shadowAt(x, z, size, alpha) {
      if (nShadow >= 48) return;
      MT.compose(V.set(x, 0.06, z), Q.identity(), S.set(size, 1, size * (alpha || 1)));
      shadows.setMatrixAt(nShadow++, MT);
    }

    /* --------------------------------------------- particles */
    var PMAX = software ? 90 : 180, parts = [], pLive = 0;
    var pMesh = new T.InstancedMesh(new T.IcosahedronGeometry(1, 0), new T.MeshLambertMaterial({ color: 0xffffff }), PMAX);
    pMesh.frustumCulled = false; pMesh.count = 0;
    for (var pi = 0; pi < PMAX; pi++) { parts.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, size: 0.1, g: 9, flat: false }); pMesh.setColorAt(pi, C.setHex(0xffffff)); }
    scene.add(pMesh);
    function clearParticles() { pLive = 0; pMesh.count = 0; }
    function emitP(x, y, z, n, o) {
      if (view.calm) return;
      for (var i = 0; i < n && pLive < PMAX; i++) {
        var p = parts[pLive], a = M.random() * M.PI * 2, sp = (o.speed || 3) * (0.4 + M.random() * 0.6), up = o.up == null ? 3 : o.up;
        p.x = x + (M.random() - 0.5) * (o.spread || 0.2); p.y = y; p.z = z + (M.random() - 0.5) * (o.spread || 0.2);
        p.vx = M.cos(a) * sp + (o.vx || 0); p.vz = M.sin(a) * sp + (o.vz || 0); p.vy = up * (0.5 + M.random() * 0.8);
        p.life = p.max = (o.life || 0.8) * (0.6 + M.random() * 0.5); p.size = (o.size || 0.1) * (0.6 + M.random() * 0.8); p.g = o.g == null ? 12 : o.g;
        var cols = o.colors; pMesh.setColorAt(pLive, C.setHex(cols ? cols[M.floor(M.random() * cols.length)] : o.color || 0xffffff));
        pLive++;
      }
      pMesh.instanceColor.needsUpdate = true;
    }
    function stepParticles(dt) {
      for (var i = 0; i < pLive; i++) {
        var p = parts[i];
        p.life -= dt;
        if (p.life <= 0) {
          pLive--;
          if (i !== pLive) {
            var last = parts[pLive]; parts[pLive] = p; parts[i] = last;
            pMesh.getColorAt(pLive, C); pMesh.setColorAt(i, C);
            pMesh.instanceColor.needsUpdate = true;
            i--;
          }
          continue;
        }
        p.vy -= p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.y < 0.05) { p.y = 0.05; p.vy *= -0.3; p.vx *= 0.7; p.vz *= 0.7; }
      }
      for (i = 0; i < pLive; i++) {
        p = parts[i];
        var k = M.min(1, p.life / p.max * 2.5) * p.size;
        MT.compose(V.set(p.x, p.y, p.z), Q.setFromEuler(E.set(p.life * 5, p.life * 3, 0)), S.set(k, k, k));
        pMesh.setMatrixAt(i, MT);
      }
      pMesh.count = pLive;
      pMesh.instanceMatrix.needsUpdate = true;
    }

    /* --------------------------------------------- splats */
    var splatGeo = merge([part(new T.CircleGeometry(1, 14), function (x, y) { return 0xffffff; }, 0, 0, 0, -M.PI / 2, 0, 0, [0.7, 0.55, 1]),
      part(new T.CircleGeometry(1, 10), 0xfff6e0, 0.45, 0.002, 0.25, -M.PI / 2, 0, 0, [0.28, 0.2, 1]), part(new T.CircleGeometry(1, 10), 0xfff6e0, -0.5, 0.002, -0.2, -M.PI / 2, 0, 0, [0.24, 0.18, 1]),
      part(new T.CircleGeometry(1, 16), 0xffb000, 0.05, 0.006, 0, -M.PI / 2, 0, 0, [0.3, 0.3, 1]), part(new T.CircleGeometry(1, 8), 0xffe27a, 0.0, 0.008, -0.08, -M.PI / 2, 0, 0, [0.1, 0.08, 1]),
      part(CONE, 0xffffff, 0.35, 0.08, -0.25, 0.3, 0, 0.6, [0.08, 0.16, 0.06]), part(CONE, 0xffffff, -0.3, 0.07, 0.3, -0.4, 0, -0.5, [0.07, 0.14, 0.06])]);
    var splats = [];
    for (var si = 0; si < 6; si++) { var sm = new T.Mesh(splatGeo, LIT); sm.visible = false; scene.add(sm); splats.push({ mesh: sm, t: -1 }); }
    var splatNext = 0;
    function splatAt(x, z) {
      var sp = splats[splatNext++ % splats.length];
      sp.mesh.position.set(x, 0.06, z); sp.mesh.rotation.y = M.random() * 6.28; sp.mesh.visible = true; sp.t = 0;
    }

    /* --------------------------------------------- cameras */
    var camPos = [new T.Vector3(), new T.Vector3()], camLook = [new T.Vector3(), new T.Vector3()], snapCam = true, shake = 0;
    var wantP = new T.Vector3(), wantL = new T.Vector3(), tmp = [0, 0, 0];
    function chase(k, r, dt, intro) {
      var tr = world.track, th = headingAt(tr, r.s), fx = M.sin(th), fz = -M.cos(th);
      tf(tr, r.s, r.x * 0.6, 0, tmp);
      var back = 5.0, up = 2.75;
      wantP.set(tmp[0] - fx * back, up + r.y * 0.4, tmp[2] - fz * back);
      tf(tr, r.s + 5, r.x * 0.7, 0, tmp);
      wantL.set(tmp[0], 1.05 + r.y * 0.3, tmp[2]);
      if (intro != null && intro > 0) {
        // Countdown swoop: from in front of the runner, round its side, to behind it.
        var a = intro * M.PI, rp = tf(tr, r.s, r.x, 0, [0, 0, 0]), rx = M.cos(th), rz = M.sin(th);
        wantP.set(rp[0] - fx * M.cos(a) * back + rx * M.sin(a) * 4.5, 1.7 + (up - 1.7) * (1 - M.sin(a / 2)), rp[2] - fz * M.cos(a) * back + rz * M.sin(a) * 4.5);
        V2.set(rp[0], 1.1, rp[2]);
        wantL.lerp(V2, M.min(1, intro * 1.5));
        snapCam = true;
      }
      var kk = snapCam ? 1 : 1 - M.exp(-dt * 6);
      camPos[k].lerp(wantP, kk); camLook[k].lerp(wantL, kk);
    }
    // Menu shots: the camera stands in front of the runner (angle a0 off the track line) and sways a little.
    function orbit(k, r, t, dt, rad, h, a0, sway, lookY) {
      var tr = world.track, a = a0 + M.sin(t * 0.35) * sway;
      var P = tf(tr, r.s + M.cos(a) * rad, r.x + M.sin(a) * rad, h, tmp);
      wantP.set(P[0], h, P[2]);
      P = tf(tr, r.s, r.x, 0, tmp);
      wantL.set(P[0], lookY, P[2]);
      var kk = snapCam ? 1 : 1 - M.exp(-dt * 3);
      camPos[k].lerp(wantP, kk); camLook[k].lerp(wantL, kk);
    }
    function applyCam(k) {
      var c = cams[k];
      c.position.copy(camPos[k]);
      if (shake > 0 && !view.calm) { c.position.x += (M.random() - 0.5) * shake * 0.5; c.position.y += (M.random() - 0.5) * shake * 0.5; }
      c.lookAt(camLook[k]);
    }

    /* --------------------------------------------- per-frame update */
    var split = false, W = 1280, H = 720;
    // o: { mode: 'title'|'play'|'result'|'skins', dt, t, race, follow: [i] or [i, j], intro (0..1 while counting down) }
    view.update = function (o) {
      if (!world) return;
      var dt = o.dt, t = o.t, race = o.race, tr = world.track;
      split = !!(o.follow && o.follow.length > 1);
      shake = M.max(0, shake - dt * 2.2);
      nShadow = 0;
      // Runners.
      for (var i = 0; i < view.count; i++) poseRunner(rigs[i], race.runners[i], race, dt, t, o.mode);
      // Moving obstacles.
      var rt = race.phase === 'count' ? 0 : race.t;
      if (world.balls) {
        world.ballItems.forEach(function (it, k) {
          var x = ER.itemX(it, rt), P = tf(tr, it.s, x, 0.55, tmp), th = headingAt(tr, it.s);
          MT.compose(V.set(P[0], P[1], P[2]), Q.setFromEuler(E.set(0, -th, -x / 0.55, 'YXZ')), S.set(1, 1, 1));
          E.order = 'XYZ';
          world.balls.setMatrixAt(k, MT);
          shadowAt(P[0], P[2], 1.1);
        });
        world.balls.instanceMatrix.needsUpdate = true;
      }
      if (world.critters) {
        world.critterItems.forEach(function (it, k) {
          var x = ER.itemX(it, rt), dir = ER.critterDir(it, rt), P = tf(tr, it.s, x, M.abs(M.sin(rt * 9 + it.ph)) * 0.08, tmp), th = headingAt(tr, it.s);
          MT.compose(V.set(P[0], P[1], P[2]), Q.setFromEuler(E.set(0, -th - dir * M.PI / 2, M.sin(rt * 9 + it.ph) * 0.12)), S.set(1, 1, 1));
          world.critters.setMatrixAt(k, MT);
          shadowAt(P[0], P[2], 0.7);
        });
        world.critters.instanceMatrix.needsUpdate = true;
      }
      if (world.water) {
        world.sprItems.forEach(function (it, k) {
          var on = ER.sprinklerOn(it, rt), P = tf(tr, it.s, it.x, 0, tmp);
          var hgt = on ? 2.4 + M.sin(t * 20 + k) * 0.15 : 0.001;
          MT.compose(V.set(P[0], 0.35 + hgt / 2, P[2]), Q.identity(), S.set(on ? 1 : 0.001, hgt, on ? 1 : 0.001));
          world.water.setMatrixAt(k, MT);
          if (on && M.random() < dt * 30) emitP(P[0], 2.6, P[2], 1, { speed: 2.2, up: 1, colors: [0xbdf0ff, 0xffffff], size: 0.07, life: 0.7 });
        });
        world.water.instanceMatrix.needsUpdate = true;
      }
      // Golden eggs.
      tr.gold.forEach(function (g, k) {
        var taken = race.goldTaken[k] >= 0, P = tf(tr, g.s, g.x, 1.0 + g.need * 1.8 + M.sin(t * 3 + k) * 0.12, tmp);
        MT.compose(V.set(P[0], P[1], P[2]), Q.setFromEuler(E.set(0, t * 2.4 + k, 0.25)), S.setScalar(taken ? 0.0001 : 1));
        world.gold.setMatrixAt(k, MT);
        if (!taken) { shadowAt(P[0], P[2], 0.6); if (M.random() < dt * 3) emitP(P[0], P[1] + 0.2, P[2], 1, { speed: 0.8, up: 1.5, g: 1, color: 0xfff2a8, size: 0.06, life: 0.6 }); }
      });
      world.gold.instanceMatrix.needsUpdate = true;
      // Fans cheer (harder near the end of the race).
      var cheer = o.mode === 'result' || (race.over) ? 1 : 0.35;
      world.fanSpots.forEach(function (f, k) {
        var j = M.abs(M.sin(t * (4 + cheer * 4) + f.ph)) * 0.35 * cheer;
        MT.compose(V.set(f.p[0], f.p[1] + j, f.p[2]), Q.setFromEuler(E.set(0, -f.th + (f.side > 0 ? -M.PI / 2 : M.PI / 2), 0)), S.set(1, 1, 1));
        world.fans.setMatrixAt(k, MT);
      });
      world.fans.instanceMatrix.needsUpdate = true;
      if (world.sea) world.sea.position.y = -0.25 + M.sin(t * 0.8) * 0.06;
      // Splats fade by shrinking after a while.
      splats.forEach(function (sp) {
        if (sp.t < 0) return;
        sp.t += dt;
        var k = sp.t < 0.15 ? sp.t / 0.15 : sp.t > 7 ? M.max(0, 1 - (sp.t - 7)) : 1;
        sp.mesh.scale.setScalar(M.max(0.001, k * 1.1));
        if (sp.t > 8) { sp.mesh.visible = false; sp.t = -1; }
      });
      stepParticles(dt);
      shadows.count = nShadow;
      shadows.instanceMatrix.needsUpdate = true;
      // Cameras.
      var f0 = race.runners[(o.follow && o.follow[0]) || 0];
      if (o.mode === 'skins') orbit(0, f0, t, dt, 3.4, 1.5, -0.45, 0.25, 0.62);
      else if (o.mode === 'title') orbit(0, f0, t, dt, 6.4, 2.3, 0.55, 0.3, 1.25);
      else if (o.mode === 'result') orbit(0, f0, t, dt, 4.2, 1.9, 0.5, 0.5, 1.0);
      else {
        chase(0, f0, dt, o.intro);
        if (split) chase(1, race.runners[o.follow[1]], dt, o.intro);
      }
      snapCam = false;
      applyCam(0);
      if (split) applyCam(1);
    };

    function poseRunner(rig, r, race, dt, t, mode) {
      var tr = world.track, P = tf(tr, r.s, r.x, 0, tmp), th = headingAt(tr, r.s);
      rig.root.position.set(P[0], r.y, P[2]);
      rig.root.rotation.y = -th;
      var moving = r.v > 0.5 && mode !== 'title' && mode !== 'skins', ph = r.phase, sw = moving ? M.min(1, r.v / 8) : 0;
      var idle = M.sin(t * 3 + r.i) * 0.5 + 0.5;
      var lean = r.lean || 0;
      // Body: bob, lean into the sideways run, squash on landing.
      rig.land = M.max(0, rig.land - dt * 5);
      var bob = moving ? M.abs(M.sin(ph)) * 0.09 : idle * 0.03;
      var sq = 1 - rig.land * 0.18 + (r.air ? 0.06 : 0);
      rig.body.position.y = bob;
      rig.body.scale.set(1 + (1 - sq) * 0.6, sq, 1 + (1 - sq) * 0.6);
      rig.body.rotation.z = -lean * 0.22;
      rig.body.rotation.x = r.stun > 0 ? -0.35 : moving ? -0.08 - (r.v > 10 ? 0.06 : 0) : 0;
      var celebrate = r.finished || (mode === 'result' && r.human);
      // Legs and the free arm.
      var la = moving ? M.sin(ph) * 0.9 * sw : 0;
      if (r.air) la = 0.6;
      rig.legL.rotation.x = la; rig.legR.rotation.x = r.air ? -0.4 : -la;
      var shaky = M.min(1, M.max(0, (M.abs(r.e) - 0.35) / 0.5));
      if (r.state === 'splat' || celebrate) {
        rig.arm.rotation.set(0, 0, -2.6 + M.sin(t * 12) * 0.25);
      } else {
        rig.arm.rotation.x = -la * 0.8;
        rig.arm.rotation.z = -0.2 - shaky * (1.2 + M.sin(t * 22) * 0.5);
      }
      // Head: looks a bit towards the egg, shakes when it splats.
      rig.head.rotation.y = r.state === 'splat' ? M.sin(t * 14) * 0.5 : -r.e * 0.15;
      rig.head.rotation.z = lean * 0.12 + (celebrate ? M.sin(t * 6) * 0.15 : 0);
      rig.head.rotation.x = r.state === 'splat' ? 0.25 : 0.05 + shaky * 0.2;
      // Spoon tilts with the lean; the egg rolls with e.
      rig.spoonG.rotation.z = -lean * 0.3 + (celebrate ? 0 : M.sin(t * 7 + r.i) * 0.02 * sw);
      rig.spoonG.rotation.x = celebrate ? -0.6 : 0;
      rig.spoonG.position.y = 1.04 + (celebrate ? 0.35 : 0);
      var e = mode === 'title' || mode === 'skins' ? M.sin(t * 2.1 + r.i) * 0.25 : r.e;
      rig.pop = M.min(1, rig.pop + dt * 3);
      var popS = rig.pop < 1 ? 1 + M.sin(rig.pop * M.PI) * 0.5 : 1;
      rig.eggM.position.x = e * 0.16;
      rig.eggM.rotation.z = -e * 0.9;
      rig.eggM.rotation.x = M.sin(t * 9 + r.ph) * 0.06 * (0.3 + M.abs(e));
      rig.eggM.scale.setScalar(popS * (rig.pop < 0.05 ? 0.05 : 1));
      rig.eggM.visible = r.state !== 'splat' && rig.flyT < 0;
      // Blink while protected after a respawn.
      rig.root.visible = !(r.ghost > 0 && M.floor(t * 12) % 2);
      if (mode === 'skins' && r.i !== 0) rig.root.visible = false;
      if (!(mode === 'skins' && r.i !== 0)) shadowAt(P[0], P[2], 1.0 - M.min(0.5, r.y * 0.3));
      // A flying egg after a drop.
      if (rig.flyT >= 0) {
        rig.flyT += dt;
        rig.flyV.y -= 16 * dt;
        rig.fly.position.addScaledVector(rig.flyV, dt);
        rig.fly.rotation.x += dt * 9; rig.fly.rotation.z += dt * 6;
        if (rig.fly.position.y <= 0.12) {
          rig.fly.visible = false; rig.flyT = -1;
          splatAt(rig.fly.position.x, rig.fly.position.z);
          emitP(rig.fly.position.x, 0.2, rig.fly.position.z, 16, { speed: 3, up: 4, colors: [0xffffff, 0xfff3df, 0xffb000, 0xffd23f], size: 0.09, life: 0.8 });
          if (view.onSplat) view.onSplat(r.i);
        }
      }
      // Dust from running feet.
      if (moving && !r.air && r.v > 7 && M.random() < dt * 8 && pLive < PMAX - 20) emitP(P[0], 0.08, P[2], 1, { speed: 0.5, up: 0.5, g: 0, color: world.w === 0 ? 0xffc7b5 : 0xe8cf9e, size: 0.07, life: 0.3 });
    }

    /* --------------------------------------------- events */
    view.event = function (e, race) {
      if (!world) return;
      var r = e.r != null ? race.runners[e.r] : null, rig = r ? rigs[e.r] : null, tr = world.track;
      switch (e.t) {
        case 'drop':
          if (!rig) break;
          rig.eggM.getWorldPosition(V);
          rig.fly.position.copy(V); rig.fly.visible = true; rig.flyT = 0;
          var th = headingAt(tr, r.s);
          rig.flyV.set(M.cos(th) * e.side * 2.2 + M.sin(th) * r.v * 0.4, 4.2, M.sin(th) * e.side * 2.2 - M.cos(th) * r.v * 0.4);
          if (r.human) shake = M.max(shake, 0.8);
          break;
        case 'respawn': if (rig) { rig.pop = 0; tf(tr, r.s, r.x, 0, tmp); emitP(tmp[0], 1.4, tmp[2], 10, { speed: 2, up: 2, colors: [0xffffff, 0xffd23f], size: 0.08, life: 0.6 }); } break;
        case 'land': if (rig) { rig.land = 1; tf(tr, r.s, r.x, 0, tmp); emitP(tmp[0], 0.1, tmp[2], 4, { speed: 1.4, up: 0.8, g: 2, color: world.w === 1 ? 0xd6b48a : 0xffffff, size: 0.12, life: 0.4 }); } break;
        case 'hit':
          tf(tr, e.s, e.x, 0, tmp);
          if (e.k === 'critter') emitP(tmp[0], 0.6, tmp[2], 14, { speed: 2.5, up: 3, g: 3, colors: world.w === 2 ? [0xff5a3c, 0xffffff] : [0xffffff, 0xfff3df], size: 0.1, life: 1.1 });
          else emitP(tmp[0], 0.5, tmp[2], 10, { speed: 3, up: 3, colors: [0xffffff, 0xffd23f], size: 0.08, life: 0.5 });
          if (r && r.human) shake = M.max(shake, 0.45);
          break;
        case 'splash': tf(tr, e.s, e.x, 0, tmp); emitP(tmp[0], 0.15, tmp[2], 14, { speed: 2.5, up: 4, colors: world.w === 1 ? [0x7a4b26, 0x9a6a3e] : [0x8fe3ff, 0xffffff], size: 0.09, life: 0.6 }); break;
        case 'gold': var g = tr.gold[e.i]; tf(tr, g.s, g.x, 1.2 + g.need * 1.8, tmp); emitP(tmp[0], tmp[1], tmp[2], 22, { speed: 3.5, up: 3, g: 6, colors: [0xffd23f, 0xfff2a8, 0xffffff], size: 0.09, life: 0.9 }); break;
        case 'cp': if (r && r.human) { tf(tr, tr.cps[e.i], 0, 4, tmp); emitP(tmp[0], tmp[1], tmp[2], 18, { speed: 4, up: 1, g: 5, colors: FLAGS, size: 0.1, life: 1.2, spread: 8 }); } break;
        case 'finish': if (r && r.human) confetti(); break;
      }
    };
    function confetti() {
      var tr = world.track;
      for (var k = 0; k < 3; k++) { tf(tr, tr.len + (k - 1) * 2, (k - 1) * 3, 5, tmp); emitP(tmp[0], tmp[1], tmp[2], 22, { speed: 5, up: 3, g: 4, colors: FLAGS, size: 0.12, life: 2 }); }
    }
    view.confetti = confetti;
    view.burstAt = function (r, kind) {
      var tr = world.track; tf(tr, r.s, r.x, 2.5, tmp);
      emitP(tmp[0], tmp[1], tmp[2], 26, { speed: 4, up: 4, g: 6, colors: kind === 'gold' ? [0xffd23f, 0xfff2a8] : FLAGS, size: 0.11, life: 1.4 });
    };

    /* --------------------------------------------- render, resize, projection */
    view.render = function () {
      if (!world) return;
      var c = renderer.domElement;
      if (!split) {
        renderer.setScissorTest(false);
        renderer.setViewport(0, 0, vw, vh);
        cams[0].aspect = vw / vh; cams[0].fov = 58; cams[0].updateProjectionMatrix();
        renderer.render(scene, cams[0]);
      } else {
        var hw = M.floor(vw / 2);
        renderer.setScissorTest(true);
        for (var k = 0; k < 2; k++) {
          renderer.setViewport(k * hw, 0, hw, vh); renderer.setScissor(k * hw, 0, hw, vh);
          cams[k].aspect = hw / vh; cams[k].fov = 68; cams[k].updateProjectionMatrix();
          renderer.render(scene, cams[k]);
        }
        renderer.setScissorTest(false);
      }
    };
    var vw = 1280, vh = 720;
    view.resize = function (w, h) {
      vw = M.max(1, w); vh = M.max(1, h);
      renderer.setSize(vw, vh, false);
    };
    // A world point (track s, x, height) -> 1280x720 picture coordinates of camera k.
    view.project = function (s, x, y, k) {
      if (!world) return { x: 0, y: 0, behind: true };
      k = k || 0;
      tf(world.track, s, x, y, tmp);
      V.set(tmp[0], tmp[1], tmp[2]).project(cams[k]);
      var half = split ? W / 2 : W;
      return { x: (V.x + 1) / 2 * half + (split ? k * half : 0), y: (1 - V.y) / 2 * H, behind: V.z > 1 };
    };
    view.snap = function () { snapCam = true; };
    view.shake = function (p) { shake = M.max(shake, p); };
    var slow = 0;
    view.frameTime = function (ms) {
      if (ms > 28) slow++; else slow = M.max(0, slow - 0.5);
      if (slow > 90 && ratio > 0.6) { ratio = M.max(0.6, ratio - 0.25); renderer.setPixelRatio(ratio); slow = 0; return true; }
      return false;
    };
    view.info = function () { return renderer.info.render; };
    view.particleCount = function () { return pLive; };
    view.gl = renderer.getContext();
    return view;
  };
})();
