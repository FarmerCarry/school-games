/*
 * Splat Strike — world.js
 * Low-level world code shared by the whole game (window.SS):
 *   SS.Builder  merged low-poly geometry with baked vertex colours (one draw call per material)
 *   SS.World    static collision: axis-aligned boxes + ramps (wedges), a 2 m broadphase grid,
 *               entity move-and-slide with step-up, ground/ceiling queries, ray casts
 *   SS.Nav      walkable nav grid (1 m cells, several height levels per cell), edges for walking,
 *               dropping off ledges and hopping onto low blocks, and A* with typed arrays
 */
(function () {
  'use strict';
  var SS = window.SS = window.SS || {};
  var T = window.THREE;

  /* =================================================================== BUILDER */
  var colCache = {};
  function lin(hex) {
    var c = colCache[hex];
    if (!c) { var k = new T.Color(hex); c = colCache[hex] = [k.r, k.g, k.b]; }
    return c;
  }
  SS.lin = lin;

  function Builder() {
    this.p = []; this.n = []; this.c = [];
    // affine transform, row-major 3x4
    this.m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
    this.nm = null;
    this.stack = [];
    this.ao = false;       // darken vertices close to the ground (map geometry)
    this.tint = null;      // optional [r,g,b] multiplier
  }
  var BP = Builder.prototype;
  BP.push = function () { this.stack.push(this.m.slice()); return this; };
  BP.pop = function () { this.m = this.stack.pop(); this.nm = null; return this; };
  BP._mul = function (b) {
    var a = this.m, r = new Array(12);
    for (var i = 0; i < 3; i++) {
      for (var j = 0; j < 4; j++) {
        var v = a[i * 4] * b[j] + a[i * 4 + 1] * b[4 + j] + a[i * 4 + 2] * b[8 + j];
        if (j === 3) v += a[i * 4 + 3];
        r[i * 4 + j] = v;
      }
    }
    this.m = r; this.nm = null; return this;
  };
  BP.translate = function (x, y, z) { return this._mul([1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z]); };
  BP.scale = function (x, y, z) { return this._mul([x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0]); };
  BP.rotY = function (a) { var c = Math.cos(a), s = Math.sin(a); return this._mul([c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0]); };
  BP.rotX = function (a) { var c = Math.cos(a), s = Math.sin(a); return this._mul([1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0]); };
  BP.rotZ = function (a) { var c = Math.cos(a), s = Math.sin(a); return this._mul([c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0]); };
  BP._normalMat = function () {
    if (this.nm) return this.nm;
    var m = this.m;
    var a = m[0], b = m[1], c = m[2], d = m[4], e = m[5], f = m[6], g = m[8], h = m[9], i = m[10];
    var A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
    var D = -(b * i - c * h), E = a * i - c * g, F = -(a * h - b * g);
    var G = b * f - c * e, H = -(a * f - c * d), I = a * e - b * d;
    // inverse-transpose == cofactor matrix / det (sign of det only matters)
    var det = a * A + b * B + c * C;
    var s = det < 0 ? -1 : 1;
    this.nm = [A * s, B * s, C * s, D * s, E * s, F * s, G * s, H * s, I * s];
    return this.nm;
  };
  BP.v = function (x, y, z, nx, ny, nz, col) {
    var m = this.m, n = this._normalMat();
    var wx = m[0] * x + m[1] * y + m[2] * z + m[3];
    var wy = m[4] * x + m[5] * y + m[6] * z + m[7];
    var wz = m[8] * x + m[9] * y + m[10] * z + m[11];
    var tx = n[0] * nx + n[1] * ny + n[2] * nz;
    var ty = n[3] * nx + n[4] * ny + n[5] * nz;
    var tz = n[6] * nx + n[7] * ny + n[8] * nz;
    var l = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1;
    this.p.push(wx, wy, wz);
    this.n.push(tx / l, ty / l, tz / l);
    var k = 1;
    if (this.ao && wy < 0.45) k = 0.74 + 0.26 * Math.max(0, wy) / 0.45;
    var r = col[0] * k, g = col[1] * k, b = col[2] * k;
    if (this.tint) { r *= this.tint[0]; g *= this.tint[1]; b *= this.tint[2]; }
    this.c.push(r, g, b);
  };
  // flat triangle
  BP.tri = function (ax, ay, az, bx, by, bz, cx, cy, cz, col) {
    if (typeof col === 'number') col = lin(col);
    var ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
    var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    var l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    nx /= l; ny /= l; nz /= l;
    this.v(ax, ay, az, nx, ny, nz, col); this.v(bx, by, bz, nx, ny, nz, col); this.v(cx, cy, cz, nx, ny, nz, col);
  };
  // quad a-b-c-d counter-clockwise seen from the front
  BP.quad = function (ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, col) {
    this.tri(ax, ay, az, bx, by, bz, cx, cy, cz, col);
    this.tri(ax, ay, az, cx, cy, cz, dx, dy, dz, col);
  };
  function C(col) { return typeof col === 'number' ? lin(col) : col; }
  // box from (x0,y0,z0) to (x1,y1,z1). o: { top, bottom:true, side, front }
  BP.box = function (x0, y0, z0, x1, y1, z1, col, o) {
    o = o || {};
    var c = C(col), top = o.top != null ? C(o.top) : c, side = o.side != null ? C(o.side) : c;
    this.quad(x0, y1, z1, x1, y1, z1, x1, y1, z0, x0, y1, z0, top);            // +y
    if (o.bottom) this.quad(x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1, c); // -y
    this.quad(x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1, side);          // +z
    this.quad(x1, y0, z0, x0, y0, z0, x0, y1, z0, x1, y1, z0, side);          // -z
    this.quad(x1, y0, z1, x1, y0, z0, x1, y1, z0, x1, y1, z1, side);          // +x
    this.quad(x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0, side);          // -x
    return this;
  };
  // cylinder / cone along +y. o: { r2 (top radius), seg, cap:true, bottom, smooth, top (colour) }
  BP.cyl = function (cx, y0, cz, r, h, col, o) {
    o = o || {};
    var seg = o.seg || 10, r2 = o.r2 != null ? o.r2 : r, c = C(col), tc = o.top != null ? C(o.top) : c;
    var smooth = !!o.smooth, y1 = y0 + h;
    var slope = (r - r2) / h;
    for (var i = 0; i < seg; i++) {
      var a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
      var c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      if (smooth) {
        var l0 = Math.sqrt(1 + slope * slope);
        this.v(cx + c0 * r, y0, cz + s0 * r, c0 / l0, slope / l0, s0 / l0, c);
        this.v(cx + c1 * r2, y1, cz + s1 * r2, c1 / l0, slope / l0, s1 / l0, c);
        this.v(cx + c1 * r, y0, cz + s1 * r, c1 / l0, slope / l0, s1 / l0, c);
        this.v(cx + c0 * r, y0, cz + s0 * r, c0 / l0, slope / l0, s0 / l0, c);
        this.v(cx + c0 * r2, y1, cz + s0 * r2, c0 / l0, slope / l0, s0 / l0, c);
        this.v(cx + c1 * r2, y1, cz + s1 * r2, c1 / l0, slope / l0, s1 / l0, c);
      } else {
        this.quad(cx + c0 * r, y0, cz + s0 * r, cx + c0 * r2, y1, cz + s0 * r2, cx + c1 * r2, y1, cz + s1 * r2, cx + c1 * r, y0, cz + s1 * r, c);
      }
      if (o.inner != null) this.quad(cx + c1 * r * 0.97, y0, cz + s1 * r * 0.97, cx + c1 * r2 * 0.97, y1, cz + s1 * r2 * 0.97, cx + c0 * r2 * 0.97, y1, cz + s0 * r2 * 0.97, cx + c0 * r * 0.97, y0, cz + s0 * r * 0.97, C(o.inner));
      if (o.cap !== false && r2 > 0.001) this.tri(cx, y1, cz, cx + c1 * r2, y1, cz + s1 * r2, cx + c0 * r2, y1, cz + s0 * r2, tc);
      if (o.bottom) this.tri(cx, y0, cz, cx + c0 * r, y0, cz + s0 * r, cx + c1 * r, y0, cz + s1 * r, c);
    }
    return this;
  };
  // sphere / ellipsoid. o: { sx, sy, sz, seg, rings, flat, half (upper half only), col2 (lower colour), split }
  BP.sphere = function (cx, cy, cz, r, col, o) {
    o = o || {};
    var seg = o.seg || 12, rings = o.rings || 8, sx = (o.sx || 1) * r, sy = (o.sy || 1) * r, sz = (o.sz || 1) * r;
    var c = C(col), c2 = o.col2 != null ? C(o.col2) : c, split = o.split != null ? o.split : -2;
    var r1 = o.half ? Math.ceil(rings / 2) : rings;
    for (var j = 0; j < r1; j++) {
      var t0 = j / rings * Math.PI, t1 = (j + 1) / rings * Math.PI;
      for (var i = 0; i < seg; i++) {
        var p0 = i / seg * Math.PI * 2, p1 = (i + 1) / seg * Math.PI * 2;
        var pts = [[t0, p0], [t1, p0], [t1, p1], [t0, p1]];
        var q = [];
        for (var k = 0; k < 4; k++) {
          var th = pts[k][0], ph = pts[k][1];
          var nx = Math.sin(th) * Math.cos(ph), ny = Math.cos(th), nz = Math.sin(th) * Math.sin(ph);
          q.push([cx + nx * sx, cy + ny * sy, cz + nz * sz, nx / (o.sx || 1), ny / (o.sy || 1), nz / (o.sz || 1)]);
        }
        var cc = (Math.cos((t0 + t1) / 2) < split) ? c2 : c;
        if (o.flat) {
          if (j !== 0) this.tri(q[0][0], q[0][1], q[0][2], q[3][0], q[3][1], q[3][2], q[1][0], q[1][1], q[1][2], cc);
          if (j !== rings - 1) this.tri(q[1][0], q[1][1], q[1][2], q[3][0], q[3][1], q[3][2], q[2][0], q[2][1], q[2][2], cc);
          if (j === 0) this.tri(q[0][0], q[0][1], q[0][2], q[2][0], q[2][1], q[2][2], q[1][0], q[1][1], q[1][2], cc);
        } else {
          var A = q[0], B = q[1], Cc = q[2], D = q[3], f = o.colFn;
          var ca = f ? f(A[3], A[4], A[5]) : cc, cb = f ? f(B[3], B[4], B[5]) : cc, ccc = f ? f(Cc[3], Cc[4], Cc[5]) : cc, cd = f ? f(D[3], D[4], D[5]) : cc;
          if (j !== 0) { this.v(A[0], A[1], A[2], A[3], A[4], A[5], ca); this.v(D[0], D[1], D[2], D[3], D[4], D[5], cd); this.v(B[0], B[1], B[2], B[3], B[4], B[5], cb); }
          if (j !== rings - 1) { this.v(B[0], B[1], B[2], B[3], B[4], B[5], cb); this.v(D[0], D[1], D[2], D[3], D[4], D[5], cd); this.v(Cc[0], Cc[1], Cc[2], Cc[3], Cc[4], Cc[5], ccc); }
          if (j === 0) { this.v(A[0], A[1], A[2], A[3], A[4], A[5], ca); this.v(Cc[0], Cc[1], Cc[2], Cc[3], Cc[4], Cc[5], ccc); this.v(B[0], B[1], B[2], B[3], B[4], B[5], cb); }
        }
      }
    }
    if (o.half && o.cap !== false) {
      // flat bottom at the equator, facing down
      for (var i2 = 0; i2 < seg; i2++) {
        var a0 = i2 / seg * Math.PI * 2, a1 = (i2 + 1) / seg * Math.PI * 2;
        this.tri(cx, cy, cz, cx + Math.cos(a1) * sx, cy, cz + Math.sin(a1) * sz, cx + Math.cos(a0) * sx, cy, cz + Math.sin(a0) * sz, c2);
      }
    }
    return this;
  };
  // ramp wedge rising toward dir (0:+x 1:-x 2:+z 3:-z) from ya at the low end to yb at the high end, base yb0
  BP.wedge = function (x0, z0, x1, z1, base, ya, yb, dir, col, o) {
    o = o || {};
    var c = C(col), top = o.top != null ? C(o.top) : c;
    // heights at the four corners (x0z0, x1z0, x1z1, x0z1)
    var h = [0, 0, 0, 0];
    if (dir === 0) h = [ya, yb, yb, ya];
    else if (dir === 1) h = [yb, ya, ya, yb];
    else if (dir === 2) h = [ya, ya, yb, yb];
    else h = [yb, yb, ya, ya];
    this.quad(x0, h[3], z1, x1, h[2], z1, x1, h[1], z0, x0, h[0], z0, top);
    // sides (quads with possibly zero-height edges)
    this.quad(x0, base, z1, x1, base, z1, x1, h[2], z1, x0, h[3], z1, c);  // +z
    this.quad(x1, base, z0, x0, base, z0, x0, h[0], z0, x1, h[1], z0, c);  // -z
    this.quad(x1, base, z1, x1, base, z0, x1, h[1], z0, x1, h[2], z1, c);  // +x
    this.quad(x0, base, z0, x0, base, z1, x0, h[3], z1, x0, h[0], z0, c);  // -x
    return this;
  };
  // flat disc facing +y
  BP.disc = function (cx, cy, cz, r, col, seg) {
    seg = seg || 16; var c = C(col);
    for (var i = 0; i < seg; i++) {
      var a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
      this.tri(cx, cy, cz, cx + Math.cos(a1) * r, cy, cz + Math.sin(a1) * r, cx + Math.cos(a0) * r, cy, cz + Math.sin(a0) * r, c);
    }
    return this;
  };
  // ring (flat annulus) facing +y
  BP.ring = function (cx, cy, cz, r0, r1, col, seg) {
    seg = seg || 16; var c = C(col);
    for (var i = 0; i < seg; i++) {
      var a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
      var c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      this.quad(cx + c0 * r0, cy, cz + s0 * r0, cx + c0 * r1, cy, cz + s0 * r1, cx + c1 * r1, cy, cz + s1 * r1, cx + c1 * r0, cy, cz + s1 * r0, c);
    }
    return this;
  };
  BP.count = function () { return this.p.length / 3; };
  BP.geometry = function () {
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(new Float32Array(this.p), 3));
    g.setAttribute('normal', new T.BufferAttribute(new Float32Array(this.n), 3));
    g.setAttribute('color', new T.BufferAttribute(new Float32Array(this.c), 3));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  };
  SS.Builder = Builder;

  /* ===================================================================== WORLD */
  var CELL = 2;
  function World(half) {
    this.half = half;                // arena half size (m)
    this.boxes = [];                 // {x0,y0,z0,x1,y1,z1,belt,bx,bz,snd}
    this.ramps = [];                 // {x0,z0,x1,z1,base,ya,yb,dir,planes}
    this.gOff = half + 4;
    this.gN = Math.ceil((half + 4) * 2 / CELL);
    this.grid = null;
    this.q = new Int32Array(512); this.qn = 0;
    this.stamp = null; this.st = 1;
    // query rectangle / solid box / ground probe passed through fields by the hot per-step paths:
    // calling a (non-inlined) function with float arguments boxes each of them (garbage every frame)
    this.qa = 0.5; this.qb = 0.5; this.qc = 0.5; this.qd = 0.5;
    this.sa = 0.5; this.sb = 0.5; this.sc = 0.5; this.sd = 0.5; this.se = 0.5; this.sf = 0.5;
    this.gx = 0.5; this.gz = 0.5; this.gr = 0.5; this.gm = 0.5;
  }
  var WP = World.prototype;
  WP.addBox = function (x0, y0, z0, x1, y1, z1, o) {
    var b = { x0: Math.min(x0, x1), y0: Math.min(y0, y1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), y1: Math.max(y0, y1), z1: Math.max(z0, z1), bx: 0, bz: 0, noShot: false, noDecal: false };
    if (o) { if (o.bx) b.bx = o.bx; if (o.bz) b.bz = o.bz; if (o.noShot) b.noShot = true; if (o.noDecal) b.noDecal = true; }
    this.boxes.push(b);
    return b;
  };
  WP.addRamp = function (x0, z0, x1, z1, base, ya, yb, dir) {
    var r = { x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), base: base, ya: ya, yb: yb, dir: dir };
    // convex planes n·p <= d (outward normals)
    var L = (dir < 2) ? (r.x1 - r.x0) : (r.z1 - r.z0), s = (yb - ya) / L;
    var P = [];
    P.push([0, -1, 0, -base]);
    P.push([1, 0, 0, r.x1]); P.push([-1, 0, 0, -r.x0]); P.push([0, 0, 1, r.z1]); P.push([0, 0, -1, -r.z0]);
    var nx = 0, nz = 0, px = 0, pz = 0;
    if (dir === 0) { nx = -s; px = r.x0; pz = r.z0; }
    else if (dir === 1) { nx = s; px = r.x1; pz = r.z0; }
    else if (dir === 2) { nz = -s; px = r.x0; pz = r.z0; }
    else { nz = s; px = r.x0; pz = r.z1; }
    var l = Math.sqrt(nx * nx + 1 + nz * nz);
    var n = [nx / l, 1 / l, nz / l];
    P.push([n[0], n[1], n[2], n[0] * px + n[1] * ya + n[2] * pz]);
    r.planes = P;
    r.nx = n[0]; r.ny = n[1]; r.nz = n[2];
    this.ramps.push(r);
    return r;
  };
  WP.finish = function () {
    var N = this.gN, off = this.gOff;
    var lists = [];
    for (var i = 0; i < N * N; i++) lists.push([]);
    for (var b = 0; b < this.boxes.length; b++) {
      var B = this.boxes[b];
      var i0 = Math.max(0, Math.floor((B.x0 + off) / CELL)), i1 = Math.min(N - 1, Math.floor((B.x1 + off) / CELL));
      var j0 = Math.max(0, Math.floor((B.z0 + off) / CELL)), j1 = Math.min(N - 1, Math.floor((B.z1 + off) / CELL));
      for (var j = j0; j <= j1; j++) for (var ii = i0; ii <= i1; ii++) lists[j * N + ii].push(b);
    }
    // CSR layout
    this.gStart = new Int32Array(N * N + 1);
    var total = 0;
    for (var k = 0; k < N * N; k++) { this.gStart[k] = total; total += lists[k].length; }
    this.gStart[N * N] = total;
    this.gList = new Int32Array(Math.max(1, total));
    for (var k2 = 0, p = 0; k2 < N * N; k2++) for (var m = 0; m < lists[k2].length; m++) this.gList[p++] = lists[k2][m];
    this.stamp = new Uint32Array(this.boxes.length + 1);
  };
  // collect boxes whose cells overlap the XZ rect into this.q
  WP.query = function (x0, z0, x1, z1) { this.qa = x0; this.qb = z0; this.qc = x1; this.qd = z1; return this._query(); };
  WP._query = function () {
    var x0 = this.qa, z0 = this.qb, x1 = this.qc, z1 = this.qd;
    var N = this.gN, off = this.gOff;
    var i0 = Math.max(0, Math.floor((x0 + off) / CELL)), i1 = Math.min(N - 1, Math.floor((x1 + off) / CELL));
    var j0 = Math.max(0, Math.floor((z0 + off) / CELL)), j1 = Math.min(N - 1, Math.floor((z1 + off) / CELL));
    var st = ++this.st; if (st > 4000000000) { this.stamp.fill(0); st = this.st = 1; }
    var n = 0, q = this.q, stamp = this.stamp, gs = this.gStart, gl = this.gList;
    for (var j = j0; j <= j1; j++) {
      for (var i = i0; i <= i1; i++) {
        var c = j * N + i;
        for (var k = gs[c], e = gs[c + 1]; k < e; k++) {
          var b = gl[k];
          if (stamp[b] !== st) { stamp[b] = st; if (n < q.length) q[n++] = b; }
        }
      }
    }
    this.qn = n;
    return n;
  };
  // highest ramp surface under an XZ footprint (-Infinity if none)
  WP.rampTop = function (r, x0, z0, x1, z1) {
    if (x1 <= r.x0 || x0 >= r.x1 || z1 <= r.z0 || z0 >= r.z1) return -Infinity;
    var t;
    if (r.dir === 0) t = (Math.min(x1, r.x1) - r.x0) / (r.x1 - r.x0);
    else if (r.dir === 1) t = (r.x1 - Math.max(x0, r.x0)) / (r.x1 - r.x0);
    else if (r.dir === 2) t = (Math.min(z1, r.z1) - r.z0) / (r.z1 - r.z0);
    else t = (r.z1 - Math.max(z0, r.z0)) / (r.z1 - r.z0);
    if (t < 0) t = 0; else if (t > 1) t = 1;
    return r.ya + (r.yb - r.ya) * t;
  };
  // does the AABB overlap anything solid? (ramps count as solid below their surface)
  WP.solid = function (x0, y0, z0, x1, y1, z1) { this.sa = x0; this.sb = y0; this.sc = z0; this.sd = x1; this.se = y1; this.sf = z1; return this._solid(); };
  WP._solid = function () {
    var x0 = this.sa, y0 = this.sb, z0 = this.sc, x1 = this.sd, y1 = this.se, z1 = this.sf;
    if (y0 < -0.01) return true;
    this.qa = x0; this.qb = z0; this.qc = x1; this.qd = z1;
    var n = this._query(), B = this.boxes, q = this.q;
    for (var k = 0; k < n; k++) {
      var b = B[q[k]];
      if (x1 > b.x0 && x0 < b.x1 && z1 > b.z0 && z0 < b.z1 && y1 > b.y0 && y0 < b.y1) return true;
    }
    // ramps: judged on the inner half of the footprint, like ground(), so standing on a slope is never "inside" it
    var cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, hx = (x1 - x0) / 4, hz = (z1 - z0) / 4;
    for (var r = 0; r < this.ramps.length; r++) {
      var R = this.ramps[r];
      if (y1 <= R.base || cx + hx <= R.x0 || cx - hx >= R.x1 || cz + hz <= R.z0 || cz - hz >= R.z1) continue;
      if (this.rampTop(R, cx - hx, cz - hz, cx + hx, cz + hz) > y0 + 0.02) return true;
    }
    return false;
  };
  // highest supporting surface under the footprint with top <= maxY
  WP.ground = function (x, z, r, maxY) { this.gx = x; this.gz = z; this.gr = r; this.gm = maxY; return this._ground(); };
  WP._ground = function () {
    var x = this.gx, z = this.gz, r = this.gr, maxY = this.gm;
    var x0 = x - r, x1 = x + r, z0 = z - r, z1 = z + r;
    this.qa = x0; this.qb = z0; this.qc = x1; this.qd = z1;
    var best = 0, n = this._query(), B = this.boxes, q = this.q;
    this.gBox = null;
    for (var k = 0; k < n; k++) {
      var b = B[q[k]];
      if (x1 > b.x0 && x0 < b.x1 && z1 > b.z0 && z0 < b.z1 && b.y1 <= maxY && b.y1 > best) { best = b.y1; this.gBox = b; }
    }
    // ramps: sample with a smaller footprint so bodies don't float over slopes
    var rr = r * 0.5;
    for (var i = 0; i < this.ramps.length; i++) {
      var Ri = this.ramps[i];
      if (x + rr <= Ri.x0 || x - rr >= Ri.x1 || z + rr <= Ri.z0 || z - rr >= Ri.z1) continue;
      var h = this.rampTop(Ri, x - rr, z - rr, x + rr, z + rr);
      if (h <= maxY && h > best) { best = h; this.gBox = null; }
    }
    return best;
  };
  WP.ceil = function (x, z, r, minY) {
    var x0 = x - r, x1 = x + r, z0 = z - r, z1 = z + r;
    this.qa = x0; this.qb = z0; this.qc = x1; this.qd = z1;
    var best = Infinity, n = this._query(), B = this.boxes, q = this.q;
    for (var k = 0; k < n; k++) {
      var b = B[q[k]];
      if (x1 > b.x0 && x0 < b.x1 && z1 > b.z0 && z0 < b.z1 && b.y0 >= minY && b.y0 < best) best = b.y0;
    }
    return best;
  };

  /* ---- entity movement ----
   * e: { x, y (feet), z, vx, vy, vz, r, h, grounded, stepUp (visual smoothing accumulator) }
   * Moves e by its velocity for dt with collision, step-up (STEP), ledge assist and ground snap. */
  var STEP = 0.55;
  WP.move = function (e, dt, snap) {
    var r = e.r, wasG = e.grounded;
    var stepH = wasG ? STEP : (e.vy < 3 ? 0.36 : 0);
    // conveyor belts carry whoever stands on them
    if (wasG && e.gBox && (e.gBox.bx || e.gBox.bz)) { this._axis(e, 0, e.gBox.bx * dt, stepH); this._axis(e, 2, e.gBox.bz * dt, stepH); }
    this._axis(e, 0, e.vx * dt, stepH);
    this._axis(e, 2, e.vz * dt, stepH);
    // vertical
    var ny = e.y + e.vy * dt;
    if (e.vy <= 0) {
      var tol = wasG ? STEP : (stepH > 0 ? stepH : 0.02);
      this.gx = e.x; this.gz = e.z; this.gr = r; this.gm = e.y + tol;
      var g = this._ground();
      var gb = this.gBox;
      if (ny <= g) {
        if (g > e.y + 0.1) e.stepUp -= (g - e.y);
        ny = g; e.vy = 0; e.grounded = true; e.gBox = gb;
      } else if (wasG && snap && ny - g < 0.6) {
        // stick to ramps and small steps down while walking
        ny = g; e.vy = 0; e.grounded = true; e.gBox = gb;
      } else { e.grounded = false; e.gBox = null; }
    } else {
      // same footprint as the inside-geometry test below, so a rising body can't slip into an overhang's edge
      var c = this.ceil(e.x, e.z, r - 0.03, e.y + e.h - 0.05);
      if (ny + e.h > c) { ny = c - e.h; e.vy = 0; }
      e.grounded = false; e.gBox = null;
    }
    e.y = ny;
    // last resort: never stay inside geometry
    this.sa = e.x - r + 0.02; this.sb = e.y + 0.06; this.sc = e.z - r + 0.02; this.sd = e.x + r - 0.02; this.se = e.y + e.h - 0.05; this.sf = e.z + r - 0.02;
    if (this._solid()) this.unstick(e);
    if (e.y < -3) { e.y = 0.5; e.vy = 0; }
  };
  WP._axis = function (e, ax, d, stepH) {
    if (d === 0) return;
    var r = e.r, B = this.boxes;
    var x = e.x + (ax === 0 ? d : 0), z = e.z + (ax === 2 ? d : 0);
    var y0 = e.y + 0.02, y1 = e.y + e.h;
    this.qa = x - r; this.qb = z - r; this.qc = x + r; this.qd = z + r;
    var n = this._query(), q = this.q;
    var stepTo = -1, ns = 0, sc = this.stepCand || (this.stepCand = new Int32Array(16));
    for (var k = 0; k < n; k++) {
      var b = B[q[k]];
      if (!(x + r > b.x0 && x - r < b.x1 && z + r > b.z0 && z - r < b.z1 && y1 > b.y0 && y0 < b.y1)) continue;
      if (b.y1 - e.y <= stepH) { if (ns < 16) sc[ns++] = q[k]; continue; }
      // blocked: clamp to the face we ran into
      if (ax === 0) x = d > 0 ? Math.min(x, b.x0 - r - 0.001) : Math.max(x, b.x1 + r + 0.001);
      else z = d > 0 ? Math.min(z, b.z0 - r - 0.001) : Math.max(z, b.z1 + r + 0.001);
      if (ax === 0) e.vx = 0; else e.vz = 0;
    }
    // clamping may have moved us back past our start (thin gap): never move against d
    if (ax === 0) { if ((x - e.x) * d < 0) x = e.x; } else if ((z - e.z) * d < 0) z = e.z;
    // step-up candidates that we still touch after clamping
    for (var s2 = 0; s2 < ns; s2++) {
      var sb = B[sc[s2]];
      if (x + r > sb.x0 && x - r < sb.x1 && z + r > sb.z0 && z - r < sb.z1 && sb.y1 > stepTo) stepTo = sb.y1;
    }
    // ramps: block only if the surface rises too fast (running into the side or back of a ramp)
    var hr = r * 0.5;
    for (var i = 0; i < this.ramps.length; i++) {
      var R = this.ramps[i];
      if (y1 <= R.base || x + hr <= R.x0 || x - hr >= R.x1 || z + hr <= R.z0 || z - hr >= R.z1) continue;
      var h = this.rampTop(R, x - hr, z - hr, x + hr, z + hr);
      if (h === -Infinity) continue;
      if (h > e.y + stepH && h > this.rampTop(R, e.x - r * 0.5, e.z - r * 0.5, e.x + r * 0.5, e.z + r * 0.5) + 0.001) {
        if (ax === 0) { x = e.x; e.vx = 0; } else { z = e.z; e.vz = 0; }
      }
    }
    if (stepTo > e.y) {
      // step up only if there is head room at the new height
      if (!this.solid(x - r + 0.01, stepTo + 0.02, z - r + 0.01, x + r - 0.01, stepTo + e.h, z + r - 0.01)) {
        e.stepUp -= (stepTo - e.y);
        e.y = stepTo; if (e.vy < 0) e.vy = 0;
        e.grounded = true;
      } else {
        if (ax === 0) { x = e.x; e.vx = 0; } else { z = e.z; e.vz = 0; }
      }
    }
    // arena bounds
    var lim = this.half - r - 0.02;
    if (x > lim) x = lim; else if (x < -lim) x = -lim;
    if (z > lim) z = lim; else if (z < -lim) z = -lim;
    e.x = x; e.z = z;
  };
  // push an entity out of whatever it is stuck in: the smallest move first (small nudges sideways and up
  // before big ones), keeping the height it was at (it then falls normally) so it never visibly teleports
  var UNSTICK = [[0, 0.15, 0], [0.2, 0, 0], [-0.2, 0, 0], [0, 0, 0.2], [0, 0, -0.2], [0, 0.3, 0], [0, -0.3, 0],
    [0.4, 0, 0], [-0.4, 0, 0], [0, 0, 0.4], [0, 0, -0.4], [0, 0.6, 0], [0.28, 0, 0.28], [-0.28, 0, 0.28], [0.28, 0, -0.28], [-0.28, 0, -0.28],
    [0.8, 0, 0], [-0.8, 0, 0], [0, 0, 0.8], [0, 0, -0.8], [0, 1.0, 0], [0, 1.6, 0], [0, 2.8, 0]];
  WP.unstick = function (e) {
    var r = e.r, h = e.h;
    for (var i = 0; i < UNSTICK.length; i++) {
      var T = UNSTICK[i], x = e.x + T[0], y = e.y + T[1], z = e.z + T[2];
      if (y < 0) continue;
      if (!this.solid(x - r, y + 0.06, z - r, x + r, y + h, z + r)) {
        var g = this.ground(x, z, r, y + 0.05);
        e.x = x; e.z = z;
        if (y - g < 0.06) { e.y = g; if (e.vy < 0) e.vy = 0; } else { e.y = y; if (T[1] < 0 && e.vy > 0) e.vy = 0; }
        return true;
      }
    }
    return false;
  };

  /* ---- ray casts ---- */
  // hit: { t, nx, ny, nz, box }  returns true on hit within maxT
  WP.ray = function (ox, oy, oz, dx, dy, dz, maxT, hit, shotsOnly) {
    var best = maxT, bnx = 0, bny = 0, bnz = 0, bb = null, found = false;
    // floor
    if (dy < 0) {
      var tf = -oy / dy;
      if (tf >= 0 && tf < best) { best = tf; bnx = 0; bny = 1; bnz = 0; found = true; bb = null; }
    }
    var ix = dx !== 0 ? 1 / dx : 1e30, iy = dy !== 0 ? 1 / dy : 1e30, iz = dz !== 0 ? 1 / dz : 1e30;
    var B = this.boxes;
    // broadphase over the ray's XZ bounding rect (rays are short: <= 60 m)
    var ex = ox + dx * best, ez = oz + dz * best;
    this.qa = ox < ex ? ox : ex; this.qb = oz < ez ? oz : ez; this.qc = ox > ex ? ox : ex; this.qd = oz > ez ? oz : ez;
    var n = this._query(), q = this.q;
    for (var k = 0; k < n; k++) {
      var b = B[q[k]];
      if (shotsOnly && b.noShot) continue;
      var t1 = (b.x0 - ox) * ix, t2 = (b.x1 - ox) * ix;
      var tmin = Math.min(t1, t2), tmax = Math.max(t1, t2), ax = 0;
      var t3 = (b.y0 - oy) * iy, t4 = (b.y1 - oy) * iy;
      var tn = Math.min(t3, t4), tx = Math.max(t3, t4);
      if (tn > tmin) { tmin = tn; ax = 1; }
      if (tx < tmax) tmax = tx;
      var t5 = (b.z0 - oz) * iz, t6 = (b.z1 - oz) * iz;
      tn = Math.min(t5, t6); tx = Math.max(t5, t6);
      if (tn > tmin) { tmin = tn; ax = 2; }
      if (tx < tmax) tmax = tx;
      if (tmax < tmin || tmax < 0 || tmin >= best || tmin < 0) continue;
      best = tmin; found = true; bb = b;
      bnx = ax === 0 ? (dx > 0 ? -1 : 1) : 0; bny = ax === 1 ? (dy > 0 ? -1 : 1) : 0; bnz = ax === 2 ? (dz > 0 ? -1 : 1) : 0;
    }
    for (var r = 0; r < this.ramps.length; r++) {
      var P = this.ramps[r].planes, te = -1e30, tl = 1e30, en = null, ok = true;
      for (var p = 0; p < P.length; p++) {
        var pl = P[p];
        var den = pl[0] * dx + pl[1] * dy + pl[2] * dz;
        var dist = pl[3] - (pl[0] * ox + pl[1] * oy + pl[2] * oz);
        if (den === 0) { if (dist < 0) { ok = false; break; } continue; }
        var tt = dist / den;
        if (den < 0) { if (tt > te) { te = tt; en = pl; } } else if (tt < tl) tl = tt;
        if (te > tl) { ok = false; break; }
      }
      if (!ok || !en || te < 0 || te >= best) continue;
      best = te; found = true; bb = null; bnx = en[0]; bny = en[1]; bnz = en[2];
    }
    if (found) { hit.t = best; hit.nx = bnx; hit.ny = bny; hit.nz = bnz; hit.box = bb; }
    return found;
  };
  // line of sight between two points
  var losHit = { t: 0, nx: 0, ny: 0, nz: 0, box: null };
  WP.los = function (ax, ay, az, bx, by, bz) {
    var dx = bx - ax, dy = by - ay, dz = bz - az, l = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (l < 1e-4) return true;
    return !this.ray(ax, ay, az, dx / l, dy / l, dz / l, l - 0.05, losHit, true);
  };
  SS.World = World;
  SS.STEP = STEP;

  /* ======================================================================= NAV */
  var ER = 0.4, EH = 1.7;
  function Nav(W) {
    this.W = W;
    var half = W.half;
    this.cs = 1;
    this.n = Math.round(half * 2);          // cells per side
    this.o = -half;                          // origin
    var n = this.n, cells = n * n, MAXL = 3;
    this.cellNodes = new Int32Array(cells * MAXL).fill(-1);
    var xs = [], ys = [], zs = [], cl = [];
    var cand = [];
    for (var j = 0; j < n; j++) {
      for (var i = 0; i < n; i++) {
        var cx = this.o + (i + 0.5), cz = this.o + (j + 0.5);
        cand.length = 0; cand.push(0);
        var qn = W.query(cx - 0.2, cz - 0.2, cx + 0.2, cz + 0.2);
        for (var k = 0; k < qn; k++) {
          var b = W.boxes[W.q[k]];
          if (cx + 0.2 > b.x0 && cx - 0.2 < b.x1 && cz + 0.2 > b.z0 && cz - 0.2 < b.z1 && b.y1 < 7) cand.push(b.y1);
        }
        for (var r = 0; r < W.ramps.length; r++) { var h = W.rampTop(W.ramps[r], cx - 0.1, cz - 0.1, cx + 0.1, cz + 0.1); if (h > -Infinity) cand.push(h); }
        cand.sort(function (a, b2) { return a - b2; });
        var slot = 0, last = -99;
        for (var c = 0; c < cand.length && slot < MAXL; c++) {
          var y = cand[c];
          if (y - last < 0.3) continue;
          // must be the real support surface here, not inside anything, with room for a body above step height
          var g = W.ground(cx, cz, 0.2, y + 0.05);
          if (Math.abs(g - y) > 0.08) continue;
          if (W.solid(cx - 0.12, y + 0.04, cz - 0.12, cx + 0.12, y + 0.6, cz + 0.12)) continue;
          if (W.solid(cx - ER, y + STEP, cz - ER, cx + ER, y + EH, cz + ER)) continue;
          var id = xs.length;
          xs.push(cx); ys.push(y); zs.push(cz); cl.push(j * n + i);
          this.cellNodes[(j * n + i) * MAXL + slot] = id;
          slot++; last = y;
        }
      }
    }
    this.N = xs.length;
    this.x = new Float32Array(xs); this.y = new Float32Array(ys); this.z = new Float32Array(zs); this.cell = new Int32Array(cl);
    this.MAXL = MAXL;
    // edges
    var adj = [];
    for (var a = 0; a < this.N; a++) adj.push([]);
    var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (var id2 = 0; id2 < this.N; id2++) {
      var ci = this.cell[id2] % n, cj = Math.floor(this.cell[id2] / n), ya = this.y[id2];
      for (var d = 0; d < 8; d++) {
        var ni = ci + dirs[d][0], nj = cj + dirs[d][1];
        if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
        var diag = d >= 4;
        for (var s = 0; s < MAXL; s++) {
          var nb = this.cellNodes[(nj * n + ni) * MAXL + s];
          if (nb < 0) continue;
          var yb = this.y[nb], dy = yb - ya;
          var mx = (this.x[id2] + this.x[nb]) / 2, mz = (this.z[id2] + this.z[nb]) / 2;
          var dist = diag ? 1.4142 : 1;
          if (Math.abs(dy) <= 0.6) {
            var gm = W.ground(mx, mz, 0.15, Math.max(ya, yb) + 0.3);
            if (Math.abs(gm - (ya + yb) / 2) > 0.45) continue;
            if (W.solid(mx - ER * 0.9, gm + STEP, mz - ER * 0.9, mx + ER * 0.9, gm + EH, mz + ER * 0.9)) continue;
            if (W.solid(mx - 0.1, gm + 0.04, mz - 0.1, mx + 0.1, gm + 0.6, mz + 0.1)) continue;
            if (diag && (this.nodeNear(ci + dirs[d][0], cj, ya, 0.6) < 0 || this.nodeNear(ci, cj + dirs[d][1], ya, 0.6) < 0)) continue;
            adj[id2].push(nb, dist, 0);
          } else if (!diag && dy < -0.6 && dy >= -4.2) {
            // walk off a ledge
            if (W.solid(mx - ER * 0.9, ya + 0.08, mz - ER * 0.9, mx + ER * 0.9, ya + EH, mz + ER * 0.9)) continue;
            if (this.nodeNear(ni, nj, ya, 0.6) >= 0) continue;
            // ...only if the floor really ends: a neighbour cell can lack a node at our height just because a
            // wall or rail stands on it (tower doorways, catwalk rails), and walking there hits that wall
            if (W.ground(this.x[nb], this.z[nb], 0.2, ya + 0.3) > ya - 0.3) continue;
            adj[id2].push(nb, dist + 1.2, 1);
          } else if (!diag && dy > 0.6 && dy <= 1.15) {
            // hop up onto a low block
            if (W.solid(mx - ER * 0.9, yb + 0.08, mz - ER * 0.9, mx + ER * 0.9, yb + EH, mz + ER * 0.9)) continue;
            if (W.ceil(this.x[id2], this.z[id2], 0.3, ya + 1.0) < ya + EH + 1.3) continue;
            adj[id2].push(nb, dist + 2.0, 2);
          }
        }
      }
    }
    var tot = 0; this.eStart = new Int32Array(this.N + 1);
    for (var e = 0; e < this.N; e++) { this.eStart[e] = tot; tot += adj[e].length / 3; }
    this.eStart[this.N] = tot;
    this.eTo = new Int32Array(tot); this.eCost = new Float32Array(tot); this.eType = new Uint8Array(tot);
    for (var e2 = 0, p = 0; e2 < this.N; e2++) {
      for (var m = 0; m < adj[e2].length; m += 3) { this.eTo[p] = adj[e2][m]; this.eCost[p] = adj[e2][m + 1]; this.eType[p] = adj[e2][m + 2]; p++; }
    }
    // A* scratch
    this.g = new Float32Array(this.N); this.f = new Float32Array(this.N);
    this.par = new Int32Array(this.N); this.mark = new Uint32Array(this.N); this.closed = new Uint32Array(this.N);
    this.heap = new Int32Array(this.N * 4 + 16); this.hn = 0; this.run = 1;
    this.good = new Uint8Array(this.N);
    this.scratch = new Int32Array(this.N);
  }
  var NP = Nav.prototype;
  NP.nodeNear = function (i, j, y, tol) {
    if (i < 0 || j < 0 || i >= this.n || j >= this.n) return -1;
    var base = (j * this.n + i) * this.MAXL;
    for (var s = 0; s < this.MAXL; s++) { var id = this.cellNodes[base + s]; if (id >= 0 && Math.abs(this.y[id] - y) <= tol) return id; }
    return -1;
  };
  // keep only the main connected area (reachable both ways from a seed node)
  NP.markGood = function (seed) {
    var N = this.N, fw = new Uint8Array(N), bw = new Uint8Array(N), st = this.scratch, sp = 0;
    fw[seed] = 1; st[sp++] = seed;
    while (sp) { var a = st[--sp]; for (var e = this.eStart[a]; e < this.eStart[a + 1]; e++) { var b = this.eTo[e]; if (!fw[b]) { fw[b] = 1; st[sp++] = b; } } }
    // reverse graph
    var rStart = new Int32Array(N + 1), cnt = new Int32Array(N);
    for (var e2 = 0; e2 < this.eTo.length; e2++) cnt[this.eTo[e2]]++;
    for (var i = 0, t = 0; i < N; i++) { rStart[i] = t; t += cnt[i]; } rStart[N] = this.eTo.length;
    var rTo = new Int32Array(this.eTo.length), fill = new Int32Array(N);
    for (var a2 = 0; a2 < N; a2++) for (var e3 = this.eStart[a2]; e3 < this.eStart[a2 + 1]; e3++) { var b2 = this.eTo[e3]; rTo[rStart[b2] + fill[b2]++] = a2; }
    bw[seed] = 1; st[sp++] = seed;
    while (sp) { var c = st[--sp]; for (var e4 = rStart[c]; e4 < rStart[c + 1]; e4++) { var d = rTo[e4]; if (!bw[d]) { bw[d] = 1; st[sp++] = d; } } }
    var n = 0;
    for (var k = 0; k < N; k++) { this.good[k] = (fw[k] && bw[k]) ? 1 : 0; n += this.good[k]; }
    this.goodCount = n;
    this.goodList = new Int32Array(n);
    for (var k2 = 0, p = 0; k2 < N; k2++) if (this.good[k2]) this.goodList[p++] = k2;
    return n;
  };
  // nearest (good) node to a world position
  NP.nearest = function (x, y, z, onlyGood) {
    var n = this.n, ci = Math.floor(x - this.o), cj = Math.floor(z - this.o);
    var best = -1, bd = 1e9;
    for (var rad = 0; rad <= 4; rad++) {
      for (var j = cj - rad; j <= cj + rad; j++) {
        for (var i = ci - rad; i <= ci + rad; i++) {
          if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== rad) continue;
          if (i < 0 || j < 0 || i >= n || j >= n) continue;
          var base = (j * n + i) * this.MAXL;
          for (var s = 0; s < this.MAXL; s++) {
            var id = this.cellNodes[base + s];
            if (id < 0 || (onlyGood !== false && !this.good[id])) continue;
            var dx = this.x[id] - x, dz = this.z[id] - z, dy = this.y[id] - y;
            // prefer the same height level strongly
            var d = dx * dx + dz * dz + (dy > 0.7 ? dy * dy * 6 : dy < -0.7 ? dy * dy * 2 : 0);
            if (d < bd) { bd = d; best = id; }
          }
        }
      }
      if (best >= 0 && rad >= 1) break;
    }
    return best;
  };
  function hpush(nav, id) {
    var h = nav.heap, f = nav.f, i = nav.hn++;
    h[i] = id;
    while (i > 0) { var p = (i - 1) >> 1; if (f[h[p]] <= f[h[i]]) break; var t = h[p]; h[p] = h[i]; h[i] = t; i = p; }
  }
  function hpop(nav) {
    var h = nav.heap, f = nav.f, top = h[0], n = --nav.hn;
    if (n > 0) {
      h[0] = h[n]; var i = 0;
      for (;;) {
        var l = i * 2 + 1, r = l + 1, m = i;
        if (l < n && f[h[l]] < f[h[m]]) m = l;
        if (r < n && f[h[r]] < f[h[m]]) m = r;
        if (m === i) break;
        var t = h[m]; h[m] = h[i]; h[i] = t; i = m;
      }
    }
    return top;
  }
  // A*: writes the node path (start..goal) into out (Int32Array), returns its length (0 = no path)
  NP.path = function (s, goal, out, maxExpand) {
    if (s < 0 || goal < 0) return 0;
    if (s === goal) { out[0] = s; return 1; }
    var run = ++this.run;
    if (run > 4000000000) { this.mark.fill(0); this.closed.fill(0); run = this.run = 1; }
    var gx = this.x[goal], gy = this.y[goal], gz = this.z[goal];
    var X = this.x, Y = this.y, Z = this.z, G = this.g, F = this.f, par = this.par, mark = this.mark, closed = this.closed;
    this.hn = 0;
    G[s] = 0; F[s] = Math.sqrt((X[s] - gx) * (X[s] - gx) + (Z[s] - gz) * (Z[s] - gz)) + Math.abs(Y[s] - gy);
    par[s] = -1; mark[s] = run; hpush(this, s);
    var expand = 0, lim = maxExpand || 6000;
    while (this.hn > 0) {
      var a = hpop(this);
      if (closed[a] === run) continue;
      closed[a] = run;
      if (a === goal) break;
      if (++expand > lim) return 0;
      for (var e = this.eStart[a], ee = this.eStart[a + 1]; e < ee; e++) {
        var b = this.eTo[e];
        if (closed[b] === run) continue;
        var ng = G[a] + this.eCost[e];
        if (mark[b] !== run || ng < G[b]) {
          mark[b] = run; G[b] = ng; par[b] = a;
          var hx = X[b] - gx, hz = Z[b] - gz;
          F[b] = ng + Math.sqrt(hx * hx + hz * hz) + Math.abs(Y[b] - gy);
          if (this.hn < this.heap.length) hpush(this, b);
        }
      }
    }
    if (closed[goal] !== run) return 0;
    var len = 0, c = goal;
    while (c >= 0 && len < this.N) { len++; c = par[c]; }
    if (len > out.length) return 0;
    c = goal;
    for (var i = len - 1; i >= 0; i--) { out[i] = c; c = par[c]; }
    return len;
  };
  SS.Nav = Nav;
})();
