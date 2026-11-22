/* Shortcut Factory: the moving actors. The robot arm (two-bone IK, skins, eyes that follow
 * the chosen toy), the cardboard delivery boxes with flaps and tape, the picture order
 * signs, the clipboard bubble and Nattout the cheeky gremlin. */
(function () {
  'use strict';
  var SF = window.SF, H = SF.art;

  /* ------------------------------------------------------------ the arm */
  SF.buildArm = function (T, scene) {
    var G = H.G, P = H.P, L = SF.LAY;
    var matA = new T.MeshLambertMaterial({ color: 0xff8a1f }), matB = new T.MeshLambertMaterial({ color: 0xffd23f }), matC = new T.MeshLambertMaterial({ color: 0x3b4a6b });
    var L1 = 2.6, L2 = 2.4, base = new T.Vector3(SF.BELT.arm, 1.6, L.ARM_Z);
    function seg(len, r) { var g = new T.CapsuleGeometry(r, len - r * 2, 6, 14); g.translate(0, len / 2, 0); return g; }
    function add(g, m) { var o = new T.Mesh(g, m); scene.add(o); return o; }
    var column = add(new T.CylinderGeometry(0.42, 0.56, 1.3, 18), matA); column.position.set(base.x, 0.95, base.z);
    var upper = add(seg(L1, 0.25), matA), fore = add(seg(L2, 0.22), matA);
    var jg = new T.SphereGeometry(0.36, 16, 12), j0 = add(jg, matB), j1 = add(jg, matB), j2 = add(new T.SphereGeometry(0.28, 16, 12), matB);
    j0.position.copy(base);
    var head = new T.Group(); scene.add(head);
    var shell = new T.Mesh(H.merge([P(G.cap, null, [0, -0.5, 0], [0, 0, Math.PI / 2], [0.44, 0.5, 0.44]), P(G.box, null, [0, -0.5, -0.05], null, [0.95, 0.7, 0.7])]), matA);
    var face = new T.Mesh(H.merge([P(G.box, 0x1d2340, [0, -0.5, 0.33], null, [0.86, 0.56, 0.06]),
      P(G.sph, 0xffffff, [-0.2, -0.47, 0.37], null, [0.15, 0.17, 0.05]), P(G.sph, 0xffffff, [0.2, -0.47, 0.37], null, [0.15, 0.17, 0.05]),
      P(G.box, 0xff8fb0, [0, -0.7, 0.37], null, [0.18, 0.04, 0.02])]), new T.MeshBasicMaterial({ vertexColors: true }));
    var pupils = new T.Mesh(H.merge([P(G.sph, 0x1d2340, [-0.2, -0.47, 0.41], null, [0.07, 0.08, 0.03]), P(G.sph, 0x1d2340, [0.2, -0.47, 0.41], null, [0.07, 0.08, 0.03]),
      P(G.sph, 0xffffff, [-0.17, -0.43, 0.43], null, [0.025, 0.025, 0.01]), P(G.sph, 0xffffff, [0.23, -0.43, 0.43], null, [0.025, 0.025, 0.01])]), new T.MeshBasicMaterial({ vertexColors: true }));
    var antenna = new T.Mesh(H.merge([P(G.cyl, 0x3b4a6b, [0.3, 0.05, 0], null, [0.03, 0.3, 0.03]), P(G.sph, 0xff4b5c, [0.3, 0.22, 0], null, [0.07, 0.07, 0.07])]), new T.MeshLambertMaterial({ vertexColors: true }));
    var clawL = new T.Group(), clawR = new T.Group();
    var finger = H.merge([P(G.cap, null, [0, -0.25, 0], null, [0.07, 0.3, 0.07]), P(G.cap, null, [0.06, -0.48, 0], [0, 0, 0.7], [0.06, 0.12, 0.06])]);
    var fl = new T.Mesh(finger, matC), fr = new T.Mesh(finger, matC);
    fr.scale.x = -1;
    clawL.add(fl); clawR.add(fr);
    clawL.position.set(-0.22, -0.9, 0); clawR.position.set(0.22, -0.9, 0);
    head.add(shell, face, pupils, antenna, clawL, clawR);
    var E1 = new T.Vector3(), W = new T.Vector3(), D = new T.Vector3(), UP = new T.Vector3(0, 1, 0);
    var arm = { target: new T.Vector3(SF.BELT.arm, 3.8, 0.1), pos: new T.Vector3(SF.BELT.arm, 3.8, 0.1), grip: 0, look: 0, blink: 0, tilt: 0, bob: 0 };
    arm.head = head;
    arm.skin = function (s) { matA.color.set(s.a); matB.color.set(s.b); matC.color.set(s.c); };
    // Two-bone IK in the vertical plane through the base and the target, elbow up.
    arm.solve = function () {
      var t = arm.pos, dx = t.x - base.x, dz = t.z - base.z, d = Math.max(0.001, Math.sqrt(dx * dx + dz * dz)), h = t.y - base.y;
      var r = Math.min(L1 + L2 - 0.05, Math.max(Math.abs(L1 - L2) + 0.1, Math.sqrt(d * d + h * h)));
      var phi = Math.atan2(h, d), a = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + r * r - L2 * L2) / (2 * L1 * r)))), sh = phi + a;
      var ux = dx / d, uz = dz / d;
      E1.set(base.x + ux * L1 * Math.cos(sh), base.y + L1 * Math.sin(sh), base.z + uz * L1 * Math.cos(sh));
      W.set(base.x + ux * r * Math.cos(phi), base.y + r * Math.sin(phi), base.z + uz * r * Math.cos(phi));
      upper.position.copy(base); upper.quaternion.setFromUnitVectors(UP, D.copy(E1).sub(base).normalize());
      fore.position.copy(E1); fore.quaternion.setFromUnitVectors(UP, D.copy(W).sub(E1).normalize());
      j1.position.copy(E1); j2.position.copy(W);
      head.position.copy(W);
    };
    arm.update = function (dt, calm) {
      var k = 1 - Math.exp(-dt * 11);
      arm.pos.lerp(arm.target, k);
      arm.bob += dt;
      if (!calm) arm.pos.y += Math.sin(arm.bob * 2.2) * 0.004;
      arm.solve();
      head.rotation.z = arm.tilt * 0.3;
      head.rotation.y = 0;
      var g = Math.max(0, Math.min(1, arm.grip));
      clawL.rotation.z = -0.35 + g * 0.45; clawR.rotation.z = 0.35 - g * 0.45;
      pupils.position.x = Math.max(-0.06, Math.min(0.06, arm.look * 0.03));
      arm.blink -= dt;
      var bl = arm.blink < 0 && arm.blink > -0.12 ? 0.1 : 1;
      if (arm.blink < -0.12) arm.blink = 2 + Math.random() * 3;
      face.scale.y = 1; pupils.scale.y = bl;
    };
    arm.wrist = W;
    return arm;
  };

  /* ---------------------------------------------------------- the boxes */
  SF.buildBox = function (T, scene, s) {
    var G = H.G, P = H.P, w = 1.9, d = 1.6, h = 1.0, t = 0.07;
    var card = new T.MeshLambertMaterial({ color: 0xffffff, vertexColors: true });
    var group = new T.Group(); group.scale.setScalar(s || 1); scene.add(group);
    var body = new T.Mesh(H.merge([P(G.box, 0xd99a5b, [0, 0.04, 0], null, [w, 0.08, d]), P(G.box, 0xe0a565, [0, h / 2, d / 2], null, [w, h, t]),
      P(G.box, 0xc98a4e, [0, h / 2, -d / 2], null, [w, h, t]), P(G.box, 0xd4975a, [w / 2, h / 2, 0], null, [t, h, d]), P(G.box, 0xd4975a, [-w / 2, h / 2, 0], null, [t, h, d]),
      P(G.box, 0xb57a42, [0, h * 0.55, d / 2 + 0.04], null, [0.5, 0.36, 0.01]), P(G.box, 0xffffff, [0, h * 0.55, d / 2 + 0.045], null, [0.4, 0.26, 0.01])]), card);
    group.add(body);
    var flapMat = new T.MeshLambertMaterial({ color: 0xe3ab6c });
    var flaps = [];
    [[0, d / 2, w, d / 2, 1, 0], [0, -d / 2, w, d / 2, -1, 0], [w / 2, 0, d, w / 2, 0, 1], [-w / 2, 0, d, w / 2, 0, -1]].forEach(function (f) {
      var pivot = new T.Group(); pivot.position.set(f[0], h + (f[5] ? 0 : 0.03), f[1]);
      var m = new T.Mesh(G.box, flapMat);
      if (f[5]) { m.scale.set(f[3], 0.04, f[2]); m.position.set(-f[5] * f[3] / 2, 0, 0); } else { m.scale.set(f[2], 0.04, f[3]); m.position.set(0, 0, -f[4] * f[3] / 2); }
      pivot.add(m); group.add(pivot);
      flaps.push({ p: pivot, f4: f[4], f5: f[5] });
    });
    var tape = new T.Mesh(G.box, new T.MeshLambertMaterial({ color: 0x3d8bff }));
    tape.scale.set(0.36, 0.03, d + 0.1); tape.position.set(0, h + 0.06, 0); group.add(tape);
    var box = { group: group, open: 1, glow: 0, h: h };
    // open: 1 = flaps folded outwards, 0 = closed flat over the top.
    box.set = function (open, glow) {
      box.open = open;
      var A = Math.PI / 2 + 0.6;
      for (var i = 0; i < 4; i++) {
        var f = flaps[i];
        f.p.rotation.x = f.f4 * open * A * (i < 2 ? 1 : 0);
        f.p.rotation.z = -f.f5 * open * (A - 0.08);
      }
      tape.visible = open < 0.05;
      card.emissive.setRGB(glow * 0.35, glow * 0.3, glow * 0.05);
    };
    box.set(1, 0);
    return box;
  };

  /* ---------------------------------------------------------- the signs */
  SF.buildSign = function (T, scene, scale, color) {
    var group = new T.Group(); group.scale.setScalar(scale); scene.add(group);
    var back = new T.Mesh(H.panel(3.25, 2.25, 0.36, 0.1), new T.MeshLambertMaterial({ color: color }));
    var front = new T.Mesh(H.panel(2.95, 1.95, 0.28, 0.08), new T.MeshLambertMaterial({ color: 0xffffff }));
    front.position.z = 0.08;
    var pole = new T.Mesh(H.G.cyl, new T.MeshLambertMaterial({ color: 0x5b6488 }));
    pole.scale.set(0.08, 2.4, 0.08); pole.position.set(0, -2.2, -0.1);
    group.add(back, front, pole);
    group.rotation.x = -0.42;
    return { group: group, back: back, flip: 1 };
  };

  /* ------------------------------------------------------ the clipboard */
  SF.buildClip = function (T, scene) {
    var group = new T.Group(); scene.add(group);
    var glass = new T.MeshBasicMaterial({ color: 0x7ef0ff, transparent: true, opacity: 0.28, depthWrite: false });
    var rim = new T.MeshBasicMaterial({ color: 0x3fd9ff, transparent: true, opacity: 0.75, depthWrite: false });
    var outer = new T.Mesh(H.panel(2.9, 1.55, 0.34, 0.04), rim), inner = new T.Mesh(H.panel(2.7, 1.35, 0.28, 0.05), glass);
    inner.position.z = 0.03;
    var clip = new T.Mesh(H.merge([H.P(H.G.box, 0x5b6488, [0, 0.82, 0.05], null, [0.9, 0.24, 0.12]), H.P(H.G.box, 0xdfe6f2, [0, 0.95, 0.06], null, [0.5, 0.14, 0.1]),
      H.P(H.G.cyl, 0xdfe6f2, [0, 1.04, 0.06], [Math.PI / 2, 0, 0], [0.12, 0.1, 0.12])]), new T.MeshLambertMaterial({ vertexColors: true }));
    outer.renderOrder = 3; inner.renderOrder = 4;
    group.add(outer, inner, clip);
    group.rotation.x = -0.4;
    return { group: group, glass: glass, rim: rim, pulse: 0 };
  };

  /* ------------------------------------------------------------ Nattout */
  SF.buildGremlin = function (T, scene) {
    var G = H.G, P = H.P;
    var fur = new T.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    var body = new T.Mesh(H.merge([P(new T.IcosahedronGeometry(1, 1), 0x8a4dff, [0, 0.42, 0], null, [0.42, 0.4, 0.38]),
      P(G.sph, 0xc5a6ff, [0, 0.34, 0.24], null, [0.24, 0.22, 0.16]),
      P(G.cone, 0xffd23f, [-0.22, 0.86, 0], [0, 0, 0.45], [0.08, 0.26, 0.08]), P(G.cone, 0xffd23f, [0.22, 0.86, 0], [0, 0, -0.45], [0.08, 0.26, 0.08]),
      P(G.sph, 0xffffff, [-0.14, 0.55, 0.32], null, [0.13, 0.15, 0.08]), P(G.sph, 0xffffff, [0.14, 0.55, 0.32], null, [0.13, 0.15, 0.08]),
      P(G.sph, 0x1d2340, [-0.12, 0.54, 0.39], null, [0.06, 0.08, 0.04]), P(G.sph, 0x1d2340, [0.12, 0.54, 0.39], null, [0.06, 0.08, 0.04]),
      P(G.sph, 0x4a1d6b, [0, 0.36, 0.36], null, [0.12, 0.06, 0.04]), P(G.box, 0xffffff, [0.04, 0.39, 0.395], null, [0.05, 0.04, 0.01]),
      P(G.sph, 0xff8a1f, [-0.18, 0.04, 0.08], null, [0.13, 0.07, 0.17]), P(G.sph, 0xff8a1f, [0.18, 0.04, 0.08], null, [0.13, 0.07, 0.17]),
      P(G.cap, 0x8a4dff, [-0.42, 0.62, 0], [0, 0, 0.6], [0.07, 0.25, 0.07]), P(G.cap, 0x8a4dff, [0.42, 0.62, 0], [0, 0, -0.6], [0.07, 0.25, 0.07])]), fur);
    var group = new T.Group(); group.add(body); group.visible = false; scene.add(group);
    // The giant Ctrl+Z keycap Nattout slams in Hall 3.
    var tex = H.canvasTex(256, 128, function (g) {
      function cap(x, w, label) {
        g.fillStyle = '#9aa3c7'; g.beginPath(); g.roundRect(x, 18, w, 100, 18); g.fill();
        g.fillStyle = '#ffffff'; g.beginPath(); g.roundRect(x, 8, w, 96, 18); g.fill();
        g.fillStyle = '#1d2340'; g.font = '700 46px Fredoka, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, x + w / 2, 58);
      }
      cap(6, 136, 'Ctrl'); cap(154, 96, 'Z');
    });
    var sprite = new T.Sprite(new T.SpriteMaterial({ map: tex, depthTest: false }));
    sprite.scale.set(1.5, 0.75, 1); sprite.position.set(0, 1.45, 0); sprite.renderOrder = 6;
    group.add(sprite);
    return { group: group, body: body, sprite: sprite };
  };
})();
