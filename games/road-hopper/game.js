/*
 * عبور الطريق (Road Hopper) — endless voxel hopper. Original game for the site.
 * World: rows (z = -row) of grass / road / river / rail lanes, generated ahead
 * and recycled behind. Columns -4..4 are playable (x = column).
 */
(function () {
  'use strict';
  var RH = window.RH, THEMES = RH.THEMES, CHARS = RH.CHARS;
  var store = Kit.store('road-hopper'), A = Kit.audio;
  var CHAR_BY = {};
  CHARS.forEach(function (c) { CHAR_BY[c.id] = c; });
  var $ = function (id) { return document.getElementById(id); };

  /* ================================================================ save */
  var save = {
    best: +store.get('best', 0) || 0,
    coins: +store.get('coins', 0) || 0,
    owned: store.get('owned', null),
    sel: store.get('sel', 'chick'),
    stats: store.get('stats', null),
    missions: store.get('missions', null),
    tiers: store.get('tiers', null),
    giftAt: +store.get('giftAt', 0) || 0,
    seen: store.get('seen', null)
  };
  if (!Array.isArray(save.owned)) save.owned = ['chick'];
  save.owned = save.owned.filter(function (id) { return !!CHAR_BY[id]; });
  if (save.owned.indexOf('chick') < 0) save.owned.unshift('chick');
  if (!CHAR_BY[save.sel] || save.owned.indexOf(save.sel) < 0) save.sel = 'chick';
  if (!save.stats || typeof save.stats !== 'object') save.stats = {};
  ['games', 'splash', 'hops', 'coinsAll'].forEach(function (k) { save.stats[k] = +save.stats[k] || 0; });
  if (!save.tiers || typeof save.tiers !== 'object') save.tiers = {};
  if (!save.seen || typeof save.seen !== 'object') save.seen = { chick: 1 };
  function persist() {
    store.set('best', save.best); store.set('coins', save.coins); store.set('owned', save.owned); store.set('sel', save.sel);
    store.set('stats', save.stats); store.set('missions', save.missions); store.set('tiers', save.tiers);
    store.set('giftAt', save.giftAt); store.set('seen', save.seen);
  }
  function has(id) { return save.owned.indexOf(id) >= 0; }

  /* ============================================================ renderer */
  var canvas = $('gl'), renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
  } catch (e) {
    document.body.insertAdjacentHTML('beforeend', '<div class="sg-overlay"><div class="sg-panel"><h1 class="sg-title">عذرًا!</h1><p class="sg-sub">هذا الجهاز لا يدعم الرسوم ثلاثية الأبعاد.</p></div></div>');
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  var scene = new THREE.Scene();
  scene.background = new THREE.Color(THEMES[0].sky);
  var cam = new THREE.OrthographicCamera(-10, 10, 6, -6, 0.1, 90);
  var CAM_OFF = new THREE.Vector3(1.7, 9.6, 9.4);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa6c8, 1.25));
  var sun = new THREE.DirectionalLight(0xffffff, 2.1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  (function (sc) { sc.left = -15; sc.right = 15; sc.top = 15; sc.bottom = -15; sc.near = 1; sc.far = 60; })(sun.shadow.camera);
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.02;
  scene.add(sun); scene.add(sun.target);
  var SUN_OFF = new THREE.Vector3(-9, 11, 3);

  var matVC = new THREE.MeshLambertMaterial({ vertexColors: true });
  var matCoin = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x5a3a00 });
  var matLightOff = new THREE.MeshLambertMaterial({ color: 0x4a4a58 });
  var matLightOn = new THREE.MeshBasicMaterial({ color: 0xff3030 });

  /* ------------------------------------------------ geometry cache/pools */
  var geos = {};
  function geo(key) {
    if (geos[key]) return geos[key];
    var p = key.split(':'), g = null;
    switch (p[0]) {
      case 'lane': g = RH.laneGeo(+p[1], p[2], +p[3]); break;
      case 'veh': g = RH.build(RH.vehicleBoxes(p[1], +p[2])); break;
      case 'log': g = RH.build(RH.logBoxes(+p[1], +p[2])); break;
      case 'pad': g = RH.build(RH.padBoxes(+p[1], p[2] === '1')); break;
      case 'coin': g = RH.build(RH.coinBoxes(p[1] === '1')); break;
      case 'train': g = RH.build(RH.trainBoxes()); break;
      case 'signal': g = RH.build(RH.signalBoxes()); break;
      case 'light': g = RH.build(RH.lightBoxes()); break;
      case 'deco': g = RH.build(RH.treeBoxes(+p[1], p[2])); break;
      case 'char': g = RH.build(CHAR_BY[p[1]].build()); break;
    }
    geos[key] = g;
    return g;
  }
  var pools = {};
  function take(key, mat, cast, recv) {
    var list = pools[key] || (pools[key] = []);
    var m = list.pop();
    if (!m) {
      m = new THREE.Mesh(geo(key), mat || matVC);
      m.castShadow = !!cast; m.receiveShadow = !!recv;
      m.userData.key = key;
      scene.add(m);
    }
    m.visible = true; m.rotation.set(0, 0, 0); m.scale.set(1, 1, 1);
    return m;
  }
  function give(m) { if (!m) return; m.visible = false; pools[m.userData.key].push(m); }

  /* ========================================================= generation */
  var CAR_COLORS = [0xff4b4b, 0x3f7bff, 0x22c55e, 0xa855f7, 0xff8a1f, 0x14c6c6, 0xff5fa8];
  var TRUCK_COLORS = [0x3f7bff, 0xff4b4b, 0x22c55e, 0xff8a1f];
  var VLEN = { car: 1.34, taxi: 1.34, van: 1.74, truck: 2.36, bus: 2.76 };
  var TL = RH.TRAIN_LEN;
  function themeOf(r) { return r < 0 ? 0 : Math.floor(r / 50) % THEMES.length; }
  function diffAt(r) { return Kit.clamp(r / 220, 0, 1); }
  function newGen(base) { return { row: base - 10, base: base, safe: 0, cluster: 'grass', left: 0, riverDir: Math.random() < 0.5 ? 1 : -1, prevType: 'grass' }; }
  function treeKind() { return Math.random() < 0.72 ? (Math.random() < 0.5 ? 'tree1' : 'tree2') : 'rock'; }
  function block(L, c, kind) { L.blocked[c] = kind; L.decor.push({ k: kind, x: c, rot: Kit.randInt(0, 3) }); }
  function outerDecor(L) {
    for (var x = -17; x <= 17; x++) {
      if (x >= -4 && x <= 4) continue;
      var edge = x === -5 || x === 5, p = Math.random();
      if (p < (edge ? 0.6 : 0.3)) L.decor.push({ k: Math.random() < 0.45 ? 'tree2' : 'tree1', x: x, rot: Kit.randInt(0, 3) });
      else if (p < (edge ? 0.68 : 0.36)) L.decor.push({ k: 'rock', x: x, rot: Kit.randInt(0, 3) });
    }
  }
  function wrapX(x) { return ((x + 18) % 36 + 36) % 36 - 18; }

  function chooseCluster(g, rel, d) {
    var prev = g.cluster, c, n;
    if (prev !== 'grass' && Math.random() < 0.72) { c = 'grass'; n = Math.random() < 0.75 ? 1 : 2; }
    else {
      var opts = [['road', 5], ['river', rel > 7 ? 3.2 : 0], ['rail', rel > 16 ? 1.1 + d * 1.6 : 0], ['grass', prev === 'grass' ? 0 : 1]];
      var tot = 0, i;
      for (i = 0; i < opts.length; i++) { if (opts[i][0] === prev) opts[i][1] = 0; tot += opts[i][1]; }
      var pick = Math.random() * tot;
      c = 'road';
      for (i = 0; i < opts.length; i++) { pick -= opts[i][1]; if (pick < 0) { c = opts[i][0]; break; } }
      if (c === 'road') n = Kit.randInt(1, Math.min(5, (rel < 14 ? 2 : 3) + Math.round(d * 2)));
      else if (c === 'river') n = Kit.randInt(1, Math.min(4, (rel < 24 ? 2 : 3) + Math.round(d * 1.4)));
      else if (c === 'rail') n = d > 0.35 && Math.random() < 0.4 ? 2 : 1;
      else n = Kit.randInt(1, 2);
    }
    g.cluster = c; g.left = n;
  }

  function genLane(g) {
    var r = g.row++, rel = r - g.base, d = diffAt(r);
    var L = { row: r, type: 'grass', theme: themeOf(r), variant: r & 1, blocked: {}, decor: [], coin: null, v: 0, dir: 1,
      vehicles: null, logs: null, rail: null, pads: false };
    if (rel <= 4) { // safe start meadow, a wall of trees behind
      var c;
      if (rel <= -3) for (c = -4; c <= 4; c++) block(L, c, treeKind());
      else if (rel !== 0 && rel !== -1) for (c = -4; c <= 4; c++) if (Math.abs(c) >= 2 && Math.random() < 0.2) block(L, c, treeKind());
      outerDecor(L);
      g.safe = 0; g.prevType = 'grass'; g.cluster = 'grass'; g.left = 0;
      return L;
    }
    if (g.left <= 0) chooseCluster(g, rel, d);
    g.left--;
    if (g.cluster === 'road') genRoad(g, L, d, rel);
    else if (g.cluster === 'river') genRiver(g, L, d, rel);
    else if (g.cluster === 'rail') genRail(g, L, d);
    else genGrass(g, L, d, rel);
    g.prevType = L.type;
    return L;
  }
  function genGrass(g, L, d, rel) {
    var ns = Kit.clamp(g.safe + Kit.randInt(-2, 2), -4, 4);
    var lo = Math.min(g.safe, ns), hi = Math.max(g.safe, ns);
    var k = Kit.randInt(1, 2 + Math.round(d * 3));
    for (var i = 0; i < k; i++) {
      var c = Kit.randInt(-4, 4);
      if ((c >= lo && c <= hi) || L.blocked[c]) continue;
      block(L, c, treeKind());
    }
    g.safe = ns;
    if (Math.random() < 0.45) {
      for (var t = 0; t < 6; t++) {
        var cc = Kit.randInt(-4, 4);
        if (!L.blocked[cc]) { L.coin = { c: cc, big: rel > 20 && Math.random() < 0.08 }; break; }
      }
    }
    outerDecor(L);
  }
  function pickCar(rel) {
    if (rel < 10) return 'car';
    var p = Math.random();
    return p < 0.68 ? 'car' : p < 0.84 ? 'taxi' : 'van';
  }
  function genRoad(g, L, d, rel) {
    L.type = 'road';
    L.variant = g.prevType === 'road' ? 1 : 0;
    L.dir = Math.random() < 0.5 ? 1 : -1;
    var heavy = rel > 12 && Math.random() < 0.18 + d * 0.2;
    var speed = (1.5 + Math.random() * 1.3) * (1 + d * 1.25);
    if (heavy) speed *= 0.75;
    var fast = !heavy && rel > 25 && Math.random() < 0.1 + d * 0.12;
    if (fast) speed *= 1.6;
    L.v = speed * L.dir;
    L.fast = fast;
    var vs = [], cur = -18 + Math.random() * 3, minGap = fast ? 5 : 3.4;
    for (var guard = 0; guard < 12; guard++) {
      var t = heavy ? (Math.random() < 0.55 ? 'truck' : 'bus') : pickCar(rel);
      var len = VLEN[t];
      if (cur + len > 18 - minGap) break;
      var col = t === 'truck' ? Kit.pick(TRUCK_COLORS) : t === 'car' ? Kit.pick(CAR_COLORS) : 0;
      vs.push({ t: t, x: cur + len / 2, len: len, col: col, m: null });
      cur += len + minGap + Math.random() * (fast ? 8 : 7.5 - d * 3.5);
    }
    L.vehicles = vs;
    if (Math.random() < 0.15) L.coin = { c: Kit.randInt(-4, 4), big: false };
  }
  function genRiver(g, L, d, rel) {
    L.type = 'river';
    var logs = [], i;
    if (rel > 12 && Math.random() < 0.22) { // lily pads: still, one is always on the safe column
      var cols = {}; cols[g.safe] = 1;
      var extra = Kit.randInt(2, 4);
      for (i = 0; i < extra; i++) cols[Kit.randInt(-4, 4)] = 1;
      for (var c in cols) logs.push({ x: +c, len: 1, pad: true, flower: Math.random() < 0.35, bob: 0, m: null });
      L.v = 0; L.pads = true;
    } else {
      g.riverDir = -g.riverDir; L.dir = g.riverDir;
      L.v = (1.0 + Math.random() * 0.8) * (1 + d * 0.8) * L.dir;
      var avgLen = d < 0.25 ? 3.1 : 2.8, gap = 1.4 + d * 1.3 + Math.random() * 0.6;
      var n = Math.max(3, Math.round(36 / (avgLen + gap))), lens = [], total = 0;
      for (i = 0; i < n; i++) { var ln = d < 0.25 ? Kit.pick([2, 3, 3, 4]) : Kit.pick([2, 2, 3, 3, 4]); lens.push(ln); total += ln; }
      while (36 - total < n * 1.1 && lens.length > 3) total -= lens.pop();
      n = lens.length;
      var free = 36 - total, w = [], ws = 0;
      for (i = 0; i < n; i++) { w.push(0.7 + Math.random() * 0.6); ws += w[i]; }
      var cur = -18 + Math.random() * 3;
      for (i = 0; i < n; i++) {
        logs.push({ x: wrapX(cur + lens[i] / 2), len: lens[i], pad: false, bob: 0, m: null });
        cur += lens[i] + free * w[i] / ws;
      }
      g.safe = Kit.randInt(-3, 3);
    }
    L.logs = logs;
  }
  function genRail(g, L, d) {
    L.type = 'rail';
    L.dir = Math.random() < 0.5 ? 1 : -1;
    L.rail = { phase: 'wait', t: 1 + Math.random() * 4, x: 0, warn: 1.5 - d * 0.4, speed: 30 + d * 8, bell: 0 };
  }

  /* ========================================================= lane objects */
  var lanes = {}, laneMin = 0, laneMax = -1, decoDirty = true;
  function addLane(L) {
    var th = L.theme, z = -L.row, i;
    var variant = (L.type === 'grass' || L.type === 'road') ? L.variant : 0;
    L.mesh = take('lane:' + th + ':' + L.type + ':' + variant, matVC, false, true);
    L.mesh.position.set(0, 0, z);
    if (L.vehicles) for (i = 0; i < L.vehicles.length; i++) {
      var v = L.vehicles[i];
      v.m = take('veh:' + v.t + ':' + v.col, matVC, true, false);
      v.m.position.set(v.x, -0.02, z);
      v.m.rotation.y = L.dir > 0 ? 0 : Math.PI;
    }
    if (L.logs) for (i = 0; i < L.logs.length; i++) {
      var o = L.logs[i];
      o.m = take(o.pad ? 'pad:' + th + ':' + (o.flower ? 1 : 0) : 'log:' + th + ':' + o.len, matVC, true, true);
      o.m.position.set(o.x, 0, z);
      if (o.pad) o.m.rotation.y = Kit.randInt(0, 3) * Math.PI / 2;
    }
    if (L.rail) {
      L.sig = take('signal', matVC, true, false); L.sig.position.set(-5.3, 0, z + 0.45);
      L.light = take('light', matLightOff, false, false); L.light.position.set(-5.3, 0, z + 0.45); L.light.material = matLightOff;
      L.train = take('train', matVC, true, false); L.train.visible = false;
      L.train.rotation.y = L.dir > 0 ? 0 : Math.PI; L.train.position.set(0, 0.1, z);
    }
    if (L.coin) {
      L.coin.m = take('coin:' + (L.coin.big ? 1 : 0), matCoin, true, false);
      L.coin.m.position.set(L.coin.c, 0.45, z);
    }
    lanes[L.row] = L;
    decoDirty = true;
  }
  function removeLane(L) {
    var i;
    give(L.mesh);
    if (L.vehicles) for (i = 0; i < L.vehicles.length; i++) give(L.vehicles[i].m);
    if (L.logs) for (i = 0; i < L.logs.length; i++) give(L.logs[i].m);
    if (L.rail) { give(L.sig); give(L.light); give(L.train); }
    if (L.coin && L.coin.m) give(L.coin.m);
    delete lanes[L.row];
    decoDirty = true;
  }

  // Scenery (trees, rocks...) uses one InstancedMesh per theme+kind.
  var decoIM = {}, DECO_CAP = 420;
  var _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _up = new THREE.Vector3(0, 1, 0);
  function rebuildDeco() {
    var k;
    for (k in decoIM) decoIM[k].count = 0;
    for (var r = laneMin; r <= laneMax; r++) {
      var L = lanes[r];
      if (!L) continue;
      for (var i = 0; i < L.decor.length; i++) {
        var d = L.decor[i], key = 'deco:' + L.theme + ':' + d.k, im = decoIM[key];
        if (!im) {
          im = new THREE.InstancedMesh(geo(key), matVC, DECO_CAP);
          im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; im.count = 0;
          scene.add(im); decoIM[key] = im;
        }
        if (im.count >= DECO_CAP) continue;
        _q.setFromAxisAngle(_up, (L.theme === 4 && d.k === 'tree2' ? 0 : d.rot) * Math.PI / 2); _p.set(d.x, 0, -r);
        _m4.compose(_p, _q, _s);
        im.setMatrixAt(im.count++, _m4);
      }
    }
    for (k in decoIM) { decoIM[k].instanceMatrix.needsUpdate = true; decoIM[k].visible = decoIM[k].count > 0; }
    decoDirty = false;
  }

  /* ============================================================ player */
  var HOP = 0.12;
  var P = { x: 0, y: 0, z: 0, row: 0, dead: false, kind: '', hop: null, log: null, rel: 0, queue: null, sq: 0, face: 0,
    vel: new THREE.Vector3(), spin: 0, idle: 1.5, jump: 0 };
  var pGroup = new THREE.Group(); scene.add(pGroup);
  var pBody = new THREE.Mesh(geo('char:' + save.sel), matVC);
  pBody.castShadow = true; pGroup.add(pBody); pGroup.scale.setScalar(1.18);
  function setCharModel(id) { pBody.geometry = geo('char:' + id); }
  function charColor() { return CHAR_BY[save.sel].color; }

  // Eagle
  var eagle = new THREE.Group(), ep = RH.eagleParts();
  var eBody = new THREE.Mesh(RH.build(ep.body), matVC); eBody.castShadow = true; eagle.add(eBody);
  var wingGeo = RH.build(ep.wing);
  var wR = new THREE.Mesh(wingGeo, matVC), wL = new THREE.Mesh(wingGeo, matVC);
  wR.position.set(0.3, 0.1, 0); wL.position.set(-0.3, 0.1, 0); wL.scale.x = -1;
  wR.castShadow = wL.castShadow = true;
  eagle.add(wR); eagle.add(wL);
  eagle.rotation.y = Math.PI; eagle.scale.setScalar(1.3); eagle.visible = false;
  scene.add(eagle);
  var E = null;

  // Best-score marker: a glowing line across the play area plus a sign.
  var bestLine = new THREE.Mesh(new THREE.BoxGeometry(9, 0.04, 0.14), new THREE.MeshBasicMaterial({ color: 0xffd23f }));
  var signCanvas = document.createElement('canvas'); signCanvas.width = 256; signCanvas.height = 128;
  var signTex = new THREE.CanvasTexture(signCanvas);
  signTex.colorSpace = THREE.SRGBColorSpace;
  var bestSign = new THREE.Sprite(new THREE.SpriteMaterial({ map: signTex, depthTest: false }));
  bestSign.renderOrder = 5;
  bestSign.scale.set(1.9, 0.95, 1); bestSign.center.set(0.5, 0);
  var bestMark = new THREE.Group(); bestMark.add(bestLine); bestMark.add(bestSign);
  bestLine.position.set(0, 0.03, 0); bestSign.position.set(-4.4, 1.25, 0);
  bestMark.visible = false; scene.add(bestMark);
  function drawSign(n) {
    var c = signCanvas.getContext('2d');
    c.clearRect(0, 0, 256, 128);
    c.fillStyle = '#1b2150'; roundRect(c, 8, 8, 240, 96, 26); c.fill();
    c.fillStyle = '#ffd23f'; roundRect(c, 16, 16, 224, 80, 20); c.fill();
    c.fillStyle = '#1b2150'; c.beginPath(); c.moveTo(112, 104); c.lineTo(144, 104); c.lineTo(128, 124); c.fill();
    c.fillStyle = '#1b2150'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.direction = 'rtl'; c.font = '700 38px Fredoka';
    c.fillText('الأفضل ' + n, 128, 58);
    signTex.needsUpdate = true;
  }
  function roundRect(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r); c.lineTo(x + w, y + h - r);
    c.quadraticCurveTo(x + w, y + h, x + w - r, y + h); c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
  }
  function placeBestMark() {
    bestMark.visible = save.best > 0;
    if (!bestMark.visible) return;
    drawSign(save.best);
    bestMark.position.set(0, 0, -save.best - 0.5);
  }

  /* ========================================================== particles */
  var PMAX = 240, parts = [], pNext = 0;
  var pIM = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), PMAX);
  pIM.frustumCulled = false; pIM.count = 0; pIM.castShadow = false;
  var _col = new THREE.Color();
  for (var pi = 0; pi < PMAX; pi++) {
    parts.push({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, s: 0.1, c: new THREE.Color(), g: 18, floor: 0 });
    pIM.setColorAt(pi, _col.set(0xffffff));
  }
  scene.add(pIM);
  function burst(x, y, z, n, colors, o) {
    o = o || {};
    for (var i = 0; i < n; i++) {
      var p = null;
      for (var j = 0; j < PMAX; j++) { var q = parts[(pNext + j) % PMAX]; if (!q.on) { p = q; pNext = (pNext + j + 1) % PMAX; break; } }
      if (!p) { p = parts[pNext]; pNext = (pNext + 1) % PMAX; }
      var a = Math.random() * Math.PI * 2, sp = (o.speed || 3) * (0.35 + Math.random() * 0.65);
      p.on = true; p.x = x; p.y = y; p.z = z;
      p.vx = Math.cos(a) * sp; p.vz = Math.sin(a) * sp; p.vy = (o.up || 3) * (0.5 + Math.random() * 0.7);
      p.life = p.max = (o.life || 0.6) * (0.7 + Math.random() * 0.5);
      p.s = (o.size || 0.12) * (0.6 + Math.random() * 0.7);
      p.g = o.grav == null ? 18 : o.grav;
      p.floor = o.floor == null ? -0.3 : o.floor;
      p.c.set(colors[i % colors.length]);
    }
  }
  function updateParts(dt) {
    var k = 0;
    for (var i = 0; i < PMAX; i++) {
      var p = parts[i];
      if (!p.on) continue;
      p.life -= dt;
      if (p.life <= 0) { p.on = false; continue; }
      p.vy -= p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < p.floor) { p.y = p.floor; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; }
      var sc = p.s * Math.min(1, (p.life / p.max) * 2.2);
      _p.set(p.x, p.y, p.z); _s.set(sc, sc, sc); _q.set(0, 0, 0, 1);
      _m4.compose(_p, _q, _s);
      pIM.setMatrixAt(k, _m4); pIM.setColorAt(k, p.c);
      k++;
    }
    _s.set(1, 1, 1);
    pIM.count = k;
    pIM.instanceMatrix.needsUpdate = true;
    if (pIM.instanceColor) pIM.instanceColor.needsUpdate = true;
  }
  function clearParts() { for (var i = 0; i < PMAX; i++) parts[i].on = false; pIM.count = 0; }

  /* ============================================================== sound */
  var S = {
    hop: function () {
      var c = CHAR_BY[save.sel].snd, f = c[0] * (0.94 + Math.random() * 0.12);
      A.tone({ freq: f, to: f * 1.6, type: c[1], dur: 0.07, vol: c[1] === 'sine' ? 0.2 : 0.1 });
    },
    land: function () { A.tone({ freq: 150, to: 90, type: 'triangle', dur: 0.05, vol: 0.18 }); },
    bump: function () { A.tone({ freq: 190, to: 110, type: 'triangle', dur: 0.09, vol: 0.3 }); A.noise({ dur: 0.05, vol: 0.08, filter: 700 }); },
    log: function () { A.tone({ freq: 240, to: 150, type: 'triangle', dur: 0.08, vol: 0.3 }); A.noise({ dur: 0.06, vol: 0.08, filter: 900 }); },
    pad: function () { A.tone({ freq: 300, to: 560, type: 'sine', dur: 0.12, vol: 0.25 }); },
    splash: function () { A.noise({ dur: 0.55, vol: 0.35, filter: 3200, to: 300 }); A.tone({ freq: 720, to: 160, type: 'sine', dur: 0.35, vol: 0.28 }); },
    squash: function () {
      A.noise({ dur: 0.2, vol: 0.35, filter: 1600, to: 200 });
      A.tone({ freq: 240, to: 55, type: 'sawtooth', dur: 0.22, vol: 0.2 });
      A.tone({ freq: 392, type: 'square', dur: 0.13, vol: 0.1, delay: 0.08 }); A.tone({ freq: 494, type: 'square', dur: 0.15, vol: 0.1, delay: 0.08 });
    },
    bell: function () { A.tone({ freq: 1560, type: 'triangle', dur: 0.12, vol: 0.13 }); A.tone({ freq: 1170, type: 'triangle', dur: 0.1, vol: 0.06, delay: 0.01 }); },
    train: function () {
      A.noise({ dur: 1.2, vol: 0.28, filter: 900, to: 150 });
      A.tone({ freq: 523, to: 494, type: 'square', dur: 0.6, vol: 0.07 }); A.tone({ freq: 659, to: 622, type: 'square', dur: 0.6, vol: 0.07 });
    },
    boom: function () { A.noise({ dur: 0.6, vol: 0.45, filter: 1400, to: 80 }); A.tone({ freq: 300, to: 60, type: 'sawtooth', dur: 0.35, vol: 0.2 }); },
    eagle: function () { A.tone({ freq: 1500, to: 850, type: 'sawtooth', dur: 0.5, vol: 0.12 }); A.tone({ freq: 1900, to: 1100, type: 'square', dur: 0.4, vol: 0.05, delay: 0.06 }); },
    warn: function () { A.tone({ freq: 880, type: 'square', dur: 0.06, vol: 0.08 }); },
    near: function () { A.noise({ dur: 0.25, vol: 0.22, filter: 3000, to: 400 }); A.tone({ freq: 700, to: 1100, type: 'sine', dur: 0.12, vol: 0.12 }); },
    mission: function () { [660, 880, 1175].forEach(function (f, i) { A.tone({ freq: f, type: 'square', dur: 0.1, vol: 0.13, delay: i * 0.08 }); }); },
    crank: function () { for (var i = 0; i < 6; i++) A.tone({ freq: 300 + i * 40, type: 'square', dur: 0.03, vol: 0.12, delay: i * 0.12 }); }
  };

  /* ============================================================== state */
  var state = 'title', prevScreen = 'title', time = 0;
  var gen = null, base = 0, score = 0, maxRow = 0, runCoins = 0, runReward = 0, autoRow = 0, started = false, runStats = null;
  var bestAtStart = 0, bestAnnounced = false, milestoneNext = 25, lastTheme = 0, deathT = 0, overT = 0, warnT = 0, nearRec = null;
  var godMode = false, shakeP = 0, newBestRun = false;
  var TIPS = { road: 'انتظر حتى تمرّ السيارات، ثم اقفز!', river: 'قف على الجذوع… الماء خطر!', rail: 'الضوء الأحمر يعني أن القطار قادم!' };
  var tipsSeen = {}, tipT = 0, tipRuns = +store.get('tipRuns', 0) || 0;
  function showTip(kind) {
    if (tipRuns >= 3 || tipsSeen[kind]) return;
    tipsSeen[kind] = 1;
    var h = $('hint');
    h.textContent = TIPS[kind]; h.hidden = false; tipT = 3;
  }
  var camX = 0, camZ = 0, camMode = 1;
  var _look = new THREE.Vector3(), _v = new THREE.Vector3(), skyCol = new THREE.Color(THEMES[0].sky), _skyT = new THREE.Color();

  function resetWorld(b) {
    base = b || 0;
    Object.keys(lanes).forEach(function (r) { removeLane(lanes[r]); });
    lanes = {};
    gen = newGen(base);
    laneMin = base - 10; laneMax = base - 11;
    while (laneMax < base + 22) { var L = genLane(gen); addLane(L); laneMax = L.row; }
    P.x = 0; P.row = base; P.y = 0; P.z = -base; P.dead = false; P.kind = ''; P.hop = null; P.log = null; P.queue = null; P.sq = 0; P.face = 0; P.jump = 0;
    pGroup.position.set(0, 0, -base); pGroup.rotation.set(0, 0, 0); pGroup.visible = true;
    pBody.position.set(0, 0, 0); pBody.scale.set(1, 1, 1); pBody.rotation.set(0, 0, 0);
    setCharModel(save.sel);
    score = base; maxRow = base; runCoins = 0; runReward = 0; autoRow = base; started = false;
    runStats = { coins: 0, rivers: 0, roads: 0, rails: 0, hops: 0, logs: 0, near: 0 };
    bestAtStart = save.best; bestAnnounced = false; newBestRun = false;
    milestoneNext = (Math.floor(base / 25) + 1) * 25; lastTheme = themeOf(base);
    eagle.visible = false; E = null; clearParts(); nearRec = null; warnT = 0; shakeP = 0;
    tipsSeen = {}; tipT = 0;
    $('hint').innerHTML = HINT_HTML;
    camX = 0; camZ = -base;
    skyCol.set(THEMES[themeOf(base)].sky);
    decoDirty = true;
    rotateMissions();
    setWarn(false);
    placeBestMark();
  }
  function maintainLanes() {
    var focus = Math.floor(Math.max(autoRow, P.row));
    while (laneMax < focus + 22) { var L = genLane(gen); addLane(L); laneMax = L.row; }
    while (laneMin < focus - 10) { if (lanes[laneMin]) removeLane(lanes[laneMin]); laneMin++; }
  }

  function wrapObj(o) { if (o.x - o.len / 2 > 18) o.x -= 36; else if (o.x + o.len / 2 < -18) o.x += 36; }
  function updateLanes(dt) {
    for (var r = laneMin; r <= laneMax; r++) {
      var L = lanes[r], i;
      if (!L) continue;
      if (L.vehicles) for (i = 0; i < L.vehicles.length; i++) {
        var v = L.vehicles[i];
        v.x += L.v * dt; wrapObj(v); v.m.position.x = v.x;
      }
      if (L.logs) for (i = 0; i < L.logs.length; i++) {
        var o = L.logs[i];
        if (L.v) { o.x += L.v * dt; wrapObj(o); }
        o.m.position.x = o.x;
        if (o.bob > 0) { o.bob = Math.max(0, o.bob - dt * 4); o.m.position.y = -Math.sin(o.bob * Math.PI) * 0.07; }
        else o.m.position.y = Math.sin(time * 2 + o.x * 0.3 + r) * 0.012;
      }
      if (L.rail) updateRail(L, dt);
      if (L.coin && L.coin.m) {
        L.coin.m.rotation.y = time * 3 + r;
        L.coin.m.position.y = 0.45 + Math.sin(time * 4 + r) * 0.06;
      }
    }
  }
  function updateRail(L, dt) {
    var R = L.rail, near = state === 'play' && Math.abs(L.row - P.row) <= 6;
    if (R.phase === 'wait') {
      R.t -= dt;
      if (R.t <= 0) { R.phase = 'warn'; R.t = R.warn; R.bell = 0; }
    } else if (R.phase === 'warn') {
      R.t -= dt; R.bell -= dt;
      if (R.bell <= 0) { R.bell = 0.3; if (near) S.bell(); }
      if (R.t <= 0) {
        R.phase = 'go'; R.x = -L.dir * (18 + TL / 2);
        L.train.visible = true; L.train.position.x = R.x;
        if (near) { S.train(); shake(0.12); }
      }
    } else {
      R.x += L.dir * R.speed * dt;
      L.train.position.x = R.x;
      if (R.x * L.dir > 18 + TL / 2) {
        R.phase = 'wait'; R.t = (2.5 + Math.random() * 4) * (1 - diffAt(L.row) * 0.3);
        L.train.visible = false;
      }
    }
    L.light.material = (R.phase !== 'wait' && Math.floor(time * 7) % 2 === 0) ? matLightOn : matLightOff;
  }

  /* ---------------------------------------------------------- movement */
  function surfaceY(L, carrier) {
    if (!L) return 0;
    if (L.type === 'road') return -0.02;
    if (L.type === 'rail') return 0.03;
    if (L.type === 'river') {
      if (!carrier) return -0.3;
      if (carrier.pad) return L.theme === 2 ? -0.08 : -0.21;
      return L.theme === 4 ? 0.1 : 0.06;
    }
    return 0;
  }
  function findCarrier(L, x, t) {
    var best = null, bd = 1e9, bpx = 0;
    for (var i = 0; i < L.logs.length; i++) {
      var o = L.logs[i], px = o.x + L.v * t, dd = Math.abs(x - px);
      if (dd <= o.len / 2 + 0.3 && dd < bd) { bd = dd; best = o; bpx = px; }
    }
    if (!best) return null;
    var half = best.len / 2, cell = Kit.clamp(Math.round(x - bpx + half - 0.5), 0, best.len - 1);
    return { o: best, rel: cell - half + 0.5 };
  }
  function faceDir(dx, dr) { P.face = dr > 0 ? 0 : dr < 0 ? Math.PI : dx > 0 ? -Math.PI / 2 : Math.PI / 2; }
  function bump() {
    P.sq = 0.7; S.bump();
    burst(P.x, P.y + 0.1, P.z, 4, ['#ffffff', '#dddddd'], { speed: 1.5, up: 2, size: 0.08, life: 0.3 });
  }
  function tryHop(dx, dr) {
    if (state !== 'play' || P.dead) return;
    if (P.hop) { if (P.hop.t > 0.2) P.queue = [dx, dr]; return; }
    faceDir(dx, dr);
    var row1 = P.row + dr, L1 = lanes[row1], L0 = lanes[P.row];
    if (!L1) { bump(); return; }
    var v0 = P.log ? L0.v : 0, x1, target = null, rel = 0;
    if (dr === 0 && P.log) x1 = P.x + dx + v0 * HOP;
    else if (dr === 0) x1 = Math.round(P.x) + dx;
    else x1 = P.x + v0 * HOP;
    if (L1.type === 'river') {
      var f = findCarrier(L1, x1, HOP);
      if (f) { target = f.o; rel = f.rel; }
    } else {
      x1 = Math.round(x1);
      if (x1 < -4 || x1 > 4) {
        if (dr === 0 || !P.log) { bump(); return; }
        x1 = Kit.clamp(x1, -4, 4);
      }
      if (L1.type === 'grass' && L1.blocked[x1]) { bump(); return; }
    }
    P.hop = { t: 0, x0: P.x, v0: v0, x1: x1, row0: P.row, row1: row1, target: target, rel: rel, y0: P.y, y1: surfaceY(L1, target) };
    P.log = null;
    if (!started) { started = true; if (tipT <= 0) $('hint').hidden = true; }
    S.hop();
    runStats.hops++; save.stats.hops++;
    missionEvent('hops', 1);
    if (L0 && L0.type === 'road' && dr !== 0) nearRec = { row: P.row, x: Math.round(P.x), t: 0.45 };
  }
  function land() {
    var h = P.hop, L = lanes[h.row1];
    P.hop = null; P.row = h.row1; P.z = -P.row;
    if (!L) return;
    if (L.type === 'river') {
      if (!h.target) { P.x = h.x1; die('water'); return; }
      P.log = h.target; P.rel = h.rel; P.x = P.log.x + P.rel; P.y = h.y1;
      P.log.bob = 1;
      if (P.log.pad) S.pad(); else S.log();
      runStats.logs++; missionEvent('logs', 1);
      burst(P.x, 0, P.z, 6, ['#ffffff', '#bfeaff'], { speed: 1.6, up: 2.5, size: 0.08, life: 0.35, floor: -0.28 });
    } else {
      P.log = null; P.x = Math.round(h.x1); P.y = h.y1;
      S.land();
      var dc = L.type === 'grass' ? RH.shade(L.variant ? THEMES[L.theme].g2 : THEMES[L.theme].g1, 0.85) : 0xcfcfd6;
      burst(P.x, P.y + 0.02, P.z, 5, [dc, 0xffffff], { speed: 1.4, up: 1.6, size: 0.08, life: 0.3, floor: P.y });
    }
    P.sq = 1;
    var ahead = lanes[P.row + 1];
    if (ahead && TIPS[ahead.type]) showTip(ahead.type);
    if (L.coin && L.coin.m && Math.abs(L.coin.c - P.x) < 0.55) collectCoin(L);
    if (P.row > maxRow) {
      for (var r = maxRow; r < P.row; r++) {
        var LL = lanes[r];
        if (!LL) continue;
        if (LL.type === 'river') { runStats.rivers++; missionEvent('rivers', 1); }
        else if (LL.type === 'road') { runStats.roads++; missionEvent('roads', 1); }
        else if (LL.type === 'rail') { runStats.rails++; missionEvent('rails', 1); }
      }
      maxRow = P.row; score = maxRow;
      missionEvent('score', score, true);
      onProgress();
    }
    if (P.queue) { var q = P.queue; P.queue = null; tryHop(q[0], q[1]); }
  }
  var HINT_HTML = document.getElementById('hint').innerHTML;
  var MILESTONE_WORDS = ['رائع!', 'ممتاز!', 'مذهل!', 'خارق!', 'أسطوري!'];
  function onProgress() {
    updateHUD();
    var th = themeOf(maxRow), newWorld = false;
    if (th !== lastTheme) {
      lastTheme = th; newWorld = true;
      showBanner('عالم جديد!', THEMES[th].name);
      Kit.sfx.power(); confetti(40);
    }
    if (maxRow >= milestoneNext) {
      if (!newWorld) {
        var w = MILESTONE_WORDS[Math.min(MILESTONE_WORDS.length - 1, Math.floor(milestoneNext / 25) - 1)];
        popup(milestoneNext + '', P.x, 1.6, P.z, 'big');
        popup(w, P.x, 2.4, P.z, 'gold');
        A.tone({ freq: 784, type: 'square', dur: 0.08, vol: 0.12 }); A.tone({ freq: 1047, type: 'square', dur: 0.14, vol: 0.12, delay: 0.08 });
      }
      milestoneNext += 25;
    }
    if (!bestAnnounced && bestAtStart > 0 && score > bestAtStart) {
      bestAnnounced = true;
      popup('رقم قياسي جديد!', P.x, 2.0, P.z, 'big');
      Kit.sfx.power(); confetti(70);
    }
  }
  function collectCoin(L) {
    var c = L.coin, val = c.big ? 5 : 1;
    give(c.m); c.m = null;
    runCoins += val; save.coins += val; save.stats.coinsAll += val;
    store.set('coins', save.coins);
    Kit.sfx.coin();
    burst(c.c, 0.5, -L.row, 10, c.big ? [0x7ff0ff, 0xffffff, 0x3fb8e0] : [0xffd23f, 0xfff3a0, 0xff9f1a], { speed: 2.6, up: 4, size: 0.1, life: 0.5 });
    popup('+' + val, c.c, 1.0, -L.row, 'gold');
    updateHUD(true);
    missionEvent('coinsRun', runCoins, true);
  }

  function collide() {
    if (godMode || P.dead) return;
    var h = P.hop, cr = h ? (h.t < 0.5 ? h.row0 : h.row1) : P.row, L = lanes[cr];
    if (!L) return;
    if (L.type === 'road') {
      for (var i = 0; i < L.vehicles.length; i++) {
        var v = L.vehicles[i];
        if (Math.abs(v.x - P.x) < v.len / 2 + 0.2) { die('car', L); return; }
      }
    } else if (L.type === 'rail' && L.rail.phase === 'go' && Math.abs(L.rail.x - P.x) < TL / 2 + 0.2) die('train', L);
  }

  var honkCD = 0;
  function honkCheck(dt) {
    honkCD -= dt;
    var L = lanes[P.row];
    if (P.dead || !L || L.type !== 'road' || honkCD > 0) return;
    for (var i = 0; i < L.vehicles.length; i++) {
      var v = L.vehicles[i], dx = (P.x - v.x) * (L.v > 0 ? 1 : -1);
      if (dx > v.len / 2 && dx < v.len / 2 + 2.2) {
        honkCD = 1.2;
        var f = v.t === 'truck' || v.t === 'bus' ? 220 : v.t === 'van' ? 523 : 392;
        A.tone({ freq: f, type: 'square', dur: 0.16, vol: 0.07 }); A.tone({ freq: f * 1.26, type: 'square', dur: 0.16, vol: 0.07 });
        return;
      }
    }
  }
  function updatePlayer(dt) {
    if (P.dead) { updateDeath(dt); return; }
    P.sq = Math.max(0, P.sq - dt * 7);
    if (P.hop) {
      var h = P.hop;
      h.t += dt / HOP;
      var k = Math.min(1, h.t);
      h.x0 += h.v0 * dt;
      var x1 = h.target ? h.target.x + h.rel : h.x1;
      P.x = h.x0 + (x1 - h.x0) * k;
      P.z = -(h.row0 + (h.row1 - h.row0) * k);
      P.y = h.y0 + (h.y1 - h.y0) * k + Math.sin(k * Math.PI) * (h.row1 === h.row0 ? 0.3 : 0.42);
      if (h.t >= 1) { if (h.target) P.x = x1; land(); }
    } else if (P.log) {
      var L = lanes[P.row];
      P.x = P.log.x + P.rel;
      P.y = surfaceY(L, P.log) - Math.sin(P.log.bob * Math.PI) * 0.07;
      if (Math.abs(P.x) > 5.4 && !godMode) { die('drift'); return; }
    }
    collide();
    honkCheck(dt);
    if (nearRec && !P.dead) {
      nearRec.t -= dt;
      var NL = lanes[nearRec.row];
      if (nearRec.t <= 0 || !NL) nearRec = null;
      else if (P.row !== nearRec.row || (P.hop && P.hop.t >= 0.5)) {
        for (var i = 0; i < NL.vehicles.length; i++) {
          var v = NL.vehicles[i];
          if (Math.abs(v.x - nearRec.x) < v.len / 2 + 0.15) {
            popup('في آخر لحظة!', P.x, 1.5, P.z, 'pink'); S.near();
            runStats.near++; missionEvent('near', 1);
            nearRec = null; break;
          }
        }
      }
    }
  }

  /* ------------------------------------------------------------- death */
  var REASONS = { car: 'صرت فطيرة مسطّحة!', train: 'القطار كان أسرع منك!', water: 'سقطت في الماء!', drift: 'جرفك النهر بعيدًا!', eagle: 'خطفك النسر!' };
  function die(kind, L) {
    if (P.dead) return;
    P.dead = true; P.kind = kind; deathT = 0; state = 'dying'; P.queue = null; nearRec = null;
    setWarn(false);
    var cc = charColor();
    if (kind === 'car') {
      P.hop = null; P.log = null; P.y = surfaceY(L) + 0.01; P.z = -Math.round(-P.z);
      S.squash(); shake(0.35);
      burst(P.x, 0.3, P.z, 18, [cc, '#ffffff', '#ffd23f'], { speed: 3.5, up: 4, size: 0.12, life: 0.7 });
    } else if (kind === 'train') {
      P.hop = null; P.vel.set(L.dir * 15, 8, -1); P.spin = 14;
      S.boom(); shake(0.7);
      burst(P.x, 0.4, P.z, 22, [cc, '#ffffff', '#ff4b4b'], { speed: 5, up: 6, size: 0.14, life: 0.8 });
    } else if (kind === 'water' || kind === 'drift') {
      P.hop = null; P.log = null;
      S.splash(); shake(0.15);
      burst(P.x, -0.2, P.z, 26, ['#ffffff', '#bfeaff', '#6fd0ff'], { speed: 2.6, up: 6.5, size: 0.13, life: 0.8, floor: -0.35 });
      save.stats.splash++;
    } else if (kind === 'eagle') {
      P.hop = null;
      E = { t: 0, phase: 0, sx: P.x, sy: 9, sz: P.z - 13 };
      eagle.visible = true; eagle.position.set(E.sx, E.sy, E.sz);
      S.eagle();
    }
  }
  function updateDeath(dt) {
    deathT += dt;
    var k = P.kind;
    if (k === 'car') {
      var s = Math.min(1, deathT / 0.08);
      pBody.scale.set(1 + 0.5 * s, 1 - 0.86 * s, 1 + 0.5 * s);
    } else if (k === 'train') {
      P.x += P.vel.x * dt; P.y += P.vel.y * dt; P.z += P.vel.z * dt; P.vel.y -= 22 * dt;
      pBody.rotation.x += P.spin * dt; pBody.rotation.z += P.spin * 0.7 * dt;
    } else if (k === 'water' || k === 'drift') {
      P.y -= dt * 1.4;
      if (deathT > 0.4) pGroup.visible = false;
    } else if (k === 'eagle') updateEagle(dt);
    if (deathT > (k === 'eagle' ? 2.1 : 1.25)) gameOver();
  }
  function updateEagle(dt) {
    E.t += dt;
    var flap = Math.sin(time * 16) * 0.55;
    wR.rotation.z = flap; wL.rotation.z = -flap;
    if (E.phase === 0) {
      var k = Math.min(1, E.t / 0.6), e = k * k;
      eagle.position.set(E.sx + (P.x - E.sx) * e, E.sy + (1.35 - E.sy) * e, E.sz + (P.z - E.sz) * e);
      if (k >= 1) {
        E.phase = 1; E.t = 0; shake(0.3); Kit.sfx.whoosh();
        burst(P.x, 0.6, P.z, 14, ['#8a5a33', '#ffffff', '#6b4426'], { speed: 3, up: 4, size: 0.12, life: 0.7 });
      }
    } else {
      eagle.position.x += 3.5 * dt; eagle.position.y += 7 * dt; eagle.position.z += 6 * dt;
      P.x = eagle.position.x; P.y = eagle.position.y - 1.25; P.z = eagle.position.z;
      pBody.rotation.z = Math.sin(time * 20) * 0.3;
    }
  }

  /* ============================================================= camera */
  function shake(p) { shakeP = Math.max(shakeP, p); }
  function titleLike() { return state === 'title' || ((state === 'chars' || state === 'machine') && prevScreen === 'title'); }
  function updateCamera(dt) {
    var tm = titleLike() ? 1 : 0;
    camMode += (tm - camMode) * Math.min(1, dt * 3.5);
    var focusRow = state === 'title' ? P.row : Math.max(autoRow, P.row - 3.2);
    if (P.dead) focusRow = Math.max(autoRow, P.row - 3.2);
    var tz = -focusRow - 2.3 + camMode * 1.6;
    camZ += (tz - camZ) * Math.min(1, dt * 5);
    var tx = Kit.clamp(P.x * 0.45, -2.2, 2.2) + camMode * 3.3;
    camX += (tx - camX) * Math.min(1, dt * 4);
    shakeP = Math.max(0, shakeP - dt * 1.4);
    var th = themeOf(Math.floor(-camZ));
    _skyT.set(THEMES[th].sky);
    skyCol.lerp(_skyT, Math.min(1, dt * 1.5));
  }
  function applyCamera() {
    _look.set(camX, 0, camZ);
    var sp = shakeP * shakeP * 2.2;
    cam.position.copy(_look).add(CAM_OFF);
    cam.position.x += (Math.random() - 0.5) * sp; cam.position.y += (Math.random() - 0.5) * sp;
    cam.lookAt(_look);
    cam.zoom = 1 + camMode * 0.32;
    cam.updateProjectionMatrix();
    sun.position.copy(_look).add(SUN_OFF);
    sun.target.position.copy(_look);
    scene.background.copy(skyCol);
  }

  /* ============================================================ update */
  var K = Kit.keys;
  var UP = ['ArrowUp', 'KeyW'], DOWN = ['ArrowDown', 'KeyS'], LEFT = ['ArrowLeft', 'KeyA'], RIGHT = ['ArrowRight', 'KeyD'];
  function handleKeys() {
    if (state === 'title') {
      if (K.anyPressed(['Enter', 'Space', 'NumpadEnter'])) startGame();
      else if (K.anyPressed(UP)) { startGame(); tryHop(0, 1); }
      else if (K.anyPressed(LEFT)) cycleChar(-1);
      else if (K.anyPressed(RIGHT)) cycleChar(1);
    } else if (state === 'play') {
      if (K.anyPressed(['KeyP', 'Escape'])) { pauseGame(); return; }
      if (K.anyPressed(UP)) tryHop(0, 1);
      else if (K.anyPressed(DOWN)) tryHop(0, -1);
      else if (K.anyPressed(LEFT)) tryHop(-1, 0);
      else if (K.anyPressed(RIGHT)) tryHop(1, 0);
    } else if (state === 'paused') {
      if (K.anyPressed(['KeyP', 'Escape', 'Enter', 'Space'])) resumeGame();
      else if (K.pressed('KeyR')) restart();
    } else if (state === 'over') {
      if (overT > 0.45) {
        if (K.anyPressed(['Enter', 'Space', 'KeyR', 'NumpadEnter']) || (overT > 0.9 && K.anyPressed(UP))) restart();
        else if (K.pressed('Escape')) toMenu();
      }
    } else if (state === 'chars') {
      if (K.anyPressed(['Escape', 'Enter'])) closeChars();
      else if (K.anyPressed(LEFT)) { cycleChar(-1); renderChars(); }
      else if (K.anyPressed(RIGHT)) { cycleChar(1); renderChars(); }
    } else if (state === 'machine') {
      if (!$('mReveal').hidden) { if (K.anyPressed(['Enter', 'Space', 'Escape'])) closeReveal(); }
      else if (K.pressed('Escape')) closeMachine();
      else if (K.anyPressed(['Enter', 'Space'])) pull();
    }
  }

  function update(dt) {
    time += dt;
    handleKeys();
    if (state === 'paused') { K.endFrame(); return; }
    updateLanes(dt);
    if (state === 'play' || state === 'dying') {
      updatePlayer(dt);
      if (state === 'play' && started) {
        var rate = 0.3 + diffAt(maxRow) * 0.3;
        autoRow += dt * (rate + Math.max(0, P.row - autoRow) * 1.2);
        var eff = P.hop ? Math.max(P.hop.row0, P.hop.row1) : P.row, behind = autoRow - eff;
        setWarn(behind > 2.3);
        if (behind > 2.3) { warnT -= dt; if (warnT <= 0) { warnT = 0.45; S.warn(); } }
        if (behind > 3.6 && !godMode) die('eagle');
      }
    } else if (state === 'title' || titleLike()) {
      // idle hops on the title screen
      P.idle -= dt;
      if (P.idle <= 0 && P.jump <= 0) { P.idle = 1.6 + Math.random() * 2; P.jump = 1; if (Math.random() < 0.4) P.face = Kit.pick([0, Math.PI / 2, -Math.PI / 2, 0]); }
      if (P.jump > 0) { P.jump = Math.max(0, P.jump - dt / 0.28); P.y = Math.sin((1 - P.jump) * Math.PI) * 0.35; if (P.jump === 0) P.sq = 1; }
      P.sq = Math.max(0, P.sq - dt * 7);
    }
    if (state === 'over') overT += dt;
    if (tipT > 0 && state === 'play') { tipT -= dt; if (tipT <= 0) $('hint').hidden = true; }
    updateParts(dt);
    maintainLanes();
    updateCamera(dt);
    K.endFrame();
  }

  function applyPlayer() {
    pGroup.position.set(P.x, P.y, P.z);
    if (!P.dead) {
      var sx = 1, sy = 1;
      if (P.hop) { var s = Math.sin(Math.min(1, P.hop.t) * Math.PI); sy = 1 + 0.22 * s; sx = 1 - 0.1 * s; }
      else if (P.sq > 0) { sy = 1 - 0.3 * P.sq; sx = 1 + 0.17 * P.sq; }
      else sy = 1 + Math.sin(time * 5) * 0.025;
      pBody.scale.set(sx, sy, sx);
      var d = P.face - pGroup.rotation.y;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      pGroup.rotation.y += d * 0.4;
    }
  }

  var lastR = performance.now();
  function render() {
    var now = performance.now(), rdt = Math.min(0.05, (now - lastR) / 1000);
    lastR = now;
    if (decoDirty) rebuildDeco();
    bestSign.visible = !titleLike(); // on the menu it would sit half-hidden under the missions box
    applyPlayer();
    applyCamera();
    renderer.render(scene, cam);
    drawConfetti(rdt);
    if (state === 'title') placeCharpick();
    if (state === 'over' && overCount < score) {
      overCount = Math.min(score, overCount + Math.max(1, score * rdt * 1.8));
      $('oScore').textContent = Math.floor(overCount);
    }
  }

  /* ================================================================ UI */
  var ui = $('ui'), fxc = $('fx'), fctx = fxc.getContext('2d');
  var SCREENS = ['title', 'pause', 'over', 'chars', 'machine'];
  function showScreen(id) { SCREENS.forEach(function (s) { $(s).hidden = s !== id; }); }
  function setWarn(on) {
    $('warn').classList.toggle('on', !!on);
    $('vignette').style.opacity = on ? '1' : '0';
  }
  function updateHUD(coinBump) {
    $('hScore').textContent = score;
    $('hBest').textContent = Math.max(save.best, score);
    $('hCoins').textContent = save.coins;
    if (coinBump) { var hc = document.querySelector('.hud-coins'); hc.classList.remove('bump'); void hc.offsetWidth; hc.classList.add('bump'); }
  }
  function popup(text, wx, wy, wz, cls) {
    _v.set(wx, wy, wz).project(cam);
    var el = document.createElement('div');
    el.className = 'pop ' + (cls || '');
    el.textContent = text;
    if (!/[\u0600-\u06ff]/.test(text)) el.dir = 'ltr'; // "+5" must not turn into "5+"
    el.style.left = ((_v.x + 1) / 2 * 100) + '%';
    el.style.top = ((1 - _v.y) / 2 * 100) + '%';
    var box = $('pops');
    box.appendChild(el);
    while (box.children.length > 10) box.removeChild(box.firstChild);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 950);
  }
  function showBanner(top, main) {
    var b = $('banner');
    b.querySelector('.b-top').textContent = top;
    b.querySelector('.b-main').textContent = main;
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  }
  // Confetti on a 2D overlay
  var conf = [], confDirty = false;
  var CONF_COLORS = ['#ffd23f', '#ff4d6d', '#2fd36b', '#3fb6ff', '#b36bff', '#ff8a1f', '#ffffff'];
  function confetti(n) {
    var w = fxc.width, h = fxc.height;
    for (var i = 0; i < n && conf.length < 260; i++) {
      conf.push({ x: Math.random() * w, y: -20 - Math.random() * h * 0.35, vx: (Math.random() - 0.5) * 160, vy: 120 + Math.random() * 220,
        r: Math.random() * 6, vr: (Math.random() - 0.5) * 10, s: 6 + Math.random() * 7, c: Kit.pick(CONF_COLORS), life: 3 + Math.random() });
    }
  }
  function drawConfetti(dt) {
    if (!conf.length) { if (confDirty) { fctx.clearRect(0, 0, fxc.width, fxc.height); confDirty = false; } return; }
    confDirty = true;
    fctx.clearRect(0, 0, fxc.width, fxc.height);
    for (var i = conf.length - 1; i >= 0; i--) {
      var c = conf[i];
      c.life -= dt; c.vy += 120 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.r += c.vr * dt;
      if (c.life <= 0 || c.y > fxc.height + 30) { conf.splice(i, 1); continue; }
      fctx.save(); fctx.translate(c.x, c.y); fctx.rotate(c.r);
      fctx.fillStyle = c.c; fctx.fillRect(-c.s / 2, -c.s / 4, c.s, c.s / 2);
      fctx.restore();
    }
  }

  function onResize() {
    var w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h);
    var aspect = w / h, viewH = 11.2;
    if (aspect < 1.6) viewH = 17.9 / aspect;
    cam.left = -viewH * aspect / 2; cam.right = viewH * aspect / 2; cam.top = viewH / 2; cam.bottom = -viewH / 2;
    cam.updateProjectionMatrix();
    ui.style.fontSize = (16 * Math.min(w / 1280, h / 720)) + 'px';
    fxc.width = w; fxc.height = h;
  }
  window.addEventListener('resize', onResize);

  /* ------------------------------------------------------ flow control */
  function startGame() {
    if (state !== 'title') return;
    A.unlock();
    state = 'play';
    if (!P.hop && !P.log) { P.y = 0; P.jump = 0; } // the title idle-hop could leave the critter floating
    showScreen(null);
    $('hud').hidden = false;
    $('hint').hidden = started;
    updateHUD();
    Kit.sfx.click();
    try { canvas.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }
  function pauseGame() { if (state !== 'play') return; state = 'paused'; setWarn(false); $('pScore').textContent = score; showScreen('pause'); Kit.sfx.click(); }
  function resumeGame() { if (state !== 'paused') return; state = 'play'; showScreen(null); Kit.sfx.click(); K.reset(); }
  function restart() { resetWorld(0); state = 'title'; startGame(); }
  function toMenu() { resetWorld(0); state = 'title'; $('hud').hidden = true; showScreen('title'); refreshTitle(); }

  var overCount = 0;
  function gameOver() {
    if (state !== 'dying') return;
    state = 'over'; overT = 0;
    save.stats.games++;
    tipRuns++; store.set('tipRuns', tipRuns);
    missionEvent('games', 1);
    missionEvent('score', score, true);
    missionEvent('coinsRun', runCoins, true);
    newBestRun = score > save.best;
    if (newBestRun) save.best = score;
    var bonus = Math.floor(score / 10);
    save.coins += bonus; save.stats.coinsAll += bonus;
    var unlocked = [];
    if (score >= 100 && !has('gold')) { save.owned.push('gold'); unlocked.push('gold'); }
    if (save.stats.splash >= 10 && !has('duck')) { save.owned.push('duck'); unlocked.push('duck'); }
    persist();
    $('hud').hidden = true;
    setWarn(false);
    $('oReason').textContent = REASONS[P.kind] || 'انتهت الجولة!';
    overCount = 0; $('oScore').textContent = '0';
    $('oBest').textContent = save.best;
    $('oCoins').textContent = '+' + (runCoins + bonus + runReward);
    var extra = [];
    if (bonus > 0) extra.push('المسافة ' + bonus);
    if (runReward > 0) extra.push('المهام ' + runReward);
    $('oBonus').textContent = extra.length ? 'مكافأة: ' + extra.join(' • ') : '';
    $('oNewBest').hidden = !newBestRun;
    var un = $('oUnlock');
    un.hidden = !unlocked.length;
    if (unlocked.length) un.textContent = 'فتحت شخصية جديدة: ' + unlocked.map(function (id) { return CHAR_BY[id].name; }).join(' و') + '!';
    renderMissions($('oMissions'));
    $('oGift').hidden = !giftReady();
    $('oMachine').hidden = !(save.coins >= 100 && machineLeft().length);
    showScreen('over');
    if (newBestRun && score > 0) { Kit.sfx.win(); confetti(140); }
    else A.tone({ freq: 392, to: 262, type: 'triangle', dur: 0.3, vol: 0.2 });
    if (unlocked.length) { confetti(80); Kit.sfx.power(); }
  }

  /* ---------------------------------------------------------- missions */
  function cnt(n, one, many) { return n + ' ' + (n >= 3 && n <= 10 ? many : one); }
  var MT = {
    score: { base: [15, 25, 40, 60, 80, 100, 130, 160, 200], txt: function (n) { return 'صل إلى ' + n + ' نقطة في جولة واحدة'; } },
    coinsRun: { base: [4, 6, 8, 10, 14, 18, 22], txt: function (n) { return 'اجمع ' + cnt(n, 'عملة', 'عملات') + ' في جولة واحدة'; } },
    rivers: { base: [4, 8, 12, 20, 30, 45], txt: function (n) { return 'اعبر ' + cnt(n, 'نهرًا', 'أنهار'); } },
    roads: { base: [10, 20, 35, 50, 80, 120], txt: function (n) { return 'اعبر ' + cnt(n, 'طريقًا', 'طرق'); } },
    rails: { base: [3, 6, 10, 15, 25], txt: function (n) { return 'اعبر سكة القطار ' + cnt(n, 'مرة', 'مرات'); } },
    hops: { base: [100, 200, 350, 500, 800], txt: function (n) { return 'اقفز ' + cnt(n, 'قفزة', 'قفزات'); } },
    logs: { base: [10, 20, 35, 50, 80], txt: function (n) { return 'اقفز على الجذوع ' + cnt(n, 'مرة', 'مرات'); } },
    near: { base: [3, 5, 8, 12], txt: function (n) { return 'انجُ من سيارة في آخر لحظة ' + cnt(n, 'مرة', 'مرات'); } },
    games: { base: [3, 5, 8, 10], txt: function (n) { return 'العب ' + cnt(n, 'جولة', 'جولات'); } }
  };
  function newMission() {
    var types = Object.keys(MT).filter(function (t) { return !save.missions.some(function (m) { return m.t === t; }); });
    var t = Kit.pick(types), tier = save.tiers[t] || 0, b = MT[t].base;
    var n = tier < b.length ? b[tier] : Math.round(b[b.length - 1] * (1 + 0.35 * (tier - b.length + 1)));
    return { t: t, n: n, p: 0, done: false, rw: Math.min(60, 20 + tier * 5) };
  }
  function rotateMissions() {
    if (!Array.isArray(save.missions)) save.missions = [];
    save.missions = save.missions.filter(function (m) { return m && MT[m.t] && !m.done && m.n > 0; });
    while (save.missions.length < 3) save.missions.push(newMission());
    store.set('missions', save.missions);
  }
  function missionEvent(type, amount, isMax) {
    var ms = save.missions;
    for (var i = 0; i < ms.length; i++) {
      var m = ms[i];
      if (m.t !== type || m.done) continue;
      m.p = isMax ? Math.max(m.p, amount) : m.p + amount;
      if (m.p >= m.n) {
        m.p = m.n; m.done = true;
        save.coins += m.rw; runReward += m.rw;
        save.tiers[type] = (save.tiers[type] || 0) + 1;
        persist();
        if (state === 'play') {
          popup('مهمة مكتملة!', P.x, 2.6, P.z, 'big');
          popup('+' + m.rw, P.x, 1.7, P.z, 'gold');
          S.mission(); updateHUD(true);
        }
      }
    }
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function renderMissions(el) {
    el.innerHTML = save.missions.map(function (m) {
      var pct = Math.round(100 * Math.min(1, m.p / m.n));
      return '<div class="mis' + (m.done ? ' done' : '') + '"><div class="mis-check">' + (m.done ? '✓' : '') + '</div>' +
        '<div class="mis-body"><div class="mis-text">' + esc(MT[m.t].txt(m.n)) + '</div><div class="mis-bar"><i style="width:' + pct + '%"></i></div></div>' +
        '<div class="mis-num">' + (m.done ? '' : Math.floor(m.p) + '/' + m.n) + '</div>' +
        '<div class="mis-rew">+' + m.rw + '<span class="coin"></span></div></div>';
    }).join('');
  }

  /* ------------------------------------------------------------- gifts */
  var GIFT_MS = 4 * 60 * 1000;
  function giftReady() { return Date.now() - save.giftAt >= GIFT_MS; }
  function claimGift() {
    if (!giftReady()) return;
    var n = Kit.randInt(15, 35);
    save.coins += n; save.giftAt = Date.now(); persist();
    Kit.sfx.power(); confetti(60);
    showBanner('هدية!', 'ربحت ' + n + ' عملة');
    $('oGift').hidden = true; $('tGift').hidden = true;
    $('oMachine').hidden = !(save.coins >= 100 && machineLeft().length);
    refreshTitle();
  }

  /* ------------------------------------------------------ title screen */
  function refreshTitle() {
    $('tBest').textContent = save.best;
    $('tCoins').textContent = save.coins;
    $('tCharCount').textContent = save.owned.length + '/' + CHARS.length;
    $('machBadge').hidden = !(save.coins >= 100 && machineLeft().length);
    $('tGift').hidden = !giftReady();
    renderMissions($('tMissions'));
    $('cpName').textContent = CHAR_BY[save.sel].name;
  }
  function placeCharpick() {
    _v.set(P.x, -0.5, P.z + 0.9).project(cam);
    var cp = $('charpick');
    cp.style.left = ((_v.x + 1) / 2 * 100) + '%';
    cp.style.top = ((1 - _v.y) / 2 * 100) + '%';
  }
  function ownedList() { return CHARS.filter(function (c) { return has(c.id); }); }
  function cycleChar(d) {
    var list = ownedList(), i = 0;
    for (var k = 0; k < list.length; k++) if (list[k].id === save.sel) i = k;
    selectChar(list[(i + d + list.length) % list.length].id);
  }
  function selectChar(id) {
    if (!has(id)) return;
    save.sel = id; store.set('sel', id);
    if (!P.dead) {
      setCharModel(id);
      P.jump = 1; P.idle = 2.5;
      burst(P.x, 0.4, P.z, 12, [CHAR_BY[id].color, '#ffffff'], { speed: 2.5, up: 3.5, size: 0.1, life: 0.5 });
    }
    S.hop();
    $('cpName').textContent = CHAR_BY[id].name;
  }

  /* ------------------------------------------------------- thumbnails */
  var tR = null, tScene, tCam, tMesh, thumbCache = {}, matSil = new THREE.MeshBasicMaterial({ color: 0x0f1238 });
  var _box = new THREE.Box3(), _size = new THREE.Vector3(), _ctr = new THREE.Vector3();
  function thumb(id, locked) {
    var key = id + (locked ? ':x' : '');
    if (thumbCache[key]) return thumbCache[key];
    try {
      if (!tR) {
        tR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
        tR.setPixelRatio(1); tR.setSize(200, 200);
        tScene = new THREE.Scene();
        tScene.add(new THREE.HemisphereLight(0xffffff, 0x8890b0, 1.7));
        var dl = new THREE.DirectionalLight(0xffffff, 1.7); dl.position.set(-2, 4, -3); tScene.add(dl);
        tCam = new THREE.OrthographicCamera(-0.6, 0.6, 0.6, -0.6, 0.1, 20);
        tCam.position.set(-1.7, 1.5, -2.8); tCam.lookAt(0, 0, 0);
        tMesh = new THREE.Mesh(geo('char:chick'), matVC); tScene.add(tMesh);
      }
      var g = geo('char:' + id);
      g.computeBoundingBox(); _box.copy(g.boundingBox); _box.getSize(_size); _box.getCenter(_ctr);
      var sc = 0.95 / Math.max(_size.x, _size.y, _size.z);
      tMesh.geometry = g; tMesh.material = locked ? matSil : matVC;
      tMesh.scale.setScalar(sc); tMesh.position.set(-_ctr.x * sc, -_ctr.y * sc, -_ctr.z * sc);
      tR.render(tScene, tCam);
      thumbCache[key] = tR.domElement.toDataURL('image/png');
    } catch (e) { thumbCache[key] = ''; }
    return thumbCache[key];
  }

  /* ------------------------------------------------------- characters */
  function openChars(from) { prevScreen = from; state = 'chars'; renderChars(); showScreen('chars'); Kit.sfx.click(); }
  function lockHint(c) {
    if (c.src === 'score') return 'صل إلى 100 نقطة';
    if (c.src === 'splash') return 'اسقط في الماء 10 مرات';
    return 'من آلة الجوائز';
  }
  function renderChars() {
    var grid = $('cGrid');
    grid.innerHTML = '';
    CHARS.forEach(function (c) {
      var own = has(c.id), d = document.createElement('div');
      d.className = 'card' + (own ? '' : ' locked') + (c.id === save.sel ? ' sel' : '') + (own && !save.seen[c.id] ? ' new' : '');
      var img = document.createElement('img');
      img.src = thumb(c.id, !own); img.alt = '';
      var nm = document.createElement('div');
      nm.className = 'nm'; nm.textContent = own ? c.name : lockHint(c);
      d.appendChild(img); d.appendChild(nm);
      if (own) d.addEventListener('click', function () { selectChar(c.id); renderChars(); });
      grid.appendChild(d);
    });
    $('cCount').textContent = save.owned.length + '/' + CHARS.length;
  }
  function closeChars() {
    save.owned.forEach(function (id) { save.seen[id] = 1; });
    store.set('seen', save.seen);
    state = prevScreen === 'over' ? 'over' : 'title';
    showScreen(state);
    if (state === 'title') refreshTitle();
    Kit.sfx.click();
  }

  /* ---------------------------------------------------- prize machine */
  var pulling = false, lastPrize = null;
  function machineLeft() { return CHARS.filter(function (c) { return c.src === 'machine' && !has(c.id); }); }
  function openMachine(from) {
    prevScreen = from; state = 'machine';
    $('mReveal').hidden = true; $('gBall').className = 'g-ball';
    refreshMachine(); showScreen('machine'); Kit.sfx.click();
  }
  function refreshMachine() {
    var left = machineLeft();
    $('mCoins').textContent = save.coins;
    $('mBar').style.width = Math.min(100, save.coins) + '%';
    $('mPull').disabled = pulling || save.coins < 100 || !left.length;
    var need = 100 - save.coins;
    $('mMsg').textContent = !left.length ? 'جمعت كل شخصيات الآلة! أنت بطل!' :
      save.coins >= 100 ? 'الآلة جاهزة! اسحب الآن!' :
      'تحتاج ' + (need === 1 ? 'عملة واحدة' : need === 2 ? 'عملتين' : cnt(need, 'عملة', 'عملات')) + ' أخرى. اجمعها في الطريق!';
  }
  function pull() {
    if (pulling || state !== 'machine') return;
    var left = machineLeft();
    if (save.coins < 100 || !left.length) { S.bump(); return; }
    pulling = true;
    save.coins -= 100;
    var pick = Kit.pick(left);
    save.owned.push(pick.id); lastPrize = pick.id;
    persist(); refreshMachine();
    S.crank();
    var knob = $('gKnob'), g = $('gacha'), ball = $('gBall');
    knob.classList.remove('turn'); g.classList.remove('shake'); ball.className = 'g-ball';
    void knob.offsetWidth;
    knob.classList.add('turn'); g.classList.add('shake');
    ball.style.background = 'linear-gradient(180deg, ' + pick.color + ' 0 50%, #fff 50% 100%)';
    setTimeout(function () { ball.classList.add('drop'); Kit.sfx.pop(); }, 800);
    setTimeout(function () {
      pulling = false;
      if (state !== 'machine') { refreshMachine(); return; }
      $('mImg').src = thumb(pick.id, false);
      $('mName').textContent = pick.name;
      $('mReveal').hidden = false;
      Kit.sfx.win(); confetti(120);
      refreshMachine();
    }, 1700);
  }
  function closeReveal() { $('mReveal').hidden = true; $('gBall').className = 'g-ball'; refreshMachine(); Kit.sfx.click(); }
  function closeMachine() {
    if (pulling) return;
    state = prevScreen === 'over' ? 'over' : 'title';
    showScreen(state);
    if (state === 'title') refreshTitle();
    else $('oMachine').hidden = !(save.coins >= 100 && machineLeft().length);
    Kit.sfx.click();
  }
  function playPrize() {
    if (lastPrize && has(lastPrize)) { save.sel = lastPrize; store.set('sel', lastPrize); save.seen[lastPrize] = 1; }
    $('mReveal').hidden = true;
    restart();
  }

  /* ------------------------------------------------------------ wiring */
  function on(id, fn) { $(id).addEventListener('click', function (e) { e.stopPropagation(); A.unlock(); fn(); }); }
  on('btnPlay', startGame);
  on('btnChars', function () { openChars('title'); });
  on('btnMachine', function () { openMachine('title'); });
  on('tGift', claimGift);
  on('cPrev', function () { cycleChar(-1); });
  on('cNext', function () { cycleChar(1); });
  on('btnPause', pauseGame);
  on('btnResume', resumeGame);
  on('btnRestart', restart);
  on('btnMenu', toMenu);
  on('btnAgain', restart);
  on('oChars', function () { openChars('over'); });
  on('oMenu', toMenu);
  on('oGift', claimGift);
  on('oMachine', function () { openMachine('over'); });
  on('cBack', closeChars);
  on('cMach', function () { save.owned.forEach(function (id) { save.seen[id] = 1; }); openMachine(prevScreen); });
  on('mPull', pull);
  on('mBack', closeMachine);
  on('mOk', closeReveal);
  on('mUse', playPrize);
  // Never leave a button focused (Space/Enter would click it again).
  document.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('button'); if (b) b.blur(); }, true);
  canvas.addEventListener('pointerdown', function (e) { if (state === 'play' && e.button === 0) tryHop(0, 1); });
  document.addEventListener('visibilitychange', function () { if (document.hidden && state === 'play') pauseGame(); });
  window.addEventListener('blur', function () { if (state === 'play' && started) pauseGame(); });

  Kit.muteButton();
  onResize();
  resetWorld(0);
  refreshTitle();
  showScreen('title');
  Kit.loop(update, render);
  if (document.fonts && document.fonts.load) {
    document.fonts.load('700 40px Fredoka', 'بب').then(function () { onResize(); placeBestMark(); }, function () { /* ignore */ });
  }

  /* -------------------------------------------------------- debug hook */
  function checkPaths(rows, runs) {
    var bad = 0, i;
    for (var run = 0; run < (runs || 20); run++) {
      var g = newGen(0), grid = {};
      for (i = 0; i < rows + 12; i++) {
        var L = genLane(g), ok = {};
        for (var c = -4; c <= 4; c++) {
          if (L.type === 'grass') ok[c] = !L.blocked[c];
          else if (L.type === 'river' && L.pads) ok[c] = L.logs.some(function (o) { return o.x === c; });
          else ok[c] = true;
        }
        grid[L.row] = ok;
      }
      var seen = {}, q = [[0, 0]], reached = false;
      seen['0,0'] = 1;
      while (q.length) {
        var cur = q.shift();
        if (cur[0] >= rows) { reached = true; break; }
        [[1, 0], [0, 1], [0, -1], [-1, 0]].forEach(function (d) {
          var r = cur[0] + d[0], cc = cur[1] + d[1], k = r + ',' + cc;
          if (cc < -4 || cc > 4 || seen[k] || !grid[r] || !grid[r][cc]) return;
          seen[k] = 1; q.push([r, cc]);
        });
      }
      if (!reached) bad++;
    }
    return { runs: runs || 20, rows: rows, blocked: bad };
  }

  // Simple autopilot used only by automated tests (window.__game.bot).
  function laneSafe(L, x, t0, t1) {
    if (!L) return false;
    if (L.type === 'road') {
      for (var i = 0; i < L.vehicles.length; i++) {
        var v = L.vehicles[i];
        for (var t = t0; t <= t1; t += 0.04) {
          var vx = wrapX(v.x + L.v * t);
          if (Math.abs(vx - x) < v.len / 2 + 0.45) return false;
        }
      }
    } else if (L.type === 'rail') {
      var R = L.rail;
      if (R.phase !== 'wait' || R.t < t1 + 0.4) return false;
    }
    return true;
  }
  function botOk(L, x, t0, t1) {
    if (!L) return false;
    if (L.type === 'grass') return Math.abs(x) <= 4 && !L.blocked[x];
    if (L.type === 'river') { var f = findCarrier(L, x, HOP); return !!f && Math.abs(f.o.x + f.rel + L.v * 0.8) < 4; }
    return Math.abs(x) <= 4 && laneSafe(L, x, t0, t1);
  }
  function botDecide() {
    var cur = lanes[P.row], nxt = lanes[P.row + 1];
    if (!cur || !nxt) return;
    var v0 = P.log ? cur.v : 0, nx = P.x + v0 * HOP, rx = Math.round(nx);
    var stayOk = cur.type === 'grass' || (cur.type === 'river' ? (P.log && Math.abs(P.x + cur.v * 0.6) < 4.2) : laneSafe(cur, P.x, 0, 0.3));
    if (botOk(nxt, nxt.type === 'river' ? nx : Kit.clamp(rx, -4, 4), 0, 0.4)) { tryHop(0, 1); return; }
    var sides = P.x > 0 ? [-1, 1] : [1, -1], i;
    if (!stayOk) {
      var back = lanes[P.row - 1];
      if (back && back.type !== 'river' && botOk(back, Kit.clamp(rx, -4, 4), 0, 0.35)) { tryHop(0, -1); return; }
      for (i = 0; i < 2; i++) if (botOk(cur, cur.type === 'river' ? P.x + sides[i] + v0 * HOP : rx + sides[i], 0, 0.35)) { tryHop(sides[i], 0); return; }
      return;
    }
    // Forward is not possible yet: side-step if the next lane is open next to us.
    for (i = 0; i < 2; i++) {
      var sx = cur.type === 'river' ? P.x + sides[i] + v0 * HOP : rx + sides[i];
      if ((nxt.type === 'grass' || nxt.pads) && botOk(nxt, Math.round(sx), 0, 0) && botOk(cur, cur.type === 'river' ? sx : Math.round(sx), 0, 0.35)) { tryHop(sides[i], 0); return; }
    }
    if ((nxt.type === 'grass' || nxt.pads) && cur.type === 'grass') {
      for (var d = 2; d <= 8; d++) for (i = 0; i < 2; i++) {
        var c = rx + sides[i] * d, okp = c >= -4 && c <= 4 && (nxt.pads ? !!findCarrier(nxt, c, 0) : !nxt.blocked[c]);
        for (var k = rx + sides[i]; okp && k !== c + sides[i]; k += sides[i]) if (cur.blocked[k]) okp = false;
        if (okp) { tryHop(sides[i], 0); return; }
      }
    }
  }
  function bot(sec) {
    var n = Math.round(sec * 60);
    for (var i = 0; i < n && state === 'play'; i++) { if (!P.hop) botDecide(); update(1 / 60); }
    for (var j = 0; j < 90 && state === 'dying'; j++) update(1 / 60);
    render();
    return { state: state, score: score, kind: P.kind };
  }
  window.__game = {
    get state() { return state; },
    get score() { return score; },
    get coins() { return save.coins; },
    get best() { return save.best; },
    player: function () { return { row: P.row, x: +P.x.toFixed(2), y: +P.y.toFixed(2), dead: P.dead, kind: P.kind, onLog: !!P.log, hopping: !!P.hop, autoRow: +autoRow.toFixed(2) }; },
    lanes: function (a, b) {
      var out = [];
      for (var r = (a == null ? P.row - 2 : a); r <= (b == null ? P.row + 8 : b); r++) {
        var L = lanes[r];
        if (L) out.push(r + ':' + L.type + (L.type === 'grass' ? '[' + Object.keys(L.blocked).join(',') + ']' : '') + (L.v ? ' v=' + L.v.toFixed(1) : ''));
      }
      return out;
    },
    hop: function (dx, dr) { tryHop(dx, dr); },
    start: startGame,
    god: function (v) { godMode = v !== false; },
    addCoins: function (n) { save.coins += n; persist(); refreshTitle(); refreshMachine(); },
    warp: function (row) { resetWorld(row); state = 'title'; startGame(); },
    kill: function (k) { if (state === 'play') die(k || 'car', lanes[P.row]); },
    info: function () {
      var i = renderer.info;
      return { calls: i.render.calls, tris: i.render.triangles, geometries: i.memory.geometries, lanes: laneMax - laneMin + 1, particles: pIM.count, meshes: scene.children.length };
    },
    checkPaths: checkPaths,
    bot: bot,
    // Run the simulation synchronously (for automated tests on slow machines).
    step: function (sec, fn) { var n = Math.round((sec || 0.1) * 60); for (var i = 0; i < n; i++) { if (fn) fn(i); update(1 / 60); } render(); return state; },
    press: function (code) { window.dispatchEvent(new KeyboardEvent('keydown', { code: code })); update(1 / 60); window.dispatchEvent(new KeyboardEvent('keyup', { code: code })); return state; },
    missions: function () { return save.missions; },
    rails: function () { var o = []; for (var r = laneMin; r <= laneMax; r++) { var L = lanes[r]; if (L && L.rail) o.push({ row: r, phase: L.rail.phase, t: +L.rail.t.toFixed(2), x: +L.rail.x.toFixed(1) }); } return o; }
  };
})();
