/* Chaos Island (جزيرة الفوضى) — Three.js low-poly 3D tropical island renderer.
 * Merged static island geometry, instanced blob shadows/coins/rings/particles,
 * chunky expressive islanders with hats, and software-WebGL frame pacing. */
(function () {
  'use strict';

  function createView(canvas) {
    var T = window.THREE;
    var E = window.ChaosEngine;
    if (!T) throw new Error('three.js unavailable');

    var wgl = Kit.webgl.createRenderer(canvas);
    var software = wgl.software, renderer = wgl.renderer;

    var scene = new T.Scene();
    var skyNormal = new T.Color(0x52c4ff);
    var skyStorm = new T.Color(0x4b467a);
    var skyLava = new T.Color(0xff9266);
    var skyCur = skyNormal.clone();
    scene.background = skyCur;
    scene.fog = new T.Fog(0x7ad6ff, 34, 92);

    // Angled elevated 3D camera framing the entire floating tropical island cleanly.
    var camera = new T.PerspectiveCamera(38, 16 / 9, 0.5, 160);
    var camBase = new T.Vector3(0, 10.6, 23.8);
    var camLook = new T.Vector3(0, 2.35, -0.3);
    camera.position.copy(camBase);
    camera.lookAt(camLook);

    // Bright sunny cartoon lighting (hemisphere + warm sun + gentle rim fill).
    var hemi = new T.HemisphereLight(0xfffbe6, 0x3898b8, 1.45);
    var sun = new T.DirectionalLight(0xfff6dc, 2.0);
    sun.position.set(11, 20, 14);
    scene.add(hemi, sun);

    var C = new T.Color(), M4 = new T.Matrix4(), Q = new T.Quaternion(), EU = new T.Euler();
    var V1 = new T.Vector3(), V2 = new T.Vector3(), S1 = new T.Vector3();

    var MAT_LIT = new T.MeshLambertMaterial({ vertexColors: true });
    var MAT_GLOW = new T.MeshBasicMaterial({ vertexColors: true });

    /* ---------------------------------------------------- merged box builder */
    // Boxes: [cx, y0, cz, w, h, d, hex, glowFlag]
    function buildBoxes(boxes) {
      var lit = [], glow = [];
      for (var i = 0; i < boxes.length; i++) (boxes[i][7] ? glow : lit).push(boxes[i]);
      var all = lit.concat(glow);
      var n = all.length * 36;
      var pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
      var o = 0, r = 0, g = 0, b = 0;
      function v(x, y, z, nx, ny, nz) {
        pos[o] = x; pos[o + 1] = y; pos[o + 2] = z;
        nor[o] = nx; nor[o + 1] = ny; nor[o + 2] = nz;
        col[o] = r; col[o + 1] = g; col[o + 2] = b;
        o += 3;
      }
      function quad(a, bb, c, d, nx, ny, nz) {
        v(a[0], a[1], a[2], nx, ny, nz); v(bb[0], bb[1], bb[2], nx, ny, nz); v(c[0], c[1], c[2], nx, ny, nz);
        v(a[0], a[1], a[2], nx, ny, nz); v(c[0], c[1], c[2], nx, ny, nz); v(d[0], d[1], d[2], nx, ny, nz);
      }
      for (i = 0; i < all.length; i++) {
        var bx = all[i];
        var x0 = bx[0] - bx[3] * 0.5, x1 = bx[0] + bx[3] * 0.5;
        var y0 = bx[1], y1 = bx[1] + bx[4];
        var z0 = bx[2] - bx[5] * 0.5, z1 = bx[2] + bx[5] * 0.5;
        C.setHex(bx[6]); r = C.r; g = C.g; b = C.b;
        quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], 1, 0, 0);
        quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], -1, 0, 0);
        quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], 0, 1, 0);
        quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], 0, -1, 0);
        quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], 0, 0, 1);
        quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], 0, 0, -1);
      }
      var geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new T.BufferAttribute(nor, 3));
      geo.setAttribute('color', new T.BufferAttribute(col, 3));
      var split = lit.length * 36;
      geo.addGroup(0, split, 0);
      geo.addGroup(split, n - split, 1);
      geo.computeBoundingSphere();
      return geo;
    }

    function addPalm(boxes, x, y, z, h, leanX, leanZ) {
      var segs = 5;
      for (var i = 0; i < segs; i++) {
        var u = i / segs;
        var cx = x + leanX * u * u;
        var cz = z + leanZ * u * u;
        var w = 0.56 - u * 0.16;
        boxes.push([cx, y + i * (h / segs), cz, w, h / segs + 0.08, w, i % 2 ? 0x9c6238 : 0xb37444]);
      }
      var tx = x + leanX, ty = y + h, tz = z + leanZ;
      // Coconuts under crown
      boxes.push([tx - 0.25, ty - 0.25, tz + 0.22, 0.34, 0.34, 0.34, 0x6b3e1f]);
      boxes.push([tx + 0.24, ty - 0.22, tz - 0.18, 0.34, 0.34, 0.34, 0x7c4a26]);
      // Lush frond cross & drooping tips
      var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.72, 0.72], [-0.72, 0.72], [0.72, -0.72], [-0.72, -0.72]];
      for (var f = 0; f < dirs.length; f++) {
        var dx = dirs[f][0], dz = dirs[f][1];
        boxes.push([tx + dx * 0.9, ty + 0.12, tz + dz * 0.9, Math.abs(dx) > 0.3 ? 1.55 : 0.72, 0.22, Math.abs(dz) > 0.3 ? 1.55 : 0.72, f % 2 ? 0x3ec44a : 0x57db52]);
        boxes.push([tx + dx * 1.85, ty - 0.22, tz + dz * 1.85, 0.85, 0.18, 0.85, 0x2fb33e]);
      }
    }

    /* ---------------------------------------------------- static tropical island */
    function buildIsland() {
      var b = [];
      // Layered floating island cliff underside tapering into the turquoise sea
      b.push([0, -2.35, -0.2, 16.4, 1.0, 7.6, 0x8b5636]);
      b.push([0, -1.45, -0.2, 19.6, 1.15, 9.6, 0xb87849]);
      b.push([0, -1.45, -0.2, 16.8, 1.15, 11.2, 0xb87849]);
      // Rounded stepped golden sandy beach rim (no harsh rectangle corners!)
      b.push([0, -0.36, -0.1, 21.8, 0.56, 9.6, 0xf7d67e]);
      b.push([0, -0.36, -0.1, 18.8, 0.56, 11.8, 0xf7d67e]);
      b.push([0, -0.36,  0.2, 14.0, 0.56, 12.6, 0xfce092]);
      // Cute wooden pier jutting out into the front-right turquoise sea
      b.push([7.6, -0.75, 6.2, 0.28, 1.0, 0.28, 0x804b24]);
      b.push([9.4, -0.75, 6.2, 0.28, 1.0, 0.28, 0x804b24]);
      b.push([8.5, 0.12, 5.7, 2.2, 0.16, 2.0, 0xd4914a]);
      // Main emerald grass island deck (top surface strictly y = 0.30, zero Z-overlap!)
      b.push([0, -0.20, -0.3, 20.0, 0.50, 7.8, 0x52cf4c]);
      b.push([0, -0.20, -0.2, 17.6, 0.50, 9.2, 0x52cf4c]);
      b.push([0, 0.10, -2.9, 16.4, 0.20, 3.0, 0x45bf42]);
      // Playful stepping stone path along the island center
      for (var sx = -8.4; sx <= 8.4; sx += 2.1) {
        b.push([sx, 0.30, 0.1, 1.15, 0.04, 1.35, 0xede0ba]);
      }

      // 1) Wooden crates (strictly stacked heights — zero Z-fighting!)
      // crate_w1: x -9.2..-7.2, y 1.65
      b.push([-8.2, 0.30, 0, 2.0, 1.24, 1.9, 0xd48d44]);
      b.push([-8.2, 0.45, 0.96, 1.65, 0.95, 0.06, 0xa86428]);
      b.push([-8.2, 1.54, 0, 2.08, 0.11, 1.98, 0xebad5b]);
      // crate_mid_l: x -3.2..-1.7, y 1.65
      b.push([-2.45, 0.30, 0, 1.5, 1.24, 1.7, 0xd48d44]);
      b.push([-2.45, 0.45, 0.87, 1.2, 0.95, 0.06, 0xa86428]);
      b.push([-2.45, 1.54, 0, 1.58, 0.11, 1.78, 0xebad5b]);
      // crate_e1: x 4.0..6.0, y 1.75
      b.push([5.0, 0.30, 0, 2.0, 1.34, 1.9, 0xd48d44]);
      b.push([5.0, 0.45, 0.96, 1.65, 1.05, 0.06, 0xa86428]);
      b.push([5.0, 1.64, 0, 2.08, 0.11, 1.98, 0xebad5b]);

      // 2) West Lookout Tower (west_deck: y 3.0; west_top: y 4.65)
      var wx = [-7.35, -4.75], wz = [-0.85, 0.85];
      for (var i = 0; i < 2; i++) for (var j = 0; j < 2; j++) {
        b.push([wx[i], 0.30, wz[j], 0.36, 2.44, 0.36, 0x8f552b]);
      }
      b.push([-6.05, 2.74, 0, 3.35, 0.17, 2.2, 0xc98340]);
      b.push([-6.05, 2.91, 0, 3.44, 0.09, 2.28, 0xebad5b]);
      b.push([-6.05, 3.45, -1.0, 3.3, 0.18, 0.14, 0x9c5f2e]);
      b.push([-7.3, 3.0, -1.0, 0.18, 0.7, 0.18, 0x8f552b]);
      b.push([-4.8, 3.0, -1.0, 0.18, 0.7, 0.18, 0x8f552b]);
      b.push([-6.75, 3.0, -0.7, 0.28, 1.42, 0.28, 0x8f552b]);
      b.push([-5.05, 3.0, -0.7, 0.28, 1.42, 0.28, 0x8f552b]);
      b.push([-5.9, 4.42, 0, 2.24, 0.15, 2.0, 0xd48e46]);
      b.push([-5.9, 4.57, 0, 2.32, 0.08, 2.08, 0xf5be6c]);
      b.push([-6.75, 4.65, -0.75, 0.14, 1.85, 0.14, 0x6b3e1f]);
      b.push([-6.08, 5.78, -0.75, 1.24, 0.56, 0.08, 0xff4968]);

      // 3) Rope Bridge (bridge: x -4.4..-1.6, y 3.0)
      for (var bx = -4.25; bx <= -1.75; bx += 0.5) {
        b.push([bx, 2.86, 0, 0.42, 0.14, 1.8, Math.round(bx * 2) % 2 ? 0xd9974e : 0xc47e39]);
      }
      b.push([-3.0, 3.45, -0.88, 2.9, 0.10, 0.10, 0xe8d094]);

      // 4) Central Stone Shelter & Striped Lighthouse (strictly non-overlapping Y layers!)
      b.push([-1.42, 0.30, -0.95, 0.50, 2.44, 0.50, 0xd8d6e0]);
      b.push([ 1.42, 0.30, -0.95, 0.50, 2.44, 0.50, 0xd8d6e0]);
      b.push([-1.42, 0.30,  0.95, 0.44, 2.44, 0.44, 0xebe9f2]);
      b.push([ 1.42, 0.30,  0.95, 0.44, 2.44, 0.44, 0xebe9f2]);
      b.push([0, 0.30, -1.08, 2.8, 2.44, 0.24, 0xc4c7d6]);
      b.push([0, 1.38, -0.92, 0.90, 1.00, 0.08, 0x35e6ff, 1]);
      // Roof deck: white slab 2.74..2.91, coral top cap 2.91..3.00 (ZERO overlap!)
      b.push([0, 2.74, 0, 3.24, 0.17, 2.34, 0xf2f0f5]);
      b.push([0, 2.91, 0, 3.34, 0.09, 2.44, 0xff5a6e]);
      // Upper Lighthouse column
      b.push([0, 3.00, -0.55, 1.68, 0.86, 1.32, 0xffffff]);
      b.push([0, 3.86, -0.55, 1.56, 0.86, 1.24, 0xff4b5c]);
      // Lighthouse top balcony: cream slab 4.72..4.87, gold trim 4.87..4.95
      b.push([0, 4.72, 0, 2.82, 0.15, 2.14, 0xfff6e0]);
      b.push([0, 4.87, 0, 2.90, 0.08, 2.22, 0xffcf33]);
      // Glowing lantern cupola
      b.push([0, 4.95, -0.72, 0.86, 0.82, 0.86, 0xffe966, 1]);
      b.push([0, 5.77, -0.72, 1.18, 0.34, 1.18, 0xff4b5c]);
      b.push([0, 6.11, -0.72, 0.56, 0.34, 0.56, 0xff4b5c]);

      // 5) East Bamboo Tiki Hut (east_deck: y 3.3; east_top: y 4.85)
      var ex = [5.55, 8.65];
      for (var ei = 0; ei < 2; ei++) for (var ej = 0; ej < 2; ej++) {
        b.push([ex[ei], 0.30, wz[ej], 0.34, 2.74, 0.34, 0xbd8d46]);
      }
      b.push([7.1, 3.04, 0, 3.82, 0.17, 2.24, 0xdba754]);
      b.push([7.1, 3.21, 0, 3.90, 0.09, 2.32, 0xf5c86e]);
      b.push([5.95, 3.30, -0.82, 0.26, 1.32, 0.26, 0x9c6e32]);
      b.push([8.25, 3.30, -0.82, 0.26, 1.32, 0.26, 0x9c6e32]);
      b.push([7.1, 4.62, 0, 2.64, 0.15, 2.1, 0xe8b548]);
      b.push([7.1, 4.77, 0, 2.74, 0.08, 2.18, 0xffd559]);
      b.push([7.1, 4.85, -0.72, 2.0, 0.50, 0.72, 0xf2be49]);
      b.push([7.1, 5.35, -0.72, 1.1, 0.36, 0.52, 0xffde75]);

      // 6) Scenic tropical props
      // Cute smoking miniature volcano on back-left
      b.push([-7.4, -0.1, -4.4, 5.2, 2.4, 4.0, 0x6b566b]);
      b.push([-7.4, 2.3, -4.4, 3.6, 2.0, 3.0, 0x7c657c]);
      b.push([-7.4, 4.3, -4.4, 2.2, 1.3, 2.0, 0x5c4a5e]);
      b.push([-7.4, 5.6, -4.4, 1.38, 0.24, 1.28, 0xff6e2b, 1]);
      // Lush palm trees framing the island
      addPalm(b, -9.3, 0.25, -2.9, 4.5, -0.9, -0.4);
      addPalm(b,  3.5, 0.25, -3.5, 4.8,  0.7, -0.4);
      addPalm(b,  9.2, 0.25, -2.8, 4.4,  1.0, -0.3);
      // Cute striped beach umbrella on front-left sandy beach (z = +3.6, never blocks action!)
      b.push([-8.5, 0.18, 3.6, 0.14, 1.65, 0.14, 0xfff6e0]);
      b.push([-8.5, 1.72, 3.6, 1.95, 0.24, 1.95, 0xff5a7a]);
      b.push([-8.5, 1.96, 3.6, 1.15, 0.22, 1.15, 0xffe14d]);
      // Colourful tropical flowers & coastal boulders
      var flowers = [[-5.6, 3.2, 0xff5ca8], [-2.0, 3.4, 0xffe14d], [1.6, 3.3, 0xff6b4a], [4.6, 3.2, 0x45e3ff], [7.8, 3.1, 0xff5ca8]];
      for (var fi = 0; fi < flowers.length; fi++) {
        b.push([flowers[fi][0], 0.22, flowers[fi][1], 0.56, 0.30, 0.56, 0x38b343]);
        b.push([flowers[fi][0], 0.52, flowers[fi][1], 0.34, 0.22, 0.34, flowers[fi][2]]);
      }
      b.push([9.8, -0.4, 2.4, 1.3, 1.0, 1.2, 0x8e95a8]);
      b.push([-9.8, -0.4, 2.1, 1.4, 0.95, 1.3, 0x8e95a8]);

      var mesh = new T.Mesh(buildBoxes(b), [MAT_LIT, MAT_GLOW]);
      scene.add(mesh);
    }
    buildIsland();

    // Cheerful low-poly glowing Sun in upper-left sky
    var sunOrb = new T.Mesh(
      new T.IcosahedronGeometry(1.65, 1),
      new T.MeshBasicMaterial({ color: 0xffe966 })
    );
    sunOrb.position.set(-14.5, 10.6, -24);
    scene.add(sunOrb);

    // Bouncy Tiki Drum (separate animated mesh at DRUM.x = 2.75)
    var drumGroup = new T.Group();
    drumGroup.position.set(E.DRUM.x, E.GROUND_Y, 0);
    var drumMesh = new T.Mesh(
      new T.CylinderGeometry(0.88, 0.72, 0.56, 12),
      new T.MeshLambertMaterial({ color: 0xff4968 })
    );
    drumMesh.position.y = 0.28;
    var drumTop = new T.Mesh(
      new T.CylinderGeometry(0.82, 0.82, 0.14, 12),
      new T.MeshLambertMaterial({ color: 0xffe45c })
    );
    drumTop.position.y = 0.58;
    drumGroup.add(drumMesh, drumTop);
    scene.add(drumGroup);

    // Sparkling Ocean & Rising Lava Surface
    var seaMat = new T.MeshLambertMaterial({ color: 0x16b8e8 });
    var seaMesh = new T.Mesh(new T.PlaneGeometry(160, 120, 1, 1), seaMat);
    seaMesh.rotation.x = -Math.PI / 2;
    seaMesh.position.y = -1.65;
    scene.add(seaMesh);

    // Subtle ocean foam ring hugging the island
    var foamMat = new T.MeshBasicMaterial({ color: 0xbff5ff, transparent: true, opacity: 0.78 });
    var foamMesh = new T.Mesh(new T.RingGeometry(10.6, 11.7, 28), foamMat);
    foamMesh.rotation.x = -Math.PI / 2;
    foamMesh.scale.set(1.05, 0.56, 1);
    foamMesh.position.set(0, -1.58, -0.1);
    scene.add(foamMesh);

    // Rising Lava Flood plane (hidden when below sea level!)
    var lavaMat = new T.MeshBasicMaterial({ color: 0xff5a1f, transparent: true, opacity: 0.90 });
    var lavaMesh = new T.Mesh(new T.PlaneGeometry(140, 100), lavaMat);
    lavaMesh.rotation.x = -Math.PI / 2;
    lavaMesh.position.y = -2.2;
    lavaMesh.visible = false;
    scene.add(lavaMesh);

    // Puffy drifting low-poly clouds framed neatly in the sky band
    var clouds = [];
    var cloudGeo = buildBoxes([
      [0, 0, 0, 2.8, 0.95, 1.5, 0xffffff],
      [-1.1, 0.22, 0.1, 1.5, 0.9, 1.2, 0xf2f8ff],
      [1.1, 0.16, -0.1, 1.6, 0.82, 1.2, 0xffffff],
      [0, 0.62, 0, 1.5, 0.72, 1.1, 0xffffff]
    ]);
    for (var cl = 0; cl < 5; cl++) {
      var cm = new T.Mesh(cloudGeo, [MAT_LIT, MAT_GLOW]);
      cm.position.set(-20 + cl * 10, 7.6 + (cl % 2) * 1.1, -13 - (cl % 3) * 3.5);
      var sc = 0.82 + (cl % 3) * 0.22;
      cm.scale.set(sc, sc, sc);
      scene.add(cm);
      clouds.push({ mesh: cm, speed: 0.35 + (cl % 3) * 0.14 });
    }

    /* ---------------------------------------------------- cute chunky islanders */
    var HAT_GEOS = {};
    function hatGeo(id) {
      if (HAT_GEOS[id]) return HAT_GEOS[id];
      var b = [];
      if (id === 'leaf') {
        b.push([0, 0, 0, 0.12, 0.36, 0.12, 0x38a832]);
        b.push([0.32, 0.28, 0, 0.68, 0.12, 0.42, 0x57db52]);
        b.push([-0.26, 0.24, 0.12, 0.56, 0.12, 0.36, 0x3ec44a]);
      } else if (id === 'shades') {
        b.push([-0.22, -0.34, 0.44, 0.32, 0.22, 0.1, 0x1d2340]);
        b.push([ 0.22, -0.34, 0.44, 0.32, 0.22, 0.1, 0x1d2340]);
        b.push([ 0, -0.30, 0.44, 0.72, 0.08, 0.08, 0x1d2340]);
        b.push([-0.22, -0.30, 0.49, 0.14, 0.06, 0.04, 0x6ce5ff, 1]);
      } else if (id === 'pirate') {
        b.push([0, 0, 0, 1.05, 0.16, 0.85, 0x26263a]);
        b.push([0, 0.16, 0, 0.78, 0.42, 0.62, 0x2f2f47]);
        b.push([0, 0.28, 0.33, 0.24, 0.24, 0.06, 0xffe14d]);
      } else if (id === 'party') {
        b.push([0, 0, 0, 0.62, 0.22, 0.62, 0x8a5cff]);
        b.push([0, 0.22, 0, 0.44, 0.24, 0.44, 0xffcf33]);
        b.push([0, 0.46, 0, 0.26, 0.22, 0.26, 0xff5aa8]);
        b.push([0, 0.68, 0, 0.22, 0.22, 0.22, 0xffffff]);
      } else if (id === 'viking') {
        b.push([0, 0, 0, 0.82, 0.36, 0.82, 0x9aa8bf]);
        b.push([-0.52, 0.16, 0, 0.28, 0.18, 0.18, 0xfff6e0]);
        b.push([-0.62, 0.34, 0, 0.18, 0.28, 0.18, 0xfff6e0]);
        b.push([ 0.52, 0.16, 0, 0.28, 0.18, 0.18, 0xfff6e0]);
        b.push([ 0.62, 0.34, 0, 0.18, 0.28, 0.18, 0xfff6e0]);
      } else if (id === 'dino') {
        b.push([0, 0, 0, 0.88, 0.38, 0.88, 0x4fd158]);
        b.push([0, 0.36, -0.22, 0.22, 0.24, 0.22, 0xff922e]);
        b.push([0, 0.32, 0.12, 0.22, 0.26, 0.22, 0xff922e]);
      } else if (id === 'crown') {
        b.push([0, 0, 0, 0.76, 0.20, 0.76, 0xffcf2e]);
        b.push([-0.28, 0.20, 0.28, 0.18, 0.24, 0.18, 0xffdf4d]);
        b.push([ 0.28, 0.20, 0.28, 0.18, 0.24, 0.18, 0xffdf4d]);
        b.push([ 0.00, 0.20, 0.28, 0.18, 0.30, 0.18, 0xff4968]);
        b.push([-0.28, 0.20, -0.28, 0.18, 0.24, 0.18, 0xffdf4d]);
        b.push([ 0.28, 0.20, -0.28, 0.18, 0.24, 0.18, 0xffdf4d]);
      }
      HAT_GEOS[id] = b.length ? buildBoxes(b) : null;
      return HAT_GEOS[id];
    }

    var bodyGeo = new T.BoxGeometry(0.68, 0.56, 0.52);
    var headGeo = new T.BoxGeometry(0.76, 0.68, 0.72);
    var limbGeo = new T.BoxGeometry(0.22, 0.36, 0.22);
    var eyeGeo = new T.BoxGeometry(0.14, 0.18, 0.06);
    var shineGeo = new T.BoxGeometry(0.06, 0.06, 0.07);
    var cheekGeo = new T.BoxGeometry(0.14, 0.08, 0.05);
    var markerGeo = new T.ConeGeometry(0.26, 0.42, 4);
    var shieldGeo = new T.RingGeometry(0.55, 0.72, 16);

    var matWhite = new T.MeshBasicMaterial({ color: 0xffffff });
    var matInk = new T.MeshBasicMaterial({ color: 0x1c1d33 });
    var matCheek = new T.MeshBasicMaterial({ color: 0xff85a8 });
    var matSkin = new T.MeshLambertMaterial({ color: 0xffe2be });
    var matP1Mark = new T.MeshBasicMaterial({ color: 0xffe135 });
    var matP2Mark = new T.MeshBasicMaterial({ color: 0xff5a8a });
    var matShield = new T.MeshBasicMaterial({ color: 0x3df0ff, side: T.DoubleSide, transparent: true, opacity: 0.7 });

    var actorMeshes = [];
    function ensureActorMeshes(count) {
      while (actorMeshes.length < count) {
        var root = new T.Group();
        var rig = new T.Group();
        root.add(rig);

        var bodyMat = new T.MeshLambertMaterial({ color: 0x2ea8ff });
        var limbMat = new T.MeshLambertMaterial({ color: 0x1e78c8 });
        var body = new T.Mesh(bodyGeo, bodyMat);
        body.position.y = 0.56;
        rig.add(body);

        var head = new T.Mesh(headGeo, matSkin);
        head.position.y = 1.16;
        rig.add(head);

        // Big expressive cute eyes + white shine + rosy cheeks
        var eyeL = new T.Mesh(eyeGeo, matInk); eyeL.position.set(-0.18, 1.18, 0.36);
        var eyeR = new T.Mesh(eyeGeo, matInk); eyeR.position.set( 0.18, 1.18, 0.36);
        var shL = new T.Mesh(shineGeo, matWhite); shL.position.set(-0.15, 1.22, 0.38);
        var shR = new T.Mesh(shineGeo, matWhite); shR.position.set( 0.21, 1.22, 0.38);
        var chL = new T.Mesh(cheekGeo, matCheek); chL.position.set(-0.27, 1.04, 0.36);
        var chR = new T.Mesh(cheekGeo, matCheek); chR.position.set( 0.27, 1.04, 0.36);
        rig.add(eyeL, eyeR, shL, shR, chL, chR);

        var legL = new T.Mesh(limbGeo, limbMat); legL.position.set(-0.18, 0.18, 0);
        var legR = new T.Mesh(limbGeo, limbMat); legR.position.set( 0.18, 0.18, 0);
        var armL = new T.Mesh(limbGeo, bodyMat); armL.position.set(-0.44, 0.58, 0);
        var armR = new T.Mesh(limbGeo, bodyMat); armR.position.set( 0.44, 0.58, 0);
        rig.add(legL, legR, armL, armR);

        var hatAnchor = new T.Group();
        hatAnchor.position.set(0, 1.50, 0);
        rig.add(hatAnchor);

        // Floating player marker diamond/arrow above human players
        var mark = new T.Mesh(markerGeo, matP1Mark);
        mark.rotation.x = Math.PI;
        mark.position.y = 2.38;
        mark.visible = false;
        root.add(mark);

        // Safe-shelter halo ring
        var shield = new T.Mesh(shieldGeo, matShield);
        shield.rotation.x = -Math.PI / 2;
        shield.position.y = 0.08;
        shield.visible = false;
        root.add(shield);

        scene.add(root);
        actorMeshes.push({
          root: root, rig: rig, bodyMat: bodyMat, limbMat: limbMat,
          legL: legL, legR: legR, armL: armL, armR: armR,
          hatAnchor: hatAnchor, hatMesh: null, hatId: 'none',
          mark: mark, shield: shield, colorHex: -1
        });
      }
    }

    function setActorLook(m, colorHex, hatId, humanIndex) {
      if (m.colorHex !== colorHex) {
        m.colorHex = colorHex;
        m.bodyMat.color.setHex(colorHex);
        C.setHex(colorHex).multiplyScalar(0.72);
        m.limbMat.color.copy(C);
      }
      if (m.hatId !== hatId) {
        m.hatId = hatId;
        if (m.hatMesh) { m.hatAnchor.remove(m.hatMesh); m.hatMesh = null; }
        var geo = hatGeo(hatId);
        if (geo) {
          m.hatMesh = new T.Mesh(geo, [MAT_LIT, MAT_GLOW]);
          m.hatAnchor.add(m.hatMesh);
        }
      }
      m.mark.visible = humanIndex >= 0;
      if (humanIndex >= 0) m.mark.material = humanIndex === 0 ? matP1Mark : matP2Mark;
    }

    /* ---------------------------------------------------- instanced props & hazards */
    // Blob shadows (1 draw call for all actors, meteors, coconuts!)
    var MAX_SHADOWS = 32;
    var shadowGeo = new T.CircleGeometry(0.55, 14);
    shadowGeo.rotateX(-Math.PI / 2);
    var shadowMat = new T.MeshBasicMaterial({ color: 0x102838, transparent: true, opacity: 0.34, depthWrite: false });
    var shadows = new T.InstancedMesh(shadowGeo, shadowMat, MAX_SHADOWS);
    shadows.instanceMatrix.setUsage(T.DynamicDrawUsage);
    scene.add(shadows);

    // Spinning golden coins (1 draw call!)
    var MAX_COINS = 16;
    var coinGeo = new T.CylinderGeometry(0.36, 0.36, 0.14, 12);
    coinGeo.rotateX(Math.PI / 2);
    var coinMat = new T.MeshLambertMaterial({ color: 0xffd22e, emissive: 0x8a5200, emissiveIntensity: 0.35 });
    var coinInst = new T.InstancedMesh(coinGeo, coinMat, MAX_COINS);
    coinInst.instanceMatrix.setUsage(T.DynamicDrawUsage);
    scene.add(coinInst);

    // Pulsing warning target rings (meteors & lightning)
    var MAX_RINGS = 24;
    var ringGeo = new T.RingGeometry(0.45, 1.35, 20);
    ringGeo.rotateX(-Math.PI / 2);
    var ringMat = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, side: T.DoubleSide, depthWrite: false });
    var ringInst = new T.InstancedMesh(ringGeo, ringMat, MAX_RINGS);
    ringInst.instanceMatrix.setUsage(T.DynamicDrawUsage);
    scene.add(ringInst);

    // Falling fiery meteors (1 draw call!)
    var MAX_METEORS = 18;
    var meteorGeo = new T.DodecahedronGeometry(0.68, 0);
    var meteorMat = new T.MeshLambertMaterial({ color: 0xff4c1e, emissive: 0xff8018, emissiveIntensity: 0.7 });
    var meteorInst = new T.InstancedMesh(meteorGeo, meteorMat, MAX_METEORS);
    meteorInst.instanceMatrix.setUsage(T.DynamicDrawUsage);
    scene.add(meteorInst);

    // Lightning bolts (glowing yellow pillars, 1 draw call!)
    var MAX_BOLTS = 12;
    var boltGeo = new T.CylinderGeometry(0.18, 0.42, 14, 6);
    var boltMat = new T.MeshBasicMaterial({ color: 0xfff36b, transparent: true, opacity: 0.92 });
    var boltInst = new T.InstancedMesh(boltGeo, boltMat, MAX_BOLTS);
    boltInst.instanceMatrix.setUsage(T.DynamicDrawUsage);
    scene.add(boltInst);

    // Giant rolling coconuts (1 draw call!)
    var MAX_COCOS = 12;
    var cocoGeo = new T.IcosahedronGeometry(0.92, 1);
    var cocoMat = new T.MeshLambertMaterial({ color: 0x7a4722 });
    var cocoInst = new T.InstancedMesh(cocoGeo, cocoMat, MAX_COCOS);
    cocoInst.instanceMatrix.setUsage(T.DynamicDrawUsage);
    scene.add(cocoInst);

    // Edge coconut warning cones
    var warnConeGeo = new T.ConeGeometry(0.42, 0.95, 6);
    var warnConeMat = new T.MeshBasicMaterial({ color: 0xff3b3b });
    var warnConeInst = new T.InstancedMesh(warnConeGeo, warnConeMat, MAX_COCOS);
    warnConeInst.instanceMatrix.setUsage(T.DynamicDrawUsage);
    scene.add(warnConeInst);

    // Earthquake glowing magma cracks & geysers
    var MAX_CRACKS = 12;
    var crackGeo = new T.BoxGeometry(2.6, 0.14, 1.9);
    var crackMat = new T.MeshBasicMaterial({ color: 0xff4518 });
    var crackInst = new T.InstancedMesh(crackGeo, crackMat, MAX_CRACKS);
    crackInst.instanceMatrix.setUsage(T.DynamicDrawUsage);
    scene.add(crackInst);

    var geyserGeo = new T.BoxGeometry(2.3, 1.6, 1.4);
    var geyserMat = new T.MeshBasicMaterial({ color: 0xffa824, transparent: true, opacity: 0.85 });
    var geyserInst = new T.InstancedMesh(geyserGeo, geyserMat, MAX_CRACKS);
    geyserInst.instanceMatrix.setUsage(T.DynamicDrawUsage);
    scene.add(geyserInst);

    // Swirling 3D Tornado Funnel (group of 7 rotating rings)
    var tornadoGroup = new T.Group();
    tornadoGroup.visible = false;
    var torRings = [];
    for (var tr = 0; tr < 7; tr++) {
      var rad = 0.55 + tr * 0.34;
      var rm = new T.Mesh(
        new T.TorusGeometry(rad, 0.18 + tr * 0.02, 6, 14),
        new T.MeshBasicMaterial({ color: tr % 2 ? 0xd9f7ff : 0x7ae2ff, transparent: true, opacity: 0.72 })
      );
      rm.rotation.x = Math.PI / 2;
      rm.position.y = 0.45 + tr * 1.15;
      tornadoGroup.add(rm);
      torRings.push(rm);
    }
    scene.add(tornadoGroup);

    // Pooled 3D Particles (1 draw call, zero per-frame allocations!)
    var MAX_PART = 140;
    var partGeo = new T.BoxGeometry(1, 1, 1);
    var partMat = new T.MeshBasicMaterial({ color: 0xffffff });
    var partInst = new T.InstancedMesh(partGeo, partMat, MAX_PART);
    partInst.instanceMatrix.setUsage(T.DynamicDrawUsage);
    scene.add(partInst);

    var parts = [];
    for (var pi = 0; pi < MAX_PART; pi++) {
      parts.push({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 0.2, g: 14, color: 0xffffff });
    }
    var partCursor = 0;

    function burst(x, y, z, opts) {
      if (view.calm) return;
      opts = opts || {};
      var count = opts.count || 12;
      var colors = opts.colors || [0xffffff, 0xffd23f];
      var speed = opts.speed || 5.5;
      var up = opts.up != null ? opts.up : 4.0;
      var life = opts.life || 0.65;
      var size = opts.size || 0.24;
      var g = opts.gravity != null ? opts.gravity : 15;
      for (var i = 0; i < count; i++) {
        var p = parts[partCursor];
        partCursor = (partCursor + 1) % MAX_PART;
        var a = Math.random() * Math.PI * 2;
        var sp = speed * (0.35 + Math.random() * 0.65);
        p.x = x; p.y = y; p.z = z;
        p.vx = Math.cos(a) * sp;
        p.vy = up * (0.4 + Math.random() * 0.8) + (Math.random() - 0.3) * sp * 0.5;
        p.vz = Math.sin(a) * sp * 0.6;
        p.max = life * (0.65 + Math.random() * 0.45);
        p.life = p.max;
        p.size = size * (0.7 + Math.random() * 0.6);
        p.g = g;
        p.color = colors[i % colors.length];
      }
    }

    var shakePow = 0;
    function addShake(power) {
      if (!view.calm) shakePow = Math.max(shakePow, power);
    }

    function setInst(inst, idx, x, y, z, sx, sy, sz, rx, ry, rz) {
      EU.set(rx || 0, ry || 0, rz || 0);
      Q.setFromEuler(EU);
      V1.set(x, y, z);
      S1.set(sx, sy, sz);
      M4.compose(V1, Q, S1);
      inst.setMatrixAt(idx, M4);
    }

    /* ---------------------------------------------------- per-frame scene sync */
    function sync(world, ctx) {
      var dt = ctx.dt || 0;
      var t = ctx.t || 0;
      var camMode = ctx.mode || 'play';

      // Sky mood shifts gently with active disaster!
      var targetSky = skyNormal;
      if (world && !world.demo && world.phase === 'active') {
        if (world.disaster === 'lightning' || world.disaster === 'tornado') targetSky = skyStorm;
        else if (world.disaster === 'flood' || world.disaster === 'meteor' || world.disaster === 'quake') targetSky = skyLava;
      }
      skyCur.lerp(targetSky, Math.min(1, dt * 3.5));
      scene.fog.color.copy(skyCur).lerp(C.setHex(0xffffff), 0.25);

      // Gentle cloud drift & ocean breathing
      for (var c = 0; c < clouds.length; c++) {
        var cl = clouds[c];
        cl.mesh.position.x += cl.speed * dt;
        if (cl.mesh.position.x > 26) cl.mesh.position.x = -26;
      }
      seaMesh.position.y = -1.65 + Math.sin(t * 2.1) * 0.08;
      foamMesh.scale.set(1.05 + Math.sin(t * 2.4) * 0.03, 0.56 + Math.sin(t * 2.4) * 0.02, 1);

      // Camera framing + gentle menu sway + reduced-motion-safe shake
      shakePow = view.calm ? 0 : Math.max(0, shakePow - dt * 2.6);
      var qShake = (!view.calm && world && world.quakeShake > 0) ? world.quakeShake * 0.35 : 0;
      var sh = Math.max(shakePow * 0.32, qShake);
      var sx = sh > 0 ? (Math.random() - 0.5) * 2 * sh : 0;
      var sy = sh > 0 ? (Math.random() - 0.5) * 2 * sh : 0;

      if (camMode === 'shop') {
        // Place camera looking cleanly at preview hero on open front-left beach/grass
        V2.set(-2.2, 2.65, 8.2);
        camera.position.lerp(V2, Math.min(1, dt * 8));
        V1.set(-2.8, 1.25, 2.4);
        camera.lookAt(V1);
      } else {
        var swayX = (camMode === 'title' && !view.calm) ? Math.sin(t * 0.45) * 2.4 : 0;
        var swayY = (camMode === 'title' && !view.calm) ? Math.cos(t * 0.35) * 0.5 : 0;
        V2.set(camBase.x + swayX + sx, camBase.y + swayY + sy, camBase.z);
        if (ctx.snap) camera.position.copy(V2);
        else camera.position.lerp(V2, Math.min(1, dt * 8));
        V1.set(camLook.x + sx * 0.4, camLook.y + sy * 0.4, camLook.z);
        camera.lookAt(V1);
      }

      // Drum bounce animation
      if (world && world.drumBounceT > 0) {
        var ds = 1 + Math.sin((world.drumBounceT / 0.35) * Math.PI) * 0.35;
        drumGroup.scale.set(ds, 2 - ds, ds);
      } else {
        drumGroup.scale.set(1, 1, 1);
      }

      // Lava flood plane
      if (world && world.lavaY > -1.55) {
        lavaMesh.visible = true;
        lavaMesh.position.y = world.lavaY;
        lavaMat.color.setHex(Math.sin(t * 8) > 0 ? 0xff5a1f : 0xff7722);
      } else {
        lavaMesh.visible = false;
      }

      // Sync Actors + blob shadows
      var shIdx = 0;
      var list = world ? world.actors : [];
      ensureActorMeshes(list.length);
      for (var i = 0; i < actorMeshes.length; i++) {
        var m = actorMeshes[i];
        if (i >= list.length) { m.root.visible = false; continue; }
        var a = list[i];
        m.root.visible = true;
        var colHex = E.COLORS[a.colorIndex] ? E.COLORS[a.colorIndex].hex : 0x2ea8ff;
        var hatId = E.HATS[a.hatIndex] ? E.HATS[a.hatIndex].id : 'none';
        setActorLook(m, colHex, hatId, a.isHuman ? a.humanIndex : -1);

        m.root.position.set(a.x, a.y, a.zOff);
        // Smooth facing toward run direction (slightly angled toward camera for cute readability!)
        var targetYaw = a.facing >= 0 ? 0.52 : -0.52;
        if (camMode === 'shop' && i === 0) targetYaw = Math.sin(t * 1.1) * 0.55;
        m.rig.rotation.y = targetYaw;

        // Squash & stretch + hurt blink + ghost bob
        var sqY = a.squash;
        var sqXZ = 1 / Math.sqrt(Math.max(0.5, sqY));
        if (a.ghost) {
          m.rig.scale.set(0.85, 0.85, 0.85);
          m.bodyMat.transparent = true; m.bodyMat.opacity = 0.45;
          m.limbMat.transparent = true; m.limbMat.opacity = 0.45;
        } else {
          m.rig.scale.set(sqXZ, sqY, sqXZ);
          m.bodyMat.transparent = false; m.bodyMat.opacity = 1;
          m.limbMat.transparent = false; m.limbMat.opacity = 1;
        }
        // Flash emissive white/red briefly on hurt
        m.bodyMat.emissive.setHex(a.hurtT > 0 && Math.floor(a.hurtT * 24) % 2 === 0 ? 0xff3b3b : 0x000000);
        m.bodyMat.emissiveIntensity = a.hurtT > 0 ? 0.6 : 0;

        // Limb swing + cute idle bob
        var swing = a.ground ? Math.sin(a.runPhase) * 0.72 : 0.45;
        m.legL.rotation.x = swing;
        m.legR.rotation.x = -swing;
        m.armL.rotation.x = -swing * 0.85;
        m.armR.rotation.x = swing * 0.85;
        m.rig.position.y = (a.ground && Math.abs(a.vx) < 0.5) ? Math.abs(Math.sin(t * 4.2 + i)) * 0.08 : 0;

        // Player arrow bob
        if (m.mark.visible) m.mark.position.y = 2.32 + Math.sin(t * 6 + i) * 0.14;
        // Shelter shield ring during tornado / lightning
        m.shield.visible = !!(a.alive && a.sheltered && world && (world.disaster === 'tornado' || world.disaster === 'lightning') && world.phase === 'active');

        // Blob shadow underneath alive actors
        if (a.alive && shIdx < MAX_SHADOWS) {
          var syGround = E.GROUND_Y;
          for (var pi = 0; pi < E.PLATFORMS.length; pi++) {
            var pl = E.PLATFORMS[pi];
            if (a.x >= pl.x1 && a.x <= pl.x2 && pl.y <= a.y + 0.08 && pl.y > syGround) syGround = pl.y;
          }
          var distH = Math.max(0, a.y - syGround);
          var sScale = Math.max(0.35, 1 - distH * 0.14);
          setInst(shadows, shIdx++, a.x, syGround + 0.03, a.zOff, sScale, 1, sScale);
        }
      }

      // Coins
      var cnIdx = 0;
      var coinList = world ? world.coins : [];
      for (var ci = 0; ci < coinList.length && cnIdx < MAX_COINS; ci++) {
        var co = coinList[ci];
        if (co.taken) continue;
        setInst(coinInst, cnIdx++, co.x, co.y + Math.sin(t * 4.5 + co.phase) * 0.14, 0, 1, 1, 1, 0, t * 2.8 + co.phase, 0);
      }
      coinInst.count = cnIdx;
      coinInst.instanceMatrix.needsUpdate = true;

      // Meteors + Warning Rings
      var rnIdx = 0, mtIdx = 0;
      var mList = world ? world.meteors : [];
      for (var mi = 0; mi < mList.length; mi++) {
        var mt = mList[mi];
        if (!mt.hit && rnIdx < MAX_RINGS) {
          var prog = Math.min(1, mt.t / mt.telegraph);
          var pulse = 0.72 + Math.sin(t * 22) * 0.12 + prog * 0.32;
          setInst(ringInst, rnIdx, mt.tx, mt.ty + 0.05, 0, pulse, 1, pulse);
          ringInst.setColorAt(rnIdx, C.setHex(prog > 0.75 ? 0xff2424 : 0xff5a2b));
          rnIdx++;
        }
        if (mtIdx < MAX_METEORS) {
          var scM = mt.hit ? Math.max(0.01, 1 - mt.fade * 2.4) : 1.05;
          setInst(meteorInst, mtIdx++, mt.x, mt.y, 0, scM, scM, scM, t * 6 + mi, t * 5, 0);
        }
      }
      meteorInst.count = mtIdx;
      meteorInst.instanceMatrix.needsUpdate = true;

      // Lightning warning rings + striking bolts
      var blIdx = 0;
      var bList = world ? world.bolts : [];
      for (var bi = 0; bi < bList.length; bi++) {
        var bo = bList[bi];
        if (!bo.struck && rnIdx < MAX_RINGS) {
          var bp = Math.min(1, bo.t / bo.telegraph);
          var bsc = 0.68 + Math.sin(t * 26) * 0.14 + bp * 0.35;
          setInst(ringInst, rnIdx, bo.x, bo.y + 0.06, 0, bsc, 1, bsc);
          ringInst.setColorAt(rnIdx, C.setHex(0xffe93b));
          rnIdx++;
        } else if (bo.struck && blIdx < MAX_BOLTS) {
          var alphaSc = Math.max(0.05, 1 - bo.fade / 0.36);
          setInst(boltInst, blIdx++, bo.x, bo.y + 7.0, 0, alphaSc * 1.15, 1, alphaSc * 1.15, 0, t * 18, 0);
        }
      }
      ringInst.count = rnIdx;
      ringInst.instanceMatrix.needsUpdate = true;
      if (ringInst.instanceColor) ringInst.instanceColor.needsUpdate = true;
      boltInst.count = blIdx;
      boltInst.instanceMatrix.needsUpdate = true;

      // Giant Rolling Coconuts + Edge Warning Cones
      var coIdx = 0, wcIdx = 0;
      var cocoList = world ? world.coconuts : [];
      for (var ki = 0; ki < cocoList.length; ki++) {
        var cc = cocoList[ki];
        if (cc.warnT > 0) {
          if (wcIdx < MAX_COCOS) {
            var pulseW = 0.85 + Math.sin(t * 24) * 0.25;
            var edgeX = cc.dir > 0 ? Math.max(-9.6, cc.x + 0.8) : Math.min(9.6, cc.x - 0.8);
            setInst(warnConeInst, wcIdx++, edgeX, cc.y + 0.2, 0.3, pulseW, pulseW, pulseW, 0, 0, cc.dir > 0 ? -Math.PI / 2 : Math.PI / 2);
          }
        } else if (coIdx < MAX_COCOS) {
          setInst(cocoInst, coIdx++, cc.x, cc.y, 0, 1, 1, 1, 0, 0, cc.rot);
          if (shIdx < MAX_SHADOWS) {
            setInst(shadows, shIdx++, cc.x, Math.max(E.GROUND_Y, cc.y - cc.r) + 0.03, 0, 1.35, 1, 1.35);
          }
        }
      }
      cocoInst.count = coIdx;
      cocoInst.instanceMatrix.needsUpdate = true;
      warnConeInst.count = wcIdx;
      warnConeInst.instanceMatrix.needsUpdate = true;

      // Earthquake magma cracks + eruptions
      var crIdx = 0, gyIdx = 0;
      var crList = world ? world.cracks : [];
      for (var qi = 0; qi < crList.length; qi++) {
        var q = crList[qi];
        if (crIdx < MAX_CRACKS) {
          var scC = q.erupted ? 1.05 : 0.72 + Math.sin(t * 24) * 0.14;
          setInst(crackInst, crIdx++, q.x, q.y + 0.04, 0, scC, 1, scC);
        }
        if (q.erupted && gyIdx < MAX_CRACKS) {
          var gh = 0.7 + Math.sin(t * 26 + qi) * 0.35;
          setInst(geyserInst, gyIdx++, q.x, q.y + gh * 0.8, 0, 1, gh, 1);
        }
      }
      crackInst.count = crIdx;
      crackInst.instanceMatrix.needsUpdate = true;
      geyserInst.count = gyIdx;
      geyserInst.instanceMatrix.needsUpdate = true;

      // Tornado
      if (world && world.tornado) {
        tornadoGroup.visible = true;
        tornadoGroup.position.set(world.tornado.x, E.GROUND_Y, 0);
        var tScale = world.tornado.active ? 1.0 : Math.min(1, world.tornado.t / 0.75);
        tornadoGroup.scale.set(tScale, tScale, tScale);
        for (var r2 = 0; r2 < torRings.length; r2++) {
          torRings[r2].rotation.z = t * (6 + r2 * 1.4);
          torRings[r2].position.x = Math.sin(t * 7 + r2 * 0.9) * (0.12 + r2 * 0.06);
        }
      } else {
        tornadoGroup.visible = false;
      }

      // Finalize blob shadows
      shadows.count = shIdx;
      shadows.instanceMatrix.needsUpdate = true;

      // Step & draw particles
      var ptIdx = 0;
      for (var p = 0; p < MAX_PART; p++) {
        var pt = parts[p];
        if (pt.life <= 0) continue;
        pt.life -= dt;
        if (pt.life <= 0) continue;
        pt.vy -= pt.g * dt;
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.z += pt.vz * dt;
        var s = pt.size * Math.max(0.05, pt.life / pt.max);
        setInst(partInst, ptIdx, pt.x, pt.y, pt.z, s, s, s, t * 5 + p, t * 4, 0);
        partInst.setColorAt(ptIdx, C.setHex(pt.color));
        ptIdx++;
      }
      partInst.count = ptIdx;
      partInst.instanceMatrix.needsUpdate = true;
      if (partInst.instanceColor) partInst.instanceColor.needsUpdate = true;
    }

    /* ---------------------------------------------------- software WebGL pacing */
    var pace = Kit.webgl.pacer(renderer, { software: software });

    var view = {
      renderer: renderer,
      scene: scene,
      camera: camera,
      calm: false,
      software: software,
      burst: burst,
      shake: addShake,
      sync: sync,
      mayDraw: pace.mayDraw,
      render: function () {
        renderer.render(scene, camera);
        pace.markDrawn();
      },
      resize: function (w, h) {
        renderer.setSize(w, h, false);
        camera.aspect = w / Math.max(1, h);
        camera.updateProjectionMatrix();
      },
      prepare: function (done) {
        try { renderer.compile(scene, camera); } catch (e) { /* ignore */ }
        done();
      },
      whenDrawn: pace.whenDrawn,
      dispose: function () { pace.dispose(); renderer.dispose(); }
    };

    return view;
  }

  window.ChaosArt = { createView: createView };
})();
