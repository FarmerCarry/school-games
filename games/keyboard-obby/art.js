/* Keyboard Obby 3D art: the giant school keyboard floating over a jelly sea, the hero
 * (Zarroor, a little keycap with feet), hats and colours, coins, gems, flags, bumper bars,
 * particles and the follow camera, all built in code with three.js r159.
 * Draw calls stay low: the 61 key bodies are ONE merged, vertex-coloured mesh and their
 * printed tops are ONE more mesh textured from a single legend atlas (a canvas drawn once
 * per language); a key moves by rewriting only its own vertices. Coins, gems, flags, bars
 * and particles are instanced. Nothing here changes the engine; it only reads it. */
(function () {
  'use strict';
  var KO = window.KO;
  var INK = '#1c2250';
  KO.ZONES = ['#4fc3ff', '#46e08e', '#ffcf3a', '#ff9a3d', '#ff9a3d', '#ffcf3a', '#46e08e', '#4fc3ff', '#c39bff'];
  KO.THEMES = [
    { sky: ['#47b8ff', '#ffe1f0'], fog: '#ffd6ea', jelly: ['#ff3d8e', '#ff7cb8', '#ffd0e6'] },
    { sky: ['#3fb0ff', '#fff0c4'], fog: '#ffe7b5', jelly: ['#ff7a14', '#ffab3d', '#ffe0a0'] },
    { sky: ['#4cc2ff', '#e4ffd0'], fog: '#d8f8c6', jelly: ['#2fbf3c', '#78e65a', '#d6ffbf'] },
    { sky: ['#5a9cff', '#e2eeff'], fog: '#d4e6ff', jelly: ['#2268ff', '#4ea4ff', '#c4e2ff'] },
    { sky: ['#7a5cff', '#ffd6f2'], fog: '#efc8f0', jelly: ['#7f2dff', '#ab70ff', '#e6d0ff'] }
  ];
  var HAZARD = { crumble: '#e9b46a', sink: '#5ad6ff' };
  var OFF_X = -KO.KB_W / 2, OFF_Z = -KO.KB_ROWS / 2;
  // World position of a point in key units (the engine's x, y, z).
  KO.toWorld = function (x, y, z, out) { out = out || {}; out.x = x + OFF_X; out.y = y; out.z = z + OFF_Z; return out; };

  /* -------------------------------------------------------- 2D helpers */
  function rr(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  var AR = /[؀-ۿ]/;
  function text(g, s, x, y, size, color, o) {
    o = o || {};
    g.font = (o.weight || 700) + ' ' + Math.round(size) + 'px Fredoka';
    g.textAlign = o.align || 'center';
    g.textBaseline = o.base || 'middle';
    g.direction = AR.test(s) ? 'rtl' : 'ltr';
    g.fillStyle = color;
    g.fillText(s, x, y);
  }
  // A key's printed legends, placed like the real Dell keys: a letter top-left with its Arabic
  // letter bottom-right, a digit bottom-left with its Arabic-Indic digit bottom-right and the
  // Shift sign top-left. The chosen language is printed big.
  function legends(g, k, x, y, w, h, lang, color, dim) {
    var pad = 0.13 * h, lat = k.lat, ar = k.ar;
    if (k.code === 'Space') { text(g, lang === 'en' ? 'Space' : 'مسافة', x + w / 2, y + h * 0.52, h * 0.36, color); return; }
    if (k.finger < 0) {
      var c = dim || 'rgba(28,34,80,0.62)';
      if (k.code === 'Backspace') text(g, '←', x + pad * 1.6, y + h * 0.42, h * 0.42, c, { align: 'left' });
      else if (k.code === 'MetaLeft' || k.code === 'MetaRight') {
        var s = h * 0.13, cx = x + w / 2 - s, cy = y + h / 2 - s;
        g.fillStyle = c; g.fillRect(cx, cy, s * 0.9, s * 0.9); g.fillRect(cx + s, cy, s * 0.9, s * 0.9); g.fillRect(cx, cy + s, s * 0.9, s * 0.9); g.fillRect(cx + s, cy + s, s * 0.9, s * 0.9);
      } else if (k.code === 'ContextMenu') { g.fillStyle = c; for (var i = 0; i < 3; i++) g.fillRect(x + w / 2 - h * 0.14, y + h * (0.36 + i * 0.12), h * 0.28, h * 0.05); }
      else if (lat) {
        if (k.sym) text(g, k.sym, x + pad, y + pad * 0.7, h * 0.26, c, { align: 'left', base: 'top', weight: 500 });
        text(g, lat, x + pad, k.sym ? y + h - pad : y + h * 0.5, h * (lat.length > 2 ? 0.24 : 0.36), c, { align: 'left', base: k.sym ? 'bottom' : 'middle', weight: 500 });
      }
      return;
    }
    if (k.letter) {
      var en = lang === 'en';
      text(g, lat, x + pad, y + pad * 0.5, h * (en ? 0.58 : 0.3), color, { align: 'left', base: 'top' });
      // On the alphabetic baseline, so the dots under ي and the tail of ر stay on the key.
      text(g, ar, x + w - pad, y + h * (en ? 0.8 : 0.72), h * (en ? 0.34 : 0.6), color, { align: 'right', base: 'alphabetic' });
      return;
    }
    if (k.sym) text(g, k.sym, x + pad, y + pad * 0.5, h * 0.26, color, { align: 'left', base: 'top', weight: 500 });
    text(g, lat, x + pad, y + h - pad * 0.45, h * (k.digit ? 0.48 : 0.42), color, { align: 'left', base: 'bottom' });
    if (ar) text(g, ar, x + w - pad, y + h * (k.digit ? 0.86 : lang === 'en' ? 0.8 : 0.72), h * (k.digit ? 0.36 : lang === 'en' ? 0.34 : 0.56), color, { align: 'right', base: 'alphabetic' });
  }
  KO.legends = legends;

  KO.createView = function (canvas) {
    var T = window.THREE;
    if (!T) throw new Error('three.js is unavailable');
    var renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
    var ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    renderer.setPixelRatio(ratio);
    var scene = new T.Scene(), camera = new T.PerspectiveCamera(44, 16 / 9, 0.1, 160);
    scene.fog = new T.Fog(0xffffff, 26, 62);
    var hemi = new T.HemisphereLight(0xffffff, 0xb59bd6, 1.9), sun = new T.DirectionalLight(0xffffff, 1.9);
    sun.position.set(-4, 10, 7);
    scene.add(hemi, sun);
    var C = new T.Color(), C2 = new T.Color(), M = new T.Matrix4(), Q = new T.Quaternion(), E = new T.Euler(), P = new T.Vector3(), S = new T.Vector3(), V = new T.Vector3();
    var view = { renderer: renderer, scene: scene, camera: camera, calm: false };
    var LIT = new T.MeshLambertMaterial({ vertexColors: true });
    function lin(hex) { C.set(hex); return [C.r, C.g, C.b]; }
    function mixHex(a, b, k) { C.set(a); C2.set(b); C.lerp(C2, k); return C.getHex(); }
    function shade(hex, f) { return mixHex(hex, f < 0 ? 0x000000 : 0xffffff, Math.abs(f)); }

    /* --------------------------------------------- geometry building */
    // Boxes [x, y0, z, w, h, d, colour] merged into one vertex-coloured geometry.
    function boxes(list) {
      var n = list.length * 36, pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), o = 0, c;
      function v(x, y, z, a, b, d) { pos[o] = x; pos[o + 1] = y; pos[o + 2] = z; nor[o] = a; nor[o + 1] = b; nor[o + 2] = d; col[o] = c[0]; col[o + 1] = c[1]; col[o + 2] = c[2]; o += 3; }
      function q(a, b, cc, d, nx, ny, nz) { v(a[0], a[1], a[2], nx, ny, nz); v(b[0], b[1], b[2], nx, ny, nz); v(cc[0], cc[1], cc[2], nx, ny, nz); v(a[0], a[1], a[2], nx, ny, nz); v(cc[0], cc[1], cc[2], nx, ny, nz); v(d[0], d[1], d[2], nx, ny, nz); }
      list.forEach(function (e) {
        var x0 = e[0] - e[3] / 2, x1 = e[0] + e[3] / 2, y0 = e[1], y1 = e[1] + e[4], z0 = e[2] - e[5] / 2, z1 = e[2] + e[5] / 2;
        c = lin(e[6]);
        q([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], 1, 0, 0);
        q([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], -1, 0, 0);
        q([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], 0, 1, 0);
        q([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], 0, -1, 0);
        q([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], 0, 0, 1);
        q([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], 0, 0, -1);
      });
      return geom(pos, nor, col);
    }
    function geom(pos, nor, col) {
      var g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(pos, 3));
      g.setAttribute('normal', new T.BufferAttribute(nor, 3));
      if (col) g.setAttribute('color', new T.BufferAttribute(col, 3));
      g.computeBoundingSphere();
      return g;
    }
    // Merges ready-made geometries (each given one colour, or its own colours).
    function merge(parts) {
      var arrs = parts.map(function (p) { var g = p.g.index ? p.g.toNonIndexed() : p.g; if (p.m) g.applyMatrix4(p.m); return { g: g, c: p.c }; });
      var n = arrs.reduce(function (a, p) { return a + p.g.attributes.position.count; }, 0);
      var pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), o = 0;
      arrs.forEach(function (p) {
        var A = p.g.attributes, cnt = A.position.count, cc = typeof p.c === 'function' ? null : lin(p.c || '#ffffff');
        pos.set(A.position.array, o * 3); nor.set(A.normal.array, o * 3);
        for (var i = 0; i < cnt; i++) {
          var cv = cc || lin(p.c(A.position.getX(i), A.position.getY(i), A.position.getZ(i)));
          col[(o + i) * 3] = cv[0]; col[(o + i) * 3 + 1] = cv[1]; col[(o + i) * 3 + 2] = cv[2];
        }
        o += cnt;
      });
      return geom(pos, nor, col);
    }
    function at(x, y, z, rx, ry, rz, s) {
      var m = new T.Matrix4();
      E.set(rx || 0, ry || 0, rz || 0); Q.setFromEuler(E); P.set(x || 0, y || 0, z || 0); S.set(s || 1, s || 1, s || 1);
      return m.compose(P, Q, S);
    }

    /* --------------------------------------------------------- sky */
    var skyCanvas = document.createElement('canvas'); skyCanvas.width = 4; skyCanvas.height = 256;
    var skyTex = new T.CanvasTexture(skyCanvas); skyTex.colorSpace = T.SRGBColorSpace;
    scene.background = skyTex;

    /* -------------------------------------------------------- jelly */
    function rgb3(hex) { var n = parseInt(hex.slice(1), 16); return new T.Vector3((n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255); }
    var jellyU = { uTime: { value: 0 }, uCalm: { value: 1 }, uA: { value: rgb3('#ff3d8e') }, uB: { value: rgb3('#ff7cb8') }, uC: { value: rgb3('#ffd0e6') }, uFog: { value: rgb3('#ffd6ea') } };
    var jellyGeo = new T.PlaneGeometry(90, 70, 60, 44);
    jellyGeo.rotateX(-Math.PI / 2);
    jellyGeo.translate(0, 0, -12);
    var jelly = new T.Mesh(jellyGeo, new T.ShaderMaterial({
      uniforms: jellyU,
      vertexShader: [
        'uniform float uTime; uniform float uCalm; varying float vH; varying vec2 vP; varying float vD;',
        'void main() {',
        '  vec3 p = position;',
        '  float h = sin(p.x * 0.55 + uTime * 1.2) * 0.07 + sin(p.z * 0.7 - uTime * 0.9) * 0.06 + sin((p.x - p.z) * 0.3 + uTime * 0.6) * 0.09;',
        '  p.y += h * uCalm; vH = h; vP = p.xz;',
        '  vec4 mv = modelViewMatrix * vec4(p, 1.0); vD = -mv.z;',
        '  gl_Position = projectionMatrix * mv;',
        '}'].join('\n'),
      fragmentShader: [
        'uniform vec3 uA; uniform vec3 uB; uniform vec3 uC; uniform vec3 uFog; uniform float uTime;',
        'varying float vH; varying vec2 vP; varying float vD;',
        'void main() {',
        '  vec3 col = mix(uA, uB, clamp(vH * 4.0 + 0.5, 0.0, 1.0));',
        '  float s = sin(vP.x * 1.3 + sin(vP.y * 0.9 + uTime * 0.5) * 1.8 + uTime * 0.3) * sin(vP.y * 1.1 - uTime * 0.25);',
        '  col = mix(col, uC, smoothstep(0.55, 0.92, s) * 0.6);',
        '  col = mix(col, uC, smoothstep(0.06, 0.12, vH) * 0.35);',
        '  gl_FragColor = vec4(mix(col, uFog, clamp((vD - 16.0) / 34.0, 0.0, 1.0)), 1.0);',
        '}'].join('\n')
    }));
    jelly.position.y = KO.JELLY_LOW;
    scene.add(jelly);
    // A ring that spreads on the jelly after a splash.
    var ringMat = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
    var ringGeo = new T.RingGeometry(0.55, 0.85, 28); ringGeo.rotateX(-Math.PI / 2);
    var ring = new T.Mesh(ringGeo, ringMat); ring.visible = false; scene.add(ring);
    var ringT = 9;

    /* ------------------------------------------------------- decor */
    // Far puffy clouds and candy pillars standing in the jelly: one mesh each.
    (function decor() {
      var parts = [], rand = KO.rng(77);
      for (var i = 0; i < 9; i++) {
        var a = -2.2 + i * 0.55 + rand() * 0.2, r = 30 + rand() * 10, cx = Math.sin(a) * r, cz = -Math.cos(a) * r * 0.8 - 6, cy = 6 + rand() * 6;
        for (var j = 0; j < 5; j++) {
          var s = 1.4 + rand() * 1.6, g = new T.IcosahedronGeometry(1, 1);
          parts.push({ g: g, m: at(cx + (j - 2) * 1.8 + rand(), cy + rand() * 0.8 - (Math.abs(j - 2) * 0.4), cz + rand(), 0, rand() * 3, 0, s), c: function (x, y) { return y < cy - 0.6 ? '#dfe6ff' : '#ffffff'; } });
        }
      }
      var clouds = new T.Mesh(merge(parts), new T.MeshLambertMaterial({ vertexColors: true, emissive: 0x9aa6d8, emissiveIntensity: 0.35 }));
      scene.add(clouds); view.clouds = clouds;
      var candy = [], pal = ['#ff5d9e', '#ffd23f', '#4fd1ff', '#7ee05b', '#b48cff', '#ff9a3d'];
      for (i = 0; i < 12; i++) {
        var side = i % 2 ? 1 : -1, x = side * (11 + rand() * 9), z = -14 + rand() * 18, h = 1.5 + rand() * 3.5, col = pal[i % pal.length];
        if (i % 3 === 0) {
          // A lollipop: a stick and a round sweet.
          candy.push({ g: new T.CylinderGeometry(0.12, 0.12, h + 2, 8), m: at(x, KO.JELLY_LOW + (h + 2) / 2 - 1, z), c: '#ffffff' });
          candy.push({ g: new T.CylinderGeometry(1, 1, 0.35, 18), m: at(x, KO.JELLY_LOW + h + 1.6, z, Math.PI / 2, 0, 0), c: col });
          candy.push({ g: new T.CylinderGeometry(0.55, 0.55, 0.4, 18), m: at(x, KO.JELLY_LOW + h + 1.6, z, Math.PI / 2, 0, 0), c: '#ffffff' });
        } else {
          // A gumdrop island.
          var gd = new T.SphereGeometry(1.4 + rand(), 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
          candy.push({ g: gd, m: at(x, KO.JELLY_LOW - 0.1, z, 0, 0, 0, 1), c: col });
        }
      }
      var sweets = new T.Mesh(merge(candy), LIT); scene.add(sweets);
    })();

    /* --------------------------------------------------- the keyboard */
    var NK = KO.KEYS.length, BODY_V = 48, TOP_V = 6, GAP = 0.05, H = 0.55;
    var bodyPos = new Float32Array(NK * BODY_V * 3), bodyBase = new Float32Array(NK * BODY_V * 3), bodyNor = new Float32Array(NK * BODY_V * 3), bodyCol = new Float32Array(NK * BODY_V * 3);
    var topPos = new Float32Array(NK * TOP_V * 3), topBase = new Float32Array(NK * TOP_V * 3), topNor = new Float32Array(NK * TOP_V * 3), topUv = new Float32Array(NK * TOP_V * 2), topCol = new Float32Array(NK * TOP_V * 3);
    var bandOf = new Uint8Array(NK * BODY_V); // 0 upper band, 1 lower band (top edge), 2 lower band (bottom edge)
    (function buildKeys() {
      var tmpA = new T.Vector3(), tmpB = new T.Vector3(), N = new T.Vector3();
      KO.KEYS.forEach(function (k, i) {
        var x0 = k.x + GAP + OFF_X, x1 = k.x + k.w - GAP + OFF_X, z0 = k.row + GAP + OFF_Z, z1 = k.row + 1 - GAP + OFF_Z;
        var rings = [[0.075, 0], [0.018, -0.08], [0, -H]];
        var o = i * BODY_V;
        function corner(r, c) { var ins = rings[r][0]; return [c === 0 || c === 3 ? x0 + ins : x1 - ins, rings[r][1], c < 2 ? z0 + ins : z1 - ins]; }
        // corners: 0 far-left, 1 far-right, 2 near-right, 3 near-left
        var vi = 0;
        for (var band = 0; band < 2; band++) {
          for (var s = 0; s < 4; s++) {
            var a = corner(band, s), b = corner(band, (s + 1) % 4), c = corner(band + 1, (s + 1) % 4), d = corner(band + 1, s);
            tmpA.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); tmpB.set(d[0] - a[0], d[1] - a[1], d[2] - a[2]);
            N.crossVectors(tmpB, tmpA).normalize();
            [a, b, c, a, c, d].forEach(function (p, j) {
              var q = (o + vi) * 3;
              bodyBase[q] = p[0]; bodyBase[q + 1] = p[1]; bodyBase[q + 2] = p[2];
              bodyNor[q] = N.x; bodyNor[q + 1] = N.y; bodyNor[q + 2] = N.z;
              bandOf[o + vi] = band === 0 ? 0 : (j === 2 || j === 4 || j === 5) ? 2 : 1;
              vi++;
            });
          }
        }
        var t = i * TOP_V, tl = corner(0, 0), tr = corner(0, 1), br = corner(0, 2), bl = corner(0, 3);
        [tl, br, tr, tl, bl, br].forEach(function (p, j) {
          var q = (t + j) * 3;
          topBase[q] = p[0]; topBase[q + 1] = p[1] + 0.001; topBase[q + 2] = p[2];
          topNor[q + 1] = 1;
        });
      });
      bodyPos.set(bodyBase); topPos.set(topBase);
    })();
    var bodyGeo = geom(bodyPos, bodyNor, bodyCol), topGeo = geom(topPos, topNor, topCol);
    topGeo.setAttribute('uv', new T.BufferAttribute(topUv, 2));
    bodyGeo.boundingSphere.radius = 20; topGeo.boundingSphere.radius = 20;
    var atlasCanvas = document.createElement('canvas'); atlasCanvas.width = 1024; atlasCanvas.height = 1024;
    var atlas = new T.CanvasTexture(atlasCanvas);
    atlas.colorSpace = T.SRGBColorSpace;
    atlas.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 1);
    var keyBody = new T.Mesh(bodyGeo, LIT), keyTop = new T.Mesh(topGeo, new T.MeshBasicMaterial({ map: atlas, vertexColors: true }));
    keyBody.frustumCulled = false; keyTop.frustumCulled = false;
    scene.add(keyBody, keyTop);
    // The legend atlas: every key's printed top in one canvas, packed on shelves.
    var PX = 96, PAD = 3, atlasLang = '';
    function bakeAtlas(lang) {
      var g = atlasCanvas.getContext('2d'), x = 0, y = 0;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, 1024, 1024);
      KO.KEYS.forEach(function (k, i) {
        var w = Math.round(k.w * PX) + PAD * 2, h = PX + PAD * 2;
        if (x + w > 1024) { x = 0; y += h; }
        var game = k.finger >= 0;
        g.fillStyle = game ? '#fffaf0' : '#e4e7f5';
        g.fillRect(x, y, w, h);
        rr(g, x + PAD + 2, y + PAD + 2, w - PAD * 2 - 4, h - PAD * 2 - 4, PX * 0.16);
        g.lineWidth = 3; g.strokeStyle = game ? 'rgba(255,190,120,0.35)' : 'rgba(120,130,180,0.3)'; g.stroke();
        legends(g, k, x + PAD + 2, y + PAD + 1, w - PAD * 2 - 4, PX - 2, lang, INK);
        if (k.code === 'KeyF' || k.code === 'KeyJ') { rr(g, x + w / 2 - 14, y + h - PAD - 16, 28, 7, 3); g.fillStyle = 'rgba(28,34,80,0.45)'; g.fill(); }
        var u0 = (x + PAD) / 1024, u1 = (x + w - PAD) / 1024, v0 = 1 - (y + PAD) / 1024, v1 = 1 - (y + h - PAD) / 1024;
        var o = i * TOP_V * 2;
        // tl, br, tr, tl, bl, br
        [[u0, v0], [u1, v1], [u1, v0], [u0, v0], [u0, v1], [u1, v1]].forEach(function (uv, j) { topUv[o + j * 2] = uv[0]; topUv[o + j * 2 + 1] = uv[1]; });
        x += w;
      });
      topGeo.attributes.uv.needsUpdate = true;
      atlas.needsUpdate = true;
      atlasLang = lang;
    }
    view.setLang = function (lang) { if (lang !== atlasLang) bakeAtlas(lang); };
    view.rebake = function () { bakeAtlas(atlasLang || 'ar'); };
    bakeAtlas('ar');

    // Key colours: the finger zone on the sides (a crumbly key is a biscuit, a sinking key
    // is ice blue), the top tinted when it glows, flashes or is the next key.
    var keyDip = new Float32Array(NK), keyDipV = new Float32Array(NK), flashT = new Float32Array(NK), flashK = new Array(NK);
    var keyY = new Float32Array(NK), keyX = new Float32Array(NK), drawnY = new Float32Array(NK).fill(NaN), drawnX = new Float32Array(NK).fill(NaN), colorSig = new Array(NK);
    var kindOf = {};
    function baseColor(k) { return kindOf[k.code] ? HAZARD[kindOf[k.code]] : k.finger >= 0 ? KO.ZONES[k.finger] : '#a9b0d6'; }
    function paintKey(i, glow, flash, mark) {
      var k = KO.KEYS[i], b = baseColor(k), sig = b + '|' + glow.toFixed(2) + '|' + (flash || '') + '|' + mark.toFixed(2);
      if (colorSig[i] === sig) return false;
      colorSig[i] = sig;
      var side = b;
      if (flash === 'wrong') side = '#ff5d6c'; else if (flash === 'ok') side = '#5be38f';
      else if (glow > 0) side = mixHex(b, '#ffe14d', 0.55 + glow * 0.45);
      var up = lin(shade(side, 0.28)), mid = lin(side), low = lin(shade(side, -0.3));
      for (var j = 0; j < BODY_V; j++) {
        var q = (i * BODY_V + j) * 3, c = bandOf[i * BODY_V + j] === 0 ? up : bandOf[i * BODY_V + j] === 1 ? mid : low;
        bodyCol[q] = c[0]; bodyCol[q + 1] = c[1]; bodyCol[q + 2] = c[2];
      }
      var top = flash === 'wrong' ? '#ffb0b6' : flash === 'ok' ? '#c9f7d6' : glow > 0 ? mixHex('#ffffff', '#ffe066', 0.45 + glow * 0.4) : mark > 0 ? mixHex('#ffffff', '#fff1a8', mark) : kindOf[k.code] === 'crumble' ? '#fff0d8' : kindOf[k.code] === 'sink' ? '#e2f7ff' : '#ffffff';
      var tc = lin(top);
      for (j = 0; j < TOP_V; j++) { q = (i * TOP_V + j) * 3; topCol[q] = tc[0]; topCol[q + 1] = tc[1]; topCol[q + 2] = tc[2]; }
      return true;
    }
    function moveKey(i, x, y) {
      if (drawnY[i] === y && drawnX[i] === x) return false;
      drawnY[i] = y; drawnX[i] = x;
      for (var j = 0; j < BODY_V; j++) { var q = (i * BODY_V + j) * 3; bodyPos[q] = bodyBase[q] + x; bodyPos[q + 1] = bodyBase[q + 1] + y; }
      for (j = 0; j < TOP_V; j++) { q = (i * TOP_V + j) * 3; topPos[q] = topBase[q] + x; topPos[q + 1] = topBase[q + 1] + y; }
      return true;
    }

    /* ------------------------------------------------------- the hero */
    var heroRoot = new T.Group(), heroTurn = new T.Group(), heroSquash = new T.Group();
    heroRoot.add(heroTurn); heroTurn.add(heroSquash); scene.add(heroRoot);
    heroTurn.scale.setScalar(1.18);
    var heroMesh = new T.Mesh(new T.BufferGeometry(), LIT), hatMesh = new T.Mesh(new T.BufferGeometry(), LIT);
    heroSquash.add(heroMesh, hatMesh);
    var shadowMat = new T.MeshBasicMaterial({ color: 0x1c2250, transparent: true, opacity: 0.28, depthWrite: false });
    var shadowGeo = new T.CircleGeometry(0.3, 20); shadowGeo.rotateX(-Math.PI / 2);
    var shadow = new T.Mesh(shadowGeo, shadowMat); shadow.renderOrder = 2; scene.add(shadow);
    function heroBoxes(color) {
      var c = color, light = '#' + shade(c, 0.3).toString(16).padStart(6, '0'), dark = '#' + shade(c, -0.35).toString(16).padStart(6, '0');
      return [
        [0, 0.12, 0, 0.5, 0.42, 0.44, c], [0, 0.54, 0, 0.42, 0.07, 0.36, light],
        [-0.13, 0, 0.02, 0.15, 0.13, 0.22, dark], [0.13, 0, 0.02, 0.15, 0.13, 0.22, dark],
        [-0.29, 0.2, 0, 0.08, 0.2, 0.13, c], [0.29, 0.2, 0, 0.08, 0.2, 0.13, c],
        [-0.11, 0.31, 0.226, 0.14, 0.16, 0.02, '#ffffff'], [0.11, 0.31, 0.226, 0.14, 0.16, 0.02, '#ffffff'],
        [-0.095, 0.33, 0.238, 0.075, 0.1, 0.012, INK], [0.125, 0.33, 0.238, 0.075, 0.1, 0.012, INK],
        [-0.115, 0.4, 0.245, 0.03, 0.03, 0.006, '#ffffff'], [0.105, 0.4, 0.245, 0.03, 0.03, 0.006, '#ffffff'],
        [-0.2, 0.25, 0.224, 0.07, 0.04, 0.012, '#ff8fb8'], [0.2, 0.25, 0.224, 0.07, 0.04, 0.012, '#ff8fb8'],
        [0, 0.235, 0.226, 0.1, 0.035, 0.012, INK], [-0.06, 0.25, 0.226, 0.03, 0.03, 0.012, INK], [0.06, 0.25, 0.226, 0.03, 0.03, 0.012, INK]
      ];
    }
    function hatBoxes(id) {
      var y = 0.6;
      switch (id) {
        case 'cap': return [[0, y, 0, 0.44, 0.12, 0.4, '#ff5d6c'], [0, y, 0.24, 0.4, 0.035, 0.2, '#ff5d6c'], [0, y + 0.12, 0, 0.08, 0.04, 0.08, '#ffffff']];
        case 'bow': return [[-0.1, y - 0.01, 0.06, 0.14, 0.12, 0.06, '#ff6fb5'], [0.1, y - 0.01, 0.06, 0.14, 0.12, 0.06, '#ff6fb5'], [0, y + 0.01, 0.07, 0.06, 0.08, 0.08, '#ff3d8e']];
        case 'party': return [[0, y, 0, 0.34, 0.1, 0.34, '#4fd1ff'], [0, y + 0.1, 0, 0.25, 0.1, 0.25, '#ffd23f'], [0, y + 0.2, 0, 0.16, 0.1, 0.16, '#ff5d9e'], [0, y + 0.3, 0, 0.08, 0.08, 0.08, '#ffffff']];
        case 'flower': return [[0.14, y, 0.06, 0.1, 0.1, 0.1, '#ffd23f'], [0.14, y + 0.09, 0.06, 0.09, 0.08, 0.06, '#ff6fb5'], [0.14, y - 0.07, 0.06, 0.09, 0.08, 0.06, '#ff6fb5'], [0.05, y, 0.06, 0.08, 0.09, 0.06, '#ff6fb5'], [0.23, y, 0.06, 0.08, 0.09, 0.06, '#ff6fb5'], [-0.08, y - 0.02, 0.02, 0.1, 0.03, 0.2, '#46e08e']];
        case 'phones': return [[0, y + 0.02, 0, 0.56, 0.05, 0.08, '#2c3150'], [-0.29, y - 0.2, 0, 0.08, 0.24, 0.08, '#2c3150'], [0.29, y - 0.2, 0, 0.08, 0.24, 0.08, '#2c3150'], [-0.3, y - 0.3, 0, 0.1, 0.16, 0.18, '#ff5d6c'], [0.3, y - 0.3, 0, 0.1, 0.16, 0.18, '#ff5d6c']];
        case 'crown': return [[0, y, 0, 0.38, 0.09, 0.34, '#ffd23f'], [-0.15, y + 0.09, 0, 0.07, 0.1, 0.34, '#ffd23f'], [0.15, y + 0.09, 0, 0.07, 0.1, 0.34, '#ffd23f'], [0, y + 0.09, 0, 0.07, 0.14, 0.07, '#ffd23f'], [0, y + 0.03, 0.175, 0.07, 0.05, 0.02, '#ff5d6c'], [0, y + 0.23, 0, 0.05, 0.05, 0.05, '#4fd1ff']];
        case 'wizard': return [[0, y, 0, 0.5, 0.04, 0.46, '#6b4bd6'], [0, y + 0.04, 0, 0.32, 0.14, 0.3, '#7d5cff'], [0, y + 0.18, 0, 0.22, 0.13, 0.2, '#7d5cff'], [0.02, y + 0.31, 0, 0.13, 0.12, 0.12, '#7d5cff'], [0.05, y + 0.43, 0, 0.06, 0.07, 0.06, '#ffd23f'], [0.1, y + 0.1, 0.15, 0.05, 0.05, 0.02, '#ffd23f']];
        case 'prop': return [[0, y, 0, 0.42, 0.1, 0.38, '#ff9a3d'], [-0.11, y, 0, 0.1, 0.1, 0.385, '#4fc3ff'], [0.11, y, 0, 0.1, 0.1, 0.385, '#46e08e'], [0, y + 0.1, 0, 0.04, 0.08, 0.04, INK], [0, y + 0.18, 0, 0.5, 0.025, 0.07, '#ff5d6c'], [0, y + 0.18, 0, 0.07, 0.025, 0.5, '#ffd23f']];
      }
      return [[0, y, 0, 0.04, 0.12, 0.04, INK], [0, y + 0.11, 0, 0.1, 0.1, 0.1, '#ffd23f']];
    }
    view.setOutfit = function (color, hat) {
      var c = KO.COLORS[color] ? KO.COLORS[color].c : KO.COLORS[0].c, h = KO.HATS[hat] ? KO.HATS[hat].id : 'none';
      heroMesh.geometry.dispose(); heroMesh.geometry = boxes(heroBoxes(c));
      hatMesh.geometry.dispose(); hatMesh.geometry = boxes(hatBoxes(h));
    };
    view.setOutfit(0, 0);

    /* ------------------------------------------------- markers & items */
    function glowTexture() {
      var c = document.createElement('canvas'); c.width = c.height = 64;
      var g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 4, 32, 32, 31);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      var t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
    }
    var haloGeo = new T.PlaneGeometry(1, 1); haloGeo.rotateX(-Math.PI / 2);
    var halo = new T.Mesh(haloGeo, new T.MeshBasicMaterial({ map: glowTexture(), color: 0xffe14d, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0.9 }));
    halo.renderOrder = 3; scene.add(halo);
    var arrowGeo = merge([
      { g: new T.ConeGeometry(0.26, 0.36, 4), m: at(0, 0.18, 0, Math.PI, Math.PI / 4, 0), c: '#ffd23f' },
      { g: new T.BoxGeometry(0.15, 0.3, 0.15), m: at(0, 0.5, 0), c: '#ffd23f' }
    ]);
    var arrow = new T.Mesh(arrowGeo, new T.MeshLambertMaterial({ vertexColors: true, emissive: 0xff9a00, emissiveIntensity: 0.55 }));
    scene.add(arrow);
    function inst(geo, mat, cap) { var m = new T.InstancedMesh(geo, mat, cap); m.count = 0; m.frustumCulled = false; scene.add(m); return m; }
    var coinGeo = new T.CylinderGeometry(0.2, 0.2, 0.06, 16); coinGeo.rotateX(Math.PI / 2);
    var coins = inst(coinGeo, new T.MeshLambertMaterial({ color: 0xffc81f, emissive: 0x8a5a00, emissiveIntensity: 0.45 }), 12);
    var gems = inst(new T.OctahedronGeometry(0.2, 0), new T.MeshLambertMaterial({ color: 0xff4fd8, emissive: 0x8a1060, emissiveIntensity: 0.5, flatShading: true }), 4);
    var flagGeo = merge([
      { g: new T.CylinderGeometry(0.035, 0.035, 1.2, 8), m: at(0, 0.6, 0), c: '#ffffff' },
      { g: new T.BoxGeometry(0.5, 0.32, 0.03), m: at(0.27, 1.02, 0), c: '#ffffff' },
      { g: new T.CylinderGeometry(0.14, 0.18, 0.07, 12), m: at(0, 0.035, 0), c: '#e7e9f7' }
    ]);
    var flags = inst(flagGeo, new T.MeshLambertMaterial({ vertexColors: true }), 6);
    var goalParts = [
      { g: new T.CylinderGeometry(0.05, 0.05, 1.9, 8), m: at(0, 0.95, 0), c: '#ffd23f' },
      { g: new T.CylinderGeometry(0.22, 0.28, 0.1, 14), m: at(0, 0.05, 0), c: '#ffb020' },
      { g: new T.OctahedronGeometry(0.17, 0), m: at(0, 2.02, 0), c: '#ffd23f' }
    ];
    for (var gx = 0; gx < 4; gx++) for (var gy = 0; gy < 3; gy++) goalParts.push({ g: new T.BoxGeometry(0.16, 0.16, 0.035), m: at(0.13 + gx * 0.16, 1.47 + gy * 0.16, 0), c: (gx + gy) % 2 ? INK : '#ffffff' });
    var goal = new T.Mesh(merge(goalParts), new T.MeshLambertMaterial({ vertexColors: true, emissive: 0x332200, emissiveIntensity: 0.3 }));
    goal.visible = false; scene.add(goal);
    var barGeo = merge([
      { g: new T.CylinderGeometry(0.13, 0.13, 0.86, 12, 8, true), m: at(0, 0, 0, Math.PI / 2, 0, 0), c: function (x, y, z) { return Math.floor((z + 0.43) / 0.1075) % 2 ? '#ffffff' : '#ff4d6d'; } },
      { g: new T.SphereGeometry(0.17, 12, 8), m: at(0, 0, 0.45), c: '#ffd23f' },
      { g: new T.SphereGeometry(0.17, 12, 8), m: at(0, 0, -0.45), c: '#ffd23f' }
    ]);
    var bars = inst(barGeo, LIT, 4);
    // Decals on hazard keys: cracks on a crumbly key, drips on a sinking one.
    function decalTexture(kind) {
      var c = document.createElement('canvas'); c.width = c.height = 128;
      var g = c.getContext('2d');
      g.lineCap = 'round'; g.lineJoin = 'round';
      if (kind === 'crumble') {
        g.strokeStyle = 'rgba(120,64,20,0.85)'; g.lineWidth = 6;
        [[[10, 30], [34, 44], [30, 66], [52, 80]], [[118, 20], [94, 38], [100, 58]], [[64, 124], [70, 100], [92, 92], [96, 112]], [[6, 104], [26, 96]]].forEach(function (pts) {
          g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (var i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.stroke();
        });
      } else {
        g.fillStyle = 'rgba(40,140,220,0.75)';
        [[14, 0, 12, 34], [44, 0, 10, 22], [80, 0, 12, 40], [108, 0, 10, 26]].forEach(function (d) { g.beginPath(); g.ellipse(d[0] + d[2] / 2, d[3] - d[2] / 2, d[2] / 2, d[2] / 2, 0, 0, Math.PI * 2); g.fill(); g.fillRect(d[0], 0, d[2], d[3] - d[2] / 2); });
        g.strokeStyle = 'rgba(40,140,220,0.6)'; g.lineWidth = 5;
        g.beginPath(); for (var x = 0; x <= 128; x += 4) g.lineTo(x, 112 + Math.sin(x / 10) * 5); g.stroke();
      }
      var t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
    }
    var decalGeo = new T.PlaneGeometry(1, 1); decalGeo.rotateX(-Math.PI / 2);
    var decals = { crumble: inst(decalGeo, new T.MeshBasicMaterial({ map: decalTexture('crumble'), transparent: true, depthWrite: false }), 4),
      sink: inst(decalGeo, new T.MeshBasicMaterial({ map: decalTexture('sink'), transparent: true, depthWrite: false }), 4) };
    decals.crumble.renderOrder = 1; decals.sink.renderOrder = 1;
    // Particles: one instanced mesh of little cubes.
    var PN = 180, parts = [];
    for (var pi = 0; pi < PN; pi++) parts.push({ life: 0 });
    var partMesh = inst(new T.BoxGeometry(1, 1, 1), new T.MeshBasicMaterial({ color: 0xffffff }), PN);
    var pCount = 0;
    view.burst = function (x, y, z, o) {
      if (view.calm) return;
      o = o || {};
      var n = o.count || 10;
      for (var i = 0; i < PN && n > 0; i++) {
        var p = parts[i];
        if (p.life > 0) continue;
        n--;
        var a = Math.random() * Math.PI * 2, sp = (o.speed || 2) * (0.4 + Math.random() * 0.6);
        p.x = x + (Math.random() - 0.5) * (o.spread || 0.2); p.y = y; p.z = z + (Math.random() - 0.5) * (o.spread || 0.2);
        p.vx = Math.cos(a) * sp; p.vz = Math.sin(a) * sp; p.vy = (o.up || 2) * (0.5 + Math.random() * 0.7);
        p.life = p.max = (o.life || 0.6) * (0.7 + Math.random() * 0.5);
        p.size = (o.size || 0.08) * (0.6 + Math.random() * 0.7);
        p.g = o.gravity == null ? 9 : o.gravity;
        C.set(o.colors ? o.colors[Math.floor(Math.random() * o.colors.length)] : (o.color || '#ffffff'));
        p.r = C.r; p.gg = C.g; p.b = C.b; p.spin = Math.random() * 6;
      }
    };
    function stepParticles(dt) {
      var k = 0;
      for (var i = 0; i < PN; i++) {
        var p = parts[i];
        if (p.life <= 0) continue;
        p.life -= dt;
        if (p.life <= 0 || view.calm) { p.life = 0; continue; }
        p.vy -= p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        var s = p.size * Math.min(1, p.life / p.max * 2);
        E.set(p.spin * p.life, p.spin * 0.7 * p.life, 0); Q.setFromEuler(E); P.set(p.x, p.y, p.z); S.set(s, s, s);
        M.compose(P, Q, S); partMesh.setMatrixAt(k, M);
        C.setRGB(p.r, p.gg, p.b); partMesh.setColorAt(k, C);
        k++;
      }
      partMesh.count = k; pCount = k;
      partMesh.instanceMatrix.needsUpdate = true;
      if (partMesh.instanceColor) partMesh.instanceColor.needsUpdate = true;
    }
    view.particleCount = function () { return pCount; };

    /* ------------------------------------------------ level & theme */
    var theme = -1;
    view.setTheme = function (i) {
      i = KO.clamp(i | 0, 0, KO.THEMES.length - 1);
      if (i === theme) return;
      theme = i;
      var th = KO.THEMES[i], g = skyCanvas.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
      gr.addColorStop(0, th.sky[0]); gr.addColorStop(0.62, th.sky[1]); gr.addColorStop(1, th.fog);
      g.fillStyle = gr; g.fillRect(0, 0, 4, 256); skyTex.needsUpdate = true;
      scene.fog.color.set(th.fog);
      jellyU.uA.value = rgb3(th.jelly[0]); jellyU.uB.value = rgb3(th.jelly[1]); jellyU.uC.value = rgb3(th.jelly[2]); jellyU.uFog.value = rgb3(th.fog);
      hemi.groundColor.set(mixHex(th.jelly[1], '#ffffff', 0.4));
    };
    view.setTheme(0);
    var level = null;
    view.setLevel = function (L) {
      level = L;
      kindOf = L ? L.kind : {};
      for (var i = 0; i < NK; i++) { colorSig[i] = ''; keyDip[i] = keyDipV[i] = flashT[i] = 0; }
      goal.visible = !!L;
      if (L) { var g = KO.KEY[L.path[L.path.length - 1]]; KO.toWorld(g.x + g.w - 0.32, 0, g.row + 0.3, goal.position); }
      ringT = 9; ring.visible = false;
      for (i = 0; i < PN; i++) parts[i].life = 0;
    };

    /* ------------------------------------------------------- events */
    var squash = 0, squashV = 0, stars = 0, oopsT = 9;
    function dip(code, amount) { var k = KO.KEY[code]; if (k) keyDipV[k.i] -= amount; }
    view.flash = function (code, kind) { var k = KO.KEY[code]; if (k) { flashT[k.i] = kind === 'wrong' ? 0.45 : 0.3; flashK[k.i] = kind; dip(code, kind === 'wrong' ? 1.6 : 1.1); } };
    view.event = function (e, w) {
      var p = KO.toWorld(e.x || 0, e.y || 0, e.z || 0, {}), th = KO.THEMES[Math.max(0, theme)];
      switch (e.t) {
        case 'hop': squashV += 4.5; squash = Math.max(squash, 0.05); dip(e.from, 1.2); break;
        case 'land':
          squash = -0.32 * Math.min(1.2, 0.6 + e.d * 0.12); squashV = 0;
          dip(e.code, 1.4 + e.d * 0.12);
          view.burst(p.x, p.y + 0.02, p.z, { count: 8, colors: ['#ffffff', '#fff4d6'], speed: 1.6, up: 0.9, life: 0.4, size: 0.07, gravity: 3 });
          break;
        case 'wrong': oopsT = 0; break;
        case 'coin': view.burst(p.x, p.y + 0.7, p.z, { count: 14, colors: ['#ffd23f', '#fff3a0', '#ffffff'], speed: 2.2, up: 3, life: 0.6, size: 0.08 }); break;
        case 'gem': view.burst(p.x, p.y + 0.7, p.z, { count: 22, colors: ['#ff4fd8', '#ffffff', '#7ff0ff'], speed: 2.8, up: 3.5, life: 0.8, size: 0.09 }); break;
        case 'checkpoint': view.burst(p.x, p.y + 1, p.z, { count: 26, colors: ['#5be38f', '#ffffff', '#ffd23f'], speed: 2.6, up: 4, life: 0.9, size: 0.09 }); break;
        case 'splash':
          ring.position.set(p.x, KO.jellyY(w ? w.jelly : 0) + 0.04, p.z); ringT = 0; ring.visible = true;
          view.burst(p.x, KO.jellyY(w ? w.jelly : 0) + 0.05, p.z, { count: 30, colors: [th.jelly[0], th.jelly[1], th.jelly[2], '#ffffff'], speed: 2.4, up: 5, life: 0.8, size: 0.13, gravity: 11 });
          break;
        case 'respawn': squash = -0.3; view.burst(p.x, p.y + 0.1, p.z, { count: 16, colors: ['#ffffff', '#bff4ff'], speed: 1.8, up: 1.4, life: 0.5, size: 0.08, gravity: 3 }); break;
        case 'bonk': stars = 1.2; view.burst(p.x, p.y + 0.5, p.z, { count: 12, colors: ['#ffd23f', '#ffffff'], speed: 2.4, up: 2.5, life: 0.5, size: 0.08 }); break;
        case 'crumble': { var k = KO.KEY[e.code]; if (k) { var c = KO.toWorld(k.cx, 0, k.cz, {}); view.burst(c.x, -0.1, c.z, { count: 18, colors: [HAZARD.crumble, '#c98a4a', '#fff0d8'], speed: 1.6, up: 1.2, life: 0.7, size: 0.1, spread: k.w * 0.8 }); } } break;
        case 'finish': view.burst(p.x, p.y + 1.2, p.z, { count: 60, colors: ['#ff5d9e', '#ffd23f', '#4fd1ff', '#7ee05b', '#ffffff', '#b48cff'], speed: 3.6, up: 6, life: 1.4, size: 0.1, gravity: 7 }); break;
      }
    };

    /* ------------------------------------------------------- update */
    var camPos = new T.Vector3(0, 9, 14), camLook = new T.Vector3(0, 0, 0), wantPos = new T.Vector3(), wantLook = new T.Vector3(), first = true;
    var face = 0, shakeT = 0, W = {}, W2 = {};
    view.shake = function (p) { if (!view.calm) shakeT = Math.max(shakeT, p); };
    // o: { mode: 'play' | 'menu' | 'shop' | 'result', dt, t, w (an engine world or null), next (code), queued: [codes], ahead: code, snap }
    view.update = function (o) {
      var dt = Math.min(0.1, o.dt || 0), t = o.t || 0, w = o.w, calm = view.calm, i, k;
      jellyU.uTime.value = calm ? t * 0.3 : t; jellyU.uCalm.value = calm ? 0.25 : 1;
      jelly.position.y = KO.jellyY(w ? w.jelly : 0);
      if (view.clouds && !calm) view.clouds.rotation.y = Math.sin(t * 0.02) * 0.08;
      // Keys: the engine's heights, plus a springy dip under every press and landing.
      var dirtyP = false, dirtyC = false, target = o.next ? KO.KEY[o.next] : null, ahead = o.ahead ? KO.KEY[o.ahead] : null;
      var pulse = calm ? 0.7 : 0.5 + 0.5 * Math.sin(t * 7), subs = Math.ceil(dt / (1 / 120)), hs = dt / Math.max(1, subs), n;
      for (i = 0; i < NK; i++) {
        k = KO.KEYS[i];
        // A springy dip (semi-implicit steps of at most 1/120 s stay stable on slow frames).
        if (keyDip[i] || keyDipV[i]) for (n = 0; n < subs; n++) { keyDipV[i] += (-keyDip[i] * 300 - keyDipV[i] * 15) * hs; keyDip[i] += keyDipV[i] * hs; }
        if (Math.abs(keyDip[i]) < 0.0005 && Math.abs(keyDipV[i]) < 0.01) { keyDip[i] = 0; keyDipV[i] = 0; }
        var y = keyDip[i], x = 0;
        if (w && w.keys[k.code]) {
          y += KO.keyY(w, k.code);
          var st = w.keys[k.code];
          if (st.kind === 'crumble' && st.state === 'shake' && !calm) { var a = Math.min(1, st.t / w.tune.crumble); x = Math.sin(t * 60 + i) * 0.035 * a; y += Math.sin(t * 47 + i) * 0.015 * a; }
          var warn = KO.sinkWarn(w, k.code);
          if (warn > 0 && !calm) x = Math.sin(t * 50 + i) * 0.03 * warn;
        } else if (o.mode === 'menu' && !calm) y += Math.max(0, Math.sin(t * 2.2 - k.cx * 0.45 + k.row * 0.6)) * 0.07;
        keyY[i] = y; keyX[i] = x;
        if (moveKey(i, Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000)) dirtyP = true;
        if (flashT[i] > 0) flashT[i] -= dt;
        var glow = target && target.i === i ? pulse : 0;
        var mark = ahead && ahead.i === i ? 0.35 : o.queued && o.queued.indexOf(k.code) >= 0 ? 0.6 : 0;
        if (paintKey(i, glow, flashT[i] > 0 ? flashK[i] : '', mark)) dirtyC = true;
      }
      if (dirtyP) { bodyGeo.attributes.position.needsUpdate = true; topGeo.attributes.position.needsUpdate = true; }
      if (dirtyC) { bodyGeo.attributes.color.needsUpdate = true; topGeo.attributes.color.needsUpdate = true; }

      // The hero: where the engine says, turned to where it hops, squashed and stretched.
      var h = w ? w.hero : null, hx, hy, hz;
      if (h) { KO.toWorld(h.x, h.y, h.z, W); hx = W.x; hy = W.y; hz = W.z; }
      else { var sp = KO.KEY.Space; KO.toWorld(sp.cx, 0, sp.cz, W); hx = W.x; hy = keyY[sp.i]; hz = W.z; }
      for (n = 0; n < subs; n++) { squashV += (-squash * 110 - squashV * 9) * hs; squash += squashV * hs; }
      var sq = calm ? squash * 0.4 : squash, phase = h ? h.phase : 'stand', ht = h ? h.t : t;
      var wantFace = 0;
      if (phase === 'hop' || (h && phase !== 'stand' && phase !== 'win') || (h && ht < 0.8)) wantFace = h.face;
      if (o.mode === 'shop') wantFace = -0.5;
      if (o.mode === 'result') wantFace = 0.35;
      var df = Math.atan2(Math.sin(wantFace - face), Math.cos(wantFace - face));
      face += df * Math.min(1, dt * 10);
      heroRoot.position.set(hx, hy, hz);
      heroTurn.rotation.set(0, face, 0);
      var tilt = 0, roll = 0, lift = 0, sy = 1 + sq, sxz = 1 - sq * 0.5;
      if (phase === 'wait') { sy *= 0.86; sxz *= 1.06; }
      oopsT += dt;
      if (oopsT < KO.OOPS_T) { var ok = 1 - oopsT / KO.OOPS_T; roll = Math.sin(oopsT * 34) * 0.32 * ok * (calm ? 0.4 : 1); }
      if (phase === 'fall') { tilt = Math.min(1, ht / KO.FALL_T) * 1.2; roll = calm ? 0 : Math.sin(ht * 12) * 0.4; }
      if (phase === 'back') tilt = calm ? 0 : -Math.min(1, ht / KO.BACK_T) * Math.PI * 2;
      if (phase === 'bonk') roll = calm ? 0 : Math.sin(ht * 25) * 0.25;
      if (phase === 'win' || o.mode === 'result') { lift = calm ? 0 : Math.abs(Math.sin(t * 5.5)) * 0.35; if (!calm) heroTurn.rotation.y = face + Math.sin(t * 3) * 0.3; }
      if ((phase === 'stand' && !o.next && !calm) || o.mode === 'menu' || o.mode === 'shop') sy *= 1 + Math.sin(t * 3.2) * 0.025 * (calm ? 0 : 1);
      heroSquash.position.y = lift;
      heroSquash.rotation.set(tilt, 0, roll);
      heroSquash.scale.set(sxz, sy, sxz);
      // The blob shadow sits on the key under the hero (or the jelly in a gap).
      var sY = KO.jellyY(w ? w.jelly : 0) + 0.02, best = 99;
      for (i = 0; i < NK; i++) {
        k = KO.KEYS[i];
        var kx = k.x + OFF_X + keyX[i], kz = k.row + OFF_Z;
        if (hx >= kx && hx <= kx + k.w && hz >= kz && hz <= kz + 1) { var top = keyY[i] + 0.005; if (top <= hy + 0.05 && Math.abs(hy - top) < best) { best = Math.abs(hy - top); sY = top; } }
      }
      shadow.position.set(hx, sY + 0.004, hz);
      var hgt = Math.max(0, hy + lift - sY), ss = Math.max(0.35, 1 - hgt * 0.3);
      shadow.scale.set(ss, 1, ss); shadowMat.opacity = 0.28 * ss;
      shadow.visible = !(phase === 'fall' && h && hy < sY);
      // Stars spin round the head after a bonk.
      if (stars > 0) {
        stars -= dt;
        if (!calm && Math.random() < 0.5) view.burst(hx + Math.cos(t * 9) * 0.35, hy + 0.85, hz + Math.sin(t * 9) * 0.35, { count: 1, colors: ['#ffd23f'], speed: 0.2, up: 0.4, life: 0.3, size: 0.07, gravity: 0 });
      }

      // The next key: a soft glow on the key and a bouncing arrow above it.
      if (target && o.mode === 'play') {
        KO.toWorld(target.cx, 0, target.cz, W2);
        var ty = keyY[target.i];
        halo.visible = true; halo.position.set(W2.x + keyX[target.i], ty + 0.012, W2.z);
        halo.scale.set(target.w + 1.1, 1, 2.1); halo.material.opacity = 0.3 + pulse * 0.3;
        var onHero = h && Math.abs(h.x - target.cx) < 0.3 && Math.abs(h.z - target.cz) < 0.3;
        arrow.visible = true; arrow.position.set(W2.x, ty + (onHero ? 1.35 : 0.75) + (calm ? 0.1 : Math.abs(Math.sin(t * 4.5)) * 0.22), W2.z);
        arrow.rotation.y = calm ? 0 : t * 1.5;
      } else { halo.visible = false; arrow.visible = false; }

      // Coins and gems wait on their keys; flags mark the checkpoints and the goal.
      var nc = 0, ng = 0, nf = 0, spin = calm ? 0.5 : t * 2.4;
      if (w) {
        for (var code in w.coinsLeft) {
          var left = w.coinsLeft[code];
          if (!(left > 0)) continue;
          k = KO.KEY[code]; KO.toWorld(k.cx, 0, k.cz, W2);
          for (var j = 0; j < Math.min(2, left) && nc < 12; j++) {
            E.set(0, spin + j, 0); Q.setFromEuler(E); P.set(W2.x + keyX[k.i] + (j ? 0.12 : 0), keyY[k.i] + 0.62 + j * 0.16 + (calm ? 0 : Math.sin(t * 3 + k.i) * 0.05), W2.z); S.set(1, 1, 1);
            M.compose(P, Q, S); coins.setMatrixAt(nc++, M);
          }
        }
        for (code in w.gemsLeft) {
          if (!(w.gemsLeft[code] > 0) || ng >= 4) continue;
          k = KO.KEY[code]; KO.toWorld(k.cx, 0, k.cz, W2);
          E.set(0, spin * 1.3, 0); Q.setFromEuler(E); P.set(W2.x + keyX[k.i], keyY[k.i] + 0.72 + (calm ? 0 : Math.sin(t * 2.4 + k.i) * 0.07), W2.z); S.set(1, 1.35, 1);
          M.compose(P, Q, S); gems.setMatrixAt(ng++, M);
        }
        var cps = w.L.cps, nxt = KO.nextCp(w);
        for (i = 0; i < cps.length && nf < 6; i++) {
          if (cps[i] < w.cp) continue;
          k = KO.KEY[w.L.path[cps[i]]];
          if (cps[i] !== w.cp && cps[i] !== nxt) continue;
          KO.toWorld(k.x + 0.24, 0, k.row + 0.28, W2);
          E.set(0, calm ? 0 : Math.sin(t * 2 + i) * 0.15, 0); Q.setFromEuler(E); P.set(W2.x + keyX[k.i], keyY[k.i], W2.z); S.set(0.8, 0.8, 0.8);
          M.compose(P, Q, S); flags.setMatrixAt(nf, M);
          C.set(cps[i] === w.cp ? '#46e08e' : '#ff9a3d'); flags.setColorAt(nf, C);
          nf++;
        }
        if (goal.visible) { var gk = KO.KEY[w.L.path[w.n - 1]]; goal.position.y = keyY[gk.i]; goal.rotation.y = calm ? 0 : Math.sin(t * 1.5) * 0.2; }
        // Bumper bars.
        var nb = 0;
        w.bars.forEach(function (b) {
          if (!b.on) return;
          KO.toWorld(b.x, 0.36, b.z, W2);
          E.set(0, 0, calm ? 0 : t * 6); Q.setFromEuler(E); P.set(W2.x, 0.36, W2.z); S.set(1, 1, 1);
          M.compose(P, Q, S); bars.setMatrixAt(nb++, M);
        });
        bars.count = nb; bars.instanceMatrix.needsUpdate = true;
        var nd = { crumble: 0, sink: 0 };
        for (code in kindOf) {
          var kd = kindOf[code], dm = decals[kd];
          if (!dm || nd[kd] >= 4) continue;
          k = KO.KEY[code]; KO.toWorld(k.cx, 0, k.cz, W2);
          E.set(0, 0, 0); Q.setFromEuler(E); P.set(W2.x + keyX[k.i], keyY[k.i] + 0.004, W2.z); S.set(k.w - 0.2, 1, 0.82);
          M.compose(P, Q, S); dm.setMatrixAt(nd[kd]++, M);
        }
        decals.crumble.count = nd.crumble; decals.sink.count = nd.sink;
        decals.crumble.instanceMatrix.needsUpdate = true; decals.sink.instanceMatrix.needsUpdate = true;
      } else { bars.count = 0; decals.crumble.count = 0; decals.sink.count = 0; }
      coins.count = nc; coins.instanceMatrix.needsUpdate = true;
      gems.count = ng; gems.instanceMatrix.needsUpdate = true;
      flags.count = nf; flags.instanceMatrix.needsUpdate = true; if (flags.instanceColor) flags.instanceColor.needsUpdate = true;

      if (ringT < 0.9) { ringT += dt; var rk = ringT / 0.9; ring.scale.setScalar(0.6 + rk * 1.8); ringMat.opacity = 0.9 * (1 - rk); ring.position.y = jelly.position.y + 0.05; } else ring.visible = false;
      stepParticles(dt);

      // Camera: follows the hero and keeps the next keys in view; menus look over the keyboard.
      if (o.mode === 'play') {
        var fx = hx, fz = hz, span = 0;
        if (target) { KO.toWorld(target.cx, 0, target.cz, W2); fx = hx * 0.6 + W2.x * 0.4; fz = hz * 0.6 + W2.z * 0.4; span = Math.abs(W2.x - hx); }
        fx = KO.clamp(fx, -5.4, 5.4);
        // A long hop ahead: pull back so the hero and the next key both stay in view.
        var back = 1 + Math.max(0, span - 4.5) * 0.09;
        wantLook.set(fx, 0, fz + 0.35);
        wantPos.set(fx * 0.85, 6.3 * back, fz + 0.35 + 6.15 * back);
      } else if (o.mode === 'shop') {
        wantLook.set(hx + 1.55, hy + 0.5, hz); wantPos.set(hx + 1.45, hy + 1.45, hz + 3.3);
      } else if (o.mode === 'result') {
        wantLook.set(hx + 1.25, hy + 0.5, hz); wantPos.set(hx + 1.4, hy + 2.3, hz + 4.4);
      } else {
        var a = calm ? 0 : Math.sin(t * 0.16) * 0.3;
        wantLook.set(0, 0.6, 1.6); wantPos.set(Math.sin(a) * 13.5, 9.6, Math.cos(a) * 13.5 + 1.6);
      }
      var kk = first || o.snap ? 1 : 1 - Math.exp(-dt * (o.mode === 'play' ? 3 : 2));
      camPos.lerp(wantPos, kk); camLook.lerp(wantLook, kk);
      first = false;
      camera.position.copy(camPos);
      if (shakeT > 0 && !calm) { shakeT = Math.max(0, shakeT - dt * 2.5); camera.position.x += (Math.random() - 0.5) * shakeT * 0.3; camera.position.y += (Math.random() - 0.5) * shakeT * 0.3; }
      camera.lookAt(camLook);
    };
    view.render = function () { renderer.render(scene, camera); };
    view.resize = function (w, h) {
      renderer.setSize(Math.max(1, w), Math.max(1, h), false);
      camera.aspect = Math.max(1, w) / Math.max(1, h); camera.updateProjectionMatrix();
    };
    // Where a world point is in the 1280x720 picture.
    view.project = function (x, y, z) {
      V.set(x, y, z).project(camera);
      return { x: (V.x + 1) / 2 * 1280, y: (1 - V.y) / 2 * 720, behind: V.z > 1 };
    };
    // A key's top centre in world space.
    view.keyWorld = function (code, out) { var k = KO.KEY[code]; out = KO.toWorld(k.cx, 0, k.cz, out || {}); out.y = keyY[k.i]; return out; };
    // Weak PCs: render fewer pixels if frames come slowly (never more than 1.5 dpr).
    var slow = 0;
    view.frameTime = function (ms) {
      if (ms > 26) slow++; else slow = Math.max(0, slow - 0.5);
      if (slow > 90 && ratio > 0.75) { ratio = Math.max(0.75, ratio - 0.25); renderer.setPixelRatio(ratio); slow = 0; return true; }
      return false;
    };
    view.ratio = function () { return ratio; };
    view.info = function () { return renderer.info.render; };
    return view;
  };
})();
