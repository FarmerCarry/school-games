/* Magic Crayon 3D (القلم السحري) — 2.5D Three.js sunny toy diorama renderer.
 * 3 themed diorama worlds (Notebook Desk, Playroom Blocks, Space Poster),
 * chunky 3D toy monster truck with 6 skins, extruded waxy 3D crayon tubes,
 * spinning 3D stars, waving checkered flag, pooled InstancedMesh particles,
 * exact z=0 raycast unprojection, and software-WebGL fencing/pacing. */
(function () {
  'use strict';
  var MC = window.MagicCrayon;

  MC.createView = function (canvas) {
    var T = window.THREE;
    if (!T) throw new Error('three.js is unavailable');

    var wgl = Kit.webgl.createRenderer(canvas, { srgb: true });
    var software = wgl.software, renderer = wgl.renderer, ratio = wgl.ratio;

    var scene = new T.Scene();
    var camera = new T.PerspectiveCamera(34, 16 / 9, 0.5, 140);
    var HALF_W = MC.WORLD_W / 2;
    var HALF_H = MC.WORLD_H / 2;
    var toX = function (wx) { return wx - HALF_W; };
    var toY = function (wy) { return wy - HALF_H; };

    var hemi = new T.HemisphereLight(0xfffdf5, 0xffcaa0, 1.35);
    var sun = new T.DirectionalLight(0xfff9eb, 1.35);
    sun.position.set(8, 16, 18);
    var rim = new T.DirectionalLight(0xaad8ff, 0.45);
    rim.position.set(-10, -4, 10);
    scene.add(hemi, sun, rim);

    // Reusable scratch vectors/matrices (zero per-frame allocations)
    var V1 = new T.Vector3(), V2 = new T.Vector3(), V3 = new T.Vector3();
    var M4 = new T.Matrix4(), Q1 = new T.Quaternion(), E1 = new T.Euler(), S1 = new T.Vector3();
    var C1 = new T.Color(), C2 = new T.Color();
    var camBasePos = new T.Vector3(0, 0.72, 23.6);
    var camTarget = new T.Vector3(0, -0.18, 0);
    var curAspect = 16 / 9;

    var view = {
      renderer: renderer,
      scene: scene,
      camera: camera,
      calm: false,
      software: software
    };

    /* ---------------------------------------------------- backdrop textures */
    var bgTextures = [];
    function makeBackdropTexture(themeIdx) {
      var c = document.createElement('canvas');
      c.width = 512; c.height = 288;
      var ctx = c.getContext('2d');
      var g;
      if (themeIdx === 0) {
        // Sunny ruled notebook paper sheet
        g = ctx.createLinearGradient(0, 0, 0, 288);
        g.addColorStop(0, '#fffef7');
        g.addColorStop(1, '#fff5dc');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 512, 288);
        // Subtle warm vignette corners
        ctx.strokeStyle = 'rgba(84, 178, 245, 0.34)';
        ctx.lineWidth = 2;
        for (var y = 34; y < 280; y += 22) {
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y); ctx.stroke();
        }
        // Classic red margin rule
        ctx.strokeStyle = 'rgba(255, 102, 128, 0.46)';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(64, 0); ctx.lineTo(64, 288); ctx.stroke();
        // Cute light doodle sun & clouds in top corner
        ctx.fillStyle = 'rgba(255, 214, 70, 0.28)';
        ctx.beginPath(); ctx.arc(445, 52, 26, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(255, 190, 45, 0.32)';
        ctx.lineWidth = 3;
        for (var r = 0; r < 8; r++) {
          var a = r * Math.PI / 4;
          ctx.beginPath();
          ctx.moveTo(445 + Math.cos(a) * 32, 52 + Math.sin(a) * 32);
          ctx.lineTo(445 + Math.cos(a) * 42, 52 + Math.sin(a) * 42);
          ctx.stroke();
        }
      } else if (themeIdx === 1) {
        // Cheerful sunny playroom wall with pastel dots & bunting
        g = ctx.createLinearGradient(0, 0, 0, 288);
        g.addColorStop(0, '#ffeef7');
        g.addColorStop(0.55, '#fff6df');
        g.addColorStop(1, '#e8f9ff');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 512, 288);
        var dots = ['#ffd166', '#ff8fb1', '#7ad3ff', '#8be896'];
        for (var dy = 26; dy < 270; dy += 44) {
          for (var dx = 28; dx < 500; dx += 52) {
            ctx.fillStyle = dots[((dx + dy) | 0) % dots.length];
            ctx.globalAlpha = 0.2;
            ctx.beginPath(); ctx.arc(dx + ((dy / 44) % 2) * 24, dy, 8, 0, Math.PI * 2); ctx.fill();
          }
        }
        ctx.globalAlpha = 1;
        // Festive bunting flags across the top
        var cols = ['#ff5c8a', '#ffd23f', '#2ec4ff', '#57d96c', '#a86bff'];
        ctx.strokeStyle = '#c89e7c'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(0, 14); ctx.quadraticCurveTo(256, 46, 512, 14); ctx.stroke();
        for (var fi = 0; fi < 14; fi++) {
          var t = (fi + 0.5) / 14;
          var fx = t * 512;
          var fy = 14 + 4 * t * (1 - t) * 32;
          ctx.fillStyle = cols[fi % cols.length];
          ctx.beginPath();
          ctx.moveTo(fx - 14, fy); ctx.lineTo(fx + 14, fy); ctx.lineTo(fx, fy + 28);
          ctx.closePath(); ctx.fill();
        }
      } else {
        // Vibrant storybook Space Poster
        g = ctx.createLinearGradient(0, 0, 512, 288);
        g.addColorStop(0, '#2a2273');
        g.addColorStop(0.5, '#47309e');
        g.addColorStop(1, '#2653a8');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 512, 288);
        // Colorful pastel nebula glows
        var neb = [
          [110, 88, 120, 'rgba(255, 110, 199, 0.24)'],
          [380, 190, 140, 'rgba(72, 232, 255, 0.22)'],
          [260, 70, 110, 'rgba(255, 214, 90, 0.16)']
        ];
        for (var ni = 0; ni < neb.length; ni++) {
          var n = neb[ni];
          var rg = ctx.createRadialGradient(n[0], n[1], 8, n[0], n[1], n[2]);
          rg.addColorStop(0, n[3]); rg.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = rg;
          ctx.fillRect(0, 0, 512, 288);
        }
        // Deterministic starfield speckles
        var seed = 1337;
        function sr() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
        for (var si = 0; si < 90; si++) {
          ctx.fillStyle = si % 5 === 0 ? '#ffe566' : si % 4 === 0 ? '#8ef5ff' : '#ffffff';
          ctx.globalAlpha = 0.4 + sr() * 0.6;
          ctx.beginPath(); ctx.arc(sr() * 512, sr() * 288, 1 + sr() * 2.1, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
        // Bright poster border frame
        ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 6;
        ctx.strokeRect(8, 8, 496, 272);
      }
      var tex = new T.CanvasTexture(c);
      if (T.SRGBColorSpace) tex.colorSpace = T.SRGBColorSpace;
      return tex;
    }

    for (var ti = 0; ti < 3; ti++) bgTextures.push(makeBackdropTexture(ti));

    /* --------------------------------------------------- shared geometries */
    var GEO = {};
    // 5-pointed chunky extruded 3D star
    (function () {
      var shape = new T.Shape();
      for (var i = 0; i < 10; i++) {
        var r = i % 2 === 0 ? 0.52 : 0.24;
        var a = (i * Math.PI) / 5 + Math.PI / 2;
        var sx = Math.cos(a) * r, sy = Math.sin(a) * r;
        if (i === 0) shape.moveTo(sx, sy); else shape.lineTo(sx, sy);
      }
      shape.closePath();
      GEO.star = new T.ExtrudeGeometry(shape, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 2 });
      GEO.star.center();
    })();
    GEO.unitBox = new T.BoxGeometry(1, 1, 1);
    GEO.sphere = new T.SphereGeometry(1, 10, 8);
    GEO.cyl = new T.CylinderGeometry(1, 1, 1, 12);
    GEO.cone = new T.ConeGeometry(1, 1, 10);
    GEO.torus = new T.TorusGeometry(1, 0.22, 8, 18);
    GEO.octa = new T.OctahedronGeometry(0.14, 0);

    function lambert(color, extra) {
      return new T.MeshLambertMaterial(Object.assign({ color: color }, extra || {}));
    }
    function basic(color, extra) {
      return new T.MeshBasicMaterial(Object.assign({ color: color }, extra || {}));
    }

    /* -------------------------------------------------------- diorama base */
    var worldGroups = [new T.Group(), new T.Group(), new T.Group()];
    var bgPlaneMat = new T.MeshBasicMaterial({ map: bgTextures[0] });
    var bgPlane = new T.Mesh(new T.PlaneGeometry(29.5, 16.8), bgPlaneMat);
    bgPlane.position.set(0, 0.15, -2.9);
    scene.add(bgPlane);

    // Warm sunlit wooden desk base at bottom of diorama
    var deskMat = lambert(0xd99b56);
    var deskTopMat = lambert(0xebb472);
    var deskBase = new T.Mesh(new T.BoxGeometry(34, 1.4, 9.5), deskTopMat);
    deskBase.position.set(0, -HALF_H - 0.72, -0.8);
    scene.add(deskBase);
    var deskFrontLip = new T.Mesh(new T.BoxGeometry(34, 0.45, 0.3), deskMat);
    deskFrontLip.position.set(0, -HALF_H - 0.18, 3.85);
    scene.add(deskFrontLip);

    // Backboard shadow frame around poster/notebook
    var boardFrame = new T.Mesh(new T.BoxGeometry(30.2, 17.4, 0.3), lambert(0xb97c3e));
    boardFrame.position.set(0, 0.15, -3.12);
    scene.add(boardFrame);

    // --- World 0 props: Notebook Desk (spiral rings, giant pencil, eraser, ruler) ---
    (function () {
      var g = worldGroups[0];
      var wireMat = lambert(0x7c8aa6);
      for (var i = 0; i < 15; i++) {
        var ring = new T.Mesh(GEO.torus, wireMat);
        ring.scale.set(0.25, 0.27, 0.27);
        ring.rotation.y = Math.PI / 2;
        ring.position.set(-11.2 + i * 1.6, HALF_H + 0.82, -2.55);
        g.add(ring);
      }
      // Giant decorative yellow pencil leaning on right
      var pencil = new T.Group();
      var shaft = new T.Mesh(new T.CylinderGeometry(0.34, 0.34, 9.5, 6), lambert(0xffca28));
      var tipWood = new T.Mesh(new T.ConeGeometry(0.34, 1.15, 6), lambert(0xf2c58a));
      tipWood.position.y = 5.32;
      var tipLead = new T.Mesh(new T.ConeGeometry(0.11, 0.38, 6), lambert(0x363b4e));
      tipLead.position.y = 5.72;
      var ferrule = new T.Mesh(new T.CylinderGeometry(0.36, 0.36, 0.6, 12), lambert(0xcfd8e6));
      ferrule.position.y = -4.95;
      var eraser = new T.Mesh(new T.CylinderGeometry(0.35, 0.35, 0.75, 12), lambert(0xff7aa2));
      eraser.position.y = -5.58;
      pencil.add(shaft, tipWood, tipLead, ferrule, eraser);
      pencil.position.set(12.2, 0.5, -2.1);
      pencil.rotation.z = 0.24;
      g.add(pencil);

      // Decorative chunky pink-blue eraser on left
      var erGrp = new T.Group();
      var erPink = new T.Mesh(new T.BoxGeometry(1.7, 1.1, 1.1), lambert(0xff7ba3));
      var erBlue = new T.Mesh(new T.BoxGeometry(0.9, 1.1, 1.1), lambert(0x47b5ff));
      erBlue.position.x = 1.3;
      erGrp.add(erPink, erBlue);
      erGrp.position.set(-12.2, -5.8, -1.9);
      erGrp.rotation.y = 0.35;
      g.add(erGrp);

      // Decorative pastel crayons sticking out on left side
      var cCols = [0xff477e, 0x22b8ff, 0x2de380];
      for (var ci = 0; ci < 3; ci++) {
        var cr = new T.Group();
        var cb = new T.Mesh(new T.CylinderGeometry(0.26, 0.26, 4.2, 8), lambert(cCols[ci]));
        var ct = new T.Mesh(new T.ConeGeometry(0.24, 0.8, 8), lambert(cCols[ci]));
        ct.position.y = 2.5;
        var cw = new T.Mesh(new T.CylinderGeometry(0.28, 0.28, 1.8, 8), lambert(0x2a2438));
        cw.position.y = 0.2;
        cr.add(cb, ct, cw);
        cr.position.set(-12.5 + ci * 0.7, 3.2 - ci * 0.4, -2.35);
        cr.rotation.z = -0.35 + ci * 0.14;
        g.add(cr);
      }
      scene.add(g);
    })();

    // --- World 1 props: Playroom Blocks (stacked blocks & spinning pinwheels) ---
    var pinwheels = [];
    (function () {
      var g = worldGroups[1];
      var bCols = [0xff5d8f, 0xffd23f, 0x3ec6ff, 0x57db72, 0xb06bff];
      var stacks = [
        [-12.2, -5.6, 1.6, 0], [-12.0, -4.0, 1.3, 1], [-12.1, -2.7, 1.0, 2],
        [12.3, -5.6, 1.7, 3], [12.1, -3.9, 1.4, 4], [12.2, -2.5, 1.1, 1]
      ];
      for (var i = 0; i < stacks.length; i++) {
        var st = stacks[i];
        var blk = new T.Mesh(new T.BoxGeometry(st[2], st[2], st[2]), lambert(bCols[st[3]]));
        blk.position.set(st[0], st[1], -2.1);
        blk.rotation.y = (i % 2 === 0 ? 0.22 : -0.18);
        g.add(blk);
      }
      // Two spinning pinwheels in the background
      var pwPos = [[-10.4, 3.8, -2.4], [10.8, 4.2, -2.4]];
      for (var pi = 0; pi < pwPos.length; pi++) {
        var stick = new T.Mesh(new T.CylinderGeometry(0.08, 0.08, 4.5, 6), lambert(0xe8be82));
        stick.position.set(pwPos[pi][0], pwPos[pi][1] - 2.2, pwPos[pi][2] - 0.1);
        g.add(stick);
        var hub = new T.Group();
        hub.position.set(pwPos[pi][0], pwPos[pi][1], pwPos[pi][2]);
        for (var b = 0; b < 4; b++) {
          var blade = new T.Mesh(new T.BoxGeometry(1.15, 0.42, 0.08), lambert(bCols[(b + pi * 2) % bCols.length]));
          var ang = b * Math.PI / 2;
          blade.position.set(Math.cos(ang) * 0.55, Math.sin(ang) * 0.55, 0);
          blade.rotation.z = ang + 0.25;
          hub.add(blade);
        }
        var center = new T.Mesh(GEO.sphere, lambert(0xffffff));
        center.scale.set(0.22, 0.22, 0.16);
        hub.add(center);
        g.add(hub);
        pinwheels.push(hub);
      }
      g.visible = false;
      scene.add(g);
    })();

    // --- World 2 props: Space Poster (Saturn, Moon, Rocket, Corner Tape) ---
    var spaceOrbiters = {};
    (function () {
      var g = worldGroups[2];
      // Bright yellow masking tape strips at poster corners
      var tapeMat = lambert(0xffe169);
      var corners = [[-13.5, 7.6, 0.55], [13.5, 7.6, -0.55], [-13.5, -6.5, -0.55], [13.5, -6.5, 0.55]];
      for (var i = 0; i < corners.length; i++) {
        var tp = new T.Mesh(new T.BoxGeometry(2.3, 0.62, 0.08), tapeMat);
        tp.position.set(corners[i][0], corners[i][1], -2.82);
        tp.rotation.z = corners[i][2];
        g.add(tp);
      }
      // Ringed Saturn
      var saturn = new T.Group();
      var sBody = new T.Mesh(new T.SphereGeometry(1.35, 16, 12), lambert(0xffb84d));
      var sRing = new T.Mesh(new T.TorusGeometry(2.15, 0.22, 8, 28), lambert(0x70f3ff));
      sRing.scale.set(1, 1, 0.25);
      sRing.rotation.x = 1.25; sRing.rotation.y = 0.28;
      saturn.add(sBody, sRing);
      saturn.position.set(-9.2, 4.4, -2.3);
      g.add(saturn);
      spaceOrbiters.saturn = saturn;

      // Cheerful glowing moon
      var moon = new T.Mesh(new T.SphereGeometry(1.1, 14, 12), lambert(0xfff08a, { emissive: 0x5c4a00, emissiveIntensity: 0.3 }));
      moon.position.set(9.8, 4.7, -2.35);
      g.add(moon);
      spaceOrbiters.moon = moon;

      // Cute toy rocket ship
      var rocket = new T.Group();
      var rBody = new T.Mesh(new T.CylinderGeometry(0.45, 0.52, 1.9, 12), lambert(0xffffff));
      var rNose = new T.Mesh(new T.ConeGeometry(0.46, 0.95, 12), lambert(0xff4769));
      rNose.position.y = 1.4;
      var rWin = new T.Mesh(new T.SphereGeometry(0.24, 10, 8), lambert(0x3de8ff, { emissive: 0x1680a8 }));
      rWin.position.set(0, 0.25, 0.42);
      var rFinL = new T.Mesh(new T.BoxGeometry(0.55, 0.65, 0.1), lambert(0xff4769));
      rFinL.position.set(-0.52, -0.65, 0);
      var rFinR = rFinL.clone(); rFinR.position.x = 0.52;
      var rFlame = new T.Mesh(new T.ConeGeometry(0.32, 0.85, 8), basic(0xffc933));
      rFlame.rotation.x = Math.PI; rFlame.position.y = -1.3;
      rocket.add(rBody, rNose, rWin, rFinL, rFinR, rFlame);
      rocket.position.set(11.6, -2.2, -2.1);
      rocket.rotation.z = 0.42;
      g.add(rocket);
      spaceOrbiters.rocket = rocket;

      g.visible = false;
      scene.add(g);
    })();

    var activeTheme = -1;
    function setTheme(themeIdx) {
      if (activeTheme === themeIdx) return;
      activeTheme = themeIdx;
      bgPlaneMat.map = bgTextures[themeIdx];
      bgPlaneMat.needsUpdate = true;
      for (var i = 0; i < 3; i++) worldGroups[i].visible = i === themeIdx;
      if (themeIdx === 0) {
        scene.background = new T.Color(0xd7f0ff);
        scene.fog = new T.Fog(0xd7f0ff, 34, 72);
        hemi.color.setHex(0xfffef8); hemi.groundColor.setHex(0xffd29d); hemi.intensity = 1.4;
        sun.color.setHex(0xfff9ea); sun.intensity = 1.35;
      } else if (themeIdx === 1) {
        scene.background = new T.Color(0xffebf5);
        scene.fog = new T.Fog(0xffebf5, 34, 72);
        hemi.color.setHex(0xffffff); hemi.groundColor.setHex(0xffc6df); hemi.intensity = 1.42;
        sun.color.setHex(0xfff6e5); sun.intensity = 1.3;
      } else {
        scene.background = new T.Color(0x231b63);
        scene.fog = new T.Fog(0x231b63, 36, 76);
        hemi.color.setHex(0xd8ddff); hemi.groundColor.setHex(0x6e4bc4); hemi.intensity = 1.45;
        sun.color.setHex(0xffeefe); sun.intensity = 1.35;
      }
    }

    /* -------------------------------------------------- 3D monster truck */
    var truckRoot = new T.Group();
    var truckChassis = new T.Group();
    truckRoot.add(truckChassis);

    var matBody = lambert(MC.SKINS[0].body);
    var matCab = lambert(MC.SKINS[0].cab);
    var matTrim = lambert(MC.SKINS[0].trim);
    var matRim = lambert(MC.SKINS[0].rim);
    var matFrame = lambert(0x28304a);
    var matGlass = lambert(0x74dcff, { emissive: 0x164a66, emissiveIntensity: 0.25 });
    var matWhite = lambert(0xffffff);
    var matDark = lambert(0x1f2233);
    var matHeadlight = basic(0xfff48f);
    var matTire = lambert(0x262a36);
    var matChrome = lambert(0xdde6f2);

    // Lower chassis & monster bumper
    var chassisBar = new T.Mesh(new T.BoxGeometry(1.58, 0.28, 0.92), matFrame);
    chassisBar.position.set(0, -0.18, 0);
    var mainBody = new T.Mesh(new T.BoxGeometry(1.88, 0.44, 1.06), matBody);
    mainBody.position.set(0.02, 0.08, 0);
    var trimStripe = new T.Mesh(new T.BoxGeometry(1.92, 0.12, 1.09), matTrim);
    trimStripe.position.set(0.02, 0.06, 0);
    var hood = new T.Mesh(new T.BoxGeometry(0.68, 0.28, 0.98), matCab);
    hood.position.set(0.6, 0.34, 0);
    hood.rotation.z = -0.12;
    var cab = new T.Mesh(new T.BoxGeometry(0.92, 0.56, 0.98), matCab);
    cab.position.set(-0.14, 0.54, 0);
    var roofCap = new T.Mesh(new T.BoxGeometry(0.84, 0.1, 0.92), matTrim);
    roofCap.position.set(-0.14, 0.85, 0);
    var windshield = new T.Mesh(new T.BoxGeometry(0.14, 0.4, 0.86), matGlass);
    windshield.position.set(0.32, 0.54, 0);
    windshield.rotation.z = 0.22;
    var sideWindow = new T.Mesh(new T.BoxGeometry(0.58, 0.34, 1.01), matGlass);
    sideWindow.position.set(-0.16, 0.55, 0);

    // Front grill, bumper & headlights
    var bumper = new T.Mesh(new T.BoxGeometry(0.2, 0.22, 1.16), matChrome);
    bumper.position.set(0.98, -0.02, 0);
    var hl1 = new T.Mesh(new T.SphereGeometry(0.11, 8, 8), matHeadlight);
    hl1.position.set(0.96, 0.16, 0.34);
    var hl2 = hl1.clone(); hl2.position.z = -0.34;

    // Cute cartoon eyes on the side/front of cab so player sees truck's personality!
    var eyeGroup = new T.Group();
    eyeGroup.position.set(0.28, 0.56, 0.52);
    var eyeL = new T.Mesh(new T.SphereGeometry(0.15, 10, 8), matWhite);
    eyeL.scale.set(0.85, 1.05, 0.45);
    eyeL.position.set(-0.11, 0, 0);
    var eyeR = eyeL.clone(); eyeR.position.set(0.13, 0, 0);
    var pupL = new T.Mesh(new T.SphereGeometry(0.08, 8, 8), matDark);
    pupL.scale.set(0.85, 1.0, 0.5); pupL.position.set(-0.07, 0.01, 0.05);
    var pupR = pupL.clone(); pupR.position.set(0.17, 0.01, 0.05);
    var smile = new T.Mesh(new T.TorusGeometry(0.16, 0.032, 6, 12, Math.PI), matWhite);
    smile.rotation.z = Math.PI;
    smile.position.set(0.32, -0.36, 0.03);
    eyeGroup.add(eyeL, eyeR, pupL, pupR, smile);

    // Exhaust pipes + glowing boost flames
    var pipe1 = new T.Mesh(new T.CylinderGeometry(0.08, 0.09, 0.45, 8), matChrome);
    pipe1.rotation.z = 0.5; pipe1.position.set(-0.94, 0.24, 0.32);
    var pipe2 = pipe1.clone(); pipe2.position.z = -0.32;
    var boostFlames = new T.Group();
    var flameMatOut = basic(0xff6b00);
    var flameMatIn = basic(0xfff059);
    for (var fi = -1; fi <= 1; fi += 2) {
      var fl1 = new T.Mesh(new T.ConeGeometry(0.17, 0.85, 8), flameMatOut);
      fl1.rotation.z = Math.PI / 2; fl1.position.set(-1.35, 0.16, fi * 0.32);
      var fl2 = new T.Mesh(new T.ConeGeometry(0.09, 0.5, 8), flameMatIn);
      fl2.rotation.z = Math.PI / 2; fl2.position.set(-1.25, 0.16, fi * 0.32);
      boostFlames.add(fl1, fl2);
    }
    boostFlames.visible = false;

    // Bouncing antenna + skin roof accessories
    var antennaPivot = new T.Group();
    antennaPivot.position.set(-0.48, 0.86, 0);
    var antStick = new T.Mesh(new T.CylinderGeometry(0.025, 0.035, 0.72, 6), matChrome);
    antStick.position.y = 0.36;
    var antBall = new T.Mesh(new T.SphereGeometry(0.13, 10, 8), matTrim);
    antBall.position.y = 0.74;
    antennaPivot.add(antStick, antBall);

    var accessories = {};
    // Shark fin
    var finGrp = new T.Group();
    var finMesh = new T.Mesh(new T.ConeGeometry(0.3, 0.65, 4), matCab);
    finMesh.scale.set(1.2, 1, 0.32); finMesh.rotation.z = 0.32; finMesh.position.set(-0.18, 1.12, 0);
    finGrp.add(finMesh);
    accessories.fin = finGrp;
    // Rally lightbar
    var lightsGrp = new T.Group();
    var lbar = new T.Mesh(new T.BoxGeometry(0.16, 0.12, 0.82), matFrame);
    lbar.position.set(0.05, 0.94, 0);
    lightsGrp.add(lbar);
    for (var li = -1; li <= 1; li++) {
      var lamp = new T.Mesh(new T.SphereGeometry(0.1, 8, 8), matHeadlight);
      lamp.position.set(0.12, 0.98, li * 0.28);
      lightsGrp.add(lamp);
    }
    accessories.lights = lightsGrp;
    // Dino spikes
    var spikesGrp = new T.Group();
    for (var di = 0; di < 3; di++) {
      var sp = new T.Mesh(new T.ConeGeometry(0.15, 0.36, 5), matTrim);
      sp.position.set(-0.42 + di * 0.28, 1.03, 0);
      spikesGrp.add(sp);
    }
    accessories.spikes = spikesGrp;
    // Pop Star crown
    var starAccGrp = new T.Group();
    var crownStar = new T.Mesh(GEO.star, matTrim);
    crownStar.scale.set(0.6, 0.6, 0.6); crownStar.position.set(-0.14, 1.18, 0);
    starAccGrp.add(crownStar);
    accessories.star = starAccGrp;
    // Space Rocket twin boosters
    var rocketAccGrp = new T.Group();
    for (var ri = -1; ri <= 1; ri += 2) {
      var thr = new T.Mesh(new T.CylinderGeometry(0.16, 0.19, 0.65, 10), matTrim);
      thr.rotation.z = Math.PI / 2; thr.position.set(-0.68, 0.56, ri * 0.42);
      rocketAccGrp.add(thr);
    }
    accessories.rocket = rocketAccGrp;

    truckChassis.add(
      chassisBar, mainBody, trimStripe, hood, cab, roofCap, windshield, sideWindow,
      bumper, hl1, hl2, eyeGroup, pipe1, pipe2, boostFlames, antennaPivot,
      finGrp, lightsGrp, spikesGrp, starAccGrp, rocketAccGrp
    );

    // 2 axles (4 big chunky monster-truck wheels!)
    function makeAxle() {
      var axle = new T.Group();
      var bar = new T.Mesh(new T.CylinderGeometry(0.07, 0.07, 1.24, 8), matChrome);
      bar.rotation.x = Math.PI / 2;
      axle.add(bar);
      for (var s = -1; s <= 1; s += 2) {
        var wheel = new T.Group();
        wheel.position.z = s * 0.56;
        var tire = new T.Mesh(new T.CylinderGeometry(MC.WHEEL_R, MC.WHEEL_R, 0.34, 14), matTire);
        tire.rotation.x = Math.PI / 2;
        var rimMesh = new T.Mesh(new T.CylinderGeometry(MC.WHEEL_R * 0.56, MC.WHEEL_R * 0.56, 0.36, 10), matRim);
        rimMesh.rotation.x = Math.PI / 2;
        var hub = new T.Mesh(new T.CylinderGeometry(0.11, 0.11, 0.39, 8), matChrome);
        hub.rotation.x = Math.PI / 2;
        // Visible spoke bar so spinning wheels look awesome!
        var spoke = new T.Mesh(new T.BoxGeometry(MC.WHEEL_R * 1.0, 0.08, 0.38), matFrame);
        wheel.add(tire, rimMesh, hub, spoke);
        axle.add(wheel);
      }
      return axle;
    }

    var rearAxle = makeAxle();
    var frontAxle = makeAxle();
    var strutRear = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, 0.38, 6), matTrim);
    strutRear.position.set(-MC.WHEEL_X, -0.22, 0.36);
    var strutFront = strutRear.clone();
    strutFront.position.x = MC.WHEEL_X;
    truckRoot.add(rearAxle, frontAxle);
    truckChassis.add(strutRear, strutFront);
    scene.add(truckRoot);

    // Blob shadow underneath truck
    var shadowMat = new T.MeshBasicMaterial({ color: 0x1e1833, transparent: true, opacity: 0.24, depthWrite: false });
    var truckShadow = new T.Mesh(new T.CircleGeometry(0.95, 16), shadowMat);
    truckShadow.rotation.x = -Math.PI / 2;
    scene.add(truckShadow);

    function applySkin(skinIdx) {
      var sk = MC.SKINS[skinIdx] || MC.SKINS[0];
      matBody.color.setHex(sk.body);
      matCab.color.setHex(sk.cab);
      matTrim.color.setHex(sk.trim);
      matRim.color.setHex(sk.rim);
      for (var k in accessories) accessories[k].visible = k === sk.accessory;
    }
    applySkin(0);

    /* -------------------------------------------------- level stage meshes */
    var levelGroup = new T.Group();
    scene.add(levelGroup);
    var starMeshes = [];
    var crateMeshes = [];
    var bumperMeshes = [];
    var hazardBubbles = [];
    var flagMesh = null;
    var flagBasePos = null;
    var flagGeo = null;
    var levelDisposables = [];

    var PLAT_STYLES = {
      book: { main: 0x3b8eea, top: 0xfff8e6, side: 0x2a6ec2 },
      ruler: { main: 0xf4be49, top: 0xffdf7d, side: 0xd4962a },
      eraser: { main: 0xff7da6, top: 0xffa6c2, side: 0x45b6ff },
      blockA: { main: 0xff5e7e, top: 0xff8da4, side: 0xdc3d5d },
      blockB: { main: 0xffc933, top: 0xffe27a, side: 0xe3a617 },
      blockC: { main: 0x2ec4ff, top: 0x80dfff, side: 0x169ad6 },
      moon: { main: 0x9b88e6, top: 0xc5b8ff, side: 0x7662c4 },
      ship: { main: 0x38c9d6, top: 0x94f3fc, side: 0x219aa8 }
    };

    var starMat = lambert(0xffc414, { emissive: 0xe66800, emissiveIntensity: 0.45 });
    var starOutlineMat = new T.MeshBasicMaterial({ color: 0x241c3b, side: T.BackSide });
    var starGlowTex = (function () {
      var c = document.createElement('canvas'); c.width = c.height = 64;
      var cx = c.getContext('2d'), rg = cx.createRadialGradient(32, 32, 4, 32, 32, 31);
      rg.addColorStop(0, 'rgba(255, 196, 36, 0.68)');
      rg.addColorStop(0.55, 'rgba(255, 152, 20, 0.28)');
      rg.addColorStop(1, 'rgba(255, 196, 36, 0)');
      cx.fillStyle = rg; cx.fillRect(0, 0, 64, 64);
      var tx = new T.CanvasTexture(c);
      if (T.SRGBColorSpace) tx.colorSpace = T.SRGBColorSpace;
      return tx;
    })();
    var starGlowMat = new T.MeshBasicMaterial({ map: starGlowTex, transparent: true, depthWrite: false });
    var starHaloMat = new T.MeshBasicMaterial({ color: 0xffa614, transparent: true, opacity: 0.42, side: T.DoubleSide, depthWrite: false });
    var deskShadowMat = new T.MeshBasicMaterial({ color: 0x241608, transparent: true, opacity: 0.26, depthWrite: false });
    var deskMatGreen = lambert(0x52c4a8);
    var deskBrassMat = lambert(0xffd046, { emissive: 0x6b4500, emissiveIntensity: 0.2 });
    var deskDarkMat = lambert(0x1f4f8e);
    var crateMat = lambert(0xd99043);
    var crateTrimMat = lambert(0x9c5922);
    var hazardMat = lambert(0xff3b3b, { emissive: 0xa81600, emissiveIntensity: 0.38 });
    var hazardTopMat = basic(0xffcb2e);
    var bumperMat = lambert(0xff4fa3, { emissive: 0x6b0b38, emissiveIntensity: 0.2 });

    function clearGroup(grp, disposables) {
      while (grp.children.length) grp.remove(grp.children[0]);
      for (var i = 0; i < disposables.length; i++) disposables[i].dispose();
      disposables.length = 0;
    }

    var checkeredTex = (function () {
      var c = document.createElement('canvas');
      c.width = 96; c.height = 64;
      var ctx = c.getContext('2d');
      var cols = 6, rows = 4, cw = 16, ch = 16;
      for (var r = 0; r < rows; r++) {
        for (var k = 0; k < cols; k++) {
          ctx.fillStyle = (r + k) % 2 === 0 ? '#ffffff' : '#241c3b';
          ctx.fillRect(k * cw, r * ch, cw, ch);
        }
      }
      ctx.strokeStyle = '#241c3b';
      ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, 92, 60);
      var tx = new T.CanvasTexture(c);
      tx.magFilter = T.NearestFilter;
      tx.minFilter = T.LinearFilter;
      if (T.SRGBColorSpace) tx.colorSpace = T.SRGBColorSpace;
      return tx;
    })();

    var flagMatShared = new T.MeshLambertMaterial({ map: checkeredTex, side: T.DoubleSide, emissive: 0x222222, emissiveIntensity: 0.25 });

    function buildCheckeredFlag(gx, gy) {
      var grp = new T.Group();
      grp.position.set(toX(gx), toY(gy), 0);

      // Glowing finish pad on ground
      var pad = new T.Mesh(new T.BoxGeometry(2.2, 0.16, 1.55), lambert(0x2fe078, { emissive: 0x0d7a3a, emissiveIntensity: 0.35 }));
      pad.position.set(0, 0.07, 0);
      grp.add(pad);

      // Pole + golden finial
      var pole = new T.Mesh(new T.CylinderGeometry(0.085, 0.095, 2.8, 8), matChrome);
      pole.position.set(0.35, 1.4, -0.35);
      var finial = new T.Mesh(new T.SphereGeometry(0.2, 10, 8), starMat);
      finial.position.set(0.35, 2.85, -0.35);
      grp.add(pole, finial);

      // Crisp waving checkered flag cloth using CanvasTexture!
      var geo = new T.PlaneGeometry(1.62, 1.05, 8, 4);
      var pos = geo.attributes.position;
      var basePos = new Float32Array(pos.array.length);
      for (var i = 0; i < pos.count; i++) {
        var px = pos.getX(i) + 0.81; // left edge attached to pole
        var py = pos.getY(i);
        pos.setX(i, px);
        basePos[i * 3] = px; basePos[i * 3 + 1] = py; basePos[i * 3 + 2] = 0;
      }
      var cloth = new T.Mesh(geo, flagMatShared);
      cloth.position.set(0.38, 2.24, -0.35);
      grp.add(cloth);

      flagMesh = cloth;
      flagGeo = geo;
      flagBasePos = basePos;
      levelDisposables.push(geo);
      return grp;
    }

    function loadLevel(world) {
      clearGroup(levelGroup, levelDisposables);
      starMeshes = [];
      crateMeshes = [];
      bumperMeshes = [];
      hazardBubbles = [];
      flagMesh = null; flagGeo = null; flagBasePos = null;

      var lv = world.level;
      setTheme(lv.world);

      // Platforms (chunky 3D blocks with bright top cap strip & crisp shadow lip)
      for (var i = 0; i < lv.platforms.length; i++) {
        var p = lv.platforms[i];
        var st = PLAT_STYLES[p.style] || PLAT_STYLES.book;
        var mMain = lambert(st.main);
        var mTop = lambert(st.top);
        var mSide = lambert(st.side);
        levelDisposables.push(mMain, mTop, mSide);

        var body = new T.Mesh(GEO.unitBox, mMain);
        body.scale.set(p.w, Math.max(0.15, p.h - 0.18), 1.9);
        body.position.set(toX(p.x + p.w / 2), toY(p.y + (p.h - 0.18) / 2), 0);
        levelGroup.add(body);

        // Crisp bevel shadow strip right under the top cap
        var lip = new T.Mesh(GEO.unitBox, mSide);
        lip.scale.set(p.w + 0.04, 0.16, 1.96);
        lip.position.set(toX(p.x + p.w / 2), toY(p.y + p.h - 0.25), 0);
        levelGroup.add(lip);

        var cap = new T.Mesh(GEO.unitBox, mTop);
        cap.scale.set(p.w + 0.1, 0.24, 2.04);
        cap.position.set(toX(p.x + p.w / 2), toY(p.y + p.h - 0.08), 0);
        levelGroup.add(cap);

        // Decorative desk craft (beveled mat, sculpted drawers + brass handles, desktop props & contact shadow)
        if (p.style === 'book' && p.h > 1.5) {
          // Soft contact shadow grounding the desk on the wooden tabletop
          if (p.y <= 0.1) {
            var cShad = new T.Mesh(GEO.unitBox, deskShadowMat);
            cShad.scale.set(p.w + 0.46, 0.08, 2.35);
            cShad.position.set(toX(p.x + p.w / 2), toY(0.04), 0.06);
            levelGroup.add(cShad);
          }
          // Beveled desk mat resting cleanly on the top surface
          var matStrip = new T.Mesh(GEO.unitBox, deskMatGreen);
          matStrip.scale.set(Math.max(1.2, p.w - 0.7), 0.06, 1.55);
          matStrip.position.set(toX(p.x + p.w / 2), toY(p.y + p.h + 0.05), -0.05);
          levelGroup.add(matStrip);
          // Darker bottom kick-plate & side corner pilasters for 3D furniture depth
          var kick = new T.Mesh(GEO.unitBox, deskDarkMat);
          kick.scale.set(p.w - 0.06, 0.34, 1.94);
          kick.position.set(toX(p.x + p.w / 2), toY(p.y + 0.17), 0);
          levelGroup.add(kick);
          for (var sd = -1; sd <= 1; sd += 2) {
            var pil = new T.Mesh(GEO.unitBox, mSide);
            pil.scale.set(0.28, p.h - 0.32, 1.96);
            pil.position.set(toX(p.x + p.w / 2 + sd * (p.w / 2 - 0.16)), toY(p.y + (p.h - 0.18) / 2), 0.01);
            levelGroup.add(pil);
          }
          var spine = new T.Mesh(GEO.unitBox, mTop);
          spine.scale.set(p.w - 0.56, 0.14, 1.96);
          spine.position.set(toX(p.x + p.w / 2), toY(p.y + p.h - 0.52), 0.01);
          levelGroup.add(spine);
          if (p.w >= 4.2 && p.h >= 3.0) {
            // Two stacked sculpted drawers with recessed rims & 3D brass bar handles
            var dw = Math.min(3.8, p.w - 1.3), dh = (p.h - 1.55) * 0.44;
            for (var dr = 0; dr < 2; dr++) {
              var dy = p.y + 0.68 + dh * 0.5 + dr * (dh + 0.24);
              var dRim = new T.Mesh(GEO.unitBox, deskDarkMat);
              dRim.scale.set(dw + 0.14, dh + 0.12, 0.06);
              dRim.position.set(toX(p.x + p.w / 2), toY(dy), 0.94);
              var dFront = new T.Mesh(GEO.unitBox, mSide);
              dFront.scale.set(dw, dh, 0.12);
              dFront.position.set(toX(p.x + p.w / 2), toY(dy), 0.97);
              var dTopHl = new T.Mesh(GEO.unitBox, mTop);
              dTopHl.scale.set(dw - 0.08, 0.08, 0.14);
              dTopHl.position.set(toX(p.x + p.w / 2), toY(dy + dh * 0.46), 0.98);
              var hBar = new T.Mesh(GEO.unitBox, deskBrassMat);
              hBar.scale.set(Math.min(1.15, dw * 0.34), 0.13, 0.14);
              hBar.position.set(toX(p.x + p.w / 2), toY(dy + 0.04), 1.1);
              var hPostL = new T.Mesh(GEO.unitBox, deskBrassMat);
              hPostL.scale.set(0.11, 0.11, 0.14);
              hPostL.position.set(toX(p.x + p.w / 2 - Math.min(0.45, dw * 0.13)), toY(dy + 0.04), 1.04);
              var hPostR = hPostL.clone();
              hPostR.position.x = toX(p.x + p.w / 2 + Math.min(0.45, dw * 0.13));
              levelGroup.add(dRim, dFront, dTopHl, hBar, hPostL, hPostR);
            }
          }
          // Cozy background desktop props on wide desks (placed behind z=-0.74, clear of start/goal/crates)
          if (p.w >= 5.5 && p.h >= 3.2) {
            var propSafe = function (wx) {
              if (Math.abs(wx - lv.start[0]) < 1.35 || Math.abs(wx - lv.goal[0]) < 1.35) return false;
              for (var ci2 = 0; ci2 < world.crates.length; ci2++) if (Math.abs(wx - world.crates[ci2].x) < 1.05) return false;
              return wx > p.x + 0.65 && wx < p.x + p.w - 0.65;
            };
            var bx = p.x < 8 ? p.x + p.w - 1.35 : p.x + 1.25;
            if (propSafe(bx)) {
              var bStack = new T.Group();
              bStack.position.set(toX(bx), toY(p.y + p.h + 0.08), -0.76);
              var bSh = new T.Mesh(GEO.unitBox, deskShadowMat);
              bSh.scale.set(1.55, 0.04, 0.95);
              var b1 = new T.Mesh(GEO.unitBox, lambert(p.x < 8 ? 0xff6b8b : 0x9b6bff));
              b1.scale.set(1.36, 0.26, 0.82); b1.position.y = 0.14;
              var b1p = new T.Mesh(GEO.unitBox, matWhite);
              b1p.scale.set(1.26, 0.18, 0.85); b1p.position.y = 0.14;
              var b2 = new T.Mesh(GEO.unitBox, lambert(p.x < 8 ? 0x3ed68a : 0xffca3a));
              b2.scale.set(1.12, 0.24, 0.72); b2.position.set(0.06, 0.39, 0.02); b2.rotation.y = 0.14;
              var b2p = new T.Mesh(GEO.unitBox, matWhite);
              b2p.scale.set(1.02, 0.16, 0.75); b2p.position.copy(b2.position); b2p.rotation.y = 0.14;
              bStack.add(bSh, b1, b1p, b2, b2p);
              levelGroup.add(bStack);
            }
            var ex = p.x < 8 ? p.x + 0.95 : p.x + p.w * 0.52;
            if (propSafe(ex)) {
              var cup = new T.Group();
              cup.position.set(toX(ex), toY(p.y + p.h + 0.08), -0.78);
              if (p.x >= 8) {
                var cBody = new T.Mesh(GEO.cyl, lambert(0xff7ba3));
                cBody.scale.set(0.32, 0.78, 0.32); cBody.position.y = 0.39;
                var cRim = new T.Mesh(GEO.cyl, matWhite);
                cRim.scale.set(0.35, 0.12, 0.35); cRim.position.y = 0.74;
                var p1 = new T.Mesh(GEO.cyl, lambert(0xffd23f));
                p1.scale.set(0.065, 1.15, 0.065); p1.position.set(-0.08, 0.82, 0); p1.rotation.z = 0.16;
                var p2 = new T.Mesh(GEO.cyl, lambert(0x22b8ff));
                p2.scale.set(0.065, 1.05, 0.065); p2.position.set(0.09, 0.78, 0.04); p2.rotation.z = -0.18;
                cup.add(cBody, cRim, p1, p2);
              } else {
                var er1 = new T.Mesh(GEO.unitBox, lambert(0xff7aa2));
                er1.scale.set(0.54, 0.24, 0.38); er1.position.set(-0.14, 0.12, 0);
                var er2 = new T.Mesh(GEO.unitBox, lambert(0x45b6ff));
                er2.scale.set(0.32, 0.24, 0.38); er2.position.set(0.28, 0.12, 0);
                cup.add(er1, er2);
                cup.rotation.y = 0.22;
              }
              levelGroup.add(cup);
            }
          }
        } else if (p.style === 'ruler') {
          var nTicks = Math.min(10, Math.floor(p.w * 1.1));
          for (var tk = 0; tk < nTicks; tk++) {
            var tick = new T.Mesh(GEO.unitBox, mSide);
            tick.scale.set(0.08, tk % 2 === 0 ? 0.48 : 0.28, 0.06);
            tick.position.set(toX(p.x + 0.45 + tk * 0.85), toY(p.y + p.h - 0.48), 0.96);
            levelGroup.add(tick);
          }
        } else if (p.style === 'blockA' || p.style === 'blockB' || p.style === 'blockC') {
          if (p.w >= 3.2 && p.h >= 2.2) {
            var inset = new T.Mesh(GEO.unitBox, mSide);
            inset.scale.set(p.w - 0.7, p.h - 1.0, 0.05);
            inset.position.set(toX(p.x + p.w / 2), toY(p.y + (p.h - 0.3) / 2), 0.95);
            levelGroup.add(inset);
          }
        } else if (p.style === 'moon') {
          for (var cr = 0; cr < Math.min(3, Math.floor(p.w / 2)); cr++) {
            var crater = new T.Mesh(GEO.cyl, mSide);
            crater.rotation.x = Math.PI / 2;
            crater.scale.set(0.36, 0.06, 0.36);
            crater.position.set(toX(p.x + 1.1 + cr * 2.1), toY(p.y + p.h * 0.55), 0.96);
            levelGroup.add(crater);
          }
        }
      }

      // Start launch pad badge
      var startPad = new T.Mesh(new T.BoxGeometry(1.9, 0.12, 1.5), lambert(0xffe14d));
      startPad.position.set(toX(lv.start[0]), toY(lv.start[1] - 0.78), 0);
      levelGroup.add(startPad);

      // Hazards (bright toy lava/danger blocks with animated bubbles)
      for (var hi = 0; hi < (lv.hazards || []).length; hi++) {
        var h = lv.hazards[hi];
        var hb = new T.Mesh(GEO.unitBox, hazardMat);
        hb.scale.set(h.w, h.h, 1.8);
        hb.position.set(toX(h.x + h.w / 2), toY(h.y + h.h / 2), 0);
        levelGroup.add(hb);
        var hTop = new T.Mesh(GEO.unitBox, hazardTopMat);
        hTop.scale.set(h.w - 0.08, 0.14, 1.86);
        hTop.position.set(toX(h.x + h.w / 2), toY(h.y + h.h - 0.04), 0);
        levelGroup.add(hTop);
        var nb = Math.max(2, Math.min(6, Math.floor(h.w / 1.8)));
        for (var bi = 0; bi < nb; bi++) {
          var bub = new T.Mesh(GEO.sphere, hazardTopMat);
          bub.scale.set(0.22, 0.16, 0.22);
          bub.position.set(toX(h.x + ((bi + 0.5) / nb) * h.w), toY(h.y + h.h + 0.05), ((bi % 2) - 0.5) * 0.5);
          levelGroup.add(bub);
          hazardBubbles.push({ mesh: bub, baseY: bub.position.y, phase: bi * 1.4 + hi });
        }
      }

      // Bouncy star bumpers
      for (var bpi = 0; bpi < (lv.bumpers || []).length; bpi++) {
        var bp = lv.bumpers[bpi];
        var bg = new T.Group();
        bg.position.set(toX(bp.x), toY(bp.y), 0);
        var ring = new T.Mesh(new T.CylinderGeometry(bp.r, bp.r, 0.65, 16), bumperMat);
        ring.rotation.x = Math.PI / 2;
        var inner = new T.Mesh(GEO.star, starMat);
        inner.scale.set(bp.r * 1.15, bp.r * 1.15, 0.9);
        inner.position.z = 0.28;
        bg.add(ring, inner);
        levelGroup.add(bg);
        bumperMeshes.push({ group: bg, pop: 0 });
      }

      // Smashable wooden toy crates
      for (var ci = 0; ci < world.crates.length; ci++) {
        var cObj = world.crates[ci];
        var cg = new T.Group();
        var box = new T.Mesh(GEO.unitBox, crateMat);
        box.scale.set(cObj.w, cObj.h, cObj.w);
        var band1 = new T.Mesh(GEO.unitBox, crateTrimMat);
        band1.scale.set(cObj.w + 0.04, 0.12, cObj.w + 0.04);
        band1.position.y = 0.2;
        var band2 = band1.clone(); band2.position.y = -0.2;
        cg.add(box, band1, band2);
        cg.position.set(toX(cObj.x), toY(cObj.y + cObj.h / 2), 0);
        levelGroup.add(cg);
        crateMeshes.push(cg);
      }

      // Spinning 3D stars with crisp dark cartoon outline + warm glow halo
      for (var si = 0; si < world.stars.length; si++) {
        var stObj = world.stars[si];
        var sg = new T.Group();
        sg.position.set(toX(stObj.x), toY(stObj.y), 0);
        var sm = new T.Mesh(GEO.star, starMat);
        var outline = new T.Mesh(GEO.star, starOutlineMat);
        outline.scale.set(1.2, 1.2, 1.34);
        sm.add(outline);
        var glow = new T.Mesh(new T.PlaneGeometry(1.75, 1.75), starGlowMat);
        glow.position.z = -0.26;
        var halo = new T.Mesh(new T.RingGeometry(0.5, 0.62, 18), starHaloMat);
        halo.position.z = -0.18;
        sg.add(glow, halo, sm);
        levelGroup.add(sg);
        starMeshes.push({ group: sg, star: sm, halo: halo, glow: glow, baseY: sg.position.y, phase: si * 1.7 });
      }

      // Checkered flag
      levelGroup.add(buildCheckeredFlag(lv.goal[0], lv.goal[1]));

      // Rebuild coach guide for this level (used on 1-1 or after struggles)
      buildCoachGuide(lv);
      syncStrokes(world, true);
    }

    /* ------------------------------------------- extruded 3D crayon tubes */
    var strokesGroup = new T.Group();
    scene.add(strokesGroup);
    // Vivid, saturated waxy crayon shading baked into vertex colors so colors pop brightly!
    var strokeMaterial = new T.MeshBasicMaterial({ vertexColors: true });
    var builtStrokeMeshes = {}; // id -> { mesh, ptCount }
    var activeMesh = null;
    var activePtCount = 0;

    // Builds ONE merged smooth 3D tube geometry with rounded dome endcaps & waxy pattern bands
    function buildCrayonTubeGeometry(pts, type) {
      var radial = 10;
      var R = MC.STROKE_R + 0.04;
      var cr = MC.CRAYONS[type] || MC.CRAYONS[0];
      C1.setHex(cr.hex);
      C2.setHex(cr.accent);

      // Precompute cumulative distance and smooth 2D normals at each point
      var nPts = pts.length;
      var cum = [0];
      var norms = [];
      for (var i = 1; i < nPts; i++) {
        var dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1];
        cum.push(cum[i - 1] + Math.sqrt(dx * dx + dy * dy));
      }
      for (i = 0; i < nPts; i++) {
        var p0 = pts[Math.max(0, i - 1)], p1 = pts[Math.min(nPts - 1, i + 1)];
        var tx = p1[0] - p0[0], ty = p1[1] - p0[1];
        var tl = Math.sqrt(tx * tx + ty * ty) || 1;
        norms.push([-ty / tl, tx / tl, tx / tl, ty / tl]); // [nx, ny, tx, ty]
      }

      var segs = nPts - 1;
      var bodyTris = segs * radial * 2;
      var capTris = radial * 2; // start + end dome caps
      var totalVerts = (bodyTris + capTris) * 3;
      var pos = new Float32Array(totalVerts * 3);
      var nor = new Float32Array(totalVerts * 3);
      var col = new Float32Array(totalVerts * 3);
      var o = 0;

      function pushV(x, y, z, nx, ny, nz, r, g, b) {
        pos[o] = x; pos[o + 1] = y; pos[o + 2] = z;
        nor[o] = nx; nor[o + 1] = ny; nor[o + 2] = nz;
        col[o] = r; col[o + 1] = g; col[o + 2] = b;
        o += 3;
      }

      function ringColor(distAlong, nx, ny, nz) {
        var mix = 0;
        if (type === 0) {
          mix = ny > 0.55 ? 0.45 : 0.0;
        } else if (type === 1) {
          mix = (Math.floor(distAlong * 2.2) % 2 === 0) ? 0.85 : 0.0;
        } else {
          mix = ((distAlong * 1.9) % 1) < 0.34 ? 0.88 : 0.0;
        }
        // Soft glossy 3D cylindrical lighting from top-front
        var shade = Math.min(1.18, Math.max(0.68, 0.84 + ny * 0.24 + nz * 0.16));
        return [
          Math.min(1, (C1.r + (C2.r - C1.r) * mix) * shade),
          Math.min(1, (C1.g + (C2.g - C1.g) * mix) * shade),
          Math.min(1, (C1.b + (C2.b - C1.b) * mix) * shade)
        ];
      }

      function ringPoint(idx, k) {
        var ang = (k / radial) * Math.PI * 2;
        var ca = Math.cos(ang), sa = Math.sin(ang);
        var nm = norms[idx];
        var nx = nm[0] * ca, ny = nm[1] * ca, nz = sa;
        var x = toX(pts[idx][0]) + nx * R;
        var y = toY(pts[idx][1]) + ny * R;
        var z = nz * R;
        var c = ringColor(cum[idx], nx, ny, nz);
        return [x, y, z, nx, ny, nz, c[0], c[1], c[2]];
      }

      for (i = 0; i < segs; i++) {
        for (var k = 0; k < radial; k++) {
          var k1 = (k + 1) % radial;
          var a = ringPoint(i, k);
          var b = ringPoint(i + 1, k);
          var c = ringPoint(i + 1, k1);
          var d = ringPoint(i, k1);
          pushV(a[0], a[1], a[2], a[3], a[4], a[5], a[6], a[7], a[8]);
          pushV(b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7], b[8]);
          pushV(c[0], c[1], c[2], c[3], c[4], c[5], c[6], c[7], c[8]);
          pushV(a[0], a[1], a[2], a[3], a[4], a[5], a[6], a[7], a[8]);
          pushV(c[0], c[1], c[2], c[3], c[4], c[5], c[6], c[7], c[8]);
          pushV(d[0], d[1], d[2], d[3], d[4], d[5], d[6], d[7], d[8]);
        }
      }

      // Rounded crayon endcaps
      var startTipX = toX(pts[0][0]) - norms[0][2] * R * 0.9;
      var startTipY = toY(pts[0][1]) - norms[0][3] * R * 0.9;
      for (k = 0; k < radial; k++) {
        var k1s = (k + 1) % radial;
        var pA = ringPoint(0, k1s), pB = ringPoint(0, k);
        pushV(startTipX, startTipY, 0, -norms[0][2], -norms[0][3], 0, C1.r, C1.g, C1.b);
        pushV(pA[0], pA[1], pA[2], pA[3], pA[4], pA[5], pA[6], pA[7], pA[8]);
        pushV(pB[0], pB[1], pB[2], pB[3], pB[4], pB[5], pB[6], pB[7], pB[8]);
      }

      var last = nPts - 1;
      var endTipX = toX(pts[last][0]) + norms[last][2] * R * 0.9;
      var endTipY = toY(pts[last][1]) + norms[last][3] * R * 0.9;
      for (k = 0; k < radial; k++) {
        var k1e = (k + 1) % radial;
        var qA = ringPoint(last, k), qB = ringPoint(last, k1e);
        pushV(endTipX, endTipY, 0, norms[last][2], norms[last][3], 0, C1.r, C1.g, C1.b);
        pushV(qA[0], qA[1], qA[2], qA[3], qA[4], qA[5], qA[6], qA[7], qA[8]);
        pushV(qB[0], qB[1], qB[2], qB[3], qB[4], qB[5], qB[6], qB[7], qB[8]);
      }

      var geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new T.BufferAttribute(nor, 3));
      geo.setAttribute('color', new T.BufferAttribute(col, 3));
      geo.computeBoundingSphere();
      return geo;
    }

    function syncStrokes(world, forceClear) {
      if (forceClear) {
        for (var k in builtStrokeMeshes) {
          strokesGroup.remove(builtStrokeMeshes[k].mesh);
          builtStrokeMeshes[k].mesh.geometry.dispose();
        }
        builtStrokeMeshes = {};
        if (activeMesh) {
          strokesGroup.remove(activeMesh);
          activeMesh.geometry.dispose();
          activeMesh = null;
          activePtCount = 0;
        }
      }

      var present = {};
      for (var i = 0; i < world.strokes.length; i++) {
        var st = world.strokes[i];
        present[st.id] = true;
        var entry = builtStrokeMeshes[st.id];
        if (!entry || entry.ptCount !== st.pts.length) {
          if (entry) {
            strokesGroup.remove(entry.mesh);
            entry.mesh.geometry.dispose();
          }
          var mesh = new T.Mesh(buildCrayonTubeGeometry(st.pts, st.type), strokeMaterial);
          strokesGroup.add(mesh);
          builtStrokeMeshes[st.id] = { mesh: mesh, ptCount: st.pts.length };
        }
      }
      for (var id in builtStrokeMeshes) {
        if (!present[id]) {
          strokesGroup.remove(builtStrokeMeshes[id].mesh);
          builtStrokeMeshes[id].mesh.geometry.dispose();
          delete builtStrokeMeshes[id];
        }
      }

      // Live active stroke preview
      var act = world.activeStroke;
      if (act && act.pts.length >= 2) {
        if (!activeMesh || activePtCount !== act.pts.length) {
          if (activeMesh) {
            strokesGroup.remove(activeMesh);
            activeMesh.geometry.dispose();
          }
          activeMesh = new T.Mesh(buildCrayonTubeGeometry(act.pts, act.type), strokeMaterial);
          strokesGroup.add(activeMesh);
          activePtCount = act.pts.length;
        }
      } else if (activeMesh) {
        strokesGroup.remove(activeMesh);
        activeMesh.geometry.dispose();
        activeMesh = null;
        activePtCount = 0;
      }
    }

    /* --------------------------------------------- floating 3D crayon tip */
    var cursorCrayon = new T.Group();
    var cursorWaxMat = lambert(MC.CRAYONS[0].hex);
    var cursorTip = new T.Mesh(new T.ConeGeometry(0.19, 0.55, 8), cursorWaxMat);
    cursorTip.rotation.x = Math.PI;
    cursorTip.position.y = 0.27;
    var cursorBarrel = new T.Mesh(new T.CylinderGeometry(0.21, 0.21, 1.5, 8), cursorWaxMat);
    cursorBarrel.position.y = 1.28;
    var cursorWrap = new T.Mesh(new T.CylinderGeometry(0.225, 0.225, 0.85, 8), lambert(0x282338));
    cursorWrap.position.y = 1.2;
    cursorCrayon.add(cursorTip, cursorBarrel, cursorWrap);
    cursorCrayon.rotation.z = -0.42;
    cursorCrayon.visible = false;
    scene.add(cursorCrayon);

    /* ------------------------------------------ 3D ghost guide (teach-by-doing) */
    var coachGroup = new T.Group();
    var coachMat = new T.MeshBasicMaterial({ color: 0x16a8ff, transparent: true, opacity: 0.85, depthWrite: false });
    var coachRimMat = new T.MeshBasicMaterial({ color: 0x241c3b, transparent: true, opacity: 0.55, depthWrite: false });
    var coachDots = [];
    var coachPts = [];
    var coachCrayon = cursorCrayon.clone();
    coachCrayon.scale.set(0.88, 0.88, 0.88);
    scene.add(coachGroup);

    function buildCoachGuide(lv) {
      while (coachGroup.children.length) coachGroup.remove(coachGroup.children[0]);
      coachDots = [];
      coachPts = [];
      var sol = lv.solution && lv.solution[0];
      if (!sol || !sol.pts || sol.pts.length < 2) { coachGroup.visible = false; return; }
      // Sample smooth arched chalk dashes along the reference stroke
      var raw = sol.pts;
      var totalLen = 0;
      for (var li = 1; li < raw.length; li++) totalLen += Math.hypot(raw[li][0] - raw[li - 1][0], raw[li][1] - raw[li - 1][1]);
      var acc = 0;
      for (var i = 1; i < raw.length; i++) {
        var x0 = raw[i - 1][0], y0 = raw[i - 1][1], x1 = raw[i][0], y1 = raw[i][1];
        var d = Math.hypot(x1 - x0, y1 - y0);
        var n = Math.max(2, Math.ceil(d / 0.72));
        for (var k = 0; k < n; k++) {
          var f = k / n;
          var u = totalLen > 0 ? (acc + d * f) / totalLen : 0;
          var arch = lv.id === '1-1' ? Math.sin(u * Math.PI) * 0.28 : 0;
          coachPts.push([x0 + (x1 - x0) * f, y0 + (y1 - y0) * f + arch]);
        }
        acc += d;
      }
      coachPts.push(raw[raw.length - 1]);
      var colHex = MC.CRAYONS[sol.type || 0].hex;
      coachMat.color.setHex(colHex);
      for (var j = 0; j < coachPts.length - 1; j++) {
        var pA = coachPts[j], pB = coachPts[j + 1];
        var mx = (pA[0] + pB[0]) * 0.5, my = (pA[1] + pB[1]) * 0.5;
        var ang = Math.atan2(pB[1] - pA[1], pB[0] - pA[0]);
        var dashGrp = new T.Group();
        dashGrp.position.set(toX(mx), toY(my), 0.24);
        dashGrp.rotation.z = ang;
        var back = new T.Mesh(GEO.unitBox, coachRimMat);
        back.scale.set(0.48, 0.24, 0.08);
        back.position.z = -0.02;
        var core = new T.Mesh(GEO.unitBox, coachMat);
        core.scale.set(0.4, 0.15, 0.1);
        dashGrp.add(back, core);
        coachGroup.add(dashGrp);
        coachDots.push(dashGrp);
      }
      coachGroup.add(coachCrayon);
      coachGroup.visible = false;
    }

    /* ------------------------------------- pooled 3D particles (Instanced) */
    var MAX_P = 140;
    var pMesh = new T.InstancedMesh(GEO.octa, new T.MeshBasicMaterial({ color: 0xffffff }), MAX_P);
    pMesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    pMesh.frustumCulled = false;
    pMesh.count = 0;
    scene.add(pMesh);

    var particles = [];
    for (var pi = 0; pi < MAX_P; pi++) {
      particles.push({ active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, size: 1, g: -12, col: 0xffffff, spin: 0 });
    }
    var pNext = 0;
    var pSeed = 9001;
    function pRand() { pSeed = (pSeed * 16807) % 2147483647; return (pSeed - 1) / 2147483646; }

    function burst(wx, wy, opts) {
      if (view.calm) return;
      opts = opts || {};
      var count = opts.count || 10;
      var cols = opts.colors || [0xffd23f, 0xffffff];
      var spd = opts.speed || 5.5;
      var life = opts.life || 0.65;
      var size = opts.size || 1.0;
      var g = opts.gravity != null ? opts.gravity : -13;
      var up = opts.up != null ? opts.up : 2.5;
      for (var i = 0; i < count; i++) {
        var p = particles[pNext];
        pNext = (pNext + 1) % MAX_P;
        var ang = pRand() * Math.PI * 2;
        var sp = spd * (0.35 + pRand() * 0.75);
        p.active = true;
        p.x = toX(wx) + (pRand() - 0.5) * 0.35;
        p.y = toY(wy) + (pRand() - 0.5) * 0.35;
        p.z = (pRand() - 0.5) * 0.7;
        p.vx = Math.cos(ang) * sp + (opts.vx || 0);
        p.vy = Math.sin(ang) * sp + up;
        p.vz = (pRand() - 0.5) * 2.5;
        p.life = life * (0.65 + pRand() * 0.45);
        p.max = p.life;
        p.size = size * (0.65 + pRand() * 0.7);
        p.g = g;
        p.col = cols[i % cols.length];
        p.spin = (pRand() - 0.5) * 12;
      }
    }

    function clearParticles() {
      for (var i = 0; i < MAX_P; i++) particles[i].active = false;
      pMesh.count = 0;
    }

    function stepParticles(dt) {
      if (view.calm) { clearParticles(); return; }
      var count = 0;
      for (var i = 0; i < MAX_P; i++) {
        var p = particles[i];
        if (!p.active) continue;
        p.life -= dt;
        if (p.life <= 0) { p.active = false; continue; }
        p.vy += p.g * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        var sc = p.size * Math.max(0.05, p.life / p.max);
        E1.set(p.life * p.spin, p.life * p.spin * 0.7, 0);
        Q1.setFromEuler(E1);
        S1.set(sc, sc, sc);
        V1.set(p.x, p.y, p.z);
        M4.compose(V1, Q1, S1);
        pMesh.setMatrixAt(count, M4);
        C1.setHex(p.col);
        pMesh.setColorAt(count, C1);
        count++;
      }
      pMesh.count = count;
      pMesh.instanceMatrix.needsUpdate = true;
      if (pMesh.instanceColor) pMesh.instanceColor.needsUpdate = true;
    }

    /* -------------------------------------------------- projection helpers */
    // Exact ray-plane intersection onto z = 0 gameplay plane!
    function unproject(clientX, clientY) {
      var r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return { x: HALF_W, y: HALF_H };
      var nx = ((clientX - r.left) / r.width) * 2 - 1;
      var ny = -((clientY - r.top) / r.height) * 2 + 1;
      V1.set(nx, ny, 0.5).unproject(camera);
      V2.copy(V1).sub(camera.position).normalize();
      if (Math.abs(V2.z) < 1e-6) return { x: HALF_W, y: HALF_H };
      var t = -camera.position.z / V2.z;
      V3.copy(camera.position).addScaledVector(V2, t);
      return { x: V3.x + HALF_W, y: V3.y + HALF_H };
    }

    // Projects world (wx, wy, wz) to page client pixel coords { x, y }
    function project(wx, wy, wz) {
      var r = canvas.getBoundingClientRect();
      V1.set(toX(wx), toY(wy), wz || 0).project(camera);
      return {
        x: r.left + (V1.x * 0.5 + 0.5) * r.width,
        y: r.top + (-V1.y * 0.5 + 0.5) * r.height
      };
    }

    /* ------------------------------------------------------- camera & resize */
    function updateCameraRig() {
      var tanHalfV = Math.tan((camera.fov * Math.PI) / 360);
      var needH = HALF_H + 0.55;
      var needW = HALF_W + 0.9;
      var zH = needH / tanHalfV;
      var zW = needW / (tanHalfV * Math.max(0.6, curAspect));
      camBasePos.set(0, 0.72, Math.max(zH, zW));
      camera.position.copy(camBasePos);
      camera.lookAt(camTarget);
      camera.updateMatrixWorld();
    }

    function resize(w, h) {
      curAspect = w / Math.max(1, h);
      renderer.setSize(w, h, false);
      camera.aspect = curAspect;
      camera.updateProjectionMatrix();
      updateCameraRig();
    }

    /* ----------------------------------------------------------- update */
    var animT = 0;
    var shakePower = 0;
    var blinkTimer = 2.6;
    var exhaustTimer = 0;

    function addShake(p) {
      if (!view.calm) shakePower = Math.max(shakePower, p);
    }

    function popBumper(idx) {
      if (bumperMeshes[idx]) bumperMeshes[idx].pop = 1.0;
    }

    function update(ctx) {
      var dt = Math.min(0.05, Math.max(0, ctx.dt || 0));
      animT += dt;
      var world = ctx.world;

      syncStrokes(world, false);

      // Update 3D monster truck transform, suspension & cute animations
      var tr = world.truck;
      truckRoot.visible = !world.crashed;
      truckShadow.visible = !world.crashed;
      if (!world.crashed) {
        var idleBob = (!world.rolling && !world.won && !view.calm) ? Math.sin(animT * 4.5) * 0.04 : 0;
        truckRoot.position.set(toX(tr.x), toY(tr.y) + idleBob, 0);
        truckRoot.rotation.z = tr.angle;
        // Squash-and-stretch chassis slightly on bounce/landing
        var squash = (tr.rearComp + tr.frontComp) * 0.45;
        truckChassis.scale.set(1 + squash * 0.25, 1 - squash * 0.3, 1);

        rearAxle.position.set(-MC.WHEEL_X, MC.WHEEL_Y + tr.rearComp, 0);
        frontAxle.position.set(MC.WHEEL_X, MC.WHEEL_Y + tr.frontComp, 0);
        rearAxle.rotation.z = tr.wheelSpin;
        frontAxle.rotation.z = tr.wheelSpin;

        // Bouncing antenna
        var idleAnt = !world.rolling ? Math.sin(animT * 5.2) * 0.16 : 0;
        antennaPivot.rotation.z = tr.antennaAngle + idleAnt;

        // Cute blinking eyes
        blinkTimer -= dt;
        var blinkScale = 1;
        if (blinkTimer <= 0) {
          blinkScale = 0.15;
          if (blinkTimer <= -0.11) blinkTimer = 2.4 + (animT % 1.8);
        }
        var excite = tr.boostTimer > 0 ? 1.18 : 1.0;
        eyeL.scale.set(0.85 * excite, 1.05 * blinkScale * excite, 0.45);
        eyeR.scale.set(0.85 * excite, 1.05 * blinkScale * excite, 0.45);

        // Boost exhaust flame flicker
        boostFlames.visible = tr.boostTimer > 0 && world.rolling;
        if (boostFlames.visible) {
          var fl = 0.85 + Math.sin(animT * 55) * 0.25;
          boostFlames.scale.set(fl, 1, 1);
        }

        // Cute exhaust puff particles while rolling
        exhaustTimer -= dt;
        if (world.rolling && !world.won && exhaustTimer <= 0 && !view.calm) {
          exhaustTimer = tr.boostTimer > 0 ? 0.04 : 0.13;
          burst(tr.x - 1.05, tr.y + 0.15, {
            count: 1,
            colors: tr.boostTimer > 0 ? [0xff9900, 0xffe64d] : [0xffffff, 0xe8f4ff],
            speed: 1.4, up: 0.9, vx: -1.5, life: 0.38, size: tr.boostTimer > 0 ? 1.15 : 0.72, gravity: 1.6
          });
        }

        // Shadow directly under truck
        truckShadow.position.set(toX(tr.x), toY(tr.y - 0.74), 0);
      }

      // Spinning stars
      for (var si = 0; si < starMeshes.length; si++) {
        var sm = starMeshes[si];
        var sData = world.stars[si];
        sm.group.visible = sData && !sData.collected;
        if (sm.group.visible) {
          sm.star.rotation.y = animT * 2.4 + sm.phase;
          sm.group.position.y = sm.baseY + (view.calm ? 0 : Math.sin(animT * 3.1 + sm.phase) * 0.16);
          var pulse = 1 + (view.calm ? 0 : Math.sin(animT * 4.5 + sm.phase) * 0.1);
          sm.halo.scale.set(pulse, pulse, 1);
        }
      }

      // Crates visibility
      for (var ci = 0; ci < crateMeshes.length; ci++) {
        crateMeshes[ci].visible = world.crates[ci] && !world.crates[ci].smashed;
      }

      // Bumper squash-pop recovery
      for (var bi = 0; bi < bumperMeshes.length; bi++) {
        var bm = bumperMeshes[bi];
        if (bm.pop > 0) {
          bm.pop = Math.max(0, bm.pop - dt * 4.5);
          var sc = 1 + Math.sin(bm.pop * Math.PI) * 0.35;
          bm.group.scale.set(sc, sc, 1);
        } else {
          bm.group.scale.set(1, 1, 1);
        }
      }

      // Hazard bubbles bobbing
      if (!view.calm) {
        for (var hi = 0; hi < hazardBubbles.length; hi++) {
          var hb = hazardBubbles[hi];
          hb.mesh.position.y = hb.baseY + Math.sin(animT * 4.2 + hb.phase) * 0.08;
        }
      }

      // Waving checkered flag
      if (flagMesh && flagGeo && flagBasePos && !view.calm) {
        var fp = flagGeo.attributes.position;
        for (var vi = 0; vi < fp.count; vi++) {
          var bx = flagBasePos[vi * 3];
          var by = flagBasePos[vi * 3 + 1];
          var wave = (bx / 1.5) * Math.sin(animT * 6.5 - bx * 3.8 + by * 1.4) * 0.16;
          fp.setZ(vi, wave);
        }
        fp.needsUpdate = true;
      }

      // World background idle animations
      if (!view.calm) {
        if (activeTheme === 1) {
          for (var pw = 0; pw < pinwheels.length; pw++) {
            pinwheels[pw].rotation.z -= dt * (1.2 + pw * 0.35);
          }
        } else if (activeTheme === 2) {
          spaceOrbiters.saturn.rotation.y = animT * 0.35;
          spaceOrbiters.moon.position.y = 4.7 + Math.sin(animT * 1.4) * 0.22;
          spaceOrbiters.rocket.position.y = -2.2 + Math.sin(animT * 2.2) * 0.25;
        }
      }

      // Floating 3D crayon tip cursor (hides cleanly while watching the truck drive unless drawing)
      if (ctx.pointer && ctx.pointer.visible && ctx.mode === 'play' && (!world.rolling || ctx.pointer.drawing)) {
        cursorCrayon.visible = true;
        cursorWaxMat.color.setHex(MC.CRAYONS[world.crayonType].hex);
        cursorCrayon.position.set(toX(ctx.pointer.x), toY(ctx.pointer.y), 0.28);
        cursorCrayon.rotation.z = ctx.pointer.drawing ? -0.58 : -0.36;
      } else {
        cursorCrayon.visible = false;
      }

      // Ghost guide coach (animated pulsing dashed chalk arc + moving crayon)
      coachGroup.visible = !!ctx.showCoach && coachPts.length >= 2;
      if (coachGroup.visible) {
        var ct = (animT * 0.58) % 1.25;
        var frac = Math.min(1, ct);
        var idx = Math.min(coachPts.length - 1, Math.floor(frac * (coachPts.length - 1)));
        var nxt = Math.min(coachPts.length - 1, idx + 1);
        var sub = frac * (coachPts.length - 1) - idx;
        var gx = coachPts[idx][0] + (coachPts[nxt][0] - coachPts[idx][0]) * sub;
        var gy = coachPts[idx][1] + (coachPts[nxt][1] - coachPts[idx][1]) * sub;
        coachCrayon.position.set(toX(gx), toY(gy), 0.35);
        var fade = ct > 1.0 ? Math.max(0, 1 - (ct - 1.0) * 4) : 1;
        var nudgeBoost = ctx.guideNudge ? 1.22 : 1.0;
        coachMat.opacity = ctx.guideNudge ? 0.95 : (0.68 + Math.sin(animT * 4.5) * 0.2);
        coachRimMat.opacity = ctx.guideNudge ? 0.72 : 0.48;
        for (var dj = 0; dj < coachDots.length; dj++) {
          var wave = view.calm ? 1 : (0.88 + 0.26 * Math.sin(animT * 5.2 - dj * 0.55));
          var scd = wave * nudgeBoost;
          coachDots[dj].scale.set(scd, scd, 1);
        }
        coachCrayon.visible = !view.calm && fade > 0.1;
      }

      // Screen shake + subtle title camera sway
      if (shakePower > 0) {
        shakePower = Math.max(0, shakePower - dt * 2.8);
      }
      var sx = shakePower > 0 && !view.calm ? (Math.sin(animT * 90) * shakePower * 0.22) : 0;
      var sy = shakePower > 0 && !view.calm ? (Math.cos(animT * 78) * shakePower * 0.18) : 0;
      var titleSway = ctx.mode === 'title' && !view.calm ? Math.sin(animT * 0.65) * 0.42 : 0;
      camera.position.set(camBasePos.x + sx + titleSway, camBasePos.y + sy, camBasePos.z);
      camera.lookAt(camTarget);

      stepParticles(dt);
    }

    /* ---------------------------------- software WebGL pacing & fencing */
    var pace = Kit.webgl.pacer(renderer, { software: software });
    view.mayDraw = pace.mayDraw;

    view.render = function () {
      renderer.render(scene, camera);
      pace.markDrawn();
    };

    var slowCount = 0;
    view.frameTime = function (ms) {
      if (ms > 28) slowCount++; else slowCount = Math.max(0, slowCount - 0.5);
      if (slowCount > 90 && ratio > 0.75) {
        ratio = Math.max(0.75, ratio - 0.25);
        renderer.setPixelRatio(ratio);
        slowCount = 0;
        return true;
      }
      return false;
    };

    view.whenDrawn = pace.whenDrawn;

    view.loadLevel = loadLevel;
    view.applySkin = applySkin;
    view.syncStrokes = syncStrokes;
    view.update = update;
    view.resize = resize;
    view.unproject = unproject;
    view.project = project;
    view.burst = burst;
    view.clearParticles = clearParticles;
    view.addShake = addShake;
    view.popBumper = popBumper;
    view.particleCount = function () { return pMesh.count; };
    view.shakeAmount = function () { return shakePower; };
    view.dispose = function () { renderer.dispose(); };

    return view;
  };
})();
