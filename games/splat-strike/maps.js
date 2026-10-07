/*
 * Splat Strike — maps.js
 * Three small arenas (40 x 40 m, two height levels, ramps, lots of cover).
 * Every map is written with the MapKit helpers below, which add BOTH the merged visual geometry
 * (one draw call) and the matching colliders to the collision world, so what you see is what you hit.
 */
(function () {
  'use strict';
  var SS = window.SS;
  var T = window.THREE;

  function MapKit(half) {
    this.half = half;
    this.b = new SS.Builder(); this.b.ao = true;
    this.W = new SS.World(half);
    this.spawns = []; this.pickups = []; this.hot = []; this.shades = [];
    this.belts = []; // {x0,z0,x1,z1,y,dir}
  }
  var M = MapKit.prototype;
  M.solid = function (x0, y0, z0, x1, y1, z1, col, o) { this.b.box(x0, y0, z0, x1, y1, z1, col, o); return this.W.addBox(x0, y0, z0, x1, y1, z1, o); };
  M.coll = function (x0, y0, z0, x1, y1, z1, o) { return this.W.addBox(x0, y0, z0, x1, y1, z1, o); };
  M.ramp = function (x0, z0, x1, z1, base, ya, yb, dir, col, o) {
    this.b.wedge(x0, z0, x1, z1, base, ya, yb, dir, col, o);
    this.W.addRamp(x0, z0, x1, z1, base, ya, yb, dir);
  };
  // platform slab with top at y, corner posts, coloured trim
  M.deck = function (x0, z0, x1, z1, y, col, o) {
    o = o || {};
    var th = o.th || 0.3;
    this.solid(x0, y - th, z0, x1, y, z1, col, { top: o.top, bottom: true });
    if (o.trim) this.b.box(x0 - 0.04, y - th - 0.02, z0 - 0.04, x1 + 0.04, y - th + 0.1, z1 + 0.04, o.trim, { bottom: true });
    if (o.posts !== false) {
      var p = o.post || 0xf4f4f4, s = o.ps || 0.36, inx = 0.05;
      var pts = o.postAt || [[x0 + inx, z0 + inx], [x1 - inx - s, z0 + inx], [x0 + inx, z1 - inx - s], [x1 - inx - s, z1 - inx - s]];
      for (var i = 0; i < pts.length; i++) this.solid(pts[i][0], 0, pts[i][1], pts[i][0] + s, y - th, pts[i][1] + s, p);
    }
    this.shade(x0, z0, x1, z1, 0.72);
  };
  // see-through rail: blocks walking, not paint
  M.rail = function (x0, z0, x1, z1, y, h, col, o) {
    o = o || {};
    var dx = x1 - x0, dz = z1 - z0, len = Math.max(Math.abs(dx), Math.abs(dz));
    var n = Math.max(1, Math.round(len / 1.6)), t = 0.07;
    for (var i = 0; i <= n; i++) {
      var px = x0 + dx * i / n, pz = z0 + dz * i / n;
      this.b.box(px - t, y, pz - t, px + t, y + h, pz + t, col);
    }
    var ax = Math.abs(dx) > Math.abs(dz);
    var hx = ax ? 0 : 0.05, hz = ax ? 0.05 : 0;
    this.b.box(Math.min(x0, x1) - hx, y + h - 0.08, Math.min(z0, z1) - hz, Math.max(x0, x1) + hx, y + h + 0.02, Math.max(z0, z1) + hz, o.bar || col);
    if (o.mid !== false) this.b.box(Math.min(x0, x1) - hx * 0.6, y + h * 0.5 - 0.04, Math.min(z0, z1) - hz * 0.6, Math.max(x0, x1) + hx * 0.6, y + h * 0.5 + 0.02, Math.max(z0, z1) + hz * 0.6, o.bar || col);
    this.W.addBox(Math.min(x0, x1) - (ax ? 0 : 0.1), y, Math.min(z0, z1) - (ax ? 0.1 : 0), Math.max(x0, x1) + (ax ? 0 : 0.1), y + Math.max(h, 1.0), Math.max(z0, z1) + (ax ? 0.1 : 0), { noShot: true, noDecal: true });
  };
  // vertical cylinder with a square collider
  M.cylS = function (cx, cz, r, y0, h, col, o) {
    o = o || {};
    this.b.cyl(cx, y0, cz, r, h, col, o);
    var s = r * (o.cf || 0.86);
    this.W.addBox(cx - s, y0, cz - s, cx + s, y0 + h, cz + s);
  };
  // flat 1 m tiles laid on top of a surface at height y (visual variety on big platforms)
  M.tiles = function (x0, z0, x1, z1, y, fn) {
    var ao = this.b.ao; this.b.ao = false;
    for (var z = z0; z < z1 - 0.01; z++) for (var x = x0; x < x1 - 0.01; x++) {
      var xe = Math.min(x + 1, x1), ze = Math.min(z + 1, z1);
      this.b.quad(x, y + 0.004, ze, xe, y + 0.004, ze, xe, y + 0.004, z, x, y + 0.004, z, fn(x + 0.5, z + 0.5));
    }
    this.b.ao = ao;
  };
  M.shade = function (x0, z0, x1, z1, k) { this.shades.push([x0, z0, x1, z1, k]); };
  // team 1 / 2 = that team's base (also used in free-for-all), 0 = neutral, ffa = free-for-all only
  M.spawn = function (x, z, team, y, ffa) { this.spawns.push({ x: x, z: z, y: y || 0, team: team || 0, ffa: !!ffa }); };
  M.pick = function (type, x, z, y) { this.pickups.push({ type: type, x: x, z: z, y: y || 0 }); };
  M.hotspot = function (x, z, y) { this.hot.push({ x: x, z: z, y: y || 0 }); };
  // ground tiles (1 m) coloured by fn(x,z) -> hex, darkened under decks
  M.ground = function (fn) {
    var h = this.half, b = this.b, ao = b.ao;
    b.ao = false;
    var k, c, col = [0, 0, 0];
    for (var z = -h; z < h; z++) {
      for (var x = -h; x < h; x++) {
        c = SS.lin(fn(x + 0.5, z + 0.5));
        k = 1;
        for (var s = 0; s < this.shades.length; s++) {
          var S = this.shades[s];
          if (x + 0.5 > S[0] && x + 0.5 < S[2] && z + 0.5 > S[1] && z + 0.5 < S[3]) k = Math.min(k, S[4]);
        }
        col[0] = c[0] * k; col[1] = c[1] * k; col[2] = c[2] * k;
        b.quad(x, 0, z + 1, x + 1, 0, z + 1, x + 1, 0, z, x, 0, z, col.slice());
      }
    }
    b.ao = ao;
  };
  // big flat apron outside the arena (fog hides its edge)
  M.apron = function (col, col2) {
    var h = this.half, R = 110, b = this.b, ao = b.ao;
    b.ao = false;
    var c = col, e = col2 || col;
    b.quad(-R, -0.02, -h, R, -0.02, -h, R, -0.02, -R, -R, -0.02, -R, e);
    b.quad(-R, -0.02, R, R, -0.02, R, R, -0.02, h, -R, -0.02, h, e);
    b.quad(-R, -0.02, h, -h, -0.02, h, -h, -0.02, -h, -R, -0.02, -h, c);
    b.quad(h, -0.02, h, R, -0.02, h, R, -0.02, -h, h, -0.02, -h, c);
    b.ao = ao;
  };
  // perimeter: visible wall of height vh + invisible tall part that only stops movement
  M.perimeter = function (vh, drawFn) {
    var h = this.half, t = 1;
    var sides = [[-h - t, -h - t, h + t, -h], [-h - t, h, h + t, h + t], [-h - t, -h, -h, h], [h, -h, h + t, h]];
    for (var i = 0; i < sides.length; i++) {
      var s = sides[i];
      this.W.addBox(s[0], 0, s[1], s[2], vh, s[3], { noDecal: !!this.noWallDecal });
      this.W.addBox(s[0], vh, s[1], s[2], 14, s[3], { noShot: true, noDecal: true });
    }
    if (drawFn) drawFn.call(this);
  };

  /* ------------------------------------------------------------- props */
  function tree(m, x, z, s, leaf, leaf2) {
    s = s || 1;
    m.cylS(x, z, 0.32 * s, 0, 3.0 * s, 0x9a6038, { seg: 7, cf: 0.9 });
    m.b.sphere(x, 3.4 * s, z, 1.55 * s, leaf, { flat: true, seg: 7, rings: 5, sy: 0.85 });
    m.b.sphere(x + 0.7 * s, 4.3 * s, z - 0.3 * s, 1.05 * s, leaf2 || leaf, { flat: true, seg: 6, rings: 4 });
    m.b.sphere(x - 0.6 * s, 4.1 * s, z + 0.5 * s, 0.95 * s, leaf2 || leaf, { flat: true, seg: 6, rings: 4 });
    m.coll(x - 1.25 * s, 2.3 * s, z - 1.25 * s, x + 1.25 * s, 4.9 * s, z + 1.25 * s);
  }
  function bench(m, x, z, rotZ, col) {
    // seat you can step onto, legs visual
    if (rotZ) {
      m.solid(x - 0.3, 0, z - 1.1, x + 0.3, 0.48, z + 1.1, col, { top: 0xffe7b8 });
      m.solid(x + 0.3, 0.48, z - 1.1, x + 0.42, 1.05, z + 1.1, col);
    } else {
      m.solid(x - 1.1, 0, z - 0.3, x + 1.1, 0.48, z + 0.3, col, { top: 0xffe7b8 });
      m.solid(x - 1.1, 0.48, z + 0.3, x + 1.1, 1.05, z + 0.42, col);
    }
  }
  function pine(m, x, z, s, snow) {
    s = s || 1;
    m.cylS(x, z, 0.28 * s, 0, 1.2 * s, 0x8a5a33, { seg: 6 });
    var g = 0x2e9d5b, g2 = 0x248a4d;
    m.b.cyl(x, 0.9 * s, z, 1.7 * s, 2.0 * s, g2, { r2: 0.2, seg: 8, top: snow ? 0xffffff : g2 });
    m.b.cyl(x, 2.2 * s, z, 1.35 * s, 1.8 * s, g, { r2: 0.1, seg: 8 });
    m.b.cyl(x, 3.3 * s, z, 0.95 * s, 1.6 * s, snow ? 0xf4fbff : g2, { r2: 0, seg: 8 });
    m.coll(x - 1.1 * s, 0.9 * s, z - 1.1 * s, x + 1.1 * s, 3.4 * s, z + 1.1 * s);
  }
  function crate(m, x, z, s, col, y) {
    y = y || 0;
    m.solid(x - s / 2, y, z - s / 2, x + s / 2, y + s, z + s / 2, col, { top: 0xfff0d0 });
    m.b.box(x - s / 2 - 0.03, y + s * 0.42, z - s / 2 - 0.03, x + s / 2 + 0.03, y + s * 0.58, z + s / 2 + 0.03, 0xffffff);
  }

  /* ================================================================= MAP 1 */
  // ساحة المدرسة — school playground: central climbing castle, two towers joined by rope bridges
  function playground() {
    var m = new MapKit(20), b = m.b;
    var RED = 0xff5a5f, YEL = 0xffc93c, BLU = 0x3d8bff, GRN = 0x3ddc84, PUR = 0x9b6bff, ORA = 0xff9f1c, WHT = 0xf6f6f6;
    var H = 2.6;
    // --- centre castle
    m.deck(-3.5, -3.5, 3.5, 3.5, H, BLU, { top: 0xffe07a, trim: YEL, post: RED, ps: 0.45 });
    // panels with openings N/S (bridges, x in [-1,1]), E (ramp z in [-1.2,1.2]), W (slide z in [-0.9,0.9])
    var P = 0.95, pt = 0.16;
    m.solid(-3.5, H, -3.5, -1.1, H + P, -3.5 + pt, RED, { top: YEL });
    m.solid(1.1, H, -3.5, 3.5, H + P, -3.5 + pt, RED, { top: YEL });
    m.solid(-3.5, H, 3.5 - pt, -1.1, H + P, 3.5, GRN, { top: YEL });
    m.solid(1.1, H, 3.5 - pt, 3.5, H + P, 3.5, GRN, { top: YEL });
    m.solid(3.5 - pt, H, -3.5 + pt, 3.5, H + P, -1.2, PUR, { top: YEL });
    m.solid(3.5 - pt, H, 1.2, 3.5, H + P, 3.5 - pt, PUR, { top: YEL });
    m.solid(-3.5, H, -3.5 + pt, -3.5 + pt, H + P, -0.9, ORA, { top: YEL });
    m.solid(-3.5, H, 0.9, -3.5 + pt, H + P, 3.5 - pt, ORA, { top: YEL });
    // round windows on the panels (decor)
    b.push().translate(-2.3, H + 0.48, -3.52).rotX(Math.PI / 2); b.disc(0, 0, 0, 0.28, 0xffffff, 12); b.pop();
    b.push().translate(2.3, H + 0.48, 3.52).rotX(-Math.PI / 2); b.disc(0, 0, 0, 0.28, 0xffffff, 12); b.pop();
    // roof: 4 posts + pointy cone
    var rp = [[-3.3, -3.3], [3.05, -3.3], [-3.3, 3.05], [3.05, 3.05]];
    for (var i = 0; i < rp.length; i++) m.solid(rp[i][0], H + P, rp[i][1], rp[i][0] + 0.25, 5.3, rp[i][1] + 0.25, WHT);
    b.cyl(0, 5.3, 0, 5.2, 2.2, RED, { r2: 0, seg: 4, top: RED });
    b.push().rotY(Math.PI / 4); b.cyl(0, 5.25, 0, 5.3, 0.12, YEL, { seg: 4 }); b.pop();
    m.coll(-3.6, 5.3, -3.6, 3.6, 6.2, 3.6);
    b.cyl(0, 7.5, 0, 0.05, 1.0, WHT, { seg: 4 }); b.box(0, 8.1, -0.02, 0.8, 8.5, 0.02, YEL);
    // ramp east (low end at x = 9)
    m.ramp(3.5, -1.2, 9, 1.2, 0, 0, H, 1, 0x7a5cff, { top: 0xb9a6ff });
    b.box(3.5, 0, -1.35, 9, 0.35, -1.2, WHT); b.box(3.5, 0, 1.2, 9, 0.35, 1.35, WHT);
    // slide west (low end at x = -9.5) with raised lips
    m.ramp(-9.5, -0.9, -3.5, 0.9, 0, 0, H, 0, YEL, { top: 0xffe07a });
    b.wedge(-9.5, -1.1, -3.5, -0.9, 0, 0.25, H + 0.25, 0, ORA);
    b.wedge(-9.5, 0.9, -3.5, 1.1, 0, 0.25, H + 0.25, 0, ORA);
    // bridges north and south
    function bridge(z0, z1) {
      m.solid(-1, H - 0.18, z0, 1, H, z1, 0xc98a52, { top: 0xe0a86a, bottom: true });
      for (var z = z0 + 0.3; z < z1; z += 0.6) b.box(-1.02, H - 0.02, z, 1.02, H + 0.015, z + 0.08, 0x9a6038);
      m.rail(-1.05, z0, -1.05, z1, H, 0.85, 0xfff1d6, { bar: RED });
      m.rail(1.05, z0, 1.05, z1, H, 0.85, 0xfff1d6, { bar: RED });
      m.shade(-1, z0, 1, z1, 0.8);
    }
    bridge(-12, -3.5); bridge(3.5, 12);
    // towers N and S
    function tower(z0, z1, sgn) {
      m.deck(-3, z0, 3, z1, H, GRN, { top: 0xbff5a8, trim: WHT, post: PUR, ps: 0.45 });
      // inner edge faces the centre (bridge gap x in [-1.1,1.1]), outer edge is closed
      var iz0 = sgn < 0 ? z1 - pt : z0, iz1 = iz0 + pt;
      var oz0 = sgn < 0 ? z0 : z1 - pt, oz1 = oz0 + pt;
      m.solid(-3, H, iz0, -1.1, H + P, iz1, YEL, { top: RED });
      m.solid(1.1, H, iz0, 3, H + P, iz1, YEL, { top: RED });
      m.solid(-3, H, oz0, 3, H + P, oz1, BLU, { top: RED });
      // the north tower's ramp leaves to the west, the south tower's to the east
      var zA = z0 + pt, zB = z1 - pt;
      var fx0 = sgn < 0 ? 3 - pt : -3, gx0 = sgn < 0 ? -3 : 3 - pt;
      var gz0 = sgn < 0 ? -15.8 : 13.6, gz1 = sgn < 0 ? -13.6 : 15.8;
      m.solid(fx0, H, zA, fx0 + pt, H + P, zB, ORA, { top: RED });
      m.solid(gx0, H, zA, gx0 + pt, H + P, gz0, ORA, { top: RED });
      m.solid(gx0, H, gz1, gx0 + pt, H + P, zB, ORA, { top: RED });
      // roof on four posts
      b.cyl(0, 4.9, (z0 + z1) / 2, 4.2, 1.6, BLU, { r2: 0, seg: 4 });
      for (var k = 0; k < 4; k++) m.solid((k & 1 ? 2.65 : -2.9), H + P, (k & 2 ? z1 - 0.35 : z0 + 0.1), (k & 1 ? 2.9 : -2.65), 4.9, (k & 2 ? z1 - 0.1 : z0 + 0.35), WHT);
      m.coll(-3, 4.9, z0, 3, 5.7, z1);
    }
    tower(-17.5, -12, -1); tower(12, 17.5, 1);
    // tower ramps: north goes west, south goes east
    m.ramp(-9, -15.8, -3, -13.6, 0, 0, H, 0, 0x7a5cff, { top: 0xb9a6ff });
    m.ramp(3, 13.6, 9, 15.8, 0, 0, H, 1, 0x7a5cff, { top: 0xb9a6ff });
    // --- sandboxes (NW and SE), step-over borders
    function sandbox(x0, z0, x1, z1, flip) {
      var bt = 0.3, bh = 0.38;
      m.solid(x0, 0, z0, x1, bh, z0 + bt, RED, { top: 0xffd0d0 }); m.solid(x0, 0, z1 - bt, x1, bh, z1, RED, { top: 0xffd0d0 });
      m.solid(x0, 0, z0 + bt, x0 + bt, bh, z1 - bt, BLU, { top: 0xcfe0ff }); m.solid(x1 - bt, 0, z0 + bt, x1, bh, z1 - bt, BLU, { top: 0xcfe0ff });
      m.solid(x0 + bt, 0, z0 + bt, x1 - bt, 0.16, z1 - bt, 0xf3d58a);
      var cx = (x0 + x1) / 2 + (flip ? 1.2 : -1.2), cz = (z0 + z1) / 2;
      // sand castle (cover) with towers
      m.solid(cx - 1.1, 0.16, cz - 1.1, cx + 1.1, 1.25, cz + 1.1, 0xe9c46a, { top: 0xf3d58a });
      b.cyl(cx - 1.1, 0.16, cz - 1.1, 0.42, 1.6, 0xe9c46a, { seg: 8 }); b.cyl(cx + 1.1, 0.16, cz + 1.1, 0.42, 1.6, 0xe9c46a, { seg: 8 });
      b.cyl(cx - 1.1, 1.76, cz - 1.1, 0.46, 0.5, 0xffb347, { r2: 0, seg: 8 }); b.cyl(cx + 1.1, 1.76, cz + 1.1, 0.46, 0.5, 0xffb347, { r2: 0, seg: 8 });
      // bucket + spade
      var bx = cx + (flip ? -2.6 : 2.6), bz = cz + 1.2;
      m.cylS(bx, bz, 0.42, 0.16, 0.7, 0x3ddc84, { r2: 0.52, seg: 10 });
    }
    sandbox(-17.5, -9, -10.5, -2.5, false); sandbox(10.5, 2.5, 17.5, 9, true);
    // --- swings (SW and NE): A-frames and seats, low picnic table cover
    function swings(x0, z) {
      m.solid(x0, 0, z - 0.12, x0 + 0.25, 3.2, z + 0.12, PUR); m.solid(x0 + 6, 0, z - 0.12, x0 + 6.25, 3.2, z + 0.12, PUR);
      b.box(x0, 3.2, z - 0.12, x0 + 6.25, 3.4, z + 0.12, YEL);
      m.coll(x0, 3.2, z - 0.12, x0 + 6.25, 3.4, z + 0.12);
      for (var s = 0; s < 2; s++) {
        var sx = x0 + 1.6 + s * 2.8;
        b.box(sx - 0.02, 0.6, z - 0.02, sx + 0.02, 3.2, z + 0.02, 0x555577); b.box(sx + 0.9, 0.6, z - 0.02, sx + 0.94, 3.2, z + 0.02, 0x555577);
        b.box(sx - 0.1, 0.55, z - 0.25, sx + 1.04, 0.65, z + 0.25, s ? RED : BLU);
      }
    }
    swings(-16.5, 6); swings(10.25, -6);
    // picnic tables (hop-on cover)
    function table(x, z) { m.solid(x - 1.2, 0, z - 0.6, x + 1.2, 0.85, z + 0.6, 0xc98a52, { top: 0xe0a86a }); bench(m, x, z - 1.15, false, 0x7a5cff); }
    table(-13, 11); table(13, -11);
    // big crawl tube (walk-through cover) E and W
    function tube(x, z) {
      b.push().translate(x, 1.1, z).rotZ(Math.PI / 2);
      b.cyl(0, -2.2, 0, 1.2, 4.4, ORA, { seg: 12, cap: false, inner: 0xd9822b });
      b.pop();
      m.coll(x - 2.2, 0, z - 1.2, x + 2.2, 2.3, z - 0.9);
      m.coll(x - 2.2, 0, z + 0.9, x + 2.2, 2.3, z + 1.2);
      m.coll(x - 2.2, 1.95, z - 1.2, x + 2.2, 2.35, z + 1.2);
      b.box(x - 2.2, 0, z - 0.9, x + 2.2, 0.03, z + 0.9, 0xd9822b);
    }
    tube(-12.5, 0); tube(12.5, 0);
    // low colourful walls (cover you can hop onto)
    function lowWall(x0, z0, x1, z1, col) { m.solid(x0, 0, z0, x1, 1.1, z1, col, { top: 0xffffff }); }
    lowWall(-8.5, 5.5, -6.5, 6.1, GRN); lowWall(6.5, -6.1, 8.5, -5.5, GRN);
    lowWall(-6, -8.8, -5.4, -6.4, YEL); lowWall(5.4, 6.4, 6, 8.8, YEL);
    lowWall(-17, 14, -15, 14.6, PUR); lowWall(15, -14.6, 17, -14, PUR);
    crate(m, -7.5, -11.5, 1.2, BLU); crate(m, 7.5, 11.5, 1.2, BLU);
    crate(m, 16.5, 16.5, 1.3, RED); crate(m, -16.5, -16.5, 1.3, RED);
    crate(m, 6.2, -16.5, 1.1, ORA); crate(m, -6.2, 16.5, 1.1, ORA);
    // spring riders (small hop-on)
    m.cylS(-6, 12, 0.35, 0, 0.55, 0x777799, { seg: 6 }); b.sphere(-6, 0.95, 12, 0.45, RED, { sy: 0.8, seg: 8, rings: 6 });
    m.cylS(6, -12, 0.35, 0, 0.55, 0x777799, { seg: 6 }); b.sphere(6, 0.95, -12, 0.45, YEL, { sy: 0.8, seg: 8, rings: 6 });
    // trees
    tree(m, -8, 10.5, 1, 0x4cc26a, 0x62d77e); tree(m, 8, -10.5, 1, 0x4cc26a, 0x62d77e);
    tree(m, -17.2, -0.2, 0.85, 0x44b863, 0x5bcf76); tree(m, 17.2, 0.2, 0.85, 0x44b863, 0x5bcf76);
    bench(m, -10, 16.8, false, BLU); bench(m, 10, -16.8, false, BLU);
    // --- perimeter: picket fence + school outside
    m.perimeter(1.25, function () {
      var h = this.half;
      for (var s = 0; s < 4; s++) {
        for (var t = -h; t < h; t += 0.8) {
          var c = [0xff5a5f, 0xffc93c, 0x3d8bff, 0x3ddc84][Math.floor((t + h) / 0.8) % 4];
          var x0 = s < 2 ? t + 0.08 : (s === 2 ? -h - 0.2 : h + 0.05), z0 = s < 2 ? (s === 0 ? -h - 0.2 : h + 0.05) : t + 0.08;
          var x1 = s < 2 ? t + 0.72 : x0 + 0.15, z1 = s < 2 ? z0 + 0.15 : t + 0.72;
          b.box(x0, 0, z0, x1, 1.1, z1, c);
          if (s < 2) b.box(x0, 1.1, z0, x1, 1.25, z1, 0xffffff); else b.box(x0, 1.1, z0, x1, 1.25, z1, 0xffffff);
        }
      }
      b.box(-h - 0.25, 0.75, -h - 0.25, h + 0.25, 0.9, -h - 0.15, 0xffffff); b.box(-h - 0.25, 0.75, h + 0.15, h + 0.25, 0.9, h + 0.25, 0xffffff);
      b.box(-h - 0.25, 0.75, -h, -h - 0.15, 0.9, h, 0xffffff); b.box(h + 0.15, 0.75, -h, h + 0.25, 0.9, h, 0xffffff);
      // school building to the north
      b.box(-26, 0, -38, 26, 9, -27, 0xffd9a0, { top: 0xff8a5c });
      b.box(-26, 9, -38, 26, 10.2, -26.5, 0xff7a4a);
      for (var w = -22; w <= 22; w += 5) { b.box(w - 1.4, 2, -27.02, w + 1.4, 4, -26.96, 0x8fd3ff); b.box(w - 1.4, 5.5, -27.02, w + 1.4, 7.5, -26.96, 0x8fd3ff); }
      b.box(-2, 0, -27.05, 2, 3.4, -26.9, 0x7a4a2a);
      b.cyl(0, 10.2, -32, 0.12, 4, 0xdddddd, { seg: 5 });
      // hills and trees around
      for (var k = 0; k < 16; k++) {
        var a = k / 16 * Math.PI * 2 + 0.2, rr = 34 + (k % 3) * 6;
        var hx = Math.cos(a) * rr, hz = Math.sin(a) * rr;
        if (hz < -24 && Math.abs(hx) < 30) continue;
        b.sphere(hx, -2, hz, 7 + (k % 4) * 2, k % 2 ? 0x6cc24a : 0x5bb33f, { flat: true, seg: 8, rings: 5, sy: 0.55, half: true });
        tree({ b: b, cylS: function (x, z, r, y0, hh, col, o) { b.cyl(x, y0, z, r, hh, col, o); }, coll: function () {} }, hx * 0.8, hz * 0.8, 1.3 + (k % 3) * 0.2, 0x3fae5a, 0x55c46e);
      }
    });
    // --- ground
    m.apron(0x66b84a, 0x66b84a);
    m.ground(function (x, z) {
      var ax = Math.abs(x), az = Math.abs(z);
      if (ax < 10 && az < 10.5) return ((Math.floor(x) + Math.floor(z)) & 1) ? 0x49a7ff : 0x5bb0ff;
      if (ax < 11 && az < 11.5) return 0xf6f6f6;
      if ((ax < 2.2 && az > 11.5) || (az < 1.6 && ax > 11)) return 0xf3d58a;
      var n = (Math.sin(x * 1.3) + Math.cos(z * 1.7)) > 0.4;
      return ((Math.floor(x / 2) + Math.floor(z / 2)) & 1) ? (n ? 0x80d160 : 0x7ccd5c) : (n ? 0x75c655 : 0x71c252);
    });
    // spawns (team 1 = blue north, team 2 = orange south)
    [[-17, -8, 1], [17, -8, 1], [-8, -18, 1], [8, -18, 1], [-12.5, -12.5, 1], [12.5, -14.5, 1],
     [17, 8, 2], [-17, 8, 2], [8, 18, 2], [-8, 18, 2], [12.5, 12.5, 2], [-12.5, 14.5, 2],
     [0, -8, 0], [0, 8, 0], [-5.5, 2.5, 0], [5.5, -2.5, 0],
     // sheltered spots (behind the fences / walls) so free-for-all always has somewhere quiet to come back
     [-5.5, -16.5, 1], [5.5, 16.5, 2], [-18.5, -5.5, 1], [18.5, 5.5, 2], [-9.5, -11.5, 1], [9.5, 11.5, 2], [-13.5, 2.5, 0, 1], [13.5, -2.5, 0, 1]].forEach(function (s) { m.spawn(s[0], s[1], s[2], 0, s[3]); });
    m.pick('hp', -15.5, 0); m.pick('hp', 15.5, 0);
    m.pick('ammo', -6, -12.5); m.pick('ammo', 6, 12.5);
    m.pick('ammo', 0, -15, H); m.pick('ammo', 0, 15, H);
    m.pick('power', 0, 0, H);
    [[0, 0, H], [0, -15, H], [0, 15, H], [0, -8, H], [0, 8, H], [-14, -6], [14, 6], [-13, 6], [13, -6], [-5, -11], [5, 11], [-16, 16], [16, -16],
     [-8, 3], [8, -3], [-12.5, 0], [12.5, 0], [0, -8], [0, 8], [7, -15], [-7, 15], [-16.5, -16], [16.5, 16]].forEach(function (p) { m.hotspot(p[0], p[1], p[2]); });
    return m;
  }

  /* ================================================================= MAP 2 */
  // مصنع الحلوى — candy factory: H-shaped catwalks, conveyor belts, giant sweets
  function factory() {
    var m = new MapKit(20), b = m.b;
    var H = 2.8, MET = 0x8fa3c9, EDGE = 0xffd23f, PINK = 0xff7eb6, MINT = 0x5de0c0, CHOC = 0x7b4a2e, LEM = 0xffe066, GRAPE = 0xa77bff;
    // side catwalks (x in [-17.5,-14.5] and [14.5,17.5], z in [-12,12])
    function catwalk(x0, x1) {
      m.deck(x0, -12, x1, 12, H, MET, { top: 0xb7c6e4, trim: EDGE, post: 0x6d7fa8, ps: 0.4,
        postAt: [[x0 + 0.1, -11.9], [x1 - 0.5, -11.9], [x0 + 0.1, 11.5], [x1 - 0.5, 11.5], [x0 + 0.1, -5.2], [x1 - 0.5, 4.8]] });
      var inner = x0 < 0 ? x1 : x0;
      m.rail(inner, -12, inner, -1.2, H, 0.95, EDGE, { bar: PINK });
      m.rail(inner, 1.2, inner, 12, H, 0.95, EDGE, { bar: PINK });
      // stripes on the floor
      for (var z = -11.5; z < 12; z += 2) b.box(x0 + 0.1, H + 0.005, z, x1 - 0.1, H + 0.02, z + 0.25, 0x9fb2d6);
    }
    catwalk(-17.5, -14.5); catwalk(14.5, 17.5);
    // corner ramps down along the side walls
    m.ramp(-17.5, -18, -14.5, -12, 0, 0, H, 2, MET, { top: 0xb7c6e4 });
    m.ramp(-17.5, 12, -14.5, 18, 0, 0, H, 3, MET, { top: 0xb7c6e4 });
    m.ramp(14.5, -18, 17.5, -12, 0, 0, H, 2, MET, { top: 0xb7c6e4 });
    m.ramp(14.5, 12, 17.5, 18, 0, 0, H, 3, MET, { top: 0xb7c6e4 });
    // central E-W bridge with a middle platform
    m.solid(-14.5, H - 0.22, -1.2, 14.5, H, 1.2, MET, { top: 0xb7c6e4, bottom: true });
    b.box(-14.5, H - 0.3, -1.25, 14.5, H - 0.2, 1.25, EDGE, { bottom: true });
    m.shade(-14.5, -1.2, 14.5, 1.2, 0.78);
    m.deck(-2.6, -2.6, 2.6, 2.6, H, MET, { top: 0xb7c6e4, trim: EDGE, post: 0x6d7fa8, ps: 0.4 });
    m.rail(-14.5, -1.25, -2.6, -1.25, H, 0.9, EDGE, { bar: MINT }); m.rail(-14.5, 1.25, -2.6, 1.25, H, 0.9, EDGE, { bar: MINT });
    m.rail(2.6, -1.25, 14.5, -1.25, H, 0.9, EDGE, { bar: MINT }); m.rail(2.6, 1.25, 14.5, 1.25, H, 0.9, EDGE, { bar: MINT });
    // middle platform: candy panels as cover with a gap on each side
    m.solid(-2.6, H, -2.6, -0.8, H + 1.0, -2.45, PINK, { top: 0xffffff }); m.solid(0.8, H, -2.6, 2.6, H + 1.0, -2.45, PINK, { top: 0xffffff });
    m.solid(-2.6, H, 2.45, -0.8, H + 1.0, 2.6, PINK, { top: 0xffffff }); m.solid(0.8, H, 2.45, 2.6, H + 1.0, 2.6, PINK, { top: 0xffffff });
    // ramps from the middle platform down to north and south
    m.ramp(-1.1, -8.2, 1.1, -2.6, 0, 0, H, 2, GRAPE, { top: 0xd2b8ff });
    m.ramp(-1.1, 2.6, 1.1, 8.2, 0, 0, H, 3, GRAPE, { top: 0xd2b8ff });
    // posts under the bridge
    for (var px = -10; px <= 10; px += 5) if (px !== 0) m.solid(px - 0.2, 0, -0.2, px + 0.2, H - 0.22, 0.2, 0x6d7fa8);
    // --- conveyor belts along z (split by the bridge): west and east
    function belt(x, z0, z1, dir) {
      m.solid(x - 0.8, 0, z0, x + 0.8, 0.85, z1, 0x4a4a6a, { top: 0x4a4a6a });
      m.coll(x - 0.7, 0.85, z0, x + 0.7, 1.0, z1, { bz: dir * 1.4 }).beltTop = true;
      m.belts.push({ x0: x - 0.7, z0: z0, x1: x + 0.7, z1: z1, y: 1.0, dir: dir });
      b.box(x - 0.8, 0.85, z0, x - 0.7, 1.08, z1, EDGE); b.box(x + 0.7, 0.85, z0, x + 0.8, 1.08, z1, EDGE);
      for (var z = z0 + 0.4; z < z1; z += 1.5) b.cyl(x - 0.85, 0.25, z, 0.2, 0.05, 0x333344, { seg: 6 });
      // candies riding on it (visual)
      for (var c = z0 + 1; c < z1 - 0.5; c += 2.3) {
        var col = [PINK, MINT, LEM, GRAPE][Math.floor(c * 7) & 3];
        b.sphere(x, 1.25, c, 0.26, col, { seg: 8, rings: 5 });
        b.cyl(x, 1.12, c - 0.42, 0.14, 0.26, col, { r2: 0.02, seg: 6 });
      }
    }
    belt(-7, -13, -3, 1); belt(-7, 3, 13, -1); belt(7, -13, -3, -1); belt(7, 3, 13, 1);
    // machines at the ends of belts (tall cover)
    function machine(x, z, col) {
      m.solid(x - 1.4, 0, z - 1.1, x + 1.4, 2.4, z + 1.1, col, { top: 0xffffff });
      b.box(x - 1.5, 2.4, z - 1.2, x + 1.5, 2.6, z + 1.2, 0xffffff);
      b.cyl(x, 2.6, z, 0.5, 0.7, 0xdddddd, { seg: 8 }); b.cyl(x, 3.3, z, 0.7, 0.3, PINK, { seg: 8 });
      m.coll(x - 0.5, 2.4, z - 0.5, x + 0.5, 3.6, z + 0.5);
      b.push().translate(x, 1.5, z + (z > 0 ? -1.11 : 1.11)).rotX(z > 0 ? -Math.PI / 2 : Math.PI / 2); b.disc(0, 0, 0, 0.45, 0xffffff, 12); b.disc(0, 0.01, 0, 0.3, col === PINK ? MINT : PINK, 12); b.pop();
    }
    machine(-7, -14.8, PINK); machine(7, -14.8, MINT); machine(-7, 14.8, MINT); machine(7, 14.8, PINK);
    // --- giant sweets
    function lolly(x, z, col) {
      m.cylS(x, z, 0.14, 0, 2.3, 0xffffff, { seg: 6, cf: 1.2 });
      b.push().translate(x, 3.2, z).rotX(Math.PI / 2);
      b.cyl(0, -0.25, 0, 1.0, 0.5, col, { seg: 14, bottom: true, top: 0xffffff });
      b.pop();
      b.push().translate(x, 3.2, z + 0.26).rotX(Math.PI / 2); b.ring(0, 0, 0, 0.35, 0.6, 0xffffff, 14); b.pop();
      m.coll(x - 1, 2.2, z - 0.25, x + 1, 4.2, z + 0.25);
    }
    lolly(-11, -7.5, PINK); lolly(11, 7.5, MINT); lolly(-11, 7.5, LEM); lolly(11, -7.5, GRAPE);
    function gumdrop(x, z, col, s) {
      s = s || 1;
      b.cyl(x, 0, z, 0.95 * s, 0.6 * s, col, { r2: 0.8 * s, seg: 10 });
      b.sphere(x, 0.6 * s, z, 0.8 * s, col, { seg: 10, rings: 6, half: true, cap: false, sy: 0.9 });
      m.coll(x - 0.72 * s, 0, z - 0.72 * s, x + 0.72 * s, 1.3 * s, z + 0.72 * s);
    }
    gumdrop(-3.8, -11.5, PINK); gumdrop(3.8, 11.5, MINT); gumdrop(-11.5, 1.7, LEM, 0.9); gumdrop(11.5, -1.7, GRAPE, 0.9);   // z 1.7: leaves a body-wide gap to the bridge posts
    gumdrop(-4.5, 5.5, GRAPE, 0.85); gumdrop(4.5, -5.5, LEM, 0.85);
    function choco(x0, z0, x1, z1) {
      m.solid(x0, 0, z0, x1, 1.15, z1, CHOC, { top: 0x8e5a3a });
      var ax = (x1 - x0) > (z1 - z0);
      for (var t = 0.5; t < (ax ? x1 - x0 : z1 - z0); t += 0.9) {
        if (ax) b.box(x0 + t, 1.15, z0 + 0.05, x0 + t + 0.08, 1.2, z1 - 0.05, 0x5e3620);
        else b.box(x0 + 0.05, 1.15, z0 + t, x1 - 0.05, 1.2, z0 + t + 0.08, 0x5e3620);
      }
    }
    choco(-12.5, -15.5, -9.5, -14.8); choco(9.5, 14.8, 12.5, 15.5);
    choco(-4.2, 13.8, -1.8, 14.5); choco(1.8, -14.5, 4.2, -13.8);
    choco(-12.2, -3.8, -11.5, -1.2); choco(11.5, 1.2, 12.2, 3.8);
    // big cupcakes (tall cover)
    function cupcake(x, z, col) {
      m.cylS(x, z, 1.25, 0, 1.3, 0xffb3d1, { r2: 1.5, seg: 12, top: 0xfff1d6 });
      b.sphere(x, 1.3, z, 1.5, col, { seg: 12, rings: 7, half: true, cap: false, sy: 0.7, flat: true });
      b.sphere(x, 2.45, z, 0.32, 0xff3355, { seg: 8, rings: 6 });
      m.coll(x - 1.2, 1.3, z - 1.2, x + 1.2, 2.2, z + 1.2);
    }
    cupcake(-11, -12, 0xfff1d6); cupcake(11, 12, 0xffc8e6);
    // donut rings lying on the floor (low cover you can hop on)
    function donut(x, z, col) {
      b.cyl(x, 0, z, 1.1, 0.55, 0xe8a25c, { seg: 12, top: col });
      m.coll(x - 0.95, 0, z - 0.95, x + 0.95, 0.55, z + 0.95);
    }
    donut(-3.5, -16.8, PINK); donut(3.5, 16.8, MINT);
    crate(m, -17, -9, 1.2, PINK); crate(m, 17, 9, 1.2, MINT); crate(m, -12.8, 16.5, 1.1, LEM); crate(m, 12.8, -16.5, 1.1, LEM);
    // --- perimeter: tall pastel factory walls
    m.perimeter(7, function () {
      var h = this.half;
      var cols = [0xffb3d1, 0xfff1d6];
      for (var s = 0; s < 4; s++) {
        for (var t = -h - 1; t < h + 1; t += 2) {
          var c = cols[((t + h + 1) / 2) & 1];
          if (s === 0) b.box(t, 0, -h - 1, t + 2, 7, -h, c);
          else if (s === 1) b.box(t, 0, h, t + 2, 7, h + 1, c);
          else if (s === 2) b.box(-h - 1, 0, t, -h, 7, t + 2, c);
          else b.box(h, 0, t, h + 1, 7, t + 2, c);
        }
      }
      b.box(-h - 1.2, 7, -h - 1.2, h + 1.2, 7.6, -h - 0.8, PINK); b.box(-h - 1.2, 7, h + 0.8, h + 1.2, 7.6, h + 1.2, PINK);
      b.box(-h - 1.2, 7, -h - 1.2, -h - 0.8, 7.6, h + 1.2, PINK); b.box(h + 0.8, 7, -h - 1.2, h + 1.2, 7.6, h + 1.2, PINK);
      // wall decor: big round windows and pipes
      for (var w = -14; w <= 14; w += 7) {
        b.push().translate(w, 4.8, -h + 0.02).rotX(Math.PI / 2); b.disc(0, 0, 0, 1.1, 0xffffff, 14); b.disc(0, 0.01, 0, 0.9, 0x8fd3ff, 14); b.pop();
        b.push().translate(-w, 4.8, h - 0.02).rotX(-Math.PI / 2); b.disc(0, 0, 0, 1.1, 0xffffff, 14); b.disc(0, 0.01, 0, 0.9, 0x8fd3ff, 14); b.pop();
      }
      b.push().translate(-h + 0.3, 5.8, 0).rotX(Math.PI / 2); b.cyl(0, -h, 0, 0.25, h * 2, 0xc0c8e0, { seg: 8 }); b.pop();
      b.push().translate(h - 0.3, 5.8, 0).rotX(Math.PI / 2); b.cyl(0, -h, 0, 0.25, h * 2, 0xc0c8e0, { seg: 8 }); b.pop();
      // chimneys and candy towers outside
      for (var k = 0; k < 10; k++) {
        var a = k / 10 * Math.PI * 2 + 0.3, rr = 30 + (k % 3) * 5;
        var cx = Math.cos(a) * rr, cz = Math.sin(a) * rr;
        b.cyl(cx, 0, cz, 2.2, 10 + (k % 4) * 3, [0xffb3d1, 0xfff1d6, 0xc9b3ff, 0xb3f0e0][k % 4], { seg: 8 });
        b.cyl(cx, 10 + (k % 4) * 3, cz, 2.6, 1.2, [PINK, MINT, GRAPE, LEM][k % 4], { seg: 8 });
        if (k % 2) b.sphere(cx, 12 + (k % 4) * 3, cz, 2.4, [PINK, MINT, GRAPE, LEM][(k + 1) % 4], { seg: 8, rings: 6, flat: true });
      }
    });
    m.apron(0xf7c6dc, 0xf7c6dc);
    m.ground(function (x, z) {
      var ax = Math.abs(x);
      if (ax > 13.8 && ax < 18.2) return ((Math.floor(z)) & 1) ? 0xd8c8f0 : 0xe6daf8;
      return ((Math.floor(x) + Math.floor(z)) & 1) ? 0xffd0e4 : 0xfff3f8;
    });
    [[-10, -17.5, 1], [10, -17.5, 1], [-1.5, -18.5, 1], [5.5, -17.5, 1], [-12.8, -10, 1], [12.8, -10, 1],
     [10, 17.5, 2], [-10, 17.5, 2], [1.5, 18.5, 2], [-5.5, 17.5, 2], [12.8, 10, 2], [-12.8, 10, 2],
     [-9.5, 2.2, 0], [9.5, -2.2, 0], [-4, 0, 0], [4, 0, 0],
     [-18, -14.5, 1], [18, -14.5, 1], [-18, 14.5, 2], [18, 14.5, 2], [-13.5, -14.5, 1], [13.5, 14.5, 2], [-13.5, -0.5, 0, 1], [13.5, 0.5, 0, 1]].forEach(function (s) { m.spawn(s[0], s[1], s[2], 0, s[3]); });
    m.pick('hp', -16, 0, H); m.pick('hp', 16, 0, H);
    m.pick('ammo', -9.5, -9.5); m.pick('ammo', 9.5, 9.5);
    m.pick('ammo', -4, 9); m.pick('ammo', 4, -9);
    m.pick('power', 0, 0, H);
    [[0, 0, H], [-16, -8, H], [16, 8, H], [-16, 8, H], [16, -8, H], [-9, 0, H], [9, 0, H], [-4, -9], [4, 9], [-10, -10], [10, 10], [-10, 10], [10, -10],
     [0, -12], [0, 12], [-13, -3], [13, 3], [-4.5, 3], [4.5, -3], [-12.5, -17.5], [12.5, 17.5], [-5, -16.5], [5, 16.5]].forEach(function (p) { m.hotspot(p[0], p[1], p[2]); });
    return m;
  }

  /* ================================================================= MAP 3 */
  // قلعة الثلج — two snow forts with walkable ramparts and a hill in the middle
  function snowfort() {
    var m = new MapKit(20), b = m.b;
    var SNOW = 0xf4f9ff, SH = 0xcadcf5, ICE = 0x9fe3ff, ICE2 = 0x7fd0f5, WOOD = 0xa0663c, BLU = 0x3d8bff, ORA = 0xff8a1f;
    var WH = 2.4;
    function fort(sgn, flag) {
      // front wall at z = sgn*10 .. sgn*11.6 with a gate x in [-2.5,2.5]
      var zf0 = Math.min(sgn * 10, sgn * 11.6), zf1 = Math.max(sgn * 10, sgn * 11.6);
      m.solid(-9, 0, zf0, -2.5, WH, zf1, SNOW, { side: SH });
      m.solid(2.5, 0, zf0, 9, WH, zf1, SNOW, { side: SH });
      // merlons on the outer (centre-facing) edge of the rampart
      var ze = sgn < 0 ? zf1 - 0.5 : zf0, ze1 = ze + 0.5;
      for (var x = -8.8; x < 9; x += 1.45) {
        if (x > -2.9 && x < 2.3) continue;
        m.solid(x, WH, ze, x + 0.7, WH + 0.75, ze1, SNOW, { side: SH });
      }
      // snow-brick lines on both faces of the front wall + team banners facing the middle
      var fIn = sgn < 0 ? zf1 : zf0, fOut = sgn < 0 ? zf0 : zf1, dIn = sgn < 0 ? 0.02 : -0.02;
      for (var by = 0.8; by < WH; by += 0.8) {
        b.box(-9, by, Math.min(fIn, fIn + dIn), -2.5, by + 0.05, Math.max(fIn, fIn + dIn), 0xb9cdec);
        b.box(2.5, by, Math.min(fIn, fIn + dIn), 9, by + 0.05, Math.max(fIn, fIn + dIn), 0xb9cdec);
        b.box(-9, by, Math.min(fOut, fOut - dIn), -2.5, by + 0.05, Math.max(fOut, fOut - dIn), 0xb9cdec);
        b.box(2.5, by, Math.min(fOut, fOut - dIn), 9, by + 0.05, Math.max(fOut, fOut - dIn), 0xb9cdec);
      }
      for (var bx2 = -1; bx2 <= 1; bx2 += 2) {
        var cx2 = bx2 * 5.7, d2 = sgn < 0 ? 0.05 : -0.05;
        b.box(cx2 - 0.75, 0.5, Math.min(fIn, fIn + d2), cx2 + 0.75, 2.25, Math.max(fIn, fIn + d2), flag);
        b.push().translate(cx2, 1.45, fIn + d2 * 1.4).rotX(sgn < 0 ? Math.PI / 2 : -Math.PI / 2);
        b.disc(0, 0, 0, 0.45, 0xffffff, 14); b.disc(0, sgn < 0 ? 0.01 : 0.01, 0, 0.28, flag, 14);
        b.pop();
      }
      // gate arch (visual) over the gap
      b.box(-2.5, WH, zf0, 2.5, WH + 0.5, zf1, flag, { top: SNOW });
      m.coll(-2.5, WH, zf0, 2.5, WH + 0.5, zf1);
      // side walls
      var zs0 = Math.min(sgn * 11.6, sgn * 19), zs1 = Math.max(sgn * 11.6, sgn * 19);
      m.solid(-9.8, 0, zs0, -9, WH, zs1, SNOW, { side: SH });
      m.solid(9, 0, zs0, 9.8, WH, zs1, SNOW, { side: SH });
      // ramps up to the rampart inside the fort (they end beside the wall top)
      var zr0 = sgn < 0 ? -13.6 : 11.6, zr1 = sgn < 0 ? -11.6 : 13.6;
      m.ramp(-8.8, zr0, -3.2, zr1, 0, 0, WH, 1, SH, { top: SNOW });
      m.ramp(3.2, zr0, 8.8, zr1, 0, 0, WH, 0, SH, { top: SNOW });
      // flags on the corners
      for (var s = -1; s <= 1; s += 2) {
        b.cyl(s * 9.4, WH, sgn * 11.2, 0.07, 3.2, WOOD, { seg: 5 });
        b.box(s * 9.4, WH + 2.3, sgn * 11.2 - 0.02, s * 9.4 + s * 1.2, WH + 3.1, sgn * 11.2 + 0.02, flag);
      }
      // inside: supply crates and an igloo
      crate(m, -6.5, sgn * 16.8, 1.1, WOOD); crate(m, 6.5, sgn * 16.8, 1.1, WOOD); crate(m, 5.6, sgn * 16.9, 0.8, WOOD, 1.1);
      b.sphere(0, 0, sgn * 16.8, 2.1, SNOW, { seg: 12, rings: 8, half: true, cap: false, col2: SH });
      m.coll(-1.5, 0, sgn * 16.8 - 1.5, 1.5, 1.8, sgn * 16.8 + 1.5);
      m.coll(-0.9, 1.8, sgn * 16.8 - 0.9, 0.9, 2.1, sgn * 16.8 + 0.9);
      m.shade(-9, Math.min(sgn * 11.6, sgn * 13.8), 9, Math.max(sgn * 11.6, sgn * 13.8), 0.9);
    }
    fort(-1, BLU); fort(1, ORA);
    // centre hill: plateau at 1.4 m with four ramps
    var HH = 1.5;
    m.solid(-2.5, 0, -2.5, 2.5, HH, 2.5, SNOW, { side: SH });
    m.tiles(-2.5, -2.5, 2.5, 2.5, HH, function (x, z) { return ((Math.floor(x) + Math.floor(z)) & 1) ? 0xe2f1ff : 0xfafdff; });
    m.tiles(-9, -11.6, -2.5, -10, WH, function (x) { return (Math.floor(x) & 1) ? 0xe8f2ff : 0xffffff; });
    m.tiles(2.5, -11.6, 9, -10, WH, function (x) { return (Math.floor(x) & 1) ? 0xe8f2ff : 0xffffff; });
    m.tiles(-9, 10, -2.5, 11.6, WH, function (x) { return (Math.floor(x) & 1) ? 0xe8f2ff : 0xffffff; });
    m.tiles(2.5, 10, 9, 11.6, WH, function (x) { return (Math.floor(x) & 1) ? 0xe8f2ff : 0xffffff; });
    m.ramp(2.5, -2.5, 5.5, 2.5, 0, 0, HH, 1, SH, { top: SNOW });
    m.ramp(-5.5, -2.5, -2.5, 2.5, 0, 0, HH, 0, SH, { top: SNOW });
    m.ramp(-2.5, 2.5, 2.5, 5.5, 0, 0, HH, 3, SH, { top: SNOW });
    m.ramp(-2.5, -5.5, 2.5, -2.5, 0, 0, HH, 2, SH, { top: SNOW });
    // corner mini-walls on the plateau for cover
    m.solid(-2.5, HH, -2.5, -1.3, HH + 0.8, -2.2, ICE, { top: 0xd6f4ff }); m.solid(1.3, HH, 2.2, 2.5, HH + 0.8, 2.5, ICE, { top: 0xd6f4ff });
    m.solid(2.2, HH, -2.5, 2.5, HH + 0.8, -1.3, ICE, { top: 0xd6f4ff }); m.solid(-2.5, HH, 1.3, -2.2, HH + 0.8, 2.5, ICE, { top: 0xd6f4ff });
    // ice blocks
    function ice(x, z, s, h) { m.solid(x - s / 2, 0, z - s / 2, x + s / 2, h || s, z + s / 2, ICE, { top: 0xd6f4ff, side: ICE2 }); }
    ice(-7, -5.5, 1.3); ice(7, 5.5, 1.3); ice(-7.8, 4.2, 1.1); ice(7.8, -4.2, 1.1);
    ice(-13, -7, 1.4, 1.2); ice(13, 7, 1.4, 1.2); ice(-4.5, -8.2, 1.2, 1.1); ice(4.5, 8.2, 1.2, 1.1);
    // snowmen
    function snowman(x, z, scarf) {
      b.sphere(x, 0.55, z, 0.62, SNOW, { seg: 10, rings: 7 });
      b.sphere(x, 1.35, z, 0.45, SNOW, { seg: 10, rings: 7 });
      b.sphere(x, 1.98, z, 0.33, SNOW, { seg: 10, rings: 7 });
      b.cyl(x, 1.62, z, 0.38, 0.14, scarf, { seg: 10 });
      b.cyl(x, 2.24, z, 0.26, 0.08, 0x333344, { seg: 8 }); b.cyl(x, 2.3, z, 0.18, 0.3, 0x333344, { seg: 8 });
      b.push().translate(x, 1.98, z).rotY(Math.atan2(-x, -z)).rotX(Math.PI / 2); b.cyl(0, 0.25, 0, 0.06, 0.28, 0xff8a1f, { r2: 0, seg: 6 }); b.pop();
      m.coll(x - 0.55, 0, z - 0.55, x + 0.55, 2.3, z + 0.55);
    }
    snowman(-12, 2.5, 0xff5a5f); snowman(12, -2.5, 0x3ddc84); snowman(-15.5, -3.5, 0x9b6bff); snowman(15.5, 3.5, 0xffc93c);
    // long low ice walls on the flanks (hop-on cover)
    m.solid(-17.5, 0, -1.5, -16.8, 1.2, 1.5, ICE, { top: 0xd6f4ff, side: ICE2 }); m.solid(16.8, 0, -1.5, 17.5, 1.2, 1.5, ICE, { top: 0xd6f4ff, side: ICE2 });
    m.solid(-11, 0, 7.8, -8.5, 1.1, 8.5, ICE, { top: 0xd6f4ff, side: ICE2 }); m.solid(8.5, 0, -8.5, 11, 1.1, -7.8, ICE, { top: 0xd6f4ff, side: ICE2 });
    // snowball piles
    function pile(x, z) {
      for (var i = 0; i < 6; i++) b.sphere(x + [-0.4, 0.4, 0, -0.2, 0.25, 0][i], [0.28, 0.28, 0.28, 0.72, 0.72, 1.1][i], z + [0.2, 0.2, -0.35, 0, 0, 0][i], 0.32, SNOW, { seg: 7, rings: 5 });
      m.coll(x - 0.7, 0, z - 0.6, x + 0.7, 0.95, z + 0.6);
    }
    pile(-5, 12.2); pile(5, -12.2); pile(-14, 12); pile(14, -12);
    // pine trees
    pine(m, -16, -8.5, 1, true); pine(m, 16, 8.5, 1, true); pine(m, -15.5, 9.5, 0.9, true); pine(m, 15.5, -9.5, 0.9, true);
    pine(m, -12.5, -16.5, 0.85, true); pine(m, 12.5, 16.5, 0.85, true);
    // perimeter: low snow bank + mountains
    m.perimeter(1.4, function () {
      var h = this.half;
      for (var s = 0; s < 4; s++) {
        for (var t = -h - 1; t < h + 1; t += 1.6) {
          var x = s < 2 ? t + 0.8 : (s === 2 ? -h - 0.6 : h + 0.6), z = s < 2 ? (s === 0 ? -h - 0.6 : h + 0.6) : t + 0.8;
          b.sphere(x, 0.2, z, 1.0, (Math.floor(t) & 1) ? SNOW : 0xeef5ff, { seg: 7, rings: 5, sy: 1.2, half: true, cap: false, flat: true });
        }
      }
      for (var k = 0; k < 14; k++) {
        var a = k / 14 * Math.PI * 2, rr = 42 + (k % 3) * 8;
        var mx = Math.cos(a) * rr, mz = Math.sin(a) * rr, mh = 14 + (k % 4) * 5;
        b.cyl(mx, -1, mz, 12 + (k % 3) * 3, mh, 0x9fb7d9, { r2: 0, seg: 6, top: SNOW });
        b.cyl(mx, -1 + mh * 0.62, mz, (12 + (k % 3) * 3) * 0.38 + 0.4, mh * 0.38 + 0.1, SNOW, { r2: 0, seg: 6 });
        pine({ b: b, cylS: function (x2, z2, r, y0, hh, col, o) { b.cyl(x2, y0, z2, r, hh, col, o); }, coll: function () {} }, Math.cos(a + 0.2) * 27, Math.sin(a + 0.2) * 27, 1.5, true);
      }
    });
    m.apron(0xeef5ff, 0xeef5ff);
    m.ground(function (x, z) {
      var ax = Math.abs(x), az = Math.abs(z);
      if (ax > 11 && ax < 15 && az < 5) return ((Math.floor(x) + Math.floor(z)) & 1) ? 0xbfeaff : 0xcff0ff;
      var n = Math.sin(x * 0.9 + z * 0.4) + Math.cos(z * 1.1 - x * 0.3);
      return n > 0.8 ? 0xffffff : n < -0.9 ? 0xe4eefc : 0xf1f7ff;
    });
    [[-4, -15.5, 1], [6, -14.5, 1], [-2.2, -13, 1], [3.5, -18.5, 1], [-15, -15, 1], [15, -16, 1],
     [4, 15.5, 2], [-6, 14.5, 2], [2.2, 13, 2], [-3.5, 18.5, 2], [15, 15, 2], [-15, 16, 2],
     [-16, 0, 0], [16, 0, 0], [-9, 0, 0], [9, 0, 0]].forEach(function (s) { m.spawn(s[0], s[1], s[2]); });
    m.pick('hp', -13, 0); m.pick('hp', 13, 0);
    m.pick('ammo', -6, -11, WH); m.pick('ammo', 6, 11, WH);
    m.pick('ammo', -9, -7.5); m.pick('ammo', 9, 7.5);
    m.pick('power', 0, 0, HH);
    [[0, 0, HH], [-6, -10.8, WH], [6, 10.8, WH], [6, -10.8, WH], [-6, 10.8, WH], [-5, -16], [5, 16], [-14, -12], [14, 12], [-14, 12], [14, -12],
     [-10, 0], [10, 0], [-6, 6], [6, -6], [0, -8], [0, 8], [-17, 5], [17, -5]].forEach(function (p) { m.hotspot(p[0], p[1], p[2]); });
    return m;
  }

  // mm: minimap colours in the map's own palette (floor, cover by height low / mid / high, ramps);
  // kept away from the pink, blue and yellow of the buddy and pickup dots drawn on top
  SS.MAPS = [
    { id: 'playground', name: 'ساحة المدرسة', icon: '🏫', build: playground,
      sky: [0x3d9bff, 0x9fd4ff, 0xe4f5ff], fog: [0xd6efff, 30, 95], hemi: [0xeaf6ff, 0x9bbf7a, 1.9], sun: [0xfff2dc, 2.3, -0.5, 1, 0.35], step: 'grass',
      mm: { floor: 'rgba(125,215,100,0.6)', low: 'rgba(210,245,175,0.8)', mid: 'rgba(40,140,70,0.88)', high: 'rgba(20,75,45,0.92)', ramp: 'rgba(160,225,120,0.85)' } },
    { id: 'factory', name: 'مصنع الحلوى', icon: '🍭', build: factory,
      sky: [0x7d6bff, 0xc6a8ff, 0xffe0f0], fog: [0xf6dcef, 30, 95], hemi: [0xfff0fa, 0xc99aa8, 1.9], sun: [0xfff0e6, 2.2, 0.4, 1, 0.5], step: 'tile',
      mm: { floor: 'rgba(200,160,255,0.45)', low: 'rgba(240,215,255,0.75)', mid: 'rgba(135,85,210,0.88)', high: 'rgba(75,35,130,0.92)', ramp: 'rgba(175,130,240,0.8)' } },
    { id: 'snowfort', name: 'قلعة الثلج', icon: '⛄', build: snowfort,
      sky: [0x5f9dff, 0xb7d6ff, 0xf2f8ff], fog: [0xe6f1ff, 28, 90], hemi: [0xf0f7ff, 0xb4c3e0, 2.0], sun: [0xfffaf0, 2.1, -0.4, 1, -0.5], step: 'snow', snow: true,
      mm: { floor: 'rgba(240,248,255,0.55)', low: 'rgba(205,225,245,0.85)', mid: 'rgba(120,150,195,0.9)', high: 'rgba(55,75,120,0.92)', ramp: 'rgba(175,200,230,0.85)' } }
  ];
  SS.MapKit = MapKit;
})();
