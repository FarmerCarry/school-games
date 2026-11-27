/* Toy Castle (قلعة الألعاب) — Three.js 3D Tabletop Toy Diorama Renderer.
 * Low-poly plastic-brick castles, 3 merged-geometry playroom worlds, chunky
 * animated 3D toy units, swivel cork cannons with ballistic arc preview,
 * floating parachute crates, instanced shadows & brick-confetti particles,
 * and software-WebGL fence pacing. */
(function () {
  'use strict';

  function createView(canvas) {
    var T = window.THREE;
    var E = window.ToyCastleEngine;
    if (!T) throw new Error('three.js unavailable');

    var wgl = Kit.webgl.createRenderer(canvas);
    var software = wgl.software, renderer = wgl.renderer;

    var scene = new T.Scene();
    var bgColor = new T.Color(0x6fd4ff);
    scene.background = bgColor;
    scene.fog = new T.Fog(0x9ce3ff, 34, 86);

    // Wide tabletop 3/4 view showing both toy castles and the full battle lane
    var camera = new T.PerspectiveCamera(34, 16 / 9, 0.5, 160);
    var camBase = new T.Vector3(0, 8.8, 28.5);
    var camLook = new T.Vector3(0, 2.35, -0.4);
    camera.position.copy(camBase);
    camera.lookAt(camLook);

    // Bright sunny cartoon playroom lighting
    var hemi = new T.HemisphereLight(0xfffbe8, 0x5c89b8, 1.5);
    var sun = new T.DirectionalLight(0xfff6dd, 1.9);
    sun.position.set(10, 22, 16);
    var rim = new T.DirectionalLight(0xb8e6ff, 0.55);
    rim.position.set(-14, 12, -10);
    scene.add(hemi, sun, rim);

    // Reusable scratch math objects (zero hot-loop GC)
    var C = new T.Color();
    var M4 = new T.Matrix4();
    var Q = new T.Quaternion();
    var EU = new T.Euler();
    var V1 = new T.Vector3();
    var V2 = new T.Vector3();
    var S1 = new T.Vector3();
    var RAY = new T.Raycaster();
    var PLANE_Z = new T.Plane(new T.Vector3(0, 0, 1), 0);
    var HIT_PT = new T.Vector3();
    var NDC = new T.Vector2();

    var MAT_LIT = new T.MeshLambertMaterial({ vertexColors: true });
    var MAT_GLOW = new T.MeshBasicMaterial({ vertexColors: true });
    var matCache = {};
    function mat(hex, basic) {
      var key = (basic ? 'b_' : 'l_') + hex;
      if (!matCache[key]) {
        matCache[key] = basic
          ? new T.MeshBasicMaterial({ color: hex })
          : new T.MeshLambertMaterial({ color: hex });
      }
      return matCache[key];
    }

    var UNIT_BOX = new T.BoxGeometry(1, 1, 1);
    var UNIT_CYL = new T.CylinderGeometry(0.5, 0.5, 1, 10);
    var UNIT_CONE = new T.ConeGeometry(0.5, 1, 8);
    var UNIT_SPH = new T.SphereGeometry(0.5, 10, 8);

    function mkBox(w, h, d, hex, x, y, z, basic) {
      var m = new T.Mesh(UNIT_BOX, mat(hex, basic));
      m.scale.set(w, h, d);
      m.position.set(x || 0, y || 0, z || 0);
      return m;
    }
    function mkCyl(rt, h, hex, x, y, z, basic) {
      var m = new T.Mesh(UNIT_CYL, mat(hex, basic));
      m.scale.set(rt * 2, h, rt * 2);
      m.position.set(x || 0, y || 0, z || 0);
      return m;
    }
    function mkCone(r, h, hex, x, y, z) {
      var m = new T.Mesh(UNIT_CONE, mat(hex));
      m.scale.set(r * 2, h, r * 2);
      m.position.set(x || 0, y || 0, z || 0);
      return m;
    }
    function mkSph(r, hex, x, y, z, basic) {
      var m = new T.Mesh(UNIT_SPH, mat(hex, basic));
      m.scale.set(r * 2, r * 2, r * 2);
      m.position.set(x || 0, y || 0, z || 0);
      return m;
    }

    /* ------------------------------------------- merged static diorama builder */
    // Boxes: [cx, y0, cz, w, h, d, hex, glowFlag]
    function buildMergedBoxes(boxes) {
      var lit = [], glow = [];
      for (var i = 0; i < boxes.length; i++) (boxes[i][7] ? glow : lit).push(boxes[i]);
      var all = lit.concat(glow);
      var n = all.length * 36;
      var pos = new Float32Array(n * 3);
      var nor = new Float32Array(n * 3);
      var col = new Float32Array(n * 3);
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
      return new T.Mesh(geo, [MAT_LIT, MAT_GLOW]);
    }

    function addStudBrick(b, x, y, z, w, h, d, hex, studsX, studsZ) {
      b.push([x, y, z, w, h, d, hex]);
      var sx = studsX || Math.max(1, Math.round(w));
      var sz = studsZ || Math.max(1, Math.round(d));
      for (var ix = 0; ix < sx; ix++) {
        for (var iz = 0; iz < sz; iz++) {
          var ox = (ix + 0.5) / sx - 0.5;
          var oz = (iz + 0.5) / sz - 0.5;
          b.push([x + ox * w * 0.78, y + h, z + oz * d * 0.78, 0.36, 0.16, 0.36, hex]);
        }
      }
    }

    function addToyTree(b, x, y, z, s, leafHex) {
      b.push([x, y, z, 0.5 * s, 1.45 * s, 0.5 * s, 0xa86934]);
      b.push([x, y + 1.3 * s, z, 1.9 * s, 1.4 * s, 1.9 * s, leafHex]);
      b.push([x, y + 2.55 * s, z, 1.35 * s, 0.9 * s, 1.35 * s, leafHex === 0x3ec44a ? 0x5be060 : 0x45d6c5]);
      // Cute red toy berries
      b.push([x - 0.55 * s, y + 1.85 * s, z + 0.96 * s, 0.28 * s, 0.28 * s, 0.14 * s, 0xff595e]);
      b.push([x + 0.45 * s, y + 2.2 * s, z + 0.96 * s, 0.28 * s, 0.28 * s, 0.14 * s, 0xffca3a]);
    }

    /* ---------------------------------------------------- 3 Playroom Worlds */
    function buildWorld0Carpet() {
      var b = [];
      // Solid warm wooden tabletop base filling lower frame cleanly
      b.push([0, -5.8, -1.0, 44, 5.4, 22, 0xc88947]);
      b.push([0, -0.45, -1.0, 44, 0.46, 22.4, 0xedb876]);
      // Cozy sage-green playroom rug field (top y = 0.04)
      b.push([0, -0.06, -0.8, 32.4, 0.10, 14.2, 0x57c85f]);
      // Vivid checkered playmat battle lane sitting cleanly ON TOP of the rug (top y = 0.10)!
      var tileW = 1.65;
      for (var i = -7; i <= 7; i++) {
        var c1 = (i & 1) ? 0xfff4c2 : 0xffdc6b;
        var c2 = (i & 1) ? 0xffdc6b : 0xfff4c2;
        b.push([i * tileW, 0.03, -0.68, tileW - 0.04, 0.07, 1.32, c1]);
        b.push([i * tileW, 0.03, 0.68, tileW - 0.04, 0.07, 1.32, c2]);
      }
      // Colorful stitched lane edge bumpers
      b.push([0, 0.04, -1.55, 25.5, 0.16, 0.28, 0xff595e]);
      b.push([0, 0.04, 1.55, 25.5, 0.16, 0.28, 0x38bdf8]);
      // White wooden picket fence along rear of lane
      for (var fx = -9.5; fx <= 9.5; fx += 1.9) {
        b.push([fx, 0.04, -2.55, 0.22, 0.86, 0.16, 0xfff9ef]);
      }
      b.push([0, 0.56, -2.55, 20.0, 0.14, 0.12, 0xfff9ef]);
      // Wide wooden playroom shelf moulding across the horizon (no vertical sky seams!)
      b.push([0, -0.4, -8.8, 56, 1.15, 3.6, 0xc78946]);
      b.push([0, 0.72, -8.8, 56, 0.22, 3.8, 0xedb876]);
      // Stacked colorful wooden ABC blocks & pyramids
      addStudBrick(b, -8.0, 0.05, -5.2, 2.2, 2.0, 2.2, 0xff595e, 2, 2);
      addStudBrick(b, -6.0, 0.05, -5.8, 2.4, 3.2, 2.4, 0xffca3a, 2, 2);
      b.push([-6.0, 3.40, -5.8, 1.8, 1.1, 1.8, 0x4cc9f0]);
      b.push([-6.0, 4.50, -5.8, 1.0, 0.8, 1.0, 0x4cc9f0]);
      addStudBrick(b, -1.6, 0.05, -6.4, 2.6, 2.2, 2.2, 0x8ac926, 2, 2);
      addStudBrick(b, 1.4, 0.05, -6.0, 2.4, 3.4, 2.4, 0x4cc9f0, 2, 2);
      addStudBrick(b, 4.4, 0.05, -5.6, 2.5, 2.4, 2.2, 0xff9f1c, 2, 2);
      addStudBrick(b, 7.6, 0.05, -5.4, 2.4, 2.8, 2.4, 0xb565f7, 2, 2);
      // Lollipop toy trees framing the playroom
      addToyTree(b, -9.2, 0.04, -3.7, 0.95, 0x3ec44a);
      addToyTree(b, -3.9, 0.04, -4.3, 1.12, 0x4ad657);
      addToyTree(b, 3.2, 0.04, -4.2, 1.05, 0x3ec44a);
      addToyTree(b, 9.1, 0.04, -3.7, 0.95, 0x4ad657);
      // Foreground toy pebbles & miniature blocks
      b.push([-6.8, 0.04, 3.1, 0.9, 0.55, 0.9, 0xffca3a]);
      b.push([-5.7, 0.04, 3.4, 0.7, 0.42, 0.7, 0xff595e]);
      b.push([6.2, 0.04, 3.2, 0.95, 0.58, 0.95, 0x4cc9f0]);
      b.push([7.3, 0.04, 2.9, 0.65, 0.42, 0.65, 0x8ac926]);
      return buildMergedBoxes(b);
    }

    function buildWorld1Blocks() {
      var b = [];
      // Shimmering turquoise plastic-brick river moat under bridge
      b.push([0, -2.0, -1.0, 36, 1.4, 18, 0x1aa6d1]);
      b.push([0, -0.6, -1.0, 36, 0.22, 17, 0x38d2f7]);
      // Brick island shores on left and right for the castles
      addStudBrick(b, -12.6, -0.45, 0.0, 6.2, 0.55, 6.8, 0x52cc5c, 4, 4);
      addStudBrick(b, 12.6, -0.45, 0.0, 6.2, 0.55, 6.8, 0x52cc5c, 4, 4);
      // Iconic plastic-brick bridge across the moat!
      b.push([0, -0.5, 0.0, 20.4, 0.5, 3.2, 0xf2d091]);
      for (var i = -6; i <= 6; i++) {
        var col = (i & 1) ? 0xf7e6c4 : 0xe8d0a0;
        b.push([i * 1.55, -0.06, 0.0, 1.48, 0.07, 2.7, col]);
      }
      // Brick bridge pillars dipping into the turquoise moat
      for (var px = -6.5; px <= 6.5; px += 6.5) {
        b.push([px, -1.4, -1.35, 1.3, 1.4, 0.6, 0xd4a359]);
        b.push([px, -1.4, 1.35, 1.3, 1.4, 0.6, 0xd4a359]);
      }
      // Studded colorful bridge side railings
      for (var rx = -8.5; rx <= 8.5; rx += 2.125) {
        addStudBrick(b, rx, 0.0, -1.65, 1.1, 0.52, 0.34, rx < 0 ? 0x3b82f6 : 0xff595e, 2, 1);
        addStudBrick(b, rx, 0.0, 1.65, 1.1, 0.35, 0.34, 0xffcc00, 2, 1);
      }
      // Giant colorful Lego-style brick wall & arches in the backdrop!
      addStudBrick(b, -8.2, -0.4, -6.0, 3.6, 4.6, 2.6, 0xff595e, 3, 2);
      addStudBrick(b, -4.4, -0.4, -6.2, 3.8, 3.2, 2.6, 0xffca3a, 3, 2);
      addStudBrick(b, 0.0, -0.4, -6.5, 4.8, 5.4, 2.8, 0x3b82f6, 4, 2);
      addStudBrick(b, 0.0, 5.1, -6.5, 2.8, 1.6, 2.2, 0xffcc00, 2, 2);
      addStudBrick(b, 4.6, -0.4, -6.2, 3.8, 3.6, 2.6, 0x2ec4b6, 3, 2);
      addStudBrick(b, 8.4, -0.4, -6.0, 3.6, 4.8, 2.6, 0x9b5de5, 3, 2);
      // Cute floating yellow rubber ducks in foreground moat!
      b.push([-4.4, -0.42, 3.6, 1.15, 0.65, 0.85, 0xffe033]);
      b.push([-3.95, 0.22, 3.6, 0.65, 0.62, 0.62, 0xffe033]);
      b.push([-3.55, 0.42, 3.6, 0.36, 0.2, 0.32, 0xff7b29]);
      b.push([4.8, -0.42, 3.8, 1.15, 0.65, 0.85, 0xffe033]);
      b.push([4.35, 0.22, 3.8, 0.65, 0.62, 0.62, 0xffe033]);
      b.push([3.95, 0.42, 3.8, 0.36, 0.2, 0.32, 0xff7b29]);
      return buildMergedBoxes(b);
    }

    function buildWorld2Space() {
      var b = [];
      // School desk wood underneath a bright cyan-blue cutting mat
      b.push([0, -2.2, -1.0, 36, 1.8, 18, 0x4c4488]);
      b.push([0, -0.35, -0.8, 33, 0.35, 14.5, 0x2a669c]);
      // Sleek grid runway battle lane
      b.push([0, -0.05, 0.0, 25.8, 0.06, 3.1, 0x224c8a]);
      for (var gx = -10; gx <= 10; gx += 2.0) {
        b.push([gx, 0.0, 0.0, 0.12, 0.03, 2.8, 0x42e3ff, true]);
      }
      b.push([0, 0.01, -1.52, 25.6, 0.14, 0.22, 0x38f2ff, true]);
      b.push([0, 0.01, 1.52, 25.6, 0.14, 0.22, 0xffbe0b, true]);
      // Giant wooden school ruler resting behind the battle lane!
      b.push([0, 0.0, -3.5, 24.0, 1.4, 0.45, 0xf6c95d]);
      for (var rx = -10.5; rx <= 10.5; rx += 1.5) {
        b.push([rx, 0.72, -3.24, 0.12, 0.65, 0.06, 0x4a3520]);
      }
      // Giant chunky toy pencils flanking the desk
      b.push([-7.5, 0.0, -5.8, 6.2, 0.85, 0.85, 0xffd23f]);
      b.push([-11.0, 0.0, -5.8, 0.9, 0.85, 0.85, 0xff6b9d]);
      b.push([-4.1, 0.12, -5.8, 0.8, 0.6, 0.6, 0xf2c99b]);
      // Toy Space Rocket ships on launch pads in background!
      for (var s = -1; s <= 1; s += 2) {
        var rkx = s * 6.8;
        b.push([rkx, 0.0, -6.2, 2.6, 0.4, 2.6, 0x7b71c4]);
        b.push([rkx, 0.4, -6.2, 1.45, 3.4, 1.45, 0xf4f7ff]);
        b.push([rkx, 3.8, -6.2, 1.0, 1.1, 1.0, 0xff4d6d]);
        b.push([rkx, 4.9, -6.2, 0.48, 0.75, 0.48, 0xff4d6d]);
        b.push([rkx, 2.4, -5.45, 0.65, 0.65, 0.12, 0x38f2ff, true]);
        b.push([rkx - 1.0, 0.4, -6.2, 0.65, 1.35, 0.35, 0xff4d6d]);
        b.push([rkx + 1.0, 0.4, -6.2, 0.65, 1.35, 0.35, 0xff4d6d]);
      }
      // Glowing space crystal blocks in center back
      addStudBrick(b, 0.0, 0.0, -6.4, 3.2, 2.8, 2.2, 0x8b5cf6, 3, 2);
      b.push([-1.2, 2.9, -6.4, 0.8, 1.6, 0.8, 0x38f2ff, true]);
      b.push([1.1, 2.9, -6.4, 0.75, 1.2, 0.75, 0xff70a6, true]);
      return buildMergedBoxes(b);
    }

    var worldMeshes = [buildWorld0Carpet(), buildWorld1Blocks(), buildWorld2Space()];
    for (var wi = 0; wi < worldMeshes.length; wi++) {
      worldMeshes[wi].visible = wi === 0;
      scene.add(worldMeshes[wi]);
    }
    var activeWorldIdx = 0;

    // Animated floating sky props (puffy clouds for Worlds 0/1, glowing stars + Saturn for World 2)
    var cloudGroup = new T.Group();
    var clouds = [];
    var cloudPositions = [[-11, 8.6, -9.5, 1.1], [-4, 9.6, -10.5, 1.35], [4.5, 8.9, -9.8, 1.2], [11.5, 9.4, -10.2, 1.05]];
    for (var ci = 0; ci < cloudPositions.length; ci++) {
      var cg = new T.Group();
      var cp = cloudPositions[ci];
      cg.add(mkBox(3.0, 0.9, 1.1, 0xffffff, 0, 0, 0, true));
      cg.add(mkBox(1.8, 1.05, 1.0, 0xf3fbff, -0.35, 0.55, 0, true));
      cg.add(mkBox(1.3, 0.8, 0.95, 0xffffff, 0.65, 0.42, 0, true));
      cg.position.set(cp[0], cp[1], cp[2]);
      cg.scale.setScalar(cp[3]);
      cloudGroup.add(cg);
      clouds.push({ g: cg, baseX: cp[0], y: cp[1], z: cp[2], spd: 0.4 + ci * 0.14 });
    }
    scene.add(cloudGroup);

    var spaceSkyGroup = new T.Group();
    var saturn = new T.Group();
    saturn.add(mkSph(1.35, 0xffb703, 0, 0, 0, true));
    var ring = mkCyl(2.25, 0.12, 0x38f2ff, 0, 0, 0, true);
    ring.rotation.z = 0.35;
    ring.rotation.x = 0.25;
    saturn.add(ring);
    saturn.position.set(0, 8.8, -10.5);
    spaceSkyGroup.add(saturn);
    var starCoords = [[-13, 9.8], [-9, 8.2], [-6, 10.2], [-2.5, 7.6], [3.5, 10.1], [7.5, 8.5], [11.5, 9.9], [13.5, 7.7]];
    for (var si = 0; si < starCoords.length; si++) {
      spaceSkyGroup.add(mkBox(0.32, 0.32, 0.32, si % 2 ? 0xfff3b0 : 0x72efdd, starCoords[si][0], starCoords[si][1], -10.2, true));
    }
    spaceSkyGroup.visible = false;
    scene.add(spaceSkyGroup);

    /* ------------------------------------------- Plastic-Brick Toy Castles */
    function buildCastle(side) {
      var dir = side === 0 ? 1 : -1;
      var root = new T.Group();
      root.position.set(side === 0 ? E.LEFT_CASTLE_X : E.RIGHT_CASTLE_X, 0, 0);

      var bodyGroup = new T.Group();
      root.add(bodyGroup);

      // Materials we can recolor live for P1 castle skins!
      var mMain = new T.MeshLambertMaterial({ color: side === 0 ? 0x3b82f6 : 0xef4444 });
      var mTrim = new T.MeshLambertMaterial({ color: side === 0 ? 0xffcc00 : 0xff9f1c });
      var mRoof = new T.MeshLambertMaterial({ color: side === 0 ? 0x1d4ed8 : 0xb91c1c });
      var mBase = mat(0xf1efe8);
      var mGate = mat(0x7a4924);
      var mDark = mat(0x2b2542);

      function addPart(geo, material, sx, sy, sz, x, y, z, parent) {
        var mesh = new T.Mesh(geo, material);
        mesh.scale.set(sx, sy, sz);
        mesh.position.set(x, y, z);
        (parent || bodyGroup).add(mesh);
        return mesh;
      }

      // Stepped stone-plastic foundation
      addPart(UNIT_BOX, mBase, 3.8, 0.45, 4.4, 0, 0.225, 0);
      // Main keep walls
      addPart(UNIT_BOX, mMain, 3.2, 3.2, 3.6, 0, 2.05, 0);
      // Bright trim band around middle
      addPart(UNIT_BOX, mTrim, 3.35, 0.38, 3.75, 0, 2.6, 0);
      // Brick studs along the keep roof
      for (var bx = -1.1; bx <= 1.1; bx += 1.1) {
        for (var bz = -1.2; bz <= 1.2; bz += 1.2) {
          addPart(UNIT_CYL, mTrim, 0.38, 0.22, 0.38, bx, 3.74, bz);
        }
      }
      // Twin flanking toy turrets (front & back)
      var turretZs = [-1.65, 1.65];
      var flags = [];
      for (var tz = 0; tz < 2; tz++) {
        var zPos = turretZs[tz];
        addPart(UNIT_BOX, mMain, 1.35, 4.4, 1.35, -dir * 0.45, 2.4, zPos);
        addPart(UNIT_BOX, mTrim, 1.5, 0.32, 1.5, -dir * 0.45, 4.5, zPos);
        addPart(UNIT_CONE, mRoof, 1.75, 1.65, 1.75, -dir * 0.45, 5.42, zPos);
        // Flagpole & waving pennant
        addPart(UNIT_CYL, mBase, 0.1, 1.1, 0.1, -dir * 0.45, 6.45, zPos);
        var flag = new T.Mesh(UNIT_BOX, mTrim);
        flag.scale.set(0.95, 0.46, 0.08);
        flag.position.set(-dir * 0.45 + dir * 0.48, 6.75, zPos);
        bodyGroup.add(flag);
        flags.push(flag);
      }

      // Arched toy drawbridge gate facing inward!
      addPart(UNIT_BOX, mTrim, 0.34, 1.85, 1.75, dir * 1.6, 1.32, 0);
      addPart(UNIT_BOX, mDark, 0.36, 1.55, 1.32, dir * 1.64, 1.18, 0);
      addPart(UNIT_BOX, mGate, 0.38, 1.35, 1.05, dir * 1.68, 1.08, 0);
      // Cute castle face/shield badge above gate
      addPart(UNIT_BOX, mTrim, 0.28, 0.72, 0.72, dir * 1.66, 2.7, 0);

      // 5 Swappable 3D Banner/Roof Toppers on proud elevated rear-center spire!
      var topperHold = new T.Group();
      topperHold.position.set(-dir * 0.95, 5.15, 0);
      bodyGroup.add(topperHold);
      addPart(UNIT_BOX, mMain, 1.1, 1.5, 1.25, -dir * 0.95, 4.4, 0);
      addPart(UNIT_BOX, mTrim, 1.24, 0.24, 1.38, -dir * 0.95, 5.12, 0);

      var toppers = [];
      // 0: Star Flag
      var t0 = new T.Group();
      t0.add(mkCyl(0.08, 1.6, 0xfff8eb, 0, 0.8, 0));
      t0.add(mkBox(1.1, 0.72, 0.14, 0xffd23f, dir * 0.55, 1.35, 0));
      t0.add(mkBox(0.36, 0.36, 0.2, 0xffffff, dir * 0.55, 1.35, 0, true));
      toppers.push(t0);
      // 1: Golden Crown
      var t1 = new T.Group();
      t1.add(mkCyl(0.65, 0.55, 0xffbe0b, 0, 0.35, 0));
      t1.add(mkCone(0.24, 0.55, 0xffd60a, -0.4, 0.82, 0));
      t1.add(mkCone(0.26, 0.68, 0xffd60a, 0, 0.88, 0));
      t1.add(mkCone(0.24, 0.55, 0xffd60a, 0.4, 0.82, 0));
      t1.add(mkBox(0.22, 0.22, 0.22, 0xff4d6d, 0, 0.42, 0.65, true));
      toppers.push(t1);
      // 2: Dino Crest
      var t2 = new T.Group();
      t2.add(mkBox(0.95, 0.85, 0.95, 0x38d39f, 0, 0.45, 0));
      t2.add(mkBox(0.55, 0.42, 0.7, 0x38d39f, dir * 0.55, 0.38, 0));
      t2.add(mkCone(0.22, 0.52, 0xffca3a, -0.1, 1.05, 0));
      t2.add(mkBox(0.18, 0.18, 0.18, 0xffffff, dir * 0.28, 0.62, 0.48, true));
      toppers.push(t2);
      // 3: Space Rocket
      var t3 = new T.Group();
      t3.add(mkCyl(0.38, 1.25, 0xffffff, 0, 0.72, 0));
      t3.add(mkCone(0.4, 0.65, 0xff595e, 0, 1.62, 0));
      t3.add(mkBox(0.22, 0.22, 0.22, 0x38f2ff, 0, 0.85, 0.38, true));
      t3.add(mkBox(1.1, 0.45, 0.18, 0xff595e, 0, 0.28, 0));
      toppers.push(t3);
      // 4: Champion Trophy
      var t4 = new T.Group();
      t4.add(mkBox(0.85, 0.25, 0.85, 0x7a4924, 0, 0.15, 0));
      t4.add(mkCyl(0.2, 0.55, 0xffbe0b, 0, 0.52, 0));
      t4.add(mkCyl(0.58, 0.75, 0xffd60a, 0, 1.1, 0));
      t4.add(mkBox(1.4, 0.18, 0.18, 0xffbe0b, 0, 1.2, 0));
      toppers.push(t4);

      for (var ti = 0; ti < toppers.length; ti++) {
        toppers[ti].visible = ti === 0;
        topperHold.add(toppers[ti]);
      }

      // Top-mounted Animated Cork Cannon on central castle roof!
      var cannonMount = new T.Group();
      cannonMount.position.set(dir * 0.45, E.CANNON_Y, 0);
      bodyGroup.add(cannonMount);
      // Swivel base carriage + cute wheels
      cannonMount.add(mkBox(1.15, 0.48, 1.15, 0x8c562c, 0, -0.5, 0));
      cannonMount.add(mkCyl(0.36, 0.2, 0x33304a, 0, -0.58, 0.62));
      cannonMount.add(mkCyl(0.36, 0.2, 0x33304a, 0, -0.58, -0.62));

      var cannonPivot = new T.Group();
      cannonMount.add(cannonPivot);
      var barrelGroup = new T.Group();
      cannonPivot.add(barrelGroup);
      // Chunky toy cannon barrel extending along +dir*X
      var barrel = new T.Mesh(UNIT_CYL, mRoof);
      barrel.scale.set(0.82, 1.85, 0.82);
      barrel.rotation.z = -dir * Math.PI * 0.5;
      barrel.position.set(dir * 0.55, 0, 0);
      barrelGroup.add(barrel);
      // Bright gold muzzle ring & stripe
      var ringM = new T.Mesh(UNIT_CYL, mTrim);
      ringM.scale.set(0.96, 0.28, 0.96);
      ringM.rotation.z = -dir * Math.PI * 0.5;
      ringM.position.set(dir * 1.38, 0, 0);
      barrelGroup.add(ringM);
      // Spring plunger knob on back of toy cannon
      barrelGroup.add(mkSph(0.34, 0xff4d6d, -dir * 0.55, 0, 0));
      // Loaded chunky brown cork protruding from muzzle!
      var loadedCork = mkCyl(0.32, 0.55, 0xd89e5a, dir * 1.62, 0, 0);
      loadedCork.rotation.z = -dir * Math.PI * 0.5;
      barrelGroup.add(loadedCork);

      scene.add(root);
      return {
        root: root,
        body: bodyGroup,
        mMain: mMain,
        mTrim: mTrim,
        mRoof: mRoof,
        flags: flags,
        toppers: toppers,
        cannonPivot: cannonPivot,
        barrelGroup: barrelGroup,
        loadedCork: loadedCork,
        dir: dir,
        skinIdx: 0,
        topperIdx: 0
      };
    }

    var castles = [buildCastle(0), buildCastle(1)];
    function applyP1Skins(castleSkinIdx, bannerSkinIdx) {
      var c = castles[0];
      var cs = E.CASTLE_SKINS[castleSkinIdx] || E.CASTLE_SKINS[0];
      if (c.skinIdx !== castleSkinIdx) {
        c.skinIdx = castleSkinIdx;
        c.mMain.color.setHex(cs.main);
        c.mTrim.color.setHex(cs.trim);
        c.mRoof.color.setHex(cs.roof);
      }
      if (c.topperIdx !== bannerSkinIdx) {
        c.topperIdx = bannerSkinIdx;
        for (var i = 0; i < c.toppers.length; i++) c.toppers[i].visible = i === bannerSkinIdx;
      }
    }

    /* ------------------------------------------- Pooled 3D Toy Units */
    function addEyes(parent, x, y, zSpread) {
      parent.add(mkBox(0.1, 0.22, 0.22, 0xffffff, x, y, zSpread, true));
      parent.add(mkBox(0.1, 0.22, 0.22, 0xffffff, x, y, -zSpread, true));
      parent.add(mkBox(0.12, 0.12, 0.12, 0x1b1a2e, x + 0.03, y, zSpread, true));
      parent.add(mkBox(0.12, 0.12, 0.12, 0x1b1a2e, x + 0.03, y, -zSpread, true));
    }

    function createUnitRig(kind) {
      var g = new T.Group();
      var body = new T.Group();
      g.add(body);

      var mTeam = new T.MeshLambertMaterial({ color: 0x3b82f6 });
      var mAccent = new T.MeshLambertMaterial({ color: 0xffcc00 });
      var mDark = mat(0x2c2b47);
      var mSkin = mat(0xffd6a5);
      var mWhite = mat(0xffffff);

      function pBox(w, h, d, m, x, y, z, par) {
        var mesh = new T.Mesh(UNIT_BOX, m);
        mesh.scale.set(w, h, d);
        mesh.position.set(x, y, z);
        (par || body).add(mesh);
        return mesh;
      }

      // Subtle plastic toy plinth base for instant team recognition
      var base = new T.Mesh(UNIT_CYL, mTeam);
      base.scale.set(kind === 3 ? 1.55 : (kind === 2 ? 1.25 : 0.92), 0.14, kind === 3 ? 1.55 : (kind === 2 ? 1.25 : 0.92));
      base.position.set(0, 0.07, 0);
      body.add(base);

      var weapon = new T.Group();
      var windKey = null;
      var crownY = 1.85;

      if (kind === 0) {
        // 0: Foam Knight — chunky minifigure + helmet plume + foam sword & shield
        pBox(0.32, 0.36, 0.26, mDark, 0, 0.3, 0.2);
        pBox(0.32, 0.36, 0.26, mDark, 0, 0.3, -0.2);
        pBox(0.58, 0.62, 0.66, mTeam, 0, 0.78, 0);
        pBox(0.62, 0.18, 0.68, mAccent, 0, 0.72, 0);
        // Head + helmet
        pBox(0.56, 0.54, 0.56, mSkin, 0, 1.34, 0);
        pBox(0.64, 0.32, 0.64, mTeam, 0, 1.56, 0);
        pBox(0.24, 0.34, 0.18, mAccent, -0.05, 1.84, 0); // plume
        addEyes(body, 0.27, 1.32, 0.14);
        // Oversized round foam shield on front-left
        var shield = new T.Mesh(UNIT_CYL, mAccent);
        shield.scale.set(0.62, 0.14, 0.62);
        shield.rotation.z = Math.PI * 0.5;
        shield.position.set(0.36, 0.85, 0.38);
        body.add(shield);
        // Swinging foam sword arm
        weapon.position.set(0.18, 0.92, -0.44);
        pBox(0.24, 0.24, 0.24, mTeam, 0, 0, 0, weapon);
        pBox(0.18, 0.95, 0.24, mat(0x7be0ff), 0.22, 0.35, 0, weapon);
        pBox(0.16, 0.18, 0.44, mAccent, 0.22, -0.05, 0, weapon);
        body.add(weapon);
        crownY = 2.15;
      } else if (kind === 1) {
        // 1: Toy Blaster / Archer — visor cap + oversized bright foam blaster
        pBox(0.28, 0.34, 0.24, mDark, 0, 0.28, 0.18);
        pBox(0.28, 0.34, 0.24, mDark, 0, 0.28, -0.18);
        pBox(0.52, 0.58, 0.6, mTeam, 0, 0.74, 0);
        pBox(0.54, 0.52, 0.54, mSkin, 0, 1.28, 0);
        // Cool bright cap + visor brim
        pBox(0.6, 0.24, 0.6, mTeam, 0, 1.56, 0);
        pBox(0.38, 0.1, 0.58, mAccent, 0.36, 1.48, 0);
        addEyes(body, 0.26, 1.26, 0.13);
        // Giant bright toy foam blaster
        weapon.position.set(0.28, 0.85, 0.18);
        pBox(0.95, 0.32, 0.28, mat(0xff8c2b), 0.35, 0, 0, weapon);
        pBox(0.32, 0.22, 0.32, mAccent, 0.86, 0.02, 0, weapon);
        pBox(0.35, 0.22, 0.22, mTeam, 0.22, 0.22, 0, weapon);
        body.add(weapon);
        crownY = 1.98;
      } else if (kind === 2) {
        // 2: Wind-Up Dino Tank — chubby armored dino on treads + spinning wind-up key!
        // Chunky tank wheels/treads
        pBox(1.38, 0.34, 0.3, mDark, 0, 0.26, 0.52);
        pBox(1.38, 0.34, 0.3, mDark, 0, 0.26, -0.52);
        // Plump blocky dino body
        pBox(1.25, 0.82, 0.92, mTeam, -0.05, 0.74, 0);
        pBox(0.75, 0.65, 0.78, mTeam, 0.68, 1.05, 0); // chunky dino head
        pBox(0.35, 0.72, 0.96, mAccent, 0.36, 1.25, 0); // triceratops frill
        pBox(0.45, 0.24, 0.2, mWhite, 1.12, 1.18, 0.22); // cute horn L
        pBox(0.45, 0.24, 0.2, mWhite, 1.12, 1.18, -0.22); // cute horn R
        pBox(0.55, 0.38, 0.42, mTeam, -0.82, 0.68, 0); // stubby tail
        addEyes(body, 1.04, 1.14, 0.22);
        // Spinning golden wind-up key on its back!
        windKey = new T.Group();
        windKey.position.set(-0.35, 1.38, 0);
        pBox(0.14, 0.42, 0.14, mAccent, 0, 0, 0, windKey);
        pBox(0.14, 0.44, 0.76, mAccent, 0, 0.36, 0, windKey);
        pBox(0.18, 0.18, 0.22, mTeam, 0, 0.36, 0.18, windKey);
        pBox(0.18, 0.18, 0.22, mTeam, 0, 0.36, -0.18, windKey);
        body.add(windKey);
        crownY = 1.92;
      } else {
        // 3: Mega Mech — towering blocky toy robot titan!
        pBox(0.55, 0.72, 0.45, mDark, 0, 0.44, 0.42);
        pBox(0.55, 0.72, 0.45, mDark, 0, 0.44, -0.42);
        pBox(1.1, 1.15, 1.3, mTeam, 0, 1.32, 0);
        pBox(0.28, 0.46, 0.46, mat(0x38f2ff, true), 0.56, 1.35, 0); // glowing chest core
        // Wide blocky shoulders
        pBox(0.68, 0.52, 0.56, mAccent, 0, 1.82, 0.86);
        pBox(0.68, 0.52, 0.56, mAccent, 0, 1.82, -0.86);
        // Head + glowing visor + antennae
        pBox(0.76, 0.62, 0.82, mTeam, 0.05, 2.22, 0);
        pBox(0.16, 0.24, 0.68, mat(0xffe066, true), 0.42, 2.24, 0);
        pBox(0.12, 0.48, 0.12, mAccent, 0, 2.72, 0.28);
        pBox(0.12, 0.48, 0.12, mAccent, 0, 2.72, -0.28);
        // Articulated smashing piston arms
        weapon.position.set(0.22, 1.48, 0);
        pBox(0.78, 0.44, 0.42, mTeam, 0.42, -0.12, 0.84, weapon);
        pBox(0.78, 0.44, 0.42, mTeam, 0.42, -0.12, -0.84, weapon);
        pBox(0.45, 0.52, 0.48, mAccent, 0.86, -0.12, 0.84, weapon);
        pBox(0.45, 0.52, 0.48, mAccent, 0.86, -0.12, -0.84, weapon);
        body.add(weapon);
        crownY = 3.05;
      }

      // Boss golden crown (hidden unless unit.isBoss)
      var crown = new T.Group();
      crown.position.set(0, crownY, 0);
      crown.add(mkCyl(0.42, 0.28, 0xffd60a, 0, 0.14, 0, true));
      crown.add(mkCone(0.18, 0.36, 0xffbe0b, 0, 0.42, 0));
      crown.visible = false;
      body.add(crown);

      // Tiny clean floating HP bar (hidden while full HP)
      var hpGroup = new T.Group();
      hpGroup.position.set(0, crownY + 0.45, 0);
      hpGroup.add(mkBox(1.15, 0.18, 0.08, 0x1b1a2e, 0, 0, 0, true));
      var hpFill = mkBox(1.05, 0.12, 0.1, 0x3ddc84, 0, 0, 0.02, true);
      hpGroup.add(hpFill);
      hpGroup.visible = false;
      g.add(hpGroup);

      g.visible = false;
      scene.add(g);
      return {
        g: g, body: body, mTeam: mTeam, mAccent: mAccent,
        weapon: weapon, windKey: windKey, crown: crown,
        hpGroup: hpGroup, hpFill: hpFill, kind: kind, inUse: false
      };
    }

    var unitPools = [[], [], [], []];
    var poolSizes = [12, 10, 10, 8];
    for (var uk = 0; uk < 4; uk++) {
      for (var up = 0; up < poolSizes[uk]; up++) {
        unitPools[uk].push(createUnitRig(uk));
      }
    }

    /* ------------------------------------------- Floating Parachute Crates */
    var cratePool = [];
    var domeGeo = new T.SphereGeometry(1.08, 12, 7, 0, Math.PI * 2, 0, Math.PI * 0.54);
    var domeStripeGeo = new T.SphereGeometry(1.11, 12, 7, 0, Math.PI * 0.42, 0, Math.PI * 0.54);
    for (var ck = 0; ck < 3; ck++) {
      var cg2 = new T.Group();
      // True half-dome striped pastel parachute canopy!
      var dome = new T.Group();
      dome.position.set(0, 1.38, 0);
      dome.add(new T.Mesh(domeGeo, mat(0xff595e)));
      var st1 = new T.Mesh(domeStripeGeo, mat(0xffe066));
      var st2 = new T.Mesh(domeStripeGeo, mat(0xffffff));
      st2.rotation.y = Math.PI * 0.5;
      var st3 = new T.Mesh(domeStripeGeo, mat(0xffe066));
      st3.rotation.y = Math.PI;
      var st4 = new T.Mesh(domeStripeGeo, mat(0xffffff));
      st4.rotation.y = Math.PI * 1.5;
      dome.add(st1, st2, st3, st4);
      dome.scale.set(1.0, 0.85, 1.0);
      cg2.add(dome);
      // Crisp taut parachute strings
      var strCoords = [[-0.86, 0.34], [0.86, 0.34], [-0.86, -0.34], [0.86, -0.34]];
      for (var sc = 0; sc < 4; sc++) {
        var stMesh = mkBox(0.05, 1.32, 0.05, 0xfff8eb, strCoords[sc][0] * 0.62, 0.92, strCoords[sc][1] * 0.62, true);
        stMesh.rotation.z = strCoords[sc][0] > 0 ? 0.36 : -0.36;
        cg2.add(stMesh);
      }
      // Golden star energy supply crate!
      cg2.add(mkBox(0.95, 0.95, 0.95, 0xffbe0b, 0, 0, 0));
      cg2.add(mkBox(1.02, 0.2, 1.02, 0xff7b29, 0, 0.34, 0));
      cg2.add(mkBox(1.02, 0.2, 1.02, 0xff7b29, 0, -0.34, 0));
      cg2.add(mkBox(0.36, 0.36, 0.12, 0x38f2ff, 0, 0, 0.5, true));
      cg2.visible = false;
      scene.add(cg2);
      cratePool.push(cg2);
    }

    /* ------------------------------------------- Projectiles & Reticles */
    var corkPool = [];
    for (var cp2 = 0; cp2 < 6; cp2++) {
      var cm = new T.Group();
      cm.add(mkCyl(0.32, 0.56, 0xd89e5a, 0, 0, 0));
      cm.add(mkCyl(0.36, 0.16, 0xfff3b0, 0, 0.22, 0, true));
      cm.visible = false;
      scene.add(cm);
      corkPool.push(cm);
    }

    var dartPool = [];
    for (var dp = 0; dp < 16; dp++) {
      var dm = new T.Group();
      dm.add(mkBox(0.62, 0.14, 0.14, 0xff8c2b, 0, 0, 0, true));
      dm.add(mkBox(0.18, 0.2, 0.2, 0x38f2ff, 0.32, 0, 0, true));
      dm.visible = false;
      scene.add(dm);
      dartPool.push(dm);
    }

    // Pulsing 3D Target Reticle Rings (P1 gold-cyan, P2 coral)
    function makeReticle(hex) {
      var rg = new T.Group();
      var ringGeo = new T.TorusGeometry(0.62, 0.08, 6, 18);
      var rm = new T.Mesh(ringGeo, mat(hex, true));
      rg.add(rm);
      rg.add(mkSph(0.14, 0xffffff, 0, 0, 0, true));
      rg.visible = false;
      scene.add(rg);
      return rg;
    }
    var reticles = [makeReticle(0xffe066), makeReticle(0xff6b8b)];

    /* ------------------------------------------- Instanced Shadows, Arc & Particles */
    var MAX_SHADOWS = 40;
    var shGeo = new T.CircleGeometry(0.55, 12);
    shGeo.rotateX(-Math.PI * 0.5);
    var shMat = new T.MeshBasicMaterial({ color: 0x162238, transparent: true, opacity: 0.28, depthWrite: false });
    var shadows = new T.InstancedMesh(shGeo, shMat, MAX_SHADOWS);
    shadows.count = 0;
    shadows.frustumCulled = false;
    scene.add(shadows);

    var MAX_ARC = 24;
    var arcMat = new T.MeshBasicMaterial({ color: 0xffffff });
    var arcInst = new T.InstancedMesh(UNIT_SPH, arcMat, MAX_ARC);
    arcInst.count = 0;
    arcInst.frustumCulled = false;
    scene.add(arcInst);

    var MAX_PART = 160;
    var partMat = new T.MeshBasicMaterial({ color: 0xffffff });
    var partInst = new T.InstancedMesh(UNIT_BOX, partMat, MAX_PART);
    partInst.count = 0;
    partInst.frustumCulled = false;
    scene.add(partInst);

    var parts = [];
    for (var pi = 0; pi < MAX_PART; pi++) {
      parts.push({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 0.2, g: 14, color: 0xffffff });
    }
    var partCursor = 0;

    var shakePower = 0;
    var calm = false;

    function addShake(amount) {
      if (calm) return;
      shakePower = Math.max(shakePower, amount);
    }

    function burst(x, y, z, opts) {
      if (calm) return;
      opts = opts || {};
      var count = opts.count || 14;
      var colors = opts.colors || [0xffd23f, 0x38f2ff, 0xff595e, 0xffffff];
      var speed = opts.speed || 6.5;
      var size = opts.size || 0.26;
      var life = opts.life || 0.65;
      var g = opts.gravity != null ? opts.gravity : 15;
      for (var i = 0; i < count; i++) {
        var pt = parts[partCursor];
        partCursor = (partCursor + 1) % MAX_PART;
        var a = Math.random() * Math.PI * 2;
        var el = (Math.random() * 0.8 + 0.25) * speed;
        var h = (0.3 + Math.random() * 0.7) * speed;
        pt.x = x + (Math.random() - 0.5) * 0.4;
        pt.y = y + (Math.random() - 0.5) * 0.3;
        pt.z = z + (Math.random() - 0.5) * 0.4;
        pt.vx = Math.cos(a) * h;
        pt.vy = el;
        pt.vz = Math.sin(a) * h * 0.6;
        pt.size = size * (0.65 + Math.random() * 0.75);
        pt.life = life * (0.6 + Math.random() * 0.5);
        pt.max = pt.life;
        pt.g = g;
        pt.color = colors[i % colors.length];
      }
    }

    function setInst(inst, idx, x, y, z, sx, sy, sz, rx, ry, rz) {
      V1.set(x, y, z);
      if (rx || ry || rz) {
        EU.set(rx || 0, ry || 0, rz || 0);
        Q.setFromEuler(EU);
      } else {
        Q.identity();
      }
      S1.set(sx, sy, sz);
      M4.compose(V1, Q, S1);
      inst.setMatrixAt(idx, M4);
    }

    function setWorldTheme(worldIdx) {
      if (activeWorldIdx === worldIdx) return;
      activeWorldIdx = worldIdx;
      for (var i = 0; i < worldMeshes.length; i++) worldMeshes[i].visible = i === worldIdx;
      var w = E.WORLDS[worldIdx] || E.WORLDS[0];
      bgColor.setHex(w.sky);
      scene.fog.color.setHex(w.fog);
      cloudGroup.visible = worldIdx !== 2;
      spaceSkyGroup.visible = worldIdx === 2;
    }

    function screenToLane(ndcX, ndcY) {
      NDC.set(ndcX, ndcY);
      RAY.setFromCamera(NDC, camera);
      if (RAY.ray.intersectPlane(PLANE_Z, HIT_PT)) {
        return { x: HIT_PT.x, y: HIT_PT.y };
      }
      return null;
    }

    function worldToScreen(wx, wy, wz) {
      V2.set(wx, wy, wz || 0).project(camera);
      return {
        x: (V2.x * 0.5 + 0.5) * canvas.clientWidth,
        y: (-V2.y * 0.5 + 0.5) * canvas.clientHeight
      };
    }

    /* ---------------------------------------------------- Frame Sync */
    function sync(world, opts) {
      var dt = opts.dt || 0;
      var t = opts.t || 0;
      var mode = opts.mode || 'play';
      var castleSkin = opts.castleSkin || 0;
      var bannerSkin = opts.bannerSkin || 0;

      if (world) setWorldTheme(world.worldIndex);
      applyP1Skins(castleSkin, bannerSkin);

      // Gentle camera sway on Title/Shop, rock-solid + shake in Play
      shakePower = calm ? 0 : Math.max(0, shakePower - dt * 16);
      var sx = shakePower > 0.01 ? (Math.random() - 0.5) * shakePower * 0.45 : 0;
      var sy = shakePower > 0.01 ? (Math.random() - 0.5) * shakePower * 0.35 : 0;
      if (mode === 'shop') {
        // Zoom slightly toward Player 1's customizable toy castle!
        camera.position.set(-7.6 + sx, 6.2 + sy, 15.8);
        camera.lookAt(-11.4, 3.0, 0);
      } else {
        var swayX = (!calm && mode === 'title') ? Math.sin(t * 0.45) * 1.15 : 0;
        var swayY = (!calm && mode === 'title') ? Math.cos(t * 0.35) * 0.25 : 0;
        camera.position.set(camBase.x + swayX + sx, camBase.y + swayY + sy, camBase.z);
        camera.lookAt(camLook.x + swayX * 0.25, camLook.y, camLook.z);
      }

      // Animate floating sky props
      if (cloudGroup.visible) {
        for (var ci = 0; ci < clouds.length; ci++) {
          var cl = clouds[ci];
          cl.g.position.x = cl.baseX + Math.sin(t * cl.spd + ci) * 1.3;
          cl.g.position.y = cl.y + Math.sin(t * 1.1 + ci * 2) * 0.16;
        }
      } else {
        saturn.rotation.y = t * 0.45;
        saturn.position.y = 8.8 + Math.sin(t * 0.9) * 0.22;
      }

      // Sync both Castles & Cork Cannons
      for (var si = 0; si < 2; si++) {
        var ca = castles[si];
        var side = world ? world.sides[si] : null;
        var hpRatio = side ? (side.hp / side.maxHp) : 1;
        // Waving pennant flags
        for (var fi = 0; fi < ca.flags.length; fi++) {
          ca.flags[fi].rotation.y = Math.sin(t * 5.2 + fi * 1.5 + si * 2) * 0.26;
        }
        // Damage tilt / wobble / collapse squash
        var wob = side && !calm ? Math.sin(t * 48) * side.castleShake * 0.08 : 0;
        if (side && side.hp <= 0) {
          ca.body.scale.set(1.08, 0.35, 1.08);
          ca.body.rotation.z = ca.dir * 0.18;
        } else {
          var hurtScale = side && side.hurtTimer > 0 ? 1.0 + side.hurtTimer * 0.16 : 1.0;
          ca.body.scale.set(hurtScale, 1.0 - (hurtScale - 1) * 0.5, hurtScale);
          ca.body.rotation.z = wob + (hpRatio < 0.45 ? -ca.dir * 0.04 : 0);
        }
        // Cannon pitch + recoil + loaded cork visibility
        var pitch = side ? side.aimPitch : 0.48;
        var recoil = side ? side.cannonRecoil : 0;
        ca.cannonPivot.rotation.z = ca.dir * pitch;
        ca.barrelGroup.position.x = -ca.dir * recoil * 0.45;
        ca.barrelGroup.scale.set(1 - recoil * 0.12, 1 + recoil * 0.16, 1 + recoil * 0.16);
        ca.loadedCork.visible = !side || side.cannonCd <= 0.12;
      }

      // Sync Units
      for (var k = 0; k < 4; k++) {
        for (var j = 0; j < unitPools[k].length; j++) unitPools[k][j].inUse = false;
      }
      var shIdx = 0;
      if (world) {
        var p1Skin = E.CASTLE_SKINS[castleSkin] || E.CASTLE_SKINS[0];
        for (var ui = 0; ui < world.units.length; ui++) {
          var u = world.units[ui];
          var pool = unitPools[u.kind];
          var rig = null;
          for (var rp = 0; rp < pool.length; rp++) {
            if (!pool[rp].inUse) { rig = pool[rp]; rig.inUse = true; break; }
          }
          if (!rig) continue;

          rig.g.visible = true;
          var bob = u.y <= 0.02 ? Math.abs(Math.sin(u.walkPhase)) * 0.14 : 0;
          rig.g.position.set(u.x, u.y, u.z);
          rig.body.position.y = bob;
          // Face right for P1 (side 0), left for Rival (side 1)
          rig.body.rotation.y = u.side === 0 ? 0 : Math.PI;
          rig.body.rotation.z = u.y <= 0.02 ? Math.sin(u.walkPhase) * 0.06 : (u.side === 0 ? -0.18 : 0.18);
          var sc = u.scale;
          var sq = u.hurtAnim > 0 ? 1.12 : 1.0;
          rig.body.scale.set(sc * sq, sc / sq, sc * sq);

          // Team color + crisp white hit flash
          if (u.hurtAnim > 0.07) {
            rig.mTeam.color.setHex(0xffffff);
            rig.mAccent.color.setHex(0xfff3b0);
          } else if (u.side === 0) {
            rig.mTeam.color.setHex(0x3b82f6);
            rig.mAccent.color.setHex(p1Skin.trim);
          } else {
            rig.mTeam.color.setHex(u.isBoss ? 0x9b2226 : 0xef4444);
            rig.mAccent.color.setHex(u.isBoss ? 0xffd60a : 0xff9f1c);
          }

          // Attack animation (sword swing / blaster kick / mech smash)
          if (u.kind === 0 || u.kind === 3) {
            rig.weapon.rotation.z = -Math.sin(u.atkAnim * Math.PI) * 1.15;
          } else if (u.kind === 1) {
            rig.weapon.position.x = 0.28 - u.atkAnim * 0.22;
          }
          if (rig.windKey) {
            rig.windKey.rotation.y = t * 5.5 + u.uid;
          }
          rig.crown.visible = !!u.isBoss;

          // Compact HP bar only when damaged
          if (u.hp < u.maxHp && u.hp > 0) {
            rig.hpGroup.visible = true;
            var pct = Math.max(0.05, u.hp / u.maxHp);
            rig.hpFill.scale.x = 1.05 * pct;
            rig.hpFill.position.x = -(1 - pct) * 0.525;
            rig.hpFill.material = mat(u.side === 0 ? 0x3ddc84 : 0xff595e, true);
          } else {
            rig.hpGroup.visible = false;
          }

          // Blob shadow under unit
          if (shIdx < MAX_SHADOWS) {
            var shScale = u.radius * 1.65 * Math.max(0.45, 1 - u.y * 0.14);
            setInst(shadows, shIdx++, u.x, 0.115, u.z, shScale, 1, shScale * 0.8);
          }
        }
      }
      for (k = 0; k < 4; k++) {
        for (j = 0; j < unitPools[k].length; j++) {
          if (!unitPools[k][j].inUse) unitPools[k][j].g.visible = false;
        }
      }

      // Sync Parachute Crates
      for (var crI = 0; crI < cratePool.length; crI++) {
        var crMesh = cratePool[crI];
        if (world && crI < world.crates.length) {
          var cr = world.crates[crI];
          crMesh.visible = true;
          crMesh.position.set(cr.x, cr.y, cr.z);
          crMesh.rotation.z = Math.cos(cr.swayPhase) * 0.22;
          crMesh.rotation.y = t * 1.2 + crI;
          if (shIdx < MAX_SHADOWS) {
            var cs2 = Math.max(0.3, 1.0 - cr.y * 0.07);
            setInst(shadows, shIdx++, cr.x, 0.115, cr.z, cs2, 1, cs2);
          }
        } else {
          crMesh.visible = false;
        }
      }

      // Sync Corks
      for (var cki = 0; cki < corkPool.length; cki++) {
        var ckMesh = corkPool[cki];
        if (world && cki < world.corks.length) {
          var pk = world.corks[cki];
          ckMesh.visible = true;
          ckMesh.position.set(pk.x, pk.y, pk.z);
          ckMesh.rotation.z = pk.rot;
          ckMesh.rotation.x = pk.rot * 0.5;
        } else {
          ckMesh.visible = false;
        }
      }

      // Sync Foam Darts
      for (var dri = 0; dri < dartPool.length; dri++) {
        var drMesh = dartPool[dri];
        if (world && dri < world.darts.length) {
          var dr = world.darts[dri];
          drMesh.visible = true;
          drMesh.position.set(dr.x, dr.y, dr.z);
          drMesh.rotation.y = dr.side === 0 ? 0 : Math.PI;
        } else {
          drMesh.visible = false;
        }
      }

      // Dotted Ballistic Aim Arc & Target Reticles (only during active play)
      var arcIdx = 0;
      var showPlayAim = world && mode === 'play' && world.winner === -1;
      for (var ai = 0; ai < 2; ai++) {
        var showSide = showPlayAim && (ai === 0 || world.duo);
        if (showSide) {
          var sideA = world.sides[ai];
          var readyA = sideA.cannonCd <= 0.05;
          var pts = E.sampleArc(ai, sideA.aimX, sideA.aimY, 10);
          var dotHex = ai === 0 ? (readyA ? 0xffe066 : 0x9cc7ff) : (readyA ? 0xff758f : 0xffb3c1);
          for (var ap = 0; ap < pts.length && arcIdx < MAX_ARC; ap++) {
            var ds = readyA ? (0.18 + (ap / pts.length) * 0.08) : 0.11;
            setInst(arcInst, arcIdx, pts[ap].x, pts[ap].y, 0.2, ds, ds, ds);
            arcInst.setColorAt(arcIdx, C.setHex(dotHex));
            arcIdx++;
          }
          reticles[ai].visible = true;
          reticles[ai].position.set(sideA.aimX, sideA.aimY, 0.35);
          var rpScale = readyA ? (0.95 + Math.sin(t * 8) * 0.12) : 0.55;
          reticles[ai].scale.setScalar(rpScale);
          reticles[ai].rotation.z = t * 1.8 * (ai === 0 ? 1 : -1);
        } else {
          reticles[ai].visible = false;
        }
      }
      arcInst.count = arcIdx;
      arcInst.instanceMatrix.needsUpdate = true;
      if (arcInst.instanceColor) arcInst.instanceColor.needsUpdate = true;

      // Finalize Blob Shadows
      shadows.count = shIdx;
      shadows.instanceMatrix.needsUpdate = true;

      // Step & draw 3D Confetti/Brick Particles
      var ptIdx = 0;
      for (var pp = 0; pp < MAX_PART; pp++) {
        var pt = parts[pp];
        if (pt.life <= 0) continue;
        pt.life -= dt;
        if (pt.life <= 0) continue;
        pt.vy -= pt.g * dt;
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.z += pt.vz * dt;
        if (pt.y < 0.12) {
          pt.y = 0.12;
          pt.vy = Math.abs(pt.vy) * 0.38;
          pt.vx *= 0.72;
        }
        var ps = pt.size * Math.max(0.08, pt.life / pt.max);
        setInst(partInst, ptIdx, pt.x, pt.y, pt.z, ps, ps, ps, t * 7 + pp, t * 5 + pp, 0);
        partInst.setColorAt(ptIdx, C.setHex(pt.color));
        ptIdx++;
      }
      partInst.count = ptIdx;
      partInst.instanceMatrix.needsUpdate = true;
      if (partInst.instanceColor) partInst.instanceColor.needsUpdate = true;
    }

    /* ------------------------------------------- Software WebGL Fence Pacing */
    var pace = Kit.webgl.pacer(renderer, { software: software });

    var view = {
      renderer: renderer,
      scene: scene,
      camera: camera,
      software: software,
      get calm() { return calm; },
      set calm(v) { calm = !!v; if (calm) shakePower = 0; },
      burst: burst,
      shake: addShake,
      sync: sync,
      screenToLane: screenToLane,
      worldToScreen: worldToScreen,
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

  window.ToyCastleArt = { createView: createView };
})();
