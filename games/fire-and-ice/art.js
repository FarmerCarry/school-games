/* Fire & Ice (النار والجليد) — 2.5D Three.js ancient temple diorama renderer.
 * Merged vertex-colored beveled stone per level (1 draw call), 3 luminous temple
 * wings, animated recessed lava/water/goo pools, carved exit gates, color-coded
 * bridges/lifts/levers/buttons, pushable crates, spinning ruby/sapphire gems,
 * chunky animated 3D Fire & Ice heroes with 6 unlockable hats, 1P active arrow,
 * pooled InstancedMesh particles, and software-WebGL fencing/pacing. */
(function () {
  'use strict';
  var FI = window.FI;

  var CH_COLORS = [0xffbe2e, 0xb55cff, 0xff4f8b];
  var AUTO_COLOR = 0x2ee6c5;

  var THEMES = [
    { // Wing 0: Sunlit Golden Sandstone & Emerald Relief Temple
      sky: 0x1b1525,
      hemiSky: 0xfff0cc,
      hemiGnd: 0x6b4254,
      hemiInt: 1.32,
      sunCol: 0xffe9b5,
      sunInt: 1.52,
      rimCol: 0x56d8ff,
      rimInt: 0.56,
      top: 0xf4c878,
      front: 0xa66e46,
      side: 0x613e34,
      bottom: 0x3f272b,
      basin: 0x2d1d26,
      arch: 0xd49b5a,
      archTrim: 0xffdc7a,
      accent: 0x2fd496,
      vine: 0x2fa85e,
      vineHi: 0x6be078
    },
    { // Wing 1: Luminous Crystal Cavern Temple
      sky: 0x101c34,
      hemiSky: 0xdcf6ff,
      hemiGnd: 0x3b5485,
      hemiInt: 1.28,
      sunCol: 0xfff6e5,
      sunInt: 1.38,
      rimCol: 0x52e5ff,
      rimInt: 0.64,
      top: 0x95c6ea,
      front: 0x47688f,
      side: 0x2e4566,
      bottom: 0x1f304a,
      basin: 0x19253b,
      arch: 0x678cb8,
      archTrim: 0xa4ecff,
      accent: 0x45e8ff,
      vine: 0x36b8e8,
      vineHi: 0xa4f4ff
    },
    { // Wing 2: Warm Torchlit Obsidian Sanctum
      sky: 0x1d1122,
      hemiSky: 0xffdfc4,
      hemiGnd: 0x6b354c,
      hemiInt: 1.28,
      sunCol: 0xffe4b8,
      sunInt: 1.42,
      rimCol: 0x6ad7ff,
      rimInt: 0.54,
      top: 0xd6936c,
      front: 0x6c4c60,
      side: 0x463044,
      bottom: 0x2e1f30,
      basin: 0x241726,
      arch: 0x8d6378,
      archTrim: 0xffcc6e,
      accent: 0xff8438,
      vine: 0x5c4a58,
      vineHi: 0xffa642
    }
  ];

  FI.createView = function (canvas) {
    var T = window.THREE;
    if (!T) throw new Error('three.js is unavailable');

    var wgl = Kit.webgl.createRenderer(canvas, { srgb: true });
    var software = wgl.software, renderer = wgl.renderer, ratio = wgl.ratio;

    var scene = new T.Scene();
    var camera = new T.PerspectiveCamera(30, 16 / 9, 1, 130);
    var curAspect = 16 / 9;

    var hemi = new T.HemisphereLight(0xfff5dc, 0xc97b42, 1.28);
    var sun = new T.DirectionalLight(0xfff3d4, 1.38);
    sun.position.set(10, 18, 22);
    var rim = new T.DirectionalLight(0x7fd8ff, 0.42);
    rim.position.set(-14, 6, 12);
    scene.add(hemi, sun, rim);

    // Scratch objects for zero per-frame allocation
    var M4 = new T.Matrix4(), Q1 = new T.Quaternion(), E1 = new T.Euler();
    var V1 = new T.Vector3(), S1 = new T.Vector3(), C1 = new T.Color(), C2 = new T.Color();
    var camTarget = new T.Vector3(0, 0.12, 0);
    var camBase = new T.Vector3(0, 0.88, 35.5);

    var cols = 30, rows = 17, halfW = 15, halfH = 8.5;
    function toX(px) { return px / FI.T - halfW; }
    function toY(py) { return halfH - py / FI.T; }

    var view = {
      renderer: renderer,
      scene: scene,
      camera: camera,
      software: software,
      calm: false
    };

    /* -------------------------------------------------- backdrop textures */
    function makeBackdropTexture(wing) {
      var W = 1024, H = 576;
      var c = document.createElement('canvas');
      c.width = W; c.height = H;
      var g = c.getContext('2d');

      // Deep indigo-to-warm-sanctuary wall gradient (rich figure-ground depth)
      var gr = g.createLinearGradient(0, 0, 0, H);
      if (wing === 0) {
        gr.addColorStop(0, '#2a223a');
        gr.addColorStop(0.36, '#3d2c3a');
        gr.addColorStop(0.72, '#4f332c');
        gr.addColorStop(1, '#2c1c20');
      } else if (wing === 1) {
        gr.addColorStop(0, '#13274a');
        gr.addColorStop(0.45, '#19355c');
        gr.addColorStop(1, '#0e1d36');
      } else {
        gr.addColorStop(0, '#281533');
        gr.addColorStop(0.48, '#3f1e34');
        gr.addColorStop(1, '#201020');
      }
      g.fillStyle = gr;
      g.fillRect(0, 0, W, H);

      // Warm ambient glow pooling across the upper central sanctuary
      var ag = g.createRadialGradient(W * 0.5, H * 0.34, 30, W * 0.5, H * 0.38, 460);
      if (wing === 0) {
        ag.addColorStop(0, 'rgba(255, 206, 108, 0.34)');
        ag.addColorStop(0.45, 'rgba(235, 132, 62, 0.14)');
        ag.addColorStop(1, 'rgba(20, 14, 28, 0)');
      } else if (wing === 1) {
        ag.addColorStop(0, 'rgba(92, 228, 255, 0.32)');
        ag.addColorStop(0.5, 'rgba(42, 130, 210, 0.14)');
        ag.addColorStop(1, 'rgba(10, 20, 40, 0)');
      } else {
        ag.addColorStop(0, 'rgba(255, 144, 68, 0.32)');
        ag.addColorStop(0.5, 'rgba(180, 62, 118, 0.14)');
        ag.addColorStop(1, 'rgba(20, 10, 24, 0)');
      }
      g.fillStyle = ag;
      g.fillRect(0, 0, W, H);

      // Weathered ashlar stone courses with varied block tones
      var rowH = 34, colW = 72;
      for (var ry = 0; ry < H; ry += rowH) {
        var off = ((ry / rowH) & 1) ? 0 : colW / 2;
        for (var rx = -colW; rx < W + colW; rx += colW) {
          var h = (((rx * 31 + ry * 73) & 255) / 255);
          g.fillStyle = h > 0.55 ? 'rgba(255, 218, 158, 0.045)' : 'rgba(8, 5, 16, 0.09)';
          g.fillRect(rx + off + 2, ry + 2, colW - 4, rowH - 4);
        }
      }
      g.strokeStyle = wing === 0 ? 'rgba(255, 212, 140, 0.08)' : wing === 1 ? 'rgba(130, 224, 255, 0.09)' : 'rgba(255, 174, 115, 0.08)';
      g.lineWidth = 1.6;
      for (var y = rowH; y < H; y += rowH) {
        g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
        var off2 = ((y / rowH) & 1) ? 0 : colW / 2;
        for (var x = off2; x < W; x += colW) {
          g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + rowH); g.stroke();
        }
      }

      // Helper to paint an ornate glowing recessed temple arch
      function drawTempleArch(cx, topY, radius, botY, tintA, tintB, accentCol) {
        // Outer stone voussoir frame
        g.fillStyle = 'rgba(14, 10, 22, 0.34)';
        g.beginPath();
        g.arc(cx, topY + radius, radius + 18, Math.PI, 0);
        g.lineTo(cx + radius + 18, botY);
        g.lineTo(cx - radius - 18, botY);
        g.closePath();
        g.fill();

        // Warm recessed arch interior gradient
        var ig = g.createLinearGradient(cx, topY, cx, botY);
        ig.addColorStop(0, tintA);
        ig.addColorStop(0.55, tintB);
        ig.addColorStop(1, 'rgba(16, 10, 20, 0.42)');
        g.fillStyle = ig;
        g.beginPath();
        g.arc(cx, topY + radius, radius, Math.PI, 0);
        g.lineTo(cx + radius, botY);
        g.lineTo(cx - radius, botY);
        g.closePath();
        g.fill();

        // Carved golden & emerald arch trim double-rim
        g.strokeStyle = accentCol;
        g.lineWidth = 4;
        g.beginPath();
        g.arc(cx, topY + radius, radius + 7, Math.PI, 0);
        g.stroke();

        g.strokeStyle = 'rgba(255, 228, 146, 0.38)';
        g.lineWidth = 2;
        g.beginPath();
        g.arc(cx, topY + radius, radius - 8, Math.PI, 0);
        g.stroke();

        // Keystone diamond at apex of arch
        g.fillStyle = accentCol;
        g.beginPath();
        g.moveTo(cx, topY - 16);
        g.lineTo(cx + 12, topY - 2);
        g.lineTo(cx, topY + 12);
        g.lineTo(cx - 12, topY - 2);
        g.closePath();
        g.fill();
      }

      var archAccent = wing === 0 ? 'rgba(64, 224, 168, 0.58)' : wing === 1 ? 'rgba(92, 232, 255, 0.62)' : 'rgba(255, 168, 76, 0.58)';
      var archTop = wing === 0 ? 'rgba(255, 206, 114, 0.28)' : wing === 1 ? 'rgba(72, 224, 255, 0.28)' : 'rgba(255, 134, 62, 0.28)';
      var archMid = wing === 0 ? 'rgba(98, 58, 48, 0.26)' : wing === 1 ? 'rgba(26, 68, 118, 0.26)' : 'rgba(92, 34, 64, 0.26)';

      // Side arches (left = Frost alcove, right = Flame alcove) + Grand Central Sanctuary Arch
      drawTempleArch(196, 116, 86, 540, wing === 0 ? 'rgba(84, 212, 255, 0.22)' : archTop, archMid, wing === 0 ? 'rgba(76, 220, 245, 0.50)' : archAccent);
      drawTempleArch(828, 116, 86, 540, wing === 0 ? 'rgba(255, 166, 72, 0.25)' : archTop, archMid, wing === 0 ? 'rgba(255, 198, 92, 0.56)' : archAccent);
      drawTempleArch(512, 74, 134, 540, archTop, archMid, archAccent);

      // Grand Carved Elemental Sun-and-Frost Rose Relief inside the Center Arch
      var mx = 512, my = 224, mr = 86;
      g.save();
      var mg = g.createRadialGradient(mx, my, 8, mx, my, mr + 28);
      mg.addColorStop(0, wing === 1 ? 'rgba(130, 244, 255, 0.45)' : 'rgba(255, 224, 128, 0.45)');
      mg.addColorStop(0.6, wing === 0 ? 'rgba(54, 214, 158, 0.20)' : 'rgba(96, 194, 255, 0.18)');
      mg.addColorStop(1, 'rgba(0, 0, 0, 0)');
      g.fillStyle = mg;
      g.beginPath(); g.arc(mx, my, mr + 28, 0, Math.PI * 2); g.fill();

      // 16 radiating carved temple sun-rays
      g.strokeStyle = 'rgba(255, 216, 124, 0.40)';
      g.lineWidth = 3;
      for (var ri = 0; ri < 16; ri++) {
        var ra = (ri / 16) * Math.PI * 2;
        var r1 = mr * 0.52, r2 = (ri % 2 === 0) ? mr + 12 : mr - 4;
        g.beginPath();
        g.moveTo(mx + Math.cos(ra) * r1, my + Math.sin(ra) * r1);
        g.lineTo(mx + Math.cos(ra) * r2, my + Math.sin(ra) * r2);
        g.stroke();
      }
      // Concentric inlaid emerald-jade & gold rings
      g.strokeStyle = wing === 0 ? 'rgba(58, 224, 164, 0.62)' : 'rgba(96, 232, 255, 0.62)';
      g.lineWidth = 8;
      g.beginPath(); g.arc(mx, my, mr * 0.78, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = 'rgba(255, 218, 120, 0.65)';
      g.lineWidth = 3;
      g.beginPath(); g.arc(mx, my, mr * 0.94, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.arc(mx, my, mr * 0.56, 0, Math.PI * 2); g.stroke();

      // Split Fire (right) & Ice (left) central emblem halves
      g.fillStyle = 'rgba(255, 134, 46, 0.42)';
      g.beginPath(); g.arc(mx, my, mr * 0.50, -Math.PI / 2, Math.PI / 2); g.closePath(); g.fill();
      g.fillStyle = 'rgba(66, 220, 255, 0.42)';
      g.beginPath(); g.arc(mx, my, mr * 0.50, Math.PI / 2, Math.PI * 1.5); g.closePath(); g.fill();
      g.fillStyle = 'rgba(255, 240, 180, 0.62)';
      g.beginPath();
      g.moveTo(mx, my - 26); g.lineTo(mx + 18, my); g.lineTo(mx, my + 26); g.lineTo(mx - 18, my);
      g.closePath(); g.fill();
      g.restore();

      // Side arch carved relief motifs (Frost crystal on left, Solar flame on right)
      function drawDiamondMural(cx, cy, col) {
        g.save();
        g.strokeStyle = col;
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(cx, cy - 38); g.lineTo(cx + 26, cy); g.lineTo(cx, cy + 38); g.lineTo(cx - 26, cy);
        g.closePath(); g.stroke();
        g.fillStyle = col;
        g.globalAlpha = 0.28;
        g.fill();
        g.globalAlpha = 0.75;
        g.beginPath(); g.arc(cx, cy, 10, 0, Math.PI * 2); g.fill();
        g.restore();
      }
      drawDiamondMural(196, 224, wing === 0 ? 'rgba(92, 232, 255, 0.55)' : archAccent);
      drawDiamondMural(828, 224, wing === 0 ? 'rgba(255, 178, 72, 0.60)' : archAccent);

      // Carved top geometric temple frieze strip
      g.fillStyle = 'rgba(18, 12, 24, 0.32)';
      g.fillRect(0, 32, W, 30);
      g.fillStyle = wing === 0 ? 'rgba(255, 208, 104, 0.42)' : wing === 1 ? 'rgba(108, 234, 255, 0.42)' : 'rgba(255, 152, 74, 0.42)';
      for (var fx = 42; fx < W; fx += 52) {
        g.beginPath();
        g.moveTo(fx, 38); g.lineTo(fx + 10, 47); g.lineTo(fx, 56); g.lineTo(fx - 10, 47);
        g.closePath(); g.fill();
      }

      // Silky volumetric diagonal sunlight shafts streaming down into the hall
      g.save();
      var shafts = [[190, 120], [495, 150], [780, 118]];
      for (var bi = 0; bi < shafts.length; bi++) {
        var bx = shafts[bi][0], bw = shafts[bi][1];
        var sg = g.createLinearGradient(bx, 0, bx - 140, H);
        if (wing === 0) {
          sg.addColorStop(0, 'rgba(255, 234, 162, 0.22)');
          sg.addColorStop(0.55, 'rgba(255, 206, 124, 0.11)');
          sg.addColorStop(1, 'rgba(255, 184, 96, 0)');
        } else if (wing === 1) {
          sg.addColorStop(0, 'rgba(130, 240, 255, 0.22)');
          sg.addColorStop(0.55, 'rgba(84, 206, 255, 0.10)');
          sg.addColorStop(1, 'rgba(64, 176, 255, 0)');
        } else {
          sg.addColorStop(0, 'rgba(255, 182, 102, 0.20)');
          sg.addColorStop(0.55, 'rgba(255, 118, 68, 0.09)');
          sg.addColorStop(1, 'rgba(255, 92, 54, 0)');
        }
        g.fillStyle = sg;
        g.beginPath();
        g.moveTo(bx, 0);
        g.lineTo(bx + bw, 0);
        g.lineTo(bx + bw - 175, H);
        g.lineTo(bx - 195, H);
        g.closePath();
        g.fill();
      }
      g.restore();

      var tex = new T.CanvasTexture(c);
      if (T.SRGBColorSpace) tex.colorSpace = T.SRGBColorSpace;
      return tex;
    }

    var bgTextures = [makeBackdropTexture(0), makeBackdropTexture(1), makeBackdropTexture(2)];
    var bgMat = new T.MeshBasicMaterial({ map: bgTextures[0] });
    var bgPlane = new T.Mesh(new T.PlaneGeometry(36, 20.5), bgMat);
    bgPlane.position.set(0, 0, -1.75);
    scene.add(bgPlane);

    /* -------------------------------------------------- shared geometries */
    var GEO = {
      box: new T.BoxGeometry(1, 1, 1),
      sphere: new T.SphereGeometry(0.5, 12, 10),
      sphereLo: new T.SphereGeometry(0.5, 8, 6),
      cyl: new T.CylinderGeometry(0.5, 0.5, 1, 10),
      cone: new T.ConeGeometry(0.5, 1, 8),
      octa: new T.OctahedronGeometry(0.32, 0),
      torus: new T.TorusGeometry(0.35, 0.08, 8, 16),
      disc: new T.CircleGeometry(0.5, 14),
      plane: new T.PlaneGeometry(1, 1),
      ring: new T.RingGeometry(0.32, 0.45, 18)
    };

    function lambert(hex, em, ei, tr, op) {
      var o = { color: hex };
      if (em != null) { o.emissive = em; o.emissiveIntensity = ei == null ? 0.35 : ei; }
      if (tr) { o.transparent = true; o.opacity = op == null ? 0.85 : op; }
      return new T.MeshLambertMaterial(o);
    }

    function makeGlowTex() {
      var c = document.createElement('canvas');
      c.width = 64; c.height = 64;
      var g = c.getContext('2d');
      var gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
      gr.addColorStop(0, 'rgba(255, 226, 130, 0.85)');
      gr.addColorStop(0.38, 'rgba(255, 148, 42, 0.34)');
      gr.addColorStop(1, 'rgba(255, 96, 16, 0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 64, 64);
      var tex = new T.CanvasTexture(c);
      if (T.SRGBColorSpace) tex.colorSpace = T.SRGBColorSpace;
      return tex;
    }

    var MAT = {
      stoneStatic: new T.MeshLambertMaterial({ vertexColors: true }),
      iron: lambert(0x4a3d3b),
      wood: lambert(0xb97c42),
      woodDark: lambert(0x7c4c24),
      brass: lambert(0xf2bc4b, 0x6e4808, 0.25),
      rail: lambert(0x3a2d2b),
      platStone: lambert(0x9b8e85),
      leverBase: lambert(0x695a54),
      btnBase: lambert(0x554846),
      ruby: lambert(0xff3e24, 0xff2800, 0.62),
      sapphire: lambert(0x28d2ff, 0x0096ff, 0.62),
      gemCore: new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }),
      torchOut: new T.MeshBasicMaterial({ color: 0xff7b1c }),
      torchIn: new T.MeshBasicMaterial({ color: 0xfff08a }),
      torchGlow: new T.MeshBasicMaterial({ map: makeGlowTex(), transparent: true, blending: T.AdditiveBlending, depthWrite: false }),
      shadow: new T.MeshBasicMaterial({ color: 0x0b0710, transparent: true, opacity: 0.36, depthWrite: false }),
      ch: [
        lambert(CH_COLORS[0], CH_COLORS[0], 0.48),
        lambert(CH_COLORS[1], CH_COLORS[1], 0.48),
        lambert(CH_COLORS[2], CH_COLORS[2], 0.48)
      ],
      autoTrim: lambert(AUTO_COLOR, AUTO_COLOR, 0.42),
      doorFireFrame: lambert(0xb5623d, 0x3b1200, 0.2),
      doorIceFrame: lambert(0x478bb0, 0x052236, 0.2),
      doorFireCore: new T.MeshBasicMaterial({ color: 0xff7d26, transparent: true, opacity: 0.72 }),
      doorIceCore: new T.MeshBasicMaterial({ color: 0x34dbff, transparent: true, opacity: 0.72 }),
      doorFireCrest: lambert(0xffb830, 0xff5a00, 0.65),
      doorIceCrest: lambert(0x7af0ff, 0x00b4ff, 0.65),
      lavaSurf: lambert(0xff5a14, 0xff7b12, 0.85),
      lavaLip: new T.MeshBasicMaterial({ color: 0xff6e18 }),
      lavaFoam: new T.MeshBasicMaterial({ color: 0xffe45c }),
      waterSurf: lambert(0x16c8f2, 0x16b8ff, 0.70, true, 0.94),
      waterLip: new T.MeshBasicMaterial({ color: 0x1fd0ff }),
      waterFoam: new T.MeshBasicMaterial({ color: 0xc2f8ff }),
      gooSurf: lambert(0x24d848, 0x30f552, 0.80),
      gooLip: new T.MeshBasicMaterial({ color: 0x26e24c }),
      gooFoam: new T.MeshBasicMaterial({ color: 0xc8ff54 })
    };

    /* -------------------------------------------------- 3D unlockable hats */
    function buildHatsGroup() {
      var root = new T.Group();
      var byId = {};

      // Royal Golden Crown
      var crown = new T.Group();
      var band = new T.Mesh(GEO.cyl, MAT.brass);
      band.scale.set(0.46, 0.14, 0.46);
      crown.add(band);
      for (var i = 0; i < 4; i++) {
        var a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        var sp = new T.Mesh(GEO.cone, MAT.brass);
        sp.scale.set(0.14, 0.22, 0.14);
        sp.position.set(Math.cos(a) * 0.17, 0.14, Math.sin(a) * 0.17);
        crown.add(sp);
      }
      var cGem = new T.Mesh(GEO.octa, MAT.ruby);
      cGem.scale.set(0.28, 0.28, 0.28);
      cGem.position.set(0, 0.02, 0.23);
      crown.add(cGem);
      crown.visible = false;
      root.add(crown);
      byId.crown = crown;

      // Wizard Hat
      var wiz = new T.Group();
      var wizMat = lambert(0x6d38d9, 0x2e1070, 0.28);
      var brim = new T.Mesh(GEO.cyl, wizMat);
      brim.scale.set(0.76, 0.06, 0.76);
      var cone = new T.Mesh(GEO.cone, wizMat);
      cone.scale.set(0.48, 0.56, 0.48);
      cone.position.y = 0.28;
      cone.rotation.z = -0.14;
      var wBand = new T.Mesh(GEO.cyl, MAT.brass);
      wBand.scale.set(0.47, 0.07, 0.47);
      wBand.position.y = 0.05;
      wiz.add(brim, cone, wBand);
      wiz.visible = false;
      root.add(wiz);
      byId.wizard = wiz;

      // Glowing Angel Halo
      var halo = new T.Group();
      var hRing = new T.Mesh(GEO.torus, new T.MeshBasicMaterial({ color: 0xffe96b }));
      hRing.rotation.x = Math.PI / 2;
      hRing.scale.set(0.85, 0.85, 0.85);
      hRing.position.y = 0.22;
      halo.add(hRing);
      halo.visible = false;
      root.add(halo);
      byId.halo = halo;

      // Viking Horned Helmet
      var vik = new T.Group();
      var helmMat = lambert(0x8899ad, 0x1c2838, 0.18);
      var hornMat = lambert(0xfff1d2);
      var dome = new T.Mesh(GEO.sphere, helmMat);
      dome.scale.set(0.56, 0.36, 0.56);
      dome.position.y = 0.04;
      var vBand = new T.Mesh(GEO.cyl, MAT.brass);
      vBand.scale.set(0.57, 0.08, 0.57);
      var hL = new T.Mesh(GEO.cone, hornMat);
      hL.scale.set(0.14, 0.34, 0.14);
      hL.position.set(-0.34, 0.18, 0);
      hL.rotation.z = 0.72;
      var hR = hL.clone();
      hR.position.x = 0.34;
      hR.rotation.z = -0.72;
      vik.add(dome, vBand, hL, hR);
      vik.visible = false;
      root.add(vik);
      byId.viking = vik;

      // Star Crown Crest
      var star = new T.Group();
      var sMat = lambert(0xffde3b, 0xffaa00, 0.6);
      var s1 = new T.Mesh(GEO.octa, sMat);
      s1.scale.set(0.66, 0.92, 0.42);
      s1.position.y = 0.24;
      var s2 = new T.Mesh(GEO.octa, sMat);
      s2.scale.set(0.92, 0.66, 0.42);
      s2.position.y = 0.24;
      star.add(s1, s2);
      star.visible = false;
      root.add(star);
      byId.star = star;

      return { group: root, byId: byId };
    }

    /* -------------------------------------------------- 3D chunky heroes */
    function buildHeroRig(kind) {
      var isFire = kind === 'fire';
      var bodyMat = isFire
        ? lambert(0xff5a1c, 0xff2c00, 0.42)
        : lambert(0x22c8ff, 0x0088ee, 0.38);
      var bellyMat = isFire
        ? lambert(0xffbb44, 0xff7700, 0.35)
        : lambert(0xaef2ff, 0x30c5ff, 0.32);
      var bootMat = isFire ? lambert(0x3a1c1a) : lambert(0x1b3a66);
      var eyeMat = new T.MeshBasicMaterial({ color: 0x1a1423 });
      var whiteMat = new T.MeshBasicMaterial({ color: 0xffffff });
      var cheekMat = new T.MeshBasicMaterial({ color: isFire ? 0xff9c4a : 0x72f0ff });

      var root = new T.Group();
      var rig = new T.Group();
      root.add(rig);

      // Cute chunky torso & head fused in chibi silhouette (total height ~0.92 tile)
      var torso = new T.Mesh(GEO.sphere, bodyMat);
      torso.scale.set(0.56, 0.50, 0.50);
      torso.position.y = 0.33;
      rig.add(torso);

      var belly = new T.Mesh(GEO.sphere, bellyMat);
      belly.scale.set(0.36, 0.30, 0.26);
      belly.position.set(0, 0.31, 0.17);
      rig.add(belly);

      var head = new T.Mesh(GEO.sphere, bodyMat);
      head.scale.set(0.62, 0.56, 0.56);
      head.position.y = 0.66;
      rig.add(head);

      // Expressive face group
      var face = new T.Group();
      face.position.set(0, 0.66, 0.25);
      rig.add(face);

      var eyeL = new T.Group(), eyeR = new T.Group();
      eyeL.position.set(-0.11, 0.02, 0);
      eyeR.position.set(0.11, 0.02, 0);
      var eScl = new T.Mesh(GEO.sphereLo, whiteMat);
      eScl.scale.set(0.15, 0.18, 0.08);
      var ePup = new T.Mesh(GEO.sphereLo, eyeMat);
      ePup.scale.set(0.10, 0.13, 0.07);
      ePup.position.set(0.015, 0, 0.03);
      var eDot = new T.Mesh(GEO.sphereLo, whiteMat);
      eDot.scale.set(0.04, 0.04, 0.04);
      eDot.position.set(-0.015, 0.04, 0.06);
      eyeL.add(eScl, ePup, eDot);
      eyeR.add(eScl.clone(), ePup.clone(), eDot.clone());
      face.add(eyeL, eyeR);

      // Cute rosy/frosty cheeks
      var ckL = new T.Mesh(GEO.sphereLo, cheekMat);
      ckL.scale.set(0.08, 0.045, 0.04);
      ckL.position.set(-0.18, -0.06, -0.01);
      var ckR = ckL.clone();
      ckR.position.x = 0.18;
      face.add(ckL, ckR);

      // Arms
      var armL = new T.Mesh(GEO.sphereLo, bodyMat);
      armL.scale.set(0.17, 0.24, 0.17);
      armL.position.set(-0.30, 0.36, 0.02);
      var armR = armL.clone();
      armR.position.x = 0.30;
      rig.add(armL, armR);

      // Pumping boots
      var footL = new T.Mesh(GEO.sphereLo, bootMat);
      footL.scale.set(0.22, 0.16, 0.28);
      footL.position.set(-0.13, 0.08, 0.03);
      var footR = footL.clone();
      footR.position.x = 0.13;
      rig.add(footL, footR);

      // Elemental Hair Crown
      var hair = new T.Group();
      hair.position.set(0, 0.90, 0);
      rig.add(hair);
      var tufts = [];
      if (isFire) {
        var fOut = new T.MeshBasicMaterial({ color: 0xff7b1c });
        var fMid = new T.MeshBasicMaterial({ color: 0xffca2c });
        var fTip = new T.MeshBasicMaterial({ color: 0xfff59d });
        var spC = new T.Mesh(GEO.cone, fOut);
        spC.scale.set(0.32, 0.46, 0.28);
        spC.position.set(0, 0.18, 0);
        var spIn = new T.Mesh(GEO.cone, fTip);
        spIn.scale.set(0.17, 0.30, 0.18);
        spIn.position.set(0, 0.14, 0.05);
        var spL = new T.Mesh(GEO.cone, fMid);
        spL.scale.set(0.22, 0.34, 0.22);
        spL.position.set(-0.18, 0.11, -0.02);
        spL.rotation.z = 0.42;
        var spR = new T.Mesh(GEO.cone, fMid);
        spR.scale.set(0.22, 0.34, 0.22);
        spR.position.set(0.18, 0.11, -0.02);
        spR.rotation.z = -0.42;
        hair.add(spC, spIn, spL, spR);
        tufts.push(spC, spL, spR);
      } else {
        var iOut = lambert(0x4be4ff, 0x00a8ff, 0.52);
        var iTip = lambert(0xcff9ff, 0x6cebff, 0.55);
        var drC = new T.Mesh(GEO.cone, iOut);
        drC.scale.set(0.32, 0.42, 0.30);
        drC.position.set(0, 0.16, 0);
        var drCry = new T.Mesh(GEO.octa, iTip);
        drCry.scale.set(0.45, 0.52, 0.42);
        drCry.position.set(0, 0.28, 0.04);
        var drL = new T.Mesh(GEO.cone, iOut);
        drL.scale.set(0.20, 0.28, 0.20);
        drL.position.set(-0.20, 0.04, 0);
        drL.rotation.z = 0.58;
        var drR = new T.Mesh(GEO.cone, iOut);
        drR.scale.set(0.20, 0.28, 0.20);
        drR.position.set(0.20, 0.04, 0);
        drR.rotation.z = -0.58;
        hair.add(drC, drCry, drL, drR);
        tufts.push(drC, drL, drR);
      }

      // Hat mount sits neatly atop the head
      var hats = buildHatsGroup();
      hats.group.position.set(0, 0.95, 0);
      rig.add(hats.group);

      // Ground contact blob shadow
      var shadow = new T.Mesh(GEO.disc, MAT.shadow);
      shadow.rotation.x = -Math.PI / 2;
      shadow.scale.set(0.74, 0.46, 1);
      shadow.position.y = 0.02;
      scene.add(shadow);

      root.scale.setScalar(1.16);
      scene.add(root);
      return {
        root: root,
        rig: rig,
        face: face,
        eyeL: eyeL,
        eyeR: eyeR,
        armL: armL,
        armR: armR,
        footL: footL,
        footR: footR,
        hair: hair,
        tufts: tufts,
        hats: hats,
        shadow: shadow,
        sqY: 1,
        sqX: 1,
        walkT: 0,
        yaw: 0
      };
    }

    var heroes = {
      fire: buildHeroRig('fire'),
      ice: buildHeroRig('ice')
    };

    // 1P active hero bouncing indicator arrow + halo ring
    var indicator = new T.Group();
    var indMat = new T.MeshBasicMaterial({ color: 0xffe24a });
    var indCone = new T.Mesh(GEO.cone, indMat);
    indCone.rotation.x = Math.PI;
    indCone.scale.set(0.42, 0.46, 0.42);
    indCone.position.y = 0.28;
    var indRing = new T.Mesh(GEO.torus, indMat);
    indRing.rotation.x = Math.PI / 2;
    indRing.scale.set(0.75, 0.75, 0.6);
    indRing.position.y = 0.62;
    indicator.add(indCone, indRing);
    indicator.visible = false;
    scene.add(indicator);

    var currentHat = 'none';
    function applyHat(hatId) {
      currentHat = hatId || 'none';
      var keys = ['fire', 'ice'];
      for (var k = 0; k < keys.length; k++) {
        var map = heroes[keys[k]].hats.byId;
        for (var id in map) {
          if (Object.prototype.hasOwnProperty.call(map, id)) {
            map[id].visible = (id === currentHat);
          }
        }
      }
    }

    /* -------------------------------------------------- particle pool */
    var MAX_P = 140;
    var pMesh = new T.InstancedMesh(GEO.sphereLo, new T.MeshBasicMaterial({ color: 0xffffff }), MAX_P);
    pMesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    pMesh.count = 0;
    pMesh.frustumCulled = false;
    scene.add(pMesh);

    var parts = [];
    for (var pi = 0; pi < MAX_P; pi++) {
      parts.push({ active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, sz: 0.14, grav: 0, r: 1, g: 1, b: 1 });
    }
    var pCursor = 0;

    function spawnPart(x, y, z, vx, vy, vz, life, sz, grav, hex) {
      var p = parts[pCursor];
      pCursor = (pCursor + 1) % MAX_P;
      p.active = true;
      p.x = x; p.y = y; p.z = z;
      p.vx = vx; p.vy = vy; p.vz = vz;
      p.life = life; p.max = life;
      p.sz = sz; p.grav = grav;
      C1.setHex(hex);
      p.r = C1.r; p.g = C1.g; p.b = C1.b;
    }

    function burst(px, py, kind, count) {
      var wx = toX(px), wy = toY(py);
      var n = count || 12;
      var pal;
      if (kind === 'fire' || kind === 'lava') pal = [0xff5a14, 0xff9b24, 0xffe45c];
      else if (kind === 'ice' || kind === 'water') pal = [0x22ccff, 0x7ef2ff, 0xffffff];
      else if (kind === 'goo') pal = [0x26e84e, 0x9cff44, 0x169c36];
      else if (kind === 'gold' || kind === 'win') pal = [0xffde3b, 0xff8a24, 0x4be8ff, 0xff5ca8];
      else if (kind === 'lever' || kind === 'btn') pal = [0xffe04a, 0xffffff, 0xb55cff];
      else pal = [0xe8d0a8, 0xc9a97c, 0xfff2d6];

      var grav = (kind === 'dust' || kind === 'land') ? -8 : (kind === 'win' ? -7 : -3.5);
      for (var i = 0; i < n; i++) {
        var a = (i / n) * Math.PI * 2 + (i % 3) * 0.37;
        var sp = 1.4 + ((i * 53) % 10) * 0.34;
        var vy = (kind === 'win' ? 3.5 : 1.6) + Math.sin(a) * sp;
        spawnPart(
          wx + ((i % 5) - 2) * 0.06,
          wy + ((i % 3) - 1) * 0.06,
          0.35 + (i % 3) * 0.1,
          Math.cos(a) * sp,
          vy,
          ((i % 2) ? 0.6 : -0.6),
          0.32 + (i % 4) * 0.1,
          0.11 + (i % 3) * 0.045,
          grav,
          pal[i % pal.length]
        );
      }
    }

    function clearParticles() {
      for (var i = 0; i < MAX_P; i++) parts[i].active = false;
      pMesh.count = 0;
    }

    function stepParticles(dt) {
      var alive = 0;
      for (var i = 0; i < MAX_P; i++) {
        var p = parts[i];
        if (!p.active) continue;
        p.life -= dt;
        if (p.life <= 0) { p.active = false; continue; }
        p.vy += p.grav * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        var sc = p.sz * Math.min(1, (p.life / p.max) * 1.6);
        V1.set(p.x, p.y, p.z);
        S1.set(sc, sc, sc);
        M4.compose(V1, Q1.identity(), S1);
        pMesh.setMatrixAt(alive, M4);
        C1.setRGB(p.r, p.g, p.b);
        pMesh.setColorAt(alive, C1);
        alive++;
      }
      pMesh.count = alive;
      if (alive > 0) {
        pMesh.instanceMatrix.needsUpdate = true;
        if (pMesh.instanceColor) pMesh.instanceColor.needsUpdate = true;
      }
    }

    /* -------------------------------------------------- merged stone mesh */
    function buildTempleGeometry(w, theme) {
      var pos = [], norm = [], col = [];
      var cTop = new T.Color(theme.top);
      var cFront = new T.Color(theme.front);
      var cSide = new T.Color(theme.side);
      var cBot = new T.Color(theme.bottom);
      var cBasin = new T.Color(theme.basin);
      var cArch = new T.Color(theme.arch);
      var cTrim = new T.Color(theme.archTrim);
      var cAcc = new T.Color(theme.accent);
      var cVine = new T.Color(theme.vine);
      var cVineHi = new T.Color(theme.vineHi);

      function pushQuad(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, nx, ny, nz, color, shade) {
        var r = Math.min(1, color.r * shade);
        var g = Math.min(1, color.g * shade);
        var b = Math.min(1, color.b * shade);
        pos.push(ax, ay, az, bx, by, bz, cx, cy, cz, ax, ay, az, cx, cy, cz, dx, dy, dz);
        for (var k = 0; k < 6; k++) {
          norm.push(nx, ny, nz);
          col.push(r, g, b);
        }
      }

      function addBox(x0, x1, y0, y1, z0, z1, shade, faces, frontCol, topCol, sideCol, botCol) {
        if (faces & 1) { // Front (+Z)
          pushQuad(x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1, 0, 0, 1, frontCol, shade);
        }
        if (faces & 2) { // Top (+Y)
          pushQuad(x0, y1, z1, x1, y1, z1, x1, y1, z0, x0, y1, z0, 0, 1, 0, topCol, shade);
        }
        if (faces & 4) { // Bottom (-Y)
          pushQuad(x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1, 0, -1, 0, botCol, shade);
        }
        if (faces & 8) { // Left (-X)
          pushQuad(x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0, -1, 0, 0, sideCol, shade);
        }
        if (faces & 16) { // Right (+X)
          pushQuad(x1, y0, z1, x1, y0, z0, x1, y1, z0, x1, y1, z1, 1, 0, 0, sideCol, shade);
        }
      }

      for (var gy = 0; gy < w.rows; gy++) {
        for (var gx = 0; gx < w.cols; gx++) {
          var ch = w.grid[gy * w.cols + gx];
          var x0 = gx - halfW, x1 = x0 + 1;
          var y1 = halfH - gy, y0 = y1 - 1;
          var h = ((gx * 73 + gy * 137) & 15) / 15;
          var shade = 0.90 + h * 0.18;

          if (ch === '#') {
            var up = FI.tileAt(w, gx, gy - 1);
            var dn = FI.tileAt(w, gx, gy + 1);
            var lf = FI.tileAt(w, gx - 1, gy);
            var rt = FI.tileAt(w, gx + 1, gy);

            var exposedTop = (up !== '#');
            var faces = 1; // always draw front
            if (exposedTop) faces |= 2;
            if (dn !== '#') faces |= 4;
            if (lf !== '#') faces |= 8;
            if (rt !== '#') faces |= 16;

            var zBack = -1.12, zFront = 0.72;
            // Subtle outer wall thickness protrusion for temple frame feel
            var isBorder = (gx === 0 || gx === w.cols - 1 || gy === 0 || gy === w.rows - 1);
            if (isBorder) zFront = 0.78;

            addBox(x0, x1, y0, y1, zBack, zFront, shade, faces, cFront, cTop, cSide, cBot);

            // Chunky sunlit beveled capstone ledge on walkable top surfaces + emerald moss/crystal accents
            if (exposedTop && !isBorder && !FI.isPoolTile(up)) {
              var capF = 1 | 2 | 4 | (lf !== '#' ? 8 : 0) | (rt !== '#' ? 16 : 0);
              addBox(x0 - (lf !== '#' ? 0.04 : 0), x1 + (rt !== '#' ? 0.04 : 0),
                y1 - 0.17, y1 + 0.015, -1.16, 0.80, shade * 1.04, capF, cTop, cTop, cFront, cSide);
              if (((gx * 19 + gy * 37) & 7) === 0) {
                addBox(x0 + 0.14, x1 - 0.14, y1 - 0.25, y1 - 0.11, 0.76, 0.84, 1.0, 1 | 2 | 8 | 16, cVine, cVineHi, cVine, cVine);
              }
            }
            // Carved golden border trim studs along inner rim of the temple frame
            if (isBorder && gy === 0 && gx > 0 && gx < w.cols - 1 && (gx % 4 === 2)) {
              addBox(x0 + 0.18, x1 - 0.18, y0 - 0.14, y0 + 0.16, 0.68, 0.84, 1.02, 1 | 2 | 4 | 8 | 16, cTrim, cTrim, cArch, cSide);
            }
          } else if (FI.isPoolTile(ch)) {
            // Carved stone trough cradling the recessed glowing pool
            addBox(x0, x1, y0, y1 - 0.24, -1.12, 0.78, shade * 0.92, 1 | 2 | 4, cBasin, cBasin, cBasin, cBot);
            // Low carved stone front rim holding liquid in
            addBox(x0, x1, y1 - 0.24, y1 - 0.04, 0.64, 0.82, shade, 1 | 2, cFront, cTop, cSide, cBasin);
          }
        }
      }

      // Recessed 3D Temple Architecture (merged in the SAME 1 draw call — zero extra draw calls!)
      // 1) Four fluted temple stone columns framing the sanctuary arches
      var pilX = [-12.6, -5.6, 5.6, 12.6];
      for (var pi = 0; pi < pilX.length; pi++) {
        var px = pilX[pi];
        // Column shaft
        addBox(px - 0.44, px + 0.44, -halfH + 1, halfH - 1, -1.72, -1.32, 0.86, 1 | 8 | 16, cArch, cTop, cSide, cBot);
        // Column capital & emerald/gold inlay band
        addBox(px - 0.64, px + 0.64, halfH - 1.55, halfH - 1.0, -1.72, -1.20, 1.0, 1 | 2 | 4 | 8 | 16, cTrim, cTop, cArch, cSide);
        addBox(px - 0.52, px + 0.52, halfH - 1.88, halfH - 1.55, -1.72, -1.26, 0.96, 1 | 4 | 8 | 16, cAcc, cAcc, cSide, cSide);
        // Mid-shaft carved brass ring
        addBox(px - 0.52, px + 0.52, 0.65, 1.02, -1.72, -1.26, 0.98, 1 | 2 | 4 | 8 | 16, cTrim, cTrim, cArch, cSide);
        // Base plinth
        addBox(px - 0.62, px + 0.62, -halfH + 1.0, -halfH + 1.65, -1.72, -1.22, 0.92, 1 | 2 | 8 | 16, cArch, cTop, cSide, cBot);
      }

      // 2) Upper sculpted arch cornice & carved emerald/gold relief frieze beam
      addBox(-halfW + 1, halfW - 1, halfH - 1.32, halfH - 0.96, -1.72, -1.26, 0.92, 1 | 4, cArch, cTop, cSide, cBot);
      for (var rx = -11; rx <= 11; rx += 2.2) {
        addBox(rx - 0.24, rx + 0.24, halfH - 1.50, halfH - 1.06, -1.30, -1.18, 1.02, 1 | 4 | 8 | 16, cTrim, cTrim, cArch, cSide);
      }

      // 3) Lush 3D hanging temple vines / crystal icicles draping across the upper hall (clear of braziers & title logo)
      var vines = [
        [-13.4, 3.8], [-11.4, 2.7], [-10.0, 4.1], [-6.8, 2.3], [-4.6, 3.1],
        [4.8, 3.3], [6.8, 2.4], [10.2, 4.2], [11.6, 2.7], [13.2, 4.0]
      ];
      for (var vi = 0; vi < vines.length; vi++) {
        var vx = vines[vi][0], vlen = vines[vi][1];
        var segs = Math.max(3, Math.round(vlen * 2.2));
        for (var si = 0; si < segs; si++) {
          var vy1 = halfH - 1.0 - si * (vlen / segs);
          var vy0 = vy1 - (vlen / segs) - 0.04;
          var swayX = Math.sin(si * 0.85 + vi * 1.7) * 0.14;
          var sw = (si === segs - 1) ? 0.09 : 0.13;
          addBox(vx + swayX - sw, vx + swayX + sw, vy0, vy1, -1.32, -1.20, 0.95, 1 | 4 | 8 | 16, cVine, cVineHi, cVine, cVine);
          // Alternating lush leaf clusters / crystal shards along each hanging vine
          if (si > 0 && si < segs) {
            var dir = (si & 1) ? 1 : -1;
            var lx = vx + swayX + dir * 0.20;
            addBox(lx - 0.18, lx + 0.18, vy0 + 0.06, vy1 - 0.04, -1.28, -1.16, 1.04, 1 | 2 | 4 | 8 | 16, cVineHi, cVineHi, cVine, cVine);
            if (si === segs - 1 && (vi % 2 === 0)) {
              // Tiny glowing golden temple blossom / crystal tip
              addBox(vx + swayX - 0.11, vx + swayX + 0.11, vy0 - 0.16, vy0 + 0.04, -1.26, -1.14, 1.1, 1 | 4 | 8 | 16, cTrim, cTrim, cTrim, cTrim);
            }
          }
        }
      }

      var geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new T.Float32BufferAttribute(norm, 3));
      geo.setAttribute('color', new T.Float32BufferAttribute(col, 3));
      return geo;
    }

    /* -------------------------------------------------- level objects */
    var levelGroup = new T.Group();
    scene.add(levelGroup);
    var disposables = [];

    var levelObjs = {
      pools: [],
      gooBubbles: [],
      doors: {},
      gems: [],
      boxes: [],
      levers: [],
      buttons: [],
      platforms: [],
      torches: []
    };

    function clearLevel() {
      while (levelGroup.children.length) levelGroup.remove(levelGroup.children[0]);
      for (var i = 0; i < disposables.length; i++) {
        try { disposables[i].dispose(); } catch (e) { /* ignore */ }
      }
      disposables = [];
      levelObjs = {
        pools: [],
        gooBubbles: [],
        doors: {},
        gems: [],
        boxes: [],
        levers: [],
        buttons: [],
        platforms: [],
        torches: []
      };
    }

    function buildDoorMesh(door, kind, theme) {
      var isFire = kind === 'fire';
      var g = new T.Group();
      var cx = toX(door.x + door.w / 2);
      var by = toY(door.y + door.h);
      g.position.set(cx, by, -0.32);

      var frameMat = isFire ? MAT.doorFireFrame : MAT.doorIceFrame;
      var coreMat = (isFire ? MAT.doorFireCore : MAT.doorIceCore).clone();
      var crestMat = isFire ? MAT.doorFireCrest : MAT.doorIceCrest;
      disposables.push(coreMat);

      var runeMat = lambert(isFire ? 0xffae33 : 0x52ebff, isFire ? 0xff5a00 : 0x00b4ff, 0.45);
      disposables.push(runeMat);

      // Left & right carved gate columns
      var colL = new T.Mesh(GEO.box, frameMat);
      colL.scale.set(0.24, 1.48, 0.48);
      colL.position.set(-0.52, 0.74, 0);
      var colR = colL.clone();
      colR.position.x = 0.52;

      // Top lintel stone + stepped cornice
      var lintel = new T.Mesh(GEO.box, frameMat);
      lintel.scale.set(1.36, 0.24, 0.56);
      lintel.position.set(0, 1.54, 0.02);

      // Glowing elemental crest emblem atop gate
      var crest = new T.Mesh(isFire ? GEO.cone : GEO.octa, crestMat);
      crest.scale.set(isFire ? 0.34 : 0.56, isFire ? 0.42 : 0.72, 0.34);
      crest.position.set(0, 1.84, 0.08);

      // Glowing side rune gems (light up brightly when hero stands inside)
      var runeL = new T.Mesh(GEO.octa, runeMat);
      runeL.scale.set(0.32, 0.48, 0.32);
      runeL.position.set(-0.52, 0.84, 0.27);
      var runeR = runeL.clone();
      runeR.position.x = 0.52;

      // Recessed glowing portal interior
      var portal = new T.Mesh(GEO.box, coreMat);
      portal.scale.set(0.84, 1.38, 0.14);
      portal.position.set(0, 0.70, -0.10);

      // Base threshold sill
      var sill = new T.Mesh(GEO.box, lambert(theme.archTrim));
      disposables.push(sill.material);
      sill.scale.set(1.26, 0.10, 0.62);
      sill.position.set(0, 0.04, 0.04);

      g.add(colL, colR, lintel, crest, runeL, runeR, portal, sill);
      levelGroup.add(g);
      return { group: g, coreMat: coreMat, runeMat: runeMat, crest: crest, portal: portal };
    }

    function loadLevel(w) {
      clearLevel();
      clearParticles();
      cols = w.cols;
      rows = w.rows;
      halfW = cols / 2;
      halfH = rows / 2;

      var theme = THEMES[w.wing % THEMES.length];
      scene.background = new T.Color(theme.sky);
      hemi.color.setHex(theme.hemiSky);
      hemi.groundColor.setHex(theme.hemiGnd);
      hemi.intensity = theme.hemiInt;
      sun.color.setHex(theme.sunCol);
      sun.intensity = theme.sunInt;
      rim.color.setHex(theme.rimCol);
      rim.intensity = theme.rimInt;
      bgMat.map = bgTextures[w.wing % bgTextures.length];
      bgMat.needsUpdate = true;

      // 1. Merged static temple geometry (1 draw call)
      var templeGeo = buildTempleGeometry(w, theme);
      disposables.push(templeGeo);
      levelGroup.add(new T.Mesh(templeGeo, MAT.stoneStatic));

      // 2. Contiguous animated elemental pool surfaces (L, W, G)
      for (var gy = 0; gy < w.rows; gy++) {
        var gx = 0;
        while (gx < w.cols) {
          var ch = w.grid[gy * w.cols + gx];
          if (FI.isPoolTile(ch)) {
            var sx = gx;
            while (gx < w.cols && w.grid[gy * w.cols + gx] === ch) gx++;
            var len = gx - sx;
            var segs = Math.max(4, len * 3);
            var pGeo = new T.PlaneGeometry(len, 1.56, segs, 2);
            pGeo.rotateX(-Math.PI / 2);
            disposables.push(pGeo);
            var pMat = ch === 'L' ? MAT.lavaSurf : ch === 'W' ? MAT.waterSurf : MAT.gooSurf;
            var pMeshObj = new T.Mesh(pGeo, pMat);
            var pxC = sx + len / 2 - halfW;
            var pyTop = halfH - gy - 0.08;
            pMeshObj.position.set(pxC, pyTop, -0.10);
            levelGroup.add(pMeshObj);

            // Bright glowing front liquid lip + crest strip so upper-tier pools glow unmistakably
            var lipMat = ch === 'L' ? MAT.lavaLip : ch === 'W' ? MAT.waterLip : MAT.gooLip;
            var lip = new T.Mesh(GEO.box, lipMat);
            lip.scale.set(len - 0.02, 0.24, 0.14);
            lip.position.set(pxC, pyTop - 0.11, 0.77);
            levelGroup.add(lip);

            var fMat = ch === 'L' ? MAT.lavaFoam : ch === 'W' ? MAT.waterFoam : MAT.gooFoam;
            var strip = new T.Mesh(GEO.box, fMat);
            strip.scale.set(len - 0.04, 0.08, 0.18);
            strip.position.set(pxC, pyTop + 0.01, 0.72);
            levelGroup.add(strip);

            levelObjs.pools.push({
              kind: ch,
              geo: pGeo,
              basePos: new Float32Array(pGeo.attributes.position.array),
              x0: sx, len: len, gy: gy,
              cx: pxC, y: pyTop
            });

            // Swelling goo bubbles on G pools
            if (ch === 'G') {
              var nb = Math.max(2, len);
              for (var bi = 0; bi < nb; bi++) {
                var bub = new T.Mesh(GEO.sphereLo, MAT.gooFoam);
                var bx = (sx + ((bi + 0.5) / nb) * len) - halfW;
                bub.position.set(bx, pyTop + 0.04, ((bi % 2) - 0.5) * 0.45);
                levelGroup.add(bub);
                levelObjs.gooBubbles.push({ mesh: bub, baseY: pyTop, phase: bi * 1.63 + gy });
              }
            }
          } else {
            gx++;
          }
        }
      }

      // 3. Carved 3D exit gates
      levelObjs.doors.fire = buildDoorMesh(w.doors.fire, 'fire', theme);
      levelObjs.doors.ice = buildDoorMesh(w.doors.ice, 'ice', theme);

      // 4. Ornate Wall Torch Sconces + Hanging Sanctuary Braziers
      function addSconce(wx, wy, wz, phase, hanging) {
        var tg = new T.Group();
        tg.position.set(wx, wy, wz);
        if (hanging) {
          var chainH = Math.max(0.6, (halfH - 1.0) - (wy + 0.35));
          var chain = new T.Mesh(GEO.cyl, MAT.iron);
          chain.scale.set(0.06, chainH, 0.06);
          chain.position.set(0, 0.35 + chainH / 2, 0.12);
          var bowl = new T.Mesh(GEO.cyl, MAT.brass);
          bowl.scale.set(0.56, 0.22, 0.56);
          bowl.position.set(0, 0.04, 0.14);
          var rim2 = new T.Mesh(GEO.torus, MAT.iron);
          rim2.rotation.x = Math.PI / 2;
          rim2.scale.set(0.82, 0.82, 0.65);
          rim2.position.set(0, 0.15, 0.14);
          tg.add(chain, bowl, rim2);
        } else {
          var plate = new T.Mesh(GEO.box, MAT.iron);
          plate.scale.set(0.32, 0.56, 0.08);
          plate.position.set(0, -0.10, -0.02);
          var holder = new T.Mesh(GEO.cyl, MAT.iron);
          holder.scale.set(0.14, 0.52, 0.14);
          holder.rotation.x = 0.28;
          holder.position.set(0, -0.16, 0.08);
          var cup = new T.Mesh(GEO.cyl, MAT.brass);
          cup.scale.set(0.30, 0.14, 0.30);
          cup.position.set(0, 0.08, 0.14);
          tg.add(plate, holder, cup);
        }
        var fOut = new T.Mesh(GEO.cone, MAT.torchOut);
        fOut.scale.set(0.32, 0.54, 0.32);
        fOut.position.set(0, 0.36, 0.14);
        var fIn = new T.Mesh(GEO.cone, MAT.torchIn);
        fIn.scale.set(0.18, 0.32, 0.18);
        fIn.position.set(0, 0.30, 0.18);
        var halo = new T.Mesh(GEO.plane, MAT.torchGlow);
        halo.scale.set(4.5, 4.5, 1);
        halo.position.set(0, 0.36, 0.06);
        tg.add(fOut, fIn, halo);
        levelGroup.add(tg);
        levelObjs.torches.push({ out: fOut, inn: fIn, halo: halo, x: wx, y: wy + 0.36, phase: phase });
      }
      for (var ti = 0; ti < w.torches.length; ti++) {
        var tc = w.torches[ti];
        addSconce(toX(tc.x), toY(tc.y), -1.12, ti * 2.17, false);
      }
      // Hang warm sanctuary braziers in open upper temple bays (only where upper tiles are open)
      var brazierCols = [6, 23];
      for (var bzi = 0; bzi < brazierCols.length; bzi++) {
        var bcx = brazierCols[bzi];
        var clearBay = true;
        for (var bzy = 1; bzy <= 6; bzy++) {
          if (FI.tileAt(w, bcx, bzy) !== '.') { clearBay = false; break; }
        }
        if (clearBay) addSconce(bcx + 0.5 - halfW, halfH - 5.2, -1.24, 5.1 + bzi * 2.7, true);
      }

      // 5. Spinning 3D Ruby & Sapphire Gems
      for (var gi = 0; gi < w.gems.length; gi++) {
        var gm = w.gems[gi];
        var gg = new T.Group();
        gg.position.set(toX(gm.x), toY(gm.y), 0.18);
        var gemMesh = new T.Mesh(GEO.octa, gm.kind === 'fire' ? MAT.ruby : MAT.sapphire);
        gemMesh.scale.set(0.95, 1.32, 0.95);
        var sparkle = new T.Mesh(GEO.octa, MAT.gemCore);
        sparkle.scale.set(0.45, 0.65, 0.45);
        gg.add(gemMesh, sparkle);
        levelGroup.add(gg);
        levelObjs.gems.push({ group: gg, gem: gemMesh, baseY: gg.position.y, phase: gi * 1.41 });
      }

      // 6. Pushable 3D Wooden Temple Crates
      for (var bi2 = 0; bi2 < w.boxes.length; bi2++) {
        var bxObj = w.boxes[bi2];
        var bw = bxObj.w / FI.T, bh = bxObj.h / FI.T;
        var cg = new T.Group();
        var body = new T.Mesh(GEO.box, MAT.wood);
        body.scale.set(bw, bh, 0.96);
        // Dark timber frame trim
        var barT = new T.Mesh(GEO.box, MAT.woodDark);
        barT.scale.set(bw + 0.03, 0.13, 1.02);
        barT.position.y = bh * 0.41;
        var barB = barT.clone();
        barB.position.y = -bh * 0.41;
        var barL = new T.Mesh(GEO.box, MAT.woodDark);
        barL.scale.set(0.13, bh, 1.02);
        barL.position.x = -bw * 0.41;
        var barR = barL.clone();
        barR.position.x = bw * 0.41;
        // Diagonal cross plank on front
        var diag = new T.Mesh(GEO.box, MAT.woodDark);
        diag.scale.set(bw * 0.96, 0.12, 0.06);
        diag.position.z = 0.49;
        diag.rotation.z = Math.PI / 4;
        var stud = new T.Mesh(GEO.box, MAT.brass);
        stud.scale.set(0.18, 0.18, 0.10);
        stud.position.z = 0.50;
        cg.add(body, barT, barB, barL, barR, diag, stud);
        levelGroup.add(cg);

        var cShad = new T.Mesh(GEO.disc, MAT.shadow);
        cShad.rotation.x = -Math.PI / 2;
        cShad.scale.set(bw * 0.95, 0.65, 1);
        levelGroup.add(cShad);
        levelObjs.boxes.push({ group: cg, shadow: cShad });
      }

      // 7. 3D Levers (color-coded by channel)
      for (var li = 0; li < w.levers.length; li++) {
        var lv = w.levers[li];
        var lg = new T.Group();
        lg.position.set(toX(lv.x), toY(lv.y), -0.14);
        var base = new T.Mesh(GEO.box, MAT.leverBase);
        base.scale.set(0.68, 0.18, 0.44);
        base.position.y = 0.09;
        var pivot = new T.Group();
        pivot.position.y = 0.15;
        var stick = new T.Mesh(GEO.cyl, MAT.iron);
        stick.scale.set(0.10, 0.62, 0.10);
        stick.position.y = 0.30;
        var orb = new T.Mesh(GEO.sphereLo, MAT.ch[lv.ch % 3]);
        orb.scale.set(0.30, 0.30, 0.30);
        orb.position.y = 0.64;
        pivot.add(stick, orb);
        lg.add(base, pivot);
        levelGroup.add(lg);
        levelObjs.levers.push({ pivot: pivot, angle: lv.on ? -0.62 : 0.62 });
      }

      // 8. 3D Pressure Buttons (color-coded by channel)
      for (var bti = 0; bti < w.buttons.length; bti++) {
        var bt = w.buttons[bti];
        var bg2 = new T.Group();
        bg2.position.set(toX(bt.x + bt.w / 2), toY(bt.y + bt.h), 0.02);
        var collar = new T.Mesh(GEO.box, MAT.btnBase);
        collar.scale.set(0.92, 0.12, 0.78);
        collar.position.y = 0.06;
        var pad = new T.Mesh(GEO.box, MAT.ch[bt.ch % 3]);
        pad.scale.set(0.76, 0.18, 0.62);
        pad.position.y = 0.17;
        bg2.add(collar, pad);
        levelGroup.add(bg2);
        levelObjs.buttons.push({ pad: pad, lift: 1 });
      }

      // 9. Moving Bridges / Lifts / Gates + Rail Guides (clamped cleanly inside walls)
      for (var pi2 = 0; pi2 < w.platforms.length; pi2++) {
        var pl = w.platforms[pi2];
        var pw = pl.w / FI.T, ph = pl.h / FI.T;
        var trimMat = pl.ch >= 0 ? MAT.ch[pl.ch % 3] : MAT.autoTrim;

        var x0c = Math.max(-halfW + 1.1, Math.min(halfW - 1.1, toX(pl.x0 + pl.w / 2)));
        var y0c = Math.max(-halfH + 1.1, Math.min(halfH - 1.1, toY(pl.y0 + pl.h / 2)));
        var x1c = Math.max(-halfW + 1.1, Math.min(halfW - 1.1, toX(pl.x1 + pl.w / 2)));
        var y1c = Math.max(-halfH + 1.1, Math.min(halfH - 1.1, toY(pl.y1 + pl.h / 2)));
        var rdx = x1c - x0c, rdy = y1c - y0c;
        var rlen = Math.sqrt(rdx * rdx + rdy * rdy);
        if (rlen > 0.2) {
          var rail = new T.Mesh(GEO.box, MAT.rail);
          rail.scale.set(rlen, 0.14, 0.12);
          rail.position.set((x0c + x1c) / 2, (y0c + y1c) / 2, -0.82);
          rail.rotation.z = Math.atan2(rdy, rdx);
          levelGroup.add(rail);
          var dot0 = new T.Mesh(GEO.cyl, trimMat);
          dot0.rotation.x = Math.PI / 2;
          dot0.scale.set(0.24, 0.14, 0.24);
          dot0.position.set(x0c, y0c, -0.78);
          var dot1 = dot0.clone();
          dot1.position.set(x1c, y1c, -0.78);
          levelGroup.add(dot0, dot1);
        }

        // Chunky 3D stone & glowing channel-trimmed platform slab
        var pg = new T.Group();
        var slab = new T.Mesh(GEO.box, MAT.platStone);
        slab.scale.set(pw, ph, 1.38);
        var stripe = new T.Mesh(GEO.box, trimMat);
        if (pl.kind === 'gate') {
          stripe.scale.set(pw * 0.44, Math.max(0.2, ph - 0.24), 1.46);
        } else {
          stripe.scale.set(Math.max(0.3, pw - 0.18), Math.min(0.18, ph * 0.42), 1.46);
        }
        pg.add(slab, stripe);
        pg.position.set(toX(pl.x + pl.w / 2), toY(pl.y + pl.h / 2), -0.02);
        levelGroup.add(pg);
        levelObjs.platforms.push({ group: pg, w: pw, h: ph });
      }

      syncDynamic(w, 0, { solo: false, activeHero: 'fire', mode: 'play' });
    }

    /* -------------------------------------------------- animation & sync */
    var animT = 0;
    var shakePower = 0;
    var ambTimer = 0;

    function addShake(amount) {
      shakePower = Math.min(1, Math.max(shakePower, amount));
    }

    function updateHeroRig(rigObj, h, dt, isWin) {
      rigObj.root.visible = h.alive;
      rigObj.shadow.visible = h.alive;
      if (!h.alive) return;

      var hx = toX(h.x + h.w / 2);
      var hy = toY(h.y + h.h);
      rigObj.root.position.set(hx, hy, 0.18);

      // Squash & stretch on jump / landing
      if (h.justJumped) { rigObj.sqY = 1.24; rigObj.sqX = 0.84; }
      if (h.justLanded > 0) {
        var imp = Math.min(0.28, h.justLanded * 0.0005);
        rigObj.sqY = 1 - imp;
        rigObj.sqX = 1 + imp * 0.85;
      }
      var relax = Math.min(1, dt * 13);
      rigObj.sqY += (1 - rigObj.sqY) * relax;
      rigObj.sqX += (1 - rigObj.sqX) * relax;

      var speedFrac = Math.min(1, Math.abs(h.vx) / FI.PH.speed);
      if (h.grounded && speedFrac > 0.08) rigObj.walkT += dt * (9 + speedFrac * 6);
      var hop = (h.grounded && speedFrac > 0.1) ? Math.abs(Math.sin(rigObj.walkT)) * 0.07 : 0;
      var cheer = (isWin || h.inDoor) && !view.calm ? Math.abs(Math.sin(animT * 7.5)) * 0.14 : 0;
      var breath = !view.calm ? Math.sin(animT * 3.4 + (h.kind === 'ice' ? 1.8 : 0)) * 0.025 : 0;

      rigObj.rig.position.y = hop + cheer;
      rigObj.rig.scale.set(rigObj.sqX * (1 - breath * 0.5), rigObj.sqY * (1 + breath), rigObj.sqX);

      // Cute slight yaw toward facing direction & run lean
      var targetYaw = h.face * 0.34;
      rigObj.yaw += (targetYaw - rigObj.yaw) * Math.min(1, dt * 14);
      rigObj.rig.rotation.y = rigObj.yaw;
      rigObj.rig.rotation.z = -(h.vx / FI.PH.speed) * 0.13 - (h.pushing * 0.12);

      // Pumping boots & arms
      var stride = h.grounded ? Math.sin(rigObj.walkT) * speedFrac : (h.vy < 0 ? 0.5 : -0.35);
      rigObj.footL.position.y = 0.08 + Math.max(0, stride * 0.10);
      rigObj.footL.position.z = 0.03 + stride * 0.12;
      rigObj.footR.position.y = 0.08 + Math.max(0, -stride * 0.10);
      rigObj.footR.position.z = 0.03 - stride * 0.12;

      if (h.pushing !== 0) {
        rigObj.armL.position.z = 0.22;
        rigObj.armR.position.z = 0.22;
      } else {
        rigObj.armL.position.z = 0.02 - stride * 0.12;
        rigObj.armR.position.z = 0.02 + stride * 0.12;
      }

      // Eye blink every ~3.6 seconds
      var blinkPhase = (animT + (h.kind === 'ice' ? 1.5 : 0)) % 3.6;
      var blinkY = (blinkPhase > 3.46 && blinkPhase < 3.58) ? 0.18 : 1;
      rigObj.eyeL.scale.y = blinkY;
      rigObj.eyeR.scale.y = blinkY;

      // Swaying hair flames / crystal tufts
      var sway = -(h.vx / FI.PH.speed) * 0.28 + (view.calm ? 0 : Math.sin(animT * (h.kind === 'fire' ? 11 : 4.5)) * 0.09);
      rigObj.hair.rotation.z = sway;
      if (h.kind === 'fire' && !view.calm) {
        rigObj.hair.scale.y = 0.94 + Math.sin(animT * 15) * 0.10;
      }

      // Soft contact shadow directly under feet (fades subtly while jumping)
      rigObj.shadow.position.set(hx, hy + 0.02, 0.16);
      var shScale = h.grounded ? 1 : 0.65;
      rigObj.shadow.scale.set(0.74 * shScale, 0.46 * shScale, 1);
    }

    function syncDynamic(w, dt, ctx) {
      if (!w) return;
      ctx = ctx || {};
      var isWin = w.state === 'won';

      // Platforms
      for (var i = 0; i < w.platforms.length; i++) {
        var pl = w.platforms[i], po = levelObjs.platforms[i];
        if (!po) continue;
        po.group.position.set(toX(pl.x + pl.w / 2), toY(pl.y + pl.h / 2), -0.02);
      }

      // Crates
      for (var bi = 0; bi < w.boxes.length; bi++) {
        var bx = w.boxes[bi], bo = levelObjs.boxes[bi];
        if (!bo) continue;
        var bcx = toX(bx.x + bx.w / 2), bcy = toY(bx.y + bx.h / 2);
        bo.group.position.set(bcx, bcy, 0.06);
        bo.shadow.position.set(bcx, toY(bx.y + bx.h) + 0.02, 0.06);
      }

      // Levers smooth flip
      for (var li = 0; li < w.levers.length; li++) {
        var lv = w.levers[li], lo = levelObjs.levers[li];
        if (!lo) continue;
        var tgt = lv.on ? -0.62 : 0.62;
        lo.angle += (tgt - lo.angle) * Math.min(1, dt * 14 + (dt === 0 ? 1 : 0));
        lo.pivot.rotation.z = lo.angle;
      }

      // Pressure Buttons smooth depress
      for (var bti = 0; bti < w.buttons.length; bti++) {
        var bt = w.buttons[bti], bto = levelObjs.buttons[bti];
        if (!bto) continue;
        var tgtL = bt.down ? 0.25 : 1.0;
        bto.lift += (tgtL - bto.lift) * Math.min(1, dt * 16 + (dt === 0 ? 1 : 0));
        bto.pad.position.y = 0.09 + bto.lift * 0.08;
      }

      // Gems spin & hover
      for (var gi = 0; gi < w.gems.length; gi++) {
        var gm = w.gems[gi], go = levelObjs.gems[gi];
        if (!go) continue;
        go.group.visible = !gm.got;
        if (!gm.got && !view.calm) {
          go.group.position.y = go.baseY + Math.sin(animT * 3.4 + go.phase) * 0.11;
          go.gem.rotation.y = animT * 2.1 + go.phase;
        }
      }

      // Exit Doors activation glow
      var dk = ['fire', 'ice'];
      for (var d = 0; d < 2; d++) {
        var k = dk[d], dr = w.doors[k], dobj = levelObjs.doors[k];
        if (!dobj) continue;
        var glow = dr.inside ? 1.0 : 0.45;
        dobj.runeMat.emissiveIntensity = dr.inside ? 1.15 : 0.40;
        dobj.coreMat.opacity = dr.inside ? 0.92 : 0.56 + (view.calm ? 0 : Math.sin(animT * 3.6 + d) * 0.10);
        if (!view.calm) dobj.crest.rotation.y = animT * (dr.inside ? 4.2 : 1.2);
        dobj.crest.scale.y = (k === 'fire' ? 0.42 : 0.72) * (0.95 + glow * 0.14);
      }

      // Heroes
      updateHeroRig(heroes.fire, w.fire, dt, isWin);
      updateHeroRig(heroes.ice, w.ice, dt, isWin);

      // 1P Active Hero Bouncing Arrow Indicator
      var showInd = !!ctx.solo && ctx.mode === 'play' && w.state === 'play';
      indicator.visible = showInd;
      if (showInd) {
        var active = ctx.activeHero === 'ice' ? w.ice : w.fire;
        var bob = view.calm ? 0 : Math.sin(animT * 7.2) * 0.14;
        indicator.position.set(toX(active.x + active.w / 2), toY(active.y) + 0.62 + bob, 0.36);
        indMat.color.setHex(ctx.activeHero === 'ice' ? 0x6ef2ff : 0xffcf40);
        if (!view.calm) indRing.rotation.z = animT * 3.2;
      }

      // Animated pools, goo bubbles, wall torches & ambient embers/sparkles
      if (!view.calm) {
        for (var pi3 = 0; pi3 < levelObjs.pools.length; pi3++) {
          var po2 = levelObjs.pools[pi3];
          var arr = po2.geo.attributes.position;
          var base = po2.basePos;
          var spd = po2.kind === 'W' ? 4.4 : po2.kind === 'L' ? 2.8 : 3.4;
          var amp = po2.kind === 'W' ? 0.045 : 0.038;
          for (var vi = 0; vi < arr.count; vi++) {
            var bx2 = base[vi * 3], bz2 = base[vi * 3 + 2];
            arr.setY(vi, base[vi * 3 + 1] + Math.sin(animT * spd + bx2 * 2.8 + bz2 * 2.2) * amp);
          }
          arr.needsUpdate = true;
        }

        for (var gbi = 0; gbi < levelObjs.gooBubbles.length; gbi++) {
          var gb = levelObjs.gooBubbles[gbi];
          var cyc = (animT * 0.9 + gb.phase) % 1.4;
          var sc = cyc < 1.0 ? Math.sin(cyc * Math.PI) * 0.24 : 0.001;
          gb.mesh.scale.set(sc, sc * 0.85, sc);
          gb.mesh.position.y = gb.baseY + sc * 0.35;
        }

        for (var ti2 = 0; ti2 < levelObjs.torches.length; ti2++) {
          var tc2 = levelObjs.torches[ti2];
          var fl = 0.90 + Math.sin(animT * 13 + tc2.phase) * 0.13 + Math.cos(animT * 21 + tc2.phase) * 0.06;
          tc2.out.scale.set(0.32 * fl, 0.54 * fl, 0.32 * fl);
          tc2.inn.scale.set(0.18 * fl, 0.32 * fl, 0.18 * fl);
          tc2.halo.scale.set(4.5 * fl, 4.5 * fl, 1);
        }

        // Gentle ambient embers / frost sparkles / goo bubbles
        ambTimer += dt;
        if (ambTimer >= 0.16 && levelObjs.pools.length > 0) {
          ambTimer = 0;
          var pick = levelObjs.pools[Math.floor(animT * 7) % levelObjs.pools.length];
          var rx = pick.cx + ((((animT * 97) % 1) - 0.5) * pick.len * 0.85);
          var colHex = pick.kind === 'L' ? 0xffb838 : pick.kind === 'W' ? 0x9cf6ff : 0x7eff5c;
          spawnPart(rx, pick.y + 0.08, 0.18, ((animT * 13) % 1 - 0.5) * 0.4, 1.25, 0.05, 0.65, 0.09, -0.3, colHex);
        }
      }
    }

    function update(w, dt, ctx) {
      ctx = ctx || {};
      animT += dt;
      syncDynamic(w, dt, ctx);
      stepParticles(dt);

      // Subtle screen shake & gentle title diorama sway
      if (shakePower > 0) shakePower = Math.max(0, shakePower - dt * 3.0);
      var sx = shakePower > 0 && !view.calm ? Math.sin(animT * 88) * shakePower * 0.22 : 0;
      var sy = shakePower > 0 && !view.calm ? Math.cos(animT * 74) * shakePower * 0.18 : 0;
      var sway = ctx.mode === 'title' && !view.calm ? Math.sin(animT * 0.55) * 0.45 : 0;
      camera.position.set(camBase.x + sx + sway, camBase.y + sy, camBase.z);
      camera.lookAt(camTarget);
    }

    function resize(width, height) {
      width = Math.max(1, width | 0);
      height = Math.max(1, height | 0);
      renderer.setSize(width, height, false);
      curAspect = width / height;
      camera.aspect = curAspect;
      var tanHalf = Math.tan((camera.fov * Math.PI / 180) / 2);
      var zV = 9.55 / tanHalf;
      var zH = 15.65 / (tanHalf * curAspect);
      camBase.set(0, 0.82, Math.max(zV, zH));
      camera.position.copy(camBase);
      camera.lookAt(camTarget);
      camera.updateProjectionMatrix();
    }

    /* ---------------------------------- software WebGL pacing & fencing */
    var pace = Kit.webgl.pacer(renderer, { software: software });
    view.mayDraw = pace.mayDraw;

    var draws = 0;
    view.render = function () {
      renderer.render(scene, camera);
      draws++;
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
    view.update = update;
    view.resize = resize;
    view.burst = burst;
    view.clearParticles = clearParticles;
    view.addShake = addShake;
    view.applyHat = applyHat;
    view.particleCount = function () { return pMesh.count; };
    view.drawCount = function () { return draws; };
    view.dispose = function () { clearLevel(); renderer.dispose(); };

    return view;
  };
})();
