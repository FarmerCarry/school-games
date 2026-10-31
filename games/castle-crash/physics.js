/*
 * Castle Crash — compact 2D rigid bodies (boxes, circles, wedges).
 * Sequential impulses, warm starting, split-impulse position correction,
 * friction, restitution and sleeping islands. Fixed 1/60 s. No Math.random:
 * debris and wind use the world's seeded RNG. Pure: no DOM and no Kit.
 */
(function (root) {
  'use strict';

  var DT = 1 / 60;
  var G = 1280;
  var VEL_ITERS = 8;
  var POS_ITERS = 4;
  var SLOP = 0.75;
  var PERCENT = 0.35;
  var MAX_PUSH = 3.2;
  var REST_V = 90;
  var SLEEP_V = 1.15;
  var SLEEP_W = 0.035;
  var SLEEP_T = 0.5;
  var MAX_V = 1680;
  var SKIN = 0.4;

  function rng(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a |= 0;
      a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function create(seed) {
    return {
      g: G, wind: 0, dt: DT, time: 0, next: 1, bodies: [],
      rand: rng(seed == null ? 1 : seed), seed: seed == null ? 1 : seed | 0,
      contacts: [], hits: [], rests: [], removed: []
    };
  }

  function invInertia(m, ix) {
    return m > 0 && ix > 0 ? 1 / ix : 0;
  }

  function finish(b) {
    if (b.type === 'static') {
      b.m = 0; b.im = 0; b.I = 0; b.iI = 0; b.awake = 0; b.vx = b.vy = b.w = 0;
    } else {
      b.im = b.m > 0 ? 1 / b.m : 0;
      b.iI = invInertia(b.m, b.I);
      b.awake = 1;
    }
    b.sleep = 0;
    b.fx = b.fy = b.tq = 0;
    b.dead = 0;
    return b;
  }

  function addCircle(w, o) {
    var r = o.r, m = o.m;
    var b = finish({
      id: w.next++, type: o.type === 'static' ? 'static' : 'dynamic', shape: 'circle',
      x: o.x, y: o.y, a: o.a || 0, vx: o.vx || 0, vy: o.vy || 0, w: o.ang || 0,
      r: r, verts: null, nv: 0, rad: r, m: m, I: 0.5 * m * r * r,
      fr: o.fr, re: o.re, role: o.role || 'block', mat: o.mat || '', hp: o.hp == null ? 1 : o.hp,
      maxHp: o.maxHp == null ? (o.hp == null ? 1 : o.hp) : o.maxHp, user: o.user || null, damp: o.damp == null ? 0.12 : o.damp
    });
    w.bodies.push(b);
    return b;
  }

  function setBoxVerts(b, hw, hh) {
    b.hw = hw; b.hh = hh; b.nv = 4; b.rad = Math.hypot(hw, hh);
    b.verts = [-hw, -hh, hw, -hh, hw, hh, -hw, hh];
  }

  function addBox(w, o) {
    var hw = o.w / 2, hh = o.h / 2, m = o.m;
    var b = finish({
      id: w.next++, type: o.type === 'static' ? 'static' : 'dynamic', shape: 'box',
      x: o.x, y: o.y, a: o.a || 0, vx: o.vx || 0, vy: o.vy || 0, w: o.ang || 0,
      r: 0, m: m, I: m > 0 ? m * (hw * hw + hh * hh) / 3 : 0,
      fr: o.fr, re: o.re, role: o.role || 'block', mat: o.mat || '', hp: o.hp == null ? 1 : o.hp,
      maxHp: o.maxHp == null ? (o.hp == null ? 1 : o.hp) : o.maxHp, user: o.user || null, damp: o.damp == null ? 0.12 : o.damp
    });
    setBoxVerts(b, hw, hh);
    w.bodies.push(b);
    return b;
  }

  // Convex polygon, at most 4 vertices, in local space. Recentred on the centroid.
  function addPoly(w, o) {
    var src = o.verts, n = src.length;
    if (n < 3) n = 3;
    if (n > 4) n = 4;
    var area = 0, cx = 0, cy = 0, i, j, cr;
    for (i = 0; i < n; i++) {
      j = (i + 1) % n;
      cr = src[i][0] * src[j][1] - src[j][0] * src[i][1];
      area += cr;
      cx += (src[i][0] + src[j][0]) * cr;
      cy += (src[i][1] + src[j][1]) * cr;
    }
    area *= 0.5;
    var inv = area !== 0 ? 1 / (6 * area) : 0;
    cx *= inv; cy *= inv;
    var verts = [], maxr = 0;
    for (i = 0; i < n; i++) {
      var lx = src[i][0] - cx, ly = src[i][1] - cy;
      verts.push(lx, ly);
      var rr = lx * lx + ly * ly;
      if (rr > maxr) maxr = rr;
    }
    var m = o.m;
    var b = finish({
      id: w.next++, type: o.type === 'static' ? 'static' : 'dynamic', shape: 'poly',
      x: o.x + cx, y: o.y + cy, a: o.a || 0, vx: o.vx || 0, vy: o.vy || 0, w: o.ang || 0,
      r: 0, nv: n, verts: verts, rad: Math.sqrt(maxr), hw: 0, hh: 0,
      m: m, I: m > 0 ? m * maxr * 0.5 : 0,
      fr: o.fr, re: o.re, role: o.role || 'block', mat: o.mat || '', hp: o.hp == null ? 1 : o.hp,
      maxHp: o.maxHp == null ? (o.hp == null ? 1 : o.hp) : o.maxHp, user: o.user || null, damp: o.damp == null ? 0.12 : o.damp
    });
    w.bodies.push(b);
    return b;
  }

  function removeBody(w, b) {
    b.dead = 1;
    var i = w.bodies.indexOf(b);
    if (i >= 0) w.bodies.splice(i, 1);
  }

  function speed(b) { return Math.hypot(b.vx, b.vy); }

  function worldVerts(b, out) {
    var c = Math.cos(b.a), s = Math.sin(b.a), v = b.verts, n = b.nv, i, lx, ly;
    for (i = 0; i < n; i++) {
      lx = v[i << 1]; ly = v[(i << 1) + 1];
      out[i << 1] = b.x + c * lx - s * ly;
      out[(i << 1) + 1] = b.y + s * lx + c * ly;
    }
    return n;
  }

  function project(v, n, nx, ny) {
    var min = 1e9, max = -1e9, i, d;
    for (i = 0; i < n; i++) {
      d = v[i << 1] * nx + v[(i << 1) + 1] * ny;
      if (d < min) min = d;
      if (d > max) max = d;
    }
    return [min, max];
  }

  function faceOutward(v, n, i, cx, cy) {
    var j = (i + 1) % n;
    var ex = v[j << 1] - v[i << 1], ey = v[(j << 1) + 1] - v[(i << 1) + 1];
    var len = Math.hypot(ex, ey) || 1;
    var nx = ey / len, ny = -ex / len;
    var mx = (v[i << 1] + v[j << 1]) * 0.5 - cx;
    var my = (v[(i << 1) + 1] + v[(j << 1) + 1]) * 0.5 - cy;
    if (nx * mx + ny * my < 0) { nx = -nx; ny = -ny; }
    return [nx, ny, i, j];
  }

  // Minimum-penetration axis. Normal points from A to B. Null when separated.
  function sat(av, an, acx, acy, bv, bn, bcx, bcy) {
    var best = 1e9, nx = 0, ny = 1, ref = 'a', ri = 0, i, o, A, B, sep, pen, fnx, fny;
    for (i = 0; i < an; i++) {
      o = faceOutward(av, an, i, acx, acy);
      A = project(av, an, o[0], o[1]);
      B = project(bv, bn, o[0], o[1]);
      sep = B[0] - A[1];
      if (sep > SKIN) return null;
      pen = -sep;
      if (pen < best) { best = pen; nx = o[0]; ny = o[1]; ref = 'a'; ri = i; }
    }
    for (i = 0; i < bn; i++) {
      o = faceOutward(bv, bn, i, bcx, bcy);
      A = project(av, an, o[0], o[1]);
      B = project(bv, bn, o[0], o[1]);
      sep = A[0] - B[1];
      if (sep > SKIN) return null;
      pen = -sep;
      fnx = -o[0]; fny = -o[1];
      if (pen < best) { best = pen; nx = fnx; ny = fny; ref = 'b'; ri = i; }
    }
    return { pen: best, nx: nx, ny: ny, ref: ref, ri: ri };
  }

  function clip(x0, y0, x1, y1, nx, ny, off) {
    var d0 = x0 * nx + y0 * ny - off, d1 = x1 * nx + y1 * ny - off, out = [];
    if (d0 <= 0) out.push(x0, y0);
    if (d1 <= 0) out.push(x1, y1);
    if (d0 * d1 < 0) {
      var t = d0 / (d0 - d1);
      out.push(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
    }
    return out;
  }

  function polyManifold(av, an, bv, bn, hit) {
    var refIsA = hit.ref === 'a';
    var rv = refIsA ? av : bv, rn = refIsA ? an : bn;
    var iv = refIsA ? bv : av, inn = refIsA ? bn : an;
    // Reference face: the edge whose outward normal best matches the normal that
    // points out of the reference body (from reference toward the other).
    var wantx = refIsA ? hit.nx : -hit.nx, wanty = refIsA ? hit.ny : -hit.ny;
    var cx = 0, cy = 0, i;
    for (i = 0; i < rn; i++) { cx += rv[i << 1]; cy += rv[(i << 1) + 1]; }
    cx /= rn; cy /= rn;
    var best = -2, bi = 0, o;
    for (i = 0; i < rn; i++) {
      o = faceOutward(rv, rn, i, cx, cy);
      var d = o[0] * wantx + o[1] * wanty;
      if (d > best) { best = d; bi = i; }
    }
    var j = (bi + 1) % rn;
    var r0x = rv[bi << 1], r0y = rv[(bi << 1) + 1], r1x = rv[j << 1], r1y = rv[(j << 1) + 1];
    var ex = r1x - r0x, ey = r1y - r0y, el = Math.hypot(ex, ey) || 1;
    ex /= el; ey /= el;
    var rnx = wantx, rny = wanty;
    // Incident face on the other body: most anti-parallel to the reference normal.
    cx = 0; cy = 0;
    for (i = 0; i < inn; i++) { cx += iv[i << 1]; cy += iv[(i << 1) + 1]; }
    cx /= inn; cy /= inn;
    best = 2; var ii = 0;
    for (i = 0; i < inn; i++) {
      o = faceOutward(iv, inn, i, cx, cy);
      var d2 = o[0] * rnx + o[1] * rny;
      if (d2 < best) { best = d2; ii = i; }
    }
    var ij = (ii + 1) % inn;
    var pts = [iv[ii << 1], iv[(ii << 1) + 1], iv[ij << 1], iv[(ij << 1) + 1]];
    var c1 = clip(pts[0], pts[1], pts[2], pts[3], ex, ey, r1x * ex + r1y * ey);
    if (c1.length < 4) return [];
    var c2 = clip(c1[0], c1[1], c1[2], c1[3], -ex, -ey, -(r0x * ex + r0y * ey));
    if (c2.length < 4) return [];
    var face = r0x * rnx + r0y * rny;
    var out = [];
    for (i = 0; i < c2.length; i += 2) {
      var sep = c2[i] * rnx + c2[i + 1] * rny - face;
      if (sep <= SLOP) out.push(c2[i], c2[i + 1], Math.max(0, -sep));
    }
    if (out.length > 6) out = out.slice(0, 6);
    return out;
  }

  function closestOnPoly(v, n, px, py) {
    var best = 1e9, bx = v[0], by = v[1], inside = true, i, j, ex, ey, el, t, qx, qy, dx, dy, d, nx, ny, sep;
    var cx = 0, cy = 0;
    for (i = 0; i < n; i++) { cx += v[i << 1]; cy += v[(i << 1) + 1]; }
    cx /= n; cy /= n;
    for (i = 0; i < n; i++) {
      j = (i + 1) % n;
      var o = faceOutward(v, n, i, cx, cy);
      nx = o[0]; ny = o[1];
      sep = (px - v[i << 1]) * nx + (py - v[(i << 1) + 1]) * ny;
      if (sep > 0) inside = false;
      ex = v[j << 1] - v[i << 1]; ey = v[(j << 1) + 1] - v[(i << 1) + 1];
      el = ex * ex + ey * ey || 1;
      t = ((px - v[i << 1]) * ex + (py - v[(i << 1) + 1]) * ey) / el;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      qx = v[i << 1] + ex * t; qy = v[(i << 1) + 1] + ey * t;
      dx = px - qx; dy = py - qy; d = dx * dx + dy * dy;
      if (d < best) { best = d; bx = qx; by = qy; }
    }
    return { x: bx, y: by, d: Math.sqrt(best), inside: inside, cx: cx, cy: cy };
  }

  function circlePoly(cx, cy, r, v, n) {
    var c = closestOnPoly(v, n, cx, cy);
    if (!c.inside && c.d > r + SKIN) return null;
    var nx, ny, pen, px, py;
    if (c.inside) {
      // Push out along the shallowest face.
      var best = 1e9, i, o, sep;
      nx = 0; ny = -1;
      for (i = 0; i < n; i++) {
        o = faceOutward(v, n, i, c.cx, c.cy);
        sep = (cx - v[i << 1]) * o[0] + (cy - v[(i << 1) + 1]) * o[1];
        var facePen = r - sep;
        if (facePen < best) { best = facePen; nx = o[0]; ny = o[1]; }
      }
      pen = best;
      px = cx - nx * r; py = cy - ny * r;
    } else {
      var d = c.d || 1e-6;
      nx = (cx - c.x) / d; ny = (cy - c.y) / d;
      pen = r - c.d;
      px = c.x; py = c.y;
    }
    if (pen < -SKIN) return null;
    return { nx: nx, ny: ny, pts: [px, py, Math.max(0, pen)] };
  }

  function circleCircle(a, b) {
    var dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), pen = a.r + b.r - d;
    if (pen < -SKIN) return null;
    var nx, ny;
    if (d < 1e-6) { nx = 0; ny = -1; d = 0; } else { nx = dx / d; ny = dy / d; }
    var px = a.x + nx * a.r, py = a.y + ny * a.r;
    return { nx: nx, ny: ny, pts: [px, py, Math.max(0, pen)] };
  }

  function toLocal(b, px, py) {
    var c = Math.cos(b.a), s = Math.sin(b.a), dx = px - b.x, dy = py - b.y;
    return [c * dx + s * dy, -s * dx + c * dy];
  }

  function makeContact(a, b, nx, ny, pts) {
    var n = 0, p = [], i;
    for (i = 0; i + 2 < pts.length && n < 2; i += 3) {
      var la = toLocal(a, pts[i], pts[i + 1]), lb = toLocal(b, pts[i], pts[i + 1]);
      p.push({ lx: la[0], ly: la[1], mx: lb[0], my: lb[1], pn: 0, pt: 0, sep: pts[i + 2] });
      n++;
    }
    if (!n) return null;
    return { a: a, b: b, nx: nx, ny: ny, n: n, p: p, fr: Math.sqrt(Math.max(0, a.fr * b.fr)), re: Math.max(a.re, b.re), warm: false };
  }

  function collidePair(a, b, tmpA, tmpB) {
    if (a.type === 'static' && b.type === 'static') return null;
    if (Math.hypot(a.x - b.x, a.y - b.y) > a.rad + b.rad + 2) return null;
    if (a.shape === 'circle' && b.shape === 'circle') {
      var cc = circleCircle(a, b);
      return cc ? makeContact(a, b, cc.nx, cc.ny, cc.pts) : null;
    }
    if (a.shape === 'circle' || b.shape === 'circle') {
      var circ = a.shape === 'circle' ? a : b, poly = circ === a ? b : a;
      var nv = worldVerts(poly, poly === a ? tmpA : tmpB);
      var cp = circlePoly(circ.x, circ.y, circ.r, poly === a ? tmpA : tmpB, nv);
      if (!cp) return null;
      // circlePoly normal points out of the polygon toward the circle.
      if (poly === a) return makeContact(a, b, cp.nx, cp.ny, cp.pts);
      return makeContact(a, b, -cp.nx, -cp.ny, cp.pts);
    }
    var na = worldVerts(a, tmpA), nb = worldVerts(b, tmpB);
    var hit = sat(tmpA, na, a.x, a.y, tmpB, nb, b.x, b.y);
    if (!hit || hit.pen > 48) return null;
    var pts = polyManifold(tmpA, na, tmpB, nb, hit);
    if (pts.length < 3) {
      // Support vertex of B along the normal, so a corner still braces.
      var sx = 0, sy = 0, sd = -1e9, i, d;
      for (i = 0; i < nb; i++) {
        d = tmpB[i << 1] * hit.nx + tmpB[(i << 1) + 1] * hit.ny;
        if (d > sd) { sd = d; sx = tmpB[i << 1]; sy = tmpB[(i << 1) + 1]; }
      }
      pts = [sx, sy, hit.pen];
    }
    return makeContact(a, b, hit.nx, hit.ny, pts);
  }

  function matchWarm(w, list) {
    var prev = w.contacts, i, j, k, c, q, best, bd, dx, dy;
    for (i = 0; i < list.length; i++) {
      c = list[i];
      q = null;
      for (j = 0; j < prev.length; j++) {
        if (prev[j].a === c.a && prev[j].b === c.b) { q = prev[j]; break; }
        if (prev[j].a === c.b && prev[j].b === c.a) { q = prev[j]; break; }
      }
      if (!q) continue;
      var flip = q.a !== c.a;
      for (k = 0; k < c.n; k++) {
        best = 8; bd = 64;
        var wx = c.a.x, wy = c.a.y;
        var ca = Math.cos(c.a.a), sa = Math.sin(c.a.a);
        wx = c.a.x + ca * c.p[k].lx - sa * c.p[k].ly;
        wy = c.a.y + sa * c.p[k].lx + ca * c.p[k].ly;
        for (j = 0; j < q.n; j++) {
          var ox, oy;
          if (!flip) {
            var cqa = Math.cos(q.a.a), sqa = Math.sin(q.a.a);
            ox = q.a.x + cqa * q.p[j].lx - sqa * q.p[j].ly;
            oy = q.a.y + sqa * q.p[j].lx + cqa * q.p[j].ly;
          } else {
            var cqb = Math.cos(q.b.a), sqb = Math.sin(q.b.a);
            ox = q.b.x + cqb * q.p[j].mx - sqb * q.p[j].my;
            oy = q.b.y + sqb * q.p[j].mx + cqb * q.p[j].my;
          }
          dx = wx - ox; dy = wy - oy;
          if (dx * dx + dy * dy < bd) { bd = dx * dx + dy * dy; best = j; }
        }
        if (best < q.n && bd < 36) {
          c.p[k].pn = q.p[best].pn;
          // Tangent warm start walks tall stacks: a stale friction couple
          // never quite unwinds in 8 iterations. Normal warm start is what
          // holds the weight.
          c.p[k].pt = 0;
          c.warm = true;
        }
      }
    }
  }

  function wakeFrom(list) {
    var changed = true, guard = 0, i, c;
    while (changed && guard++ < 8) {
      changed = false;
      for (i = 0; i < list.length; i++) {
        c = list[i];
        if (c.a.dead || c.b.dead) continue;
        if (c.a.type === 'dynamic' && c.a.awake && c.b.type === 'dynamic' && !c.b.awake) { c.b.awake = 1; c.b.sleep = 0; changed = true; }
        if (c.b.type === 'dynamic' && c.b.awake && c.a.type === 'dynamic' && !c.a.awake) { c.a.awake = 1; c.a.sleep = 0; changed = true; }
      }
    }
  }

  function applyImp(b, ix, iy, rx, ry) {
    if (b.im === 0) return;
    b.vx += ix * b.im; b.vy += iy * b.im;
    b.w += b.iI * (rx * iy - ry * ix);
  }

  function pointWorld(b, lx, ly) {
    var c = Math.cos(b.a), s = Math.sin(b.a);
    return [b.x + c * lx - s * ly, b.y + s * lx + c * ly];
  }

  function relVel(a, b, rax, ray, rbx, rby) {
    var avx = a.vx - a.w * ray, avy = a.vy + a.w * rax;
    var bvx = b.vx - b.w * rby, bvy = b.vy + b.w * rbx;
    return [bvx - avx, bvy - avy];
  }

  function solveVelocity(list) {
    var i, k, c, a, b, p, wa, wb, rv, vn, rnA, rnB, kn, j, tx, ty, vt, jt, maxF;
    // Bias from the incoming velocity, then warm-start. Doing it the other way
    // treats a resting contact as a bounce.
    for (i = 0; i < list.length; i++) {
      c = list[i]; a = c.a; b = c.b;
      if (!a.awake && !b.awake) continue;
      if (a.type === 'static' && !b.awake) continue;
      if (b.type === 'static' && !a.awake) continue;
      for (k = 0; k < c.n; k++) {
        p = c.p[k];
        wa = pointWorld(a, p.lx, p.ly); wb = pointWorld(b, p.mx, p.my);
        var px = (wa[0] + wb[0]) * 0.5, py = (wa[1] + wb[1]) * 0.5;
        var rax = px - a.x, ray = py - a.y, rbx = px - b.x, rby = py - b.y;
        rv = relVel(a, b, rax, ray, rbx, rby);
        vn = rv[0] * c.nx + rv[1] * c.ny;
        p.bias = vn < -REST_V ? -c.re * vn : 0;
        p._vn = vn;
        if (p.pn !== 0) applyImp(b, c.nx * p.pn, c.ny * p.pn, rbx, rby), applyImp(a, -c.nx * p.pn, -c.ny * p.pn, rax, ray);
        tx = -c.ny; ty = c.nx;
        if (p.pt !== 0) applyImp(b, tx * p.pt, ty * p.pt, rbx, rby), applyImp(a, -tx * p.pt, -ty * p.pt, rax, ray);
      }
    }
    for (var iter = 0; iter < VEL_ITERS; iter++) {
      for (i = 0; i < list.length; i++) {
        c = list[i]; a = c.a; b = c.b;
        if (!a.awake && !b.awake) continue;
        if (a.type === 'static' && !b.awake) continue;
        if (b.type === 'static' && !a.awake) continue;
        for (k = 0; k < c.n; k++) {
          p = c.p[k];
          wa = pointWorld(a, p.lx, p.ly); wb = pointWorld(b, p.mx, p.my);
          var px2 = (wa[0] + wb[0]) * 0.5, py2 = (wa[1] + wb[1]) * 0.5;
          var rax2 = px2 - a.x, ray2 = py2 - a.y, rbx2 = px2 - b.x, rby2 = py2 - b.y;
          rv = relVel(a, b, rax2, ray2, rbx2, rby2);
          vn = rv[0] * c.nx + rv[1] * c.ny;
          rnA = rax2 * c.ny - ray2 * c.nx;
          rnB = rbx2 * c.ny - rby2 * c.nx;
          kn = a.im + b.im + a.iI * rnA * rnA + b.iI * rnB * rnB;
          if (kn <= 1e-8) continue;
          j = -(vn - p.bias) / kn;
          var old = p.pn;
          p.pn = old + j;
          if (p.pn < 0) p.pn = 0;
          j = p.pn - old;
          if (j !== 0) {
            applyImp(b, c.nx * j, c.ny * j, rbx2, rby2);
            applyImp(a, -c.nx * j, -c.ny * j, rax2, ray2);
          }
          rv = relVel(a, b, rax2, ray2, rbx2, rby2);
          tx = -c.ny; ty = c.nx;
          vt = rv[0] * tx + rv[1] * ty;
          var rtnA = rax2 * ty - ray2 * tx, rtnB = rbx2 * ty - rby2 * tx;
          var kt = a.im + b.im + a.iI * rtnA * rtnA + b.iI * rtnB * rtnB;
          if (kt <= 1e-8) continue;
          jt = -vt / kt;
          maxF = c.fr * p.pn;
          old = p.pt;
          p.pt = old + jt;
          if (p.pt > maxF) p.pt = maxF;
          else if (p.pt < -maxF) p.pt = -maxF;
          jt = p.pt - old;
          if (jt !== 0) {
            applyImp(b, tx * jt, ty * jt, rbx2, rby2);
            applyImp(a, -tx * jt, -ty * jt, rax2, ray2);
          }
        }
      }
    }
  }

  // Fresh manifolds: the velocity contact's stored points coincide in world
  // space, so they cannot measure penetration. Position correction re-tests.
  function solvePosition(w, pairs) {
    var tmpA = solvePosition._a || (solvePosition._a = new Array(8));
    var tmpB = solvePosition._b || (solvePosition._b = new Array(8));
    var iter, i, k, a, b, c, p, pen, px, py, rax, ray, rbx, rby, rnA, rnB, kn, corr, j;
    for (iter = 0; iter < POS_ITERS; iter++) {
      for (i = 0; i < pairs.length; i++) {
        a = pairs[i][0]; b = pairs[i][1];
        if (a.dead || b.dead) continue;
        if (!a.awake && !b.awake) continue;
        if (a.type === 'static' && !b.awake) continue;
        if (b.type === 'static' && !a.awake) continue;
        c = collidePair(a, b, tmpA, tmpB);
        if (!c) continue;
        pen = 0; px = (a.x + b.x) * 0.5; py = (a.y + b.y) * 0.5;
        for (k = 0; k < c.n; k++) {
          p = c.p[k];
          if (p.sep > pen) {
            pen = p.sep;
            var wa = pointWorld(a, p.lx, p.ly);
            px = wa[0]; py = wa[1];
          }
        }
        if (pen <= SLOP) continue;
        rax = px - a.x; ray = py - a.y; rbx = px - b.x; rby = py - b.y;
        rnA = rax * c.ny - ray * c.nx;
        rnB = rbx * c.ny - rby * c.nx;
        kn = a.im + b.im + a.iI * rnA * rnA + b.iI * rnB * rnB;
        if (kn <= 1e-8) continue;
        corr = (pen - SLOP) * PERCENT;
        if (corr > MAX_PUSH) corr = MAX_PUSH;
        j = corr / kn;
        a.x -= c.nx * j * a.im; a.y -= c.ny * j * a.im;
        b.x += c.nx * j * b.im; b.y += c.ny * j * b.im;
        // Angular position correction on a calm stack becomes a slow topple.
        // A fast body (a real hit) still gets the twist.
        if (speed(a) > 50 || speed(b) > 50 || Math.abs(a.w) > 0.9 || Math.abs(b.w) > 0.9) {
          a.a -= a.iI * rnA * j; b.a += b.iI * rnB * j;
        }
      }
    }
  }

  function integrate(w) {
    var bodies = w.bodies, i, b, damp, v;
    for (i = 0; i < bodies.length; i++) {
      b = bodies[i];
      if (b.type !== 'dynamic' || !b.awake || b.dead) continue;
      b.vy += w.g * DT;
      if (b.role === 'shot') b.vx += w.wind * DT;
      b.vx += b.fx * b.im * DT; b.vy += b.fy * b.im * DT; b.w += b.tq * b.iI * DT;
      b.fx = b.fy = b.tq = 0;
      damp = Math.exp(-(b.damp || 0) * DT);
      b.vx *= damp; b.vy *= damp; b.w *= Math.exp(-((b.damp || 0) + 0.15) * DT);
      v = Math.hypot(b.vx, b.vy);
      if (v > MAX_V) { b.vx *= MAX_V / v; b.vy *= MAX_V / v; }
      if (b.w > 14) b.w = 14; else if (b.w < -14) b.w = -14;
      b.x += b.vx * DT; b.y += b.vy * DT; b.a += b.w * DT;
    }
  }

  // Sequential impulses leave a small couple, and that couple tilts the next
  // normal until a tall fort walks itself over. While a block is upright, not
  // really travelling, and touching something, drop the leftover velocity.
  // A knockdown is faster than this gate, so it still tumbles.
  function settle(w, list) {
    var i, b, ang, touched = settle._t || (settle._t = new Set());
    touched.clear();
    for (i = 0; i < list.length; i++) {
      touched.add(list[i].a); touched.add(list[i].b);
    }
    for (i = 0; i < w.bodies.length; i++) {
      b = w.bodies[i];
      if (b.type !== 'dynamic' || b.dead || b.role === 'shot' || !b.awake) continue;
      ang = Math.atan2(Math.sin(b.a), Math.cos(b.a));
      // Only a body that is hardly moving sideways and is actually resting
      // on something. A hit that shoves it keeps its velocity, and a block
      // whose support has flown away is not resting, so it falls.
      if (Math.abs(ang) >= 0.28 || Math.abs(b.vx) >= 36 || Math.abs(b.w) >= 0.6) continue;
      var sup = false, ci;
      for (ci = 0; ci < list.length && !sup; ci++) {
        var cc = list[ci];
        if (cc.ny < -0.5 && cc.b === b) sup = true;
        else if (cc.ny > 0.5 && cc.a === b) sup = true;
      }
      if (!sup) continue;
      b.w = 0;
      b.vx = 0;
      b.a = ang * 0.15;
      b.vy = 0;
      // The holding impulse is often far too big. Kept as a warm start it
      // fires the block upward on the next step, so a settled body rebuilds it.
      b._cool = 1;
    }
    for (i = 0; i < list.length; i++) {
      var c = list[i];
      if (!c.a._cool && !c.b._cool) continue;
      for (var k = 0; k < c.n; k++) { c.p[k].pn = 0; c.p[k].pt = 0; }
    }
    for (i = 0; i < w.bodies.length; i++) w.bodies[i]._cool = 0;
  }

  function updateSleep(w, list) {
    var bodies = w.bodies, i, b, supported, c, k;
    for (i = 0; i < bodies.length; i++) {
      b = bodies[i];
      if (b.type !== 'dynamic' || b.dead) continue;
      if (b.role === 'shot') { b.awake = 1; b.sleep = 0; continue; }
      if (!b.awake) continue;
      if (speed(b) < SLEEP_V && Math.abs(b.w) < SLEEP_W) b.sleep += DT;
      else b.sleep = 0;
      if (b.sleep < SLEEP_T) continue;
      supported = false;
      for (k = 0; k < list.length && !supported; k++) {
        c = list[k];
        if (c.a !== b && c.b !== b) continue;
        var o = c.a === b ? c.b : c.a;
        // A body may sleep on a static or on another body that is already calm.
        if (o.type === 'static' || !o.awake || (speed(o) < SLEEP_V && Math.abs(o.w) < SLEEP_W)) supported = true;
      }
      if (!supported) { b.sleep = SLEEP_T * 0.5; continue; }
      b.awake = 0; b.vx = b.vy = b.w = 0; b.sleep = SLEEP_T;
    }
  }

  function collectHits(w, list) {
    w.hits.length = 0; w.rests.length = 0;
    var i, k, c, p, jn, approach;
    for (i = 0; i < list.length; i++) {
      c = list[i];
      jn = 0; approach = 0;
      for (k = 0; k < c.n; k++) {
        p = c.p[k];
        jn += p.pn;
        if (p._vn < approach) approach = p._vn;
      }
      if (jn <= 0) continue;
      var rec = { a: c.a, b: c.b, j: jn, approach: -approach, nx: c.nx, ny: c.ny };
      if (-approach > 70) w.hits.push(rec);
      else w.rests.push(rec);
    }
  }

  function step(w) {
    var bodies = w.bodies, list = [], i, j, a, b;
    var tmpA = step._a || (step._a = new Array(8));
    var tmpB = step._b || (step._b = new Array(8));
    integrate(w);
    for (i = 0; i < bodies.length; i++) {
      a = bodies[i];
      if (a.dead) continue;
      for (j = i + 1; j < bodies.length; j++) {
        b = bodies[j];
        if (b.dead) continue;
        if (!a.awake && !b.awake) continue;
        if (a.type === 'static' && !b.awake) continue;
        if (b.type === 'static' && !a.awake) continue;
        var c = collidePair(a, b, tmpA, tmpB);
        if (c) list.push(c);
      }
    }
    matchWarm(w, list);
    wakeFrom(list);
    solveVelocity(list);
    var pairs = [];
    for (i = 0; i < list.length; i++) pairs.push([list[i].a, list[i].b]);
    solvePosition(w, pairs);
    collectHits(w, list);
    settle(w, list);
    updateSleep(w, list);
    w.contacts = list;
    w.time += DT;
    // Drop anything that fell out of the playfield so a scene stays bounded.
    for (i = bodies.length - 1; i >= 0; i--) {
      b = bodies[i];
      if (b.type === 'dynamic' && (b.y > 980 || b.x < -400 || b.x > 1800 || !isFinite(b.x))) {
        b.dead = 1;
        bodies.splice(i, 1);
      }
    }
  }

  function impulse(b, ix, iy, px, py) {
    if (b.type !== 'dynamic' || b.dead) return;
    b.awake = 1; b.sleep = 0;
    var rx = (px == null ? b.x : px) - b.x, ry = (py == null ? b.y : py) - b.y;
    applyImp(b, ix, iy, rx, ry);
  }

  function blast(w, x, y, radius, power) {
    var i, b, dx, dy, d, f, nx, ny;
    for (i = 0; i < w.bodies.length; i++) {
      b = w.bodies[i];
      if (b.type !== 'dynamic' || b.dead) continue;
      dx = b.x - x; dy = b.y - y; d = Math.hypot(dx, dy);
      if (d > radius || d < 0.001) continue;
      f = power * (1 - d / radius);
      nx = dx / d; ny = dy / d;
      impulse(b, nx * f, ny * f, b.x, b.y);
    }
  }

  function maxSpeed(w) {
    var m = 0, i, b, s;
    for (i = 0; i < w.bodies.length; i++) {
      b = w.bodies[i];
      if (b.type !== 'dynamic' || b.dead || !b.awake) continue;
      s = speed(b);
      if (s > m) m = s;
    }
    return m;
  }

  root.CCP = {
    G: G, DT: DT, WIND_MAX: 150, VEL_ITERS: VEL_ITERS,
    create: create, addCircle: addCircle, addBox: addBox, addPoly: addPoly,
    remove: removeBody, step: step, impulse: impulse, blast: blast,
    speed: speed, maxSpeed: maxSpeed, rng: rng
  };
})(typeof window !== 'undefined' ? window : globalThis);
