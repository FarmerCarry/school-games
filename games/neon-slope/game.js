/*
 * Neon Slope — an endless neon downhill roller.
 * three.js r159 (window.THREE), shared Kit helpers, skins.js, audio.js.
 *
 * Coordinates: the whole course lives in the `course` group, which is tilted
 * down by SLOPE. Inside it: x = sideways, y = up, z = -d (d = distance forward).
 * The course is a ring buffer of rows (TL long) with COLS tiles each.
 */
(function () {
  'use strict';
  var T = window.THREE, SK = window.NS_SKINS, SND = window.NS_AUDIO;
  var store = Kit.store('neon-slope');
  var $ = function (id) { return document.getElementById(id); };
  var clamp = Kit.clamp, rand = Math.random;
  // Wraps a left-to-right snippet like "+5" so it keeps its order inside Arabic text.
  function ltr(t) { return '\u2066' + t + '\u2069'; }
  function musicLabel() { return save.music ? 'الموسيقى: تعمل' : 'الموسيقى: متوقفة'; }
  function randInt(a, b) { return Math.floor(a + rand() * (b - a + 1)); }
  function pick(a) { return a[Math.floor(rand() * a.length)]; }

  /* =============================================================== SAVE */
  function arr(v, d) { return Array.isArray(v) ? v.slice() : d; }
  var save = {
    best: Math.max(0, +store.get('best', 0) || 0),
    gems: Math.max(0, +store.get('gems', 0) || 0),
    owned: arr(store.get('owned', null), ['neon']),
    ownedTrails: arr(store.get('ownedTrails', null), ['glow']),
    skin: String(store.get('skin', 'neon')),
    trail: String(store.get('trail', 'glow')),
    runs: +store.get('runs', 0) || 0,
    music: store.get('music', true) !== false,
    missions: arr(store.get('missions', null), []),
    mDone: +store.get('mDone', 0) || 0
  };
  if (save.owned.indexOf('neon') < 0) save.owned.push('neon');
  if (save.ownedTrails.indexOf('glow') < 0) save.ownedTrails.push('glow');
  if (save.owned.indexOf(save.skin) < 0) save.skin = 'neon';
  if (save.ownedTrails.indexOf(save.trail) < 0) save.trail = 'glow';
  function persist() {
    store.set('best', save.best); store.set('gems', save.gems);
    store.set('owned', save.owned); store.set('ownedTrails', save.ownedTrails);
    store.set('skin', save.skin); store.set('trail', save.trail);
    store.set('runs', save.runs); store.set('music', save.music);
    store.set('missions', save.missions); store.set('mDone', save.mDone);
  }
  SND.setMusicOn(save.music);

  /* ---------------------------------------------------------- missions */
  var MISSIONS = [
    { id: 'dist', txt: 'تدحرج {n} م في جولة واحدة', vals: [250, 400, 600, 900, 1200, 1600, 2000, 2600], rew: [20, 25, 30, 40, 50, 60, 80, 100] },
    { id: 'gems', txt: 'اجمع {n} في جولة واحدة', w: ['جوهرة واحدة', 'جوهرتين', 'جواهر', 'جوهرة'], vals: [10, 20, 30, 45, 60, 80, 100], rew: [20, 25, 35, 45, 60, 80, 100] },
    { id: 'air', txt: 'نفّذ {n} في جولة واحدة', w: ['قفزة عالية واحدة', 'قفزتين عاليتين', 'قفزات عالية', 'قفزة عالية'], vals: [1, 2, 3, 5, 7, 9], rew: [20, 25, 35, 50, 70, 90] },
    { id: 'near', txt: 'مُرّ بجانب الأحمر بفارق شعرة {n}', w: ['مرة واحدة', 'مرتين', 'مرات', 'مرة'], vals: [1, 2, 3, 5, 7, 9], rew: [20, 25, 35, 50, 70, 90] },
    { id: 'zone', txt: 'صِل إلى المنطقة {n}', vals: [2, 3, 4, 5, 6, 7, 8, 9], rew: [25, 35, 50, 65, 80, 100, 120, 150] },
    { id: 'power', txt: 'اجمع {n} في جولة واحدة', w: ['قوة خارقة واحدة', 'قوتين خارقتين', 'قوى خارقة', 'قوة خارقة'], vals: [1, 2, 3, 4], rew: [25, 40, 60, 80] },
    { id: 'total', txt: 'تدحرج {n} م في كل جولاتك', vals: [1500, 3000, 6000, 10000, 16000, 25000], rew: [30, 45, 70, 100, 130, 170] }
  ];
  function misDef(id) { for (var i = 0; i < MISSIONS.length; i++) if (MISSIONS[i].id === id) return MISSIONS[i]; return null; }
  function newMission(exclude) {
    var pool = MISSIONS.filter(function (t) { return exclude.indexOf(t.id) < 0; });
    var t = pool[Math.floor(Math.random() * pool.length)];
    var tier = Kit.clamp(Math.floor(save.mDone / 3) + Math.floor(Math.random() * 2), 0, t.vals.length - 1);
    return { t: t.id, n: t.vals[tier], rew: t.rew[tier], prog: 0, done: false };
  }
  function ensureMissions() {
    var ok = [], ids = [];
    save.missions.forEach(function (m) {
      if (m && misDef(m.t) && ids.indexOf(m.t) < 0 && +m.n > 0 && !m.done) { ok.push({ t: m.t, n: +m.n, rew: +m.rew || 20, prog: +m.prog || 0, done: false }); ids.push(m.t); }
    });
    while (ok.length < 3) { var nm = newMission(ids); ok.push(nm); ids.push(nm.t); }
    save.missions = ok.slice(0, 3);
  }
  ensureMissions();

  /* ========================================================== CONSTANTS */
  var COLS = 9, TW = 1.6, TL = 2, NR = 100, AHEAD = 88, R = 0.45, G = 34, SLOPE = 0.2, TH = 0.6;
  var ZONE_LEN = 400, START_D = 14;
  var ZONES = [
    { name: 'النبض الوردي', c: '#ff2bd6' },
    { name: 'المدار السماوي', c: '#19e6ff' },
    { name: 'البرق الأخضر', c: '#7dff3a' },
    { name: 'الدوامة البنفسجية', c: '#a855ff' },
    { name: 'اللهب الأزرق', c: '#3d7bff' },
    { name: 'عاصفة النعناع', c: '#3dffc5' },
    { name: 'مملكة الجليد', c: '#d8f6ff' },
    { name: 'عاصفة الألوان', c: '#ffffff', prism: true }
  ];
  function colX(c) { return (c - 4) * TW; }
  function span(a, b) { var m = 0; for (var c = a; c <= b; c++) m |= (1 << c); return m; }
  function speedAt(d) { return 15 + 23 * (1 - Math.exp(-Math.max(0, d - START_D) / 2000)); }
  function diffAt(d) { return clamp((d - START_D) / 2800, 0, 1); }
  function vxMaxAt(v) { return 7 + v * 0.15; }
  function zoneOf(d) { return Math.max(0, Math.floor((d - START_D) / ZONE_LEN)); }
  function zoneInfo(z) { return ZONES[z % ZONES.length]; }

  /* =========================================================== RENDERER */
  var canvas = $('gl'), renderer;
  try {
    renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
  } catch (e) { renderer = null; }
  if (!renderer) { $('nogl').hidden = false; $('title').hidden = true; return; }
  var DPR = Math.min(window.devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(DPR);
  renderer.setClearColor(0x07021a, 1);
  var maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  var scene = new T.Scene();
  var FOG_COL = 0x1c0638;
  scene.fog = new T.Fog(FOG_COL, 45, 172);
  var camera = new T.PerspectiveCamera(62, 16 / 9, 0.1, 950);
  scene.add(camera);
  var course = new T.Group();
  course.rotation.x = -SLOPE;
  scene.add(course);
  course.updateMatrixWorld(true);

  scene.add(new T.HemisphereLight(0xffffff, 0x7733cc, 2.2));
  var sunLight = new T.DirectionalLight(0xffffff, 2.4);
  sunLight.position.set(3, 10, 6);
  scene.add(sunLight);

  /* ----------------------------------------------------------- textures */
  function canvasTex(w, h, draw, repeat) {
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    var t = new T.CanvasTexture(c);
    t.colorSpace = T.SRGBColorSpace;
    t.anisotropy = maxAniso;
    if (repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; }
    return t;
  }
  var tileTex = canvasTex(128, 128, function (g) {
    g.fillStyle = '#231a40'; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = 'rgba(255,255,255,0.13)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(64, 10); g.lineTo(64, 118); g.moveTo(10, 64); g.lineTo(118, 64); g.stroke();
    for (var k = 0; k < 14; k++) {
      g.strokeStyle = 'rgba(255,255,255,' + (0.09 * (1 - k / 14)) + ')'; g.lineWidth = 2;
      g.strokeRect(k * 1.5 + 5, k * 1.5 + 5, 118 - k * 3, 118 - k * 3);
    }
    g.strokeStyle = '#ffffff'; g.lineWidth = 7; g.strokeRect(3.5, 3.5, 121, 121);
  });
  var rampTex = canvasTex(128, 128, function (g) {
    g.fillStyle = '#3a3010'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#ffffff';
    for (var k = 0; k < 2; k++) {
      var y = 30 + k * 56;
      g.beginPath(); g.moveTo(24, y + 26); g.lineTo(64, y - 6); g.lineTo(104, y + 26); g.lineTo(104, y + 42); g.lineTo(64, y + 10); g.lineTo(24, y + 42); g.closePath(); g.fill();
    }
    g.strokeStyle = '#ffffff'; g.lineWidth = 8; g.strokeRect(4, 4, 120, 120);
  });
  var hazardTex = canvasTex(128, 128, function (g) {
    g.fillStyle = '#5a0414'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#ff1f4a';
    for (var k = -4; k < 8; k++) {
      g.beginPath(); g.moveTo(k * 32, 0); g.lineTo(k * 32 + 16, 0); g.lineTo(k * 32 + 16 + 128, 128); g.lineTo(k * 32 + 128, 128); g.closePath(); g.fill();
    }
    g.strokeStyle = '#ffd0d8'; g.lineWidth = 10; g.strokeRect(5, 5, 118, 118);
  });
  var glowTex = canvasTex(128, 128, function (g) {
    var gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  });
  var floorTex = canvasTex(64, 64, function (g) {
    g.fillStyle = '#0a0220'; g.fillRect(0, 0, 64, 64);
    g.strokeStyle = '#5a1470'; g.lineWidth = 3; g.strokeRect(0, 0, 64, 64);
  }, true);

  /* ------------------------------------------------------- background */
  var skyMat = new T.ShaderMaterial({
    side: T.BackSide, depthWrite: false, depthTest: false, fog: false,
    uniforms: { top: { value: new T.Color(0x02010c) }, mid: { value: new T.Color(FOG_COL) }, hor: { value: new T.Color(0xff3fa4) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 hor; varying vec3 vP;' +
      'void main(){ float h = normalize(vP).y; vec3 c = h > 0.0 ? mix(mid, top, smoothstep(0.0, 0.45, h)) : mid;' +
      ' c += hor * exp(-abs(h) * 16.0) * 0.55; gl_FragColor = vec4(c, 1.0);\n#include <colorspace_fragment>\n}'
  });
  var sky = new T.Mesh(new T.SphereGeometry(800, 24, 12), skyMat);
  sky.renderOrder = -10; sky.frustumCulled = false;
  scene.add(sky);

  var starGeo = new T.BufferGeometry(), starPos = new Float32Array(700 * 3);
  for (var si = 0; si < 700; si++) {
    var th = rand() * Math.PI * 2, ph = Math.acos(rand() * 0.95), rr = 600;
    starPos[si * 3] = Math.sin(ph) * Math.cos(th) * rr; starPos[si * 3 + 1] = Math.cos(ph) * rr * 0.9 + 12; starPos[si * 3 + 2] = Math.sin(ph) * Math.sin(th) * rr;
  }
  starGeo.setAttribute('position', new T.BufferAttribute(starPos, 3));
  var stars = new T.Points(starGeo, new T.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, fog: false, depthWrite: false, depthTest: false, transparent: true, opacity: 0.9 }));
  stars.renderOrder = -9; stars.frustumCulled = false;
  scene.add(stars);

  var sunTex = canvasTex(256, 256, function (g) {
    var gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#fff27a'); gr.addColorStop(0.45, '#ff9a3c'); gr.addColorStop(1, '#ff2bd6');
    g.fillStyle = gr; g.beginPath(); g.arc(128, 128, 120, 0, Math.PI * 2); g.fill();
    g.globalCompositeOperation = 'destination-out';
    for (var k = 0; k < 7; k++) { var y = 130 + k * 17, h = 2 + k * 1.6; g.fillRect(0, y, 256, h); }
  });
  var sun = new T.Mesh(new T.PlaneGeometry(190, 190), new T.MeshBasicMaterial({ map: sunTex, transparent: true, fog: false, depthWrite: false, depthTest: false }));
  sun.renderOrder = -8; sun.frustumCulled = false;
  scene.add(sun);
  var sunGlow = new T.Mesh(new T.PlaneGeometry(460, 460), new T.MeshBasicMaterial({ map: glowTex, color: 0xff4fa0, transparent: true, opacity: 0.55, blending: T.AdditiveBlending, fog: false, depthWrite: false, depthTest: false }));
  sunGlow.renderOrder = -8.5; sunGlow.frustumCulled = false;
  scene.add(sunGlow);

  var mtnTex = canvasTex(1024, 256, function (g) {
    var base = 150;
    function range(seed, amp, col, line, off) {
      var r = seed;
      function rn() { r = (r * 9301 + 49297) % 233280; return r / 233280; }
      g.beginPath(); g.moveTo(0, 256); g.lineTo(0, base);
      var pts = [], x = 0;
      while (x < 980) { pts.push([x, base - (0.25 + rn() * 0.75) * amp]); x += 30 + rn() * 70; }
      pts.push([1024, pts[0][1]]);
      for (var i = 0; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1] + off);
      g.lineTo(1024, base); g.lineTo(1024, 256); g.closePath();
      g.fillStyle = col; g.fill();
      g.strokeStyle = line; g.lineWidth = 2.5; g.shadowColor = line; g.shadowBlur = 10;
      g.beginPath();
      for (var j = 0; j < pts.length; j++) { if (j === 0) g.moveTo(pts[j][0], pts[j][1] + off); else g.lineTo(pts[j][0], pts[j][1] + off); }
      g.stroke(); g.shadowBlur = 0;
    }
    range(7, 70, '#1a0638', '#8a3bff', 0);
    range(3, 40, '#240a45', '#ff3fd0', 10);
    var gr = g.createLinearGradient(0, base - 6, 0, 256);
    gr.addColorStop(0, 'rgba(150,30,130,0)'); gr.addColorStop(0.08, 'rgba(150,30,130,0.9)'); gr.addColorStop(0.5, 'rgba(28,6,56,1)'); gr.addColorStop(1, 'rgba(28,6,56,1)');
    g.fillStyle = gr; g.fillRect(0, base - 6, 1024, 256 - base + 6);
  });
  mtnTex.wrapS = T.RepeatWrapping; mtnTex.repeat.set(2, 1);
  var mountains = new T.Mesh(new T.PlaneGeometry(2600, 330), new T.MeshBasicMaterial({ map: mtnTex, transparent: true, fog: false, depthWrite: false, depthTest: false }));
  mountains.renderOrder = -7; mountains.frustumCulled = false;
  scene.add(mountains);

  var voidFloor = new T.Mesh(new T.PlaneGeometry(320, 420), new T.MeshBasicMaterial({ map: floorTex, color: 0xffffff }));
  floorTex.repeat.set(40, 52.5);
  voidFloor.rotation.x = -Math.PI / 2;
  course.add(voidFloor);

  /* floating wireframe decorations beside the course */
  var DEC_N = 28;
  var decMesh = new T.InstancedMesh(new T.IcosahedronGeometry(1, 0), new T.MeshBasicMaterial({ wireframe: true, transparent: true, opacity: 0.6 }), DEC_N);
  decMesh.frustumCulled = false; decMesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
  var decs = [];
  for (var di = 0; di < DEC_N; di++) { decs.push({ x: 0, y: 0, d: -999, s: 1, ph: 0, sp: 1 }); decMesh.setColorAt(di, new T.Color(0xffffff)); }

  /* ------------------------------------------------------ course meshes */
  var boxGeo = new T.BoxGeometry(1, 1, 1);
  var NI = NR * COLS;
  var tileMesh = new T.InstancedMesh(boxGeo, new T.MeshBasicMaterial({ map: tileTex }), NI);
  var rampMesh = new T.InstancedMesh(boxGeo, new T.MeshBasicMaterial({ map: rampTex, color: 0xffe14d }), NI);
  [tileMesh, rampMesh].forEach(function (m) {
    m.frustumCulled = false; m.instanceMatrix.setUsage(T.DynamicDrawUsage);
    course.add(m);
  });
  var ZERO_M = new T.Matrix4().makeScale(0, 0, 0), tmpM = new T.Matrix4(), tmpC = new T.Color();
  for (var ii = 0; ii < NI; ii++) {
    tileMesh.setMatrixAt(ii, ZERO_M); rampMesh.setMatrixAt(ii, ZERO_M);
    tileMesh.setColorAt(ii, tmpC.set(0xffffff));
  }
  var dirty = { lo: 1e9, hi: -1 };

  var OBS_N = 80;
  var obsMesh = new T.InstancedMesh(boxGeo, new T.MeshBasicMaterial({ map: hazardTex }), OBS_N);
  obsMesh.frustumCulled = false; obsMesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
  course.add(obsMesh);
  course.add(decMesh);
  var obs = [];
  for (var oi = 0; oi < OBS_N; oi++) { obs.push({ active: false }); obsMesh.setMatrixAt(oi, ZERO_M); obsMesh.setColorAt(oi, tmpC.set(0xffffff)); }

  var GEM_N = 140;
  var gemGeo = new T.OctahedronGeometry(0.36, 0);
  var gemMesh = new T.InstancedMesh(gemGeo, new T.MeshPhongMaterial({ flatShading: true, emissive: 0x3a2200, specular: 0xffffff, shininess: 90 }), GEM_N);
  gemMesh.frustumCulled = false; gemMesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
  course.add(gemMesh);
  var gems = [];
  var GEM_COL = new T.Color(0xffd93b), BIG_COL = new T.Color(0xff5fe0);
  for (var gi = 0; gi < GEM_N; gi++) { gems.push({ active: false }); gemMesh.setMatrixAt(gi, ZERO_M); gemMesh.setColorAt(gi, GEM_COL); }

  /* particles: one Points object with a tiny shader (size + color per point) */
  var ptShader = {
    vertexShader: 'attribute float psize; attribute vec3 pcolor; varying vec3 vC; uniform float uScale;' +
      'void main(){ vC = pcolor; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = psize * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'varying vec3 vC; void main(){ vec2 p = gl_PointCoord - 0.5; float d = length(p); float a = 1.0 - smoothstep(0.0, 0.5, d); a *= a; gl_FragColor = vec4(vC * a * 1.6, 1.0); }'
  };
  function makePoints(n) {
    var geo = new T.BufferGeometry();
    var pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n);
    geo.setAttribute('position', new T.BufferAttribute(pos, 3).setUsage(T.DynamicDrawUsage));
    geo.setAttribute('pcolor', new T.BufferAttribute(col, 3).setUsage(T.DynamicDrawUsage));
    geo.setAttribute('psize', new T.BufferAttribute(size, 1).setUsage(T.DynamicDrawUsage));
    var mat = new T.ShaderMaterial({
      uniforms: { uScale: { value: 400 } }, vertexShader: ptShader.vertexShader, fragmentShader: ptShader.fragmentShader,
      transparent: true, depthWrite: false, blending: T.AdditiveBlending
    });
    var pts = new T.Points(geo, mat);
    pts.frustumCulled = false;
    return { obj: pts, pos: pos, col: col, size: size, geo: geo, mat: mat };
  }
  var PN = 520;
  var P = makePoints(PN);
  P.obj.renderOrder = 5;
  course.add(P.obj);
  var pd = { x: new Float32Array(PN), y: new Float32Array(PN), z: new Float32Array(PN), vx: new Float32Array(PN), vy: new Float32Array(PN), vz: new Float32Array(PN),
    life: new Float32Array(PN), max: new Float32Array(PN), s: new Float32Array(PN), r: new Float32Array(PN), g: new Float32Array(PN), b: new Float32Array(PN),
    grav: new Float32Array(PN), drag: new Float32Array(PN), next: 0 };
  var GG = makePoints(GEM_N); // gem glows
  GG.obj.renderOrder = 4;
  course.add(GG.obj);

  function hexRGB(hex, out) {
    var n = typeof hex === 'number' ? hex : parseInt(String(hex).slice(1), 16);
    out = out || {}; out.r = (n >> 16 & 255) / 255; out.g = (n >> 8 & 255) / 255; out.b = (n & 255) / 255; return out;
  }
  var _rgb = {};
  function emit(x, y, z, vx, vy, vz, life, size, hex, grav, drag) {
    var i = pd.next; pd.next = (i + 1) % PN;
    hexRGB(hex, _rgb);
    pd.x[i] = x; pd.y[i] = y; pd.z[i] = z; pd.vx[i] = vx; pd.vy[i] = vy; pd.vz[i] = vz;
    pd.life[i] = life; pd.max[i] = life; pd.s[i] = size; pd.r[i] = _rgb.r; pd.g[i] = _rgb.g; pd.b[i] = _rgb.b;
    pd.grav[i] = grav || 0; pd.drag[i] = drag || 0;
  }
  function burst(x, y, z, n, speed, life, size, colors, grav, up, fwd) {
    for (var k = 0; k < n; k++) {
      var a = rand() * Math.PI * 2, e = (rand() - 0.3) * Math.PI * 0.6, sp = speed * (0.35 + rand() * 0.65);
      emit(x, y, z, Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp + (up || 0), Math.sin(a) * Math.cos(e) * sp - (fwd || 0),
        life * (0.6 + rand() * 0.4), size * (0.7 + rand() * 0.6), colors[k % colors.length], grav, 1.5);
    }
  }
  function updateParticles(dt) {
    var pos = P.pos, col = P.col, size = P.size;
    for (var i = 0; i < PN; i++) {
      if (pd.life[i] <= 0) { if (size[i] !== 0) size[i] = 0; continue; }
      pd.life[i] -= dt;
      var dr = Math.exp(-pd.drag[i] * dt);
      pd.vx[i] *= dr; pd.vz[i] *= dr; pd.vy[i] = pd.vy[i] * dr - pd.grav[i] * dt;
      pd.x[i] += pd.vx[i] * dt; pd.y[i] += pd.vy[i] * dt; pd.z[i] += pd.vz[i] * dt;
      var f = Math.max(0, pd.life[i] / pd.max[i]);
      pos[i * 3] = pd.x[i]; pos[i * 3 + 1] = pd.y[i]; pos[i * 3 + 2] = pd.z[i];
      col[i * 3] = pd.r[i] * f; col[i * 3 + 1] = pd.g[i] * f; col[i * 3 + 2] = pd.b[i] * f;
      size[i] = pd.s[i] * (0.4 + 0.6 * f);
    }
    P.geo.attributes.position.needsUpdate = true; P.geo.attributes.pcolor.needsUpdate = true; P.geo.attributes.psize.needsUpdate = true;
  }
  function clearParticles() { for (var i = 0; i < PN; i++) { pd.life[i] = 0; P.size[i] = 0; } }

  /* ------------------------------------------------------------ ball */
  var ballRoot = new T.Group(), ballSquash = new T.Group();
  var ballMat = new T.MeshPhongMaterial({ emissive: 0x777777, shininess: 80, specular: 0x555555 });
  var ballMesh = new T.Mesh(new T.SphereGeometry(R, 32, 20), ballMat);
  ballSquash.add(ballMesh); ballRoot.add(ballSquash); course.add(ballRoot);
  var underGlow = new T.Mesh(new T.PlaneGeometry(2.6, 2.6), new T.MeshBasicMaterial({ map: glowTex, transparent: true, blending: T.AdditiveBlending, depthWrite: false, opacity: 0.8 }));
  underGlow.rotation.x = -Math.PI / 2; underGlow.renderOrder = 2;
  course.add(underGlow);
  var shieldMesh = new T.Mesh(new T.IcosahedronGeometry(R * 1.75, 1), new T.MeshBasicMaterial({ color: 0x3ff0ff, wireframe: true, transparent: true, opacity: 0.85, blending: T.AdditiveBlending, depthWrite: false }));
  ballRoot.add(shieldMesh); shieldMesh.visible = false;
  var magnetRing = new T.Mesh(new T.TorusGeometry(R * 1.9, 0.05, 6, 32), new T.MeshBasicMaterial({ color: 0xb46bff, transparent: true, opacity: 0.9, blending: T.AdditiveBlending, depthWrite: false }));
  ballRoot.add(magnetRing); magnetRing.visible = false;
  var skinTexCache = {};
  var glowCol = new T.Color(0x3ff0ff), glowHex = '#3ff0ff';
  var curSkin = SK.ball(save.skin), curTrail = SK.trail(save.trail);
  function applySkin() {
    curSkin = SK.ball(save.skin); curTrail = SK.trail(save.trail);
    var t = skinTexCache[curSkin.id];
    if (!t) { t = new T.CanvasTexture(SK.pattern(curSkin)); t.colorSpace = T.SRGBColorSpace; t.anisotropy = maxAniso; skinTexCache[curSkin.id] = t; }
    ballMat.map = t; ballMat.emissiveMap = t; ballMat.needsUpdate = true;
    glowHex = curSkin.glow; glowCol.set(glowHex);
    underGlow.material.color.copy(glowCol);
  }
  applySkin();

  /* trail ribbon */
  var TN = 14;
  var trailGeo = new T.BufferGeometry();
  var trailPos = new Float32Array(TN * 2 * 3), trailCol = new Float32Array(TN * 2 * 3), trailIdx = [];
  for (var ti = 0; ti < TN - 1; ti++) { var a0 = ti * 2; trailIdx.push(a0, a0 + 1, a0 + 2, a0 + 1, a0 + 3, a0 + 2); }
  trailGeo.setIndex(trailIdx);
  trailGeo.setAttribute('position', new T.BufferAttribute(trailPos, 3).setUsage(T.DynamicDrawUsage));
  trailGeo.setAttribute('color', new T.BufferAttribute(trailCol, 3).setUsage(T.DynamicDrawUsage));
  var trailMat = new T.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false });
  var trail = new T.Mesh(trailGeo, trailMat); trail.frustumCulled = false; trail.renderOrder = 3;
  course.add(trail);
  var trailPts = []; for (var tp = 0; tp < TN; tp++) trailPts.push({ x: 0, y: 0, z: 0 });

  /* shards */
  var SH_N = 36;
  var shardMesh = new T.InstancedMesh(new T.TetrahedronGeometry(0.2, 0), new T.MeshBasicMaterial({ color: 0xffffff }), SH_N);
  shardMesh.frustumCulled = false; shardMesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
  course.add(shardMesh);
  var shards = [];
  for (var sh = 0; sh < SH_N; sh++) { shards.push({ p: new T.Vector3(), v: new T.Vector3(), q: new T.Quaternion(), w: new T.Vector3(), s: 1, life: 0 }); shardMesh.setMatrixAt(sh, ZERO_M); shardMesh.setColorAt(sh, tmpC.set(0xffffff)); }

  /* pickups */
  function makeShieldPickup() {
    var g = new T.Group();
    g.add(new T.Mesh(new T.IcosahedronGeometry(0.55, 1), new T.MeshBasicMaterial({ color: 0x3ff0ff, wireframe: true })));
    g.add(new T.Mesh(new T.IcosahedronGeometry(0.3, 0), new T.MeshPhongMaterial({ color: 0x9ff8ff, emissive: 0x137a88, flatShading: true })));
    return g;
  }
  function makeMagnetPickup() {
    var g = new T.Group();
    var u = new T.Mesh(new T.TorusGeometry(0.38, 0.14, 8, 18, Math.PI), new T.MeshPhongMaterial({ color: 0xb46bff, emissive: 0x4a1a88 }));
    u.rotation.z = Math.PI; g.add(u);
    var tipM = new T.MeshPhongMaterial({ color: 0xffffff, emissive: 0x666666 });
    var t1 = new T.Mesh(new T.BoxGeometry(0.3, 0.22, 0.3), tipM); t1.position.set(-0.38, 0.08, 0); g.add(t1);
    var t2 = t1.clone(); t2.position.x = 0.38; g.add(t2);
    return g;
  }
  var pickups = [];
  ['shield', 'shield', 'magnet', 'magnet'].forEach(function (type) {
    var m = type === 'shield' ? makeShieldPickup() : makeMagnetPickup();
    m.visible = false; course.add(m);
    var halo = new T.Mesh(new T.PlaneGeometry(2.4, 2.4), new T.MeshBasicMaterial({ map: glowTex, color: type === 'shield' ? 0x3ff0ff : 0xb46bff, transparent: true, blending: T.AdditiveBlending, depthWrite: false, opacity: 0.7 }));
    m.add(halo); halo.renderOrder = 3;
    pickups.push({ type: type, mesh: m, halo: halo, active: false });
  });

  /* best gate + distance markers */
  function textCanvas(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  var bestCv = textCanvas(512, 128), bestTex = new T.CanvasTexture(bestCv); bestTex.colorSpace = T.SRGBColorSpace;
  var bestGate = new T.Group();
  var bestBanner = new T.Mesh(new T.PlaneGeometry(10, 2.5), new T.MeshBasicMaterial({ map: bestTex, transparent: true, side: T.DoubleSide, depthWrite: false }));
  bestBanner.position.y = 4.2; bestGate.add(bestBanner);
  var poleMat = new T.MeshBasicMaterial({ map: tileTex, color: 0xffd93b });
  var pole1 = new T.Mesh(new T.BoxGeometry(0.35, 5.6, 0.35), poleMat); pole1.position.set(-5.2, 2.8, 0); bestGate.add(pole1);
  var pole2 = pole1.clone(); pole2.position.x = 5.2; bestGate.add(pole2);
  var bar = new T.Mesh(new T.BoxGeometry(10.8, 0.25, 0.25), poleMat); bar.position.y = 5.55; bestGate.add(bar);
  bestGate.visible = false; course.add(bestGate);
  function drawBestSign(m) {
    var g = bestCv.getContext('2d');
    g.clearRect(0, 0, 512, 128);
    g.fillStyle = 'rgba(40,10,60,0.75)'; roundRect(g, 8, 10, 496, 108, 30); g.fill();
    g.lineWidth = 6; g.strokeStyle = '#ffd93b'; g.shadowColor = '#ffd93b'; g.shadowBlur = 16; roundRect(g, 8, 10, 496, 108, 30); g.stroke();
    g.shadowBlur = 12; g.fillStyle = '#fff6c0'; g.font = '700 60px Fredoka, "Segoe UI", Tahoma, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.direction = 'rtl';
    fitText(g, 'أفضل مسافة: ' + Kit.fmt(m) + ' م', 256, 68, 460);
    g.shadowBlur = 0; bestTex.needsUpdate = true;
  }
  // Draws centered text, shrinking it horizontally if it would not fit maxW.
  function fitText(g, text, x, y, maxW) {
    var w = g.measureText(text).width;
    if (w > maxW) { g.save(); g.translate(x, y); g.scale(maxW / w, 1); g.fillText(text, 0, 0); g.restore(); }
    else g.fillText(text, x, y);
  }
  function roundRect(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  var markers = [];
  for (var mk = 0; mk < 3; mk++) {
    var mc = textCanvas(256, 128), mt = new T.CanvasTexture(mc); mt.colorSpace = T.SRGBColorSpace;
    var mm = new T.Mesh(new T.PlaneGeometry(5, 2.5), new T.MeshBasicMaterial({ map: mt, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
    mm.rotation.x = -Math.PI / 2; mm.visible = false; mm.renderOrder = 1; course.add(mm);
    markers.push({ cv: mc, tex: mt, mesh: mm, d: -1 });
  }
  var markerNext = 0;
  function placeMarker(meters, x, y, d) {
    var m = markers[markerNext]; markerNext = (markerNext + 1) % markers.length;
    var g = m.cv.getContext('2d');
    g.clearRect(0, 0, 256, 128);
    g.font = '700 68px Fredoka, "Segoe UI", Tahoma, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.direction = 'rtl';
    g.fillStyle = '#ffffff'; g.shadowColor = '#ffffff'; g.shadowBlur = 10;
    g.globalAlpha = 0.55; fitText(g, meters + ' م', 128, 66, 240); g.globalAlpha = 1; g.shadowBlur = 0;
    m.tex.needsUpdate = true;
    m.mesh.position.set(x, y + 0.04, -d); m.mesh.visible = true; m.d = d;
  }

  /* speed lines (camera space) */
  var SL_N = 44;
  var slGeo = new T.BufferGeometry(), slPos = new Float32Array(SL_N * 6), slCol = new Float32Array(SL_N * 6);
  slGeo.setAttribute('position', new T.BufferAttribute(slPos, 3).setUsage(T.DynamicDrawUsage));
  slGeo.setAttribute('color', new T.BufferAttribute(slCol, 3));
  var slMat = new T.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, depthTest: false, fog: false });
  var speedLines = new T.LineSegments(slGeo, slMat); speedLines.frustumCulled = false; speedLines.renderOrder = 20;
  camera.add(speedLines);
  var slState = [];
  for (var sl = 0; sl < SL_N; sl++) {
    slState.push({ a: rand() * Math.PI * 2, k: 0.45 + rand() * 0.5, z: -5 - rand() * 45 });
    slCol[sl * 6] = slCol[sl * 6 + 1] = slCol[sl * 6 + 2] = 1;
  }

  /* ========================================================= COURSE GEN */
  var rows = new Array(NR), rowHead = 0, firstRow = 0, queue = [];
  var gen = {};
  function getRow(i) { return (i < firstRow || i >= rowHead || i < rowHead - NR) ? null : rows[i % NR]; }
  function gD() { return gen.i * TL; }
  function gDiff() { return diffAt(gD()); }
  function gV() { return speedAt(gD()); }
  function reactRows(shift) {
    var v = gV(), D = gDiff();
    return Math.ceil(((shift * TW) / vxMaxAt(v) + 0.6 - 0.22 * D) * v / TL) + 1;
  }
  function mkRow(mask) {
    var r = { mask: mask, ramp: 0, rh0: 0, rh1: 0, base: gen.base, bank: 0, obs: null, gems: null, pw: null, alt: false, i: 0, ch: gen.last };
    queue.push(r); gen.i++; return r;
  }
  function lane() { return span(gen.a, gen.b); }
  function lcx() { return (colX(gen.a) + colX(gen.b)) / 2; }
  function plain(n) { var r = null; for (var k = 0; k < n; k++) r = mkRow(lane()); return r; }
  function setLane(a, b) {
    if (a === gen.a && b === gen.b) return;
    var u = span(Math.min(a, gen.a), Math.max(b, gen.b));
    mkRow(u); mkRow(u);
    gen.a = a; gen.b = b;
  }
  function centered(w, jitter) {
    var a = clamp(4 - (w >> 1) + (jitter ? randInt(-jitter, jitter) : 0), 0, COLS - w);
    setLane(a, a + w - 1);
  }
  function gemX(r, x, h, big) { (r.gems || (r.gems = [])).push({ x: x, h: h || 0.85, big: !!big }); }
  function gemC(r, c, h, big) { gemX(r, colX(c), h, big); }
  function block(r, c0, c1, mv) {
    (r.obs || (r.obs = [])).push({ x: (colX(c0) + colX(c1)) / 2, hw: (c1 - c0 + 1) * TW / 2 - 0.1, hl: TL / 2 - 0.12, h: 1.3,
      amp: mv ? mv.amp : 0, om: mv ? mv.om : 0, ph: mv ? mv.ph : 0 });
  }

  function chCruise(len) {
    var w = gDiff() < 0.5 ? 5 : pick([4, 5]);
    centered(w, gen.count === 0 ? 0 : 1);
    var n = len || randInt(12, 18), pat = pick(['line', 'wave', 'zig']), c = randInt(gen.a + 1, gen.b - 1);
    for (var k = 0; k < n; k++) {
      var r = mkRow(lane());
      if (k > 1) {
        var cc = c;
        if (pat === 'wave') cc = Math.round((gen.a + gen.b) / 2 + ((gen.b - gen.a) / 2) * Math.sin(k * 0.45));
        else if (pat === 'zig') cc = gen.a + ((k >> 2) % (gen.b - gen.a + 1));
        gemC(r, clamp(cc, gen.a, gen.b));
      }
    }
  }
  function chBlocks() {
    var D = gDiff(), w = D < 0.3 ? 5 : pick([5, 5, 4, 6]);
    centered(w, 1); plain(2);
    var cnt = 3 + Math.floor(D * 4) + randInt(0, 1), lastFree = -1;
    for (var j = 0; j < cnt; j++) {
      var bw = (D > 0.35 && rand() < 0.4 && w >= 5) ? 2 : 1;
      var two = D > 0.45 && w >= 5 && bw === 1 && rand() < 0.4;
      var sp = reactRows(bw + 1) + (j === 0 ? 0 : randInt(0, 2));
      // The first block sits on the middle line and later ones often land where the
      // previous gem trail led, so riding straight or only chasing gems is not enough.
      var c0;
      if (j === 0) c0 = clamp(Math.round((gen.a + gen.b) / 2) - (bw > 1 ? randInt(0, 1) : 0), gen.a, gen.b - bw + 1);
      else if (lastFree >= 0 && rand() < 0.55) c0 = lastFree === gen.a ? gen.a : gen.b - bw + 1;
      else c0 = randInt(gen.a, gen.b - bw + 1);
      var free = (c0 - gen.a) >= (gen.b - (c0 + bw - 1)) ? gen.a : gen.b;
      lastFree = free;
      for (var k = 0; k < sp - 1; k++) { var pr = mkRow(lane()); if (k % 2 === 0) gemC(pr, free); }
      var r = mkRow(lane());
      block(r, c0, c0 + bw - 1);
      var c2 = -1;
      if (two) { c2 = c0 <= (gen.a + gen.b) / 2 ? gen.b : gen.a; if (Math.abs(c2 - c0) >= 2) block(r, c2, c2); else c2 = -1; }
      if (rand() < 0.3) {
        var cg = c0 - 1 >= gen.a ? c0 - 1 : c0 + bw;
        if (cg <= gen.b && cg !== c2) gemC(r, cg, 0.85, true);
      }
    }
  }
  function chHoles() {
    var D = gDiff(); centered(5, 1); plain(2);
    var cnt = 3 + Math.floor(D * 3), hr = Math.max(2, Math.round(gV() / 10));
    for (var j = 0; j < cnt; j++) {
      var hw = D < 0.3 ? 1 : pick([1, 2, 2]);
      var c0 = j === 0 ? clamp(Math.round((gen.a + gen.b) / 2) - (hw > 1 ? randInt(0, 1) : 0), gen.a, gen.b - hw + 1) : randInt(gen.a, gen.b - hw + 1);
      var sp = reactRows(hw + 1);
      var free = (c0 - gen.a) >= (gen.b - (c0 + hw - 1)) ? gen.a : gen.b;
      for (var k = 0; k < sp - 1; k++) { var pr = mkRow(lane()); if (k % 2 === 0) gemC(pr, free); }
      var m = lane() & ~span(c0, c0 + hw - 1);
      for (var h = 0; h < hr; h++) mkRow(m);
    }
  }
  function chNarrow() {
    var D = gDiff();
    var w = D < 0.3 ? 3 : D < 0.6 ? pick([3, 2]) : pick([3, 2, 2, 1]);
    centered(w, 1);
    var n = randInt(10, 16) - (w === 1 ? 3 : 0);
    var zig = D > 0.28 && rand() < 0.6, stepR = Math.max(4, reactRows(1) - 1);
    for (var k = 0; k < n; k++) {
      if (zig && k > 0 && k % stepR === 0) {
        var na = clamp(gen.a + pick([-1, 1]), 0, COLS - w);
        if (na !== gen.a) { mkRow(span(Math.min(na, gen.a), Math.max(na, gen.a) + w - 1)); gen.a = na; gen.b = na + w - 1; }
      }
      var r = mkRow(lane());
      if (k % 2 === 0) gemX(r, lcx(), 0.85, k === n - 2 && w <= 2);
    }
    var a5 = clamp(Math.round((gen.a + gen.b) / 2) - 2, 0, 4);
    setLane(a5, a5 + 4);
  }
  function chRamp() {
    var D = gDiff(), v = gV();
    var a = clamp(Math.round((gen.a + gen.b) / 2) - 2, 1, 3); setLane(a, a + 4);
    plain(3);
    var H = 2.0, vy = v * 0.5, t = (vy + Math.sqrt(vy * vy + 2 * G * H)) / G, jr = v * t / TL;
    var r1 = mkRow(0); r1.ramp = lane(); r1.rh0 = 0; r1.rh1 = 1.0;
    var r2 = mkRow(0); r2.ramp = lane(); r2.rh0 = 1.0; r2.rh1 = 2.0;
    var g = clamp(Math.floor(jr * 0.55), 3, 9), cx = lcx();
    for (var k = 0; k < g; k++) {
      var r = mkRow(0), tt = (k + 0.5) * TL / v, hy = H + vy * tt - G / 2 * tt * tt;
      if (k % 2 === 0 && hy > 0.6) gemX(r, cx, hy + R, k === 2 && rand() < 0.6);
    }
    var la = gen.a;
    if (D > 0.4 && rand() < 0.5) la = clamp(la + pick([-1, 1]), 0, 4);
    if (D < 0.3) { la = clamp(la - 1, 0, 2); gen.a = la; gen.b = la + 6; } else { gen.a = la; gen.b = la + 4; }
    var lr = Math.ceil(jr - g) + 5;
    for (var m = 0; m < lr; m++) { var lrw = mkRow(lane()); if (m >= lr - 3 && m % 2 === 0) gemX(lrw, lcx()); }
  }
  function chSliders() {
    var D = gDiff(); centered(5, 1); plain(2);
    var cnt = 3 + Math.floor(D * 3), cx = lcx();
    for (var j = 0; j < cnt; j++) {
      var sp = reactRows(2) + 1;
      var gc = cx + randInt(-2, 2) * TW;
      for (var k = 0; k < sp - 1; k++) { var pr = mkRow(lane()); if (k > 0 && k < sp - 2 && k % 2 === 0) gemX(pr, gc); }
      var r = mkRow(lane()), bw = (D > 0.55 && rand() < 0.5) ? 2 : 1, period = 3.4 - 1.3 * D;
      (r.obs || (r.obs = [])).push({ x: cx, hw: bw * TW / 2 - 0.1, hl: TL / 2 - 0.12, h: 1.3,
        amp: (5 - bw) / 2 * TW, om: Math.PI * 2 / period, ph: rand() * Math.PI * 2 });
    }
  }
  function chGates() {
    var D = gDiff(); centered(5, 1); plain(2);
    var cnt = 2 + Math.floor(D * 3), dw = D < 0.45 ? 2 : pick([1, 2]);
    var prev = Math.round((gen.a + gen.b) / 2);
    for (var j = 0; j < cnt; j++) {
      var door = randInt(gen.a, gen.b - dw + 1);
      var shift = Math.abs(door - prev) + 1, sp = reactRows(j === 0 ? 3 : shift);
      var dx = colX(door) + (dw - 1) * TW / 2;
      for (var k = 0; k < sp - 1; k++) { var pr = mkRow(lane()); if (k >= sp - 6 && k % 2 === 1) gemX(pr, dx); }
      var r = mkRow(lane());
      if (door > gen.a) block(r, gen.a, door - 1);
      if (door + dw - 1 < gen.b) block(r, door + dw, gen.b);
      gemX(r, dx, 0.85, dw === 1);
      prev = door;
    }
  }
  function chSlalom() {
    var D = gDiff(); centered(5, 1); plain(2);
    var cnt = 4 + Math.floor(D * 3), side = randInt(0, 1);
    for (var j = 0; j < cnt; j++) {
      var sp = reactRows(3);
      var fx = side ? (colX(gen.a) + colX(gen.a + 1)) / 2 : (colX(gen.b - 1) + colX(gen.b)) / 2;
      for (var k = 0; k < sp - 1; k++) { var pr = mkRow(lane()); if (k === sp - 3) gemX(pr, fx); }
      var r = mkRow(lane());
      if (side) block(r, gen.a + 2, gen.b); else block(r, gen.a, gen.a + 2);
      gemX(r, fx);
      side = 1 - side;
    }
  }
  function chBank() {
    var D = gDiff(); setLane(1, 7); plain(1);
    var B = (0.2 + 0.14 * D) * pick([-1, 1]), flip = D > 0.35 && rand() < 0.5;
    var prof = [], k;
    for (k = 1; k <= 6; k++) prof.push(B * k / 6);
    for (k = 0; k < randInt(5, 8); k++) prof.push(B);
    if (flip) {
      for (k = 1; k <= 10; k++) prof.push(B - 2 * B * k / 10);
      for (k = 0; k < randInt(4, 7); k++) prof.push(-B);
      B = -B;
    }
    for (k = 5; k >= 0; k--) prof.push(B * k / 6);
    for (k = 0; k < prof.length; k++) {
      var r = mkRow(lane()); r.bank = prof[k]; r.alt = Math.abs(prof[k]) > 0.001;
      if (k % 2 === 0 && Math.abs(prof[k]) > 0.1) gemC(r, prof[k] > 0 ? gen.b - 1 : gen.a + 1, 0.85, rand() < 0.08);
    }
  }
  function chSplit() {
    var D = gDiff(); setLane(1, 7); plain(2);
    var n = randInt(12, 18), both = span(1, 3) | span(5, 7), gs = randInt(0, 1);
    var edge = gs ? 7 : 1, mid = gs ? 6 : 2;
    for (var k = 0; k < n; k++) {
      var r = mkRow(both);
      if (k % 2 === 0) gemC(r, edge);
      if (k === 5 || (D > 0.4 && k === 11)) block(r, mid, mid);
    }
    plain(2);
  }
  function chDrop() {
    var D = gDiff(); centered(5, 1); plain(3);
    var drop = D < 0.4 ? 2.5 : 3.5, v = gV();
    gen.base -= drop;
    var t = Math.sqrt(2 * drop / G), jr = Math.ceil(v * t / TL), cx = lcx();
    for (var k = 0; k < jr + 7; k++) {
      var r = mkRow(lane()), tk = (k + 0.5) * TL / v, hy = drop - G / 2 * tk * tk;
      if (k % 2 === 0 && hy > 0.4) gemX(r, cx, hy + R);
      else if (k > jr + 1 && k % 2 === 0) gemX(r, cx);
    }
  }
  function chStairs() {
    centered(5, 1); plain(2);
    var steps = randInt(3, 5), v = gV(), len = Math.max(6, Math.ceil(v * 0.26 / TL) + 3);
    for (var s = 0; s < steps; s++) {
      gen.base -= 1.0;
      for (var k = 0; k < len; k++) { var r = mkRow(lane()); if (k === len - 2) gemX(r, lcx() + randInt(-1, 1) * TW); }
    }
  }
  function rest() {
    var D = gDiff(), n = Math.round(5 - 3 * D) + randInt(0, 1);
    if (gen.b - gen.a < 4) { var a = clamp(Math.round((gen.a + gen.b) / 2) - 2, 0, 4); setLane(a, a + 4); }
    var gcx = colX(randInt(gen.a, gen.b));
    for (var k = 0; k < n; k++) {
      var r = mkRow(lane());
      if (k % 2 === 1 && k !== 1) gemX(r, gcx);
      if (k === 1 && gD() > gen.nextPw) { r.pw = rand() < 0.5 ? 'shield' : 'magnet'; gen.nextPw = gD() + 380 + rand() * 240; }
    }
  }
  var CHUNKS = [
    { id: 'cruise', f: chCruise, w: function (D) { return 1.1 - 0.7 * D; }, min: 0 },
    { id: 'blocks', f: chBlocks, w: function () { return 2; }, min: 0 },
    { id: 'ramp', f: chRamp, w: function () { return 1.35; }, min: 0 },
    { id: 'narrow', f: chNarrow, w: function () { return 1; }, min: 0 },
    { id: 'stairs', f: chStairs, w: function () { return 0.7; }, min: 0.05 },
    { id: 'holes', f: chHoles, w: function () { return 1.2; }, min: 0.09 },
    { id: 'gates', f: chGates, w: function () { return 1.1; }, min: 0.13 },
    { id: 'drop', f: chDrop, w: function () { return 0.6; }, min: 0.1 },
    { id: 'bank', f: chBank, w: function () { return 1; }, min: 0.16 },
    { id: 'sliders', f: chSliders, w: function () { return 1.2; }, min: 0.2 },
    { id: 'split', f: chSplit, w: function () { return 0.9; }, min: 0.22 },
    { id: 'slalom', f: chSlalom, w: function () { return 1; }, min: 0.26 }
  ];
  var INTRO = ['cruise', 'blocks', 'ramp', 'narrow', 'stairs', 'holes'];
  function nextChunk() {
    var D = gDiff(), id = null;
    if (gen.count < INTRO.length) id = INTRO[gen.count];
    var ch = null;
    if (id) { for (var i = 0; i < CHUNKS.length; i++) if (CHUNKS[i].id === id) ch = CHUNKS[i]; }
    else {
      var tot = 0, list = [];
      for (var j = 0; j < CHUNKS.length; j++) {
        var c = CHUNKS[j]; if (D < c.min || c.id === gen.last) continue;
        var w = Math.max(0.1, c.w(D)); tot += w; list.push([c, w]);
      }
      var x = rand() * tot;
      for (var k = 0; k < list.length; k++) { x -= list[k][1]; if (x <= 0) { ch = list[k][0]; break; } }
      if (!ch) ch = list[list.length - 1][0];
    }
    gen.count++; gen.last = ch.id;
    if (ch.id === 'cruise' && gen.count === 1) ch.f(18); else ch.f();
    rest();
  }
  function resetGen(startRow) {
    gen.i = startRow; gen.base = 0; gen.a = 2; gen.b = 6; gen.last = ''; gen.count = 0;
    gen.nextPw = startRow * TL + 240;
    queue.length = 0;
    if (startRow > 0) gen.count = INTRO.length;
  }

  /* ----------------------------------------------------- materialize */
  var zoneCols = ZONES.map(function (z) { return new T.Color(z.c); });
  var WHITE = new T.Color(0xffffff);
  function tintFor(i, r, out) {
    var d = i * TL, z = zoneOf(d), info = zoneInfo(z);
    if (info.prism) out.setHSL(((i * 0.012) % 1 + 1) % 1, 1, 0.58);
    else out.copy(zoneCols[z % ZONES.length]);
    if (r.alt) out.lerp(WHITE, 0.4);
    if (i % 2) out.multiplyScalar(0.8);
    return out;
  }
  function setShear(mesh, idx, cx, cy, cz, sx, sy, sz, kx, kz) {
    tmpM.set(sx, 0, 0, cx, kx * sx, sy, kz * sz, cy, 0, 0, sz, cz, 0, 0, 0, 1);
    mesh.setMatrixAt(idx, tmpM);
  }
  function poolGet(pool) { for (var i = 0; i < pool.length; i++) if (!pool[i].active) return pool[i]; return null; }
  var nextMarkerM = 100;
  function materialize() {
    if (!queue.length) nextChunk();
    var r = queue.shift(), i = rowHead++, s = i % NR;
    r.i = i; rows[s] = r;
    var zc = -(i * TL + TL / 2);
    tintFor(i, r, tmpC);
    for (var c = 0; c < COLS; c++) {
      var idx = s * COLS + c, bit = 1 << c, x = colX(c);
      if (r.ramp & bit) {
        var th2 = TH + 0.6;
        setShear(rampMesh, idx, x, r.base + (r.rh0 + r.rh1) / 2 - th2 / 2, zc, TW, th2, TL, 0, -(r.rh1 - r.rh0) / TL);
        tileMesh.setMatrixAt(idx, ZERO_M);
      } else if (r.mask & bit) {
        setShear(tileMesh, idx, x, r.base + r.bank * x - TH / 2, zc, TW, TH, TL, r.bank, 0);
        tileMesh.setColorAt(idx, tmpC);
        rampMesh.setMatrixAt(idx, ZERO_M);
      } else {
        tileMesh.setMatrixAt(idx, ZERO_M); rampMesh.setMatrixAt(idx, ZERO_M);
      }
    }
    if (s * COLS < dirty.lo) dirty.lo = s * COLS;
    if (s * COLS + COLS - 1 > dirty.hi) dirty.hi = s * COLS + COLS - 1;
    var dc = i * TL + TL / 2, k, p;
    if (r.obs) for (k = 0; k < r.obs.length; k++) {
      var o = r.obs[k]; p = poolGet(obs); if (!p) break;
      p.active = true; p.cx = p.x = o.x; p.hw = o.hw; p.hl = o.hl; p.h = o.h; p.amp = o.amp; p.om = o.om; p.ph = o.ph;
      p.d = dc; p.y = r.base + r.bank * o.x; p.passed = false;
      if (p.amp) p.x = p.cx + p.amp * Math.sin(st.t * p.om + p.ph);
    }
    if (r.gems) for (k = 0; k < r.gems.length; k++) {
      var gq = r.gems[k]; p = poolGet(gems); if (!p) break;
      p.active = true; p.x = gq.x; p.y = r.base + r.bank * gq.x + gq.h; p.d = dc; p.big = gq.big; p.ph = rand() * 6.28; p.pull = false;
      gemMesh.setColorAt(gems.indexOf(p), gq.big ? BIG_COL : GEM_COL);
      gemMesh.instanceColor.needsUpdate = true;
    }
    if (r.pw) {
      for (k = 0; k < pickups.length; k++) {
        p = pickups[k];
        if (!p.active && p.type === r.pw) {
          p.active = true; p.x = lcxOfRow(r); p.y = r.base + 1.0; p.d = dc; p.mesh.visible = true; break;
        }
      }
    }
    var d0 = i * TL - START_D, d1 = d0 + TL;
    if (d0 < nextMarkerM && d1 >= nextMarkerM) {
      if (!r.bank && (r.mask | r.ramp)) placeMarker(nextMarkerM, lcxOfRow(r), r.base, nextMarkerM + START_D);
      nextMarkerM += 100;
    }
    if (st.bestD > 0 && i * TL <= st.bestD && st.bestD < (i + 1) * TL) {
      bestGate.position.set(0, r.base + r.bank * 0, -st.bestD); bestGate.visible = true;
    }
  }
  function lcxOfRow(r) {
    var m = r.mask | r.ramp, lo = -1, hi = -1;
    for (var c = 0; c < COLS; c++) if (m & (1 << c)) { if (lo < 0) lo = c; hi = c; }
    return lo < 0 ? 0 : (colX(lo) + colX(hi)) / 2;
  }
  function ensureRows(full) {
    var need = Math.floor(ball.d / TL) + AHEAD, n = 0;
    while (rowHead < need && (full || n < 40)) { materialize(); n++; }
  }
  function flushInstances() {
    if (dirty.hi >= 0) {
      var lo = dirty.lo, cnt = dirty.hi - dirty.lo + 1;
      [tileMesh, rampMesh].forEach(function (m) {
        m.instanceMatrix.clearUpdateRanges(); m.instanceMatrix.addUpdateRange(lo * 16, cnt * 16); m.instanceMatrix.needsUpdate = true;
      });
      tileMesh.instanceColor.clearUpdateRanges(); tileMesh.instanceColor.addUpdateRange(lo * 3, cnt * 3); tileMesh.instanceColor.needsUpdate = true;
      dirty.lo = 1e9; dirty.hi = -1;
    }
  }

  /* ============================================================ STATE */
  var st = {
    mode: 'title', demo: true, t: 0, timeScale: 1, tsTarget: 1, dieT: 0, overT: 0, reason: 'bonk',
    zone: 0, gemsRun: 0, combo: 0, lastGem: -9, bestPassed: false, bestD: 0, shake: 0, fovKick: 0,
    nearCool: 0, hintT: 0, steerCool: 0, lastDir: 0, lastUnlockCheck: 0
  };
  var ball = { x: 0, y: 0, d: START_D, vx: 0, vy: 0, vz: 15, grounded: true, air: 0, groundY: 0, slope: 0, bank: 0,
    sq: 0, sqV: 0, dead: false, shield: false, magnet: 0 };
  var SURF = { slope: 0, bank: 0 };
  var cam = { x: 0, y: 0, roll: 0 };
  var dbg = { auto: false, god: false, deaths: 0, log: [], dir: null };

  function resetWorld(demo, startAt) {
    startAt = startAt || 0;
    st.demo = demo; st.t = 0; st.timeScale = 1; st.tsTarget = 1; st.dieT = 0; st.overT = 0;
    st.curCh = ''; st.called = {};
    st.gemsRun = 0; st.misGems = 0; st.rs = { gems: 0, air: 0, near: 0, power: 0 }; st.combo = 0; st.lastGem = -9; st.bestPassed = false; st.fovKick = 0; st.shake = 0;
    st.bestD = save.best >= 30 && !demo ? save.best + START_D : 0;
    if (st.bestD) drawBestSign(save.best);
    bestGate.visible = false;
    var k;
    for (k = 0; k < OBS_N; k++) { obs[k].active = false; obsMesh.setMatrixAt(k, ZERO_M); }
    for (k = 0; k < GEM_N; k++) { gems[k].active = false; gemMesh.setMatrixAt(k, ZERO_M); GG.size[k] = 0; }
    for (k = 0; k < pickups.length; k++) { pickups[k].active = false; pickups[k].mesh.visible = false; }
    for (k = 0; k < markers.length; k++) markers[k].mesh.visible = false;
    for (k = 0; k < DEC_N; k++) decs[k].d = -999;
    for (k = 0; k < SH_N; k++) { shards[k].life = 0; shardMesh.setMatrixAt(k, ZERO_M); }
    shardMesh.instanceMatrix.needsUpdate = true;
    for (k = 0; k < NI; k++) { tileMesh.setMatrixAt(k, ZERO_M); rampMesh.setMatrixAt(k, ZERO_M); }
    dirty.lo = 0; dirty.hi = NI - 1;
    clearParticles();
    var startRow = Math.floor(startAt / TL);
    resetGen(startRow); rowHead = startRow; firstRow = startRow;
    for (k = 0; k < NR; k++) rows[k] = null;
    nextMarkerM = Math.floor(startAt / 100) * 100 + 100;
    ball.x = 0; ball.y = 0; ball.d = startAt + START_D; ball.vx = 0; ball.vy = 0; ball.vz = demo ? 13 : speedAt(ball.d);
    ball.grounded = true; ball.air = 0; ball.groundY = 0; ball.slope = 0; ball.bank = 0; ball.sq = 0; ball.sqV = 0;
    ball.dead = false; ball.shield = false; ball.magnet = 0;
    ballRoot.visible = true; shieldMesh.visible = false; magnetRing.visible = false;
    st.zone = zoneOf(ball.d);
    ensureRows(true);
    cam.x = 0; cam.y = 0;
    for (k = 0; k < TN; k++) { trailPts[k].x = 0; trailPts[k].y = 0.07; trailPts[k].z = -ball.d + k * 0.25; }
    trailMat.opacity = 1;
    setHorizon(st.zone);
  }
  var HOR_BASE = new T.Color(0xff3fa4);
  function setHorizon(z) {
    var info = zoneInfo(z);
    skyMat.uniforms.hor.value.set(info.prism ? '#ff3fa4' : info.c).lerp(HOR_BASE, 0.45);
  }

  /* ========================================================== PHYSICS */
  function tileH(i, c, x, d) {
    if (c < 0 || c >= COLS) return NaN;
    var r = getRow(i); if (!r) return NaN;
    var bit = 1 << c;
    if (r.ramp & bit) {
      var f = clamp((d - i * TL) / TL, 0, 1);
      SURF.slope = (r.rh1 - r.rh0) / TL; SURF.bank = 0;
      return r.base + r.rh0 + (r.rh1 - r.rh0) * f;
    }
    if (r.mask & bit) { SURF.slope = 0; SURF.bank = r.bank; return r.base + r.bank * x; }
    return NaN;
  }
  function surfAt(x, d) {
    var i = Math.floor(d / TL), cf = x / TW + 4, c = Math.round(cf);
    var h = tileH(i, c, x, d);
    if (h === h) return h;
    var off = cf - c, m = 0.22 / TW;
    if (off > 0.5 - m) { h = tileH(i, c + 1, x, d); if (h === h) return h; }
    if (off < -0.5 + m) { h = tileH(i, c - 1, x, d); if (h === h) return h; }
    if (d / TL - i < 0.1) { h = tileH(i - 1, c, x, d); if (h === h) return h; }
    return NaN;
  }

  function stepBall(dt, dir) {
    var b = ball;
    var tv = st.demo ? 13 : speedAt(b.d);
    b.vz += (tv - b.vz) * Math.min(1, dt * 2);
    var vmax = vxMaxAt(b.vz);
    var acc = b.grounded ? 66 : 44;
    if (dir) {
      var a = dir * acc; if (b.vx * dir < 0) a *= 1.8;
      b.vx += a * dt;
      if (b.vx > vmax) b.vx = Math.max(vmax, b.vx - acc * 2 * dt);
      if (b.vx < -vmax) b.vx = Math.min(-vmax, b.vx + acc * 2 * dt);
    } else b.vx *= Math.exp(-dt * (b.grounded ? 6.5 : 1.1));
    if (b.grounded && b.bank) b.vx -= G * 1.4 * b.bank / Math.sqrt(1 + b.bank * b.bank) * dt;
    b.vx = clamp(b.vx, -vmax * 1.25, vmax * 1.25);
    b.x += b.vx * dt; b.d += b.vz * dt;
    var s = surfAt(b.x, b.d);
    if (b.grounded) {
      if (s === s && s > b.y - 0.55) {
        b.y = s; b.slope = SURF.slope; b.bank = SURF.bank; b.groundY = s;
      } else {
        b.grounded = false; b.air = 0;
        b.vy = Math.max(0, b.slope) * b.vz; b.bank = 0;
        if (b.vy > 4) onLaunch();
        else if (s === s) { b.sqV += 2; if (!st.demo) SND.sfx.drop(); }
      }
    } else {
      b.vy -= G * dt; b.y += b.vy * dt; b.air += dt;
      if (s === s && b.y <= s) {
        if (b.y >= s - 0.7) land(s);
        else if (b.y > s - TH - 2 * R) { die('lip'); return; }
      }
      if (b.y < b.groundY - 5) { die('fall'); return; }
    }
  }
  function onLaunch() {
    ball.sqV += 5;
    if (st.demo) return;
    SND.sfx.jump(); st.fovKick = Math.max(st.fovKick, 7); st.shake = Math.max(st.shake, 0.12);
    burst(ball.x, ball.y + 0.1, -ball.d, 16, 6, 0.5, 0.5, ['#ffe14d', '#ffffff', glowHex], 6);
  }
  function land(s) {
    var b = ball, imp = -b.vy;
    b.y = s; b.vy = 0; b.grounded = true; b.groundY = s; b.slope = SURF.slope; b.bank = SURF.bank;
    var p = clamp(imp / 20, 0, 1);
    b.sqV -= 3 + p * 9;
    if (!st.demo) {
      SND.sfx.land(p);
      if (p > 0.3) st.shake = Math.max(st.shake, p * 0.35);
      var n = Math.round(6 + p * 18);
      for (var k = 0; k < n; k++) {
        var a = k / n * Math.PI * 2;
        emit(b.x + Math.cos(a) * 0.4, s + 0.08, -b.d + Math.sin(a) * 0.4, Math.cos(a) * (3 + p * 6), 0.6 + rand(), Math.sin(a) * (3 + p * 6) - b.vz * 0.3, 0.45, 0.55, k % 2 ? glowHex : '#ffffff', 3, 3);
      }
      if (b.air > 0.8) {
        var bonus = b.air > 1.25 ? 3 : 1;
        st.gemsRun += bonus; st.rs.air++;
        popup((b.air > 1.25 ? 'قفزة خارقة! ' : 'قفزة عالية! ') + ltr('+' + bonus), '#ffe14d', true, b.x, s + 1.5, b.d + 2);
        bumpGems();
      }
    }
  }

  function die(reason) {
    if (ball.dead) return;
    if (st.demo) { resetWorld(true); return; }
    if (dbg.god) {
      var dr = getRow(Math.floor(ball.d / TL));
      dbg.deaths++; if (dbg.log.length < 200) dbg.log.push({ m: Math.floor(ball.d - START_D), why: reason, ch: dr ? dr.ch : '?', x: +ball.x.toFixed(2) });
      godRespawn(); return;
    }
    ball.dead = true; st.mode = 'dying'; st.dieT = 0; st.reason = reason;
    st.hintT = 0; $('hHint').classList.remove('show');
    st.tsTarget = 0.28;
    shatter();
    SND.sfx.crash(); if (reason === 'fall') SND.sfx.fall();
    SND.setMusic(0); SND.rollSound(0, 0);
    st.shake = 0.7; flash(0.75);
  }
  function godRespawn() {
    var i0 = Math.floor(ball.d / TL) + 4;
    for (var k = 0; k < 30; k++) {
      var r = getRow(i0 + k);
      if (r && r.mask && !r.ramp) {
        ball.d = (i0 + k) * TL + 0.5; ball.x = lcxOfRow(r); ball.y = r.base + r.bank * ball.x; ball.vx = 0; ball.vy = 0;
        ball.grounded = true; ball.groundY = ball.y; ball.slope = 0; ball.bank = r.bank; return;
      }
    }
  }
  function shatter() {
    var b = ball, cy = b.y + R;
    ballRoot.visible = false;
    for (var k = 0; k < SH_N; k++) {
      var s = shards[k];
      s.p.set(b.x + (rand() - 0.5) * 0.6, cy + (rand() - 0.5) * 0.6, -b.d + (rand() - 0.5) * 0.6);
      s.v.set((rand() - 0.5) * 14, 3 + rand() * 9, -b.vz * (0.25 + rand() * 0.4) + (rand() - 0.5) * 8);
      s.q.setFromEuler(new T.Euler(rand() * 6, rand() * 6, rand() * 6));
      s.w.set(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize();
      s.spin = 6 + rand() * 14; s.s = 0.6 + rand() * 1.2; s.life = 2.6 + rand();
      shardMesh.setColorAt(k, tmpC.set(k % 3 === 0 ? '#ffffff' : glowHex));
    }
    shardMesh.instanceColor.needsUpdate = true;
    burst(b.x, cy, -b.d, 70, 14, 1.1, 0.8, [glowHex, '#ffffff', glowHex, '#ff3fd0'], 10, 2, b.vz * 0.3);
  }
  var _q = new T.Quaternion(), _v = new T.Vector3(), _s = new T.Vector3();
  function updateShards(dt) {
    var any = false;
    for (var k = 0; k < SH_N; k++) {
      var s = shards[k];
      if (s.life <= 0) continue;
      any = true;
      s.life -= dt;
      s.v.y -= G * 0.6 * dt; s.v.multiplyScalar(Math.exp(-dt * 0.6));
      s.p.addScaledVector(s.v, dt);
      _q.setFromAxisAngle(s.w, s.spin * dt); s.q.premultiply(_q);
      var sc = s.life > 0 ? s.s * Math.min(1, s.life) : 0;
      _s.set(sc, sc, sc);
      tmpM.compose(s.p, s.q, _s);
      shardMesh.setMatrixAt(k, s.life > 0 ? tmpM : ZERO_M);
    }
    if (any) shardMesh.instanceMatrix.needsUpdate = true;
  }

  /* ------------------------------------------------ world objects step */
  var _pos = new T.Vector3(), _sc = new T.Vector3(), _qq = new T.Quaternion(), _e = new T.Euler();
  function updateObstacles(dt) {
    var pulse = 0.85 + 0.15 * Math.sin(st.t * 7);
    tmpC.setRGB(pulse, pulse, pulse);
    for (var k = 0; k < OBS_N; k++) {
      var o = obs[k];
      if (!o.active) continue;
      if (o.d < ball.d - 12) { o.active = false; obsMesh.setMatrixAt(k, ZERO_M); continue; }
      if (o.amp) o.x = o.cx + o.amp * Math.sin(st.t * o.om + o.ph);
      tmpM.makeScale(o.hw * 2, o.h, o.hl * 2);
      tmpM.setPosition(o.x, o.y + o.h / 2, -o.d);
      obsMesh.setMatrixAt(k, tmpM);
      obsMesh.setColorAt(k, tmpC);
    }
    obsMesh.instanceMatrix.needsUpdate = true;
    obsMesh.instanceColor.needsUpdate = true;
  }
  function updateGems(dt) {
    var b = ball, bcy = b.y + R;
    for (var k = 0; k < GEM_N; k++) {
      var g = gems[k];
      if (!g.active) continue;
      var dz = g.d - b.d;
      if (dz < -6) { g.active = false; gemMesh.setMatrixAt(k, ZERO_M); GG.size[k] = 0; continue; }
      if (!b.dead && b.magnet > 0 && dz < 16 && dz > -2) {
        var dx = b.x - g.x, dy = bcy - g.y;
        if (dx * dx + dy * dy + dz * dz < 64 || g.pull) {
          g.pull = true;
          var f = Math.min(1, dt * 10);
          g.x += dx * f; g.y += dy * f; g.d += (b.d - g.d) * f;
        }
      }
      var bob = Math.sin(st.t * 3 + g.ph) * 0.12;
      var sc = g.big ? 1.6 : 1;
      _e.set(0, st.t * 3 + g.ph, 0); _qq.setFromEuler(_e);
      _pos.set(g.x, g.y + bob, -g.d); _sc.set(sc, sc * 1.35, sc);
      tmpM.compose(_pos, _qq, _sc);
      gemMesh.setMatrixAt(k, tmpM);
      GG.pos[k * 3] = g.x; GG.pos[k * 3 + 1] = g.y + bob; GG.pos[k * 3 + 2] = -g.d;
      var tw = 0.55 + 0.25 * Math.sin(st.t * 5 + g.ph);
      GG.col[k * 3] = tw; GG.col[k * 3 + 1] = (g.big ? 0.37 : 0.85) * tw; GG.col[k * 3 + 2] = (g.big ? 0.88 : 0.23) * tw;
      GG.size[k] = g.big ? 3.2 : 2.2;
      if (!b.dead && Math.abs(dz) < 1.4) {
        var ex = g.x - b.x, ey = g.y - bcy;
        if (ex * ex + ey * ey + dz * dz < 1.15 * 1.15) collectGem(k, g);
      }
    }
    gemMesh.instanceMatrix.needsUpdate = true;
    GG.geo.attributes.position.needsUpdate = true; GG.geo.attributes.pcolor.needsUpdate = true; GG.geo.attributes.psize.needsUpdate = true;
  }
  function collectGem(k, g) {
    g.active = false; gemMesh.setMatrixAt(k, ZERO_M); GG.size[k] = 0;
    var col = g.big ? '#ff5fe0' : '#ffd93b';
    burst(g.x, g.y, -g.d, g.big ? 22 : 10, g.big ? 7 : 4.5, 0.45, g.big ? 0.8 : 0.55, [col, '#ffffff'], 2, 0, ball.vz * 0.2);
    if (st.demo) return;
    if (st.t - st.lastGem < 0.8) st.combo++; else st.combo = 0;
    st.lastGem = st.t;
    var v = g.big ? 5 : 1;
    st.gemsRun += v; st.rs.gems += v;
    if (g.big) { SND.sfx.bigGem(); popup(ltr('+5'), '#ff5fe0', true, g.x, g.y + 0.8, g.d); }
    else {
      SND.sfx.gem(st.combo);
      if (st.combo > 0 && st.combo % 5 === 4) popup('سلسلة ' + (st.combo + 1) + '!', '#ffd93b', false, g.x, g.y + 1, g.d);
    }
    bumpGems();
  }
  function updatePickups(dt) {
    var b = ball;
    for (var k = 0; k < pickups.length; k++) {
      var p = pickups[k];
      if (!p.active) continue;
      if (p.d < b.d - 8) { p.active = false; p.mesh.visible = false; continue; }
      p.mesh.position.set(p.x, p.y + Math.sin(st.t * 3) * 0.15, -p.d);
      if (p.type === 'shield') p.mesh.children[0].rotation.set(st.t * 1.3, st.t * 2, 0);
      else p.mesh.rotation.y = Math.sin(st.t * 2) * 0.6;
      p.halo.quaternion.copy(camera.quaternion);
      p.halo.quaternion.premultiply(_qq.setFromEuler(_e.set(SLOPE, 0, 0)));
      p.halo.quaternion.premultiply(_qq.copy(p.mesh.quaternion).invert());
      if (!b.dead) {
        var dx = p.x - b.x, dy = p.y - (b.y + R), dz = p.d - b.d;
        if (dx * dx + dy * dy + dz * dz < 1.5 * 1.5) {
          p.active = false; p.mesh.visible = false;
          if (st.demo) continue;
          st.rs.power++;
          if (p.type === 'shield') { b.shield = true; SND.sfx.shield(); popup('درع!', '#3ff0ff', true, p.x, p.y + 1, p.d); }
          else { b.magnet = 10; SND.sfx.magnet(); popup('مغناطيس!', '#b46bff', true, p.x, p.y + 1, p.d); }
          burst(p.x, p.y, -p.d, 30, 7, 0.6, 0.7, [p.type === 'shield' ? '#3ff0ff' : '#b46bff', '#ffffff'], 0);
        }
      }
    }
  }
  var _dc = new T.Color();
  function spawnDec(k, d) {
    var o = decs[k], side = k % 2 ? 1 : -1, z = zoneOf(d), info = zoneInfo(z);
    o.d = d; o.x = side * (14 + rand() * 24); o.y = ball.groundY - 8 + rand() * 20; o.s = 0.8 + rand() * 2;
    o.ph = rand() * 6; o.sp = (rand() - 0.5) * 1.6;
    if (info.prism) _dc.setHSL(rand(), 1, 0.6); else _dc.set(info.c);
    if (rand() < 0.3) _dc.set(pick(['#29ecff', '#ff3fd0', '#b46bff']));
    decMesh.setColorAt(k, _dc); decMesh.instanceColor.needsUpdate = true;
  }
  function updateDecs() {
    for (var k = 0; k < DEC_N; k++) {
      var o = decs[k];
      if (o.d < ball.d - 12) spawnDec(k, o.d < 0 || o.d < ball.d - 60 ? ball.d + 8 + (k / DEC_N) * 165 + rand() * 6 : ball.d + 160 + rand() * 20);
      _e.set(st.t * o.sp + o.ph, st.t * o.sp * 0.7, 0); _qq.setFromEuler(_e);
      _pos.set(o.x, o.y + Math.sin(st.t * 0.8 + o.ph) * 0.6, -o.d); _sc.set(o.s, o.s, o.s);
      tmpM.compose(_pos, _qq, _sc); decMesh.setMatrixAt(k, tmpM);
    }
    decMesh.instanceMatrix.needsUpdate = true;
  }
  function checkObstacles() {
    var b = ball, cy = b.y + R, rr = R * 0.78;
    for (var k = 0; k < OBS_N; k++) {
      var o = obs[k];
      if (!o.active) continue;
      var ddz = Math.abs(b.d - o.d);
      if (!o.passed && o.d + o.hl < b.d - R) {
        o.passed = true;
        var gap = Math.abs(b.x - o.x) - o.hw - R;
        if (!st.demo && gap < 0.42 && cy < o.y + o.h + 0.2 && st.nearCool <= 0) {
          st.nearCool = 1.2; st.rs.near++; SND.sfx.near(); popup('بفارق شعرة!', '#3ff0ff', false, b.x, cy + 1.2, b.d + 1.5);
        }
      }
      if (ddz > o.hl + R + 0.3) continue;
      var dx = Math.max(Math.abs(b.x - o.x) - o.hw, 0), dz = Math.max(ddz - o.hl, 0);
      var dy = cy < o.y ? o.y - cy : (cy > o.y + o.h ? cy - (o.y + o.h) : 0);
      if (dx * dx + dy * dy + dz * dz < rr * rr) {
        if (b.shield) {
          b.shield = false; o.active = false; obsMesh.setMatrixAt(k, ZERO_M);
          SND.sfx.shieldPop(); st.shake = 0.35; flash(0.3);
          burst(o.x, o.y + o.h / 2, -o.d, 40, 10, 0.7, 0.7, ['#ff1f4a', '#ffd0d8', '#3ff0ff'], 8);
          popup('أنقذك الدرع!', '#3ff0ff', true, b.x, cy + 1.2, b.d + 2);
        } else { die('bonk'); return; }
      }
    }
  }

  /* ----------------------------------------------------------- autopilot */
  var apObs = [];
  function autopilot() {
    var b = ball, i0 = Math.floor(b.d / TL), n = clamp(Math.round(b.vz * 1.0 / TL), 8, 26);
    apObs.length = 0;
    for (var k = 0; k < OBS_N; k++) if (obs[k].active && obs[k].d > b.d - 1 && obs[k].d < b.d + n * TL + 2) apObs.push(obs[k]);
    var cur = b.x / TW + 4, bestC = Math.round(cur), bestS = -1e9;
    for (var c = 0; c < COLS; c++) {
      var s = 0;
      for (var j = 0; j <= n; j++) {
        var i = i0 + j, r = getRow(i);
        if (!r) break;
        var all = r.mask | r.ramp;
        if (!all) { s += 1; continue; }
        if (!((all >> c) & 1)) { if (j === 0) { s -= 0.5; continue; } break; }
        var tArr = (i * TL + TL / 2 - b.d) / b.vz, x = colX(c), hit = false;
        for (var q = 0; q < apObs.length; q++) {
          var o = apObs[q];
          if (Math.abs(o.d - (i * TL + TL / 2)) > 0.5) continue;
          var ox = o.amp ? o.cx + o.amp * Math.sin((st.t + tArr) * o.om + o.ph) : o.x;
          if (Math.abs(ox - x) < o.hw + R + (o.amp ? 0.6 : 0.2)) { hit = true; break; }
        }
        if (hit) break;
        s++;
      }
      var sc = s * 10 - Math.abs(c - cur) * 1.2 - Math.abs(c - 4) * 0.1;
      if (sc > bestS) { bestS = sc; bestC = c; }
    }
    var want = clamp((colX(bestC) - b.x) * 4, -vxMaxAt(b.vz), vxMaxAt(b.vz));
    var dv = want - b.vx;
    return Math.abs(dv) < 0.7 ? 0 : (dv > 0 ? 1 : -1);
  }

  /* ============================================================= INPUT */
  var K = Kit.keys;
  function inputDir() {
    var l = K.anyDown(['ArrowLeft', 'KeyA']), r = K.anyDown(['ArrowRight', 'KeyD']);
    return (r ? 1 : 0) - (l ? 1 : 0);
  }
  var shopOpen = false;
  function handleInput() {
    if (shopOpen) { if (K.anyPressed(['Escape', 'Backspace'])) closeShop(); return; }
    switch (st.mode) {
      case 'title':
        if (K.anyPressed(['Space', 'Enter'])) startRun();
        else if (K.pressed('KeyS')) openShop();
        break;
      case 'play':
        if (K.anyPressed(['KeyP', 'Escape'])) pauseGame();
        break;
      case 'paused':
        if (K.anyPressed(['KeyP', 'Escape', 'Enter', 'Space'])) resumeGame();
        else if (K.pressed('KeyR')) startRun();
        break;
      case 'over':
        if (st.overT > 0.45 && K.anyPressed(['Space', 'Enter', 'KeyR'])) startRun();
        else if (K.pressed('Escape')) showTitle();
        else if (K.pressed('KeyS')) openShop();
        break;
    }
  }

  /* ============================================================ UPDATE */
  function update(dt) {
    if (st.mode === 'paused') return;
    st.timeScale += (st.tsTarget - st.timeScale) * Math.min(1, dt * 5);
    var sdt = dt * st.timeScale;
    st.t += sdt;
    var b = ball;
    if (!b.dead && (st.mode === 'play' || st.mode === 'title')) {
      var dir = (st.mode === 'title' || dbg.auto) ? autopilot() : (dbg.dir !== null ? dbg.dir : inputDir());
      if (st.mode === 'play' && dir && dir !== st.lastDir && Math.abs(b.vx) > 4 && st.steerCool <= 0) { SND.sfx.steer(); st.steerCool = 0.25; }
      st.lastDir = dir;
      stepBall(sdt, dir);
      if (!b.dead) checkObstacles();
      if (!b.dead && st.mode === 'play') playTick(sdt);
    }
    ensureRows();
    updateObstacles(sdt); updateGems(sdt); updatePickups(sdt); updateDecs();
    updateParticles(sdt); updateShards(sdt);
    if (!b.dead) trailFx(sdt);
    updateBallVisual(sdt);
    st.shake = Math.max(0, st.shake - dt * 1.8);
    st.fovKick = Math.max(0, st.fovKick - dt * 8);
    st.nearCool -= dt; st.steerCool -= dt;
    if (st.mode === 'dying') { st.dieT += dt; if (st.dieT > 1.25) gameOver(); }
    if (st.mode === 'over') st.overT += dt;
  }
  function playTick(dt) {
    var b = ball;
    if (b.magnet > 0) { b.magnet -= dt; if (b.magnet <= 0) b.magnet = 0; }
    var z = zoneOf(b.d);
    if (z > st.zone) {
      st.zone = z; var info = zoneInfo(z);
      banner('المنطقة ' + (z + 1), info.name, info.prism ? '#ffffff' : info.c);
      SND.sfx.zone(); setHorizon(z);
      burst(b.x, b.y + 1, -b.d - 3, 40, 9, 0.9, 0.8, [info.prism ? '#ff3fd0' : info.c, '#ffffff', '#ffd93b'], 3, 3);
      if (z >= 2) SND.setMusic(3);
    }
    if (st.bestD && !st.bestPassed && b.d > st.bestD) {
      st.bestPassed = true; SND.sfx.best();
      $('hBest').textContent = 'رقم قياسي جديد!'; $('hBest').classList.add('beat');
      popup('رقم قياسي جديد!', '#ffd93b', true, b.x, b.y + 2, b.d + 3);
      burst(b.x, b.y + 1.5, -b.d - 4, 60, 10, 1.2, 0.8, ['#ffd93b', '#ff3fd0', '#3ff0ff', '#7dff3a', '#ffffff'], 8, 4);
    }
    var ar = getRow(Math.floor((b.d + 16) / TL));
    if (ar && ar.ch !== st.curCh) {
      st.curCh = ar.ch;
      if (CALLOUTS[ar.ch] && !st.called[ar.ch]) { st.called[ar.ch] = true; callout(CALLOUTS[ar.ch]); }
    }
    checkMissions(true);
    var m = Math.floor(b.d - START_D);
    if (m >= st.lastUnlockCheck + 50) { st.lastUnlockCheck = m - m % 50; distanceUnlocks(m, true); }
    if (st.hintT > 0) {
      st.hintT -= dt;
      if (st.hintT <= 0 || (st.t > 1.5 && Math.abs(b.vx) > 3)) { st.hintT = 0; $('hHint').classList.remove('show'); }
    }
    var speedN = clamp(b.vz / 38, 0, 1);
    SND.rollSound(b.grounded ? 0.35 + speedN * 0.65 : 0.08, b.vz);
  }

  var CALLOUTS = { ramp: 'منصة قفز! طِر عاليًا!', narrow: 'طريق ضيق!', stairs: 'درجات!', holes: 'انتبه للحفر!', gates: 'ابحث عن الفتحة!',
    drop: 'سقطة كبيرة!', bank: 'طريق مائل! اصعد للأعلى!', sliders: 'مكعبات متحركة!', split: 'اختر طريقك!', slalom: 'يمينًا ويسارًا!' };
  function callout(text) {
    var e = popEls[popNext]; popNext = (popNext + 1) % popEls.length;
    e.textContent = text; e.className = 'pop big callout'; e.style.setProperty('--pc', zoneInfo(st.zone).prism ? '#ff3fd0' : zoneInfo(st.zone).c);
    e.style.left = '50%'; e.style.top = '38%'; e.style.display = 'block';
    e.style.animation = 'none'; void e.offsetWidth; e.style.animation = '';
  }
  var TRAIL_RATE = { sparkle: 36, fire: 70, confetti: 34, stars: 26, zap: 44, snow: 30, bubbles: 22, toxic: 34 };
  var fxAcc = 0;
  function trailFx(dt) {
    var tr = curTrail, b = ball;
    if (!tr.fx || !ballRoot.visible) return;
    fxAcc += dt * TRAIL_RATE[tr.fx];
    var cy = b.y + R, z = -b.d;
    while (fxAcc >= 1) {
      fxAcc -= 1;
      var c = tr.colors[randInt(0, tr.colors.length - 1)];
      var ox = (rand() - 0.5) * 0.7, oy = (rand() - 0.5) * 0.7;
      if (tr.fx === 'fire') emit(b.x + ox * 0.8, cy + oy * 0.6, z + 0.35, (rand() - 0.5) * 1.5, 1.5 + rand() * 2, 2 + rand() * 2, 0.45, 0.7 + rand() * 0.4, c, -1, 1);
      else if (tr.fx === 'sparkle') emit(b.x + ox, cy + oy, z + 0.4, 0, 0.3, 1, 0.55, 0.45 + rand() * 0.35, c, 0, 0);
      else if (tr.fx === 'confetti') emit(b.x + ox, cy + oy, z + 0.4, (rand() - 0.5) * 4, 2 + rand() * 3, 1, 0.9, 0.45, c, 9, 1);
      else if (tr.fx === 'stars') emit(b.x + ox, cy + oy, z + 0.5, (rand() - 0.5), 0.5, 1.5, 0.8, 0.75 + rand() * 0.4, c, 0, 0.5);
      else if (tr.fx === 'snow') emit(b.x + ox * 1.2, cy + 0.2 + oy * 0.5, z + 0.4, (rand() - 0.5) * 1.2, 1 + rand(), 1, 1.1, 0.4 + rand() * 0.25, c, 2.5, 1.5);
      else if (tr.fx === 'bubbles') emit(b.x + ox, cy + oy, z + 0.5, (rand() - 0.5) * 0.8, 0.5, 1, 1.0, 0.6 + rand() * 0.5, c, -2.5, 1);
      else if (tr.fx === 'toxic') emit(b.x + ox * 0.8, cy + oy * 0.5, z + 0.4, (rand() - 0.5) * 1.5, 1.5 + rand() * 2, 1.5, 0.7, 0.55 + rand() * 0.3, c, 14, 0.5);
      else if (tr.fx === 'zap') emit(b.x + ox * 1.4, cy + oy * 1.4, z + 0.3, (rand() - 0.5) * 7, (rand() - 0.5) * 7, 2, 0.18, 0.5, c, 0, 0);
    }
  }

  var _axis = new T.Vector3();
  function updateBallVisual(dt) {
    var b = ball;
    // squash & stretch spring
    b.sqV += (-b.sq * 220 - b.sqV * 14) * dt;
    b.sq += b.sqV * dt;
    b.sq = clamp(b.sq, -0.45, 0.45);
    var sy = 1 + b.sq, sxz = 1 - b.sq * 0.5;
    ballSquash.scale.set(sxz, sy, sxz);
    ballSquash.position.y = R * sy;
    ballRoot.position.set(b.x, b.y, -b.d);
    if (!b.dead) {
      var vx = b.vx, vz = b.vz, sp = Math.sqrt(vx * vx + vz * vz);
      if (sp > 0.01) {
        _axis.set(-vz, 0, -vx).normalize();
        _q.setFromAxisAngle(_axis, sp / R * dt);
        ballMesh.quaternion.premultiply(_q);
      }
    }
    if (curSkin.rainbow) {
      glowCol.setHSL((st.t * 0.3) % 1, 1, 0.6); glowHex = '#' + glowCol.getHexString(); underGlow.material.color.copy(glowCol);
    }
    // under glow on the surface below the ball
    var s = b.dead ? NaN : surfAt(b.x, b.d);
    if (s === s) {
      underGlow.visible = true;
      var hgt = Math.max(0, b.y - s);
      underGlow.position.set(b.x, s + 0.04, -b.d);
      underGlow.rotation.set(-Math.PI / 2, 0, Math.atan(SURF.bank), 'ZXY');
      var sc = 1 + hgt * 0.15; underGlow.scale.set(sc, sc, 1);
      underGlow.material.opacity = clamp(0.85 - hgt * 0.15, 0.25, 0.85);
    } else underGlow.visible = false;
    shieldMesh.visible = b.shield && !b.dead;
    if (shieldMesh.visible) { shieldMesh.rotation.y += dt * 1.5; shieldMesh.rotation.x += dt * 0.7; shieldMesh.position.y = R; shieldMesh.material.opacity = 0.6 + 0.3 * Math.sin(st.t * 8); }
    magnetRing.visible = b.magnet > 0 && !b.dead && (b.magnet > 2 || Math.sin(st.t * 20) > 0);
    if (magnetRing.visible) { magnetRing.position.y = R; magnetRing.rotation.set(Math.PI / 2 + Math.sin(st.t * 3) * 0.3, 0, st.t * 4); }
    updateTrail(dt);
  }
  var _tc = new T.Color(), trailBase = new T.Color(), FIRE_C = [new T.Color('#fff27a'), new T.Color('#ff9a1f'), new T.Color('#ff3b1f')];
  var trailAcc = 0;
  function updateTrail(dt) {
    var b = ball, head = trailPts[0];
    if (!b.dead) {
      head.x = b.x; head.y = b.y + 0.07; head.z = -b.d;
      trailAcc += dt;
      if (trailAcc >= 1 / 60) {
        trailAcc = 0;
        var last = trailPts.pop(); last.x = head.x; last.y = head.y; last.z = head.z; trailPts.splice(1, 0, last);
      }
      trailMat.opacity = 1;
    } else trailMat.opacity = Math.max(0, trailMat.opacity - dt * 1.5);
    var tr = curTrail;
    if (tr.colors) trailBase.set(tr.colors[0]);
    for (var k = 0; k < TN; k++) {
      var p = trailPts[k], f = 1 - k / (TN - 1), w = R * 0.62 * (0.15 + 0.85 * f);
      var jx = tr.fx === 'zap' ? (rand() - 0.5) * 0.35 * (1 - f) : 0;
      var o = k * 6;
      trailPos[o] = p.x - w + jx; trailPos[o + 1] = p.y; trailPos[o + 2] = p.z;
      trailPos[o + 3] = p.x + w + jx; trailPos[o + 4] = p.y; trailPos[o + 5] = p.z;
      if (tr.rainbow) _tc.setHSL(((k / TN) * 0.9 + st.t * 0.6) % 1, 1, 0.55);
      else if (tr.id === 'fire') _tc.copy(k < 4 ? FIRE_C[0] : k < 9 ? FIRE_C[1] : FIRE_C[2]);
      else if (tr.colors && tr.id !== 'confetti') _tc.copy(trailBase);
      else _tc.copy(glowCol);
      var a = f * f * f * 0.75;
      trailCol[o] = trailCol[o + 3] = _tc.r * a; trailCol[o + 1] = trailCol[o + 4] = _tc.g * a; trailCol[o + 2] = trailCol[o + 5] = _tc.b * a;
    }
    trailGeo.attributes.position.needsUpdate = true; trailGeo.attributes.color.needsUpdate = true;
  }

  /* ============================================================ CAMERA */
  var _cp = new T.Vector3(), _cl = new T.Vector3(), _v2 = new T.Vector2();
  var baseFovV = 60;
  function fovFor(v) {
    var aspect = camera.aspect, ref = 16 / 9;
    if (aspect >= ref) return v;
    var hf = 2 * Math.atan(Math.tan(v * Math.PI / 360) * ref);
    return 2 * Math.atan(Math.tan(hf / 2) / aspect) * 180 / Math.PI;
  }
  function updateCamera(dt) {
    var b = ball, sp = clamp((b.vz - 15) / 23, 0, 1);
    var k1 = 1 - Math.exp(-dt * 5.5), k2 = 1 - Math.exp(-dt * 4);
    cam.x += (b.x * (b.dead ? 0.95 : 0.72) - cam.x) * k1;
    var ty;
    if (b.dead && st.reason === 'fall') ty = cam.y;
    else if (b.grounded) ty = b.y;
    else ty = Math.max(b.groundY + (b.y - b.groundY) * 0.4, b.y - 2);
    cam.y += (ty - cam.y) * k2;
    var back = 6.2 + sp * 1.3, up = 2.55 + sp * 0.35, look = 11, lookUp = 0.95;
    if (st.mode === 'title') { back = 5.2 + Math.sin(st.t * 0.4) * 0.3; up = 1.6; lookUp = 0.15; }
    if (st.mode === 'dying' || st.mode === 'over') { var dd = Math.min(1, st.dieT); back += dd * 2.5; up += dd * 1.6; }
    var sx = (rand() - 0.5) * st.shake, sy = (rand() - 0.5) * st.shake;
    _cp.set(cam.x + sx, cam.y + up + sy, -(b.d - back)).applyMatrix4(course.matrixWorld);
    _cl.set(cam.x * 1.05 + b.vx * 0.05, cam.y + lookUp, -(b.d + look)).applyMatrix4(course.matrixWorld);
    camera.position.copy(_cp);
    camera.lookAt(_cl);
    cam.roll += ((b.dead ? 0 : clamp(-b.vx * 0.007, -0.08, 0.08)) - cam.roll) * Math.min(1, dt * 6);
    camera.rotateZ(cam.roll);
    var fov = fovFor(baseFovV + sp * 9 + st.fovKick);
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
    // background follows the camera
    sky.position.copy(camera.position); stars.position.copy(camera.position);
    sun.position.set(camera.position.x, camera.position.y + 66, camera.position.z - 720);
    sunGlow.position.set(camera.position.x, camera.position.y + 50, camera.position.z - 730);
    mountains.position.set(camera.position.x, camera.position.y + 26, camera.position.z - 680);
    mtnTex.offset.x = (b.x * 0.0004) % 1;
    voidFloor.position.set(Math.round(cam.x / 8) * 8, b.groundY - 34, -(Math.round(b.d / 8) * 8 + 150));
    var ps = renderer.getDrawingBufferSize(_v2).y / (2 * Math.tan(camera.fov * Math.PI / 360));
    P.mat.uniforms.uScale.value = ps * 0.5; GG.mat.uniforms.uScale.value = ps * 0.5;
    // speed lines
    var inten = st.mode === 'play' ? clamp((b.vz - 20) / 14, 0, 1) * 0.55 + (st.fovKick > 2 ? 0.25 : 0) : 0;
    slMat.opacity += (inten - slMat.opacity) * Math.min(1, dt * 4);
    speedLines.visible = slMat.opacity > 0.02;
    if (speedLines.visible) {
      var len = 1.5 + b.vz * 0.12;
      for (var i = 0; i < SL_N; i++) {
        var s = slState[i];
        s.z += b.vz * 2.2 * dt;
        if (s.z > -2) { s.z = -30 - rand() * 25; s.a = rand() * Math.PI * 2; s.k = 0.45 + rand() * 0.5; }
        var cx = Math.cos(s.a) * s.k, cy = Math.sin(s.a) * s.k * 0.6, o = i * 6;
        slPos[o] = cx * -s.z; slPos[o + 1] = cy * -s.z; slPos[o + 2] = s.z;
        slPos[o + 3] = cx * -(s.z - len); slPos[o + 4] = cy * -(s.z - len); slPos[o + 5] = s.z - len;
      }
      slGeo.attributes.position.needsUpdate = true;
    }
  }

  /* ================================================================ UI */
  var hud = $('hud'), hDistN = $('hDistN'), hGemsN = $('hGemsN'), hZoneFill = $('hZoneFill'), hZoneLbl = $('hZoneLbl'), hPower = $('hPower');
  var lastHud = { d: -1, g: -1, z: -1 };
  function updateHud() {
    var m = Math.max(0, Math.floor(ball.d - START_D));
    if (m !== lastHud.d) { hDistN.textContent = Kit.fmt(m); lastHud.d = m; }
    if (st.gemsRun !== lastHud.g) { hGemsN.textContent = st.gemsRun; lastHud.g = st.gemsRun; }
    if (st.zone !== lastHud.z) {
      lastHud.z = st.zone; var info = zoneInfo(st.zone);
      hZoneLbl.textContent = 'المنطقة ' + (st.zone + 1) + ' · ' + info.name;
      hud.style.setProperty('--zc', info.prism ? '#ff3fd0' : info.c);
    }
    var zp = ((ball.d - START_D) % ZONE_LEN) / ZONE_LEN;
    hZoneFill.style.width = (zp * 100).toFixed(1) + '%';
    var html = '';
    if (ball.shield) html += '<div class="pw" style="color:#3ff0ff">درع</div>';
    if (ball.magnet > 0) html += '<div class="pw" style="color:#c48bff">مغناطيس <div class="pbar"><i style="width:' + (ball.magnet * 10).toFixed(0) + '%"></i></div></div>';
    if (html !== hPower._last) { hPower.innerHTML = html; hPower._last = html; }
  }
  function bumpGems() { var e = $('hGems'); e.classList.remove('bump'); void e.offsetWidth; e.classList.add('bump'); }

  var popEls = [], popNext = 0, popLayer = $('popups');
  for (var pe = 0; pe < 8; pe++) { var el = document.createElement('div'); el.className = 'pop'; el.style.display = 'none'; popLayer.appendChild(el); popEls.push(el); }
  function popup(text, color, big, x, y, d) {
    _v.set(x, y, -d).applyMatrix4(course.matrixWorld).project(camera);
    var sx = (_v.x * 0.5 + 0.5) * window.innerWidth, sy = (-_v.y * 0.5 + 0.5) * window.innerHeight;
    sx = clamp(sx, 120, window.innerWidth - 120); sy = clamp(sy, 90, window.innerHeight - 60);
    var e = popEls[popNext]; popNext = (popNext + 1) % popEls.length;
    e.textContent = text; e.className = 'pop' + (big ? ' big' : ''); e.style.setProperty('--pc', color);
    e.style.left = sx + 'px'; e.style.top = sy + 'px'; e.style.display = 'block';
    e.style.animation = 'none'; void e.offsetWidth; e.style.animation = '';
  }
  function banner(top, name, color, small) {
    var b = $('banner');
    b.classList.toggle('small', !!small);
    $('bannerTop').textContent = top; $('bannerName').textContent = name;
    b.style.setProperty('--bc', color);
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  }
  var flashEl = $('flash');
  function flash(a) {
    flashEl.style.transition = 'none'; flashEl.style.opacity = a;
    void flashEl.offsetWidth;
    flashEl.style.transition = 'opacity 0.5s ease-out'; flashEl.style.opacity = 0;
  }

  // Buttons never take focus, so Space/Enter only ever go to the game.
  Array.prototype.forEach.call(document.querySelectorAll('button'), function (b) {
    b.addEventListener('mousedown', function (e) { e.preventDefault(); });
  });
  function onClick(id, fn) { $(id).addEventListener('click', function (e) { e.stopPropagation(); Kit.audio.unlock(); fn(); this.blur(); }); }

  var mute = Kit.muteButton();
  mute.setAttribute('aria-label', 'تشغيل الصوت أو كتمه'); mute.title = 'الصوت (M)';
  var pauseBtn = $('btnPause');

  function show(id, on) { $(id).hidden = !on; }
  function refreshTitle() {
    $('tBest').textContent = Kit.fmt(save.best);
    $('tGems').textContent = Kit.fmt(save.gems);
  }
  // Leaving a run from the pause menu still keeps what was earned.
  function bankRun() {
    if (st.demo || (st.mode !== 'paused' && st.mode !== 'play')) return;
    var dist = Math.max(0, Math.floor(ball.d - START_D));
    save.gems += st.gemsRun; st.gemsRun = 0;
    if (dist > save.best) save.best = dist;
    save.missions.forEach(function (mm) { if (mm.t === 'total' && !mm.done) mm.prog += dist; });
    distanceUnlocks(dist, false);
    save.runs++; persist();
  }
  function showTitle() {
    bankRun();
    st.mode = 'title';
    resetWorld(true);
    show('title', true); show('over', false); show('pause', false); hud.hidden = true; pauseBtn.hidden = true;
    refreshTitle();
    SND.setMusic(1); SND.rollSound(0, 0);
  }
  function startRun() {
    if (shopOpen) return;
    bankRun();
    resetWorld(false, dbg.startAt || 0);
    rollMissions(); persist();
    st.mode = 'play'; st.lastUnlockCheck = 0;
    show('title', false); show('over', false); show('pause', false); hud.hidden = false; pauseBtn.hidden = false;
    lastHud.d = lastHud.g = lastHud.z = -1;
    $('hBest').innerHTML = 'الأفضل: <span id="hBestN">' + Kit.fmt(save.best) + '</span> م'; $('hBest').classList.remove('beat');
    $('hBest').style.visibility = save.best > 0 ? 'visible' : 'hidden';
    st.hintT = save.runs < 4 ? 4.5 : 0;
    $('hHint').classList.toggle('show', st.hintT > 0);
    SND.sfx.start(); SND.setMusic(2);
    st.fovKick = 8;
  }
  function pauseGame() {
    if (st.mode !== 'play') return;
    st.mode = 'paused'; show('pause', true); SND.setMusic(0); SND.rollSound(0, 0);
    renderMissions($('pMissions'), true);
    $('btnMusic').textContent = musicLabel();
  }
  function resumeGame() {
    if (st.mode !== 'paused') return;
    st.mode = 'play'; show('pause', false); SND.setMusic(st.zone >= 2 ? 3 : 2);
  }
  function misValue(m) {
    var dist = Math.max(0, Math.floor(ball.d - START_D)), rs = st.rs || { gems: 0, air: 0, near: 0, power: 0 };
    switch (m.t) {
      case 'dist': return dist;
      case 'gems': return rs.gems;
      case 'air': return rs.air;
      case 'near': return rs.near;
      case 'zone': return st.zone + 1;
      case 'power': return rs.power;
      case 'total': return m.prog + dist;
    }
    return 0;
  }
  function checkMissions(live) {
    if (st.demo) return;
    for (var i = 0; i < save.missions.length; i++) {
      var m = save.missions[i];
      if (m.done || misValue(m) < m.n) continue;
      m.done = true; save.mDone++; save.gems += m.rew; st.misGems += m.rew;
      persist();
      if (live) {
        SND.sfx.unlock();
        banner('أنجزت مهمة! ' + ltr('+' + m.rew), misText(m), '#7dff3a', true);
      }
    }
  }
  // Arabic counted nouns: 1 -> "x واحدة", 2 -> dual, 3..10 -> plural, 11+ -> singular.
  function misText(m) {
    var d = misDef(m.t), n = m.n, num;
    if (!d.w) num = Kit.fmt(n);
    else if (n === 1) num = d.w[0];
    else if (n === 2) num = d.w[1];
    else num = Kit.fmt(n) + ' ' + (n % 100 >= 3 && n % 100 <= 10 ? d.w[2] : d.w[3]);
    return d.txt.replace('{n}', num);
  }
  function renderMissions(el, live) {
    var html = '';
    save.missions.forEach(function (m) {
      var v = Math.min(m.n, live ? misValue(m) : (m.t === 'total' ? m.prog : misValue(m)));
      if (m.done) v = m.n;
      html += '<div class="mrow' + (m.done ? ' done' : '') + '"><div class="mt">' + misText(m) + '</div><div class="mr"><i class="gemico"></i>' + m.rew + '</div>' +
        '<div class="mb"><i style="width:' + (v / m.n * 100).toFixed(1) + '%"></i></div></div>';
    });
    el.innerHTML = html;
  }
  function rollMissions() {
    var keep = [], ids = [];
    save.missions.forEach(function (m) { if (!m.done) { keep.push(m); ids.push(m.t); } });
    while (keep.length < 3) { var nm = newMission(ids); keep.push(nm); ids.push(nm.t); }
    save.missions = keep;
  }
  var OVER_LINES = {
    bonk: [['طاخ!', 'اصطدمت بمكعب أحمر'], ['بوووم!', 'المكعبات الحمراء ليست صديقتك'], ['آخ!', 'وجّه الكرة بعيدًا عن الأحمر']],
    lip: [['طاخ!', 'اصطدمت بحافة الحفرة'], ['آه!', 'قفزة قصيرة! ابقَ فوق البلاط']],
    fall: [['أوووه!', 'تدحرجت خارج الطريق'], ['إلى اللقاء!', 'طارت الكرة من الحافة'], ['يا للهول!', 'انتهى الطريق تحت الكرة']]
  };
  function gameOver() {
    st.mode = 'over'; st.overT = 0;
    var dist = Math.max(0, Math.floor(ball.d - START_D)), bonus = Math.floor(dist / 50);
    var prevBest = save.best, newBest = dist > prevBest;
    checkMissions(false);
    save.missions.forEach(function (mm) { if (mm.t === 'total' && !mm.done) mm.prog += dist; });
    save.gems += st.gemsRun + bonus;
    if (newBest) save.best = dist;
    save.runs++;
    distanceUnlocks(dist, false);
    persist();
    var line = pick(OVER_LINES[st.reason] || OVER_LINES.bonk);
    $('oTitle').textContent = line[0]; $('oSub').textContent = line[1];
    $('oGemRun').textContent = st.gemsRun; $('oGemBonus').textContent = bonus; $('oGemTot').textContent = Kit.fmt(save.gems);
    $('oGemMis').textContent = st.misGems; $('oMisRow').style.display = st.misGems ? '' : 'none';
    renderMissions($('oMissions'), false);
    rollMissions(); persist();
    var ob = $('oBest');
    ob.className = '';
    if (newBest && prevBest > 0) { ob.textContent = 'رقم قياسي جديد!'; ob.className = 'newbest'; }
    else if (newBest) { ob.textContent = 'أول رقم قياسي لك!'; ob.className = 'newbest'; }
    else if (prevBest > 0 && dist === prevBest) { ob.textContent = 'عادلت أفضل مسافة لك!'; ob.className = 'close'; }
    else if (prevBest > 0 && dist > 0 && prevBest - dist <= Math.max(25, prevBest * 0.12)) { ob.textContent = 'قريب جدًا! ينقصك ' + (prevBest - dist) + ' م فقط!'; ob.className = 'close'; }
    else if (prevBest > 0) ob.textContent = 'أفضل مسافة: ' + Kit.fmt(prevBest) + ' م';
    else ob.textContent = 'أنت تستطيع! حاول مرة أخرى!';
    showUnlockHint();
    show('over', true); hud.hidden = true; pauseBtn.hidden = true;
    countUp($('oDist'), dist);
    SND.sfx.over();
    if (newBest) {
      setTimeout(function () { if (st.mode === 'over') SND.sfx.best(); }, 450);
      burst(ball.x, ball.y + 2, -ball.d - 3, 90, 12, 1.6, 0.9, ['#ffd93b', '#ff3fd0', '#3ff0ff', '#7dff3a', '#ffffff'], 7, 5);
    }
    SND.setMusic(1);
  }
  function countUp(el, to) {
    var t0 = performance.now(), dur = Math.min(900, 300 + to * 2);
    function step() {
      var f = Math.min(1, (performance.now() - t0) / dur);
      el.textContent = Kit.fmt(to * (1 - Math.pow(1 - f, 3)));
      if (f < 1 && st.mode === 'over') requestAnimationFrame(step); else el.textContent = Kit.fmt(to);
    }
    step();
  }
  function nextUnlock() {
    var best = null;
    SK.balls.forEach(function (b) { if (b.price && save.owned.indexOf(b.id) < 0 && (!best || b.price < best.item.price)) best = { item: b, kind: 'ball' }; });
    SK.trails.forEach(function (t) { if (t.price && save.ownedTrails.indexOf(t.id) < 0 && (!best || t.price < best.item.price)) best = { item: t, kind: 'trail' }; });
    return best;
  }
  function showUnlockHint() {
    var nu = nextUnlock(), box = $('oUnlock'), cv = $('oUnlockCv');
    $('btnOShop').classList.remove('glow');
    if (!nu) {
      var dl = null;
      SK.balls.concat(SK.trails).forEach(function (it) { if (it.req && save.owned.indexOf(it.id) < 0 && save.ownedTrails.indexOf(it.id) < 0 && (!dl || it.req < dl.req)) dl = it; });
      if (!dl) { box.hidden = true; return; }
      box.hidden = false; box.classList.remove('ready');
      if (SK.balls.indexOf(dl) >= 0) SK.previewBall(cv, dl); else SK.previewTrail(cv, dl, curSkin);
      $('oUnlockTxt').innerHTML = 'تدحرج <b>' + Kit.fmt(dl.req) + ' م</b> لتفتح <b>' + dl.name + '</b>';
      $('oUnlockFill').style.width = Math.min(100, save.best / dl.req * 100) + '%';
      return;
    }
    box.hidden = false;
    if (nu.kind === 'ball') SK.previewBall(cv, nu.item); else SK.previewTrail(cv, nu.item, curSkin);
    var fill = $('oUnlockFill');
    fill.style.width = '0%';
    if (save.gems >= nu.item.price) {
      box.classList.add('ready');
      $('oUnlockTxt').innerHTML = 'تستطيع شراء <b>' + nu.item.name + '</b>! اذهب إلى المتجر!';
      $('btnOShop').classList.add('glow');
      setTimeout(function () { fill.style.width = '100%'; }, 50);
    } else {
      box.classList.remove('ready');
      $('oUnlockTxt').innerHTML = 'ينقصك <b><i class="gemico"></i>' + (nu.item.price - save.gems) + '</b> لتحصل على ' + (nu.kind === 'trail' ? 'ذيل ' : 'كرة ') + '<b>' + nu.item.name + '</b>';
      setTimeout(function () { fill.style.width = (save.gems / nu.item.price * 100).toFixed(1) + '%'; }, 50);
    }
  }
  function distanceUnlocks(m, live) {
    var got = [];
    SK.balls.forEach(function (b) { if (b.req && m >= b.req && save.owned.indexOf(b.id) < 0) { save.owned.push(b.id); got.push(['كرة جديدة!', b.name]); } });
    SK.trails.forEach(function (t) { if (t.req && m >= t.req && save.ownedTrails.indexOf(t.id) < 0) { save.ownedTrails.push(t.id); got.push(['ذيل جديد!', t.name]); } });
    if (got.length) {
      persist();
      if (live) {
        SND.sfx.unlock();
        banner(got[0][0], got[0][1], '#ffd93b');
      }
    }
  }

  /* ---------------------------------------------------------------- shop */
  var shopTab = 'balls', shopFrom = 'title';
  function openShop() {
    if (st.mode !== 'title' && st.mode !== 'over') return;
    shopOpen = true; shopFrom = st.mode;
    show('shop', true); show('title', false); show('over', false);
    renderShop();
    SND.sfx.click();
  }
  function closeShop() {
    shopOpen = false; show('shop', false);
    if (shopFrom === 'over' && st.mode === 'over') { show('over', true); showUnlockHint(); $('oGemTot').textContent = Kit.fmt(save.gems); }
    else { show('title', true); refreshTitle(); }
    SND.sfx.click();
  }
  function renderShop() {
    $('sGems').textContent = Kit.fmt(save.gems);
    $('tabBalls').classList.toggle('on', shopTab === 'balls');
    $('tabTrails').classList.toggle('on', shopTab === 'trails');
    var grid = $('sgrid'); grid.innerHTML = '';
    var list = shopTab === 'balls' ? SK.balls : SK.trails;
    var owned = shopTab === 'balls' ? save.owned : save.ownedTrails;
    var eqId = shopTab === 'balls' ? save.skin : save.trail;
    list.forEach(function (it) {
      var card = document.createElement('div'); card.className = 'card';
      var cv = document.createElement('canvas'); cv.width = cv.height = 112;
      if (shopTab === 'balls') SK.previewBall(cv, it); else SK.previewTrail(cv, it, curSkin);
      var nm = document.createElement('div'); nm.className = 'cn'; nm.textContent = it.name;
      var pr = document.createElement('div'); pr.className = 'cp';
      var has = owned.indexOf(it.id) >= 0;
      if (it.id === eqId) { card.classList.add('eq'); pr.textContent = 'مختارة ✓'; }
      else if (has) { card.classList.add('owned'); pr.textContent = 'اختر'; }
      else if (it.req) { card.classList.add('lock'); pr.textContent = '🔒 تدحرج ' + Kit.fmt(it.req) + ' م'; }
      else { pr.innerHTML = '<i class="gemico"></i>' + it.price; if (save.gems >= it.price) card.classList.add('afford'); }
      card.appendChild(cv); card.appendChild(nm); card.appendChild(pr);
      card.addEventListener('click', function () { buyOrEquip(it, card); });
      grid.appendChild(card);
    });
  }
  function buyOrEquip(it, card) {
    Kit.audio.unlock();
    var isBall = shopTab === 'balls', owned = isBall ? save.owned : save.ownedTrails;
    if (owned.indexOf(it.id) >= 0) {
      if (isBall) save.skin = it.id; else save.trail = it.id;
      SND.sfx.click();
    } else if (!it.req && save.gems >= it.price) {
      save.gems -= it.price; owned.push(it.id);
      if (isBall) save.skin = it.id; else save.trail = it.id;
      SND.sfx.buy();
      persist(); applySkin(); renderShop();
      var cards = $('sgrid').children, list = isBall ? SK.balls : SK.trails, ci = list.indexOf(it);
      if (cards[ci]) cards[ci].classList.add('bought');
      return;
    } else {
      SND.sfx.nope();
      card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
      return;
    }
    persist(); applySkin(); renderShop();
  }

  onClick('btnPlay', startRun);
  onClick('btnShop', openShop);
  onClick('btnResume', resumeGame);
  onClick('btnRestart', startRun);
  onClick('btnMenu', showTitle);
  onClick('btnMusic', function () {
    save.music = !save.music; SND.setMusicOn(save.music); persist();
    $('btnMusic').textContent = musicLabel();
  });
  onClick('btnAgain', startRun);
  onClick('btnOShop', openShop);
  onClick('btnOMenu', showTitle);
  onClick('btnShopBack', closeShop);
  onClick('tabBalls', function () { shopTab = 'balls'; renderShop(); SND.sfx.click(); });
  onClick('tabTrails', function () { shopTab = 'trails'; renderShop(); SND.sfx.click(); });
  onClick('btnPause', function () { if (st.mode === 'play') pauseGame(); else if (st.mode === 'paused') resumeGame(); });
  canvas.addEventListener('pointerdown', function () { try { canvas.focus({ preventScroll: true }); } catch (e) { /* ignore */ } });

  document.addEventListener('visibilitychange', function () { if (document.hidden && st.mode === 'play') pauseGame(); });
  window.addEventListener('blur', function () { if (st.mode === 'play') pauseGame(); });

  function resize() {
    var w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.fov = fovFor(baseFovV);
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  /* ============================================================== LOOP */
  var lastT = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    var dt = lastT ? (now - lastT) / 1000 : 1 / 60;
    lastT = now;
    if (dt > 0.1) dt = 0.1;
    if (document.hidden) return;
    handleInput();
    var steps = Math.max(1, Math.ceil(dt * 60 - 0.05)), h = dt / steps;
    for (var i = 0; i < steps; i++) update(h);
    course.updateMatrixWorld();
    updateCamera(dt);
    if (st.mode === 'play') updateHud();
    flushInstances();
    renderer.render(scene, camera);
    K.endFrame();
  }

  /* ============================================================= DEBUG */
  window.__game = {
    get state() {
      var ao = 0, ag = 0, k;
      for (k = 0; k < OBS_N; k++) if (obs[k].active) ao++;
      for (k = 0; k < GEM_N; k++) if (gems[k].active) ag++;
      return { mode: st.mode, dist: Math.floor(ball.d - START_D), speed: +ball.vz.toFixed(2), x: +ball.x.toFixed(2), y: +ball.y.toFixed(2),
        grounded: ball.grounded, dead: ball.dead, gemsRun: st.gemsRun, gems: save.gems, best: save.best, zone: st.zone + 1,
        shield: ball.shield, magnet: +ball.magnet.toFixed(1), rowHead: rowHead, queued: queue.length, obstacles: ao, gemsActive: ag,
        deaths: dbg.deaths, skin: save.skin, trail: save.trail, owned: save.owned.length + save.ownedTrails.length,
        drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, lastChunk: gen.last };
    },
    set auto(v) { dbg.auto = !!v; }, get auto() { return dbg.auto; },
    set god(v) { dbg.god = !!v; }, get god() { return dbg.god; },
    startAt: function (m) { dbg.startAt = m; },
    start: function () { if (shopOpen) closeShop(); startRun(); return st.mode; },
    set dir(v) { dbg.dir = v; },
    get log() { return dbg.log; },
    get missions() { return save.missions; },
    simulate: function (secs) {
      var n = Math.round(secs * 60);
      for (var i = 0; i < n && (st.mode === 'play' || st.mode === 'dying'); i++) { update(1 / 60); course.updateMatrixWorld(); updateCamera(1 / 60); }
      return this.state;
    },
    simUntil: function (what, secs) {
      var n = Math.round((secs || 30) * 60);
      for (var i = 0; i < n && st.mode === 'play'; i++) {
        update(1 / 60); course.updateMatrixWorld(); updateCamera(1 / 60);
        var r = getRow(Math.floor(ball.d / TL)), ch = r ? r.ch : '';
        if (what === 'air' && !ball.grounded && ball.air > 0.12 && ball.vy > 1) break;
        if (what === 'bank' && Math.abs(ball.bank) > 0.2) break;
        if (what !== 'air' && what !== 'bank' && ch === what && i > 30) break;
      }
      return this.state;
    },
    die: function (why) { if (st.mode === 'paused') resumeGame(); if (st.mode === 'play') die(why || 'bonk'); return st.mode; },
    pause: function () { pauseGame(); return st.mode; },
    addGems: function (n) { save.gems += n; persist(); refreshTitle(); },
    reset: function () { ['best', 'gems', 'owned', 'ownedTrails', 'skin', 'trail', 'runs', 'music', 'missions', 'mDone'].forEach(function (k) { store.remove(k); }); },
    _fx: function () {
      popup('قفزة خارقة! ' + ltr('+3'), '#ffe14d', true, ball.x - 3, ball.y + 1.5, ball.d + 6);
      popup(ltr('+5'), '#ff5fe0', true, ball.x + 3, ball.y + 1, ball.d + 8);
      popup('سلسلة 10!', '#ffd93b', false, ball.x + 4, ball.y + 3, ball.d + 14);
      popup('بفارق شعرة!', '#3ff0ff', false, ball.x - 4, ball.y + 3, ball.d + 14);
      callout(CALLOUTS.bank);
      banner('أنجزت مهمة! ' + ltr('+25'), misText(save.missions[0]), '#7dff3a', true);
    },
    shield: function () { ball.shield = true; },
    magnet: function () { ball.magnet = 10; },
    _hide: function (n) { var o = { trail: trail, under: underGlow, ball: ballRoot, parts: P.obj, glows: GG.obj }[n]; if (o) o.visible = false; },
    _dbg: function () { return { u: P.mat.uniforms.uScale.value, gs: Array.prototype.slice.call(GG.size, 0, 6), gp: Array.prototype.slice.call(GG.pos, 0, 6), gc: Array.prototype.slice.call(GG.col, 0, 6), vis: GG.obj.visible, parent: !!GG.obj.parent }; }
  };

  // Canvas signs (best gate, distance markers) need the Arabic face of Fredoka loaded.
  try {
    if (document.fonts && document.fonts.load) {
      document.fonts.load('700 60px Fredoka', 'بم').then(function () { if (st.bestD) drawBestSign(save.best); }, function () {});
    }
  } catch (e) { /* ignore */ }
  showTitle();
  requestAnimationFrame(frame);
})();
