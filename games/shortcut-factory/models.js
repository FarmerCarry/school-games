/* Shortcut Factory: the 3D toy factory (three.js r159, classic script).
 * A fixed camera over the factory floor: the toy machine on the left, the belt, the robot
 * arm with its clipboard bubble, the delivery box with its picture order and Nattout.
 * Toys are instanced (three meshes per kind: body, details, ghost), so the whole factory
 * is about 45 draw calls. The view only reads the engine's world and its events. */
(function () {
  'use strict';
  var SF = window.SF;

  function softwareGL() {
    var gl = null;
    try {
      var c = document.createElement('canvas'), opts = { powerPreference: 'high-performance' };
      gl = c.getContext('webgl2', opts) || c.getContext('webgl', opts);
      if (!gl) return false;
      var name = String(gl.getParameter(gl.RENDERER) || '');
      if (/^webkit webgl$/i.test(name)) {
        var info = gl.getExtension('WEBGL_debug_renderer_info');
        if (info) name = String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL) || '');
      }
      return /swiftshader|llvmpipe|softpipe|software|basic render|\bwarp\b/i.test(name);
    } catch (e) {
      return false;
    } finally {
      try { var lose = gl && gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext(); } catch (e) { /* ignore */ }
    }
  }
  SF.softwareGL = softwareGL;

  // Shared building helpers, filled in by createView (they need THREE).
  var H = SF.art = {};
  H.init = function (T) {
    var V = new T.Vector3(), S = new T.Vector3(), Q = new T.Quaternion(), E = new T.Euler(), M = new T.Matrix4(), C = new T.Color();
    H.G = {
      box: new T.BoxGeometry(1, 1, 1), sph: new T.SphereGeometry(1, 16, 12), cyl: new T.CylinderGeometry(1, 1, 1, 18),
      cone: new T.ConeGeometry(1, 1, 18), cap: new T.CapsuleGeometry(1, 1, 6, 12), tor: new T.TorusGeometry(1, 0.28, 8, 24)
    };
    // P(geometry, colour or null, [x,y,z], [rx,ry,rz], [sx,sy,sz])
    H.P = function (g, c, p, r, s) {
      M.compose(V.set(p[0], p[1], p[2]), Q.setFromEuler(E.set(r ? r[0] : 0, r ? r[1] : 0, r ? r[2] : 0)), S.set(s[0], s[1], s[2]));
      return { g: g, c: c, m: M.clone() };
    };
    // Merges parts into one vertex-coloured geometry (null colour = white, for tinting).
    H.merge = function (parts) {
      var list = parts.map(function (p) { var g = p.g.index ? p.g.toNonIndexed() : p.g.clone(); g.applyMatrix4(p.m); return { g: g, c: p.c }; });
      var n = 0;
      list.forEach(function (p) { n += p.g.attributes.position.count; });
      var pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), o = 0;
      list.forEach(function (p) {
        var a = p.g.attributes, cnt = a.position.count;
        pos.set(a.position.array, o * 3); nor.set(a.normal.array, o * 3);
        C.set(p.c == null ? 0xffffff : p.c);
        for (var i = 0; i < cnt; i++) { col[(o + i) * 3] = C.r; col[(o + i) * 3 + 1] = C.g; col[(o + i) * 3 + 2] = C.b; }
        o += cnt;
        p.g.dispose();
      });
      var g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(pos, 3));
      g.setAttribute('normal', new T.BufferAttribute(nor, 3));
      g.setAttribute('color', new T.BufferAttribute(col, 3));
      g.computeBoundingSphere();
      return g;
    };
    H.canvasTex = function (w, h, draw, repeat) {
      var c = document.createElement('canvas'); c.width = w; c.height = h;
      draw(c.getContext('2d'), w, h);
      var t = new T.CanvasTexture(c);
      if (repeat) t.wrapS = t.wrapT = T.RepeatWrapping;
      t.colorSpace = T.SRGBColorSpace;
      return t;
    };
    // A rounded rectangle panel (w x h, depth d) facing +z.
    H.panel = function (w, h, r, d) {
      var s = new T.Shape(), x = -w / 2, y = -h / 2;
      s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
      s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
      s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
      var g = new T.ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2, curveSegments: 6 });
      g.translate(0, 0, -d / 2);
      return g;
    };
  };

  /* ------------------------------------------------------------ the toys */
  // Each kind: a body (white, tinted per instance), details (fixed colours), front along +x,
  // origin at the bottom centre, about 0.8 tall.
  var INK = 0x262a3d, WHITE = 0xffffff, GLASS = 0xbfeaff, TAN = 0xf6dcb4, ORANGE = 0xff9a1f, STEEL = 0x8e98ae;
  H.toyParts = function (k) {
    var G = H.G, P = H.P, b = [], d = [], R = Math.PI / 2;
    if (k === 0) { // car
      b.push(P(G.box, null, [0, 0.29, 0], null, [0.98, 0.3, 0.62]), P(G.cap, null, [0.47, 0.29, 0], [R, 0, 0], [0.15, 0.32, 0.15]),
        P(G.cap, null, [-0.47, 0.29, 0], [R, 0, 0], [0.15, 0.32, 0.15]), P(G.box, null, [-0.08, 0.55, 0], null, [0.52, 0.26, 0.54]),
        P(G.cyl, null, [-0.08, 0.68, 0], [R, 0, 0], [0.26, 0.54, 0.05]));
      [[0.3, 0.33], [-0.3, 0.33], [0.3, -0.33], [-0.3, -0.33]].forEach(function (p) {
        d.push(P(G.cyl, INK, [p[0], 0.16, p[1]], [R, 0, 0], [0.16, 0.13, 0.16]), P(G.cyl, 0xdfe6f2, [p[0], 0.16, p[1] * 1.12], [R, 0, 0], [0.075, 0.05, 0.075]));
      });
      d.push(P(G.box, GLASS, [0.19, 0.56, 0], null, [0.04, 0.18, 0.46]), P(G.box, GLASS, [-0.08, 0.57, 0.275], null, [0.4, 0.16, 0.02]), P(G.box, GLASS, [-0.08, 0.57, -0.275], null, [0.4, 0.16, 0.02]),
        P(G.sph, 0xfff4a8, [0.6, 0.33, 0.18], null, [0.06, 0.06, 0.06]), P(G.sph, 0xfff4a8, [0.6, 0.33, -0.18], null, [0.06, 0.06, 0.06]));
    } else if (k === 1) { // duck
      b.push(P(G.sph, null, [0, 0.3, 0], null, [0.42, 0.3, 0.34]), P(G.sph, null, [0.2, 0.64, 0], null, [0.23, 0.23, 0.23]),
        P(G.cone, null, [-0.38, 0.45, 0], [0, 0, 1.0], [0.13, 0.26, 0.13]), P(G.sph, null, [-0.04, 0.36, 0.27], [0, 0, -0.3], [0.22, 0.11, 0.08]), P(G.sph, null, [-0.04, 0.36, -0.27], [0, 0, -0.3], [0.22, 0.11, 0.08]));
      d.push(P(G.sph, ORANGE, [0.43, 0.6, 0], null, [0.14, 0.06, 0.1]), P(G.sph, INK, [0.34, 0.71, 0.11], null, [0.055, 0.065, 0.055]), P(G.sph, INK, [0.34, 0.71, -0.11], null, [0.055, 0.065, 0.055]),
        P(G.sph, WHITE, [0.38, 0.73, 0.125], null, [0.02, 0.02, 0.02]), P(G.sph, WHITE, [0.38, 0.73, -0.095], null, [0.02, 0.02, 0.02]),
        P(G.sph, 0xff9ab0, [0.3, 0.6, 0.17], null, [0.05, 0.03, 0.03]), P(G.sph, 0xff9ab0, [0.3, 0.6, -0.17], null, [0.05, 0.03, 0.03]));
    } else if (k === 2) { // robot
      b.push(P(G.box, null, [0, 0.36, 0], null, [0.46, 0.42, 0.42]), P(G.box, null, [0, 0.76, 0], null, [0.44, 0.32, 0.4]));
      d.push(P(G.box, STEEL, [0.08, 0.07, 0.12], null, [0.16, 0.14, 0.14]), P(G.box, STEEL, [0.08, 0.07, -0.12], null, [0.16, 0.14, 0.14]),
        P(G.box, STEEL, [0, 0.57, 0], null, [0.18, 0.06, 0.18]), P(G.cap, STEEL, [0, 0.38, 0.27], null, [0.06, 0.18, 0.06]), P(G.cap, STEEL, [0, 0.38, -0.27], null, [0.06, 0.18, 0.06]),
        P(G.cyl, STEEL, [0, 0.98, 0], null, [0.025, 0.14, 0.025]), P(G.sph, 0xff4b5c, [0, 1.07, 0], null, [0.06, 0.06, 0.06]),
        P(G.box, INK, [0.21, 0.77, 0], null, [0.04, 0.2, 0.32]), P(G.sph, 0x7ef0ff, [0.235, 0.79, 0.08], null, [0.03, 0.055, 0.055]), P(G.sph, 0x7ef0ff, [0.235, 0.79, -0.08], null, [0.03, 0.055, 0.055]),
        P(G.box, 0xffd23f, [0.235, 0.38, 0], null, [0.02, 0.14, 0.2]), P(G.sph, 0xff4b5c, [0.25, 0.4, 0.05], null, [0.02, 0.03, 0.03]));
    } else if (k === 3) { // teddy
      b.push(P(G.sph, null, [0, 0.3, 0], null, [0.29, 0.3, 0.28]), P(G.sph, null, [0.03, 0.7, 0], null, [0.24, 0.23, 0.24]),
        P(G.sph, null, [0, 0.9, 0.17], null, [0.085, 0.085, 0.06]), P(G.sph, null, [0, 0.9, -0.17], null, [0.085, 0.085, 0.06]),
        P(G.sph, null, [0.06, 0.38, 0.28], null, [0.09, 0.13, 0.09]), P(G.sph, null, [0.06, 0.38, -0.28], null, [0.09, 0.13, 0.09]),
        P(G.sph, null, [0.12, 0.07, 0.15], null, [0.11, 0.08, 0.1]), P(G.sph, null, [0.12, 0.07, -0.15], null, [0.11, 0.08, 0.1]));
      d.push(P(G.sph, TAN, [0.23, 0.66, 0], null, [0.08, 0.075, 0.1]), P(G.sph, INK, [0.3, 0.69, 0], null, [0.035, 0.03, 0.04]),
        P(G.sph, INK, [0.22, 0.76, 0.09], null, [0.035, 0.045, 0.035]), P(G.sph, INK, [0.22, 0.76, -0.09], null, [0.035, 0.045, 0.035]),
        P(G.sph, TAN, [0.2, 0.3, 0], null, [0.11, 0.15, 0.15]), P(G.sph, TAN, [0.03, 0.91, 0.2], null, [0.04, 0.05, 0.04]), P(G.sph, TAN, [0.03, 0.91, -0.2], null, [0.04, 0.05, 0.04]));
    } else { // rocket
      b.push(P(G.cyl, null, [0, 0.46, 0], null, [0.2, 0.5, 0.2]), P(G.cone, null, [0, 0.86, 0], null, [0.2, 0.3, 0.2]), P(G.sph, null, [0, 0.21, 0], null, [0.2, 0.06, 0.2]));
      [0, 2.094, 4.189].forEach(function (a) { d.push(P(G.box, WHITE, [Math.cos(a) * 0.24, 0.2, Math.sin(a) * 0.24], [0, -a, 0], [0.18, 0.24, 0.05])); });
      d.push(P(G.cyl, STEEL, [0, 0.12, 0], null, [0.13, 0.12, 0.13]), P(G.cyl, WHITE, [0.17, 0.55, 0], [0, 0, R], [0.09, 0.05, 0.09]),
        P(G.cyl, GLASS, [0.19, 0.55, 0], [0, 0, R], [0.065, 0.04, 0.065]), P(G.sph, WHITE, [0, 1.02, 0], null, [0.04, 0.04, 0.04]));
    }
    return { body: H.merge(b), detail: H.merge(d) };
  };
})();
