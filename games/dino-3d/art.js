/* Dino 3D art: the baby dino, its family, five voxel biomes, obstacles, eggs, fruit,
 * particles and the follow camera, all built in code with three.js.
 * Every model is a list of boxes [x, y0, z, w, h, d, colour, glow] (in decimetres)
 * merged into one vertex-coloured geometry, so each object is one draw call. The
 * course is baked in 16 m chunks (ground, goo, mud and scenery in one mesh each);
 * eggs, fruit, blob shadows, particles and fireflies are instanced. Materials and
 * geometries are made once and cached. Nothing here reads or changes the engine. */
(function () {
  'use strict';
  var D = window.Dino3D;

  // Whether WebGL here is drawn by the processor instead of a graphics card (SwiftShader,
  // Windows' Basic Render Driver, llvmpipe). A throwaway context answers before the game's
  // own context is made, because MSAA cannot be switched off once a context exists.
  function softwareGL() {
    var gl = null;
    try {
      var c = document.createElement('canvas'), opts = { powerPreference: 'high-performance' };
      gl = c.getContext('webgl2', opts) || c.getContext('webgl', opts);
      if (!gl) return false;
      var name = String(gl.getParameter(gl.RENDERER) || '');
      // Chromium reports "WebKit WebGL" there; Firefox already gives the real name.
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

  D.createView = function (canvas) {
    var T = window.THREE;
    if (!T) throw new Error('three.js is unavailable');
    // On a software renderer 4x MSAA and a full-size drawing buffer are about half the cost
    // of every frame (a 1280x720 title frame in Chromium's SwiftShader: 205 ms of GPU-process
    // time, 106 ms without MSAA at 0.75 size), and a cold browser spends seconds on its first
    // frames. There the game draws without MSAA at 0.75 of the size, the floor the slow-frame
    // fallback below uses. A graphics card keeps both.
    var software = softwareGL();
    var renderer = new T.WebGLRenderer({ canvas: canvas, antialias: !software, powerPreference: 'high-performance' });
    var ratio = software ? 0.75 : Math.min(window.devicePixelRatio || 1, 1.5);
    renderer.setPixelRatio(ratio);
    var scene = new T.Scene(), camera = new T.PerspectiveCamera(48, 16 / 9, 0.1, 400);
    scene.fog = new T.Fog(0xffffff, 30, 110);
    var hemi = new T.HemisphereLight(0xffffff, 0x888888, 1.6), sun = new T.DirectionalLight(0xffffff, 2.2);
    sun.position.set(-6, 14, 9);
    scene.add(hemi, sun);
    var C = new T.Color(), C2 = new T.Color(), M4 = new T.Matrix4(), Q = new T.Quaternion(), E = new T.Euler(), V1 = new T.Vector3(), V2 = new T.Vector3(), S1 = new T.Vector3();
    var LIT = new T.MeshLambertMaterial({ vertexColors: true }), GLOW = new T.MeshBasicMaterial({ vertexColors: true });
    var FLASH = new T.MeshLambertMaterial({ vertexColors: true, emissive: 0xffa21f, emissiveIntensity: 0.45 });
    var MATS = [LIT, GLOW], FLASHMATS = [FLASH, GLOW];
    var view = { renderer: renderer, scene: scene, camera: camera };

    /* ------------------------------------------------------- voxel geometry */
    // Boxes with the glow flag go to a second, unlit group (night mushrooms, lava).
    function build(list, s, keepBottom) {
      s = s || 0.1;
      var lit = [], glow = [];
      for (var i = 0; i < list.length; i++) (list[i][7] ? glow : lit).push(list[i]);
      var all = lit.concat(glow), faces = keepBottom ? 6 : 5, n = all.length * faces * 6;
      var pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), o = 0, r = 0, g = 0, b = 0;
      function v(x, y, z, a, bb, c) { pos[o] = x; pos[o + 1] = y; pos[o + 2] = z; nor[o] = a; nor[o + 1] = bb; nor[o + 2] = c; col[o] = r; col[o + 1] = g; col[o + 2] = b; o += 3; }
      function q(a, bb, c, d, nx, ny, nz) { v(a[0], a[1], a[2], nx, ny, nz); v(bb[0], bb[1], bb[2], nx, ny, nz); v(c[0], c[1], c[2], nx, ny, nz); v(a[0], a[1], a[2], nx, ny, nz); v(c[0], c[1], c[2], nx, ny, nz); v(d[0], d[1], d[2], nx, ny, nz); }
      for (i = 0; i < all.length; i++) {
        var e = all[i], x0 = (e[0] - e[3] / 2) * s, x1 = (e[0] + e[3] / 2) * s, y0 = e[1] * s, y1 = (e[1] + e[4]) * s, z0 = (e[2] - e[5] / 2) * s, z1 = (e[2] + e[5] / 2) * s;
        C.setHex(e[6]); r = C.r; g = C.g; b = C.b;
        q([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], 1, 0, 0);
        q([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], -1, 0, 0);
        q([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], 0, 1, 0);
        q([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], 0, 0, 1);
        q([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], 0, 0, -1);
        if (keepBottom) q([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], 0, -1, 0);
      }
      var geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new T.BufferAttribute(nor, 3));
      geo.setAttribute('color', new T.BufferAttribute(col, 3));
      var split = lit.length * faces * 6;
      geo.addGroup(0, split, 0); geo.addGroup(split, n - split, 1);
      geo.computeBoundingSphere();
      return geo;
    }
    var cache = {};
    function model(key, fn) { return cache[key] || (cache[key] = build(fn())); }
    function mesh(geo) { return new T.Mesh(geo, MATS); }
    function mix(a, b, t) { C.setHex(a); C2.setHex(b); return C.lerp(C2, t).getHex(); }
    function shade(a, f) { return mix(a, f < 1 ? 0x000000 : 0xffffff, f < 1 ? 1 - f : f - 1); }
    // Seeded scenery: the same chunk always looks the same.
    function rng(seed) { var s = seed >>> 0 || 1; return function () { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; }; }

    /* ------------------------------------------------------------- biomes */
    var BIO = [
      { sky: [0x47b5ff, 0xffe3a6], fog: 0xffd9a0, hemi: [0xfff3dc, 0xc98a52, 1.7], sun: [0xfff0d0, 2.3], path: [0xf7cd73, 0xf0bf62], edge: 0xe0a352, dirt: [0xc8763c, 0xa95f30],
        side: [0xeeb563, 0xe4a756], back: [0xe8914a, 0xdb8040, 0xcf6e3a], fill: 0xf1c06a, goo: 0x7be05a, mud: 0x9a6236, stone: 0xc58450 },
      { sky: [0x3ab2ff, 0xc9f6c4], fog: 0xb4ecbc, hemi: [0xf2fff0, 0x4f8a3c, 1.7], sun: [0xfffbe6, 2.2], path: [0xe0b77a, 0xd4a96c], edge: 0x5fb03f, dirt: [0x8b5a35, 0x744a2c],
        side: [0x6fc449, 0x63b840], back: [0x4fae3c, 0x449f37, 0x3a9032], fill: 0x5fba42, goo: 0x58d0ff, mud: 0x7d4f2c, stone: 0x9a8c7a },
      { sky: [0x6bb8ff, 0xeef8ff], fog: 0xe3f1ff, hemi: [0xffffff, 0x8fb2d8, 1.75], sun: [0xffffff, 2.1], path: [0xd6ebfb, 0xc8e2f7], edge: 0x8fb8de, dirt: [0x8aa6c9, 0x7290b6],
        side: [0xf0f7fd, 0xe2eef8], back: [0xdcebf7, 0xcfe3f4, 0xc2d9ee], fill: 0xeaf4fc, goo: 0x7fe4ff, mud: 0xc6dcf2, stone: 0x9fb4cc },
      { sky: [0xff8a6b, 0xffe2a4], fog: 0xffc79e, hemi: [0xfff0e0, 0x8a5a6a, 1.75], sun: [0xffe2c0, 2.3], path: [0xf0c48a, 0xe6b67a], edge: 0xc4875a, dirt: [0x7a5470, 0x6a4762],
        side: [0x8a6a80, 0x806278], back: [0x5fbf5a, 0x8a6a80, 0x7a5c72], fill: 0x34c6e8, goo: 0xff6a3c, mud: 0x6e3f2e, stone: 0x8d7480 },
      { sky: [0x10133e, 0x4b3c93], fog: 0x2d2a6a, hemi: [0xaab2ff, 0x3a3168, 1.6], sun: [0xc8d0ff, 1.6], path: [0x6a6fd0, 0x5f64c4], edge: 0x4a4fa8, dirt: [0x3a2f6e, 0x30285e],
        side: [0x3d4fa0, 0x374896], back: [0x2f3f86, 0x29387a, 0x24326e], fill: 0x2d3d84, goo: 0x46ffd2, mud: 0x5b3a7c, stone: 0x6d6aa8 }
    ];
    view.BIO = BIO;

    /* -------------------------------------------------------------- models */
    var INK = 0x2a2140, WHITE = 0xffffff, PINK = 0xff8db5;
    // The baby dino, facing +x. Parts are separate meshes so they can move.
    function dinoParts(c) {
      var dark = shade(c, 0.74), belly = mix(c, 0xfff4d6, 0.84), spike = mix(c, 0xff9a3c, 0.7);
      var body = [[0, 3.2, 0, 6.2, 5.6, 5.8, c], [0, 2.8, 0, 5.4, 6.4, 5.2, c], [1.9, 3.4, 0, 3.2, 4.6, 6, belly],
        [3.4, 5.4, 2.4, 1.4, 1.5, 1.1, c], [3.4, 5.4, -2.4, 1.4, 1.5, 1.1, c], [4.2, 5.4, 2.4, 0.5, 0.5, 1.1, WHITE], [4.2, 5.4, -2.4, 0.5, 0.5, 1.1, WHITE],
        [-2.2, 8.6, 0, 1.4, 1.4, 1.2, spike], [-0.4, 9, 0, 1.4, 1.4, 1.2, spike]];
      var head = [[2.2, -0.6, 0, 8.4, 6.4, 6.6, c], [2.2, -1, 0, 7.4, 7.2, 5.8, c], [2.2, -0.2, 0, 9, 5.6, 5.8, c], [3.2, -1.2, 0, 6, 0.8, 5.4, belly],
        [6.72, 0.6, 0, 0.2, 0.5, 3, INK], [5.6, 0.6, 3.02, 2.4, 0.5, 0.2, INK], [4.4, 0.9, 3.02, 0.5, 0.8, 0.2, INK], [5.6, 0.6, -3.02, 2.4, 0.5, 0.2, INK], [4.4, 0.9, -3.02, 0.5, 0.8, 0.2, INK],
        [6.72, 3.4, 1, 0.2, 0.6, 0.6, dark], [6.72, 3.4, -1, 0.2, 0.6, 0.6, dark],
        [3.6, 1.6, 3.32, 1.4, 0.8, 0.2, PINK], [3.6, 1.6, -3.32, 1.4, 0.8, 0.2, PINK],
        [0.4, 5.8, 0, 1.6, 1.4, 1.4, spike], [2.2, 6, 0, 1.4, 1, 1.4, spike]];
      // Eyes wrap the front corners of the head: seen from the side and from the front.
      var eyes = [];
      [1, -1].forEach(function (k) { eyes.push([5.9, 2.3, 2.7 * k, 1.7, 2.5, 1.4, INK], [6.8, 3.8, 2.35 * k, 0.1, 0.6, 0.5, WHITE], [6.25, 3.8, 3.42 * k, 0.6, 0.6, 0.1, WHITE], [6.8, 2.8, 2.9 * k, 0.1, 0.3, 0.3, WHITE]); });
      var tail = [[-1.8, -1.8, 0, 3.8, 4, 4.4, c], [-4.6, -1, 0, 2.6, 2.8, 3.2, c], [-6.6, -0.2, 0, 1.8, 1.8, 2.2, c], [-7.8, 0.4, 0, 1, 1.2, 1.4, dark],
        [-2.2, 2.2, 0, 1.2, 1.2, 1.1, spike], [-4.6, 1.8, 0, 1, 1, 0.9, spike]];
      var leg = [[0, -3.4, 0, 2.6, 3.8, 2.4, c], [0.6, -3.6, 0, 3.4, 1.1, 2.8, dark], [2.2, -3.6, 0.8, 0.5, 0.5, 0.6, WHITE], [2.2, -3.6, -0.8, 0.5, 0.5, 0.6, WHITE]];
      return { body: body, head: head, eyes: eyes, tail: tail, leg: leg };
    }
    var HATS = {
      none: function () { return []; },
      bow: function () { return [[0, 0, 2.6, 1.4, 1.4, 1.2, 0xff4f9a], [-1.3, -0.2, 2.6, 1.6, 2, 1, 0xff7eb9], [1.3, -0.2, 2.6, 1.6, 2, 1, 0xff7eb9]]; },
      cap: function () { return [[0, 0, 0, 7, 2.4, 6.8, 0xff4b4b], [4.6, 0, 0, 3.4, 0.6, 6, 0xff4b4b], [0, 2.4, 0, 1.2, 0.6, 1.2, WHITE], [0, 0.8, 3.45, 3, 1.2, 0.1, WHITE]]; },
      flower: function () {
        var l = [[0, 0, 0, 7.4, 0.8, 7, 0x4fbf4a]], cols = [0xff6fae, 0xffd23f, 0x7ad3ff, 0xff9a3c, 0xc79bff];
        for (var i = 0; i < 5; i++) { var a = i / 5 * 6.28 + 0.3; l.push([Math.cos(a) * 3.2, 0.5, Math.sin(a) * 3.1, 1.8, 1.2, 1.8, cols[i]], [Math.cos(a) * 3.2, 1.3, Math.sin(a) * 3.1, 0.7, 0.4, 0.7, 0xfff4b0]); }
        return l;
      },
      party: function () { return [[0, 0, 0, 4.4, 2, 4.4, 0x7a5cff], [0, 2, 0, 3.2, 2, 3.2, 0xffd23f], [0, 4, 0, 2, 1.8, 2, 0x7a5cff], [0, 5.8, 0, 1.6, 1.4, 1.6, 0xff4f9a]]; },
      shades: function () { return [[4.15, -4.2, 1.8, 0.5, 2.6, 2.8, INK], [4.15, -4.2, -1.8, 0.5, 2.6, 2.8, INK], [4.15, -2.6, 0, 0.5, 0.6, 1.2, INK], [2, -2.4, 3.5, 4.4, 0.6, 0.3, INK], [2, -2.4, -3.5, 4.4, 0.6, 0.3, INK], [4.45, -2.6, 2.4, 0.1, 0.6, 0.8, 0x8fd8ff], [4.45, -2.6, -1.2, 0.1, 0.6, 0.8, 0x8fd8ff]]; },
      crown: function () {
        var G = 0xffcf2e, l = [[0, 0, 0, 6, 1.6, 6, G]];
        [[-2.4, -2.4], [2.4, -2.4], [-2.4, 2.4], [2.4, 2.4], [0, 2.6], [0, -2.6]].forEach(function (p) { l.push([p[0], 1.6, p[1], 1.2, 1.6, 1.2, G]); });
        l.push([0, 0.4, 3.05, 1.2, 0.9, 0.2, 0xff4b6e], [3.05, 0.4, 0, 0.2, 0.9, 1.2, 0x4bd0ff]);
        return l;
      },
      viking: function () { return [[0, 0, 0, 7, 2.6, 6.8, 0xb9c3d6], [0, 0, 0, 7.4, 0.8, 7.2, 0x8a6a3a], [0, 2.6, 0, 3, 0.8, 3, 0xb9c3d6], [0, 1, 4, 1.4, 1.4, 1.6, WHITE], [0, 2.2, 4.8, 1, 2, 1, WHITE], [0, 1, -4, 1.4, 1.4, 1.6, WHITE], [0, 2.2, -4.8, 1, 2, 1, WHITE]]; },
      wizard: function () { return [[0, 0, 0, 8, 0.8, 8, 0x5b3fd1], [0, 0.8, 0, 5, 2.4, 5, 0x6b4fe6], [-0.4, 3.2, 0, 3.6, 2.2, 3.6, 0x6b4fe6], [-1, 5.4, 0, 2.2, 2, 2.2, 0x6b4fe6], [-1.8, 7.2, 0, 1.2, 1.4, 1.2, 0x6b4fe6], [1, 1.6, 2.55, 1, 1, 0.1, 0xffe14d], [-0.6, 3.8, 1.85, 0.8, 0.8, 0.1, 0xffe14d]]; }
    };
    // A dino rig: root (position, squash, tumble) > body > head > eyes, hat; tail; legs.
    function makeDino(color, hat, size) {
      var g = new T.Group(), pivot = new T.Group(), body = new T.Group();
      g.add(pivot); pivot.add(body);
      var parts = dinoParts(color);
      var torso = mesh(build(parts.body)), head = mesh(build(parts.head)), eyes = mesh(build(parts.eyes)), tail = mesh(build(parts.tail));
      var legA = mesh(build(parts.leg)), legB = mesh(build(parts.leg)), hatM = mesh(build(HATS[hat] ? HATS[hat]() : []));
      head.position.set(0.12, 0.8, 0); tail.position.set(-0.28, 0.48, 0); legA.position.set(0.04, 0.36, 0.16); legB.position.set(0.04, 0.36, -0.16);
      hatM.position.set(0.22, 0.6, 0);
      head.add(eyes, hatM); head.scale.setScalar(1.12); body.add(torso, head, tail, legA, legB);
      g.scale.setScalar(size || 1);
      var rig = { root: g, pivot: pivot, body: body, head: head, eyes: eyes, tail: tail, legA: legA, legB: legB, hat: hatM, parts: [torso, head, eyes, tail, legA, legB, hatM] };
      rig.dispose = function () { rig.parts.forEach(function (m) { m.geometry.dispose(); }); };
      return rig;
    }

    // Obstacles by biome: what they look like (the engine says what they do).
    var OB = {
      block: function (b, form, look) {
        var P = BIO[b], l = [];
        if (b === 0) {
          if (form === 'wide') return [[0, 0, 0, 17, 3.6, 6.4, 0xe0763c], [0.6, 3.6, 0, 14, 2.4, 5.6, 0xf09a4c], [-1, 6, 0, 8, 1.4, 4.6, 0xf7b866], [5, 0, 3.3, 4, 1.2, 0.4, 0xc95f30]];
          var h = form === 'tall' ? 12.6 : 7.4, G = 0x3fbf5a;
          l.push([0, 0, 0, 7, 0.8, 6, 0xf0bf62], [0, 0.6, 0, 3.8, h, 3.8, G], [0, 0.6 + h, 0, 2.6, 0.8, 2.6, 0x58d872], [0, 1.4 + h, 0, 1.8, 1, 1.8, 0xff6fae]);
          l.push([-2.8, 3.6, 0, 1.8, 1.4, 1.8, G], [-3.2, 3.6, 0, 1.4, h * 0.42, 1.6, G], [2.8, 2.6 + (look ? 2 : 0), 0, 1.8, 1.4, 1.8, G], [3.2, 2.6 + (look ? 2 : 0), 0, 1.4, h * 0.32, 1.6, G]);
          for (var i = 0; i < 4; i++) l.push([(i % 2 ? 1.95 : -1.95), 2 + i * h * 0.2, 0.9, 0.2, 0.5, 0.2, 0xfff6c8], [0.9, 1.6 + i * h * 0.2, 1.95, 0.5, 0.5, 0.2, 0xfff6c8]);
          return l;
        }
        if (b === 1) {
          if (form === 'wide') return [[0, 0, 0, 17, 6, 6.2, 0x8a5a33], [8.6, 0.4, 0, 0.4, 5.2, 5.4, 0xe2b77a], [-8.6, 0.4, 0, 0.4, 5.2, 5.4, 0xe2b77a], [8.8, 2, 0, 0.2, 2, 2, 0xb88a52], [-2, 6, 0, 7, 0.8, 4.6, 0x5ec44a], [3, 6, 1, 2, 1.6, 2, 0xff5a5a], [3, 7.6, 1, 3, 0.6, 3, 0xffe0e0]];
          var th = form === 'tall' ? 12.6 : 6.6;
          l.push([0, 0, 0, 7.4, th, 7, 0x93603a], [0, th, 0, 7.8, 0.8, 7.4, 0xe6bd80], [0, th + 0.2, 0, 4, 0.8, 3.6, 0xcf9c62], [-2, 0, 3.6, 2.6, th * 0.6, 0.4, 0x5ec44a], [2.4, th * 0.4, 3.6, 2, 2, 0.4, 0x6fd24f]);
          l.push([2.6, th + 0.8, -1.6, 1, 1.4, 1, 0xfff1d6], [2.6, th + 2.2, -1.6, 2.6, 1, 2.6, 0xff5a5a]);
          return l;
        }
        if (b === 2) {
          if (form === 'tall') return [[0, 0, 0, 8.4, 6.4, 8.4, WHITE], [0, 6.4, 0, 6.4, 5, 6.4, WHITE], [0, 5.8, 0, 7.4, 1.2, 7.4, 0xff4b4b], [2.6, 5, 3.8, 1.4, 3, 0.6, 0xff4b4b],
            [3.6, 8.6, 0, 2.6, 1, 1.2, 0xff8a1f], [3.25, 9.6, 1.4, 0.2, 0.8, 0.8, INK], [3.25, 9.6, -1.4, 0.2, 0.8, 0.8, INK], [0, 11.4, 0, 4.4, 0.6, 4.4, INK], [0, 12, 0, 3, 2.2, 3, INK], [4.25, 2, 0, 0.2, 1, 1, INK], [4.25, 4, 0, 0.2, 1, 1, INK]];
          if (form === 'wide') return [[0, 0, 0, 17, 5.6, 6, 0x8f6a4a], [0, 5.6, 0, 17.4, 1.6, 6.4, WHITE], [8.6, 0.4, 0, 0.4, 4.8, 5.2, 0xe2c8a6], [-3, 7.2, 0, 5, 0.8, 4, WHITE]];
          return [[0, 0, 0, 8.4, 7.6, 7.6, 0x9fdcff], [0, 7.6, 0, 8.8, 0.8, 8, WHITE], [-1.6, 2, 3.85, 1, 4, 0.2, 0xe6f8ff], [1.4, 4, 3.85, 1.6, 1, 0.2, 0xe6f8ff], [0, 0, 0, 9, 0.6, 8.4, 0x7fc6f2]];
        }
        if (b === 3) {
          if (form === 'wide') return [[0, 0, 0, 17, 5.4, 6, 0xa8774f], [-4, 0, 0, 0.6, 5.6, 6.2, 0x7d5638], [2, 0, 0, 0.6, 5.6, 6.2, 0x7d5638], [8.6, 0.4, 0, 0.4, 4.6, 5.2, 0xe8c48e], [-7, 5.4, 0, 4, 1.4, 4, 0x3fbf5a], [-6, 6.8, 0, 6, 0.6, 2, 0x5ed872]];
          var vh = form === 'tall' ? 12.8 : 7.6, R = 0x4a3346;
          l.push([0, 0, 0, 8, vh, 7.4, R], [0.6, vh, 0, 5.6, 1.2, 5.6, 0x5b4058], [-1, 1.4, 3.75, 3, 0.7, 0.2, 0xff8a3c, 1], [1.4, vh * 0.55, 3.75, 0.7, 3, 0.2, 0xffb03c, 1], [0.4, vh * 0.35, 3.75, 2.4, 0.6, 0.2, 0xff8a3c, 1], [4.05, vh * 0.5, 0, 0.2, 2.4, 2, 0xff8a3c, 1]);
          return l;
        }
        if (form === 'wide') return [[0, 0, 0, 17, 5.4, 6, 0x3f3a7a], [8.6, 0.4, 0, 0.4, 4.6, 5.2, 0x8f86d6], [-3, 5.4, 1, 1.2, 1.6, 1.2, 0xe8e6ff], [-3, 7, 1, 4, 1.4, 4, 0x46ffd2, 1], [3, 5.4, -1, 1, 1.2, 1, 0xe8e6ff], [3, 6.6, -1, 3.2, 1.2, 3.2, 0xff6fd8, 1]];
        if (form === 'tall') return [[0, 0, 0, 5, 9, 5, 0xb38cff, 1], [0, 9, 0, 3, 3.6, 3, 0xd9c2ff, 1], [-2.8, 0, 1, 3, 6, 3, 0x9a6dff, 1], [2.8, 0, -1, 2.6, 7, 2.6, 0x8fd8ff, 1], [0, 0, 0, 8.4, 0.6, 7, 0x4a4fa8]];
        return [[0, 0, 0, 2.6, 4.4, 2.6, 0xf2efff], [0, 4.4, 0, 8.4, 2.6, 7.6, 0x46ffd2, 1], [0, 7, 0, 5.4, 0.8, 5, 0x9effe6, 1], [-2, 5.2, 3.85, 1.2, 1.2, 0.2, WHITE, 1], [2, 5.6, 3.85, 1, 1, 0.2, WHITE, 1]];
      },
      crate: function (b, form) {
        var wood = [0xf2b248, 0xe8a640, 0xf0b24c, 0xe8a640, 0xd9963a][b], band = [0xa45f22, 0x8a4f1f, 0x9a5a22, 0x8a4f1f, 0x7a4418][b], star = 0xffe14d, glow = b === 4 ? 1 : 0;
        var l = [], n = form === 'wall' ? 2 : 1;
        for (var i = 0; i < n; i++) {
          var x = (i - (n - 1) / 2) * 10;
          l.push([x, 0, 0, 9.6, 9.6, 9.6, wood], [x - 4.3, 0, 0, 1, 9.8, 9.8, band], [x + 4.3, 0, 0, 1, 9.8, 9.8, band], [x, 8.8, 0, 9.8, 1, 9.8, band], [x, 0, 0, 9.8, 1, 9.8, band],
            [x, 3.3, 4.9, 3.4, 3, 0.2, star, glow], [x, 4.3, 4.95, 1.2, 1, 0.1, 0xffffff, glow], [x, 3.3, -4.9, 3.4, 3, 0.2, star, glow]);
        }
        return l;
      },
      vine: function (b) {
        var rope = [0x4cbf3c, 0x3fae36, 0x9fe6ff, 0x3fbf5a, 0xb38cff][b], leaf = [0x6fe04f, 0x7fe85a, WHITE, 0x7fe85a, 0x46ffd2][b], bulb = [0xff6fae, 0xff6fae, 0x7fd6ff, 0xffb03c, 0xff6fd8][b], glow = b === 4 ? 1 : 0;
        var l = [[0, -3, -4, 4, 3, 16, 0x8a5a33], [0, -33, 0, 1.4, 31, 1.4, rope, glow]];
        for (var i = 0; i < 6; i++) l.push([(i % 2 ? 1.4 : -1.4), -7 - i * 4.4, 0, 2, 1.2, 1.6, leaf, glow]);
        l.push([0, -35, 0, 4.2, 3, 4.2, bulb, glow], [0, -35.6, 0, 2.6, 0.6, 2.6, shade(bulb, 0.8), glow], [1.6, -34, 2.15, 0.6, 0.7, 0.1, INK], [1.6, -34, -2.15, 0.6, 0.7, 0.1, INK]);
        return l;
      },
      // Night kites glow like paper lanterns, so they read in the dark.
      flyerBody: function (b, look) {
        var c = [0x3fe6dc, 0xffa04c, 0xc77bff][look], belly = 0xfff1c8, l = [[0, -1.6, 0, 6.4, 3.2, 3.6, c], [0.4, -1.8, 0, 4, 1, 3, belly], [-4.2, -0.8, 0, 4.2, 3.4, 3.4, c], [-7.6, 0, 0, 3.2, 1.2, 1.8, 0xffd23f], [-3.4, 2.4, 0, 3, 1, 1, 0xff6fae],
          [4, -1, 0, 2.4, 1, 1, c], [6, -1.4, 0, 1.6, 1.6, 0.4, 0xff4f9a], [8, -1.8, 0, 1.6, 1.6, 0.4, 0xffd23f], [10, -2.2, 0, 1.6, 1.6, 0.4, 0x4fb8ff]];
        l.forEach(function (e) { e.push(1); });
        return l.concat([[-5, 0.8, 1.75, 1.4, 1.4, 0.1, WHITE, 1], [-5.2, 0.9, 1.82, 0.7, 0.9, 0.1, INK], [-5, 0.8, -1.75, 1.4, 1.4, 0.1, WHITE, 1], [-5.2, 0.9, -1.82, 0.7, 0.9, 0.1, INK]]);
      },
      flyerWings: function (b, look) {
        var w = [0xffe14d, 0x7fd6ff, 0xff8fc6][look], l = [[0, 0, 4.4, 5, 0.6, 7, w], [0.6, 0, 9.2, 3.6, 0.5, 3, mix(w, WHITE, 0.4)], [0, 0, -4.4, 5, 0.6, 7, w], [0.6, 0, -9.2, 3.6, 0.5, 3, mix(w, WHITE, 0.4)], [-1.2, 0.3, 4.4, 1, 0.3, 6, WHITE], [-1.2, 0.3, -4.4, 1, 0.3, 6, WHITE]];
        l.forEach(function (e) { e.push(1); });
        return l;
      },
      roller: function (b) {
        var base = [WHITE, 0x8a5a33, WHITE, 0x8a5a33, 0xb38cff][b], dot = [0xbfe4ff, 0x5a3a20, 0xbfe4ff, 0x5a3a20, 0xe8d6ff][b], glow = b === 4 ? 1 : 0;
        var l = [[0, -4.5, 0, 5, 9, 5, base, glow], [0, -3.75, 0, 7.8, 7.5, 7.8, base, glow], [0, -2.25, 0, 9.2, 4.5, 6.4, base, glow], [0, -2.25, 0, 6.4, 4.5, 9.2, base, glow], [0, -3.2, 0, 6.4, 6.4, 6.4, base, glow]];
        l.push([4.4, 0, 2, 0.4, 1.4, 1.4, dot], [-4.4, -1.6, -1, 0.4, 1.2, 1.2, dot], [1, 3.9, 1, 1.4, 0.4, 1.4, dot], [2, -2, 4.4, 1.2, 1.2, 0.4, dot], [-2, 1, 4.4, 1.6, 1, 0.4, dot], [1.6, 1, -4.4, 1.2, 1.2, 0.4, dot]);
        return l;
      }
    };
    var ITEM = {
      egg: function () {
        var E = 0xfff8ea, l = [[0, -2.4, 0, 2, 0.5, 2, E, 1], [0, -2, 0, 3, 1, 3, E, 1], [0, -1.2, 0, 3.6, 1.8, 3.6, E, 1], [0, 0.6, 0, 3.2, 1.2, 3.2, E, 1], [0, 1.8, 0, 2.6, 0.8, 2.6, E, 1], [0, 2.6, 0, 1.6, 0.6, 1.6, E, 1]];
        [[1, -0.6, 1.85, 1, 1, 0.1, 0x45c4ff], [-0.9, 1, 1.65, 0.8, 0.8, 0.1, 0xff6fae], [1.85, -0.2, -0.7, 0.1, 1, 1, 0x45c4ff], [-1.85, -0.9, 0.5, 0.1, 1, 1, 0xff6fae], [0.4, -1, -1.85, 1, 1, 0.1, 0x6fe04f], [-0.6, 1.2, -1.65, 0.8, 0.8, 0.1, 0xffc12e]].forEach(function (d) { d.push(1); l.push(d); });
        return l;
      },
      fruit0: function () { return [[0, -2, 0, 4.6, 4, 4, 0x3fbf5a], [0, -1.6, 0, 5, 3.2, 3.4, 0x2f9e48], [-1.2, -2, 2.05, 0.8, 4, 0.1, 0x7be05a], [1.2, -2, 2.05, 0.8, 4, 0.1, 0x7be05a], [0, 2, 0, 0.6, 1, 0.6, 0x8a5a33]]; },
      fruit1: function () { return [[-1.4, -2, 0, 1.4, 4, 1.4, 0xffd23f], [0, -2.4, 0, 1.4, 4.4, 1.4, 0xffe14d], [1.4, -2, 0, 1.4, 4, 1.4, 0xffd23f], [0, 2, 0, 1.2, 1, 1.2, 0x8a5a33], [0, -2.6, 0, 3, 0.6, 1, 0x7a5a20]]; },
      fruit2: function () { return [[0, -2.2, 0, 2.4, 1, 2.4, 0xff3b52], [0, -1.2, 0, 3.6, 2.6, 3.6, 0xff3b52], [0, 1.4, 0, 3.8, 0.8, 3.8, 0x3fbf5a], [0, 2.2, 0, 1, 1, 1, 0x3fbf5a], [1.81, 0, 0.6, 0.1, 0.5, 0.5, 0xfff1a8], [-0.6, -0.6, 1.81, 0.5, 0.5, 0.1, 0xfff1a8]]; },
      fruit3: function () { return [[0, -2.4, 0, 3.6, 4, 3.6, 0xffb02e], [0, -2, 0, 3.9, 3.2, 3.9, 0xff9a1f], [0, 1.6, 0, 1.2, 2.4, 1.2, 0x3fbf5a], [-1, 1.6, 0, 1, 1.6, 1, 0x58d872], [1, 1.6, 0, 1, 1.6, 1, 0x58d872]]; },
      fruit4: function () { return [[0, -2, 0, 4, 4, 4, 0xc77bff, 1], [0, -1.6, 0, 4.4, 3.2, 4.4, 0xb05cff, 1], [0, 2, 0, 0.6, 1, 0.6, 0x46ffd2, 1], [0.8, 2.6, 0, 1.6, 0.6, 1, 0x46ffd2, 1]]; },
      heart: function () { return [[-1.2, -2, 0, 2.4, 3.6, 1.8, 0xff3b6b], [1.2, -2, 0, 2.4, 3.6, 1.8, 0xff3b6b], [0, -2.8, 0, 2, 1.6, 1.6, 0xff3b6b], [-1.5, 1.6, 0, 2.2, 0.8, 1.6, 0xff3b6b], [1.5, 1.6, 0, 2.2, 0.8, 1.6, 0xff3b6b], [-1.6, 0.4, 0.95, 0.8, 0.8, 0.1, WHITE]]; },
      star: function () { return [[0, -1.2, 0, 1.2, 2.4, 0.6, 0xffe14d, 1], [0, -0.4, 0, 2.8, 0.8, 0.6, 0xffe14d, 1], [0, -0.2, 0.31, 0.6, 0.6, 0.1, 0xffffff, 1]]; }
    };

    /* ----------------------------------------------------- scenery props */
    // small: only low scenery (next to the path nothing may look like an obstacle).
    function prop(b, r, x, y, z, l, small) {
      function add(e) { l.push([e[0] + x, e[1] + y, e[2] + z, e[3], e[4], e[5], e[6], e[7]]); }
      var k = small ? 0.62 + r() * 0.38 : r();
      if (b === 0) {
        if (k < 0.4) { var h = 14 + r() * 16, G = 0x3a9a50; [[0, 0, 0, 4.2, h, 4.2, G], [-3.4, h * 0.4, 0, 2.6, 2, 2.4, G], [-4, h * 0.4, 0, 2, h * 0.35, 2.2, G], [3.4, h * 0.55, 0, 2.6, 2, 2.4, G], [4, h * 0.55, 0, 2, h * 0.28, 2.2, G], [0, h, 0, 2.6, 1, 2.6, 0xff6fae]].forEach(add); }
        else if (k < 0.7) [[0, 0, 0, 9, 4, 7, 0xe0763c], [0.6, 4, 0, 6.6, 3, 5.4, 0xf09a4c], [-0.4, 7, 0, 3.6, 2, 3.6, 0xf7b866]].forEach(add);
        else [[0, 0, 0, 3.6, 3.6, 3.6, 0x58c46a], [0, 3.6, 0, 1.6, 1.2, 1.6, 0xffd23f], [3, 0, 2, 1, 1.6, 1, 0xff8a3c]].forEach(add);
      } else if (b === 1) {
        if (k < 0.45) { var th = 22 + r() * 18; [[0, 0, 0, 3.6, th, 3.6, 0x8a5a33], [0, th, 0, 16, 5, 14, 0x3fae36], [1, th + 5, 0, 11, 4, 10, 0x55c440], [-4, th - 3, 3, 8, 3, 8, 0x47b83a], [5, th - 2, -3, 7, 3, 7, 0x4cbc3c], [0, th + 9, 0, 5, 2, 5, 0x6fd24f]].forEach(add); }
        else if (k < 0.75) [[0, 0, 0, 8, 5, 8, 0x3fae36], [0, 5, 0, 5, 3, 5, 0x55c440], [3, 5, 3, 2, 2, 2, 0xff5a5a], [-2, 6, -2, 2, 2, 2, 0xffd23f]].forEach(add);
        else [[0, 0, 0, 1, 6, 1, 0x3fae36], [0, 6, 0, 4, 3, 4, 0xff5a8a], [0, 9, 0, 1.6, 1, 1.6, 0xffe14d], [3, 0, 1, 1, 4, 1, 0x3fae36], [3, 4, 1, 3, 2, 3, 0xffd23f]].forEach(add);
      } else if (b === 2) {
        if (k < 0.55) { var ph = 6 + r() * 4, P = 0x2f8a5a; [[0, 0, 0, 2.6, 4, 2.6, 0x7a5a3a], [0, 4, 0, 13, ph, 13, P], [0, 4 + ph, 0, 13.4, 1.2, 13.4, WHITE], [0, 5 + ph, 0, 9, ph, 9, P], [0, 5 + ph * 2, 0, 9.4, 1.2, 9.4, WHITE], [0, 6 + ph * 2, 0, 5, ph, 5, P], [0, 6 + ph * 3, 0, 5.4, 1.4, 5.4, WHITE]].forEach(add); }
        else if (k < 0.8) [[0, 0, 0, 9, 5, 8, 0x9fb4cc], [0, 5, 0, 9.4, 2, 8.4, WHITE], [3, 0, 3, 4, 3, 4, 0x8aa0bb]].forEach(add);
        else [[0, 0, 0, 2, 8, 2, 0x9fe6ff], [2, 0, 1, 1.6, 5, 1.6, 0xbff0ff], [-1.6, 0, -1, 1.4, 4, 1.4, 0x7fd6ff]].forEach(add);
      } else if (b === 3) {
        if (k < 0.5) { var lh = 20 + r() * 12, lean = r() < 0.5 ? -1 : 1; for (var i = 0; i < 5; i++) add([lean * i * i * 0.35, i * lh / 5, 0, 2.8, lh / 5 + 0.4, 2.8, i % 2 ? 0xb07a4a : 0x9a6a40]);
          var tx = lean * 7; [[tx, lh, 0, 4, 2, 4, 0x8a5a33], [tx + 5, lh - 1, 0, 8, 1.2, 3, 0x3fbf5a], [tx - 5, lh - 1, 0, 8, 1.2, 3, 0x3fbf5a], [tx, lh - 1, 5, 3, 1.2, 8, 0x58d872], [tx, lh - 1, -5, 3, 1.2, 8, 0x58d872], [tx + 8, lh - 3, 0, 2, 2, 2.4, 0x3fbf5a], [tx - 8, lh - 3, 0, 2, 2, 2.4, 0x3fbf5a]].forEach(add); }
        else if (k < 0.8) [[0, 0, 0, 8, 6, 7, 0x4a3346], [0, 6, 0, 5, 2, 5, 0x5b4058], [2, 2, 3.6, 3, 0.6, 0.2, 0xff8a3c, 1]].forEach(add);
        else [[0, 0, 0, 1, 5, 1, 0x3fbf5a], [0, 5, 0, 3.6, 2.4, 3.6, 0xff4f9a], [0, 7.4, 0, 1.4, 0.8, 1.4, 0xffe14d], [-3, 0, 2, 4, 2, 4, 0x3fbf5a]].forEach(add);
      } else {
        if (k < 0.4) { var nh = 18 + r() * 14; [[0, 0, 0, 3.4, nh, 3.4, 0x2a2457], [0, nh, 0, 13, 6, 12, 0x2f3f86], [0, nh + 6, 0, 8, 4, 8, 0x37489a], [-4, nh - 2, 4, 6, 3, 6, 0x29387a]].forEach(add); }
        else if (k < 0.75) { var mc = [0x46ffd2, 0xff6fd8, 0x8fd8ff][(r() * 3) | 0]; [[0, 0, 0, 1.6, 4, 1.6, 0xe8e6ff], [0, 4, 0, 6, 2, 6, mc, 1], [0, 6, 0, 3.6, 1, 3.6, mix(mc, WHITE, 0.4), 1], [4, 0, 2, 1, 2.4, 1, 0xe8e6ff], [4, 2.4, 2, 3, 1.2, 3, mc, 1]].forEach(add); }
        else [[0, 0, 0, 3, 9, 3, 0xb38cff, 1], [2.4, 0, 1, 2, 6, 2, 0x8fd8ff, 1], [-2, 0, -1, 2, 5, 2, 0xd9c2ff, 1]].forEach(add);
      }
    }
    function tuft(b, r, x, z, l) {
      var c = [[0xffd23f, 0xe9a95a, 0xff8a3c], [0x8fe05a, 0xff5a8a, 0xffe14d], [0xffffff, 0xbfe4ff, 0x9fb4cc], [0x3fbf5a, 0xff4f9a, 0x8d7480], [0x46ffd2, 0x8fd8ff, 0xff6fd8]][b][(r() * 3) | 0];
      var glow = b === 4 ? 1 : 0;
      var y = z > 0 ? -2.5 : -0.5;
      if (r() < 0.5) l.push([x, y, z, 1, 2.2, 1, c, glow], [x + 1, y, z + 0.5, 0.8, 1.4, 0.8, c, glow]);
      else l.push([x, y, z, 2, 1, 1.6, c, glow]);
    }

    /* ------------------------------------------------------- course chunks */
    var CH = 16, chunks = new Map(), world = null;
    function biomeAt(x) { return world ? D.biomeAt(world, x) : 0; }
    // The goo and mud of the course near [a, b].
    function terrain(a, b) {
      var out = [];
      if (!world) return out;
      for (var i = 0; i < world.obs.length; i++) {
        var o = world.obs[i];
        if (o.x > b + 2) break;
        if ((o.kind === 'gap' || o.kind === 'mud') && o.x + o.w > a - 2) out.push(o);
      }
      return out;
    }
    function buildChunk(k) {
      var x0 = k * CH, l = [], r = rng(k * 2654435761 + 97), gaps = terrain(x0, x0 + CH), cuts = [x0, x0 + CH];
      gaps.forEach(function (o) { if (o.kind === 'gap') o.goo.forEach(function (s) { cuts.push(s[0], s[1]); }); });
      cuts = cuts.filter(function (c) { return c >= x0 && c <= x0 + CH; }).sort(function (a, b) { return a - b; });
      function gooAt(x) { for (var i = 0; i < gaps.length; i++) { var o = gaps[i]; if (o.kind === 'gap') for (var j = 0; j < o.goo.length; j++) if (x > o.goo[j][0] && x < o.goo[j][1]) return o; } return null; }
      function mudAt(x) { for (var i = 0; i < gaps.length; i++) if (gaps[i].kind === 'mud' && x > gaps[i].x && x < gaps[i].x + gaps[i].w) return gaps[i]; return null; }
      for (var c = 0; c < cuts.length - 1; c++) {
        var a = cuts[c], bnd = cuts[c + 1];
        if (bnd - a < 0.01) continue;
        var mid = (a + bnd) / 2, b = biomeAt(mid), P = BIO[b];
        if (gooAt(mid)) {
          l.push([mid * 10, -12, 0, (bnd - a) * 10, 8.6, 30, P.dirt[1]], [mid * 10, -3.6, 0, (bnd - a) * 10, 0.8, 29, P.goo, 1], [mid * 10, -3.4, 15.4, (bnd - a) * 10, 2, 0.8, shade(P.goo, 0.8), 1]);
          if (r() < 0.6) l.push([mid * 10 + (r() - 0.5) * (bnd - a) * 6, -2.9, (r() - 0.5) * 20, 1.4, 0.6, 1.4, mix(P.goo, WHITE, 0.5), 1]);
          continue;
        }
        // Solid ground in 1 m columns (cut at goo edges), path checkered.
        for (var xa = a; xa < bnd - 0.01;) {
          var xb = Math.min(bnd, Math.floor(xa + 1.0001)), cx = (xa + xb) / 2, cw = (xb - xa) * 10, col = Math.floor(xa) % 2 ? P.path[0] : P.path[1];
          b = biomeAt(cx); P = BIO[b];
          l.push([cx * 10, -1.6, -5, cw, 1.6, 10, col], [cx * 10, -1.6, 5, cw, 1.6, 10, Math.floor(xa) % 2 ? P.path[1] : P.path[0]], [cx * 10, -1.6, 12.5, cw, 1.6, 5, P.edge]);
          l.push([cx * 10, -10, 1, cw, 8.4, 30, Math.floor(xa) % 2 ? P.dirt[0] : P.dirt[1]], [cx * 10, 0, -11, cw, 1.4, 1.8, Math.floor(xa) % 2 ? P.edge : shade(P.edge, 0.82)]);
          var m = mudAt(cx);
          if (m) {
            l.push([cx * 10, 0, 0, cw, 0.5, 26, P.mud], [cx * 10 + 1, 0.5, (r() - 0.5) * 16, 3, 0.4, 3, shade(P.mud, b === 2 ? 1.05 : 0.8)]);
            if (b === 2) l.push([cx * 10, 0.5, (r() - 0.5) * 10, cw, 2 + r() * 2, 8, 0xf4fbff]);
          } else if (r() < 0.25) l.push([cx * 10 + (r() - 0.5) * 6, 0, (r() - 0.5) * 22, 1.6, 0.4, 1.6, shade(col, 0.92)]);
          xa = xb;
        }
      }
      // Front verge and the rising ground behind the path, with scenery.
      for (var i = 0; i < CH; i++) {
        var x = x0 + i + 0.5, bb = biomeAt(x), Q = BIO[bb], X = x * 10;
        l.push([X, -6.5, 33.5, 10, 4, 37, i % 2 ? Q.side[0] : Q.side[1]], [X, -12, 33.5, 10, 5.5, 37, Q.dirt[1]]);
        if (r() < 0.4 && Math.abs(x) > 8) tuft(bb, r, X + (r() - 0.5) * 6, 18 + r() * 12, l); // none right under the menu camera
        var h1 = 1 + r() * 3, h2 = 3 + r() * 6, h3 = 8 + r() * 14;
        l.push([X, -2, -20, 10, h1 + 2, 10, Q.back[0]], [X, -2, -32, 10, h2 + 2, 14, Q.back[1]], [X, -2, -50, 10, h3 + 2, 22, Q.back[2]]);
        if (bb === 0 && r() < 0.5) l.push([X, h3, -56, 10, 4 + r() * 10, 10, r() < 0.5 ? 0xd96a3a : 0xe8894a]);
        if (bb === 2 && r() < 0.6) l.push([X, h3, -52, 10, 1.2, 18, WHITE]);
        if (r() < 0.14) prop(bb, r, X, h1, -20 + (r() - 0.5) * 3, l, true);
        else if (r() < 0.2) prop(bb, r, X, h2, -32, l, true);
        else if (r() < 0.36) prop(bb, r, X, h3, -50, l);
        if (r() < 0.25) tuft(bb, r, X, -18 + r() * 2, l);
      }
      var mm = mesh(build(l));
      mm.position.x = 0;
      return mm;
    }
    function syncChunks(camX, all) {
      var k0 = Math.floor((camX - 22) / CH), k1 = Math.floor((camX + 74) / CH);
      chunks.forEach(function (m, k) { if (k < k0 - 1 || k > k1 + 1) { scene.remove(m); m.geometry.dispose(); chunks.delete(k); } });
      // One new chunk per frame at most, nearest first, so a weak PC never stalls.
      for (var k = k0; k <= k1; k++) if (!chunks.has(k)) { var m = buildChunk(k); chunks.set(k, m); scene.add(m); if (!all) return; }
    }
    function clearChunks() { chunks.forEach(function (m) { scene.remove(m); m.geometry.dispose(); }); chunks.clear(); }

    /* ------------------------------------------------- far scenery, sky */
    var FAR_P = 150;
    function farBoxes(b) {
      var l = [], r = rng(1234 + b * 77), P = BIO[b];
      l.push([FAR_P * 5, -8, 160, FAR_P * 10 + 4, 5, 220, P.fill], [FAR_P * 5, -2, -260, FAR_P * 10 + 4, 6, 420, shade(P.back[2], 0.94)]);
      for (var hi = 0; hi < 24; hi++) {
        var hx = hi * FAR_P * 10 / 24 + r() * 30, hz = -140 - r() * 110, hh = 6 + r() * 22;
        l.push([hx, 2, hz, 50 + r() * 60, hh, 60, r() < 0.5 ? P.back[1] : P.back[2]]);
        if (r() < 0.7) prop(b, r, hx, hh + 2, hz, l);
      }
      for (var i = 0; i < 26; i++) {
        var x = i * FAR_P * 10 / 26 + r() * 30, w = 40 + r() * 60, h = 30 + r() * 70, z = -380 - r() * 160;
        if (b === 0) { l.push([x, -2, z, w, h, 60, 0xd96a3a], [x, h - 2, z, w * 0.8, h * 0.18, 56, 0xe8894a], [x, h * 1.16 - 2, z, w * 0.5, 6, 50, 0xf09a4c]); }
        else if (b === 1) { l.push([x, -2, z, w * 1.4, h * 0.6, 80, 0x3a9032], [x, h * 0.6 - 2, z, w, h * 0.3, 70, 0x47a83a], [x + 10, h * 0.9 - 2, z, w * 0.5, h * 0.2, 60, 0x55b844]); }
        else if (b === 2) { var mh = h * 1.6; l.push([x, -2, z, w * 1.5, mh * 0.5, 90, 0x7f9fc6], [x, mh * 0.5 - 2, z, w, mh * 0.3, 80, 0x93b2d6], [x, mh * 0.8 - 2, z, w * 0.55, mh * 0.25, 70, WHITE], [x, mh * 1.05 - 2, z, w * 0.25, mh * 0.12, 50, WHITE]); }
        else if (b === 3) { l.push([x, -2, z, w * 1.3, h * 0.4, 70, 0x4f3d54], [x, h * 0.4 - 2, z, w * 0.8, h * 0.2, 60, 0x5b475f]); }
        else { l.push([x, -2, z, w * 1.4, h * 0.5, 80, 0x1f2a66], [x, h * 0.5 - 2, z, w * 0.9, h * 0.25, 70, 0x24326e]); }
      }
      if (b === 3) for (var v = 0; v < 2; v++) {
        var vx = 300 + v * 700, vz = -520;
        [[vx, -2, vz, 320, 60, 200, 0x5b475f], [vx, 58, vz, 240, 60, 160, 0x6b5470], [vx, 118, vz, 160, 50, 120, 0x7a6080], [vx, 168, vz, 100, 10, 80, 0xff8a3c, 1], [vx, 178, vz, 60, 6, 50, 0xffd23f, 1],
          [vx - 20, 200, vz, 60, 30, 40, WHITE], [vx + 30, 230, vz, 80, 36, 50, 0xf2eef6], [vx, 270, vz, 50, 24, 40, WHITE]].forEach(function (e) { l.push(e); });
      }
      if (b !== 4) for (var c = 0; c < 9; c++) {
        var cx = c * 170 + r() * 80, cy = 160 + r() * 120, cz = -300 - r() * 200, cw = 60 + r() * 50;
        l.push([cx, cy, cz, cw, 14, 30, WHITE], [cx + 10, cy + 12, cz, cw * 0.6, 12, 26, WHITE], [cx - cw * 0.3, cy - 4, cz, cw * 0.5, 10, 28, 0xf4f8ff]);
      }
      return l;
    }
    var farGeo = [], farMeshes = [0, 1, 2].map(function () { return mesh(new T.BufferGeometry()); });
    farMeshes.forEach(function (m) { m.visible = false; scene.add(m); });
    function syncFar(camX) {
      var n = Math.floor(camX / FAR_P);
      for (var i = 0; i < 3; i++) {
        var seg = n - 1 + i, b = biomeAt(seg * FAR_P + FAR_P / 2), m = farMeshes[i];
        if (!farGeo[b]) farGeo[b] = build(farBoxes(b));
        m.geometry = farGeo[b]; m.position.x = seg * FAR_P; m.visible = true;
      }
    }
    // Sky: a gradient dome that follows the camera, with stars and a moon at night.
    var skyGeo = new T.SphereGeometry(300, 24, 12), skyCol = new Float32Array(skyGeo.attributes.position.count * 3);
    skyGeo.setAttribute('color', new T.BufferAttribute(skyCol, 3));
    var sky = new T.Mesh(skyGeo, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide, fog: false, depthWrite: false }));
    sky.renderOrder = -2; scene.add(sky);
    var starPos = new Float32Array(160 * 3), sr = rng(5);
    for (var si = 0; si < 160; si++) { var th = sr() * 6.28, ph = 0.12 + sr() * 1.2; starPos[si * 3] = Math.cos(th) * Math.cos(ph) * 280; starPos[si * 3 + 1] = Math.sin(ph) * 280; starPos[si * 3 + 2] = Math.sin(th) * Math.cos(ph) * 280; }
    var starGeo = new T.BufferGeometry(); starGeo.setAttribute('position', new T.BufferAttribute(starPos, 3));
    var stars = new T.Points(starGeo, new T.PointsMaterial({ color: 0xffffff, size: 2.4, sizeAttenuation: false, fog: false, transparent: true, opacity: 0 }));
    var moon = new T.Mesh(new T.CircleGeometry(18, 20), new T.MeshBasicMaterial({ color: 0xfff6c8, fog: false, transparent: true, opacity: 0 }));
    moon.position.set(90, 140, -230); moon.lookAt(0, 0, 0);
    sky.add(stars, moon);
    var look = { top: new T.Color(), low: new T.Color(), fog: new T.Color(), hs: new T.Color(), hg: new T.Color(), sun: new T.Color(), hi: 1.6, si: 2.2, night: 0 };
    var want = { top: new T.Color(), low: new T.Color(), fog: new T.Color(), hs: new T.Color(), hg: new T.Color(), sun: new T.Color(), hi: 1.6, si: 2.2, night: 0 };
    function aim(o, b) { var P = BIO[b]; o.top.setHex(P.sky[0]); o.low.setHex(P.sky[1]); o.fog.setHex(P.fog); o.hs.setHex(P.hemi[0]); o.hg.setHex(P.hemi[1]); o.hi = P.hemi[2]; o.sun.setHex(P.sun[0]); o.si = P.sun[1]; o.night = b === 4 ? 1 : 0; }
    function paintSky() {
      var p = skyGeo.attributes.position;
      for (var i = 0; i < p.count; i++) { var t = Math.max(0, Math.min(1, p.getY(i) / 300 * 1.6 + 0.1)); C.copy(look.low).lerp(look.top, t); skyCol[i * 3] = C.r; skyCol[i * 3 + 1] = C.g; skyCol[i * 3 + 2] = C.b; }
      skyGeo.attributes.color.needsUpdate = true;
      scene.fog.color.copy(look.fog); hemi.color.copy(look.hs); hemi.groundColor.copy(look.hg); hemi.intensity = look.hi; sun.color.copy(look.sun); sun.intensity = look.si;
      stars.material.opacity = look.night; moon.material.opacity = look.night; stars.visible = moon.visible = look.night > 0.02;
      renderer.setClearColor(look.fog);
    }
    var skyMix = 1;
    view.setBiome = function (b, instant) {
      aim(want, b);
      if (instant) { aim(look, b); skyMix = 1; paintSky(); } else skyMix = 0;
    };
    function stepSky(dt) {
      if (skyMix >= 1) return;
      skyMix = Math.min(1, skyMix + dt * 0.4);
      var k = skyMix >= 1 ? 1 : 1 - Math.exp(-dt * 2.2);
      ['top', 'low', 'fog', 'hs', 'hg', 'sun'].forEach(function (n) { look[n].lerp(want[n], k); });
      look.hi += (want.hi - look.hi) * k; look.si += (want.si - look.si) * k; look.night += (want.night - look.night) * k;
      paintSky();
    }

    /* --------------------------------------------- instanced small things */
    function inst(geo, mat, cap) { var m = new T.InstancedMesh(geo, mat, cap); m.count = 0; m.frustumCulled = false; scene.add(m); return m; }
    var eggs = inst(model('egg', ITEM.egg), MATS, 64), fruits = [0, 1, 2, 3, 4].map(function (i) { return inst(model('fruit' + i, ITEM['fruit' + i]), MATS, 16); });
    var hearts = inst(model('heart', ITEM.heart), MATS, 4);
    var shadowGeo = new T.CircleGeometry(0.5, 16); shadowGeo.rotateX(-Math.PI / 2);
    var shadows = inst(shadowGeo, new T.MeshBasicMaterial({ color: 0x1a1030, transparent: true, opacity: 0.22, depthWrite: false }), 80);
    shadows.renderOrder = 1;
    var PCAP = 260, cubes = inst(new T.BoxGeometry(1, 1, 1), new T.MeshBasicMaterial({ color: 0xffffff }), PCAP);
    // Coloured from the start, so the shader compileRest builds is the one the first dust uses.
    cubes.setColorAt(0, C.setHex(0xffffff)); cubes.visible = false;
    var pd = new Float32Array(PCAP * 12), pn = 0;
    var flies = inst(new T.BoxGeometry(0.07, 0.07, 0.07), new T.MeshBasicMaterial({ color: 0xeaff7a, fog: false }), 40);
    var starsAround = inst(model('star', ITEM.star), MATS, 5);
    function put(im, i, x, y, z, s, ry, rz, sy) {
      E.set(0, ry || 0, rz || 0); Q.setFromEuler(E); V1.set(x, y, z); S1.set(s, sy || s, s);
      M4.compose(V1, Q, S1); im.setMatrixAt(i, M4);
    }
    function shadow(i, x, y, z, size) {
      if (i >= 80) return i;
      var k = Math.max(0.25, 1 - Math.max(0, y) * 0.22);
      put(shadows, i, x, 0.03, z, size * k);
      return i + 1;
    }
    // Particles: [x, y, z, vx, vy, vz, life, max, size, gravity, spin, colour]
    view.burst = function (x, y, z, o) {
      if (view.calm) return;
      var n = o.count || 10, cols = o.colors || [0xffffff];
      for (var i = 0; i < n; i++) {
        var j;
        if (pn < PCAP) j = pn++; else j = (Math.random() * PCAP) | 0;
        var a = Math.random() * 6.283, el = (o.up != null ? o.up : 0.5) + Math.random() * (o.spread != null ? o.spread : 1), sp = (o.speed || 3) * (0.5 + Math.random() * 0.6), d = pd, k = j * 12;
        d[k] = x + (Math.random() - 0.5) * (o.jitter || 0.2); d[k + 1] = y; d[k + 2] = z + (Math.random() - 0.5) * (o.jitter || 0.2);
        d[k + 3] = Math.cos(a) * sp * (o.flat || 1) + (o.vx || 0); d[k + 4] = el * sp; d[k + 5] = Math.sin(a) * sp * (o.flat || 1);
        d[k + 6] = d[k + 7] = (o.life || 0.6) * (0.6 + Math.random() * 0.5); d[k + 8] = (o.size || 0.12) * (0.6 + Math.random() * 0.8);
        d[k + 9] = o.gravity != null ? o.gravity : 9; d[k + 10] = (Math.random() - 0.5) * 12; d[k + 11] = cols[(Math.random() * cols.length) | 0];
      }
    };
    function stepParticles(dt) {
      for (var i = 0; i < pn; i++) {
        var k = i * 12, d = pd;
        d[k + 6] -= dt;
        if (d[k + 6] <= 0) { pn--; if (i !== pn) { for (var c = 0; c < 12; c++) d[k + c] = d[pn * 12 + c]; } i--; continue; }
        d[k + 4] -= d[k + 9] * dt; d[k] += d[k + 3] * dt; d[k + 1] += d[k + 4] * dt; d[k + 2] += d[k + 5] * dt;
        if (d[k + 1] < 0.02 && d[k + 9] > 0) { d[k + 1] = 0.02; d[k + 4] *= -0.35; d[k + 3] *= 0.7; d[k + 5] *= 0.7; }
      }
    }
    function drawParticles() {
      for (var i = 0; i < pn; i++) {
        var k = i * 12, d = pd, s = d[k + 8] * Math.min(1, d[k + 6] / d[k + 7] * 2);
        put(cubes, i, d[k], d[k + 1], d[k + 2], s, d[k + 10] * d[k + 6], d[k + 10] * 0.5 * d[k + 6]);
        C.setHex(d[k + 11]); cubes.setColorAt(i, C);
      }
      cubes.count = pn; cubes.instanceMatrix.needsUpdate = true; cubes.visible = pn > 0;
      if (cubes.instanceColor) cubes.instanceColor.needsUpdate = true;
    }

    /* ----------------------------------------------------- the dinos */
    var hero = null, heroLook = '';
    view.setLook = function (colorHex, hatId) {
      var key = colorHex + ':' + hatId;
      if (key === heroLook) return;
      heroLook = key;
      var old = hero;
      hero = makeDino(colorHex, hatId, 1);
      if (old) { hero.root.position.copy(old.root.position); scene.remove(old.root); old.dispose(); }
      scene.add(hero.root);
    };
    var family = new T.Group(), famDinos = [];
    (function () {
      var nest = [], r = rng(31);
      for (var i = 0; i < 14; i++) { var a = i / 14 * 6.283; nest.push([Math.cos(a) * 15, 0, Math.sin(a) * 15, 8, 3 + r() * 2, 8, i % 2 ? 0xb07a4a : 0x8a5a33]); }
      nest.push([0, 0, 0, 24, 1.4, 24, 0xd9a86a], [-4, 1.4, -3, 3.4, 4.4, 3.4, 0xfff6e0], [3, 1.4, 4, 3.4, 4.4, 3.4, 0xfff6e0], [3.6, 3.4, 5.75, 1, 1, 0.1, 0xff7eb6]);
      family.add(mesh(build(nest)));
      [[0xff8fb8, 1.75, -1.2, 0, -0.8], [0x6fb7ff, 1.9, 1.2, 0, -1.4], [0xffd23f, 0.85, 0.2, 0, 1.2]].forEach(function (f) {
        var d = makeDino(f[0], f[0] === 0x6fb7ff ? 'none' : 'none', f[1]);
        d.root.position.set(f[2], f[3], f[4]); d.root.rotation.y = Math.PI; family.add(d.root); famDinos.push(d);
      });
      family.visible = false; scene.add(family);
    })();

    /* ------------------------------------------------- obstacle meshes */
    var live = new Map(), pools = {};
    function obstacleKey(o, b) { return o.kind + ':' + b + ':' + (o.form || '') + ':' + (o.kind === 'block' || o.kind === 'flyer' ? o.look : 0); }
    function takeMesh(key, o, b) {
      var list = pools[key] || (pools[key] = []), m = list.pop();
      if (!m) {
        if (o.kind === 'flyer') {
          m = new T.Group();
          m.add(mesh(model('fb:' + o.look, function () { return OB.flyerBody(b, o.look); })), mesh(model('fw:' + o.look, function () { return OB.flyerWings(b, o.look); })));
        } else m = mesh(model(key, function () { return OB[o.kind](b, o.form, o.look); }));
        m.userData.key = key;
        scene.add(m);
      }
      m.visible = true; m.rotation.set(0, 0, 0); m.scale.set(1, 1, 1);
      return m;
    }
    function dropMesh(id) {
      var e = live.get(id);
      if (!e) return;
      e.m.visible = false; (pools[e.m.userData.key] || []).push(e.m); live.delete(id);
    }
    function syncObstacles(dt, t, camX, si) {
      var seen = {};
      if (world) for (var i = world.oi; i < world.obs.length; i++) {
        var o = world.obs[i];
        if (o.x > camX + 70) break;
        if (o.kind === 'gap' || o.kind === 'mud' || o.x + o.w < camX - 16) continue;
        var e = live.get(o.id);
        if (o.smashed && !(e && e.out)) { if (e) dropMesh(o.id); continue; }
        if (!e) { var b = biomeAt(o.x); e = { m: takeMesh(obstacleKey(o, b), o, b), out: 0 }; live.set(o.id, e); }
        seen[o.id] = 1;
        var m = e.m, cx = o.x + o.w / 2;
        m.position.set(cx, 0, 0);
        if (o.kind === 'roller') { m.position.y = 0.45; m.rotation.z = (o.x - (o.slot || 0)) / 0.45; }
        else if (o.kind === 'vine') { m.position.y = 4.5; m.rotation.z = Math.sin(t * 2 + o.id) * 0.07; }
        else if (o.kind === 'flyer') {
          m.position.y = (o.form === 'low' ? 0.64 : 1.34) + Math.sin(t * 5 + o.id) * 0.05;
          m.children[1].rotation.x = Math.sin(t * 12 + o.id) * 0.45;
        }
        if (o.hit) {
          // Bonked: it tumbles away, comically and harmlessly.
          e.out = Math.min(1.2, e.out + dt);
          m.position.x += e.out * 4; m.position.y += e.out * 5 - e.out * e.out * 9; m.position.z -= e.out * 3;
          m.rotation.z += e.out * 7; m.rotation.x = e.out * 3;
          if (e.out >= 1.2) m.visible = false;
        }
        if (m.visible && o.kind !== 'vine') si = shadow(si, cx, o.kind === 'flyer' ? o.y0 : 0, 0, o.kind === 'flyer' ? 1.3 : o.w + 0.5);
      }
      live.forEach(function (e, id) { if (!seen[id]) dropMesh(id); });
      return si;
    }
    view.resetCourse = function (w) {
      world = w;
      live.forEach(function (e, id) { dropMesh(id); });
      clearChunks(); pn = 0;
      family.visible = !!(w && !w.endless && isFinite(w.len));
      if (family.visible) family.position.set(w.len + 3.2, 0, 0);
    };
    view.world = function () { return world; };

    /* ------------------------------------------------------ dino animation */
    var anim = { run: 0, sq: 0, sqv: 0, tumble: 0, stars: 0, blink: 0, blinkT: 2, look: 0, hop: 0, hopv: 0, lean: 0, duck: 0, roar: 0 };
    view.kick = function (what, power) {
      if (what === 'jump') { anim.sq = 0.28; anim.sqv = 0; }
      else if (what === 'land') { anim.sq = -0.22 - 0.2 * (power || 0); anim.sqv = 0; }
      else if (what === 'bump') { anim.tumble = 1; anim.stars = 1.8; }
      else if (what === 'hop') { if (anim.hop <= 0.001) { anim.hopv = 4.2; anim.sq = 0.25; } }
      else if (what === 'roar') anim.roar = 1;
    };
    function animateDino(d, s, dt, t, ctx) {
      var a = anim, still = view.calm;
      a.sqv += (-120 * a.sq - 11 * a.sqv) * dt; a.sq += a.sqv * dt;
      if (Math.abs(a.sq) < 0.002 && Math.abs(a.sqv) < 0.01) a.sq = a.sqv = 0;
      a.duck += ((s.duck ? 1 : 0) - a.duck) * Math.min(1, dt * 18);
      a.lean += ((s.dash ? 1 : 0) - a.lean) * Math.min(1, dt * 10);
      a.roar = Math.max(0, a.roar - dt * 1.6);
      if (s.hop) { a.hopv -= 20 * dt; a.hop += a.hopv * dt; if (a.hop < 0) { if (a.hopv < -1) { a.sq = -0.25; a.sqv = 0; } a.hop = 0; a.hopv = 0; } }
      var sq = still ? 0 : a.sq, sy = 1 + sq - a.duck * 0.38, sx = 1 - sq * 0.6 + a.duck * 0.22;
      d.root.position.set(s.x, s.y + (s.hop ? a.hop : 0), s.z || 0);
      d.pivot.scale.set(sx, sy, 1 - sq * 0.5);
      if (a.tumble > 0) { a.tumble = Math.max(0, a.tumble - dt * 2.2); d.pivot.rotation.z = still ? 0 : (1 - a.tumble) * Math.PI * 2; d.pivot.position.y = Math.sin((1 - a.tumble) * Math.PI) * 0.6; }
      else { d.pivot.rotation.z = -a.lean * 0.35 - a.duck * 0.15; d.pivot.position.y = 0; }
      var air = !s.ground && !s.hop || (s.hop && a.hop > 0.01);
      if (s.running && !air) a.run += dt * (6 + s.speed * 1.5); else if (!air) a.run += dt * 2;
      var stride = s.running && !air ? Math.sin(a.run) : 0;
      d.legA.rotation.z = air ? 0.7 : stride * 0.9; d.legB.rotation.z = air ? 0.3 : -stride * 0.9;
      d.body.position.y = s.running && !air ? Math.abs(Math.sin(a.run)) * 0.06 : Math.sin(t * 2.2) * 0.012;
      d.tail.rotation.y = Math.sin(t * (s.running ? 9 : 3)) * (s.running ? 0.35 : 0.22);
      d.tail.rotation.z = air ? 0.3 : 0.05 + stride * 0.08;
      d.head.rotation.z = a.duck * -0.25 + (air ? 0.15 : 0) + (ctx.idle ? Math.sin(t * 0.9) * 0.08 : 0) - a.roar * 0.3;
      d.head.rotation.y = ctx.idle ? Math.sin(t * 0.5) * 0.35 : 0;
      a.blinkT -= dt;
      if (a.blinkT < 0) { a.blink = 0.14; a.blinkT = 2 + Math.random() * 3; }
      a.blink = Math.max(0, a.blink - dt);
      d.eyes.scale.y = a.blink > 0 ? 0.15 : 1;
      d.root.visible = !(s.hurt > 0 && !still && Math.floor(t * 12) % 2 === 0);
      var flash = a.roar > 0.05 || s.dash;
      if (d.flash !== flash) { d.flash = flash; d.parts.forEach(function (m) { m.material = flash ? FLASHMATS : MATS; }); }
      if (a.stars > 0) a.stars = Math.max(0, a.stars - dt);
    }

    /* -------------------------------------------------------------- camera */
    var cam = { x: 0, y: 3, z: 8, lx: 0, ly: 1, lz: 0, shake: 0, fov: 48 };
    view.shake = function (p) { if (!view.calm) cam.shake = Math.max(cam.shake, p); };
    view.project = function (x, y, z) {
      V2.set(x, y, z).project(camera);
      return { x: (V2.x + 1) / 2, y: (1 - V2.y) / 2 };
    };
    var rigs = {
      // Faster runs look further ahead.
      play: function (s) { var a = Math.max(0, Math.min(2.4, (s.speed - 6) * 0.3)); return [s.x - 1.1 + a, 3.2 + s.y * 0.35, 9.6 + a * 0.4, s.x + 3.9 + a, 1.05 + s.y * 0.3, 0]; },
      menu: function (s) { return [s.x + 2.2, 1.45, 4.3, s.x + 0.1, 0.95, 0]; },
      wardrobe: function (s) { return [s.x + 3.1, 1.7, 6.2, s.x - 1.55, 0.85, 0.6]; },
      finish: function (s) { return [s.x + 3.4, 2.6, 10.5, s.x - 1.3, 1.5, 0]; }
    };

    /* ---------------------------------------------------------------- frame */
    var fireT = 0, menuX = 0;
    // ctx: { mode: 'menu'|'play'|'wardrobe'|'finish', dt, t, player, spin }
    view.update = function (ctx) {
      var dt = Math.min(0.1, ctx.dt), t = ctx.t, s = ctx.player;
      if (!hero) return;
      stepSky(dt);
      animateDino(hero, s, dt, t, ctx);
      hero.root.rotation.y = ctx.spin || 0;
      // The family waits at the nest and bounces when the baby arrives.
      if (family.visible) famDinos.forEach(function (f, i) {
        var party = ctx.mode === 'finish';
        f.root.position.y = party && !view.calm ? Math.abs(Math.sin(t * 6 + i)) * 0.5 : 0;
        f.tail.rotation.y = Math.sin(t * (party ? 10 : 2.5) + i) * 0.35;
        f.head.rotation.z = Math.sin(t * 1.3 + i) * 0.1;
        f.eyes.scale.y = Math.sin(t * 0.7 + i * 2) > 0.98 ? 0.15 : 1;
      });
      // Camera rig with easing.
      var r = (rigs[ctx.mode] || rigs.play)(s), k = 1 - Math.exp(-dt * (ctx.mode === 'play' ? 6 : 3)), kx = ctx.mode === 'play' ? 1 - Math.exp(-dt * 14) : k;
      if (ctx.snap) kx = k = 1;
      cam.x += (r[0] - cam.x) * kx; cam.y += (r[1] - cam.y) * k; cam.z += (r[2] - cam.z) * k;
      cam.lx += (r[3] - cam.lx) * kx; cam.ly += (r[4] - cam.ly) * k; cam.lz += (r[5] - cam.lz) * k;
      cam.shake = Math.max(0, cam.shake - dt * 3);
      var sh = view.calm ? 0 : cam.shake * cam.shake;
      camera.position.set(cam.x + (Math.random() - 0.5) * sh, cam.y + (Math.random() - 0.5) * sh, cam.z);
      camera.lookAt(cam.lx, cam.ly, cam.lz);
      var fov = 48 + (s.dash ? 7 : 0);
      cam.fov += (fov - cam.fov) * Math.min(1, dt * 5);
      var aspect = camera.aspect, vf = aspect < 16 / 9 ? 2 * Math.atan(Math.tan(cam.fov * Math.PI / 360) * (16 / 9) / aspect) * 180 / Math.PI : cam.fov;
      if (Math.abs(camera.fov - vf) > 0.01) { camera.fov = vf; camera.updateProjectionMatrix(); }
      sky.position.copy(camera.position);
      var camX = cam.lx;
      syncChunks(camX, ctx.snap || chunks.size < 3); syncFar(camX);
      var si = shadow(0, s.x + 0.05, s.y + (s.hop ? anim.hop : 0), 0, 1.25 * (ctx.mode === 'wardrobe' ? 1.1 : 1));
      si = syncObstacles(dt, t, camX, si);
      // Eggs, fruit and hearts bob and spin.
      var ne = 0, nf = [0, 0, 0, 0, 0], nh = 0;
      if (world) for (var i = world.ii; i < world.items.length; i++) {
        var it = world.items[i];
        if (it.x > camX + 60) break;
        if (it.got || it.x < camX - 14) continue;
        var bob = view.calm ? 0 : Math.sin(t * 3 + it.id) * 0.08, spin = view.calm ? 0.6 : t * 2 + it.id;
        if (it.k === 'egg' && ne < 64) put(eggs, ne++, it.x, it.y + bob, 0, 1.3, spin);
        else if (it.k === 'fruit') { var fb = biomeAt(it.x); if (nf[fb] < 16) put(fruits[fb], nf[fb]++, it.x, it.y + bob, 0, 1.1, spin); }
        else if (it.k === 'heart' && nh < 4) put(hearts, nh++, it.x, it.y + bob, 0, 1.2, spin);
        if (it.y < 1) si = shadow(si, it.x, it.y, 0, 0.5);
      }
      eggs.count = ne; eggs.instanceMatrix.needsUpdate = true; eggs.visible = ne > 0;
      fruits.forEach(function (f, j) { f.count = nf[j]; f.instanceMatrix.needsUpdate = true; f.visible = nf[j] > 0; });
      hearts.count = nh; hearts.instanceMatrix.needsUpdate = true; hearts.visible = nh > 0;
      if (family.visible) famDinos.forEach(function (f) { si = shadow(si, family.position.x + f.root.position.x, f.root.position.y, f.root.position.z, 1.25 * f.root.scale.x); });
      shadows.count = si; shadows.instanceMatrix.needsUpdate = true;
      // Spinning stars after a bump.
      var ns = 0;
      if (anim.stars > 0 && !view.calm) for (var j = 0; j < 3; j++) { var aa = t * 6 + j * 2.09; put(starsAround, ns++, s.x + Math.cos(aa) * 0.55, s.y + 1.75 + Math.sin(t * 9 + j) * 0.05, Math.sin(aa) * 0.55, 1.4, t * 4); }
      starsAround.count = ns; starsAround.instanceMatrix.needsUpdate = true; starsAround.visible = ns > 0;
      // Fireflies at night, drifting near the camera.
      var nfl = 0;
      if (look.night > 0.3) for (var f = 0; f < 40; f++) {
        var fx = camX - 10 + ((f * 37.7 + t * 0.6) % 34), fy = 0.6 + (f * 13 % 30) / 10 + Math.sin(t * 1.3 + f) * 0.3, fz = -7 + (f * 7.3 % 10) + Math.cos(t + f) * 0.4;
        put(flies, nfl++, fx, fy, fz, Math.sin(t * 4 + f * 1.7) > -0.3 ? 1 : 0.01);
      }
      flies.count = nfl; flies.instanceMatrix.needsUpdate = true; flies.visible = nfl > 0;
      // Running dust.
      fireT -= dt;
      if (ctx.mode === 'play' && s.running && s.ground && fireT <= 0) { fireT = s.dash ? 0.03 : 0.14; view.burst(s.x - 0.3, 0.05, (Math.random() - 0.5) * 0.4, { count: s.dash ? 3 : 1, colors: s.dash ? [0xffffff, 0xffd23f] : [shade(BIO[biomeAt(s.x)].path[0], 0.9)], speed: 1, up: 0.5, life: 0.35, size: s.dash ? 0.12 : 0.08, gravity: 1, vx: -1.2 }); }
      stepParticles(dt); drawParticles();
    };
    view.render = function () { renderer.render(scene, camera); };
    view.resize = function (w, h) {
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix();
    };
    // Weak PCs: render fewer pixels if frames come slowly (never more than 1.5 dpr).
    var slow = 0;
    view.frameTime = function (ms) {
      if (ms > 26) slow++; else slow = Math.max(0, slow - 0.5);
      if (slow > 90 && ratio > 0.75) { ratio = Math.max(0.75, ratio - 0.25); renderer.setPixelRatio(ratio); slow = 0; return true; }
      return false;
    };
    view.ratio = function () { return ratio; };

    /* ------------------------------------------------------------ start-up */
    // Shaders. Where the browser builds them in the background (KHR_parallel_shader_compile),
    // every material is built before the first frame, hidden ones included, and the page
    // keeps answering meanwhile. Elsewhere the first frame builds the ones it shows and the
    // rest (eggs, fruit, the night sky) are queued with it, before the game says it is ready,
    // so the GPU process links them while the child looks at the title, not when the first
    // egg comes or just after a test or a child presses Play.
    var parallel = false;
    try { parallel = renderer.extensions.has('KHR_parallel_shader_compile'); } catch (e) { parallel = false; }
    view.prepare = function (done) {
      if (!parallel) { done(); return; }
      var called = false, fin = function () { if (!called) { called = true; done(); } };
      renderer.clear(); // the sky colour, not an empty canvas, while the shaders build
      renderer.compileAsync(scene, camera).then(fin, fin);
      setTimeout(fin, 6000);
    };
    view.compileRest = function () { if (!parallel) renderer.compile(scene, camera); };
    // Calls done() once the graphics card has finished every frame drawn so far. A fence is
    // polled between tasks, so the page answers clicks while a software renderer spends
    // seconds on a cold browser's first frame. Without fences (WebGL 1), with the context
    // lost, or after `limit` ms it goes on at once.
    view.whenDrawn = function (done, limit) {
      var gl = renderer.getContext(), t0 = performance.now(), sync = null;
      try { if (gl.fenceSync) { sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0); gl.flush(); } } catch (e) { sync = null; }
      (function poll() {
        var finished = !sync || gl.isContextLost() || performance.now() - t0 > limit;
        if (!finished) { try { finished = gl.getSyncParameter(sync, gl.SYNC_STATUS) === gl.SIGNALED; } catch (e) { finished = true; } }
        if (!finished) { setTimeout(poll, 16); return; }
        if (sync) { try { gl.deleteSync(sync); } catch (e) { /* ignore */ } }
        done();
      })();
    };
    view.calm = false;
    view.dispose = function () { renderer.dispose(); };
    view.setBiome(0, true);
    return view;
  };
})();
