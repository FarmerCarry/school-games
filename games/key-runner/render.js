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
    sea.scale.set(80, 1.2, 80);
    sea.position.set(0, -2.4, 20);
    scene.add(sea);
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
    var gateLabel = {};
    var gateMesh = [];
    for (var g = 0; g < 6; g++) {
      var gm = new T.Mesh(planeGeo, new T.MeshBasicMaterial({ color: 0xffffff, transparent: true }));
      gm.visible = false;
      gm.frustumCulled = false;
      scene.add(gm);
      gateMesh.push(gm);
    }

    function buddy(color) {
      var group = new T.Group();
      var mat = lambert(color);
      var body = new T.Mesh(new T.CapsuleGeometry(0.32, 0.46, 2, 8), mat);
      body.position.y = 0.62;
      var faceCanvas = document.createElement('canvas');
      faceCanvas.width = faceCanvas.height = 64;
      var fctx = faceCanvas.getContext('2d');
      fctx.fillStyle = '#fff7ea';
      fctx.beginPath(); fctx.arc(32, 32, 30, 0, Math.PI * 2); fctx.fill();
      fctx.fillStyle = '#2a2030';
      fctx.beginPath(); fctx.arc(22, 28, 4, 0, Math.PI * 2); fctx.arc(42, 28, 4, 0, Math.PI * 2); fctx.fill();
      fctx.strokeStyle = '#2a2030'; fctx.lineWidth = 3; fctx.lineCap = 'round';
      fctx.beginPath(); fctx.arc(32, 36, 10, 0.2, Math.PI - 0.2); fctx.stroke();
      var face = new T.Mesh(planeGeo, new T.MeshBasicMaterial({ map: new T.CanvasTexture(faceCanvas), transparent: true }));
      face.position.set(0, 0.78, 0.3);
      face.scale.set(0.46, 0.46, 1);
      var footL = new T.Mesh(bodyGeo, mat);
      var footR = new T.Mesh(bodyGeo, mat);
      footL.scale.set(0.22, 0.14, 0.34);
      footR.scale.set(0.22, 0.14, 0.34);
      var hat = new T.Group();
      group.add(body, face, footL, footR, hat);
      group.userData = { mat: mat, footL: footL, footR: footR, hat: hat, hatId: -1 };
      scene.add(group);
      var shadow = new T.Mesh(shadowGeo, new T.MeshBasicMaterial({ color: 0x2a1428, transparent: true, opacity: 0.28, depthWrite: false }));
      shadow.rotation.x = -Math.PI / 2;
      scene.add(shadow);
      var ring = new T.Mesh(ringGeo, new T.MeshBasicMaterial({ color: 0xfff1a8, transparent: true, opacity: 0.9, side: T.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      scene.add(ring);
      return { group: group, shadow: shadow, ring: ring };
    }
    var buddies = [buddy(0x3d8bff), buddy(0xff6ad5)];

    function hatMesh(id, parent) {
      while (parent.children.length) parent.remove(parent.children[0]);
      if (!id) return;
      var mat = lambert(id === 2 ? 0xbfe9ff : id === 3 ? 0xffe56a : id === 4 ? 0xff8ad0 : 0xffe56a);
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
    var shake = 0;
    var themeIndex = -1;
    var disposed = false;

    function paintChar(ch) {
      if (letterMat[ch]) return letterMat[ch];
      var c = document.createElement('canvas');
      c.width = c.height = 64;
      var ctx = c.getContext('2d');
      ctx.fillStyle = '#fff6ea';
      ctx.fillRect(0, 0, 64, 64);
      ctx.fillStyle = '#3a2140';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.direction = 'rtl';
      var latin = LATIN[ch];
      if (latin) {
        ctx.font = '700 30px Fredoka';
        ctx.fillText(ch, 32, 24);
        ctx.font = '700 16px Fredoka';
        ctx.fillText(latin, 32, 48);
      } else {
        ctx.font = '700 40px Fredoka';
        ctx.fillText(ch, 32, 34);
      }
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

    function put(mesh, index, x, y, z, sx, sy, sz, color) {
      dummy.position.set(x, y, z);
      dummy.scale.set(sx, sy, sz);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      if (color != null) { tint.setHex(hex(color)); mesh.setColorAt(index, tint); }
    }

    function applyTheme(state) {
      var idx = state.mode === 'world' || state.mode === 'race' ? state.world | 0 : state.mode === 'tower' ? 6 : 0;
      if (idx === themeIndex) return;
      themeIndex = idx;
      var th = KR.themes[idx] || KR.themes[0];
      scene.background = new T.Color(th.sky);
      scene.fog.color.setHex(th.fog);
      seaMat.color.setHex(th.sea);
      colors.body.setHex(th.key);
      colors.top.setHex(th.top);
      colors.accent.setHex(th.accent);
      colors.ink.setHex(th.dark);
    }

    function render(state, opts) {
      if (disposed || !state) return;
      opts = opts || {};
      applyTheme(state);
      var low = opts.quality === 'low';
      var reduced = !!opts.reduced;
      var two = state.players.length > 1;
      scene.fog.near = low ? 14 : two ? 18 : 26;
      scene.fog.far = low ? 46 : two ? 58 : 96;
      var pieces = state.pieces;
      var nb = 0, nt = 0, nr = 0, ns = 0, ng = 0, nf = 0, nflag = 0, nstick = 0, nlet = 0, ngate = 0;
      var speedOk = state.players[0] ? state.players[0].speed : 0;
      for (var i = 0; i < pieces.length && nb < MAX; i++) {
        var p = pieces[i];
        if (p.t === 'chev') {
          put(flags, nflag++, p.x, p.y, p.z + 0.15, 0.5, 0.08, 0.28, 0xfff1a8);
          continue;
        }
        if (p.t === 'rail') { put(rails, nr++, p.x, p.y, p.z, p.hw * 2, p.hh * 2, p.hd * 2, 0xfff1a8); continue; }
        if (p.t === 'gum' || p.t === 'sweep' || p.t === 'pop') {
          put(balls, ns++, p.x, p.y + (p.r || p.hh), p.z, p.r || p.hh, p.r || p.hh, p.r || p.hh, p.t === 'gum' ? 0xff4d8d : 0xffd24a);
          if (p.t === 'pop') put(sticks, nstick++, p.baseX || p.x, (p.pivot || 2) * 0.5, p.baseZ || p.z, 0.06, p.pivot || 2, 0.06, 0xfff1c9);
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
        var col = p.t === 'tramp' ? 0x7dffa0 : p.t === 'launch' ? 0xffe56a : p.t === 'ice' ? 0xd7f4ff : p.t === 'jelly' ? 0xff8ad0 : p.t === 'portal' ? 0xb388ff : p.t === 'shop' ? 0xffd24a : p.t === 'tower' ? 0x8fd0ff : colors.body.getHex();
        var sy = p.hh * 2;
        put(bodies, nb++, p.x, p.y, p.z, p.hw * 2, sy, p.hd * 2, col);
        if (p.ch && nlet < LETTERS) {
          var letter = letterMesh[nlet++];
          letter.visible = true;
          letter.material = paintChar(p.ch);
          letter.position.set(p.x, p.y + p.hh + 0.03, p.z);
          letter.scale.set(Math.min(1.3, p.hw * 1.7), Math.min(1.3, p.hd * 1.7), 1);
        } else if (!p.ch) {
          put(tops, nt++, p.x, p.y + p.hh * 0.55, p.z, p.hw * 1.7, 0.06, p.hd * 1.7, p.flag ? 0xffe56a : colors.top.getHex());
        }
        if (p.flag) put(flags, nflag++, p.x + p.hw * 0.7, p.y + p.hh + 0.55, p.z, 0.08, 0.7, 0.08, 0xffe56a);
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
        var ghost = two && opts.eye !== pi;
        buddyMesh.group.userData.mat.opacity = ghost ? 0.38 : 1;
        buddyMesh.group.userData.mat.transparent = ghost;
        buddyMesh.group.userData.mat.depthWrite = !ghost;
        if (buddyMesh.group.userData.hatId !== hatId && !ghost) {
          hatMesh(hatId, buddyMesh.group.userData.hat);
          buddyMesh.group.userData.hatId = hatId;
        }
        var stretch = reduced ? 1 : (pl.onGround ? pl.squash : pl.stretch);
        var bob = pl.onGround && Math.hypot(pl.vx, pl.vz) > 1 ? Math.sin(state.time * 14 + pi) * 0.05 : Math.sin(state.time * 2 + pi) * 0.02;
        buddyMesh.group.position.set(pl.x, pl.y + bob, pl.z);
        buddyMesh.group.scale.set(1 / stretch, stretch, 1 / stretch);
        buddyMesh.group.rotation.y = pl.face;
        var moving = Math.hypot(pl.vx, pl.vz) > 0.8;
        var step = moving ? Math.sin(state.time * 14) : 0;
        buddyMesh.group.userData.footL.position.set(-0.16, 0.08, step * 0.18);
        buddyMesh.group.userData.footR.position.set(0.16, 0.08, -step * 0.18);
        var sh = opts.engine.shadowPoint(pi);
        buddyMesh.shadow.visible = true;
        buddyMesh.shadow.position.set(sh.x, sh.y + 0.04, sh.z);
        var spread = pl.onGround ? 0.55 : 0.38;
        buddyMesh.shadow.scale.set(spread, spread, 1);
        if (!low && !reduced && !ghost && moving) {
          var trail = opts.trail || 0;
          if (trail && Math.floor(state.time * 20) % 2 === 0) {
            var tc = trail === 2 ? 0xffe56a : trail === 3 ? 0xfff6ea : TRAIL[Math.floor(state.time * 6 + pi) % 4];
            spark(pl.x, pl.y + 0.25, pl.z, tc, 0.32);
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
      var buf = renderer.getDrawingBufferSize(new T.Vector2());
      renderer.setScissorTest(two);
      for (var e = 0; e < eyes.length; e++) {
        var eye = eyes[e];
        var plEye = state.players[eye];
        var pose = opts.engine.cameraPose(eye);
        if (two) {
          for (var b = 0; b < state.players.length; b++) {
            var ghostOn = b !== eye;
            buddies[b].group.userData.mat.opacity = ghostOn ? 0.38 : 1;
            buddies[b].group.userData.mat.transparent = ghostOn;
            buddies[b].group.userData.mat.depthWrite = !ghostOn;
          }
          var half = buf.x / 2;
          renderer.setViewport(eye ? half : 0, 0, half, buf.y);
          renderer.setScissor(eye ? half : 0, 0, half, buf.y);
        } else {
          renderer.setViewport(0, 0, buf.x, buf.y);
        }
        var fast = !reduced && !low && plEye && KR.topSpeed(plEye.speed) > 12;
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
        camera.fov = 60;
        if (fast) camera.fov = 66;
        camera.updateProjectionMatrix();
        camera.position.set(pose.x, pose.y, pose.z);
        if (!reduced && opts.shake > 0) {
          camera.position.x += Math.sin(state.time * 40) * opts.shake;
          camera.position.y += Math.cos(state.time * 33) * opts.shake * 0.6;
        }
        if (!reduced && state.flood && plEye && plEye.z > state.flood.z0 && state.floodY > plEye.y - 1) {
          camera.position.x += Math.sin(state.time * 18) * 0.08;
        }
        camera.lookAt(pose.lx, pose.ly, pose.lz);
        renderer.render(scene, camera);
      }
      renderer.setScissorTest(false);
    }

    function burst(x, y, z, color, count) {
      count = Math.min(count || 10, 24);
      for (var i = 0; i < count && parts.length < SPARKS; i++) {
        parts.push({
          x: x, y: y, z: z,
          vx: (Math.random() - 0.5) * 6,
          vy: 2 + Math.random() * 5,
          vz: (Math.random() - 0.5) * 6,
          life: 0.4 + Math.random() * 0.4,
          size: 0.08 + Math.random() * 0.08,
          color: color || 0xfff1a8
        });
      }
    }

    return {
      render: render,
      burst: burst,
      rebuildText: function () { letterMat = {}; gateLabel = {}; },
      setPixelRatio: function (dpr) { renderer.setPixelRatio(dpr); renderer.setSize(1280, 720, false); },
      dispose: function () {
        disposed = true;
        renderer.dispose();
      }
    };
  };
})(window.KeyRunner = window.KeyRunner || {});
