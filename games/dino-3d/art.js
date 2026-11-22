/* Dino 3D (الديناصور ثلاثي الأبعاد) — Smooth stylized low-poly 3D renderer (three.js).
 * Unified vertex-colored geometry builder (smooth organic characters + crisp low-poly props
 * sharing 1 Lambert + 1 Glow material), curved-horizon 5 worlds, pooled InstancedMesh pickups,
 * particles & shadows, and full software-WebGL guardrails (fence sync, menu pacing, 0.75x DPR). */
(function () {
  'use strict';
  var D = window.Dino3D;

  // Detect software WebGL (SwiftShader, Basic Render Driver, llvmpipe, WARP) before
  // creating the main renderer so MSAA can be disabled up front.
  function detectSoftwareGL() {
    var gl = null;
    try {
      var c = document.createElement('canvas');
      var opts = { powerPreference: 'high-performance' };
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
      try {
        var lose = gl && gl.getExtension('WEBGL_lose_context');
        if (lose) lose.loseContext();
      } catch (e) { /* ignore */ }
    }
  }

  D.createView = function (canvas) {
    var T = window.THREE;
    if (!T) throw new Error('three.js is unavailable');

    var software = detectSoftwareGL();
    var renderer = new T.WebGLRenderer({
      canvas: canvas,
      antialias: !software,
      powerPreference: 'high-performance'
    });
    if (renderer.outputColorSpace !== undefined && T.SRGBColorSpace) {
      renderer.outputColorSpace = T.SRGBColorSpace;
    }
    var ratio = software ? 0.75 : Math.min(window.devicePixelRatio || 1, 1.5);
    renderer.setPixelRatio(ratio);

    var scene = new T.Scene();
    var camera = new T.PerspectiveCamera(44, 16 / 9, 0.2, 260);
    scene.fog = new T.Fog(0xffe0a8, 30, 108);

    // Rich sunlit cartoon lighting: bright hemisphere sky/ground bounce + warm directional sun.
    var hemi = new T.HemisphereLight(0xfff8e6, 0x7a6a58, 1.48);
    var sun = new T.DirectionalLight(0xfff2d6, 2.05);
    sun.position.set(-7, 16, 13);
    scene.add(hemi, sun);

    // Reusable scratch objects (zero per-frame heap churn in hot loops).
    var C1 = new T.Color(), C2 = new T.Color(), C3 = new T.Color();
    var M4 = new T.Matrix4(), M4B = new T.Matrix4(), M3 = new T.Matrix3();
    var Q1 = new T.Quaternion(), E1 = new T.Euler();
    var V1 = new T.Vector3(), V2 = new T.Vector3(), S1 = new T.Vector3();

    // Minimal material set (tiny shader count = fast cold startup on software WebGL).
    var MAT_LIT = new T.MeshLambertMaterial({ vertexColors: true });
    var MAT_GLOW = new T.MeshBasicMaterial({ vertexColors: true });
    var MAT_FLASH = new T.MeshLambertMaterial({ vertexColors: true, emissive: 0xff9a2e, emissiveIntensity: 0.5 });
    var MAT_INST_LIT = new T.MeshLambertMaterial({ vertexColors: true });
    var MAT_INST_GLOW = new T.MeshBasicMaterial({ color: 0xffffff });
    var MAT_SHADOW = new T.MeshBasicMaterial({ color: 0x1b1530, transparent: true, opacity: 0.26, depthWrite: false });
    var MATS = [MAT_LIT, MAT_GLOW];
    var FLASH_MATS = [MAT_FLASH, MAT_GLOW];

    function mixHex(a, b, t) { C1.setHex(a); C2.setHex(b); return C1.lerp(C2, t).getHex(); }
    function shadeHex(a, f) { return mixHex(a, f < 1 ? 0x181028 : 0xffffff, f < 1 ? 1 - f : f - 1); }

    /* ------------------------------------------- smooth/low-poly GeoBuilder */
    // Caches unit primitives so procedural models build in milliseconds.
    var prims = {};
    function getPrim(key, factory) {
      if (!prims[key]) prims[key] = factory();
      return prims[key];
    }

    function makeEggGeo(segsW, segsH) {
      var g = new T.SphereGeometry(0.5, segsW || 10, segsH || 8);
      var pos = g.attributes.position;
      for (var i = 0; i < pos.count; i++) {
        var x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        var taper = y > 0 ? (1 - y * 0.42) : (1 + y * 0.08);
        pos.setXYZ(i, x * taper * 0.86, y * 1.18, z * taper * 0.86);
      }
      g.computeVertexNormals();
      return g;
    }

    function makeHeartGeo() {
      var shape = new T.Shape();
      shape.moveTo(0, -0.32);
      shape.bezierCurveTo(0.42, 0.02, 0.44, 0.44, 0.2, 0.46);
      shape.bezierCurveTo(0.06, 0.46, 0, 0.34, 0, 0.26);
      shape.bezierCurveTo(0, 0.34, -0.06, 0.46, -0.2, 0.46);
      shape.bezierCurveTo(-0.44, 0.44, -0.42, 0.02, 0, -0.32);
      var g = new T.ExtrudeGeometry(shape, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.06, bevelSegments: 2, curveSegments: 8 });
      g.center();
      g.computeVertexNormals();
      return g;
    }

    var P_SPHERE = getPrim('sph10', function () { return new T.SphereGeometry(0.5, 10, 8); });
    var P_SPHERE_HI = getPrim('sph12', function () { return new T.SphereGeometry(0.5, 12, 10); });
    var P_SPHERE_LO = getPrim('sph7', function () { return new T.SphereGeometry(0.5, 7, 6); });
    var P_CYL = getPrim('cyl9', function () { return new T.CylinderGeometry(0.5, 0.5, 1, 9, 1); });
    var P_CONE = getPrim('cone8', function () { return new T.ConeGeometry(0.5, 1, 8, 1); });
    var P_CONE_TAPER = getPrim('taper8', function () { return new T.CylinderGeometry(0.28, 0.5, 1, 8, 1); });
    var P_ICO = getPrim('ico', function () { return new T.IcosahedronGeometry(0.5, 0); });
    var P_OCT = getPrim('oct', function () { return new T.OctahedronGeometry(0.5, 0); });
    var P_BOX = getPrim('box', function () { return new T.BoxGeometry(1, 1, 1); });
    var P_TORUS = getPrim('torus', function () { return new T.TorusGeometry(0.5, 0.14, 7, 14); });
    var P_EGG = getPrim('egg', function () { return makeEggGeo(10, 8); });
    var P_HEART = getPrim('heart', makeHeartGeo);

    // Unified vertex-colored Geometry Builder: merges smooth AND faceted primitives
    // into one BufferGeometry with 2 material groups (0: lit Lambert, 1: unlit Glow).
    function Builder() {
      this.lit = [];
      this.glow = [];
    }
    Builder.prototype.add = function (srcGeo, px, py, pz, sx, sy, sz, rx, ry, rz, colorHex, opts) {
      opts = opts || {};
      var g = srcGeo.index ? srcGeo.toNonIndexed() : srcGeo.clone();
      if (opts.flat) {
        g.computeVertexNormals();
      } else if (!g.attributes.normal) {
        g.computeVertexNormals();
      }
      E1.set(rx || 0, ry || 0, rz || 0);
      Q1.setFromEuler(E1);
      V1.set(px || 0, py || 0, pz || 0);
      S1.set(sx == null ? 1 : sx, sy == null ? 1 : sy, sz == null ? 1 : sz);
      M4.compose(V1, Q1, S1);

      var pos = g.attributes.position;
      var nor = g.attributes.normal;
      var count = pos.count;
      var pArr = new Float32Array(count * 3);
      var nArr = new Float32Array(count * 3);
      var cArr = new Float32Array(count * 3);
      M3.getNormalMatrix(M4);

      var topHex = opts.top != null ? opts.top : (opts.flat ? colorHex : shadeHex(colorHex, 1.12));
      var botHex = opts.bot != null ? opts.bot : (opts.flat ? shadeHex(colorHex, 0.86) : shadeHex(colorHex, 0.82));
      C1.setHex(botHex);
      C2.setHex(topHex);

      // Find local Y bounds for soft organic top-to-bottom painted shading.
      var minY = 1e9, maxY = -1e9;
      for (var i = 0; i < count; i++) {
        var ly = pos.getY(i);
        if (ly < minY) minY = ly;
        if (ly > maxY) maxY = ly;
      }
      var spanY = Math.max(0.001, maxY - minY);

      for (i = 0; i < count; i++) {
        var lx = pos.getX(i), ly2 = pos.getY(i), lz = pos.getZ(i);
        V2.set(lx, ly2, lz).applyMatrix4(M4);
        pArr[i * 3] = V2.x; pArr[i * 3 + 1] = V2.y; pArr[i * 3 + 2] = V2.z;

        V2.set(nor.getX(i), nor.getY(i), nor.getZ(i)).applyMatrix3(M3).normalize();
        nArr[i * 3] = V2.x; nArr[i * 3 + 1] = V2.y; nArr[i * 3 + 2] = V2.z;

        var u = (ly2 - minY) / spanY;
        C3.copy(C1).lerp(C2, u);
        cArr[i * 3] = C3.r; cArr[i * 3 + 1] = C3.g; cArr[i * 3 + 2] = C3.b;
      }
      g.dispose();
      (opts.glow ? this.glow : this.lit).push({ p: pArr, n: nArr, c: cArr, count: count });
      return this;
    };
    Builder.prototype.finish = function () {
      var litCount = 0, glowCount = 0, i;
      for (i = 0; i < this.lit.length; i++) litCount += this.lit[i].count;
      for (i = 0; i < this.glow.length; i++) glowCount += this.glow[i].count;
      var total = litCount + glowCount;
      var p = new Float32Array(total * 3);
      var n = new Float32Array(total * 3);
      var c = new Float32Array(total * 3);
      var off = 0;
      function append(list) {
        for (var j = 0; j < list.length; j++) {
          p.set(list[j].p, off * 3);
          n.set(list[j].n, off * 3);
          c.set(list[j].c, off * 3);
          off += list[j].count;
        }
      }
      append(this.lit);
      append(this.glow);
      var geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.BufferAttribute(p, 3));
      geo.setAttribute('normal', new T.BufferAttribute(n, 3));
      geo.setAttribute('color', new T.BufferAttribute(c, 3));
      geo.addGroup(0, litCount, 0);
      geo.addGroup(litCount, glowCount, 1);
      geo.computeBoundingSphere();
      return geo;
    };

    /* ----------------------------------------------------------- 5 Worlds */
    var PALETTES = [
      // 0: Golden Desert (الصحراء الذهبية)
      {
        skyTop: 0x2ba8ff, skyMid: 0x8be2ff, skyBot: 0xffe4a8, fog: 0xffd99e,
        hemiTop: 0xfff5dc, hemiBot: 0xd98e46, sun: 0xfff0c8, sunInt: 2.1,
        pathTop: 0xfad27a, pathSide: 0xd9873b, curb: 0xe86c3a, ground: 0xf2b55c,
        hillA: 0xe69244, hillB: 0xd46f38, accent: 0x3ac463, sunColor: 0xffe86b,
        mote: 0xfff2b2
      },
      // 1: Lush Jungle (الغابة الخضراء)
      {
        skyTop: 0x20a6ff, skyMid: 0x8cf2d6, skyBot: 0xd8ffd2, fog: 0xbaf2c8,
        hemiTop: 0xf0fff2, hemiBot: 0x3b8a42, sun: 0xfffce0, sunInt: 2.0,
        pathTop: 0xe0b572, pathSide: 0x8f5b32, curb: 0x4bc74c, ground: 0x4bb852,
        hillA: 0x37a64d, hillB: 0x288546, accent: 0x2de0c8, sunColor: 0xfff49c,
        mote: 0xd9ff73
      },
      // 2: Snowy Peaks (جبال الثلج)
      {
        skyTop: 0x3d7eff, skyMid: 0x9ed8ff, skyBot: 0xebf8ff, fog: 0xddf2ff,
        hemiTop: 0xffffff, hemiBot: 0x7ea7d9, sun: 0xffffff, sunInt: 1.95,
        pathTop: 0xedf6ff, pathSide: 0x9ac1e6, curb: 0x5ec6ff, ground: 0xdcf0ff,
        hillA: 0xb9daf7, hillB: 0x8eb8e5, accent: 0x58ffe6, sunColor: 0xffffff,
        mote: 0xffffff
      },
      // 3: Volcano Valley (وادي البراكين)
      {
        skyTop: 0x4b245c, skyMid: 0xc2494e, skyBot: 0xffa652, fog: 0xe87b4a,
        hemiTop: 0xffd2a8, hemiBot: 0x6b2f3c, sun: 0xffbf7a, sunInt: 2.15,
        pathTop: 0x695d75, pathSide: 0x3b3145, curb: 0xff6229, ground: 0x4b3c54,
        hillA: 0x5b3752, hillB: 0x442540, accent: 0xff7729, sunColor: 0xffc159,
        mote: 0xffaa3b
      },
      // 4: Royal Nest / Rainbow Valley (العش الملكي)
      {
        skyTop: 0x668aff, skyMid: 0xc9a8ff, skyBot: 0xffe4f0, fog: 0xffdcf0,
        hemiTop: 0xfff7ff, hemiBot: 0x86c99b, sun: 0xfff8e6, sunInt: 2.05,
        pathTop: 0xfff1c9, pathSide: 0xe0a2b8, curb: 0xff72b6, ground: 0x82e39c,
        hillA: 0xff9ec7, hillB: 0xa994ff, accent: 0x57f0d6, sunColor: 0xfff08a,
        mote: 0xffe87a
      }
    ];

    /* ----------------------------------------------------------- Sky Dome */
    var skyGeo = new T.SphereGeometry(180, 14, 10);
    var skyPos = skyGeo.attributes.position;
    var skyColArr = new Float32Array(skyPos.count * 3);
    skyGeo.setAttribute('color', new T.BufferAttribute(skyColArr, 3));
    var skyMat = new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide, fog: false, depthWrite: false });
    var skyMesh = new T.Mesh(skyGeo, skyMat);
    scene.add(skyMesh);

    // Radiant Sun + Halo Disc + Rainbow Arc (visible in World 4!)
    var skyDecor = new T.Group();
    scene.add(skyDecor);
    var sunCore = new T.Mesh(new T.SphereGeometry(7.2, 12, 10), new T.MeshBasicMaterial({ color: 0xffe86b, fog: false }));
    sunCore.position.set(34, 24, -88);
    var sunHalo = new T.Mesh(new T.SphereGeometry(11.2, 12, 10), new T.MeshBasicMaterial({ color: 0xfff5b8, transparent: true, opacity: 0.25, fog: false }));
    sunHalo.position.copy(sunCore.position);
    skyDecor.add(sunCore, sunHalo);

    // Giant Pastel 3D Rainbow Arc for World 4 (Royal Nest / Rainbow Valley).
    var rainbowGroup = new T.Group();
    var rbColors = [0xff5f8f, 0xffb347, 0xffe857, 0x57e389, 0x5cc8ff, 0xb27aff];
    for (var rb = 0; rb < rbColors.length; rb++) {
      var rbMesh = new T.Mesh(
        new T.TorusGeometry(48 - rb * 2.2, 1.15, 6, 26, Math.PI),
        new T.MeshBasicMaterial({ color: rbColors[rb], transparent: true, opacity: 0.72, fog: false })
      );
      rainbowGroup.add(rbMesh);
    }
    rainbowGroup.position.set(16, -4, -95);
    rainbowGroup.visible = false;
    skyDecor.add(rainbowGroup);

    // Aurora ribbons for World 2 (Snowy Peaks).
    var auroraGroup = new T.Group();
    var auColors = [0x47ffd9, 0x6ba8ff, 0xc97aff];
    for (var au = 0; au < auColors.length; au++) {
      var auMesh = new T.Mesh(
        new T.TorusGeometry(54 + au * 6, 1.8, 5, 22, Math.PI * 0.7),
        new T.MeshBasicMaterial({ color: auColors[au], transparent: true, opacity: 0.34, fog: false })
      );
      auMesh.rotation.set(0.55, 0.2 * au, 0.22 - au * 0.14);
      auroraGroup.add(auMesh);
    }
    auroraGroup.position.set(12, 18, -92);
    auroraGroup.visible = false;
    skyDecor.add(auroraGroup);

    var curSky = {
      top: new T.Color(PALETTES[0].skyTop),
      mid: new T.Color(PALETTES[0].skyMid),
      bot: new T.Color(PALETTES[0].skyBot),
      fog: new T.Color(PALETTES[0].fog),
      hemiTop: new T.Color(PALETTES[0].hemiTop),
      hemiBot: new T.Color(PALETTES[0].hemiBot),
      sun: new T.Color(PALETTES[0].sun),
      sunDisc: new T.Color(PALETTES[0].sunColor)
    };
    var targetWorld = 0;
    var lastSkyWorld = -1;

    function paintSkyDome() {
      var arr = skyGeo.attributes.color.array;
      for (var i = 0; i < skyPos.count; i++) {
        var ny = skyPos.getY(i) / 180; // -1 .. 1
        var u = D.clamp((ny + 0.08) / 0.85, 0, 1);
        if (u < 0.42) {
          C3.copy(curSky.bot).lerp(curSky.mid, u / 0.42);
        } else {
          C3.copy(curSky.mid).lerp(curSky.top, (u - 0.42) / 0.58);
        }
        arr[i * 3] = C3.r; arr[i * 3 + 1] = C3.g; arr[i * 3 + 2] = C3.b;
      }
      skyGeo.attributes.color.needsUpdate = true;
    }

    function applyPalette(worldIdx, instant, dt) {
      var p = PALETTES[worldIdx % PALETTES.length];
      var k = instant ? 1 : Math.min(1, (dt || 0.016) * 2.2);
      curSky.top.lerp(C1.setHex(p.skyTop), k);
      curSky.mid.lerp(C1.setHex(p.skyMid), k);
      curSky.bot.lerp(C1.setHex(p.skyBot), k);
      curSky.fog.lerp(C1.setHex(p.fog), k);
      curSky.hemiTop.lerp(C1.setHex(p.hemiTop), k);
      curSky.hemiBot.lerp(C1.setHex(p.hemiBot), k);
      curSky.sun.lerp(C1.setHex(p.sun), k);
      curSky.sunDisc.lerp(C1.setHex(p.sunColor), k);

      if (instant || k < 0.999 || lastSkyWorld !== worldIdx) {
        paintSkyDome();
        scene.fog.color.copy(curSky.fog);
        hemi.color.copy(curSky.hemiTop);
        hemi.groundColor.copy(curSky.hemiBot);
        sun.color.copy(curSky.sun);
        sun.intensity = p.sunInt;
        sunCore.material.color.copy(curSky.sunDisc);
        sunHalo.material.color.copy(curSky.sunDisc);
        rainbowGroup.visible = worldIdx === 4;
        auroraGroup.visible = worldIdx === 2;
        lastSkyWorld = worldIdx;
      }
    }

    /* ------------------------------------------- Adorable Smooth Baby Dino */
    function buildHatGeo(hatId) {
      var b = new Builder();
      if (hatId === 'leaf') {
        b.add(P_CYL, 0, 0.14, 0, 0.07, 0.28, 0.07, 0, 0, 0.12, 0x3da843);
        b.add(P_SPHERE, 0.16, 0.28, 0.04, 0.34, 0.1, 0.18, 0.1, 0.25, 0.32, 0x5ee862, { top: 0x9bff75, bot: 0x2ba846 });
        b.add(P_SPHERE, -0.14, 0.25, -0.04, 0.28, 0.09, 0.16, -0.1, -0.25, -0.35, 0x48d454, { top: 0x85f76d, bot: 0x24913c });
      } else if (hatId === 'explorer') {
        b.add(P_CYL, 0, 0.05, 0, 0.88, 0.08, 0.82, 0, 0, -0.05, 0xe8c47a);
        b.add(P_SPHERE, 0, 0.16, 0, 0.62, 0.44, 0.58, 0, 0, 0, 0xf2d28b, { top: 0xffe6a8, bot: 0xcfa355 });
        b.add(P_CYL, 0, 0.11, 0, 0.64, 0.1, 0.6, 0, 0, 0, 0xd95638);
        b.add(P_SPHERE, 0, 0.38, 0, 0.11, 0.08, 0.11, 0, 0, 0, 0xd95638);
      } else if (hatId === 'party') {
        b.add(P_CONE, 0, 0.3, 0, 0.56, 0.64, 0.56, 0, 0, -0.08, 0x7c5cff, { top: 0xb18cff, bot: 0x5838d9 });
        b.add(P_TORUS, 0, 0.02, 0, 0.54, 0.54, 0.54, Math.PI * 0.5, 0, 0, 0xffd23f);
        b.add(P_SPHERE, 0.14, 0.22, 0.14, 0.11, 0.11, 0.11, 0, 0, 0, 0xffd23f, { glow: true });
        b.add(P_SPHERE, -0.12, 0.32, 0.12, 0.1, 0.1, 0.1, 0, 0, 0, 0x4df5d8, { glow: true });
        b.add(P_SPHERE, 0.04, 0.64, 0, 0.2, 0.2, 0.2, 0, 0, 0, 0xff5fa2, { glow: true });
      } else if (hatId === 'astronaut') {
        b.add(P_TORUS, 0.04, 0.02, 0, 0.78, 0.78, 0.78, Math.PI * 0.5, 0, 0, 0xeef5ff);
        b.add(P_SPHERE, 0.04, 0.1, 0, 0.76, 0.54, 0.74, 0, 0, 0, 0x8be2ff, { top: 0xd9f7ff, bot: 0x49b2f5 });
        b.add(P_CYL, -0.16, 0.42, 0, 0.05, 0.28, 0.05, 0, 0, 0.2, 0xdbe6f5);
        b.add(P_SPHERE, -0.2, 0.58, 0, 0.15, 0.15, 0.15, 0, 0, 0, 0xffe44d, { glow: true });
      } else if (hatId === 'crown') {
        b.add(P_CYL, 0, 0.12, 0, 0.58, 0.22, 0.56, 0, 0, 0, 0xffcc29, { top: 0xffe875, bot: 0xd99216 });
        for (var k = 0; k < 5; k++) {
          var ang = (k / 5) * Math.PI * 2;
          b.add(P_CONE, Math.cos(ang) * 0.22, 0.3, Math.sin(ang) * 0.22, 0.18, 0.24, 0.18, 0, 0, 0, 0xffd847, { flat: true });
        }
        b.add(P_OCT, 0.28, 0.14, 0, 0.12, 0.14, 0.12, 0, 0, 0, 0xff3b6e, { glow: true, flat: true });
        b.add(P_OCT, 0, 0.14, 0.28, 0.12, 0.14, 0.12, 0, 0, 0, 0x3bd4ff, { glow: true, flat: true });
        b.add(P_OCT, 0, 0.14, -0.28, 0.12, 0.14, 0.12, 0, 0, 0, 0x3bd4ff, { glow: true, flat: true });
      }
      return b.finish();
    }

    var hatGeoCache = {};
    function getHatGeo(hatId) {
      if (!hatGeoCache[hatId]) hatGeoCache[hatId] = buildHatGeo(hatId);
      return hatGeoCache[hatId];
    }

    // Smooth stylized low-poly dino rig (used for player AND cheering dino family!).
    function createDinoRig(colorDef, hatId, scale) {
      var c = colorDef.hex;
      var dark = shadeHex(c, 0.72);
      var light = shadeHex(c, 1.18);
      var belly = colorDef.belly;
      var crest = colorDef.crest;
      var ink = 0x1e2140;
      var cheek = 0xff7eb6;

      var root = new T.Group();
      var squash = new T.Group();
      var bodyGrp = new T.Group();
      root.add(squash);
      squash.add(bodyGrp);

      // 1. Chubby pear-shaped torso + warm cream belly + smooth dorsal crests
      var bTorso = new Builder();
      bTorso.add(P_SPHERE_HI, 0, 0.56, 0, 0.78, 0.84, 0.74, 0, 0, -0.18, c, { top: light, bot: dark });
      bTorso.add(P_SPHERE_HI, 0.17, 0.49, 0, 0.56, 0.62, 0.54, 0, 0, -0.16, belly, { top: 0xffffff, bot: shadeHex(belly, 0.88) });
      // Rounded teardrop crests along back
      bTorso.add(P_SPHERE, -0.28, 0.86, 0, 0.2, 0.24, 0.15, 0, 0, 0.4, crest);
      bTorso.add(P_SPHERE, -0.34, 0.64, 0, 0.18, 0.21, 0.14, 0, 0, 0.65, crest);
      var torsoMesh = new T.Mesh(bTorso.finish(), MATS);
      bodyGrp.add(torsoMesh);

      // 2. Expressive rounded head + chubby snout + glossy big eyes + cheek blushes
      var headPivot = new T.Group();
      headPivot.position.set(0.14, 0.96, 0);
      bodyGrp.add(headPivot);

      var bHead = new Builder();
      // Main rounded cranium
      bHead.add(P_SPHERE_HI, 0.04, 0.24, 0, 0.78, 0.72, 0.74, 0, 0, 0, c, { top: light, bot: dark });
      // Chubby rounded snout
      bHead.add(P_SPHERE_HI, 0.35, 0.17, 0, 0.58, 0.44, 0.56, 0, 0, -0.04, c, { top: light, bot: dark });
      // Cute nostrils
      bHead.add(P_SPHERE_LO, 0.6, 0.24, 0.11, 0.06, 0.06, 0.05, 0, 0, 0, dark);
      bHead.add(P_SPHERE_LO, 0.6, 0.24, -0.11, 0.06, 0.06, 0.05, 0, 0, 0, dark);
      // Rosy oval cheeks
      bHead.add(P_SPHERE_LO, 0.26, 0.08, 0.33, 0.16, 0.1, 0.08, 0, 0, 0, cheek);
      bHead.add(P_SPHERE_LO, 0.26, 0.08, -0.33, 0.16, 0.1, 0.08, 0, 0, 0, cheek);
      // Cute rounded head crests
      bHead.add(P_SPHERE, -0.22, 0.52, 0, 0.19, 0.22, 0.14, 0, 0, 0.32, crest);
      bHead.add(P_SPHERE, -0.04, 0.58, 0, 0.17, 0.19, 0.13, 0, 0, 0.1, crest);
      var headMesh = new T.Mesh(bHead.finish(), MATS);
      headPivot.add(headMesh);

      // Separate eye group so we can blink by squashing Y!
      var eyeGrp = new T.Group();
      var bEyes = new Builder();
      for (var s = -1; s <= 1; s += 2) {
        // Large glossy dark iris bulging slightly at front-side corner
        bEyes.add(P_SPHERE, 0.22, 0.3, s * 0.29, 0.24, 0.29, 0.17, 0, 0, 0, ink, { top: 0x353b6b, bot: 0x101326 });
        // Double bright sparkling catchlights (unlit glow!)
        bEyes.add(P_SPHERE_LO, 0.31, 0.36, s * 0.34, 0.085, 0.095, 0.06, 0, 0, 0, 0xffffff, { glow: true });
        bEyes.add(P_SPHERE_LO, 0.26, 0.23, s * 0.36, 0.048, 0.048, 0.04, 0, 0, 0, 0xffffff, { glow: true });
      }
      var eyeMesh = new T.Mesh(bEyes.finish(), MATS);
      eyeGrp.add(eyeMesh);
      headPivot.add(eyeGrp);

      // Articulated Lower Jaw (tucked seamlessly into snout, opens wide during Roar!)
      var jawPivot = new T.Group();
      jawPivot.position.set(0.2, 0.04, 0);
      var bJaw = new Builder();
      bJaw.add(P_SPHERE, 0.16, -0.02, 0, 0.44, 0.17, 0.44, 0, 0, 0, c, { top: light, bot: dark });
      bJaw.add(P_SPHERE_LO, 0.16, -0.07, 0, 0.34, 0.1, 0.32, 0, 0, 0, belly);
      // Cute pink tongue visible when jaw drops during Roar
      bJaw.add(P_SPHERE_LO, 0.18, 0.04, 0, 0.28, 0.07, 0.26, 0, 0, 0, 0xff6b8b, { glow: true });
      var jawMesh = new T.Mesh(bJaw.finish(), MATS);
      jawPivot.add(jawMesh);
      headPivot.add(jawPivot);

      // Hat anchor on top of head
      var hatAnchor = new T.Group();
      hatAnchor.position.set(0.02, 0.56, 0);
      var hatMesh = new T.Mesh(getHatGeo(hatId || 'none'), MATS);
      hatAnchor.add(hatMesh);
      headPivot.add(hatAnchor);

      // 3. Segmented wagging smooth tail (2 articulated segments with rounded blend joint!)
      var tail1 = new T.Group();
      tail1.position.set(-0.24, 0.38, 0);
      var bT1 = new Builder();
      bT1.add(P_CONE_TAPER, -0.22, 0.02, 0, 0.48, 0.56, 0.46, 0, 0, Math.PI * 0.46, c, { top: light, bot: dark });
      bT1.add(P_SPHERE, -0.45, 0.06, 0, 0.3, 0.3, 0.29, 0, 0, 0, c, { top: light, bot: dark });
      bT1.add(P_SPHERE, -0.22, 0.22, 0, 0.15, 0.17, 0.12, 0, 0, 0.4, crest);
      var t1Mesh = new T.Mesh(bT1.finish(), MATS);
      tail1.add(t1Mesh);

      var tail2 = new T.Group();
      tail2.position.set(-0.44, 0.06, 0);
      var bT2 = new Builder();
      bT2.add(P_CONE, -0.24, 0.06, 0, 0.29, 0.58, 0.28, 0, 0, Math.PI * 0.4, c, { top: light, bot: dark });
      bT2.add(P_SPHERE_LO, -0.5, 0.15, 0, 0.13, 0.13, 0.13, 0, 0, 0, crest);
      var t2Mesh = new T.Mesh(bT2.finish(), MATS);
      tail2.add(t2Mesh);
      tail1.add(tail2);
      bodyGrp.add(tail1);

      // 4. Bouncy rounded legs with cute white toe claws
      function makeLeg() {
        var pivot = new T.Group();
        var bL = new Builder();
        bL.add(P_SPHERE, 0, -0.12, 0, 0.28, 0.34, 0.26, 0, 0, 0, c, { top: light, bot: dark });
        bL.add(P_SPHERE, 0.08, -0.32, 0, 0.36, 0.18, 0.26, 0, 0, 0, dark);
        bL.add(P_SPHERE_LO, 0.23, -0.34, 0.06, 0.08, 0.07, 0.06, 0, 0, 0, 0xffffff);
        bL.add(P_SPHERE_LO, 0.23, -0.34, -0.06, 0.08, 0.07, 0.06, 0, 0, 0, 0xffffff);
        var m = new T.Mesh(bL.finish(), MATS);
        pivot.add(m);
        return { pivot: pivot, mesh: m };
      }
      var legL = makeLeg(), legR = makeLeg();
      legL.pivot.position.set(0.02, 0.39, 0.22);
      legR.pivot.position.set(0.02, 0.39, -0.22);
      bodyGrp.add(legL.pivot, legR.pivot);

      // 5. Tiny cute pumping arms
      function makeArm() {
        var pivot = new T.Group();
        var bA = new Builder();
        bA.add(P_SPHERE, 0.1, -0.03, 0, 0.24, 0.14, 0.14, 0, 0, -0.25, c, { top: light, bot: dark });
        bA.add(P_SPHERE_LO, 0.21, -0.05, 0, 0.07, 0.07, 0.08, 0, 0, 0, 0xffffff);
        var m = new T.Mesh(bA.finish(), MATS);
        pivot.add(m);
        return { pivot: pivot, mesh: m };
      }
      var armL = makeArm(), armR = makeArm();
      armL.pivot.position.set(0.28, 0.68, 0.31);
      armR.pivot.position.set(0.28, 0.68, -0.31);
      bodyGrp.add(armL.pivot, armR.pivot);

      root.scale.setScalar(scale || 1.0);
      var ownedGeos = [torsoMesh.geometry, headMesh.geometry, eyeMesh.geometry, jawMesh.geometry, t1Mesh.geometry, t2Mesh.geometry, legL.mesh.geometry, legR.mesh.geometry, armL.mesh.geometry, armR.mesh.geometry];
      var allMeshes = [torsoMesh, headMesh, eyeMesh, jawMesh, t1Mesh, t2Mesh, legL.mesh, legR.mesh, armL.mesh, armR.mesh, hatMesh];

      return {
        root: root, squash: squash, body: bodyGrp, head: headPivot, eyes: eyeGrp, jaw: jawPivot,
        tail1: tail1, tail2: tail2, legL: legL.pivot, legR: legR.pivot, armL: armL.pivot, armR: armR.pivot,
        hat: hatMesh, meshes: allMeshes,
        setFlash: function (on) {
          var m = on ? FLASH_MATS : MATS;
          for (var i = 0; i < allMeshes.length; i++) allMeshes[i].material = m;
        },
        dispose: function () {
          for (var i = 0; i < ownedGeos.length; i++) ownedGeos[i].dispose();
        }
      };
    }

    var playerRig = null;
    var playerColorIdx = 0, playerHatIdx = 0;
    function rebuildPlayer(cIdx, hIdx) {
      playerColorIdx = cIdx;
      playerHatIdx = hIdx;
      if (playerRig) {
        scene.remove(playerRig.root);
        playerRig.dispose();
      }
      playerRig = createDinoRig(D.COLORS[cIdx] || D.COLORS[0], (D.HATS[hIdx] || D.HATS[0]).id, 1.04);
      scene.add(playerRig.root);
    }
    rebuildPlayer(0, 0);

    // Expanding glowing 3D Sonic Roar Rings!
    var roarGroup = new T.Group();
    var roarRings = [];
    var roarColors = [0xfff48f, 0xffae33, 0xff5e45];
    for (var rr = 0; rr < 3; rr++) {
      var rg = new T.TorusGeometry(0.65 + rr * 0.25, 0.085 - rr * 0.014, 7, 18);
      rg.rotateY(Math.PI * 0.5);
      var rm = new T.Mesh(rg, new T.MeshBasicMaterial({ color: roarColors[rr], transparent: true, opacity: 0.9 }));
      roarGroup.add(rm);
      roarRings.push(rm);
    }
    roarGroup.visible = false;
    scene.add(roarGroup);

    /* ----------------------------------------- Stylized Low-Poly Obstacles */
    var obGeoCache = {};
    function getObstacleGeo(worldIdx, kind, variant) {
      var key = worldIdx + ':' + kind + ':' + (variant || 0);
      if (obGeoCache[key]) return obGeoCache[key];
      var b = new Builder();
      var pal = PALETTES[worldIdx % PALETTES.length];

      if (kind === 'crate') {
        // Stylized chunky wooden crate with dark beams & glowing golden star emblem
        b.add(P_BOX, 0, 0.62, 0, 1.12, 1.18, 1.12, 0, 0, 0, 0xe8a445, { flat: true, top: 0xffc66b, bot: 0xb87228 });
        b.add(P_BOX, 0, 1.18, 0, 1.2, 0.14, 1.2, 0, 0, 0, 0x8f501e, { flat: true });
        b.add(P_BOX, 0, 0.08, 0, 1.2, 0.14, 1.2, 0, 0, 0, 0x8f501e, { flat: true });
        b.add(P_BOX, 0, 0.62, 0, 1.18, 0.14, 1.18, 0, 0, 0.65, 0xa86026, { flat: true });
        b.add(P_OCT, 0, 0.64, 0.59, 0.34, 0.34, 0.12, 0, 0, 0, 0xffe84d, { glow: true, flat: true });
        b.add(P_OCT, -0.59, 0.64, 0, 0.12, 0.34, 0.34, 0, 0, 0, 0xffe84d, { glow: true, flat: true });
      } else if (kind === 'boulder') {
        // Faceted cracked boulder with glowing amber/cyan energy core cracks!
        var stoneCol = worldIdx === 2 ? 0x9ec6eb : worldIdx === 3 ? 0x4b4057 : worldIdx === 4 ? 0xd9a8ff : 0x9e8c7a;
        var crackCol = worldIdx === 2 ? 0x57ffe6 : worldIdx === 3 ? 0xff7729 : 0xffe047;
        b.add(P_ICO, 0, 0.7, 0, 1.46, 1.38, 1.38, 0.2, variant * 0.9, 0.15, stoneCol, { flat: true });
        b.add(P_ICO, -0.34, 0.34, 0.26, 0.72, 0.62, 0.66, 0.4, 0.6, 0, shadeHex(stoneCol, 0.85), { flat: true });
        b.add(P_OCT, 0.05, 0.76, 0.52, 0.36, 0.74, 0.28, 0.1, 0.2, 0.38, crackCol, { glow: true, flat: true });
        b.add(P_OCT, -0.42, 0.74, 0.15, 0.26, 0.64, 0.36, 0.2, 0.5, -0.35, crackCol, { glow: true, flat: true });
      } else if (kind === 'pad') {
        // Bouncy bright spring mushroom!
        var capCol = worldIdx === 2 ? 0x38d4ff : worldIdx === 3 ? 0xff7729 : 0xff4778;
        b.add(P_CYL, 0, 0.18, 0, 0.52, 0.36, 0.52, 0, 0, 0, 0xfff0cc, { top: 0xfff8e6, bot: 0xd9be8c });
        b.add(P_SPHERE_HI, 0, 0.42, 0, 1.46, 0.52, 1.38, 0, 0, 0, capCol, { top: shadeHex(capCol, 1.25), bot: shadeHex(capCol, 0.75) });
        b.add(P_SPHERE_LO, 0.36, 0.58, 0.26, 0.24, 0.12, 0.24, 0, 0, -0.3, 0xfffbe0, { glow: true });
        b.add(P_SPHERE_LO, -0.32, 0.59, -0.22, 0.26, 0.12, 0.26, 0, 0, 0.28, 0xfffbe0, { glow: true });
        b.add(P_SPHERE_LO, 0, 0.66, 0.04, 0.28, 0.1, 0.28, 0, 0, 0, 0xfffbe0, { glow: true });
      } else if (kind === 'arch') {
        // High-contrast spanning low arch (clear tunnel y = 0..0.92 underneath!)
        var pillarCol = worldIdx === 0 ? 0xd96b38 : worldIdx === 1 ? 0x6b8f5e : worldIdx === 2 ? 0x7bc8f5 : worldIdx === 3 ? 0x453452 : 0xff82c4;
        var topCol = worldIdx === 0 ? 0xf29b4b : worldIdx === 1 ? 0x4cd158 : worldIdx === 2 ? 0xdbf4ff : worldIdx === 3 ? 0xff6229 : 0xffe45e;
        // Front & back pillars straddling the path (outside z = +-1.15 so dino runs cleanly between!)
        b.add(P_CYL, 0, 1.15, -1.28, 0.75, 2.3, 0.75, 0, 0, 0, pillarCol, { flat: true });
        b.add(P_CYL, 0, 1.15, 1.28, 0.75, 2.3, 0.75, 0, 0, 0, pillarCol, { flat: true });
        // Thick overhanging lintel spanning y = 1.05 .. 2.35 (visual clearance cleanly matches 0.88 hitbox!)
        b.add(P_BOX, 0, 1.66, 0, 1.95, 1.22, 3.05, 0, 0, 0, pillarCol, { flat: true, top: topCol, bot: shadeHex(pillarCol, 0.72) });
        // Bright warning stripe along bottom front edge so duck zone reads instantly!
        b.add(P_BOX, 0, 1.1, 0, 2.02, 0.18, 2.95, 0, 0, 0, topCol, { glow: true });
        // Cute top cap ornament (foliage/snow/lava crest/flowers)
        b.add(P_SPHERE, 0, 2.36, 0, 1.6, 0.56, 2.4, 0, 0, 0, topCol);
      } else if (kind === 'low' || kind === 'tall') {
        var tall = kind === 'tall';
        var h = tall ? 1.85 : 1.05;
        if (worldIdx === 0) {
          // Smooth fluted desert cactus with rosy flower crown!
          var cg = 0x32bd58;
          b.add(P_CYL, 0, h * 0.5, 0, 0.54, h, 0.54, 0, 0, 0, cg, { top: 0x5ae074, bot: 0x228c40 });
          b.add(P_SPHERE, 0, h, 0, 0.54, 0.42, 0.54, 0, 0, 0, 0x52db6d);
          b.add(P_SPHERE_LO, 0, h + 0.22, 0, 0.28, 0.22, 0.28, 0, 0, 0, 0xff629e, { glow: true });
          // Smooth side arms
          b.add(P_CYL, 0.36, h * 0.56, 0, 0.24, 0.36, 0.24, 0, 0, Math.PI * 0.5, cg);
          b.add(P_CYL, 0.46, h * 0.56 + 0.24, 0, 0.24, 0.48, 0.24, 0, 0, 0, cg);
          b.add(P_SPHERE_LO, 0.46, h * 0.56 + 0.48, 0, 0.24, 0.2, 0.24, 0, 0, 0, 0x52db6d);
          if (tall) {
            b.add(P_CYL, -0.36, h * 0.42, 0, 0.24, 0.36, 0.24, 0, 0, Math.PI * 0.5, cg);
            b.add(P_CYL, -0.46, h * 0.42 + 0.28, 0, 0.24, 0.54, 0.24, 0, 0, 0, cg);
            b.add(P_SPHERE_LO, -0.46, h * 0.42 + 0.54, 0, 0.24, 0.2, 0.24, 0, 0, 0, 0x52db6d);
          }
        } else if (worldIdx === 1) {
          // Jungle mossy totem or blossoming stump
          var wood = 0x8f5a30;
          b.add(P_CYL, 0, h * 0.5, 0, 0.68, h, 0.68, 0, 0, 0, wood, { top: 0xb57745, bot: 0x633c1e });
          b.add(P_SPHERE, 0, h, 0, 0.78, 0.36, 0.78, 0, 0, 0, 0x4cd158);
          if (tall) {
            // Glowing jungle totem eyes!
            b.add(P_SPHERE_LO, -0.32, h * 0.65, 0.14, 0.14, 0.14, 0.14, 0, 0, 0, 0x4df5d8, { glow: true });
            b.add(P_SPHERE_LO, -0.32, h * 0.65, -0.14, 0.14, 0.14, 0.14, 0, 0, 0, 0x4df5d8, { glow: true });
          } else {
            b.add(P_SPHERE_LO, 0.18, h + 0.14, 0.18, 0.26, 0.22, 0.26, 0, 0, 0, 0xff5e94);
          }
        } else if (worldIdx === 2) {
          if (tall) {
            // Faceted glowing crystal ice spire
            b.add(P_CONE, 0, h * 0.5, 0, 0.76, h, 0.76, 0, 0, 0, 0x69d4ff, { flat: true, top: 0xe6fbff, bot: 0x3b96e0 });
            b.add(P_CONE, 0.32, h * 0.26, 0.22, 0.42, h * 0.52, 0.42, 0.15, 0, -0.25, 0x9ee8ff, { flat: true });
          } else {
            // Cute smiling rounded Snowman!
            b.add(P_SPHERE, 0, 0.36, 0, 0.76, 0.72, 0.76, 0, 0, 0, 0xf2f9ff);
            b.add(P_SPHERE, 0, 0.86, 0, 0.52, 0.5, 0.52, 0, 0, 0, 0xffffff);
            b.add(P_CONE, -0.28, 0.86, 0, 0.12, 0.28, 0.12, 0, 0, Math.PI * 0.5, 0xff7b29);
            b.add(P_TORUS, 0, 0.64, 0, 0.46, 0.46, 0.46, Math.PI * 0.5, 0, 0, 0xff4b6e);
          }
        } else if (worldIdx === 3) {
          // Jagged volcanic obsidian crystal spire with glowing magma core!
          b.add(P_CONE, 0, h * 0.5, 0, 0.82, h, 0.82, 0, 0, 0, 0x382c45, { flat: true, top: 0x5c476e, bot: 0x22192e });
          b.add(P_OCT, 0, h * 0.48, 0, 0.48, h * 0.65, 0.48, 0, 0.4, 0, 0xff6b29, { glow: true, flat: true });
          if (tall) b.add(P_CONE, -0.34, h * 0.25, 0.22, 0.44, h * 0.55, 0.44, 0.2, 0, 0.3, 0x382c45, { flat: true });
        } else {
          // Royal Nest pastel crystal / candy cluster
          var pCol = tall ? 0xb37aff : 0xff72b6;
          b.add(P_CONE, 0, h * 0.5, 0, 0.74, h, 0.74, 0, 0, 0, pCol, { flat: true, top: 0xfff0ff, bot: shadeHex(pCol, 0.75) });
          b.add(P_OCT, 0, h + 0.1, 0, 0.36, 0.36, 0.36, 0, 0, 0, 0xffe44d, { glow: true, flat: true });
          b.add(P_SPHERE_LO, 0.34, 0.28, 0.22, 0.42, 0.38, 0.42, 0, 0, 0, pal.accent);
        }
      }
      var geo = b.finish();
      obGeoCache[key] = geo;
      return geo;
    }

    // Swooping Animated Pterosaur (body + articulated flapping wings!).
    var flyerBodyGeos = {}, flyerWingGeos = {};
    function getFlyerRig(worldIdx) {
      var bodyCol = worldIdx === 0 ? 0xff9f38 : worldIdx === 1 ? 0x38d48c : worldIdx === 2 ? 0x5cc8ff : worldIdx === 3 ? 0xff523b : 0xff72c6;
      var wingCol = shadeHex(bodyCol, 1.18);
      if (!flyerBodyGeos[worldIdx]) {
        var bb = new Builder();
        // Sleek aerodynamic body & beak pointing -X (toward dino!)
        bb.add(P_SPHERE, 0, 0, 0, 0.86, 0.42, 0.44, 0, 0, 0, bodyCol);
        bb.add(P_CONE, -0.58, 0.04, 0, 0.24, 0.58, 0.22, 0, 0, Math.PI * 0.52, 0xffd23f);
        bb.add(P_CONE, 0.28, 0.24, 0, 0.22, 0.44, 0.16, 0, 0, -0.9, shadeHex(bodyCol, 0.75));
        bb.add(P_SPHERE_LO, -0.24, 0.12, 0.16, 0.14, 0.14, 0.1, 0, 0, 0, 0x1e2140);
        bb.add(P_SPHERE_LO, -0.24, 0.12, -0.16, 0.14, 0.14, 0.1, 0, 0, 0, 0x1e2140);
        bb.add(P_SPHERE_LO, -0.28, 0.15, 0.19, 0.055, 0.055, 0.04, 0, 0, 0, 0xffffff, { glow: true });
        bb.add(P_SPHERE_LO, -0.28, 0.15, -0.19, 0.055, 0.055, 0.04, 0, 0, 0, 0xffffff, { glow: true });
        flyerBodyGeos[worldIdx] = bb.finish();

        var bw = new Builder();
        bw.add(P_BOX, 0, 0, 0.46, 0.56, 0.07, 0.92, 0, 0.2, 0, wingCol, { flat: true });
        bw.add(P_CONE, 0.06, 0, 1.02, 0.36, 0.46, 0.08, Math.PI * 0.5, 0, 0, shadeHex(bodyCol, 0.85), { flat: true });
        flyerWingGeos[worldIdx] = bw.finish();
      }
      var g = new T.Group();
      var body = new T.Mesh(flyerBodyGeos[worldIdx], MATS);
      var wL = new T.Mesh(flyerWingGeos[worldIdx], MATS);
      var wR = new T.Mesh(flyerWingGeos[worldIdx], MATS);
      wR.scale.z = -1;
      g.add(body, wL, wR);
      g.userData.wL = wL;
      g.userData.wR = wR;
      return g;
    }

    /* -------------------------------------- Curved-Horizon World Chunks */
    var CHUNK_LEN = 18;
    var activeChunks = new Map();
    var chunkGroup = new T.Group();
    scene.add(chunkGroup);

    function addPalmTo(b, x, y, z, h, leanX, leanZ) {
      for (var i = 0; i < 4; i++) {
        var u = i / 4;
        b.add(P_CYL, x + leanX * u * u, y + (i + 0.5) * (h / 4), z + leanZ * u * u, 0.44 - u * 0.14, h / 4 + 0.12, 0.44 - u * 0.14, 0, 0, -leanX * 0.08, i % 2 ? 0x9c6236 : 0xb37444);
      }
      var tx = x + leanX, ty = y + h, tz = z + leanZ;
      for (var f = 0; f < 6; f++) {
        var a = (f / 6) * Math.PI * 2;
        b.add(P_SPHERE, tx + Math.cos(a) * 1.15, ty + 0.1, tz + Math.sin(a) * 1.15, 1.85, 0.24, 0.65, 0, -a, -0.35, f % 2 ? 0x3ec952 : 0x5be364);
      }
      b.add(P_SPHERE_LO, tx + 0.2, ty - 0.25, tz + 0.2, 0.34, 0.34, 0.34, 0, 0, 0, 0x6b3e1f);
    }

    function addPineTo(b, x, y, z, h) {
      b.add(P_CYL, x, y + 0.6, z, 0.42, 1.2, 0.42, 0, 0, 0, 0x7d4f2c);
      b.add(P_CONE, x, y + h * 0.38, z, h * 0.55, h * 0.46, h * 0.55, 0, 0, 0, 0x2d8a68);
      b.add(P_CONE, x, y + h * 0.64, z, h * 0.42, h * 0.42, h * 0.42, 0, 0, 0, 0x3da37d);
      b.add(P_CONE, x, y + h * 0.85, z, h * 0.28, h * 0.34, h * 0.28, 0, 0, 0, 0xf0f9ff);
    }

    function buildChunk(ci, worldIdx) {
      var pal = PALETTES[worldIdx % PALETTES.length];
      var rng = D.makeRng((ci * 73856093) ^ ((worldIdx + 1) * 19349663) ^ 991);
      var b = new Builder();

      // Main sculpted running road (beveled deck + warm side embankment + vibrant curbs).
      b.add(P_BOX, 0, -0.55, 0, CHUNK_LEN, 1.1, 3.6, 0, 0, 0, pal.pathSide, { flat: true, top: pal.pathTop, bot: shadeHex(pal.pathSide, 0.72) });
      b.add(P_BOX, 0, -0.02, -1.92, CHUNK_LEN, 0.22, 0.38, 0, 0, 0, pal.curb, { flat: true });
      b.add(P_BOX, 0, -0.02, 1.92, CHUNK_LEN, 0.22, 0.38, 0, 0, 0, pal.curb, { flat: true });
      // Wide gently sloped side apron (creates curved horizon feel on left & right of path).
      b.add(P_BOX, 0, -1.0, -10.5, CHUNK_LEN, 1.3, 17.5, 0.05, 0, 0, pal.ground, { flat: true });
      b.add(P_BOX, 0, -1.2, 6.2, CHUNK_LEN, 1.3, 8.6, -0.08, 0, 0, pal.ground, { flat: true });

      // Stepping pebbles along the path for crisp speed sensation!
      for (var st = 0; st < 6; st++) {
        var sx = -CHUNK_LEN * 0.44 + st * (CHUNK_LEN / 6) + (rng() - 0.5) * 0.8;
        var sz = (rng() - 0.5) * 2.2;
        b.add(P_SPHERE_LO, sx, 0.01, sz, 0.58, 0.05, 0.42, 0, rng() * 3, 0, shadeHex(pal.pathTop, 0.9));
      }

      // Rolling background hills + world-specific hero props!
      var hillX = (rng() - 0.5) * 6;
      b.add(P_SPHERE, hillX, -1.6, -11.5 - rng() * 4, 15 + rng() * 6, 6.5 + rng() * 3.5, 11, 0, 0, 0, pal.hillA);

      if (worldIdx === 0) {
        // Golden Desert: sweeping dunes, stylized fluted cacti, flat-top mesas, dino fossils!
        b.add(P_SPHERE, (rng() - 0.5) * 8, -1.3, -6.5, 9.5, 3.2, 6.5, 0, 0, 0, 0xf5be62);
        // Flat-top desert mesa
        var mx = -3 + rng() * 6;
        b.add(P_CONE_TAPER, mx, 1.9, -12.5 - rng() * 3, 7.6, 5.2, 5.8, 0, rng(), 0, 0xd96b38, { flat: true, top: 0xf09648, bot: 0xb34b26 });
        // Background saguaro cactus with connected elbows & blossom
        var cx = (rng() - 0.5) * 12, cz = -4.2 - rng() * 2.6;
        b.add(P_CYL, cx, 1.3, cz, 0.56, 2.6, 0.56, 0, 0, 0, 0x32bd58, { top: 0x5ae074, bot: 0x228c40 });
        b.add(P_SPHERE_LO, cx, 2.6, cz, 0.56, 0.45, 0.56, 0, 0, 0, 0x52db6d);
        b.add(P_SPHERE_LO, cx, 2.84, cz, 0.28, 0.22, 0.28, 0, 0, 0, 0xff629e, { glow: true });
        b.add(P_CYL, cx + 0.36, 1.45, cz, 0.26, 0.44, 0.26, 0, 0, Math.PI * 0.5, 0x32bd58);
        b.add(P_CYL, cx + 0.54, 1.76, cz, 0.26, 0.68, 0.26, 0, 0, 0, 0x32bd58);
        b.add(P_SPHERE_LO, cx + 0.54, 2.1, cz, 0.26, 0.22, 0.26, 0, 0, 0, 0x52db6d);
        b.add(P_CYL, cx - 0.34, 1.15, cz, 0.24, 0.4, 0.24, 0, 0, Math.PI * 0.5, 0x32bd58);
        b.add(P_CYL, cx - 0.5, 1.44, cz, 0.24, 0.6, 0.24, 0, 0, 0, 0x32bd58);
        b.add(P_SPHERE_LO, cx - 0.5, 1.74, cz, 0.24, 0.2, 0.24, 0, 0, 0, 0x52db6d);
        // Dino ribcage fossil arch on alternate chunks!
        if (Math.abs(ci) % 2 === 1) {
          var fx = (rng() - 0.5) * 6;
          for (var rib = 0; rib < 3; rib++) {
            b.add(P_TORUS, fx + rib * 0.9, 0.1, -5.2, 1.7, 1.7, 1.2, 0, 0.2, 0, 0xfff4d9);
          }
        }
      } else if (worldIdx === 1) {
        // Lush Jungle: curved palms, giant ferns, mossy ruins, shimmering waterfalls!
        addPalmTo(b, -5 + rng() * 4, -0.2, -4.6 - rng() * 2, 4.4 + rng() * 1.4, (rng() - 0.5) * 1.4, 0.5);
        addPalmTo(b, 3 + rng() * 4, -0.2, -5.5 - rng() * 2, 4.0 + rng() * 1.4, (rng() - 0.5) * 1.4, -0.3);
        // Giant fern bush near track edge
        var fnx = (rng() - 0.5) * 10;
        for (var fl = 0; fl < 4; fl++) {
          var fa = fl * 1.57 + 0.4;
          b.add(P_SPHERE, fnx + Math.cos(fa) * 0.6, 0.4, -3.2 + Math.sin(fa) * 0.5, 1.3, 0.24, 0.55, 0, -fa, 0.35, 0x3ed15c);
        }
        // Waterfall cliff or mossy stone ruin
        if (Math.abs(ci) % 2 === 0) {
          b.add(P_BOX, 1, 2.2, -13.5, 6.2, 6.2, 4.4, 0, 0.15, 0, 0x5c7a5e, { flat: true });
          b.add(P_BOX, 1, 2.0, -11.1, 2.2, 5.8, 0.55, 0, 0.15, 0, 0x5ce8ff, { glow: true });
          b.add(P_SPHERE, 1, -0.3, -10.5, 3.2, 0.9, 2.2, 0, 0, 0, 0xb8f8ff, { glow: true });
        } else {
          b.add(P_CYL, 2, 1.4, -7.8, 0.9, 2.8, 0.9, 0, 0, 0.12, 0x8ea38b, { flat: true });
          b.add(P_CYL, 4.6, 1.2, -7.8, 0.9, 2.4, 0.9, 0, 0, -0.06, 0x8ea38b, { flat: true });
          b.add(P_BOX, 3.3, 2.6, -7.8, 3.8, 0.65, 1.1, 0, 0, -0.06, 0x769473, { flat: true });
        }
      } else if (worldIdx === 2) {
        // Snowy Peaks: snow-capped icy pines, aurora crystals, cozy glowing igloos!
        addPineTo(b, -5 + rng() * 3, -0.2, -4.8 - rng() * 2.5, 4.2 + rng() * 1.5);
        addPineTo(b, 4 + rng() * 3, -0.2, -5.8 - rng() * 2.5, 4.8 + rng() * 1.6);
        // Glowing aurora crystal cluster
        var ax = (rng() - 0.5) * 8;
        b.add(P_CONE, ax, 0.9, -4.4, 0.72, 1.9, 0.72, 0.1, 0.4, 0.18, 0x58ffe6, { glow: true, flat: true });
        b.add(P_CONE, ax + 0.45, 0.65, -4.1, 0.48, 1.3, 0.48, -0.1, 0.2, -0.25, 0xb08cff, { glow: true, flat: true });
        // Cozy igloo with warm glowing doorway
        if (Math.abs(ci) % 2 === 1) {
          var ix = (rng() - 0.5) * 5;
          b.add(P_SPHERE, ix, 0.2, -7.6, 3.8, 2.7, 3.8, 0, 0, 0, 0xedf7ff);
          b.add(P_CYL, ix, 0.5, -5.8, 1.1, 1.1, 1.1, Math.PI * 0.5, 0, 0, 0xd4ebff);
          b.add(P_SPHERE_LO, ix, 0.48, -5.3, 0.75, 0.75, 0.4, 0, 0, 0, 0xffc857, { glow: true });
        }
      } else if (worldIdx === 3) {
        // Volcano Valley: glowing lava river beside track, obsidian arches, fiery cones!
        b.add(P_BOX, 0, -0.32, -5.4, CHUNK_LEN, 0.22, 3.4, 0, 0, 0, 0xff6229, { glow: true });
        b.add(P_BOX, 0, -0.28, -5.4, CHUNK_LEN, 0.24, 1.4, 0, 0, 0, 0xffd24d, { glow: true });
        // Smoking volcanic peak in back
        var vx = (rng() - 0.5) * 6;
        b.add(P_CONE_TAPER, vx, 2.8, -13.5, 8.8, 6.8, 8.4, 0, 0, 0, 0x45314d, { flat: true, top: 0x6b4561, bot: 0x2b1e33 });
        b.add(P_SPHERE_LO, vx, 6.1, -13.5, 2.2, 0.8, 2.2, 0, 0, 0, 0xff7729, { glow: true });
        // Dramatic obsidian arch spanning the lava river
        if (Math.abs(ci) % 2 === 0) {
          b.add(P_TORUS, 2, 0.2, -5.5, 5.4, 5.4, 2.6, 0, 0.35, 0, 0x342640, { flat: true });
        }
      } else {
        // Royal Nest / Rainbow Valley: pastel hills, giant crystal eggs, joyous starburst trees!
        var treeCol = ci % 2 ? 0xff7ec6 : 0x6be8ff;
        b.add(P_CYL, -4.5, 1.2, -5.2, 0.46, 2.4, 0.46, 0, 0, 0, 0xd48e66);
        b.add(P_SPHERE, -4.5, 2.8, -5.2, 2.4, 2.2, 2.4, 0, 0, 0, treeCol);
        b.add(P_SPHERE, 4.8, 1.1, -6.2, 2.2, 2.0, 2.2, 0, 0, 0, 0xffe46b);
        // Giant sparkling pastel crystal egg landmark!
        b.add(P_EGG, 1.2, 1.2, -5.4, 2.2, 2.3, 2.2, 0, 0.4, 0.08, ci % 2 ? 0x9bf5ff : 0xffb3e6, { glow: true });
        // Festive pennant pole beside track
        b.add(P_CYL, -1.5, 1.3, -2.5, 0.14, 2.6, 0.14, 0, 0, 0, 0xfff5d6);
        b.add(P_CONE, -1.5, 2.4, -2.5, 0.72, 0.58, 0.12, 0, 0, -Math.PI * 0.5, 0xff5e94, { glow: true });
      }

      // Cute foreground edge detail (tiny rock/tuft passing in front of track for rich 3D depth)
      var fgX = (rng() - 0.5) * 12;
      b.add(P_SPHERE_LO, fgX, -0.05, 2.65, 0.75, 0.42, 0.65, 0, 0, 0, pal.accent);

      var m = new T.Mesh(b.finish(), MATS);
      m.position.x = ci * CHUNK_LEN;
      return { mesh: m, ci: ci, worldIdx: worldIdx };
    }

    function syncChunks(camX, worldFn, forceAll) {
      var minC = Math.floor((camX - 24) / CHUNK_LEN);
      var maxC = Math.floor((camX + 66) / CHUNK_LEN);
      activeChunks.forEach(function (ch, key) {
        if (ch.ci < minC - 1 || ch.ci > maxC + 1) {
          chunkGroup.remove(ch.mesh);
          ch.mesh.geometry.dispose();
          activeChunks.delete(key);
        }
      });
      var built = 0;
      for (var ci = minC; ci <= maxC; ci++) {
        var wIdx = worldFn(ci * CHUNK_LEN);
        var key = ci + ':' + wIdx;
        if (!activeChunks.has(key)) {
          var ch = buildChunk(ci, wIdx);
          chunkGroup.add(ch.mesh);
          activeChunks.set(key, ch);
          built++;
          if (!forceAll && built >= 1) break;
        }
      }
    }

    /* ------------------------------- Far Curved-Horizon Clouds & Silhouettes */
    var cloudGroup = new T.Group();
    scene.add(cloudGroup);
    var cloudGeo = (function () {
      var b = new Builder();
      b.add(P_SPHERE, 0, 0.3, 0, 2.8, 1.6, 1.9, 0, 0, 0, 0xffffff, { top: 0xffffff, bot: 0xe6f0ff });
      b.add(P_SPHERE, -1.2, 0, 0.1, 1.9, 1.2, 1.5, 0, 0, 0, 0xffffff, { top: 0xffffff, bot: 0xe6f0ff });
      b.add(P_SPHERE, 1.25, -0.05, -0.1, 1.85, 1.15, 1.4, 0, 0, 0, 0xffffff, { top: 0xffffff, bot: 0xe6f0ff });
      return b.finish();
    })();
    var clouds = [];
    for (var cl = 0; cl < 10; cl++) {
      var cm = new T.Mesh(cloudGeo, MATS);
      var cs = 1.1 + (cl % 3) * 0.55;
      cm.scale.set(cs, cs * 0.82, cs);
      cloudGroup.add(cm);
      clouds.push({ mesh: cm, off: cl * 16 - 30, y: 11 + (cl % 4) * 2.8, z: -26 - (cl % 3) * 14, speed: 0.4 + (cl % 3) * 0.2 });
    }

    /* ----------------------------------------- Family Reunion Finish Nest */
    var nestGroup = new T.Group();
    var nestBase = (function () {
      var b = new Builder();
      // Cozy woven circular giant nest
      b.add(P_TORUS, 0, 0.34, 0, 3.4, 3.4, 2.2, Math.PI * 0.5, 0, 0, 0xc4813d, { top: 0xe8a85a, bot: 0x7d4b1e });
      b.add(P_CYL, 0, 0.16, 0, 3.1, 0.32, 3.1, 0, 0, 0, 0xffe49e);
      // Giant decorative celebration eggs inside the nest
      b.add(P_EGG, 0.55, 0.52, -0.35, 0.85, 0.9, 0.85, 0.1, 0, -0.15, 0x78e8ff, { glow: true });
      b.add(P_EGG, -0.45, 0.48, 0.45, 0.78, 0.82, 0.78, -0.1, 0, 0.15, 0xff8ed4, { glow: true });
      // Celebratory finish gate banner poles
      b.add(P_CYL, -1.5, 1.9, -1.85, 0.22, 3.8, 0.22, 0, 0, 0, 0xfff5d6);
      b.add(P_CYL, -1.5, 1.9, 1.85, 0.22, 3.8, 0.22, 0, 0, 0, 0xfff5d6);
      b.add(P_BOX, -1.5, 3.55, 0, 0.28, 0.56, 3.9, 0, 0, 0, 0xff5e8e, { glow: true });
      return new T.Mesh(b.finish(), MATS);
    })();
    nestGroup.add(nestBase);

    // Cheering Dino Family (Mama, Papa, and adorable Sibling!) waiting at the finish nest!
    var familyRigs = [
      createDinoRig(D.COLORS[2], 'crown', 1.28),    // Mama Dino (Berry Pink + Crown)
      createDinoRig(D.COLORS[1], 'explorer', 1.32), // Papa Dino (Sky Blue + Explorer)
      createDinoRig(D.COLORS[3], 'party', 0.78)     // Baby Sibling (Sun Gold + Party)
    ];
    familyRigs[0].root.position.set(1.3, 0.2, -0.95);
    familyRigs[0].root.rotation.y = Math.PI - 0.35;
    familyRigs[1].root.position.set(1.6, 0.2, 0.85);
    familyRigs[1].root.rotation.y = Math.PI + 0.35;
    familyRigs[2].root.position.set(0.3, 0.25, -0.05);
    familyRigs[2].root.rotation.y = Math.PI;
    for (var fr = 0; fr < familyRigs.length; fr++) nestGroup.add(familyRigs[fr].root);
    nestGroup.visible = false;
    scene.add(nestGroup);

    /* ----------------------------------------- Pooled InstancedMesh Systems */
    function makeEggInstGeo(baseHex, spotA, spotB, glow) {
      var b = new Builder();
      b.add(P_EGG, 0, 0, 0, 0.72, 0.76, 0.72, 0, 0, 0, baseHex, { glow: glow });
      if (spotA != null) {
        b.add(P_SPHERE_LO, 0.22, 0.08, 0.14, 0.16, 0.16, 0.16, 0, 0, 0, spotA);
        b.add(P_SPHERE_LO, -0.2, -0.08, 0.18, 0.18, 0.18, 0.18, 0, 0, 0, spotB);
        b.add(P_SPHERE_LO, 0.04, -0.1, -0.24, 0.17, 0.17, 0.17, 0, 0, 0, spotA);
      }
      return b.finish();
    }

    var instEggs = new T.InstancedMesh(makeEggInstGeo(0xfff6db, 0x38b6ff, 0xff6ba9, false), MATS, 64);
    var instGold = new T.InstancedMesh(makeEggInstGeo(0xffd23f, 0xfff8b2, 0xff9f29, true), MATS, 24);
    var instRainbow = new T.InstancedMesh(P_EGG, new T.MeshLambertMaterial({ color: 0xffffff, emissive: 0x332244, emissiveIntensity: 0.35 }), 48);
    var instHearts = new T.InstancedMesh(P_HEART, new T.MeshBasicMaterial({ color: 0xff4b7a }), 8);
    var instShadows = new T.InstancedMesh(new T.CircleGeometry(0.55, 12).rotateX(-Math.PI * 0.5), MAT_SHADOW, 96);
    var instParts = new T.InstancedMesh(P_ICO, MAT_INST_GLOW, 120);
    var instMotes = new T.InstancedMesh(P_SPHERE_LO, MAT_INST_GLOW, 36);

    [instEggs, instGold, instRainbow, instHearts, instShadows, instParts, instMotes].forEach(function (im) {
      im.frustumCulled = false;
      im.count = 0;
      scene.add(im);
    });
    // Pre-allocate instanceColor buffers before compileRest() so shaders never hitch mid-run!
    C1.setHex(0xffffff);
    instRainbow.setColorAt(0, C1);
    instParts.setColorAt(0, C1);
    instMotes.setColorAt(0, C1);

    function putInst(im, idx, x, y, z, sx, sy, sz, ry, rx) {
      E1.set(rx || 0, ry || 0, 0);
      Q1.setFromEuler(E1);
      V1.set(x, y, z);
      S1.set(sx, sy == null ? sx : sy, sz == null ? sx : sz);
      M4.compose(V1, Q1, S1);
      im.setMatrixAt(idx, M4);
    }

    var RAINBOW_HEX = [0xff5277, 0xffa62b, 0xffe44d, 0x45e373, 0x3bc8ff, 0xb873ff];

    /* ---------------------------------------------------- 3D Particle Pool */
    var particles = [];
    for (var pi = 0; pi < 120; pi++) {
      particles.push({ alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, size: 0.15, g: 12, color: new T.Color(0xffffff), spin: 0 });
    }
    var partCursor = 0;

    function spawnBurst(x, y, z, opts) {
      if (view.calm) return;
      opts = opts || {};
      var count = opts.count || 10;
      var colors = opts.colors || [0xffe44d, 0xff6ba9, 0x4df5d8];
      for (var i = 0; i < count; i++) {
        var pt = particles[partCursor];
        partCursor = (partCursor + 1) % particles.length;
        var a = Math.random() * Math.PI * 2;
        var sp = (opts.speed || 4.5) * (0.45 + Math.random() * 0.75);
        pt.alive = true;
        pt.x = x + (Math.random() - 0.5) * (opts.spread || 0.4);
        pt.y = y + (Math.random() - 0.5) * 0.3;
        pt.z = z + (Math.random() - 0.5) * (opts.spread || 0.5);
        pt.vx = Math.cos(a) * sp + (opts.vx || 0);
        pt.vy = (opts.up || 3.2) * (0.55 + Math.random() * 0.75);
        pt.vz = Math.sin(a) * sp;
        pt.max = (opts.life || 0.55) * (0.65 + Math.random() * 0.5);
        pt.life = pt.max;
        pt.size = (opts.size || 0.24) * (0.65 + Math.random() * 0.65);
        pt.g = opts.gravity == null ? 14 : opts.gravity;
        pt.spin = (Math.random() - 0.5) * 10;
        pt.color.setHex(colors[i % colors.length]);
      }
    }

    function stepParticles(dt) {
      var n = 0;
      for (var i = 0; i < particles.length; i++) {
        var pt = particles[i];
        if (!pt.alive) continue;
        pt.life -= dt;
        if (pt.life <= 0) { pt.alive = false; continue; }
        pt.vy -= pt.g * dt;
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.z += pt.vz * dt;
        if (pt.y < 0.05) { pt.y = 0.05; pt.vy *= -0.35; pt.vx *= 0.75; }
        var sc = pt.size * Math.min(1, (pt.life / pt.max) * 1.6);
        putInst(instParts, n, pt.x, pt.y, pt.z, sc, sc, sc, pt.life * pt.spin, pt.life * 4);
        instParts.setColorAt(n, pt.color);
        n++;
      }
      instParts.count = n;
      instParts.visible = n > 0;
      if (n > 0) {
        instParts.instanceMatrix.needsUpdate = true;
        if (instParts.instanceColor) instParts.instanceColor.needsUpdate = true;
      }
    }

    /* -------------------------------------------- Live Obstacle Mesh Pool */
    var obGroup = new T.Group();
    scene.add(obGroup);
    var activeObs = new Map();

    function clearObstacles() {
      activeObs.forEach(function (obj) { obGroup.remove(obj); });
      activeObs.clear();
    }

    function syncObstacles(world, camX, t) {
      var seen = new Set();
      if (world) {
        for (var i = world.oi; i < world.obs.length; i++) {
          var ob = world.obs[i];
          if (ob.x > camX + 58) break;
          if (ob.smashed || ob.x < camX - 16) continue;
          seen.add(ob.id);
          var mesh = activeObs.get(ob.id);
          var wIdx = D.worldAtDistance(world, ob.baseX || ob.x);
          if (!mesh) {
            if (ob.kind === 'flyer') {
              mesh = getFlyerRig(wIdx);
            } else {
              mesh = new T.Mesh(getObstacleGeo(wIdx, ob.kind, ob.variant), MATS);
            }
            obGroup.add(mesh);
            activeObs.set(ob.id, mesh);
          }
          if (ob.kind === 'flyer') {
            var bob = view.calm ? 0 : Math.sin(ob.flyT) * 0.14;
            mesh.position.set(ob.x, ob.y0 + 0.4 + bob, 0);
            var flap = view.calm ? 0.15 : Math.sin(ob.flyT * 1.45) * 0.65;
            mesh.userData.wL.rotation.x = flap;
            mesh.userData.wR.rotation.x = -flap;
          } else if (ob.kind === 'pad') {
            var pulse = ob.cleared ? 1 + Math.sin(t * 24) * 0.14 : 1 + Math.sin(t * 4.5 + ob.id) * 0.04;
            mesh.position.set(ob.x, 0, 0);
            mesh.scale.set(pulse, 1 / Math.sqrt(pulse), pulse);
          } else {
            mesh.position.set(ob.x, 0, 0);
          }
        }
      }
      activeObs.forEach(function (obj, id) {
        if (!seen.has(id)) {
          obGroup.remove(obj);
          activeObs.delete(id);
        }
      });
    }

    /* -------------------------------------------------- Camera & Animation */
    var cam = { x: -2, y: 3.4, z: 9.2, lx: 3.5, ly: 1.4, lz: 0, fov: 44, shake: 0 };
    var anim = { sqY: 1, sqXZ: 1, blinkT: 2.2, blink: 0, hopY: 0, hopV: 0, flip: 0, dustT: 0, roarVisual: 0 };

    function animateDino(rig, state, t, dt, isPlayer) {
      var running = !!state.running;
      var ground = state.ground !== false;
      var duck = !!state.duck;
      var roaring = !!state.roaring;
      var superB = !!state.superBounce;
      var stride = state.stride || (t * 10);

      // Squash-and-stretch spring recovery
      if (isPlayer) {
        anim.sqY += (1 - anim.sqY) * Math.min(1, dt * 13);
        anim.sqXZ += (1 - anim.sqXZ) * Math.min(1, dt * 13);
        // Playful title/wardrobe click hop
        if (anim.hopY > 0 || anim.hopV > 0) {
          anim.hopV -= 28 * dt;
          anim.hopY += anim.hopV * dt;
          if (anim.hopY <= 0) { anim.hopY = 0; anim.hopV = 0; anim.sqY = 0.78; anim.sqXZ = 1.2; }
        }
        // Periodic cute eye blink
        anim.blinkT -= dt;
        if (anim.blinkT <= 0) {
          anim.blink = 0.13;
          anim.blinkT = 2.4 + Math.random() * 2.6;
        }
        if (anim.blink > 0) anim.blink = Math.max(0, anim.blink - dt);
        rig.eyes.scale.y = anim.blink > 0.03 ? 0.14 : 1;
      }

      var targetSY = duck ? 0.58 : (isPlayer ? anim.sqY : 1);
      var targetSX = duck ? 1.28 : (isPlayer ? anim.sqXZ : 1);
      var targetSZ = duck ? 1.18 : (isPlayer ? anim.sqXZ : 1);
      rig.squash.scale.set(targetSX, targetSY, targetSZ);

      // Bouncy running stride vs joyful idle bounce
      var bob = 0, legSwing = 0, lean = 0;
      if (running && ground && !duck) {
        bob = Math.abs(Math.sin(stride)) * 0.14;
        legSwing = Math.sin(stride) * 0.72;
        lean = -0.14;
      } else if (running && duck) {
        bob = 0.03;
        legSwing = Math.sin(stride * 1.4) * 0.4;
        lean = -0.34;
      } else if (!ground) {
        legSwing = 0.52;
        lean = D.clamp((state.vy || 0) * 0.025, -0.22, 0.25);
      } else {
        // Adorable breathing & idle sway
        bob = view.calm ? 0 : Math.abs(Math.sin(t * 2.8)) * 0.05;
        lean = view.calm ? 0 : Math.sin(t * 1.4) * 0.04;
      }

      if (isPlayer && superB && !ground && !view.calm) {
        anim.flip -= dt * 9.5;
      } else if (isPlayer) {
        anim.flip += (0 - anim.flip) * Math.min(1, dt * 14);
      }

      rig.body.position.y = bob + (isPlayer ? anim.hopY : 0);
      rig.body.rotation.z = lean + (isPlayer ? anim.flip : 0);
      rig.legL.rotation.z = legSwing;
      rig.legR.rotation.z = -legSwing;
      rig.armL.rotation.z = -legSwing * 0.65 + (roaring ? 0.6 : 0);
      rig.armR.rotation.z = legSwing * 0.65 + (roaring ? 0.6 : 0);

      // Head curiosity tilt + wide jaw during Roar!
      rig.head.rotation.z = roaring ? 0.22 : (duck ? 0.28 : (view.calm ? 0 : Math.sin(t * 2.2) * 0.05));
      rig.head.rotation.y = (!running && !view.calm) ? Math.sin(t * 1.3) * 0.16 : 0;
      rig.jaw.rotation.z = roaring ? -0.58 : -0.04;

      // Joyful segmented tail wag!
      var wagSpeed = running ? 11 : 4.2;
      var wagAmp = view.calm ? 0 : (running ? 0.26 : 0.2);
      rig.tail1.rotation.y = Math.sin(t * wagSpeed) * wagAmp;
      rig.tail2.rotation.y = Math.sin(t * wagSpeed - 0.85) * wagAmp * 1.35;
      rig.tail1.rotation.z = duck ? 0.28 : Math.sin(t * wagSpeed * 0.5) * 0.08;
    }

    var view = {
      renderer: renderer,
      scene: scene,
      camera: camera,
      software: software,
      calm: false,

      setDinoLook: function (colorIdx, hatIdx) {
        if (colorIdx !== playerColorIdx || hatIdx !== playerHatIdx) {
          rebuildPlayer(colorIdx, hatIdx);
        }
      },

      triggerHop: function () {
        anim.hopV = 7.4;
        anim.sqY = 1.24;
        anim.sqXZ = 0.86;
      },

      triggerSquash: function (amt) {
        if (amt > 0) { anim.sqY = 1.26; anim.sqXZ = 0.85; }
        else { anim.sqY = 0.72; anim.sqXZ = 1.22; }
      },

      triggerRoar: function () {
        anim.roarVisual = 0.58;
        if (!view.calm) cam.shake = Math.max(cam.shake, 0.34);
      },

      shake: function (power) {
        if (!view.calm) cam.shake = Math.max(cam.shake, power || 0.3);
      },

      burst: spawnBurst,

      resetWorld: function (worldIdx) {
        clearObstacles();
        activeChunks.forEach(function (ch) { chunkGroup.remove(ch.mesh); ch.mesh.geometry.dispose(); });
        activeChunks.clear();
        for (var i = 0; i < particles.length; i++) particles[i].alive = false;
        instParts.count = 0; instParts.visible = false;
        targetWorld = worldIdx || 0;
        applyPalette(targetWorld, true, 1);
      },

      project: function (x, y, z) {
        V1.set(x, y, z || 0).project(camera);
        return { x: (V1.x + 1) * 0.5, y: (1 - V1.y) * 0.5 };
      },

      update: function (ctx) {
        var dt = Math.min(0.05, Math.max(0, ctx.dt || 0));
        var t = ctx.t || 0;
        var w = ctx.world;
        var p = ctx.player;
        var camMode = ctx.mode || 'menu';

        var worldIdx = w ? D.worldAtDistance(w, w.x) : (ctx.worldIndex || 0);
        targetWorld = worldIdx;
        applyPalette(targetWorld, !!ctx.snap, dt);

        // Position & animate Player Dino
        playerRig.root.position.set(p.x, p.y, 0);
        if (camMode === 'wardrobe') {
          playerRig.root.rotation.y = (ctx.spin || 0) - 0.62;
        } else if (camMode === 'menu') {
          playerRig.root.rotation.y = -0.62 + (view.calm ? 0 : Math.sin(t * 0.85) * 0.14);
        } else {
          playerRig.root.rotation.y = 0;
        }
        playerRig.setFlash(p.invuln > 0 && Math.floor(t * 18) % 2 === 0);
        animateDino(playerRig, p, t, dt, true);

        // Glowing Sonic Roar Rings expanding forward!
        if (anim.roarVisual > 0) {
          anim.roarVisual = Math.max(0, anim.roarVisual - dt);
          var u = 1 - anim.roarVisual / 0.58;
          roarGroup.visible = true;
          roarGroup.position.set(p.x + 0.8 + u * 3.8, p.y + 0.95, 0);
          for (var r = 0; r < roarRings.length; r++) {
            var ru = D.clamp(u * 1.25 - r * 0.14, 0, 1);
            roarRings[r].position.x = ru * 1.4 - r * 0.45;
            var rs = 0.55 + ru * 1.65;
            roarRings[r].scale.set(1, rs, rs);
            roarRings[r].material.opacity = (1 - ru) * 0.88;
          }
        } else {
          roarGroup.visible = false;
        }

        // Camera framing: hero 3/4 side-angled 3D perspective for play, intimate showcase for title/wardrobe!
        var tx, ty, tz, lx, ly, lz, fov = 44;
        if (camMode === 'play') {
          tx = p.x + 2.2;
          ty = 3.25 + p.y * 0.28;
          tz = 10.6;
          lx = p.x + 4.8;
          ly = 1.45 + p.y * 0.24;
          lz = -0.35;
          fov = p.roaring ? 49 : 44;
        } else if (camMode === 'wardrobe') {
          tx = p.x + 1.55;
          ty = 1.55;
          tz = 4.45;
          lx = p.x + 0.92;
          ly = 1.02;
          lz = 0;
          fov = 38;
        } else if (camMode === 'finish') {
          tx = p.x + 1.2;
          ty = 2.6;
          tz = 7.4;
          lx = p.x + 1.4;
          ly = 1.2;
          lz = 0;
          fov = 42;
        } else {
          // Minimal Poki Title screen: adorable dino framed cleanly above the Play button!
          tx = p.x + 0.35;
          ty = 1.85;
          tz = 5.95;
          lx = p.x + 0.2;
          ly = 0.88;
          lz = -0.4;
          fov = 42;
        }

        var k = ctx.snap ? 1 : Math.min(1, dt * 8.5);
        var kx = ctx.snap ? 1 : Math.min(1, dt * 16);
        cam.x += (tx - cam.x) * kx;
        cam.y += (ty - cam.y) * k;
        cam.z += (tz - cam.z) * k;
        cam.lx += (lx - cam.lx) * kx;
        cam.ly += (ly - cam.ly) * k;
        cam.lz += (lz - cam.lz) * k;
        cam.fov += (fov - cam.fov) * Math.min(1, dt * 6);
        cam.shake = Math.max(0, cam.shake - dt * 2.6);

        var sh = view.calm ? 0 : cam.shake * cam.shake * 0.85;
        camera.position.set(cam.x + (Math.random() - 0.5) * sh, cam.y + (Math.random() - 0.5) * sh, cam.z);
        camera.lookAt(cam.lx, cam.ly, cam.lz);
        var asp = camera.aspect;
        var vf = asp < 16 / 9 ? 2 * Math.atan(Math.tan(cam.fov * Math.PI / 360) * (16 / 9) / asp) * 180 / Math.PI : cam.fov;
        if (Math.abs(camera.fov - vf) > 0.02) { camera.fov = vf; camera.updateProjectionMatrix(); }

        skyMesh.position.copy(camera.position);
        skyDecor.position.set(cam.x, 0, 0);

        // Chunks & curved-horizon clouds
        syncChunks(cam.lx, function (cx) {
          return w ? D.worldAtDistance(w, cx) : targetWorld;
        }, !!ctx.snap || activeChunks.size < 4);

        for (var c = 0; c < clouds.length; c++) {
          var cl = clouds[c];
          var rel = ((cl.off - cam.lx * 0.22 - t * cl.speed) % 160 + 240) % 160 - 80;
          // Subtle horizon drop curve so clouds rise gracefully over the horizon!
          var curveDrop = rel * rel * 0.0012;
          cl.mesh.position.set(cam.lx + rel, cl.y - curveDrop, cl.z);
        }

        // Family finish nest visibility & joyful hopping!
        if (w && !w.endless && w.length - cam.lx < 68) {
          nestGroup.visible = true;
          nestGroup.position.set(w.length + 2.2, 0, 0);
          for (var fi = 0; fi < familyRigs.length; fi++) {
            var fHop = view.calm ? 0 : Math.abs(Math.sin(t * (4.6 + fi * 0.7) + fi * 1.4)) * (camMode === 'finish' ? 0.55 : 0.22);
            familyRigs[fi].root.position.y = 0.2 + fHop;
            animateDino(familyRigs[fi], { running: false, ground: fHop < 0.05 }, t + fi * 1.1, dt, false);
          }
        } else {
          nestGroup.visible = false;
        }

        // Sync Obstacles & Collectibles & Blob Shadows
        syncObstacles(w, cam.lx, t);

        var si = 0;
        var pShScale = D.clamp(1.28 - p.y * 0.14, 0.45, 1.35);
        putInst(instShadows, si++, p.x, 0.02, 0, pShScale, 1, pShScale * 0.85, 0);

        var ne = 0, ng = 0, nr = 0, nh = 0;
        if (w) {
          for (var oi = w.oi; oi < w.obs.length; oi++) {
            var ob = w.obs[oi];
            if (ob.x > cam.lx + 52) break;
            if (ob.smashed || ob.x < cam.lx - 14 || ob.kind === 'arch') continue;
            if (si < 96) {
              var os = ob.kind === 'flyer' ? 0.85 : Math.max(0.95, ob.w * 1.15);
              putInst(instShadows, si++, ob.x, 0.02, 0, os, 1, os * 0.85, 0);
            }
          }
          for (var ii = w.ii; ii < w.items.length; ii++) {
            var it = w.items[ii];
            if (it.x > cam.lx + 52) break;
            if (it.got || it.x < cam.lx - 12) continue;
            var bobY = view.calm ? 0 : Math.sin(t * 3.8 + it.id) * 0.1;
            var spinY = view.calm ? 0.4 : t * 2.4 + it.id * 0.7;
            if (it.kind === 'egg' && ne < 64) {
              putInst(instEggs, ne++, it.x, it.y + bobY, 0, 1.05, 1.05, 1.05, spinY);
            } else if (it.kind === 'gold' && ng < 24) {
              putInst(instGold, ng++, it.x, it.y + bobY, 0, 1.24, 1.24, 1.24, spinY * 1.3);
            } else if (it.kind === 'rainbow' && nr < 48) {
              putInst(instRainbow, nr, it.x, it.y + bobY, 0, 0.86, 0.92, 0.86, spinY * 1.2);
              C1.setHex(RAINBOW_HEX[(it.chain + Math.floor(t * 4)) % RAINBOW_HEX.length]);
              instRainbow.setColorAt(nr, C1);
              nr++;
            } else if (it.kind === 'heart' && nh < 8) {
              putInst(instHearts, nh++, it.x, it.y + bobY, 0, 1.05, 1.05, 1.05, spinY);
            }
            if (it.y < 1.3 && si < 96) {
              putInst(instShadows, si++, it.x, 0.02, 0, 0.45, 1, 0.4, 0);
            }
          }
        }
        instEggs.count = ne; instEggs.visible = ne > 0; if (ne > 0) instEggs.instanceMatrix.needsUpdate = true;
        instGold.count = ng; instGold.visible = ng > 0; if (ng > 0) instGold.instanceMatrix.needsUpdate = true;
        instRainbow.count = nr; instRainbow.visible = nr > 0;
        if (nr > 0) { instRainbow.instanceMatrix.needsUpdate = true; if (instRainbow.instanceColor) instRainbow.instanceColor.needsUpdate = true; }
        instHearts.count = nh; instHearts.visible = nh > 0; if (nh > 0) instHearts.instanceMatrix.needsUpdate = true;
        instShadows.count = si; instShadows.visible = si > 0; instShadows.instanceMatrix.needsUpdate = true;

        // Ambient world motes (snowflakes, volcanic embers, sparkles, pollen).
        var nm = 0;
        if (!view.calm) {
          var mCol = PALETTES[targetWorld % PALETTES.length].mote;
          C1.setHex(mCol);
          for (var mi = 0; mi < 28; mi++) {
            var mx = cam.lx - 10 + ((mi * 29.3 + t * (targetWorld === 2 ? -1.4 : 0.7)) % 34 + 34) % 34;
            var my = targetWorld === 2
              ? (7.5 - ((mi * 1.9 + t * 1.8) % 7.5))
              : targetWorld === 3
                ? ((mi * 1.3 + t * 2.1) % 7.5)
                : (1.2 + (mi * 1.7 % 5.2) + Math.sin(t * 2 + mi) * 0.35);
            var mz = -5.5 + (mi * 3.7 % 9.5);
            var ms = targetWorld === 2 ? 0.13 : 0.1;
            putInst(instMotes, nm, mx, my, mz, ms, ms, ms, t + mi);
            instMotes.setColorAt(nm, C1);
            nm++;
          }
        }
        instMotes.count = nm; instMotes.visible = nm > 0;
        if (nm > 0) { instMotes.instanceMatrix.needsUpdate = true; if (instMotes.instanceColor) instMotes.instanceColor.needsUpdate = true; }

        // Soft running dust puffs under feet!
        anim.dustT -= dt;
        if (camMode === 'play' && p.running && p.ground && anim.dustT <= 0) {
          anim.dustT = p.roaring ? 0.04 : (p.duck ? 0.07 : 0.15);
          spawnBurst(p.x - 0.35, 0.1, (Math.random() - 0.5) * 0.35, {
            count: p.roaring ? 2 : 1,
            colors: p.roaring ? [0xffe857, 0xff8c2b] : [PALETTES[targetWorld].pathTop, 0xffffff],
            speed: 1.4, up: 1.2, life: 0.34, size: p.roaring ? 0.2 : 0.14, gravity: 4, vx: -1.8
          });
        }
        stepParticles(dt);
      }
    };

    /* ---------------------------------- Software-WebGL Pacing & Fence Sync */
    var gl0 = renderer.getContext();
    var pace = software && typeof gl0.fenceSync === 'function' ? { sync: null, t0: 0, busy: 0 } : null;

    view.mayDraw = function (now, playing) {
      if (!pace || playing) return true;
      if (pace.sync) {
        var done = true;
        try {
          done = gl0.isContextLost() || gl0.getSyncParameter(pace.sync, gl0.SYNC_STATUS) === gl0.SIGNALED;
        } catch (e) { done = true; }
        if (!done && now - pace.t0 < 1000) return false;
        try { gl0.deleteSync(pace.sync); } catch (e) { /* ignore */ }
        pace.sync = null;
        pace.busy = Math.min(500, now - pace.t0);
      }
      return now - pace.t0 >= pace.busy * 2;
    };

    view.render = function () {
      renderer.render(scene, camera);
      if (!pace) return;
      try {
        if (pace.sync) gl0.deleteSync(pace.sync);
        pace.sync = gl0.fenceSync(gl0.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl0.flush();
        pace.t0 = performance.now();
      } catch (e) { pace = null; }
    };

    view.resize = function (w, h) {
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    };

    // Adaptive pixel-ratio downscale on slow hardware GPUs.
    var slowCount = 0;
    view.frameTime = function (ms) {
      if (ms > 26) slowCount++; else slowCount = Math.max(0, slowCount - 0.5);
      if (slowCount > 90 && ratio > 0.75) {
        ratio = Math.max(0.75, ratio - 0.25);
        renderer.setPixelRatio(ratio);
        slowCount = 0;
        return true;
      }
      return false;
    };

    // Pre-compile all shaders before calling Kit.ready() so Play never hitches!
    var parallel = false;
    try { parallel = renderer.extensions.has('KHR_parallel_shader_compile'); } catch (e) { parallel = false; }

    view.prepare = function (done) {
      if (!parallel || typeof renderer.compileAsync !== 'function') { done(); return; }
      var finished = false;
      function fin() { if (!finished) { finished = true; done(); } }
      renderer.clear();
      renderer.compileAsync(scene, camera).then(fin, fin);
      setTimeout(fin, 6000);
    };

    view.compileRest = function () {
      // Briefly reveal hidden shader users so renderer.compile covers every program before fence!
      if (parallel) return;
      var vis = [instEggs.visible, instGold.visible, instRainbow.visible, instHearts.visible, instParts.visible, instMotes.visible, roarGroup.visible, rainbowGroup.visible];
      instEggs.visible = instGold.visible = instRainbow.visible = instHearts.visible = instParts.visible = instMotes.visible = roarGroup.visible = rainbowGroup.visible = true;
      renderer.compile(scene, camera);
      instEggs.visible = vis[0]; instGold.visible = vis[1]; instRainbow.visible = vis[2]; instHearts.visible = vis[3];
      instParts.visible = vis[4]; instMotes.visible = vis[5]; roarGroup.visible = vis[6]; rainbowGroup.visible = vis[7];
    };

    view.whenDrawn = function (done, limit) {
      var gl = renderer.getContext(), t0 = performance.now(), sync = null;
      try {
        if (gl.fenceSync) { sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0); gl.flush(); }
      } catch (e) { sync = null; }
      (function poll() {
        var ready = !sync || gl.isContextLost() || performance.now() - t0 > (limit || 8000);
        if (!ready) {
          try { ready = gl.getSyncParameter(sync, gl.SYNC_STATUS) === gl.SIGNALED; } catch (e) { ready = true; }
        }
        if (!ready) { setTimeout(poll, 16); return; }
        if (sync) { try { gl.deleteSync(sync); } catch (e) { /* ignore */ } }
        done();
      })();
    };

    applyPalette(0, true, 1);
    return view;
  };
})();
