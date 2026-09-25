/*
 * Road Hopper (عبور الطريق) — voxel models, drawn entirely in code.
 * Every model is a list of boxes merged into ONE vertex-coloured BufferGeometry,
 * so each object on screen is a single draw call.
 *
 * Box entry: [cx, y0, cz, w, h, d, color]  (x/z are centres, y0 is the bottom).
 * Characters / vehicles are authored in tenths of a tile (scale 0.1),
 * lanes in whole tiles (scale 1). Characters face -Z (forward), vehicles face +X.
 */
(function () {
  'use strict';
  var C = new THREE.Color();

  function build(list, scale) {
    scale = scale || 0.1;
    var n = list.length * 36;
    var pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
    var o = 0, r = 0, g = 0, b = 0;
    function v(x, y, z, nx, ny, nz) {
      pos[o] = x; pos[o + 1] = y; pos[o + 2] = z;
      nor[o] = nx; nor[o + 1] = ny; nor[o + 2] = nz;
      col[o] = r; col[o + 1] = g; col[o + 2] = b;
      o += 3;
    }
    function quad(a, bb, c, d, nx, ny, nz) {
      v(a[0], a[1], a[2], nx, ny, nz); v(bb[0], bb[1], bb[2], nx, ny, nz); v(c[0], c[1], c[2], nx, ny, nz);
      v(a[0], a[1], a[2], nx, ny, nz); v(c[0], c[1], c[2], nx, ny, nz); v(d[0], d[1], d[2], nx, ny, nz);
    }
    for (var i = 0; i < list.length; i++) {
      var e = list[i], s = scale;
      var x0 = (e[0] - e[3] / 2) * s, x1 = (e[0] + e[3] / 2) * s;
      var y0 = e[1] * s, y1 = (e[1] + e[4]) * s;
      var z0 = (e[2] - e[5] / 2) * s, z1 = (e[2] + e[5] / 2) * s;
      C.set(e[6]); r = C.r; g = C.g; b = C.b;
      quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], 1, 0, 0);
      quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], -1, 0, 0);
      quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], 0, 1, 0);
      quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], 0, -1, 0);
      quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], 0, 0, 1);
      quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], 0, 0, -1);
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeBoundingSphere();
    return geo;
  }

  function shade(hex, f) {
    var rr = (hex >> 16) & 255, gg = (hex >> 8) & 255, bb = hex & 255;
    rr = Math.min(255, Math.round(rr * f)); gg = Math.min(255, Math.round(gg * f)); bb = Math.min(255, Math.round(bb * f));
    return (rr << 16) | (gg << 8) | bb;
  }

  var K = 0x23232d, W = 0xffffff, O = 0xff8a1f, PINK = 0xff9cc2, RED = 0xff4545;
  // Eye with a white sparkle. z = front surface of the head.
  function eye(L, x, y, z, s) {
    s = s || 1;
    L.push([x, y, z - 0.1, 1 * s, 1.1 * s, 0.3, K]);
    L.push([x + 0.22 * s, y + 0.55 * s, z - 0.2, 0.38 * s, 0.38 * s, 0.2, W]);
  }
  function eyes(L, dx, y, z, s) { eye(L, -dx, y, z, s); eye(L, dx, y, z, s); }

  /* ------------------------------------------------------------ characters */
  var CH = {};
  CH.chick = function (gold) {
    var Y = gold ? 0xffc928 : 0xffe14d, Y2 = gold ? 0xf0a800 : 0xf6c21c, L = [];
    L.push([0, 1, 0, 6, 5.4, 6, Y]);
    L.push([0, 6.4, -0.6, 1.1, 1.4, 2.4, gold ? 0xff5a8a : RED]);
    L.push([0, 3.3, -3.55, 1.8, 1.1, 1.3, O]);
    L.push([0, 2.5, -3.2, 0.9, 0.9, 0.6, RED]);
    eyes(L, 1.6, 4.1, -3);
    L.push([-3.2, 2, 0.3, 0.5, 2.4, 3.2, Y2]); L.push([3.2, 2, 0.3, 0.5, 2.4, 3.2, Y2]);
    L.push([-1.3, 0, 0, 0.7, 1, 0.7, O]); L.push([1.3, 0, 0, 0.7, 1, 0.7, O]);
    L.push([-1.3, 0, -0.6, 1.2, 0.3, 1.4, O]); L.push([1.3, 0, -0.6, 1.2, 0.3, 1.4, O]);
    L.push([0, 4.2, 3.2, 2.2, 1.6, 0.8, Y2]);
    L.push([-2.3, 2.9, -3.02, 0.9, 0.5, 0.1, 0xffa0a0]); L.push([2.3, 2.9, -3.02, 0.9, 0.5, 0.1, 0xffa0a0]);
    if (gold) { // little crown
      var G = 0xfff176;
      L.push([0, 6.4, 0.6, 3.4, 0.8, 3.0, G]);
      L.push([-1.3, 7.2, -0.6, 0.7, 0.9, 0.7, G]); L.push([1.3, 7.2, -0.6, 0.7, 0.9, 0.7, G]);
      L.push([-1.3, 7.2, 1.8, 0.7, 0.9, 0.7, G]); L.push([1.3, 7.2, 1.8, 0.7, 0.9, 0.7, G]);
      L.push([0, 7.2, 2.0, 0.7, 0.7, 0.3, 0x3fd0ff]);
    }
    return L;
  };
  CH.frog = function () {
    var G = 0x5bd12e, G2 = 0x3a9e1c, L = [];
    L.push([0, 0.6, 0.3, 7, 3.4, 6.2, G]);
    L.push([0, 0.8, -2.85, 5, 2.2, 0.2, 0xc8f07a]);
    L.push([-2, 3.6, -1.6, 2.4, 2, 2.4, G]); L.push([2, 3.6, -1.6, 2.4, 2, 2.4, G]);
    L.push([-2, 4.0, -2.85, 1.8, 1.4, 0.2, W]); L.push([2, 4.0, -2.85, 1.8, 1.4, 0.2, W]);
    L.push([-2, 4.2, -2.95, 0.9, 0.9, 0.2, K]); L.push([2, 4.2, -2.95, 0.9, 0.9, 0.2, K]);
    L.push([0, 2.4, -2.85, 3.6, 0.4, 0.2, 0x2b6b12]);
    L.push([-2.9, 2.6, -2.85, 0.8, 0.5, 0.2, PINK]); L.push([2.9, 2.6, -2.85, 0.8, 0.5, 0.2, PINK]);
    L.push([-3.8, 0, 1.6, 1.6, 1.6, 3.2, G2]); L.push([3.8, 0, 1.6, 1.6, 1.6, 3.2, G2]);
    L.push([-2.4, 0, -2.4, 1.6, 0.7, 1.6, G2]); L.push([2.4, 0, -2.4, 1.6, 0.7, 1.6, G2]);
    L.push([0, 4.0, 0.8, 2, 0.3, 2, G2]);
    return L;
  };
  CH.cat = function () {
    var OR = 0xffa24c, ST = 0xe0721a, L = [];
    L.push([0, 1, 1.0, 5.4, 3.8, 5, OR]);
    L.push([0, 3.6, -1.4, 5.8, 4, 3.8, OR]);
    L.push([-1.9, 7.6, -1.4, 1.5, 1.5, 1.3, OR]); L.push([1.9, 7.6, -1.4, 1.5, 1.5, 1.3, OR]);
    L.push([-1.9, 7.7, -2.1, 0.7, 0.9, 0.2, PINK]); L.push([1.9, 7.7, -2.1, 0.7, 0.9, 0.2, PINK]);
    eyes(L, 1.35, 5.3, -3.3);
    L.push([0, 3.9, -3.35, 2.8, 1.3, 0.3, 0xfff4e6]);
    L.push([0, 4.8, -3.5, 0.9, 0.6, 0.3, PINK]);
    L.push([-1.1, 7.6, -1.4, 0.6, 0.12, 3.8, ST]); L.push([1.1, 7.6, -1.4, 0.6, 0.12, 3.8, ST]); L.push([0, 7.6, -1.4, 0.6, 0.12, 3.8, ST]);
    L.push([0, 4.8, 1.2, 5.5, 0.12, 0.8, ST]); L.push([0, 4.8, 2.6, 5.5, 0.12, 0.8, ST]);
    L.push([-1.6, 0, -0.6, 1.2, 1, 1.2, 0xfff4e6]); L.push([1.6, 0, -0.6, 1.2, 1, 1.2, 0xfff4e6]);
    L.push([-1.6, 0, 2.6, 1.2, 1, 1.2, OR]); L.push([1.6, 0, 2.6, 1.2, 1, 1.2, OR]);
    L.push([0, 3.2, 3.9, 1, 4.4, 1, OR]); L.push([0, 7.6, 3.9, 1, 1, 1, 0xfff4e6]);
    return L;
  };
  CH.penguin = function () {
    var B = 0x2b3150, L = [];
    L.push([0, 0.6, 0, 5.6, 6.6, 5.2, B]);
    L.push([0, 0.8, -2.65, 4, 4.4, 0.2, W]);
    L.push([0, 4.6, -2.65, 4.2, 2, 0.2, W]);
    L.push([-1, 5.0, -2.75, 0.8, 1.0, 0.2, K]); L.push([1, 5.0, -2.75, 0.8, 1.0, 0.2, K]);
    L.push([-0.85, 5.55, -2.85, 0.3, 0.3, 0.1, W]); L.push([1.15, 5.55, -2.85, 0.3, 0.3, 0.1, W]);
    L.push([0, 4.2, -3.3, 1.5, 0.8, 1.4, O]);
    L.push([-1.3, 0, -1, 1.6, 0.6, 2.2, O]); L.push([1.3, 0, -1, 1.6, 0.6, 2.2, O]);
    L.push([-3.1, 1.8, 0, 0.6, 3.4, 2.4, B]); L.push([3.1, 1.8, 0, 0.6, 3.4, 2.4, B]);
    L.push([-2.2, 3.9, -2.7, 0.8, 0.5, 0.1, PINK]); L.push([2.2, 3.9, -2.7, 0.8, 0.5, 0.1, PINK]);
    L.push([0, 7.2, 0, 4.2, 0.8, 3.8, 0xff4a6b]); L.push([0, 8.0, 0.3, 1.2, 1.2, 1.2, W]); // beanie
    return L;
  };
  CH.robot = function () {
    var G = 0xb8c4d6, D = 0x5b6a82, L = [];
    L.push([-1.3, 0, 0, 1.2, 1.4, 1.4, D]); L.push([1.3, 0, 0, 1.2, 1.4, 1.4, D]);
    L.push([0, 1.4, 0, 5.4, 3.2, 4.4, G]);
    L.push([0, 2.0, -2.25, 2.8, 1.6, 0.2, D]);
    L.push([-0.6, 2.4, -2.4, 0.7, 0.7, 0.2, RED]); L.push([0.6, 2.4, -2.4, 0.7, 0.7, 0.2, 0xffd23f]);
    L.push([0, 4.6, 0, 4.6, 3.2, 4.2, G]);
    L.push([0, 5.3, -2.15, 3.8, 1.5, 0.2, D]);
    L.push([-0.95, 5.55, -2.3, 1.0, 0.9, 0.2, 0x3ef0ff]); L.push([0.95, 5.55, -2.3, 1.0, 0.9, 0.2, 0x3ef0ff]);
    L.push([0, 4.9, -2.2, 1.6, 0.3, 0.2, 0x3ef0ff]);
    L.push([0, 7.8, 0, 0.4, 1.3, 0.4, D]); L.push([0, 9.0, 0, 1.1, 1.1, 1.1, RED]);
    L.push([-3.1, 1.8, 0, 0.8, 2.8, 1.2, D]); L.push([3.1, 1.8, 0, 0.8, 2.8, 1.2, D]);
    L.push([-2.45, 5.4, 0, 0.4, 1.2, 1.2, D]); L.push([2.45, 5.4, 0, 0.4, 1.2, 1.2, D]);
    return L;
  };
  CH.dino = function () {
    var G = 0x4fcf6a, G2 = 0x36a852, S = 0xffb13b, L = [];
    L.push([0, 1, 0.8, 5, 4, 5, G]);
    L.push([0, 3.4, -1.8, 4.6, 3.8, 4.2, G]);
    L.push([0, 3.8, -3.95, 3.6, 0.4, 0.2, W]);
    eyes(L, 1.2, 5.4, -3.9);
    L.push([-0.6, 6.0, -3.95, 0.4, 0.3, 0.1, K]);
    L.push([0, 1.4, -1.75, 3, 2.4, 0.2, 0xd9f7a0]);
    L.push([0, 7.2, -1.4, 1, 1, 1.2, S]); L.push([0, 5, 0.8, 1, 1.2, 1.2, S]); L.push([0, 5, 2.6, 1, 1, 1.2, S]);
    L.push([0, 1.8, 4.1, 2.6, 2.2, 2.4, G]); L.push([0, 1.8, 5.7, 1.5, 1.5, 1.4, G]); L.push([0, 3.6, 4.2, 0.9, 0.9, 1, S]);
    L.push([-1.6, 0, 1.2, 1.5, 1.2, 1.8, G2]); L.push([1.6, 0, 1.2, 1.5, 1.2, 1.8, G2]);
    L.push([-2.7, 2.6, -0.6, 0.6, 0.8, 1.2, G2]); L.push([2.7, 2.6, -0.6, 0.6, 0.8, 1.2, G2]);
    return L;
  };
  CH.sheep = function () {
    var F = 0x3a3a44, WO = 0xf8f8f8, L = [];
    L.push([-1.5, 0, -1.2, 1, 1.5, 1, F]); L.push([1.5, 0, -1.2, 1, 1.5, 1, F]);
    L.push([-1.5, 0, 1.8, 1, 1.5, 1, F]); L.push([1.5, 0, 1.8, 1, 1.5, 1, F]);
    L.push([0, 1.4, 0.5, 6.2, 4, 5.8, WO]);
    L.push([0, 5.4, 0.5, 4.2, 0.9, 4.2, WO]);
    L.push([-3.2, 2.2, 0.5, 0.5, 2.4, 3.8, 0xeeeeee]); L.push([3.2, 2.2, 0.5, 0.5, 2.4, 3.8, 0xeeeeee]);
    L.push([0, 2.8, -2.6, 3.2, 3.2, 2.6, F]);
    L.push([-0.8, 4.2, -3.95, 0.9, 0.9, 0.2, W]); L.push([0.8, 4.2, -3.95, 0.9, 0.9, 0.2, W]);
    L.push([-0.7, 4.3, -4.05, 0.45, 0.5, 0.1, K]); L.push([0.9, 4.3, -4.05, 0.45, 0.5, 0.1, K]);
    L.push([0, 3.2, -3.95, 1.2, 0.5, 0.2, PINK]);
    L.push([-2.1, 4.4, -2.4, 1.3, 0.6, 0.9, F]); L.push([2.1, 4.4, -2.4, 1.3, 0.6, 0.9, F]);
    L.push([0, 6.0, -2.6, 3.4, 1.1, 2.8, WO]);
    return L;
  };
  CH.bunny = function () {
    var L = [];
    L.push([0, 0.8, 0.6, 5, 4, 5, W]);
    L.push([0, 4.4, -1, 4.6, 3.4, 3.6, W]);
    L.push([-1.1, 7.8, -0.6, 1.2, 3.8, 1, W]); L.push([1.1, 7.8, -0.6, 1.2, 3.8, 1, W]);
    L.push([-1.1, 8.2, -1.15, 0.6, 2.8, 0.2, PINK]); L.push([1.1, 8.2, -1.15, 0.6, 2.8, 0.2, PINK]);
    eyes(L, 1.15, 5.8, -2.8);
    L.push([0, 5.1, -2.95, 0.8, 0.6, 0.3, 0xff6f9f]);
    L.push([0, 4.4, -2.95, 1.0, 0.6, 0.2, 0xdddddd]);
    L.push([-1.9, 4.9, -2.85, 0.9, 0.5, 0.1, PINK]); L.push([1.9, 4.9, -2.85, 0.9, 0.5, 0.1, PINK]);
    L.push([0, 2, 3.3, 1.8, 1.8, 1.2, 0xf0f0f0]);
    L.push([-1.5, 0, -1.4, 1.4, 0.8, 2.2, 0xf4f4f4]); L.push([1.5, 0, -1.4, 1.4, 0.8, 2.2, 0xf4f4f4]);
    return L;
  };
  CH.fox = function () {
    var OR = 0xff7b24, L = [];
    L.push([0, 1, 0.8, 4.6, 3.6, 5.4, OR]);
    L.push([0, 3.4, -1.5, 5, 3.4, 3.6, OR]);
    L.push([0, 3.5, -3.95, 2.4, 1.6, 1.6, W]);
    L.push([0, 4.6, -4.8, 0.9, 0.6, 0.3, K]);
    eyes(L, 1.3, 5.3, -3.3);
    L.push([-1.7, 6.8, -1.4, 1.4, 1.6, 1, OR]); L.push([1.7, 6.8, -1.4, 1.4, 1.6, 1, OR]);
    L.push([-1.7, 8.4, -1.4, 1.4, 0.6, 1, K]); L.push([1.7, 8.4, -1.4, 1.4, 0.6, 1, K]);
    L.push([0, 1.3, -1.95, 2.6, 2, 0.2, W]);
    L.push([0, 2.4, 4.6, 2.2, 2.2, 3, OR]); L.push([0, 2.4, 6.5, 2.2, 2.2, 1, W]);
    L.push([-1.4, 0, -1, 1, 1, 1, K]); L.push([1.4, 0, -1, 1, 1, 1, K]);
    L.push([-1.4, 0, 2.6, 1, 1, 1, K]); L.push([1.4, 0, 2.6, 1, 1, 1, K]);
    return L;
  };
  CH.alien = function () {
    var S = 0x8cff66, SU = 0x7b4dff, L = [];
    L.push([-1.2, 0, 0, 1.2, 1.2, 1.4, SU]); L.push([1.2, 0, 0, 1.2, 1.2, 1.4, SU]);
    L.push([0, 1.2, 0, 4.2, 3.2, 3.8, SU]);
    L.push([0, 2.2, -1.95, 1.4, 1.2, 0.2, 0xfff04a]);
    L.push([-2.5, 2.2, 0, 0.8, 2.2, 1.0, S]); L.push([2.5, 2.2, 0, 0.8, 2.2, 1.0, S]);
    L.push([0, 4.4, 0, 6, 4.2, 5, S]);
    L.push([-1.4, 5.4, -2.55, 1.9, 1.6, 0.2, K]); L.push([1.4, 5.4, -2.55, 1.9, 1.6, 0.2, K]);
    L.push([-1.05, 6.2, -2.7, 0.5, 0.5, 0.1, W]); L.push([1.75, 6.2, -2.7, 0.5, 0.5, 0.1, W]);
    L.push([0, 4.9, -2.55, 1.4, 0.35, 0.2, 0x2f7a1f]);
    L.push([-1.5, 8.6, 0, 0.4, 1.6, 0.4, S]); L.push([1.5, 8.6, 0, 0.4, 1.6, 0.4, S]);
    L.push([-1.5, 10.1, 0, 1, 1, 1, 0xfff04a]); L.push([1.5, 10.1, 0, 1, 1, 1, 0xfff04a]);
    return L;
  };
  CH.panda = function () {
    var L = [];
    L.push([0, 1, 0.6, 5.6, 3.6, 5, W]);
    L.push([0, 3.1, 0.6, 5.7, 1.1, 5.1, K]);
    L.push([0, 4.2, -0.6, 5.2, 4, 4.4, W]);
    L.push([-2.1, 8.2, -0.6, 1.5, 1.3, 1.1, K]); L.push([2.1, 8.2, -0.6, 1.5, 1.3, 1.1, K]);
    L.push([-1.3, 5.5, -2.85, 1.7, 1.5, 0.2, K]); L.push([1.3, 5.5, -2.85, 1.7, 1.5, 0.2, K]);
    L.push([-1.15, 6.0, -2.95, 0.55, 0.55, 0.2, W]); L.push([1.45, 6.0, -2.95, 0.55, 0.55, 0.2, W]);
    L.push([0, 4.9, -2.95, 0.9, 0.6, 0.3, K]);
    L.push([-2.1, 4.6, -2.85, 0.8, 0.45, 0.1, PINK]); L.push([2.1, 4.6, -2.85, 0.8, 0.45, 0.1, PINK]);
    L.push([-3.0, 1.6, -0.4, 0.8, 2.4, 1.6, K]); L.push([3.0, 1.6, -0.4, 0.8, 2.4, 1.6, K]);
    L.push([-1.5, 0, 0.4, 1.6, 1.2, 2, K]); L.push([1.5, 0, 0.4, 1.6, 1.2, 2, K]);
    return L;
  };
  CH.camel = function () {
    var T = 0xe7b86b, D = 0xb88a3c, L = [];
    L.push([-1.4, 0, -0.8, 0.9, 2.6, 0.9, D]); L.push([1.4, 0, -0.8, 0.9, 2.6, 0.9, D]);
    L.push([-1.4, 0, 2.4, 0.9, 2.6, 0.9, D]); L.push([1.4, 0, 2.4, 0.9, 2.6, 0.9, D]);
    L.push([0, 2.4, 0.8, 4.2, 2.6, 5, T]);
    L.push([0, 5.0, 1.0, 3.0, 1.8, 2.8, T]); L.push([0, 6.8, 1.0, 1.6, 0.6, 1.4, T]);
    L.push([0, 3.8, -2.2, 1.8, 3.6, 1.6, T]);
    L.push([0, 6.8, -2.9, 2.4, 1.9, 3.0, T]);
    L.push([-0.7, 7.9, -4.45, 0.7, 0.8, 0.2, K]); L.push([0.7, 7.9, -4.45, 0.7, 0.8, 0.2, K]);
    L.push([-0.55, 8.3, -4.55, 0.25, 0.25, 0.1, W]); L.push([0.85, 8.3, -4.55, 0.25, 0.25, 0.1, W]);
    L.push([0, 7.0, -4.45, 1.4, 0.4, 0.2, D]);
    L.push([-1.1, 8.6, -2.2, 0.5, 0.6, 0.5, D]); L.push([1.1, 8.6, -2.2, 0.5, 0.6, 0.5, D]);
    L.push([0, 3.6, 3.5, 0.5, 1.6, 0.5, D]);
    L.push([0, 4.8, 0.2, 4.3, 0.3, 1.2, 0xff4a6b]); L.push([0, 4.8, 1.6, 4.3, 0.3, 0.6, 0x3fc1ff]);
    return L;
  };
  CH.bee = function () {
    var Y = 0xffd21f, L = [];
    L.push([0, 1.2, 0.4, 5, 4.4, 5.6, Y]);
    L.push([0, 1.1, 1.1, 5.1, 4.6, 1, K]); L.push([0, 1.1, 2.8, 5.1, 4.6, 0.9, K]);
    L.push([0, 2.6, 3.6, 0.8, 0.8, 1, K]);
    eyes(L, 1.2, 3.6, -2.4);
    L.push([0, 2.6, -2.5, 1.4, 0.35, 0.2, 0x9a5b00]);
    L.push([-1.9, 2.8, -2.5, 0.8, 0.5, 0.1, 0xff9f7a]); L.push([1.9, 2.8, -2.5, 0.8, 0.5, 0.1, 0xff9f7a]);
    L.push([-1, 5.6, -1.4, 0.4, 1.6, 0.4, K]); L.push([1, 5.6, -1.4, 0.4, 1.6, 0.4, K]);
    L.push([-1, 7.1, -1.4, 0.8, 0.8, 0.8, K]); L.push([1, 7.1, -1.4, 0.8, 0.8, 0.8, K]);
    L.push([-1.8, 5.6, 1.4, 2.2, 2.6, 0.3, 0xdff6ff]); L.push([1.8, 5.6, 1.4, 2.2, 2.6, 0.3, 0xdff6ff]);
    L.push([-1.3, 0.2, -0.4, 0.6, 1.0, 0.6, K]); L.push([1.3, 0.2, -0.4, 0.6, 1.0, 0.6, K]);
    return L;
  };
  CH.owl = function () {
    var B = 0x9b6a3c, B2 = 0x7a4f28, LI = 0xf0d4a8, L = [];
    L.push([0, 0.6, 0, 5.6, 6, 5, B]);
    L.push([0, 0.8, -2.55, 3.8, 2.8, 0.2, LI]);
    L.push([0, 3.6, -2.55, 5.2, 2.4, 0.2, LI]);
    L.push([-1.3, 3.8, -2.7, 2, 2, 0.2, W]); L.push([1.3, 3.8, -2.7, 2, 2, 0.2, W]);
    L.push([-1.2, 4.2, -2.85, 1, 1, 0.2, K]); L.push([1.4, 4.2, -2.85, 1, 1, 0.2, K]);
    L.push([-0.9, 4.8, -2.95, 0.35, 0.35, 0.1, W]); L.push([1.7, 4.8, -2.95, 0.35, 0.35, 0.1, W]);
    L.push([0, 3.0, -2.9, 0.9, 1.1, 0.6, O]);
    L.push([-2.2, 6.6, -0.6, 1, 1.4, 1, B2]); L.push([2.2, 6.6, -0.6, 1, 1.4, 1, B2]);
    L.push([-3.0, 1.4, 0.4, 0.6, 3.8, 3.4, B2]); L.push([3.0, 1.4, 0.4, 0.6, 3.8, 3.4, B2]);
    L.push([-1.2, 0, -1.2, 1.3, 0.6, 1.3, O]); L.push([1.2, 0, -1.2, 1.3, 0.6, 1.3, O]);
    L.push([0, 6.6, 0, 3, 0.2, 3, B2]);
    return L;
  };
  CH.duck = function () {
    var Y = 0xffdc2e, L = [];
    L.push([0, 0.4, 0.6, 5.8, 3.4, 6.2, Y]);
    L.push([0, 3.6, -1.3, 4.2, 3.6, 3.6, Y]);
    L.push([0, 4.0, -3.9, 2.8, 1.0, 1.8, O]);
    eyes(L, 1.25, 5.4, -3.1);
    L.push([-2, 4.4, -3.12, 0.8, 0.5, 0.1, 0xffa07a]); L.push([2, 4.4, -3.12, 0.8, 0.5, 0.1, 0xffa07a]);
    L.push([0, 3.2, 3.8, 2.2, 1.6, 1.2, Y]);
    L.push([-3.0, 1.2, 0.8, 0.5, 2, 3.4, 0xf2c200]); L.push([3.0, 1.2, 0.8, 0.5, 2, 3.4, 0xf2c200]);
    L.push([0, 0, 0.6, 5, 0.4, 5.6, 0xff8a1f]);
    return L;
  };

  // id, Arabic name, how it is unlocked, accent color (for cards), hop sound
  var CHARS = [
    { id: 'chick', name: 'الكتكوت', src: 'start', color: '#ffd84a', snd: [520, 'square'], build: function () { return CH.chick(false); } },
    { id: 'frog', name: 'الضفدع', src: 'machine', color: '#5bd12e', snd: [300, 'triangle'], build: CH.frog },
    { id: 'cat', name: 'القطة', src: 'machine', color: '#ffa24c', snd: [620, 'triangle'], build: CH.cat },
    { id: 'penguin', name: 'البطريق', src: 'machine', color: '#5a6bd6', snd: [440, 'square'], build: CH.penguin },
    { id: 'robot', name: 'الروبوت', src: 'machine', color: '#9fb2cc', snd: [880, 'square'], build: CH.robot },
    { id: 'dino', name: 'الديناصور', src: 'machine', color: '#4fcf6a', snd: [240, 'sawtooth'], build: CH.dino },
    { id: 'sheep', name: 'الخروف', src: 'machine', color: '#e9e9f2', snd: [380, 'triangle'], build: CH.sheep },
    { id: 'bunny', name: 'الأرنب', src: 'machine', color: '#ffb3d1', snd: [700, 'sine'], build: CH.bunny },
    { id: 'fox', name: 'الثعلب', src: 'machine', color: '#ff7b24', snd: [560, 'triangle'], build: CH.fox },
    { id: 'alien', name: 'الفضائي', src: 'machine', color: '#8cff66', snd: [990, 'sine'], build: CH.alien },
    { id: 'panda', name: 'الباندا', src: 'machine', color: '#f2f2f2', snd: [340, 'square'], build: CH.panda },
    { id: 'camel', name: 'الجمل', src: 'machine', color: '#e7b86b', snd: [260, 'triangle'], build: CH.camel },
    { id: 'bee', name: 'النحلة', src: 'machine', color: '#ffd21f', snd: [760, 'sawtooth'], build: CH.bee },
    { id: 'owl', name: 'البومة', src: 'machine', color: '#b07a45', snd: [470, 'sine'], build: CH.owl },
    { id: 'gold', name: 'الكتكوت الذهبي', src: 'score', need: 100, color: '#ffc928', snd: [660, 'square'], build: function () { return CH.chick(true); } },
    { id: 'duck', name: 'بطة المطاط', src: 'splash', need: 10, color: '#ffdc2e', snd: [480, 'sine'], build: CH.duck }
  ];

  /* ---------------------------------------------------------------- themes */
  // Every 50 rows the world changes.
  var THEMES = [
    { name: 'المروج الخضراء', sky: 0x9fe3ff, g1: 0x9ae65f, g2: 0x84d04d, road: 0x5a5e70, water: 0x44c6ff, gravel: 0xa8998a,
      trunk: 0x8b5a2b, leaf1: 0x3fbf4f, leaf2: 0x57d65e, rock: 0xa4adb8, log: 0xa0612f, logEnd: 0xe0aa6e },
    { name: 'غابة الخريف', sky: 0xffd9a3, g1: 0xe6c85c, g2: 0xdcbd52, road: 0x5c5566, water: 0x3aa6e0, gravel: 0xa08a78,
      trunk: 0x7a4a22, leaf1: 0xff8c2e, leaf2: 0xe84a3c, rock: 0xff8f1f, log: 0x8c5226, logEnd: 0xd99a5c },
    { name: 'بلاد الثلج', sky: 0xcfe8ff, g1: 0xf4f8ff, g2: 0xe6eefb, road: 0x60667c, water: 0x6fcfff, gravel: 0xa7a9b6,
      trunk: 0x6d4a2c, leaf1: 0x2f8f5a, leaf2: 0x3aa36a, rock: 0xffffff, log: 0xdff4ff, logEnd: 0xb9e4ff },
    { name: 'الصحراء الذهبية', sky: 0xffe7a8, g1: 0xf5d57f, g2: 0xecca70, road: 0x6b5f58, water: 0x2fd3c7, gravel: 0xc2a57e,
      trunk: 0x3fae55, leaf1: 0x3fae55, leaf2: 0x46c25e, rock: 0xd9894a, log: 0x9c6a3a, logEnd: 0xe8b77a },
    { name: 'أرض الحلوى', sky: 0xffd6f0, g1: 0xffc4e1, g2: 0xffb6d9, road: 0x6e4a3a, water: 0x7ee8fa, gravel: 0xc99bb5,
      trunk: 0xffffff, leaf1: 0xff5fa8, leaf2: 0x9b6bff, rock: 0x5fd3ff, log: 0x6b3a1f, logEnd: 0x8a5230 }
  ];

  var X0 = -4.5, X1 = 4.5, HALF = 18;
  // Lane ground: bright playable middle, darker outside the play area.
  function sideBoxes(L, y0, h, color, z, d) {
    L.push([0, y0, z || 0, X1 - X0, h, d || 1, color]);
    var sw = HALF + X0, sc = shade(color, 0.72);
    L.push([X0 - sw / 2, y0, z || 0, sw, h, d || 1, sc]);
    L.push([X1 + sw / 2, y0, z || 0, sw, h, d || 1, sc]);
  }
  function laneGeo(th, type, variant) {
    var t = THEMES[th], L = [];
    if (type === 'grass') {
      sideBoxes(L, -0.6, 0.6, variant ? t.g2 : t.g1);
    } else if (type === 'road') {
      sideBoxes(L, -0.6, 0.58, t.road);
      if (variant) for (var x = -17; x <= 17; x += 2) {
        var inside = x > X0 && x < X1;
        L.push([x, -0.02, 0.5, 0.9, 0.03, 0.1, inside ? 0xffffff : 0xb8b8b8]);
      }
    } else if (type === 'river') {
      sideBoxes(L, -0.9, 0.62, t.water);
    } else if (type === 'rail') {
      sideBoxes(L, -0.6, 0.58, t.gravel);
      for (var sx = -17.5; sx <= 17.5; sx += 0.7) L.push([sx, -0.02, 0, 0.28, 0.06, 0.86, 0x7a5236]);
      L.push([0, 0.04, -0.26, 36, 0.09, 0.09, 0xd4d8e0]);
      L.push([0, 0.04, 0.26, 36, 0.09, 0.09, 0xd4d8e0]);
    }
    return build(L, 1);
  }

  /* --------------------------------------------------------------- scenery */
  function treeBoxes(th, kind) {
    var t = THEMES[th], L = [];
    if (kind === 'rock') {
      if (th === 1) { // pumpkin
        L.push([0, 0, 0, 7, 5, 7, 0xff8f1f]); L.push([-2.2, 0.1, 0, 0.3, 4.8, 7.1, 0xe36f00]); L.push([2.2, 0.1, 0, 0.3, 4.8, 7.1, 0xe36f00]);
        L.push([0, 5, 0, 1.2, 1.6, 1.2, 0x3b8a2e]); L.push([1, 5.4, 0, 1.6, 0.5, 0.8, 0x4fb33a]);
      } else if (th === 2) { // snowman
        L.push([0, 0, 0, 6.4, 4.4, 6.4, W]); L.push([0, 4.4, 0, 4.6, 3.6, 4.6, W]);
        L.push([-0.9, 6.2, -2.35, 0.7, 0.7, 0.2, K]); L.push([0.9, 6.2, -2.35, 0.7, 0.7, 0.2, K]);
        L.push([0, 5.4, -3.0, 0.8, 0.8, 1.6, 0xff7a1a]);
        L.push([0, 8.0, 0, 3.4, 0.4, 3.4, K]); L.push([0, 8.4, 0, 2.4, 1.8, 2.4, K]);
        L.push([0, 4.2, 0, 4.8, 0.7, 4.8, 0xff4a6b]);
      } else if (th === 4) { // gumdrop
        L.push([0, 0, 0, 7, 3.6, 7, 0x5fd3ff]); L.push([0, 3.6, 0, 5, 1.6, 5, 0x5fd3ff]); L.push([0, 5.2, 0, 2.6, 0.8, 2.6, 0x9ce6ff]);
      } else {
        var rc = t.rock;
        L.push([0, 0, 0, 7.4, 3.6, 7, rc]); L.push([-0.6, 3.6, 0.4, 4.8, 2, 4.6, shade(rc, 1.08 > 1 ? 1 : 1)]);
        L.push([1.6, 0, -1.8, 3, 1.6, 3, shade(rc, 0.85)]);
      }
      return L;
    }
    var tall = kind === 'tree2';
    if (th === 2) { // snowy pine
      L.push([0, 0, 0, 2.2, 2.4, 2.2, t.trunk]);
      L.push([0, 2.2, 0, 7.4, 2.8, 7.4, t.leaf1]); L.push([0, 5.0, 0, 7.5, 0.5, 7.5, W]);
      L.push([0, 5.2, 0, 5.4, 2.8, 5.4, t.leaf2]); L.push([0, 8.0, 0, 5.5, 0.5, 5.5, W]);
      if (tall) { L.push([0, 8.2, 0, 3.4, 3, 3.4, t.leaf1]); L.push([0, 11.2, 0, 3.5, 0.6, 3.5, W]); }
    } else if (th === 3) { // cactus
      if (tall) {
        L.push([0, 0, 0, 3, 11, 3, t.leaf1]);
        L.push([-2.6, 4, 0, 2.4, 1.4, 1.8, t.leaf1]); L.push([-3.4, 4, 0, 1.6, 4.6, 1.8, t.leaf2]);
        L.push([2.6, 6, 0, 2.4, 1.4, 1.8, t.leaf1]); L.push([3.4, 6, 0, 1.6, 3.6, 1.8, t.leaf2]);
        L.push([0, 11, 0, 1.4, 1, 1.4, 0xff5fa8]);
      } else {
        L.push([0, 0, 0, 6, 4.6, 6, t.leaf2]); L.push([0, 4.6, 0, 4, 0.8, 4, t.leaf1]);
        L.push([0, 5.4, 0, 1.6, 1.2, 1.6, 0xffd23f]);
      }
    } else if (th === 4) { // lollipop / cupcake
      if (tall) {
        L.push([0, 0, 0, 1.1, 6.5, 1.1, 0xffffff]);
        L.push([0, 6.2, 0, 6.6, 5.6, 2.4, t.leaf1]); L.push([0, 8.4, 0, 6.8, 1.0, 2.5, 0xffffff]);
        L.push([-2.0, 6.2, 0, 1.0, 5.6, 2.5, 0xffffff]);
      } else {
        L.push([0, 0, 0, 6, 3.2, 6, 0xff8fc7]); L.push([-1.5, 0.1, -3.05, 0.5, 3, 0.2, 0xffffff]); L.push([1.5, 0.1, -3.05, 0.5, 3, 0.2, 0xffffff]);
        L.push([0, 3.2, 0, 7, 2.2, 7, 0xfff4e0]); L.push([0, 5.4, 0, 4.4, 1.2, 4.4, 0xfff4e0]);
        L.push([0, 6.6, 0, 1.8, 1.8, 1.8, RED]);
      }
    } else {
      var lc = tall ? t.leaf2 : t.leaf1, lt = shade(lc, 1.18), ld = shade(lc, 0.82);
      L.push([0, 0, 0, 2.4, 3.6, 2.4, t.trunk]);
      if (tall) {
        L.push([0, 3.4, 0, 6.4, 7.4, 6.4, lc]); L.push([0, 10.8, 0, 4.6, 1.2, 4.6, lt]);
        L.push([-1.6, 6.4, -3.25, 1.4, 1.4, 0.2, ld]); L.push([1.4, 4.4, -3.25, 1.4, 1.4, 0.2, ld]);
      } else {
        L.push([0, 3.4, 0, 6.4, 4.4, 6.4, lc]); L.push([0, 7.8, 0, 4.6, 1.0, 4.6, lt]);
        L.push([1.6, 5.0, -3.25, 1.4, 1.4, 0.2, ld]);
      }
      if (th === 1 && !tall) L.push([-1.2, 8.8, 0.5, 2.0, 0.7, 2.0, 0xffb13b]);
    }
    return L;
  }

  function logBoxes(th, len) {
    var t = THEMES[th], L = [], lw = len * 10 - 1.2;
    if (th === 2) { // ice floe
      L.push([0, -3.4, 0, lw, 3.8, 8.4, t.log]); L.push([0, 0.4, 0, lw - 1.2, 0.3, 7.2, 0xffffff]);
      L.push([-lw / 4, 0.4, 2.2, 2, 0.35, 1.6, 0xb9e4ff]);
    } else if (th === 4) { // chocolate bar
      L.push([0, -3.4, 0, lw, 3.9, 8.2, t.log]);
      for (var i = 0; i < len; i++) {
        var cx = -lw / 2 + 5 + i * 10 - 0.6 * 0;
        L.push([cx - 2.1, 0.5, -2, 3.6, 0.5, 3.4, t.logEnd]); L.push([cx + 2.1, 0.5, -2, 3.6, 0.5, 3.4, t.logEnd]);
        L.push([cx - 2.1, 0.5, 2, 3.6, 0.5, 3.4, t.logEnd]); L.push([cx + 2.1, 0.5, 2, 3.6, 0.5, 3.4, t.logEnd]);
      }
    } else {
      L.push([0, -3.4, 0, lw, 3.9, 8, t.log]);
      L.push([-lw / 2 - 0.1, -3.0, 0, 0.3, 3.2, 7.2, t.logEnd]); L.push([lw / 2 + 0.1, -3.0, 0, 0.3, 3.2, 7.2, t.logEnd]);
      for (var j = 0; j < len; j++) {
        var bx = -lw / 2 + 3 + j * 10;
        L.push([bx, 0.5, -1.5, 3, 0.25, 1.2, shade(t.log, 0.8)]);
        L.push([bx + 3.5, 0.5, 2, 2.4, 0.25, 1.2, shade(t.log, 0.8)]);
      }
    }
    return L;
  }
  // Pads float on the water (water top is y = -0.28). Top surface: -0.21 (ice: -0.08).
  function padBoxes(th, flower) {
    var L = [];
    if (th === 2) { L.push([0, -3.6, 0, 8, 2.5, 8, 0xe6f7ff]); L.push([0, -1.1, 0, 6.4, 0.3, 6.4, 0xffffff]); return L; }
    var G = th === 4 ? 0x7be08a : 0x3fae3f, G2 = shade(G, 0.8);
    L.push([0, -3.0, 0, 8, 0.9, 6, G]); L.push([0, -3.0, 0, 6, 0.9, 8, G]);
    L.push([1.2, -2.12, -2.6, 1.6, 0.1, 3, G2]);
    if (flower) {
      L.push([-1.6, -2.1, 1.4, 2.2, 1, 2.2, 0xff8fc7]); L.push([-1.6, -1.1, 1.4, 1, 0.6, 1, 0xffe14d]);
    }
    return L;
  }

  /* --------------------------------------------------------------- vehicles */
  var GLASS = 0xbfe9ff;
  function wheels(L, xs, halfW) {
    for (var i = 0; i < xs.length; i++) {
      L.push([xs[i], 0, -halfW, 2.6, 2.6, 1.3, K]); L.push([xs[i], 0, halfW, 2.6, 2.6, 1.3, K]);
      L.push([xs[i], 0.8, -halfW - 0.7, 1, 1, 0.2, 0xcccccc]); L.push([xs[i], 0.8, halfW + 0.7, 1, 1, 0.2, 0xcccccc]);
    }
  }
  function vehicleBoxes(type, color) {
    var L = [], c2 = shade(color, 0.8);
    if (type === 'car') {
      L.push([0, 1.2, 0, 13, 3, 8, color]);
      L.push([-1, 4.2, 0, 7, 2.5, 7.2, GLASS]);
      L.push([-1.4, 4.2, 0, 1, 2.5, 7.3, color]);
      L.push([-1, 6.7, 0, 7.2, 0.6, 7.4, c2]);
      L.push([6.6, 2.4, -2.6, 0.3, 1, 1.6, 0xfff3a0]); L.push([6.6, 2.4, 2.6, 0.3, 1, 1.6, 0xfff3a0]);
      L.push([-6.6, 2.4, -2.6, 0.3, 1, 1.6, RED]); L.push([-6.6, 2.4, 2.6, 0.3, 1, 1.6, RED]);
      L.push([0, 1.2, 0, 13.4, 0.8, 8.2, c2]);
      wheels(L, [-4, 4], 3.6);
    } else if (type === 'taxi') {
      L.push([0, 1.2, 0, 13, 3, 8, 0xffc629]);
      L.push([-1, 4.2, 0, 7, 2.5, 7.2, GLASS]);
      L.push([-1, 6.7, 0, 7.2, 0.6, 7.4, 0xf0b400]);
      L.push([-1, 7.3, 0, 2.6, 1.2, 3.4, 0xffffff]);
      L.push([0, 2.6, -4.05, 12, 0.8, 0.2, K]); L.push([0, 2.6, 4.05, 12, 0.8, 0.2, K]);
      L.push([6.6, 2.4, -2.6, 0.3, 1, 1.6, 0xfff3a0]); L.push([6.6, 2.4, 2.6, 0.3, 1, 1.6, 0xfff3a0]);
      L.push([-6.6, 2.4, -2.6, 0.3, 1, 1.6, RED]); L.push([-6.6, 2.4, 2.6, 0.3, 1, 1.6, RED]);
      wheels(L, [-4, 4], 3.6);
    } else if (type === 'van') { // ice-cream van
      L.push([0, 1.2, 0, 17, 6.6, 8.2, 0xffffff]);
      L.push([0, 1.2, 0, 17.2, 1.4, 8.4, 0xff8fc7]);
      L.push([6.5, 4.4, 0, 4.2, 2.4, 8.4, GLASS]);
      L.push([-1.5, 4.4, -4.15, 7, 2.6, 0.2, 0x7ad7ff]); L.push([-1.5, 4.4, 4.15, 7, 2.6, 0.2, 0x7ad7ff]);
      L.push([0, 7.8, 0, 17, 0.8, 8.2, 0xff8fc7]);
      L.push([-2, 8.6, 0, 2.4, 2.6, 2.4, 0xe0a060]); L.push([-2, 11.2, 0, 3.4, 2.4, 3.4, 0xfff0f6]); L.push([-2, 13.6, 0, 1.2, 1.2, 1.2, RED]);
      L.push([8.6, 2.4, -2.8, 0.3, 1, 1.6, 0xfff3a0]); L.push([8.6, 2.4, 2.8, 0.3, 1, 1.6, 0xfff3a0]);
      wheels(L, [-5.5, 5.5], 3.7);
    } else if (type === 'truck') {
      L.push([8.5, 1.4, 0, 6, 5.8, 8, color]);
      L.push([10.3, 4.4, 0, 2.4, 2.2, 8.2, GLASS]);
      L.push([11.6, 2.2, -2.8, 0.3, 1, 1.6, 0xfff3a0]); L.push([11.6, 2.2, 2.8, 0.3, 1, 1.6, 0xfff3a0]);
      L.push([-3, 1.4, 0, 17.4, 7.2, 8.6, 0xf4f4f4]);
      L.push([-3, 4.2, -4.35, 15, 1.4, 0.2, color]); L.push([-3, 4.2, 4.35, 15, 1.4, 0.2, color]);
      L.push([2, 0.9, 0, 23, 0.6, 6, 0x444450]);
      wheels(L, [-9, -5.5, 8], 3.8);
    } else if (type === 'bus') {
      L.push([0, 1.3, 0, 27, 6.8, 8.4, 0xffc629]);
      L.push([0.5, 4.6, 0, 24, 2.2, 8.6, GLASS]);
      for (var p = -9; p <= 10; p += 4) L.push([p, 4.6, 0, 0.8, 2.2, 8.7, 0xffc629]);
      L.push([13.6, 4.2, 0, 0.3, 3.4, 7, GLASS]);
      L.push([0, 8.1, 0, 26, 0.5, 8, 0xf0b400]);
      L.push([0, 2.6, 0, 27.2, 0.6, 8.6, K]);
      L.push([13.6, 2.0, -3, 0.3, 1, 1.4, 0xfff3a0]); L.push([13.6, 2.0, 3, 0.3, 1, 1.4, 0xfff3a0]);
      wheels(L, [-9, 8.5], 3.9);
    }
    return L;
  }
  var TRAIN_LEN = 18;
  function trainBoxes() {
    var L = [], units = [[70, 38, 0xff4b4b], [31, 34, 0x3f7bff], [-5, 34, 0xff4b4b], [-41, 34, 0x3f7bff], [-73, 30, 0xff4b4b]];
    for (var i = 0; i < units.length; i++) {
      var cx = units[i][0], ln = units[i][1], c = units[i][2];
      L.push([cx, 1.4, 0, ln, 7.2, 8.8, c]);
      L.push([cx, 4.8, 0, ln - 4, 2.2, 9.0, GLASS]);
      L.push([cx, 3.2, 0, ln, 0.9, 9.0, 0xffffff]);
      L.push([cx, 8.6, 0, ln - 2, 0.6, 8, 0xd6d9e2]);
      L.push([cx - ln / 3, 0, -3.6, 4, 1.6, 1.4, K]); L.push([cx - ln / 3, 0, 3.6, 4, 1.6, 1.4, K]);
      L.push([cx + ln / 3, 0, -3.6, 4, 1.6, 1.4, K]); L.push([cx + ln / 3, 0, 3.6, 4, 1.6, 1.4, K]);
      if (i > 0) L.push([cx + ln / 2 + 1, 2, 0, 2.4, 3, 4, 0x333340]);
    }
    L.push([89.2, 1.4, 0, 0.4, 7.2, 8.8, 0xffd23f]);
    L.push([89.4, 4.6, 0, 0.3, 2.6, 6.4, 0x223344]);
    L.push([89.5, 2.2, -2.8, 0.3, 1.2, 1.4, 0xfffbd0]); L.push([89.5, 2.2, 2.8, 0.3, 1.2, 1.4, 0xfffbd0]);
    return L;
  }

  function coinBoxes(big) {
    var s = big ? 1.6 : 1.25, G = big ? 0x7ff0ff : 0xffcc1a, G2 = big ? 0x3fb8e0 : 0xf29d00, L = [];
    L.push([0, -2.5 * s, 0, 3.2 * s, 5 * s, 1.6 * s, G]); L.push([0, -1.6 * s, 0, 5 * s, 3.2 * s, 1.6 * s, G]);
    L.push([0, -1.6 * s, 0, 1.2 * s, 3.2 * s, 1.8 * s, G2]);
    return L;
  }

  function eagleParts() {
    var BR = 0x8a5a33, L = [];
    L.push([0, -3, 0, 9, 7, 13, BR]);
    L.push([0, 1, -8, 7, 6, 6, W]);
    L.push([0, 1.8, -11.6, 3, 2.2, 2.2, 0xffc21a]); L.push([0, 1.0, -12.4, 2, 1.2, 1.2, 0xffc21a]);
    L.push([-2.1, 4, -11.05, 1.3, 1.5, 0.2, K]); L.push([2.1, 4, -11.05, 1.3, 1.5, 0.2, K]);
    L.push([-1.8, 4.6, -11.15, 0.5, 0.5, 0.1, W]); L.push([2.4, 4.6, -11.15, 0.5, 0.5, 0.1, W]);
    L.push([-2.2, 5.6, -11.1, 2.2, 0.6, 0.2, 0x4a2f1a]); L.push([2.2, 5.6, -11.1, 2.2, 0.6, 0.2, 0x4a2f1a]);
    L.push([0, -2, 8.5, 8, 2.4, 5, W]);
    L.push([-2.4, -6, -1.5, 1.4, 3.2, 1.4, 0xffc21a]); L.push([2.4, -6, -1.5, 1.4, 3.2, 1.4, 0xffc21a]);
    var wing = [[8, 0, 0, 12, 1.6, 9, BR], [17, 0.2, 1.5, 7, 1.2, 7, 0x6b4426], [21, 0.3, 2.5, 3, 1, 5, 0x6b4426]];
    return { body: L, wing: wing };
  }

  function signalBoxes() {
    return [[0, 0, 0, 1.2, 15, 1.2, 0xd8dbe4], [0, 0, 0, 2.4, 1, 2.4, 0x555566],
      [0, 11.6, 0, 5.8, 3.2, 1.6, 0x2a2a33],
      [-2.3, 16.3, 0.9, 5.4, 1.1, 0.3, 0xffffff], [2.3, 16.3, 0.9, 5.4, 1.1, 0.3, 0xffffff],
      [0, 16.1, 0.95, 1.2, 1.5, 0.3, 0xff4545]];
  }
  function lightBoxes() { return [[-1.45, 12.3, 0.95, 1.9, 1.9, 0.3, 0xffffff], [1.45, 12.3, 0.95, 1.9, 1.9, 0.3, 0xffffff]]; }

  window.RH = {
    build: build, shade: shade, CHARS: CHARS, THEMES: THEMES, laneGeo: laneGeo, treeBoxes: treeBoxes,
    logBoxes: logBoxes, padBoxes: padBoxes, vehicleBoxes: vehicleBoxes, trainBoxes: trainBoxes, TRAIN_LEN: TRAIN_LEN,
    coinBoxes: coinBoxes, eagleParts: eagleParts, signalBoxes: signalBoxes, lightBoxes: lightBoxes
  };
})();
