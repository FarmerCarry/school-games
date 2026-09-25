/*
 * Rail Rush — game.js
 * 3-lane endless runner. World is laid out along a distance axis "d";
 * the runner always renders at z = 0 and everything else is drawn at
 * z = runnerD - d, so numbers never grow large on the GPU.
 */
(function () {
  'use strict';
  var BOOT_T0 = performance.now();
  var T = window.THREE, RR = window.RR, sfx = RR.sfx, music = RR.music;
  var LW = RR.LANE_W, TOP = RR.TRAIN_TOP, CAR = RR.CAR_LEN, CGAP = RR.CAR_GAP, RAMP = RR.RAMP_LEN;
  var $ = function (id) { return document.getElementById(id); };
  var clamp = Kit.clamp, lerp = Kit.lerp, rand = Kit.rand, randInt = Kit.randInt;
  function chance(p) { return Math.random() < p; }
  function smooth01(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }

  /* ================================================================ tuning */
  var GRAV = 46, JUMP_H = 2.35, SUPER_H = 5.4, ROLL_T = 0.62;
  var H_STAND = 1.45, H_ROLL = 0.7, PW = 0.3, PD = 0.3;
  var V0 = 13.5, VMAX = 31, VK = 2600;
  var ACT = 100; // activation distance for oncoming trains
  function speedAt(dist) { return V0 + (VMAX - V0) * (1 - Math.exp(-Math.max(0, dist) / VK)); }
  function trainSpeedAt(dist) { return 9 + Math.min(6, dist / 500); }
  function trainLen(n) { return n * CAR + (n - 1) * CGAP; }
  var POWER_BASE = { magnet: 10, sneakers: 10, doubler: 10, board: 14 };
  var POWER_STEP = { magnet: 3, sneakers: 3, doubler: 3, board: 4 };
  var UP_COST = [200, 500, 1000, 2000, 3500];
  function powerDur(k) { return POWER_BASE[k] + POWER_STEP[k] * (save.up[k] || 0); }

  /* ================================================================= save */
  var store = Kit.store('rail-rush');
  function defaults() {
    return {
      best: 0, bestDist: 0, coins: 0, outfit: 'rookie', owned: ['rookie'], board: 'classic', boards: ['classic'],
      up: { magnet: 0, sneakers: 0, doubler: 0, board: 0 }, mlevel: 0, missions: null,
      totals: { coins: 0, boards: 0, runs: 0 }, runs: 0, tut: {}
    };
  }
  var save = (function () {
    var d = defaults(), s = store.get('save', null);
    if (s && typeof s === 'object') {
      Object.keys(d).forEach(function (k) { if (s[k] !== undefined && s[k] !== null) d[k] = s[k]; });
    }
    if (!Array.isArray(d.owned)) d.owned = ['rookie'];
    if (!Array.isArray(d.boards)) d.boards = ['classic'];
    if (typeof d.up !== 'object') d.up = defaults().up;
    ['magnet', 'sneakers', 'doubler', 'board'].forEach(function (k) { d.up[k] = clamp(d.up[k] | 0, 0, 5); });
    if (typeof d.totals !== 'object') d.totals = defaults().totals;
    if (typeof d.tut !== 'object') d.tut = {};
    d.coins = Math.max(0, d.coins | 0); d.best = Math.max(0, d.best | 0); d.mlevel = clamp(d.mlevel | 0, 0, 29);
    return d;
  })();
  function persist() { store.set('save', save); }
  function outfitById(id) { for (var i = 0; i < RR.OUTFITS.length; i++) if (RR.OUTFITS[i].id === id) return RR.OUTFITS[i]; return RR.OUTFITS[0]; }
  function boardById(id) { for (var i = 0; i < RR.BOARDS.length; i++) if (RR.BOARDS[i].id === id) return RR.BOARDS[i]; return RR.BOARDS[0]; }
  function multBase() { return 1 + save.mlevel; }

  /* ============================================================= missions */
  var MT = {
    coins: { txt: 'Collect {n} coins in one run', stat: 'coins', tiers: [40, 80, 130, 200, 280, 380, 500, 650] },
    jumps: { txt: 'Jump {n} times in one run', stat: 'jumps', tiers: [8, 15, 25, 35, 50, 70, 90] },
    rolls: { txt: 'Roll {n} times in one run', stat: 'rolls', tiers: [5, 10, 16, 24, 35, 50] },
    dist: { txt: 'Run {n} m in one run', stat: 'dist', tiers: [300, 500, 800, 1200, 1700, 2400, 3200, 4200] },
    score: { txt: 'Score {n} points in one run', stat: 'score', tiers: [300, 500, 800, 1100, 1500, 2000, 2600, 3300], byMult: true },
    roof: { txt: 'Run {n} m on train roofs in one run', stat: 'roof', tiers: [30, 80, 150, 250, 380, 550] },
    powers: { txt: 'Grab {n} power-ups in one run', stat: 'powers', tiers: [1, 2, 3, 5, 7, 9] },
    dodge: { txt: 'Dodge {n} speeding trains in one run', stat: 'dodge', tiers: [2, 4, 7, 10, 15, 20] },
    hops: { txt: 'Jump over {n} barriers in one run', stat: 'hops', tiers: [3, 6, 10, 15, 22, 30] },
    unders: { txt: 'Roll under {n} barriers in one run', stat: 'unders', tiers: [2, 4, 7, 11, 16, 22] },
    lanes: { txt: 'Switch lanes {n} times in one run', stat: 'lanes', tiers: [20, 40, 70, 100, 150, 200] },
    total: { txt: 'Collect {n} coins in total', stat: 'coins', cum: true, tiers: [250, 500, 900, 1400, 2000, 3000, 4500] },
    boards: { txt: 'Ride {n} hoverboards in total', stat: 'boards', cum: true, tiers: [1, 2, 4, 6, 9, 12] },
    magnet: { txt: 'Collect {n} coins with a magnet in one run', stat: 'magCoins', tiers: [15, 40, 80, 130, 190] },
    runs: { txt: 'Play {n} runs', stat: 'runs', cum: true, tiers: [2, 3, 4, 5, 6] }
  };
  function makeMissions(level) {
    if (level === 0) return [mk('coins', 0), mk('jumps', 0), mk('dist', 0)];
    if (level === 1) return [mk('rolls', 0), mk('hops', 0), mk('powers', 0)];
    var r = RR.mulberry(level * 977 + 31), keys = Object.keys(MT), out = [], used = {};
    while (out.length < 3) {
      var k = keys[Math.floor(r() * keys.length)];
      if (used[k]) continue;
      if ((k === 'score' && used.dist) || (k === 'dist' && used.score)) continue;
      if ((k === 'total' && used.coins) || (k === 'coins' && used.total)) continue;
      used[k] = 1;
      var tiers = MT[k].tiers;
      out.push(mk(k, Math.min(tiers.length - 1, Math.floor(level * 0.45 + r() * 1.6))));
    }
    return out;
    function mk(k, tier) {
      var n = MT[k].tiers[tier];
      if (MT[k].byMult) n = n * (1 + level);
      return { k: k, n: n, p: 0, done: false };
    }
  }
  function newMissionSet(level) {
    var set = makeMissions(level);
    set.forEach(function (m) { if (MT[m.k].cum) m.base = save.totals[MT[m.k].stat] || 0; });
    return set;
  }
  if (!Array.isArray(save.missions) || save.missions.length !== 3 || !save.missions.every(function (m) { return m && MT[m.k]; })) {
    save.missions = newMissionSet(save.mlevel);
  }
  function missionText(m) {
    var t = MT[m.k].txt.replace('{n}', Kit.fmt(m.n));
    return m.n === 1 ? t.replace(/\b1 (\S+?)s\b/, '1 $1') : t;
  }

  /* ============================================================ renderer */
  var canvas = $('gl');
  var LQ = /[?&]lq\b/.test(location.search); // low-quality mode for automated tests
  var renderer;
  try {
    renderer = new T.WebGLRenderer({ canvas: canvas, antialias: !LQ, alpha: true, powerPreference: 'high-performance' });
  } catch (e) {
    $('nogl').hidden = false;
    return;
  }
  var PR = LQ ? 0.5 : Math.min(window.devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(PR);
  var scene = new T.Scene();
  var camera = new T.PerspectiveCamera(60, 16 / 9, 0.1, 900);
  scene.fog = new T.Fog(0xd6ecff, 70, 200);

  var matWorld = new T.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  var matWin = new T.MeshBasicMaterial({ vertexColors: true, color: 0x8fb5e0 });
  var hemi = new T.HemisphereLight(0xe6f4ff, 0xc2a27c, 2.1);
  var sun = new T.DirectionalLight(0xfff3dc, 2.3);
  sun.position.set(-0.45, 1, 0.6);
  scene.add(hemi, sun);

  // sky dome
  var skyU = {
    top: { value: new T.Color() }, mid: { value: new T.Color() }, hor: { value: new T.Color() },
    sunCol: { value: new T.Color() }, sunDir: { value: new T.Vector3(0.35, 0.28, -1).normalize() }
  };
  var sky = new T.Mesh(new T.SphereGeometry(600, 32, 16), new T.ShaderMaterial({
    uniforms: skyU, side: T.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: [
      'uniform vec3 top, mid, hor, sunCol, sunDir; varying vec3 vDir;',
      'void main(){ vec3 d = normalize(vDir); float h = d.y;',
      ' vec3 c = mix(hor, mid, smoothstep(-0.02, 0.2, h)); c = mix(c, top, smoothstep(0.18, 0.75, h));',
      ' float s = max(dot(d, sunDir), 0.0);',
      ' c += sunCol * (smoothstep(0.9975, 0.9985, s) * 1.2 + pow(s, 24.0) * 0.35 + pow(s, 4.0) * 0.08);',
      ' gl_FragColor = vec4(c, 1.0);',
      ' #include <colorspace_fragment>',
      '}'
    ].join('\n')
  }));
  sky.renderOrder = -10;
  var skyGroup = new T.Group();
  skyGroup.add(sky);
  var cloudMat = new T.MeshBasicMaterial({ vertexColors: true, fog: false });
  var clouds = new T.Mesh(RR.buildClouds(), cloudMat);
  skyGroup.add(clouds);
  var skylineMat = new T.MeshBasicMaterial({ vertexColors: true, fog: false, color: 0xb9c6ea });
  var skyline = new T.Mesh(RR.buildSkyline(), skylineMat);
  skyGroup.add(skyline);
  scene.add(skyGroup);

  /* ------------------------------------------------------ time of day */
  function pal(o) { var r = {}; Object.keys(o).forEach(function (k) { r[k] = typeof o[k] === 'string' ? new T.Color(o[k]) : o[k]; }); return r; }
  var TOD = [
    pal({ top: '#2f8fff', mid: '#86cbff', hor: '#fff1d0', fog: '#d8ecff', hs: '#e6f4ff', hg: '#c2a27c', hi: 2.1, sc: '#fff3dc', si: 2.3, sunCol: '#fff6d8', win: '#9dbde3', cloud: '#ffffff', skyline: '#bcc8ec', sy: 0.28 }),
    pal({ top: '#4a4fd8', mid: '#ff94a8', hor: '#ffc27a', fog: '#ffc6a6', hs: '#ffd9c7', hg: '#a8826a', hi: 1.95, sc: '#ffb070', si: 2.3, sunCol: '#ffb46b', win: '#ffd28a', cloud: '#ffd3df', skyline: '#e3a2b8', sy: 0.07 }),
    pal({ top: '#16205e', mid: '#3d3290', hor: '#9160c9', fog: '#584a9c', hs: '#9fb0ff', hg: '#4a4068', hi: 1.75, sc: '#c2cbff', si: 1.35, sunCol: '#e8ecff', win: '#ffe07a', cloud: '#948ed1', skyline: '#6454a8', sy: 0.35 }),
    pal({ top: '#5aa7ff', mid: '#ffc0dd', hor: '#fff0b3', fog: '#f7e0ec', hs: '#fff0f5', hg: '#b89a86', hi: 2.0, sc: '#ffe0c0', si: 2.1, sunCol: '#ffe2b0', win: '#bcd2ee', cloud: '#fff2f7', skyline: '#d5c2e0', sy: 0.1 })
  ];
  var TOD_LEN = 1250;
  var todCur = pal({ top: '#000', mid: '#000', hor: '#000', fog: '#000', hs: '#000', hg: '#000', hi: 0, sc: '#000', si: 0, sunCol: '#000', win: '#000', cloud: '#000', skyline: '#000', sy: 0 });
  var tunnelDim = 0;
  function applyTOD(dist) {
    var i = Math.floor(dist / TOD_LEN), f = (dist - i * TOD_LEN) / TOD_LEN;
    var a = TOD[i % 4], b = TOD[(i + 1) % 4], t = smooth01(0.8, 1, f);
    Object.keys(todCur).forEach(function (k) {
      if (typeof a[k] === 'number') todCur[k] = lerp(a[k], b[k], t);
      else todCur[k].copy(a[k]).lerp(b[k], t);
    });
    skyU.top.value.copy(todCur.top); skyU.mid.value.copy(todCur.mid); skyU.hor.value.copy(todCur.hor); skyU.sunCol.value.copy(todCur.sunCol);
    skyU.sunDir.value.set(0.35, todCur.sy, -1).normalize();
    scene.fog.color.copy(todCur.fog);
    var dim = 1 - tunnelDim * 0.42;
    hemi.color.copy(todCur.hs); hemi.groundColor.copy(todCur.hg); hemi.intensity = todCur.hi * dim;
    sun.color.copy(todCur.sc); sun.intensity = todCur.si * dim;
    matWin.color.copy(todCur.win);
    cloudMat.color.copy(todCur.cloud);
    skylineMat.color.copy(todCur.skyline);
  }

  /* ---------------------------------------------------------- chunks */
  var CH = RR.CHUNK, NCH = 8, ZONE_LEN = 1000;
  var chunkGeos = [];
  // zone 0 is built now; the other zones are built in idle ticks after the first frame
  var idleJobs = [];
  for (var zn = 0; zn < RR.ZONES.length; zn++) {
    chunkGeos.push([]);
    for (var cv = 0; cv < 5; cv++) {
      if (zn === 0) chunkGeos[zn].push(RR.buildChunk(cv + 1, zn));
      else idleJobs.push((function (z, v) { return function () { chunkGeos[z].push(RR.buildChunk(v + 1, z)); }; })(zn, cv));
    }
  }
  function runIdleJobs() {
    var t0 = performance.now();
    while (idleJobs.length && performance.now() - t0 < 12) idleJobs.shift()();
    if (idleJobs.length) setTimeout(runIdleJobs, 16);
  }
  function zoneAt(d) { return d < 0 ? 0 : Math.floor(d / ZONE_LEN) % RR.ZONES.length; }
  function chunkGeo(d0) {
    var list = chunkGeos[zoneAt(d0 + CH / 2)];
    if (list.length < 5) { while (idleJobs.length && list.length < 5) idleJobs.shift()(); }
    return list[randInt(0, list.length - 1)];
  }
  var chunks = [];
  for (var ci = 0; ci < NCH; ci++) {
    var g0 = chunkGeos[0][ci % 5];
    var cm = new T.Mesh(g0.main, matWorld), cw = new T.Mesh(g0.win, matWin);
    scene.add(cm, cw);
    chunks.push({ m: cm, w: cw, d0: 0 });
  }
  function resetChunks() {
    for (var i = 0; i < NCH; i++) {
      var c = chunks[i];
      c.d0 = (i - 2) * CH;
      var g = chunkGeo(c.d0);
      c.m.geometry = g.main; c.w.geometry = g.win;
    }
  }
  function updateChunks() {
    for (var i = 0; i < NCH; i++) {
      var c = chunks[i];
      if (c.d0 + CH < S.pD - 60) {
        c.d0 += NCH * CH;
        var g = chunkGeo(c.d0);
        c.m.geometry = g.main; c.w.geometry = g.win;
      }
    }
  }

  /* ----------------------------------------------------- tunnels */
  var tunnelGeo = RR.buildTunnel();
  var tunnelPool = [];
  for (var tp = 0; tp < 2; tp++) {
    var tm = new T.Mesh(tunnelGeo.main, matWorld), tw = new T.Mesh(tunnelGeo.win, matWin);
    tm.visible = tw.visible = false;
    scene.add(tm, tw);
    tunnelPool.push({ m: tm, w: tw, d0: 0, on: false });
  }
  var TUNNEL_LEN = 60;
  function addTunnel(d) {
    for (var i = 0; i < tunnelPool.length; i++) {
      var t = tunnelPool[i];
      if (!t.on) { t.on = true; t.d0 = d; t.m.visible = t.w.visible = true; return; }
    }
  }
  function inTunnel(d) {
    for (var i = 0; i < tunnelPool.length; i++) {
      var t = tunnelPool[i];
      if (t.on && d > t.d0 - 1 && d < t.d0 + TUNNEL_LEN + 1) return true;
    }
    return false;
  }

  /* ------------------------------------------------ obstacle meshes */
  var carGeos = {};
  function carGeo(style, kind, moving) {
    var key = style + ':' + kind + ':' + (moving ? 1 : 0);
    if (!carGeos[key]) carGeos[key] = RR.buildCar(style, kind, moving);
    return carGeos[key];
  }
  for (var st = 0; st < RR.TRAIN_STYLES; st++) {
    (function (k) {
      ['cab', 'mid', 'cargo'].forEach(function (kind) { idleJobs.unshift(function () { carGeo(k, kind, false); }); });
      idleJobs.push(function () { carGeo(k, 'cab', true); }, function () { carGeo(k, 'mid', true); });
    })(st);
  }
  var rampGeo = RR.buildRamp(), lowGeo = RR.buildBarrier('low'), highGeo = RR.buildBarrier('high');
  var meshPool = [];
  function getMesh(geo) {
    var m = meshPool.pop();
    if (!m) { m = new T.Mesh(geo, matWorld); scene.add(m); }
    m.geometry = geo;
    m.visible = true;
    return m;
  }
  function freeMesh(m) { m.visible = false; meshPool.push(m); }

  var glowTex = new T.CanvasTexture(RR.glowCanvas('rgba(255,250,220,1)', 'rgba(255,230,150,0.45)'));
  glowTex.colorSpace = T.SRGBColorSpace;
  var glowPool = [];
  function getGlow() {
    var s = glowPool.pop();
    if (!s) {
      s = new T.Sprite(new T.SpriteMaterial({ map: glowTex, blending: T.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
      scene.add(s);
    }
    s.visible = true;
    return s;
  }

  /* ============================================================ state */
  var S = {
    mode: 'title', menu: 'title', t: 0, pD: 0, prevPD: 0, speed: 0, score: 0, runStart: 0, introT: 0, crashT: 0,
    slow: 1, groundY: 0, shake: 0, bestAnnounced: false, reason: 'bonk', god: false, auto: false, hintsShown: {}
  };
  var P = {};
  var POW = { magnet: 0, sneakers: 0, doubler: 0, board: 0 };
  var run = {};
  var obstacles = [], coins = [], pickups = [], hints = [];
  var actions = [], delayed = [];
  var gen = { d: 0, nextPower: 0, nextTunnel: 0, last: '', count: 0 };

  function resetPlayer() {
    P = {
      x: 0, px: 0, y: 0, py: 0, vy: 0, vx: 0, lane: 0, grounded: true, roll: 0, rollOnLand: false, jumpBuf: 0, coyote: 0,
      h: H_STAND, stumbleT: 0, stumbleAnim: 0, invuln: 0, sq: 0, sqv: 0, phase: 0, pd: 0, camY: 0, face: Math.PI, flip: 0, crashRot: 0
    };
  }
  function resetRun() {
    run = { coins: 0, jumps: 0, rolls: 0, dist: 0, score: 0, roof: 0, powers: 0, dodge: 0, hops: 0, unders: 0, lanes: 0, magCoins: 0, boards: 0, bonus: 0, runs: 0 };
    POW.magnet = POW.sneakers = POW.doubler = POW.board = 0;
  }

  /* ----------------------------------------------------- obstacles */
  function newOb(kind, lane, d0, len, y0, top, hw, support) {
    var ob = { pat: gen.cur, kind: kind, lane: lane, x: lane * LW, d0: d0, pd0: d0, len: len, y0: y0, top: top, hw: hw, support: support, moving: false, v: 0, active: true, meet: 0, meshes: [], glow: null, passed: false, horn: false };
    obstacles.push(ob);
    return ob;
  }
  function freeOb(ob) {
    for (var i = 0; i < ob.meshes.length; i++) freeMesh(ob.meshes[i].m);
    ob.meshes.length = 0;
    if (ob.glow) { ob.glow.visible = false; glowPool.push(ob.glow); ob.glow = null; }
  }
  function addTrain(lane, d, cars, o) {
    o = o || {};
    var start = d;
    if (o.ramp) {
      var r = newOb('ramp', lane, d, RAMP, 0, TOP, 1.05, true);
      r.meshes.push({ m: getMesh(rampGeo), off: RAMP / 2 });
      start = d + RAMP;
    }
    var len = trainLen(cars);
    var ob = newOb('train', lane, start, len, 0, TOP, 1.05, true);
    var style = o.style != null ? o.style : randInt(0, RR.TRAIN_STYLES - 1);
    var cargo = !o.moving && !o.ramp && chance(0.3);
    for (var i = 0; i < cars; i++) {
      var kind = cargo ? 'cargo' : (i === 0 ? 'cab' : 'mid');
      ob.meshes.push({ m: getMesh(carGeo(style, kind, !!o.moving)), off: i * (CAR + CGAP) + CAR / 2 });
    }
    if (o.moving) {
      ob.moving = true; ob.active = false; ob.meet = d; ob.vt = o.vt || 10;
      for (var k = 0; k < ob.meshes.length; k++) ob.meshes[k].m.visible = false;
      ob.glow = getGlow(); ob.glow.visible = false;
    }
    return start + len;
  }
  function addBarrier(lane, d, kind) {
    var ob = kind === 'low' ? newOb('low', lane, d - 0.15, 0.3, 0, 1.0, 1.0, false) : newOb('high', lane, d - 0.15, 0.3, 1.2, 2.95, 1.1, false);
    ob.meshes.push({ m: getMesh(kind === 'low' ? lowGeo : highGeo), off: 0.15 });
    return d;
  }

  /* --------------------------------------------------------- coins */
  var MAX_COINS = 320;
  var coinGeo = (function () {
    var b = new RR.Builder();
    var c18 = new T.CylinderGeometry(0.5, 0.5, 1, 18).toNonIndexed();
    c18.computeBoundingBox();
    b.add(c18, '#f0a500', 0, 0, 0, 0.9, 0.12, 0.9, Math.PI / 2, 0, 0);
    b.add(c18, '#ffd84d', 0, 0, 0, 0.62, 0.17, 0.62, Math.PI / 2, 0, 0);
    b.add(RR.GEO.box, '#fff6c9', 0, 0, 0, 0.09, 0.34, 0.2);
    return b.geometry();
  })();
  var coinMat = new T.MeshLambertMaterial({ vertexColors: true, emissive: 0x7a4f00, emissiveIntensity: 0.6 });
  var coinMesh = new T.InstancedMesh(coinGeo, coinMat, MAX_COINS);
  coinMesh.frustumCulled = false;
  coinMesh.count = 0;
  coinMesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
  scene.add(coinMesh);
  var coinFree = [];
  function addCoin(lane, d, y) {
    if (coins.length >= MAX_COINS) return;
    var c = coinFree.pop() || {};
    c.x = lane * LW; c.y = y == null ? 0.9 : y; c.d = d; c.mag = false; c.mt = 0; c.ph = d * 0.35;
    coins.push(c);
  }
  function addCoins(lane, d, n, step, y) {
    for (var i = 0; i < n; i++) addCoin(lane, d + i * step, y);
    return d + (n - 1) * step;
  }
  function addArc(lane, dc, v, n) {
    var v0 = Math.sqrt(2 * GRAV * JUMP_H), ta = 2 * v0 / GRAV;
    n = n || 7;
    for (var i = 0; i < n; i++) {
      var t = ta * (i + 0.5) / n;
      addCoin(lane, dc - v * ta * 0.45 + v * t, v0 * t - GRAV * t * t / 2 + 0.75);
    }
  }
  function addRampCoins(lane, d) {
    for (var i = 0; i < 3; i++) addCoin(lane, d + 1.5 + i * 2.6, TOP * (1.5 + i * 2.6) / RAMP + 0.9);
  }

  /* ------------------------------------------------------- pickups */
  var PICK_TYPES = ['magnet', 'sneakers', 'doubler', 'board', 'mystery'];
  var PICK_W = [3, 2.2, 2, 1.6, 0.8];
  var pickMats = {};
  function makePickMats() {
    PICK_TYPES.forEach(function (tp) {
      var tex = new T.CanvasTexture(RR.canvasTex(128, function (g, s) { RR.drawIcon(g, tp, s, true); }));
      tex.colorSpace = T.SRGBColorSpace;
      if (pickMats[tp]) { pickMats[tp].map.dispose(); pickMats[tp].map = tex; pickMats[tp].needsUpdate = true; }
      else pickMats[tp] = new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
    });
  }
  makePickMats();
  var spritePool = [];
  function addPickup(lane, d, type) {
    var s = spritePool.pop();
    if (!s) { s = new T.Sprite(pickMats[type]); scene.add(s); }
    s.material = pickMats[type];
    s.visible = true;
    pickups.push({ type: type, x: lane * LW, y: 1.2, d: d, s: s, t: Math.random() * 6 });
  }
  function pickType() {
    var tot = 0, i;
    for (i = 0; i < PICK_W.length; i++) tot += PICK_W[i];
    var r = Math.random() * tot;
    for (i = 0; i < PICK_W.length; i++) { r -= PICK_W[i]; if (r <= 0) return PICK_TYPES[i]; }
    return 'magnet';
  }

  /* ============================================================ patterns */
  function adj(l) { return l === 0 ? (chance(0.5) ? -1 : 1) : 0; }
  function hint(type, d) { hints.push({ type: type, d: d }); }
  var PAT = {
    coins: function (d, L) {
      var a = L[0], b = adj(a);
      addCoins(a, d, 6, 3);
      addCoins(b, d + 21, 6, 3);
      return d + 36;
    },
    train1: function (d, L) {
      var n = randInt(1, 3), e = addTrain(L[0], d, n);
      addCoins(L[1], d + 1, Math.floor(trainLen(n) / 3.2), 3.2);
      hint('lane', d);
      return e;
    },
    train2: function (d, L) {
      var e1 = addTrain(L[0], d, randInt(1, 3)), e2 = addTrain(L[1], d + rand(0, 8), randInt(1, 3));
      var e = Math.max(e1, e2);
      addCoins(L[2], d, Math.floor((e - d) / 3.4), 3.4);
      hint('lane', d);
      return e;
    },
    hurdle: function (d, L, v) {
      addBarrier(L[0], d + 2, 'low');
      addArc(L[0], d + 2, v);
      if (chance(0.5)) { addBarrier(L[1], d + 2, 'low'); addArc(L[1], d + 2, v, 5); }
      else addCoins(L[1], d - 6, 5, 3);
      hint('jump', d + 2);
      return d + 6;
    },
    duck: function (d, L) {
      addBarrier(L[0], d + 2, 'high');
      addCoins(L[0], d - 6, 6, 2.2, 0.55);
      if (chance(0.45)) addBarrier(L[1], d + 2, 'high');
      hint('roll', d + 2);
      return d + 6;
    },
    lowWall: function (d, L, v) {
      addBarrier(-1, d + 2, 'low'); addBarrier(0, d + 2, 'low'); addBarrier(1, d + 2, 'low');
      addArc(L[0], d + 2, v);
      hint('jump', d + 2);
      return d + 6;
    },
    highWall: function (d, L) {
      addBarrier(-1, d + 2, 'high'); addBarrier(0, d + 2, 'high'); addBarrier(1, d + 2, 'high');
      addCoins(L[0], d - 5, 5, 2.2, 0.55);
      hint('roll', d + 2);
      return d + 6;
    },
    ramp: function (d, L) {
      var e = addTrain(L[0], d, 3, { ramp: true });
      addRampCoins(L[0], d);
      addCoins(L[0], d + RAMP + 2, 9, 3.2, TOP + 0.9);
      var e2 = addTrain(L[1], d + rand(3, 9), randInt(2, 3));
      if (chance(0.5)) {
        var k = chance(0.5) ? 'low' : 'high';
        addBarrier(L[2], d + 14, k);
        addCoins(L[2], d + 20, 5, 3);
      } else addCoins(L[2], d + 2, 8, 3);
      hint('ramp', d);
      return Math.max(e, e2);
    },
    mixrow: function (d, L, v) {
      addBarrier(L[0], d + 2, 'low'); addArc(L[0], d + 2, v, 5);
      addBarrier(L[1], d + 2, 'high'); addCoins(L[1], d - 3, 3, 2, 0.55);
      var e = addTrain(L[2], d - 4, 1);
      return Math.max(d + 6, e);
    },
    oncoming: function (d, L, v, tier) {
      var n = randInt(1, tier >= 2 ? 3 : 2), vt = trainSpeedAt(d);
      var meet = d + 6;
      addTrain(L[0], meet, n, { moving: true, vt: vt });
      var reserve = ACT * vt / v + trainLen(n) + 6;
      var e2 = addTrain(L[1], d + rand(0, 10), randInt(1, 3));
      addCoins(L[2], d, 9, 3.4);
      var after = meet + trainLen(n) + v * 0.9;
      if (tier >= 2 && chance(0.5)) {
        addTrain(L[1], Math.max(after, e2 + 6), 1);
        addTrain(L[2], Math.max(after, e2 + 6), 1);
        addCoins(L[0], Math.max(after, e2 + 6) - 4, 5, 3);
      } else {
        addCoins(L[0], meet + trainLen(n) + 12, 8, 3);
      }
      hint('oncoming', meet);
      return Math.max(meet + reserve, e2);
    },
    roofrun: function (d, L) {
      var a = L[0], b = adj(a), c = -a - b;
      if (c < -1 || c > 1) c = 0;
      addTrain(a, d, 4, { ramp: true });
      addRampCoins(a, d);
      addTrain(b, d + 14, 3);
      addTrain(b, d + 14 + trainLen(3) + CGAP, 2);
      addTrain(c, d + 14, 3);
      addCoins(a, d + RAMP + 2, 7, 3.2, TOP + 0.9);
      addCoins(b, d + 36, 9, 3.2, TOP + 0.9);
      hint('ramp', d);
      return d + 14 + trainLen(3) + CGAP + trainLen(2);
    },
    slalom: function (d, L, v) {
      var free = L[0], rows = randInt(3, 4), dd = d;
      for (var r = 0; r < rows; r++) {
        for (var l = -1; l <= 1; l++) if (l !== free) addTrain(l, dd, 1);
        addCoins(free, dd, 4, 3);
        var nf = free + (chance(0.5) ? 1 : -1);
        if (nf < -1 || nf > 1) nf = free - (nf - free);
        free = nf;
        dd += CAR + Math.max(9, v * 0.8);
      }
      return dd - Math.max(9, v * 0.8);
    },
    gauntlet: function (d, L, v) {
      var mid = L[0], ramp = chance(0.5);
      var e1 = addTrain(L[1], d, 3, { ramp: ramp });
      if (ramp) { addRampCoins(L[1], d); addCoins(L[1], d + RAMP + 2, 8, 3.2, TOP + 0.9); }
      var e2 = addTrain(L[2], d + (ramp ? RAMP : 0), 3);
      var end = Math.max(e1, e2), gs = Math.max(13, v * 1.25), dd = d + 8, low = true;
      while (dd < end - 3) {
        addBarrier(mid, dd, low ? 'low' : 'high');
        if (low) addArc(mid, dd, v, 5); else addCoins(mid, dd - 3, 3, 2, 0.55);
        low = !low;
        dd += gs;
      }
      return end;
    },
    hurdleRun: function (d, L, v) {
      var gs = Math.max(13, v * 1.25), dd = d;
      for (var r = 0; r < 3; r++) {
        var k = r % 2 ? 'high' : 'low';
        for (var l = -1; l <= 1; l++) addBarrier(l, dd, k);
        if (k === 'low') addArc(L[0], dd, v, 5); else addCoins(L[0], dd - 3, 3, 2, 0.55);
        dd += gs;
      }
      return dd - gs + 4;
    },
    oncoming2: function (d, L, v) {
      var vt = trainSpeedAt(d);
      var m1 = d + 6, m2 = d + 6 + v * 0.95;
      addTrain(L[0], m1, 2, { moving: true, vt: vt });
      addTrain(L[1], m2, 2, { moving: true, vt: vt });
      addCoins(L[2], d, 6, 3);
      addBarrier(L[2], d + 26, 'low'); addArc(L[2], d + 26, v, 5);
      hint('oncoming', m1);
      return Math.max(m1, m2) + ACT * vt / v + trainLen(2) + 6;
    },
    doubleRamp: function (d, L) {
      var a = L[0], b = adj(a), c = -a - b;
      if (c < -1 || c > 1) c = 0;
      var e1 = addTrain(a, d, 3, { ramp: true }), e2 = addTrain(b, d + 4, 3, { ramp: true });
      addRampCoins(a, d); addRampCoins(b, d + 4);
      addCoins(a, d + RAMP + 2, 8, 3.4, TOP + 0.9);
      var e3 = addTrain(c, d + 6, 3);
      return Math.max(e1, e2, e3);
    }
  };
  // weights per tier [t0, t1, t2, t3]
  var PAT_W = {
    coins: [2, 1, 0.5, 0.3], train1: [3, 1.5, 0.7, 0.4], train2: [2, 2.5, 1.5, 1], hurdle: [3, 1.5, 1, 0.7], duck: [2.5, 1.5, 1, 0.7],
    lowWall: [0, 1, 0.8, 0.6], highWall: [0, 1, 0.8, 0.6], ramp: [0.8, 2, 1.5, 1.2], mixrow: [0, 1.5, 1.5, 1.2], oncoming: [0, 1, 1.5, 1.5],
    roofrun: [0, 0, 1.2, 1.2], slalom: [0, 0, 1.2, 1.5], gauntlet: [0, 0, 1.2, 1.5], hurdleRun: [0, 0, 0.8, 1.2], oncoming2: [0, 0, 0, 1.2], doubleRamp: [0, 0, 0.8, 1]
  };
  var INTRO = ['train1', 'hurdle', 'duck', 'ramp'];
  function tierAt(dist) { return dist < 220 ? 0 : dist < 750 ? 1 : dist < 1600 ? 2 : 3; }
  function pickPattern(dist) {
    if (gen.force) { var f = gen.force; gen.force = null; return f; }
    if (save.runs < 3 && gen.count < INTRO.length) return INTRO[gen.count];
    var tier = tierAt(dist), tot = 0, k;
    for (k in PAT_W) if (k !== gen.last) tot += PAT_W[k][tier];
    var r = Math.random() * tot;
    for (k in PAT_W) {
      if (k === gen.last) continue;
      r -= PAT_W[k][tier];
      if (r <= 0) return k;
    }
    return 'train1';
  }
  function generate() {
    while (gen.d < S.pD + 240) {
      var d = gen.d, v = speedAt(d), tier = tierAt(d);
      if (d >= gen.nextZone - 40) {
        addTunnel(gen.nextZone - TUNNEL_LEN / 2);
        gen.nextZone += ZONE_LEN;
      } else if (d >= gen.nextTunnel && d + TUNNEL_LEN + 150 < gen.nextZone && d > gen.nextZone - ZONE_LEN + 320) {
        addTunnel(d - 10);
        gen.nextTunnel = d + TUNNEL_LEN + rand(500, 900);
      }
      var id = pickPattern(d);
      var L = Kit.shuffle([-1, 0, 1]);
      gen.cur = id;
      var end = PAT[id](d, L, v, tier);
      gen.last = id; gen.count++;
      var gapT = lerp(1.25, 0.72, clamp(d / 3200, 0, 1));
      var gap = Math.max(13, v * gapT) + 3;
      var mid = end + gap / 2;
      if (end >= gen.nextPower) {
        addPickup(randInt(-1, 1), mid, pickType());
        gen.nextPower = end + rand(150, 260);
      } else if (chance(0.35)) {
        addCoins(randInt(-1, 1), mid - 4, 4, 2.6);
      }
      gen.d = end + gap;
    }
  }

  function clearWorld() {
    for (var i = 0; i < obstacles.length; i++) freeOb(obstacles[i]);
    obstacles.length = 0;
    for (var j = 0; j < coins.length; j++) coinFree.push(coins[j]);
    coins.length = 0;
    for (var k = 0; k < pickups.length; k++) { pickups[k].s.visible = false; spritePool.push(pickups[k].s); }
    pickups.length = 0;
    hints.length = 0;
    for (var t = 0; t < tunnelPool.length; t++) { tunnelPool[t].on = false; tunnelPool[t].m.visible = tunnelPool[t].w.visible = false; }
    parts.clear();
  }
  function resetWorld() {
    clearWorld();
    S.pD = S.prevPD = 0;
    resetChunks();
    // the starting "station": a parked train on one side, coins to grab
    addTrain(-1, 52, 2, { style: 1 });
    addTrain(1, 76, 1, { style: 0 });
    addCoins(0, 14, 12, 3);
    gen.d = 100; gen.count = 0; gen.last = '';
    gen.nextPower = 160 + rand(0, 80);
    gen.nextTunnel = 380 + rand(0, 300);
    gen.nextZone = ZONE_LEN;
    S.zoneShown = 0; S.milestone = 500;
    S.hintsShown = {};
    generate();
  }

  /* =========================================================== runner */
  var runner = RR.createRunner();
  scene.add(runner.root);
  runner.setOutfit(outfitById(save.outfit));
  runner.setBoard(boardById(save.board));
  var shadowTex = new T.CanvasTexture(RR.shadowCanvas());
  var shadow = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  scene.add(shadow);
  var bot = RR.createBot();
  scene.add(bot.root);
  var botState = { x: 0, y: 2, z: 6, show: 0 };
  var starTex = new T.CanvasTexture(RR.starCanvas());
  starTex.colorSpace = T.SRGBColorSpace;
  var stars = [];
  for (var si = 0; si < 5; si++) {
    var sp = new T.Sprite(new T.SpriteMaterial({ map: starTex, transparent: true, depthWrite: false }));
    sp.scale.set(0.35, 0.35, 0.35); sp.visible = false;
    scene.add(sp); stars.push(sp);
  }
  var ringTex = new T.CanvasTexture(RR.ringCanvas());
  var aura = new T.Sprite(new T.SpriteMaterial({ map: ringTex, color: 0xff3b5c, depthWrite: false, transparent: true, opacity: 0.8 }));
  aura.visible = false;
  scene.add(aura);
  var parts = RR.createParticles(520);
  scene.add(parts.points);

  /* ============================================================ actions */
  function doJump() {
    var big = POW.sneakers > 0;
    P.vy = Math.sqrt(2 * GRAV * (big ? SUPER_H : JUMP_H));
    P.grounded = false; P.coyote = 0; P.jumpBuf = 0;
    if (P.roll > 0) P.roll = 0;
    run.jumps++;
    sfx.jump(big);
    P.sq = 0.22; P.sqv = 0;
    parts.burst(P.x, P.y + 0.1, S.pD, { count: big ? 14 : 7, colors: big ? ['#7dff9b', '#ffffff', '#2ee06f'] : ['#ffffff', '#e8dcc8'], speed: 3, up: 1, life: 0.45, size: 0.28, gravity: 4, vd: -4 });
  }
  function startRoll() {
    if (P.roll <= 0) { run.rolls++; sfx.roll(); }
    P.roll = ROLL_T;
    parts.burst(P.x, 0.2 + P.y, S.pD, { count: 6, colors: ['#ffffff', '#e8dcc8'], speed: 2.5, up: 0.5, life: 0.4, size: 0.3, gravity: 2 });
  }
  function doAction(a) {
    if (a === 'left' || a === 'right') {
      var dir = a === 'left' ? -1 : 1, nl = P.lane + dir;
      if (nl < -1 || nl > 1) { P.flip = dir * 0.6; sfx.edge(); return; }
      P.lane = nl; run.lanes++;
      sfx.swipe(dir);
      P.flip = dir;
    } else if (a === 'up') {
      if (P.grounded || P.coyote > 0) doJump(); else P.jumpBuf = 0.2;
    } else if (a === 'down') {
      if (P.grounded) startRoll();
      else { P.vy = Math.min(P.vy, -28); P.rollOnLand = true; P.jumpBuf = 0; }
    }
  }

  function flashWarn() {
    var f = $('flash');
    f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
  }
  function stumble() {
    if (POW.board > 0) { breakBoard(); return; }
    if (P.stumbleT > 0) { crash('caught', S.bumpOb); return; }
    P.stumbleT = 3.6; P.stumbleAnim = 0.45; P.invuln = 0.4;
    S.stumbles = (S.stumbles || 0) + 1;
    S.slow = 0.72; S.shake = Math.max(S.shake, 0.35);
    botState.show = 1;
    sfx.stumble();
    flashWarn();
    pop('Careful!', 'warn');
    parts.burst(P.x, P.y + 1.2, S.pD, { count: 10, colors: ['#ffffff', '#ffd23f'], speed: 4, life: 0.5, size: 0.3, gravity: 6 });
  }
  function breakBoard() {
    POW.board = 0;
    runner.board.visible = false;
    P.invuln = 1.6;
    S.shake = Math.max(S.shake, 0.4);
    sfx.boardBreak();
    var bd = boardById(save.board);
    parts.burst(P.x, P.y + 0.3, S.pD, { count: 24, colors: [bd.deck, bd.stripe, bd.glow, '#ffffff'], speed: 7, up: 2, life: 0.8, size: 0.35, gravity: 14 });
    pop('Board saved you!', 'good');
  }
  function crash(reason, ob) {
    if (S.god || (S.mode !== 'play' && S.mode !== 'intro')) return;
    S.crashInfo = ob ? { pat: ob.pat, kind: ob.kind, moving: ob.moving, obLane: ob.lane, lane: P.lane, x: +P.x.toFixed(2), y: +P.y.toFixed(2), vy: +P.vy.toFixed(1), d: +(S.pD - ob.d0).toFixed(2), speed: +S.speed.toFixed(1), roll: P.roll > 0, board: POW.board > 0 } : { reason: reason };
    if (POW.board > 0) { breakBoard(); return; }
    S.mode = 'crash'; S.crashT = 0; S.reason = reason || 'bonk';
    P.vy = 7; P.grounded = false; P.roll = 0;
    S.shake = 0.9;
    sfx.crash();
    music.stop();
    parts.burst(P.x, P.y + 1.2, S.pD - 0.4, { count: 26, colors: ['#ffe14d', '#ffffff', '#ff9f1c', '#6ff7ff'], speed: 8, up: 2, life: 0.9, size: 0.38, gravity: 10 });
    flashWarn();
    if (S.reason === 'caught') botState.show = 1;
  }

  /* ============================================================ physics */
  function collide() {
    var ground = 0, i, ob;
    for (i = 0; i < obstacles.length; i++) {
      ob = obstacles[i];
      if (!ob.active) continue;
      var d0 = ob.d0, d1 = ob.d0 + ob.len;
      if (S.pD + PD < d0 || S.pD - PD > d1) continue;
      var ox = Math.abs(P.x - ob.x) - (ob.hw + PW);
      if (ox >= 0) continue;
      var top = ob.kind === 'ramp' ? ob.top * clamp((S.pD - d0) / ob.len, 0, 1) : ob.top;
      var tol = ob.kind === 'ramp' ? 0.75 : 0.4;
      if (P.y >= top - tol && (ob.kind === 'ramp' || P.vy <= 0.5 || P.y >= top - 0.05)) {
        if (ob.support) ground = Math.max(ground, top);
        continue;
      }
      if (P.y + P.h <= ob.y0) continue;
      if (P.invuln > 0 || S.god) continue;
      var pd0 = ob.pd0, prevOverD = (P.pd + PD >= pd0) && (P.pd - PD <= pd0 + ob.len);
      var prevOx = Math.abs(P.px - ob.x) - (ob.hw + PW);
      if (!prevOverD) {
        if (-ox < 0.5 && Math.abs(P.x - P.lane * LW) > 0.05) { sideBump(ob); return ground; }
        if (ob.kind === 'train' && P.y > top - 0.6) {
          P.y = top; P.vy = 0; ground = Math.max(ground, top);
          continue;
        }
        crash(ob.moving ? 'train' : ob.kind, ob);
        return ground;
      } else if (prevOx >= 0) {
        sideBump(ob);
        return ground;
      } else if (P.py >= top - 0.6 && ob.support) {
        ground = Math.max(ground, top);
      }
      // otherwise the runner was already inside this obstacle (it ghosted through after a
      // hoverboard save): let it pass instead of crashing unfairly
    }
    return ground;
  }
  function sideBump(ob) {
    S.bumpOb = ob;
    var side = P.px < ob.x ? -1 : 1;
    if (Math.abs(P.px - ob.x) < 0.01) side = P.x < ob.x ? -1 : 1;
    P.x = ob.x + side * (ob.hw + PW + 0.02);
    P.lane = clamp(ob.lane + side, -1, 1);
    if (Math.abs(P.lane * LW - ob.x) < 0.1) P.lane = clamp(ob.lane - side, -1, 1);
    P.px = P.x;
    stumble();
  }

  function stepPlay(dt) {
    var intro = S.mode === 'intro';
    // speed
    var target = speedAt(S.pD - S.runStart);
    S.slow = Math.min(1, S.slow + dt * 0.5);
    var ramp = intro ? smooth01(0, 0.7, S.introT) : 1;
    S.speed = target * S.slow * (0.25 + 0.75 * ramp);
    if (intro) { S.introT += dt; if (S.introT >= 0.7) S.mode = 'play'; }
    // power timers
    ['magnet', 'sneakers', 'doubler', 'board'].forEach(function (k) {
      if (POW[k] > 0) {
        POW[k] -= dt;
        if (POW[k] <= 0) {
          POW[k] = 0;
          if (k === 'board') { runner.board.visible = false; P.invuln = Math.max(P.invuln, 0.3); }
          sfx.powerEnd();
        }
      }
    });
    P.stumbleT = Math.max(0, P.stumbleT - dt);
    P.stumbleAnim = Math.max(0, P.stumbleAnim - dt);
    P.invuln = Math.max(0, P.invuln - dt);
    if (S.auto) {
      if (!S.autoDelay) autopilot();
      else {
        S.autoClock = (S.autoClock || 0) + dt;
        if (S.autoClock > 0.15) {
          S.autoClock = 0;
          var n0 = actions.length;
          autopilot();
          while (actions.length > n0) delayed.push({ a: actions.pop(), t: S.t + S.autoDelay });
          S.autoPending = delayed.length > 0;
        }
        for (var q = delayed.length - 1; q >= 0; q--) if (delayed[q].t <= S.t) { actions.push(delayed[q].a); delayed.splice(q, 1); }
        S.autoPending = delayed.length > 0;
      }
    }
    while (actions.length) doAction(actions.shift());
    // integrate
    P.px = P.x; P.py = P.y; P.pd = S.pD;
    S.prevPD = S.pD;
    S.pD += S.speed * dt;
    var tx = P.lane * LW, dx = tx - P.x;
    var vx = clamp(dx * 26, -24, 24);
    if (Math.abs(dx) < 0.03) { P.x = tx; vx = 0; } else P.x += Math.abs(vx * dt) > Math.abs(dx) ? dx : vx * dt;
    P.vx = vx;
    P.vy -= GRAV * dt;
    P.y += P.vy * dt;
    P.coyote -= dt; P.jumpBuf -= dt;
    if (P.roll > 0) P.roll -= dt;
    P.h = P.roll > 0 ? H_ROLL : H_STAND;
    // moving trains
    for (var i = 0; i < obstacles.length; i++) {
      var ob = obstacles[i];
      ob.pd0 = ob.d0;
      if (!ob.moving) continue;
      if (!ob.active) {
        if (ob.meet - S.pD < ACT) {
          ob.active = true;
          ob.d0 = ob.pd0 = ob.meet + (ob.meet - S.pD) * ob.vt / Math.max(8, S.speed);
          ob.v = -ob.vt;
          for (var k = 0; k < ob.meshes.length; k++) ob.meshes[k].m.visible = true;
          ob.glow.visible = true;
        }
      } else {
        ob.d0 += ob.v * dt;
        if (!ob.horn && ob.d0 - S.pD < 70) { ob.horn = true; if (Math.abs(P.x - ob.x) < 1.3) sfx.horn(); }
      }
    }
    if (S.mode === 'crash') return;
    var ground = collide();
    if (S.mode === 'crash') return;
    // tunnel ceiling
    var tun = inTunnel(S.pD);
    if (tun && P.y + P.h > 8.8) { P.y = 8.8 - P.h; P.vy = Math.min(P.vy, 0); }
    // ground
    S.groundY = ground;
    if (P.y <= ground) {
      if (!P.grounded) {
        if (P.vy < -5) {
          P.sq = -0.28; P.sqv = 0;
          sfx.land(P.vy < -18);
          parts.burst(P.x, ground + 0.05, S.pD, { count: 8, colors: ['#ffffff', '#efe6d6'], speed: 3.5, up: 0.4, life: 0.4, size: 0.3, gravity: 3, vd: -3 });
          if (P.vy < -18) S.shake = Math.max(S.shake, 0.15);
        }
        P.grounded = true;
        if (P.rollOnLand) { P.rollOnLand = false; startRoll(); }
        if (P.jumpBuf > 0) { P.y = ground; doJump(); }
      }
      if (P.grounded) { P.y = ground; P.vy = 0; P.coyote = 0.1; }
    } else if (P.grounded && P.y > ground + 0.05) {
      P.grounded = false;
    }
    // squash spring
    P.sqv += (-P.sq * 320 - P.sqv * 16) * dt;
    P.sq += P.sqv * dt;
    // coins
    var mag = POW.magnet > 0;
    for (var c = coins.length - 1; c >= 0; c--) {
      var co = coins[c], dz = co.d - S.pD;
      if (dz < -4) { coinFree.push(co); coins[c] = coins[coins.length - 1]; coins.pop(); continue; }
      if (mag && !co.mag && dz < 26 && dz > -1) co.mag = true;
      if (co.mag) {
        co.mt += dt;
        var kk = Math.min(1, dt * (7 + co.mt * 26));
        co.x += (P.x - co.x) * kk; co.y += (P.y + 0.9 - co.y) * kk; co.d += (S.pD + 0.2 - co.d) * kk;
      }
      if (Math.abs(co.d - S.pD) < 0.95 && Math.abs(co.x - P.x) < 0.9 && co.y > P.y - 0.45 && co.y < P.y + P.h + 0.6) {
        run.coins++;
        if (co.mag) run.magCoins++;
        sfx.coin();
        parts.burst(co.x, co.y, co.d, { count: 5, colors: ['#ffe14d', '#fff6c9', '#ffb000'], speed: 3, life: 0.35, size: 0.22, gravity: 2, vd: S.speed * 0.6 });
        bumpCoins();
        coinFree.push(co); coins[c] = coins[coins.length - 1]; coins.pop();
      }
    }
    // pickups
    for (var p = pickups.length - 1; p >= 0; p--) {
      var pk = pickups[p];
      if (pk.d - S.pD < -4) { pk.s.visible = false; spritePool.push(pk.s); pickups.splice(p, 1); continue; }
      if (mag && pk.d - S.pD < 14 && pk.d - S.pD > -1) { pk.x += (P.x - pk.x) * Math.min(1, dt * 6); pk.y += (P.y + 1 - pk.y) * Math.min(1, dt * 6); }
      if (Math.abs(pk.d - S.pD) < 1.1 && Math.abs(pk.x - P.x) < 1.1 && pk.y > P.y - 0.6 && pk.y < P.y + P.h + 0.9) {
        collectPickup(pk);
        pk.s.visible = false; spritePool.push(pk.s); pickups.splice(p, 1);
      }
    }
    // stats for passed obstacles
    for (var q = 0; q < obstacles.length; q++) {
      var o2 = obstacles[q];
      if (!o2.passed && o2.active && o2.d0 + o2.len < S.pD - PD) {
        o2.passed = true;
        if (Math.abs(o2.x - P.x) < 1.3) {
          if (o2.kind === 'low') { run.hops++; }
          else if (o2.kind === 'high') { run.unders++; }
        }
        if (o2.moving) { run.dodge++; if (Math.abs(o2.x - P.x) < LW + 0.3) { sfx.close(); } }
      }
    }
    if (P.grounded && P.y > 2.5) run.roof += S.speed * dt;
    run.dist = S.pD - S.runStart;
    var m = multBase() * (POW.doubler > 0 ? 2 : 1);
    S.score += S.speed * dt * m;
    run.score = Math.floor(S.score);
    if (!S.bestAnnounced && save.best > 0 && run.score > save.best) {
      S.bestAnnounced = true;
      pop('NEW BEST!', 'best');
      sfx.newBest();
      confetti(60);
    }
    // hints
    for (var h = hints.length - 1; h >= 0; h--) {
      var hn = hints[h];
      if (hn.d - S.pD < S.speed * 1.35) {
        hints.splice(h, 1);
        if ((save.tut[hn.type] || 0) < 2 && !S.hintsShown[hn.type]) {
          S.hintsShown[hn.type] = true;
          save.tut[hn.type] = (save.tut[hn.type] || 0) + 1;
          showHint(hn.type);
        }
      }
    }
    // new zone banner + distance milestones
    var zi = Math.floor((S.pD - TUNNEL_LEN / 2 - 4) / ZONE_LEN);
    if (zi > S.zoneShown) {
      S.zoneShown = zi;
      pop(RR.ZONES[zi % RR.ZONES.length].name + '!', 'zone');
      sfx.mission();
    }
    if (run.dist >= S.milestone) {
      toast('<b>' + Kit.fmt(S.milestone) + ' m!</b> Keep going!', 'mile');
      sfx.countTick(12);
      S.milestone += 500;
    }
    recycle();
    generate();
    // missions (every few frames)
    if ((S.frame++ & 7) === 0) checkMissions(false);
  }

  function collectPickup(pk) {
    var tp = pk.type;
    parts.burst(pk.x, pk.y, pk.d, { count: 22, colors: [RR.ICON_COLORS[tp], '#ffffff', '#ffe14d'], speed: 6, up: 1, life: 0.7, size: 0.35, gravity: 6, vd: S.speed * 0.5 });
    if (tp === 'mystery') {
      var amt = [25, 40, 50, 75, 100, 150, 250][Math.min(6, Math.floor(Math.pow(Math.random(), 1.6) * 7))];
      run.bonus += amt;
      sfx.mystery();
      pop('+' + amt + ' coins!', 'gold');
      bumpCoins();
      return;
    }
    run.powers++;
    POW[tp] = powerDur(tp);
    if (tp === 'board') {
      run.boards++;
      runner.setBoard(boardById(save.board));
      runner.board.visible = true;
      sfx.boardOn();
      pop('HOVERBOARD!', 'blue');
    } else {
      sfx.power();
      pop({ magnet: 'COIN MAGNET!', sneakers: 'SUPER SNEAKERS!', doubler: '2X SCORE!' }[tp], tp);
    }
  }

  function recycle() {
    for (var i = obstacles.length - 1; i >= 0; i--) {
      var ob = obstacles[i];
      if (ob.active && ob.d0 + ob.len < S.pD - 25) { freeOb(ob); obstacles.splice(i, 1); }
    }
    for (var t = 0; t < tunnelPool.length; t++) {
      var tn = tunnelPool[t];
      if (tn.on && tn.d0 + TUNNEL_LEN < S.pD - 40) { tn.on = false; tn.m.visible = tn.w.visible = false; }
    }
    updateChunks();
  }

  /* ========================================================== autopilot */
  // Debug helper used by automated playtests: a look-ahead bot that picks the lane
  // whose first unavoidable obstacle is furthest away. Used to check fairness.
  function blockDist(l, onRoof) {
    var best = 1e9;
    for (var i = 0; i < obstacles.length; i++) {
      var ob = obstacles[i];
      if (ob.lane !== l || !ob.active || ob.kind === 'low' || ob.kind === 'high' || ob.kind === 'ramp') continue;
      if (ob.d0 + ob.len < S.pD - PD - 0.2) continue;
      if (ob.kind === 'train' && !ob.moving) {
        if (hasRampBefore(ob)) continue;
        if (onRoof && ob.d0 < S.pD + 2) continue;
        if (onRoof && roofChain(ob)) continue;
      }
      var dd = ob.d0 - S.pD;
      if (ob.moving) dd = dd * S.speed / (S.speed + ob.vt);
      if (dd < best) best = dd;
    }
    return best;
  }
  function hasRampBefore(ob) {
    for (var i = 0; i < obstacles.length; i++) {
      var r = obstacles[i];
      if (r.kind === 'ramp' && r.lane === ob.lane && Math.abs(r.d0 + r.len - ob.d0) < 0.1) return true;
    }
    return false;
  }
  function roofChain(ob) {
    // true if another roof in the same lane or a neighbour lane ends right where this one starts
    for (var i = 0; i < obstacles.length; i++) {
      var r = obstacles[i];
      if (r === ob || r.kind !== 'train' || r.moving) continue;
      if (r.d0 <= ob.d0 && r.d0 + r.len >= ob.d0 - 0.8 && r.d0 < S.pD + 1 && r.d0 + r.len > S.pD) return true;
    }
    return false;
  }
  function bodyAt(l, dA, dB) {
    for (var i = 0; i < obstacles.length; i++) {
      var ob = obstacles[i];
      if (ob.lane !== l || !ob.active || ob.kind === 'low' || ob.kind === 'high') continue;
      if (ob.d0 + ob.len < dA || ob.d0 > dB) continue;
      var top = ob.kind === 'ramp' ? TOP * clamp((S.pD - ob.d0) / ob.len, 0, 1) : ob.top;
      if (P.y >= top - 0.3) continue;
      return true;
    }
    return false;
  }
  function autopilot() {
    var v = S.speed, onRoof = P.y > 2.5;
    // barriers in my lane
    for (var i = 0; i < obstacles.length; i++) {
      var ob = obstacles[i];
      if (ob.lane !== P.lane || (ob.kind !== 'low' && ob.kind !== 'high')) continue;
      var dd = ob.d0 - S.pD, tt = dd / v - (S.autoDelay || 0);
      if (dd < 0 || tt > 0.5) continue;
      if (ob.kind === 'low' && tt < 0.3 && tt > 0.02 && P.grounded && P.y < 0.1 && !S.autoPending) { actions.push('up'); return; }
      if (ob.kind === 'high' && tt < 0.3 && tt > 0 && P.roll <= 0 && P.y < 0.1 && !S.autoPending) { actions.push('down'); return; }
    }
    if (P.x !== P.lane * LW || S.autoPending) return;
    var here = blockDist(P.lane, onRoof);
    if (here > v * 1.6) return;
    var bestL = P.lane, bestD = here;
    for (var l = -1; l <= 1; l++) {
      if (l === P.lane) continue;
      var d = blockDist(l, onRoof);
      // path must be clear: every lane between here and l has no body alongside me
      var ok = true, step = l > P.lane ? 1 : -1;
      for (var k = P.lane + step; k !== l + step; k += step) if (bodyAt(k, S.pD - 1, S.pD + v * 0.25 * Math.abs(k - P.lane) + 1)) ok = false;
      if (ok && d > bestD + 2) { bestD = d; bestL = l; }
    }
    if (bestL !== P.lane) actions.push(bestL < P.lane ? 'left' : 'right');
  }

  /* ============================================================ render */
  var dummy = new T.Object3D();
  var camPos = new T.Vector3(0, 2, 5), camLook = new T.Vector3(0, 1, 0), tmpV = new T.Vector3(), tmpL = new T.Vector3();
  var lastT = performance.now();
  function render(alpha) {
    var now = performance.now(), rdt = Math.min(0.1, (now - lastT) / 1000);
    lastT = now;
    var playing = S.mode === 'play' || S.mode === 'intro';
    var a = playing ? alpha : 1;
    var pDr = S.prevPD + (S.pD - S.prevPD) * a;
    var xr = P.px + (P.x - P.px) * a, yr = P.py + (P.y - P.py) * a;
    if (!playing) { xr = P.x; yr = P.y; }

    // world objects
    for (var i = 0; i < NCH; i++) { var c = chunks[i]; c.m.position.z = c.w.position.z = pDr - (c.d0 + CH / 2); }
    for (var t = 0; t < tunnelPool.length; t++) { var tn = tunnelPool[t]; if (tn.on) tn.m.position.z = tn.w.position.z = pDr - (tn.d0 + TUNNEL_LEN / 2); }
    for (var o = 0; o < obstacles.length; o++) {
      var ob = obstacles[o];
      if (!ob.active) continue;
      var od0 = ob.moving ? ob.pd0 + (ob.d0 - ob.pd0) * a : ob.d0;
      for (var k = 0; k < ob.meshes.length; k++) {
        var mm = ob.meshes[k];
        mm.m.position.set(ob.x, 0, pDr - (od0 + mm.off));
      }
      if (ob.glow) {
        ob.glow.position.set(ob.x, 1.0, pDr - od0 + 0.4);
        var gs = 3.2 + Math.sin(S.t * 18) * 0.3;
        ob.glow.scale.set(gs * 1.3, gs * 0.7, 1);
      }
    }
    // coins
    var spin = S.t * 3.2, n = 0, movers = null;
    for (var mo = 0; mo < obstacles.length; mo++) if (obstacles[mo].moving && obstacles[mo].active) (movers || (movers = [])).push(obstacles[mo]);
    for (var ci2 = 0; ci2 < coins.length; ci2++) {
      var co = coins[ci2], z = pDr - co.d;
      if (z < -220 || z > 12) continue;
      if (movers && hiddenByTrain(co, movers)) continue;
      dummy.position.set(co.x, co.y + Math.sin(S.t * 4 + co.ph) * 0.08, z);
      dummy.rotation.set(0, spin + co.ph, 0);
      var sc = co.mag ? 0.8 : 1;
      dummy.scale.set(sc, sc, sc);
      dummy.updateMatrix();
      coinMesh.setMatrixAt(n++, dummy.matrix);
    }
    coinMesh.count = n;
    coinMesh.instanceMatrix.needsUpdate = true;
    // pickups
    for (var p = 0; p < pickups.length; p++) {
      var pk = pickups[p];
      pk.t += rdt;
      var ps = 1.35 + Math.sin(pk.t * 5) * 0.08;
      pk.s.position.set(pk.x, pk.y + Math.sin(pk.t * 3) * 0.18, pDr - pk.d);
      pk.s.scale.set(ps, ps, ps);
    }
    parts.render(pDr);

    // runner
    var mode = 'run';
    if (S.mode === 'title') mode = S.cheer > 0 ? 'cheer' : 'idle';
    else if (S.mode === 'crash' || S.mode === 'over') mode = 'crash';
    else if (P.stumbleAnim > 0) mode = 'stumble';
    else if (P.roll > 0) mode = 'roll';
    else if (!P.grounded) mode = 'air';
    else if (POW.board > 0) mode = 'board';
    if (S.mode !== 'paused') {
      P.phase += rdt * (8.5 + (S.speed - 13) * 0.22);
      runner.t += rdt;
    }
    runner.animate({ mode: mode, phase: P.phase, dt: S.mode === 'paused' ? 0 : rdt, vy: P.vy, time: runner.t });
    var boardUp = POW.board > 0 ? 0.28 + Math.sin(S.t * 4) * 0.04 : 0;
    runner.root.position.set(xr, yr + boardUp, 0);
    var targetFace = (S.mode === 'title') ? Math.PI : 0;
    P.face += (targetFace - P.face) * Math.min(1, rdt * (S.mode === 'intro' ? 12 : 6));
    P.flip *= Math.exp(-rdt * 9);
    var lean = -P.vx / 20;
    runner.root.rotation.set(0, P.face + lean * 0.25 + P.flip * 0.1, lean * 0.3 + P.flip * -0.08);
    var sq = P.sq;
    runner.root.scale.set(1 - sq * 0.5, 1 + sq, 1 - sq * 0.5);
    if (P.roll > 0 && S.mode !== 'crash' && S.mode !== 'over') {
      var rt = 1 - P.roll / ROLL_T;
      runner.pivot.rotation.x = -Math.PI * 2 * (1 - Math.pow(1 - Math.min(1, rt * 1.25), 2));
    } else runner.pivot.rotation.x = 0;
    if (S.mode === 'crash' || S.mode === 'over') {
      P.crashRot += (1.25 - P.crashRot) * Math.min(1, rdt * 6);
      runner.pivot.rotation.x = P.crashRot;
    }
    // blink when invulnerable
    runner.root.visible = !(P.invuln > 0.35 && playing && Math.floor(S.t * 16) % 2 === 0);
    // board glow trail
    if (POW.board > 0 && playing && Math.random() < 0.6) {
      var bd = boardById(save.board);
      parts.burst(P.x + rand(-0.3, 0.3), P.y + 0.12, S.pD - 0.6, { count: 1, color: bd.glow, speed: 0.5, life: 0.35, size: 0.3, gravity: 0 });
    }
    if (POW.sneakers > 0 && playing && !P.grounded && Math.random() < 0.5) {
      parts.burst(P.x + rand(-0.15, 0.15), P.y + 0.1, S.pD - 0.3, { count: 1, colors: ['#7dff9b', '#ffffff'], speed: 0.5, life: 0.4, size: 0.25, gravity: 0 });
    }
    // magnet aura
    var magOn = POW.magnet > 0 && playing;
    aura.visible = magOn;
    if (magOn) {
      var as = 2.3 + ((S.t * 1.6) % 1) * 0.5;
      aura.position.set(xr, yr + 0.9, 0);
      aura.scale.set(as, as, 1);
      aura.material.opacity = (POW.magnet < 2.5 ? 0.35 + 0.4 * (Math.floor(S.t * 8) % 2) : 0.85) * (1 - ((S.t * 1.6) % 1) * 0.6);
    }
    // shadow
    var gy = S.groundY;
    var hgt = Math.max(0, yr - gy);
    var ss = clamp(1.1 - hgt * 0.12, 0.45, 1.1);
    shadow.position.set(xr, gy + 0.04, 0.05);
    shadow.scale.set(ss, ss * 1.25, 1);
    // crash stars
    var showStars = S.mode === 'crash' || S.mode === 'over';
    for (var s2 = 0; s2 < stars.length; s2++) {
      stars[s2].visible = showStars;
      if (showStars) {
        var sa = S.t * 3 + s2 / stars.length * Math.PI * 2;
        stars[s2].position.set(xr + Math.cos(sa) * 0.55, yr + 0.55 + Math.sin(S.t * 5 + s2) * 0.05, 0.9 + Math.sin(sa) * 0.45);
      }
    }
    // patrol bot
    if (S.mode === 'title') botState.show = 0;
    var botOn = botState.show > 0 && (P.stumbleT > 0 || S.mode === 'crash' || S.mode === 'over');
    if (!botOn) botState.show = 0;
    var caught = S.reason === 'caught' && (S.mode === 'crash' || S.mode === 'over');
    var bside = xr > 0.5 ? -1 : 1;
    var bx = caught ? xr + 0.9 : xr + bside * 1.5, by = caught ? yr + 1.3 : 1.25 + yr + Math.sin(S.t * 6) * 0.12, bz = caught ? 1.3 : 1.6;
    if (!botOn) { bz = 12; by = 5; }
    if (botOn && botState.z > 9) { botState.z = 9; botState.x = bx; botState.y = by + 1.5; }
    botState.x += (bx - botState.x) * Math.min(1, rdt * 6);
    botState.y += (by - botState.y) * Math.min(1, rdt * 6);
    botState.z += (bz - botState.z) * Math.min(1, rdt * (botOn ? 7 : 3));
    bot.root.visible = botState.z < 11;
    bot.root.position.set(botState.x, botState.y, botState.z);
    bot.root.rotation.set(0, caught ? Math.PI - 0.6 : Math.PI - bside * 0.9, Math.sin(S.t * 4) * 0.1);
    bot.root.scale.setScalar(0.8);
    bot.animate(S.t);

    // tunnel dimming + time of day
    var tunNow = inTunnel(pDr + 4) ? 1 : 0;
    tunnelDim += (tunNow - tunnelDim) * Math.min(1, rdt * 3);
    applyTOD(S.mode === 'title' ? 0 : Math.max(0, pDr - S.runStart));

    // camera
    var camTarget, lookTarget, fov = 60;
    var groundF = S.groundY;
    P.camY += (Math.max(groundF, (groundF + (yr - groundF) * 0.35)) - P.camY) * Math.min(1, rdt * 5);
    if (S.mode === 'title') {
      var shop = S.menu === 'shop';
      camTarget = tmpV.set(shop ? 0.9 : -0.7, shop ? 1.75 : 2.05, shop ? 4.6 : 6.6);
      lookTarget = tmpL.set(shop ? 1.75 : -2.05, shop ? 1.05 : 1.25, 0);
      fov = 55;
    } else if (S.mode === 'crash' || S.mode === 'over') {
      camTarget = tmpV.set(xr * 0.8 + 1.6, P.camY + 2.9, 5.2);
      lookTarget = tmpL.set(xr * 0.9, yr + 0.5, -1);
      fov = 58;
    } else {
      var spd = clamp((S.speed - 13) / 18, 0, 1);
      camTarget = tmpV.set(xr * 0.72, 3.85 + P.camY * 0.9, 6.7 + spd * 0.5);
      lookTarget = tmpL.set(xr * 0.82, 1.25 + P.camY * 0.9, -10);
      fov = 60 + spd * 8;
    }
    var camRate = S.mode === 'intro' ? 6 : S.mode === 'title' ? 4 : S.mode === 'play' ? 14 : 3;
    var kc = Math.min(1, rdt * camRate);
    camPos.lerp(camTarget, kc);
    camLook.lerp(lookTarget, kc);
    if (S.mode === 'play') { camPos.x = lerp(camPos.x, camTarget.x, 0.5); }
    var tunCap = inTunnel(pDr + 7) || inTunnel(pDr) ? 8.3 : 99;
    camera.position.copy(camPos);
    if (camera.position.y > tunCap) camera.position.y = tunCap;
    if (S.mode !== 'paused') S.shake = Math.max(0, S.shake - rdt * 1.6);
    var shk = S.shake * S.shake * 1.2;
    camera.position.x += (Math.random() - 0.5) * shk;
    camera.position.y += (Math.random() - 0.5) * shk;
    camera.lookAt(camLook);
    if (Math.abs(camera.fov - fov) > 0.05) {
      camera.fov += (fov - camera.fov) * Math.min(1, rdt * 3);
      camera.updateProjectionMatrix();
      updatePointScale();
    }
    skyGroup.position.set(camera.position.x, 0, camera.position.z);
    clouds.rotation.y += rdt * 0.004;

    renderer.render(scene, camera);
    renderHUD();
  }

  function hiddenByTrain(co, movers) {
    for (var i = 0; i < movers.length; i++) {
      var m = movers[i];
      if (Math.abs(co.x - m.x) < 1.2 && co.y < TOP && co.d > m.d0 - 0.5 && co.d < m.d0 + m.len + 0.5) return true;
    }
    return false;
  }
  function updatePointScale() {
    var h = renderer.domElement.height;
    parts.material.uniforms.uScale.value = h / (2 * Math.tan(camera.fov * Math.PI / 360));
  }

  /* ============================================================== loop */
  S.frame = 0; S.cheer = 0;
  function update(dt) {
    if (S.mode === 'paused' || S.hold) { Kit.keys.endFrame(); return; }
    S.t += dt;
    S.cheer = Math.max(0, S.cheer - dt);
    if (S.mode === 'play' || S.mode === 'intro') stepPlay(dt);
    else if (S.mode === 'crash') {
      S.crashT += dt;
      // bounce back a little and fall
      P.vy -= GRAV * 0.6 * dt; P.y += P.vy * dt;
      if (P.y < S.groundY) { P.y = S.groundY; P.vy = Math.abs(P.vy) > 3 ? -P.vy * 0.3 : 0; }
      if (S.crashT < 0.35) { S.prevPD = S.pD; S.pD -= dt * 4 * (1 - S.crashT / 0.35); }
      P.px = P.x; P.py = P.y;
      if (S.crashT > 1.25) gameOver();
    } else if (S.mode === 'title') {
      P.y = 0; P.px = P.x = 0; P.py = 0;
    }
    parts.update(dt);
    // tick overlay animations
    uiTick(dt);
    Kit.keys.endFrame();
  }

  /* ================================================================ UI */
  var ui = $('ui');
  function layout() {
    var w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    var s = Math.min(w / 1280, h / 720);
    ui.style.fontSize = (16 * s).toFixed(2) + 'px';
    updatePointScale();
    var cf = $('confetti');
    cf.width = Math.round(w * PR); cf.height = Math.round(h * PR);
  }
  window.addEventListener('resize', layout);

  var screens = ['title', 'shop', 'missions', 'pause', 'over'];
  function show(id) {
    screens.forEach(function (s) { $(s).hidden = s !== id; });
    $('hud').hidden = !(id === null || id === 'pause');
    $('pauseBtn').hidden = id !== null;
  }

  // HUD
  var hudCache = {};
  function setText(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } }
  var POW_ORDER = ['magnet', 'sneakers', 'doubler', 'board'];
  var powEls = {};
  var ICONS = {};
  function makeIcons() {
    ['magnet', 'sneakers', 'doubler', 'board', 'mystery', 'coin'].forEach(function (k) { ICONS[k] = RR.canvasTex(96, function (g, sz) { RR.drawIcon(g, k, sz, false); }); });
    POW_ORDER.forEach(function (k) {
      if (!powEls[k]) {
        var d = document.createElement('div');
        d.className = 'pw';
        d.innerHTML = '<canvas data-icon="' + k + '" width="64" height="64"></canvas><div class="pw-bar"><i></i></div>';
        $('powers').appendChild(d);
        powEls[k] = { el: d, bar: d.querySelector('i') };
      }
    });
    paintIcons(document);
  }
  function paintIcons(root) {
    root.querySelectorAll('canvas[data-icon]').forEach(function (c) {
      var g = c.getContext('2d');
      g.clearRect(0, 0, c.width, c.height);
      g.drawImage(ICONS[c.getAttribute('data-icon')], 0, 0, c.width, c.height);
    });
    root.querySelectorAll('canvas[data-portrait]').forEach(function (c) {
      var k = c.getAttribute('data-portrait').split(':');
      var src = portraits && portraits[k[0]][k[1]];
      if (src) c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    });
  }
  function renderHUD() {
    if ($('hud').hidden) return;
    setText('score', Kit.fmt(run.score || 0));
    setText('coins', Kit.fmt((run.coins || 0) + (run.bonus || 0)));
    setText('dist', Kit.fmt(run.dist || 0) + ' m');
    var m = multBase() * (POW.doubler > 0 ? 2 : 1);
    setText('mult', 'x' + m);
    var mc = POW.doubler > 0 ? 'pill hot' : 'pill';
    if (hudCache.multCls !== mc) { hudCache.multCls = mc; $('mult').className = mc; }
    POW_ORDER.forEach(function (k) {
      var on = POW[k] > 0, pe = powEls[k];
      if (!pe) return;
      if (pe.on !== on) { pe.on = on; pe.el.classList.toggle('on', on); }
      if (on) {
        var f = POW[k] / powerDur(k);
        pe.bar.style.transform = 'scaleX(' + f.toFixed(3) + ')';
        pe.el.classList.toggle('low', POW[k] < 2.5);
      }
    });
    var warn = P.stumbleT > 0 && S.mode === 'play';
    if (hudCache.warn !== warn) { hudCache.warn = warn; $('danger').classList.toggle('on', warn); }
  }
  function bumpCoins() {
    var el = $('coinBox');
    el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
  }
  var popTimer = 0;
  function pop(text, cls) {
    var el = $('pop');
    el.textContent = text;
    el.className = 'pop ' + (cls || '');
    void el.offsetWidth;
    el.classList.add('show');
  }
  function toast(html, cls) {
    var el = document.createElement('div');
    el.className = 'toast' + (cls ? ' ' + cls : '');
    el.innerHTML = html;
    $('toasts').appendChild(el);
    setTimeout(function () { el.classList.add('out'); }, 2600);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 3200);
  }
  var HINTS = {
    lane: '<span class="sg-key">←</span><span class="sg-key">→</span> Switch lanes!',
    jump: '<span class="sg-key">↑</span> or <span class="sg-key">Space</span> Jump!',
    roll: '<span class="sg-key">↓</span> Roll under!',
    ramp: 'Run up the ramp onto the trains!',
    oncoming: 'Train coming! Move over!'
  };
  var hintTimer = 0;
  function showHint(type) {
    var el = $('hint');
    el.innerHTML = HINTS[type];
    el.hidden = false;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    hintTimer = 1.9;
  }

  // confetti (2D overlay)
  var cfx = [], cctx = $('confetti').getContext('2d');
  var CONF_COLORS = ['#ffd23f', '#ff4d6d', '#3a86ff', '#06d6a0', '#ffffff', '#b35cff', '#ff9f1c'];
  function confetti(n) {
    var w = window.innerWidth;
    for (var i = 0; i < n; i++) {
      cfx.push({ x: rand(0, w), y: rand(-80, -10), vx: rand(-60, 60), vy: rand(120, 320), r: rand(0, 6), vr: rand(-8, 8), s: rand(6, 12), c: Kit.pick(CONF_COLORS), life: rand(2.2, 3.6) });
    }
    if (cfx.length > 400) cfx.splice(0, cfx.length - 400);
  }
  function uiTick(dt) {
    if (hintTimer > 0) { hintTimer -= dt; if (hintTimer <= 0) $('hint').hidden = true; }
    if (overAnim.on) tickOver(dt);
    // confetti
    var w = window.innerWidth, h = window.innerHeight;
    cctx.setTransform(PR, 0, 0, PR, 0, 0);
    cctx.clearRect(0, 0, w, h);
    for (var i = cfx.length - 1; i >= 0; i--) {
      var c = cfx[i];
      c.life -= dt;
      if (c.life <= 0 || c.y > h + 20) { cfx.splice(i, 1); continue; }
      c.vy += 200 * dt; c.vx *= 0.99;
      c.x += c.vx * dt + Math.sin(c.life * 5) * 0.6; c.y += c.vy * dt; c.r += c.vr * dt;
      cctx.save(); cctx.translate(c.x, c.y); cctx.rotate(c.r);
      cctx.globalAlpha = Math.min(1, c.life);
      cctx.fillStyle = c.c; cctx.fillRect(-c.s / 2, -c.s / 4, c.s, c.s / 2);
      cctx.restore();
    }
  }

  /* ----------------------------------------------------- missions UI */
  function missionRow(m, compact) {
    var pct = Math.min(1, m.p / m.n);
    return '<div class="mission' + (m.done ? ' done' : '') + (compact ? ' compact' : '') + '">' +
      '<div class="m-check">' + (m.done ? '✔' : '') + '</div>' +
      '<div class="m-body"><div class="m-text">' + missionText(m) + '</div>' +
      '<div class="m-bar"><i style="width:' + (pct * 100).toFixed(1) + '%"></i></div></div>' +
      '<div class="m-num">' + Kit.fmt(Math.min(m.p, m.n)) + '/' + Kit.fmt(m.n) + '</div></div>';
  }
  var cumBase = {};
  function startMissions() {
    cumBase = { coins: save.totals.coins, boards: save.totals.boards, runs: save.totals.runs };
  }
  function checkMissions(final) {
    save.missions.forEach(function (m) {
      if (m.done) return;
      var def = MT[m.k], val;
      if (def.cum) {
        var runVal = def.stat === 'coins' ? run.coins + run.bonus : def.stat === 'runs' ? (final ? 1 : 0) : run[def.stat];
        val = cumBase[def.stat] + runVal - (m.base || 0);
      } else val = def.stat === 'coins' ? run.coins : run[def.stat];
      val = Math.floor(val || 0);
      if (def.cum) m.p = val; else m.p = Math.max(m.p, val);
      if (m.p >= m.n) {
        m.p = m.n; m.done = true;
        sfx.mission();
        toast('<b>✔ Mission done!</b> ' + missionText(m));
        persist();
      }
    });
  }
  function refreshMissionsScreen() {
    $('mList').innerHTML = save.missions.map(function (m) { return missionRow(m, false); }).join('');
    $('mMult').textContent = 'x' + multBase();
    $('mNext').textContent = 'x' + Math.min(30, multBase() + 1);
    $('mReward').textContent = Kit.fmt(missionReward());
  }
  function missionReward() { return 100 + 50 * save.mlevel; }

  /* ----------------------------------------------------- title */
  function refreshTitle() {
    $('tBest').textContent = Kit.fmt(save.best);
    $('tCoins').textContent = Kit.fmt(save.coins);
    $('tMult').textContent = 'x' + multBase();
    var left = save.missions.filter(function (m) { return !m.done; }).length;
    $('tMissions').textContent = left ? left + ' to go' : 'Done!';
    $('tMissionPeek').innerHTML = save.missions.map(function (m) { return missionRow(m, true); }).join('');
  }
  function goTitle() {
    S.mode = 'title'; S.menu = 'title';
    resetPlayer(); resetRun();
    runner.board.visible = false;
    runner.setOutfit(outfitById(save.outfit));
    resetWorld();
    S.runStart = 0; S.score = 0; S.groundY = 0; S.speed = 0;
    refreshTitle();
    show('title');
    music.play('menu');
    Kit.keys.reset();
  }
  function startRun() {
    resetPlayer(); resetRun();
    runner.board.visible = false;
    runner.setOutfit(outfitById(save.outfit));
    if (S.mode !== 'title') { resetWorld(); P.face = 0; }
    S.runStart = 0; S.score = 0; S.bestAnnounced = false; S.slow = 1; S.shake = 0; S.groundY = 0;
    S.mode = 'intro'; S.menu = 'play'; S.introT = 0; S.crashInfo = null; S.stumbles = 0;
    startMissions();
    show(null);
    $('hint').hidden = true;
    music.play('game');
    Kit.keys.reset();
    actions.length = 0;
    hudCache = {};
    renderHUD();
  }
  var pausedFrom = 'play';
  function pause() {
    if (S.mode !== 'play' && S.mode !== 'intro') return;
    pausedFrom = S.mode;
    S.mode = 'paused';
    $('pMissions').innerHTML = save.missions.map(function (m) { return missionRow(m, true); }).join('');
    show('pause');
    music.stop();
    sfx.click();
  }
  function resume() {
    if (S.mode !== 'paused') return;
    S.mode = pausedFrom;
    show(null);
    music.play('game');
    Kit.keys.reset();
    actions.length = 0;
    lastT = performance.now();
  }

  /* ----------------------------------------------------- game over */
  var overAnim = { on: false, t: 0, score: 0, shown: 0, ready: 0, newBest: false };
  var OVER_TITLES = { bonk: ['BONK!', 'OOF!', 'WHOOPS!'], train: ['CHOO-BONK!', 'TOOT TOOT!'], caught: ['CAUGHT!'], low: ['TRIPPED!', 'OOPSIE!'], high: ['BONK!', 'OUCH!'], ramp: ['BONK!'] };
  function gameOver() {
    S.mode = 'over';
    run.runs = 1;
    checkMissions(true);
    var earned = run.coins + run.bonus;
    save.coins += earned;
    save.totals.coins += earned;
    save.totals.boards += run.boards;
    save.totals.runs += 1;
    save.runs += 1;
    var score = run.score, newBest = score > save.best;
    var prevBest = save.best;
    if (newBest) save.best = score;
    save.bestDist = Math.max(save.bestDist || 0, Math.floor(run.dist));
    // all missions done -> multiplier up
    var levelUp = null;
    if (save.missions.every(function (m) { return m.done; })) {
      var reward = missionReward();
      levelUp = { from: multBase(), to: Math.min(30, multBase() + 1), reward: reward };
      save.coins += reward;
      save.mlevel = Math.min(29, save.mlevel + 1);
      save.missions = newMissionSet(save.mlevel);
    }
    persist();

    var titles = OVER_TITLES[S.reason] || OVER_TITLES.bonk;
    $('overTitle').textContent = Kit.pick(titles);
    $('overScore').textContent = '0';
    $('oCoins').textContent = '+' + Kit.fmt(earned);
    $('oDist').textContent = Kit.fmt(run.dist) + ' m';
    $('oBest').textContent = Kit.fmt(save.best);
    $('newBest').hidden = true;
    $('overPanel').classList.toggle('best', newBest);
    $('oMissions').innerHTML = (levelUp ? [] : save.missions).map(function (m) { return missionRow(m, true); }).join('');
    var lu = $('levelUp');
    if (levelUp) {
      lu.hidden = false;
      lu.innerHTML = '<b>All missions done!</b> Score multiplier <span class="pill">x' + levelUp.from + '</span> → <span class="pill hot">x' + levelUp.to + '</span> and <b>+' + Kit.fmt(levelUp.reward) + '</b> coins';
    } else lu.hidden = true;
    // next unlock teaser
    var goal = nextGoal();
    var ng = $('nextGoal');
    if (goal) {
      ng.hidden = false;
      var have = save.coins, pct = Math.min(1, have / goal.price);
      ng.innerHTML = '<div class="ng-text">' + (have >= goal.price ? '🎉 You can unlock <b>' + goal.name + '</b> in the shop!' : 'Next unlock: <b>' + goal.name + '</b> — ' + Kit.fmt(goal.price - have) + ' coins to go') + '</div><div class="m-bar"><i style="width:' + (pct * 100).toFixed(1) + '%"></i></div>';
    } else ng.hidden = true;
    $('oTotal').textContent = Kit.fmt(save.coins);
    show('over');
    overAnim = { on: true, t: 0, shownAt: performance.now(), score: score, shown: 0, ready: 0.7, newBest: newBest && prevBest > 0, celebrated: false, levelUp: !!levelUp };
    sfx.gameOver();
    setTimeout(function () { if (S.mode === 'over') music.play('menu'); }, 1600);
  }
  function tickOver(dt) {
    var o = overAnim;
    o.t += dt;
    var f = clamp((o.t - 0.25) / 0.9, 0, 1);
    var v = Math.floor(o.score * (1 - Math.pow(1 - f, 3)));
    if (v !== o.shown) {
      o.shown = v;
      $('overScore').textContent = Kit.fmt(v);
      if (Math.random() < 0.5) sfx.countTick(Math.floor(o.t * 20));
    }
    if (f >= 1 && !o.celebrated) {
      o.celebrated = true;
      if (o.newBest && o.score > 0) {
        $('newBest').hidden = false;
        sfx.newBest();
        confetti(160);
      } else if (o.levelUp) {
        sfx.mission();
        confetti(90);
      }
    }
    if (f >= 1 && o.t > 2) o.on = false;
  }
  function nextGoal() {
    var best = null;
    RR.OUTFITS.forEach(function (o) { if (save.owned.indexOf(o.id) < 0 && (!best || o.price < best.price)) best = { name: o.name, price: o.price }; });
    RR.BOARDS.forEach(function (b) { if (save.boards.indexOf(b.id) < 0 && (!best || b.price < best.price)) best = { name: b.name + ' board', price: b.price }; });
    return best;
  }

  /* ----------------------------------------------------- shop */
  var shopTab = 'outfits', preview = null, portraits = null;
  function makePortraits() {
    if (portraits) return;
    portraits = { outfits: {}, boards: {} };
    var pScene = new T.Scene();
    pScene.add(new T.HemisphereLight(0xffffff, 0x8899bb, 2.4));
    var pl = new T.DirectionalLight(0xffffff, 2.2); pl.position.set(0.6, 1, 1.2); pScene.add(pl);
    var pr = RR.createRunner();
    pScene.add(pr.root);
    var pCam = new T.PerspectiveCamera(30, 1, 0.1, 20);
    var dpr = renderer.getPixelRatio(), W = renderer.domElement.width, H = renderer.domElement.height;
    // every portrait goes into one tile of an atlas so we only read the GPU back once
    var jobs = [];
    RR.OUTFITS.forEach(function (o) { jobs.push({ b: 'outfits', o: o }); });
    RR.BOARDS.forEach(function (b) { jobs.push({ b: 'boards', o: b }); });
    var cols = 8, rows = Math.ceil(jobs.length / cols);
    var SZ = Math.max(48, Math.min(160, Math.floor(W / cols), Math.floor(H / rows)));
    var oldClear = new T.Color(); renderer.getClearColor(oldClear);
    var oldAlpha = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 0);
    renderer.setScissorTest(true);
    jobs.forEach(function (j, i) {
      var tx = (i % cols) * SZ, ty = Math.floor(i / cols) * SZ;
      renderer.setViewport(tx / dpr, ty / dpr, SZ / dpr, SZ / dpr);
      renderer.setScissor(tx / dpr, ty / dpr, SZ / dpr, SZ / dpr);
      renderer.clear();
      pr.root.children.forEach(function (c) { c.visible = j.b === 'boards' ? c === pr.board : c !== pr.board; });
      if (j.b === 'outfits') {
        pr.setOutfit(j.o);
        pr.root.rotation.set(0, Math.PI + 0.35, 0);
        pr.animate({ mode: 'idle', phase: 0, dt: 1, vy: 0, time: 0.4, snap: true });
        pCam.position.set(0, 1.25, 4.6); pCam.lookAt(0, 0.95, 0);
      } else {
        pr.setBoard(j.o);
        pr.root.rotation.set(0.5, 0.7, 0.25);
        pCam.position.set(0, 1.7, 3.5); pCam.lookAt(0, 0.1, 0);
      }
      renderer.render(pScene, pCam);
    });
    // one readback of the whole atlas area, then cut it into tiles
    var atlas = document.createElement('canvas');
    atlas.width = cols * SZ; atlas.height = rows * SZ;
    atlas.getContext('2d').drawImage(renderer.domElement, 0, H - rows * SZ, cols * SZ, rows * SZ, 0, 0, cols * SZ, rows * SZ);
    jobs.forEach(function (j, i) {
      var tx = (i % cols) * SZ, row = Math.floor(i / cols);
      var out = document.createElement('canvas'); out.width = out.height = SZ;
      // WebGL rows start at the bottom of the canvas
      out.getContext('2d').drawImage(atlas, tx, (rows - 1 - row) * SZ, SZ, SZ, 0, 0, SZ, SZ);
      portraits[j.b][j.o.id] = out;
    });
    renderer.setScissorTest(false);
    renderer.setClearColor(oldClear, oldAlpha);
    renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
    renderer.render(scene, camera);
  }
  var UP_INFO = {
    magnet: { name: 'Coin Magnet', desc: 'Pulls in every coin nearby' },
    sneakers: { name: 'Super Sneakers', desc: 'Mega jumps onto train roofs' },
    doubler: { name: '2X Score', desc: 'Doubles your score' },
    board: { name: 'Hoverboard', desc: 'Saves you from one crash' }
  };
  function openShop() {
    makePortraits();
    S.menu = 'shop';
    preview = null;
    show('shop');
    renderShop();
  }
  function closeShop() {
    S.menu = 'title';
    runner.setOutfit(outfitById(save.outfit));
    runner.board.visible = false;
    refreshTitle();
    show('title');
  }
  function renderShop() {
    $('sCoins').textContent = Kit.fmt(save.coins);
    document.querySelectorAll('.tab').forEach(function (t) { t.classList.toggle('on', t.getAttribute('data-tab') === shopTab); });
    var html = '';
    if (shopTab === 'outfits' || shopTab === 'boards') {
      var list = shopTab === 'outfits' ? RR.OUTFITS : RR.BOARDS;
      var owned = shopTab === 'outfits' ? save.owned : save.boards;
      var eq = shopTab === 'outfits' ? save.outfit : save.board;
      html = '<div class="grid ' + shopTab + '">' + list.map(function (it) {
        var own = owned.indexOf(it.id) >= 0, isEq = eq === it.id, can = save.coins >= it.price;
        var btn = isEq ? '<span class="tag eq">Wearing</span>' : own ? '<button class="sg-btn small good" data-act="equip" data-id="' + it.id + '">Use</button>' :
          '<button class="sg-btn small' + (can ? '' : ' off') + '" data-act="buy" data-id="' + it.id + '"><canvas data-icon="coin" class="ci" width="64" height="64"></canvas>' + Kit.fmt(it.price) + '</button>';
        if (shopTab === 'boards' && isEq) btn = '<span class="tag eq">Equipped</span>';

        return '<div class="card' + (isEq ? ' eq' : '') + (preview === it.id ? ' sel' : '') + (own ? '' : ' locked') + '" data-id="' + it.id + '">' +
          '<canvas class="portrait" data-portrait="' + shopTab + ':' + it.id + '" width="160" height="160"></canvas><div class="c-name">' + it.name + '</div>' + btn + '</div>';
      }).join('') + '</div>';
    } else {
      html = '<div class="ups">' + POW_ORDER.map(function (k) {
        var lv = save.up[k], max = lv >= 5, cost = max ? 0 : UP_COST[lv], can = save.coins >= cost;
        var pips = ''; for (var i = 0; i < 5; i++) pips += '<i class="' + (i < lv ? 'on' : '') + '"></i>';
        return '<div class="up"><canvas data-icon="' + k + '" width="64" height="64"></canvas><div class="up-body"><div class="up-name">' + UP_INFO[k].name + '</div><div class="up-desc">' + UP_INFO[k].desc + ' · lasts <b>' + powerDur(k) + 's</b></div><div class="pips">' + pips + '</div></div>' +
          (max ? '<span class="tag eq">MAX</span>' : '<button class="sg-btn small' + (can ? '' : ' off') + '" data-act="up" data-id="' + k + '"><canvas data-icon="coin" class="ci" width="64" height="64"></canvas>' + Kit.fmt(cost) + '</button>') + '</div>';
      }).join('') + '</div>';
    }
    $('shopBody').innerHTML = html;
    paintIcons($('shopBody'));
  }
  function shopClick(e) {
    var b = e.target.closest('[data-act]');
    var card = e.target.closest('.card');
    if (b) {
      var act = b.getAttribute('data-act'), id = b.getAttribute('data-id');
      if (act === 'buy') {
        var item = shopTab === 'outfits' ? outfitById(id) : boardById(id);
        if (save.coins < item.price) { sfx.deny(); b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); return; }
        save.coins -= item.price;
        if (shopTab === 'outfits') { save.owned.push(id); save.outfit = id; } else { save.boards.push(id); save.board = id; }
        persist(); sfx.buy(); confetti(50); S.cheer = 1.6;
        previewItem(id);
      } else if (act === 'equip') {
        if (shopTab === 'outfits') save.outfit = id; else save.board = id;
        persist(); sfx.click(); S.cheer = 1.0;
        previewItem(id);
      } else if (act === 'up') {
        var lv = save.up[id], cost = UP_COST[lv];
        if (lv >= 5) return;
        if (save.coins < cost) { sfx.deny(); b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); return; }
        save.coins -= cost; save.up[id] = lv + 1;
        persist(); sfx.buy(); confetti(40);
      }
      renderShop();
      return;
    }
    if (card) { sfx.click(); previewItem(card.getAttribute('data-id')); renderShop(); }
  }
  function previewItem(id) {
    preview = id;
    if (shopTab === 'outfits') { runner.setOutfit(outfitById(id)); runner.board.visible = false; }
    else { runner.setOutfit(outfitById(save.outfit)); runner.setBoard(boardById(id)); runner.board.visible = true; }
    S.cheer = Math.max(S.cheer, 0.8);
  }

  /* ----------------------------------------------------- input */
  var KEYMAP = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', Space: 'up', ArrowDown: 'down', KeyS: 'down' };
  window.addEventListener('keydown', function (e) {
    if (e.repeat) return;
    var code = e.code;
    if (code === 'Space' || code === 'Enter') e.preventDefault();
    if (S.mode === 'play' || S.mode === 'intro') {
      if (code === 'KeyP' || code === 'Escape') { pause(); return; }
      if (KEYMAP[code]) actions.push(KEYMAP[code]);
      return;
    }
    if (S.mode === 'paused') {
      if (code === 'KeyP' || code === 'Escape' || code === 'Enter' || code === 'Space') resume();
      else if (code === 'KeyR') { sfx.click(); startRun(); }
      return;
    }
    if (S.mode === 'over') {
      if (performance.now() - overAnim.shownAt < 650) return;
      if (code === 'Enter' || code === 'Space' || code === 'KeyR') { sfx.click(); startRun(); }
      else if (code === 'Escape') { sfx.click(); goTitle(); }
      return;
    }
    if (S.mode === 'title') {
      if (S.menu === 'shop') {
        if (code === 'Escape') { sfx.click(); closeShop(); }
        return;
      }
      if (S.menu === 'missions') {
        if (code === 'Escape' || code === 'Enter' || code === 'Space') { sfx.click(); closeMissions(); }
        return;
      }
      if (code === 'Enter' || code === 'Space') { sfx.click(); startRun(); }
    }
  });
  // mouse swipe
  var swipe = { on: false, x: 0, y: 0, last: 0 };
  window.addEventListener('pointerdown', function (e) {
    if (S.mode !== 'play' && S.mode !== 'intro') return;
    if (e.button !== 0) return;
    swipe.on = true; swipe.x = e.clientX; swipe.y = e.clientY; swipe.dir = null;
  });
  window.addEventListener('pointermove', function (e) {
    if (!swipe.on) return;
    var dx = e.clientX - swipe.x, dy = e.clientY - swipe.y, th = Math.max(26, window.innerHeight * 0.04);
    var now = performance.now();
    if (now - swipe.last < 150) { swipe.x = e.clientX; swipe.y = e.clientY; return; }
    var dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
    var need = dir === swipe.dir ? th * 3 : th;
    if (Math.abs(dx) > need || Math.abs(dy) > need) {
      swipe.last = now; swipe.dir = dir;
      actions.push(dir);
      swipe.x = e.clientX; swipe.y = e.clientY;
    }
  });
  window.addEventListener('pointerup', function () { swipe.on = false; });
  window.addEventListener('pointercancel', function () { swipe.on = false; });
  document.addEventListener('visibilitychange', function () { if (document.hidden) pause(); });
  window.addEventListener('blur', function () { pause(); });

  function btn(id, fn) {
    $(id).addEventListener('click', function (e) {
      e.stopPropagation();
      sfx.click();
      fn();
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    });
  }
  btn('playBtn', startRun);
  btn('shopBtn', openShop);
  btn('missionsBtn', openMissions);
  btn('mBack', closeMissions);
  btn('sBack', closeShop);
  btn('resumeBtn', resume);
  btn('restartBtn', startRun);
  btn('pMenuBtn', goTitle);
  btn('againBtn', function () { if (performance.now() - overAnim.shownAt > 250) startRun(); });
  btn('oShop', function () { goTitle(); openShop(); });
  btn('oMenu', goTitle);
  $('pauseBtn').addEventListener('click', function (e) { e.stopPropagation(); pause(); this.blur(); });
  $('pauseBtn').addEventListener('pointerdown', function (e) { e.stopPropagation(); });
  document.querySelectorAll('.tab').forEach(function (t) {
    t.addEventListener('click', function () { sfx.click(); shopTab = t.getAttribute('data-tab'); preview = null; runner.setOutfit(outfitById(save.outfit)); runner.board.visible = shopTab === 'boards'; if (shopTab === 'boards') runner.setBoard(boardById(save.board)); renderShop(); });
  });
  $('shopBody').addEventListener('click', shopClick);
  document.querySelectorAll('.sg-btn').forEach(function (b) { b.setAttribute('tabindex', '-1'); b.addEventListener('mouseenter', function () { sfx.hover(); }); });
  function openMissions() { S.menu = 'missions'; refreshMissionsScreen(); show('missions'); }
  function closeMissions() { S.menu = 'title'; refreshTitle(); show('title'); }

  /* ----------------------------------------------------- boot */
  Kit.muteButton();
  makeIcons();
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { makeIcons(); makePickMats(); for (var i = 0; i < pickups.length; i++) pickups[i].s.material = pickMats[pickups[i].type]; });
  }
  resetPlayer(); resetRun();
  layout();
  goTitle();
  camPos.set(-0.7, 2.05, 6.6); camLook.set(-2.05, 1.25, 0);
  Kit.loop(update, render);
  setTimeout(runIdleJobs, 50);
  setTimeout(function () { if (!portraits) makePortraits(); }, 1200);
  var bootMs = Math.round(performance.now() - BOOT_T0);

  // Debug / test hook
  window.__game = {
    get state() {
      return { mode: S.mode, menu: S.menu, score: run.score, dist: Math.floor(run.dist || 0), speed: +S.speed.toFixed(2), coins: run.coins, lane: P.lane, x: +P.x.toFixed(2), y: +P.y.toFixed(2), grounded: P.grounded, roll: P.roll > 0,
        stumble: P.stumbleT > 0, pow: Object.assign({}, POW), obstacles: obstacles.length, coinsActive: coins.length, pickups: pickups.length, calls: renderer.info.render.calls, tris: renderer.info.render.triangles, saveCoins: save.coins, best: save.best, mlevel: save.mlevel, runs: save.runs };
    },
    save: save,
    get bootMs() { return bootMs; },
    get overT() { return overAnim.t; },
    get sceneSize() { return scene.children.length; },
    verts: function () { var n = 0; chunkGeos.forEach(function (z) { z.forEach(function (g) { n += g.main.attributes.position.count + g.win.attributes.position.count; }); }); return n; },
    set god(v) { S.god = !!v; }, get god() { return S.god; },
    set auto(v) { S.auto = !!v; }, get auto() { return S.auto; },
    set autoDelay(v) { S.autoDelay = +v || 0; delayed.length = 0; },
    skip: function (m) { S.pD += m; S.prevPD = S.pD; gen.d = Math.max(gen.d, S.pD + 20); for (var i = obstacles.length - 1; i >= 0; i--) { if (obstacles[i].d0 < S.pD + 15) { freeOb(obstacles[i]); obstacles.splice(i, 1); } } generate(); },
    power: function (k) { if (k === 'mystery') return; POW[k] = powerDur(k); if (k === 'board') runner.board.visible = true; },
    give: function (n) { save.coins += n; persist(); refreshTitle(); },
    crash: function () { crash('bonk'); },
    stumble: function () { stumble(); },
    act: function (a) { actions.push(a); },
    // run n seconds of game time synchronously (no rendering) - for automated tests
    sim: function (sec) {
      var n = Math.round(sec * 60), deaths = 0;
      for (var i = 0; i < n; i++) {
        update(1 / 60);
        if (S.mode === 'over' || S.mode === 'crash') { deaths++; break; }
      }
      return { info: S.crashInfo, stumbles: S.stumbles, mode: S.mode, dist: Math.floor(run.dist || 0), reason: S.reason, speed: +S.speed.toFixed(1), coins: run.coins, jumps: run.jumps, rolls: run.rolls, dodge: run.dodge, roof: Math.floor(run.roof), obstacles: obstacles.length, coinsActive: coins.length, pool: meshPool.length };
    },
    restart: function () { S.hold = false; startRun(); return S.mode; },
    set hold(v) { S.hold = !!v; }, get hold() { return S.hold; },
    force: function (id) { gen.force = id; },
    near: function (kind) { for (var i = 0; i < obstacles.length; i++) { var o = obstacles[i]; if (o.kind === kind || (kind === 'moving' && o.moving)) return { d: +(o.d0 - S.pD).toFixed(1), lane: o.lane, active: o.active }; } return null; },
    last: function () { return { pattern: gen.last, count: gen.count }; },
    tod: function (d) { S.runStart = -d; }
  };
})();
