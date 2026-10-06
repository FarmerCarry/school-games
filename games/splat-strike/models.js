/*
 * Splat Strike — models.js
 * Everything is drawn in code as merged low-poly geometry with vertex colours:
 *   SS.buddyGeo(opts)        cute round "splat buddy" (body, big eyes, goggles, hat)
 *   SS.blasterGeo(type, skin, hands)   the three toy blasters (optionally with mitten hands)
 *   SS.pickupGeo(type)       heart, paint bucket, power star
 * Buddies face -Z, feet at y = 0, about 1.75 m tall. Blasters point along -Z with the grip at the origin.
 */
(function () {
  'use strict';
  var SS = window.SS;
  var T = window.THREE;

  function shade(hex, k) {
    var r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
    if (k >= 1) { r += (255 - r) * (k - 1); g += (255 - g) * (k - 1); b += (255 - b) * (k - 1); }
    else { r *= k; g *= k; b *= k; }
    return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
  }
  SS.shade = shade;
  function lum(hex) { return (0.299 * ((hex >> 16) & 255) + 0.587 * ((hex >> 8) & 255) + 0.114 * (hex & 255)) / 255; }

  /* ------------------------------------------------------------ cosmetics */
  SS.COLORS = [
    { id: 'pink', name: 'وردي', c: 0xff5fa2, price: 0 },
    { id: 'sky', name: 'سماوي', c: 0x3fb8ff, price: 0 },
    { id: 'lime', name: 'ليموني', c: 0x7ddc3a, price: 60 },
    { id: 'grape', name: 'عنبي', c: 0x9b6bff, price: 60 },
    { id: 'sun', name: 'شمسي', c: 0xffc61a, price: 80 },
    { id: 'mint', name: 'نعناعي', c: 0x2fe0b0, price: 80 },
    { id: 'coral', name: 'مرجاني', c: 0xff7a5c, price: 100 },
    { id: 'berry', name: 'توتي', c: 0xd13cff, price: 120 },
    { id: 'snow', name: 'ثلجي', c: 0xf2f4ff, price: 150 },
    { id: 'night', name: 'ليلي', c: 0x4b4fd8, price: 150 }
  ];
  SS.HATS = [
    { id: 'none', name: 'بلا قبعة', price: 0 },
    { id: 'cap', name: 'قبعة رياضية', price: 0 },
    { id: 'party', name: 'قبعة الحفلة', price: 70 },
    { id: 'bunny', name: 'أذنا أرنب', price: 90 },
    { id: 'propeller', name: 'قبعة المروحة', price: 110 },
    { id: 'chef', name: 'قبعة الطاهي', price: 120 },
    { id: 'cowboy', name: 'قبعة راعي البقر', price: 140 },
    { id: 'viking', name: 'خوذة الفايكنغ', price: 170 },
    { id: 'flower', name: 'زهرة', price: 190 },
    { id: 'antenna', name: 'هوائي فضائي', price: 220 },
    { id: 'tophat', name: 'قبعة ساحر', price: 260 },
    { id: 'crown', name: 'التاج الذهبي', price: 400 }
  ];
  SS.SKINS = [
    { id: 'classic', name: 'كلاسيكي', main: 0xff5fa2, acc: 0x3fb8ff, tank: 0xffe14d, pat: 'solid', price: 0 },
    { id: 'lagoon', name: 'بحيرة', main: 0x2fd0e0, acc: 0xffffff, tank: 0x6dff8a, pat: 'solid', price: 0 },
    { id: 'stripes', name: 'مخطط', main: 0xff8a1f, acc: 0xffffff, tank: 0xff5fa2, pat: 'stripes', price: 80 },
    { id: 'dots', name: 'منقّط', main: 0x9b6bff, acc: 0xffe14d, tank: 0x3fb8ff, pat: 'dots', price: 100 },
    { id: 'candy', name: 'حلوى', main: 0xffffff, acc: 0xff4d7a, tank: 0x7dffcf, pat: 'stripes', price: 130 },
    { id: 'jungle', name: 'غابة', main: 0x4cc26a, acc: 0xffd23f, tank: 0xff7a5c, pat: 'dots', price: 150 },
    { id: 'rainbow', name: 'قوس قزح', main: 0xff5a5f, acc: 0xffffff, tank: 0xffffff, pat: 'rainbow', price: 220 },
    { id: 'galaxy', name: 'مجرّة', main: 0x4b3cc8, acc: 0xffe14d, tank: 0x3fe0ff, pat: 'galaxy', price: 280 },
    { id: 'gold', name: 'ذهبي', main: 0xffc61a, acc: 0xfff3b0, tank: 0xff5fa2, pat: 'gold', price: 450 }
  ];
  // toy blasters. rate = seconds between shots, spread in radians, speed = paint blob m/s.
  // The splat shotgun's 9 pellets x 12 = 108: a full blast inside fall0 (6 m) always splats.
  SS.WEAPONS = [
    { id: 'auto', name: 'رشّاش الفقاعات', key: '1', dmg: 14, head: 1.5, rate: 0.095, mag: 30, res: 150, reload: 1.45, spread: 0.01, moveSpread: 0.016, airSpread: 0.04,
      bloom: 0.004, bloomMax: 0.026, pellets: 1, range: 70, fall0: 18, fall1: 42, fallMin: 0.6, speed: 150, recoil: 0.011, recoilYaw: 0.006, auto: true, size: 0.075, decal: 0.42 },
    { id: 'scatter', name: 'مدفع الرذاذ', key: '2', dmg: 12, head: 1.5, rate: 0.78, mag: 6, res: 36, reload: 1.9, spread: 0.072, moveSpread: 0.008, airSpread: 0.015,
      bloom: 0, bloomMax: 0, pellets: 9, range: 32, fall0: 6, fall1: 18, fallMin: 0.3, speed: 115, recoil: 0.055, recoilYaw: 0.01, auto: false, size: 0.06, decal: 0.3 },
    { id: 'sniper', name: 'قنّاص الألوان', key: '3', dmg: 55, head: 2, rate: 1.05, mag: 5, res: 25, reload: 2.1, spread: 0.055, zoomSpread: 0.0012, moveSpread: 0.04, airSpread: 0.08,
      bloom: 0, bloomMax: 0, pellets: 1, range: 100, fall0: 999, fall1: 1000, fallMin: 1, speed: 320, recoil: 0.07, recoilYaw: 0.008, auto: false, zoom: 3.2, size: 0.1, decal: 0.7 }
  ];
  SS.BALLOON = { dmg: 90, radius: 3.8, speed: 16, up: 3.4, grav: 17, max: 3, start: 2 };
  function byId(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return list[0]; }
  SS.byId = byId;

  /* ---------------------------------------------------------------- buddy */
  SS.EYE_H = 1.45;
  SS.HEAD_Y = 1.33; SS.HEAD_R = 0.42; SS.BODY_Y = 0.7; SS.BODY_R = 0.54;
  function hat(b, id, body) {
    var y = 1.62;
    switch (id) {
      case 'cap':
        b.sphere(0, 1.47, 0, 0.415, 0xff4d4d, { half: true, cap: false, seg: 14, rings: 10 });
        b.cyl(0, 1.47, 0, 0.415, 0.05, 0xffffff, { seg: 14 });
        b.push().translate(0, 1.5, -0.42).scale(1, 1, 0.8); b.cyl(0, 0, 0, 0.26, 0.035, 0xff4d4d, { seg: 10, top: 0xd93636 }); b.pop();
        b.sphere(0, 1.88, 0, 0.05, 0xffffff, { seg: 6, rings: 4 });
        break;
      case 'party':
        b.cyl(0, y, 0, 0.2, 0.18, 0x3fb8ff, { r2: 0.14, seg: 10 });
        b.cyl(0, y + 0.18, 0, 0.14, 0.16, 0xffe14d, { r2: 0.08, seg: 10 });
        b.cyl(0, y + 0.34, 0, 0.08, 0.14, 0xff5fa2, { r2: 0.015, seg: 10 });
        b.sphere(0, y + 0.5, 0, 0.07, 0xffffff, { seg: 8, rings: 6 });
        break;
      case 'bunny':
        b.push().translate(-0.16, 1.62, 0.02).rotZ(0.25); b.sphere(0, 0.25, 0, 0.1, 0xffffff, { sy: 2.8, seg: 8, rings: 6 }); b.sphere(0, 0.25, -0.05, 0.06, 0xff9ec7, { sy: 3.2, sz: 0.6, seg: 8, rings: 6 }); b.pop();
        b.push().translate(0.16, 1.62, 0.02).rotZ(-0.25); b.sphere(0, 0.25, 0, 0.1, 0xffffff, { sy: 2.8, seg: 8, rings: 6 }); b.sphere(0, 0.25, -0.05, 0.06, 0xff9ec7, { sy: 3.2, sz: 0.6, seg: 8, rings: 6 }); b.pop();
        break;
      case 'propeller':
        b.sphere(0, 1.46, 0, 0.42, 0xff5a5f, { half: true, cap: false, seg: 12, rings: 10, col2: 0xffe14d });
        b.cyl(0, 1.84, 0, 0.02, 0.12, 0x555566, { seg: 5 });
        b.box(-0.3, 1.95, -0.035, 0.3, 1.975, 0.035, 0x3fb8ff);
        b.box(-0.035, 1.95, -0.3, 0.035, 1.975, 0.3, 0x3ddc84);
        b.sphere(0, 1.98, 0, 0.035, 0xffe14d, { seg: 6, rings: 4 });
        break;
      case 'chef':
        b.cyl(0, 1.58, 0, 0.27, 0.24, 0xffffff, { seg: 12 });
        b.sphere(0, 1.9, 0, 0.3, 0xffffff, { sy: 0.7, seg: 10, rings: 7 });
        b.sphere(-0.16, 1.9, 0, 0.18, 0xffffff, { seg: 8, rings: 6 }); b.sphere(0.16, 1.9, 0, 0.18, 0xffffff, { seg: 8, rings: 6 });
        break;
      case 'cowboy':
        b.cyl(0, 1.58, 0, 0.56, 0.04, 0xa0663c, { seg: 14, top: 0xb97a4a });
        b.cyl(0, 1.6, 0, 0.26, 0.26, 0xb97a4a, { r2: 0.22, seg: 12 });
        b.cyl(0, 1.62, 0, 0.265, 0.06, 0x5a3520, { seg: 12 });
        break;
      case 'viking':
        b.sphere(0, 1.44, 0, 0.43, 0xb8c0d0, { half: true, cap: false, seg: 12, rings: 10 });
        b.cyl(0, 1.44, 0, 0.435, 0.07, 0xffc61a, { seg: 12 });
        b.push().translate(-0.36, 1.62, 0).rotZ(0.9); b.cyl(0, 0, 0, 0.08, 0.34, 0xfff1d6, { r2: 0, seg: 8 }); b.pop();
        b.push().translate(0.36, 1.62, 0).rotZ(-0.9); b.cyl(0, 0, 0, 0.08, 0.34, 0xfff1d6, { r2: 0, seg: 8 }); b.pop();
        break;
      case 'flower':
        for (var i = 0; i < 6; i++) { var a = i / 6 * Math.PI * 2; b.sphere(Math.cos(a) * 0.13, 1.78, Math.sin(a) * 0.13 + 0.05, 0.09, i % 2 ? 0xff5fa2 : 0xff9ec7, { sy: 0.45, seg: 8, rings: 5 }); }
        b.sphere(0, 1.8, 0.05, 0.08, 0xffe14d, { seg: 8, rings: 5 });
        b.cyl(0, 1.66, 0.05, 0.02, 0.12, 0x3ddc84, { seg: 5 });
        break;
      case 'antenna':
        b.push().translate(-0.14, 1.66, 0).rotZ(0.3); b.cyl(0, 0, 0, 0.02, 0.3, 0x555566, { seg: 5 }); b.sphere(0, 0.33, 0, 0.07, 0x7dff8a, { seg: 8, rings: 6 }); b.pop();
        b.push().translate(0.14, 1.66, 0).rotZ(-0.3); b.cyl(0, 0, 0, 0.02, 0.3, 0x555566, { seg: 5 }); b.sphere(0, 0.33, 0, 0.07, 0x7dff8a, { seg: 8, rings: 6 }); b.pop();
        break;
      case 'tophat':
        b.cyl(0, 1.62, 0, 0.4, 0.035, 0x2b2b3a, { seg: 14 });
        b.cyl(0, 1.64, 0, 0.25, 0.42, 0x2b2b3a, { seg: 14 });
        b.cyl(0, 1.66, 0, 0.255, 0.08, 0x9b6bff, { seg: 14 });
        break;
      case 'crown':
        b.cyl(0, 1.64, 0, 0.26, 0.16, 0xffc61a, { seg: 12, cap: false, inner: 0xe0a800 });
        for (var k = 0; k < 6; k++) {
          var a2 = k / 6 * Math.PI * 2;
          b.cyl(Math.cos(a2) * 0.23, 1.8, Math.sin(a2) * 0.23, 0.06, 0.13, 0xffc61a, { r2: 0, seg: 5 });
          b.sphere(Math.cos(a2) * 0.265, 1.72, Math.sin(a2) * 0.265, 0.035, k % 2 ? 0xff3355 : 0x3fb8ff, { seg: 6, rings: 4 });
        }
        break;
    }
  }
  // opts: { color, hat, accent, team }
  SS.buddyGeo = function (opts) {
    var b = new SS.Builder();
    var col = opts.color, belly = shade(col, 1.45), acc = opts.accent || 0xffe14d;
    // body with a lighter belly baked into its vertex colours
    var cb = SS.lin(col), cl = SS.lin(belly);
    function sm(a, b, x) { var t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
    b.sphere(0, SS.BODY_Y, 0, SS.BODY_R, col, { sy: 0.92, seg: 16, rings: 12, colFn: function (nx, ny, nz) {
      var k = sm(0.45, 0.75, -nz) * sm(-0.95, -0.55, ny) * (1 - sm(0.35, 0.6, ny));
      return [cb[0] + (cl[0] - cb[0]) * k, cb[1] + (cl[1] - cb[1]) * k, cb[2] + (cl[2] - cb[2]) * k];
    } });
    // head
    b.sphere(0, SS.HEAD_Y, 0, SS.HEAD_R - 0.02, col, { seg: 14, rings: 10 });
    // eyes
    for (var s = -1; s <= 1; s += 2) {
      b.sphere(s * 0.145, 1.36, -0.305, 0.12, 0xffffff, { sz: 0.6, seg: 10, rings: 8 });
      b.sphere(s * 0.14, 1.35, -0.37, 0.065, 0x1d1f33, { sz: 0.6, seg: 8, rings: 6 });
      b.sphere(s * 0.12, 1.385, -0.405, 0.022, 0xffffff, { seg: 5, rings: 4 });
      b.sphere(s * 0.26, 1.23, -0.31, 0.06, 0xff8fb0, { sz: 0.4, seg: 7, rings: 5 });
    }
    // smile
    b.push().translate(0, 1.2, -0.375).rotX(0.35); b.sphere(0, 0, 0, 0.075, 0x7a1f3d, { sy: 0.45, sz: 0.35, seg: 8, rings: 5 }); b.pop();
    // goggles pushed up on the forehead + strap
    b.cyl(0, 1.47, 0, 0.405, 0.085, acc, { seg: 14, cap: false, smooth: true });
    for (var g = -1; g <= 1; g += 2) {
      b.push().translate(g * 0.14, 1.53, -0.33).rotX(Math.PI / 2 - 0.35);
      b.cyl(0, -0.05, 0, 0.1, 0.1, acc, { seg: 10, top: 0x8fe8ff });
      b.pop();
    }
    hat(b, opts.hat || 'none', col);
    return b.geometry();
  };
  SS.footGeo = function () {
    var b = new SS.Builder();
    b.sphere(0, 0.08, -0.04, 0.15, 0xffffff, { sy: 0.6, sz: 1.35, seg: 10, rings: 6 });
    return b.geometry();
  };

  /* -------------------------------------------------------------- blasters */
  var RAINBOW = [0xff5a5f, 0xff9f1c, 0xffe14d, 0x3ddc84, 0x3fb8ff, 0x9b6bff];
  function stripeCol(skin, i) {
    if (skin.pat === 'stripes') return i % 2 ? skin.acc : skin.main;
    if (skin.pat === 'rainbow') return RAINBOW[i % RAINBOW.length];
    return skin.main;
  }
  // rounded body tube along -z from z0 to z1, radius r, centre height y, n colour bands
  function segTube(b, skin, z0, z1, r, y, n) {
    for (var i = 0; i < n; i++) {
      var za = z0 + (z1 - z0) * i / n, zb = z0 + (z1 - z0) * (i + 1) / n, c = stripeCol(skin, i);
      b.push().translate(0, y, za).rotX(-Math.PI / 2);
      b.cyl(0, 0, 0, r, za - zb, c, { seg: 14, smooth: true, cap: i === n - 1, top: shade(c, 1.1) });
      b.pop();
    }
  }
  function decorate(b, skin, x, y0, y1, z0, z1) {
    if (skin.pat === 'dots' || skin.pat === 'galaxy') {
      var n = skin.pat === 'galaxy' ? 9 : 5;
      for (var i = 0; i < n; i++) {
        var z = z0 + (z1 - z0) * ((i * 0.37 + 0.13) % 1), y = y0 + (y1 - y0) * ((i * 0.61 + 0.3) % 1);
        var r = skin.pat === 'galaxy' ? 0.008 + (i % 3) * 0.005 : 0.018;
        b.sphere(x + 0.002, y, z, r, skin.acc, { sx: 0.4, seg: 6, rings: 4 });
        b.sphere(-x - 0.002, y, z, r, skin.acc, { sx: 0.4, seg: 6, rings: 4 });
      }
    }
    if (skin.pat === 'gold') {
      b.box(-x - 0.004, (y0 + y1) / 2 - 0.008, z0, x + 0.004, (y0 + y1) / 2 + 0.008, z1, skin.acc);
    }
  }
  function mitten(b, x, y, z, col) {
    b.sphere(x, y, z, 0.075, col, { sx: 1.05, sy: 0.9, sz: 1.2, seg: 10, rings: 7 });
    b.sphere(x + (x < 0 ? 0.05 : -0.05), y + 0.03, z - 0.05, 0.035, col, { seg: 6, rings: 4 });
  }
  // type 0 auto, 1 shotgun, 2 sniper. hands: mitten colour or null. Returns { geo, muzzle: [x,y,z] }
  SS.blasterGeo = function (type, skin, hands) {
    var b = new SS.Builder();
    var A = skin.acc, TK = skin.tank, M = skin.main, dark = 0x2b2f4a, muz;
    if (type === 0) {
      // rounded toy body along -z, split in bands so skins can stripe it
      segTube(b, skin, 0.1, -0.26, 0.056, 0.02, 4);
      b.sphere(0, 0.02, 0.1, 0.056, stripeCol(skin, 0), { seg: 12, rings: 8, sz: 0.7 });
      decorate(b, skin, 0.056, -0.02, 0.06, 0.08, -0.24);
      b.box(-0.014, 0.07, -0.22, 0.014, 0.088, 0.06, A);                       // top rail
      b.push().translate(0, 0.02, -0.26).rotX(-Math.PI / 2);
      b.cyl(0, 0, 0, 0.042, 0.02, A, { seg: 12, smooth: true });
      b.cyl(0, 0.02, 0, 0.028, 0.12, A, { seg: 10, smooth: true });
      for (var rr = 0; rr < 2; rr++) b.cyl(0, 0.045 + rr * 0.04, 0, 0.033, 0.012, M, { seg: 10 });
      b.cyl(0, 0.14, 0, 0.03, 0.05, TK, { r2: 0.048, seg: 12, smooth: true, cap: false, inner: shade(TK, 0.55) });
      b.pop();
      // bubble tank on a collar
      b.cyl(0, 0.065, -0.07, 0.03, 0.03, A, { seg: 10 });
      b.sphere(0, 0.125, -0.07, 0.05, TK, { seg: 12, rings: 9, col2: shade(TK, 0.78), split: -0.3 });
      b.sphere(0.018, 0.148, -0.088, 0.014, 0xffffff, { seg: 6, rings: 4 });
      b.sphere(-0.02, 0.11, -0.05, 0.008, 0xffffff, { seg: 5, rings: 3 });
      // grip, trigger guard, fore grip
      b.push().translate(0, -0.02, 0.05).rotX(0.28); b.box(-0.026, -0.14, -0.03, 0.026, 0, 0.03, dark, { bottom: true }); b.pop();
      b.box(-0.01, -0.075, -0.035, 0.01, -0.03, 0.012, A);
      b.push().translate(0, -0.03, -0.19); b.cyl(0, -0.07, 0, 0.022, 0.07, A, { seg: 8, smooth: true, bottom: true }); b.pop();
      muz = [0, 0.02, -0.46];
    } else if (type === 1) {
      segTube(b, skin, 0.12, -0.2, 0.066, 0.02, 3);
      b.sphere(0, 0.02, 0.12, 0.066, stripeCol(skin, 0), { seg: 12, rings: 8, sz: 0.6 });
      decorate(b, skin, 0.066, -0.03, 0.07, 0.1, -0.18);
      b.push().translate(0, 0.02, -0.2).rotX(-Math.PI / 2);
      b.cyl(0, 0, 0, 0.05, 0.1, A, { seg: 12, smooth: true });
      b.cyl(0, 0.1, 0, 0.052, 0.1, TK, { r2: 0.09, seg: 14, smooth: true, cap: false, inner: shade(TK, 0.5) });
      b.cyl(0, 0.19, 0, 0.092, 0.015, A, { seg: 14, cap: false, inner: A });
      b.pop();
      // pump under the barrel
      b.push().translate(0, -0.055, -0.24).rotX(-Math.PI / 2);
      for (var r2 = 0; r2 < 4; r2++) b.cyl(0, r2 * 0.03, 0, 0.034, 0.022, r2 % 2 ? M : A, { seg: 10, smooth: true });
      b.pop();
      // drum tank lying across the top
      b.push().translate(-0.058, 0.118, -0.04).rotZ(-Math.PI / 2);
      b.cyl(0, 0, 0, 0.048, 0.116, TK, { seg: 12, smooth: true, top: shade(TK, 1.3), bottom: true });
      b.cyl(0, 0.05, 0, 0.05, 0.016, A, { seg: 12 });
      b.pop();
      b.box(-0.016, 0.07, -0.06, 0.016, 0.1, -0.02, dark);
      b.push().translate(0, -0.03, 0.07).rotX(0.3); b.box(-0.03, -0.15, -0.032, 0.03, 0, 0.032, dark, { bottom: true }); b.pop();
      b.box(-0.045, -0.02, 0.14, 0.045, 0.055, 0.29, M, { bottom: true, top: shade(M, 1.12) });
      muz = [0, 0.02, -0.4];
    } else {
      // «قنّاص الألوان»: a long, chunky TOY blaster: rounded striped body, fat barrel with a bright orange
      // safety tip, a bubbly toy scope in the accent colour and a big bubble paint tank (no dark parts)
      if (lum(M) < 0.3) M = shade(M, 1.45);                  // dark skins stay bright on the long body
      var sk = { main: M, acc: skin.acc, pat: skin.pat };
      segTube(b, sk, 0.12, -0.36, 0.052, 0.02, 5);
      b.sphere(0, 0.02, 0.12, 0.052, stripeCol(sk, 0), { seg: 12, rings: 8, sz: 0.7 });
      decorate(b, sk, 0.052, -0.02, 0.06, 0.1, -0.34);
      b.push().translate(0, 0.02, -0.36).rotX(-Math.PI / 2);
      b.cyl(0, 0, 0, 0.032, 0.25, A, { seg: 12, smooth: true });
      b.cyl(0, 0.06, 0, 0.037, 0.016, M, { seg: 12, smooth: true });
      b.cyl(0, 0.15, 0, 0.037, 0.016, M, { seg: 12, smooth: true });
      b.cyl(0, 0.25, 0, 0.046, 0.075, 0xff8a1f, { seg: 14, smooth: true, top: 0xffb366 });   // orange toy tip
      b.cyl(0, 0.326, 0, 0.022, 0.004, 0x9a4a10, { seg: 10 });
      b.pop();
      // toy scope: accent tube with round bubble lenses at both ends (a cap faces the player)
      b.push().translate(0, 0.118, -0.03).rotX(-Math.PI / 2);
      b.cyl(0, -0.12, 0, 0.027, 0.24, A, { seg: 12, smooth: true, cap: false });
      b.cyl(0, -0.16, 0, 0.041, 0.05, TK, { seg: 14, smooth: true, cap: false });
      b.cyl(0, 0.12, 0, 0.041, 0.05, TK, { seg: 14, smooth: true, cap: false });
      b.sphere(0, -0.16, 0, 0.039, 0x8fe8ff, { sy: 0.45, seg: 12, rings: 8 });
      b.sphere(0, 0.17, 0, 0.039, 0x8fe8ff, { sy: 0.45, seg: 12, rings: 8 });
      b.sphere(0.013, -0.176, -0.012, 0.009, 0xffffff, { seg: 6, rings: 4 });
      b.pop();
      b.box(-0.014, 0.065, -0.08, 0.014, 0.095, 0.02, A);
      // big bubble paint tank under the front
      b.sphere(0, -0.05, -0.29, 0.05, TK, { sz: 1.5, seg: 12, rings: 9, col2: shade(TK, 0.78), split: -0.3 });
      b.sphere(0.02, -0.025, -0.33, 0.012, 0xffffff, { seg: 6, rings: 4 });
      // chunky rounded stock + grip in the skin colours
      b.box(-0.04, -0.07, 0.1, 0.04, 0.045, 0.27, M, { bottom: true, top: shade(M, 1.12) });
      b.box(-0.046, -0.082, 0.27, 0.046, 0.057, 0.31, A, { bottom: true, top: shade(A, 1.1) });
      b.box(-0.01, -0.075, -0.035, 0.01, -0.03, 0.012, A);
      b.push().translate(0, -0.03, 0.05).rotX(0.25); b.box(-0.028, -0.14, -0.03, 0.028, 0, 0.03, A, { bottom: true }); b.pop();
      muz = [0, 0.02, -0.7];
    }
    if (hands != null) {
      mitten(b, 0.0, -0.13, 0.08, hands);
      mitten(b, 0.0, -0.09, type === 2 ? -0.24 : -0.22, hands);
    }
    return { geo: b.geometry(), muzzle: muz };
  };

  /* --------------------------------------------------------------- pickups */
  SS.pickupGeo = function (type) {
    var b = new SS.Builder();
    if (type === 'hp') {
      b.sphere(-0.13, 0.1, 0, 0.17, 0xff3d6e, { seg: 12, rings: 8, sz: 0.7 });
      b.sphere(0.13, 0.1, 0, 0.17, 0xff3d6e, { seg: 12, rings: 8, sz: 0.7 });
      b.push().translate(0, 0.02, 0).rotZ(Math.PI); b.cyl(0, -0.02, 0, 0.26, 0.3, 0xff3d6e, { r2: 0, seg: 4, smooth: false }); b.pop();
      b.sphere(-0.15, 0.17, -0.1, 0.045, 0xffffff, { seg: 6, rings: 4 });
      b.box(-0.02, 0.0, -0.13, 0.02, 0.2, -0.11, 0xffffff); b.box(-0.08, 0.08, -0.13, 0.08, 0.12, -0.11, 0xffffff);
    } else if (type === 'ammo') {
      b.cyl(0, -0.2, 0, 0.2, 0.36, 0xdfe6f5, { r2: 0.22, seg: 12, smooth: true, top: 0x3fb8ff });
      b.cyl(0, -0.05, 0, 0.212, 0.1, 0xff5fa2, { r2: 0.216, seg: 12 });
      for (var i = 0; i < 4; i++) { var a = i * 1.7; b.sphere(Math.cos(a) * 0.205, 0.08 - (i % 2) * 0.08, Math.sin(a) * 0.205, 0.04, 0x3fb8ff, { sy: 1.8, seg: 6, rings: 4 }); }
      b.push().translate(0, 0.16, 0).rotX(Math.PI / 2); b.ring(0, 0, 0, 0.19, 0.22, 0x555566, 12); b.pop();
    } else {
      // power star
      var pts = [];
      for (var k = 0; k < 10; k++) { var ang = k / 10 * Math.PI * 2 - Math.PI / 2, rr = k % 2 ? 0.14 : 0.32; pts.push([Math.cos(ang) * rr, -Math.sin(ang) * rr]); }
      var d = 0.08;
      for (var j = 0; j < 10; j++) {
        var p0 = pts[j], p1 = pts[(j + 1) % 10];
        b.tri(0, 0, -d, p1[0], p1[1], -d * 0.4, p0[0], p0[1], -d * 0.4, 0xffd23f);
        b.tri(0, 0, d, p0[0], p0[1], d * 0.4, p1[0], p1[1], d * 0.4, 0xffc61a);
        b.quad(p0[0], p0[1], -d * 0.4, p1[0], p1[1], -d * 0.4, p1[0], p1[1], d * 0.4, p0[0], p0[1], d * 0.4, 0xff9f1c);
      }
      b.sphere(-0.06, 0.05, -0.07, 0.03, 0x2b2f4a, { seg: 6, rings: 4 }); b.sphere(0.06, 0.05, -0.07, 0.03, 0x2b2f4a, { seg: 6, rings: 4 });
    }
    return b.geometry();
  };
  SS.balloonGeo = function () {
    var b = new SS.Builder();
    b.sphere(0, 0, 0, 0.16, 0xffffff, { sy: 1.15, seg: 12, rings: 9 });
    b.cyl(0, -0.2, 0, 0.03, 0.05, 0xffffff, { r2: 0.01, seg: 6 });
    return b.geometry();
  };
  SS.podiumGeo = function () {
    var b = new SS.Builder();
    var cols = [0xffc61a, 0xd8e0f0, 0xe89a5a], hs = [1.2, 0.85, 0.6], xs = [0, -1.7, 1.7];
    for (var i = 0; i < 3; i++) {
      b.box(xs[i] - 0.8, 0, -0.7, xs[i] + 0.8, hs[i], 0.7, cols[i], { top: shade(cols[i], 1.2) });
      b.box(xs[i] - 0.84, hs[i] - 0.1, -0.74, xs[i] + 0.84, hs[i], 0.74, 0xffffff);
    }
    b.cyl(0, -0.2, 0, 4.2, 0.2, 0x3d3a8a, { seg: 24, top: 0x4b47a8 });
    return b.geometry();
  };
})();
