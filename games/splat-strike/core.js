/*
 * Splat Strike — core.js
 * The game simulation (runs at a fixed 60 Hz, also headless for tests):
 *   map loading, entities (player + bots share one code path), FPS movement physics,
 *   blasters (hitscan resolved at fire time, delivered by a visible paint blob), paint balloons,
 *   damage / splats / respawns with shield, pickups, match rules for free-for-all and teams.
 * Talks to the presentation layer (ui.js) only through G.ui hooks, so simulate() can skip them.
 */
(function () {
  'use strict';
  var T = window.THREE, SS = window.SS;
  var WEAPONS = SS.WEAPONS, BAL = SS.BALLOON;

  var G = SS.G = {
    t: 0, matchT: 0, state: 'boot', mode: 'ffa', mapIdx: -1, diff: 0, demo: false,
    ents: [], player: null, W: null, nav: null, map: null, pickups: [], hotNodes: [], spawns: [],
    frozen: true, over: false, countdown: 0, headless: false, teamScore: [0, 0, 0],
    ui: {}, timeScale: 1, cfg: { ffa: { bots: 6, target: [20, 20, 20], time: 240 }, team: { bots: 9, target: [40, 40, 50], time: 300 } },
    stats: null
  };
  function noop() {}
  function ui(name) { return (!G.headless && G.ui[name]) || noop; }

  /* ================================================================ scene */
  var scene = G.scene = new T.Scene();
  scene.fog = new T.Fog(0xd6efff, 30, 95);
  var hemi = G.hemi = new T.HemisphereLight(0xeaf6ff, 0x9bbf7a, 1.9);
  var sun = G.sun = new T.DirectionalLight(0xfff2dc, 2.3);
  sun.position.set(-0.5, 1, 0.35);
  scene.add(hemi, sun);
  var fx = G.fx = new SS.FX(scene);
  var mapMat = new T.MeshLambertMaterial({ vertexColors: true });
  var gunMat = new T.MeshLambertMaterial({ vertexColors: true });
  var pickMat = new T.MeshLambertMaterial({ vertexColors: true, emissive: 0x222222 });
  var beltTex = (function () {
    var c = document.createElement('canvas'); c.width = 16; c.height = 64;
    var g = c.getContext('2d'); g.fillStyle = '#3b3b58'; g.fillRect(0, 0, 16, 64); g.fillStyle = '#ffd23f';
    for (var y = 0; y < 64; y += 16) { g.beginPath(); g.moveTo(0, y + 12); g.lineTo(8, y + 4); g.lineTo(16, y + 12); g.lineTo(16, y + 16); g.lineTo(8, y + 8); g.lineTo(0, y + 16); g.fill(); }
    var t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.colorSpace = T.SRGBColorSpace;
    return t;
  })();
  var beltMat = new T.MeshLambertMaterial({ map: beltTex });
  G.mats = { map: mapMat, gun: gunMat, pick: pickMat, belt: beltMat };
  // sky dome with vertex-colour gradient
  var skyGeo = new T.SphereGeometry(170, 24, 14);
  skyGeo.setAttribute('color', new T.BufferAttribute(new Float32Array(skyGeo.attributes.position.count * 3), 3));
  var sky = G.sky = new T.Mesh(skyGeo, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide, fog: false, depthWrite: false }));
  sky.renderOrder = -5;
  scene.add(sky);
  function setSky(cols) {
    var p = skyGeo.attributes.position, c = skyGeo.attributes.color, a = SS.lin(cols[0]), b = SS.lin(cols[1]), h = SS.lin(cols[2]);
    for (var i = 0; i < p.count; i++) {
      var y = p.getY(i) / 170, r, g, bb;
      if (y > 0.25) { var k = Math.min(1, (y - 0.25) / 0.6); r = b[0] + (a[0] - b[0]) * k; g = b[1] + (a[1] - b[1]) * k; bb = b[2] + (a[2] - b[2]) * k; }
      else { var k2 = Math.max(0, Math.min(1, (y + 0.05) / 0.3)); r = h[0] + (b[0] - h[0]) * k2; g = h[1] + (b[1] - h[1]) * k2; bb = h[2] + (b[2] - h[2]) * k2; }
      c.setXYZ(i, r, g, bb);
    }
    c.needsUpdate = true;
  }
  // feet of every buddy: one instanced mesh
  var footGeo = SS.footGeo();
  var feet = G.feet = new T.InstancedMesh(footGeo, new T.MeshLambertMaterial(), 26);
  feet.instanceMatrix.setUsage(T.DynamicDrawUsage);
  feet.instanceColor = new T.InstancedBufferAttribute(new Float32Array(26 * 3).fill(1), 3);
  feet.frustumCulled = false; feet.count = 0;
  scene.add(feet);
  // balloons in flight
  var balloonMesh = G.balloonMesh = new T.InstancedMesh(SS.balloonGeo(), new T.MeshLambertMaterial({ vertexColors: true }), 16);
  balloonMesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
  balloonMesh.instanceColor = new T.InstancedBufferAttribute(new Float32Array(16 * 3).fill(1), 3);
  balloonMesh.frustumCulled = false; balloonMesh.count = 0;
  scene.add(balloonMesh);
  var stainMesh = G.stainMesh = new T.InstancedMesh(new T.IcosahedronGeometry(1, 1), new T.MeshLambertMaterial(), 72);
  stainMesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
  stainMesh.instanceColor = new T.InstancedBufferAttribute(new Float32Array(72 * 3).fill(1), 3);
  stainMesh.frustumCulled = false; stainMesh.count = 0;
  scene.add(stainMesh);
  var pickGeos = { hp: SS.pickupGeo('hp'), ammo: SS.pickupGeo('ammo'), power: SS.pickupGeo('power') };

  /* ============================================================ maps */
  var beltMesh = null;
  G.loadMap = function (idx) {
    if (G.mapIdx === idx && G.map) return G.map;
    var def = SS.MAPS[idx];
    var m = def.build();
    // pickup pads baked into the map geometry
    for (var i = 0; i < m.pickups.length; i++) {
      var pk = m.pickups[i];
      var py = m.W.ground ? 0 : 0;
      pk.gy = pk.y;
      m.b.ao = false;
      var padCol = pk.type === 'hp' ? 0xff3d6e : pk.type === 'ammo' ? 0x3fb8ff : 0xffc61a;
      m.b.cyl(pk.x, pk.y, pk.z, 0.62, 0.06, 0xffffff, { seg: 16 });
      m.b.ring(pk.x, pk.y + 0.065, pk.z, 0.4, 0.56, padCol, 16);
    }
    m.W.finish();
    var geo = m.b.geometry();
    if (G.mapMesh) { scene.remove(G.mapMesh); G.mapMesh.geometry.dispose(); }
    G.mapMesh = new T.Mesh(geo, mapMat);
    G.mapMesh.matrixAutoUpdate = false;
    scene.add(G.mapMesh);
    var W = m.W, nav = new SS.Nav(W);
    var spawns = [];
    for (var s = 0; s < m.spawns.length; s++) {
      var sp = m.spawns[s];
      spawns.push({ x: sp.x, y: W.ground(sp.x, sp.z, 0.38, sp.y + 0.6), z: sp.z, team: sp.team });
    }
    nav.markGood(nav.nearest(spawns[0].x, spawns[0].y, spawns[0].z, false));
    // pickups
    for (var q = 0; q < G.pickups.length; q++) scene.remove(G.pickups[q].mesh);
    G.pickups = [];
    for (var p = 0; p < m.pickups.length; p++) {
      var P = m.pickups[p], gy = W.ground(P.x, P.z, 0.3, P.y + 0.6);
      var mesh = new T.Mesh(pickGeos[P.type], pickMat);
      mesh.position.set(P.x, gy + 0.75, P.z);
      scene.add(mesh);
      G.pickups.push({ type: P.type, x: P.x, y: gy, z: P.z, active: true, t: 0, node: nav.nearest(P.x, gy, P.z), mesh: mesh, ph: p * 1.7 });
    }
    G.hotNodes = [];
    for (var h = 0; h < m.hot.length; h++) {
      var H = m.hot[h], hy = W.ground(H.x, H.z, 0.3, H.y + 0.6), n = nav.nearest(H.x, hy, H.z);
      if (n >= 0) G.hotNodes.push(n);
    }
    // conveyor belts: one textured strip mesh whose texture scrolls
    if (beltMesh) { scene.remove(beltMesh); beltMesh.geometry.dispose(); beltMesh = null; }
    if (m.belts.length) {
      var pos = [], uv = [], nor = [];
      for (var bI = 0; bI < m.belts.length; bI++) {
        var bl = m.belts[bI], L = bl.z1 - bl.z0, rep = L / 1.5 * bl.dir;
        var yy = bl.y + 0.004;
        pos.push(bl.x0, yy, bl.z1, bl.x1, yy, bl.z1, bl.x1, yy, bl.z0, bl.x0, yy, bl.z1, bl.x1, yy, bl.z0, bl.x0, yy, bl.z0);
        uv.push(0, 0, 1, 0, 1, rep, 0, 0, 1, rep, 0, rep);
        for (var k = 0; k < 6; k++) nor.push(0, 1, 0);
      }
      var bg = new T.BufferGeometry();
      bg.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
      bg.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
      bg.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
      beltMesh = new T.Mesh(bg, beltMat);
      scene.add(beltMesh);
    }
    setSky(def.sky);
    scene.fog.color.setHex(def.fog[0]); scene.fog.near = def.fog[1]; scene.fog.far = def.fog[2];
    hemi.color.setHex(def.hemi[0]); hemi.groundColor.setHex(def.hemi[1]); hemi.intensity = def.hemi[2];
    sun.color.setHex(def.sun[0]); sun.intensity = def.sun[1]; sun.position.set(def.sun[2], def.sun[3], def.sun[4]);
    fx.snowOn = !!def.snow;
    fx.clear();
    G.W = W; G.nav = nav; G.spawns = spawns; G.mapIdx = idx;
    G.map = { def: def, kit: m };
    return G.map;
  };
  G.updateBelts = function (dt) { if (beltMesh) beltTex.offset.y = (beltTex.offset.y - dt * 1.4 / 1.5) % 1; };

  /* ============================================================ entities */
  var RUN = 6.2, SPRINT = 8.3, ACC = 14, FRIC = 12, AIR = 2.4, JUMP = 7.3, GRAV = 21, COYOTE = 0.12;
  G.MOVE = { RUN: RUN, SPRINT: SPRINT, JUMP: JUMP, GRAV: GRAV };
  var nextId = 1;
  function Ent(o) {
    this.id = nextId++;
    this.name = o.name; this.team = o.team || 0; this.isPlayer = !!o.isPlayer; this.bot = null;
    this.color = o.color; this.hat = o.hat || 'none'; this.skin = o.skin || SS.SKINS[0]; this.accent = o.accent || 0xffe14d;
    this.x = 0; this.y = 0; this.z = 0; this.px = 0; this.py = 0; this.pz = 0; this.vx = 0; this.vy = 0; this.vz = 0;
    this.r = 0.38; this.h = 1.75; this.grounded = false; this.gBox = null; this.stepUp = 0;
    this.yaw = 0; this.pitch = 0; this.rp = 0; this.ry = 0;
    this.hp = 100; this.alive = false; this.respawnT = 0; this.shield = 0; this.lastHitT = -99; this.life = 0; this.killer = null; this.nemesis = null;
    this.wpn = 0; this.prefW = 0; this.lastW = 1; this.ammo = [0, 0, 0]; this.res = [0, 0, 0]; this.reloadT = 0; this.fireT = 0; this.swapT = 0; this.bloom = 0; this.fireBuf = 0;
    this.balloons = BAL.start; this.nadeCd = 0; this.power = 0; this.zoom = false;
    this.kills = 0; this.deaths = 0; this.streak = 0; this.best = 0; this.shots = 0; this.hits = 0; this.heads = 0; this.multi = 0; this.lastKillT = -99; this.thrown = 0; this.picks = 0;
    this.mx = 0; this.mz = 0; this.sprint = false; this.sprinting = false; this.sprintBlock = 0; this.jumpReq = false; this.jumpBuf = 0; this.coyote = 0; this.jumpCd = 0;
    this.fire = false; this.fireP = false; this.wantReload = false; this.wantSwap = -1; this.wantThrow = false;
    this.lastFireT = -99; this.moving = false; this.stepT = 0; this.landV = 0; this.airT = 0;
    this.flash = 0; this.walk = 0; this.squash = 0; this.dist = 0; this.god = false; this.spawnAge = 0; this.spawnT = 0;
    this.mesh = null; this.gun = null; this.gunKey = ''; this.body = null; this.gunPivot = null;
    // declared up front so every entity keeps one hidden class (fast, no deopts)
    this.tag = null; this.footCol = null; this.paintLin = null; this.flashShown = 0; this.autopilot = false; this.kick = 0;
    // paint stains stuck on the buddy (local x, y, z, size) + colour refs; ring of 6
    this.stains = new Float32Array(24); this.stainCol = [null, null, null, null, null, null]; this.stainN = 0; this.stainI = 0;
  }
  G.Ent = Ent;
  G.enemy = function (a, b) { return a !== b && (G.mode !== 'team' || a.team !== b.team); };
  G.paint = function (e) { return e.paintLin || (e.paintLin = SS.lin(e.team === 1 ? 0x3d8bff : e.team === 2 ? 0xff8a1f : e.color)); };
  G.bodyColor = function (e) { return e.team === 1 ? 0x3d8bff : e.team === 2 ? 0xff8a1f : e.color; };

  // Buddy and blaster geometries are cached per look. Every match (and every title demo) makes new random
  // looks, so entries that nothing has used for two matches are disposed (GPU buffers freed) in G.start.
  var buddyCache = {}, gunCache = {}, geoGen = 1;
  G.geoPinned = [];      // meshes outside the match that must keep their geometry (view model, title/podium dolls)
  function buddyGeo(e) {
    var key = G.bodyColor(e) + '|' + e.hat + '|' + e.accent, c = buddyCache[key];
    if (!c) c = buddyCache[key] = { geo: SS.buddyGeo({ color: G.bodyColor(e), hat: e.hat, accent: e.accent }), gen: 0 };
    c.gen = geoGen;
    return c.geo;
  }
  G.gunGeo = function (w, skin, hands) {
    var key = w + '|' + skin.id + '|' + hands, c = gunCache[key];
    if (!c) c = gunCache[key] = { gg: SS.blasterGeo(w, skin, hands), gen: 0 };
    c.gen = geoGen;
    return c.gg;
  };
  var inUse = [];
  function purgeCache(cache, get) {
    for (var k in cache) {
      var c = cache[k];
      if (c.gen >= geoGen - 1) continue;
      var g = get(c);
      if (inUse.indexOf(g) >= 0) { c.gen = geoGen; continue; }
      g.dispose(); delete cache[k];
    }
  }
  function purgeGeo() {
    inUse.length = 0;
    for (var i = 0; i < G.ents.length; i++) { var e = G.ents[i]; if (e.body) inUse.push(e.body.geometry); if (e.gun) inUse.push(e.gun.geometry); }
    for (var j = 0; j < G.geoPinned.length; j++) inUse.push(G.geoPinned[j].geometry);
    purgeCache(buddyCache, function (c) { return c.geo; });
    purgeCache(gunCache, function (c) { return c.gg.geo; });
    inUse.length = 0;
  }
  G.geoStats = function () { return { buddies: Object.keys(buddyCache).length, guns: Object.keys(gunCache).length, gen: geoGen }; };
  G.buddyGeo = buddyGeo;
  function ensureMesh(e) {
    if (G.headless && !e.mesh) return;
    if (!e.mesh) {
      e.mesh = new T.Group();
      e.body = new T.Mesh(buddyGeo(e), new T.MeshLambertMaterial({ vertexColors: true, emissive: 0x000000 }));
      e.mesh.add(e.body);
      e.gunPivot = new T.Group(); e.gunPivot.position.set(0.2, 0.98, -0.2);
      e.mesh.add(e.gunPivot);
      scene.add(e.mesh);
    } else e.body.geometry = buddyGeo(e);
    setGun(e);
  }
  function setGun(e) {
    if (!e.gunPivot) return;
    var key = e.wpn + '|' + e.skin.id;
    if (e.gunKey === key) return;
    e.gunKey = key;
    var gg = G.gunGeo(e.wpn, e.skin, G.bodyColor(e));
    if (!e.gun) { e.gun = new T.Mesh(gg.geo, gunMat); e.gun.scale.setScalar(1.55); e.gunPivot.add(e.gun); }
    else e.gun.geometry = gg.geo;
  }
  G.ensureMesh = ensureMesh;
  function removeEnt(e) { if (e.mesh) scene.remove(e.mesh); if (e.body) e.body.material.dispose(); if (G.ui.removeTag) G.ui.removeTag(e); }

  /* ============================================================ spawning */
  function fillAmmo(e) { for (var w = 0; w < 3; w++) { e.ammo[w] = WEAPONS[w].mag; e.res[w] = WEAPONS[w].res; } e.balloons = BAL.start; }
  // Safe spawn. Every spot gets a danger score from the enemies around it: anyone within 9 m rules it out,
  // an enemy that can see it counts more when close and when already looking that way, and an enemy just
  // around a corner counts a little. The safest spot wins, distance to the nearest enemy breaks ties.
  // In teams your own base comes first, then the neutral spots; the other team's base is a last resort
  // (only when the fight has moved into yours). The new buddy faces the most dangerous enemy it can see.
  var spawnFace = { yaw: 0, has: false };
  G.pickSpawn = function (e) {
    var best = null, bs = -1e9, sp = G.spawns, team = G.mode === 'team', W = G.W, E = G.ents;
    for (var i = 0; i < sp.length; i++) {
      var s = sp[i];
      if (team && s.ffa) continue;
      var md = 1e9, danger = 0, crowd = 0, fk = 0, fx = 0, fz = 0;
      for (var j = 0; j < E.length; j++) {
        var o = E[j];
        if (o === e || !o.alive) continue;
        var dx = s.x - o.x, dz = s.z - o.z, d = Math.sqrt(dx * dx + dz * dz);
        if (!G.enemy(e, o)) { if (d < 1.2) crowd++; continue; }
        if (d < md) md = d;
        if (d < 9) { danger += 3; continue; }
        if (d < 36 && W.los(o.x, o.y + SS.EYE_H, o.z, s.x, s.y + 1.1, s.z)) {
          var face = (-Math.sin(o.yaw) * dx - Math.cos(o.yaw) * dz) / d;     // 1 = looking straight at the spot
          var w = (face > 0.6 ? 1.6 : face > 0 ? 1 : 0.6) * (d < 20 ? 1.3 : 1.3 - (d - 20) / 40);
          danger += w;
          if (w > fk) { fk = w; fx = -dx; fz = -dz; }
        } else if (d < 16) danger += 0.5 * (16 - d) / 7;
      }
      var sc = -danger * 40 + Math.min(md, 30) * 0.6 - crowd * 8 + Math.random() * 3;
      if (team && s.team) sc += s.team === e.team ? 8 : -45;
      if (sc > bs) { bs = sc; best = s; spawnFace.has = fk > 0; spawnFace.yaw = Math.atan2(-fx, -fz); }
    }
    return best || sp[0];
  };
  // With no enemy in sight, face the most open direction (leaning toward the middle of the map),
  // so nobody starts a life staring at a wall.
  var openHit = { t: 0, nx: 0, ny: 0, nz: 0, box: null };
  function openYaw(s) {
    var best = Math.atan2(s.x, s.z), bs = -1e9, cx = -s.x, cz = -s.z, cl = Math.sqrt(cx * cx + cz * cz) || 1;
    for (var k = 0; k < 24; k++) {
      var yaw = k / 24 * Math.PI * 2, dx = -Math.sin(yaw), dz = -Math.cos(yaw);
      var d = G.W.ray(s.x, s.y + SS.EYE_H, s.z, dx, 0, dz, 30, openHit, true) ? openHit.t : 30;
      var sc = Math.min(d, 30) + 8 * (dx * cx + dz * cz) / cl;
      if (sc > bs) { bs = sc; best = yaw; }
    }
    return best;
  }
  G.respawn = function (e) {
    var s = G.pickSpawn(e);
    e.x = e.px = s.x + (Math.random() - 0.5) * 0.4; e.z = e.pz = s.z + (Math.random() - 0.5) * 0.4; e.y = e.py = s.y;
    e.vx = e.vy = e.vz = 0; e.grounded = true; e.stepUp = 0;
    if (G.W.solid(e.x - e.r + 0.02, e.y + 0.06, e.z - e.r + 0.02, e.x + e.r - 0.02, e.y + e.h - 0.05, e.z + e.r - 0.02)) G.W.unstick(e);
    e.yaw = spawnFace.has ? spawnFace.yaw : openYaw(s) + (Math.random() - 0.5) * 0.2; e.pitch = 0; e.rp = e.ry = 0;
    e.hp = 100; e.alive = true; e.shield = 2; e.spawnAge = 0; e.spawnT = G.t; e.life++; e.power = 0; e.zoom = false; e.stainN = 0; e.stainI = 0;
    fillAmmo(e);
    e.reloadT = 0; e.fireT = 0.3; e.swapT = 0; e.bloom = 0; e.fireBuf = 0;
    if (e.bot) { e.wpn = e.prefW; e.bot.reset(G); }
    ensureMesh(e);
    setGun(e);
    if (e.mesh) e.mesh.visible = !e.isPlayer;
    if (e.isPlayer) ui('respawned')(e);
  };

  /* ============================================================ match */
  var FFA_COLS = [0xff5a5f, 0x3ddc84, 0xffc61a, 0x9b6bff, 0x2fe0b0, 0xff8a1f, 0x3fb8ff, 0xff5fa2, 0xd13cff, 0x7ddc3a];
  var ACCENTS = [0xffe14d, 0xffffff, 0x3fb8ff, 0xff5fa2, 0x3ddc84];
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = (Math.random() * (i + 1)) | 0; var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  G.start = function (opts) {
    opts = opts || {};
    G.mode = opts.mode || 'ffa'; G.diff = opts.diff != null ? opts.diff : 0; G.demo = !!opts.demo;
    geoGen++;
    G.loadMap(opts.map != null ? opts.map : 0);
    for (var i = 0; i < G.ents.length; i++) removeEnt(G.ents[i]);
    G.ents = []; G.player = null;
    shots.n = 0; for (var b = 0; b < balloons.length; b++) balloons[b].on = false;
    fx.clear();
    var cfg = G.cfg[G.mode];
    var names = shuffle(SS.BOT_NAMES.slice());
    var cols = shuffle(FFA_COLS.slice());
    if (!G.demo) {
      var me = opts.me || {};
      var p = new Ent({ name: 'أنت', isPlayer: true, team: G.mode === 'team' ? 1 : 0, color: me.color || 0xff5fa2, hat: me.hat || 'cap', skin: me.skin || SS.SKINS[0], accent: 0xffe14d });
      p.wpn = me.wpn || 0; p.prefW = p.wpn;
      G.ents.push(p); G.player = p;
      cols = cols.filter(function (c) { return c !== p.color; });
    }
    var nb = G.demo ? 6 : cfg.bots, D = SS.BOT_DIFF[G.diff];
    for (var k = 0; k < nb; k++) {
      var team = G.mode === 'team' ? (G.demo ? (k % 2) + 1 : (k < 4 ? 1 : 2)) : 0;
      var e = new Ent({ name: names[k % names.length], team: team, color: cols[k % cols.length], hat: SS.HATS[1 + ((Math.random() * (SS.HATS.length - 1)) | 0)].id,
        skin: SS.SKINS[(Math.random() * SS.SKINS.length) | 0], accent: ACCENTS[k % ACCENTS.length] });
      var r = Math.random();
      e.prefW = r < D.sniperOdds ? 2 : r < D.sniperOdds + 0.27 ? 1 : 0;
      e.wpn = e.prefW;
      e.bot = new SS.Bot(e, G.diff);
      if (team === 1 && !G.demo && k === 0) e.bot.follow = true;
      G.ents.push(e);
    }
    // the match clock starts before anyone spawns: respawn() stamps spawnT with it (bots go easy on a
    // freshly spawned player for a few seconds, measured from spawnT)
    G.t = 0; G.matchT = 0; G.countdown = G.demo ? 0 : 3.2; G.frozen = !G.demo; G.over = false; G.endT = 0; G.timeScale = 1;
    // spread everyone over the spawn points
    for (var j = 0; j < G.ents.length; j++) G.respawn(G.ents[j]);
    purgeGeo();
    for (var q = 0; q < G.pickups.length; q++) { var pk = G.pickups[q]; pk.active = pk.type !== 'power'; pk.t = pk.type === 'power' ? 30 : 0; }
    G.teamScore = [0, 0, 0]; G.firstBlood = false; G.lastCount = 4;
    G.limit = cfg.time; G.target = cfg.target[G.diff] || cfg.target[0];
    G.stats = { balloons: 0, pickups: 0, shots: 0 };
    G.state = G.demo ? 'demo' : 'play';
    ui('matchStart')();
  };

  /* ============================================================ physics */
  function stepEnt(e, dt) {
    var W = G.W;
    // wish velocity
    var mag = Math.sqrt(e.mx * e.mx + e.mz * e.mz);
    var fwdx = -Math.sin(e.yaw), fwdz = -Math.cos(e.yaw);
    var fwdDot = mag > 0.01 ? (e.mx * fwdx + e.mz * fwdz) / mag : 0;
    e.sprinting = e.sprint && mag > 0.5 && fwdDot > 0.5 && e.sprintBlock <= 0 && !e.zoom;
    var sp = e.sprinting ? SPRINT : RUN;
    if (e.zoom) sp *= 0.55;
    if (e.power > 0) sp *= 1.08;
    var wx = e.mx * sp, wz = e.mz * sp;
    if (e.grounded) {
      var k = 1 - Math.exp(-(mag > 0.01 ? ACC : FRIC) * dt);
      e.vx += (wx - e.vx) * k; e.vz += (wz - e.vz) * k;
    } else if (mag > 0.01) {
      // limited air control: steer towards the wish direction without adding speed past it
      var ka = 1 - Math.exp(-AIR * dt);
      e.vx += (wx - e.vx) * ka; e.vz += (wz - e.vz) * ka;
    }
    // jump with coyote time and a small input buffer
    if (e.jumpReq) e.jumpBuf = 0.13;
    e.jumpCd -= dt;
    if (e.jumpBuf > 0 && (e.grounded || e.coyote > 0) && e.jumpCd <= 0 && e.vy <= 0.5) {
      e.vy = JUMP; e.grounded = false; e.coyote = 0; e.jumpBuf = 0; e.jumpCd = 0.2;
      if (e.isPlayer) ui('jumped')(e);
    }
    e.jumpBuf -= dt;
    e.vy -= GRAV * dt;
    if (e.vy < -30) e.vy = -30;
    var wasG = e.grounded, vyBefore = e.vy;
    W.move(e, dt, e.vy <= 0.01);
    if (e.grounded) { e.coyote = COYOTE; if (!wasG) { e.landV = -vyBefore; if (e.isPlayer) ui('landed')(e, -vyBefore); } e.airT = 0; }
    else { e.coyote -= dt; e.airT += dt; }
    var hs = Math.sqrt(e.vx * e.vx + e.vz * e.vz);
    e.moving = e.grounded && hs > 3;
    e.dist += hs * dt;
    if (e.grounded && hs > 1.5) {
      e.stepT -= dt * hs / RUN;
      if (e.stepT <= 0) { e.stepT = 0.37; ui('step')(e); }
    }
    e.walk += dt * hs * 1.6;
  }
  // keep bodies from overlapping
  function separate() {
    var E = G.ents, W = G.W;
    for (var i = 0; i < E.length; i++) {
      var a = E[i]; if (!a.alive) continue;
      for (var j = i + 1; j < E.length; j++) {
        var b = E[j]; if (!b.alive) continue;
        if (Math.abs(a.y - b.y) > 1.5) continue;
        var dx = b.x - a.x, dz = b.z - a.z, d2 = dx * dx + dz * dz;
        if (d2 > 0.5776 || d2 < 1e-6) continue;
        var d = Math.sqrt(d2), push = (0.76 - d) * 0.5;
        dx /= d; dz /= d;
        var ax = a.x - dx * push, az = a.z - dz * push, bx = b.x + dx * push, bz = b.z + dz * push;
        if (!W.solid(ax - a.r, a.y + 0.3, az - a.r, ax + a.r, a.y + a.h, az + a.r)) { a.x = ax; a.z = az; }
        if (!W.solid(bx - b.r, b.y + 0.3, bz - b.r, bx + b.r, b.y + b.h, bz + b.r)) { b.x = bx; b.z = bz; }
      }
    }
  }

  /* ============================================================ shots */
  var SHN = 160;
  var shots = G.shots = {
    n: 0, x: new Float32Array(SHN), y: new Float32Array(SHN), z: new Float32Array(SHN), dx: new Float32Array(SHN), dy: new Float32Array(SHN), dz: new Float32Array(SHN),
    left: new Float32Array(SHN), spd: new Float32Array(SHN), size: new Float32Array(SHN),
    hx: new Float32Array(SHN), hy: new Float32Array(SHN), hz: new Float32Array(SHN), nx: new Float32Array(SHN), ny: new Float32Array(SHN), nz: new Float32Array(SHN),
    dmg: new Float32Array(SHN), head: new Uint8Array(SHN), world: new Uint8Array(SHN), noDecal: new Uint8Array(SHN), w: new Uint8Array(SHN), life: new Int32Array(SHN),
    src: new Array(SHN), tgt: new Array(SHN), col: new Array(SHN)
  };
  var TR = { t: 0, ent: null, head: false, nx: 0, ny: 0, nz: 0, world: false, noDecal: false };
  var rh = { t: 0, nx: 0, ny: 0, nz: 0, box: null };
  function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
    var lx = cx - ox, ly = cy - oy, lz = cz - oz;
    var tc = lx * dx + ly * dy + lz * dz;
    if (tc < 0) return -1;
    var d2 = lx * lx + ly * ly + lz * lz - tc * tc, r2 = r * r;
    if (d2 > r2) return -1;
    return tc - Math.sqrt(r2 - d2);
  }
  G.trace = function (e, ox, oy, oz, dx, dy, dz, range) {
    var hitW = G.W.ray(ox, oy, oz, dx, dy, dz, range, rh, true);
    TR.t = hitW ? rh.t : range; TR.ent = null; TR.head = false; TR.world = hitW;
    TR.nx = rh.nx; TR.ny = rh.ny; TR.nz = rh.nz; TR.noDecal = hitW && rh.box ? rh.box.noDecal : false;
    var E = G.ents, hb = e && e.isPlayer ? 0.04 : 0;   // a hair more forgiving for the player
    for (var i = 0; i < E.length; i++) {
      var o = E[i];
      if (!o.alive || (e && !G.enemy(e, o))) continue;
      var t1 = raySphere(ox, oy, oz, dx, dy, dz, o.x, o.y + SS.HEAD_Y, o.z, SS.HEAD_R + hb);
      if (t1 >= 0 && t1 < TR.t) { TR.t = t1; TR.ent = o; TR.head = true; }
      var t2 = raySphere(ox, oy, oz, dx, dy, dz, o.x, o.y + SS.BODY_Y, o.z, SS.BODY_R + hb);
      if (t2 >= 0 && t2 < TR.t) { TR.t = t2; TR.ent = o; TR.head = false; }
    }
    return TR;
  };
  var MZ = { x: 0, y: 0, z: 0 };
  G.muzzle = function (e, dx, dy, dz) {
    // player: the view model reports where the barrel is; bots: approximate from the body
    if (e.isPlayer && G.ui.muzzle && !G.headless) { G.ui.muzzle(MZ); return MZ; }
    var rx = Math.cos(e.yaw), rz = -Math.sin(e.yaw);
    MZ.x = e.x + rx * 0.25 + dx * 0.75; MZ.y = e.y + 1.0 + dy * 0.75; MZ.z = e.z + rz * 0.25 + dz * 0.75;
    return MZ;
  };
  function addShot(e, mx, my, mz, hx, hy, hz, w, dmg) {
    if (shots.n >= SHN) return;
    var i = shots.n++;
    var dx = hx - mx, dy = hy - my, dz = hz - mz, L = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.001;
    shots.x[i] = mx; shots.y[i] = my; shots.z[i] = mz; shots.dx[i] = dx / L; shots.dy[i] = dy / L; shots.dz[i] = dz / L;
    shots.left[i] = L; shots.spd[i] = WEAPONS[w].speed; shots.size[i] = WEAPONS[w].size;
    shots.hx[i] = hx; shots.hy[i] = hy; shots.hz[i] = hz; shots.nx[i] = TR.nx; shots.ny[i] = TR.ny; shots.nz[i] = TR.nz;
    shots.dmg[i] = dmg; shots.head[i] = TR.head ? 1 : 0; shots.world[i] = TR.world && !TR.ent ? 1 : 0; shots.noDecal[i] = TR.noDecal ? 1 : 0; shots.w[i] = w;
    shots.src[i] = e; shots.tgt[i] = TR.ent; shots.life[i] = TR.ent ? TR.ent.life : 0; shots.col[i] = G.paint(e);
  }
  var SHOT_ARRAYS = ['x', 'y', 'z', 'dx', 'dy', 'dz', 'left', 'spd', 'size', 'hx', 'hy', 'hz', 'nx', 'ny', 'nz', 'dmg', 'head', 'world', 'noDecal', 'w', 'life', 'src', 'tgt', 'col'].map(function (k) { return shots[k]; });
  function killShot(i) {
    var n = --shots.n;
    if (i !== n) for (var k = 0; k < SHOT_ARRAYS.length; k++) { var a = SHOT_ARRAYS[k]; a[i] = a[n]; }
    shots.src[n] = shots.tgt[n] = null;
  }
  function updateShots(dt) {
    for (var i = 0; i < shots.n; i++) {
      var step = shots.spd[i] * dt;
      if (step < shots.left[i]) {
        shots.left[i] -= step;
        shots.x[i] += shots.dx[i] * step; shots.y[i] += shots.dy[i] * step; shots.z[i] += shots.dz[i] * step;
        continue;
      }
      arrive(i);
      killShot(i); i--;
    }
  }
  function arrive(i) {
    var tgt = shots.tgt[i], col = shots.col[i], w = shots.w[i];
    var hx = shots.hx[i], hy = shots.hy[i], hz = shots.hz[i];
    if (tgt) {
      if (tgt.alive && tgt.life === shots.life[i]) {
        G.damage(tgt, shots.dmg[i], shots.src[i], !!shots.head[i], shots.dx[i], shots.dz[i], w);
        if (!G.headless) {
          // splat on the buddy, flying back along the shot
          var bx = tgt.x + (hx - tgt.x) * 0.9, bz = tgt.z + (hz - tgt.z) * 0.9;
          fx.burst(bx, hy, bz, col, shots.head[i] ? 9 : 6, 3.2, 0.055, 1.2, -shots.dx[i], -shots.dy[i], -shots.dz[i]);
          if (tgt.alive) stain(tgt, hx, hy, hz, col, w === 2 ? 0.16 : 0.1);
        }
      }
    } else if (!G.headless) {
      if (shots.world[i]) {
        if (!shots.noDecal[i]) fx.decal(hx, hy, hz, shots.nx[i], shots.ny[i], shots.nz[i], WEAPONS[w].decal * (0.75 + Math.random() * 0.5), col);
        fx.burst(hx + shots.nx[i] * 0.05, hy + shots.ny[i] * 0.05, hz + shots.nz[i] * 0.05, col, 4, 2.2, 0.04, 1, shots.nx[i], shots.ny[i], shots.nz[i]);
        ui('wallHit')(hx, hy, hz, shots.src[i]);
      }
    }
  }

  // stick a paint blob on the body or head surface, in the buddy's own frame so it moves with it
  function stain(t, hx, hy, hz, col, size) {
    var dx = hx - t.x, dz = hz - t.z, cy = Math.cos(t.yaw), sy = Math.sin(t.yaw);
    var lx = dx * cy - dz * sy, lz = dx * sy + dz * cy, ly = hy - t.y;
    var head = ly > SS.HEAD_Y - 0.2, c = head ? SS.HEAD_Y : SS.BODY_Y, R = head ? SS.HEAD_R * 0.93 : SS.BODY_R * 0.9;
    var vy = (ly - c) * (head ? 1 : 1.08), L = Math.sqrt(lx * lx + vy * vy + lz * lz) || 1;
    var i = t.stainI; t.stainI = (i + 1) % 6; if (t.stainN < 6) t.stainN++;
    t.stains[i * 4] = lx / L * R; t.stains[i * 4 + 1] = c + vy / L * R * (head ? 1 : 0.92); t.stains[i * 4 + 2] = lz / L * R; t.stains[i * 4 + 3] = size * (0.8 + Math.random() * 0.5);
    t.stainCol[i] = col;
  }

  /* ============================================================ weapons */
  var TMPD = { x: 0, y: 0, z: 0 };
  function aimDir(e, out) {
    var yaw = e.yaw + e.ry, pit = e.pitch + e.rp, cp = Math.cos(pit);
    out.x = -Math.sin(yaw) * cp; out.y = Math.sin(pit); out.z = -Math.cos(yaw) * cp;
    return out;
  }
  G.aimDir = aimDir;
  function fire(e) {
    var W = WEAPONS[e.wpn], wi = e.wpn;
    e.ammo[wi]--; e.fireT = W.rate; e.lastFireT = G.t; e.sprintBlock = 0.3; e.kick = wi === 0 ? 0.6 : 1;
    if (e.shield > 0) e.shield = 0;
    var d = aimDir(e, TMPD), dx = d.x, dy = d.y, dz = d.z;
    var ex = e.x, ey = e.y + SS.EYE_H, ez = e.z;
    // spread: base + moving + airborne + bloom
    var hs = Math.sqrt(e.vx * e.vx + e.vz * e.vz);
    var spread = (wi === 2 && e.zoom ? W.zoomSpread : W.spread) + Math.min(1, hs / RUN) * W.moveSpread + (e.grounded ? 0 : W.airSpread) + e.bloom;
    // basis around the aim direction
    var rx = Math.cos(e.yaw + e.ry), rz = -Math.sin(e.yaw + e.ry);          // right
    var ux = dy * rz, uy = dz * rx - dx * rz, uz = -dy * rx;                 // up = d x r
    var ul = Math.sqrt(ux * ux + uy * uy + uz * uz) || 1; ux /= ul; uy /= ul; uz /= ul;
    var mult = (e.power > 0 ? 2 : 1) * (e.bot && !e.autopilot ? e.bot.D.dmg : 1);
    var mz = G.muzzle(e, dx, dy, dz);
    var anyHit = false;
    for (var p = 0; p < W.pellets; p++) {
      var a, rr;
      if (W.pellets > 1) { if (p === 0) { a = 0; rr = 0; } else { a = (p - 1) / (W.pellets - 1) * Math.PI * 2 + Math.random() * 0.5; rr = spread * (0.55 + Math.random() * 0.45); } }
      else { a = Math.random() * Math.PI * 2; rr = Math.sqrt(Math.random()) * spread; }
      var ca = Math.cos(a) * rr, sa = Math.sin(a) * rr;
      var px = dx + rx * ca + ux * sa, py = dy + uy * sa, pz = dz + rz * ca + uz * sa;
      var pl = Math.sqrt(px * px + py * py + pz * pz); px /= pl; py /= pl; pz /= pl;
      var tr = G.trace(e, ex, ey, ez, px, py, pz, W.range);
      var dist = tr.t, fall = dist <= W.fall0 ? 1 : dist >= W.fall1 ? W.fallMin : 1 - (1 - W.fallMin) * (dist - W.fall0) / (W.fall1 - W.fall0);
      var dmg = W.dmg * fall * (tr.head ? W.head : 1) * mult;
      var hx = ex + px * dist, hy = ey + py * dist, hz = ez + pz * dist;
      if (tr.ent || tr.world || dist < W.range) anyHit = true;
      addShot(e, mz.x, mz.y, mz.z, hx, hy, hz, wi, dmg);
      if (wi === 2 && !G.headless) fx.tracer(mz.x, mz.y, mz.z, hx, hy, hz, G.paint(e));
    }
    e.shots += W.pellets;
    if (e.isPlayer) G.stats.shots += W.pellets;
    e.rp += W.recoil * (0.8 + Math.random() * 0.4);
    e.ry += (Math.random() - 0.5) * W.recoilYaw * 2;
    e.bloom = Math.min(W.bloomMax, e.bloom + W.bloom);
    ui('fired')(e, wi, mz);
  }
  function startReload(e) {
    var W = WEAPONS[e.wpn];
    if (e.reloadT > 0 || e.ammo[e.wpn] >= W.mag || e.res[e.wpn] <= 0) return;
    e.reloadT = W.reload; e.zoom = false;
    if (e.isPlayer) ui('reload')(e);
  }
  function updateWeapons(e, dt) {
    e.fireT -= dt; e.nadeCd -= dt; e.sprintBlock -= dt;
    e.bloom = Math.max(0, e.bloom - dt * 0.07);
    var rk = Math.min(1, dt * 8);
    e.rp -= e.rp * rk; e.ry -= e.ry * rk;
    if (e.swapT > 0) e.swapT -= dt;
    if (e.reloadT > 0) {
      e.reloadT -= dt;
      if (e.reloadT <= 0) {
        var W0 = WEAPONS[e.wpn], need = W0.mag - e.ammo[e.wpn], take = Math.min(need, e.res[e.wpn]);
        e.ammo[e.wpn] += take; e.res[e.wpn] -= take; e.reloadT = 0;
        if (e.isPlayer) ui('reloaded')(e);
      }
    }
    if (e.wantSwap >= 0 && e.wantSwap !== e.wpn && e.wantSwap < 3) {
      e.lastW = e.wpn; e.wpn = e.wantSwap; e.swapT = 0.3; e.reloadT = 0; e.zoom = false; e.fireT = Math.max(e.fireT, 0.05);
      setGun(e);
      if (e.isPlayer) ui('swapped')(e);
    }
    e.wantSwap = -1;
    if (e.wantReload) startReload(e);
    var W = WEAPONS[e.wpn];
    // pump / bolt blasters: a click during the cooldown is remembered for 0.2 s, and holding re-fires at the
    // blaster's own rate (kids spam-click or hold; neither should feel ignored)
    e.fireBuf -= dt;
    if (e.fireP) e.fireBuf = e.isPlayer && !e.autopilot ? 0.2 : 0.001;   // bots decide every tick, no buffering
    var want = W.auto ? e.fire : (e.fireBuf > 0 || (e.fire && e.isPlayer));
    if (want && e.fireT <= 0 && e.swapT <= 0 && e.reloadT <= 0) {
      e.fireBuf = 0;
      if (e.ammo[e.wpn] > 0) fire(e);
      else if (e.res[e.wpn] > 0) startReload(e);
      else {
        e.fireT = 0.3;
        if (e.isPlayer) ui('empty')(e);
        else { for (var w = 0; w < 3; w++) if (e.ammo[w] + e.res[w] > 0) { e.wantSwap = w; break; } }
      }
    }
    if (e.wantThrow && e.balloons > 0 && e.nadeCd <= 0 && e.swapT <= 0) throwBalloon(e);
    e.wantThrow = false;
  }

  /* ============================================================ balloons */
  var balloons = G.balloons = [];
  for (var bi = 0; bi < 16; bi++) balloons.push({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, t: 0, owner: null, col: null, spin: 0 });
  G.throwVel = function (e, out) {
    var d = aimDir(e, out);
    out.x = d.x * BAL.speed + e.vx * 0.4; out.y = d.y * BAL.speed + BAL.up + Math.max(0, e.vy) * 0.3; out.z = d.z * BAL.speed + e.vz * 0.4;
    return out;
  };
  G.throwStart = function (e, out) {
    var rx = Math.cos(e.yaw), rz = -Math.sin(e.yaw), d = aimDir(e, TMPD);
    out.x = e.x + d.x * 0.5 + rx * 0.18; out.y = e.y + SS.EYE_H - 0.1 + d.y * 0.5; out.z = e.z + d.z * 0.5 + rz * 0.18;
    return out;
  };
  var TV = { x: 0, y: 0, z: 0 }, TS = { x: 0, y: 0, z: 0 };
  function throwBalloon(e) {
    var b = null;
    for (var i = 0; i < balloons.length; i++) if (!balloons[i].on) { b = balloons[i]; break; }
    if (!b) return;
    G.throwStart(e, TS); G.throwVel(e, TV);
    b.on = true; b.x = TS.x; b.y = TS.y; b.z = TS.z; b.vx = TV.x; b.vy = TV.y; b.vz = TV.z; b.t = 0; b.owner = e; b.col = G.paint(e); b.spin = Math.random() * 6;
    e.balloons--; e.nadeCd = 0.8; e.thrown++; e.lastFireT = G.t;
    if (e.shield > 0) e.shield = 0;
    if (e.isPlayer) G.stats.balloons++;
    ui('threw')(e);
  }
  // bots: pitch/yaw that lands a balloon at (x,y,z) (low arc), or null
  G.solveThrow = function (e, x, y, z) {
    var sx = e.x, sy = e.y + SS.EYE_H - 0.1, sz = e.z;
    var dx = x - sx, dz = z - sz, dh = Math.sqrt(dx * dx + dz * dz), dy = y - sy;
    var v = BAL.speed, g = BAL.grav, up = BAL.up;
    function f(th) { var vh = v * Math.cos(th), vv = v * Math.sin(th) + up, t = dh / Math.max(0.1, vh); return vv * t - 0.5 * g * t * t - dy; }
    var lo = -0.7, hi = 0.75;
    if (f(hi) < 0) return null;
    if (f(lo) > 0) return { yaw: Math.atan2(-dx, -dz), pitch: lo };
    for (var i = 0; i < 22; i++) { var mid = (lo + hi) / 2; if (f(mid) > 0) hi = mid; else lo = mid; }
    return { yaw: Math.atan2(-dx, -dz), pitch: (lo + hi) / 2 };
  };
  var brh = { t: 0, nx: 0, ny: 0, nz: 0, box: null };
  function updateBalloons(dt) {
    var W = G.W;
    for (var i = 0; i < balloons.length; i++) {
      var b = balloons[i];
      if (!b.on) continue;
      b.t += dt; b.spin += dt * 5;
      b.vy -= BAL.grav * dt;
      var sx = b.vx * dt, sy = b.vy * dt, sz = b.vz * dt, L = Math.sqrt(sx * sx + sy * sy + sz * sz);
      var hit = false;
      if (L > 0 && W.ray(b.x, b.y, b.z, sx / L, sy / L, sz / L, L + 0.12, brh, true)) {
        b.x += sx / L * Math.max(0, brh.t - 0.12); b.y += sy / L * Math.max(0, brh.t - 0.12); b.z += sz / L * Math.max(0, brh.t - 0.12);
        hit = true;
      } else { b.x += sx; b.y += sy; b.z += sz; }
      if (!hit) {
        for (var j = 0; j < G.ents.length; j++) {
          var o = G.ents[j];
          if (!o.alive || o === b.owner || (b.owner && !G.enemy(b.owner, o))) continue;
          var ox = o.x - b.x, oy = o.y + 0.9 - b.y, oz = o.z - b.z;
          if (ox * ox + oz * oz < 0.5 && oy * oy < 1.1) { hit = true; break; }
        }
      }
      if (hit || b.t > 4 || b.y < -1) { b.on = false; burst(b.x, b.y, b.z, b.owner, b.col); }
    }
  }
  var DIRS = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0.7, -0.7, 0], [-0.7, -0.7, 0], [0, -0.7, 0.7], [0, -0.7, -0.7], [0, -1, 0]];
  function burst(x, y, z, owner, col) {
    var W = G.W, R = BAL.radius;
    for (var i = 0; i < G.ents.length; i++) {
      var o = G.ents[i];
      if (!o.alive || o === owner || (owner && !G.enemy(owner, o))) continue;
      var dx = o.x - x, dy = o.y + 0.9 - y, dz = o.z - z, d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > R + 0.4) continue;
      if (!W.los(x, y + 0.1, z, o.x, o.y + 0.9, o.z) && !W.los(x, y + 0.1, z, o.x, o.y + 1.5, o.z)) continue;
      var k = Math.max(0, Math.min(1, (d - 0.4) / R));
      var mult = (owner && owner.power > 0 ? 1.6 : 1) * (owner && owner.bot && !owner.autopilot ? owner.bot.D.dmg : 1);
      G.damage(o, BAL.dmg * (1 - 0.72 * k) * mult, owner, false, dx / (d || 1), dz / (d || 1), 3);
    }
    if (G.headless) return;
    fx.burst(x, y + 0.2, z, col, 46, 7.5, 0.1, 2.5);
    fx.burst(x, y + 0.2, z, col, 16, 3.5, 0.16, 3);
    for (var k2 = 0; k2 < DIRS.length; k2++) {
      var D = DIRS[k2], l = Math.sqrt(D[0] * D[0] + D[1] * D[1] + D[2] * D[2]);
      if (W.ray(x, y + 0.2, z, D[0] / l, D[1] / l, D[2] / l, R, brh, true) && !(brh.box && brh.box.noDecal)) {
        var t = brh.t;
        fx.decal(x + D[0] / l * t, y + 0.2 + D[1] / l * t, z + D[2] / l * t, brh.nx, brh.ny, brh.nz, k2 === 8 ? 2.6 : 1.3 + Math.random() * 0.6, col);
      }
    }
    ui('balloonPop')(x, y, z, owner);
  }

  /* ============================================================ damage */
  G.damage = function (v, amt, src, head, dx, dz, w) {
    if (!v.alive || G.over) return;
    if (src && src !== v && !G.enemy(src, v)) return;
    // bots are gentler with each other than with you: longer matches, more splats for the player
    if (src && src.bot && v.bot && !src.autopilot && !v.autopilot) amt *= src.bot.D.bvb;
    if (v.shield > 0) { ui('shieldHit')(v, src); return; }
    if (v.god) amt = 0;
    amt = Math.round(amt);
    v.hp -= amt; v.lastHitT = G.t; v.flash = 0.1;
    if (src && w !== 3) { src.hits++; if (head) src.heads++; }
    if (v.bot) v.bot.hurt(G, src);
    if (src && src.isPlayer) ui('hitMarker')(v, amt, head, v.hp <= 0, w);
    if (v.isPlayer) ui('hurt')(v, src, amt, dx, dz);
    if (v.hp <= 0) splat(v, src, head, w);
  };
  function splat(v, src, head, w) {
    v.alive = false; v.hp = 0; v.deaths++; v.streak = 0; v.respawnT = 2.0; v.life++; v.zoom = false; v.reloadT = 0;
    v.killer = src;
    var first = false, revenge = false;
    if (src && src !== v) {
      src.kills++; src.streak++; if (src.streak > src.best) src.best = src.streak;
      src.multi = (G.t - src.lastKillT < 3.5) ? src.multi + 1 : 1; src.lastKillT = G.t;
      if (G.mode === 'team') G.teamScore[src.team]++;
      if (!G.firstBlood) { G.firstBlood = true; first = true; }
      if (src.nemesis === v) { revenge = true; src.nemesis = null; }
      v.nemesis = src;
    }
    if (v.mesh) v.mesh.visible = false;
    if (!G.headless) {
      var col = G.paint(v);
      fx.burst(v.x, v.y + 0.9, v.z, col, 38, 6.5, 0.12, 2.2);
      fx.burst(v.x, v.y + 1.3, v.z, [1, 1, 1], 8, 4, 0.08, 2);
      if (!Kit.motion.reduced()) fx.confetti(v.x, v.y + 1.1, v.z, 26, 4.5);   // the paint pop alone with reduced motion
      if (G.W.ray(v.x, v.y + 0.5, v.z, 0, -1, 0, 4, brh, true)) fx.decal(v.x, v.y + 0.5 - brh.t, v.z, brh.nx, brh.ny, brh.nz, 1.9, col);
    }
    ui('splat')(v, src, head, w, first, revenge);
    checkEnd();
  }

  /* ============================================================ pickups */
  var PICK_T = { hp: 15, ammo: 12, power: 45 };
  function applyPickup(e, p) {
    if (p.type === 'hp') { if (e.hp >= 100) return false; e.hp = Math.min(100, e.hp + 50); }
    else if (p.type === 'ammo') {
      var full = e.balloons >= BAL.max;
      for (var w = 0; w < 3; w++) if (e.res[w] < WEAPONS[w].res) full = false;
      if (full) return false;
      for (var w2 = 0; w2 < 3; w2++) e.res[w2] = WEAPONS[w2].res;
      e.balloons = Math.min(BAL.max, e.balloons + 1);
    } else { e.power = 12; }
    return true;
  }
  function updatePickups(dt) {
    for (var i = 0; i < G.pickups.length; i++) {
      var p = G.pickups[i];
      if (!p.active) { p.t -= dt; if (p.t <= 0) { p.active = true; ui('pickupBack')(p); } continue; }
      for (var j = 0; j < G.ents.length; j++) {
        var e = G.ents[j];
        if (!e.alive) continue;
        var dx = e.x - p.x, dz = e.z - p.z;
        if (dx * dx + dz * dz < 1.1 && Math.abs(e.y - p.y) < 1.3 && applyPickup(e, p)) {
          p.active = false; p.t = PICK_T[p.type]; e.picks++;
          if (e.isPlayer) G.stats.pickups++;
          ui('picked')(e, p);
          break;
        }
      }
    }
  }

  /* ============================================================ rules */
  function checkEnd() {
    if (G.over || G.demo) return;
    var done = false;
    if (G.mode === 'team') { if (G.teamScore[1] >= G.target || G.teamScore[2] >= G.target) done = true; }
    else for (var i = 0; i < G.ents.length; i++) if (G.ents[i].kills >= G.target) done = true;
    if (G.matchT >= G.limit) done = true;
    if (done) endMatch();
  }
  function endMatch() {
    G.over = true; G.endT = 0; G.timeScale = 0.35;
    for (var i = 0; i < G.ents.length; i++) { var e = G.ents[i]; e.fire = e.fireP = false; e.mx = e.mz = 0; }
    ui('matchEnding')();
  }
  // ranking: more splats, then fewer times splatted, then whoever reached that score first. 0 = a real tie
  function rankCmp(a, b) { return b.kills - a.kills || a.deaths - b.deaths || (a.kills ? a.lastKillT : 0) - (b.kills ? b.lastKillT : 0); }
  G.rankCmp = rankCmp;
  G.results = function () {
    var list = G.ents.slice().sort(rankCmp);
    var p = G.player, place = 1, tie = [], win;
    for (var i = 0; i < list.length; i++) {
      var o = list[i]; if (o === p) continue;
      var c = rankCmp(o, p);
      if (c < 0) place++; else if (c === 0) tie.push(o);
    }
    if (G.mode === 'team') win = G.teamScore[1] > G.teamScore[2] ? 1 : G.teamScore[2] > G.teamScore[1] ? 2 : 0;
    else win = place === 1 && !tie.length ? 1 : 0;
    return { list: list, place: place, tie: tie, win: win, team: G.mode === 'team', scores: G.teamScore.slice(), time: G.matchT };
  };

  // one fixed simulation step
  G.update = function (dt) {
    if (G.state !== 'play' && G.state !== 'demo') return;
    dt *= G.timeScale;
    G.t += dt;
    if (G.over) { G.endT += dt / G.timeScale; }
    if (G.countdown > 0) {
      G.countdown -= dt;
      var c = Math.ceil(G.countdown);
      if (c !== G.lastCount) { G.lastCount = c; ui('countdown')(c); }
      G.frozen = G.countdown > 0;
    } else if (!G.over) G.matchT += dt;
    var E = G.ents, i, e;
    for (i = 0; i < E.length; i++) { e = E[i]; e.px = e.x; e.py = e.y; e.pz = e.z; }
    for (i = 0; i < E.length; i++) { e = E[i]; if (e.bot) e.bot.tick(G, dt); }
    for (i = 0; i < E.length; i++) {
      e = E[i];
      if (!e.alive) {
        if (!G.over) { e.respawnT -= dt; if (e.respawnT <= 0) G.respawn(e); }
        continue;
      }
      if (G.frozen || G.over) { e.mx = e.mz = 0; e.fire = e.fireP = false; e.jumpReq = false; e.wantThrow = false; }
      stepEnt(e, dt);
      if (!G.frozen) updateWeapons(e, dt);
      if (e.shield > 0) { e.spawnAge += dt; if (e.spawnAge > 1 || e.mx * e.mx + e.mz * e.mz > 0.01) e.shield -= dt; }
      if (e.power > 0) e.power -= dt;
      if (e.flash > 0) e.flash -= dt;
      if (e.hp < 100 && G.t - e.lastHitT > 5) e.hp = Math.min(100, e.hp + 16 * dt);
      e.fireP = false; e.jumpReq = false;
    }
    separate();
    updateShots(dt);
    updateBalloons(dt);
    updatePickups(dt);
    if (!G.over && !G.frozen && G.matchT >= G.limit) checkEnd();
  };

  /* ============================================================ simulate (tests) */
  G.simulate = function (sec, opts) {
    opts = opts || {};
    var was = G.headless, lite = fx.lite;
    G.headless = !opts.visual; fx.lite = true;
    var P = G.player;
    if (P && opts.autopilot && !P.bot) { P.bot = new SS.Bot(P, opts.autopilotDiff != null ? opts.autopilotDiff : G.diff); P.bot.reset(G); P.autopilot = true; }
    var cells = {}, upper = {}, total = 0, maxStill = 0, still = {}, t0 = performance.now();
    var n = Math.round(sec * 60), steps = 0, inside = 0, below = 0, outside = 0, W = G.W, lim = W.half;
    for (var i = 0; i < n; i++) {
      G.update(1 / 60); steps++;
      // physics sanity: nobody inside geometry, under the floor or outside the arena
      for (var q = 0; q < G.ents.length; q++) {
        var z = G.ents[q];
        if (!z.alive) continue;
        if (W.solid(z.x - z.r + 0.05, z.y + 0.1, z.z - z.r + 0.05, z.x + z.r - 0.05, z.y + z.h - 0.1, z.z + z.r - 0.05)) inside++;
        if (z.y < -0.05) below++;
        if (Math.abs(z.x) > lim || Math.abs(z.z) > lim) outside++;
      }
      if (i % 30 === 0) {
        for (var j = 0; j < G.ents.length; j++) {
          var e = G.ents[j];
          if (!e.alive || !e.bot) continue;
          var key = Math.floor((e.x + 20) / 4) + ',' + Math.floor((e.z + 20) / 4);
          cells[key] = (cells[key] || 0) + 1;
          if (e.y > 1.9) upper[e.name] = (upper[e.name] || 0) + 1;
          var sk = e.id, pos = Math.round(e.x) + ',' + Math.round(e.z);
          if (!still[sk] || still[sk].p !== pos) still[sk] = { p: pos, n: 0 }; else { still[sk].n++; maxStill = Math.max(maxStill, still[sk].n); }
        }
      }
      if (G.over && G.endT > 0.1 && !opts.keepGoing) break;
    }
    var ms = performance.now() - t0;
    if (P && P.autopilot) { P.bot = null; P.autopilot = false; }
    G.headless = was; fx.lite = lite;
    var ents = G.ents.map(function (e) { return { name: e.name, bot: !!e.bot, team: e.team, w: e.prefW, kills: e.kills, deaths: e.deaths, acc: e.shots ? +(e.hits / e.shots).toFixed(2) : 0, shots: e.shots, heads: e.heads, dist: Math.round(e.dist), thrown: e.thrown, picks: e.picks, best: e.best, alive: e.alive, x: +e.x.toFixed(1), y: +e.y.toFixed(1), z: +e.z.toFixed(1) }; });
    return { simSec: +(steps / 60).toFixed(1), ms: Math.round(ms), inside: inside, below: below, outside: outside, matchT: +G.matchT.toFixed(1), over: G.over, team: G.teamScore.slice(1), cells: Object.keys(cells).length, upperVisits: upper, maxStillSec: maxStill * 0.5, ents: ents };
  };
})();
