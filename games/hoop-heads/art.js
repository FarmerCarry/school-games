/* Hoop Heads 3D (سلة الرؤوس الكبيرة) — Sunlit Three.js 3D streetball arena & character renderer.
 * Merged static stadium/court/bleachers/trees geometry, procedural hardwood court & 5 basketball textures,
 * glowing transparent backboards, flexing orange rims, swaying 3D nets, expressive big-head 3D cartoon players
 * with 6 accessories, pooled InstancedMesh crowd/shadows/shot-arc/particles, and software WebGL pacing. */
(function () {
  'use strict';

  var SCALE = 0.0175; // 1280px -> 22.4 world units

  function wx(px) { return (px - 640) * SCALE; }
  function wy(py) { return (600 - py) * SCALE; }

  function softwareGL() {
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
      try { var lose = gl && gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext(); } catch (e) { /* ignore */ }
    }
  }

  function createView(canvas) {
    var T = window.THREE;
    var E = window.HoopHeadsEngine;
    if (!T) throw new Error('three.js unavailable');

    var software = softwareGL();
    var renderer = new T.WebGLRenderer({ canvas: canvas, antialias: !software, powerPreference: 'high-performance' });
    var ratio = software ? 0.75 : Math.min(window.devicePixelRatio || 1, 1.5);
    renderer.setPixelRatio(ratio);
    if (T.SRGBColorSpace) renderer.outputColorSpace = T.SRGBColorSpace;

    var scene = new T.Scene();
    var skyColor = new T.Color(0x56c8ff);
    var fogColor = new T.Color(0x8de0ff);
    scene.background = skyColor;
    scene.fog = new T.Fog(fogColor, 34, 88);

    var camera = new T.PerspectiveCamera(37, 16 / 9, 0.5, 140);
    camera.position.set(0, 5.1, 22.8);
    camera.lookAt(0, 3.3, 0);

    // Warm sunlit lighting: sky/ground hemisphere + bright sunlight + gentle back fill
    var hemi = new T.HemisphereLight(0xfffdf0, 0x5d8aa8, 1.38);
    var sun = new T.DirectionalLight(0xfff5db, 1.78);
    sun.position.set(14, 26, 18);
    var fill = new T.DirectionalLight(0x9ad8ff, 0.52);
    fill.position.set(-16, 12, -14);
    scene.add(hemi, sun, fill);

    // Scratch math objects (zero per-frame heap allocations)
    var C = new T.Color();
    var M4 = new T.Matrix4();
    var Q = new T.Quaternion();
    var EU = new T.Euler();
    var V1 = new T.Vector3();
    var S1 = new T.Vector3();

    /* ---------------------------------------------------- Box Merger Utility */
    function buildMergedBoxes(items) {
      var lit = [], glow = [];
      for (var i = 0; i < items.length; i++) (items[i][9] ? glow : lit).push(items[i]);
      var all = lit.concat(glow);
      var vertCount = all.length * 36;
      var pos = new Float32Array(vertCount * 3);
      var nor = new Float32Array(vertCount * 3);
      var col = new Float32Array(vertCount * 3);
      var o = 0;

      var faces = [
        { n: [ 1,  0,  0], v: [[ 0.5, -0.5,  0.5], [ 0.5, -0.5, -0.5], [ 0.5,  0.5, -0.5], [ 0.5,  0.5,  0.5]] },
        { n: [-1,  0,  0], v: [[-0.5, -0.5, -0.5], [-0.5, -0.5,  0.5], [-0.5,  0.5,  0.5], [-0.5,  0.5, -0.5]] },
        { n: [ 0,  1,  0], v: [[-0.5,  0.5,  0.5], [ 0.5,  0.5,  0.5], [ 0.5,  0.5, -0.5], [-0.5,  0.5, -0.5]] },
        { n: [ 0, -1,  0], v: [[-0.5, -0.5, -0.5], [ 0.5, -0.5, -0.5], [ 0.5, -0.5,  0.5], [-0.5, -0.5,  0.5]] },
        { n: [ 0,  0,  1], v: [[-0.5, -0.5,  0.5], [ 0.5, -0.5,  0.5], [ 0.5,  0.5,  0.5], [-0.5,  0.5,  0.5]] },
        { n: [ 0,  0, -1], v: [[ 0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5,  0.5, -0.5], [ 0.5,  0.5, -0.5]] }
      ];
      var idx6 = [0, 1, 2, 0, 2, 3];

      for (i = 0; i < all.length; i++) {
        var b = all[i];
        var cx = b[0], cy = b[1], cz = b[2];
        var w = b[3], h = b[4], d = b[5];
        var ry = b[6] || 0, rz = b[7] || 0;
        C.setHex(b[8]);
        var cr = C.r, cg = C.g, cb = C.b;
        var cyc = Math.cos(ry), cys = Math.sin(ry);
        var czc = Math.cos(rz), czs = Math.sin(rz);

        for (var f = 0; f < 6; f++) {
          var fc = faces[f];
          var nx0 = fc.n[0] * czc - fc.n[1] * czs;
          var ny0 = fc.n[0] * czs + fc.n[1] * czc;
          var nz0 = fc.n[2];
          var nx = nx0 * cyc + nz0 * cys;
          var ny = ny0;
          var nz = -nx0 * cys + nz0 * cyc;

          for (var k = 0; k < 6; k++) {
            var pt = fc.v[idx6[k]];
            var lx = pt[0] * w, ly = pt[1] * h, lz = pt[2] * d;
            var rx = lx * czc - ly * czs;
            var ry2 = lx * czs + ly * czc;
            pos[o] = rx * cyc + lz * cys + cx;
            pos[o + 1] = ry2 + cy;
            pos[o + 2] = -rx * cys + lz * cyc + cz;
            nor[o] = nx; nor[o + 1] = ny; nor[o + 2] = nz;
            col[o] = cr; col[o + 1] = cg; col[o + 2] = cb;
            o += 3;
          }
        }
      }

      var geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new T.BufferAttribute(nor, 3));
      geo.setAttribute('color', new T.BufferAttribute(col, 3));
      var split = lit.length * 36;
      geo.addGroup(0, split, 0);
      geo.addGroup(split, vertCount - split, 1);
      geo.computeBoundingSphere();
      return geo;
    }

    var MAT_LIT = new T.MeshLambertMaterial({ vertexColors: true });
    var MAT_GLOW = new T.MeshBasicMaterial({ vertexColors: true });

    /* ---------------------------------------------------- Procedural Court Texture */
    function makeCourtTexture(floorHex, keyLHex, keyRHex) {
      var cv = document.createElement('canvas');
      cv.width = 1024;
      cv.height = 512;
      var ctx = cv.getContext('2d');

      // Outer vibrant court apron
      ctx.fillStyle = '#1e3a6e';
      ctx.fillRect(0, 0, 1024, 512);

      // Inner maple hardwood court
      var padX = 48, padY = 44, cw = 1024 - padX * 2, ch = 512 - padY * 2;
      C.setHex(floorHex);
      ctx.fillStyle = '#' + C.getHexString();
      ctx.fillRect(padX, padY, cw, ch);

      // Subtle alternating hardwood plank tones
      var planks = 16;
      var ph = ch / planks;
      for (var r = 0; r < planks; r++) {
        ctx.fillStyle = r % 2 === 0 ? 'rgba(255,244,214,0.11)' : 'rgba(120,60,12,0.08)';
        ctx.fillRect(padX, padY + r * ph, cw, ph);
        ctx.fillStyle = 'rgba(110,55,10,0.12)';
        ctx.fillRect(padX, padY + r * ph, cw, 1.5);
      }

      // Glossy sunlit center sheen
      var sheen = ctx.createRadialGradient(512, 256, 30, 512, 256, 460);
      sheen.addColorStop(0, 'rgba(255,252,235,0.22)');
      sheen.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sheen;
      ctx.fillRect(padX, padY, cw, ch);

      // Left & Right painted keys
      C.setHex(keyLHex);
      ctx.fillStyle = '#' + C.getHexString();
      ctx.fillRect(padX, 172, 188, 168);

      C.setHex(keyRHex);
      ctx.fillStyle = '#' + C.getHexString();
      ctx.fillRect(padX + cw - 188, 172, 188, 168);

      // Center court emblem circle
      ctx.fillStyle = '#ff9f1c';
      ctx.beginPath();
      ctx.arc(512, 256, 68, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffe066';
      ctx.beginPath();
      ctx.arc(512, 256, 34, 0, Math.PI * 2);
      ctx.fill();

      // Crisp white painted basketball lines
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 7;
      ctx.strokeRect(padX, padY, cw, ch);

      // Half-court line & center ring
      ctx.beginPath();
      ctx.moveTo(512, padY);
      ctx.lineTo(512, padY + ch);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(512, 256, 68, 0, Math.PI * 2);
      ctx.stroke();

      // Key outlines & free-throw arcs
      ctx.strokeRect(padX, 172, 188, 168);
      ctx.strokeRect(padX + cw - 188, 172, 188, 168);

      ctx.beginPath();
      ctx.arc(padX + 188, 256, 56, -Math.PI * 0.5, Math.PI * 0.5);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(padX + cw - 188, 256, 56, Math.PI * 0.5, Math.PI * 1.5);
      ctx.stroke();

      // Crisp 3-Point Arcs (matching THREE_PT_DIST visually!)
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(padX + 58, 256, 256, -Math.PI * 0.42, Math.PI * 0.42);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(padX + cw - 58, 256, 256, Math.PI * 0.58, Math.PI * 1.42);
      ctx.stroke();

      var tex = new T.CanvasTexture(cv);
      if (T.SRGBColorSpace) tex.colorSpace = T.SRGBColorSpace;
      tex.anisotropy = software ? 1 : 4;
      return tex;
    }

    var courtTextures = {};
    function getCourtTexture(arena) {
      var key = arena.id;
      if (!courtTextures[key]) {
        courtTextures[key] = makeCourtTexture(arena.floorTint, arena.keyL, arena.keyR);
      }
      return courtTextures[key];
    }

    // Glossy court surface
    var courtMat = new T.MeshPhongMaterial({
      map: getCourtTexture(E.OPPONENTS[0]),
      specular: 0xffe8c2,
      shininess: 38
    });
    var courtMesh = new T.Mesh(new T.PlaneGeometry(24.8, 10.6), courtMat);
    courtMesh.rotation.x = -Math.PI * 0.5;
    courtMesh.position.set(0, 0, -0.3);
    scene.add(courtMesh);

    /* ---------------------------------------------------- Static Stadium Environment */
    var envBoxes = [];
    // Surrounding sunny park ground & court deck curb
    envBoxes.push([0, -0.32, -3.5, 68, 0.5, 34, 0, 0, 0x3ec96b, false]);
    envBoxes.push([0, -0.14, -0.3, 25.4, 0.24, 11.2, 0, 0, 0x264378, false]);

    // Colorful court sideline boards & streetball banners
    var bannerColors = [0xff7a18, 0x2589ff, 0xffcf26, 0xec4899, 0x22d36b, 0x8b5cf6];
    for (var bi = 0; bi < 10; bi++) {
      var bx = -11.25 + bi * 2.5;
      envBoxes.push([bx, 0.65, -5.6, 2.38, 1.3, 0.28, 0, 0, bannerColors[bi % bannerColors.length], false]);
      envBoxes.push([bx, 1.32, -5.6, 2.42, 0.14, 0.34, 0, 0, 0xffffff, false]);
    }

    // Tiered stadium bleachers (3 rows rising behind the court)
    for (var row = 0; row < 3; row++) {
      var by = 1.15 + row * 1.15;
      var bz = -6.7 - row * 1.45;
      envBoxes.push([0, by, bz, 26.5, 0.35, 1.35, 0, 0, row % 2 === 0 ? 0x33416e : 0x263259, false]);
      envBoxes.push([0, by - 0.55, bz + 0.6, 26.5, 0.9, 0.18, 0, 0, 0x1b2444, false]);
    }
    // Back stadium railing
    envBoxes.push([0, 4.4, -10.5, 27.5, 0.22, 0.2, 0, 0, 0xe2e8f0, false]);

    // Cheerful low-poly park trees flanking the stadium background
    var treePos = [-15.5, -12.8, -8.5, -4.2, 4.2, 8.5, 12.8, 15.5];
    for (var ti = 0; ti < treePos.length; ti++) {
      var tx = treePos[ti];
      var tz = -12.6 - (ti % 2) * 2.2;
      var th = 3.2 + (ti % 3) * 0.9;
      envBoxes.push([tx, th * 0.5, tz, 0.75, th, 0.75, 0, 0, 0x8d5b34, false]);
      envBoxes.push([tx, th + 1.1, tz, 2.9, 2.4, 2.6, 0.2 * ti, 0, ti % 2 === 0 ? 0x22c55e : 0x34d399, false]);
      envBoxes.push([tx + 0.4, th + 2.3, tz + 0.2, 1.9, 1.5, 1.8, -0.3, 0, 0x4ade80, false]);
    }

    // Distant colorful low-poly city / school gym buildings on horizon
    var bldg = [
      [-18, 3.6, -19, 4.2, 7.2, 3.5, 0x60a5fa],
      [-11, 4.5, -21, 5.0, 9.0, 4.0, 0xfbbf24],
      [-3, 3.8, -22, 4.8, 7.6, 3.5, 0xf472b6],
      [6, 4.8, -21, 5.2, 9.6, 4.0, 0x34d399],
      [15, 3.9, -19, 4.5, 7.8, 3.5, 0xa78bfa]
    ];
    for (var ki = 0; ki < bldg.length; ki++) {
      var bd = bldg[ki];
      envBoxes.push([bd[0], bd[1], bd[2], bd[3], bd[4], bd[5], 0, 0, bd[6], false]);
    }

    // Fluffy stylized low-poly sunlit clouds in the sky
    var clouds = [
      [-11, 10.6, -17, 4.2, 1.1, 1.6],
      [-2, 11.4, -19, 5.0, 1.2, 1.8],
      [9.5, 10.3, -16, 4.4, 1.0, 1.5]
    ];
    for (var ci = 0; ci < clouds.length; ci++) {
      var cl = clouds[ci];
      envBoxes.push([cl[0], cl[1], cl[2], cl[3], cl[4], cl[5], 0, 0, 0xffffff, true]);
      envBoxes.push([cl[0] - cl[3] * 0.24, cl[1] + 0.55, cl[2], cl[3] * 0.55, cl[4] * 0.9, cl[5] * 0.85, 0, 0, 0xfffdf5, true]);
    }

    // Stadium floodlight towers left & right
    for (var fl = -1; fl <= 1; fl += 2) {
      envBoxes.push([fl * 12.2, 4.6, -6.2, 0.42, 9.2, 0.42, 0, 0, 0x475569, false]);
      envBoxes.push([fl * 11.8, 9.2, -6.0, 2.2, 0.95, 0.55, fl * -0.25, 0, 0x1e293b, false]);
      envBoxes.push([fl * 11.75, 9.2, -5.68, 1.9, 0.65, 0.14, fl * -0.25, 0, 0xfff8c4, true]);
    }

    // Overhead Jumbotron truss & frame
    envBoxes.push([0, 9.0, -5.8, 6.4, 1.9, 0.7, 0, 0, 0x172042, false]);
    envBoxes.push([-2.6, 10.6, -5.8, 0.25, 1.6, 0.25, 0, 0, 0x64748b, false]);
    envBoxes.push([2.6, 10.6, -5.8, 0.25, 1.6, 0.25, 0, 0, 0x64748b, false]);

    var envMesh = new T.Mesh(buildMergedBoxes(envBoxes), [MAT_LIT, MAT_GLOW]);
    scene.add(envMesh);

    // Dynamic Jumbotron celebration light panels with lively LED graphic texture
    function makeJumboTex() {
      var cv = document.createElement('canvas');
      cv.width = 512;
      cv.height = 128;
      var ctx = cv.getContext('2d');
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, 512, 128);
      // Glowing blue & red team edge bars
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(10, 12, 118, 104);
      ctx.fillStyle = '#ff5a5f';
      ctx.fillRect(384, 12, 118, 104);
      // Central golden star/basketball emblem
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(140, 12, 232, 104);
      ctx.fillStyle = '#ff9f1c';
      ctx.beginPath();
      ctx.arc(256, 64, 38, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff5cc';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(256, 64, 38, 0, Math.PI * 2);
      ctx.moveTo(218, 64); ctx.lineTo(294, 64);
      ctx.moveTo(256, 26); ctx.lineTo(256, 102);
      ctx.stroke();
      // Decorative LED dots across top and bottom
      ctx.fillStyle = '#ffe066';
      for (var d = 0; d < 20; d++) {
        ctx.fillRect(16 + d * 25, 3, 12, 5);
        ctx.fillRect(16 + d * 25, 120, 12, 5);
      }
      var tex = new T.CanvasTexture(cv);
      if (T.SRGBColorSpace) tex.colorSpace = T.SRGBColorSpace;
      return tex;
    }
    var jumboPanelMat = new T.MeshBasicMaterial({ map: makeJumboTex(), color: 0xffffff });
    var jumboPanel = new T.Mesh(new T.PlaneGeometry(5.6, 1.25), jumboPanelMat);
    jumboPanel.position.set(0, 9.0, -5.42);
    scene.add(jumboPanel);

    /* ---------------------------------------------------- InstancedMesh Crowd */
    var CROWD_COUNT = 54;
    var crowdHeadGeo = new T.SphereGeometry(0.32, 8, 6);
    var crowdBodyGeo = new T.BoxGeometry(0.56, 0.65, 0.42);
    var crowdMat = new T.MeshLambertMaterial({ color: 0xffffff });
    var crowdHeads = new T.InstancedMesh(crowdHeadGeo, crowdMat, CROWD_COUNT);
    var crowdBodies = new T.InstancedMesh(crowdBodyGeo, crowdMat, CROWD_COUNT);
    var crowdData = [];
    var shirtPalette = [0xff595e, 0xffca3a, 0x8ac926, 0x1982c4, 0x6a4c93, 0xff9f1c, 0x2ec4b6, 0xf72585];
    var skinPalette = [0xffd1a9, 0xf1b285, 0xd88d60, 0xffe0c4];
    for (var crI = 0; crI < CROWD_COUNT; crI++) {
      var rRow = crI % 3;
      var colIdx = Math.floor(crI / 3);
      var cx = -11.4 + (colIdx / 17) * 22.8 + ((crI * 37) % 10 - 5) * 0.05;
      var cy = 1.62 + rRow * 1.15;
      var cz = -6.75 - rRow * 1.45;
      crowdData.push({ x: cx, y: cy, z: cz, phase: crI * 0.73, speed: 2.8 + (crI % 5) * 0.45 });
      C.setHex(skinPalette[crI % skinPalette.length]);
      crowdHeads.setColorAt(crI, C);
      C.setHex(shirtPalette[(crI * 3) % shirtPalette.length]);
      crowdBodies.setColorAt(crI, C);
    }
    crowdHeads.instanceColor.needsUpdate = true;
    crowdBodies.instanceColor.needsUpdate = true;
    scene.add(crowdBodies, crowdHeads);

    /* ---------------------------------------------------- 3D Hoops, Glass Backboards & Swaying Nets */
    function buildHoop3D(spec) {
      var g = new T.Group();
      var sideSign = spec.side === 0 ? -1 : 1; // -1 left, +1 right
      var rimX = wx(spec.x);
      var rimY = wy(spec.y);
      var boardX = wx(spec.boardX);
      var rimR = spec.rimR * SCALE;

      // Padded Stanchion Post behind baseline
      var postX = boardX + sideSign * 1.15;
      var post = new T.Mesh(
        new T.BoxGeometry(0.48, rimY + 0.9, 0.56),
        new T.MeshLambertMaterial({ color: spec.side === 0 ? 0x1d4ed8 : 0xdc2626 })
      );
      post.position.set(postX, (rimY + 0.9) * 0.5, 0);
      g.add(post);

      // Post base pad
      var basePad = new T.Mesh(
        new T.BoxGeometry(1.15, 0.55, 1.15),
        new T.MeshLambertMaterial({ color: 0x0f172a })
      );
      basePad.position.set(postX + sideSign * 0.15, 0.28, 0);
      g.add(basePad);

      // Horizontal gooseneck arm to backboard
      var arm = new T.Mesh(
        new T.BoxGeometry(1.25, 0.34, 0.34),
        new T.MeshLambertMaterial({ color: 0x334155 })
      );
      arm.position.set((postX + boardX) * 0.5, rimY + 0.55, 0);
      g.add(arm);

      // Transparent Glowing Plexiglass Backboard
      var boardH = (spec.boardBot - spec.boardTop) * SCALE;
      var boardCY = (wy(spec.boardTop) + wy(spec.boardBot)) * 0.5;
      var boardD = 2.6;
      var glassMat = new T.MeshPhongMaterial({
        color: 0xdff6ff,
        emissive: spec.side === 0 ? 0x1e64ff : 0xff4757,
        emissiveIntensity: 0.18,
        transparent: true,
        opacity: 0.42,
        shininess: 110,
        side: T.DoubleSide
      });
      var glass = new T.Mesh(new T.BoxGeometry(0.14, boardH, boardD), glassMat);
      glass.position.set(boardX, boardCY, 0);
      g.add(glass);

      // Bright Backboard Perimeter Frame & Shooter's Square (glows brightly on score!)
      var frameMat = new T.MeshBasicMaterial({ color: 0xffffff });
      var fTop = new T.Mesh(new T.BoxGeometry(0.18, 0.12, boardD + 0.06), frameMat);
      fTop.position.set(boardX, boardCY + boardH * 0.5, 0);
      var fBot = new T.Mesh(new T.BoxGeometry(0.18, 0.12, boardD + 0.06), frameMat);
      fBot.position.set(boardX, boardCY - boardH * 0.5, 0);
      var fFr = new T.Mesh(new T.BoxGeometry(0.18, boardH, 0.12), frameMat);
      fFr.position.set(boardX, boardCY, boardD * 0.5);
      var fBk = new T.Mesh(new T.BoxGeometry(0.18, boardH, 0.12), frameMat);
      fBk.position.set(boardX, boardCY, -boardD * 0.5);
      // Inner shooter square right above rim
      var sqMat = new T.MeshBasicMaterial({ color: spec.side === 0 ? 0x38bdf8 : 0xff8b6b });
      var sqBox = new T.Mesh(new T.BoxGeometry(0.19, 0.85, 1.1), sqMat);
      sqBox.position.set(boardX - sideSign * 0.02, rimY + 0.55, 0);
      g.add(fTop, fBot, fFr, fBk, sqBox);

      // Flexing Orange 3D Rim Group (pivots from backboard attachment!)
      var rimPivot = new T.Group();
      rimPivot.position.set(boardX - sideSign * 0.1, rimY, 0);
      var offsetX = rimX - (boardX - sideSign * 0.1);

      var neck = new T.Mesh(
        new T.BoxGeometry(Math.abs(offsetX) - rimR + 0.16, 0.14, 0.28),
        new T.MeshLambertMaterial({ color: 0xe85d04 })
      );
      neck.position.set(offsetX * 0.32, 0, 0);
      rimPivot.add(neck);

      var rimMesh = new T.Mesh(
        new T.TorusGeometry(rimR, 0.085, 10, 24),
        new T.MeshPhongMaterial({ color: 0xff5a00, specular: 0xffd199, shininess: 85 })
      );
      rimMesh.rotation.x = Math.PI * 0.5;
      rimMesh.position.set(offsetX, 0, 0);
      rimPivot.add(rimMesh);

      // Animated 3D Swaying Net (tapered wireframe lattice cylinder with deformable rings!)
      var netGeo = new T.CylinderGeometry(rimR * 0.94, rimR * 0.56, 1.15, 12, 4, true);
      var netBasePos = new Float32Array(netGeo.attributes.position.array);
      var netMat = new T.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.88 });
      var netMesh = new T.Mesh(netGeo, netMat);
      netMesh.position.set(offsetX, -0.60, 0);
      rimPivot.add(netMesh);

      g.add(rimPivot);
      scene.add(g);

      return {
        group: g,
        sideSign: sideSign,
        rimPivot: rimPivot,
        netGeo: netGeo,
        netBasePos: netBasePos,
        glassMat: glassMat,
        frameMat: frameMat
      };
    }

    var hoops3D = [buildHoop3D(E.HOOPS_SPEC[0]), buildHoop3D(E.HOOPS_SPEC[1])];

    /* ---------------------------------------------------- 3D Basketballs & Textures */
    function makeBallTexture(spec) {
      var cv = document.createElement('canvas');
      cv.width = 256;
      cv.height = 128;
      var ctx = cv.getContext('2d');

      if (spec.id === 'galaxy') {
        var grd = ctx.createLinearGradient(0, 0, 256, 128);
        grd.addColorStop(0, '#311068');
        grd.addColorStop(0.5, '#6d28d9');
        grd.addColorStop(1, '#1e1b4b');
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, 256, 128);
        ctx.fillStyle = '#fef08a';
        for (var s = 0; s < 36; s++) {
          ctx.fillRect((s * 73) % 256, (s * 41) % 128, (s % 3) + 1.5, (s % 3) + 1.5);
        }
      } else if (spec.id === 'fire') {
        var fgrd = ctx.createLinearGradient(0, 0, 0, 128);
        fgrd.addColorStop(0, '#ffe066');
        fgrd.addColorStop(0.45, '#ff5400');
        fgrd.addColorStop(1, '#9d0208');
        ctx.fillStyle = fgrd;
        ctx.fillRect(0, 0, 256, 128);
      } else if (spec.id === 'gold') {
        var ggrd = ctx.createLinearGradient(0, 0, 256, 128);
        ggrd.addColorStop(0, '#fef08a');
        ggrd.addColorStop(0.5, '#f59e0b');
        ggrd.addColorStop(1, '#b45309');
        ctx.fillStyle = ggrd;
        ctx.fillRect(0, 0, 256, 128);
      } else {
        ctx.fillStyle = spec.primary;
        ctx.fillRect(0, 0, 256, 128);
      }

      // Classic basketball seams
      ctx.strokeStyle = spec.seam;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(0, 64); ctx.lineTo(256, 64);
      ctx.moveTo(64, 0); ctx.lineTo(64, 128);
      ctx.moveTo(192, 0); ctx.lineTo(192, 128);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(0, 64, 48, -Math.PI * 0.45, Math.PI * 0.45);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(128, 64, 48, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(256, 64, 48, Math.PI * 0.55, Math.PI * 1.45);
      ctx.stroke();

      var tex = new T.CanvasTexture(cv);
      if (T.SRGBColorSpace) tex.colorSpace = T.SRGBColorSpace;
      return tex;
    }

    var ballTextures = {};
    for (var bi2 = 0; bi2 < E.BALLS.length; bi2++) {
      ballTextures[E.BALLS[bi2].id] = makeBallTexture(E.BALLS[bi2]);
    }

    var ballMat = new T.MeshPhongMaterial({
      map: ballTextures.classic,
      specular: 0xffe4c4,
      shininess: 55
    });
    var ballMesh = new T.Mesh(new T.SphereGeometry(E.BALL_R * SCALE, 18, 14), ballMat);
    scene.add(ballMesh);

    // Fire / Swish glowing halo around the basketball
    var ballFireMat = new T.MeshBasicMaterial({ color: 0xff7a00, transparent: true, opacity: 0.45 });
    var ballFireHalo = new T.Mesh(new T.SphereGeometry(E.BALL_R * SCALE * 1.38, 12, 10), ballFireMat);
    ballFireHalo.visible = false;
    scene.add(ballFireHalo);

    /* ---------------------------------------------------- Expressive 3D Big-Head Players */
    var sharedHeadGeo = new T.SphereGeometry(0.68, 18, 14);
    var sharedEyeGeo = new T.SphereGeometry(0.16, 10, 8);
    var sharedPupilGeo = new T.SphereGeometry(0.085, 8, 6);
    var sharedGlintGeo = new T.SphereGeometry(0.036, 6, 5);
    var sharedCheekGeo = new T.SphereGeometry(0.11, 8, 6);
    var sharedBrowGeo = new T.BoxGeometry(0.24, 0.065, 0.08);
    var sharedMouthGeo = new T.BoxGeometry(0.28, 0.09, 0.08);
    var sharedShoeGeo = new T.BoxGeometry(0.50, 0.25, 0.34);
    var sharedSoleGeo = new T.BoxGeometry(0.54, 0.08, 0.36);
    var sharedArmGeo = new T.CylinderGeometry(0.11, 0.10, 0.56, 8);
    var sharedHandGeo = new T.SphereGeometry(0.13, 8, 6);

    var MAT_WHITE = new T.MeshLambertMaterial({ color: 0xffffff });
    var MAT_BLACK = new T.MeshLambertMaterial({ color: 0x111827 });
    var MAT_CHEEK = new T.MeshLambertMaterial({ color: 0xff8fa3 });
    var MAT_GOLD = new T.MeshPhongMaterial({ color: 0xffcf26, specular: 0xffffff, shininess: 90 });

    function buildHeadAccessories(parent) {
      var map = {};

      // 1. Classic Stripe Headband
      var classic = new T.Group();
      var band = new T.Mesh(
        new T.CylinderGeometry(0.70, 0.70, 0.20, 18, 1, true),
        new T.MeshLambertMaterial({ color: 0xffcf26, side: T.DoubleSide })
      );
      band.position.y = 0.24;
      var stripe = new T.Mesh(
        new T.CylinderGeometry(0.71, 0.71, 0.07, 18, 1, true),
        new T.MeshLambertMaterial({ color: 0xffffff, side: T.DoubleSide })
      );
      stripe.position.y = 0.24;
      var knot = new T.Mesh(new T.BoxGeometry(0.26, 0.14, 0.12), new T.MeshLambertMaterial({ color: 0xffcf26 }));
      knot.position.set(0, 0.22, -0.72);
      classic.add(band, stripe, knot);
      parent.add(classic);
      map.classic = classic;

      // 2. Backwards Street Cap
      var cap = new T.Group();
      var dome = new T.Mesh(
        new T.SphereGeometry(0.72, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.52),
        new T.MeshLambertMaterial({ color: 0x0ea5e9 })
      );
      dome.position.y = 0.06;
      var brim = new T.Mesh(
        new T.BoxGeometry(0.72, 0.08, 0.58),
        new T.MeshLambertMaterial({ color: 0xfef08a })
      );
      brim.position.set(0, 0.22, -0.64);
      brim.rotation.x = 0.16;
      cap.add(dome, brim);
      parent.add(cap);
      map.cap = cap;

      // 3. Spiky Dino Crest
      var dino = new T.Group();
      var spikeMat = new T.MeshLambertMaterial({ color: 0xff9f1c });
      for (var si = 0; si < 4; si++) {
        var sp = new T.Mesh(new T.ConeGeometry(0.17, 0.38, 6), spikeMat);
        var a = -0.35 + si * 0.44;
        sp.position.set(0, Math.cos(a) * 0.74, -Math.sin(a) * 0.74);
        sp.rotation.x = -a;
        dino.add(sp);
      }
      parent.add(dino);
      map.dino = dino;

      // 4. Sci-Fi Robo Visor + Antenna
      var robo = new T.Group();
      var visor = new T.Mesh(
        new T.BoxGeometry(0.95, 0.28, 0.36),
        new T.MeshPhongMaterial({ color: 0x22d3ee, emissive: 0x06b6d4, emissiveIntensity: 0.45, shininess: 100 })
      );
      visor.position.set(0, 0.14, 0.56);
      var stem = new T.Mesh(new T.CylinderGeometry(0.04, 0.04, 0.42, 6), new T.MeshLambertMaterial({ color: 0x64748b }));
      stem.position.set(0, 0.85, 0);
      var bulb = new T.Mesh(new T.SphereGeometry(0.12, 8, 6), new T.MeshBasicMaterial({ color: 0x22d3ee }));
      bulb.position.set(0, 1.08, 0);
      robo.add(visor, stem, bulb);
      parent.add(robo);
      map.robo = robo;

      // 5. Starry Wizard Hat
      var wizard = new T.Group();
      var wBrim = new T.Mesh(new T.CylinderGeometry(0.92, 0.96, 0.10, 16), new T.MeshLambertMaterial({ color: 0x6d28d9 }));
      wBrim.position.y = 0.52;
      var wCone = new T.Mesh(new T.ConeGeometry(0.58, 1.15, 12), new T.MeshLambertMaterial({ color: 0x7c3aed }));
      wCone.position.set(0, 1.08, -0.05);
      wCone.rotation.x = -0.14;
      var wBand = new T.Mesh(new T.CylinderGeometry(0.56, 0.60, 0.14, 12), MAT_GOLD);
      wBand.position.y = 0.62;
      wizard.add(wBrim, wCone, wBand);
      parent.add(wizard);
      map.wizard = wizard;

      // 6. Golden Champ Crown
      var crown = new T.Group();
      var cBase = new T.Mesh(new T.CylinderGeometry(0.50, 0.44, 0.30, 12), MAT_GOLD);
      cBase.position.y = 0.72;
      crown.add(cBase);
      for (var ci2 = 0; ci2 < 5; ci2++) {
        var ang = (ci2 / 5) * Math.PI * 2;
        var pt = new T.Mesh(new T.ConeGeometry(0.13, 0.28, 5), MAT_GOLD);
        pt.position.set(Math.cos(ang) * 0.40, 0.96, Math.sin(ang) * 0.40);
        crown.add(pt);
      }
      var gem = new T.Mesh(new T.SphereGeometry(0.11, 8, 6), new T.MeshBasicMaterial({ color: 0xff4757 }));
      gem.position.set(0, 0.74, 0.48);
      crown.add(gem);
      parent.add(crown);
      map.crown = crown;

      return map;
    }

    function buildPlayer3D(idx) {
      var root = new T.Group();
      var bodyScale = new T.Group();
      root.add(bodyScale);

      var skinMat = new T.MeshLambertMaterial({ color: 0xffd1a9 });
      var jerseyMat = new T.MeshLambertMaterial({ color: idx === 0 ? 0x2563eb : 0xe63946 });
      var trimMat = new T.MeshLambertMaterial({ color: 0xffe066 });
      var shoeMat = new T.MeshLambertMaterial({ color: idx === 0 ? 0x1d4ed8 : 0xdc2626 });

      // Oversized Shoes (left & right pivot from hip)
      var shoeL = new T.Group();
      var shLM = new T.Mesh(sharedShoeGeo, shoeMat);
      var slLM = new T.Mesh(sharedSoleGeo, MAT_WHITE);
      slLM.position.y = -0.14;
      shoeL.add(shLM, slLM);
      shoeL.position.set(-0.24, 0.18, 0.12);

      var shoeR = new T.Group();
      var shRM = new T.Mesh(sharedShoeGeo, shoeMat);
      var slRM = new T.Mesh(sharedSoleGeo, MAT_WHITE);
      slRM.position.y = -0.14;
      shoeR.add(shRM, slRM);
      shoeR.position.set(0.24, 0.18, -0.12);
      bodyScale.add(shoeL, shoeR);

      // Compact Chunky Jersey Torso
      var torso = new T.Group();
      torso.position.y = 0.62;
      var shirt = new T.Mesh(new T.CylinderGeometry(0.36, 0.42, 0.60, 12), jerseyMat);
      var shorts = new T.Mesh(new T.CylinderGeometry(0.41, 0.43, 0.24, 12), trimMat);
      shorts.position.y = -0.26;
      var chestStripe = new T.Mesh(new T.CylinderGeometry(0.38, 0.40, 0.14, 12), trimMat);
      chestStripe.position.y = 0.04;
      torso.add(shirt, shorts, chestStripe);

      // Swinging Arms (left & right shoulder pivots)
      var armL = new T.Group();
      armL.position.set(-0.44, 0.18, 0);
      var aLM = new T.Mesh(sharedArmGeo, skinMat);
      aLM.position.y = -0.24;
      var hLM = new T.Mesh(sharedHandGeo, skinMat);
      hLM.position.y = -0.52;
      armL.add(aLM, hLM);

      var armR = new T.Group();
      armR.position.set(0.44, 0.18, 0);
      var aRM = new T.Mesh(sharedArmGeo, skinMat);
      aRM.position.y = -0.24;
      var hRM = new T.Mesh(sharedHandGeo, skinMat);
      hRM.position.y = -0.52;
      armR.add(aRM, hRM);
      torso.add(armL, armR);
      bodyScale.add(torso);

      // Big Expressive Cartoon Head
      var headGroup = new T.Group();
      headGroup.position.y = 1.48;
      var skull = new T.Mesh(sharedHeadGeo, skinMat);
      headGroup.add(skull);

      // Eyes (facing +Z locally; head rotates toward court facing!)
      var eyeL = new T.Mesh(sharedEyeGeo, MAT_WHITE);
      eyeL.position.set(-0.22, 0.08, 0.58);
      var eyeR = new T.Mesh(sharedEyeGeo, MAT_WHITE);
      eyeR.position.set(0.22, 0.08, 0.58);

      var pupilL = new T.Mesh(sharedPupilGeo, MAT_BLACK);
      pupilL.position.set(-0.22, 0.08, 0.70);
      var pupilR = new T.Mesh(sharedPupilGeo, MAT_BLACK);
      pupilR.position.set(0.22, 0.08, 0.70);

      var glintL = new T.Mesh(sharedGlintGeo, MAT_WHITE);
      glintL.position.set(-0.18, 0.13, 0.76);
      var glintR = new T.Mesh(sharedGlintGeo, MAT_WHITE);
      glintR.position.set(0.26, 0.13, 0.76);

      var browL = new T.Mesh(sharedBrowGeo, MAT_BLACK);
      browL.position.set(-0.22, 0.28, 0.62);
      var browR = new T.Mesh(sharedBrowGeo, MAT_BLACK);
      browR.position.set(0.22, 0.28, 0.62);

      var cheekL = new T.Mesh(sharedCheekGeo, MAT_CHEEK);
      cheekL.position.set(-0.38, -0.08, 0.52);
      cheekL.scale.set(1, 0.65, 0.5);
      var cheekR = new T.Mesh(sharedCheekGeo, MAT_CHEEK);
      cheekR.position.set(0.38, -0.08, 0.52);
      cheekR.scale.set(1, 0.65, 0.5);

      // Cute cheerful cartoon smile (dark mouth cavity + bright white teeth bar)
      var mouth = new T.Group();
      mouth.position.set(0, -0.22, 0.60);
      var mouthBack = new T.Mesh(new T.CylinderGeometry(0.16, 0.12, 0.08, 10, 1, false, 0, Math.PI), MAT_BLACK);
      mouthBack.rotation.x = Math.PI * 0.5;
      mouthBack.rotation.z = Math.PI;
      var teeth = new T.Mesh(new T.BoxGeometry(0.24, 0.045, 0.07), MAT_WHITE);
      teeth.position.set(0, 0.035, 0.03);
      mouth.add(mouthBack, teeth);

      // Stylish cartoon hair tuft (shown on classic headband & golden crown!)
      var hairMat = new T.MeshLambertMaterial({ color: idx === 0 ? 0x3b2314 : 0x5c2c16 });
      var hairGroup = new T.Group();
      var hMain = new T.Mesh(new T.SphereGeometry(0.67, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.44), hairMat);
      hMain.position.set(0, 0.08, -0.04);
      var hTuft1 = new T.Mesh(new T.ConeGeometry(0.18, 0.34, 7), hairMat);
      hTuft1.position.set(0, 0.76, 0.16);
      hTuft1.rotation.x = 0.45;
      var hTuft2 = new T.Mesh(new T.ConeGeometry(0.14, 0.28, 7), hairMat);
      hTuft2.position.set(-0.18, 0.72, 0.08);
      hTuft2.rotation.z = 0.35;
      hTuft2.rotation.x = 0.3;
      var hTuft3 = new T.Mesh(new T.ConeGeometry(0.14, 0.28, 7), hairMat);
      hTuft3.position.set(0.18, 0.72, 0.08);
      hTuft3.rotation.z = -0.35;
      hTuft3.rotation.x = 0.3;
      hairGroup.add(hMain, hTuft1, hTuft2, hTuft3);

      headGroup.add(eyeL, eyeR, pupilL, pupilR, glintL, glintR, browL, browR, cheekL, cheekR, mouth, hairGroup);

      var accessories = buildHeadAccessories(headGroup);
      bodyScale.add(headGroup);

      // Super-Ready Glowing Fire Aura Ring
      var superRingMat = new T.MeshBasicMaterial({ color: 0xffcf26, transparent: true, opacity: 0.75, side: T.DoubleSide });
      var superRing = new T.Mesh(new T.RingGeometry(0.74, 1.05, 20), superRingMat);
      superRing.rotation.x = -Math.PI * 0.5;
      superRing.position.y = 0.06;
      superRing.visible = false;
      root.add(superRing);

      // Dizzy Stars Ring (when bumped/stunned)
      var dizzyGroup = new T.Group();
      dizzyGroup.position.y = 2.38;
      for (var di = 0; di < 3; di++) {
        var stMesh = new T.Mesh(new T.OctahedronGeometry(0.14, 0), MAT_GOLD);
        var da = (di / 3) * Math.PI * 2;
        stMesh.position.set(Math.cos(da) * 0.62, 0, Math.sin(da) * 0.62);
        dizzyGroup.add(stMesh);
      }
      dizzyGroup.visible = false;
      root.add(dizzyGroup);

      scene.add(root);

      return {
        root: root,
        bodyScale: bodyScale,
        torso: torso,
        headGroup: headGroup,
        shoeL: shoeL,
        shoeR: shoeR,
        armL: armL,
        armR: armR,
        pupilL: pupilL,
        pupilR: pupilR,
        browL: browL,
        browR: browR,
        mouth: mouth,
        skinMat: skinMat,
        jerseyMat: jerseyMat,
        trimMat: trimMat,
        shoeMat: shoeMat,
        hairGroup: hairGroup,
        accessories: accessories,
        superRing: superRing,
        superRingMat: superRingMat,
        dizzyGroup: dizzyGroup,
        curHead: ''
      };
    }

    var players3D = [buildPlayer3D(0), buildPlayer3D(1)];

    /* ---------------------------------------------------- InstancedMesh Shadows, Aim Arc & Particles */
    // Soft Blob Shadows (3 instances: P1, P2, Ball)
    var shadowGeo = new T.CircleGeometry(1, 16);
    shadowGeo.rotateX(-Math.PI * 0.5);
    var shadowMat = new T.MeshBasicMaterial({ color: 0x0b1530, transparent: true, opacity: 0.34, depthWrite: false });
    var shadowMesh = new T.InstancedMesh(shadowGeo, shadowMat, 3);
    scene.add(shadowMesh);

    // 3D Ballistic Shot Preview Dots (11 dots)
    var ARC_DOTS = 11;
    var arcMat = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.88 });
    var arcMesh = new T.InstancedMesh(new T.SphereGeometry(0.12, 8, 6), arcMat, ARC_DOTS);
    arcMesh.visible = false;
    scene.add(arcMesh);

    // Pooled 3D Particles (140 instances: confetti, fire sparks, dust puffs, swish stars)
    var MAX_PARTS = 140;
    var partMesh = new T.InstancedMesh(
      new T.BoxGeometry(0.22, 0.22, 0.22),
      new T.MeshBasicMaterial({ color: 0xffffff }),
      MAX_PARTS
    );
    var parts = [];
    for (var pIdx = 0; pIdx < MAX_PARTS; pIdx++) {
      parts.push({ life: 0, max: 1, x: 0, y: -20, z: 0, vx: 0, vy: 0, vz: 0, rot: 0, vrot: 0, s: 1, g: 14, col: 0xffffff });
      M4.makeScale(0, 0, 0);
      partMesh.setMatrixAt(pIdx, M4);
    }
    partMesh.instanceMatrix.needsUpdate = true;
    scene.add(partMesh);
    var partCursor = 0;

    function burst(px, py, count, colors, speed, lift) {
      var x0 = wx(px), y0 = wy(py);
      for (var i = 0; i < count; i++) {
        var pt = parts[partCursor];
        partCursor = (partCursor + 1) % MAX_PARTS;
        var a = Math.random() * Math.PI * 2;
        var spd = (0.35 + Math.random() * 0.85) * (speed || 6);
        pt.life = 0.45 + Math.random() * 0.55;
        pt.max = pt.life;
        pt.x = x0 + (Math.random() - 0.5) * 0.35;
        pt.y = y0 + (Math.random() - 0.5) * 0.35;
        pt.z = (Math.random() - 0.5) * 0.8;
        pt.vx = Math.cos(a) * spd;
        pt.vy = Math.sin(a) * spd * 0.65 + (lift || 3.8);
        pt.vz = (Math.random() - 0.5) * spd * 0.7;
        pt.rot = Math.random() * 6;
        pt.vrot = (Math.random() - 0.5) * 14;
        pt.s = 0.65 + Math.random() * 0.9;
        pt.g = 12;
        pt.col = colors[i % colors.length];
      }
    }

    var shakeT = 0;
    var shakeMag = 0;
    function addShake(mag, dur) {
      if (view.calm) return;
      shakeMag = Math.max(shakeMag, mag || 0.25);
      shakeT = Math.max(shakeT, dur || 0.22);
    }

    /* ---------------------------------------------------- Arena Theme Sync */
    var curArenaId = '';
    var curBallSkin = '';
    function syncTheme(match) {
      if (match.arena && match.arena.id !== curArenaId) {
        curArenaId = match.arena.id;
        skyColor.setHex(match.arena.skyTop);
        fogColor.setHex(match.arena.skyFog);
        scene.fog.color.copy(fogColor);
        courtMat.map = getCourtTexture(match.arena);
        courtMat.needsUpdate = true;
      }
      if (match.ballSkin && match.ballSkin !== curBallSkin) {
        curBallSkin = match.ballSkin;
        ballMat.map = ballTextures[curBallSkin] || ballTextures.classic;
        ballMat.needsUpdate = true;
      }
    }

    /* ---------------------------------------------------- Frame Sync */
    var camX = 0;
    var camY = 5.1;
    var camZ = 22.8;

    function sync(match, dt, snapCam) {
      syncTheme(match);
      var t = match.elapsed;
      var b = match.ball;

      // 1. Update Hoops (Rim Flex, Backboard Glow, Swaying 3D Net)
      for (var hi = 0; hi < 2; hi++) {
        var hp = match.hoops[hi];
        var h3 = hoops3D[hi];
        h3.rimPivot.rotation.z = h3.sideSign * hp.rimBend * 0.26;
        h3.glassMat.emissiveIntensity = 0.16 + hp.glowT * 0.65;
        h3.frameMat.color.setHex(hp.glowT > 0.1 ? 0xffe066 : 0xffffff);

        var posAttr = h3.netGeo.attributes.position;
        var base = h3.netBasePos;
        var arr = posAttr.array;
        var sway = hp.netSway;
        for (var vi = 0; vi < arr.length; vi += 3) {
          var by0 = base[vi + 1]; // +0.575 at rim top -> -0.575 at bottom
          var depth = Math.max(0, (0.575 - by0) / 1.15); // 0 at top, 1 at bottom
          var billow = 1 + Math.abs(sway) * 0.28 * Math.sin(depth * Math.PI);
          arr[vi] = base[vi] * billow + sway * depth * depth * 0.42;
          arr[vi + 1] = by0 + Math.abs(sway) * 0.12 * depth;
          arr[vi + 2] = base[vi + 2] * billow;
        }
        posAttr.needsUpdate = true;
      }

      // 2. Jumbotron Scoreboard Strobe Lights
      if (match.flashT > 0) {
        var blink = Math.floor(t * 18) % 2 === 0;
        jumboPanelMat.color.setHex(blink ? 0xffe066 : (match.flashSide === 0 ? 0x7dd3fc : 0xff8b8b));
      } else if (match.overtime) {
        jumboPanelMat.color.setHex(Math.floor(t * 6) % 2 === 0 ? 0xffcf26 : 0xff6b6b);
      } else {
        jumboPanelMat.color.setHex(0xffffff);
      }

      // 3. Animated Spectators in Bleachers
      var excite = match.crowdExcite;
      for (var ci = 0; ci < CROWD_COUNT; ci++) {
        var cd = crowdData[ci];
        var hop = view.calm ? 0 : Math.abs(Math.sin(t * (cd.speed + excite * 6) + cd.phase)) * (0.08 + excite * 0.48);
        M4.makeTranslation(cd.x, cd.y + hop, cd.z);
        crowdBodies.setMatrixAt(ci, M4);
        M4.makeTranslation(cd.x, cd.y + 0.56 + hop, cd.z);
        crowdHeads.setMatrixAt(ci, M4);
      }
      crowdBodies.instanceMatrix.needsUpdate = true;
      crowdHeads.instanceMatrix.needsUpdate = true;

      // 4. Expressive Big-Head Players
      var bxW = wx(b.x);
      var byW = wy(b.y);
      for (var pi = 0; pi < 2; pi++) {
        var pl = match.players[pi];
        var p3 = players3D[pi];

        // Sync cosmetics
        p3.skinMat.color.setHex(pl.skin);
        p3.jerseyMat.color.setHex(pl.jersey);
        p3.trimMat.color.setHex(pl.trim);
        p3.shoeMat.color.setHex(pl.jersey);
        if (p3.curHead !== pl.head) {
          p3.curHead = pl.head;
          for (var ak in p3.accessories) p3.accessories[ak].visible = ak === pl.head;
          p3.hairGroup.visible = pl.head === 'classic' || pl.head === 'crown';
        }

        var pxW = wx(pl.x);
        var pyW = wy(pl.y);
        p3.root.position.set(pxW, pyW, 0);
        p3.bodyScale.scale.set(pl.squashX * 1.18, pl.squashY * 1.18, pl.squashX * 1.18);

        // Turn character lively toward facing direction (angled slightly toward camera for readability!)
        var targetYaw = pl.facing >= 0 ? 0.92 : -0.92;
        p3.bodyScale.rotation.y += (targetYaw - p3.bodyScale.rotation.y) * Math.min(1, dt * 16);

        // Dunk somersault / lean flair
        if (pl.dunk) {
          var du = E.clamp(pl.dunk.t / pl.dunk.dur, 0, 1);
          p3.torso.rotation.x = pl.dunk.isSuper ? (du * Math.PI * 2) : Math.sin(du * Math.PI) * 0.42;
          p3.headGroup.rotation.x = -0.25;
        } else {
          p3.torso.rotation.x = pl.stealAnimT > 0 ? 0.35 : 0;
          p3.headGroup.rotation.x = 0;
        }

        // Swinging Sneakers
        var stride = pl.onGround ? Math.sin(pl.runPhase) * Math.min(1, Math.abs(pl.vx) / 220) : 0.45;
        p3.shoeL.position.z = 0.10 + stride * 0.32;
        p3.shoeL.position.y = 0.18 + Math.max(0, stride) * 0.14;
        p3.shoeR.position.z = -0.10 - stride * 0.32;
        p3.shoeR.position.y = 0.18 + Math.max(0, -stride) * 0.14;

        // Expressive Arms (shoot raise, dunk slam, steal lunge, or dribble pump)
        var armRaise = 0;
        if (pl.dunk) armRaise = -2.75;
        else if (pl.charging || pl.shootAnimT > 0) armRaise = -2.35;
        else if (pl.stealAnimT > 0) armRaise = -1.55;
        else if (!pl.onGround) armRaise = -1.75;
        else if (b.holder === pl) armRaise = -0.55 - Math.abs(Math.sin(pl.dribblePhase)) * 0.45;
        else armRaise = stride * 0.5;
        p3.armL.rotation.x = armRaise;
        p3.armR.rotation.x = pl.dunk || pl.charging || pl.shootAnimT > 0 ? armRaise : -armRaise * 0.7;

        // Head bob & Eyes tracking the basketball!
        var idleBob = pl.onGround ? Math.sin(t * 4.5 + pi * 2.1) * 0.04 : 0;
        p3.headGroup.position.y = 1.48 + idleBob;
        var lookY = E.clamp((byW - (pyW + 1.48)) * 0.035, -0.05, 0.06);
        p3.pupilL.position.y = 0.08 + lookY;
        p3.pupilR.position.y = 0.08 + lookY;

        // Expressive Eyebrows & Mouth
        if (pl.expr === 'fierce' || pl.dunk || pl.charging) {
          p3.browL.rotation.z = -0.35;
          p3.browR.rotation.z = 0.35;
          p3.mouth.scale.set(1.1, 1.35, 1);
        } else if (pl.expr === 'happy') {
          p3.browL.rotation.z = 0.25;
          p3.browR.rotation.z = -0.25;
          p3.mouth.scale.set(1.35, 1.4, 1);
        } else if (pl.expr === 'dizzy' || pl.stunT > 0) {
          p3.browL.rotation.z = 0.42;
          p3.browR.rotation.z = 0.42;
          p3.mouth.scale.set(0.65, 1.5, 1);
        } else {
          p3.browL.rotation.z = 0.06;
          p3.browR.rotation.z = -0.06;
          p3.mouth.scale.set(1, 0.85, 1);
        }

        // Super-Ready Fire Ring & Dizzy Stars
        var superReady = pl.super >= 100 || (pl.dunk && pl.dunk.isSuper);
        p3.superRing.visible = superReady;
        if (superReady) {
          var sp = 1 + Math.sin(t * 10) * 0.14;
          p3.superRing.scale.set(sp, sp, 1);
          p3.superRing.rotation.z = t * 4;
          p3.superRingMat.color.setHex(Math.floor(t * 12) % 2 === 0 ? 0xffe066 : 0xff6b00);
        }
        p3.dizzyGroup.visible = pl.stunT > 0;
        if (pl.stunT > 0) p3.dizzyGroup.rotation.y = t * 7.5;
      }

      // 5. 3D Basketball & Fireball Halo
      ballMesh.position.set(bxW, byW, 0);
      ballMesh.rotation.z = -b.angle;
      ballMesh.rotation.x = t * 1.4;
      var onFire = b.fireT > 0 || b.isSuper;
      ballFireHalo.visible = onFire;
      if (onFire) {
        ballFireHalo.position.set(bxW, byW, 0);
        var fs = 1 + Math.sin(t * 22) * 0.16;
        ballFireHalo.scale.set(fs, fs, fs);
        ballFireMat.color.setHex(Math.floor(t * 18) % 2 === 0 ? 0xff7a00 : 0xffe066);
      }

      // 6. Blob Shadows (P1, P2, Ball)
      for (var si2 = 0; si2 < 3; si2++) {
        var sx2 = si2 < 2 ? wx(match.players[si2].x) : bxW;
        var syH = si2 < 2 ? wy(match.players[si2].y) : Math.max(0, byW - 0.35);
        var baseR = si2 < 2 ? 0.72 : 0.42;
        var shrink = E.clamp(1 - syH * 0.085, 0.32, 1);
        V1.set(sx2, 0.025, 0);
        S1.set(baseR * shrink, 1, baseR * shrink * 0.72);
        Q.identity();
        M4.compose(V1, Q, S1);
        shadowMesh.setMatrixAt(si2, M4);
      }
      shadowMesh.instanceMatrix.needsUpdate = true;

      // 7. 3D Dotted Ballistic Shot Preview Arc (for active charging human player)
      var charger = null;
      if (match.phase === 'play') {
        if (match.players[0].ctrl === 'human' && match.players[0].charging) charger = match.players[0];
        else if (match.players[1].ctrl === 'human' && match.players[1].charging) charger = match.players[1];
      }
      if (charger) {
        var prev = E.computeShotPreview(match, charger, ARC_DOTS);
        arcMesh.visible = true;
        arcMat.color.setHex(prev.inSweet ? 0x4ade80 : (prev.charge > E.SWEET_MAX ? 0xff9f1c : 0x7dd3fc));
        for (var ai = 0; ai < ARC_DOTS; ai++) {
          var ap = prev.points[ai];
          var dotS = 1.05 - (ai / ARC_DOTS) * 0.55;
          V1.set(wx(ap.x), wy(ap.y), 0.15);
          S1.set(dotS, dotS, dotS);
          Q.identity();
          M4.compose(V1, Q, S1);
          arcMesh.setMatrixAt(ai, M4);
        }
        arcMesh.instanceMatrix.needsUpdate = true;
      } else {
        arcMesh.visible = false;
      }

      // 8. Pooled 3D Particles Update
      for (var k = 0; k < MAX_PARTS; k++) {
        var pt = parts[k];
        if (pt.life > 0) {
          pt.life -= dt;
          if (pt.life <= 0) {
            M4.makeScale(0, 0, 0);
            partMesh.setMatrixAt(k, M4);
          } else {
            pt.vy -= pt.g * dt;
            pt.x += pt.vx * dt;
            pt.y += pt.vy * dt;
            pt.z += pt.vz * dt;
            if (pt.y < 0.08) { pt.y = 0.08; pt.vy = Math.abs(pt.vy) * 0.45; }
            pt.rot += pt.vrot * dt;
            var sc = pt.s * E.clamp(pt.life / pt.max, 0, 1);
            V1.set(pt.x, pt.y, pt.z);
            EU.set(pt.rot, pt.rot * 0.7, pt.rot * 0.5);
            Q.setFromEuler(EU);
            S1.set(sc, sc, sc);
            M4.compose(V1, Q, S1);
            partMesh.setMatrixAt(k, M4);
            C.setHex(pt.col);
            partMesh.setColorAt(k, C);
          }
        }
      }
      partMesh.instanceMatrix.needsUpdate = true;
      if (partMesh.instanceColor) partMesh.instanceColor.needsUpdate = true;

      // 9. Smooth Side-View Camera with Subtle Depth Pan & Screen Shake
      var wantX = E.clamp(bxW * 0.14, -1.6, 1.6);
      var wantY = 4.65 + E.clamp((byW - 3.0) * 0.08, -0.25, 0.55);
      var wantZ = 20.4;
      if (snapCam || view.calm) {
        camX = wantX; camY = wantY; camZ = wantZ;
      } else {
        var f = Math.min(1, dt * 5.2);
        camX += (wantX - camX) * f;
        camY += (wantY - camY) * f;
        camZ += (wantZ - camZ) * f;
      }

      var shX = 0, shY = 0;
      if (shakeT > 0 && !view.calm) {
        shakeT = Math.max(0, shakeT - dt);
        var amp = shakeMag * (shakeT / 0.25);
        shX = (Math.random() - 0.5) * amp;
        shY = (Math.random() - 0.5) * amp;
      } else {
        shakeMag = 0;
      }

      camera.position.set(camX + shX, camY + shY, camZ);
      camera.lookAt(camX * 0.5, 3.05, 0);
    }

    /* ---------------------------------------------------- Software WebGL Fence Pacing */
    var gl0 = renderer.getContext();
    var pace = software && typeof gl0.fenceSync === 'function' ? { sync: null, t0: 0, busy: 0 } : null;

    var view = {
      renderer: renderer,
      scene: scene,
      camera: camera,
      software: software,
      calm: false,
      burst: burst,
      shake: addShake,
      sync: sync,
      mayDraw: function (now, playing) {
        if (!pace || playing) return true;
        if (pace.sync) {
          var done = true;
          try { done = gl0.isContextLost() || gl0.getSyncParameter(pace.sync, gl0.SYNC_STATUS) === gl0.SIGNALED; } catch (e) { done = true; }
          if (!done && now - pace.t0 < 1000) return false;
          try { gl0.deleteSync(pace.sync); } catch (e) { /* ignore */ }
          pace.sync = null;
          pace.busy = Math.min(500, now - pace.t0);
        }
        return now - pace.t0 >= pace.busy * 2;
      },
      render: function () {
        renderer.render(scene, camera);
        if (!pace) return;
        try {
          if (pace.sync) gl0.deleteSync(pace.sync);
          pace.sync = gl0.fenceSync(gl0.SYNC_GPU_COMMANDS_COMPLETE, 0);
          gl0.flush();
          pace.t0 = performance.now();
        } catch (e) { pace = null; }
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
      whenDrawn: function (done, limit) {
        var gl = renderer.getContext(), t0 = performance.now(), syncObj = null;
        try { if (gl.fenceSync) { syncObj = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0); gl.flush(); } } catch (e) { syncObj = null; }
        (function poll() {
          var fin = !syncObj || gl.isContextLost() || performance.now() - t0 > (limit || 5000);
          if (!fin) { try { fin = gl.getSyncParameter(syncObj, gl.SYNC_STATUS) === gl.SIGNALED; } catch (e) { fin = true; } }
          if (!fin) { setTimeout(poll, 16); return; }
          if (syncObj) { try { gl.deleteSync(syncObj); } catch (e) { /* ignore */ } }
          done();
        })();
      },
      dispose: function () {
        renderer.dispose();
      }
    };

    return view;
  }

  window.HoopHeadsArt = { createView: createView };
})();
