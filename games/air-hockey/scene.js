/*
 * Air Hockey 3D view (three.js r159, window.THREE). Draws the table, mallets with faces,
 * pucks with light trails, power-up tokens and effects from the engine's world state.
 * It owns no game rules: game.js calls update() every frame and the fx helpers on events.
 * Table units (engine) map to metres with K = 0.01: x -> X, y -> Z, the surface at Y = 0.
 */
(function () {
  'use strict';
  var K = 0.01;
  var AHScene = {};

  function canvasTex(w, h, draw) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    var t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  function radialTex(inner, outer) {
    return canvasTex(128, 128, function (g) {
      var gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, inner); gr.addColorStop(1, outer);
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    });
  }

  AHScene.create = function (canvas, opts) {
    var T = window.THREE;
    if (!T) throw new Error('three.js is unavailable');
    opts = opts || {};
    var E = opts.T; // engine table constants
    var wgl = Kit.webgl.createRenderer(canvas, { software: !!opts.soft, softRatio: 1.0, antialias: true });
    var soft = wgl.software, renderer = wgl.renderer, ratio = wgl.ratio;
    var scene = new T.Scene();
    var camera = new T.PerspectiveCamera(40, 16 / 9, 0.1, 90);
    var pickCam = camera.clone();
    var HW = E.HW * K, HL = E.HL * K, CR = E.CORNER * K, GH = E.GOAL_HALF * K;
    var RAIL_W = 0.34, RAIL_H = 0.2, FLOOR_Y = -1.7;
    var V = new T.Vector3(), V2 = new T.Vector3(), C = new T.Color(), C2 = new T.Color();
    var view = { renderer: renderer, scene: scene, camera: camera, calm: false };

    /* ------------------------------------------------------------ lights */
    var hemi = new T.HemisphereLight(0xe6efff, 0x3a2a66, 2.1);
    var sun = new T.DirectionalLight(0xffffff, 2.2);
    sun.position.set(-3, 10, 6);
    var puckLight = new T.PointLight(0x7ff6ff, 5, 3.2, 1.4);
    puckLight.position.set(0, 0.45, 0);
    scene.add(hemi, sun, puckLight);

    /* ----------------------------------------------------- geometry help */
    // Merges geometries (each with one colour) into one non-indexed, vertex-coloured geometry.
    function merge(parts) {
      var list = parts.map(function (p) { var g = p.g.index ? p.g.toNonIndexed() : p.g.clone(); if (p.m) g.applyMatrix4(p.m); return { g: g, c: p.c }; });
      var n = 0;
      list.forEach(function (p) { n += p.g.attributes.position.count; });
      var pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), o = 0;
      list.forEach(function (p) {
        var A = p.g.attributes, cnt = A.position.count;
        pos.set(A.position.array, o * 3); nor.set(A.normal.array, o * 3);
        C.set(p.c || '#ffffff');
        for (var i = 0; i < cnt; i++) { col[(o + i) * 3] = C.r; col[(o + i) * 3 + 1] = C.g; col[(o + i) * 3 + 2] = C.b; }
        o += cnt;
        p.g.dispose();
      });
      var g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(pos, 3));
      g.setAttribute('normal', new T.BufferAttribute(nor, 3));
      g.setAttribute('color', new T.BufferAttribute(col, 3));
      g.computeBoundingSphere();
      return g;
    }
    var M4 = new T.Matrix4(), Q = new T.Quaternion(), EU = new T.Euler(), S3 = new T.Vector3(1, 1, 1), P3 = new T.Vector3();
    function mat(x, y, z, rx, ry, rz, sx, sy, sz) {
      EU.set(rx || 0, ry || 0, rz || 0); Q.setFromEuler(EU); P3.set(x, y, z); S3.set(sx == null ? 1 : sx, sy == null ? (sx == null ? 1 : sx) : sy, sz == null ? (sx == null ? 1 : sx) : sz);
      return new T.Matrix4().compose(P3, Q, S3);
    }
    // Rounded-rectangle outline (centre at 0) as a Shape or a hole Path.
    function roundRect(shape, hw, hl, r) {
      shape.moveTo(-hw + r, -hl);
      shape.lineTo(hw - r, -hl); shape.absarc(hw - r, -hl + r, r, -Math.PI / 2, 0, false);
      shape.lineTo(hw, hl - r); shape.absarc(hw - r, hl - r, r, 0, Math.PI / 2, false);
      shape.lineTo(-hw + r, hl); shape.absarc(-hw + r, hl - r, r, Math.PI / 2, Math.PI, false);
      shape.lineTo(-hw, -hl + r); shape.absarc(-hw + r, -hl + r, r, Math.PI, Math.PI * 1.5, false);
      return shape;
    }
    // One side of the rail: a C shape between offsets o1 and o2 outside the field edge,
    // from one goal post round the corners to the other. side = 1 right, -1 left.
    function railShape(o1, o2, g, side) {
      var pts = [], i, a, n = 10;
      function arc(cx, cy, r, a0, a1) { for (i = 0; i <= n; i++) { a = a0 + (a1 - a0) * i / n; pts.push(new T.Vector2(cx + Math.cos(a) * r, cy + Math.sin(a) * r)); } }
      var cx = HW - CR, cy = HL - CR;
      pts.push(new T.Vector2(g, -(HL + o1)));
      arc(cx, -cy, CR + o1, -Math.PI / 2, 0);
      arc(cx, cy, CR + o1, 0, Math.PI / 2);
      pts.push(new T.Vector2(g, HL + o1), new T.Vector2(g, HL + o2));
      arc(cx, cy, CR + o2, Math.PI / 2, 0);
      arc(cx, -cy, CR + o2, 0, -Math.PI / 2);
      pts.push(new T.Vector2(g, -(HL + o2)));
      if (side < 0) pts = pts.map(function (p) { return new T.Vector2(-p.x, p.y); });
      return new T.Shape(pts);
    }
    function extrude(shape, depth, bevel) {
      var g = new T.ExtrudeGeometry(shape, { depth: depth, bevelEnabled: !!bevel, bevelThickness: bevel || 0, bevelSize: bevel || 0, bevelSegments: 2, curveSegments: 10 });
      g.rotateX(-Math.PI / 2);
      return g;
    }

    /* ------------------------------------------------------------ arena */
    var floorTex = null, wallTex = null;
    var floorMat = new T.MeshBasicMaterial({ color: 0xffffff });
    var floor = new T.Mesh(new T.CircleGeometry(30, 48), floorMat);
    floor.rotation.x = -Math.PI / 2; floor.position.y = FLOOR_Y;
    scene.add(floor);
    // Retro-arcade stadium wall around the rink perimeter (replaces floating bars).
    var wallMat = new T.MeshBasicMaterial({ color: 0xffffff, side: T.BackSide });
    var wall = new T.Mesh(new T.CylinderGeometry(14.5, 14.8, 4.4, 48, 1, true), wallMat);
    wall.position.y = FLOOR_Y + 2.2;
    scene.add(wall);
    // Glowing neon rink outline on the arena floor + 4 low corner arcade light bollards.
    var floorNeonMat = new T.MeshBasicMaterial({ color: 0x58e8ff });
    var rinkLoop = extrude((function () {
      var s = roundRect(new T.Shape(), HW + 1.55, HL + 1.55, CR + 1.55);
      s.holes.push(roundRect(new T.Path(), HW + 1.38, HL + 1.38, CR + 1.38));
      return s;
    })(), 0.04);
    var rinkRing = new T.Mesh(rinkLoop, floorNeonMat);
    rinkRing.position.y = FLOOR_Y + 0.02;
    scene.add(rinkRing);
    var bollardParts = [];
    var bColors = ['#58e8ff', '#ff4fd8', '#58e8ff', '#ff4fd8'], bi = 0;
    for (var bx = -1; bx <= 1; bx += 2) for (var bz = -1; bz <= 1; bz += 2) {
      var px0 = bx * (HW + 2.3), pz0 = bz * (HL + 1.1), bc0 = bColors[bi++];
      bollardParts.push(
        { g: new T.CylinderGeometry(0.42, 0.48, 0.08, 16), m: mat(px0, FLOOR_Y + 0.04, pz0), c: '#16113b' },
        { g: new T.CylinderGeometry(0.32, 0.36, 0.06, 16), m: mat(px0, FLOOR_Y + 0.09, pz0), c: bc0 }
      );
    }
    var bollards = new T.Mesh(merge(bollardParts), new T.MeshBasicMaterial({ vertexColors: true }));
    scene.add(bollards);
    var glowTex = radialTex('rgba(255,255,255,1)', 'rgba(255,255,255,0)');
    var underGlow = new T.Mesh(new T.PlaneGeometry(HW * 2 + 6, HL * 2 + 6), new T.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0.9 }));
    underGlow.rotation.x = -Math.PI / 2; underGlow.position.y = FLOOR_Y + 0.03;
    scene.add(underGlow);

    /* ------------------------------------------------------------ table */
    var TEX_W = 512, TEX_H = Math.round(512 * (2 * HL) / (2 * HW + 0.2));
    var topMat = new T.MeshPhongMaterial({ color: 0xffffff, shininess: 90, specular: 0x666666 });
    var top = new T.Mesh(new T.PlaneGeometry(HW * 2 + 0.2, HL * 2), topMat);
    top.rotation.x = -Math.PI / 2;
    scene.add(top);
    var railMat = new T.MeshPhongMaterial({ color: 0x2457d6, shininess: 70, specular: 0x444444 });
    var neonMat = new T.MeshBasicMaterial({ color: 0x58e8ff });
    var railGeo = merge([{ g: extrude(railShape(0, RAIL_W, GH, 1), RAIL_H, 0.03) }, { g: extrude(railShape(0, RAIL_W, GH, -1), RAIL_H, 0.03) }]);
    railMat.vertexColors = true;
    var rail = new T.Mesh(railGeo, railMat);
    scene.add(rail);
    var neonGeo = merge([{ g: extrude(railShape(0.0, 0.06, GH, 1), 0.02) }, { g: extrude(railShape(0.0, 0.06, GH, -1), 0.02) }]);
    var neon = new T.Mesh(neonGeo, neonMat);
    neon.position.y = RAIL_H + 0.03;
    scene.add(neon);
    var bodyMat = new T.MeshLambertMaterial({ color: 0x1a2c6e });
    var bodyGeo = extrude(roundRect(new T.Shape(), HW + RAIL_W, HL + RAIL_W, CR + RAIL_W), 0.7);
    bodyGeo.translate(0, -0.74, 0);
    var legs = [];
    for (var lx = -1; lx <= 1; lx += 2) for (var lz = -1; lz <= 1; lz += 2) legs.push({ g: new T.CylinderGeometry(0.16, 0.22, -FLOOR_Y - 0.7, 10), m: mat(lx * (HW - 0.3), (FLOOR_Y - 0.7) / 2, lz * (HL - 0.4)) });
    var body = new T.Mesh(merge([{ g: bodyGeo }].concat(legs)), bodyMat);
    bodyMat.vertexColors = true;
    scene.add(body);
    var bandGeo = extrude((function () { var s = roundRect(new T.Shape(), HW + RAIL_W + 0.02, HL + RAIL_W + 0.02, CR + RAIL_W + 0.02); s.holes.push(roundRect(new T.Path(), HW + RAIL_W - 0.02, HL + RAIL_W - 0.02, CR + RAIL_W - 0.02)); return s; })(), 0.07);
    var band = new T.Mesh(bandGeo, neonMat);
    band.position.y = -0.36;
    scene.add(band);
    // Goal slots: dark holes in the rail ends, with a lamp bar behind each mouth.
    var slotMat = new T.MeshBasicMaterial({ color: 0x07061a });
    var goals = [];
    for (var gs = 0; gs < 2; gs++) {
      var sz = gs === 0 ? 1 : -1;
      var slot = new T.Mesh(new T.BoxGeometry(GH * 2, 0.3, RAIL_W), slotMat);
      slot.position.set(0, -0.155, sz * (HL + RAIL_W / 2));
      var lampMat = new T.MeshBasicMaterial({ color: gs === 0 ? 0x4fb4ff : 0xff4f6e });
      var lamp = new T.Mesh(new T.BoxGeometry(GH * 2 + 0.1, 0.09, 0.08), lampMat);
      lamp.position.set(0, RAIL_H + 0.02, sz * (HL + RAIL_W - 0.04));
      // Mini-goal blockers slide in from both posts.
      var blockMat = new T.MeshPhongMaterial({ color: 0xffffff, emissive: 0x3a7bff, emissiveIntensity: 0.6, shininess: 60 });
      var bl = new T.Mesh(new T.BoxGeometry(1, RAIL_H + 0.04, 0.12), blockMat), br = new T.Mesh(bl.geometry, blockMat);
      bl.position.set(0, (RAIL_H + 0.04) / 2, sz * (HL + 0.06)); br.position.copy(bl.position);
      bl.visible = br.visible = false;
      scene.add(slot, lamp, bl, br);
      goals.push({ slot: slot, lamp: lamp, lampMat: lampMat, base: new T.Color(lampMat.color), flash: 0, bl: bl, br: br, blockMat: blockMat });
    }

    function paintTop(g, w, h, t) {
      var sx = w / (2 * E.HW + 20), sy = h / (2 * E.HL);
      function X(x) { return (x + E.HW + 10) * sx; }
      function Y(y) { return (y + E.HL) * sy; }
      var gr = g.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, h * 0.62);
      gr.addColorStop(0, t.top); gr.addColorStop(1, t.top2);
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      var i, j;
      if (t.id === 'grass') {
        g.fillStyle = 'rgba(255,255,255,0.08)';
        for (i = 0; i < 9; i += 2) g.fillRect(0, i * h / 9, w, h / 9);
      } else if (t.id === 'candy') {
        g.save(); g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 22;
        for (i = -h; i < w + h; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i - h, h); g.stroke(); }
        g.restore();
      } else if (t.id === 'space') {
        for (i = 0; i < 160; i++) { var r = (i * 7919) % 97 / 97; g.fillStyle = 'rgba(255,255,255,' + (0.3 + r * 0.7) + ')'; g.beginPath(); g.arc((i * 271) % w, (i * 613) % h, 0.6 + r * 1.6, 0, 7); g.fill(); }
        var neb = g.createRadialGradient(w * 0.3, h * 0.3, 0, w * 0.3, h * 0.3, w * 0.6);
        neb.addColorStop(0, 'rgba(160,80,255,0.35)'); neb.addColorStop(1, 'rgba(160,80,255,0)');
        g.fillStyle = neb; g.fillRect(0, 0, w, h);
      } else if (t.id === 'neon') {
        g.strokeStyle = 'rgba(255,79,216,0.18)'; g.lineWidth = 2;
        for (i = 0; i < w; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); }
        for (j = 0; j < h; j += 32) { g.beginPath(); g.moveTo(0, j); g.lineTo(w, j); g.stroke(); }
      } else {
        // Ice: soft diagonal sheen.
        g.save(); g.globalAlpha = 0.18; g.strokeStyle = '#ffffff'; g.lineWidth = 30;
        for (i = 0; i < 4; i++) { g.beginPath(); g.moveTo(-50 + i * 190, h); g.lineTo(220 + i * 190, 0); g.stroke(); }
        g.restore();
      }
      // Air holes.
      var dark = t.id === 'space' || t.id === 'neon';
      g.fillStyle = dark ? 'rgba(255,255,255,0.16)' : 'rgba(10,30,80,0.2)';
      for (var y = -E.HL + 14; y < E.HL; y += 22) for (var x = -E.HW + 14; x < E.HW; x += 22) { g.beginPath(); g.arc(X(x), Y(y), 1.7, 0, 7); g.fill(); }
      // Markings.
      g.save();
      g.shadowColor = t.line; g.shadowBlur = 14;
      g.strokeStyle = t.line; g.lineWidth = 7;
      g.beginPath(); g.moveTo(X(-E.HW - 10), Y(0)); g.lineTo(X(E.HW + 10), Y(0)); g.stroke();
      g.lineWidth = 6;
      g.beginPath(); g.arc(X(0), Y(0), 78 * sx, 0, Math.PI * 2); g.stroke();
      g.fillStyle = t.line; g.beginPath(); g.arc(X(0), Y(0), 12 * sx, 0, 7); g.fill();
      g.lineWidth = 5;
      g.beginPath(); g.arc(X(0), Y(-E.HL), 128 * sx, 0, Math.PI); g.stroke();
      g.beginPath(); g.arc(X(0), Y(E.HL), 128 * sx, Math.PI, Math.PI * 2); g.stroke();
      for (i = -1; i <= 1; i += 2) for (j = -1; j <= 1; j += 2) { g.beginPath(); g.arc(X(i * 130), Y(j * 230), 9 * sx, 0, 7); g.fill(); }
      g.restore();
    }

    var table = null;
    view.setTable = function (t) {
      table = t;
      if (topMat.map) topMat.map.dispose();
      topMat.map = canvasTex(TEX_W, TEX_H, function (g, w, h) { paintTop(g, w, h, t); });
      topMat.map.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
      topMat.needsUpdate = true;
      var rc = new T.Color(t.rim), col = railGeo.attributes.color;
      for (var i = 0; i < col.count; i++) {
        // Lighter top faces, deeper sides, from the vertex normal.
        var up = railGeo.attributes.normal.getY(i);
        C2.copy(rc).lerp(C.set(0xffffff), up > 0.5 ? 0.18 : 0);
        col.setXYZ(i, C2.r, C2.g, C2.b);
      }
      col.needsUpdate = true;
      neonMat.color.set(t.neon);
      floorNeonMat.color.set(t.neon);
      var bc = new T.Color(t.body), bcol = body.geometry.attributes.color;
      for (var j = 0; j < bcol.count; j++) bcol.setXYZ(j, bc.r, bc.g, bc.b);
      bcol.needsUpdate = true;
      underGlow.material.color.set(t.neon);
      scene.background = new T.Color(t.sky);
      scene.fog = new T.Fog(t.sky, 17, 36);
      if (floorTex) floorTex.dispose();
      floorTex = canvasTex(512, 512, function (g) {
        var gr = g.createRadialGradient(256, 256, 24, 256, 256, 256);
        C.set(t.floor); var hi = '#' + C.clone().lerp(C2.set(0xffffff), 0.22).getHexString();
        gr.addColorStop(0, hi); gr.addColorStop(0.42, t.floor); gr.addColorStop(1, t.sky);
        g.fillStyle = gr; g.fillRect(0, 0, 512, 512);
        // Subtle arcade floor radial grid + glowing rings.
        g.save();
        g.strokeStyle = 'rgba(255,255,255,0.06)'; g.lineWidth = 2;
        for (var a = 0; a < 24; a++) {
          var ang = a / 24 * Math.PI * 2;
          g.beginPath(); g.moveTo(256 + Math.cos(ang) * 54, 256 + Math.sin(ang) * 54);
          g.lineTo(256 + Math.cos(ang) * 252, 256 + Math.sin(ang) * 252); g.stroke();
        }
        for (var r = 64; r < 252; r += 36) {
          g.strokeStyle = r === 136 ? t.neon : r === 208 ? t.line : 'rgba(255,255,255,0.09)';
          g.globalAlpha = (r === 136 || r === 208) ? 0.32 : 1;
          g.lineWidth = (r === 136 || r === 208) ? 4 : 2;
          g.beginPath(); g.arc(256, 256, r, 0, 7); g.stroke();
        }
        g.restore();
      });
      floorMat.map = floorTex; floorMat.needsUpdate = true;
      if (wallTex) wallTex.dispose();
      wallTex = canvasTex(512, 128, function (g) {
        var wg = g.createLinearGradient(0, 0, 0, 128);
        wg.addColorStop(0, t.sky); wg.addColorStop(0.55, t.floor); wg.addColorStop(1, '#120b2e');
        g.fillStyle = wg; g.fillRect(0, 0, 512, 128);
        // Vertical arcade bay trims.
        g.fillStyle = 'rgba(255,255,255,0.05)';
        for (var x = 0; x < 512; x += 32) g.fillRect(x, 22, 4, 106);
        // Horizontal neon trim strips + soft stadium light orbs.
        g.fillStyle = t.neon; g.globalAlpha = 0.72; g.fillRect(0, 86, 512, 5);
        g.fillStyle = t.line; g.globalAlpha = 0.55; g.fillRect(0, 48, 512, 3);
        var dots = [t.neon, t.line, '#ffe14f', '#7dff6b'];
        for (var d = 0; d < 16; d++) {
          var dx = d * 32 + 16;
          g.fillStyle = dots[d % 4]; g.globalAlpha = 0.24;
          g.beginPath(); g.ellipse(dx, 28, 3.6, 15, 0, 0, 7); g.fill();
          g.globalAlpha = 0.9; g.beginPath(); g.ellipse(dx, 28, 1.3, 5.5, 0, 0, 7); g.fill();
        }
        g.globalAlpha = 1;
      });
      wallMat.map = wallTex; wallMat.needsUpdate = true;
    };

    /* ----------------------------------------------------------- shadows */
    var shadowTex = radialTex('rgba(0,0,10,0.55)', 'rgba(0,0,10,0)');
    var SHADOWS = 5;
    var shadows = new T.InstancedMesh(new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }), SHADOWS);
    shadows.position.y = 0.004;
    shadows.frustumCulled = false;
    scene.add(shadows);
    var QID = new T.Quaternion();
    function setShadow(i, x, z, s) { P3.set(x, 0, z); S3.set(s, 1, s); M4.compose(P3, QID, S3); shadows.setMatrixAt(i, M4); }

    /* ----------------------------------------------------------- mallets */
    var bodyProfile = [[0, 0], [1, 0], [1.03, 0.05], [1.0, 0.15], [0.9, 0.2], [0.55, 0.22], [0.4, 0.3], [0.33, 0.45], [0.32, 0.6]].map(function (p) { return new T.Vector2(p[0], p[1]); });
    var malletBodyGeo = new T.LatheGeometry(bodyProfile, 28);
    var knobGeo = new T.SphereGeometry(0.5, 22, 16);
    var KNOB_Y = 0.92;
    function dirOn(x, y, z, r) { V.set(x, y, z).normalize().multiplyScalar(r); return [V.x, V.y, V.z]; }
    var eyeL = dirOn(-0.38, 0.3, 0.88, 0.4), eyeR = dirOn(0.38, 0.3, 0.88, 0.4);
    var pupL = dirOn(-0.36, 0.28, 0.9, 0.53), pupR = dirOn(0.36, 0.28, 0.9, 0.53);
    var chL = dirOn(-0.62, -0.05, 0.78, 0.45), chR = dirOn(0.62, -0.05, 0.78, 0.45);
    var whitesGeo = merge([
      { g: new T.SphereGeometry(0.17, 14, 10), m: mat(eyeL[0], eyeL[1], eyeL[2], 0, 0, 0, 1, 1.2, 0.7), c: '#ffffff' },
      { g: new T.SphereGeometry(0.17, 14, 10), m: mat(eyeR[0], eyeR[1], eyeR[2], 0, 0, 0, 1, 1.2, 0.7), c: '#ffffff' }
    ]);
    var cheekGeo = merge([
      { g: new T.SphereGeometry(0.09, 10, 6), m: mat(chL[0], chL[1], chL[2], 0, -0.6, 0, 1.3, 0.8, 0.4), c: '#ff7aa8' },
      { g: new T.SphereGeometry(0.09, 10, 6), m: mat(chR[0], chR[1], chR[2], 0, 0.6, 0, 1.3, 0.8, 0.4), c: '#ff7aa8' }
    ]);
    var pupilGeo = merge([
      { g: new T.SphereGeometry(0.085, 10, 8), m: mat(pupL[0], pupL[1], pupL[2], 0, 0, 0, 1, 1.15, 0.6), c: '#141428' },
      { g: new T.SphereGeometry(0.085, 10, 8), m: mat(pupR[0], pupR[1], pupR[2], 0, 0, 0, 1, 1.15, 0.6), c: '#141428' },
      { g: new T.SphereGeometry(0.03, 6, 4), m: mat(pupL[0] + 0.03, pupL[1] + 0.04, pupL[2] + 0.04), c: '#ffffff' },
      { g: new T.SphereGeometry(0.03, 6, 4), m: mat(pupR[0] + 0.03, pupR[1] + 0.04, pupR[2] + 0.04), c: '#ffffff' }
    ]);
    var mouthPos = dirOn(0, -0.22, 1, 0.5);
    var smileGeo = new T.TorusGeometry(0.11, 0.032, 6, 14, Math.PI);
    var ohGeo = new T.TorusGeometry(0.06, 0.03, 6, 14);
    var faceMat = new T.MeshLambertMaterial({ vertexColors: true });
    var inkMat = new T.MeshBasicMaterial({ color: 0x1a1430 });
    var pupilMat = new T.MeshBasicMaterial({ vertexColors: true });
    var ringTex = canvasTex(128, 128, function (g) {
      g.strokeStyle = '#ffffff'; g.lineWidth = 10; g.globalAlpha = 0.9;
      g.beginPath(); g.arc(64, 64, 52, 0, 7); g.stroke();
      g.globalAlpha = 0.4; g.lineWidth = 6; g.beginPath(); g.arc(64, 64, 40, 0, 7); g.stroke();
    });

    function accessory(kind, look) {
      var dark = look.dark, parts = [];
      if (kind === 'bow') {
        parts.push({ g: new T.ConeGeometry(0.14, 0.28, 10), m: mat(-0.15, 0.5, 0.05, 0, 0, Math.PI / 2), c: '#ff3d8b' },
          { g: new T.ConeGeometry(0.14, 0.28, 10), m: mat(0.15, 0.5, 0.05, 0, 0, -Math.PI / 2), c: '#ff3d8b' },
          { g: new T.SphereGeometry(0.08, 8, 6), m: mat(0, 0.5, 0.05), c: '#ff77b0' });
        parts.forEach(function (p) { p.m.premultiply(mat(0, 0, 0, 0, 0, -0.45)); });
      } else if (kind === 'ears') {
        parts.push({ g: new T.ConeGeometry(0.15, 0.3, 4), m: mat(-0.28, 0.46, 0, 0, 0, 0.45), c: dark },
          { g: new T.ConeGeometry(0.15, 0.3, 4), m: mat(0.28, 0.46, 0, 0, 0, -0.45), c: dark },
          { g: new T.ConeGeometry(0.08, 0.16, 4), m: mat(-0.27, 0.45, 0.06, 0, 0, 0.45), c: '#ffb3c8' },
          { g: new T.ConeGeometry(0.08, 0.16, 4), m: mat(0.27, 0.45, 0.06, 0, 0, -0.45), c: '#ffb3c8' });
      } else if (kind === 'antenna') {
        parts.push({ g: new T.CylinderGeometry(0.025, 0.025, 0.36, 6), m: mat(0, 0.62, 0), c: '#d9e4ff' },
          { g: new T.SphereGeometry(0.09, 10, 8), m: mat(0, 0.82, 0), c: '#ffe14f' });
      } else if (kind === 'band') {
        parts.push({ g: new T.TorusGeometry(0.49, 0.06, 6, 24), m: mat(0, 0.2, 0, Math.PI / 2 - 0.25, 0, 0), c: '#ff3d5a' },
          { g: new T.BoxGeometry(0.06, 0.28, 0.05), m: mat(-0.1, 0.1, -0.5, 0.3, 0, 0.5), c: '#ff3d5a' },
          { g: new T.BoxGeometry(0.06, 0.28, 0.05), m: mat(0.1, 0.1, -0.5, 0.3, 0, -0.5), c: '#ff3d5a' });
      } else if (kind === 'crown') {
        parts.push({ g: new T.CylinderGeometry(0.3, 0.3, 0.14, 14, 1, true), m: mat(0, 0.46, 0), c: '#ffd23f' });
        for (var i = 0; i < 6; i++) { var a = i / 6 * Math.PI * 2; parts.push({ g: new T.ConeGeometry(0.07, 0.18, 5), m: mat(Math.cos(a) * 0.28, 0.6, Math.sin(a) * 0.28), c: '#ffd23f' }); }
        parts.push({ g: new T.SphereGeometry(0.05, 6, 4), m: mat(0, 0.47, 0.3), c: '#ff3d5a' });
      } else if (kind === 'horns') {
        parts.push({ g: new T.ConeGeometry(0.09, 0.32, 8), m: mat(-0.3, 0.42, 0, 0, 0, 0.6), c: '#fff4d6' },
          { g: new T.ConeGeometry(0.09, 0.32, 8), m: mat(0.3, 0.42, 0, 0, 0, -0.6), c: '#fff4d6' });
      } else if (kind === 'halo') {
        parts.push({ g: new T.TorusGeometry(0.3, 0.045, 6, 22), m: mat(0, 0.72, 0, Math.PI / 2, 0, 0), c: '#fff36b' });
      }
      if (!parts.length) return null;
      return new T.Mesh(merge(parts), faceMat);
    }

    function makeMallet() {
      var g = new T.Group();
      var squash = new T.Group();
      var bodyMat = new T.MeshPhongMaterial({ color: 0x3fa9ff, shininess: 80, specular: 0x555555 });
      var knobMat = new T.MeshPhongMaterial({ color: 0x3fa9ff, shininess: 90, specular: 0x777777 });
      var b = new T.Mesh(malletBodyGeo, bodyMat);
      var head = new T.Group();
      head.position.y = KNOB_Y;
      head.rotation.order = 'YXZ';
      var knob = new T.Mesh(knobGeo, knobMat);
      var face = new T.Group();
      var whites = new T.Mesh(whitesGeo, faceMat), cheeks = new T.Mesh(cheekGeo, faceMat), pupils = new T.Mesh(pupilGeo, pupilMat);
      var smile = new T.Mesh(smileGeo, inkMat), oh = new T.Mesh(ohGeo, inkMat);
      smile.position.set(mouthPos[0], mouthPos[1] + 0.06, mouthPos[2]); smile.rotation.z = Math.PI;
      oh.position.set(mouthPos[0], mouthPos[1], mouthPos[2]); oh.visible = false;
      face.add(whites, cheeks, pupils, smile, oh);
      head.add(knob, face);
      squash.add(b, head);
      g.add(squash);
      var glow = new T.Mesh(new T.PlaneGeometry(3, 3).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ map: ringTex, transparent: true, depthWrite: false, blending: T.AdditiveBlending, color: 0x7dff6b }));
      glow.position.y = 0.01; glow.visible = false;
      g.add(glow);
      scene.add(g);
      return { g: g, squash: squash, head: head, face: face, whites: whites, pupils: pupils, smile: smile, oh: oh, bodyMat: bodyMat, knobMat: knobMat, acc: null, glow: glow,
        sq: 0, sqV: 0, mood: '', moodT: 0, blink: 2 + Math.random() * 2, look: null, x: 0, z: 0 };
    }
    var mallets = [makeMallet(), makeMallet()];
    view.setLook = function (side, look) {
      var m = mallets[side];
      if (m.look === look) return;
      m.look = look;
      m.bodyMat.color.set(look.dark);
      m.knobMat.color.set(look.color);
      if (m.acc) { m.face.remove(m.acc); m.acc.geometry.dispose(); m.acc = null; }
      var a = accessory(look.acc, look);
      if (a) { m.face.add(a); m.acc = a; }
    };
    view.mood = function (side, mood, t) { var m = mallets[side]; m.mood = mood; m.moodT = t || 1.2; };
    view.squash = function (side, power) { var m = mallets[side]; if (view.calm) return; m.sqV -= 6 + power * 10; };

    /* ------------------------------------------------------------- pucks */
    var TRAIL = 18;
    var puckGeo = new T.CylinderGeometry(0.24, 0.24, 0.08, 28);
    puckGeo.translate(0, 0.04, 0);
    var puckTopGeo = new T.CircleGeometry(0.2, 24).rotateX(-Math.PI / 2);
    puckTopGeo.translate(0, 0.082, 0);
    var trailIndex = [];
    for (var ti = 0; ti < TRAIL - 1; ti++) { var a0 = ti * 2; trailIndex.push(a0, a0 + 1, a0 + 2, a0 + 1, a0 + 3, a0 + 2); }
    function makePuck() {
      var g = new T.Group();
      var pm = new T.MeshPhongMaterial({ color: 0xf4fbff, shininess: 100, specular: 0x888888 });
      var body = new T.Mesh(puckGeo, pm);
      var topM = new T.MeshBasicMaterial({ map: ringTex, color: 0x5ff2ff, transparent: true });
      var cap = new T.Mesh(puckTopGeo, topM);
      var glow = new T.Mesh(new T.PlaneGeometry(1.3, 1.3).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: T.AdditiveBlending, color: 0x5ff2ff, opacity: 0.7 }));
      glow.position.y = 0.006;
      g.add(body, cap, glow);
      g.visible = false;
      scene.add(g);
      var tg = new T.BufferGeometry();
      var tpos = new Float32Array(TRAIL * 2 * 3), tcol = new Float32Array(TRAIL * 2 * 3);
      tg.setAttribute('position', new T.BufferAttribute(tpos, 3).setUsage(T.DynamicDrawUsage));
      tg.setAttribute('color', new T.BufferAttribute(tcol, 3).setUsage(T.DynamicDrawUsage));
      tg.setIndex(trailIndex);
      var trail = new T.Mesh(tg, new T.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide }));
      trail.frustumCulled = false; trail.visible = false;
      scene.add(trail);
      return { g: g, mat: pm, top: topM, glow: glow, trail: trail, hx: new Float32Array(TRAIL), hz: new Float32Array(TRAIL), n: 0, spin: 0, wasAlive: false, glowC: new T.Color(0x5ff2ff) };
    }
    var pucks = [makePuck(), makePuck(), makePuck()];
    var puckSkin = null;
    view.setPuck = function (skin) {
      puckSkin = skin;
      pucks.forEach(function (p) {
        p.mat.color.set(skin.color);
        if (skin.glow !== 'rainbow') { p.glowC.set(skin.glow); p.top.color.copy(p.glowC); p.glow.material.color.copy(p.glowC); }
      });
    };
    function updateTrail(p, alive, x, z, speed, t) {
      if (!alive) { p.n = 0; p.trail.visible = false; return; }
      // Shift history when the puck moved a little.
      var dx = x - p.hx[0], dz = z - p.hz[0];
      if (p.n === 0 || dx * dx + dz * dz > 0.0016) {
        for (var i = TRAIL - 1; i > 0; i--) { p.hx[i] = p.hx[i - 1]; p.hz[i] = p.hz[i - 1]; }
        p.n = Math.min(TRAIL, p.n + 1);
      }
      p.hx[0] = x; p.hz[0] = z;
      if (p.n < 3) { p.trail.visible = false; return; }
      var pos = p.trail.geometry.attributes.position.array, col = p.trail.geometry.attributes.color.array;
      var k = Math.min(1, speed / 1400), cr, cg, cb;
      for (var j = 0; j < TRAIL; j++) {
        var q = Math.min(j, p.n - 1), qa = Math.max(0, q - 1), qb = Math.min(p.n - 1, q + 1);
        var tx = p.hx[qa] - p.hx[qb], tz = p.hz[qa] - p.hz[qb], tl = Math.sqrt(tx * tx + tz * tz) || 1;
        var f = 1 - j / (TRAIL - 1), wdt = 0.2 * f + 0.02;
        var nx = -tz / tl * wdt, nz = tx / tl * wdt;
        var o = j * 6;
        pos[o] = p.hx[q] + nx; pos[o + 1] = 0.03; pos[o + 2] = p.hz[q] + nz;
        pos[o + 3] = p.hx[q] - nx; pos[o + 4] = 0.03; pos[o + 5] = p.hz[q] - nz;
        if (puckSkin && puckSkin.glow === 'rainbow') { C.setHSL((t * 0.6 + j * 0.05) % 1, 1, 0.55); cr = C.r; cg = C.g; cb = C.b; }
        else { cr = p.glowC.r; cg = p.glowC.g; cb = p.glowC.b; }
        var a = (j < p.n ? f * f : 0) * (0.25 + 0.75 * k);
        col[o] = col[o + 3] = cr * a; col[o + 1] = col[o + 4] = cg * a; col[o + 2] = col[o + 5] = cb * a;
      }
      p.trail.geometry.attributes.position.needsUpdate = true;
      p.trail.geometry.attributes.color.needsUpdate = true;
      p.trail.visible = true;
    }

    /* ---------------------------------------------------------- power-ups */
    var ITEM_COLORS = { multi: '#ffd23f', big: '#3ee39a', mini: '#5fb8ff' };
    function iconTex(kind) {
      return canvasTex(128, 128, function (g) {
        g.fillStyle = ITEM_COLORS[kind]; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill();
        g.lineWidth = 8; g.strokeStyle = '#ffffff'; g.beginPath(); g.arc(64, 64, 54, 0, 7); g.stroke();
        g.fillStyle = '#ffffff'; g.strokeStyle = '#1a1430'; g.lineWidth = 5;
        function disc(x, y, r) { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.stroke(); }
        if (kind === 'multi') { disc(44, 76, 16); disc(84, 76, 16); disc(64, 44, 16); }
        else if (kind === 'big') {
          disc(64, 64, 26);
          g.beginPath(); [[20, 20, 36, 22, 22, 36], [108, 20, 92, 22, 106, 36], [20, 108, 22, 92, 36, 106], [108, 108, 106, 92, 92, 106]].forEach(function (a) { g.moveTo(a[0], a[1]); g.lineTo(a[2], a[3]); g.lineTo(a[4], a[5]); g.closePath(); });
          g.fill(); g.stroke();
        } else {
          g.fillRect(30, 40, 68, 12); g.strokeRect(30, 40, 68, 12);
          g.beginPath(); g.moveTo(64, 112); g.lineTo(40, 92); g.lineTo(40, 64); g.lineTo(88, 64); g.lineTo(88, 92); g.closePath(); g.fill(); g.stroke();
        }
      });
    }
    var tokenBaseGeo = new T.CylinderGeometry(0.32, 0.34, 0.12, 24);
    var tokenTopGeo = new T.CircleGeometry(0.3, 24).rotateX(-Math.PI / 2);
    tokenTopGeo.translate(0, 0.062, 0);
    var tokens = {};
    ['multi', 'big', 'mini'].forEach(function (kind) {
      var g = new T.Group();
      var base = new T.Mesh(tokenBaseGeo, new T.MeshPhongMaterial({ color: ITEM_COLORS[kind], shininess: 80 }));
      var face = new T.Mesh(tokenTopGeo, new T.MeshBasicMaterial({ map: iconTex(kind) }));
      var spin = new T.Group();
      spin.add(base, face);
      spin.rotation.x = 0.5;
      var ring = new T.Mesh(new T.PlaneGeometry(1.6, 1.6).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ map: ringTex, transparent: true, depthWrite: false, blending: T.AdditiveBlending, color: ITEM_COLORS[kind] }));
      ring.position.y = 0.01;
      g.add(spin, ring);
      g.visible = false;
      scene.add(g);
      tokens[kind] = { g: g, spin: spin, ring: ring, s: 0 };
    });

    /* ---------------------------------------------------------- particles */
    function makePoints(n, additive) {
      var geo = new T.BufferGeometry();
      var pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), alpha = new Float32Array(n), shape = new Float32Array(n);
      geo.setAttribute('position', new T.BufferAttribute(pos, 3).setUsage(T.DynamicDrawUsage));
      geo.setAttribute('aColor', new T.BufferAttribute(col, 3).setUsage(T.DynamicDrawUsage));
      geo.setAttribute('aSize', new T.BufferAttribute(size, 1).setUsage(T.DynamicDrawUsage));
      geo.setAttribute('aAlpha', new T.BufferAttribute(alpha, 1).setUsage(T.DynamicDrawUsage));
      geo.setAttribute('aShape', new T.BufferAttribute(shape, 1).setUsage(T.DynamicDrawUsage));
      var matl = new T.ShaderMaterial({
        uniforms: { uScale: { value: 400 } },
        vertexShader: 'attribute vec3 aColor;attribute float aSize;attribute float aAlpha;attribute float aShape;varying vec3 vC;varying float vA;varying float vS;uniform float uScale;' +
          'void main(){vC=aColor;vA=aAlpha;vS=aShape;vec4 mv=modelViewMatrix*vec4(position,1.0);gl_PointSize=aSize*uScale/max(0.1,-mv.z);gl_Position=projectionMatrix*mv;}',
        fragmentShader: 'varying vec3 vC;varying float vA;varying float vS;' +
          'void main(){vec2 p=gl_PointCoord-0.5;float a=vS>0.5?step(max(abs(p.x),abs(p.y)*1.6),0.45):smoothstep(0.5,0.1,length(p));a*=vA;if(a<0.02)discard;gl_FragColor=vec4(vC,a);}',
        transparent: true, depthWrite: false, blending: additive ? T.AdditiveBlending : T.NormalBlending
      });
      var pts = new T.Points(geo, matl);
      pts.frustumCulled = false;
      scene.add(pts);
      return { pts: pts, n: n, next: 0, pos: pos, col: col, size: size, alpha: alpha, shape: shape, vel: new Float32Array(n * 3), life: new Float32Array(n), max: new Float32Array(n), grav: new Float32Array(n), base: new Float32Array(n), spin: new Float32Array(n), live: 0 };
    }
    var sparks = makePoints(soft ? 140 : 300, true), confetti = makePoints(soft ? 90 : 180, false);
    function emitP(P, x, y, z, vx, vy, vz, life, size, color, grav, shape) {
      var i = P.next; P.next = (P.next + 1) % P.n;
      P.pos[i * 3] = x; P.pos[i * 3 + 1] = y; P.pos[i * 3 + 2] = z;
      P.vel[i * 3] = vx; P.vel[i * 3 + 1] = vy; P.vel[i * 3 + 2] = vz;
      P.life[i] = P.max[i] = life; P.base[i] = size; P.grav[i] = grav; P.shape[i] = shape || 0; P.spin[i] = Math.random() * 6;
      C.set(color); P.col[i * 3] = C.r; P.col[i * 3 + 1] = C.g; P.col[i * 3 + 2] = C.b;
      P.live = P.n;
    }
    function stepP(P, dt, flutter) {
      if (!P.live) return;
      var any = 0;
      for (var i = 0; i < P.n; i++) {
        if (P.life[i] <= 0) { P.alpha[i] = 0; continue; }
        any++;
        P.life[i] -= dt;
        var o = i * 3;
        P.vel[o + 1] -= P.grav[i] * dt;
        if (flutter) { P.vel[o] *= 0.985; P.vel[o + 2] *= 0.985; P.vel[o + 1] = Math.max(P.vel[o + 1], -1.6); P.spin[i] += dt * 7; }
        else { P.vel[o] *= 0.96; P.vel[o + 2] *= 0.96; }
        P.pos[o] += P.vel[o] * dt + (flutter ? Math.sin(P.spin[i]) * 0.01 : 0);
        P.pos[o + 1] += P.vel[o + 1] * dt;
        P.pos[o + 2] += P.vel[o + 2] * dt;
        if (P.pos[o + 1] < 0.02 && !flutter) { P.pos[o + 1] = 0.02; P.vel[o + 1] *= -0.4; }
        var f = Math.max(0, P.life[i] / P.max[i]);
        P.alpha[i] = flutter ? Math.min(1, f * 3) : f;
        P.size[i] = P.base[i] * (flutter ? (0.6 + 0.4 * Math.abs(Math.sin(P.spin[i]))) : (0.4 + 0.6 * f));
      }
      if (!any) P.live = 0;
      var A = P.pts.geometry.attributes;
      A.position.needsUpdate = A.aColor.needsUpdate = A.aSize.needsUpdate = A.aAlpha.needsUpdate = A.aShape.needsUpdate = true;
    }
    function clearP(P) { for (var i = 0; i < P.n; i++) { P.life[i] = 0; P.alpha[i] = 0; } P.live = 1; }

    /* ----------------------------------------------------- shock rings */
    var rings = [];
    for (var ri = 0; ri < 3; ri++) {
      var rm = new T.Mesh(new T.RingGeometry(0.82, 1, 40).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
      rm.position.y = 0.02; rm.visible = false;
      scene.add(rm);
      rings.push({ m: rm, t: 0, max: 0.5, s: 1 });
    }
    var ringNext = 0;
    function ring(x, z, size, color, life) {
      var r = rings[ringNext]; ringNext = (ringNext + 1) % rings.length;
      r.m.position.x = x; r.m.position.z = z; r.m.material.color.set(color); r.t = r.max = life || 0.45; r.s = size; r.m.visible = true;
    }

    /* ------------------------------------------------------------ effects */
    var shake = 0, kick = 0;
    view.fx = {
      hit: function (x, y, power, color) {
        var X = x * K, Z = y * K, n = Math.round(4 + power * 14);
        if (!view.calm) for (var i = 0; i < n; i++) {
          var a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 3 * (0.4 + power);
          emitP(sparks, X, 0.1, Z, Math.cos(a) * s, 1 + Math.random() * 2.5, Math.sin(a) * s, 0.25 + Math.random() * 0.3, 0.09 + power * 0.06, color, 9);
        }
        ring(X, Z, 0.5 + power * 0.7, color, 0.3);
        if (power > 0.55) { shake = Math.max(shake, power * 0.12); kick = Math.max(kick, power * 0.25); }
      },
      wall: function (x, y, power, color) {
        if (view.calm) return;
        var X = x * K, Z = y * K;
        for (var i = 0; i < 3 + power * 6; i++) emitP(sparks, X, 0.12, Z, (Math.random() - 0.5) * 2, 0.5 + Math.random() * 1.5, (Math.random() - 0.5) * 2, 0.2 + Math.random() * 0.2, 0.07, color, 6);
      },
      goal: function (side, x, color, big) {
        // side: the goal that was scored into (0 bottom, 1 top).
        var sz = side === 0 ? 1 : -1, X = x * K, Z = sz * HL;
        goals[side].flash = 1;
        ring(X, Z, big ? 4 : 2.6, color, 0.7);
        ring(X, Z, big ? 2.2 : 1.4, '#ffffff', 0.45);
        if (!view.calm) {
          var n = big ? 90 : 55;
          for (var i = 0; i < n; i++) {
            var a = Math.random() * Math.PI, s = 2 + Math.random() * 6;
            emitP(sparks, X + (Math.random() - 0.5) * GH, 0.15, Z, Math.cos(a) * s, 2 + Math.random() * 5, -sz * Math.sin(a) * s * 0.8, 0.5 + Math.random() * 0.6, 0.14 + Math.random() * 0.1, i % 3 ? color : '#ffffff', 7);
          }
          shake = Math.max(shake, big ? 0.35 : 0.22); kick = Math.max(kick, 0.6);
        }
      },
      power: function (x, y, kind) {
        var X = x * K, Z = y * K, color = ITEM_COLORS[kind];
        ring(X, Z, 2, color, 0.5);
        if (!view.calm) for (var i = 0; i < 30; i++) { var a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 3; emitP(sparks, X, 0.2, Z, Math.cos(a) * s, 2 + Math.random() * 3, Math.sin(a) * s, 0.5 + Math.random() * 0.4, 0.13, i % 2 ? color : '#ffffff', 6); }
      },
      confetti: function (colors) {
        if (view.calm) return;
        for (var i = 0; i < confetti.n; i++) {
          emitP(confetti, (Math.random() - 0.5) * 9, 3 + Math.random() * 4, (Math.random() - 0.5) * 8 + 1, (Math.random() - 0.5) * 2, -Math.random(), (Math.random() - 0.5) * 2,
            3 + Math.random() * 2.5, 0.2 + Math.random() * 0.12, colors[i % colors.length], 1.2, 1);
        }
      },
      clear: function () { clearP(sparks); clearP(confetti); rings.forEach(function (r) { r.t = 0; r.m.visible = false; }); shake = kick = 0; }
    };

    /* ------------------------------------------------------------ camera */
    var camPos = new T.Vector3(0, 6, 10), camLook = new T.Vector3(0, 0, 0), wantPos = new T.Vector3(), wantLook = new T.Vector3();
    var firstCam = true;
    var lookTmp = new T.Vector3();

    /* ------------------------------------------------------------ update */
    // o: { w: world, mode: 'title'|'play'|'result'|'skins', duo, t, dt, slow }
    view.update = function (o) {
      var w = o.w, dt = o.dt, t = o.t, i;
      var main = null;
      if (w) for (i = 0; i < w.pucks.length; i++) if (w.pucks[i].alive) { main = w.pucks[i]; break; }
      // Camera targets.
      if (o.mode === 'title') {
        var a = Math.sin(t * 0.13) * 0.45;
        wantPos.set(Math.sin(a) * 11.8, 7.2, Math.cos(a) * 11.8); wantLook.set(0, 0.35, -0.35);
      } else if (o.mode === 'skins') {
        wantPos.set(-1.4, 2.4, HL + 3.6); wantLook.set(-0.9, 0.5, HL - 1.3);
      } else if (o.duo) {
        wantPos.set(0, 10.6, 6.8); wantLook.set(0, 0, 0.25);
      } else {
        var px = main ? main.x * K : 0, pz = main ? main.y * K : 0;
        wantPos.set(px * 0.08, 8.8, HL + 6.1 + pz * 0.03); wantLook.set(px * 0.1, 0, 0.25 + pz * 0.04);
      }
      var kk = firstCam ? 1 : 1 - Math.exp(-dt * (o.mode === 'play' ? 4 : 2));
      camPos.lerp(wantPos, kk); camLook.lerp(wantLook, kk);
      firstCam = false;
      camera.position.copy(camPos);
      camera.lookAt(camLook);
      pickCam.position.copy(camera.position); pickCam.quaternion.copy(camera.quaternion);
      pickCam.updateMatrixWorld();
      if (!view.calm && (shake > 0 || kick > 0)) {
        camera.position.x += (Math.random() - 0.5) * shake;
        camera.position.y += (Math.random() - 0.5) * shake;
        V.subVectors(camLook, camPos).normalize().multiplyScalar(kick * 0.6);
        camera.position.add(V);
      }
      shake = Math.max(0, shake - dt * 0.9); kick = Math.max(0, kick - dt * 2.5);

      // Mallets.
      for (var s = 0; s < 2; s++) {
        var m = mallets[s], wm = w ? w.mallets[s] : null;
        m.g.visible = !!wm;
        if (!wm) continue;
        m.x = wm.x * K; m.z = wm.y * K;
        var sc = wm.r * K * 1.0;
        m.g.position.set(m.x, 0, m.z);
        m.g.scale.set(sc, sc, sc);
        // Squash spring.
        m.sqV += (-m.sq * 160 - m.sqV * 14) * dt; m.sq += m.sqV * dt;
        m.sq = Math.max(-0.45, Math.min(0.45, m.sq));
        var bob = view.calm ? 0 : Math.sin(t * 3 + s * 2) * 0.03;
        m.squash.scale.set(1 - m.sq * 0.5, 1 + m.sq + bob, 1 - m.sq * 0.5);
        // Face: turn toward the camera, eyes follow the main puck.
        var yaw = Math.atan2(camPos.x - m.x, camPos.z - m.z);
        m.head.rotation.y = yaw;
        m.head.rotation.x = -0.32;
        if (main) {
          lookTmp.set(main.x * K - m.x, 0, main.y * K - m.z);
          lookTmp.applyAxisAngle(V2.set(0, 1, 0), -yaw);
          var ll = lookTmp.length() || 1;
          m.pupils.position.set(lookTmp.x / ll * 0.06, -lookTmp.z / ll * 0.035, 0);
        }
        m.moodT -= dt; m.blink -= dt;
        var mood = m.moodT > 0 ? m.mood : '';
        var blinkK = m.blink < 0 ? (m.blink < -0.12 ? (m.blink = 2 + Math.random() * 3, 1) : 0.15) : 1;
        m.whites.scale.y = m.pupils.scale.y = mood === 'happy' ? 0.35 : blinkK;
        m.oh.visible = mood === 'o';
        m.smile.visible = !m.oh.visible;
        m.smile.rotation.z = mood === 'sad' ? 0 : Math.PI;
        m.smile.position.y = mouthPos[1] + (mood === 'sad' ? -0.04 : 0.06);
        m.glow.visible = wm.bigT > 0;
        if (m.glow.visible) { var gp = 1 + Math.sin(t * 10) * 0.08; m.glow.scale.set(gp, 1, gp); m.glow.material.opacity = wm.bigT < 2 ? 0.5 + 0.5 * Math.sin(t * 20) : 1; }
        setShadow(s, m.x + 0.06, m.z + 0.08, sc * 2.6);
      }
      // Pucks.
      var lightOn = false;
      for (i = 0; i < 3; i++) {
        var p = pucks[i], wp = w ? w.pucks[i] : null, alive = !!(wp && wp.alive);
        if (alive && !p.wasAlive) p.n = 0;
        p.wasAlive = alive;
        p.g.visible = alive;
        if (!alive) { updateTrail(p, false); setShadow(2 + i, 0, 0, 0.0001); continue; }
        var X = wp.x * K, Z = wp.y * K, speed = Math.sqrt(wp.vx * wp.vx + wp.vy * wp.vy);
        var drop = Math.abs(wp.y) > E.HL ? -Math.min(0.3, (Math.abs(wp.y) - E.HL) * K * 1.6) : 0;
        p.g.position.set(X, drop, Z);
        p.spin += dt * (1 + speed * 0.004);
        p.g.rotation.y = p.spin;
        if (puckSkin && puckSkin.glow === 'rainbow') { p.glowC.setHSL((t * 0.5) % 1, 1, 0.6); p.top.color.copy(p.glowC); p.glow.material.color.copy(p.glowC); }
        p.glow.material.opacity = 0.45 + Math.min(0.5, speed / 2400);
        updateTrail(p, true, X, Z, speed, t);
        setShadow(2 + i, X + 0.05, Z + 0.06, 0.8);
        if (!lightOn) { puckLight.position.set(X, 0.5, Z); puckLight.color.copy(p.glowC); lightOn = true; }
      }
      puckLight.intensity = lightOn ? 5 : 0;
      shadows.instanceMatrix.needsUpdate = true;
      // Goals: lamps flash; mini-goal blockers.
      for (i = 0; i < 2; i++) {
        var gg = goals[i];
        gg.flash = Math.max(0, gg.flash - dt * 1.2);
        var fl = view.calm ? Math.min(gg.flash, 0.6) : gg.flash * (0.6 + 0.4 * Math.sin(t * 30));
        gg.lampMat.color.copy(gg.base).lerp(C.set(0xffffff), fl);
        var half = w ? w.goals[i].half : E.GOAL_HALF, gap = (E.GOAL_HALF - half) * K;
        var on = gap > 0.01;
        gg.bl.visible = gg.br.visible = on;
        if (on) {
          gg.bl.scale.x = gg.br.scale.x = gap;
          gg.bl.position.x = -(half * K + gap / 2); gg.br.position.x = half * K + gap / 2;
          gg.blockMat.emissiveIntensity = w.goals[i].miniT < 2 ? 0.3 + 0.5 * Math.abs(Math.sin(t * 8)) : 0.6;
        }
      }
      // Power-up token.
      for (var kind in tokens) {
        var tk = tokens[kind], show = !!(w && w.item.alive && w.item.kind === kind);
        tk.s += ((show ? 1 : 0) - tk.s) * Math.min(1, dt * 10);
        tk.g.visible = tk.s > 0.02;
        if (!tk.g.visible) continue;
        if (show) tk.g.position.set(w.item.x * K, 0, w.item.y * K);
        var blinkOut = show && w.item.t > E.ITEM_LIFE - 2 && Math.sin(t * 22) < 0;
        tk.spin.position.y = 0.32 + (view.calm ? 0 : Math.sin(t * 4) * 0.08);
        tk.spin.rotation.y = view.calm ? 0 : t * 2.4;
        var ts = tk.s * (blinkOut ? 0.85 : 1);
        tk.g.scale.set(ts, ts, ts);
        var rp = 0.85 + 0.15 * Math.sin(t * 6);
        tk.ring.scale.set(rp, 1, rp);
      }
      // Effects.
      stepP(sparks, dt, false);
      stepP(confetti, dt, true);
      for (i = 0; i < rings.length; i++) {
        var r = rings[i];
        if (r.t <= 0) { r.m.visible = false; continue; }
        r.t -= dt;
        var f = 1 - Math.max(0, r.t) / r.max, rs = 0.2 + f * r.s;
        r.m.scale.set(rs, 1, rs);
        r.m.material.opacity = 1 - f;
      }
    };

    view.render = function () { renderer.render(scene, camera); };
    view.compile = function () {
      // Show everything once so every shader is compiled with the first frame.
      var hidden = [];
      scene.traverse(function (ob) { if (!ob.visible) { hidden.push(ob); ob.visible = true; } });
      renderer.compile(scene, camera);
      hidden.forEach(function (ob) { ob.visible = false; });
    };
    view.resize = function (w, h) {
      renderer.setSize(Math.max(1, w), Math.max(1, h), false);
      camera.aspect = pickCam.aspect = Math.max(1, w) / Math.max(1, h);
      camera.updateProjectionMatrix(); pickCam.updateProjectionMatrix();
      var px = Math.max(1, h) * ratio / (2 * Math.tan(camera.fov * Math.PI / 360));
      sparks.pts.material.uniforms.uScale.value = px; confetti.pts.material.uniforms.uScale.value = px;
    };
    // Where a table point (engine units, height in metres) appears on the 1280x720 stage.
    view.project = function (x, y, h, out) {
      V.set(x * K, h || 0, y * K).project(camera);
      out = out || {};
      out.x = (V.x + 1) / 2 * 1280; out.y = (1 - V.y) / 2 * 720;
      return out;
    };
    // The table point (engine units) under a stage point, or null above the horizon.
    view.pick = function (sx, sy, out) {
      V.set(sx / 1280 * 2 - 1, 1 - sy / 720 * 2, 0.5).unproject(pickCam);
      V.sub(pickCam.position).normalize();
      if (V.y > -0.02) return null;
      var d = -pickCam.position.y / V.y;
      out = out || {};
      out.x = (pickCam.position.x + V.x * d) / K; out.y = (pickCam.position.z + V.z * d) / K;
      return out;
    };
    var slow = 0;
    view.frameTime = function (ms) {
      if (ms > 45) slow++; else slow = Math.max(0, slow - 0.5);
      if (slow > 120 && ratio > 0.85) { ratio = Math.max(0.85, ratio - 0.1); renderer.setPixelRatio(ratio); slow = 0; return true; }
      return false;
    };
    view.info = function () { return renderer.info.render; };
    view.ratio = function () { return ratio; };
    view.snapCamera = function () { firstCam = true; };
    return view;
  };

  window.AHScene = AHScene;
})();
