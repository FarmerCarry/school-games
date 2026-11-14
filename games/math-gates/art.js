/* Math Gates art: the candy track with three lanes, the crowd of round runners, gate
 * rows with their numbers, soft obstacles, coins, the rival crowd, the finish arch, the
 * bonus staircase, confetti and the follow camera, all built in code with three.js.
 * Models are merged, vertex-coloured geometries. The crowd, the rival crowd, gates,
 * posts, obstacles, coins, scenery, shadows and confetti are each one InstancedMesh
 * (the crowd shows at most CAP runners; the number above it is the real one). Every
 * number in the world is drawn from one small glyph atlas (digits, + − × ÷ = ? and
 * whole Arabic words), baked once into a canvas, through one instanced quad mesh. About
 * 30 draw calls in all. Nothing here reads or changes the engine's state. */
(function () {
  'use strict';
  var MG = window.MG;
  var INK = 0x2a2140, WHITE = 0xffffff;
  MG.CAP = 150;
  var FOV = 44, LW = 4, GH = 3.1, GY = 2.4;  // camera fov; lane width; gate panel height and centre

  MG.createView = function (canvas, opt) {
    opt = opt || {};
    var T = window.THREE;
    if (!T) throw new Error('three.js is unavailable');
    var LQ = !!opt.lq;
    var renderer = new T.WebGLRenderer({ canvas: canvas, antialias: !LQ, powerPreference: 'high-performance' });
    var ratio = LQ ? 0.5 : Math.min(window.devicePixelRatio || 1, 1.5);
    renderer.setPixelRatio(ratio);
    var scene = new T.Scene(), camera = new T.PerspectiveCamera(FOV, 16 / 9, 0.1, 330);
    scene.fog = new T.Fog(0xffffff, 80, 190);
    var hemi = new T.HemisphereLight(0xffffff, 0xc0b0d0, 1.9), sun = new T.DirectionalLight(0xffffff, 1.8);
    sun.position.set(-4, 10, 7);
    scene.add(hemi, sun);
    var C = new T.Color(), V = new T.Vector3(), V2 = new T.Vector3(), S3 = new T.Vector3(), Q = new T.Quaternion(), E = new T.Euler(), M = new T.Matrix4();
    var view = { renderer: renderer, scene: scene, camera: camera, calm: false };

    /* --------------------------------------------------- geometry helpers */
    // Low-poly primitives: hundreds of runners share the GPU of an old school PC.
    var SPH = new T.SphereGeometry(1, 12, 8), SPH_LO = new T.SphereGeometry(1, 7, 5), SPH_T = new T.SphereGeometry(1, 6, 4), CYL = new T.CylinderGeometry(1, 1, 1, 12, 1),
      CYL_BANDS = new T.CylinderGeometry(1, 1, 1, 10, 12), BOX = new T.BoxGeometry(1, 1, 1), CONE = new T.ConeGeometry(1, 1, 10), DOME = new T.SphereGeometry(1, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2),
      DISC = new T.CircleGeometry(1, 8);
    // A part: a base geometry moved, turned and scaled, with a colour (or a function
    // of a triangle's centre, for stripes and swirls).
    function P(geo, color, x, y, z, sx, sy, sz, rx, ry, rz) {
      var g = geo.index ? geo.toNonIndexed() : geo.clone();
      if (sy == null) sy = sx;
      if (sz == null) sz = sx;
      E.set(rx || 0, ry || 0, rz || 0); Q.setFromEuler(E); V.set(x || 0, y || 0, z || 0); S3.set(sx == null ? 1 : sx, sy == null ? 1 : sy, sz == null ? 1 : sz);
      M.compose(V, Q, S3); g.applyMatrix4(M);
      return { g: g, c: color };
    }
    function merge(parts) {
      var n = 0, o = 0;
      parts.forEach(function (p) { n += p.g.attributes.position.count; });
      var pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
      parts.forEach(function (p) {
        var a = p.g.attributes.position.array, b = p.g.attributes.normal.array, cnt = p.g.attributes.position.count;
        pos.set(a, o * 3); nor.set(b, o * 3);
        for (var t = 0; t < cnt; t += 3) {
          if (typeof p.c === 'function') {
            var cx = (a[t * 3] + a[t * 3 + 3] + a[t * 3 + 6]) / 3, cy = (a[t * 3 + 1] + a[t * 3 + 4] + a[t * 3 + 7]) / 3, cz = (a[t * 3 + 2] + a[t * 3 + 5] + a[t * 3 + 8]) / 3;
            C.setHex(p.c(cx, cy, cz));
          } else C.setHex(p.c);
          for (var k = 0; k < 3; k++) { var q = (o + t + k) * 3; col[q] = C.r; col[q + 1] = C.g; col[q + 2] = C.b; }
        }
        o += cnt; p.g.dispose();
      });
      var geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new T.BufferAttribute(nor, 3));
      geo.setAttribute('color', new T.BufferAttribute(col, 3));
      geo.computeBoundingSphere();
      return geo;
    }
    var LIT = new T.MeshLambertMaterial({ vertexColors: true });
    function inst(geo, cap, mat, colors) {
      var m = new T.InstancedMesh(geo, mat || LIT, cap);
      m.count = 0; m.frustumCulled = false;
      if (colors) { for (var i = 0; i < cap; i++) m.setColorAt(i, C.setHex(WHITE)); }
      scene.add(m);
      return m;
    }
    function put(m, i, x, y, z, sx, sy, sz, ry, rx, rz) {
      E.set(rx || 0, ry || 0, rz || 0); Q.setFromEuler(E); V.set(x, y, z); S3.set(sx, sy == null ? sx : sy, sz == null ? sx : sz);
      M.compose(V, Q, S3); m.setMatrixAt(i, M);
    }
    function hide(m, from) { m.count = from; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    function hash(i) { var x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
    var C2 = new T.Color();
    function mix(a, b, t) { return C.setHex(a).lerp(C2.setHex(b), t).getHex(); }
    function srgb(hex, out, o) { out[o] = ((hex >> 16) & 255) / 255; out[o + 1] = ((hex >> 8) & 255) / 255; out[o + 2] = (hex & 255) / 255; }

    /* --------------------------------------------------------------- sky */
    var skyGeo = new T.SphereGeometry(300, 24, 12), skyCol = new Float32Array(skyGeo.attributes.position.count * 3);
    skyGeo.setAttribute('color', new T.BufferAttribute(skyCol, 3));
    var sky = new T.Mesh(skyGeo, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide, fog: false, depthWrite: false }));
    sky.renderOrder = -10; scene.add(sky);
    function paintSky(top, bottom) {
      var a = skyGeo.attributes.position.array, c1 = new T.Color(top), c2 = new T.Color(bottom);
      for (var i = 0; i < a.length / 3; i++) {
        var k = Math.max(0, Math.min(1, a[i * 3 + 1] / 300 * 1.6 + 0.08));
        C.copy(c2).lerp(c1, k);
        skyCol[i * 3] = C.r; skyCol[i * 3 + 1] = C.g; skyCol[i * 3 + 2] = C.b;
      }
      skyGeo.attributes.color.needsUpdate = true;
    }

    /* ------------------------------------------------------------- worlds */
    var WORLD = [
      { sky: [0x62c6ff, 0xffe3f1], ground: 0x8fe39a, lanes: [0xffc6de, 0xffdced], edge: 0xff4f9a, base: 0xd94f8f, beam: 0xff6fae, props: ['lolly', 'gum', 'gem'] },
      { sky: [0x4cbcff, 0xfff0c4], ground: 0x78d65a, lanes: [0xffd696, 0xffe6b6], edge: 0xff8a3c, base: 0xd2702b, beam: 0xffa83c, props: ['tree', 'tree2', 'gum'] },
      { sky: [0x47b4ff, 0xd6faff], ground: 0x4fd9e8, lanes: [0xb6efff, 0xd2f6ff], edge: 0x2fa8e0, base: 0x2b82c2, beam: 0x4fc3ff, props: ['jelly', 'lolly2', 'gum'] },
      { sky: [0xff8fbe, 0xfff0d8], ground: 0xf3d2a2, lanes: [0xfff1d2, 0xffe2b8], edge: 0xb8693a, base: 0x8a4f2c, beam: 0xff7aa8, props: ['cake', 'cup', 'gum'] },
      { sky: [0x7f6bff, 0xffd8f4], ground: 0xc7b6ff, lanes: [0xdccfff, 0xece4ff], edge: 0xffc21a, base: 0x6f52f0, beam: 0xc77dff, props: ['cloud', 'arc', 'gem'] }
    ];
    var world = -1, W = WORLD[0];

    /* -------------------------------------------------------------- track */
    var LEN = 560, TW = LW * 3 + 1.2;
    var trackCanvas = document.createElement('canvas');
    trackCanvas.width = 128; trackCanvas.height = 128;
    var trackTex = new T.CanvasTexture(trackCanvas);
    trackTex.wrapS = T.ClampToEdgeWrapping; trackTex.wrapT = T.RepeatWrapping; trackTex.repeat.set(1, LEN / 6);
    trackTex.colorSpace = T.SRGBColorSpace;
    function paintTrack() {
      var g = trackCanvas.getContext('2d'), w = 128, lane = w * LW / TW, x0 = (w - lane * 3) / 2;
      g.fillStyle = '#' + W.edge.toString(16).padStart(6, '0'); g.fillRect(0, 0, w, 128);
      for (var l = 0; l < 3; l++) { g.fillStyle = '#' + W.lanes[l === 1 ? 1 : 0].toString(16).padStart(6, '0'); g.fillRect(x0 + l * lane, 0, lane, 128); }
      g.fillStyle = 'rgba(255,255,255,0.85)';
      for (l = 1; l < 3; l++) { g.fillRect(x0 + l * lane - 1.5, 0, 3, 64); }
      g.fillStyle = 'rgba(255,255,255,0.35)';
      for (l = 0; l < 3; l++) { g.beginPath(); g.arc(x0 + (l + 0.5) * lane, 96, 4, 0, 7); g.fill(); }
      trackTex.needsUpdate = true;
    }
    var trackGeo = new T.PlaneGeometry(TW, LEN); trackGeo.rotateX(-Math.PI / 2);
    var track = new T.Mesh(trackGeo, new T.MeshLambertMaterial({ map: trackTex }));
    track.position.set(0, 0, -LEN / 2 + 40); scene.add(track);
    var baseMat = new T.MeshLambertMaterial({ color: 0xffffff });
    var trackBase = new T.Mesh(new T.BoxGeometry(TW + 0.4, 1.4, LEN), baseMat);
    trackBase.position.set(0, -0.72, -LEN / 2 + 40); scene.add(trackBase);
    // Candy-striped kerbs.
    var kerbGeo = merge([P(new T.BoxGeometry(1, 1, 1, 1, 1, Math.round(LEN / 1.2)), function (x, y, z) { return Math.floor((z + 1000) / 1.2) % 2 ? WHITE : 0xff3b6b; }, 0, 0.16, 0, 0.36, 0.32, LEN)]);
    var kerbs = [new T.Mesh(kerbGeo, LIT), new T.Mesh(kerbGeo, LIT)];
    kerbs.forEach(function (k, i) { k.position.set(i ? TW / 2 + 0.05 : -TW / 2 - 0.05, 0, -LEN / 2 + 40); scene.add(k); });
    var groundMat = new T.MeshLambertMaterial({ color: 0xffffff });
    var ground = new T.Mesh(new T.PlaneGeometry(700, 700), groundMat);
    ground.rotation.x = -Math.PI / 2; ground.position.y = -2.2; scene.add(ground);
    // The lane the crowd is in glows from the crowd to the next row.
    var pathMat = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.32, depthWrite: false });
    var pathGeo = new T.PlaneGeometry(LW - 0.6, 1); pathGeo.rotateX(-Math.PI / 2); pathGeo.translate(0, 0.02, -0.5);
    var path = new T.Mesh(pathGeo, pathMat); path.renderOrder = 1; scene.add(path);

    /* ------------------------------------------------------------ scenery */
    var STRIPE = function (a, b, w) { return function (x, y) { return Math.floor((y + 50) / w) % 2 ? a : b; }; };
    var SWIRL = function (a, b) { return function (x, y, z) { var ang = Math.atan2(y, x), r = Math.sqrt(x * x + y * y); return Math.floor((ang / 6.283 + r * 0.9) * 6 + 60) % 2 ? a : b; }; };
    var PROP = {
      lolly: function () { return merge([P(CYL, WHITE, 0, 1.6, 0, 0.12, 3.2, 0.12), P(CYL, SWIRL(0xff4f9a, WHITE), 0, 3.9, 0, 1.25, 0.32, 1.25, Math.PI / 2)]); },
      lolly2: function () { return merge([P(CYL, WHITE, 0, 1.6, 0, 0.12, 3.2, 0.12), P(CYL, SWIRL(0x2fb6ff, 0xb8f3ff), 0, 3.9, 0, 1.25, 0.32, 1.25, Math.PI / 2)]); },
      gum: function () { var c = [0xff5a7a, 0x5be38f, 0xffd23f, 0x6fb8ff, 0xc77dff]; return merge([P(DOME, c[0], -1.2, 0, 0, 1.2, 1.3, 1.2), P(DOME, c[2], 0.9, 0, 0.6, 1, 1.1, 1), P(DOME, c[3], 0.2, 0, -1.1, 0.8, 0.9, 0.8), P(SPH_LO, WHITE, -1.2, 1.25, 0.4, 0.12), P(SPH_LO, WHITE, 0.7, 1.05, 1.1, 0.1)]); },
      gem: function () { return merge([P(new T.OctahedronGeometry(1, 0), 0x9ff0ff, 0, 1.6, 0, 0.9, 1.6, 0.9), P(new T.OctahedronGeometry(1, 0), 0xff9ae0, 1.3, 0.8, 0.4, 0.5, 0.9, 0.5), P(new T.OctahedronGeometry(1, 0), 0xfff08a, -1.1, 0.7, 0.3, 0.45, 0.8, 0.45)]); },
      tree: function () { return merge([P(CYL, 0xffffff, 0, 1.8, 0, 0.18, 3.6, 0.18), P(SPH, SWIRL(0xff8a3c, 0xffd23f), 0, 4.6, 0, 1.7, 1.7, 1.2)]); },
      tree2: function () { return merge([P(CYL, 0xffffff, 0, 1.4, 0, 0.16, 2.8, 0.16), P(SPH, SWIRL(0x3fcf5c, 0xc6ff8a), 0, 3.7, 0, 1.4, 1.4, 1)]); },
      jelly: function () { return merge([P(BOX, 0x4fe3c1, 0, 0.9, 0, 1.8, 1.8, 1.8), P(BOX, 0xbafff0, -0.45, 1.4, 0.91, 0.4, 0.5, 0.02), P(BOX, 0xff6fae, 2.1, 0.6, 0.4, 1.2, 1.2, 1.2), P(BOX, 0xffc0dc, 1.85, 0.95, 1.01, 0.3, 0.3, 0.02)]); },
      cake: function () { return merge([P(CYL, 0xf7d9a8, 0, 0.9, 0, 2, 1.8, 2), P(CYL, 0xff8fb8, 0, 1.85, 0, 2.06, 0.2, 2.06), P(CYL, 0xf7d9a8, 0, 2.7, 0, 1.4, 1.5, 1.4), P(CYL, WHITE, 0, 3.5, 0, 1.46, 0.2, 1.46), P(SPH_LO, 0xff3b52, 0, 3.8, 0, 0.35)]); },
      cup: function () { return merge([P(CYL, STRIPE(0x6fb8ff, 0xb9dcff, 0.25), 0, 0.6, 0, 0.9, 1.2, 0.9), P(SPH, 0xffe9f2, 0, 1.3, 0, 1.05, 0.75, 1.05), P(SPH_LO, 0xff3b52, 0, 2.05, 0, 0.25)]); },
      cloud: function () { return merge([P(SPH_LO, WHITE, 0, 1.4, 0, 1.6, 1.1, 1.2), P(SPH_LO, WHITE, 1.5, 1.1, 0.2, 1.1, 0.85, 1), P(SPH_LO, WHITE, -1.4, 1, 0, 1.2, 0.8, 1), P(SPH_LO, 0xffe6fb, 0.4, 0.6, 0.5, 1.4, 0.6, 1)]); },
      arc: function () {
        var cols = [0xff5a5a, 0xffa83c, 0xffe14d, 0x5be38f, 0x4fb8ff, 0xa77bff], parts = [];
        cols.forEach(function (c, i) { parts.push(P(new T.TorusGeometry(3.4 - i * 0.32, 0.17, 6, 24, Math.PI), c, 0, 0, 0)); });
        return merge(parts);
      }
    };
    var PROPS_N = LQ ? 8 : 18, propMeshes = [];
    for (var pi = 0; pi < 3; pi++) propMeshes.push(inst(new T.BufferGeometry(), PROPS_N));
    var clouds = inst(PROP.cloud(), LQ ? 4 : 10);

    /* ------------------------------------------------------- glyph atlas */
    // Digits, + − × ÷ = ? and a few whole Arabic words, drawn once (and again when the
    // font arrives). Labels are rows of instanced quads that sample their cell.
    var CELL_W = 96, CELL_H = 128, ATLAS_W = 1024, ATLAS_H = 512;
    var CHARS = '0123456789+' + MG.MINUS + '×÷=?', WORDS = ['صح!', 'النهاية'];
    var atlas = document.createElement('canvas');
    atlas.width = ATLAS_W; atlas.height = ATLAS_H;
    var atlasTex = new T.CanvasTexture(atlas);
    atlasTex.generateMipmaps = true; atlasTex.minFilter = T.LinearMipmapLinearFilter; atlasTex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    var META = {};
    function bakeAtlas() {
      var g = atlas.getContext('2d');
      g.clearRect(0, 0, ATLAS_W, ATLAS_H);
      g.lineJoin = 'round'; g.textBaseline = 'middle'; g.textAlign = 'center';
      function cell(key, x, y, w, size, rtl) {
        g.font = '700 ' + size + 'px Fredoka, "Segoe UI", Tahoma, sans-serif';
        g.direction = rtl ? 'rtl' : 'ltr';
        var adv = Math.min(w - 8, g.measureText(key).width + 18), cx = x + w / 2, cy = y + CELL_H / 2 + 4;
        g.lineWidth = 16; g.strokeStyle = '#2a2140'; g.strokeText(key, cx, cy);
        g.fillStyle = '#ffffff'; g.fillText(key, cx, cy);
        META[key] = { u0: (cx - adv / 2) / ATLAS_W, u1: (cx + adv / 2) / ATLAS_W, v0: 1 - (y + CELL_H) / ATLAS_H, v1: 1 - y / ATLAS_H, w: adv / CELL_H };
      }
      for (var i = 0; i < CHARS.length; i++) cell(CHARS[i], (i % 10) * CELL_W, Math.floor(i / 10) * CELL_H, CELL_W, 104);
      WORDS.forEach(function (w, k) { cell(w, k * 480, 2 * CELL_H, 480, 92, true); });
      META[' '] = { u0: 0, u1: 0, v0: 0, v1: 0, w: 0.36, blank: true };
      atlasTex.needsUpdate = true;
    }
    bakeAtlas();
    view.rebake = function () { bakeAtlas(); paintBanner(); };
    var GL_N = 300, quad = new T.PlaneGeometry(1, 1);
    var aCell = new T.InstancedBufferAttribute(new Float32Array(GL_N * 4), 4), aTint = new T.InstancedBufferAttribute(new Float32Array(GL_N * 3), 3);
    aCell.setUsage(T.DynamicDrawUsage); aTint.setUsage(T.DynamicDrawUsage);
    quad.setAttribute('aCell', aCell); quad.setAttribute('aTint', aTint);
    var glyphMat = new T.ShaderMaterial({
      uniforms: { map: { value: atlasTex } }, transparent: true, depthWrite: false,
      vertexShader: 'attribute vec4 aCell; attribute vec3 aTint; varying vec2 vUv; varying vec3 vTint;' +
        'void main(){ vUv = aCell.xy + uv * aCell.zw; vTint = aTint; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform sampler2D map; varying vec2 vUv; varying vec3 vTint;' +
        'void main(){ vec4 c = texture2D(map, vUv); if (c.a < 0.04) discard; gl_FragColor = vec4(c.rgb * vTint, c.a); }'
    });
    var glyphs = new T.InstancedMesh(quad, glyphMat, GL_N);
    glyphs.count = 0; glyphs.frustumCulled = false; glyphs.renderOrder = 6; scene.add(glyphs);
    var gi = 0;
    // Draws text (Western digits and signs, or one whole word) centred at x, y, z, h m tall.
    function text(str, x, y, z, h, tint, k) {
      k = k == null ? 1 : k;
      if (k <= 0.01) return;
      h *= k;
      var keys = META[str] ? [str] : str.split(''), wsum = 0, i, kern = -0.12;
      for (i = 0; i < keys.length; i++) wsum += (META[keys[i]] || META['?']).w + (i ? kern : 0);
      var px = x - wsum * h / 2;
      for (i = 0; i < keys.length; i++) {
        var m = META[keys[i]] || META['?'];
        if (i) px += kern * h;
        if (!m.blank && gi < GL_N) {
          put(glyphs, gi, px + m.w * h / 2, y, z, m.w * h, h, 1);
          aCell.array[gi * 4] = m.u0; aCell.array[gi * 4 + 1] = m.v0; aCell.array[gi * 4 + 2] = m.u1 - m.u0; aCell.array[gi * 4 + 3] = m.v1 - m.v0;
          srgb(tint, aTint.array, gi * 3);
          gi++;
        }
        px += m.w * h;
      }
    }

    /* ------------------------------------------------------------ runners */
    // A round candy runner, facing −z (away from the camera while it runs). The body is
    // tinted per runner; the face, sneakers and pom-pom tail are one second mesh.
    // About 400 triangles a runner: a lighter belly in the body's own colours, flat discs
    // for pupils, shines, cheeks and the mouth.
    function bodyGeo() { return merge([P(new T.SphereGeometry(1, 11, 8), function (x, y, z) { return z < -0.16 && y < 0.5 && y > 0.12 ? WHITE : 0xe2e2e2; }, 0, 0.36, 0, 0.3, 0.33, 0.29)]); }
    function faceGeo(rival) {
      var parts = [], F = Math.PI;
      [-1, 1].forEach(function (s) {
        parts.push(P(SPH_T, WHITE, s * 0.1, 0.45, -0.235, 0.085, 0.1, 0.06), P(DISC, INK, s * 0.1, 0.44, -0.296, 0.046, 0.058, 1, 0, F),
          P(DISC, WHITE, s * 0.085, 0.465, -0.298, 0.017, 0.017, 1, 0, F), P(SPH_T, WHITE, s * 0.12, 0.05, -0.04, 0.1, 0.065, 0.135));
        if (rival) parts.push(P(BOX, INK, s * 0.1, 0.56, -0.25, 0.11, 0.03, 0.03, 0, 0, -s * 0.35));
        else parts.push(P(DISC, 0xff8fb0, s * 0.19, 0.36, -0.232, 0.05, 0.035, 1, 0, F + s * 0.6));
      });
      parts.push(P(DISC, INK, 0, 0.35, -0.292, 0.04, 0.02, 1, 0, F), P(SPH_T, rival ? 0xffd23f : WHITE, 0, 0.24, 0.29, 0.065));
      return merge(parts);
    }
    var HATS = {
      none: function () { return []; },
      party: function () { return [P(CONE, STRIPE(0x7a5cff, 0xffd23f, 0.07), 0, 0.82, 0, 0.13, 0.3, 0.13, 0, 0, 0.12), P(SPH_T, 0xff4f9a, -0.02, 0.98, 0, 0.05)]; },
      bow: function () { return [P(SPH_T, 0xff4f9a, 0.13, 0.66, 0, 0.09, 0.07, 0.04, 0, 0.3, 0.6), P(SPH_T, 0xff4f9a, 0.04, 0.7, 0, 0.09, 0.07, 0.04, 0, 0.3, -0.6), P(SPH_T, 0xff86c0, 0.085, 0.68, 0, 0.04)]; },
      cap: function () { return [P(DOME, 0xff4b4b, 0, 0.58, 0, 0.25, 0.17, 0.24), P(CYL, 0xff4b4b, 0, 0.6, -0.2, 0.18, 0.025, 0.14), P(SPH_T, WHITE, 0, 0.75, 0, 0.03)]; },
      crown: function () {
        var l = [P(CYL, 0xffc21a, 0, 0.67, 0, 0.16, 0.1, 0.16)];
        for (var i = 0; i < 5; i++) { var a = i / 5 * 6.283; l.push(P(CONE, 0xffc21a, Math.cos(a) * 0.13, 0.77, Math.sin(a) * 0.13, 0.04, 0.1, 0.04)); }
        l.push(P(SPH_T, 0xff3b6b, 0, 0.67, -0.16, 0.035));
        return l;
      },
      flower: function () {
        var l = [P(SPH_T, 0xffd23f, 0, 0.7, 0, 0.06)];
        for (var i = 0; i < 6; i++) { var a = i / 6 * 6.283; l.push(P(SPH_T, 0xff86c0, Math.cos(a) * 0.09, 0.69, Math.sin(a) * 0.09, 0.055, 0.03, 0.055)); }
        l.push(P(CYL, 0x3fcf5c, 0, 0.64, 0, 0.012, 0.08, 0.012));
        return l;
      },
      wizard: function () { return [P(CYL, 0x5b3fd1, 0, 0.62, 0, 0.27, 0.03, 0.27), P(CONE, 0x6b4fe6, 0, 0.84, 0, 0.17, 0.42, 0.17, 0.2), P(SPH_T, 0xffe14d, 0.05, 0.8, -0.12, 0.03), P(SPH_T, 0xffe14d, -0.06, 0.9, -0.07, 0.022)]; },
      propeller: function () { return [P(DOME, STRIPE(0xff4b4b, 0xffd23f, 0.05), 0, 0.6, 0, 0.23, 0.15, 0.22), P(CYL, INK, 0, 0.78, 0, 0.012, 0.08, 0.012), P(BOX, 0x4fb8ff, 0, 0.82, 0, 0.36, 0.015, 0.06, 0, 0.5)]; }
    };
    var CAP = MG.CAP, crowd = makeCrowd(false, CAP), rival = makeCrowd(true, CAP);
    function makeCrowd(isRival, cap) {
      var bodyMat = new T.MeshLambertMaterial({ vertexColors: true });
      var c = {
        body: inst(bodyGeo(), cap, bodyMat, true), face: inst(faceGeo(isRival), cap), hat: isRival ? null : inst(new T.BufferGeometry(), cap),
        x: new Float32Array(cap), z: new Float32Array(cap), born: new Float32Array(cap), die: new Float32Array(cap), ph: new Float32Array(cap),
        dx: new Float32Array(cap), dz: new Float32Array(cap), alive: 0, cap: cap, rival: isRival
      };
      for (var i = 0; i < cap; i++) {
        // A sunflower: the first runners in the middle, the newest at the edge.
        var r = 0.42 * Math.sqrt(i + 0.6), a = i * 2.39996;
        c.dx[i] = Math.cos(a) * r * 0.86 + (hash(i) - 0.5) * 0.1; c.dz[i] = Math.sin(a) * r * 1.12 + (hash(i + 9) - 0.5) * 0.1;
        c.ph[i] = hash(i + 3) * 6.283; c.die[i] = -9; c.born[i] = -9;
        c.x[i] = c.dx[i]; c.z[i] = c.dz[i];
      }
      if (isRival) for (i = 0; i < cap; i++) c.body.setColorAt(i, C.setHex(i % 3 ? 0x8e6bd6 : 0x7a58c8));
      return c;
    }
    var RAINBOW = [0xff5a7a, 0xffa83c, 0xffd23f, 0x5be38f, 0x4fb8ff, 0xa77bff];
    view.setLook = function (colorIndex, hatIndex) {
      var col = MG.COLORS[colorIndex] || MG.COLORS[0], hat = MG.HATS[hatIndex] || MG.HATS[0];
      for (var i = 0; i < CAP; i++) {
        var hex = col.c < 0 ? RAINBOW[i % RAINBOW.length] : mix(col.c, i % 4 ? col.c : WHITE, i % 4 ? 0 : 0.12);
        crowd.body.setColorAt(i, C.setHex(hex));
      }
      crowd.body.instanceColor.needsUpdate = true;
      var parts = (HATS[hat.id] || HATS.none)();
      crowd.hat.geometry.dispose();
      crowd.hat.geometry = parts.length ? merge(parts) : new T.BufferGeometry();
      crowd.hat.visible = parts.length > 0;
    };
    // n runners from now on: new ones pop in, the last ones pop out (with confetti).
    function setAlive(c, n, now, cx, cz, yaw, burstColor) {
      n = Math.max(0, Math.min(c.cap, n));
      var i, popped = 0;
      if (n > c.alive) {
        for (i = c.alive; i < n; i++) { c.born[i] = now + (i - c.alive) * Math.min(0.012, 0.4 / (n - c.alive + 1)); c.die[i] = -9; c.x[i] = c.dx[i]; c.z[i] = c.dz[i]; }
      } else if (n < c.alive) {
        for (i = c.alive - 1; i >= n; i--) {
          c.die[i] = now + (c.alive - 1 - i) * Math.min(0.01, 0.35 / (c.alive - n + 1));
          if (popped++ < 14) burst(cx + rot(c.x[i], c.z[i], yaw, 0), 0.5, cz + rot(c.x[i], c.z[i], yaw, 1), { count: 3, colors: burstColor, speed: 3, life: 0.6, size: 0.12 });
        }
      }
      c.alive = n;
    }
    var ZERO = new T.Matrix4().makeScale(0, 0, 0);
    function hideRunner(c, i) { c.body.setMatrixAt(i, ZERO); c.face.setMatrixAt(i, ZERO); if (c.hat) c.hat.setMatrixAt(i, ZERO); }
    function rot(x, z, yaw, which) { var s = Math.sin(yaw), co = Math.cos(yaw); return which ? -x * s + z * co : x * co + z * s; }
    // Places a crowd: centre (cx, cy, cz), facing yaw (0: −z), size factor, mode flags.
    function drawCrowd(c, cx, cy, cz, yaw, now, dt, o) {
      var n = 0, spread = o.spread || 1, sc = o.scale || 1, lean = view.calm ? 0 : (o.lean || 0), run = o.run && !view.calm, hop = o.hop && !view.calm, top = 0;
      var k = 1 - Math.exp(-dt * 9), i;
      for (i = c.cap - 1; i >= c.alive; i--) if (c.die[i] > -9 && now - c.die[i] < 0.3) break;
      top = Math.max(c.alive, i + 1);
      for (i = 0; i < top; i++) {
        var alive = i < c.alive, dying = !alive && c.die[i] > -9 && now - c.die[i] < 0.3;
        if (!alive && !dying) { hideRunner(c, i); continue; }
        // Runners trail behind a lane change a little, the outer ones more.
        var tx = c.dx[i] * spread, tz = c.dz[i] * spread;
        c.x[i] += (tx - c.x[i]) * k; c.z[i] += (tz - c.z[i]) * k;
        var s = sc, t0;
        if (dying) { t0 = now - c.die[i]; s *= t0 < 0 ? 1 : t0 < 0.1 ? 1 + t0 * 3 : Math.max(0, 1.3 - (t0 - 0.1) * 6.5); }
        else if (!view.calm && (t0 = now - c.born[i]) < 0.3) s *= t0 < 0 ? 0 : t0 < 0.18 ? t0 / 0.18 * 1.25 : 1.25 - (t0 - 0.18) * 2.1;
        if (s <= 0.001) { hideRunner(c, i); continue; }
        var ph = c.ph[i], b = run ? Math.abs(Math.sin(now * 11 + ph)) : hop ? Math.max(0, Math.sin(now * 5 + ph)) : 0;
        var y = cy + b * (run ? 0.13 : 0.3) * sc, sq = 1 + (run ? (b - 0.5) * 0.12 : 0);
        var lx = cx + rot(c.x[i], c.z[i], yaw, 0) - (run ? lean * 0.25 * (c.z[i] + 1.5) : 0), lz = cz + rot(c.x[i], c.z[i], yaw, 1);
        E.set(0, yaw + (o.look && !view.calm ? Math.sin(now * 1.3 + ph) * 0.35 : 0), -lean * 0.3); Q.setFromEuler(E);
        V.set(lx, y, lz); S3.set(s * (2 - sq), s * sq, s * (2 - sq));
        M.compose(V, Q, S3);
        c.body.setMatrixAt(i, M); c.face.setMatrixAt(i, M); if (c.hat) c.hat.setMatrixAt(i, M);
        n++;
      }
      [c.body, c.face, c.hat].forEach(function (m) { if (m) { m.count = top; m.instanceMatrix.needsUpdate = true; } });
      return n;
    }

    /* -------------------------------------------------------------- gates */
    var PH = GY + GH / 2 + 0.55;
    var postGeo = merge([P(CYL_BANDS, function (x, y) { return Math.floor(y / 0.45 + 20) % 2 ? WHITE : 0xff4f9a; }, 0, PH / 2, 0, 0.24, PH, 0.24), P(SPH, 0xffd23f, 0, PH + 0.15, 0, 0.38), P(CYL, WHITE, 0, 0.06, 0, 0.5, 0.12, 0.5)]);
    var posts = inst(postGeo, 24);
    var beams = inst(merge([P(BOX, WHITE, 0, GY + GH / 2 + 0.32, 0, LW * 3 + 0.4, 0.5, 0.42)]), 6, new T.MeshLambertMaterial({ vertexColors: true }), true);
    var panelMat = new T.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.86, depthWrite: false, emissive: 0x222222 });
    var panels = inst(merge([P(BOX, WHITE, 0, 0, 0, LW - 0.36, GH, 0.12)]), 15, panelMat, true);
    panels.renderOrder = 2;
    var FW = LW - 0.2, frameGeo = merge([P(BOX, WHITE, 0, GH / 2 + 0.05, 0, FW, 0.16, 0.2), P(BOX, WHITE, 0, -GH / 2 - 0.05, 0, FW, 0.16, 0.2), P(BOX, WHITE, -FW / 2 + 0.08, 0, 0, 0.16, GH + 0.26, 0.2), P(BOX, WHITE, FW / 2 - 0.08, 0, 0, 0.16, GH + 0.26, 0.2)]);
    var frames = inst(frameGeo, 15);
    var bubbleGeo = merge([P(BOX, WHITE, 0, 0, 0, 1, 1, 0.2), P(BOX, 0xffd23f, 0, 0, -0.02, 1.04, 1.08, 0.16), P(BOX, WHITE, -0.33, -0.75, 0, 0.03, 0.5, 0.1), P(BOX, WHITE, 0.33, -0.75, 0, 0.03, 0.5, 0.1)]);
    var bubbles = inst(bubbleGeo, 3, new T.MeshLambertMaterial({ vertexColors: true, emissive: 0x333333 }));
    var OPC = { '+': 0x45cf6a, '×': 0x3f9cff, '÷': 0xb06bff };
    OPC[MG.MINUS] = 0xff6464;
    var LANE_C = [0x2fc0e8, 0xff9f2e, 0xc06bff];
    var anim = {}; // row index -> { t, lane, good }

    /* -------------------------------------------------- obstacles, coins */
    var RL = LW * 2 - 0.4;
    var rollerGeo = merge([P(CYL_BANDS, function (x, y, z) { return Math.floor((Math.atan2(y, z) / 6.283 + 1) * 8) % 2 ? WHITE : 0xff6fae; }, 0, 0, 0, 0.8, RL, 0.8, 0, 0, Math.PI / 2),
      P(CYL, 0xffd23f, -RL / 2, 0, 0, 0.56, 0.22, 0.56, 0, 0, Math.PI / 2), P(CYL, 0xffd23f, RL / 2, 0, 0, 0.56, 0.22, 0.56, 0, 0, Math.PI / 2)]);
    var rollers = inst(rollerGeo, 8);
    var rollerFeet = inst(merge([P(CYL, 0xffffff, -RL / 2 - 0.15, 0.6, 0, 0.13, 1.2, 0.13), P(CYL, 0xffffff, RL / 2 + 0.15, 0.6, 0, 0.13, 1.2, 0.13), P(SPH_LO, 0xffd23f, -RL / 2 - 0.15, 1.2, 0, 0.22), P(SPH_LO, 0xffd23f, RL / 2 + 0.15, 1.2, 0, 0.22)]), 8);
    var pillarGeo = merge([P(CYL, WHITE, 0, 0.08, 0, 1.15, 0.16, 1.15), P(CYL_BANDS, function (x, y) { return Math.floor(y / 0.38 + 20) % 2 ? 0x4fd6e0 : 0xb8fbff; }, 0, 0.8, 0, 0.82, 1.6, 0.82), P(SPH, 0x4fd6e0, 0, 1.6, 0, 0.82, 0.55, 0.82),
      P(SPH_LO, WHITE, -0.27, 1.25, 0.72, 0.17, 0.2, 0.1), P(SPH_LO, WHITE, 0.27, 1.25, 0.72, 0.17, 0.2, 0.1), P(SPH_LO, INK, -0.25, 1.22, 0.8, 0.08, 0.1, 0.05), P(SPH_LO, INK, 0.29, 1.22, 0.8, 0.08, 0.1, 0.05),
      P(SPH_LO, 0xff8fb0, -0.5, 1.0, 0.62, 0.1, 0.06, 0.04), P(SPH_LO, 0xff8fb0, 0.5, 1.0, 0.62, 0.1, 0.06, 0.04), P(SPH_LO, INK, 0, 0.98, 0.8, 0.1, 0.04, 0.03)]);
    var pillars = inst(pillarGeo, 8);
    var coinGeo = merge([P(CYL, 0xffb81a, 0, 0, 0, 0.42, 0.1, 0.42, Math.PI / 2), P(CYL, 0xffe14d, 0, 0, 0, 0.33, 0.12, 0.33, Math.PI / 2), P(BOX, 0xfff6b0, 0, 0, 0, 0.08, 0.32, 0.13)]);
    var coins = inst(coinGeo, 48);
    var coinFly = []; // { x, z, t }

    /* ----------------------------------------------- finish and staircase */
    var bannerCanvas = document.createElement('canvas');
    bannerCanvas.width = 512; bannerCanvas.height = 128;
    var bannerTex = new T.CanvasTexture(bannerCanvas); bannerTex.colorSpace = T.SRGBColorSpace;
    function paintBanner() {
      var g = bannerCanvas.getContext('2d');
      for (var x = 0; x < 32; x++) for (var y = 0; y < 8; y++) { g.fillStyle = (x + y) % 2 ? '#2a2140' : '#ffffff'; g.fillRect(x * 16, y * 16, 16, 16); }
      g.fillStyle = '#ffd23f'; g.strokeStyle = '#2a2140'; g.lineWidth = 6;
      g.beginPath(); g.roundRect ? g.roundRect(96, 18, 320, 92, 40) : g.rect(96, 18, 320, 92); g.fill(); g.stroke();
      g.font = '700 64px Fredoka, "Segoe UI", Tahoma, sans-serif'; g.direction = 'rtl'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#2a2140'; g.fillText('النهاية', 256, 68);
      bannerTex.needsUpdate = true;
    }
    paintBanner();
    var arch = new T.Group();
    var AX = LW * 1.5 + 0.7, ABAND = function (x, y) { return Math.floor(y / 0.55 + 20) % 2 ? WHITE : 0xff4f9a; };
    var archPosts = new T.Mesh(merge([P(CYL_BANDS, ABAND, -AX, 3.1, 0, 0.38, 6.2, 0.38), P(CYL_BANDS, ABAND, AX, 3.1, 0, 0.38, 6.2, 0.38), P(SPH, 0xffd23f, -AX, 6.4, 0, 0.6), P(SPH, 0xffd23f, AX, 6.4, 0, 0.6)]), LIT);
    var archBanner = new T.Mesh(new T.PlaneGeometry(AX * 2 - 0.6, 3.4), new T.MeshLambertMaterial({ map: bannerTex, side: T.DoubleSide }));
    archBanner.position.set(0, 5.4, 0);
    arch.add(archPosts, archBanner); scene.add(arch);
    var stepGeo = merge([P(BOX, WHITE, 0, -0.25, 0, LW * 3, 0.5, 1.7)]);
    var steps = inst(stepGeo, MG.STEPS, new T.MeshLambertMaterial({ vertexColors: true }), true);
    var STEP_C = [0xff5a7a, 0xff8a3c, 0xffc21a, 0xd6e83a, 0x5be38f, 0x2fd6c8, 0x4fb8ff, 0x6f7bff, 0xa77bff, 0xff6fd8];
    STEP_C.forEach(function (c, i) { steps.setColorAt(i, C.setHex(c)); });
    var trophy = new T.Mesh(merge([P(CYL, 0xb98cff, 0, -4.1, 0, 1.1, 8.2, 1.1), P(CYL, WHITE, 0, -0.06, 0, 1.2, 0.12, 1.2), P(CYL, 0xffc21a, 0, 0.15, 0, 0.6, 0.3, 0.6), P(CYL, 0xffb000, 0, 0.6, 0, 0.18, 0.7, 0.18), P(SPH, 0xffc21a, 0, 1.45, 0, 0.75, 0.7, 0.75), P(CYL, 0xffe14d, 0, 1.95, 0, 0.78, 0.12, 0.78),
      P(new T.TorusGeometry(0.35, 0.08, 6, 16), 0xffc21a, 0.85, 1.5, 0, 1, 1, 1), P(new T.TorusGeometry(0.35, 0.08, 6, 16), 0xffc21a, -0.85, 1.5, 0, 1, 1, 1)]), LIT);
    scene.add(trophy);
    view.STEP_D = 12; view.STEP_DEPTH = 1.7; view.STEP_H = 0.8;
    var shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = shadowCanvas.height = 64;
    (function () { var g = shadowCanvas.getContext('2d'), gr = g.createRadialGradient(32, 32, 2, 32, 32, 31); gr.addColorStop(0, 'rgba(40,20,70,0.55)'); gr.addColorStop(1, 'rgba(40,20,70,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); })();
    var shadowGeo = new T.PlaneGeometry(1, 1); shadowGeo.rotateX(-Math.PI / 2);
    var shadows = inst(shadowGeo, 24, new T.MeshBasicMaterial({ map: new T.CanvasTexture(shadowCanvas), transparent: true, depthWrite: false }));
    shadows.renderOrder = 1;

    /* ------------------------------------------------------------ confetti */
    var CN = LQ ? 80 : 260, conf = inst(new T.PlaneGeometry(0.16, 0.24), CN, new T.MeshBasicMaterial({ color: 0xffffff, side: T.DoubleSide, fog: false }), true);
    var cp = []; for (var ci = 0; ci < CN; ci++) cp.push({ life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, r: 0, vr: 0, s: 1, g: 9 });
    var cNext = 0;
    var CONF = [0xff5a7a, 0xffd23f, 0x4fb8ff, 0x5be38f, 0xffffff, 0xc77dff, 0xff9a3c];
    function burst(x, y, z, o) {
      if (view.calm) return;
      o = o || {};
      var n = o.count || 20, cols = o.colors || CONF;
      for (var i = 0; i < n; i++) {
        var pi2 = cNext, p = cp[pi2]; cNext = (cNext + 1) % CN;
        var a = Math.random() * 6.283, sp = (o.speed || 5) * (0.4 + Math.random() * 0.6);
        p.x = x; p.y = y; p.z = z; p.vx = Math.cos(a) * sp; p.vz = Math.sin(a) * sp * 0.7; p.vy = (o.up || 0.6) * sp + Math.random() * 2;
        p.life = (o.life || 1.1) * (0.6 + Math.random() * 0.4); p.r = Math.random() * 6; p.vr = (Math.random() - 0.5) * 14; p.s = (o.size || 0.2) / 0.2; p.g = o.gravity == null ? 9 : o.gravity;
        conf.setColorAt(pi2, C.setHex(cols[(Math.random() * cols.length) | 0]));
      }
      conf.instanceColor.needsUpdate = true;
    }
    view.burst = burst;
    function stepConfetti(dt) {
      var top = 0;
      for (var i = 0; i < CN; i++) {
        var p = cp[i];
        if (p.life <= 0) { put(conf, i, 0, -60, 0, 0); continue; }
        p.life -= dt; p.vy -= p.g * dt; p.vx *= 1 - dt * 1.2; p.vz *= 1 - dt * 1.2;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.r += p.vr * dt;
        if (p.y < 0.05 && p.vy < 0) { p.y = 0.05; p.vy *= -0.3; p.vx *= 0.5; p.vz *= 0.5; }
        var s = p.s * Math.min(1, p.life * 3);
        put(conf, i, p.x, p.y, p.z, s, s, s, p.r, p.r * 0.7, 0);
        top = i + 1;
      }
      conf.count = top; conf.instanceMatrix.needsUpdate = true;
    }

    /* -------------------------------------------------------------- worlds */
    view.setWorld = function (w) {
      w = Math.max(0, Math.min(4, w | 0));
      if (w === world) return;
      world = w; W = WORLD[w];
      paintSky(W.sky[0], W.sky[1]);
      scene.fog.color.setHex(W.sky[1]);
      groundMat.color.setHex(W.ground);
      baseMat.color.setHex(W.base);
      paintTrack();
      for (var i = 0; i < 6; i++) beams.setColorAt(i, C.setHex(W.beam));
      beams.instanceColor.needsUpdate = true;
      W.props.forEach(function (id, k) { propMeshes[k].geometry.dispose(); propMeshes[k].geometry = PROP[id](); });
      clouds.visible = w !== 4;
    };
    view.setWorld(0);
    view.setLook(0, 0);

    /* ------------------------------------------------------------- camera */
    var cam = { x: 0, y: 6, z: 10, lx: 0, ly: 0, lz: -10, shake: 0 };
    view.shake = function (p) { if (!view.calm) cam.shake = Math.max(cam.shake, p); };
    view.project = function (x, y, z) { V2.set(x, y, z).project(camera); return { x: (V2.x + 1) / 2, y: (1 - V2.y) / 2, behind: V2.z > 1 }; };
    // The lane under a point of the screen (0..1), measured on the track a little ahead of the crowd.
    var laneD = 0;
    view.laneAt = function (nx) {
      var best = 1, bd = Infinity;
      for (var l = 0; l < 3; l++) { var p = view.project(MG.laneX(l), 0, -(laneD + 5)), d = Math.abs(p.x - nx); if (d < bd) { bd = d; best = l; } }
      return best;
    };
    view.lanePoint = function (l) { return view.project(MG.laneX(l), 0, -(laneD + 5)); };

    /* -------------------------------------------------------------- frame */
    var lastAlive = -1, lastRival = -1, runRef = null, seen = { count: -1 };
    // A new run (or the menu run): everything placed fresh.
    view.reset = function (run) {
      runRef = run;
      anim = {}; coinFly.length = 0;
      crowd.alive = 0; rival.alive = 0; lastAlive = lastRival = -1;
      for (var i = 0; i < CAP; i++) { crowd.die[i] = rival.die[i] = -9; }
      for (i = 0; i < CN; i++) cp[i].life = 0;
      arch.position.set(0, 0, -(run.battleD - 14));
      view.setWorld(run.world);
    };
    view.gatePop = function (row, lane, good) { anim[row] = { t: 0, lane: lane, good: good }; };
    view.coinGot = function (coin) { coinFly.push({ x: MG.laneX(coin.lane), z: -coin.d, t: 0 }); if (coinFly.length > 12) coinFly.shift(); };
    var bump = {};
    view.knock = function (id) { bump[id] = 0; };

    // ctx: { mode: 'play' | 'menu' | 'wardrobe', run, dt, t, tier, lane }
    view.update = function (ctx) {
      var run = ctx.run, dt = Math.min(0.1, ctx.dt), t = ctx.t, mode = ctx.mode, calm = view.calm;
      if (!run) return;
      gi = 0;
      var d = run.d, cx = run.x, phase = run.phase, B = run.battle, St = run.stairs;
      laneD = d;
      // ---- the crowd
      var count = phase === 'battle' && B ? B.ours : run.count, show = Math.min(CAP, count);
      if (mode === 'wardrobe') show = 9;
      else if (mode === 'menu') show = Math.min(CAP, Math.max(8, count));
      var yaw = mode === 'play' ? 0 : Math.PI, cy = 0, cz = -d;
      if (St && phase !== 'battle') {
        // Up the staircase: one step every STEP_S seconds; a few runners stay on each step.
        var sd0 = run.battleD + view.STEP_D, k = Math.min(St.goal, St.t / MG.STEP_S), kk = Math.floor(k);
        cz = -(d + (sd0 - d) * Math.min(1, k)) - Math.max(0, k - 1) * view.STEP_DEPTH;
        cy = k * view.STEP_H + (calm || k >= St.goal ? 0 : Math.sin((k % 1) * Math.PI) * 0.3);
        show = Math.min(CAP, Math.max(1, Math.floor(St.left - Math.min(St.goal - 1, kk) * St.cost)));
        cx *= Math.max(0, 1 - St.t * 3);
      }
      if (show !== lastAlive) {
        if (lastAlive < 0) { crowd.alive = show; for (var b0 = 0; b0 < show; b0++) crowd.born[b0] = -9; }
        else setAlive(crowd, show, t, cx, cz, yaw, [0xffffff, 0xffd23f, 0xff8fc6]);
        lastAlive = show;
      }
      var sc = Math.max(0.95, 1.45 - show / 260), spread = sc / 1.45 * (1 + Math.min(0.2, show / 700));
      var lean = mode === 'play' && phase === 'run' ? Math.max(-1, Math.min(1, (MG.laneX(run.lane) - cx) / 2)) : 0;
      drawCrowd(crowd, cx, cy, cz, yaw, t, dt, { run: mode === 'play' && (phase === 'run' || (phase === 'stairs' && St && St.t < St.goal * MG.STEP_S)), hop: mode !== 'play' || phase === 'done' || (St && St.t >= St.goal * MG.STEP_S), lean: lean, spread: spread, scale: sc, look: mode !== 'play' });
      // ---- the rival crowd at the finish
      var rshow = 0;
      if (mode === 'play' && run.battleD - d < 120) rshow = Math.min(CAP, B ? B.theirs : run.rival);
      if (rshow !== lastRival) {
        if (lastRival < 0 || rshow > lastRival) { rival.alive = rshow; for (var r0 = 0; r0 < rshow; r0++) rival.born[r0] = -9; }
        else setAlive(rival, rshow, t, 0, -(run.battleD + 7.5), Math.PI, [0xc7a6ff, 0xffffff, 0xffd23f]);
        lastRival = rshow;
      }
      var rsc = Math.max(0.95, 1.45 - rshow / 260);
      drawCrowd(rival, 0, 0, -(run.battleD + 7.5 + Math.min(1.5, rshow / 200)), Math.PI, t, dt, { hop: !!(B && B.done && !B.won) || phase === 'run', spread: rsc / 1.45 * (1 + Math.min(0.2, rshow / 700)), scale: rsc });
      // ---- rows of gates
      var np = 0, nb = 0, npan = 0, nbub = 0, near = mode === 'play' ? 120 : 70;
      for (var ri = 0; ri < run.rows.length; ri++) {
        var row = run.rows[ri], rz = -row.d;
        if (row.d < d - 12 || row.d > d + near) continue;
        var A = anim[ri];
        if (A) A.t += dt;
        // A passed row's frame drops into the track, so the camera never runs into it.
        var drop = row.passed ? (A && !calm ? Math.min(1, A.t * 2.4) : 1) : 0, fy = 1 - drop * drop;
        if (fy > 0.02) {
          for (var p = 0; p < 4; p++) if (np < 24) put(posts, np++, (p - 1.5) * MG.LANE_W, 0, rz, 1, fy, 1);
          if (nb < 6) put(beams, nb++, 0, 0, rz, 1, fy, 1);
        }
        for (var l = 0; l < 3; l++) {
          var g = row.gates && row.gates[l], s = 1, color, x = MG.laneX(l);
          if (row.passed && A) {
            var tt = A.t;
            s = l === A.lane ? (tt < 0.12 ? 1 + tt * 2.5 : Math.max(0, 1.3 - (tt - 0.12) * 5)) : Math.max(0, 1 - tt * 4);
            if (calm) s = 0;
          } else if (row.passed) s = 0;
          if (s <= 0.01) continue;
          if (!row.shown) color = 0xd9d2f0;
          else if (row.kind === 'quiz') color = 0xffc93c;
          else color = ctx.tier <= 2 ? (OPC[g.op] || 0x45cf6a) : LANE_C[l];
          var mine = mode === 'play' && !row.passed && ri === run.next && l === run.lane && phase === 'run';
          if (mine) color = mix(color, WHITE, 0.28 + (calm ? 0 : Math.sin(t * 8) * 0.1));
          var ps = s * (mine && !calm ? 1.04 + Math.sin(t * 8) * 0.025 : 1);
          if (npan < 15) {
            put(panels, npan, x, GY, rz, ps, ps, 1); panels.setColorAt(npan, C.setHex(color));
            put(frames, npan, x, GY, rz, ps, ps, 1); npan++;
          }
          var lz = rz + 0.2;
          if (!row.shown) text('?', x, GY, lz, 2.1, WHITE, s);
          else if (row.kind === 'quiz') text(String(row.answers[l]), x, GY, lz, 2.1, WHITE, s);
          else if (g.op2) { text(g.op + g.n, x, GY + 0.72, lz, 1.4, WHITE, s); text(g.op2 + g.n2, x, GY - 0.72, lz, 1.4, WHITE, s); }
          else text(g.op + g.n, x, GY, lz, 2.1, WHITE, s);
        }
        if (row.kind === 'quiz' && row.shown && nbub < 3) {
          var qs = row.passed ? Math.max(0, 1 - (A ? A.t : 1) * 3) : 1;
          if (qs > 0.01) {
            var bw = row.q.text.length * 0.62 + 1.8, by = GY + GH / 2 + 2.1;
            put(bubbles, nbub++, 0, by, rz, bw * qs, 2.1 * qs, qs);
            text(row.q.text, 0, by + 0.05, rz + 0.2, 1.4, 0x7a3cff, qs);
          }
        }
      }
      hide(posts, np); hide(beams, nb); hide(panels, npan); hide(frames, npan); hide(bubbles, nbub);
      // ---- the path to the next row
      var nextRow = run.rows[run.next];
      path.visible = mode === 'play' && phase === 'run' && !!nextRow;
      if (path.visible) { var len = Math.max(0.1, nextRow.d - d - 1); path.position.set(MG.laneX(run.lane), 0, -d - 1); path.scale.set(1, 1, len); }
      // ---- obstacles
      var nr = 0, npl = 0, ns = 0;
      for (var oi = 0; oi < run.obs.length; oi++) {
        var o = run.obs[oi];
        if (o.d < d - 12 || o.d > d + near) continue;
        var wob = bump[o.id] != null ? (bump[o.id] += dt) : 9, wk = wob < 0.6 && !calm ? Math.sin(wob * 25) * (0.6 - wob) * 0.4 : 0;
        if (o.kind === 'roller') {
          var rx = (o.lanes[0] + o.lanes[1]) / 2 - 1;
          put(rollers, nr, rx * MG.LANE_W, 0.95, -o.d, 1 + wk, 1 - wk, 1 + wk, 0, calm ? 0 : t * 3, 0);
          put(rollerFeet, nr, rx * MG.LANE_W, 0, -o.d, 1); nr++;
          if (ns < 24) put(shadows, ns++, rx * MG.LANE_W, 0.03, -o.d, RL + 0.8, 1, 2);
        } else {
          var sq = calm ? 1 : 1 + Math.sin(t * 6 + o.id) * 0.06 + wk;
          put(pillars, npl++, MG.laneX(o.lanes[0]), 0, -o.d, 1.25 / Math.sqrt(sq), 1.25 * sq, 1.25 / Math.sqrt(sq));
          if (ns < 24) put(shadows, ns++, MG.laneX(o.lanes[0]), 0.03, -o.d, 2.8, 1, 2.8);
        }
      }
      hide(rollers, nr); hide(rollerFeet, nr); hide(pillars, npl);
      // ---- coins
      var nc = 0;
      for (var ki = 0; ki < run.coins.length; ki++) {
        var cn = run.coins[ki];
        if (cn.got || cn.d < d - 8 || cn.d > d + 80) continue;
        if (nc < 48) put(coins, nc++, MG.laneX(cn.lane), 0.75 + (calm ? 0 : Math.sin(t * 3 + cn.id) * 0.08), -cn.d, 1, 1, 1, calm ? 0.6 : t * 3 + cn.id);
      }
      for (var fi = coinFly.length - 1; fi >= 0; fi--) {
        var fl = coinFly[fi];
        fl.t += dt;
        if (fl.t > 0.45) { coinFly.splice(fi, 1); continue; }
        if (nc < 48) put(coins, nc++, fl.x + (cx - fl.x) * fl.t * 2, 0.75 + fl.t * 7, fl.z - fl.t * 2, 1 - fl.t * 1.6, 1 - fl.t * 1.6, 1 - fl.t * 1.6, t * 14);
      }
      hide(coins, nc);
      // ---- finish: steps with their ×1..×10, the trophy at the top
      var sd = run.battleD + view.STEP_D, stepsOn = mode === 'play' && run.battleD - d < 110;
      steps.visible = trophy.visible = stepsOn;
      arch.visible = mode === 'play';
      if (stepsOn) {
        for (var si = 0; si < MG.STEPS; si++) {
          var hy = (si + 1) * view.STEP_H, lit = St && St.k > si;
          // The step geometry is 0.5 m tall with its top at 0: stretched down to the ground.
          put(steps, si, 0, hy, -(sd + si * view.STEP_DEPTH), 1, hy / 0.5, 1);
          text('×' + (si + 1), 0, hy - 0.4, -(sd + si * view.STEP_DEPTH) + 0.87, 0.68, lit ? 0xffe14d : WHITE, 1);
        }
        hide(steps, MG.STEPS);
        trophy.position.set(0, MG.STEPS * view.STEP_H + 0.1, -(sd + (MG.STEPS - 0.5) * view.STEP_DEPTH + 1.3));
        trophy.rotation.y = calm ? 0 : t * 0.8;
      }
      // ---- shadows under the crowds
      if (ns < 24) put(shadows, ns++, cx, cy + 0.03, cz, (1.4 + Math.sqrt(show) * 0.75) * spread, 1, (1.6 + Math.sqrt(show) * 0.95) * spread);
      if (rshow && ns < 24) put(shadows, ns++, 0, 0.03, -(run.battleD + 7.5), 1.4 + Math.sqrt(rshow) * 0.6, 1, 1.6 + Math.sqrt(rshow) * 0.75);
      hide(shadows, ns);
      // ---- scenery around the camera
      var camD = mode === 'play' ? d : d - 4;
      for (var pk = 0; pk < 3; pk++) {
        var pm = propMeshes[pk];
        for (var j = 0; j < PROPS_N; j++) {
          var phs = (j * 17.3 + pk * 53.1) % 180, cyc = Math.ceil((camD - 20 - phs) / 180), dd = phs + cyc * 180, hsh = hash(j * 3 + pk * 101 + cyc * 7);
          var side = (j + pk) % 2 ? 1 : -1, px = side * (12.5 + hsh * 26 + pk * 3), psz = 0.8 + hash(j + cyc * 13 + pk) * 0.7;
          put(pm, j, px, -2.2, -dd, psz, psz, psz, hsh * 6.283);
        }
        pm.count = PROPS_N; pm.instanceMatrix.needsUpdate = true;
      }
      if (clouds.visible) {
        for (var cl = 0; cl < clouds.instanceMatrix.count; cl++) {
          var cph = (cl * 41.7) % 240, ccy = Math.ceil((camD - 30 - cph) / 240), cd = cph + ccy * 240, ch = hash(cl * 5 + ccy * 3);
          put(clouds, cl, (cl % 2 ? 1 : -1) * (14 + ch * 50), 16 + ch * 14, -cd - 40, 2 + ch * 2);
        }
        clouds.count = clouds.instanceMatrix.count; clouds.instanceMatrix.needsUpdate = true;
      }
      ground.position.set(0, -2.2, -camD - 100);
      stepConfetti(dt);
      // ---- camera
      var rig;
      if (mode === 'menu') rig = [-6.5, 4.6, -d + 9, 1.4, 1.6, -d - 12];
      else if (mode === 'wardrobe') rig = [0, 2.3, -d + 5.6, 0, -0.55, -d - 2];
      else if (phase === 'battle' || (phase === 'done' && !St)) rig = [5.5, 6.4, -run.battleD + 5, 0, 0.9, -run.battleD - 7];
      else if (St) rig = [4.5, 5.2 + cy, cz + 11, 0, cy + 1.6, cz - 1];
      else rig = [cx * 0.55, 6.3, -d + 12.5, cx * 0.45, 1.1, -d - 14];
      var ke = 1 - Math.exp(-dt * (mode === 'play' && phase === 'run' ? 8 : 3));
      if (ctx.snap) ke = 1;
      cam.x += (rig[0] - cam.x) * ke; cam.y += (rig[1] - cam.y) * ke; cam.z += (rig[2] - cam.z) * (mode === 'play' && phase === 'run' ? 1 : ke);
      cam.lx += (rig[3] - cam.lx) * ke; cam.ly += (rig[4] - cam.ly) * ke; cam.lz += (rig[5] - cam.lz) * (mode === 'play' && phase === 'run' ? 1 : ke);
      cam.shake = Math.max(0, cam.shake - dt * 2.5);
      var sh = calm ? 0 : cam.shake * cam.shake;
      camera.position.set(cam.x + (Math.random() - 0.5) * sh, cam.y + (Math.random() - 0.5) * sh, cam.z);
      camera.lookAt(cam.lx, cam.ly, cam.lz);
      var aspect = camera.aspect, vf = aspect < 16 / 9 ? 2 * Math.atan(Math.tan(FOV * Math.PI / 360) * (16 / 9) / aspect) * 180 / Math.PI : FOV;
      if (Math.abs(camera.fov - vf) > 0.01) { camera.fov = vf; camera.updateProjectionMatrix(); }
      camera.updateMatrixWorld();
      sky.position.copy(camera.position);
      glyphs.count = gi; glyphs.instanceMatrix.needsUpdate = true; aCell.needsUpdate = true; aTint.needsUpdate = true;
      panels.instanceColor.needsUpdate = true;
      view.crowdTop = { x: cx, y: cy + 1.2 * sc + Math.sqrt(show) * 0.04, z: cz };
      view.rivalTop = { x: 0, y: 1.2 * rsc + Math.sqrt(rshow) * 0.04, z: -(run.battleD + 7.5), on: rshow > 0 };
    };
    view.render = function () { renderer.render(scene, camera); };
    view.resize = function (w, h) {
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix();
    };
    // Weak PCs: render fewer pixels if frames come slowly (never more than 1.5 dpr).
    var slow = 0;
    view.frameTime = function (ms) {
      if (LQ || navigator.webdriver) return false;
      if (ms > 26) slow++; else slow = Math.max(0, slow - 0.5);
      if (slow > 90 && ratio > 0.75) { ratio = Math.max(0.75, ratio - 0.25); renderer.setPixelRatio(ratio); slow = 0; return true; }
      return false;
    };
    view.ratio = function () { return ratio; };
    view.glyphCount = function () { return gi; };
    return view;
  };
})();
