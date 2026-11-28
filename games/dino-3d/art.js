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

    var wgl = Kit.webgl.createRenderer(canvas, { srgb: true, softRatio: 1, max: 1.75, antialias: true });
    var software = wgl.software, renderer = wgl.renderer;
    var pacer = Kit.webgl.pacer(renderer, { software: software, duty: 2 });

    var scene = new T.Scene();
    var camera = new T.PerspectiveCamera(52, 16 / 9, 0.2, 210);
    scene.fog = new T.Fog(0xffe0a8, 66, 195);

    var hemi = new T.HemisphereLight(0xfff8e6, 0x9c7248, 1.5);
    var sun = new T.DirectionalLight(0xfff2d6, 2.05);
    sun.position.set(14, 26, 18);
    scene.add(hemi, sun);

    var PALETTES = [
      // 0: Golden Desert
      { sky: 0x45bdff, hor: 0xffdea0, fog: 0xffe2ad, hemiA: 0xfff7e2, hemiB: 0xd98a42, road: 0xf7cf7c, stripe: 0xfff3cc, curb: 0xe86c3a, curbAlt: 0xfff1c9, ground: 0xe8a44c, propA: 0x30bd59, propB: 0x269e4a, mesa: 0xc85d30, mesaTop: 0xec924d, sunCol: 0xffe86b },
      // 1: Lush Jungle
      { sky: 0x3ec4ff, hor: 0xbaf2c8, fog: 0xbaf2c8, hemiA: 0xf0fff2, hemiB: 0x3b8a42, road: 0xdcb472, stripe: 0xf2d8a2, curb: 0x3ec456, curbAlt: 0xf7f2c8, ground: 0x42b552, propA: 0x2da349, propB: 0x7c4e2a, mesa: 0x318f4b, mesaTop: 0x52c768, sunCol: 0xfff49c },
      // 2: Snowy Peaks
      { sky: 0x5ea6ff, hor: 0xe6f6ff, fog: 0xdcf2ff, hemiA: 0xffffff, hemiB: 0x7ea7d9, road: 0xedf6ff, stripe: 0xffffff, curb: 0x4ec0ff, curbAlt: 0xffffff, ground: 0xcbe8ff, propA: 0x2d8a68, propB: 0x7aa4cf, mesa: 0x8db3dc, mesaTop: 0xffffff, sunCol: 0xffffff },
      // 3: Volcano Valley
      { sky: 0x592966, hor: 0xff7e47, fog: 0xa84349, hemiA: 0xffb380, hemiB: 0x421c38, road: 0x4e4259, stripe: 0xff7b38, curb: 0xff5226, curbAlt: 0xffc442, ground: 0x36243d, propA: 0x473554, propB: 0xff6b2b, mesa: 0x4a263e, mesaTop: 0x733245, sunCol: 0xff8c42 },
      // 4: Royal Nest
      { sky: 0x878aff, hor: 0xffc7ea, fog: 0xffc7ea, hemiA: 0xfff5ff, hemiB: 0x8f6ac4, road: 0xfff2c7, stripe: 0xff9ad6, curb: 0xff62a8, curbAlt: 0xfff4a3, ground: 0x74d48c, propA: 0xff7ec4, propB: 0x6ce3ff, mesa: 0xb98aff, mesaTop: 0xffb8e6, sunCol: 0xfff08a }
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

    // Procedural crisp scrolling textures for road & desert dunes!
    function makeTrackTexture(isRoad) {
      var c = document.createElement('canvas');
      c.width = 256; c.height = 256;
      var g = c.getContext('2d');
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, 256, 256);
      if (isRoad) {
        // Subtle sunlit compacted sand road planks, center sheen & warm pebbles
        var lg = g.createLinearGradient(0, 0, 256, 0);
        lg.addColorStop(0, '#e6d8c0'); lg.addColorStop(0.12, '#fffcf2');
        lg.addColorStop(0.5, '#ffffff'); lg.addColorStop(0.88, '#fffcf2'); lg.addColorStop(1, '#e6d8c0');
        g.fillStyle = lg; g.fillRect(0, 0, 256, 256);
        for (var y = 0; y < 256; y += 32) {
          g.fillStyle = 'rgba(130, 82, 32, 0.08)';
          g.fillRect(10, y, 236, 4);
        }
        for (var i = 0; i < 42; i++) {
          var px = (i * 59 + 17) % 236 + 10, py = (i * 41 + 9) % 246 + 4;
          g.fillStyle = i % 2 ? 'rgba(120, 74, 28, 0.11)' : 'rgba(255, 255, 255, 0.28)';
          g.beginPath(); g.ellipse(px, py, 5 + (i % 4), 2.5, 0, 0, 6.283); g.fill();
        }
      } else {
        // Sweeping wind-blown sand dunes & sunlit ripple bands
        for (var r = 0; r < 16; r++) {
          var ry = r * 16;
          g.fillStyle = r % 2 ? 'rgba(140, 75, 22, 0.09)' : 'rgba(255, 245, 210, 0.14)';
          g.beginPath(); g.moveTo(0, ry);
          g.bezierCurveTo(64, ry - 7, 192, ry + 7, 256, ry);
          g.lineTo(256, ry + 9); g.bezierCurveTo(192, ry + 16, 64, ry + 2, 0, ry + 9);
          g.closePath(); g.fill();
        }
        for (var j = 0; j < 28; j++) {
          g.fillStyle = 'rgba(120, 62, 18, 0.12)';
          g.beginPath(); g.arc((j * 73 + 11) % 256, (j * 53 + 7) % 256, 2.5 + (j % 3), 0, 6.283); g.fill();
        }
      }
      var tex = new T.CanvasTexture(c);
      tex.wrapS = T.RepeatWrapping; tex.wrapT = T.RepeatWrapping;
      tex.repeat.set(isRoad ? 1 : 9, isRoad ? 14 : 12);
      tex.colorSpace = T.SRGBColorSpace || tex.colorSpace;
      return tex;
    }

    var roadTex = makeTrackTexture(true);
    var groundTex = makeTrackTexture(false);
    // Smooth vertical fade texture for horizon glow (eliminates any flat sky seam!)
    var horTex = (function () {
      var c = document.createElement('canvas'); c.width = 4; c.height = 128;
      var g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 128);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.42)'); gr.addColorStop(1, 'rgba(255,255,255,0.95)');
      g.fillStyle = gr; g.fillRect(0, 0, 4, 128);
      return new T.CanvasTexture(c);
    })();

    // Dynamic world materials (colors update on biome switch without rebuilding meshes!).
    var mRoad = new T.MeshLambertMaterial({ color: PALETTES[0].road, map: roadTex });
    var mStripe = new T.MeshBasicMaterial({ color: PALETTES[0].stripe });
    var mCurb = new T.MeshLambertMaterial({ color: PALETTES[0].curb });
    var mCurbAlt = new T.MeshLambertMaterial({ color: PALETTES[0].curbAlt });
    var mGround = new T.MeshLambertMaterial({ color: PALETTES[0].ground, map: groundTex });
    var mPropA = new T.MeshLambertMaterial({ color: PALETTES[0].propA });
    var mPropB = new T.MeshLambertMaterial({ color: PALETTES[0].propB });
    var mMesa = new T.MeshLambertMaterial({ color: PALETTES[0].mesa });
    var mMesaTop = new T.MeshLambertMaterial({ color: PALETTES[0].mesaTop });
    var mHorizon = new T.MeshBasicMaterial({ color: PALETTES[0].hor, map: horTex, transparent: true, depthWrite: false, fog: false });
    var mSun = new T.MeshBasicMaterial({ color: PALETTES[0].sunCol, fog: false });
    var mSunHalo = new T.MeshBasicMaterial({ color: 0xfff5b8, transparent: true, opacity: 0.28, depthWrite: false, fog: false });
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
    var groundMesh = mk(G_PLANE, mGround, 0, -0.06, -48, 220, 195, 1, -Math.PI / 2, 0, 0);
    var roadMesh = mk(G_PLANE, mRoad, 0, 0, -48, ROAD_W, 195, 1, -Math.PI / 2, 0, 0);
    var curbL = mk(G_BOX, mCurb, -ROAD_W * 0.5 - 0.38, 0.20, -48, 0.76, 0.40, 195);
    var curbR = mk(G_BOX, mCurb, ROAD_W * 0.5 + 0.38, 0.20, -48, 0.76, 0.40, 195);
    trackGroup.add(groundMesh, roadMesh, curbL, curbR);

    // Crisp lane divider dashes + striped curb accent markers (InstancedMesh, scrolling smoothly!).
    var DASH_N = 48;
    var dashIM = new T.InstancedMesh(G_BOX, mStripe, DASH_N);
    dashIM.frustumCulled = false;
    var CURB_N = 48;
    var curbMarkIM = new T.InstancedMesh(G_BOX, mCurbAlt, CURB_N);
    curbMarkIM.frustumCulled = false;
    scene.add(dashIM, curbMarkIM);

    // Rich Desert Horizon Diorama: warm horizon haze band, glowing sun+halo, Monument Valley mesas, volcano & fluffy clouds!
    var skyGroup = new T.Group();
    scene.add(skyGroup);
    var horBand = mk(G_PLANE, mHorizon, 0, 22, -138, 360, 52, 1);
    skyGroup.add(horBand);
    var sunMesh = mk(G_SPH_HI, mSun, 26, 36, -122, 17, 17, 17);
    var sunHalo = mk(G_SPH_HI, mSunHalo, 26, 36, -124, 27, 27, 27);
    skyGroup.add(sunMesh, sunHalo);

    // Monument Valley Red-Rock Mesas & Buttes flanking the horizon!
    var mesaDefs = [
      { x: -62, z: -96,  w: 30, h: 17, d: 18 },
      { x: -34, z: -102, w: 22, h: 12, d: 14 },
      { x: -82, z: -82,  w: 24, h: 14, d: 16 },
      { x:  42, z: -98,  w: 28, h: 16, d: 16 },
      { x:  72, z: -86,  w: 26, h: 19, d: 18 },
      { x:  18, z: -108, w: 18, h: 9,  d: 12 }
    ];
    for (var mi = 0; mi < mesaDefs.length; mi++) {
      var md = mesaDefs[mi];
      skyGroup.add(mk(G_CYL, mMesa, md.x, md.h * 0.45, md.z, md.w, md.h, md.d));
      skyGroup.add(mk(G_CYL, mMesaTop, md.x, md.h * 0.96, md.z, md.w * 0.84, md.h * 0.18, md.d * 0.84));
      skyGroup.add(mk(G_CYL, mMesa, md.x + (md.x < 0 ? 7 : -7), md.h * 0.28, md.z + 5, md.w * 0.52, md.h * 0.56, md.d * 0.52));
    }

    // Distant Volcano silhouette with glowing lava rim & floating smoke puffs!
    var volcX = -14, volcZ = -112;
    skyGroup.add(mk(G_CONE, matLit(0x5e2c3e), volcX, 13, volcZ, 30, 26, 30));
    skyGroup.add(mk(G_CYL, matGlow(0xff6b2b), volcX, 24.4, volcZ, 5.4, 1.6, 5.4));
    var smokeMat = matGlow(0xfff4e0, 0.55);
    var smokePuffs = [];
    for (var spk = 0; spk < 3; spk++) {
      var spMesh = mk(G_SPH, smokeMat, volcX + spk * 2.2, 27 + spk * 3.6, volcZ, 4.5 + spk * 1.6, 3.2 + spk, 4.0);
      skyGroup.add(spMesh);
      smokePuffs.push(spMesh);
    }

    var mCloud = matGlow(0xffffff, 0.92);
    for (var ci = 0; ci < 7; ci++) {
      var cg = new T.Group();
      var cx = -62 + ci * 20 + (ci % 2) * 5;
      var cy = 22 + (ci % 3) * 4.8;
      var cz = -92 - (ci % 3) * 12;
      cg.position.set(cx, cy, cz);
      cg.add(mk(G_SPH, mCloud, 0, 0, 0, 10, 4.4, 4.5));
      cg.add(mk(G_SPH, mCloud, -4.0, -0.6, 0.4, 6.2, 3.4, 3.6));
      cg.add(mk(G_SPH, mCloud, 4.2, -0.5, -0.2, 6.4, 3.2, 3.6));
      skyGroup.add(cg);
    }

    // Pooled roadside Saguaro Cacti + Desert Boulders (InstancedMesh = crisp cartoon desert props!).
    var PROP_N = 40;
    var propTrunkIM = new T.InstancedMesh(G_CYL, mPropA, PROP_N);
    var propArmLIM = new T.InstancedMesh(G_CYL, mPropB, PROP_N);
    var propArmRIM = new T.InstancedMesh(G_CYL, mPropB, PROP_N);
    var propBloomIM = new T.InstancedMesh(G_SPH, matGlow(0xff6ba9), PROP_N);
    var propRockIM = new T.InstancedMesh(G_ICO, mMesaTop, PROP_N);
    propTrunkIM.frustumCulled = false; propArmLIM.frustumCulled = false;
    propArmRIM.frustumCulled = false; propBloomIM.frustumCulled = false;
    propRockIM.frustumCulled = false;
    scene.add(propTrunkIM, propArmLIM, propArmRIM, propBloomIM, propRockIM);

    // Pooled soft ground shadows via Kit.webgl.blobShadowPool!
    var shadows = Kit.webgl.blobShadowPool(scene, 72, { opacity: 0.38, yOffset: 0.03 });

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
    // Cute side eyes + rosy cheeks (visible in 3/4 turns & wardrobe spin!)
    headGroup.add(mk(G_SPH, mDark, -0.34, 0.16, -0.34, 0.2, 0.24, 0.18));
    headGroup.add(mk(G_SPH, mDark, 0.34, 0.16, -0.34, 0.2, 0.24, 0.18));
    headGroup.add(mk(G_SPH, mWhite, -0.37, 0.22, -0.4, 0.07, 0.08, 0.07));
    headGroup.add(mk(G_SPH, mWhite, 0.37, 0.22, -0.4, 0.07, 0.08, 0.07));
    headGroup.add(mk(G_SPH, matGlow(0xff80ab), -0.38, -0.02, -0.46, 0.14, 0.1, 0.12));
    headGroup.add(mk(G_SPH, matGlow(0xff80ab), 0.38, -0.02, -0.46, 0.14, 0.1, 0.12));
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

    // Golden Rampage Aura Sphere + Orbiting Sparks + Expanding Shockwave Ring!
    var rampageAura = mk(G_SPH, matGlow(0xffe44d, 0.32), 0, 1.0, 0, 2.35, 2.35, 2.55);
    rampageAura.visible = false;
    var roarOrbits = new T.Group();
    for (var rk = 0; rk < 6; rk++) {
      var ra = (rk / 6) * Math.PI * 2;
      roarOrbits.add(mk(G_OCT, matGlow(rk % 2 ? 0xfff066 : 0xff922b), Math.cos(ra) * 0.56, Math.sin(ra * 2) * 0.18, Math.sin(ra) * 0.56, 0.13, 0.13, 0.13));
    }
    rampageAura.add(roarOrbits);
    dinoRoot.add(rampageAura);
    var roarRing = mk(G_TORUS, matGlow(0xfff066, 0.85), 0, 1.0, -0.4, 1.6, 1.6, 1.6);
    roarRing.visible = false;
    dinoRoot.add(roarRing);

    /* ----------------------------------------- Compact Rolling Magma Boulder */
    // Scaled cleanly (radius 1.42) with bright molten veins & smooth rock facets!
    var boulderGroup = new T.Group();
    scene.add(boulderGroup);
    var boulderCore = mk(G_ICO, matLit(0x4a2a38), 0, 0, 0, 2.75, 2.75, 2.75);
    var boulderLava = mk(G_ICO, matGlow(0xff6b24), 0, 0, 0, 2.82, 2.82, 2.82, 0.4, 0.6, 0.2);
    var boulderGlow = mk(G_SPH, matGlow(0xffb833, 0.32), 0, 0, 0, 3.25, 3.25, 3.25);
    boulderGroup.add(boulderCore, boulderLava, boulderGlow);
    var mRockDark = matLit(0x36202e);
    for (var bi = 0; bi < 8; bi++) {
      var ba = (bi / 8) * Math.PI * 2;
      var by = (bi % 2 === 0 ? 1 : -1) * 0.85;
      boulderCore.add(mk(G_ICO, mRockDark, Math.cos(ba) * 0.46, by * 0.22, Math.sin(ba) * 0.46, 0.22, 0.22, 0.22, ba, bi, 0));
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
      mCurbAlt.color.setHex(P.curbAlt);
      mGround.color.setHex(P.ground);
      mPropA.color.setHex(P.propA);
      mPropB.color.setHex(P.propB);
      mMesa.color.setHex(P.mesa);
      mMesaTop.color.setHex(P.mesaTop);
      mHorizon.color.setHex(P.hor);
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

      // Scroll road & sand dune textures smoothly with forward run!
      roadTex.offset.y = (refD * 0.072) % 1;
      groundTex.offset.y = (refD * 0.062) % 1;
      for (var smi = 0; smi < smokePuffs.length; smi++) {
        var spM = smokePuffs[smi];
        var ph = (t * 0.35 + smi * 0.33) % 1;
        spM.position.set(volcX + ph * 6.5, 25.5 + ph * 11, volcZ);
        var scS = 3.2 + ph * 4.8;
        spM.scale.set(scS, scS * 0.72, scS);
      }

      // Invulnerability blink & Golden Rampage glow!
      var blinkOff = p.invuln > 0 && !roaring && Math.floor(t * 18) % 2 === 0;
      dinoPivot.visible = !blinkOff;
      rampageAura.visible = roaring;
      if (roaring) {
        var rp = 1 + Math.sin(t * 22) * 0.12;
        rampageAura.scale.set(2.35 * rp, 2.35 * rp, 2.55 * rp);
        roarOrbits.rotation.y = t * 5.2;
      }
      roarRing.visible = roarFxT > 0;
      if (roarFxT > 0) {
        var u = 1 - roarFxT;
        var rs = 1.4 + u * 6.5;
        roarRing.scale.set(rs, rs, rs);
        roarRing.position.z = -u * 5.0;
      }

      // Rolling Magma Boulder: hidden on Title to showcase sunny desert; in Play strictly clear of camera!
      var showBoulder = mode === 'play';
      boulderGroup.visible = showBoulder;
      if (showBoulder) {
        var bDist = w ? w.boulderDist : 0.78;
        // Close behind dino tail at +2.8 when bDist=0, tucked smoothly at +7.0 when safe (camera at Z=+11.4, Y=6.0!)
        var bz = 2.8 + Math.min(bDist, 0.88) * 4.9;
        var bx = dinoLx * 0.55 + Math.sin(t * 14) * (1 - bDist) * 0.14;
        var bHop = Math.abs(Math.sin((w ? w.boulderSpin : t * 5) * 1.4)) * 0.16;
        boulderGroup.position.set(bx, 1.38 + bHop, bz);
        boulderCore.rotation.x = -(w ? w.boulderSpin : t * 6.5);
        boulderLava.rotation.x = boulderCore.rotation.x * 1.03;
        boulderLava.rotation.y = Math.sin(t * 3) * 0.2;
      }

      // Scrolling lane dashes & alternating curb blocks.
      var dashOff = refD % 6.0;
      var di = 0, ci2 = 0;
      for (var dRow = 0; dRow < 24; dRow++) {
        var zPos = 10 - dRow * 6 + dashOff;
        for (var dSide = 0; dSide < 2; dSide++) {
          V1.set(dSide === 0 ? -LANE_W * 0.5 : LANE_W * 0.5, 0.02, zPos);
          Q1.identity();
          S1.set(0.20, 0.03, 2.5);
          M4.compose(V1, Q1, S1);
          dashIM.setMatrixAt(di++, M4);

          V1.set((dSide === 0 ? -1 : 1) * (ROAD_W * 0.5 + 0.38), 0.42, zPos);
          S1.set(0.82, 0.06, 2.8);
          M4.compose(V1, Q1, S1);
          curbMarkIM.setMatrixAt(ci2++, M4);
        }
      }
      Kit.webgl.shrinkCount(dashIM, di);
      Kit.webgl.shrinkCount(curbMarkIM, ci2);

      // Scrolling roadside Saguaro Cacti & warm desert sandstone boulders!
      var propSpacing = 12;
      var baseIdx = Math.floor(refD / propSpacing);
      var pi = 0, ri2 = 0;
      for (var pr = -1; pr < 16 && pi < PROP_N - 1; pr++) {
        var idx = baseIdx + pr;
        var worldZ = -(idx * propSpacing - refD);
        for (var side = -1; side <= 1; side += 2) {
          var hash = Math.abs(Math.sin(idx * 12.9898 + side * 78.233)) * 100;
          var px = side * (ROAD_W * 0.5 + 3.0 + (hash % 6.0));
          var hScale = 1.9 + (hash % 1.9);
          // Saguaro cactus trunk + left/right arms + pink blossom
          V1.set(px, hScale * 0.9, worldZ);
          Q1.identity();
          S1.set(0.74, hScale * 1.8, 0.74);
          M4.compose(V1, Q1, S1);
          propTrunkIM.setMatrixAt(pi, M4);

          V1.set(px - 0.62, hScale * 0.92, worldZ);
          E1.set(0, 0, 0.48); Q1.setFromEuler(E1);
          S1.set(0.42, hScale * 0.72, 0.42);
          M4.compose(V1, Q1, S1);
          propArmLIM.setMatrixAt(pi, M4);

          V1.set(px + 0.62, hScale * 1.08, worldZ);
          E1.set(0, 0, -0.48); Q1.setFromEuler(E1);
          S1.set(0.42, hScale * 0.64, 0.42);
          M4.compose(V1, Q1, S1);
          propArmRIM.setMatrixAt(pi, M4);

          V1.set(px, hScale * 1.86, worldZ);
          Q1.identity();
          S1.set(0.46, 0.36, 0.46);
          M4.compose(V1, Q1, S1);
          propBloomIM.setMatrixAt(pi, M4);
          pi++;

          // Flanking warm desert sandstone rock outcroppings further out
          if (ri2 < PROP_N) {
            var rx = side * (ROAD_W * 0.5 + 8.5 + ((hash * 3.1) % 10));
            var rSz = 1.8 + (hash % 2.4);
            V1.set(rx, rSz * 0.32, worldZ - 4.5);
            E1.set(0, hash, 0); Q1.setFromEuler(E1);
            S1.set(rSz * 1.5, rSz * 0.9, rSz * 1.2);
            M4.compose(V1, Q1, S1);
            propRockIM.setMatrixAt(ri2++, M4);
          }
        }
      }
      Kit.webgl.shrinkCount(propTrunkIM, pi);
      Kit.webgl.shrinkCount(propArmLIM, pi);
      Kit.webgl.shrinkCount(propArmRIM, pi);
      Kit.webgl.shrinkCount(propBloomIM, pi);
      Kit.webgl.shrinkCount(propRockIM, ri2);

      // Shadows pool reset.
      if (shadows) {
        shadows.reset();
        var shS = Math.max(0.55, 1.5 - dinoY * 0.16);
        shadows.add(dinoLx, 0, 0, shS, shS * 1.2, 0);
        if (showBoulder) shadows.add(boulderGroup.position.x, 0, boulderGroup.position.z, 2.9, 2.9, 0);
      }

      // Render visible obstacles (or lively attract-mode preview props on Title!).
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
      } else if (mode === 'menu') {
        // Joyful live attract-mode props streaming down the sunlit desert track!
        var demoKinds = ['boost', 'crate', 'low', 'pad', 'bones'];
        var dBase = Math.floor(refD / 16);
        for (var dk = 1; dk <= 5; dk++) {
          var dId = dBase + dk;
          var dRel = dId * 16 - refD;
          if (dRel < 5 || dRel > 78) continue;
          var kind = demoKinds[Math.abs(dId) % demoKinds.length];
          var dLane = ((dId % 3) - 1) * LANE_W;
          var dm = borrowOb(kind);
          dm.position.set(dLane, 0, -dRel);
          if (shadows && kind !== 'boost') shadows.add(dLane, 0, -dRel, 1.3, 1.3, 0);
        }
        nestGroup.visible = false;
        recordGate.visible = false;
      } else {
        nestGroup.visible = false;
        recordGate.visible = false;
      }

      // Instanced collectibles (eggs, gold eggs, rainbow eggs, hearts — plus attract-mode eggs on Title!).
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
      } else if (mode === 'menu') {
        var eBase = Math.floor(refD / 6);
        for (var ek = 1; ek <= 12 && ei < EGG_CAP; ek++) {
          var eId = eBase + ek;
          var eRel = eId * 6 - refD;
          if (eRel < 3 || eRel > 68) continue;
          var eLx = Math.sin(Math.floor(eId / 3) * 1.7) > 0.3 ? LANE_W : (Math.sin(Math.floor(eId / 3) * 1.7) < -0.3 ? -LANE_W : 0);
          V1.set(eLx, 0.9 + Math.sin(t * 5 + eId) * 0.15, -eRel);
          E1.set(0, t * 2.8 + eId, 0); Q1.setFromEuler(E1);
          S1.set(0.72, 1.0, 0.72);
          M4.compose(V1, Q1, S1);
          eggIM.setMatrixAt(ei, M4);
          if (eId % 4 === 0) C1.setHex(0xffd633);
          else C1.setHSL(((t * 0.5 + eId * 0.14) % 1), 0.88, 0.64);
          eggIM.setColorAt(ei, C1);
          if (shadows) shadows.add(eLx, 0, -eRel, 0.75, 0.75, 0);
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

      // Behind-the-back 3-lane camera (elevated cleanly clear of the chasing boulder; unobstructed dino on Title!).
      var wantX = dinoLx * 0.44;
      var wantY = mode === 'wardrobe' ? 2.1 : mode === 'finish' ? 2.8 : mode === 'menu' ? 5.1 : 6.0 + dinoY * 0.34;
      var wantZ = mode === 'wardrobe' ? 4.8 : mode === 'finish' ? 5.6 : mode === 'menu' ? 9.6 : 11.4;
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
      } else if (mode === 'menu') {
        camera.position.set(camX, camY, wantZ);
        camera.lookAt(camX * 0.45, 0.55, -14);
      } else {
        camera.position.set(camX + sxOff, camY + syOff, wantZ);
        camera.lookAt(camX * 0.52, 1.25 + dinoY * 0.2, -16);
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
