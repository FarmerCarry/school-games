/* سلّة الفواكه (Juicy Drop): the three.js picture. A sunny kitchen counter, a glass jar,
 * shiny squishy fruit with faces, the little cloud that carries the next fruit, the fruit
 * chain on the wall and juice splashes. No rules here: game.js hands it the engine's world
 * every frame. Draw calls stay low whatever the number of fruit: every fruit kind is one
 * InstancedMesh, faces and leaves are a few more, the static kitchen is merged. */
(function () {
  'use strict';
  var E = window.JDEngine, F = E.FRUITS, HALF = E.JW / 2, DEPTH = 4.6, ZS = 0.9;
  var JDArt = window.JDArt = {};

  // Jar skins: back tint, rim colours (left to right), bow, wall and counter.
  var SKINS = [
    { back: 0xbfe8ff, rim: [0xffffff], bow: 0xff6b8a, wall: 0xfff1cf, tile: 0xffe2a8, wood: 0xe8a868 },
    { back: 0xffc6e0, rim: [0xff8fc4], bow: 0xff4fa0, wall: 0xffe4f0, tile: 0xffc9e2, wood: 0xf0b088 },
    { back: 0xffe39a, rim: [0xffc23d], bow: 0xff9a1c, wall: 0xfff0c4, tile: 0xffdc8a, wood: 0xd9965a },
    { back: 0xd8ccff, rim: [0xff5d73, 0xffa53d, 0xffe14d, 0x5fd46a, 0x4fb4ff, 0xa36bff], bow: 0xffffff, wall: 0xe9f4ff, tile: 0xcfe6ff, wood: 0xe8a868 }
  ];
  JDArt.SKINS = SKINS;

  // A quick look at the graphics before the real renderer: software WebGL (no graphics card)
  // draws fewer pixels without MSAA and paces the menus (docs/PERFORMANCE.md).
  JDArt.probe = function () { return Kit.webgl.probe(); };

  // A tiny seeded random for texture speckles (the same picture on every PC).
  var seed = 7;
  function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }

  /* ------------------------------------------------------------ textures */
  function canvas2d(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function grad(g, w, h, top, mid, bot) {
    var gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, top); gr.addColorStop(0.5, mid); gr.addColorStop(1, bot);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }
  function dots(g, w, h, n, color, rmin, rmax, y0, y1) {
    g.fillStyle = color;
    for (var i = 0; i < n; i++) {
      var x = rnd() * w, y = y0 + rnd() * (y1 - y0), r = rmin + rnd() * (rmax - rmin);
      g.beginPath(); g.ellipse(x, y, r, r * 0.8, 0, 0, Math.PI * 2); g.fill();
      if (x < r * 2) { g.beginPath(); g.ellipse(x + w, y, r, r * 0.8, 0, 0, Math.PI * 2); g.fill(); }
    }
  }
  var PATTERN = [
    function (g, w, h) { grad(g, w, h, '#9cbcff', '#4f7dff', '#2c47b8'); dots(g, w, h, 60, 'rgba(255,255,255,0.13)', 3, 9, 10, h - 10); },
    function (g, w, h) { grad(g, w, h, '#ff7d90', '#e8203a', '#a10b24'); },
    function (g, w, h) {
      grad(g, w, h, '#ff9aa8', '#ff4f6d', '#d42446');
      g.fillStyle = '#ffe8a0';
      for (var row = 0; row < 9; row++) for (var k = 0; k < 16; k++) {
        var x = (k + (row % 2) * 0.5) * w / 16, y = 18 + row * 12;
        g.beginPath(); g.ellipse(x, y, 2.6, 3.8, 0, 0, Math.PI * 2); g.fill();
      }
    },
    function (g, w, h) { grad(g, w, h, '#d2afff', '#a35cff', '#6a28cf'); dots(g, w, h, 40, 'rgba(255,255,255,0.12)', 4, 10, 8, h - 8); },
    function (g, w, h) { grad(g, w, h, '#fff6b0', '#ffe04a', '#f0b92a'); dots(g, w, h, 160, 'rgba(214,160,20,0.25)', 1, 2.2, 4, h - 4); },
    function (g, w, h) { grad(g, w, h, '#ffc879', '#ff9a1c', '#e06c08'); dots(g, w, h, 220, 'rgba(190,80,0,0.22)', 1, 2.4, 4, h - 4); },
    function (g, w, h) {
      grad(g, w, h, '#c6f59a', '#6fd447', '#3d9a2a');
      g.strokeStyle = 'rgba(255,255,200,0.22)'; g.lineWidth = 3;
      for (var i = 0; i < 18; i++) { var x = rnd() * w; g.beginPath(); g.moveTo(x, 10); g.quadraticCurveTo(x + 6, h / 2, x - 2, h - 10); g.stroke(); }
      dots(g, w, h, 70, 'rgba(255,255,190,0.35)', 1, 2, 10, h - 10);
    },
    function (g, w, h) {
      grad(g, w, h, '#ffd9c8', '#ffa48c', '#ff7564');
      var gr = g.createRadialGradient(w * 0.62, h * 0.45, 4, w * 0.62, h * 0.45, 60);
      gr.addColorStop(0, 'rgba(255,70,90,0.55)'); gr.addColorStop(1, 'rgba(255,70,90,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(200,70,60,0.45)'; g.lineWidth = 4;
      g.beginPath(); g.moveTo(w * 0.5, 6); g.quadraticCurveTo(w * 0.53, h / 2, w * 0.5, h - 6); g.stroke();
    },
    function (g, w, h) {
      grad(g, w, h, '#ffe07e', '#ffc43a', '#d98c12');
      g.strokeStyle = 'rgba(170,96,10,0.75)'; g.lineWidth = 3;
      for (var i = -8; i < 24; i++) {
        g.beginPath(); g.moveTo(i * 16, 0); g.lineTo(i * 16 + h, h); g.stroke();
        g.beginPath(); g.moveTo(i * 16, h); g.lineTo(i * 16 + h, 0); g.stroke();
      }
      g.fillStyle = 'rgba(120,70,10,0.55)';
      for (var r = 0; r < 12; r++) for (var k = 0; k < 16; k++) { g.beginPath(); g.arc(k * 16 + (r % 2) * 8, r * 8 + 4, 1.6, 0, Math.PI * 2); g.fill(); }
    },
    function (g, w, h) {
      grad(g, w, h, '#ecffbd', '#c5ec7a', '#8dbd44');
      g.strokeStyle = 'rgba(250,255,225,0.85)'; g.lineWidth = 2.2;
      for (var i = 0; i < 70; i++) {
        var x = rnd() * w, y = 8 + rnd() * (h - 16);
        g.beginPath(); g.moveTo(x, y);
        for (var k = 0; k < 4; k++) { x += (rnd() - 0.5) * 22; y += (rnd() - 0.5) * 16; g.lineTo(x, y); }
        g.stroke();
      }
    },
    function (g, w, h) {
      grad(g, w, h, '#5fe07a', '#2fbf4a', '#1d8a34');
      g.fillStyle = '#14652a';
      for (var s = 0; s < 9; s++) {
        var x0 = s * w / 9;
        g.beginPath(); g.moveTo(x0, 0);
        for (var y = 0; y <= h; y += 8) g.lineTo(x0 + Math.sin(y * 0.22 + s) * 4 - 5, y);
        for (var y2 = h; y2 >= 0; y2 -= 8) g.lineTo(x0 + Math.sin(y2 * 0.22 + s + 1) * 4 + 6, y2);
        g.closePath(); g.fill();
      }
    }
  ];
  // Faces live on a cap of the sphere; xy on the cap map to the texture (see capGeometry).
  var CAP = 0.8;
  function faceTexture(T, kind) {
    var c = canvas2d(256, 256), g = c.getContext('2d'), k = 256 / (2 * CAP);
    function px(x) { return 128 + x * k; }
    function py(y) { return 128 - y * k; }
    var ink = '#2a1838';
    g.fillStyle = 'rgba(255,110,140,0.5)';
    [-1, 1].forEach(function (s) { g.beginPath(); g.ellipse(px(s * 0.47), py(-0.08), 0.12 * k, 0.075 * k, 0, 0, Math.PI * 2); g.fill(); });
    if (kind === 1) {
      g.strokeStyle = ink; g.lineWidth = 0.05 * k; g.lineCap = 'round';
      [-1, 1].forEach(function (s) { g.beginPath(); g.arc(px(s * 0.27), py(0.06), 0.09 * k, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); });
    } else {
      var big = kind === 2 ? 1.18 : 1;
      [-1, 1].forEach(function (s) {
        g.fillStyle = ink;
        g.beginPath(); g.ellipse(px(s * 0.27), py(0.1), 0.105 * k * big, 0.13 * k * big, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#ffffff';
        g.beginPath(); g.arc(px(s * 0.27 - 0.035), py(0.15), 0.042 * k * big, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.arc(px(s * 0.27 + 0.04), py(0.05), 0.02 * k * big, 0, Math.PI * 2); g.fill();
      });
    }
    g.lineCap = 'round';
    if (kind === 2) {
      g.fillStyle = ink;
      g.beginPath(); g.ellipse(px(0), py(-0.17), 0.07 * k, 0.085 * k, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ff6f8a';
      g.beginPath(); g.ellipse(px(0), py(-0.2), 0.045 * k, 0.04 * k, 0, 0, Math.PI * 2); g.fill();
    } else {
      g.strokeStyle = ink; g.lineWidth = 0.045 * k;
      g.beginPath(); g.arc(px(0), py(-0.09), 0.085 * k, Math.PI * 0.18, Math.PI * 0.82); g.stroke();
    }
    var t = new T.CanvasTexture(c);
    t.colorSpace = T.SRGBColorSpace; t.anisotropy = 2;
    return t;
  }

  /* ------------------------------------------------------------ geometry */
  function capGeometry(T, radius) {
    var seg = 24, rings = 7, th = Math.asin(CAP), pos = [], nor = [], uv = [], idx = [], i, j;
    for (i = 0; i <= rings; i++) {
      var t = th * i / rings, st = Math.sin(t), ct = Math.cos(t);
      for (j = 0; j <= seg; j++) {
        var p = j / seg * Math.PI * 2, x = st * Math.cos(p), y = st * Math.sin(p);
        pos.push(x * radius, y * radius, ct * radius); nor.push(x, y, ct);
        uv.push(0.5 + x / (2 * CAP), 0.5 + y / (2 * CAP));
      }
    }
    for (i = 0; i < rings; i++) for (j = 0; j < seg; j++) {
      var a = i * (seg + 1) + j, b = a + seg + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  }
  // Fruit bodies: a sphere, with a few gentle shape changes that stay clear of the face.
  function bodyGeometry(T, lv) {
    var g = new T.SphereGeometry(1, 30, 22), p = g.attributes.position, i, x, y, z, k;
    for (i = 0; i < p.count; i++) {
      x = p.getX(i); y = p.getY(i); z = p.getZ(i);
      if (lv === 2 && y < -0.3) { k = 1 - 0.42 * Math.pow((-y - 0.3) / 0.7, 1.6); x *= k; z *= k; y -= (1 - k) * 0.25; }
      if (lv === 4) { k = Math.abs(x); if (k > 0.8) x *= 1 + (k - 0.8) * 0.6; }
      if ((lv === 6 || lv === 7) && y > 0.78) y -= (y - 0.78) * (lv === 6 ? 0.9 : 0.4) * (1 - Math.min(1, Math.sqrt(x * x + z * z) * 2.5));
      if (lv === 1 || lv === 3) { k = 1 + 0.03 * Math.sin(y * 3); x *= k; z *= k; }
      p.setXYZ(i, x, y, z);
    }
    g.computeVertexNormals();
    return g;
  }

  /* ------------------------------------------------------- merged meshes */
  // Collects coloured pieces and merges them into one vertex-coloured geometry (one draw).
  function Builder(T) { this.T = T; this.parts = []; this.M = new T.Matrix4(); this.Q = new T.Quaternion(); this.E = new T.Euler(); }
  Builder.prototype.add = function (geo, color, x, y, z, sx, sy, sz, rx, ry, rz) {
    var T = this.T, g = geo.index ? geo.toNonIndexed() : geo.clone();
    this.E.set(rx || 0, ry || 0, rz || 0);
    this.Q.setFromEuler(this.E);
    this.M.compose(new T.Vector3(x || 0, y || 0, z || 0), this.Q, new T.Vector3(sx == null ? 1 : sx, sy == null ? (sx == null ? 1 : sx) : sy, sz == null ? (sx == null ? 1 : sx) : sz));
    g.applyMatrix4(this.M);
    this.parts.push({ g: g, c: color });
    return this;
  };
  Builder.prototype.box = function (color, x, y, z, w, h, d, rx, ry, rz) { return this.add(new this.T.BoxGeometry(w, h, d), color, x, y, z, 1, 1, 1, rx, ry, rz); };
  Builder.prototype.build = function () {
    var T = this.T, n = 0, o = 0, C = new T.Color();
    this.parts.forEach(function (p) { n += p.g.attributes.position.count; });
    var pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
    this.parts.forEach(function (p) {
      var A = p.g.attributes, cnt = A.position.count, i;
      pos.set(A.position.array, o * 3); nor.set(A.normal.array, o * 3);
      for (i = 0; i < cnt; i++) {
        C.set(typeof p.c === 'function' ? p.c(A.position.getX(i), A.position.getY(i), A.position.getZ(i)) : p.c);
        col[(o + i) * 3] = C.r; col[(o + i) * 3 + 1] = C.g; col[(o + i) * 3 + 2] = C.b;
      }
      o += cnt;
      p.g.dispose();
    });
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    g.setAttribute('normal', new T.BufferAttribute(nor, 3));
    g.setAttribute('color', new T.BufferAttribute(col, 3));
    g.computeBoundingSphere();
    this.parts = [];
    return g;
  };

  JDArt.createView = function (canvas) {
    var T = window.THREE;
    if (!T) throw new Error('three.js is unavailable');
    var info = Kit.webgl.probe();
    if (!info.ok) throw new Error('WebGL is unavailable');
    var wgl = Kit.webgl.createRenderer(canvas, { software: info.software });
    var soft = wgl.software, renderer = wgl.renderer, ratio = wgl.ratio;
    renderer.setClearColor(0xffe7bd, 1);
    var scene = new T.Scene(), camera = new T.PerspectiveCamera(33, 16 / 9, 0.5, 140);
    scene.fog = new T.Fog(0xffe4bc, 38, 90);
    var hemi = new T.HemisphereLight(0xfff6e4, 0xd19a66, 1.55);
    var sun = new T.DirectionalLight(0xfff0d2, 2.3);
    sun.position.set(-7, 15, 13);
    var fill = new T.DirectionalLight(0xcfe6ff, 0.55);
    fill.position.set(9, 4, 10);
    scene.add(hemi, sun, fill);
    var C = new T.Color(), V = new T.Vector3(), V2 = new T.Vector3();
    var view = { soft: soft, calm: false };
    var B = new Builder(T);
    var LAMBERT_VC = new T.MeshLambertMaterial({ vertexColors: true });

    /* ------------------------------------------------------- the kitchen */
    function tileTexture() {
      var c = canvas2d(256, 256), g = c.getContext('2d');
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 256);
      for (var i = 0; i < 4; i++) for (var j = 0; j < 4; j++) {
        g.fillStyle = (i + j) % 2 ? '#ffffff' : '#f3f3f3';
        g.beginPath(); g.roundRect ? g.roundRect(i * 64 + 3, j * 64 + 3, 58, 58, 8) : g.rect(i * 64 + 3, j * 64 + 3, 58, 58); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillRect(i * 64 + 9, j * 64 + 8, 22, 5);
      }
      var t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(16, 8);
      return t;
    }
    function skyTexture() {
      var c = canvas2d(256, 256), g = c.getContext('2d');
      grad(g, 256, 256, '#5cc8ff', '#9fe0ff', '#dff6ff');
      var gr = g.createRadialGradient(70, 70, 6, 70, 70, 90);
      gr.addColorStop(0, 'rgba(255,255,220,1)'); gr.addColorStop(0.25, 'rgba(255,240,150,0.9)'); gr.addColorStop(1, 'rgba(255,240,150,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
      g.fillStyle = '#ffffff';
      [[170, 90, 1], [120, 170, 0.8], [215, 190, 0.7]].forEach(function (cl) {
        var x = cl[0], y = cl[1], s = cl[2];
        [[0, 0, 22], [-22, 6, 16], [22, 6, 17], [-8, -12, 15], [10, -10, 14]].forEach(function (b) { g.beginPath(); g.arc(x + b[0] * s, y + b[1] * s, b[2] * s, 0, Math.PI * 2); g.fill(); });
      });
      g.fillStyle = '#7fd36a'; g.beginPath(); g.ellipse(128, 300, 220, 90, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#5fbf55'; g.beginPath(); g.ellipse(40, 290, 120, 70, 0, 0, Math.PI * 2); g.fill();
      var t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace;
      return t;
    }
    var wallMat = new T.MeshLambertMaterial({ map: tileTexture(), color: 0xfff1cf });
    var wall = new T.Mesh(new T.PlaneGeometry(90, 45), wallMat);
    wall.position.set(0, 10, -10);
    var sky = new T.Mesh(new T.PlaneGeometry(7, 6.4), new T.MeshBasicMaterial({ map: skyTexture(), fog: false }));
    sky.position.set(10.6, 8.2, -9.9);
    scene.add(wall, sky);

    var woodMat = new T.MeshLambertMaterial({ vertexColors: true });
    function buildKitchen(skin) {
      var S = SKINS[skin], wood = S.wood, cyl = new T.CylinderGeometry(1, 1, 1, 18), sph = new T.SphereGeometry(1, 16, 12);
      // window frame, sill and curtains
      B.box(0xffffff, 10.6, 11.55, -9.7, 7.6, 0.35, 0.4).box(0xffffff, 10.6, 4.85, -9.6, 8.2, 0.4, 0.8)
        .box(0xffffff, 6.95, 8.2, -9.7, 0.35, 7, 0.4).box(0xffffff, 14.25, 8.2, -9.7, 0.35, 7, 0.4)
        .box(0xffffff, 10.6, 8.2, -9.75, 0.18, 6.6, 0.2).box(0xffffff, 10.6, 8.2, -9.75, 6.6, 0.18, 0.2);
      for (var i = 0; i < 4; i++) {
        B.add(cyl, S.bow, 6.4 + i * 0.32, 8.6, -9.3, 0.22, 6.4, 0.22);
        B.add(cyl, S.bow, 14.8 - i * 0.32, 8.6, -9.3, 0.22, 6.4, 0.22);
      }
      B.box(0xffffff, 10.6, 11.95, -9.3, 9.6, 0.25, 0.3);
      // pot of flowers on the sill
      B.add(cyl, 0xff8a5c, 9.2, 5.45, -9.3, 0.42, 0.8, 0.42).add(sph, 0x5cc85a, 9.2, 6.2, -9.3, 0.62, 0.55, 0.5);
      [[-0.3, 0.3], [0.25, 0.42], [0.05, 0.62], [0.42, 0.12]].forEach(function (p, k) { B.add(sph, [0xff5d8f, 0xffe14d, 0xffffff, 0xff9a1c][k], 9.2 + p[0], 6.2 + p[1], -8.9, 0.17); });
      // shelf on the left with jars
      B.box(0xffffff, -11, 11.2, -9.3, 6, 0.25, 1.2);
      [[-13, 0xffb3c7, 0.7], [-11.6, 0x9fe0ff, 0.9], [-10.2, 0xffe08a, 0.6], [-9, 0xb9f0a0, 0.8]].forEach(function (j) {
        B.add(cyl, j[1], j[0], 11.33 + j[2] / 2, -9.3, 0.42, j[2], 0.42).add(cyl, 0xffffff, j[0], 11.4 + j[2], -9.3, 0.46, 0.18, 0.46);
      });
      // counter top (planks), front edge and cabinets
      for (var p = -8; p < 8; p++) B.box(p % 2 ? wood : C.set(wood).multiplyScalar(0.93).getHex(), p * 5 + 2.5, -0.65, -2.5, 5, 0.6, 15);
      B.box(C.set(wood).multiplyScalar(0.8).getHex(), 0, -1.05, 5.05, 80, 0.25, 0.3);
      B.box(0x8fdcc8, 0, -4.2, 4.6, 80, 6, 0.6);
      for (var d = -9; d <= 9; d++) {
        B.box(0x7ccbb6, d * 4.4, -4.2, 4.95, 0.18, 5.6, 0.1);
        B.add(sph, 0xffffff, d * 4.4 + 1.4, -2.2, 5.0, 0.18, 0.18, 0.12);
      }
      // a fruit bowl on the left of the counter, a juice glass on the right
      var bowl = new T.SphereGeometry(1, 24, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
      B.add(bowl, 0x4fb4ff, -9.6, 0.95, 2.2, 2.2, 1.25, 1.6);
      B.add(new T.TorusGeometry(1, 0.06, 6, 30), 0xffffff, -9.6, 0.95, 2.2, 2.2, 1.6, 1, Math.PI / 2, 0, 0);
      B.add(cyl, 0xffffff, 9.4, 0.85, 2.6, 0.62, 2.4, 0.62).add(cyl, 0xffb23d, 9.4, 0.6, 2.6, 0.55, 1.75, 0.55)
        .add(cyl, 0xff5d8f, 9.7, 2.3, 2.6, 0.06, 1.8, 0.06, 0, 0, -0.35)
        .add(new T.TorusGeometry(0.62, 0.06, 6, 24), 0xffffff, 9.4, 2.05, 2.6, 1, 1, 1, Math.PI / 2, 0, 0);
      B.add(sph, 0xffe14d, 9.95, 2.0, 2.6, 0.32, 0.32, 0.1);
      // the fruit chain board on the left wall
      B.add(cyl, C.set(wood).multiplyScalar(1.05).getHex(), -8.8, 5.5, -1.75, 3.05, 0.3, 3.05, Math.PI / 2, 0, 0);
      B.add(new T.TorusGeometry(3.05, 0.14, 8, 40), C.set(wood).multiplyScalar(0.8).getHex(), -8.8, 5.5, -1.58, 1, 1, 1, 0, 0, 0);
      cyl.dispose(); sph.dispose(); bowl.dispose();
      return B.build();
    }
    var kitchen = new T.Mesh(buildKitchen(0), woodMat);
    scene.add(kitchen);
    // Sunbeams from the window (additive, very faint).
    var beamMat = new T.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.11, blending: T.AdditiveBlending, depthWrite: false, fog: false });
    var beams = new T.Group();
    [[0, 2.6], [1.8, 1.6], [3.4, 2.1]].forEach(function (b) {
      var m = new T.Mesh(new T.PlaneGeometry(b[1], 26), beamMat);
      m.position.set(6 - b[0], 4, -7); m.rotation.z = 0.62; beams.add(m);
    });
    scene.add(beams);

    /* ---------------------------------------------------------- the jar */
    var jar = new T.Group();
    scene.add(jar);
    var glassMat = new T.MeshPhongMaterial({ color: 0xd8f4ff, transparent: true, opacity: 0.32, shininess: 120, specular: 0xffffff, depthWrite: false });
    var backMat = new T.MeshPhongMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.3, shininess: 60, depthWrite: false });
    var frontMat = new T.MeshPhongMaterial({ color: 0xeefaff, transparent: true, opacity: 0.07, shininess: 150, specular: 0xffffff, depthWrite: false });
    var base = new T.Mesh(new T.BoxGeometry(E.JW + 0.5, 0.36, DEPTH + 0.5), new T.MeshPhongMaterial({ color: 0xbfeeff, transparent: true, opacity: 0.6, shininess: 120, specular: 0xffffff }));
    base.position.set(0, -0.18, 0);
    var back = new T.Mesh(new T.PlaneGeometry(E.JW, E.JH), backMat);
    back.position.set(0, E.JH / 2, -DEPTH / 2); back.renderOrder = 1;
    var sideL = new T.Mesh(new T.BoxGeometry(0.2, E.JH, DEPTH), glassMat), sideR = sideL.clone();
    sideL.position.set(-HALF - 0.1, E.JH / 2, 0); sideR.position.set(HALF + 0.1, E.JH / 2, 0);
    sideL.renderOrder = sideR.renderOrder = 3;
    var front = new T.Mesh(new T.PlaneGeometry(E.JW + 0.4, E.JH), frontMat);
    front.position.set(0, E.JH / 2, DEPTH / 2); front.renderOrder = 5;
    var glareMat = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, blending: T.AdditiveBlending, depthWrite: false, fog: false });
    var glare = new T.Group();
    [[-2.6, 0.5], [-1.7, 0.18], [2.9, 0.3]].forEach(function (s) {
      var m = new T.Mesh(new T.PlaneGeometry(s[1], E.JH * 0.9), glareMat);
      m.position.set(s[0], E.JH * 0.5, DEPTH / 2 + 0.02); m.rotation.z = -0.18; m.renderOrder = 6; glare.add(m);
    });
    var rimMat = new T.MeshPhongMaterial({ vertexColors: true, transparent: true, opacity: 0.8, shininess: 100, specular: 0xffffff, depthWrite: false });
    var rim = new T.Mesh(new T.BufferGeometry(), rimMat);
    rim.renderOrder = 7;
    var bow = new T.Mesh(new T.BufferGeometry(), new T.MeshPhongMaterial({ vertexColors: true, shininess: 70, specular: 0x666666 }));
    jar.add(base, back, sideL, sideR, front, glare, rim, bow);
    function buildRim(skin) {
      var S = SKINS[skin], cols = S.rim, cyl = new T.CylinderGeometry(1, 1, 1, 12), sph = new T.SphereGeometry(1, 12, 8);
      function col(x) { if (cols.length === 1) return cols[0]; var k = Math.max(0, Math.min(cols.length - 1, Math.floor((x + HALF + 0.3) / (E.JW + 0.6) * cols.length))); return cols[k]; }
      var X = HALF + 0.2, Z = DEPTH / 2, top = E.JH;
      [[-X, -Z], [X, -Z], [-X, Z], [X, Z]].forEach(function (p) { B.add(cyl, col, p[0], top / 2, p[1], 0.11, top, 0.11); });
      B.add(cyl, col, 0, top, Z, 0.17, E.JW + 0.4, 0.17, 0, 0, Math.PI / 2).add(cyl, col, 0, top, -Z, 0.17, E.JW + 0.4, 0.17, 0, 0, Math.PI / 2)
        .add(cyl, col, -X, top, 0, 0.17, DEPTH, 0.17, Math.PI / 2, 0, 0).add(cyl, col, X, top, 0, 0.17, DEPTH, 0.17, Math.PI / 2, 0, 0);
      [[-X, -Z], [X, -Z], [-X, Z], [X, Z]].forEach(function (p) { B.add(sph, col, p[0], top, p[1], 0.17); });
      rim.geometry.dispose(); rim.geometry = B.build();
      // a ribbon bow on the front of the rim
      B.add(sph, S.bow, -0.55, top - 0.05, Z + 0.25, 0.55, 0.32, 0.18, 0, 0, 0.35).add(sph, S.bow, 0.55, top - 0.05, Z + 0.25, 0.55, 0.32, 0.18, 0, 0, -0.35)
        .add(sph, C.set(S.bow).multiplyScalar(0.85).getHex(), 0, top - 0.05, Z + 0.32, 0.2, 0.2, 0.16)
        .add(sph, S.bow, -0.3, top - 0.55, Z + 0.22, 0.12, 0.42, 0.08, 0, 0, -0.3).add(sph, S.bow, 0.3, top - 0.55, Z + 0.22, 0.12, 0.42, 0.08, 0, 0, 0.3);
      bow.geometry.dispose(); bow.geometry = B.build();
      cyl.dispose(); sph.dispose();
    }

    // The danger line on the front glass and the aiming guide.
    function stripeTexture(a, b, n) {
      var c = canvas2d(64, 8), g = c.getContext('2d');
      g.fillStyle = a; g.fillRect(0, 0, 64, 8);
      g.fillStyle = b; for (var i = 0; i < n; i++) g.fillRect(i * 64 / n, 0, 32 / n, 8);
      var t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.wrapS = t.wrapT = T.RepeatWrapping;
      return t;
    }
    var lineTex = stripeTexture('rgba(255,255,255,0)', '#ff3d5a', 2);
    lineTex.repeat.set(7, 1);
    var lineMat = new T.MeshBasicMaterial({ map: lineTex, transparent: true, opacity: 0.35, depthWrite: false, fog: false });
    var line = new T.Mesh(new T.PlaneGeometry(E.JW, 0.13), lineMat);
    line.position.set(0, E.LINE, DEPTH / 2 + 0.03); line.renderOrder = 8;
    jar.add(line);
    var guideTex = (function () {
      var c = canvas2d(8, 64), g = c.getContext('2d');
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, 8, 34);
      var t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping;
      return t;
    })();
    var guideMat = new T.MeshBasicMaterial({ map: guideTex, transparent: true, opacity: 0.6, depthWrite: false, fog: false });
    var guide = new T.Mesh(new T.PlaneGeometry(0.09, 1), guideMat);
    guide.renderOrder = 2;
    jar.add(guide);

    /* ---------------------------------------------------- the dropper */
    var cloud = (function () {
      var sph = new T.SphereGeometry(1, 18, 12);
      [[0, 0.1, 0, 0.82], [-0.78, -0.08, 0, 0.6], [0.8, -0.08, 0, 0.62], [-0.36, 0.42, 0, 0.6], [0.42, 0.45, 0, 0.55]].forEach(function (b) {
        B.add(sph, function (x, y) { return y < -0.25 ? 0xd9ecff : 0xffffff; }, b[0], b[1], b[2], b[3], b[3], b[3] * 0.75);
      });
      B.add(sph, 0x2a1838, -0.26, 0.12, 0.6, 0.1, 0.12, 0.06).add(sph, 0x2a1838, 0.26, 0.12, 0.6, 0.1, 0.12, 0.06)
        .add(sph, 0xffffff, -0.29, 0.17, 0.65, 0.035).add(sph, 0xffffff, 0.23, 0.17, 0.65, 0.035)
        .add(sph, 0xff9ab0, -0.5, -0.08, 0.5, 0.13, 0.08, 0.05).add(sph, 0xff9ab0, 0.5, -0.08, 0.5, 0.13, 0.08, 0.05)
        .add(new T.TorusGeometry(0.1, 0.028, 6, 12, Math.PI), 0x2a1838, 0, -0.04, 0.62, 1, 1, 1, 0, 0, Math.PI);
      sph.dispose();
      return new T.Mesh(B.build(), LAMBERT_VC);
    })();
    scene.add(cloud);
    // The bubble that shows the next fruit.
    var bubble = new T.Mesh(new T.SphereGeometry(1.15, 28, 18), new T.MeshPhongMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, shininess: 140, specular: 0xffffff, depthWrite: false }));
    bubble.position.set(7.6, 9.55, 0.2); bubble.renderOrder = 9;
    scene.add(bubble);

    /* ------------------------------------------------------- the fruit */
    var NCAP = 72, bodies = [], faces = [], accs = {}, FACE_KINDS = 3;
    var ACC = [null, 'leaf', 'calyx', 'leaf', 'leaf', 'leaf', 'leaf', 'leaf', 'crown', 'leaf', 'leaf'];
    function instanced(geo, mat, cap) {
      var m = new T.InstancedMesh(geo, mat, cap);
      m.instanceMatrix.setUsage(T.DynamicDrawUsage);
      m.instanceColor = new T.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
      m.instanceColor.setUsage(T.DynamicDrawUsage);
      m.frustumCulled = false; m.count = 0;
      scene.add(m);
      return m;
    }
    F.forEach(function (fr, lv) {
      var c = canvas2d(256, 128);
      seed = 11 + lv * 7;
      PATTERN[lv](c.getContext('2d'), 256, 128);
      var tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 2;
      bodies.push(instanced(bodyGeometry(T, lv), new T.MeshPhongMaterial({ map: tex, shininess: 70, specular: 0x5a5a5a }), NCAP));
    });
    var capGeo = capGeometry(T, 1.03);
    for (var fk = 0; fk < FACE_KINDS; fk++) faces.push(instanced(capGeo, new T.MeshPhongMaterial({ map: faceTexture(T, fk), transparent: false, alphaTest: 0.45, shininess: 70, specular: 0x5a5a5a }), 160));
    (function () {
      var cyl = new T.CylinderGeometry(1, 1, 1, 7), sph = new T.SphereGeometry(1, 10, 7), cone = new T.ConeGeometry(1, 1, 6);
      B.add(cyl, 0x7a4a22, 0.02, 1.12, 0, 0.055, 0.42, 0.055, 0, 0, -0.15).add(sph, 0x4cc04a, 0.27, 1.17, 0.03, 0.34, 0.07, 0.17, 0, 0, 0.5)
        .add(sph, 0x3a9c3a, 0.27, 1.175, 0.04, 0.3, 0.02, 0.025, 0, 0, 0.5);
      accs.leaf = instanced(B.build(), LAMBERT_VC, 160);
      for (var i = 0; i < 6; i++) {
        var a = i / 6 * Math.PI * 2;
        B.add(sph, 0x3fb04a, Math.cos(a) * 0.28, 0.93, Math.sin(a) * 0.28, 0.32, 0.06, 0.12, 0, -a, -0.35);
      }
      B.add(cyl, 0x4a9a3a, 0, 1.05, 0, 0.05, 0.25, 0.05);
      accs.calyx = instanced(B.build(), LAMBERT_VC, 80);
      for (var k = 0; k < 8; k++) {
        var b = k / 8 * Math.PI * 2, tilt = k % 2 ? 0.55 : 0.28, len = k % 2 ? 0.75 : 1.0;
        B.add(cone, k % 2 ? 0x5cc85a : 0x3aa64a, Math.cos(b) * 0.12, 0.95 + len * 0.42, Math.sin(b) * 0.12, 0.15, len, 0.07, Math.sin(b) * tilt, 0, -Math.cos(b) * tilt);
      }
      accs.crown = instanced(B.build(), LAMBERT_VC, 40);
      cyl.dispose(); sph.dispose(); cone.dispose();
    })();
    var counts = new Int32Array(F.length), faceCounts = new Int32Array(FACE_KINDS), accCounts = { leaf: 0, calyx: 0, crown: 0 };
    function writeMatrix(arr, o, x, y, z, sx, sy, sz, ang) {
      var c = Math.cos(ang), s = Math.sin(ang);
      arr[o] = sx * c; arr[o + 1] = sy * s; arr[o + 2] = 0; arr[o + 3] = 0;
      arr[o + 4] = -sx * s; arr[o + 5] = sy * c; arr[o + 6] = 0; arr[o + 7] = 0;
      arr[o + 8] = 0; arr[o + 9] = 0; arr[o + 10] = sz; arr[o + 11] = 0;
      arr[o + 12] = x; arr[o + 13] = y; arr[o + 14] = z; arr[o + 15] = 1;
    }
    function tintAt(mesh, i, r, g, b) { var a = mesh.instanceColor.array; a[i * 3] = r; a[i * 3 + 1] = g; a[i * 3 + 2] = b; }
    // One fruit: world position, radius, roll, squash (+ wider/shorter), extra scale, face
    // (-1 none, 0 happy, 1 blink, 2 wow) and a brightness/tint (r, g, b).
    function put(lv, x, y, z, r, ang, sq, pop, face, tr, tg, tb) {
      var mesh = bodies[lv], i = counts[lv];
      if (i >= NCAP) return;
      counts[lv] = i + 1;
      var s = r * (1 + pop), sx = s * (1 + sq), sy = s * (1 - sq), sz = s * ZS * (1 + sq * 0.4);
      writeMatrix(mesh.instanceMatrix.array, i * 16, x, y, z, sx, sy, sz, ang);
      tintAt(mesh, i, tr, tg, tb);
      if (face >= 0) {
        var fm = faces[face], j = faceCounts[face];
        if (j < 160) { faceCounts[face] = j + 1; writeMatrix(fm.instanceMatrix.array, j * 16, x, y, z, sx, sy, sz, ang); tintAt(fm, j, tr, tg, tb); }
      }
      var kind = ACC[lv];
      if (kind) {
        var am = accs[kind], k = accCounts[kind];
        if (k < am.instanceColor.count) { accCounts[kind] = k + 1; writeMatrix(am.instanceMatrix.array, k * 16, x, y, z, sx, sy, s * (1 - sq), ang); tintAt(am, k, tr, tg, tb); }
      }
    }
    function beginFruit() {
      for (var i = 0; i < counts.length; i++) counts[i] = 0;
      for (var j = 0; j < FACE_KINDS; j++) faceCounts[j] = 0;
      accCounts.leaf = accCounts.calyx = accCounts.crown = 0;
    }
    function flush(m, n) { m.count = n; if (n) { m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; } }
    function endFruit() {
      for (var i = 0; i < bodies.length; i++) flush(bodies[i], counts[i]);
      for (var j = 0; j < FACE_KINDS; j++) flush(faces[j], faceCounts[j]);
      flush(accs.leaf, accCounts.leaf); flush(accs.calyx, accCounts.calyx); flush(accs.crown, accCounts.crown);
    }

    /* ------------------------------------------------------------ juice */
    var PMAX = 260, drops = instanced(new T.IcosahedronGeometry(1, 1), new T.MeshPhongMaterial({ shininess: 90, specular: 0x777777 }), PMAX);
    var P = { n: 0, x: new Float32Array(PMAX), y: new Float32Array(PMAX), z: new Float32Array(PMAX), vx: new Float32Array(PMAX), vy: new Float32Array(PMAX), vz: new Float32Array(PMAX),
      life: new Float32Array(PMAX), max: new Float32Array(PMAX), size: new Float32Array(PMAX), r: new Float32Array(PMAX), g: new Float32Array(PMAX), b: new Float32Array(PMAX), flat: new Uint8Array(PMAX), spin: new Float32Array(PMAX) };
    function spawn(x, y, z, vx, vy, vz, life, size, hex, flat) {
      var i = P.n < PMAX ? P.n++ : Math.floor(Math.random() * PMAX);
      C.set(hex);
      P.x[i] = x; P.y[i] = y; P.z[i] = z; P.vx[i] = vx; P.vy[i] = vy; P.vz[i] = vz;
      P.life[i] = P.max[i] = life; P.size[i] = size; P.r[i] = C.r; P.g[i] = C.g; P.b[i] = C.b; P.flat[i] = flat ? 1 : 0; P.spin[i] = Math.random() * 6;
    }
    var RMAX = 16, rings = instanced(new T.RingGeometry(0.78, 1, 32), new T.MeshBasicMaterial({ transparent: true, opacity: 0.7, depthWrite: false, fog: false }), RMAX);
    rings.renderOrder = 10;
    var glowTex = (function () {
      var c = canvas2d(64, 64), g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      return new T.CanvasTexture(c);
    })();
    var glows = instanced(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: glowTex, transparent: true, blending: T.AdditiveBlending, depthWrite: false, fog: false }), RMAX);
    glows.renderOrder = 11;
    var FX = []; // rings and glows: { kind, x, y, z, r, t, max, hex }
    function addFx(kind, x, y, z, r, max, hex) {
      if (FX.length >= RMAX * 2) FX.shift();
      C.set(hex);
      FX.push({ kind: kind, x: x, y: y, z: z, r: r, t: 0, max: max, cr: C.r, cg: C.g, cb: C.b });
    }
    view.splash = function (jx, jy, lv, power) {
      if (view.calm) return;
      var fr = F[lv], x = jx - HALF, n = Math.round(10 + lv * 2.4 * (power || 1)), sp = 3 + lv * 0.5;
      for (var i = 0; i < n; i++) {
        var a = Math.random() * Math.PI * 2, s = sp * (0.4 + Math.random() * 0.7);
        spawn(x + Math.cos(a) * fr.r * 0.6, jy + Math.sin(a) * fr.r * 0.6, 0.8 + Math.random() * 0.8, Math.cos(a) * s, Math.sin(a) * s + 3, (Math.random() - 0.3) * 2.5,
          0.45 + Math.random() * 0.4, (0.07 + Math.random() * 0.08) * (0.8 + lv * 0.08), i % 3 ? fr.juice : fr.color, false);
      }
      addFx('ring', x, jy, 1.2, fr.r * 1.1, 0.4, fr.juice);
      addFx('glow', x, jy, 1.4, fr.r * 3.2, 0.35, fr.juice);
    };
    view.confetti = function (count) {
      if (view.calm) return;
      var cols = [0xff5d73, 0xffd23f, 0x4fb4ff, 0x6fdc5a, 0xff9ad1, 0xffffff];
      for (var i = 0; i < (count || 90); i++) {
        spawn(-7 + Math.random() * 14, 12 + Math.random() * 3, 1 + Math.random() * 3, (Math.random() - 0.5) * 4, -1 - Math.random() * 3, (Math.random() - 0.5) * 2,
          2.2 + Math.random() * 1.2, 0.13 + Math.random() * 0.08, cols[i % cols.length], true);
      }
    };
    view.sparkle = function (jx, jy, hex) {
      if (view.calm) return;
      for (var i = 0; i < 14; i++) {
        var a = i / 14 * Math.PI * 2;
        spawn(jx - HALF, jy, 1.5, Math.cos(a) * 4, Math.sin(a) * 4 + 1, 0, 0.6, 0.09, hex || 0xffe14d, true);
      }
    };
    function stepFx(dt) {
      var arr = drops.instanceMatrix.array, i = 0;
      while (i < P.n) {
        P.life[i] -= dt;
        if (P.life[i] <= 0) {
          var last = --P.n;
          if (i !== last) {
            P.x[i] = P.x[last]; P.y[i] = P.y[last]; P.z[i] = P.z[last]; P.vx[i] = P.vx[last]; P.vy[i] = P.vy[last]; P.vz[i] = P.vz[last];
            P.life[i] = P.life[last]; P.max[i] = P.max[last]; P.size[i] = P.size[last]; P.r[i] = P.r[last]; P.g[i] = P.g[last]; P.b[i] = P.b[last]; P.flat[i] = P.flat[last]; P.spin[i] = P.spin[last];
          }
          continue;
        }
        var flat = P.flat[i];
        P.vy[i] -= (flat ? 2.5 : 16) * dt;
        if (flat) { P.vx[i] *= 1 - dt; P.vx[i] += Math.sin(P.life[i] * 5 + P.spin[i]) * dt * 3; }
        P.x[i] += P.vx[i] * dt; P.y[i] += P.vy[i] * dt; P.z[i] += P.vz[i] * dt;
        var k = P.life[i] / P.max[i], s = P.size[i] * (flat ? 1 : 0.4 + 0.6 * k);
        if (flat) writeMatrix(arr, i * 16, P.x[i], P.y[i], P.z[i], s, s * Math.abs(Math.cos(P.life[i] * 6 + P.spin[i])) + 0.01, s * 0.2, P.spin[i] + P.life[i] * 3);
        else writeMatrix(arr, i * 16, P.x[i], P.y[i], P.z[i], s, s * (1 + Math.min(1.2, Math.abs(P.vy[i]) * 0.06)), s, 0);
        tintAt(drops, i, P.r[i], P.g[i], P.b[i]);
        i++;
      }
      flush(drops, P.n);
      var nr = 0, ng = 0, ra = rings.instanceMatrix.array, ga = glows.instanceMatrix.array;
      for (var f = FX.length - 1; f >= 0; f--) {
        var e = FX[f];
        e.t += dt;
        if (e.t >= e.max) { FX.splice(f, 1); continue; }
        var q = e.t / e.max;
        if (e.kind === 'ring' && nr < RMAX) {
          var rs = e.r * (0.6 + q * 1.4) * (1 - q * q * 0.2);
          writeMatrix(ra, nr * 16, e.x, e.y, e.z, rs * (1 - q * 0.4) + 0.001, rs * (1 - q * 0.4) + 0.001, 1, 0);
          tintAt(rings, nr, e.cr, e.cg, e.cb); nr++;
        } else if (e.kind === 'glow' && ng < RMAX) {
          var gs = e.r * (0.5 + q * 0.7), fade = 1 - q;
          writeMatrix(ga, ng * 16, e.x, e.y, e.z, gs, gs, 1, 0);
          tintAt(glows, ng, e.cr * fade, e.cg * fade, e.cb * fade); ng++;
        }
      }
      flush(rings, nr); flush(glows, ng);
    }

    /* ------------------------------------------------------- squash state */
    var springs = {}, ghosts = [], sweep = 0;
    function spring(id) { return springs[id] || (springs[id] = { s: 0, v: 0, p: 0, pv: 0, flash: 0 }); }
    function stepSprings(dt) {
      // Small fixed sub-steps: a stiff spring stepped with a slow frame's dt would blow up.
      var n = Math.min(12, Math.ceil(dt * 120)), h = n ? dt / n : 0, k;
      for (var id in springs) {
        var s = springs[id];
        for (k = 0; k < n; k++) {
          s.v += (-340 * s.s - 13 * s.v) * h; s.s += s.v * h;
          s.pv += (-260 * s.p - 11 * s.pv) * h; s.p += s.pv * h;
        }
        if (s.flash > 0) s.flash = Math.max(0, s.flash - dt * 3);
        if (s.s > 0.3) s.s = 0.3; else if (s.s < -0.25) s.s = -0.25;
        if (s.p > 0.35) s.p = 0.35; else if (s.p < -0.4) s.p = -0.4;
      }
    }
    view.event = function (e) {
      var s;
      switch (e.t) {
        case 'land': s = spring(e.id); s.v += Math.min(3.2, e.power * 0.28); break;
        case 'bump': s = spring(e.id); s.v += Math.min(2, e.power * 0.12); break;
        case 'merge':
          s = spring(e.id); s.p = -0.32; s.pv = 0; s.v = -1.8; s.flash = 1;
          delete springs[e.gone];
          if (ghosts.length < 12) { ghosts.push({ lv: e.lv - 1, x: e.ax, y: e.ay, tx: e.x, ty: e.y, r: e.r, t: 0 }); ghosts.push({ lv: e.lv - 1, x: e.bx, y: e.by, tx: e.x, ty: e.y, r: e.r, t: 0 }); }
          view.splash(e.x, e.y, e.lv, 1);
          if (e.lv >= 6) view.shake(0.08 + (e.lv - 6) * 0.05);
          break;
        case 'melon':
          view.splash(e.x, e.y, 10, 2); view.splash(e.x - 1, e.y + 0.5, 9, 1); view.splash(e.x + 1, e.y - 0.5, 9, 1);
          view.shake(0.45); view.confetti(60);
          break;
        case 'pop': view.splash(e.x, e.y, e.lv, 0.6); break;
        case 'blast': view.shake(0.3); break;
        case 'drop': s = spring(e.id); s.v = -1.2; break;
      }
    };
    view.squeeze = function () { cloudSquash = 1; };

    /* ----------------------------------------------------------- camera */
    var shakeT = 0, shakeP = 0, cloudX = 0, cloudSquash = 0, skin = -1, frameT = 0;
    var CAM = new T.Vector3(0, 7.4, 26.5), LOOK = new T.Vector3(0, 5.15, 0);
    camera.position.copy(CAM); camera.lookAt(LOOK);
    view.shake = function (p) { if (!view.calm) { shakeP = Math.max(shakeP, p); shakeT = 0.35; } };
    view.setSkin = function (i) {
      if (i === skin) return;
      skin = i;
      var S = SKINS[i];
      backMat.color.setHex(S.back);
      wallMat.color.setHex(S.wall);
      buildRim(i);
      kitchen.geometry.dispose(); kitchen.geometry = buildKitchen(i);
    };

    /* ------------------------------------------------------ the picture */
    // S: { t, dt, mode, w, aim, held, heldPop, next, top, runTop, danger, warn, guide, demo }
    var CHAIN = { x: -8.8, y: 5.5, z: -1.2, r: 2.2 };
    view.frame = function (S) {
      var dt = S.dt, t = S.t, calm = view.calm;
      frameT = t;
      stepSprings(dt);
      beginFruit();
      var w = S.w, i, f, sp, blink, face, tr, tg, tb, warn = S.warn && !calm ? 0.5 + 0.5 * Math.sin(t * 14) : 0;
      if (w) {
        for (i = 0; i < w.fruits.length; i++) {
          f = w.fruits[i];
          sp = springs[f.id];
          blink = ((t * 0.9 + f.id * 0.377) % 3.3) < 0.13;
          face = f.born < 0.6 || (S.warn && f.y + f.r > E.LINE - 0.4) ? 2 : blink ? 1 : 0;
          tr = tg = tb = 1;
          if (sp && sp.flash > 0) { tr = tg = tb = 1 + sp.flash * 0.6; }
          if (warn && f.y + f.r > E.LINE) { tr += warn * 0.35; tg -= warn * 0.25; tb -= warn * 0.25; }
          var breathe = calm ? 0 : Math.sin(t * 2.6 + f.id) * 0.012;
          put(f.lv, f.x - HALF, f.y, 0, f.r, f.a, (sp ? sp.s : 0) + breathe, sp ? sp.p : 0, face, tr, tg, tb);
        }
      }
      // merge ghosts: the two old fruit rush together and shrink
      for (i = ghosts.length - 1; i >= 0; i--) {
        var gh = ghosts[i];
        gh.t += dt;
        if (gh.t > 0.1) { ghosts.splice(i, 1); continue; }
        var q = gh.t / 0.1;
        put(gh.lv, gh.x + (gh.tx - gh.x) * q - HALF, gh.y + (gh.ty - gh.y) * q, 0.05, gh.r * (1 - q * 0.6), 0, 0, 0, 2, 1.3, 1.3, 1.3);
      }
      // the dropper and the fruit it holds
      var ax = S.aim - HALF;
      cloudX += (ax - cloudX) * Math.min(1, dt * 18);
      if (S.mode === 'title' && !w) cloudX = ax;
      cloudSquash = Math.max(0, cloudSquash - dt * 4);
      var bob = calm ? 0 : Math.sin(t * 2.2) * 0.12;
      cloud.visible = S.held >= 0;
      cloud.position.set(cloudX, E.DROP_Y + F[Math.max(0, S.held)].r + 0.95 + bob, 0.3);
      cloud.scale.set(1 + cloudSquash * 0.15, 1 - cloudSquash * 0.2, 1);
      if (S.held >= 0 && S.heldPop > 0) {
        put(S.held, ax, E.DROP_Y + bob * 0.4, 0, F[S.held].r, calm ? 0 : Math.sin(t * 1.7) * 0.12, 0, (1 - S.heldPop) * -0.6, ((t * 0.9) % 3.1) < 0.13 ? 1 : 0, 1, 1, 1);
      }
      // the aiming guide from the held fruit down to where it will land
      if (S.guide && w && S.held >= 0 && S.heldPop >= 1) {
        var r = F[S.held].r, y0 = E.DROP_Y - r, y1 = E.landingY(w, S.aim, r) - r, len = Math.max(0.01, y0 - y1);
        guide.visible = len > 0.3;
        guide.position.set(ax, (y0 + y1) / 2, -0.2);
        guide.scale.set(1, len, 1);
        guideTex.repeat.set(1, len * 2.2);
        guideTex.offset.y = calm ? 0 : -t * 1.2;
      } else guide.visible = false;
      // the next fruit in its bubble
      bubble.visible = S.next >= 0;
      if (S.next >= 0) {
        var nr = Math.min(0.85, F[S.next].r * 1.1 + 0.15);
        bubble.position.y = 9.55 + (calm ? 0 : Math.sin(t * 1.8 + 1) * 0.1);
        put(S.next, bubble.position.x, bubble.position.y, bubble.position.z, nr, calm ? 0 : Math.sin(t * 1.3) * 0.25, 0, 0, ((t * 0.8 + 1.3) % 3.4) < 0.13 ? 1 : 0, 1, 1, 1);
      }
      // the fruit chain on the board: known fruit in colour, the others as shadows
      for (i = 0; i < F.length; i++) {
        var ang = Math.PI / 2 - i / F.length * Math.PI * 2, known = i <= S.top, star = i === S.runTop && S.mode !== 'title';
        var cr = 0.26 + i * 0.043, hop = star && !calm ? Math.abs(Math.sin(t * 4)) * 0.18 : 0;
        put(i, CHAIN.x + Math.cos(ang) * CHAIN.r, CHAIN.y + Math.sin(ang) * CHAIN.r + hop, CHAIN.z, cr, 0, 0, star ? 0.12 : 0, known ? 0 : -1,
          known ? 1 : 0.16, known ? 1 : 0.13, known ? 1 : 0.2);
      }
      // a few fruit resting in the bowl on the counter
      put(6, -10.3, 1.55, 2.3, 0.75, 0.3, 0, 0, -1, 1, 1, 1);
      put(5, -9.0, 1.45, 2.5, 0.65, -0.2, 0, 0, -1, 1, 1, 1);
      put(1, -9.7, 1.9, 3.2, 0.42, 0.1, 0, 0, -1, 1, 1, 1);
      endFruit();
      stepFx(dt);
      // the line: faint until the pile comes near it, then it pulses
      var near = w ? Math.max(0, Math.min(1, (w.height - (E.LINE - 2)) / 2)) : 0;
      lineMat.opacity = calm ? 0.25 + near * 0.6 : 0.18 + near * 0.4 + (S.warn ? 0.4 * (0.5 + 0.5 * Math.sin(t * 12)) : 0);
      lineTex.offset.x = calm ? 0 : t * 0.4;
      // camera: a gentle sway on the title, a shake on big moments
      camera.position.copy(CAM);
      if (S.mode === 'title' && !calm) { camera.position.x += Math.sin(t * 0.25) * 1.2; camera.position.y += Math.sin(t * 0.33) * 0.3; }
      if (shakeT > 0 && !calm) {
        shakeT -= dt;
        var k2 = Math.max(0, shakeT / 0.35) * shakeP;
        camera.position.x += (Math.random() - 0.5) * k2; camera.position.y += (Math.random() - 0.5) * k2;
      } else shakeP = 0;
      camera.lookAt(LOOK);
      if ((sweep += dt) > 2 && w) {
        sweep = 0;
        var alive = {};
        for (i = 0; i < w.fruits.length; i++) alive[w.fruits[i].id] = 1;
        for (var id in springs) if (!alive[id]) delete springs[id];
      }
    };
    view.clearFx = function () { P.n = 0; FX.length = 0; ghosts.length = 0; springs = {}; };
    view.render = function () { renderer.render(scene, camera); };
    view.resize = function (w, h) {
      renderer.setSize(Math.max(1, w), Math.max(1, h), false);
      camera.aspect = Math.max(1, w) / Math.max(1, h); camera.updateProjectionMatrix();
    };
    // Where a jar point is in the 1280x720 picture.
    view.project = function (jx, jy, z) {
      V.set(jx - HALF, jy, z || 0).project(camera);
      return { x: (V.x + 1) / 2 * 1280, y: (1 - V.y) / 2 * 720 };
    };
    view.projectWorld = function (x, y, z) {
      V.set(x, y, z).project(camera);
      return { x: (V.x + 1) / 2 * 1280, y: (1 - V.y) / 2 * 720 };
    };
    view.bubblePoint = function () { return view.projectWorld(bubble.position.x, bubble.position.y + 1.25, bubble.position.z); };
    // The jar x under a point of the 1280x720 picture (on the plane of the fruit).
    view.jarX = function (lx, ly) {
      V.set(lx / 1280 * 2 - 1, 1 - ly / 720 * 2, 0.5).unproject(camera);
      V2.copy(V).sub(camera.position);
      var k = -camera.position.z / V2.z;
      return camera.position.x + V2.x * k + HALF;
    };
    // Weak PCs: fewer pixels when frames come slowly (never more than 1.5).
    var slow = 0;
    view.frameTime = function (ms) {
      if (ms > 28) slow++; else slow = Math.max(0, slow - 0.5);
      if (slow > 90 && ratio > 0.6) { ratio = Math.max(0.6, ratio - 0.25); renderer.setPixelRatio(ratio); slow = 0; return true; }
      return false;
    };
    view.info = function () { return renderer.info.render; };
    view.particleCount = function () { return P.n; };
    view.setSkin(0);
    return view;
  };
})();
