/* Skybound Golf (ضربة إلى الفضاء) — Three.js 3D side-following world renderer.
 * Streaming vertex-colored 3D fairway/sand/water terrain, altitude-reactive sky &
 * lighting (Meadow -> Clouds -> High Sky -> Stratosphere Aurora -> Outer Space),
 * chunky animated cartoon golfer, 5 3D ball skins, pooled InstancedMesh & props,
 * and software-WebGL fence pacing. */
(function () {
  'use strict';

  var M = Math;

  function createView(canvas) {
    var T = window.THREE;
    var P = window.GolfPhysics;
    if (!T) throw new Error('three.js unavailable');

    var wgl = Kit.webgl.createRenderer(canvas);
    var software = wgl.software, renderer = wgl.renderer;

    var scene = new T.Scene();
    var skyCur = new T.Color(0x4ec4ff);
    var fogCur = new T.Color(0x88dcff);
    scene.background = skyCur;
    scene.fog = new T.Fog(0x88dcff, 48, 170);

    var camera = new T.PerspectiveCamera(42, 16 / 9, 0.5, 290);
    var camPos = new T.Vector3(4, 7.2, 23);
    var camLook = new T.Vector3(6, 5.2, 0);
    camera.position.copy(camPos);
    camera.lookAt(camLook);

    // Warm cartoon hemisphere + directional sunlight
    var hemi = new T.HemisphereLight(0xfffbe6, 0x3ba86b, 1.38);
    var sunLight = new T.DirectionalLight(0xfff4d4, 1.95);
    sunLight.position.set(16, 28, 22);
    scene.add(hemi, sunLight);

    // Reusable scratch math objects (zero hot-loop allocations!)
    var C = new T.Color(), C2 = new T.Color();
    var M4 = new T.Matrix4(), Q = new T.Quaternion(), EU = new T.Euler();
    var V1 = new T.Vector3(), S1 = new T.Vector3(), PRJ = new T.Vector3();

    // Shared materials (minimal draw states!)
    var MAT_TERRAIN = new T.MeshLambertMaterial({ vertexColors: true });
    var MAT_LIT_VC = new T.MeshLambertMaterial({ vertexColors: true });
    var MAT_GLOW_VC = new T.MeshBasicMaterial({ vertexColors: true });
    var MAT_WHITE = new T.MeshLambertMaterial({ color: 0xffffff });
    var MAT_GOLD = new T.MeshLambertMaterial({ color: 0xffd026, emissive: 0x553800 });
    var MAT_GOLD_GLOW = new T.MeshBasicMaterial({ color: 0xffe14d });
    var MAT_RED = new T.MeshLambertMaterial({ color: 0xf03838 });
    var MAT_CYAN_GLOW = new T.MeshBasicMaterial({ color: 0x5ceeff });
    var MAT_METAL = new T.MeshLambertMaterial({ color: 0xd9e4f2 });
    var MAT_DARK = new T.MeshLambertMaterial({ color: 0x262b40 });
    var MAT_WOOD = new T.MeshLambertMaterial({ color: 0xb8763e });
    var MAT_GRASS_DARK = new T.MeshLambertMaterial({ color: 0x2f9e44 });
    var MAT_ORANGE = new T.MeshLambertMaterial({ color: 0xff6b2b });

    function setInst(mesh, idx, x, y, z, sx, sy, sz, rx, ry, rz) {
      EU.set(rx || 0, ry || 0, rz || 0);
      Q.setFromEuler(EU);
      V1.set(x, y, z);
      S1.set(sx, sy, sz);
      M4.compose(V1, Q, S1);
      mesh.setMatrixAt(idx, M4);
    }

    function addPart(parent, geo, mat, x, y, z, rx, ry, rz, sx, sy, sz) {
      var m = new T.Mesh(geo, mat);
      m.position.set(x || 0, y || 0, z || 0);
      if (rx || ry || rz) m.rotation.set(rx || 0, ry || 0, rz || 0);
      if (sx != null) m.scale.set(sx, sy != null ? sy : sx, sz != null ? sz : sx);
      parent.add(m);
      return m;
    }

    /* ------------------------------------------------ Altitude Sky Palette */
    var SKY_STOPS = [
      { y: 0,   sky: new T.Color(0x47bfff), fog: new T.Color(0x88dcff), hemiTop: new T.Color(0xfffbe6), hemiBot: new T.Color(0x3ca868), sunI: 1.95, fogFar: 175 },
      { y: 55,  sky: new T.Color(0x2e9dff), fog: new T.Color(0x7acbff), hemiTop: new T.Color(0xf0f8ff), hemiBot: new T.Color(0x4ba0e0), sunI: 1.90, fogFar: 195 },
      { y: 125, sky: new T.Color(0x1b58c8), fog: new T.Color(0x4780e6), hemiTop: new T.Color(0xdbeaff), hemiBot: new T.Color(0x284e9c), sunI: 1.80, fogFar: 220 },
      { y: 220, sky: new T.Color(0x181c5e), fog: new T.Color(0x2f2978), hemiTop: new T.Color(0x9eeeff), hemiBot: new T.Color(0x2c1b59), sunI: 1.65, fogFar: 245 },
      { y: 330, sky: new T.Color(0x07091f), fog: new T.Color(0x121036), hemiTop: new T.Color(0xbcd8ff), hemiBot: new T.Color(0x1b1544), sunI: 1.55, fogFar: 270 }
    ];

    function updateSky(camY) {
      var a = SKY_STOPS[0], b = SKY_STOPS[0], t = 0;
      for (var i = 0; i < SKY_STOPS.length - 1; i++) {
        if (camY >= SKY_STOPS[i].y && camY <= SKY_STOPS[i + 1].y) {
          a = SKY_STOPS[i]; b = SKY_STOPS[i + 1];
          t = (camY - a.y) / (b.y - a.y);
          break;
        }
      }
      if (camY > SKY_STOPS[SKY_STOPS.length - 1].y) {
        a = b = SKY_STOPS[SKY_STOPS.length - 1]; t = 0;
      }
      skyCur.copy(a.sky).lerp(b.sky, t);
      fogCur.copy(a.fog).lerp(b.fog, t);
      scene.fog.color.copy(fogCur);
      scene.fog.far = P.lerp(a.fogFar, b.fogFar, t);
      hemi.color.copy(a.hemiTop).lerp(b.hemiTop, t);
      hemi.groundColor.copy(a.hemiBot).lerp(b.hemiBot, t);
      sunLight.intensity = P.lerp(a.sunI, b.sunI, t);
    }

    /* ------------------------------------------------ Sun, Moon & Starfield */
    var sunGroup = new T.Group();
    addPart(sunGroup, new T.SphereGeometry(5.5, 16, 12), new T.MeshBasicMaterial({ color: 0xffe45e }), 0, 0, 0);
    addPart(sunGroup, new T.RingGeometry(6.2, 8.8, 24), new T.MeshBasicMaterial({ color: 0xfff3a8, transparent: true, opacity: 0.35, side: T.DoubleSide }), 0, 0, -0.2);
    scene.add(sunGroup);

    var moonBackdrop = new T.Group();
    addPart(moonBackdrop, new T.SphereGeometry(7.2, 16, 12), new T.MeshLambertMaterial({ color: 0xeaf0ff, emissive: 0x283254 }), 0, 0, 0);
    addPart(moonBackdrop, new T.SphereGeometry(1.6, 10, 8), new T.MeshLambertMaterial({ color: 0xc2cde6 }), -2.6, 1.8, 5.8, 0, 0, 0, 1, 1, 0.5);
    addPart(moonBackdrop, new T.SphereGeometry(2.1, 10, 8), new T.MeshLambertMaterial({ color: 0xc2cde6 }), 2.2, -1.6, 5.9, 0, 0, 0, 1, 1, 0.45);
    addPart(moonBackdrop, new T.SphereGeometry(1.1, 8, 8), new T.MeshLambertMaterial({ color: 0xc2cde6 }), 0.6, 3.0, 5.9, 0, 0, 0, 1, 1, 0.45);
    scene.add(moonBackdrop);

    // 110 twinkling space stars following camera X
    var MAX_STARS = 110;
    var starGeo = new T.OctahedronGeometry(0.45, 0);
    var starMat = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
    var starInst = new T.InstancedMesh(starGeo, starMat, MAX_STARS);
    starInst.frustumCulled = false;
    var starSeeds = [];
    for (var si = 0; si < MAX_STARS; si++) {
      starSeeds.push({
        ox: (P.hash(si, 501) - 0.5) * 160,
        oy: (P.hash(si, 502) - 0.42) * 95,
        oz: -45 - P.hash(si, 503) * 45,
        s: 0.45 + P.hash(si, 504) * 1.15,
        ph: P.hash(si, 505) * 6.28,
        col: [0xffffff, 0xfff0a8, 0x99e6ff, 0xffb3f0][si % 4]
      });
      starInst.setColorAt(si, C.setHex(starSeeds[si].col));
    }
    if (starInst.instanceColor) starInst.instanceColor.needsUpdate = true;
    scene.add(starInst);

    /* ----------------------------------------- Stratosphere Aurora Ribbons */
    var auroraGroup = new T.Group();
    var auroraMats = [
      new T.MeshBasicMaterial({ color: 0x38ffaa, transparent: true, opacity: 0.24, side: T.DoubleSide }),
      new T.MeshBasicMaterial({ color: 0x52c7ff, transparent: true, opacity: 0.20, side: T.DoubleSide }),
      new T.MeshBasicMaterial({ color: 0xd966ff, transparent: true, opacity: 0.20, side: T.DoubleSide })
    ];
    var auroraRibbons = [];
    for (var ar = 0; ar < 3; ar++) {
      var aGeo = new T.PlaneGeometry(160, 14, 28, 1);
      var ap = aGeo.attributes.position;
      for (var vi = 0; vi < ap.count; vi++) {
        var vx = ap.getX(vi), vy = ap.getY(vi);
        ap.setY(vi, vy + M.sin(vx * 0.055 + ar * 1.9) * 5.2 + M.cos(vx * 0.11 - ar) * 2.1);
        ap.setZ(vi, M.sin(vx * 0.04 + ar) * 6.0);
      }
      aGeo.computeVertexNormals();
      var aMesh = new T.Mesh(aGeo, auroraMats[ar]);
      aMesh.position.set(0, 224 + ar * 20, -40 - ar * 10);
      auroraGroup.add(aMesh);
      auroraRibbons.push(aMesh);
    }
    scene.add(auroraGroup);

    /* ----------------------------------------- Streaming 3D Terrain Ribbon */
    // 92 slices * 1.75 m = 161 m span, 5 cross-section bands = 4 quads/slice = 8 tris/slice
    var SLICES = 92;
    var STEP_X = 1.75;
    var Z_PROF = [-18, -7.2, -3.2, 3.2, 7.6];
    var BANDS = Z_PROF.length - 1;
    var VERTS_PER_SLICE = BANDS * 6;
    var TOTAL_VERTS = (SLICES - 1) * VERTS_PER_SLICE;
    var tPos = new Float32Array(TOTAL_VERTS * 3);
    var tNor = new Float32Array(TOTAL_VERTS * 3);
    var tCol = new Float32Array(TOTAL_VERTS * 3);
    var tGeo = new T.BufferGeometry();
    var tPosAttr = new T.BufferAttribute(tPos, 3);
    var tNorAttr = new T.BufferAttribute(tNor, 3);
    var tColAttr = new T.BufferAttribute(tCol, 3);
    tGeo.setAttribute('position', tPosAttr);
    tGeo.setAttribute('normal', tNorAttr);
    tGeo.setAttribute('color', tColAttr);
    var terrainMesh = new T.Mesh(tGeo, MAT_TERRAIN);
    terrainMesh.frustumCulled = false;
    scene.add(terrainMesh);

    var lastTerrainSnap = -99999;
    var sliceHeights = new Float32Array(SLICES);
    var sliceSurfs = new Uint8Array(SLICES); // 0=turf, 1=sand, 2=water

    function rebuildTerrain(course, snapX) {
      if (snapX === lastTerrainSnap) return;
      lastTerrainSnap = snapX;
      var i, b, o = 0;
      for (i = 0; i < SLICES; i++) {
        var x = snapX + i * STEP_X;
        sliceHeights[i] = P.heightAt(course, x);
        var sf = P.surfaceAt(course, x);
        sliceSurfs[i] = sf === 'water' ? 2 : sf === 'sand' ? 1 : 0;
      }

      var yOff = [3.6, 0.9, 0.0, 0.0, -5.2];
      for (i = 0; i < SLICES - 1; i++) {
        var x0 = snapX + i * STEP_X;
        var x1 = x0 + STEP_X;
        var h0 = sliceHeights[i];
        var h1 = sliceHeights[i + 1];
        var sf0 = sliceSurfs[i];
        var stripe = (M.floor(x0 / 7) & 1) === 0;

        for (b = 0; b < BANDS; b++) {
          var zA = Z_PROF[b], zB = Z_PROF[b + 1];
          var yoA0 = b === 0 ? yOff[0] + M.sin(x0 * 0.05) * 1.4 : yOff[b];
          var yoA1 = b === 0 ? yOff[0] + M.sin(x1 * 0.05) * 1.4 : yOff[b];
          var yoB0 = b + 1 === 4 ? yOff[4] : yOff[b + 1];
          var yoB1 = b + 1 === 4 ? yOff[4] : yOff[b + 1];

          var ay0 = h0 + yoA0, ay1 = h1 + yoA1;
          var by0 = h0 + yoB0, by1 = h1 + yoB1;

          // Pick crisp stylized cartoon color for each diorama band
          var hex;
          if (b === 3) {
            // Foreground diorama earth cliff skirt (warm sunlit terracotta!)
            hex = sf0 === 2 ? 0x1ca4c8 : (stripe ? 0xc2834b : 0xb3743e);
          } else if (b === 2) {
            // Main playable sunlit fairway strip!
            if (sf0 === 2) hex = stripe ? 0x26d8ff : 0x3ce4ff;
            else if (sf0 === 1) hex = stripe ? 0xffe082 : 0xf7d168;
            else hex = stripe ? 0x5be856 : 0x49d44a;
          } else if (b === 1) {
            // Lush sunlit apron behind fairway
            hex = sf0 === 2 ? 0x45d68a : (stripe ? 0x46cc4f : 0x3cbd48);
          } else {
            // Far sunlit hillside bank
            hex = stripe ? 0x3cb857 : 0x33a84d;
          }
          C.setHex(hex);

          // Compute upward-pointing outward normal matching CCW winding (v x u)
          var ux = x1 - x0, uy = ay1 - ay0, uz = 0;
          var vx = 0, vy = by0 - ay0, vz = zB - zA;
          var nx = vy * uz - vz * uy;
          var ny = vz * ux - vx * uz;
          var nz = vx * uy - vy * ux;
          var nl = M.hypot(nx, ny, nz) || 1;
          nx /= nl; ny /= nl; nz /= nl;

          // Tri 1: (x0,ay0,zA) -> (x0,by0,zB) -> (x1,by1,zB)
          tPos[o] = x0; tPos[o + 1] = ay0; tPos[o + 2] = zA;
          tNor[o] = nx; tNor[o + 1] = ny; tNor[o + 2] = nz;
          tCol[o] = C.r; tCol[o + 1] = C.g; tCol[o + 2] = C.b; o += 3;

          tPos[o] = x0; tPos[o + 1] = by0; tPos[o + 2] = zB;
          tNor[o] = nx; tNor[o + 1] = ny; tNor[o + 2] = nz;
          tCol[o] = C.r; tCol[o + 1] = C.g; tCol[o + 2] = C.b; o += 3;

          tPos[o] = x1; tPos[o + 1] = by1; tPos[o + 2] = zB;
          tNor[o] = nx; tNor[o + 1] = ny; tNor[o + 2] = nz;
          tCol[o] = C.r; tCol[o + 1] = C.g; tCol[o + 2] = C.b; o += 3;

          // Tri 2: (x0,ay0,zA) -> (x1,by1,zB) -> (x1,ay1,zA)
          tPos[o] = x0; tPos[o + 1] = ay0; tPos[o + 2] = zA;
          tNor[o] = nx; tNor[o + 1] = ny; tNor[o + 2] = nz;
          tCol[o] = C.r; tCol[o + 1] = C.g; tCol[o + 2] = C.b; o += 3;

          tPos[o] = x1; tPos[o + 1] = by1; tPos[o + 2] = zB;
          tNor[o] = nx; tNor[o + 1] = ny; tNor[o + 2] = nz;
          tCol[o] = C.r; tCol[o + 1] = C.g; tCol[o + 2] = C.b; o += 3;

          tPos[o] = x1; tPos[o + 1] = ay1; tPos[o + 2] = zA;
          tNor[o] = nx; tNor[o + 1] = ny; tNor[o + 2] = nz;
          tCol[o] = C.r; tCol[o + 1] = C.g; tCol[o + 2] = C.b; o += 3;
        }
      }
      tPosAttr.needsUpdate = true;
      tNorAttr.needsUpdate = true;
      tColAttr.needsUpdate = true;
      tGeo.computeBoundingSphere();
    }

    /* ----------------------------------------- Background Rolling 3D Hills */
    var MAX_HILLS = 24;
    var hillGeo = new T.SphereGeometry(1, 14, 9, 0, M.PI * 2, 0, M.PI * 0.56);
    var hillInst = new T.InstancedMesh(hillGeo, new T.MeshLambertMaterial({ color: 0xffffff }), MAX_HILLS);
    hillInst.frustumCulled = false;
    scene.add(hillInst);

    /* ----------------------------------------- Starting Tee & Chunky Golfer */
    var teeGroup = new T.Group();
    // Wooden tee box + emerald mat + white markers + tee peg
    addPart(teeGroup, new T.BoxGeometry(7.2, 0.65, 5.2), MAT_WOOD, -0.8, 1.98, 0);
    addPart(teeGroup, new T.BoxGeometry(6.6, 0.22, 4.6), MAT_GRASS_DARK, -0.8, 2.34, 0);
    addPart(teeGroup, new T.SphereGeometry(0.24, 10, 8), MAT_WHITE, -1.8, 2.52, 1.5);
    addPart(teeGroup, new T.SphereGeometry(0.24, 10, 8), MAT_WHITE, -1.8, 2.52, -1.5);
    addPart(teeGroup, new T.CylinderGeometry(0.08, 0.05, 0.52, 8), MAT_GOLD_GLOW, 0, 2.48, 0);
    // Starting corner flagpole
    addPart(teeGroup, new T.CylinderGeometry(0.07, 0.07, 4.4, 8), MAT_WHITE, -3.5, 4.3, -1.9);
    var teePennant = addPart(teeGroup, new T.ConeGeometry(0.68, 1.7, 4), MAT_RED, -2.7, 6.0, -1.9, 0, 0, -M.PI / 2);
    scene.add(teeGroup);

    // Chunky cartoon golfer with big expressive eyes, visor & shiny club!
    var golfer = new T.Group();
    golfer.position.set(-1.75, 2.42, -0.35);
    golfer.rotation.y = 0.36;
    var golferBody = new T.Group();
    golfer.add(golferBody);

    // Shoes & legs
    addPart(golferBody, new T.BoxGeometry(0.48, 0.30, 0.62), MAT_WHITE, -0.30, 0.15, 0.22);
    addPart(golferBody, new T.BoxGeometry(0.48, 0.30, 0.62), MAT_WHITE, 0.30, 0.15, -0.18);
    var matShorts = new T.MeshLambertMaterial({ color: 0x264b96 });
    addPart(golferBody, new T.BoxGeometry(0.36, 0.56, 0.36), matShorts, -0.28, 0.54, 0.18);
    addPart(golferBody, new T.BoxGeometry(0.36, 0.56, 0.36), matShorts, 0.28, 0.54, -0.15);

    // Chunky torso (bright sunny coral polo shirt with collar!)
    var torsoPivot = new T.Group();
    torsoPivot.position.set(0, 0.85, 0);
    golferBody.add(torsoPivot);
    addPart(torsoPivot, new T.BoxGeometry(1.06, 1.05, 0.78), MAT_ORANGE, 0, 0.52, 0);
    addPart(torsoPivot, new T.BoxGeometry(1.10, 0.22, 0.82), MAT_WHITE, 0, 0.96, 0);

    // Cute chunky head + big eyes + cyan golf cap!
    var headGroup = new T.Group();
    headGroup.position.set(0.08, 1.48, 0);
    torsoPivot.add(headGroup);
    var matSkin = new T.MeshLambertMaterial({ color: 0xffcfa0 });
    var matCap = new T.MeshLambertMaterial({ color: 0x1eb8ff });
    addPart(headGroup, new T.SphereGeometry(0.64, 14, 12), matSkin, 0, 0, 0);
    // Big cartoon eyes angled nicely toward camera & ball
    addPart(headGroup, new T.SphereGeometry(0.17, 10, 8), MAT_WHITE, 0.42, 0.08, 0.32);
    addPart(headGroup, new T.SphereGeometry(0.17, 10, 8), MAT_WHITE, 0.46, 0.08, -0.06);
    addPart(headGroup, new T.SphereGeometry(0.10, 8, 8), MAT_DARK, 0.52, 0.08, 0.36);
    addPart(headGroup, new T.SphereGeometry(0.10, 8, 8), MAT_DARK, 0.56, 0.08, -0.02);
    // Cute rosy cheeks
    var matCheek = new T.MeshBasicMaterial({ color: 0xff7b94 });
    addPart(headGroup, new T.SphereGeometry(0.09, 8, 8), matCheek, 0.38, -0.12, 0.44);
    addPart(headGroup, new T.SphereGeometry(0.09, 8, 8), matCheek, 0.48, -0.12, -0.20);
    // Sporty visor cap!
    addPart(headGroup, new T.SphereGeometry(0.68, 14, 10, 0, M.PI * 2, 0, M.PI * 0.52), matCap, -0.02, 0.14, 0);
    addPart(headGroup, new T.BoxGeometry(0.68, 0.10, 0.80), MAT_WHITE, 0.44, 0.26, 0.04, 0, 0, -0.12);
    addPart(headGroup, new T.SphereGeometry(0.13, 8, 8), MAT_GOLD_GLOW, -0.02, 0.82, 0);

    // Swing arms + shiny metallic golf club!
    var clubPivot = new T.Group();
    clubPivot.position.set(0.32, 0.88, 0.50);
    torsoPivot.add(clubPivot);
    addPart(clubPivot, new T.BoxGeometry(0.32, 0.78, 0.32), matSkin, 0, -0.35, 0);
    addPart(clubPivot, new T.BoxGeometry(0.32, 0.78, 0.32), matSkin, 0, -0.35, -0.45);
    // Shiny chrome shaft + golden driver head
    addPart(clubPivot, new T.CylinderGeometry(0.06, 0.05, 2.35, 8), MAT_METAL, 0.14, -1.25, -0.12, 0, 0, 0.28);
    addPart(clubPivot, new T.BoxGeometry(0.64, 0.38, 0.48), MAT_GOLD, 0.52, -2.28, -0.12, 0, 0, 0.28);
    addPart(clubPivot, new T.BoxGeometry(0.12, 0.34, 0.50), MAT_CYAN_GLOW, 0.82, -2.20, -0.12, 0, 0, 0.28);
    scene.add(golfer);

    /* ----------------------------------------- 3D In-World Aim & Power Meters */
    // 1) Aim Angle Arc (at ball tee)
    var aimGroup = new T.Group();
    aimGroup.position.set(0, 2.95, 0.4);
    var AIM_SEGS = 11;
    var aimSegGeo = new T.BoxGeometry(0.55, 0.26, 0.22);
    for (var as = 0; as < AIM_SEGS; as++) {
      var uA = as / (AIM_SEGS - 1);
      var degA = P.lerp(20, 70, uA);
      var radA = degA * M.PI / 180;
      var sweetA = P.isPerfectAngle(degA);
      var segMat = new T.MeshBasicMaterial({ color: sweetA ? 0xffdf2b : (uA > 0.25 && uA < 0.75 ? 0x6dff68 : 0x56d8ff) });
      addPart(aimGroup, aimSegGeo, segMat, M.cos(radA) * 4.2, M.sin(radA) * 4.2, 0, 0, 0, radA + M.PI / 2);
    }
    var aimArrow = new T.Group();
    addPart(aimArrow, new T.BoxGeometry(3.8, 0.20, 0.20), new T.MeshBasicMaterial({ color: 0xffffff }), 2.2, 0, 0.16);
    addPart(aimArrow, new T.ConeGeometry(0.46, 1.05, 8), MAT_GOLD_GLOW, 4.4, 0, 0.16, 0, 0, -M.PI / 2);
    // 4 pulsing ballistic dots extending from arrow tip
    var aimDots = [];
    for (var ad = 0; ad < 4; ad++) {
      aimDots.push(addPart(aimArrow, new T.SphereGeometry(0.20 - ad * 0.025, 8, 6), new T.MeshBasicMaterial({ color: 0xfff8c8 }), 5.4 + ad * 1.15, 0, 0.16));
    }
    aimGroup.add(aimArrow);
    scene.add(aimGroup);

    // 2) Power Swing Gauge Arc (chunky vertical-curved gauge behind golfer)
    var powerGroup = new T.Group();
    powerGroup.position.set(-1.6, 3.6, 0.8);
    var PWR_SEGS = 14;
    var pwrSegs = [];
    var pwrSegMats = [];
    var pwrSegGeo = new T.BoxGeometry(0.68, 0.34, 0.26);
    for (var ps = 0; ps < PWR_SEGS; ps++) {
      var pm = new T.MeshBasicMaterial({ color: 0x4ae868 });
      pwrSegMats.push(pm);
      var uP = ps / (PWR_SEGS - 1);
      var angP = P.lerp(2.55, 0.92, uP);
      var meshP = addPart(powerGroup, pwrSegGeo, pm, M.cos(angP) * 4.5, M.sin(angP) * 4.5, 0, 0, 0, angP);
      pwrSegs.push(meshP);
    }
    var pwrNeedle = new T.Group();
    addPart(pwrNeedle, new T.ConeGeometry(0.48, 1.15, 8), new T.MeshBasicMaterial({ color: 0xffffff }), 3.45, 0, 0.26, 0, 0, -M.PI / 2);
    addPart(pwrNeedle, new T.SphereGeometry(0.32, 10, 8), MAT_RED, 4.5, 0, 0.26);
    powerGroup.add(pwrNeedle);
    scene.add(powerGroup);

    /* ----------------------------------------- 5 Unlockable 3D Golf Balls */
    var ballRoot = new T.Group();
    var ballSpin = new T.Group();
    ballRoot.add(ballSpin);

    var skinMeshes = {};
    // 1. Classic white dimpled golf ball
    var skClassic = new T.Group();
    addPart(skClassic, new T.IcosahedronGeometry(0.65, 2), MAT_WHITE, 0, 0, 0);
    addPart(skClassic, new T.TorusGeometry(0.64, 0.05, 6, 16), MAT_GOLD_GLOW, 0, 0, 0);
    skinMeshes.classic = skClassic;
    ballSpin.add(skClassic);

    // 2. Fireball
    var skFire = new T.Group();
    addPart(skFire, new T.IcosahedronGeometry(0.66, 2), new T.MeshLambertMaterial({ color: 0xff4514, emissive: 0x881a00 }), 0, 0, 0);
    addPart(skFire, new T.TorusGeometry(0.76, 0.09, 6, 16), new T.MeshBasicMaterial({ color: 0xffcc22 }), 0, 0, 0, 0.6, 0.4, 0);
    skinMeshes.fireball = skFire;
    ballSpin.add(skFire);

    // 3. Disco Ball (multi-color vertex-colored faceted sphere!)
    var discoRaw = new T.IcosahedronGeometry(0.67, 1);
    var discoGeo = discoRaw.index ? discoRaw.toNonIndexed() : discoRaw;
    var dCount = discoGeo.attributes.position.count;
    var dCols = new Float32Array(dCount * 3);
    var dPal = [0x3ef2ff, 0xff52d9, 0xffe44d, 0x66ff88, 0xa875ff, 0xffffff];
    for (var di = 0; di < dCount; di += 3) {
      C.setHex(dPal[(di / 3) % dPal.length]);
      for (var dj = 0; dj < 3; dj++) {
        dCols[(di + dj) * 3] = C.r; dCols[(di + dj) * 3 + 1] = C.g; dCols[(di + dj) * 3 + 2] = C.b;
      }
    }
    discoGeo.setAttribute('color', new T.BufferAttribute(dCols, 3));
    var skDisco = new T.Mesh(discoGeo, MAT_GLOW_VC);
    skinMeshes.disco = skDisco;
    ballSpin.add(skDisco);

    // 4. Mini Planet with tilted golden ring
    var skPlanet = new T.Group();
    addPart(skPlanet, new T.IcosahedronGeometry(0.62, 2), new T.MeshLambertMaterial({ color: 0x249eff }), 0, 0, 0);
    addPart(skPlanet, new T.SphereGeometry(0.32, 8, 6), new T.MeshLambertMaterial({ color: 0x4ce875 }), 0.35, 0.22, 0.25);
    addPart(skPlanet, new T.SphereGeometry(0.28, 8, 6), new T.MeshLambertMaterial({ color: 0x4ce875 }), -0.34, -0.18, 0.30);
    addPart(skPlanet, new T.TorusGeometry(0.96, 0.11, 6, 20), MAT_GOLD_GLOW, 0, 0, 0, 1.15, 0.25, 0);
    skinMeshes.planet = skPlanet;
    ballSpin.add(skPlanet);

    // 5. Golden Star Champion Ball
    var skStar = new T.Group();
    addPart(skStar, new T.OctahedronGeometry(0.76, 0), new T.MeshLambertMaterial({ color: 0xffd524, emissive: 0x805500 }), 0, 0, 0);
    addPart(skStar, new T.OctahedronGeometry(0.76, 0), MAT_GOLD_GLOW, 0, 0, 0, 0.78, 0.78, 0.78);
    skinMeshes.star = skStar;
    ballSpin.add(skStar);

    // Rocket Flame Nozzle (attached to ballRoot, oriented opposite velocity!)
    var flameGroup = new T.Group();
    var flameOuter = addPart(flameGroup, new T.ConeGeometry(0.55, 2.5, 8), new T.MeshBasicMaterial({ color: 0xff5a1f }), -1.5, 0, 0, 0, 0, M.PI / 2);
    var flameInner = addPart(flameGroup, new T.ConeGeometry(0.32, 1.7, 8), new T.MeshBasicMaterial({ color: 0xfff07a }), -1.15, 0, 0, 0, 0, M.PI / 2);
    flameGroup.visible = false;
    ballRoot.add(flameGroup);

    // Dive-slam aura halo
    var diveRing = addPart(ballRoot, new T.TorusGeometry(1.05, 0.10, 6, 16), MAT_CYAN_GLOW, 0, 0, 0);
    diveRing.visible = false;
    scene.add(ballRoot);

    /* ----------------------------------------- Interactive Target Pools */
    function makeTrampoline() {
      var g = new T.Group();
      addPart(g, new T.CylinderGeometry(2.1, 2.25, 0.42, 14), MAT_RED, 0, 0, 0);
      addPart(g, new T.CylinderGeometry(1.65, 1.65, 0.48, 14), MAT_GOLD_GLOW, 0, 0.04, 0);
      addPart(g, new T.CylinderGeometry(0.14, 0.14, 0.9, 6), MAT_DARK, -1.4, -0.5, 0.8);
      addPart(g, new T.CylinderGeometry(0.14, 0.14, 0.9, 6), MAT_DARK, 1.4, -0.5, 0.8);
      addPart(g, new T.CylinderGeometry(0.14, 0.14, 0.9, 6), MAT_DARK, -1.4, -0.5, -0.8);
      addPart(g, new T.CylinderGeometry(0.14, 0.14, 0.9, 6), MAT_DARK, 1.4, -0.5, -0.8);
      g.visible = false;
      scene.add(g);
      return g;
    }

    function makeTNT() {
      var g = new T.Group();
      addPart(g, new T.BoxGeometry(2.1, 2.1, 2.1), MAT_RED, 0, 0, 0);
      addPart(g, new T.BoxGeometry(2.22, 0.62, 2.22), MAT_GOLD_GLOW, 0, 0, 0);
      addPart(g, new T.BoxGeometry(2.26, 0.24, 2.26), MAT_WHITE, 0, 0, 0);
      addPart(g, new T.CylinderGeometry(0.12, 0.12, 0.55, 6), MAT_DARK, 0, 1.28, 0);
      addPart(g, new T.SphereGeometry(0.28, 8, 6), new T.MeshBasicMaterial({ color: 0xffaa1a }), 0, 1.62, 0);
      g.visible = false;
      scene.add(g);
      return g;
    }

    var BAL_MATS = [0xff4f6d, 0x2ec4ff, 0x9b5cff, 0x45de6b, 0xff9f1c].map(function (c) {
      return new T.MeshLambertMaterial({ color: c });
    });
    function makeBalloon(ci) {
      var g = new T.Group();
      var env = addPart(g, new T.SphereGeometry(2.9, 14, 12), BAL_MATS[ci % BAL_MATS.length], 0, 0.6, 0, 0, 0, 0, 1, 1.15, 1);
      addPart(g, new T.TorusGeometry(2.82, 0.22, 6, 18), MAT_GOLD_GLOW, 0, 0.55, 0, M.PI / 2, 0, 0);
      addPart(g, new T.BoxGeometry(1.35, 1.0, 1.35), MAT_WOOD, 0, -3.5, 0);
      addPart(g, new T.CylinderGeometry(0.06, 0.06, 1.5, 5), MAT_WHITE, -0.5, -2.5, 0.5);
      addPart(g, new T.CylinderGeometry(0.06, 0.06, 1.5, 5), MAT_WHITE, 0.5, -2.5, -0.5);
      g.userData.env = env;
      g.visible = false;
      scene.add(g);
      return g;
    }

    function makeRing() {
      var g = new T.Group();
      addPart(g, new T.TorusGeometry(3.3, 0.42, 8, 22), MAT_GOLD, 0, 0, 0, 0, M.PI / 2, 0);
      addPart(g, new T.TorusGeometry(2.6, 0.14, 6, 18), MAT_CYAN_GLOW, 0, 0, 0, 0, M.PI / 2, 0);
      g.visible = false;
      scene.add(g);
      return g;
    }

    function makeUFO() {
      var g = new T.Group();
      addPart(g, new T.CylinderGeometry(1.9, 3.8, 0.95, 14), MAT_METAL, 0, 0, 0);
      addPart(g, new T.CylinderGeometry(3.8, 1.7, 0.65, 14), new T.MeshLambertMaterial({ color: 0x6f4aff }), 0, -0.75, 0);
      addPart(g, new T.SphereGeometry(1.95, 12, 10, 0, M.PI * 2, 0, M.PI * 0.55), new T.MeshLambertMaterial({ color: 0x5ceeff, emissive: 0x165e7a }), 0, 0.35, 0);
      // Glowing rim lights
      for (var k = 0; k < 6; k++) {
        var a = k * M.PI / 3;
        addPart(g, new T.SphereGeometry(0.32, 6, 6), k % 2 ? MAT_GOLD_GLOW : new T.MeshBasicMaterial({ color: 0xff52d9 }), M.cos(a) * 3.4, -0.35, M.sin(a) * 3.4);
      }
      g.visible = false;
      scene.add(g);
      return g;
    }

    var poolTramp = [], poolTNT = [], poolBal = [], poolRing = [], poolUFO = [];
    for (var pi = 0; pi < 8; pi++) {
      poolTramp.push(makeTrampoline());
      poolTNT.push(makeTNT());
      poolBal.push(makeBalloon(pi));
      poolRing.push(makeRing());
    }
    for (pi = 0; pi < 6; pi++) poolUFO.push(makeUFO());

    /* ----------------------------------------- Coins, Stars & Scenery Pools */
    var MAX_COINS = 84;
    var MAT_COIN_LIT = new T.MeshLambertMaterial({ color: 0xffd524, emissive: 0x6b4500 });
    var coinInst = new T.InstancedMesh(new T.CylinderGeometry(0.68, 0.68, 0.24, 12), MAT_COIN_LIT, MAX_COINS);
    coinInst.frustumCulled = false;
    scene.add(coinInst);

    var MAX_BIGSTARS = 44;
    var bigStarInst = new T.InstancedMesh(new T.OctahedronGeometry(1.08, 0), new T.MeshLambertMaterial({ color: 0xfff05c, emissive: 0x805e00 }), MAX_BIGSTARS);
    bigStarInst.frustumCulled = false;
    scene.add(bigStarInst);

    // Trees (Instanced trunks + lush 2-tier pine & round crowns)
    var MAX_TREES = 30;
    var trunkInst = new T.InstancedMesh(new T.CylinderGeometry(0.34, 0.48, 2.2, 7), MAT_WOOD, MAX_TREES);
    var pineInst = new T.InstancedMesh(new T.ConeGeometry(2.0, 3.6, 8), new T.MeshLambertMaterial({ color: 0x2fb84d }), MAX_TREES);
    var pineTopInst = new T.InstancedMesh(new T.ConeGeometry(1.35, 2.7, 8), new T.MeshLambertMaterial({ color: 0x45d65a }), MAX_TREES);
    var roundCrownInst = new T.InstancedMesh(new T.IcosahedronGeometry(1.85, 1), new T.MeshLambertMaterial({ color: 0x52e05b }), MAX_TREES);
    trunkInst.frustumCulled = pineInst.frustumCulled = pineTopInst.frustumCulled = roundCrownInst.frustumCulled = false;
    scene.add(trunkInst, pineInst, pineTopInst, roundCrownInst);

    // Fluffy 3D Clouds (3 puffs per cloud = 90 spheres in 1 draw call!)
    var MAX_CLOUDS = 96;
    var cloudInst = new T.InstancedMesh(new T.IcosahedronGeometry(1, 1), new T.MeshLambertMaterial({ color: 0xf7fbff, emissive: 0x222c3c }), MAX_CLOUDS);
    cloudInst.frustumCulled = false;
    scene.add(cloudInst);

    // Course Flags pool
    var poolFlags = [];
    for (pi = 0; pi < 6; pi++) {
      var fg = new T.Group();
      addPart(fg, new T.CylinderGeometry(0.07, 0.07, 4.2, 6), MAT_WHITE, 0, 2.1, 0);
      addPart(fg, new T.ConeGeometry(0.62, 1.5, 4), MAT_RED, 0.72, 3.8, 0, 0, 0, -M.PI / 2);
      fg.visible = false;
      scene.add(fg);
      poolFlags.push(fg);
    }

    // High-Sky Flyers (Biplanes, Blimps, Birds) + Space Satellites & Ringed Planets
    function makeBiplane() {
      var g = new T.Group();
      addPart(g, new T.BoxGeometry(4.4, 1.1, 1.2), MAT_RED, 0, 0, 0);
      addPart(g, new T.BoxGeometry(1.5, 0.22, 6.2), MAT_GOLD_GLOW, 0.3, 0.9, 0);
      addPart(g, new T.BoxGeometry(1.5, 0.22, 6.0), MAT_GOLD_GLOW, 0.3, -0.5, 0);
      addPart(g, new T.BoxGeometry(0.8, 1.3, 0.22), MAT_WHITE, -2.0, 0.65, 0);
      var prop = addPart(g, new T.BoxGeometry(0.15, 2.1, 0.32), MAT_WHITE, 2.35, 0, 0);
      g.userData.prop = prop;
      g.visible = false;
      scene.add(g);
      return g;
    }

    function makeBlimp() {
      var g = new T.Group();
      addPart(g, new T.SphereGeometry(2.8, 14, 10), new T.MeshLambertMaterial({ color: 0x3ebeff }), 0, 0, 0, 0, 0, 0, 2.1, 1, 1);
      addPart(g, new T.TorusGeometry(2.75, 0.24, 6, 16), MAT_GOLD_GLOW, 0, 0, 0, 0, M.PI / 2, 0);
      addPart(g, new T.BoxGeometry(2.2, 1.0, 1.0), MAT_RED, 0, -3.1, 0);
      addPart(g, new T.BoxGeometry(1.6, 2.4, 0.2), MAT_RED, -5.2, 0.6, 0);
      g.visible = false;
      scene.add(g);
      return g;
    }

    function makeSatellite() {
      var g = new T.Group();
      addPart(g, new T.CylinderGeometry(1.1, 1.1, 2.6, 10), MAT_METAL, 0, 0, 0, 0, 0, M.PI / 2);
      addPart(g, new T.BoxGeometry(0.2, 1.8, 6.4), new T.MeshLambertMaterial({ color: 0x246bff, emissive: 0x0b2a78 }), 0, 0, 0);
      addPart(g, new T.SphereGeometry(0.55, 8, 8), MAT_GOLD_GLOW, 1.6, 0, 0);
      g.visible = false;
      scene.add(g);
      return g;
    }

    var PLANET_COLS = [0xff7752, 0x9c6bff, 0x32d4c8, 0xffb84d];
    function makePlanet(ci) {
      var g = new T.Group();
      addPart(g, new T.IcosahedronGeometry(5.8, 2), new T.MeshLambertMaterial({ color: PLANET_COLS[ci % PLANET_COLS.length], emissive: 0x180f28 }), 0, 0, 0);
      addPart(g, new T.TorusGeometry(9.2, 0.95, 6, 26), new T.MeshBasicMaterial({ color: 0xffe49e, transparent: true, opacity: 0.72 }), 0, 0, 0, 1.25, 0.3, 0);
      g.visible = false;
      scene.add(g);
      return g;
    }

    var poolBiplanes = [makeBiplane(), makeBiplane(), makeBiplane()];
    var poolBlimps = [makeBlimp(), makeBlimp(), makeBlimp()];
    var poolSats = [makeSatellite(), makeSatellite(), makeSatellite()];
    var poolPlanets = [makePlanet(0), makePlanet(1), makePlanet(2), makePlanet(3)];

    var MAX_ASTEROIDS = 20;
    var asteroidInst = new T.InstancedMesh(new T.DodecahedronGeometry(1.25, 0), new T.MeshLambertMaterial({ color: 0x8e869c }), MAX_ASTEROIDS);
    asteroidInst.frustumCulled = false;
    scene.add(asteroidInst);

    /* ----------------------------------------- Milestone Landmarks */
    // Exact monumental landmarks at 250 m (Cloud Gate), 600 m (Airplane Club), 1200 m (Moon), 2400 m (Mars)!
    var milestoneNodes = [];
    function buildMilestones(course) {
      for (var i = 0; i < P.MILESTONES.length; i++) {
        var ms = P.MILESTONES[i];
        var g = new T.Group();
        var gy = P.heightAt(course, ms.dist);
        g.position.set(ms.dist, gy, -5.5);
        if (ms.id === 'cloud_gate') {
          addPart(g, new T.CylinderGeometry(0.9, 1.2, 16, 10), MAT_WHITE, -3.5, 8, 0);
          addPart(g, new T.CylinderGeometry(0.9, 1.2, 16, 10), MAT_WHITE, 3.5, 8, 0);
          addPart(g, new T.TorusGeometry(4.2, 0.85, 8, 20, M.PI), MAT_GOLD_GLOW, 0, 15.5, 0);
        } else if (ms.id === 'air_club') {
          addPart(g, new T.CylinderGeometry(0.85, 1.1, 20, 10), MAT_RED, -4.0, 10, 0);
          addPart(g, new T.CylinderGeometry(0.85, 1.1, 20, 10), MAT_RED, 4.0, 10, 0);
          addPart(g, new T.BoxGeometry(9.6, 2.2, 0.9), MAT_GOLD_GLOW, 0, 19.5, 0);
        } else if (ms.id === 'moon') {
          addPart(g, new T.SphereGeometry(10.5, 16, 14), new T.MeshLambertMaterial({ color: 0xe6ecff, emissive: 0x2e395c }), 0, 14, -8);
          addPart(g, new T.CylinderGeometry(0.18, 0.18, 5.2, 8), MAT_WHITE, 0, 26.5, -8);
          addPart(g, new T.BoxGeometry(3.2, 1.8, 0.25), MAT_GOLD_GLOW, 1.6, 28, -8);
        } else {
          addPart(g, new T.SphereGeometry(12.5, 16, 14), new T.MeshLambertMaterial({ color: 0xf25c30, emissive: 0x521506 }), 0, 16, -10);
          addPart(g, new T.TorusGeometry(16.5, 0.75, 6, 28), MAT_GOLD_GLOW, 0, 16, -10, 1.3, 0.2, 0);
        }
        scene.add(g);
        milestoneNodes.push(g);
      }
    }

    /* ----------------------------------------- Pooled VFX (Shadows, Trail, Particles, Shockwaves) */
    var MAX_SHADOWS = 28;
    var shadowGeo = new T.CircleGeometry(1, 14);
    shadowGeo.rotateX(-M.PI / 2);
    var shadowInst = new T.InstancedMesh(shadowGeo, new T.MeshBasicMaterial({ color: 0x0a1c14, transparent: true, opacity: 0.28, depthWrite: false }), MAX_SHADOWS);
    shadowInst.frustumCulled = false;
    scene.add(shadowInst);

    var MAX_TRAIL = 22;
    var trailInst = new T.InstancedMesh(new T.SphereGeometry(0.42, 8, 6), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.65 }), MAX_TRAIL);
    trailInst.frustumCulled = false;
    scene.add(trailInst);
    var trailPts = [];

    var MAX_PART = 150;
    var partInst = new T.InstancedMesh(new T.IcosahedronGeometry(0.32, 0), new T.MeshBasicMaterial({ color: 0xffffff }), MAX_PART);
    partInst.frustumCulled = false;
    scene.add(partInst);
    var parts = [];
    for (pi = 0; pi < MAX_PART; pi++) parts.push({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, g: 14, size: 1, col: 0xffffff });
    var partCursor = 0;

    function burst(x, y, z, opts) {
      if (view.calm) return;
      opts = opts || {};
      var count = opts.count || 14;
      var colors = opts.colors || [0xffe44d, 0xffffff];
      var speed = opts.speed || 12;
      var life = opts.life || 0.65;
      var size = opts.size || 1.0;
      var grav = opts.g != null ? opts.g : 14;
      for (var k = 0; k < count; k++) {
        var p = parts[partCursor];
        partCursor = (partCursor + 1) % MAX_PART;
        var a = opts.angle != null ? opts.angle + (M.random() - 0.5) * (opts.spread || 1.2) : M.random() * M.PI * 2;
        var sp = speed * (0.4 + M.random() * 0.7);
        p.x = x; p.y = y; p.z = (z || 0) + (M.random() - 0.5) * 0.9;
        p.vx = M.cos(a) * sp;
        p.vy = M.sin(a) * sp + (opts.up || 2.5);
        p.vz = (M.random() - 0.5) * speed * 0.45;
        p.life = life * (0.65 + M.random() * 0.5);
        p.max = p.life;
        p.g = grav;
        p.size = size * (0.6 + M.random() * 0.6);
        p.col = colors[k % colors.length];
      }
    }

    var MAX_SHOCKS = 6;
    var shocks = [];
    for (pi = 0; pi < MAX_SHOCKS; pi++) {
      var sm = new T.MeshBasicMaterial({ color: 0xffe44d, transparent: true, opacity: 0, side: T.DoubleSide });
      var smesh = new T.Mesh(new T.TorusGeometry(1.0, 0.14, 6, 20), sm);
      smesh.visible = false;
      scene.add(smesh);
      shocks.push({ mesh: smesh, mat: sm, life: 0, max: 0.45, maxScale: 4.5 });
    }
    var shockCursor = 0;
    function shockwave(x, y, col, maxScale) {
      if (view.calm) return;
      var sw = shocks[shockCursor];
      shockCursor = (shockCursor + 1) % MAX_SHOCKS;
      sw.mesh.position.set(x, y, 0.3);
      sw.mat.color.setHex(col || 0xffe44d);
      sw.life = sw.max = 0.42;
      sw.maxScale = maxScale || 4.8;
      sw.mesh.visible = true;
    }

    // Ground Landing Reticle (glowing golden ring at predicted landing!)
    var reticle = new T.Group();
    addPart(reticle, new T.RingGeometry(1.15, 1.75, 22), new T.MeshBasicMaterial({ color: 0xffdf2b, side: T.DoubleSide }), 0, 0.14, 0, -M.PI / 2, 0, 0);
    addPart(reticle, new T.RingGeometry(0.45, 0.72, 16), new T.MeshBasicMaterial({ color: 0xffffff, side: T.DoubleSide }), 0, 0.16, 0, -M.PI / 2, 0, 0);
    reticle.visible = false;
    scene.add(reticle);

    /* ----------------------------------------- Camera Shake & Sync */
    var shakePower = 0;
    var shakeX = 0, shakeY = 0;
    function addShake(p) {
      if (!view.calm) shakePower = M.max(shakePower, p);
    }

    var builtMilestonesFor = null;
    var activeSkinId = '';
    function setBallSkin(id) {
      if (activeSkinId === id) return;
      activeSkinId = id;
      for (var k in skinMeshes) skinMeshes[k].visible = k === id;
      if (!skinMeshes[id]) skinMeshes.classic.visible = true;
    }

    function clearFX() {
      trailPts.length = 0;
      for (var i = 0; i < MAX_PART; i++) parts[i].life = 0;
      for (i = 0; i < MAX_SHOCKS; i++) { shocks[i].life = 0; shocks[i].mesh.visible = false; }
      shakePower = shakeX = shakeY = 0;
    }

    function sync(state, dt) {
      var course = state.course;
      var ball = state.ball;
      var phase = state.phase;
      var t = state.t || 0;
      var calm = view.calm;

      if (builtMilestonesFor !== course) {
        for (var mi = 0; mi < milestoneNodes.length; mi++) scene.remove(milestoneNodes[mi]);
        milestoneNodes.length = 0;
        buildMilestones(course);
        builtMilestonesFor = course;
        lastTerrainSnap = -99999;
      }

      setBallSkin(state.skin || 'classic');

      // Shake decay
      if (calm) {
        shakePower = shakeX = shakeY = 0;
      } else {
        shakePower = M.max(0, shakePower - dt * 26);
        shakeX = (M.random() - 0.5) * 2 * shakePower * 0.45;
        shakeY = (M.random() - 0.5) * 2 * shakePower * 0.45;
      }

      // Camera framing: hero view on tee -> wide dynamic side-follower in flight!
      var targetCamX, targetCamY, targetCamZ, targetLookX, targetLookY;
      if (!ball || phase === 'title' || phase === 'aim' || phase === 'power') {
        targetCamX = phase === 'title' ? 4.2 : 5.5;
        targetCamY = phase === 'title' ? 7.6 : 7.0;
        targetCamZ = phase === 'title' ? 21.5 : 22.8;
        targetLookX = phase === 'title' ? 3.5 : 6.2;
        targetLookY = phase === 'title' ? 5.6 : 5.4;
      } else {
        var spd = M.hypot(ball.vx, ball.vy);
        var pullBack = P.clamp(spd * 0.24 + P.clamp(ball.y * 0.045, 0, 14), 0, 26);
        var leadX = P.clamp(ball.vx * 0.26, 3.5, 16);
        var leadY = P.clamp(ball.vy * 0.08, -3, 5);
        targetCamX = ball.x + leadX * 0.45;
        targetCamY = M.max(P.heightAt(course, ball.x) + 5.2, ball.y + 1.8 + leadY * 0.4);
        targetCamZ = 22.5 + pullBack;
        targetLookX = ball.x + leadX * 0.72;
        targetLookY = M.max(P.heightAt(course, ball.x) + 3.0, ball.y + leadY * 0.35);
      }

      if (state.snap) {
        camPos.set(targetCamX, targetCamY, targetCamZ);
        camLook.set(targetLookX, targetLookY, 0);
      } else {
        var ease = 1 - M.exp(-dt * 7.5);
        camPos.x = P.lerp(camPos.x, targetCamX, ease);
        camPos.y = P.lerp(camPos.y, targetCamY, ease);
        camPos.z = P.lerp(camPos.z, targetCamZ, ease * 0.75);
        camLook.x = P.lerp(camLook.x, targetLookX, ease);
        camLook.y = P.lerp(camLook.y, targetLookY, ease);
      }
      camera.position.set(camPos.x + shakeX, camPos.y + shakeY, camPos.z);
      camera.lookAt(camLook.x, camLook.y, 0);

      // Update altitude sky, fog, sun, moon, starfield & aurora!
      updateSky(camPos.y);
      var spaceMix = P.clamp((camPos.y - 175) / 145, 0, 1);
      var sunVis = 1 - P.clamp((camPos.y - 120) / 100, 0, 1);
      sunGroup.visible = sunVis > 0.02;
      sunGroup.position.set(camPos.x + 34, camPos.y + 18 - (1 - sunVis) * 16, -68);
      sunGroup.scale.setScalar(0.8 + sunVis * 0.3);

      moonBackdrop.visible = spaceMix > 0.05;
      moonBackdrop.position.set(camPos.x + 36, camPos.y + 16, -78);

      starMat.opacity = spaceMix * 0.95;
      starInst.visible = spaceMix > 0.02;
      if (starInst.visible) {
        for (var st = 0; st < MAX_STARS; st++) {
          var sd = starSeeds[st];
          var tw = calm ? 1 : (0.7 + 0.35 * M.sin(t * 3.8 + sd.ph));
          setInst(starInst, st, camPos.x + sd.ox, camPos.y + sd.oy, sd.oz, sd.s * tw, sd.s * tw, sd.s * tw, t + sd.ph, t * 0.7, 0);
        }
        starInst.instanceMatrix.needsUpdate = true;
      }

      var auroraMix = 1 - M.abs(camPos.y - 245) / 68;
      auroraGroup.visible = auroraMix > 0.02;
      if (auroraGroup.visible) {
        auroraGroup.position.x = camPos.x;
        for (var ai = 0; ai < auroraRibbons.length; ai++) {
          auroraMats[ai].opacity = P.clamp(auroraMix, 0, 1) * (ai === 0 ? 0.28 : 0.22);
          auroraRibbons[ai].position.y = 224 + ai * 20 + (calm ? 0 : M.sin(t * 1.3 + ai) * 2.5);
        }
      }

      // Stream 3D Terrain Ribbon & Background Rolling Hills
      var snapX = M.floor((camPos.x - 36) / STEP_X) * STEP_X;
      rebuildTerrain(course, snapX);

      // Background parallax hills (2 depth layers)
      var hillStep = 28;
      var hBase = M.floor((camPos.x - 95) / hillStep);
      for (var hi = 0; hi < MAX_HILLS; hi++) {
        var row = hi < 12 ? 0 : 1;
        var slot = hBase + (hi % 12);
        var hx = slot * hillStep + (row === 1 ? 14 : 0);
        var hr = 15 + P.hash(slot, 301 + row) * 14;
        var hh = (row === 0 ? 10 : 18) + P.hash(slot, 305 + row) * (row === 0 ? 7 : 12);
        var hz = row === 0 ? -24 : -42;
        setInst(hillInst, hi, hx, -3.5, hz, hr, hh, hr * 0.65, 0, 0, 0);
        hillInst.setColorAt(hi, C.setHex(row === 0 ? 0x3ec265 : 0x3da89c));
      }
      hillInst.instanceMatrix.needsUpdate = true;
      if (hillInst.instanceColor) hillInst.instanceColor.needsUpdate = true;

      // Tee flag flutter & Chunky Golfer animation!
      teePennant.rotation.y = calm ? 0 : M.sin(t * 5.2) * 0.28;
      var bob = calm ? 0 : M.sin(t * 3.5) * 0.06;
      golferBody.position.y = bob + (state.golferJump || 0);
      golferBody.scale.set(1, 1 + (state.golferJump ? 0.08 : 0), 1);

      if (phase === 'title' || phase === 'aim') {
        torsoPivot.rotation.z = calm ? 0 : M.sin(t * 2.2) * 0.05;
        clubPivot.rotation.z = -0.22 + (calm ? 0 : M.sin(t * 3.0) * 0.08);
      } else if (phase === 'power') {
        var pv = state.powerVal || 0;
        torsoPivot.rotation.z = pv * 0.28;
        clubPivot.rotation.z = -0.2 - pv * 2.35;
      } else if (phase === 'swing') {
        var sw = state.swingT || 0;
        torsoPivot.rotation.z = P.lerp(0.25, -0.35, sw);
        clubPivot.rotation.z = P.lerp(-2.4, 2.2, sw);
      } else {
        torsoPivot.rotation.z = -0.24;
        clubPivot.rotation.z = 1.95;
      }

      // 3D In-World Aim & Power Meters
      aimGroup.visible = phase === 'aim';
      if (aimGroup.visible) {
        var rad = (state.aimAngle || 45) * M.PI / 180;
        aimArrow.rotation.z = rad;
        for (var d = 0; d < aimDots.length; d++) {
          var ds = 1 + (calm ? 0 : 0.22 * M.sin(t * 8 - d * 0.9));
          aimDots[d].scale.setScalar(ds);
        }
      }

      powerGroup.visible = phase === 'power';
      if (powerGroup.visible) {
        var pVal = state.powerVal || 0.5;
        var pf = P.perfectBand(course);
        for (var ps2 = 0; ps2 < PWR_SEGS; ps2++) {
          var u = ps2 / (PWR_SEGS - 1);
          var isGold = u >= pf - 0.02;
          var isGreat = u >= pf - 0.16;
          pwrSegMats[ps2].color.setHex(isGold ? 0xffe133 : isGreat ? 0x5eff6d : u > 0.45 ? 0x52d6ff : 0xff7755);
          pwrSegs[ps2].scale.setScalar(isGold && !calm ? 1.15 + 0.08 * M.sin(t * 12) : 1.0);
        }
        var nAng = P.lerp(2.55, 0.92, pVal);
        pwrNeedle.rotation.z = nAng;
      }

      // Ball mesh + squash & stretch + rocket flame + trail!
      var bx = ball ? ball.x : 0;
      var by = ball ? ball.y : P.heightAt(course, 0) + P.BALL_R + 0.08;
      ballRoot.position.set(bx, by, 0);

      if (ball) {
        ballSpin.rotation.z -= (ball.spin || 0) * dt;
        var sq = ball.squash || 0;
        var stretchX = 1 + sq * 0.36 + (ball.boosting ? 0.16 : 0);
        var stretchY = 1 - sq * 0.28;
        ballSpin.scale.set(stretchX, stretchY, 1);

        flameGroup.visible = !!ball.boosting;
        if (ball.boosting) {
          var vang = M.atan2(ball.vy, ball.vx);
          flameGroup.rotation.z = vang;
          var flk = calm ? 1 : (0.85 + 0.35 * M.sin(t * 55));
          flameOuter.scale.set(1, flk, 1);
          flameInner.scale.set(1, flk * 0.95, 1);
        }

        diveRing.visible = !!(ball.armed || ball.diving);
        if (diveRing.visible) {
          diveRing.rotation.z = t * 8;
          diveRing.scale.setScalar(ball.armedPerfect ? 1.28 : 1.05);
        }

        // Ball trail (disabled in reduced motion!)
        if (!calm && phase === 'flight' && !ball.done) {
          if (trailPts.length === 0 || M.hypot(bx - trailPts[0].x, by - trailPts[0].y) > 0.95) {
            trailPts.unshift({ x: bx, y: by, boost: ball.boosting });
            if (trailPts.length > MAX_TRAIL) trailPts.pop();
          }
        }
      } else {
        ballSpin.scale.set(1, 1, 1);
        ballSpin.rotation.z = 0;
        flameGroup.visible = false;
        diveRing.visible = false;
        trailPts.length = 0;
      }

      var skinObj = P.SKINS[0];
      for (var sk = 0; sk < P.SKINS.length; sk++) if (P.SKINS[sk].id === (state.skin || 'classic')) skinObj = P.SKINS[sk];
      if (!calm && trailPts.length > 0) {
        for (var ti = 0; ti < trailPts.length; ti++) {
          var tp = trailPts[ti];
          var frac = 1 - ti / MAX_TRAIL;
          var ts = frac * (tp.boost ? 1.45 : 0.92);
          setInst(trailInst, ti, tp.x, tp.y, -0.1, ts, ts, ts, 0, 0, 0);
          trailInst.setColorAt(ti, C.setHex(tp.boost ? 0xff7b24 : skinObj.trail));
        }
        trailInst.count = trailPts.length;
        trailInst.instanceMatrix.needsUpdate = true;
        if (trailInst.instanceColor) trailInst.instanceColor.needsUpdate = true;
      } else {
        trailInst.count = 0;
      }

      // Ground Landing Reticle when falling near terrain
      var pred = state.reticle;
      reticle.visible = !!(pred && phase === 'flight' && ball && !ball.done);
      if (reticle.visible) {
        reticle.position.set(pred.x, P.heightAt(course, pred.x) + 0.08, 0);
        var rScale = pred.perfect ? 1.25 : 0.85 + (1 - P.clamp(pred.t / 0.55, 0, 1)) * 0.55;
        reticle.scale.setScalar(rScale);
      }

      // Sync visible course features & scenery in camera window
      var viewHalf = 58 + (camPos.z - 22) * 1.4;
      var feat = P.features(course, camPos.x - 42, camPos.x + viewHalf);
      var hitIds = ball ? ball.hitIds : {};
      var coinIds = ball ? ball.coinIds : {};

      // Shadows: golfer + ball + ground objects
      var shIdx = 0;
      setInst(shadowInst, shIdx++, -1.65, P.heightAt(course, -1.65) + 0.08, -0.45, 1.05, 1, 0.85, 0, 0, 0);
      var bGround = P.heightAt(course, bx);
      var bH = M.max(0, by - bGround);
      var bSh = P.clamp(1.0 - bH * 0.025, 0.22, 1.05);
      if (bH < 36) setInst(shadowInst, shIdx++, bx, bGround + 0.08, 0, bSh, 1, bSh, 0, 0, 0);

      // Trampolines
      var idx = 0, o;
      for (var i = 0; i < feat.trampolines.length && idx < poolTramp.length; i++) {
        o = feat.trampolines[i];
        var m = poolTramp[idx++];
        m.visible = true;
        var hitSq = hitIds[o.id] ? 0.65 : 1.0;
        m.position.set(o.x, o.y, 0);
        m.scale.set(1, hitSq, 1);
        if (shIdx < MAX_SHADOWS) setInst(shadowInst, shIdx++, o.x, P.heightAt(course, o.x) + 0.07, 0, 2.2, 1, 1.8, 0, 0, 0);
      }
      while (idx < poolTramp.length) poolTramp[idx++].visible = false;

      // TNT Crates (hide once blasted!)
      idx = 0;
      for (i = 0; i < feat.tnts.length && idx < poolTNT.length; i++) {
        o = feat.tnts[i];
        if (hitIds[o.id]) continue;
        var tm = poolTNT[idx++];
        tm.visible = true;
        var bobT = o.floating && !calm ? M.sin(t * 3.2 + o.x) * 0.45 : 0;
        tm.position.set(o.x, o.y + bobT, 0);
        tm.rotation.y = o.floating && !calm ? t * 1.1 + o.x : 0.2;
      }
      while (idx < poolTNT.length) poolTNT[idx++].visible = false;

      // Hot-Air Balloons
      idx = 0;
      for (i = 0; i < feat.balloons.length && idx < poolBal.length; i++) {
        o = feat.balloons[i];
        if (hitIds[o.id]) continue;
        var bm = poolBal[idx++];
        bm.visible = true;
        bm.userData.env.material = BAL_MATS[o.colorIdx % BAL_MATS.length];
        var bobB = calm ? 0 : M.sin(t * 1.8 + o.x * 0.3) * 0.9;
        bm.position.set(o.x, o.y + bobB, 0);
        bm.rotation.z = calm ? 0 : M.sin(t * 1.4 + o.x) * 0.07;
      }
      while (idx < poolBal.length) poolBal[idx++].visible = false;

      // Golden Boost Rings
      idx = 0;
      for (i = 0; i < feat.rings.length && idx < poolRing.length; i++) {
        o = feat.rings[i];
        if (hitIds[o.id]) continue;
        var rm = poolRing[idx++];
        rm.visible = true;
        rm.position.set(o.x, o.y, 0);
        rm.rotation.x = calm ? 0 : t * 1.8 + o.x;
        var rp = calm ? 1 : (1 + 0.06 * M.sin(t * 5 + o.x));
        rm.scale.setScalar(rp);
      }
      while (idx < poolRing.length) poolRing[idx++].visible = false;

      // Bouncy UFOs
      idx = 0;
      for (i = 0; i < feat.ufos.length && idx < poolUFO.length; i++) {
        o = feat.ufos[i];
        if (hitIds[o.id]) continue;
        var um = poolUFO[idx++];
        um.visible = true;
        um.position.set(o.x, o.y + (calm ? 0 : M.sin(t * 2.5 + o.x) * 0.85), 0);
        um.rotation.y = calm ? 0 : t * 1.8;
        um.rotation.z = calm ? 0 : M.sin(t * 2.0 + o.x) * 0.1;
      }
      while (idx < poolUFO.length) poolUFO[idx++].visible = false;

      // Coins & Stars InstancedMesh (shown during play, kept clean on title screen)
      var cIdx = 0, bsIdx = 0;
      if (phase !== 'title') {
        for (i = 0; i < feat.stars.length; i++) {
          o = feat.stars[i];
          if (coinIds[o.id]) continue;
          var spinA = calm ? 0 : t * 3.2 + o.x * 0.4;
          if (o.star) {
            if (bsIdx < MAX_BIGSTARS) {
              var sc = 1 + (calm ? 0 : 0.12 * M.sin(t * 6 + o.x));
              setInst(bigStarInst, bsIdx++, o.x, o.y, 0, sc, sc, sc, 0.35, spinA, 0);
            }
          } else if (cIdx < MAX_COINS) {
            setInst(coinInst, cIdx++, o.x, o.y, 0, 1, 1, 1, M.PI / 2, 0, spinA);
          }
        }
      }
      coinInst.count = cIdx;
      coinInst.instanceMatrix.needsUpdate = true;
      bigStarInst.count = bsIdx;
      bigStarInst.instanceMatrix.needsUpdate = true;

      // Scenery Parallax (Trees, Flags, Clouds, Biplanes, Blimps, Satellites, Planets, Asteroids)
      var trIdx = 0, pnIdx = 0, rdIdx = 0, clIdx = 0, flIdx = 0, bpIdx = 0, blpIdx = 0, satIdx = 0, plIdx = 0, astIdx = 0;
      for (i = 0; i < feat.scenery.length; i++) {
        o = feat.scenery[i];
        if (o.kind === 'pine' || o.kind === 'roundTree') {
          if (trIdx < MAX_TREES) {
            setInst(trunkInst, trIdx++, o.x, o.y + 1.05 * o.scale, o.z, o.scale, o.scale, o.scale, 0, 0, 0);
            if (o.kind === 'pine' && pnIdx < MAX_TREES) {
              setInst(pineInst, pnIdx, o.x, o.y + 3.0 * o.scale, o.z, o.scale, o.scale, o.scale, 0, o.x, 0);
              setInst(pineTopInst, pnIdx, o.x, o.y + 4.7 * o.scale, o.z, o.scale, o.scale, o.scale, 0, o.x + 0.5, 0);
              pnIdx++;
            } else if (o.kind === 'roundTree' && rdIdx < MAX_TREES) {
              setInst(roundCrownInst, rdIdx++, o.x, o.y + 3.3 * o.scale, o.z, o.scale, o.scale, o.scale, 0, o.x, 0);
            }
          }
        } else if (o.kind === 'flag' && flIdx < poolFlags.length) {
          var flm = poolFlags[flIdx++];
          flm.visible = true;
          flm.position.set(o.x, o.y, o.z);
          flm.rotation.y = calm ? 0 : M.sin(t * 4.5 + o.x) * 0.25;
        } else if (o.kind === 'cloud' && clIdx + 3 <= MAX_CLOUDS) {
          var cx = o.x + (calm ? 0 : M.sin(t * 0.35 + o.x) * 2.2);
          var cs = o.scale * 2.5;
          setInst(cloudInst, clIdx++, cx, o.y, o.z, cs * 1.15, cs * 0.72, cs * 0.82, 0, 0, 0);
          setInst(cloudInst, clIdx++, cx - cs * 0.9, o.y - cs * 0.12, o.z + 0.3, cs * 0.85, cs * 0.58, cs * 0.72, 0, 0, 0);
          setInst(cloudInst, clIdx++, cx + cs * 0.95, o.y - cs * 0.10, o.z + 0.2, cs * 0.82, cs * 0.55, cs * 0.70, 0, 0, 0);
        } else if (o.kind === 'biplane' && bpIdx < poolBiplanes.length) {
          var bpm = poolBiplanes[bpIdx++];
          bpm.visible = true;
          bpm.position.set(o.x + (calm ? 0 : M.sin(t * 0.9 + o.x) * 6), o.y + (calm ? 0 : M.cos(t * 1.5 + o.x) * 1.4), o.z);
          bpm.scale.setScalar(o.scale);
          if (!calm) bpm.userData.prop.rotation.x = t * 24;
        } else if (o.kind === 'blimp' && blpIdx < poolBlimps.length) {
          var blm = poolBlimps[blpIdx++];
          blm.visible = true;
          blm.position.set(o.x + (calm ? 0 : M.sin(t * 0.4 + o.x) * 4), o.y, o.z);
          blm.scale.setScalar(o.scale);
        } else if (o.kind === 'satellite' && satIdx < poolSats.length) {
          var stm = poolSats[satIdx++];
          stm.visible = true;
          stm.position.set(o.x, o.y, o.z);
          stm.rotation.set(0.3, calm ? 0.5 : t * 0.6 + o.x, 0.25);
        } else if (o.kind === 'planet' && plIdx < poolPlanets.length) {
          var plm = poolPlanets[plIdx++];
          plm.visible = true;
          plm.position.set(o.x, o.y, o.z);
          plm.scale.setScalar(o.scale);
          plm.rotation.y = calm ? 0.3 : t * 0.15 + o.x;
        } else if (o.kind === 'asteroid' && astIdx < MAX_ASTEROIDS) {
          setInst(asteroidInst, astIdx++, o.x, o.y, o.z, o.scale, o.scale * 0.85, o.scale, calm ? 0 : t + o.x, calm ? 0 : t * 0.7, 0);
        }
      }
      trunkInst.count = trIdx; trunkInst.instanceMatrix.needsUpdate = true;
      pineInst.count = pnIdx; pineInst.instanceMatrix.needsUpdate = true;
      pineTopInst.count = pnIdx; pineTopInst.instanceMatrix.needsUpdate = true;
      roundCrownInst.count = rdIdx; roundCrownInst.instanceMatrix.needsUpdate = true;
      cloudInst.count = clIdx; cloudInst.instanceMatrix.needsUpdate = true;
      asteroidInst.count = astIdx; asteroidInst.instanceMatrix.needsUpdate = true;
      while (flIdx < poolFlags.length) poolFlags[flIdx++].visible = false;
      while (bpIdx < poolBiplanes.length) poolBiplanes[bpIdx++].visible = false;
      while (blpIdx < poolBlimps.length) poolBlimps[blpIdx++].visible = false;
      while (satIdx < poolSats.length) poolSats[satIdx++].visible = false;
      while (plIdx < poolPlanets.length) poolPlanets[plIdx++].visible = false;

      shadowInst.count = shIdx;
      shadowInst.instanceMatrix.needsUpdate = true;

      // Update Shockwave Rings
      for (i = 0; i < MAX_SHOCKS; i++) {
        var sw = shocks[i];
        if (sw.life <= 0) continue;
        sw.life -= dt;
        if (sw.life <= 0) { sw.mesh.visible = false; continue; }
        var p = 1 - sw.life / sw.max;
        sw.mesh.scale.setScalar(P.lerp(0.5, sw.maxScale, p));
        sw.mat.opacity = (1 - p) * 0.85;
      }

      // Step & draw 3D Particles
      var ptIdx = 0;
      if (!calm) {
        for (i = 0; i < MAX_PART; i++) {
          var pt = parts[i];
          if (pt.life <= 0) continue;
          pt.life -= dt;
          if (pt.life <= 0) continue;
          pt.vy -= pt.g * dt;
          pt.x += pt.vx * dt;
          pt.y += pt.vy * dt;
          pt.z += pt.vz * dt;
          var sc2 = pt.size * M.max(0.08, pt.life / pt.max);
          setInst(partInst, ptIdx, pt.x, pt.y, pt.z, sc2, sc2, sc2, t * 5 + i, t * 4, 0);
          partInst.setColorAt(ptIdx, C.setHex(pt.col));
          ptIdx++;
        }
      }
      partInst.count = ptIdx;
      partInst.instanceMatrix.needsUpdate = true;
      if (partInst.instanceColor) partInst.instanceColor.needsUpdate = true;
    }

    function project(wx, wy, wz) {
      PRJ.set(wx, wy, wz || 0).project(camera);
      var rect = canvas.getBoundingClientRect();
      return {
        x: (PRJ.x * 0.5 + 0.5) * rect.width + rect.left,
        y: (-PRJ.y * 0.5 + 0.5) * rect.height + rect.top,
        visible: PRJ.z < 1
      };
    }

    /* ----------------------------------------- Software WebGL Frame Pacing */
    var pace = Kit.webgl.pacer(renderer, { software: software });

    var view = {
      renderer: renderer,
      scene: scene,
      camera: camera,
      calm: false,
      software: software,
      burst: burst,
      shockwave: shockwave,
      shake: addShake,
      clearFX: clearFX,
      sync: sync,
      project: project,
      mayDraw: pace.mayDraw,
      render: function () {
        renderer.render(scene, camera);
        pace.markDrawn();
      },
      resize: function (w, h) {
        renderer.setSize(w, h, false);
        camera.aspect = w / M.max(1, h);
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

  window.SkyboundArt = { createView: createView };
})();
