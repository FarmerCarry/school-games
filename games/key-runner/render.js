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
    var choco = new T.Mesh(bodyGeo, lambert(0x6a3418));
    choco.scale.set(180, 2.4, 240);
    choco.position.set(0, -3.7, 30);
    scene.add(choco);
    var sheen = new T.Mesh(bodyGeo, lambert(0xffe7c8, { transparent: true, opacity: 0.42, depthWrite: false }));
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
      var mat = lambert(color, { transparent: true });
      var skin = lambert(0xfff3df, { transparent: true });
      var body = new T.Mesh(new T.CapsuleGeometry(0.34, 0.42, 3, 8), mat);
      body.position.y = 0.58;
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
      face.position.set(0, 0.86, 0.02);
      face.scale.set(0.62, 0.62, 1);
      var handL = new T.Mesh(sphereGeo, skin);
      var handR = new T.Mesh(sphereGeo, skin);
      handL.scale.set(0.13, 0.13, 0.13);
      handR.scale.set(0.13, 0.13, 0.13);
      handL.position.set(-0.42, 0.52, 0.06);
      handR.position.set(0.42, 0.52, 0.06);
      var footL = new T.Mesh(sphereGeo, mat);
      var footR = new T.Mesh(sphereGeo, mat);
      footL.scale.set(0.16, 0.1, 0.22);
      footR.scale.set(0.16, 0.1, 0.22);
      var hat = new T.Group();
      group.add(body, face, handL, handR, footL, footR, hat);
      group.userData = { mat: mat, skin: skin, face: face, handL: handL, handR: handR, footL: footL, footR: footR, hat: hat, hatId: -1 };
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
      if (p.hw > 5) return 0xffd0b0;
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
      function pressed(id) {
        for (var s = 0; s < state.players.length; s++) {
          var pl = state.players[s];
          if (pl && pl.onGround && pl.ground === id) return 0.075;
        }
        return 0;
      }
      for (var i = 0; i < pieces.length && nb < MAX - 2; i++) {
        var p = pieces[i];
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
        var skirt = wide ? 0.22 : Math.max(0.1, p.hh * (dip ? 0.72 : 1.45));
        var bulge = wide ? 1 : (dip ? 1.22 : 1 + glow * 0.1);
        var lit = dip || glow > 0.02;
        var bodyCol = lit ? mix(shade(col, 0.68), 0xffffff, dip ? 0.42 : glow * 0.55) : shade(col, wide ? 0.9 : 0.68);
        var topCol = lit ? mix(shade(col, 1.18), 0xffffff, dip ? 0.62 : glow * 0.8) : shade(col, 1.18);
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
        letter.position.set(item.p.x, item.y + 0.04, item.p.z);
        letter.scale.set(Math.min(1.25, item.p.hw * 1.55), Math.min(1.25, item.p.hd * 1.55), 1);
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
      var candyN = low ? 6 : 14;
      for (var si = 0; si < candyN && nstick < MAX - 4 && ns < MAX - 4; si++) {
        var side = si % 2 ? 1 : -1;
        var sz = anchorZ + 8 + (si % 5) * 5.2;
        var sx = anchorX + side * (8.2 + (si % 3));
        if (si % 4 === 0) {
          put(sticks, nstick++, sx, 1.15, sz, 0.1, 2.2, 0.1, 0xfff1c9);
          put(balls, ns++, sx, 2.35, sz, 0.46, 0.46, 0.46, CANDY[si % CANDY.length]);
        } else put(sprinkles, spr++, sx, 0.45 + (si % 3) * 0.7, sz, 0.16, 0.06, 0.4, CANDY[si % CANDY.length], si * 0.7);
      }
      sprinkles.count = spr;
      balls.count = ns;
      sticks.count = nstick;
      sprinkles.instanceMatrix.needsUpdate = balls.instanceMatrix.needsUpdate = sticks.instanceMatrix.needsUpdate = true;
      if (sprinkles.instanceColor) sprinkles.instanceColor.needsUpdate = true;
      if (balls.instanceColor) balls.instanceColor.needsUpdate = true;
      if (sticks.instanceColor) sticks.instanceColor.needsUpdate = true;
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
        if (buddyMesh.group.userData.hatId !== hatId && !(two && pi > 0)) {
          hatMesh(hatId, buddyMesh.group.userData.hat);
          buddyMesh.group.userData.hatId = hatId;
        }
        var stretch = reduced ? 1 : (pl.onGround ? pl.squash : pl.stretch);
        var moving = Math.hypot(pl.vx, pl.vz) > 0.8;
        var bob = moving ? Math.abs(Math.sin(state.time * 14 + pi)) * 0.1 : Math.sin(state.time * 2 + pi) * 0.03;
        buddyMesh.group.position.set(pl.x, pl.y + bob, pl.z);
        buddyMesh.group.scale.set(1 / stretch, stretch, 1 / stretch);
        buddyMesh.group.rotation.y = pl.face;
        var step = moving ? Math.sin(state.time * 14 + pi) : 0;
        var ud = buddyMesh.group.userData;
        ud.footL.position.set(-0.18, 0.05, step * 0.28);
        ud.footR.position.set(0.18, 0.05, -step * 0.28);
        ud.handL.position.set(-0.42, 0.5 + Math.abs(step) * 0.06, -step * 0.2);
        ud.handR.position.set(0.42, 0.5 + Math.abs(step) * 0.06, step * 0.2);
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
        var fast = !reduced && !low && plEye && KR.topSpeed(plEye.speed) > 10;
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
        camera.fov = 60 + (fast ? Math.min(8, (KR.topSpeed(plEye.speed) - 10) * 0.85) : 0) + kick;
        camera.updateProjectionMatrix();
        camera.position.set(pose.x, pose.y, pose.z);
        if (!reduced && opts.shake > 0) {
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

    return {
      render: render,
      burst: burst,
      dust: dust,
      pressKey: pressKey,
      rebuildText: function () { letterMat = {}; gateLabel = {}; },
      setPixelRatio: function (dpr) { renderer.setPixelRatio(dpr); renderer.setSize(1280, 720, false); },
      dispose: function () {
        disposed = true;
        renderer.dispose();
      }
    };
  };
})(window.KeyRunner = window.KeyRunner || {});
