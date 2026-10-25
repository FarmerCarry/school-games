/* Three.js view for عدّاء المفاتيح. Instanced keycaps, blob shadows, no shadow maps. */
(function (KR) {
  'use strict';
  var MAX = 700;
  var LETTERS = 48;
  var SPARKS = 200;

  function hex(n) { return n >>> 0; }

  KR.createView = function (canvas) {
    var T = window.THREE;
    if (!T) throw new Error('Three.js unavailable');
    var renderer = new T.WebGLRenderer({ canvas: canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.setPixelRatio(1);
    renderer.setSize(1280, 720, false);
    var scene = new T.Scene();
    scene.fog = new T.Fog(0xffc2e8, 28, 92);
    var camera = new T.PerspectiveCamera(60, 1280 / 720, 0.12, 180);
    scene.add(new T.HemisphereLight(0xfff4ea, 0x6a4a62, 1.35));
    var sun = new T.DirectionalLight(0xfff7ee, 0.85);
    sun.position.set(-8, 18, 6);
    scene.add(sun);

    var bodyGeo = new T.BoxGeometry(1, 1, 1);
    var sphereGeo = new T.SphereGeometry(1, 10, 8);
    var cylGeo = new T.CylinderGeometry(1, 1, 1, 8);
    var shadowGeo = new T.CircleGeometry(1, 16);
    var ringGeo = new T.RingGeometry(0.72, 1, 20);
    var planeGeo = new T.PlaneGeometry(1, 1);
    var colors = { body: new T.Color(), top: new T.Color(), accent: new T.Color(), sea: new T.Color(), ink: new T.Color() };

    function instanced(geo, mat, n) {
      var mesh = new T.InstancedMesh(geo, mat, n || MAX);
      mesh.frustumCulled = false;
      mesh.count = 0;
      scene.add(mesh);
      return mesh;
    }
    var lambert = function (color, extra) {
      return new T.MeshLambertMaterial(Object.assign({ color: color }, extra || {}));
    };
    var bodies = instanced(bodyGeo, lambert(0xffffff));
    var tops = instanced(bodyGeo, lambert(0xffffff));
    var rails = instanced(bodyGeo, lambert(0xffffff));
    var balls = instanced(sphereGeo, lambert(0xff5aa8));
    var sticks = instanced(cylGeo, lambert(0xfff1c9));
    var gates = instanced(bodyGeo, lambert(0xff4d6a, { transparent: true, opacity: 0.45, depthWrite: false }));
    var fans = instanced(bodyGeo, lambert(0xbfe9ff));
    var flags = instanced(bodyGeo, lambert(0xffe56a));
    var sparks = instanced(bodyGeo, lambert(0xffffff));
    var speedLines = [];
    for (var sl = 0; sl < 4; sl++) {
      var line = new T.Mesh(bodyGeo, lambert(0xfff6ea, { transparent: true, opacity: 0.45, depthWrite: false }));
      line.visible = false;
      line.frustumCulled = false;
      scene.add(line);
      speedLines.push(line);
    }
    var seaMat = lambert(0xff7eb8);
    var sea = new T.Mesh(bodyGeo, seaMat);
    sea.scale.set(180, 0.5, 240);
    sea.position.set(0, -2.28, 30);
    scene.add(sea);
    var groundCanvas = document.createElement('canvas');
    groundCanvas.width = groundCanvas.height = 64;
    var groundCtx = groundCanvas.getContext('2d');
    groundCtx.fillStyle = '#ff9ec8';
    groundCtx.fillRect(0, 0, 64, 64);
    groundCtx.fillStyle = '#ffd4ea';
    for (var gi = 0; gi < 64; gi += 8) groundCtx.fillRect(0, gi, 64, 3);
    groundCtx.fillStyle = '#fff6ea';
    for (var gd = 6; gd < 64; gd += 16) { groundCtx.beginPath(); groundCtx.arc(gd, (gd * 3) % 64, 2.4, 0, 6.3); groundCtx.fill(); }
    var groundTex = new T.CanvasTexture(groundCanvas);
    groundTex.colorSpace = T.SRGBColorSpace;
    groundTex.wrapS = groundTex.wrapT = T.RepeatWrapping;
    groundTex.repeat.set(22, 30);
    seaMat.map = groundTex;
    seaMat.color.setHex(0xffffff);
    var choco = new T.Mesh(bodyGeo, lambert(0x6a3418));
    choco.scale.set(180, 2.4, 240);
    choco.position.set(0, -3.7, 30);
    scene.add(choco);
    var sheen = new T.Mesh(bodyGeo, lambert(0xffe7c8, { transparent: true, opacity: 0.16, depthWrite: false }));
    sheen.scale.set(180, 0.08, 240);
    sheen.position.set(0, -2.02, 30);
    scene.add(sheen);
    var skyCanvas = document.createElement('canvas');
    skyCanvas.width = 8;
    skyCanvas.height = 256;
    var skyCtx = skyCanvas.getContext('2d');
    var skyTex = new T.CanvasTexture(skyCanvas);
    skyTex.colorSpace = T.SRGBColorSpace;
    var sky = new T.Mesh(new T.SphereGeometry(140, 14, 10), new T.MeshBasicMaterial({ map: skyTex, side: T.BackSide, fog: false, depthWrite: false }));
    scene.add(sky);
    var cloudCanvas = document.createElement('canvas');
    cloudCanvas.width = 256;
    cloudCanvas.height = 160;
    var cloudCtx = cloudCanvas.getContext('2d');
    function cloudPuff(x, y, r, inner, edge) {
      var g = cloudCtx.createRadialGradient(x, y - r * 0.18, r * 0.08, x, y, r);
      g.addColorStop(0, inner);
      g.addColorStop(0.55, edge);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      cloudCtx.fillStyle = g;
      cloudCtx.beginPath();
      cloudCtx.ellipse(x, y, r * 1.15, r * 0.82, 0, 0, Math.PI * 2);
      cloudCtx.fill();
    }
    cloudPuff(78, 88, 52, 'rgba(255,255,255,0.98)', 'rgba(255,246,252,0.55)');
    cloudPuff(148, 80, 64, 'rgba(255,255,255,0.96)', 'rgba(238,247,255,0.5)');
    cloudPuff(198, 96, 46, 'rgba(255,252,255,0.94)', 'rgba(255,236,246,0.45)');
    cloudPuff(112, 70, 36, 'rgba(255,255,255,1)', 'rgba(255,255,255,0.35)');
    var cloudShade = cloudCtx.createLinearGradient(0, 70, 0, 150);
    cloudShade.addColorStop(0, 'rgba(255,255,255,0)');
    cloudShade.addColorStop(1, 'rgba(186,214,255,0.28)');
    cloudCtx.fillStyle = cloudShade;
    cloudCtx.fillRect(0, 0, 256, 160);
    var cloudTex = new T.CanvasTexture(cloudCanvas);
    cloudTex.colorSpace = T.SRGBColorSpace;
    var clouds = instanced(planeGeo, new T.MeshBasicMaterial({
      map: cloudTex, transparent: true, depthWrite: false, side: T.DoubleSide, fog: false
    }));
    var sprinkles = instanced(bodyGeo, lambert(0xffffff));
    var torusGeo = new T.TorusGeometry(1, 0.38, 5, 10);
    var donuts = instanced(torusGeo, lambert(0xffffff), 16);
    var coneGeo = new T.ConeGeometry(1, 1, 6);
    var castle = new T.Group();
    function prop(geo, x, y, z, sx, sy, sz, color) {
      var mesh = new T.Mesh(geo, lambert(color));
      mesh.position.set(x, y, z);
      mesh.scale.set(sx, sy, sz);
      castle.add(mesh);
      return mesh;
    }
    prop(bodyGeo, 0, 1.15, 0, 2.6, 2.15, 1.55, 0xff7eb8);
    prop(bodyGeo, 0, 0.72, -0.82, 0.62, 1.05, 0.18, 0xff4eb6);
    prop(cylGeo, -1.25, 1.55, 0.05, 0.58, 2.5, 0.58, 0xe85a9a);
    prop(cylGeo, -1.25, 3.05, 0.05, 0.52, 1.15, 0.52, 0xffc4e2);
    prop(coneGeo, -1.25, 4.05, 0.05, 0.86, 1.15, 0.86, 0xffd24a);
    prop(cylGeo, 1.3, 1.7, 0.05, 0.58, 2.8, 0.58, 0x5aa6e8);
    prop(cylGeo, 1.3, 3.35, 0.05, 0.5, 1.15, 0.5, 0xc5e6ff);
    prop(coneGeo, 1.3, 4.4, 0.05, 0.86, 1.2, 0.86, 0xffe56a);
    prop(coneGeo, 0, 2.85, 0, 0.72, 0.95, 0.72, 0xff4eb6);
    prop(cylGeo, 1.3, 5.15, 0.05, 0.05, 0.7, 0.05, 0xfff6ea);
    var flagCloth = prop(planeGeo, 1.72, 5.35, 0.05, 0.78, 0.4, 1, 0xffe14d);
    flagCloth.material.side = T.DoubleSide;
    scene.add(castle);
    var tileCanvas = document.createElement('canvas');
    tileCanvas.width = 64;
    tileCanvas.height = 32;
    var tileCtx = tileCanvas.getContext('2d');
    tileCtx.fillStyle = '#fff6ea';
    tileCtx.fillRect(0, 0, 64, 32);
    var tileCols = ['#ff8ec8', '#ffe56a', '#8ef0c0', '#9fd4ff'];
    for (var ty = 0; ty < 2; ty++) {
      for (var tx = 0; tx < 4; tx++) {
        tileCtx.fillStyle = tileCols[(tx + ty) % 4];
        tileCtx.fillRect(tx * 16 + 1, ty * 16 + 1, 14, 14);
      }
    }
    var tileTex = new T.CanvasTexture(tileCanvas);
    tileTex.colorSpace = T.SRGBColorSpace;
    tileTex.wrapS = tileTex.wrapT = T.RepeatWrapping;
    tileTex.repeat.set(4, 4);
    var tiles = new T.Mesh(planeGeo, new T.MeshBasicMaterial({ map: tileTex }));
    tiles.rotation.x = -Math.PI / 2;
    tiles.visible = false;
    scene.add(tiles);
    var rims = [];
    var rimCols = [0xff4eb6, 0xffd24a, 0x3ddea0, 0x5eb6ff];
    for (var ri = 0; ri < 4; ri++) {
      var rim = new T.Mesh(bodyGeo, lambert(rimCols[ri]));
      rim.visible = false;
      scene.add(rim);
      rims.push(rim);
    }
    var floodMat = new T.MeshLambertMaterial({ color: 0x6a3018, transparent: true, opacity: 0.78, depthWrite: false });
    var flood = new T.Mesh(bodyGeo, floodMat);
    flood.visible = false;
    scene.add(flood);
    var dummy = new T.Object3D();
    var tint = new T.Color();
    var letterMat = {};
    var letterMesh = [];
    for (var i = 0; i < LETTERS; i++) {
      var m = new T.Mesh(planeGeo, new T.MeshBasicMaterial({ color: 0xffffff, transparent: true }));
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      m.frustumCulled = false;
      scene.add(m);
      letterMesh.push(m);
    }
    var pops = [];
    var popped = Object.create(null);
    for (var popI = 0; popI < 6; popI++) {
      var pop = new T.Mesh(planeGeo, new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false }));
      pop.rotation.x = -Math.PI / 2;
      pop.visible = false;
      pop.frustumCulled = false;
      pop.userData = { life: 0, y0: 0, born: 0 };
      scene.add(pop);
      pops.push(pop);
    }
    var gateLabel = {};
    var gateMesh = [];
    for (var g = 0; g < 6; g++) {
      var gm = new T.Mesh(planeGeo, new T.MeshBasicMaterial({ color: 0xffffff, transparent: true }));
      gm.visible = false;
      gm.frustumCulled = false;
      scene.add(gm);
      gateMesh.push(gm);
    }

    function buddy(color, packHex) {
      var group = new T.Group();
      var mat = lambert(color, { transparent: true, emissive: color, emissiveIntensity: 0.38 });
      var skin = lambert(0xfff3df, { transparent: true, emissive: 0xffd8b0, emissiveIntensity: 0.2 });
      var body = new T.Mesh(new T.CapsuleGeometry(0.32, 0.46, 3, 8), mat);
      body.position.y = 0.58;
      var shellMat = new T.MeshBasicMaterial({ color: 0xeaf6ff, side: T.BackSide, transparent: true, depthWrite: false });
      var shell = new T.Mesh(new T.CapsuleGeometry(0.32, 0.46, 3, 8), shellMat);
      shell.position.y = 0.58;
      shell.scale.setScalar(1.12);
      shell.renderOrder = 1;
      function arm(x) {
        var pivot = new T.Group();
        pivot.position.set(x, 0.78, 0);
        var limb = new T.Mesh(new T.CapsuleGeometry(0.09, 0.32, 2, 5), skin);
        limb.position.y = -0.22;
        var hand = new T.Mesh(sphereGeo, skin);
        hand.scale.set(0.14, 0.14, 0.14);
        hand.position.y = -0.44;
        pivot.add(limb, hand);
        group.add(pivot);
        return pivot;
      }
      var armL = arm(-0.42);
      var armR = arm(0.42);
      var earIn = lambert(0xff4d88, { transparent: true });
      var earRim = lambert(0x6a1840, { transparent: true });
      var earGold = lambert(0xffc14a, { transparent: true });
      function ear(x) {
        var g = new T.Group();
        var rim = new T.Mesh(sphereGeo, earRim);
        rim.scale.set(0.22, 0.52, 0.14);
        var outer = new T.Mesh(sphereGeo, earGold);
        outer.scale.set(0.16, 0.42, 0.1);
        outer.position.z = 0.03;
        var inner = new T.Mesh(sphereGeo, earIn);
        inner.scale.set(0.08, 0.2, 0.05);
        inner.position.set(0, -0.02, 0.07);
        g.add(rim, outer, inner);
        g.position.set(x * 0.27, 1.58, 0);
        g.rotation.z = x * -0.62;
        group.add(g);
      }
      ear(-1);
      ear(1);
      var pack = new T.Mesh(sphereGeo, lambert(packHex, { transparent: true, emissive: packHex, emissiveIntensity: 0.22 }));
      pack.position.set(0, 0.56, -0.5);
      pack.scale.set(0.36, 0.42, 0.28);
      var strap = lambert(0xffe14d, { transparent: true });
      function strapMesh(x) {
        var s = new T.Mesh(bodyGeo, strap);
        s.scale.set(0.09, 0.58, 0.05);
        s.position.set(x, 0.8, -0.46);
        s.rotation.set(0.35, 0, x < 0 ? 0.38 : -0.38);
        group.add(s);
      }
      strapMesh(-0.18);
      strapMesh(0.18);
      var buckle = new T.Mesh(sphereGeo, lambert(0xfff6ea, { transparent: true }));
      buckle.scale.set(0.1, 0.1, 0.06);
      buckle.position.set(0, 0.64, -0.74);
      group.add(buckle);
      var scarf = new T.Mesh(bodyGeo, lambert(0xffe56a, { transparent: true }));
      scarf.position.set(0.22, 0.86, -0.24);
      scarf.scale.set(0.08, 0.28, 0.06);
      group.add(shell, pack, scarf);
      var faceCanvas = document.createElement('canvas');
      faceCanvas.width = faceCanvas.height = 128;
      var fctx = faceCanvas.getContext('2d');
      fctx.fillStyle = '#fff6ea';
      fctx.beginPath(); fctx.arc(64, 64, 60, 0, Math.PI * 2); fctx.fill();
      fctx.fillStyle = '#ffb0c8';
      fctx.beginPath(); fctx.arc(28, 78, 12, 0, Math.PI * 2); fctx.arc(100, 78, 12, 0, Math.PI * 2); fctx.fill();
      fctx.fillStyle = '#fff';
      fctx.beginPath(); fctx.ellipse(42, 54, 16, 20, 0, 0, Math.PI * 2); fctx.ellipse(86, 54, 16, 20, 0, 0, Math.PI * 2); fctx.fill();
      fctx.fillStyle = '#2a2030';
      fctx.beginPath(); fctx.arc(46, 56, 8, 0, Math.PI * 2); fctx.arc(90, 56, 8, 0, Math.PI * 2); fctx.fill();
      fctx.fillStyle = '#fff';
      fctx.beginPath(); fctx.arc(49, 52, 3, 0, Math.PI * 2); fctx.arc(93, 52, 3, 0, Math.PI * 2); fctx.fill();
      fctx.strokeStyle = '#2a2030'; fctx.lineWidth = 5; fctx.lineCap = 'round';
      fctx.beginPath(); fctx.arc(64, 70, 22, 0.25, Math.PI - 0.25); fctx.stroke();
      var faceMap = new T.CanvasTexture(faceCanvas);
      faceMap.colorSpace = T.SRGBColorSpace;
      var face = new T.Mesh(planeGeo, new T.MeshBasicMaterial({ map: faceMap, transparent: true, depthWrite: false, side: T.DoubleSide }));
      face.position.set(0, 0.98, 0.3);
      face.scale.set(0.74, 0.74, 1);
      var footL = new T.Mesh(sphereGeo, mat);
      var footR = new T.Mesh(sphereGeo, mat);
      footL.scale.set(0.16, 0.1, 0.22);
      footR.scale.set(0.16, 0.1, 0.22);
      var hat = new T.Group();
      group.add(body, face, footL, footR, hat);
      group.userData = { mat: mat, skin: skin, face: face, armL: armL, armR: armR, pack: pack, scarf: scarf, strap: strap, earIn: earIn, earRim: earRim, earGold: earGold, buckle: buckle.material, shell: shellMat, footL: footL, footR: footR, hat: hat, hatId: -1 };
      scene.add(group);
      var shadow = new T.Mesh(shadowGeo, new T.MeshBasicMaterial({ color: 0x2a1428, transparent: true, opacity: 0.28, depthWrite: false }));
      shadow.rotation.x = -Math.PI / 2;
      scene.add(shadow);
      var ring = new T.Mesh(ringGeo, new T.MeshBasicMaterial({ color: 0xfff1a8, transparent: true, opacity: 0.9, side: T.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      scene.add(ring);
      return { group: group, shadow: shadow, ring: ring };
    }
    var buddies = [buddy(0x1c9bff, 0xff2f86), buddy(0xff4eb6, 0x3d7dff)];

    function makeBear() {
      var g = new T.Group();
      function blob(x, y, z, sx, sy, sz, color) {
        var mesh = new T.Mesh(sphereGeo, lambert(color));
        mesh.position.set(x, y, z);
        mesh.scale.set(sx, sy, sz);
        g.add(mesh);
      }
      blob(0, 0.55, 0, 0.42, 0.5, 0.36, 0xff4d8d);
      blob(0, 0.48, 0.2, 0.22, 0.3, 0.14, 0xffd6e6);
      blob(0, 1.08, 0.06, 0.28, 0.26, 0.24, 0xff6aa3);
      blob(-0.16, 1.34, 0.02, 0.1, 0.12, 0.08, 0xff4d8d);
      blob(0.16, 1.34, 0.02, 0.1, 0.12, 0.08, 0xff4d8d);
      blob(-0.08, 1.12, 0.24, 0.045, 0.05, 0.03, 0x3a2144);
      blob(0.08, 1.12, 0.24, 0.045, 0.05, 0.03, 0x3a2144);
      g.visible = false;
      scene.add(g);
      return g;
    }
    var bears = [makeBear(), makeBear()];
    var ghostMat = lambert(0xd7f6ff, { transparent: true, opacity: 0.42, depthWrite: false, emissive: 0xb7e8ff, emissiveIntensity: 0.45 });
    var ghostEarMat = lambert(0xffe14d, { transparent: true, opacity: 0.7, depthWrite: false });
    var ghost = new T.Group();
    var ghostBody = new T.Mesh(new T.CapsuleGeometry(0.26, 0.36, 2, 6), ghostMat);
    ghostBody.position.y = 0.52;
    var ghostEarL = new T.Mesh(sphereGeo, ghostEarMat);
    ghostEarL.scale.set(0.12, 0.28, 0.08);
    ghostEarL.position.set(-0.16, 1.08, 0);
    var ghostEarR = new T.Mesh(sphereGeo, ghostEarMat);
    ghostEarR.scale.set(0.12, 0.28, 0.08);
    ghostEarR.position.set(0.16, 1.08, 0);
    ghost.add(ghostBody, ghostEarL, ghostEarR);
    ghost.visible = false;
    scene.add(ghost);
    var ghostRun = null;

    function hatMesh(id, parent) {
      while (parent.children.length) parent.remove(parent.children[0]);
      if (!id) {
        var bow = new T.Mesh(sphereGeo, lambert(0xff4eb6, { transparent: true }));
        bow.scale.set(0.14, 0.09, 0.08);
        bow.position.y = 1.22;
        parent.add(bow);
        return;
      }
      var mat = lambert(id === 2 ? 0xbfe9ff : id === 3 ? 0xffe56a : id === 4 ? 0xff8ad0 : 0xffe56a, { transparent: true });
      if (id === 1) {
        var crown = new T.Mesh(new T.ConeGeometry(0.22, 0.28, 5), mat);
        crown.position.y = 1.12;
        parent.add(crown);
      } else if (id === 2) {
        var blade = new T.Mesh(bodyGeo, mat);
        blade.scale.set(0.5, 0.06, 0.12);
        blade.position.y = 1.12;
        parent.add(blade);
      } else if (id === 3) {
        var star = new T.Mesh(new T.OctahedronGeometry(0.18), mat);
        star.position.y = 1.14;
        parent.add(star);
      } else {
        var cake = new T.Mesh(cylGeo, mat);
        cake.scale.set(0.22, 0.16, 0.22);
        cake.position.y = 1.08;
        parent.add(cake);
      }
    }

    var parts = [];
    var glowUntil = Object.create(null);
    var waveUntil = [0, 0];
    var shake = 0;
    var themeIndex = -1;
    var disposed = false;

    function paintChar(ch) {
      if (letterMat[ch]) return letterMat[ch];
      var c = document.createElement('canvas');
      c.width = c.height = 128;
      var ctx = c.getContext('2d');
      ctx.fillStyle = '#fff6ea';
      ctx.fillRect(0, 0, 128, 128);
      ctx.fillStyle = '#3a2140';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.direction = 'rtl';
      var latin = LATIN[ch];
      ctx.font = '700 96px Fredoka';
      ctx.fillText(ch || '؟', 64, latin ? 56 : 66);
      if (latin) { ctx.font = '700 28px Fredoka'; ctx.fillText(latin, 64, 108); }
      var tex = new T.CanvasTexture(c);
      tex.colorSpace = T.SRGBColorSpace;
      letterMat[ch] = new T.MeshBasicMaterial({ map: tex, transparent: true, polygonOffset: true, polygonOffsetFactor: -2 });
      return letterMat[ch];
    }
    function paintGate(n) {
      var key = String(n);
      if (gateLabel[key]) return gateLabel[key];
      var c = document.createElement('canvas');
      c.width = 256; c.height = 64;
      var ctx = c.getContext('2d');
      ctx.fillStyle = '#fff4f6';
      ctx.fillRect(0, 0, 256, 64);
      ctx.fillStyle = '#8f1838';
      ctx.font = '700 28px Fredoka';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.direction = 'rtl';
      ctx.fillText('تحتاج سرعة ' + key, 128, 34);
      var tex = new T.CanvasTexture(c);
      tex.colorSpace = T.SRGBColorSpace;
      gateLabel[key] = new T.MeshBasicMaterial({ map: tex, transparent: true, side: T.DoubleSide });
      return gateLabel[key];
    }

    var LATIN = {
      'ا': 'a', 'ب': 'b', 'ت': 't', 'ث': 'th', 'ج': 'j', 'ح': 'h', 'خ': 'kh', 'د': 'd',
      'ذ': 'dh', 'ر': 'r', 'ز': 'z', 'س': 's', 'ش': 'sh', 'ص': 's', 'ض': 'd', 'ط': 't',
      'ظ': 'z', 'ع': 'ʿ', 'غ': 'gh', 'ف': 'f', 'ق': 'q', 'ك': 'k', 'ل': 'l', 'م': 'm',
      'ن': 'n', 'ه': 'h', 'و': 'w', 'ي': 'y', 'ى': 'a', 'ة': 'h', 'ء': 'ʾ', 'ئ': 'y', 'ؤ': 'w'
    };
    var TRAIL = [0xff5ad0, 0xffe56a, 0x7dffa0, 0x8fd0ff];

    function glowOf(id) {
      var until = glowUntil[id];
      if (!until) return 0;
      var left = (until - performance.now()) / 200;
      if (left <= 0) { delete glowUntil[id]; return 0; }
      return left > 1 ? 1 : left;
    }
    function pressKey(id) {
      if (id == null) return;
      glowUntil[id] = performance.now() + 200;
    }
    function spark(x, y, z, color, life) {
      if (parts.length >= SPARKS) return;
      parts.push({
        x: x, y: y, z: z,
        vx: (Math.random() - 0.5) * 1.4,
        vy: 0.6 + Math.random(),
        vz: (Math.random() - 0.5) * 1.4,
        life: life || 0.35,
        size: 0.08 + Math.random() * 0.06,
        color: color
      });
    }

    function put(mesh, index, x, y, z, sx, sy, sz, color, ry) {
      dummy.position.set(x, y, z);
      dummy.scale.set(Math.max(0.02, sx), Math.max(0.02, sy), Math.max(0.02, sz));
      dummy.rotation.set(0, ry || 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      if (color != null) { tint.setHex(hex(color)); mesh.setColorAt(index, tint); }
    }
    function mix(a, b, t) {
      var ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
      var br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
      return ((ar + (br - ar) * t) | 0) << 16 | ((ag + (bg - ag) * t) | 0) << 8 | ((ab + (bb - ab) * t) | 0);
    }
    function css(n) { return '#' + ('000000' + (n >>> 0).toString(16)).slice(-6); }
    function shade(n, f) {
      var r = Math.max(0, Math.min(255, ((n >> 16) & 255) * f));
      var g = Math.max(0, Math.min(255, ((n >> 8) & 255) * f));
      var b = Math.max(0, Math.min(255, (n & 255) * f));
      return (r | 0) << 16 | (g | 0) << 8 | (b | 0);
    }
    var CANDY = [0xff4eb6, 0xffd24a, 0x7dffb0, 0x8fd0ff, 0xff8ad8, 0xfff1a8, 0xff9a62];
    var ALPHA = 'ضصثقفغعهخحجدشسيبلاتنمكطئءؤرلاىةوزظ';

    function applyTheme(state) {
      var idx = state.mode === 'world' || state.mode === 'race' ? state.world | 0 : state.mode === 'tower' ? 6 : 0;
      if (idx === themeIndex) return;
      themeIndex = idx;
      var th = KR.themes[idx] || KR.themes[0];
      var top = mix(th.sky, 0x9fd8ff, 0.62);
      var mid = mix(th.sky, 0xffffff, 0.28);
      var grd = skyCtx.createLinearGradient(0, 0, 0, 256);
      grd.addColorStop(0, css(top));
      grd.addColorStop(0.55, css(mid));
      grd.addColorStop(1, css(th.fog));
      skyCtx.fillStyle = grd;
      skyCtx.fillRect(0, 0, 8, 256);
      skyTex.needsUpdate = true;
      scene.background = new T.Color(th.fog);
      scene.fog.color.setHex(th.fog);
      seaMat.color.setHex(th.sea);
      colors.body.setHex(th.key);
      colors.top.setHex(th.top);
      colors.accent.setHex(th.accent);
      colors.ink.setHex(th.dark);
    }
    function keyColor(p) {
      if (p.hw > 5) return 0xffb3d6;
      if (p.moment === 'gold') return 0xffe14d;
      if (p.moment === 'boost') return 0x5debff;
      if (p.t === 'tramp') return 0x3ddc6a;
      if (p.t === 'launch') return 0xffc400;
      if (p.t === 'ice') return 0x9ee7ff;
      if (p.t === 'jelly') return 0xff4fa3;
      if (p.t === 'sink') return 0xc46a3a;
      if (p.t === 'caps') return 0xff7a3c;
      if (p.t === 'portal') return 0x9b6bff;
      if (p.t === 'shop') return 0xffd24a;
      if (p.t === 'tower') return 0x7ec8ff;
      if (p.t === 'convey') return 0x4aa3ff;
      if (p.flag) return 0xffe56a;
      return CANDY[(p.id * 3 + (themeIndex < 0 ? 0 : themeIndex)) % CANDY.length];
    }

    function render(state, opts) {
      if (disposed || !state) return;
      opts = opts || {};
      applyTheme(state);
      var low = opts.quality === 'low';
      var reduced = !!opts.reduced;
      var two = state.players.length > 1;
      scene.fog.near = low ? 12 : two ? 16 : 22;
      scene.fog.far = low ? 42 : two ? 52 : 78;
      var pieces = state.pieces;
      var nb = 0, nt = 0, nr = 0, ns = 0, ng = 0, nf = 0, nflag = 0, nstick = 0, nlet = 0, ngate = 0;
      var speedOk = state.players[0] ? state.players[0].speed : 0;
      var focus = state.players[0] || { x: 0, z: 0 };
      var letterPick = [];
      var widePad = null;
      function pressed(id) {
        for (var s = 0; s < state.players.length; s++) {
          var pl = state.players[s];
          if (pl && pl.onGround && pl.ground === id) return 0.075;
        }
        return 0;
      }
      for (var i = 0; i < pieces.length && nb < MAX - 2; i++) {
        var p = pieces[i];
        if (p.t === 'candy') {
          if (!p.got && ns < MAX - 8) {
            var bob = reduced ? 0 : Math.sin(state.time * 3.2 + p.id) * 0.09;
            var cy = p.y + bob;
            if (p.star) {
              put(balls, ns++, p.x, cy, p.z, 0.16, 0.16, 0.16, 0xffe56a);
              if (ns < MAX - 8) put(balls, ns++, p.x, cy, p.z, 0.07, 0.07, 0.07, 0xffffff);
            } else {
              put(balls, ns++, p.x, cy, p.z, 0.26, 0.2, 0.26, CANDY[p.id % CANDY.length]);
              if (ns < MAX - 8) put(balls, ns++, p.x, cy + 0.12, p.z, 0.1, 0.08, 0.1, 0xfff6ea);
            }
          }
          continue;
        }
        if (p.t === 'chev') {
          put(flags, nflag++, p.x, p.y + 0.2, p.z + 0.2, 0.55, 0.1, 0.36, 0xffe56a);
          continue;
        }
        if (p.t === 'rail') {
          var candy = (p.id % 2) ? 0xff4eb6 : 0xffd24a;
          put(sticks, nstick++, p.x, p.y, p.z - p.hd * 0.55, 0.2, Math.max(0.45, p.hh * 2.6), 0.2, candy);
          put(sticks, nstick++, p.x, p.y, p.z + p.hd * 0.55, 0.2, Math.max(0.45, p.hh * 2.6), 0.2, candy);
          put(rails, nr++, p.x, p.y + p.hh * 0.85, p.z, 0.14, 0.1, p.hd * 2, 0xfff6ea);
          continue;
        }
        if (p.t === 'gum' || p.t === 'sweep' || p.t === 'pop') {
          put(balls, ns++, p.x, p.y + (p.r || p.hh), p.z, p.r || p.hh, p.r || p.hh, p.r || p.hh, p.t === 'gum' ? 0xff4d8d : 0xffd24a);
          if (p.t === 'pop') put(sticks, nstick++, p.baseX || p.x, (p.pivot || 2) * 0.5, p.baseZ || p.z, 0.08, p.pivot || 2, 0.08, 0xfff1c9);
          continue;
        }
        if (p.t === 'fan') { put(fans, nf++, p.x, p.y, p.z, p.hw * 2, p.hh * 2, p.hd * 2, 0x9ad7ff); continue; }
        if (p.t === 'gate') {
          var open = speedOk >= p.n;
          put(gates, ng++, p.x, p.y, p.z, p.hw * 2, p.hh * 2, p.hd * 2, open ? 0x7dffa8 : 0xff4d6a);
          if (ngate < gateMesh.length) {
            var sign = gateMesh[ngate++];
            sign.visible = true;
            sign.material = paintGate(p.n);
            sign.position.set(p.x, p.y + p.hh * 0.2, p.z + p.hd + 0.08);
            sign.scale.set(2.4, 0.6, 1);
          }
          continue;
        }
        if (p.t === 'caps' && p.gone) continue;
        var col = keyColor(p);
        var dip = pressed(p.id);
        if (dip) glowUntil[p.id] = performance.now() + 200;
        var glow = glowOf(p.id);
        var topY = p.y + p.hh - (dip ? 0.14 : glow * 0.06);
        var wide = p.hw > 5;
        if (wide) widePad = p;
        var skirt = wide ? 0.22 : Math.max(0.1, p.hh * (dip ? 0.72 : 1.45));
        var bulge = wide ? 1 : (dip ? 1.22 : 1 + glow * 0.1);
        var lit = dip || glow > 0.02;
        var bodyCol = lit ? mix(shade(col, 0.68), 0xffffff, dip ? 0.42 : glow * 0.55) : shade(col, wide ? 0.9 : 0.68);
        var topCol = lit ? mix(shade(col, 1.18), 0xffffff, dip ? 0.62 : glow * 0.8) : shade(col, 1.18);
        var ahead = !wide && !reduced && !dip && p.hw < 3 && p.z > focus.z + 0.35 && p.z < focus.z + 16;
        if (ahead) {
          topY += Math.sin(state.time * 2.8 + p.z * 0.9) * 0.045;
          var pulse = 0.5 + 0.5 * Math.sin(state.time * 5.2 - p.z * 1.2);
          if (pulse > 0.78) topCol = mix(topCol, 0xffffff, Math.min(0.55, (pulse - 0.78) * 2.4));
        }
        put(bodies, nb++, p.x, topY - skirt * 0.62, p.z, (wide ? p.hw * 2 : p.hw * 2.04 * bulge), skirt, (wide ? p.hd * 2 : p.hd * 2.04 * bulge), bodyCol);
        put(tops, nt++, p.x, topY - 0.05, p.z, p.hw * (wide ? 1.96 : 1.7 * bulge), wide ? 0.08 : (dip ? 0.07 : 0.16), p.hd * (wide ? 1.96 : 1.7 * bulge), topCol);
        if (!wide && (p.ch || p.t === 'key' || p.t === 'sink' || p.t === 'ice' || p.t === 'jelly' || p.t === 'caps' || p.t === 'portal')) {
          var dx = p.x - focus.x, dz = p.z - focus.z;
          letterPick.push({ p: p, y: topY, d: dx * dx + dz * dz, ch: p.ch || '' });
        }
        if (p.flag && nflag < MAX - 8) {
          put(flags, nflag++, p.x - p.hw * 0.72, topY + 0.85, p.z, 0.1, 1.55, 0.1, 0xffe56a);
          put(flags, nflag++, p.x + p.hw * 0.72, topY + 0.85, p.z, 0.1, 1.55, 0.1, 0xffe56a);
          put(flags, nflag++, p.x, topY + 1.55, p.z, Math.min(2.4, p.hw * 1.45), 0.22, 0.1, 0xff4eb6);
          var tw = state.time * 3;
          put(flags, nflag++, p.x, topY + 2.05, p.z, 0.34, 0.34, 0.08, 0xfff6a8, tw);
          put(flags, nflag++, p.x - 0.62, topY + 1.82, p.z, 0.16, 0.16, 0.06, 0xff4eb6, tw * 1.3);
          put(flags, nflag++, p.x + 0.58, topY + 1.72, p.z, 0.14, 0.14, 0.06, 0xffffff, -tw);
        }
      }
      letterPick.sort(function (a, b) { return (a.ch ? -1000 : 0) + a.d - ((b.ch ? -1000 : 0) + b.d); });
      var letterCap = low ? 12 : 22;
      for (var li0 = 0; li0 < letterPick.length && nlet < letterCap; li0++) {
        var item = letterPick[li0];
        if (!item.ch && item.d > 260) continue;
        var letter = letterMesh[nlet++];
        letter.visible = true;
        letter.material = paintChar(item.ch || ALPHA.charAt(item.p.id % ALPHA.length));
        var g = glowOf(item.p.id);
        if (!reduced && g > 0.82 && !popped[item.p.id]) {
          popped[item.p.id] = 1;
          var slot = pops[0];
          for (var ps = 0; ps < pops.length; ps++) if (pops[ps].userData.life <= 0) { slot = pops[ps]; break; }
          slot.userData.life = 0.52;
          slot.userData.y0 = item.y + 0.2;
          slot.userData.born = performance.now();
          slot.material.map = letter.material.map;
          slot.material.needsUpdate = true;
          slot.material.opacity = 1;
          slot.position.set(item.p.x, slot.userData.y0, item.p.z);
          slot.rotation.z = ((item.p.id % 5) - 2) * 0.12;
          slot.visible = true;
        }
        var bump = reduced ? 1 : (1 + g * 0.55);
        var lift = reduced ? 0 : g * 0.22;
        letter.position.set(item.p.x, item.y + 0.07 + lift, item.p.z);
        var letterSize = Math.min(1.85, Math.max(item.p.hw, item.p.hd) * 1.85);
        letter.scale.set(letterSize * bump, letterSize * 0.92 * bump, 1);
      }
      for (var pk in popped) if (glowOf(pk) <= 0) delete popped[pk];
      for (var pf = 0; pf < pops.length; pf++) {
        var flo = pops[pf];
        if (flo.userData.life <= 0) { flo.visible = false; continue; }
        var age = (performance.now() - flo.userData.born) / 520;
        if (age >= 1) { flo.userData.life = 0; flo.visible = false; continue; }
        flo.position.y = flo.userData.y0 + age * 0.85;
        flo.material.opacity = 1 - age;
        flo.rotation.z += reduced ? 0 : 0.012;
        var pscl = 0.72 + age * 0.4;
        flo.scale.set(pscl, pscl, 1);
        flo.visible = true;
      }
      bodies.count = nb; tops.count = nt; rails.count = nr; balls.count = ns; sticks.count = nstick;
      gates.count = ng; fans.count = nf; flags.count = nflag;
      bodies.instanceMatrix.needsUpdate = tops.instanceMatrix.needsUpdate = true;
      rails.instanceMatrix.needsUpdate = balls.instanceMatrix.needsUpdate = true;
      sticks.instanceMatrix.needsUpdate = gates.instanceMatrix.needsUpdate = true;
      fans.instanceMatrix.needsUpdate = flags.instanceMatrix.needsUpdate = true;
      if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;
      if (tops.instanceColor) tops.instanceColor.needsUpdate = true;
      if (rails.instanceColor) rails.instanceColor.needsUpdate = true;
      if (balls.instanceColor) balls.instanceColor.needsUpdate = true;
      if (gates.instanceColor) gates.instanceColor.needsUpdate = true;
      if (flags.instanceColor) flags.instanceColor.needsUpdate = true;
      var anchorX = focus.x, anchorZ = focus.z;
      sky.position.set(anchorX, 2, anchorZ + 6);
      choco.position.z = sea.position.z = sheen.position.z = anchorZ + 18;
      choco.position.x = sea.position.x = sheen.position.x = anchorX;
      var cloudN = low ? 4 : 7;
      var puff = 0;
      var cloudTint = [0xffffff, 0xfff7fc, 0xf3f8ff, 0xfffaf2];
      for (var ci = 0; ci < cloudN; ci++) {
        var ang = ci * 0.95 + 0.35;
        var cx = anchorX + Math.sin(ang) * (14 + (ci % 3) * 4);
        var cy = 8.4 + (ci % 4) * 1.35;
        var cz = anchorZ + 8 + ci * 6.5;
        var faceYaw = Math.atan2(anchorX - cx, (anchorZ + 2) - cz);
        var tintC = cloudTint[ci % cloudTint.length];
        put(clouds, puff++, cx, cy, cz, 8.2, 4.6, 1, tintC, faceYaw);
        put(clouds, puff++, cx + 2.1, cy + 0.55, cz + 0.2, 5.2, 3.1, 1, 0xffffff, faceYaw);
        if (!low) put(clouds, puff++, cx - 2.4, cy - 0.2, cz, 4.2, 2.5, 1, 0xfff4fa, faceYaw);
      }
      clouds.count = puff;
      clouds.instanceMatrix.needsUpdate = true;
      if (clouds.instanceColor) clouds.instanceColor.needsUpdate = true;
      var spr = 0;
      var nd = 0;
      var candyN = low ? 4 : 6;
      for (var si = 0; si < candyN && nstick < MAX - 4 && ns < MAX - 4; si++) {
        var side = si % 2 ? 1 : -1;
        var sway = Math.sin(state.time * 1.4 + si) * 0.18;
        var sz = anchorZ + 4 + (si % 5) * 6.4;
        var sx = anchorX + side * (7.4 + (si % 3) * 1.6);
        var kind = si % 3;
        if (kind === 0) {
          put(sticks, nstick++, sx, 1.15, sz, 0.1, 2.2, 0.1, 0xfff1c9);
          put(balls, ns++, sx + sway, 2.45, sz, 0.5, 0.5, 0.5, CANDY[si % CANDY.length]);
        } else if (kind === 1) {
          put(balls, ns++, sx, 0.55 + sway * 0.3, sz, 0.42, 0.32, 0.42, CANDY[si % CANDY.length]);
          put(balls, ns++, sx, 1.05 + sway * 0.3, sz, 0.3, 0.24, 0.3, 0xfff6ea);
        } else if (nd < 12) put(donuts, nd++, sx, 1.15 + sway, sz, 0.62, 0.62, 0.62, CANDY[(si + 2) % CANDY.length], si * 0.4);
        else put(sprinkles, spr++, sx, 0.7, sz, 0.16, 0.06, 0.4, CANDY[si % CANDY.length], si);
      }
      var bearCap = low ? 1 : 2;
      var bearList = [];
      var archList = [];
      for (var mi = 0; mi < pieces.length && (bearList.length < 6 || archList.length < 4); mi++) {
        var mp = pieces[mi];
        if (!mp || !mp.moment) continue;
        var mdz = mp.z - focus.z;
        if (mdz < -4 || mdz > 22) continue;
        if (mp.moment === 'bear' && bearList.length < 6) bearList.push(mp);
        else if (mp.moment === 'arch' && archList.length < 4) archList.push(mp);
      }
      bearList.sort(function (a, b) { return Math.abs(a.z - focus.z) - Math.abs(b.z - focus.z); });
      archList.sort(function (a, b) { return Math.abs(a.z - focus.z) - Math.abs(b.z - focus.z); });
      for (var bi = 0; bi < bears.length; bi++) {
        var padB = bi < bearCap ? bearList[bi] : null;
        if (!padB) { bears[bi].visible = false; continue; }
        var side = padB.x >= focus.x ? 1 : -1;
        var near = Math.abs(padB.z - focus.z) < 2.2;
        var hop = reduced ? 0 : (near ? Math.abs(Math.sin(state.time * 12)) * 0.38 : Math.sin(state.time * 2 + bi) * 0.05);
        bears[bi].visible = true;
        bears[bi].position.set(padB.x + side * 2.15, padB.y + padB.hh + hop, padB.z);
        bears[bi].rotation.y = Math.atan2(focus.x - bears[bi].position.x, focus.z - bears[bi].position.z);
      }
      for (var ai = 0; ai < archList.length && ai < (low ? 1 : 2) && nd < 16 && nstick < MAX - 4; ai++) {
        var padA = archList[ai];
        var ay = padA.y + padA.hh + 2.05;
        put(donuts, nd++, padA.x, ay, padA.z, 1.55, 1.2, 1.55, 0xff4eb6);
        put(sticks, nstick++, padA.x - 1.45, padA.y + padA.hh + 0.85, padA.z, 0.16, 1.7, 0.16, 0xffe56a);
        put(sticks, nstick++, padA.x + 1.45, padA.y + padA.hh + 0.85, padA.z, 0.16, 1.7, 0.16, 0xffd24a);
      }
      castle.visible = !low || !!opts.victory;
      if (castle.visible) {
        if (opts.victory) {
          castle.position.set(anchorX + 0.6, 0, anchorZ + 9.5);
          castle.scale.setScalar(1.85);
        } else {
          castle.position.set(anchorX + 8, 0, anchorZ + 13);
          castle.scale.setScalar(1.55);
        }
        flagCloth.rotation.y = Math.PI + Math.sin(performance.now() / 1000 * 1.7) * 0.4;
      }
      donuts.count = nd;
      donuts.instanceMatrix.needsUpdate = true;
      if (donuts.instanceColor) donuts.instanceColor.needsUpdate = true;
      sprinkles.count = spr;
      balls.count = ns;
      sticks.count = nstick;
      sprinkles.instanceMatrix.needsUpdate = balls.instanceMatrix.needsUpdate = sticks.instanceMatrix.needsUpdate = true;
      if (sprinkles.instanceColor) sprinkles.instanceColor.needsUpdate = true;
      if (balls.instanceColor) balls.instanceColor.needsUpdate = true;
      if (sticks.instanceColor) sticks.instanceColor.needsUpdate = true;
      if (widePad) {
        var deck = widePad.y + widePad.hh + 0.025;
        tiles.visible = true;
        tiles.position.set(widePad.x, deck, widePad.z);
        tiles.scale.set(widePad.hw * 1.9, widePad.hd * 1.9, 1);
        var edge = [
          [0, -widePad.hd, widePad.hw * 2.02, 0.28],
          [0, widePad.hd, widePad.hw * 2.02, 0.28],
          [-widePad.hw, 0, 0.28, widePad.hd * 2.02],
          [widePad.hw, 0, 0.28, widePad.hd * 2.02]
        ];
        for (var ei = 0; ei < 4; ei++) {
          rims[ei].visible = true;
          rims[ei].position.set(widePad.x + edge[ei][0], deck + 0.07, widePad.z + edge[ei][1]);
          rims[ei].scale.set(edge[ei][2], 0.16, edge[ei][3]);
        }
      } else {
        tiles.visible = false;
        for (var ei2 = 0; ei2 < 4; ei2++) rims[ei2].visible = false;
      }
      for (var li = nlet; li < LETTERS; li++) letterMesh[li].visible = false;
      for (var gi = ngate; gi < gateMesh.length; gi++) gateMesh[gi].visible = false;

      if (state.flood && state.floodY > -1.4) {
        var fl = state.flood;
        flood.visible = true;
        var h = Math.max(0.2, state.floodY + 2);
        flood.scale.set(12, h, Math.max(1, fl.z1 - fl.z0));
        flood.position.set(0, -2 + h / 2, (fl.z0 + fl.z1) / 2);
      } else flood.visible = false;

      var limit = low || two ? SPARKS / 2 : SPARKS;
      var alive = 0;
      for (var s = 0; s < parts.length && alive < limit; s++) {
        var q = parts[s];
        q.life -= 1 / 60;
        if (q.life <= 0) continue;
        q.x += q.vx / 60; q.y += q.vy / 60; q.z += q.vz / 60; q.vy -= 12 / 60;
        put(sparks, alive++, q.x, q.y, q.z, q.size, q.size, q.size, q.color);
      }
      if (parts.length > 240) parts.splice(0, parts.length - 180);
      sparks.count = alive;
      sparks.instanceMatrix.needsUpdate = true;
      if (sparks.instanceColor) sparks.instanceColor.needsUpdate = true;

      var hatId = opts.hat || 0;
      for (var pi = 0; pi < buddies.length; pi++) {
        var buddyMesh = buddies[pi];
        var pl = state.players[pi];
        if (!pl) { buddyMesh.group.visible = buddyMesh.shadow.visible = buddyMesh.ring.visible = false; continue; }
        buddyMesh.group.visible = true;
        var wantHat = two && pi > 0 ? 0 : hatId;
        if (buddyMesh.group.userData.hatId !== wantHat) {
          hatMesh(wantHat, buddyMesh.group.userData.hat);
          buddyMesh.group.userData.hatId = wantHat;
        }
        var stretch = reduced ? 1 : (pl.onGround ? pl.squash : pl.stretch);
        var moving = Math.hypot(pl.vx, pl.vz) > 0.8;
        var bob = moving ? Math.abs(Math.sin(state.time * 14 + pi)) * 0.1 : Math.sin(state.time * 2 + pi) * 0.04;
        var idleHop = 0;
        if (!moving && pl.onGround && !reduced) {
          var cyc = (state.time + pi * 0.4) % 2.6;
          if (cyc > 2.2) idleHop = Math.sin((cyc - 2.2) / 0.4 * Math.PI) * 0.16;
        }
        buddyMesh.group.position.set(pl.x, pl.y + bob + idleHop, pl.z);
        buddyMesh.group.scale.set(1 / stretch, stretch, 1 / stretch);
        var waving = performance.now() < (waveUntil[pi] || 0);
        buddyMesh.group.rotation.y = pl.face + (waving ? Math.PI : 0);
        var step = moving ? Math.sin(state.time * 14 + pi) : Math.sin(state.time * 2 + pi) * 0.35;
        var ud = buddyMesh.group.userData;
        ud.footL.position.set(-0.18, 0.05, step * 0.22);
        ud.footR.position.set(0.18, 0.05, -step * 0.22);
        ud.armL.rotation.z = 0;
        ud.armR.rotation.z = 0;
        if (waving) {
          ud.armL.rotation.x = 0.4;
          ud.armR.rotation.x = -2.15;
          ud.armR.rotation.z = reduced ? 0.15 : Math.sin(performance.now() / 1000 * 14) * 0.4;
        } else {
          ud.armL.rotation.x = step * 0.95;
          ud.armR.rotation.x = -step * 0.95;
        }
        ud.pack.position.y = 0.56 + Math.abs(step) * 0.08;
        ud.scarf.rotation.z = Math.sin(state.time * (moving ? 14 : 3) + pi) * (reduced ? 0.08 : moving ? 0.5 : 0.22);
        ud.scarf.position.y = 0.84 + Math.abs(step) * 0.06;
        var sh = opts.engine.shadowPoint(pi);
        buddyMesh.shadow.visible = true;
        buddyMesh.shadow.position.set(sh.x, sh.y + 0.04, sh.z);
        var spread = pl.onGround ? 0.55 : 0.38;
        buddyMesh.shadow.scale.set(spread, spread, 1);
        if (!low && !reduced && moving && pl.speed > 1 && parts.length < SPARKS - 4) {
          var trail = opts.trail || 0;
          var bits = two ? 2 : Math.min(7, 1 + Math.floor(pl.speed / 6));
          if ((Math.floor(state.time * 24) + pi) % 2 === 0) {
            for (var k = 0; k < bits && parts.length < SPARKS; k++) {
              var back = 0.35 + k * 0.22;
              parts.push({
                x: pl.x - Math.sin(pl.face) * back,
                y: pl.y + 0.28 + (k % 2) * 0.08,
                z: pl.z - Math.cos(pl.face) * back,
                vx: -pl.vx * 0.12, vy: 0.35, vz: -pl.vz * 0.12,
                life: 0.22 + Math.min(0.25, pl.speed * 0.01),
                size: 0.07 + Math.min(0.18, pl.speed * 0.008),
                color: trail === 2 ? 0xffe56a : trail === 3 ? 0xfff6ea : TRAIL[(k + (pl.speed | 0)) % TRAIL.length]
              });
            }
          }
          var aura = opts.aura || 0;
          if (aura && Math.floor(state.time * 12) % 2 === 0) {
            var ang = state.time * 4 + pi;
            spark(pl.x + Math.cos(ang) * 0.45, pl.y + 0.7, pl.z + Math.sin(ang) * 0.45, aura === 2 ? 0xb388ff : 0xffd24a, 0.28);
          }
        }
        var land = pl.onGround ? null : opts.engine.predictLanding(pi);
        if (land && !pl.onGround) {
          buddyMesh.ring.visible = true;
          buddyMesh.ring.position.set(land.x, land.y + 0.05, land.z);
          var pulse = 0.7 + Math.sin(state.time * 8) * 0.08;
          buddyMesh.ring.scale.set(pulse, pulse, 1);
          buddyMesh.ring.material.color.setHex(land.miss ? 0xff5a7a : 0xfff1a8);
        } else buddyMesh.ring.visible = false;
      }

      var eyes = two ? [0, 1] : [0];
      var ringWas = [buddies[0].ring.visible, buddies[1].ring.visible];
      var buf = renderer.getDrawingBufferSize(new T.Vector2());
      renderer.setScissorTest(two);
      function nearFade(dist) {
        if (dist >= 11.5) return 1;
        if (dist <= 9.2) return 0.12;
        return 0.12 + 0.88 * ((dist - 9.2) / (11.5 - 9.2));
      }
      function applyFade(buddyMesh, opacity) {
        var ud = buddyMesh.group.userData;
        var soft = opacity < 0.98;
        ud.mat.opacity = opacity;
        ud.mat.depthWrite = !soft;
        ud.skin.opacity = opacity;
        ud.skin.depthWrite = !soft;
        ud.face.material.opacity = opacity < 0.75 ? 0 : 1;
        ud.face.visible = opacity >= 0.75;
        ud.pack.material.opacity = opacity;
        ud.pack.material.depthWrite = !soft;
        ud.scarf.material.opacity = opacity;
        ud.scarf.material.depthWrite = !soft;
        ud.strap.opacity = opacity;
        ud.strap.depthWrite = !soft;
        ud.earIn.opacity = opacity;
        ud.earIn.depthWrite = !soft;
        ud.earRim.opacity = opacity;
        ud.earRim.depthWrite = !soft;
        ud.earGold.opacity = opacity;
        ud.earGold.depthWrite = !soft;
        ud.buckle.opacity = opacity;
        ud.buckle.depthWrite = !soft;
        ud.shell.opacity = opacity;
        ud.shell.depthWrite = false;
        var kids = ud.hat.children;
        for (var h = 0; h < kids.length; h++) {
          var hm = kids[h].material;
          if (!hm) continue;
          hm.opacity = opacity;
          hm.depthWrite = !soft;
        }
        buddyMesh.shadow.material.opacity = soft ? 0.04 : 0.28;
      }
      for (var e = 0; e < eyes.length; e++) {
        var eye = eyes[e];
        var plEye = state.players[eye];
        var pose = opts.engine.cameraPose(eye);
        if (two) {
          var half = buf.x / 2;
          renderer.setViewport(eye ? half : 0, 0, half, buf.y);
          renderer.setScissor(eye ? half : 0, 0, half, buf.y);
        } else {
          renderer.setViewport(0, 0, buf.x, buf.y);
        }
        var boosting = !!opts.boost && !reduced && !low;
        var fast = boosting || (!reduced && !low && plEye && KR.topSpeed(plEye.speed) > 10);
        var kick = (!reduced && !low && opts.fovKick) ? opts.fovKick : 0;
        for (var li = 0; li < speedLines.length; li++) {
          speedLines[li].visible = !!fast;
          if (!fast || !plEye) continue;
          var ahead = 1.1 + li * 0.55;
          var side = (li - 1.5) * 0.32;
          speedLines[li].position.set(
            plEye.x + Math.sin(plEye.face) * ahead + Math.cos(plEye.face) * side,
            plEye.y + 0.65 + (li % 2) * 0.22,
            plEye.z + Math.cos(plEye.face) * ahead - Math.sin(plEye.face) * side
          );
          speedLines[li].scale.set(0.035, 0.035, 0.55);
          speedLines[li].rotation.y = plEye.face;
        }
        camera.aspect = two ? (buf.x * 0.5) / buf.y : buf.x / buf.y;
        var speedFov = (fast && plEye) ? Math.min(8, Math.max(0, (KR.topSpeed(plEye.speed) - 10) * 0.85)) : 0;
        if (boosting && speedFov < 6) speedFov = 6;
        camera.fov = Math.min(76, 60 + speedFov + (boosting ? 8 : 0) + kick);
        camera.updateProjectionMatrix();
        camera.position.set(pose.x, pose.y, pose.z);
        if (opts.victory && !two && plEye) {
          camera.position.set(
            plEye.x - Math.sin(plEye.face) * 6.4,
            plEye.y + 2.15,
            plEye.z - Math.cos(plEye.face) * 6.4
          );
        }
        if (!reduced && opts.shake > 0 && !opts.victory) {
          camera.position.x += Math.sin(state.time * 40) * opts.shake;
          camera.position.y += Math.cos(state.time * 33) * opts.shake * 0.6;
        }
        if (!reduced && state.flood && plEye && plEye.z > state.flood.z0 && state.floodY > plEye.y - 1) {
          camera.position.x += Math.sin(state.time * 18) * 0.08;
        }
        if (two && plEye) {
          var yaw = plEye.face + (plEye.cam || 0);
          var shift = eye === 0 ? -1.15 : 1.15;
          camera.position.x += Math.cos(yaw) * shift;
          camera.position.z -= Math.sin(yaw) * shift;
        }
        for (var b = 0; b < buddies.length; b++) {
          var mate = state.players[b];
          buddies[b].ring.visible = ringWas[b];
          var fade = 1;
          if (two && b !== eye && mate && buddies[b].group.visible) {
            var dx = mate.x - camera.position.x;
            var dy = (mate.y + 0.7) - camera.position.y;
            var dz = mate.z - camera.position.z;
            fade = nearFade(Math.hypot(dx, dy, dz));
          }
          applyFade(buddies[b], fade);
          if (fade < 0.45) buddies[b].ring.visible = false;
          var bill = buddies[b].group.userData.face;
          if (!bill || !buddies[b].group.visible) continue;
          if (b === eye && fade >= 0.75) {
            buddies[b].group.updateMatrixWorld();
            bill.lookAt(camera.position);
          } else bill.rotation.set(0, 0, 0);
        }
        camera.lookAt(pose.lx, pose.ly, pose.lz);
        renderer.render(scene, camera);
      }
      renderer.setScissorTest(false);
    }

    function burst(x, y, z, color, count) {
      count = Math.min(count || 10, 18);
      for (var i = 0; i < count && parts.length < SPARKS; i++) {
        parts.push({
          x: x, y: y, z: z,
          vx: (Math.random() - 0.5) * 6,
          vy: 2 + Math.random() * 5,
          vz: (Math.random() - 0.5) * 6,
          life: 0.35 + Math.random() * 0.35,
          size: 0.08 + Math.random() * 0.08,
          color: color || 0xfff1a8
        });
      }
    }
    function dust(x, y, z, count) {
      count = Math.min(count || 8, 14);
      for (var i = 0; i < count && parts.length < SPARKS; i++) {
        var ang = (i / count) * Math.PI * 2;
        parts.push({
          x: x, y: y, z: z,
          vx: Math.cos(ang) * (1.4 + Math.random() * 1.2),
          vy: 0.35 + Math.random() * 0.9,
          vz: Math.sin(ang) * (1.4 + Math.random() * 1.2),
          life: 0.22 + Math.random() * 0.16,
          size: 0.1 + Math.random() * 0.1,
          color: i % 3 === 0 ? 0xffb6d9 : 0xfff6ea
        });
      }
    }

    function cheer(index) { waveUntil[index] = performance.now() + 2000; }
    function playGhost(state) {
      var rows = {};
      var list = (state && state.pieces) || [];
      for (var i = 0; i < list.length; i++) {
        var p = list[i];
        if (!p || !p.stand || p.hw > 2.4 || p.t === 'tramp' || p.t === 'launch' || p.flag) continue;
        var key = Math.round(p.z * 2);
        var prev = rows[key];
        if (!prev || Math.abs(p.x) < Math.abs(prev.x)) rows[key] = p;
      }
      var pads = [];
      for (var k in rows) pads.push(rows[k]);
      pads.sort(function (a, b) { return a.z - b.z; });
      if (pads.length < 3) { ghost.visible = false; ghostRun = null; return; }
      ghostRun = { pads: pads.slice(0, 3), t0: performance.now() };
      ghost.visible = true;
    }
    function tickGhost(reduced, hide) {
      if (hide || !ghostRun) { ghost.visible = false; return; }
      var pads = ghostRun.pads;
      var hop = 0.85;
      var elapsed = (performance.now() - ghostRun.t0) / 1000;
      var total = hop * pads.length;
      if (elapsed > total + 0.45) { ghost.visible = false; ghostRun = null; return; }
      var idx = Math.min(pads.length - 1, Math.floor(Math.max(0, elapsed) / hop));
      var u = elapsed / hop - idx;
      if (u < 0) u = 0;
      if (u > 1) u = 1;
      var to = pads[idx];
      var from = idx === 0
        ? { x: pads[0].x, y: pads[0].y, z: pads[0].z - 1.55, hh: pads[0].hh }
        : pads[idx - 1];
      var arc = Math.sin(u * Math.PI) * 1.15;
      var gx = from.x + (to.x - from.x) * u + 0.42;
      var gz = from.z + (to.z - from.z) * u;
      var gy = from.y + from.hh + (to.y + to.hh - from.y - from.hh) * u + arc;
      if (elapsed > total) gy = to.y + to.hh;
      var fade = elapsed > total ? Math.max(0, 1 - (elapsed - total) / 0.45) : 1;
      ghost.position.set(gx, gy, gz);
      ghost.visible = fade > 0.02;
      ghostMat.opacity = 0.42 * fade;
      ghostEarMat.opacity = 0.72 * fade;
      if (reduced) ghost.scale.set(1, 1, 1);
      else {
        var stretch = 1 + Math.sin(u * Math.PI) * 0.16;
        ghost.scale.set(1 / stretch, stretch, 1 / stretch);
      }
    }
    var renderInner = render;
    render = function (state, opts) {
      opts = opts || {};
      tickGhost(!!opts.reduced, !!opts.victory);
      renderInner(state, opts);
    };
    return {
      render: render,
      burst: burst,
      dust: dust,
      pressKey: pressKey,
      cheer: cheer,
      playGhost: playGhost,
      rebuildText: function () { letterMat = {}; gateLabel = {}; },
      setPixelRatio: function (dpr) { renderer.setPixelRatio(dpr); renderer.setSize(1280, 720, false); },
      dispose: function () {
        disposed = true;
        renderer.dispose();
      }
    };
  };
})(window.KeyRunner = window.KeyRunner || {});
