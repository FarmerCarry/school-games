/* Shortcut Factory: the view. Builds the factory from hall.js and actors.js, draws the
 * engine's world every frame with instanced toys, and turns the engine's events into
 * flights, pops, sparks and a box that closes and rolls away. It never changes the world. */
(function () {
  'use strict';
  var SF = window.SF, H = SF.art;

  SF.createView = function (canvas) {
    var T = window.THREE;
    if (!T) throw new Error('three.js missing');
    var wgl = Kit.webgl.createRenderer(canvas, { alpha: false, srgb: true });
    var software = wgl.software, renderer = wgl.renderer, ratio = wgl.ratio;
    renderer.setClearColor(0xa9dcff, 1);
    var scene = new T.Scene();
    scene.fog = new T.Fog(0xa9dcff, 26, 46);
    var camera = new T.PerspectiveCamera(36, 16 / 9, 0.5, 80);
    var CAM = { x: 0.6, y: 10.6, z: 11.6, lx: 0.6, ly: 1.2, lz: -0.6 };
    camera.position.set(CAM.x, CAM.y, CAM.z); camera.lookAt(CAM.lx, CAM.ly, CAM.lz);
    scene.add(new T.HemisphereLight(0xffffff, 0x9a8fcf, 1.55));
    var sun = new T.DirectionalLight(0xffffff, 1.6); sun.position.set(-4, 12, 8); scene.add(sun);

    H.init(T);
    var LAY = SF.LAY, B = SF.BELT, BY = LAY.BY, A = B.arm;
    var hall = SF.buildHall(T, scene);
    var arm = SF.buildArm(T, scene);
    var clip = SF.buildClip(T, scene);
    var grem = SF.buildGremlin(T, scene);
    var boxes = [SF.buildBox(T, scene, 1), SF.buildBox(T, scene, 1), SF.buildBox(T, scene, 1)];
    var signA = SF.buildSign(T, scene, 1, 0xffb020), signB = SF.buildSign(T, scene, 0.62, 0x7d8bb8);
    signA.group.position.set(LAY.BOX_X, 3.55, -0.9);
    signB.group.position.set(LAY.NEXT_X + 0.1, 2.75, LAY.NEXT_Z - 0.6);
    var CLIP_POS = new T.Vector3(A - 3.6, 3.7, -1.1);
    clip.group.position.copy(CLIP_POS);

    /* ------------------------------------------------------------ batches */
    var M = new T.Matrix4(), Q = new T.Quaternion(), E = new T.Euler(), V = new T.Vector3(), S = new T.Vector3(), C = new T.Color();
    function batch(geo, mat, cap, colored) {
      var m = new T.InstancedMesh(geo, mat, cap);
      m.instanceMatrix.setUsage(T.DynamicDrawUsage);
      if (colored) { m.instanceColor = new T.InstancedBufferAttribute(new Float32Array(cap * 3), 3); m.instanceColor.setUsage(T.DynamicDrawUsage); }
      m.count = 0; m.frustumCulled = false;
      scene.add(m);
      return m;
    }
    function put(m, x, y, z, rx, ry, rz, sx, sy, sz, col) {
      if (m.count >= m.instanceMatrix.count) return;
      M.compose(V.set(x, y, z), Q.setFromEuler(E.set(rx, ry, rz)), S.set(sx, sy, sz));
      m.setMatrixAt(m.count, M);
      if (col) m.setColorAt(m.count, col);
      m.count++;
    }
    var TOY_CAP = 48, GHOST_CAP = 16;
    var bodyMat = new T.MeshLambertMaterial({ vertexColors: true });
    var detailMat = new T.MeshLambertMaterial({ vertexColors: true });
    var ghostMat = new T.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.38, depthWrite: false });
    var toyB = [], toyD = [], toyG = [];
    for (var k = 0; k < 5; k++) {
      var parts = H.toyParts(k);
      toyB.push(batch(parts.body, bodyMat, TOY_CAP, true));
      toyD.push(batch(parts.detail, detailMat, TOY_CAP, false));
      var g = batch(parts.body, ghostMat, GHOST_CAP, true); g.renderOrder = 2; toyG.push(g);
    }
    var COL = SF.COLORS.map(function (c) { return new T.Color(c); });
    COL.push(new T.Color(0x8d8a86)); // 5: broken grey
    var HOLO = new T.Color(0x9ff4ff);
    // One toy: c is a colour index (5 = broken), mode 1 draws a see-through ghost.
    function toy(k, c, x, y, z, rx, ry, rz, s, mode) {
      if (s <= 0.01) return;
      if (mode === 1) { put(toyG[k], x, y, z, rx, ry, rz, s, s, s, COL[c]); return; }
      put(toyB[k], x, y, z, rx, ry, rz, s, s, s, COL[c]);
      put(toyD[k], x, y, z, rx, ry, rz, s, s, s, null);
    }

    // Blob shadows, selection rings and arrows, order slots, particles.
    var shadowTex = H.canvasTex(64, 64, function (gc, w, h) {
      var gr = gc.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
      gr.addColorStop(0, 'rgba(30,30,60,0.42)'); gr.addColorStop(1, 'rgba(30,30,60,0)');
      gc.fillStyle = gr; gc.fillRect(0, 0, w, h);
    });
    var shadowGeo = new T.PlaneGeometry(1, 1); shadowGeo.rotateX(-Math.PI / 2);
    var shadows = batch(shadowGeo, new T.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }), TOY_CAP, false);
    shadows.renderOrder = 1;
    var ringGeo = new T.TorusGeometry(0.62, 0.075, 8, 32); ringGeo.rotateX(Math.PI / 2);
    var rings = batch(ringGeo, new T.MeshBasicMaterial({ color: 0xffe14d }), TOY_CAP, false);
    var arrowGeo = new T.ConeGeometry(0.2, 0.36, 4); arrowGeo.rotateX(Math.PI);
    var arrows = batch(arrowGeo, new T.MeshLambertMaterial({ color: 0xffd23f, emissive: 0x6b4a00 }), TOY_CAP, false);
    var discGeo = new T.CylinderGeometry(1, 1, 0.04, 22); discGeo.rotateX(Math.PI / 2);
    var discs = batch(discGeo, new T.MeshBasicMaterial({ vertexColors: false }), 24, true);
    var PCAP = software ? 90 : 180;
    var sparks = batch(new T.IcosahedronGeometry(1, 0), new T.MeshBasicMaterial(), PCAP, true);
    sparks.renderOrder = 5;
    var DISC_DONE = new T.Color(0x35d07f), DISC_EMPTY = new T.Color(0xe7ebf6), DISC_NEXT = new T.Color(0xdfe4f2);

    /* ---------------------------------------------------------- particles */
    var P = { n: 0, x: new Float32Array(PCAP), y: new Float32Array(PCAP), z: new Float32Array(PCAP), vx: new Float32Array(PCAP), vy: new Float32Array(PCAP), vz: new Float32Array(PCAP),
      life: new Float32Array(PCAP), max: new Float32Array(PCAP), size: new Float32Array(PCAP), grav: new Float32Array(PCAP), col: [] };
    for (var pi = 0; pi < PCAP; pi++) P.col.push(new T.Color());
    var view = { calm: false };
    view.burst = function (x, y, z, o) {
      var n = o.count || 10;
      for (var i = 0; i < n; i++) {
        if (P.n >= PCAP) return;
        var j = P.n++, a = Math.random() * Math.PI * 2, sp = (o.speed || 3) * (0.4 + Math.random() * 0.8);
        P.x[j] = x; P.y[j] = y; P.z[j] = z;
        P.vx[j] = Math.cos(a) * sp; P.vz[j] = Math.sin(a) * sp * 0.7; P.vy[j] = (o.up || 2) * (0.5 + Math.random());
        P.max[j] = P.life[j] = (o.life || 0.7) * (0.7 + Math.random() * 0.6);
        P.size[j] = (o.size || 0.1) * (0.7 + Math.random() * 0.6);
        P.grav[j] = o.gravity == null ? 7 : o.gravity;
        P.col[j].set(o.colors[i % o.colors.length]);
      }
    };
    function stepParticles(dt) {
      for (var i = P.n - 1; i >= 0; i--) {
        P.life[i] -= dt;
        if (P.life[i] <= 0) {
          var l = --P.n;
          P.x[i] = P.x[l]; P.y[i] = P.y[l]; P.z[i] = P.z[l]; P.vx[i] = P.vx[l]; P.vy[i] = P.vy[l]; P.vz[i] = P.vz[l];
          P.life[i] = P.life[l]; P.max[i] = P.max[l]; P.size[i] = P.size[l]; P.grav[i] = P.grav[l]; P.col[i].copy(P.col[l]);
          continue;
        }
        P.vy[i] -= P.grav[i] * dt;
        P.x[i] += P.vx[i] * dt; P.y[i] += P.vy[i] * dt; P.z[i] += P.vz[i] * dt;
        if (P.y[i] < 0.03) { P.y[i] = 0.03; P.vy[i] *= -0.4; P.vx[i] *= 0.7; P.vz[i] *= 0.7; }
      }
      sparks.count = 0;
      for (var j = 0; j < P.n; j++) { var s = P.size[j] * Math.min(1, P.life[j] / P.max[j] * 2.5); put(sparks, P.x[j], P.y[j], P.z[j], P.life[j] * 3, P.life[j] * 2, 0, s, s, s, P.col[j]); }
      sparks.instanceMatrix.needsUpdate = true;
      if (sparks.instanceColor) sparks.instanceColor.needsUpdate = true;
    }
    view.particleCount = function () { return P.n; };

    /* ------------------------------------------------------------ flights */
    // A small pool of moving toys: arcs into the box, lifts to the clipboard, shrinks.
    var FCAP = 24, F = [];
    for (var fi = 0; fi < FCAP; fi++) F.push({ on: false, kind: '', k: 0, c: 0, t: 0, dur: 0.4, ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0, h: 0, s0: 1, s1: 1, spin: 0, ghost: 0, box: -1, line: -1, land: '' });
    function fly(kind, k, c, ax, ay, az, bx, by, bz, o) {
      for (var i = 0; i < FCAP; i++) {
        var f = F[i];
        if (f.on) continue;
        f.on = true; f.kind = kind; f.k = k; f.c = c; f.t = 0; f.dur = o.dur || 0.45;
        f.ax = ax; f.ay = ay; f.az = az; f.bx = bx; f.by = by; f.bz = bz;
        f.h = o.h || 0; f.s0 = o.s0 == null ? 1 : o.s0; f.s1 = o.s1 == null ? 1 : o.s1; f.spin = o.spin || 0;
        f.ghost = o.ghost ? 1 : 0; f.box = o.box == null ? -1 : o.box; f.line = o.line == null ? -1 : o.line; f.land = o.land || '';
        f.delay = o.delay || 0;
        return f;
      }
      return null;
    }
    view.flights = function () { var n = 0; for (var i = 0; i < FCAP; i++) if (F[i].on) n++; return n; };

    /* ------------------------------------------------------- box shuffle */
    // Three cardboard boxes take turns: the one on the platform, the next one waiting on
    // the ramp, and the one that just shipped closing its flaps and rolling away.
    var BS = boxes.map(function (b) { return { b: b, mode: 'hidden', t: 0, idx: -1, x: 0, y: 0, z: 0, s: 1 }; });
    var swapT = 9, pend = new Float32Array(512);
    function pslot(bi, li) { return ((bi % 64) * 8 + li) | 0; }
    function role(m) { for (var i = 0; i < 3; i++) if (BS[i].mode === m) return BS[i]; return null; }
    function free() { for (var i = 0; i < 3; i++) if (BS[i].mode === 'hidden') return BS[i]; return BS[0]; }
    view.reset = function (w) {
      BS[0].mode = 'cur'; BS[0].idx = w ? w.box : 0;
      BS[1].mode = 'next'; BS[1].idx = (w ? w.box : 0) + 1;
      BS[2].mode = 'hidden'; BS[2].idx = -1;
      swapT = 9; pend.fill(0); P.n = 0;
      for (var i = 0; i < FCAP; i++) F[i].on = false;
      for (var j = 0; j < 3; j++) BS[j].b.set(1, 0);
      gv.phase = ''; gv.t = 0;
      clipS = 0;
    };
    function shipSwap(e) {
      var cur = role('cur'), nxt = role('next'), old = role('leave');
      if (old) old.mode = 'hidden';
      if (cur) { cur.mode = 'leave'; cur.t = 0; }
      if (nxt) { nxt.mode = 'cur'; nxt.idx = e.box + 1; }
      var f = free(); f.mode = 'next'; f.idx = e.box + 2; f.t = 0;
      swapT = 0;
    }
    function ease(p) { return p < 0 ? 0 : p > 1 ? 1 : p * p * (3 - 2 * p); }
    function back(p) { if (p >= 1) return 1; var c = 2.2; p -= 1; return 1 + (c + 1) * p * p * p + c * p * p; }
    function placeBoxes(w, dt) {
      swapT += dt;
      var hasNext = !!(w && w.boxes[w.box + 1]);
      for (var i = 0; i < 3; i++) {
        var o = BS[i], b = o.b, open = 1, glow = 0;
        if (o.mode === 'cur') {
          var p = ease((swapT - 0.45) / 0.6);
          o.x = LAY.NEXT_X + (LAY.BOX_X - LAY.NEXT_X) * p; o.z = LAY.NEXT_Z * (1 - p);
          o.y = 0.63 + (LAY.BOX_Y - 0.63) * p + Math.sin(p * Math.PI) * 0.5; o.s = 0.75 + 0.25 * p;
          var bx = w && w.boxes[o.idx];
          if (bx && bx.state === 'full') glow = 0.55 + 0.45 * Math.sin(w.anim * 7);
          if (!w || !bx) o.mode = o.mode; // no box (end of a level): stays put, open
        } else if (o.mode === 'next') {
          var q = ease((swapT - 0.7) / 0.6);
          o.x = LAY.NEXT_X + 6 * (1 - q); o.y = 0.63; o.z = LAY.NEXT_Z; o.s = 0.75;
        } else if (o.mode === 'leave') {
          o.t += dt;
          open = 1 - ease((o.t - 0.25) / 0.3);
          var r = ease((o.t - 0.6) / 0.7);
          o.x = LAY.BOX_X + r * 7; o.y = LAY.BOX_Y + Math.sin(r * Math.PI) * 0.6; o.z = r * 2.5; o.s = 1;
          if (o.t > 1.4) o.mode = 'hidden';
        }
        var vis = o.mode === 'cur' || o.mode === 'leave' || (o.mode === 'next' && hasNext);
        if (o.mode === 'cur' && w && !w.boxes[o.idx]) vis = false;
        b.group.visible = vis;
        if (!vis) continue;
        b.group.position.set(o.x, o.y, o.z); b.group.scale.setScalar(o.s);
        b.group.rotation.y = o.mode === 'leave' ? -o.t * 0.4 : 0;
        if (b.open !== open || glow || b.glow) { b.set(open, glow); b.glow = glow; }
      }
    }
    // The toys already packed in a box peek out over its rim.
    function drawPile(w, o) {
      var bx = w.boxes[o.idx];
      if (!bx || !o.b.group.visible || (o.mode === 'leave' && o.t > 0.55)) return;
      var n = 0;
      for (var li = 0; li < bx.lines.length; li++) {
        var l = bx.lines[li], shown = l.got - (o.mode === 'cur' ? pend[pslot(o.idx, li)] : 0);
        for (var j = 0; j < shown; j++, n++) {
          var col = n % 3, row = Math.floor(n / 3) % 2, lay = Math.floor(n / 6);
          var lx = -0.55 + col * 0.55, lz = -0.3 + row * 0.55, ly = 0.42 + lay * 0.3;
          var cy = Math.cos(o.b.group.rotation.y), sy = Math.sin(o.b.group.rotation.y);
          toy(l.k, l.c, o.x + (lx * cy + lz * sy) * o.s, o.y + ly * o.s, o.z + (lz * cy - lx * sy) * o.s, 0, -0.6 + (n * 1.7 % 1) - 0.5 + o.b.group.rotation.y, 0, 0.62 * o.s, 0);
        }
      }
    }

    /* -------------------------------------------------------------- signs */
    var signFlip = 0;
    function drawSign(sign, bx, w, cur, idx) {
      var g = sign.group;
      g.visible = !!bx;
      if (!bx) return;
      g.updateMatrixWorld();
      var rows = Math.min(2, bx.lines.length), gs = g.scale.x;
      for (var li = 0; li < rows; li++) {
        var l = bx.lines[li], n = Math.min(3, l.n);
        var done = l.got - (cur ? pend[pslot(idx, li)] : 0);
        if (bx.state !== 'open') done = l.n;
        var sc = rows === 1 ? 0.95 : 0.7, ly = rows === 1 ? -0.42 : (li === 0 ? 0.12 : -0.86);
        for (var j = 0; j < n; j++) {
          var lx = (j - (n - 1) / 2) * (rows === 1 ? 0.95 : 0.85);
          V.set(lx, ly + sc * 0.36, 0.17).applyMatrix4(g.matrixWorld);
          var full = j < done;
          var pulse = cur && !full && j === done && bx.state === 'open' ? 1 + Math.sin(w.anim * 6) * 0.06 : 1;
          put(discs, V.x, V.y, V.z, g.rotation.x, 0, 0, sc * 0.43 * gs * pulse, sc * 0.43 * gs * pulse, gs, full ? DISC_DONE : cur ? DISC_EMPTY : DISC_NEXT);
          V.set(lx, ly, 0.3).applyMatrix4(g.matrixWorld);
          var bob = full ? 0 : Math.sin(w.anim * 3 + j) * 0.03;
          toy(l.k, l.c, V.x, V.y + bob, V.z, g.rotation.x, -0.6, 0, sc * gs * pulse, 0);
        }
      }
    }

    /* ------------------------------------------------------------ Nattout */
    var gv = { phase: '', kind: '', t: 0, x: 0, y: 0, z: 0, k: 0, c: 0, has: false };
    function drawGremlin(w, dt) {
      var g = w && w.gremlin;
      if (!g) { grem.group.visible = false; gv.phase = ''; return; }
      if (g.phase !== gv.phase) { gv.phase = g.phase; gv.t = 0; gv.kind = g.kind; }
      gv.t += dt;
      var t = gv.t, steal = gv.kind === 'steal', hx = steal ? LAY.BOX_X + 1.7 : A + 1.9, hz = steal ? 1.3 : 2.1;
      var x = hx, y = 0, z = hz, ry = 0, s = 1, carry = steal && gv.has;
      if (g.phase === 'hold') {
        var inn = Math.min(1, t / 0.35);
        x = hx + (1 - inn) * 3; y = Math.abs(Math.sin(t * (inn < 1 ? 14 : 8))) * (inn < 1 ? 0.8 : 0.22);
        ry = Math.sin(t * 5) * 0.25;
      } else if (g.phase === 'bonk') {
        y = t * 3.2 - t * t * 1.2; ry = t * 14; s = Math.max(0, 1 - t / 1.1); carry = false;
      } else {
        x = hx + t * t * 6 + t * 2; y = Math.abs(Math.sin(t * 12)) * 0.35; ry = Math.PI / 2; s = Math.max(0, 1 - Math.max(0, t - 0.8) * 2.5);
      }
      grem.group.visible = s > 0.02;
      grem.group.position.set(x, y, z); grem.group.rotation.y = ry; grem.group.scale.setScalar(s * 1.25);
      grem.body.scale.set(1 + Math.sin(t * 16) * 0.04, 1 - Math.sin(t * 16) * 0.04, 1);
      grem.sprite.visible = !steal && g.phase === 'hold';
      if (grem.sprite.visible) grem.sprite.position.y = 1.5 + Math.sin(t * 6) * 0.08;
      if (carry && s > 0.02) toy(gv.k, gv.c, x, y + 1.25 * s, z, 0, t * 2, 0, 0.75 * s, 0);
    }

    /* ------------------------------------------------------------- events */
    var poke = 0, pokeX = A, shakeA = 0, lampT = 0, lampRed = false, clipS = 0, clipPulse = 0;
    var CONF = [0xff4b5c, 0xffc928, 0x35d07f, 0x3d8bff, 0xa66bff, 0xffffff], SMOKE = [0x8d8a86, 0x6f6c69, 0xb5b1ad];
    function boxTop() { var o = role('cur'); return o ? o : { x: LAY.BOX_X, y: LAY.BOX_Y, z: 0, s: 1 }; }
    view.shake = function (a) { if (!view.calm) shakeA = Math.max(shakeA, a || 0.25); };
    view.event = function (e, w) {
      var i, t, bt;
      switch (e.t) {
        case 'copy':
          for (i = 0; i < e.ids.length; i++) { t = SF.byId(w, e.ids[i]); if (t) fly('copy', t.k, t.b ? 5 : t.c, t.x, BY + 0.1, 0, CLIP_POS.x + (i - (e.ids.length - 1) / 2) * 0.62, CLIP_POS.y - 0.35, CLIP_POS.z + 0.3, { dur: 0.42, h: 1.2, s1: 0.5, ghost: 1, spin: 4, delay: i * 0.05, land: 'clip' }); }
          t = SF.byId(w, e.ids[0]); if (t) { poke = 0.22; pokeX = t.x; }
          break;
        case 'cut':
          for (i = 0; i < e.toys.length; i++) { t = e.toys[i]; fly('cut', t.k, t.b ? 5 : t.c, t.x, BY, 0, CLIP_POS.x + (i - (e.toys.length - 1) / 2) * 0.62, CLIP_POS.y - 0.35, CLIP_POS.z + 0.3, { dur: 0.45, h: 1.0, s1: 0.5, spin: 3, delay: i * 0.05, land: 'clip' }); }
          poke = 0.22; pokeX = e.toys[0].x;
          view.burst(e.toys[0].x, BY + 0.3, 0, { count: 8, colors: [0xff9a3d, 0xffd23f], speed: 2.5, up: 2, life: 0.4, size: 0.08 });
          break;
        case 'paste': case 'redo':
          if (e.ids) for (i = 0; i < e.ids.length; i++) { t = SF.byId(w, e.ids[i]); if (t) view.burst(t.x, BY + 0.4, 0, { count: 12, colors: [COLHEX[t.b ? 5 : t.c], 0xffffff, 0xfff3a0], speed: 3, up: 3, life: 0.5, size: 0.1 }); }
          if (e.t === 'paste') { poke = 0.2; pokeX = A; }
          if (e.toys) gone(e.toys, e.a === 'cut' ? 'cut' : 'del');
          break;
        case 'delete':
          gone(e.toys, 'del');
          poke = 0.2; pokeX = e.toys[0].x;
          break;
        case 'undo':
          if (e.a === 'paste') gone(e.toys, 'unpaste');
          else if (e.ids) for (i = 0; i < e.ids.length; i++) { t = SF.byId(w, e.ids[i]); if (t) view.burst(t.x, BY + 0.5, 0, { count: 14, colors: [0x7ef0ff, 0xffffff, 0x3d8bff], speed: 2.2, up: 2.5, life: 0.6, size: 0.09, gravity: 1 }); }
          else if (e.a === 'steal') {
            bt = boxTop(); pend[pslot(w.box, e.line)]++;
            var l = w.boxes[w.box].lines[e.line];
            fly('back', l.k, l.c, grem.group.position.x, grem.group.position.y + 1.3, grem.group.position.z, bt.x, bt.y + 0.6, bt.z, { dur: 0.55, h: 1.6, s0: 0.75, s1: 0.62, spin: 6, box: w.box, line: e.line, land: 'fill' });
            gv.has = false;
          }
          break;
        case 'drop':
          bt = boxTop(); t = e.toy;
          if (e.res === 'fill') { pend[pslot(e.box, e.line)]++; fly('arc', t.k, t.c, B.end, BY, 0, bt.x, bt.y + 0.5, bt.z, { dur: 0.42, h: 1.4, s1: 0.62, spin: 5, box: e.box, line: e.line, land: 'fill' }); }
          else if (e.res === 'store') fly('arc', t.k, t.c, B.end, BY, 0, LAY.CRATE_X, 0.4, LAY.CRATE_Z, { dur: 0.45, h: 1.0, s1: 0.7, spin: 4, land: 'crate' });
          else fly('arc', t.k, 5, B.end, BY, 0, bt.x, bt.y + 0.5, bt.z, { dur: 0.42, h: 1.4, s1: 0.62, spin: 5, land: 'bad' });
          break;
        case 'seal':
          bt = boxTop();
          view.burst(bt.x, bt.y + 1.1, bt.z, { count: 16, colors: [0x3d8bff, 0xffffff, 0xffd23f], speed: 3.5, up: 3, life: 0.6, size: 0.1 });
          break;
        case 'ship':
          shipSwap(e);
          bt = boxTop();
          view.burst(LAY.BOX_X, LAY.BOX_Y + 1.4, 0, { count: 30, colors: CONF, speed: 4.5, up: 5, life: 1, size: 0.11 });
          break;
        case 'full':
          view.burst(LAY.BOX_X, LAY.BOX_Y + 1.3, 0, { count: 14, colors: [0xffd23f, 0xffffff], speed: 2.5, up: 4, life: 0.8, size: 0.09, gravity: 3 });
          break;
        case 'spawn': lampT = 0.3; lampRed = !!e.b; view.burst(LAY.MX + 1.4, 1.5, 0, { count: 6, colors: [0xffffff, 0xfff3a0], speed: 1.5, up: 1.5, life: 0.4, size: 0.1, gravity: 1 }); break;
        case 'wave': lampT = 0.9; lampRed = true; break;
        case 'steal':
          gv.k = e.toy.k; gv.c = e.toy.c; gv.has = true;
          bt = boxTop();
          view.burst(bt.x, bt.y + 1, bt.z, { count: 10, colors: [0xa66bff, 0xffd23f], speed: 2.5, up: 3, life: 0.5, size: 0.09 });
          break;
        case 'gundo':
          gone(e.toys, 'unpaste');
          break;
        case 'escape':
          view.shake(0.3);
          break;
        case 'foil':
          view.burst(grem.group.position.x, grem.group.position.y + 1, grem.group.position.z, { count: 22, colors: [0xffd23f, 0xffffff, 0xa66bff], speed: 4, up: 4, life: 0.8, size: 0.11 });
          break;
        case 'win': case 'over':
          view.burst(LAY.BOX_X, 2.5, 0, { count: 40, colors: CONF, speed: 5, up: 6, life: 1.2, size: 0.12 });
          break;
      }
    };
    var COLHEX = SF.COLORS.map(function (c) { return parseInt(c.slice(1), 16); }).concat([0x8d8a86]);
    function gone(list, how) {
      for (var i = 0; i < list.length; i++) {
        var t = list[i], c = t.b ? 5 : t.c;
        if (how === 'cut') fly('cut', t.k, c, t.x, BY, 0, CLIP_POS.x, CLIP_POS.y - 0.35, CLIP_POS.z + 0.3, { dur: 0.45, h: 1.0, s1: 0.5, spin: 3, land: 'clip' });
        else if (how === 'unpaste') fly('up', t.k, c, t.x, BY, 0, A, 3.0, 0.2, { dur: 0.4, h: 0.4, s1: 0.1, spin: -8, land: 'poof' });
        else {
          fly('del', t.k, c, t.x, BY, 0, t.x, BY + 0.4, 0, { dur: 0.3, s1: 0.05, spin: 12 });
          view.burst(t.x, BY + 0.4, 0, { count: t.b ? 16 : 10, colors: t.b ? SMOKE.concat([0xffd23f]) : [COLHEX[c], 0xffffff], speed: 3, up: 3, life: 0.55, size: 0.1 });
        }
      }
    }
    function land(f) {
      if (f.land === 'fill') {
        if (f.box >= 0) pend[pslot(f.box, f.line)] = Math.max(0, pend[pslot(f.box, f.line)] - 1);
        view.burst(f.bx, f.by + 0.5, f.bz, { count: 12, colors: [COLHEX[f.c], 0xffffff, 0x35d07f], speed: 3, up: 3.5, life: 0.6, size: 0.09 });
      } else if (f.land === 'crate') view.burst(f.bx, f.by + 0.3, f.bz, { count: 5, colors: [0x35d07f, 0xffffff], speed: 1.5, up: 1.5, life: 0.4, size: 0.07 });
      else if (f.land === 'bad') { view.burst(f.bx, f.by + 0.6, f.bz, { count: 18, colors: SMOKE.concat([0xff4b5c]), speed: 2.5, up: 3, life: 0.8, size: 0.13, gravity: 1 }); view.shake(0.35); }
      else if (f.land === 'clip') clipPulse = 1;
      else if (f.land === 'poof') view.burst(f.bx, f.by, f.bz, { count: 8, colors: [0x7ef0ff, 0xffffff], speed: 2, up: 1, life: 0.4, size: 0.08, gravity: 0 });
    }
    function stepFlights(dt) {
      for (var i = 0; i < FCAP; i++) {
        var f = F[i];
        if (!f.on) continue;
        if (f.delay > 0) { f.delay -= dt; continue; }
        f.t += dt;
        var p = Math.min(1, f.t / f.dur), e = f.kind === 'del' ? p : ease(p);
        var x = f.ax + (f.bx - f.ax) * e, y = f.ay + (f.by - f.ay) * e + f.h * 4 * p * (1 - p), z = f.az + (f.bz - f.az) * e;
        var s = f.s0 + (f.s1 - f.s0) * p;
        if (f.kind === 'del') s = f.s0 * (1 - p) * (1 + Math.sin(p * Math.PI) * 0.5);
        toy(f.k, f.c, x, y, z, 0, f.spin * f.t, 0, s, f.ghost);
        if (f.ghost && Math.random() < 0.5) view.burst(x, y + 0.3, z, { count: 1, colors: [0x7ef0ff], speed: 0.3, up: 0.2, life: 0.3, size: 0.06, gravity: 0 });
        if (p >= 1) { f.on = false; land(f); }
      }
    }

    /* ------------------------------------------------------------- update */
    var skinNow = -1;
    view.setSkin = function (i) { if (i === skinNow) return; skinNow = i; arm.skin(SF.SKINS[i] || SF.SKINS[0]); };
    view.setSkin(0);
    function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
    function begin() {
      for (var k = 0; k < 5; k++) { toyB[k].count = 0; toyD[k].count = 0; toyG[k].count = 0; }
      shadows.count = 0; rings.count = 0; arrows.count = 0; discs.count = 0;
    }
    function finish() {
      var all = [shadows, rings, arrows, discs];
      for (var k = 0; k < 5; k++) all.push(toyB[k], toyD[k], toyG[k]);
      for (var i = 0; i < all.length; i++) { all[i].instanceMatrix.needsUpdate = true; if (all[i].instanceColor) all[i].instanceColor.needsUpdate = true; }
    }
    // ctx: { w, dt, calm }
    view.update = function (ctx) {
      var w = ctx.w, dt = Math.min(0.05, ctx.dt || 0), i, t;
      view.calm = !!ctx.calm;
      begin();
      if (w && !w.hold && !w.done) hall.beltTex.offset.x -= w.speed * dt / 1.1;
      // Lamps on the toy machine.
      lampT -= dt;
      if (lampT > 0) hall.lampMat.color.set(Math.floor(lampT * 12) % 2 ? (lampRed ? 0xff4b5c : 0xffffff) : 0xfff3a0);
      else hall.lampMat.color.set(0xffe27a);
      if (w) {
        var anim = w.anim, selLast = null;
        for (i = 0; i < w.toys.length; i++) {
          t = w.toys[i];
          var age = anim - t.born, s = back(Math.min(1, age / 0.3)), wob = t.b ? Math.sin(anim * 7 + t.id) * 0.13 : 0;
          var hop = t.b ? Math.abs(Math.sin(anim * 5 + t.id)) * 0.05 : 0;
          toy(t.k, t.b ? 5 : t.c, t.x, BY + 0.02 + hop, 0, 0, 0.35, wob, s, 0);
          put(shadows, t.x, BY + 0.015, 0, 0, 0, 0, 1.1 * s, 1, 0.9 * s, null);
          if (t.b && Math.random() < dt * 1.6) view.burst(t.x - 0.1, BY + 0.8, 0, { count: 1, colors: SMOKE, speed: 0.2, up: 0.8, life: 0.9, size: 0.12, gravity: -0.6 });
          if (w.sel.indexOf(t.id) >= 0) {
            var rp = 1 + Math.sin(anim * 8) * 0.07;
            put(rings, t.x, BY + 0.04, 0, 0, 0, 0, rp, 1, rp, null);
            put(arrows, t.x, BY + 1.35 + Math.abs(Math.sin(anim * 5)) * 0.18, 0, 0, anim * 3, 0, 1, 1, 1, null);
            if (w.sel[w.sel.length - 1] === t.id) selLast = t;
          }
        }
        // The arm hovers over the chosen toy and dips down to touch it on each action.
        var tx = selLast ? selLast.x : A, ty = 4.1;
        if (poke > 0) { poke -= dt; tx = pokeX; ty = 3.15; arm.grip = 1; } else arm.grip += (0 - arm.grip) * Math.min(1, dt * 8);
        arm.target.set(clamp(tx, A - 3.2, A + 3.4), ty, 0.1);
        arm.look = selLast ? clamp((selLast.x - arm.pos.x) * 0.8, -2, 2) : Math.sin(anim * 0.7) * 0.6;
        arm.tilt = clamp((arm.target.x - arm.pos.x) * 0.25, -0.5, 0.5);
        // The clipboard bubble and what it holds.
        var has = !!(w.clip && w.clip.length);
        clipS += ((has ? 1 : 0) - clipS) * Math.min(1, dt * 10);
        clipPulse = Math.max(0, clipPulse - dt * 3);
        clip.group.visible = clipS > 0.02;
        if (clip.group.visible) {
          var cs = clipS * (1 + clipPulse * 0.12);
          clip.group.scale.setScalar(cs);
          clip.group.position.y = CLIP_POS.y + Math.sin(anim * 2) * 0.06;
          clip.rim.color.set(w.clipCut ? 0xff9a3d : 0x3fd9ff);
          clip.glass.color.set(w.clipCut ? 0xffd6a8 : 0x7ef0ff);
          clip.group.updateMatrixWorld();
          if (has) for (i = 0; i < w.clip.length; i++) {
            var it = w.clip[i];
            V.set((i - (w.clip.length - 1) / 2) * 0.62, -0.42, 0.12).applyMatrix4(clip.group.matrixWorld);
            toy(it.k, it.b ? 5 : it.c, V.x, V.y, V.z, -0.4, 0.5 + Math.sin(anim * 2 + i) * 0.4, 0, (w.clip.length > 3 ? 0.46 : 0.55) * cs, 0);
          }
        }
        placeBoxes(w, dt);
        for (i = 0; i < 3; i++) drawPile(w, BS[i]);
        drawSign(signA, w.boxes[w.box] && w.boxes[w.box].state !== 'shipped' ? w.boxes[w.box] : null, w, true, w.box);
        var nb = w.boxes[w.box + 1] || null;
        drawSign(signB, nb, w, false, w.box + 1);
        signA.group.rotation.y = Math.sin(Math.min(1, swapT / 0.5) * Math.PI) * 0.6;
        drawGremlin(w, dt);
      }
      arm.update(dt, view.calm);
      stepFlights(dt);
      stepParticles(dt);
      finish();
      // A short, soft screen shake (skipped when the player asked for less motion).
      shakeA = Math.max(0, shakeA - dt * 1.4);
      var sh = view.calm ? 0 : shakeA * shakeA;
      camera.position.set(CAM.x + (Math.random() - 0.5) * sh, CAM.y + (Math.random() - 0.5) * sh, CAM.z);
    };

    /* ---------------------------------------------------- render & sizes */
    var pace = Kit.webgl.pacer(renderer, { software: software });
    var lastDraw = 0;
    // Menus on a software renderer: wait for the last frame to finish before the next one.
    view.mayDraw = function (now, playing) {
      return pace.mayDraw(now, playing) && (!pace.active || playing || now - lastDraw >= 60);
    };
    view.render = function () {
      renderer.render(scene, camera);
      pace.markDrawn();
      lastDraw = performance.now();
    };
    view.whenDrawn = pace.whenDrawn;
    view.resize = function (w, h) {
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix();
    };
    var slow = 0;
    view.frameTime = function (ms) {
      if (ms > 26) slow++; else slow = Math.max(0, slow - 0.5);
      if (slow > 90 && ratio > 0.75) { ratio = Math.max(0.75, ratio - 0.25); renderer.setPixelRatio(ratio); slow = 0; return true; }
      return false;
    };
    view.software = software;
    view.info = function () { return { calls: renderer.info.render.calls, ratio: ratio, software: software }; };
    // World point -> the 1280 x 720 design space of the UI layer.
    var PR = { x: 0, y: 0 };
    view.project = function (x, y, z) {
      V.set(x, y, z).project(camera);
      PR.x = (V.x + 1) * 640; PR.y = (1 - V.y) * 360;
      return PR;
    };
    view.toyPoint = function (w, id) {
      var t = w && SF.byId(w, id);
      if (!t) return null;
      var p = view.project(t.x, BY + 0.45, 0);
      return { x: p.x, y: p.y };
    };
    view.boxPoint = function () { var p = view.project(LAY.BOX_X, LAY.BOX_Y + 1.3, 0); return { x: p.x, y: p.y }; };
    view.clipPoint = function () { var p = view.project(CLIP_POS.x, CLIP_POS.y + 0.9, CLIP_POS.z); return { x: p.x, y: p.y }; };
    view.gremlinPoint = function () { var g = grem.group.position, p = view.project(g.x, g.y + 2.2, g.z); return { x: p.x, y: p.y }; };
    // The toy nearest to a click (in design pixels), within reach.
    view.pick = function (w, lx, ly) {
      var best = null, bd = 75 * 75;
      if (!w) return null;
      for (var i = 0; i < w.toys.length; i++) {
        var t = w.toys[i], p = view.project(t.x, BY + 0.4, 0), dx = p.x - lx, dy = p.y - ly, d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = t; }
      }
      return best ? best.id : null;
    };
    var parallel = false;
    try { parallel = renderer.extensions.has('KHR_parallel_shader_compile'); } catch (e) { parallel = false; }
    view.prepare = function (done) {
      if (!parallel) { done(); return; }
      var called = false, fin = function () { if (!called) { called = true; done(); } };
      renderer.compileAsync(scene, camera).then(fin, fin);
      setTimeout(fin, 6000);
    };
    view.dispose = function () { renderer.dispose(); };
    view.reset(null);
    return view;
  };
})();
