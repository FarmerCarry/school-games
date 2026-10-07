/*
 * Splat Strike — fx.js
 * Pooled, instanced visual effects. Each pool is ONE draw call and never allocates while playing:
 *   paint droplets, confetti, paint-splat decals (atlas of 4 shapes, capped ring buffer),
 *   paint shots in flight, sniper tracers, blob shadows, spawn-shield bubbles, balloon arc dots,
 *   snowfall. Instance matrices are written straight into the typed arrays.
 */
(function () {
  'use strict';
  var SS = window.SS;
  var T = window.THREE;

  function canvas(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  // 2x2 atlas of paint splat shapes (white, alpha) for decals
  function splatAtlas() {
    var S = 128, c = canvas(S * 2, S * 2), g = c.getContext('2d');
    var seed = 7;
    function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
    g.fillStyle = '#fff';
    for (var k = 0; k < 4; k++) {
      var ox = (k % 2) * S + S / 2, oy = Math.floor(k / 2) * S + S / 2;
      var R = S * 0.24;
      g.beginPath(); g.arc(ox, oy, R, 0, Math.PI * 2); g.fill();
      var n = 7 + k * 2;
      for (var i = 0; i < n; i++) {
        var a = rnd() * Math.PI * 2, d = R * (0.55 + rnd() * 0.5), r = R * (0.28 + rnd() * 0.3);
        g.beginPath(); g.arc(ox + Math.cos(a) * d, oy + Math.sin(a) * d, r, 0, Math.PI * 2); g.fill();
      }
      for (var j = 0; j < 9 + k; j++) {
        var a2 = rnd() * Math.PI * 2, d2 = R * (1.15 + rnd() * 0.75), r2 = 1.5 + rnd() * 4.5;
        if (Math.cos(a2) * d2 > S * 0.46 || Math.sin(a2) * d2 > S * 0.46) d2 = S * 0.42;
        g.beginPath(); g.arc(ox + Math.cos(a2) * d2, oy + Math.sin(a2) * d2, r2, 0, Math.PI * 2); g.fill();
        // streak towards the droplet
        g.beginPath(); g.lineWidth = r2 * 0.9; g.strokeStyle = '#fff'; g.moveTo(ox + Math.cos(a2) * R * 0.9, oy + Math.sin(a2) * R * 0.9); g.lineTo(ox + Math.cos(a2) * d2, oy + Math.sin(a2) * d2); g.stroke();
      }
    }
    var t = new T.CanvasTexture(c);
    t.colorSpace = T.SRGBColorSpace;
    t.anisotropy = 2;
    return t;
  }
  function radialTex(inner) {
    var c = canvas(64, 64), g = c.getContext('2d');
    var gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(0,0,0,' + inner + ')'); gr.addColorStop(0.55, 'rgba(0,0,0,' + (inner * 0.6) + ')'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    var t = new T.CanvasTexture(c);
    return t;
  }
  SS.splatAtlas = splatAtlas;

  // write a scale+translate matrix (no rotation) into slot i
  function mTS(a, i, x, y, z, sx, sy, sz) {
    var o = i * 16;
    a[o] = sx; a[o + 1] = 0; a[o + 2] = 0; a[o + 3] = 0;
    a[o + 4] = 0; a[o + 5] = sy; a[o + 6] = 0; a[o + 7] = 0;
    a[o + 8] = 0; a[o + 9] = 0; a[o + 10] = sz; a[o + 11] = 0;
    a[o + 12] = x; a[o + 13] = y; a[o + 14] = z; a[o + 15] = 1;
  }
  // matrix from basis columns (u, v, w already scaled) + translation
  function mB(a, i, x, y, z, ux, uy, uz, vx, vy, vz, wx, wy, wz) {
    var o = i * 16;
    a[o] = ux; a[o + 1] = uy; a[o + 2] = uz; a[o + 3] = 0;
    a[o + 4] = vx; a[o + 5] = vy; a[o + 6] = vz; a[o + 7] = 0;
    a[o + 8] = wx; a[o + 9] = wy; a[o + 10] = wz; a[o + 11] = 0;
    a[o + 12] = x; a[o + 13] = y; a[o + 14] = z; a[o + 15] = 1;
  }
  SS.mTS = mTS; SS.mB = mB;
  // upload only the first n floats of an instanced buffer (reused range object: no garbage)
  function upload(attr, n) {
    if (n <= 0) return;
    var r = attr._rng || (attr._rng = { start: 0, count: 0 });
    r.count = n;
    attr.updateRanges.length = 0; attr.updateRanges.push(r);
    attr.needsUpdate = true;
  }
  SS.upload = upload;
  function inst(geo, mat, n, colors) {
    var m = new T.InstancedMesh(geo, mat, n);
    m.instanceMatrix.setUsage(T.DynamicDrawUsage);
    if (colors) {
      m.instanceColor = new T.InstancedBufferAttribute(new Float32Array(n * 3).fill(1), 3);
      m.instanceColor.setUsage(T.DynamicDrawUsage);
    }
    m.frustumCulled = false;
    m.count = 0;
    return m;
  }

  function FX(scene) {
    this.scene = scene;
    this.t = 0;
    var lam = function (o) { return new T.MeshLambertMaterial(o || {}); };
    /* ---- paint droplets */
    var PN = 420;
    this.pN = PN; this.pn = 0;
    this.p = { x: new Float32Array(PN), y: new Float32Array(PN), z: new Float32Array(PN), vx: new Float32Array(PN), vy: new Float32Array(PN), vz: new Float32Array(PN),
      life: new Float32Array(PN), max: new Float32Array(PN), s: new Float32Array(PN), g: new Float32Array(PN), r: new Float32Array(PN), gg: new Float32Array(PN), b: new Float32Array(PN) };
    this.drops = inst(new T.IcosahedronGeometry(1, 0), lam(), PN, true);
    scene.add(this.drops);
    /* ---- confetti */
    var CN = 260;
    this.cN = CN; this.cn = 0;
    this.c = { x: new Float32Array(CN), y: new Float32Array(CN), z: new Float32Array(CN), vx: new Float32Array(CN), vy: new Float32Array(CN), vz: new Float32Array(CN),
      a: new Float32Array(CN), b: new Float32Array(CN), sa: new Float32Array(CN), sb: new Float32Array(CN), life: new Float32Array(CN), r: new Float32Array(CN), g: new Float32Array(CN), bb: new Float32Array(CN) };
    var cg = new T.PlaneGeometry(0.12, 0.07);
    this.conf = inst(cg, new T.MeshBasicMaterial({ side: T.DoubleSide }), CN, true);
    scene.add(this.conf);
    /* ---- decals */
    var DN = 220;
    this.dN = DN; this.di = 0; this.dUsed = 0;
    this.dAge = new Float32Array(DN).fill(9);
    this.dS = new Float32Array(DN); this.dPos = new Float32Array(DN * 3); this.dBasis = new Float32Array(DN * 9);
    var dg = new T.PlaneGeometry(1, 1);
    var uvOff = new T.InstancedBufferAttribute(new Float32Array(DN * 2), 2);
    dg.setAttribute('aUv', uvOff);
    this.dUv = uvOff;
    var dm = new T.MeshLambertMaterial({ map: splatAtlas(), alphaTest: 0.45, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    dm.onBeforeCompile = function (sh) {
      sh.vertexShader = sh.vertexShader.replace('#include <uv_pars_vertex>', '#include <uv_pars_vertex>\nattribute vec2 aUv;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv = vMapUv * 0.5 + aUv;');
    };
    dm.customProgramCacheKey = function () { return 'splatDecal'; };
    this.decals = inst(dg, dm, DN, true);
    scene.add(this.decals);
    /* ---- shots in flight (drawn by the game each frame) */
    var SN = 160;
    this.shots = inst(new T.SphereGeometry(1, 8, 6), new T.MeshBasicMaterial(), SN, true);
    scene.add(this.shots);
    /* ---- tracers */
    this.trN = 12; this.tr = [];
    for (var i = 0; i < this.trN; i++) this.tr.push({ on: false, t: 0, ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0 });
    var tg = new T.BoxGeometry(1, 1, 1); tg.translate(0, 0, 0.5);
    this.tracers = inst(tg, new T.MeshBasicMaterial({ transparent: true, opacity: 0.8, depthWrite: false }), this.trN, true);
    scene.add(this.tracers);
    /* ---- blob shadows */
    var sg = new T.PlaneGeometry(1, 1); sg.rotateX(-Math.PI / 2);
    this.shadows = inst(sg, new T.MeshBasicMaterial({ map: radialTex(0.42), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }), 24, false);
    this.shadows.renderOrder = 1;
    scene.add(this.shadows);
    /* ---- shields */
    this.shields = inst(new T.SphereGeometry(1, 16, 12), new T.MeshLambertMaterial({ color: 0x9fe8ff, emissive: 0x2a6f99, transparent: true, opacity: 0.32, depthWrite: false }), 12, false);
    this.shields.renderOrder = 2;
    scene.add(this.shields);
    /* ---- balloon arc preview */
    this.arc = inst(new T.SphereGeometry(0.07, 6, 4), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }), 40, false);
    scene.add(this.arc);
    var rg = new T.RingGeometry(0.75, 0.95, 24); rg.rotateX(-Math.PI / 2);
    // forceSinglePass: a transparent double-sided material would otherwise be drawn in two passes that
    // flip material.side, re-evaluating its shader program (garbage) every frame
    this.ring = new T.Mesh(rg, new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false, side: T.DoubleSide, forceSinglePass: true }));
    this.ring.visible = false;
    scene.add(this.ring);
    /* ---- scope glints: a star that faces the camera on sniper bots that are scoped in (telegraph) */
    // white-hot centre fading to warning pink at the ray tips, so it reads on bright skies and snow too
    (function (fx) {
      var pos = [0, 0, 0], col = [1, 1, 1], idx = [], n = 16;
      for (var i = 0; i < n; i++) {
        var a = i / n * Math.PI * 2 + Math.PI / 4, r = i % 4 === 0 ? 1 : i % 2 === 0 ? 0.34 : 0.2;
        pos.push(Math.cos(a) * r, Math.sin(a) * r, 0);
        if (r > 0.5) col.push(1, 0.12, 0.45); else col.push(1, 0.75, 0.35);
        idx.push(0, 1 + i, 1 + (i + 1) % n);
      }
      var g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
      g.setIndex(idx);
      fx.glints = inst(g, new T.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.97, depthWrite: false, fog: false }), 10, false);
      fx.glints.renderOrder = 3;
      scene.add(fx.glints);
    })(this);
    /* ---- snow */
    this.snowN = 220;
    this.snowOn = false;
    this.sn = new Float32Array(this.snowN * 4);
    this.snow = inst(new T.OctahedronGeometry(0.035, 0), new T.MeshBasicMaterial({ color: 0xffffff }), this.snowN, false);
    scene.add(this.snow);
    for (var k = 0; k < this.snowN; k++) { this.sn[k * 4] = (Math.random() - 0.5) * 40; this.sn[k * 4 + 1] = Math.random() * 14; this.sn[k * 4 + 2] = (Math.random() - 0.5) * 40; this.sn[k * 4 + 3] = Math.random() * 6.28; }
    this.lite = false; // fewer particles (low quality / headless simulation)
  }
  var P = FX.prototype;

  /* paint droplets burst. col = [r,g,b] linear */
  P.burst = function (x, y, z, col, n, speed, size, up, dx, dy, dz) {
    if (this.lite) n = Math.ceil(n / 3);
    var p = this.p;
    for (var k = 0; k < n; k++) {
      var i;
      if (this.pn < this.pN) i = this.pn++;
      else i = (Math.random() * this.pN) | 0;
      var a = Math.random() * 6.283, e = (Math.random() * 2 - 1), sp = speed * (0.35 + Math.random() * 0.75), q = Math.sqrt(1 - e * e);
      var vx = Math.cos(a) * q * sp, vy = e * sp + (up || 0), vz = Math.sin(a) * q * sp;
      if (dx !== undefined) { vx += dx * speed * 0.6; vy += dy * speed * 0.6; vz += dz * speed * 0.6; }
      p.x[i] = x; p.y[i] = y; p.z[i] = z; p.vx[i] = vx; p.vy[i] = vy; p.vz[i] = vz;
      p.max[i] = p.life[i] = 0.35 + Math.random() * 0.45;
      p.s[i] = size * (0.5 + Math.random() * 0.7); p.g[i] = 14;
      var sh = 0.85 + Math.random() * 0.3;
      p.r[i] = col[0] * sh; p.gg[i] = col[1] * sh; p.b[i] = col[2] * sh;
    }
  };
  P.confetti = function (x, y, z, n, speed) {
    if (this.lite) n = Math.ceil(n / 3);
    var c = this.c, pal = SS.CONF;
    for (var k = 0; k < n; k++) {
      var i;
      if (this.cn < this.cN) i = this.cn++;
      else i = (Math.random() * this.cN) | 0;
      var a = Math.random() * 6.283, sp = speed * (0.3 + Math.random() * 0.8);
      c.x[i] = x; c.y[i] = y; c.z[i] = z;
      c.vx[i] = Math.cos(a) * sp; c.vz[i] = Math.sin(a) * sp; c.vy[i] = 2 + Math.random() * speed;
      c.a[i] = Math.random() * 6.28; c.b[i] = Math.random() * 6.28; c.sa[i] = (Math.random() - 0.5) * 18; c.sb[i] = (Math.random() - 0.5) * 18;
      c.life[i] = 1.6 + Math.random() * 1.2;
      var col = pal[(Math.random() * pal.length) | 0];
      c.r[i] = col[0]; c.g[i] = col[1]; c.bb[i] = col[2];
    }
  };
  // decal on a surface with normal n
  P.decal = function (x, y, z, nx, ny, nz, size, col) {
    var i = this.di; this.di = (this.di + 1) % this.dN; if (this.dUsed < this.dN) this.dUsed++;
    // tangent basis
    var tx, ty, tz;
    if (Math.abs(ny) > 0.9) { tx = 1; ty = 0; tz = 0; } else { tx = 0; ty = 1; tz = 0; }
    // u = normalize(cross(t, n)), v = cross(n, u)
    var ux = ty * nz - tz * ny, uy = tz * nx - tx * nz, uz = tx * ny - ty * nx;
    var ul = Math.sqrt(ux * ux + uy * uy + uz * uz) || 1; ux /= ul; uy /= ul; uz /= ul;
    var vx = ny * uz - nz * uy, vy = nz * ux - nx * uz, vz = nx * uy - ny * ux;
    var a = Math.random() * 6.283, ca = Math.cos(a), sa = Math.sin(a);
    var rx = ux * ca + vx * sa, ry = uy * ca + vy * sa, rz = uz * ca + vz * sa;
    var qx = vx * ca - ux * sa, qy = vy * ca - uy * sa, qz = vz * ca - uz * sa;
    var off = 0.012 + (i % 7) * 0.0015;
    var b = this.dBasis, o = i * 9;
    b[o] = rx; b[o + 1] = ry; b[o + 2] = rz; b[o + 3] = qx; b[o + 4] = qy; b[o + 5] = qz; b[o + 6] = nx; b[o + 7] = ny; b[o + 8] = nz;
    this.dPos[i * 3] = x + nx * off; this.dPos[i * 3 + 1] = y + ny * off; this.dPos[i * 3 + 2] = z + nz * off;
    this.dS[i] = size; this.dAge[i] = 0;
    var ic = this.decals.instanceColor.array;
    var sh = 0.9 + Math.random() * 0.2;
    ic[i * 3] = col[0] * sh; ic[i * 3 + 1] = col[1] * sh; ic[i * 3 + 2] = col[2] * sh;
    this.decals.instanceColor.needsUpdate = true;
    var k = (Math.random() * 4) | 0;
    this.dUv.array[i * 2] = (k % 2) * 0.5; this.dUv.array[i * 2 + 1] = (k >> 1) * 0.5;
    this.dUv.needsUpdate = true;
    this._writeDecal(i, 0.55);
    this.decals.count = this.dUsed;
  };
  P._writeDecal = function (i, k) {
    var b = this.dBasis, o = i * 9, s = this.dS[i] * k;
    mB(this.decals.instanceMatrix.array, i, this.dPos[i * 3], this.dPos[i * 3 + 1], this.dPos[i * 3 + 2],
      b[o] * s, b[o + 1] * s, b[o + 2] * s, b[o + 3] * s, b[o + 4] * s, b[o + 5] * s, b[o + 6], b[o + 7], b[o + 8]);
    this.decals.instanceMatrix.needsUpdate = true;
  };
  P.clearDecals = function () { this.di = 0; this.dUsed = 0; this.decals.count = 0; this.dAge.fill(9); };
  P.tracer = function (ax, ay, az, bx, by, bz, col) {
    var best = 0, bt = -1;
    for (var i = 0; i < this.trN; i++) { var q = this.tr[i]; if (!q.on) { best = i; break; } if (q.t > bt) { bt = q.t; best = i; } }
    var r = this.tr[best];
    r.on = true; r.t = 0; r.ax = ax; r.ay = ay; r.az = az; r.bx = bx; r.by = by; r.bz = bz;
    var ic = this.tracers.instanceColor.array; ic[best * 3] = col[0]; ic[best * 3 + 1] = col[1]; ic[best * 3 + 2] = col[2];
    this.tracers.instanceColor.needsUpdate = true;
  };
  P.clear = function () { this.pn = 0; this.cn = 0; this.drops.count = 0; this.conf.count = 0; for (var i = 0; i < this.trN; i++) this.tr[i].on = false; this.clearDecals(); };

  // per-frame update of everything that animates by itself
  P.update = function (dt, camX, camY, camZ) {
    this.t += dt;
    var p = this.p, n = this.pn, arr = this.drops.instanceMatrix.array, col = this.drops.instanceColor.array;
    for (var i = 0; i < n; i++) {
      p.life[i] -= dt;
      if (p.life[i] <= 0) {
        n--;
        if (i !== n) {
          p.x[i] = p.x[n]; p.y[i] = p.y[n]; p.z[i] = p.z[n]; p.vx[i] = p.vx[n]; p.vy[i] = p.vy[n]; p.vz[i] = p.vz[n];
          p.life[i] = p.life[n]; p.max[i] = p.max[n]; p.s[i] = p.s[n]; p.g[i] = p.g[n]; p.r[i] = p.r[n]; p.gg[i] = p.gg[n]; p.b[i] = p.b[n];
        }
        i--; continue;
      }
      p.vy[i] -= p.g[i] * dt;
      p.x[i] += p.vx[i] * dt; p.y[i] += p.vy[i] * dt; p.z[i] += p.vz[i] * dt;
      if (p.y[i] < 0.03) { p.y[i] = 0.03; p.vy[i] *= -0.25; p.vx[i] *= 0.6; p.vz[i] *= 0.6; }
      var k = p.life[i] / p.max[i], s = p.s[i] * (0.35 + 0.65 * k), o = i * 16;
      // matrix written inline: calling a helper with float arguments would box them (garbage)
      arr[o] = s; arr[o + 1] = 0; arr[o + 2] = 0; arr[o + 3] = 0; arr[o + 4] = 0; arr[o + 5] = s; arr[o + 6] = 0; arr[o + 7] = 0;
      arr[o + 8] = 0; arr[o + 9] = 0; arr[o + 10] = s; arr[o + 11] = 0; arr[o + 12] = p.x[i]; arr[o + 13] = p.y[i]; arr[o + 14] = p.z[i]; arr[o + 15] = 1;
      col[i * 3] = p.r[i]; col[i * 3 + 1] = p.gg[i]; col[i * 3 + 2] = p.b[i];
    }
    this.pn = n; this.drops.count = n;
    upload(this.drops.instanceMatrix, n * 16); upload(this.drops.instanceColor, n * 3);
    // confetti: tumbling flat pieces with air drag
    var c = this.c, cn = this.cn, ca = this.conf.instanceMatrix.array, cc = this.conf.instanceColor.array;
    var drag = Math.exp(-2.2 * dt);
    for (var j = 0; j < cn; j++) {
      c.life[j] -= dt;
      if (c.life[j] <= 0) {
        cn--;
        if (j !== cn) {
          c.x[j] = c.x[cn]; c.y[j] = c.y[cn]; c.z[j] = c.z[cn]; c.vx[j] = c.vx[cn]; c.vy[j] = c.vy[cn]; c.vz[j] = c.vz[cn];
          c.a[j] = c.a[cn]; c.b[j] = c.b[cn]; c.sa[j] = c.sa[cn]; c.sb[j] = c.sb[cn]; c.life[j] = c.life[cn]; c.r[j] = c.r[cn]; c.g[j] = c.g[cn]; c.bb[j] = c.bb[cn];
        }
        j--; continue;
      }
      c.vy[j] -= 6 * dt; c.vx[j] *= drag; c.vz[j] *= drag; c.vy[j] = Math.max(c.vy[j] * drag, -1.6);
      c.x[j] += c.vx[j] * dt; c.y[j] += c.vy[j] * dt; c.z[j] += c.vz[j] * dt;
      if (c.y[j] < 0.02) { c.y[j] = 0.02; c.vx[j] = c.vz[j] = 0; c.vy[j] = 0; c.sa[j] = c.sb[j] = 0; }
      c.a[j] += c.sa[j] * dt; c.b[j] += c.sb[j] * dt;
      var sA = Math.sin(c.a[j]), cA = Math.cos(c.a[j]), sB = Math.sin(c.b[j]), cB = Math.cos(c.b[j]);
      var sc = c.life[j] < 0.4 ? c.life[j] / 0.4 : 1;
      // rotation Ry(b) * Rx(a), written inline
      var q = j * 16;
      ca[q] = cB * sc; ca[q + 1] = 0; ca[q + 2] = -sB * sc; ca[q + 3] = 0;
      ca[q + 4] = sB * sA * sc; ca[q + 5] = cA * sc; ca[q + 6] = cB * sA * sc; ca[q + 7] = 0;
      ca[q + 8] = sB * cA * sc; ca[q + 9] = -sA * sc; ca[q + 10] = cB * cA * sc; ca[q + 11] = 0;
      ca[q + 12] = c.x[j]; ca[q + 13] = c.y[j]; ca[q + 14] = c.z[j]; ca[q + 15] = 1;
      cc[j * 3] = c.r[j]; cc[j * 3 + 1] = c.g[j]; cc[j * 3 + 2] = c.bb[j];
    }
    this.cn = cn; this.conf.count = cn;
    upload(this.conf.instanceMatrix, cn * 16); upload(this.conf.instanceColor, cn * 3);
    // decals pop in with a quick squash
    for (var d = 0; d < 6; d++) {
      var di = (this.di - 1 - d + this.dN) % this.dN;
      if (this.dAge[di] < 0.14) { this.dAge[di] += dt; var kk = Math.min(1, this.dAge[di] / 0.12); this._writeDecal(di, 0.55 + 0.45 * (1 - (1 - kk) * (1 - kk))); }
    }
    // tracers fade by thinning
    var ta = this.tracers.instanceMatrix.array, tn = 0;
    for (var q = 0; q < this.trN; q++) {
      var r = this.tr[q];
      if (!r.on) { mTS(ta, q, 0, -99, 0, 0, 0, 0); continue; }
      r.t += dt;
      if (r.t > 0.3) { r.on = false; mTS(ta, q, 0, -99, 0, 0, 0, 0); continue; }
      var dx = r.bx - r.ax, dy = r.by - r.ay, dz = r.bz - r.az, L = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      var wx = dx / L, wy = dy / L, wz = dz / L;
      var ux = wz, uy = 0, uz = -wx, ul = Math.sqrt(ux * ux + uz * uz) || 1; ux /= ul; uz /= ul;
      var vx = wy * uz - wz * uy, vy = wz * ux - wx * uz, vz = wx * uy - wy * ux;
      var th = 0.045 * (1 - r.t / 0.3);
      mB(ta, q, r.ax, r.ay, r.az, ux * th, uy * th, uz * th, vx * th, vy * th, vz * th, dx, dy, dz);
      tn = q + 1;
    }
    this.tracers.count = tn;
    upload(this.tracers.instanceMatrix, tn * 16);
    // snow around the camera
    if (this.snowOn) {
      var sa2 = this.snow.instanceMatrix.array, sn = this.sn;
      for (var f = 0; f < this.snowN; f++) {
        var o = f * 4;
        sn[o + 1] -= dt * (0.9 + (f % 5) * 0.12);
        sn[o + 3] += dt * 1.3;
        if (sn[o + 1] < 0) sn[o + 1] += 14;
        var wx2 = sn[o] + Math.sin(sn[o + 3]) * 0.3, wz2 = sn[o + 2] + Math.cos(sn[o + 3] * 0.7) * 0.3;
        // wrap into a 40 m box around the camera
        var px = camX + ((((wx2 - camX) % 40) + 60) % 40) - 20, pz = camZ + ((((wz2 - camZ) % 40) + 60) % 40) - 20;
        var so = f * 16;
        sa2[so] = 1; sa2[so + 5] = 1; sa2[so + 10] = 1; sa2[so + 15] = 1;
        sa2[so + 12] = px; sa2[so + 13] = sn[o + 1]; sa2[so + 14] = pz;
      }
      this.snow.count = this.snowN; this.snow.instanceMatrix.needsUpdate = true;
    } else this.snow.count = 0;
  };
  SS.FX = FX;
  SS.CONF = [[1, 0.2, 0.35], [1, 0.8, 0.1], [0.2, 0.7, 1], [0.3, 0.9, 0.4], [0.7, 0.35, 1], [1, 0.5, 0.1], [1, 1, 1]];
})();
