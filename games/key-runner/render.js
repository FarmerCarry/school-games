/* Candy tower view. Instanced keycaps, one chocolate surface, no shadow maps. */
(function (KR) {
  'use strict';
  var T = window.THREE;
  var MAX = 560;
  var SPARKS = 160;

  function mat(hex, opts) {
    opts = opts || {};
    var Kind = opts.basic ? T.MeshBasicMaterial : T.MeshLambertMaterial;
    return new Kind({
      color: hex,
      map: opts.map || null,
      transparent: !!opts.transparent,
      opacity: opts.opacity == null ? 1 : opts.opacity,
      side: opts.side || T.FrontSide,
      depthWrite: opts.depthWrite !== false,
      alphaTest: opts.alphaTest || 0
    });
  }

  function keyGeometry() {
    var s = new T.Shape();
    var w = 1.52, h = 1.52, r = 0.34;
    s.moveTo(-w / 2 + r, -h / 2);
    s.lineTo(w / 2 - r, -h / 2);
    s.absarc(w / 2 - r, -h / 2 + r, r, -Math.PI / 2, 0, false);
    s.lineTo(w / 2, h / 2 - r);
    s.absarc(w / 2 - r, h / 2 - r, r, 0, Math.PI / 2, false);
    s.lineTo(-w / 2 + r, h / 2);
    s.absarc(-w / 2 + r, h / 2 - r, r, Math.PI / 2, Math.PI, false);
    s.lineTo(-w / 2, -h / 2 + r);
    s.absarc(-w / 2 + r, -h / 2 + r, r, Math.PI, Math.PI * 1.5, false);
    var g = new T.ExtrudeGeometry(s, {
      depth: 0.26, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08,
      bevelSegments: 2, curveSegments: 3, steps: 1
    });
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0.16, 0);
    return g;
  }

  function canvasTex(w, h, draw) {
    var c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d'), w, h);
    var tex = new T.CanvasTexture(c);
    if (T.SRGBColorSpace) tex.colorSpace = T.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }

  function letterTex(ch) {
    return canvasTex(128, 128, function (g) {
      g.clearRect(0, 0, 128, 128);
      g.fillStyle = '#4a1d38';
      g.font = '700 78px Fredoka, Tahoma, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(ch, 64, 70);
    });
  }

  function skyTex() {
    return canvasTex(512, 256, function (g, w, h) {
      var grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#8ecfff');
      grad.addColorStop(0.3, '#d7f1ff');
      grad.addColorStop(0.52, '#ffd6f2');
      grad.addColorStop(1, '#ffb3d0');
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
    });
  }

  function chocoTex() {
    return canvasTex(256, 256, function (g) {
      g.fillStyle = '#6b3418';
      g.fillRect(0, 0, 256, 256);
      var i;
      for (i = 0; i < 16; i++) {
        g.fillStyle = i % 2 ? '#8a4b22' : '#4e2410';
        g.beginPath();
        g.ellipse(20 + (i * 47) % 230, 24 + (i * 61) % 210, 46, 16, i * 0.4, 0, Math.PI * 2);
        g.fill();
      }
      g.strokeStyle = 'rgba(255, 214, 160, 0.45)';
      g.lineWidth = 3;
      for (i = 0; i < 7; i++) {
        g.beginPath();
        g.moveTo(0, 30 + i * 34);
        g.bezierCurveTo(80, 10 + i * 34, 140, 60 + i * 34, 256, 24 + i * 34);
        g.stroke();
      }
    });
  }

  function dotTex() {
    return canvasTex(32, 32, function (g) {
      var grad = g.createRadialGradient(16, 16, 2, 16, 16, 15);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 32, 32);
    });
  }

  function runner(color) {
    var group = new T.Group();
    var mats = [];
    function add(mesh) { mats.push(mesh.material); group.add(mesh); return mesh; }
    var body = add(new T.Mesh(new T.CapsuleGeometry(0.26, 0.34, 4, 8), mat(color, { transparent: true })));
    body.position.y = 0.62;
    var head = add(new T.Mesh(new T.SphereGeometry(0.24, 12, 10), mat(0xfff1d6, { transparent: true })));
    head.position.y = 1.08;
    var earL = add(new T.Mesh(new T.SphereGeometry(0.07, 8, 6), mat(0xffb7c8, { transparent: true })));
    earL.position.set(-0.12, 1.28, 0);
    var earR = earL.clone();
    earR.material = mat(0xffb7c8, { transparent: true });
    mats.push(earR.material);
    earR.position.x = 0.12;
    group.add(earR);
    var pack = add(new T.Mesh(new T.SphereGeometry(0.13, 10, 8), mat(0xff4eb6, { transparent: true })));
    pack.position.set(0, 0.78, -0.22);
    var eyeGeo = new T.SphereGeometry(0.045, 8, 6);
    var eyeMat = mat(0x2a1a33, { transparent: true });
    var eyeL = add(new T.Mesh(eyeGeo, eyeMat));
    eyeL.position.set(-0.08, 1.1, 0.2);
    var eyeR = new T.Mesh(eyeGeo, eyeMat);
    eyeR.position.set(0.08, 1.1, 0.2);
    group.add(eyeR);
    var smile = add(new T.Mesh(new T.TorusGeometry(0.07, 0.018, 6, 10, Math.PI), mat(0xe07090, { transparent: true })));
    smile.position.set(0, 1.0, 0.2);
    smile.rotation.z = Math.PI;
    var armGeo = new T.CapsuleGeometry(0.06, 0.16, 3, 6);
    var armMat = mat(color, { transparent: true });
    var armL = new T.Mesh(armGeo, armMat);
    armL.position.set(-0.3, 0.7, 0.02);
    group.add(armL);
    var armR = new T.Mesh(armGeo, armMat);
    armR.position.set(0.3, 0.7, 0.02);
    group.add(armR);
    mats.push(armMat);
    group.userData = { mats: mats, armL: armL, armR: armR };
    return group;
  }

  function setOpacity(meshes, opacity) {
    var soft = opacity < 0.95;
    for (var i = 0; i < meshes.length; i++) {
      meshes[i].opacity = opacity;
      meshes[i].depthWrite = !soft;
    }
  }

  KR.createView = function (canvas) {
    var renderer = new T.WebGLRenderer({ canvas: canvas, antialias: false, alpha: false, powerPreference: 'low-power' });
    renderer.setPixelRatio(1);
    renderer.setSize(1280, 800, false);
    if (T.SRGBColorSpace) renderer.outputColorSpace = T.SRGBColorSpace;
    var scene = new T.Scene();
    scene.background = new T.Color(0xffd0ee);
    scene.fog = new T.Fog(0xffc4ea, 36, 120);
    scene.add(new T.AmbientLight(0xfff6ea, 0.55));
    scene.add(new T.HemisphereLight(0xfff4d2, 0x8a4a28, 0.7));
    var sun = new T.DirectionalLight(0xffffff, 0.75);
    sun.position.set(-6, 14, 8);
    scene.add(sun);

    var skyMat = mat(0xffffff, { map: skyTex(), side: T.BackSide, basic: true });
    skyMat.fog = false;
    var sky = new T.Mesh(new T.SphereGeometry(380, 16, 12), skyMat);
    scene.add(sky);
    var chocoMap = chocoTex();
    chocoMap.wrapS = chocoMap.wrapT = T.RepeatWrapping;
    chocoMap.repeat.set(8, 14);
    var choco = new T.Mesh(new T.PlaneGeometry(420, 1100), mat(0xffffff, { map: chocoMap, basic: true }));
    choco.rotation.x = -Math.PI / 2;
    scene.add(choco);

    var catalog = [];
    KR.worlds()[0].stages.forEach(function (st) {
      st.pieces.forEach(function (p) { if (p.stand) catalog.push(p); });
    });
    var keyCount = Math.min(MAX, catalog.length);
    var keys = new T.InstancedMesh(keyGeometry(), mat(0xffffff), keyCount);
    keys.instanceColor = new T.InstancedBufferAttribute(new Float32Array(keyCount * 3), 3);
    keys.count = keyCount;
    scene.add(keys);
    var columns = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), mat(0xffffff), keyCount);
    columns.instanceColor = new T.InstancedBufferAttribute(new Float32Array(keyCount * 3), 3);
    columns.count = keyCount;
    scene.add(columns);
    var tint = new T.Color();
    function paint(attr, i, hex) {
      tint.setHex(hex);
      attr.setXYZ(i, tint.r, tint.g, tint.b);
    }
    function keyHex(p, i) {
      if (p.flag) return 0xfff6ea;
      if (p.haste) return 0xffe14a;
      if (p.t === 'tramp') return 0x7dffa0;
      if (p.t === 'sink') return 0xc9a6ff;
      if (p.t === 'move') return 0x5ee0ff;
      if (p.cvz || p.cvx) return 0xff9a3c;
      return KR.PAL[(p.stage || 0) % KR.PAL.length][i % 5];
    }

    var byChar = {};
    var plane = new T.PlaneGeometry(0.7, 0.7);
    catalog.forEach(function (p, i) {
      if (!p.ch || i >= keyCount) return;
      if (!byChar[p.ch]) {
        var mesh = new T.InstancedMesh(plane, mat(0xffffff, { map: letterTex(p.ch), transparent: true, alphaTest: 0.25, depthWrite: false }), MAX);
        mesh.count = 0;
        scene.add(mesh);
        byChar[p.ch] = { mesh: mesh, ids: [] };
      }
      byChar[p.ch].ids.push(i);
    });

    var arrows = new T.InstancedMesh(new T.ConeGeometry(0.16, 0.42, 8), mat(0xfff6ea), 80);
    arrows.count = 0;
    scene.add(arrows);
    var arrowIds = [];
    catalog.forEach(function (p, i) {
      if ((p.cvz || p.cvx) && arrowIds.length < 80) arrowIds.push(i);
    });
    arrows.count = arrowIds.length;

    var flags = [];
    catalog.forEach(function (p) {
      if (!p.flag) return;
      var pole = new T.Mesh(new T.CylinderGeometry(0.04, 0.04, 1.3, 6), mat(0xfff6ea));
      var cloth = new T.Mesh(new T.PlaneGeometry(0.7, 0.42), mat(0xff4eb6, { side: T.DoubleSide }));
      cloth.position.set(0.35, 0.4, 0);
      pole.add(cloth);
      pole.userData.cloth = cloth;
      pole.userData.home = p;
      scene.add(pole);
      flags.push(pole);
    });

    function scatter(geo, color, every, depth, yLift, scale) {
      var n = 0;
      var i;
      for (i = 0; i < catalog.length; i += every) n += 2;
      n = Math.max(1, n);
      var mesh = new T.InstancedMesh(geo, mat(color), n);
      var dummy = new T.Object3D();
      var k = 0;
      for (i = 0; i < catalog.length && k + 1 < n; i += every) {
        var p = catalog[i];
        var side;
        for (side = -1; side <= 1; side += 2) {
          dummy.position.set(p.x + side * depth, p.y + p.hh + yLift, p.z);
          dummy.scale.set(scale, scale, scale);
          dummy.rotation.set(0, (i + side) * 0.4, 0);
          dummy.updateMatrix();
          mesh.setMatrixAt(k++, dummy.matrix);
        }
      }
      mesh.count = k;
      mesh.instanceMatrix.needsUpdate = true;
      scene.add(mesh);
      return mesh;
    }
    var gumGeo = new T.SphereGeometry(0.55, 10, 8);
    var nearCandy = scatter(gumGeo, 0xff4b8d, 3, 4.2, -0.2, 1);
    var midCandy = scatter(new T.SphereGeometry(0.7, 10, 8), 0xffe14a, 5, 11, 0.4, 1.3);
    var farIsland = scatter(new T.TorusGeometry(1.1, 0.38, 8, 14), 0xff8ad4, 7, 20, 0.2, 1.4);
    var sticks = scatter(new T.CylinderGeometry(0.08, 0.08, 1.6, 6), 0xfff6ea, 5, 11, 1.5, 1);
    var sprinkles = scatter(new T.CapsuleGeometry(0.08, 0.28, 2, 5), 0x7dffa0, 2, 2.6, 0.35, 1);
    var bubbles = new T.InstancedMesh(new T.SphereGeometry(0.28, 8, 6), mat(0xffe1c4, { transparent: true, opacity: 0.85 }), 36);
    bubbles.count = 36;
    scene.add(bubbles);

    var hero = runner(0x3ec6ff);
    var guest = runner(0xff7ac4);
    guest.visible = false;
    scene.add(hero);
    scene.add(guest);
    var buddies = [hero, guest];
    var ghost = runner(0xfff6ea);
    ghost.visible = false;
    setOpacity(ghost.userData.mats, 0.4);
    scene.add(ghost);

    var hintW = new T.Mesh(keyGeometry(), mat(0xffe14a));
    var hintLabel = new T.Mesh(plane, mat(0xffffff, {
      map: canvasTex(128, 128, function (g) {
        g.fillStyle = '#4a1d38';
        g.font = '700 72px Fredoka, Tahoma, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('W', 64, 74);
      }),
      transparent: true, alphaTest: 0.2, depthWrite: false
    }));
    hintLabel.position.y = 0.55;
    hintW.add(hintLabel);
    var hintSp = new T.Mesh(keyGeometry(), mat(0xffe14a));
    scene.add(hintW);
    scene.add(hintSp);
    var hintAnchor = { w: null, space: null };
    catalog.forEach(function (p) {
      if (p.hint === 'w') hintAnchor.w = p;
      if (p.hint === 'space') hintAnchor.space = p;
    });

    var feet = new T.InstancedMesh(new T.CircleGeometry(0.16, 8), mat(0xfff6ea, { transparent: true, opacity: 0.8, depthWrite: false }), 40);
    var footList = [];
    catalog.forEach(function (p) { if (p.foot && footList.length < 40) footList.push(p); });
    feet.count = footList.length;
    scene.add(feet);

    var sparkPos = new Float32Array(SPARKS * 3);
    var sparkCol = new Float32Array(SPARKS * 3);
    var sparkGeo = new T.BufferGeometry();
    sparkGeo.setAttribute('position', new T.BufferAttribute(sparkPos, 3));
    sparkGeo.setAttribute('color', new T.BufferAttribute(sparkCol, 3));
    var sparkMat = new T.PointsMaterial({ size: 0.45, map: dotTex(), vertexColors: true, transparent: true, depthWrite: false, opacity: 0.95 });
    var sparkPoints = new T.Points(sparkGeo, sparkMat);
    scene.add(sparkPoints);
    var spark = [];
    var si;
    for (si = 0; si < SPARKS; si++) spark.push({ life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, r: 1, g: 1, b: 1 });

    var camera = new T.PerspectiveCamera(58, 1280 / 800, 0.1, 500);
    var dummy = new T.Object3D();
    var color = new T.Color();
    var clock = 0;
    var presses = {};
    var ghostFrom = 0;
    var disposed = false;
    var calls = 0;

    function emit(x, y, z, hex, n, spread) {
      color.setHex(hex);
      var i, s;
      for (i = 0; i < n; i++) {
        s = spark[si++ % SPARKS];
        s.life = 0.45 + Math.random() * 0.35;
        s.x = x; s.y = y; s.z = z;
        s.vx = (Math.random() - 0.5) * spread;
        s.vy = 0.8 + Math.random() * spread;
        s.vz = (Math.random() - 0.5) * spread;
        s.r = color.r; s.g = color.g; s.b = color.b;
      }
    }

    function placePiece(index, p, press) {
      var drop = (press || 0) * 0.08;
      dummy.position.set(p.x, (p.y + p.hh) - 0.16 - drop, p.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set((p.hw * 2) / 1.52, Math.max(0.55, 1 - (press || 0) * 0.35), (p.hd * 2) / 1.52);
      if (p.gone) dummy.scale.y = 0.04;
      dummy.updateMatrix();
      keys.setMatrixAt(index, dummy.matrix);
      paint(keys.instanceColor, index, keyHex(p, index));
      var leg = Math.max(1.2, (p.y + p.hh) - (-2.2));
      dummy.position.set(p.x, (p.y + p.hh) - leg * 0.5 - 0.2, p.z);
      dummy.scale.set(0.46, leg, 0.46);
      dummy.updateMatrix();
      columns.setMatrixAt(index, dummy.matrix);
      paint(columns.instanceColor, index, index % 2 ? 0xf3d2a2 : 0xd4864e);
    }

    function syncWorld(state, low) {
      var live = {};
      var i, p, src;
      for (i = 0; i < state.pieces.length; i++) live[state.pieces[i].id] = state.pieces[i];
      for (i = 0; i < keyCount; i++) {
        p = catalog[i];
        src = live[p.id] || p;
        var id = p.id;
        if (presses[id] > 0) presses[id] = Math.max(0, presses[id] - 0.08);
        placePiece(i, src, presses[id] || 0);
      }
      keys.instanceMatrix.needsUpdate = true;
      keys.instanceColor.needsUpdate = true;
      columns.instanceMatrix.needsUpdate = true;
      columns.instanceColor.needsUpdate = true;
      Object.keys(byChar).forEach(function (ch) {
        var bag = byChar[ch];
        var n = 0;
        for (var k = 0; k < bag.ids.length; k++) {
          var idx = bag.ids[k];
          src = live[catalog[idx].id] || catalog[idx];
          if (low && Math.abs(src.z - state.players[0].z) > 40) continue;
          dummy.position.set(src.x, src.y + src.hh + 0.46 - (presses[src.id] || 0) * 0.08, src.z);
          dummy.rotation.set(-0.4, 0, 0);
          dummy.scale.set(Math.min(1.1, src.hw), Math.min(1.1, src.hw), 1);
          dummy.updateMatrix();
          bag.mesh.setMatrixAt(n++, dummy.matrix);
        }
        bag.mesh.count = n;
        bag.mesh.instanceMatrix.needsUpdate = true;
      });
      for (i = 0; i < arrowIds.length; i++) {
        src = live[catalog[arrowIds[i]].id] || catalog[arrowIds[i]];
        dummy.position.set(src.x, src.y + src.hh + 0.55, src.z);
        dummy.scale.set(1, 1, 1);
        if (src.cvx) dummy.rotation.set(0, 0, src.cvx > 0 ? -Math.PI / 2 : Math.PI / 2);
        else dummy.rotation.set(Math.PI / 2, 0, 0);
        dummy.updateMatrix();
        arrows.setMatrixAt(i, dummy.matrix);
      }
      arrows.instanceMatrix.needsUpdate = true;
      for (i = 0; i < flags.length; i++) {
        var flag = flags[i];
        src = live[flag.userData.home.id] || flag.userData.home;
        flag.position.set(src.x + src.hw * 0.72, src.y + src.hh + 0.7, src.z);
        flag.userData.cloth.rotation.y = Math.sin(clock * 3 + i) * 0.4;
      }
      for (i = 0; i < footList.length; i++) {
        src = footList[i];
        dummy.position.set(src.x, src.y + src.hh + 0.08, src.z - 0.35 + (i % 3) * 0.22);
        dummy.rotation.set(-Math.PI / 2, 0, 0);
        dummy.scale.set(1, 1, 0.7);
        dummy.updateMatrix();
        feet.setMatrixAt(i, dummy.matrix);
      }
      feet.instanceMatrix.needsUpdate = true;
      if (hintAnchor.w) {
        hintW.position.set(hintAnchor.w.x, hintAnchor.w.y + 1.7 + Math.sin(clock * 3) * 0.08, hintAnchor.w.z);
        hintW.scale.set(0.7, 0.7, 0.7);
      }
      if (hintAnchor.space) {
        hintSp.position.set(hintAnchor.space.x, hintAnchor.space.y + 1.55 + Math.sin(clock * 3 + 1) * 0.08, hintAnchor.space.z);
        hintSp.scale.set(1.5, 0.55, 0.7);
      }
      var py = state.players[0] ? state.players[0].y : 0;
      nearCandy.visible = true;
      midCandy.visible = !low;
      sticks.visible = !low;
      farIsland.visible = !low;
      sprinkles.visible = !low;
      choco.position.y = state.floodY || -2.2;
      chocoMap.offset.x = clock * 0.02;
      for (i = 0; i < bubbles.count; i++) {
        var bob = Math.sin(clock * 2 + i) * 0.25;
        dummy.position.set(Math.sin(i * 1.7) * (6 + (i % 5)), (state.floodY || -2.2) + 0.2 + bob, py - 8 + (i % 9) * 3.2);
        dummy.scale.setScalar(low ? 0.01 : 0.6 + (i % 4) * 0.25);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        bubbles.setMatrixAt(i, dummy.matrix);
      }
      bubbles.instanceMatrix.needsUpdate = true;
      bubbles.visible = !low;
    }

    function pose(group, pl, fade, reduced) {
      group.position.set(pl.x, pl.y, pl.z);
      group.rotation.y = pl.face;
      var squash = pl.squash || 1;
      var stretch = pl.stretch || 1;
      if (reduced) squash = stretch = 1;
      group.scale.set(1 / stretch, stretch * (2 - squash), 1 / stretch);
      var swing = reduced ? 0 : Math.sin(clock * 9) * (pl.onGround ? 0.7 : 0.2);
      group.userData.armL.rotation.x = swing;
      group.userData.armR.rotation.x = -swing;
      setOpacity(group.userData.mats, fade);
    }

    function occludes(state, pl) {
      var ahead = 0;
      for (var i = 0; i < state.pieces.length; i++) {
        var p = state.pieces[i];
        if (!p.stand || p.gone) continue;
        if (p.z > pl.z + 0.6 && p.z < pl.z + 8 && Math.abs(p.x - pl.x) < 2.2) ahead++;
        if (ahead >= 3) return true;
      }
      return false;
    }

    function tickGhost(state) {
      if (!ghostFrom) { ghost.visible = false; return; }
      var feetKeys = footList;
      if (!feetKeys.length) { ghost.visible = false; return; }
      var elapsed = (performance.now() - ghostFrom) / 1000;
      var total = 3.2;
      if (elapsed > total + 0.4) { ghost.visible = false; ghostFrom = 0; return; }
      var u = Math.min(1, elapsed / total);
      var idx = Math.min(feetKeys.length - 1, Math.floor(u * feetKeys.length));
      var a = feetKeys[idx];
      var b = feetKeys[Math.min(feetKeys.length - 1, idx + 1)];
      var f = (u * feetKeys.length) % 1;
      ghost.visible = true;
      ghost.position.set(a.x + (b.x - a.x) * f, a.y + a.hh + Math.sin(f * Math.PI) * 0.8, a.z + (b.z - a.z) * f);
    }

    function render(state, opts) {
      if (disposed) return;
      opts = opts || {};
      clock += opts.reduced ? 0 : 0.016;
      var low = opts.quality === 'low';
      syncWorld(state, low);
      var i;
      for (i = 0; i < SPARKS; i++) {
        var s = spark[i];
        if (s.life <= 0) {
          sparkPos[i * 3 + 1] = -999;
          continue;
        }
        s.life -= 0.016;
        s.vy -= 1.2 * 0.016;
        s.x += s.vx * 0.016; s.y += s.vy * 0.016; s.z += s.vz * 0.016;
        sparkPos[i * 3] = s.x; sparkPos[i * 3 + 1] = s.y; sparkPos[i * 3 + 2] = s.z;
        sparkCol[i * 3] = s.r; sparkCol[i * 3 + 1] = s.g; sparkCol[i * 3 + 2] = s.b;
      }
      sparkGeo.attributes.position.needsUpdate = true;
      sparkGeo.attributes.color.needsUpdate = true;
      tickGhost(state);
      var two = state.players.length > 1;
      guest.visible = two;
      var buf = renderer.getDrawingBufferSize(new T.Vector2());
      renderer.setScissorTest(two);
      for (var eye = 0; eye < state.players.length; eye++) {
        var pl = state.players[eye];
        var fade = occludes(state, pl) ? 0.4 : 1;
        pose(buddies[eye] || hero, pl, eye === 0 ? fade : 1, !!opts.reduced);
        if (two) {
          var half = buf.x / 2;
          renderer.setViewport(eye ? half : 0, 0, half, buf.y);
          renderer.setScissor(eye ? half : 0, 0, half, buf.y);
          camera.aspect = half / buf.y;
        } else {
          renderer.setViewport(0, 0, buf.x, buf.y);
          camera.aspect = buf.x / buf.y;
        }
        var poseCam = opts.engine.cameraPose(eye);
        var shake = opts.shake || 0;
        camera.position.set(poseCam.x + shake, poseCam.y, poseCam.z);
        camera.lookAt(poseCam.lx, poseCam.ly, poseCam.lz);
        camera.fov = 58 + (opts.fovKick || 0);
        camera.updateProjectionMatrix();
        if (eye === 0) sky.position.copy(camera.position);
        renderer.render(scene, camera);
      }
      calls = renderer.info.render.calls;
      if (!two) renderer.setScissorTest(false);
    }

    return {
      render: render,
      burst: function (x, y, z, hex, n) { emit(x, y, z, hex || 0xffe14a, n || 8, 3.2); },
      dust: function (x, y, z, n) { emit(x, y, z, 0xfff6ea, n || 10, 2.4); },
      pressKey: function (id) { presses[id] = 1; },
      cheer: function () { emit(0, 2, 0, 0xff4eb6, 12, 4); },
      playGhost: function () { ghostFrom = performance.now(); },
      rebuildText: function () {
        Object.keys(byChar).forEach(function (ch) {
          var tex = letterTex(ch);
          byChar[ch].mesh.material.map = tex;
          byChar[ch].mesh.material.needsUpdate = true;
        });
      },
      setPixelRatio: function (dpr) {
        renderer.setPixelRatio(dpr);
        renderer.setSize(1280, 800, false);
      },
      drawCalls: function () { return calls; },
      dispose: function () { disposed = true; renderer.dispose(); }
    };
  };
})(window.KeyRunner = window.KeyRunner || {});
