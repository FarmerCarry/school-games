/* Dino 3D (الديناصور ثلاثي الأبعاد) — Lean, vibrant Behind-the-Back 3-Lane 3D renderer.
 * Ultra-fast <120ms boot: shared low-poly primitives (zero JS vertex-merge loops),
 * Kit.webgl.blobShadowPool + InstancedMesh pools with Kit.webgl.shrinkCount,
 * giant rolling glowing Magma Boulder, 5s Golden Rampage aura, and 5 distinct worlds! */
(function () {
  'use strict';
  var D = window.Dino3D;

  D.createView = function (canvas) {
    var T = window.THREE;
    if (!T) throw new Error('three.js is unavailable');

    var wgl = Kit.webgl.createRenderer(canvas, { srgb: true });
    var software = wgl.software, renderer = wgl.renderer;
    var pacer = Kit.webgl.pacer(renderer, { software: software, duty: 2 });

    var scene = new T.Scene();
    var camera = new T.PerspectiveCamera(54, 16 / 9, 0.2, 165);
    scene.fog = new T.Fog(0xffd99e, 34, 118);

    var hemi = new T.HemisphereLight(0xfff8e6, 0x7a6a58, 1.45);
    var sun = new T.DirectionalLight(0xfff2d6, 1.95);
    sun.position.set(12, 22, 16);
    scene.add(hemi, sun);

    var PALETTES = [
      // 0: Golden Desert
      { sky: 0x5cc9ff, fog: 0xffe0a8, hemiA: 0xfff5dc, hemiB: 0xd98e46, road: 0xf7cf7c, stripe: 0xffe8ad, curb: 0xe86c3a, ground: 0xeaa952, propA: 0x35bd5b, propB: 0xd97d38, sunCol: 0xffe86b },
      // 1: Lush Jungle
      { sky: 0x45c8ff, fog: 0xbaf2c8, hemiA: 0xf0fff2, hemiB: 0x3b8a42, road: 0xdcb472, stripe: 0xf2d8a2, curb: 0x3ec456, ground: 0x42b552, propA: 0x2da349, propB: 0x8a5730, sunCol: 0xfff49c },
      // 2: Snowy Peaks
      { sky: 0x62a8ff, fog: 0xdcf2ff, hemiA: 0xffffff, hemiB: 0x7ea7d9, road: 0xedf6ff, stripe: 0xffffff, curb: 0x4ec0ff, ground: 0xcbe8ff, propA: 0x2d8a68, propB: 0x91bce6, sunCol: 0xffffff },
      // 3: Volcano Valley
      { sky: 0x5d2c68, fog: 0x9e3f45, hemiA: 0xffb380, hemiB: 0x421c38, road: 0x4e4259, stripe: 0xff7b38, curb: 0xff5226, ground: 0x36243d, propA: 0x3b2d47, propB: 0xff6b2b, sunCol: 0xff8c42 },
      // 4: Royal Nest
      { sky: 0x8c8eff, fog: 0xffc7ea, hemiA: 0xfff5ff, hemiB: 0x8f6ac4, road: 0xfff2c7, stripe: 0xff9ad6, curb: 0xff62a8, ground: 0x74d48c, propA: 0xff7ec4, propB: 0x6ce3ff, sunCol: 0xfff08a }
    ];

    // Shared lean geometries (allocated ONCE, reused everywhere!).
    var G_BOX = new T.BoxGeometry(1, 1, 1);
    var G_SPH = new T.SphereGeometry(0.5, 9, 7);
    var G_SPH_HI = new T.SphereGeometry(0.5, 11, 9);
    var G_CYL = new T.CylinderGeometry(0.5, 0.5, 1, 8, 1);
    var G_CONE = new T.ConeGeometry(0.5, 1, 7, 1);
    var G_ICO = new T.IcosahedronGeometry(0.5, 1);
    var G_OCT = new T.OctahedronGeometry(0.5, 0);
    var G_TORUS = new T.TorusGeometry(0.5, 0.13, 6, 14);
    var G_PLANE = new T.PlaneGeometry(1, 1);

    // Shared materials (small material pool = minimal shader compile cost!).
    var matCache = {};
    function matLit(hex) {
      var k = 'l' + hex;
      if (!matCache[k]) matCache[k] = new T.MeshLambertMaterial({ color: hex });
      return matCache[k];
    }
    function matGlow(hex, opacity) {
      var k = 'g' + hex + '_' + (opacity == null ? 1 : opacity);
      if (!matCache[k]) {
        matCache[k] = opacity != null && opacity < 1
          ? new T.MeshBasicMaterial({ color: hex, transparent: true, opacity: opacity, depthWrite: false })
          : new T.MeshBasicMaterial({ color: hex });
      }
      return matCache[k];
    }

    function mk(geo, mat, px, py, pz, sx, sy, sz, rx, ry, rz) {
      var m = new T.Mesh(geo, mat);
      if (px || py || pz) m.position.set(px || 0, py || 0, pz || 0);
      if (sx != null) m.scale.set(sx, sy == null ? sx : sy, sz == null ? sx : sz);
      if (rx || ry || rz) m.rotation.set(rx || 0, ry || 0, rz || 0);
      return m;
    }

    // Dynamic world materials (colors update on biome switch without rebuilding meshes!).
    var mRoad = new T.MeshLambertMaterial({ color: PALETTES[0].road });
    var mStripe = new T.MeshBasicMaterial({ color: PALETTES[0].stripe });
    var mCurb = new T.MeshLambertMaterial({ color: PALETTES[0].curb });
    var mGround = new T.MeshLambertMaterial({ color: PALETTES[0].ground });
    var mPropA = new T.MeshLambertMaterial({ color: PALETTES[0].propA });
    var mPropB = new T.MeshLambertMaterial({ color: PALETTES[0].propB });
    var mSun = new T.MeshBasicMaterial({ color: PALETTES[0].sunCol });
    var mDinoBody = new T.MeshLambertMaterial({ color: D.COLORS[0].hex });
    var mDinoBelly = new T.MeshLambertMaterial({ color: D.COLORS[0].belly });
    var mDinoCrest = new T.MeshLambertMaterial({ color: D.COLORS[0].crest });
    var mDark = matLit(0x1f2544);
    var mWhite = matGlow(0xffffff);
    var mGold = matLit(0xffcf33);
    var mBoost = new T.MeshBasicMaterial({ color: 0x3dffdc });

    /* -------------------------------------------------- Static Track & Sky */
    var trackGroup = new T.Group();
    scene.add(trackGroup);
    var LANE_W = D.LANE_WIDTH;
    var ROAD_W = LANE_W * 3 + 1.2;

    // Endless scrolling visual floor anchored to dino Z!
    var groundMesh = mk(G_PLANE, mGround, 0, -0.06, -42, 180, 175, 1, -Math.PI / 2, 0, 0);
    var roadMesh = mk(G_PLANE, mRoad, 0, 0, -44, ROAD_W, 175, 1, -Math.PI / 2, 0, 0);
    var curbL = mk(G_BOX, mCurb, -ROAD_W * 0.5 - 0.35, 0.22, -44, 0.7, 0.45, 175);
    var curbR = mk(G_BOX, mCurb, ROAD_W * 0.5 + 0.35, 0.22, -44, 0.7, 0.45, 175);
    trackGroup.add(groundMesh, roadMesh, curbL, curbR);

    // Crisp lane divider dashes (InstancedMesh, scrolling smoothly!).
    var DASH_N = 48;
    var dashIM = new T.InstancedMesh(G_BOX, mStripe, DASH_N);
    dashIM.frustumCulled = false;
    scene.add(dashIM);

    // Big cheerful sun + clouds on the horizon!
    var skyGroup = new T.Group();
    scene.add(skyGroup);
    var sunMesh = mk(G_SPH_HI, mSun, 24, 34, -108, 18, 18, 18);
    skyGroup.add(sunMesh);
    var mCloud = matGlow(0xffffff, 0.9);
    for (var ci = 0; ci < 7; ci++) {
      var cg = new T.Group();
      var cx = -55 + ci * 18 + (ci % 2) * 5;
      var cy = 19 + (ci % 3) * 4.5;
      var cz = -82 - (ci % 3) * 14;
      cg.position.set(cx, cy, cz);
      cg.add(mk(G_SPH, mCloud, 0, 0, 0, 9, 4.2, 4.5));
      cg.add(mk(G_SPH, mCloud, -3.5, -0.6, 0.4, 5.5, 3.2, 3.6));
      cg.add(mk(G_SPH, mCloud, 3.8, -0.5, -0.2, 5.8, 3.0, 3.6));
      skyGroup.add(cg);
    }

    // Pooled roadside trees/pillars/dunes (InstancedMesh = 2 draw calls for 48 props!).
    var PROP_N = 40;
    var propTopIM = new T.InstancedMesh(G_CONE, mPropA, PROP_N);
    var propTrunkIM = new T.InstancedMesh(G_CYL, mPropB, PROP_N);
    propTopIM.frustumCulled = false;
    propTrunkIM.frustumCulled = false;
    scene.add(propTopIM, propTrunkIM);

    // Pooled soft ground shadows via Kit.webgl.blobShadowPool!
    var shadows = Kit.webgl.blobShadowPool(scene, 64, { opacity: 0.36, yOffset: 0.03 });

    /* ---------------------------------------------------------- Cute 3D Dino */
    var dinoRoot = new T.Group();
    scene.add(dinoRoot);
    var dinoPivot = new T.Group();
    dinoRoot.add(dinoPivot);

    // Facing -Z (away from camera, running forward into the track!).
    var bodyMesh = mk(G_SPH_HI, mDinoBody, 0, 0.88, 0.05, 1.05, 1.15, 1.15);
    var bellyMesh = mk(G_SPH, mDinoBelly, 0, 0.82, -0.22, 0.72, 0.85, 0.72);
    var headGroup = new T.Group();
    headGroup.position.set(0, 1.56, -0.28);
    headGroup.add(mk(G_SPH_HI, mDinoBody, 0, 0.06, -0.1, 0.92, 0.82, 1.08));
    headGroup.add(mk(G_SPH, mDinoBody, 0, -0.02, -0.56, 0.68, 0.5, 0.64)); // snout
    // Cute side eyes (visible in 3/4 turns & wardrobe spin!)
    headGroup.add(mk(G_SPH, mDark, -0.34, 0.16, -0.34, 0.2, 0.24, 0.18));
    headGroup.add(mk(G_SPH, mDark, 0.34, 0.16, -0.34, 0.2, 0.24, 0.18));
    headGroup.add(mk(G_SPH, mWhite, -0.37, 0.22, -0.4, 0.07, 0.08, 0.07));
    headGroup.add(mk(G_SPH, mWhite, 0.37, 0.22, -0.4, 0.07, 0.08, 0.07));
    // Dorsal orange spikes along back & head!
    for (var si = 0; si < 4; si++) {
      dinoPivot.add(mk(G_CONE, mDinoCrest, 0, 1.32 - si * 0.22, 0.28 + si * 0.24, 0.24, 0.34, 0.24, 0.6 + si * 0.12, 0, 0));
    }
    headGroup.add(mk(G_CONE, mDinoCrest, 0, 0.48, 0.08, 0.22, 0.3, 0.22, 0.2, 0, 0));

    var tailGroup = new T.Group();
    tailGroup.position.set(0, 0.72, 0.55);
    tailGroup.add(mk(G_CONE, mDinoBody, 0, 0.05, 0.45, 0.56, 1.1, 0.56, Math.PI * 0.44, 0, 0));
    var legL = mk(G_CYL, mDinoBody, -0.28, 0.34, 0.05, 0.32, 0.64, 0.34);
    var legR = mk(G_CYL, mDinoBody, 0.28, 0.34, 0.05, 0.32, 0.64, 0.34);
    var armL = mk(G_CYL, mDinoBody, -0.46, 0.96, -0.28, 0.16, 0.38, 0.16, -0.7, 0, 0.35);
    var armR = mk(G_CYL, mDinoBody, 0.46, 0.96, -0.28, 0.16, 0.38, 0.16, -0.7, 0, -0.35);
    dinoPivot.add(bodyMesh, bellyMesh, headGroup, tailGroup, legL, legR, armL, armR);

    // Hats mounted on headGroup!
    var hatMeshes = {};
    var hatSlot = new T.Group();
    hatSlot.position.set(0, 0.46, -0.08);
    headGroup.add(hatSlot);
    (function buildHats() {
      var gLeaf = new T.Group();
      gLeaf.add(mk(G_CYL, matLit(0x2f9e44), 0, 0.14, 0, 0.07, 0.3, 0.07));
      gLeaf.add(mk(G_SPH, matLit(0x52e060), -0.2, 0.3, 0, 0.42, 0.12, 0.26, 0, 0, 0.35));
      gLeaf.add(mk(G_SPH, matLit(0x3ec44e), 0.2, 0.3, 0, 0.42, 0.12, 0.26, 0, 0, -0.35));
      hatMeshes.leaf = gLeaf;

      var gExp = new T.Group();
      gExp.add(mk(G_CYL, matLit(0xe8c47a), 0, 0.04, 0, 1.15, 0.09, 1.15));
      gExp.add(mk(G_CYL, matLit(0xf2d28b), 0, 0.24, 0, 0.66, 0.36, 0.66));
      gExp.add(mk(G_CYL, matLit(0xd95638), 0, 0.13, 0, 0.69, 0.1, 0.69));
      hatMeshes.explorer = gExp;

      var gParty = new T.Group();
      gParty.add(mk(G_CONE, matLit(0x7c5cff), 0, 0.36, 0, 0.62, 0.78, 0.62));
      gParty.add(mk(G_SPH, matGlow(0xff5fa2), 0, 0.78, 0, 0.22, 0.22, 0.22));
      hatMeshes.party = gParty;

      var gAstro = new T.Group();
      gAstro.add(mk(G_SPH, matGlow(0x8be2ff, 0.42), 0, -0.26, -0.05, 1.3, 1.25, 1.3));
      gAstro.add(mk(G_CYL, mDark, 0, 0.45, 0, 0.06, 0.28, 0.06));
      gAstro.add(mk(G_SPH, matGlow(0xffe44d), 0, 0.62, 0, 0.18, 0.18, 0.18));
      hatMeshes.astronaut = gAstro;

      var gCrown = new T.Group();
      gCrown.add(mk(G_CYL, mGold, 0, 0.16, 0, 0.72, 0.28, 0.72));
      for (var k = 0; k < 5; k++) {
        var ang = (k / 5) * Math.PI * 2;
        gCrown.add(mk(G_CONE, mGold, Math.cos(ang) * 0.28, 0.38, Math.sin(ang) * 0.28, 0.18, 0.28, 0.18));
      }
      gCrown.add(mk(G_OCT, matGlow(0xff3b6e), 0, 0.2, -0.36, 0.16, 0.16, 0.16));
      hatMeshes.crown = gCrown;

      for (var id in hatMeshes) {
        hatMeshes[id].visible = false;
        hatSlot.add(hatMeshes[id]);
      }
    })();

    // Golden Rampage Aura Sphere + Expanding Shockwave Ring!
    var rampageAura = mk(G_SPH, matGlow(0xffe44d, 0.32), 0, 1.0, 0, 2.35, 2.35, 2.55);
    rampageAura.visible = false;
    dinoRoot.add(rampageAura);
    var roarRing = mk(G_TORUS, matGlow(0xfff066, 0.85), 0, 1.0, -0.4, 1.6, 1.6, 1.6);
    roarRing.visible = false;
    dinoRoot.add(roarRing);

    /* ----------------------------------------- Giant Rolling Magma Boulder */
    var boulderGroup = new T.Group();
    scene.add(boulderGroup);
    var boulderCore = mk(G_ICO, matLit(0x3a2636), 0, 0, 0, 5.2, 5.2, 5.2);
    var boulderLava = mk(G_ICO, matGlow(0xff5a1f), 0, 0, 0, 4.95, 4.95, 4.95, 0.4, 0.6, 0.2);
    var boulderGlow = mk(G_SPH, matGlow(0xffa62b, 0.22), 0, 0, 0, 6.2, 6.2, 6.2);
    boulderGroup.add(boulderCore, boulderLava, boulderGlow);
    // Chunky lava rocks protruding around the boulder so its spin reads clearly!
    var mRockDark = matLit(0x281b26);
    for (var bi = 0; bi < 8; bi++) {
      var ba = (bi / 8) * Math.PI * 2;
      var by = (bi % 2 === 0 ? 1 : -1) * 1.1;
      boulderCore.add(mk(G_BOX, mRockDark, Math.cos(ba) * 0.46, by * 0.22, Math.sin(ba) * 0.46, 0.26, 0.26, 0.26, ba, bi, 0));
    }

    /* ------------------------------------------- Finish Nest & Record Gate */
    var nestGroup = new T.Group();
    nestGroup.visible = false;
    scene.add(nestGroup);
    nestGroup.add(mk(G_CYL, matLit(0xc4813d), 0, 0.5, 0, 6.2, 1.0, 4.2));
    nestGroup.add(mk(G_TORUS, matGlow(0xffe44d), 0, 2.8, 0, 6.6, 5.4, 1.2));
    nestGroup.add(mk(G_SPH, matGlow(0xfff6db), -1.1, 1.2, 0, 1.0, 1.3, 1.0));
    nestGroup.add(mk(G_SPH, matGlow(0xffd23f), 0.1, 1.35, -0.2, 1.2, 1.5, 1.2));
    nestGroup.add(mk(G_SPH, matGlow(0x66e8ff), 1.2, 1.18, 0.1, 0.95, 1.25, 0.95));

    var recordGate = new T.Group();
    recordGate.visible = false;
    scene.add(recordGate);
    recordGate.add(mk(G_CYL, mGold, -ROAD_W * 0.5, 2.6, 0, 0.45, 5.2, 0.45));
    recordGate.add(mk(G_CYL, mGold, ROAD_W * 0.5, 2.6, 0, 0.45, 5.2, 0.45));
    recordGate.add(mk(G_BOX, matGlow(0xffe853), 0, 5.1, 0, ROAD_W + 0.8, 0.72, 0.45));

    /* ------------------------------------------- Pooled Obstacle Templates */
    var obPools = {};
    var activeObs = [];
    function buildObstacleMesh(kind) {
      var g = new T.Group();
      if (kind === 'low') {
        // Chunky cartoon cactus / spiky stump
        g.add(mk(G_CYL, matLit(0x2eb854), 0, 0.58, 0, 0.72, 1.15, 0.72));
        g.add(mk(G_CYL, matLit(0x2eb854), -0.45, 0.68, 0, 0.34, 0.52, 0.34, 0, 0, 0.7));
        g.add(mk(G_CYL, matLit(0x2eb854), 0.45, 0.72, 0, 0.34, 0.48, 0.34, 0, 0, -0.7));
        g.add(mk(G_SPH, matGlow(0xff629e), 0, 1.2, 0, 0.34, 0.34, 0.34));
      } else if (kind === 'tall') {
        // Tall hazard boulder totem (must weave around or Rampage-smash!)
        g.add(mk(G_BOX, matLit(0x6d5878), 0, 1.2, 0, 1.55, 2.4, 1.15));
        g.add(mk(G_BOX, matGlow(0xff5277), 0, 1.95, 0.6, 1.15, 0.34, 0.14));
        g.add(mk(G_BOX, matGlow(0xffd23f), 0, 1.35, 0.6, 0.88, 0.26, 0.14));
      } else if (kind === 'arch') {
        // Overhead bone gate — clear tunnel underneath to slide!
        g.add(mk(G_CYL, matLit(0x9e6338), -0.95, 1.35, 0, 0.28, 2.7, 0.28));
        g.add(mk(G_CYL, matLit(0x9e6338), 0.95, 1.35, 0, 0.28, 2.7, 0.28));
        g.add(mk(G_BOX, matLit(0xff6b4a), 0, 1.92, 0, 2.25, 1.15, 0.95));
        g.add(mk(G_BOX, matGlow(0xffe44d), 0, 1.48, 0.5, 1.9, 0.22, 0.12));
      } else if (kind === 'flyer') {
        // Swooping bright purple pterosaur
        g.add(mk(G_SPH, matLit(0x9b59ff), 0, 1.38, 0, 0.75, 0.52, 1.15));
        g.add(mk(G_CONE, matLit(0xffb833), 0, 1.35, 0.78, 0.3, 0.62, 0.3, Math.PI * 0.5, 0, 0));
        var wL = mk(G_BOX, matLit(0xc27dff), -0.82, 1.44, 0, 1.15, 0.12, 0.68);
        var wR = mk(G_BOX, matLit(0xc27dff), 0.82, 1.44, 0, 1.15, 0.12, 0.68);
        wL.name = 'wL'; wR.name = 'wR';
        g.add(wL, wR);
      } else if (kind === 'crate') {
        // Glowing smashable golden-banded wooden crate!
        g.add(mk(G_BOX, matLit(0xd98736), 0, 0.64, 0, 1.28, 1.28, 1.28));
        g.add(mk(G_BOX, matGlow(0xffe44d), 0, 0.64, 0, 1.36, 0.22, 1.36));
        g.add(mk(G_BOX, matGlow(0xffe44d), 0, 0.64, 0, 0.22, 1.36, 1.36));
      } else if (kind === 'bones') {
        // Crunchy white fossil bone stack (smash for big Rampage juice!)
        var mBone = matLit(0xfff6e5);
        g.add(mk(G_CYL, mBone, 0, 0.32, 0, 0.32, 1.55, 0.32, 0, 0, Math.PI * 0.5));
        g.add(mk(G_SPH, mBone, -0.78, 0.32, 0, 0.44, 0.44, 0.44));
        g.add(mk(G_SPH, mBone, 0.78, 0.32, 0, 0.44, 0.44, 0.44));
        g.add(mk(G_CYL, mBone, 0, 0.76, 0, 0.28, 1.25, 0.28, 0.2, 0.5, Math.PI * 0.5));
        g.add(mk(G_OCT, matGlow(0xffae33), 0, 1.12, 0, 0.42, 0.42, 0.42));
      } else if (kind === 'pad') {
        // Bouncy spotted pink mushroom!
        g.add(mk(G_CYL, matLit(0xfff1d6), 0, 0.22, 0, 0.72, 0.44, 0.72));
        g.add(mk(G_SPH, matLit(0xff4f86), 0, 0.48, 0, 1.72, 0.64, 1.72));
        g.add(mk(G_SPH, mWhite, -0.38, 0.64, 0.22, 0.26, 0.16, 0.26));
        g.add(mk(G_SPH, mWhite, 0.36, 0.66, -0.18, 0.3, 0.16, 0.3));
      } else if (kind === 'boost') {
        // Glowing neon turbo chevrons flat on the track!
        g.add(mk(G_BOX, matLit(0x1f2b4d), 0, 0.04, 0, 2.0, 0.08, 2.6));
        g.add(mk(G_CONE, mBoost, 0, 0.12, -0.55, 1.35, 0.9, 0.14, -Math.PI * 0.5, 0, 0));
        g.add(mk(G_CONE, matGlow(0xffe853), 0, 0.12, 0.45, 1.35, 0.9, 0.14, -Math.PI * 0.5, 0, 0));
      }
      g.visible = false;
      scene.add(g);
      return g;
    }

    function borrowOb(kind) {
      var pool = obPools[kind] || (obPools[kind] = []);
      var mesh = pool.length ? pool.pop() : buildObstacleMesh(kind);
      mesh.visible = true;
      activeObs.push({ kind: kind, mesh: mesh });
      return mesh;
    }
    function releaseAllObs() {
      for (var i = 0; i < activeObs.length; i++) {
        var a = activeObs[i];
        a.mesh.visible = false;
        obPools[a.kind].push(a.mesh);
      }
      activeObs.length = 0;
    }

    /* ----------------------------------------- Instanced Eggs & Particles */
    var EGG_CAP = 96;
    var eggMat = new T.MeshLambertMaterial({ color: 0xffffff });
    var eggIM = new T.InstancedMesh(G_SPH, eggMat, EGG_CAP);
    eggIM.frustumCulled = false;
    eggIM.setColorAt(0, new T.Color(0xffffff));
    eggIM.count = 0;
    scene.add(eggIM);

    var PART_CAP = 140;
    var partMat = new T.MeshBasicMaterial({ color: 0xffffff });
    var partIM = new T.InstancedMesh(G_BOX, partMat, PART_CAP);
    partIM.frustumCulled = false;
    partIM.setColorAt(0, new T.Color(0xffffff));
    partIM.count = 0;
    scene.add(partIM);

    var parts = [];
    var M4 = new T.Matrix4(), Q1 = new T.Quaternion(), E1 = new T.Euler(), V1 = new T.Vector3(), S1 = new T.Vector3(), C1 = new T.Color();
    var curWorldIdx = -1, hopT = 0, squashV = 0, roarFxT = 0;
    var camShake = Kit.shake({ decay: 3.6 });
    var camX = 0, camY = 4.4;

    function applyWorldPalette(idx) {
      if (idx === curWorldIdx) return;
      curWorldIdx = idx;
      var P = PALETTES[idx % PALETTES.length];
      scene.background = new T.Color(P.sky);
      scene.fog.color.setHex(P.fog);
      hemi.color.setHex(P.hemiA);
      hemi.groundColor.setHex(P.hemiB);
      mRoad.color.setHex(P.road);
      mStripe.color.setHex(P.stripe);
      mCurb.color.setHex(P.curb);
      mGround.color.setHex(P.ground);
      mPropA.color.setHex(P.propA);
      mPropB.color.setHex(P.propB);
      mSun.color.setHex(P.sunCol);
    }
    applyWorldPalette(0);

    function setDinoLook(colorIdx, hatIdx) {
      var c = D.COLORS[colorIdx] || D.COLORS[0];
      mDinoBody.color.setHex(c.hex);
      mDinoBelly.color.setHex(c.belly);
      mDinoCrest.color.setHex(c.crest);
      var h = D.HATS[hatIdx] || D.HATS[0];
      for (var id in hatMeshes) hatMeshes[id].visible = id === h.id;
    }

    function burst(worldDist, y, laneX, opts) {
      if (view.calm) return;
      opts = opts || {};
      var n = Math.min(28, opts.count || 10);
      var cols = opts.colors || [0xffe44d, 0xffffff];
      var spd = opts.speed || 5.0;
      var up = opts.up || 4.0;
      var life = opts.life || 0.55;
      var sz = opts.size || 0.25;
      var grav = opts.gravity == null ? 13 : opts.gravity;
      for (var i = 0; i < n; i++) {
        if (parts.length >= PART_CAP) parts.shift();
        var a = Math.random() * Math.PI * 2;
        var r = 0.35 + Math.random() * 0.65;
        parts.push({
          d: worldDist, lx: laneX, y: y,
          vd: (Math.random() - 0.5) * spd + (opts.vd || 0),
          vlx: Math.cos(a) * spd * r,
          vy: up * (0.45 + Math.random() * 0.75),
          life: life * (0.65 + Math.random() * 0.5),
          max: life,
          sz: sz * (0.65 + Math.random() * 0.7),
          g: grav,
          col: cols[i % cols.length]
        });
      }
    }

    function updateScene(cfg) {
      var dt = cfg.dt || 0.016;
      var t = cfg.t || 0;
      var w = cfg.world;
      var p = cfg.player;
      var mode = cfg.mode;
      var wIdx = w ? w.worldIndex : (cfg.worldIndex || 0);
      applyWorldPalette(wIdx);

      camShake.update(dt);
      if (hopT > 0) hopT = Math.max(0, hopT - dt * 2.8);
      if (squashV > 0) squashV = Math.max(0, squashV - dt * 5.5);
      else if (squashV < 0) squashV = Math.min(0, squashV + dt * 5.5);
      if (roarFxT > 0) roarFxT = Math.max(0, roarFxT - dt * 2.2);

      // Forward distance `refD`: world.x in play, live running attract speed on title!
      var refD = w ? w.x : (mode === 'menu' ? t * 11.5 : 0);
      var dinoLx = w ? p.lx : (mode === 'menu' ? Math.sin(t * 1.15) * LANE_W * 0.78 : 0);
      var dinoY = w ? p.y : (hopT > 0 ? Math.sin(hopT * Math.PI) * 1.35 : (mode === 'menu' ? Math.abs(Math.sin(t * 3.4)) * 0.16 : 0));
      var stride = w ? p.stride : (mode === 'menu' ? t * 14 : t * 2.5);
      var roaring = !!(w && p.roaring);

      // Position dino at Z = 0; world streams smoothly toward +Z relative to refD!
      dinoRoot.position.set(dinoLx, dinoY, 0);

      // Squash & stretch, duck flatten, turn lean, and wardrobe turntable spin!
      var sx = 1 - squashV * 0.18;
      var sy = (p.duck ? 0.54 : 1) + squashV * 0.24;
      var sz = 1 - squashV * 0.12;
      dinoPivot.scale.set(sx, sy, sz);
      if (mode === 'wardrobe') {
        dinoPivot.rotation.set(0, Math.PI + (cfg.spin || 0), 0);
      } else if (mode === 'finish') {
        dinoPivot.rotation.set(0, Math.PI + Math.sin(t * 5) * 0.45, 0);
      } else {
        dinoPivot.rotation.set(p.duck ? -0.35 : (p.ground ? 0.08 : -p.vy * 0.025), 0, (p.lean || 0) * 0.28);
      }
      var sw = Math.sin(stride);
      legL.rotation.x = p.ground ? sw * 0.65 : -0.45;
      legR.rotation.x = p.ground ? -sw * 0.65 : 0.45;
      tailGroup.rotation.y = Math.sin(t * 7.5) * 0.28;

      // Invulnerability blink & Golden Rampage glow!
      var blinkOff = p.invuln > 0 && !roaring && Math.floor(t * 18) % 2 === 0;
      dinoPivot.visible = !blinkOff;
      rampageAura.visible = roaring;
      if (roaring) {
        var rp = 1 + Math.sin(t * 22) * 0.12;
        rampageAura.scale.set(2.35 * rp, 2.35 * rp, 2.55 * rp);
      }
      roarRing.visible = roarFxT > 0;
      if (roarFxT > 0) {
        var u = 1 - roarFxT;
        var rs = 1.4 + u * 6.5;
        roarRing.scale.set(rs, rs, rs);
        roarRing.position.z = -u * 5.0;
      }

      // Giant Rolling Magma Boulder behind the dino!
      var showBoulder = mode === 'play' || mode === 'menu';
      boulderGroup.visible = showBoulder;
      if (showBoulder) {
        var bDist = w ? w.boulderDist : 0.72;
        // Close behind at +3.1 when bDist=0, rumbling back at +8.8 when bDist=1.
        var bz = 3.1 + bDist * 5.7;
        var bx = dinoLx * 0.55 + Math.sin(t * 14) * (1 - bDist) * 0.14;
        var bHop = Math.abs(Math.sin((w ? w.boulderSpin : t * 5) * 1.4)) * 0.26;
        boulderGroup.position.set(bx, 2.45 + bHop, bz);
        boulderCore.rotation.x = -(w ? w.boulderSpin : t * 6.5);
        boulderLava.rotation.x = boulderCore.rotation.x * 1.03;
        boulderLava.rotation.y = Math.sin(t * 3) * 0.2;
      }

      // Scrolling lane dashes.
      var dashOff = refD % 6.0;
      var di = 0;
      for (var dRow = 0; dRow < 24; dRow++) {
        var zPos = 10 - dRow * 6 + dashOff;
        for (var dSide = 0; dSide < 2; dSide++) {
          V1.set(dSide === 0 ? -LANE_W * 0.5 : LANE_W * 0.5, 0.02, zPos);
          Q1.identity();
          S1.set(0.18, 0.03, 2.4);
          M4.compose(V1, Q1, S1);
          dashIM.setMatrixAt(di++, M4);
        }
      }
      Kit.webgl.shrinkCount(dashIM, di);

      // Scrolling roadside scenery props (trees/cacti/crystals flanking the 3-lane track!).
      var propSpacing = 12;
      var baseIdx = Math.floor(refD / propSpacing);
      var pi = 0;
      for (var pr = -1; pr < 16 && pi < PROP_N - 1; pr++) {
        var idx = baseIdx + pr;
        var worldZ = -(idx * propSpacing - refD);
        for (var side = -1; side <= 1; side += 2) {
          var hash = Math.abs(Math.sin(idx * 12.9898 + side * 78.233)) * 100;
          var px = side * (ROAD_W * 0.5 + 3.2 + (hash % 5.5));
          var hScale = 1.6 + (hash % 1.8);
          V1.set(px, hScale * 0.55, worldZ);
          Q1.identity();
          S1.set(0.65, hScale * 1.1, 0.65);
          M4.compose(V1, Q1, S1);
          propTrunkIM.setMatrixAt(pi, M4);

          V1.set(px, hScale * 1.45, worldZ);
          S1.set(2.1, hScale * 1.5, 2.1);
          M4.compose(V1, Q1, S1);
          propTopIM.setMatrixAt(pi, M4);
          pi++;
        }
      }
      Kit.webgl.shrinkCount(propTrunkIM, pi);
      Kit.webgl.shrinkCount(propTopIM, pi);

      // Shadows pool reset.
      if (shadows) {
        shadows.reset();
        var shS = Math.max(0.55, 1.45 - dinoY * 0.16);
        shadows.add(dinoLx, 0, 0, shS, shS * 1.2, 0);
        if (showBoulder) shadows.add(boulderGroup.position.x, 0, boulderGroup.position.z, 5.2, 5.2, 0);
      }

      // Render visible obstacles from pooled templates!
      releaseAllObs();
      if (w) {
        for (var i = w.oi; i < w.obs.length; i++) {
          var ob = w.obs[i];
          var relD = ob.x - refD;
          if (relD > 92) break;
          if (relD < -10 || ob.smashed) continue;
          var mesh = borrowOb(ob.kind);
          var mz = -relD;
          mesh.position.set(ob.lx, 0, mz);
          if (ob.kind === 'flyer') {
            mesh.position.y = Math.sin(ob.flyT) * 0.24;
            var wL = mesh.getObjectByName('wL');
            var wR = mesh.getObjectByName('wR');
            if (wL && wR) {
              var flap = Math.sin(ob.flyT * 1.6) * 0.52;
              wL.rotation.z = flap;
              wR.rotation.z = -flap;
            }
          }
          if (shadows && !ob.boost) {
            shadows.add(ob.lx, 0, mz, ob.kind === 'arch' ? 2.1 : 1.35, 1.35, 0);
          }
        }

        // Finish nest & Endless Gold Record Gate!
        if (!w.endless) {
          var nestRel = w.length - refD;
          nestGroup.visible = nestRel < 105 && nestRel > -15;
          if (nestGroup.visible) nestGroup.position.set(0, 0, -nestRel);
          recordGate.visible = false;
        } else {
          nestGroup.visible = false;
          var recRel = w.bestFar - refD;
          recordGate.visible = w.bestFar > 10 && recRel < 100 && recRel > -12;
          if (recordGate.visible) recordGate.position.set(0, 0, -recRel);
        }
      } else {
        nestGroup.visible = false;
        recordGate.visible = false;
      }

      // Instanced collectibles (eggs, gold eggs, rainbow eggs, hearts!).
      var ei = 0;
      if (w) {
        for (var j = w.ii; j < w.items.length && ei < EGG_CAP; j++) {
          var it = w.items[j];
          var rD = it.x - refD;
          if (rD > 85) break;
          if (rD < -6 || it.got) continue;
          var bob = Math.sin(t * 5.2 + it.id) * 0.16;
          V1.set(it.lx, it.y + bob, -rD);
          E1.set(0, t * 2.8 + it.id, 0);
          Q1.setFromEuler(E1);
          var eSz = it.kind === 'gold' ? 0.92 : it.kind === 'heart' ? 0.86 : 0.72;
          S1.set(eSz * 0.85, eSz * 1.18, eSz * 0.85);
          M4.compose(V1, Q1, S1);
          eggIM.setMatrixAt(ei, M4);
          if (it.kind === 'gold') C1.setHex(0xffd633);
          else if (it.kind === 'heart') C1.setHex(0xff4772);
          else if (it.kind === 'rainbow') C1.setHSL(((t * 0.7 + it.chain * 0.16) % 1), 0.92, 0.62);
          else C1.setHex(0xfff6db);
          eggIM.setColorAt(ei, C1);
          if (shadows) shadows.add(it.lx, 0, -rD, 0.75, 0.75, 0);
          ei++;
        }
      }
      Kit.webgl.shrinkCount(eggIM, ei);
      if (ei > 0 && eggIM.instanceColor) Kit.webgl.uploadRange(eggIM.instanceColor, ei * 3);
      if (shadows) shadows.commit();

      // Update & upload burst particles!
      var piOut = 0;
      for (var k = parts.length - 1; k >= 0; k--) {
        var pt = parts[k];
        pt.life -= dt;
        if (pt.life <= 0) { parts.splice(k, 1); continue; }
        pt.vy -= pt.g * dt;
        pt.d += pt.vd * dt;
        pt.lx += pt.vlx * dt;
        pt.y = Math.max(0.08, pt.y + pt.vy * dt);
        var uLife = Math.max(0.05, pt.life / pt.max);
        V1.set(pt.lx, pt.y, -(pt.d - refD));
        E1.set(pt.life * 6, pt.life * 4, 0);
        Q1.setFromEuler(E1);
        S1.setScalar(pt.sz * uLife);
        M4.compose(V1, Q1, S1);
        partIM.setMatrixAt(piOut, M4);
        C1.setHex(pt.col);
        partIM.setColorAt(piOut, C1);
        piOut++;
      }
      Kit.webgl.shrinkCount(partIM, piOut);
      if (piOut > 0 && partIM.instanceColor) Kit.webgl.uploadRange(partIM.instanceColor, piOut * 3);

      // Behind-the-back 3-lane camera (or front-angle showcase in wardrobe/finish!).
      var wantX = dinoLx * 0.44;
      var wantY = mode === 'wardrobe' ? 2.1 : mode === 'finish' ? 2.8 : 4.5 + dinoY * 0.34;
      var wantZ = mode === 'wardrobe' ? 4.8 : mode === 'finish' ? 5.6 : 9.4;
      if (cfg.snap) { camX = wantX; camY = wantY; }
      else {
        var cs = 1 - Math.exp(-dt * 12);
        camX += (wantX - camX) * cs;
        camY += (wantY - camY) * cs;
      }
      var sxOff = view.calm ? 0 : camShake.x * 0.45;
      var syOff = view.calm ? 0 : camShake.y * 0.38;
      if (mode === 'wardrobe') {
        camera.position.set(1.55, wantY, wantZ);
        camera.lookAt(0.55, 1.15, 0);
      } else if (mode === 'finish') {
        camera.position.set(camX + 2.4, wantY, wantZ);
        camera.lookAt(dinoLx, 1.2, 0);
      } else {
        camera.position.set(camX + sxOff, camY + syOff, wantZ);
        camera.lookAt(camX * 0.55, 1.55 + dinoY * 0.2, -16);
      }
    }

    function project(worldDist, y, laneX, refD) {
      V1.set(laneX || 0, y || 0, -((worldDist || 0) - (refD || 0)));
      V1.project(camera);
      return { x: (V1.x + 1) * 0.5, y: (1 - V1.y) * 0.5 };
    }

    var view = {
      calm: false,
      software: software,
      renderer: renderer,
      setDinoLook: setDinoLook,
      resetWorld: function (idx) { applyWorldPalette(idx || 0); parts.length = 0; },
      triggerHop: function () { hopT = 1; },
      triggerSquash: function (dir) { squashV = dir > 0 ? 1 : -1; },
      triggerRoar: function () { roarFxT = 1; },
      shake: function (power) { camShake.add(power || 0.4); },
      burst: burst,
      project: project,
      update: updateScene,
      mayDraw: function (now, playing) { return pacer.mayDraw(now, playing); },
      frameTime: function () {},
      resize: function (w, h) {
        if (w <= 0 || h <= 0) return;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h, false);
      },
      render: function () {
        renderer.render(scene, camera);
        pacer.markDrawn();
      }
    };
    return view;
  };
})();
