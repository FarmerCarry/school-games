/* Desk Karts (سباق المكاتب) engine: builds the 8 closed school-tabletop circuits,
 * simulates 1-2 human karts + playful AI critter karts, drift/steering, forgiving desk
 * borders, anti-cheat sector checkpoints, 4 toy power-ups, world gimmicks (ruler bridges,
 * glue/watercolor/butter traps, erasers/tape bumpers, lab magnets & warp portals), DDA
 * parameters, progression stars, coins and shop saves.
 * Pure: no DOM, no Kit, no timers, no Math.random and no localStorage. */
(function (root) {
  'use strict';
  var DK = {};
  var W = 1280, H = 720, TAU = Math.PI * 2;
  DK.W = W; DK.H = H;
  DK.LAPS = 3;
  DK.STEP = 8;
  DK.KART_R = 14;
  DK.TOP_SPEED = 315;
  DK.ACCEL = 440;
  DK.BRAKE = 560;
  DK.DRAG = 250;
  DK.TURN = 3.25;
  DK.COIN_R = 22;
  DK.BOX_R = 24;
  DK.STAR_COINS = 2;

  DK.EASY = { botSpeed: 0.73, catchup: 0.04, mercy: 0.24, roadWidth: 1.08, wallKeep: 0.9 };
  DK.HARD = { botSpeed: 0.98, catchup: 0.16, mercy: 0.05, roadWidth: 0.96, wallKeep: 0.78 };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function wrapAngle(a) {
    while (a > Math.PI) a -= TAU;
    while (a < -Math.PI) a += TAU;
    return a;
  }
  function wrapS(len, s) {
    if (!len) return 0;
    s = s % len;
    return s < 0 ? s + len : s;
  }
  DK.clamp = clamp;
  DK.wrapAngle = wrapAngle;
  DK.wrapS = wrapS;

  DK.params = function (k) {
    k = clamp(+k || 0, 0, 1);
    var o = {};
    for (var key in DK.EASY) o[key] = DK.EASY[key] + (DK.HARD[key] - DK.EASY[key]) * k;
    return o;
  };

  function makeRng(seed) {
    var s = (seed >>> 0) || 123456789;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }
  DK.makeRng = makeRng;

  /* --------------------------------------------------- worlds, tracks & shop */
  DK.WORLDS = [
    { name: 'مكتب الدراسة', theme: 'desk', color: '#ffb703', accent: '#fb8500', bg0: '#d89b56', bg1: '#b57435', road: '#3d4258', curbA: '#ffd166', curbB: '#ff6b8b' },
    { name: 'طاولة الرسم', theme: 'art', color: '#ff5d9e', accent: '#8338ec', bg0: '#2ec4b6', bg1: '#1b9aaa', road: '#383054', curbA: '#ff5d9e', curbB: '#3df0ff' },
    { name: 'صينية المقصف', theme: 'cafe', color: '#3ddc84', accent: '#ff9f1c', bg0: '#f4a261', bg1: '#e07a3c', road: '#463d3a', curbA: '#ffbe0b', curbB: '#ffffff' },
    { name: 'مختبر العلوم', theme: 'lab', color: '#3df0ff', accent: '#9b5de5', bg0: '#132254', bg1: '#0a1230', road: '#192650', curbA: '#3df0ff', curbB: '#c77dff' }
  ];

  DK.ITEMS = ['turbo', 'bubble', 'spring', 'splat'];
  DK.ITEM_INFO = {
    turbo: { name: 'علبة العصير', color: '#ff9f1c' },
    bubble: { name: 'فقاعة الصابون', color: '#3df0ff' },
    spring: { name: 'النابض القافز', color: '#8dff5a' },
    splat: { name: 'صاروخ الألوان', color: '#ff5d9e' }
  };

  DK.PAINTS = [
    { name: 'أحمر ناري', body: '#ff4d6d', trim: '#ffd166', glow: '#ff4d6d', price: 0 },
    { name: 'أزرق سماوي', body: '#2ec4ff', trim: '#ffffff', glow: '#3df0ff', price: 3 },
    { name: 'أصفر شمسي', body: '#ffd23f', trim: '#fb5607', glow: '#ffb703', price: 5 },
    { name: 'أخضر تفاحي', body: '#57e36b', trim: '#fff3b0', glow: '#3ddc84', price: 7 },
    { name: 'بنفسجي ملكي', body: '#a855f7', trim: '#72efdd', glow: '#c77dff', price: 9 },
    { name: 'وردي حلوى', body: '#ff70a6', trim: '#ffffff', glow: '#ff5d9e', price: 11 }
  ];

  DK.TOPPERS = [
    { id: 'pencil', name: 'صاروخ القلم', price: 0 },
    { id: 'duck', name: 'بطة مطاطية', price: 4 },
    { id: 'crown', name: 'تاج ذهبي', price: 6 },
    { id: 'dino', name: 'عرف الديناصور', price: 8 },
    { id: 'wing', name: 'جناح النجمة', price: 10 },
    { id: 'monster', name: 'عجلات عملاقة', price: 12 }
  ];

  // Track coordinates: p = closed Catmull-Rom loop [[x, y, widthMul], ...] running clockwise.
  // Feature specs use fractional loop position u (0..1) and lateral offset share (-1..1 of hw):
  //   boosts:  [[u, offShare, lenPx, kind], ...]
  //   hazards: [[u, offShare, radius, kind], ...] ('glue' | 'paint' | 'butter')
  //   bumpers: [[u, offShare, radius, kind], ...] ('eraser' | 'tape' | 'juice' | 'coil')
  //   coins:   [[u, offShare], ...]
  //   boxes:   [[u, offShare], ...]
  //   portals: [[uIn, offIn, uOut, offOut, color], ...]
  //   magnets: [[u0, u1, side], ...]
  DK.TRACKS = [
    {
      id: '1-1', world: 0, name: 'حلقة الدفتر', w: 118,
      p: [[470, 178], [820, 178], [1085, 232], [1115, 410], [1045, 582], [770, 598], [520, 565], [240, 588], [165, 420], [205, 232]],
      boosts: [[0.14, 0, 88, 'ruler'], [0.62, 0, 88, 'ruler']],
      hazards: [[0.45, 0.48, 22, 'glue'], [0.84, -0.48, 22, 'glue']],
      bumpers: [[0.3, 0.62, 16, 'eraser'], [0.74, 0.62, 16, 'eraser']],
      coins: [[0.09, -0.25], [0.22, 0.25], [0.38, -0.2], [0.55, 0.2], [0.7, -0.25], [0.9, 0.15]],
      boxes: [[0.18, -0.32], [0.18, 0.32], [0.52, -0.3], [0.52, 0.3]]
    },
    {
      id: '1-2', world: 0, name: 'منعطف المسطرة', w: 112,
      p: [[420, 176], [855, 176], [1098, 228], [1115, 385], [915, 418], [855, 582], [555, 600], [235, 582], [165, 405], [200, 228]],
      boosts: [[0.12, 0, 92, 'ruler'], [0.68, -0.15, 86, 'ruler']],
      hazards: [[0.34, 0.46, 23, 'glue'], [0.58, 0.45, 22, 'glue'], [0.86, -0.45, 22, 'glue']],
      bumpers: [[0.24, -0.6, 16, 'eraser'], [0.47, 0.6, 16, 'eraser'], [0.78, 0.6, 16, 'eraser']],
      coins: [[0.08, 0.2], [0.2, -0.2], [0.41, -0.25], [0.53, -0.2], [0.72, 0.25], [0.92, 0]],
      boxes: [[0.16, -0.32], [0.16, 0.32], [0.5, 0], [0.82, 0.28]]
    },
    {
      id: '2-1', world: 1, name: 'قوس الألوان', w: 112,
      p: [[440, 176], [840, 176], [1095, 240], [1115, 440], [980, 598], [775, 585], [640, 445], [505, 585], [290, 598], [165, 440], [195, 240]],
      boosts: [[0.11, 0, 88, 'rainbow'], [0.42, -0.15, 84, 'rainbow'], [0.78, 0.15, 84, 'rainbow']],
      hazards: [[0.28, 0.46, 24, 'paint'], [0.62, -0.45, 23, 'paint']],
      bumpers: [[0.52, 0.62, 18, 'tape'], [0.9, -0.6, 18, 'tape']],
      coins: [[0.08, -0.2], [0.21, 0.25], [0.36, -0.25], [0.54, -0.25], [0.71, 0.25], [0.88, 0.2]],
      boxes: [[0.16, -0.32], [0.16, 0.32], [0.48, -0.28], [0.68, 0.28]]
    },
    {
      id: '2-2', world: 1, name: 'دوار الشريط', w: 108,
      p: [[340, 174], [640, 222], [940, 174], [1112, 268], [1112, 492], [940, 594], [640, 528], [340, 594], [168, 492], [168, 268]],
      boosts: [[0.09, -0.1, 86, 'rainbow'], [0.36, 0.15, 84, 'rainbow'], [0.69, -0.15, 84, 'rainbow']],
      hazards: [[0.23, 0.46, 23, 'paint'], [0.53, -0.46, 23, 'paint'], [0.84, 0.46, 23, 'paint']],
      bumpers: [[0.14, 0.62, 18, 'tape'], [0.44, -0.62, 18, 'tape'], [0.76, -0.62, 18, 'tape']],
      coins: [[0.07, 0], [0.19, -0.25], [0.32, 0.2], [0.49, 0.25], [0.64, -0.2], [0.89, -0.25]],
      boxes: [[0.15, -0.34], [0.27, 0.3], [0.58, -0.3], [0.58, 0.3], [0.93, 0]]
    },
    {
      id: '3-1', world: 2, name: 'ممر البسكويت', w: 108,
      p: [[420, 176], [760, 176], [1060, 206], [1118, 370], [1030, 566], [780, 598], [560, 490], [340, 598], [176, 510], [172, 310], [250, 196]],
      boosts: [[0.1, 0, 84, 'waffle'], [0.44, -0.15, 84, 'waffle'], [0.8, 0.1, 84, 'waffle']],
      hazards: [[0.28, 0.45, 24, 'butter'], [0.62, -0.45, 24, 'butter']],
      bumpers: [[0.36, -0.62, 16, 'juice'], [0.71, 0.62, 16, 'juice']],
      coins: [[0.08, 0.2], [0.19, -0.2], [0.39, 0.2], [0.54, -0.25], [0.68, -0.2], [0.9, 0.2]],
      boxes: [[0.15, -0.32], [0.15, 0.32], [0.5, 0.25], [0.76, -0.28]]
    },
    {
      id: '3-2', world: 2, name: 'تعرج العصير', w: 104,
      p: [[340, 176], [620, 176], [860, 252], [1085, 200], [1118, 390], [1048, 584], [780, 596], [560, 506], [330, 596], [168, 480], [176, 276]],
      boosts: [[0.09, 0, 84, 'waffle'], [0.38, -0.15, 82, 'waffle'], [0.72, 0.15, 82, 'waffle']],
      hazards: [[0.22, 0.46, 23, 'butter'], [0.52, -0.46, 23, 'butter'], [0.84, 0.46, 23, 'butter']],
      bumpers: [[0.3, -0.62, 16, 'juice'], [0.61, 0.62, 16, 'juice'], [0.92, -0.62, 16, 'juice']],
      coins: [[0.07, -0.2], [0.17, -0.25], [0.34, 0.25], [0.47, 0.25], [0.66, -0.25], [0.88, -0.2]],
      boxes: [[0.13, -0.3], [0.13, 0.3], [0.43, -0.28], [0.64, 0.28], [0.8, -0.28]]
    },
    {
      id: '4-1', world: 3, name: 'حلقة المغناطيس', w: 106,
      p: [[380, 176], [900, 176], [1108, 246], [1114, 464], [960, 598], [745, 580], [640, 418], [535, 580], [320, 598], [168, 464], [172, 246]],
      boosts: [[0.11, 0, 88, 'neon'], [0.78, -0.15, 84, 'neon']],
      hazards: [[0.32, 0.46, 22, 'paint']],
      bumpers: [[0.22, -0.62, 16, 'coil'], [0.88, 0.62, 16, 'coil']],
      magnets: [[0.24, 0.36, 1], [0.54, 0.64, -1]],
      portals: [[0.47, -0.46, 0.56, -0.35, '#3df0ff']],
      coins: [[0.08, -0.2], [0.18, 0.2], [0.29, -0.28], [0.59, 0.25], [0.72, -0.2], [0.92, 0]],
      boxes: [[0.15, -0.32], [0.15, 0.32], [0.41, 0.28], [0.68, -0.28], [0.84, 0.25]]
    },
    {
      id: '4-2', world: 3, name: 'بوابة النيون', w: 102,
      p: [[335, 174], [600, 220], [920, 174], [1112, 252], [1072, 420], [1112, 574], [860, 602], [620, 518], [360, 602], [172, 540], [216, 376], [168, 232]],
      boosts: [[0.08, 0, 84, 'neon'], [0.41, -0.15, 82, 'neon'], [0.74, 0.15, 82, 'neon']],
      hazards: [[0.28, 0.46, 22, 'butter'], [0.62, -0.46, 22, 'paint']],
      bumpers: [[0.19, -0.62, 16, 'coil'], [0.52, 0.62, 16, 'coil']],
      magnets: [[0.3, 0.4, 1], [0.82, 0.92, 1]],
      portals: [[0.14, 0.46, 0.22, 0.32, '#3df0ff'], [0.56, -0.46, 0.64, -0.32, '#c77dff']],
      coins: [[0.06, -0.2], [0.25, -0.25], [0.36, -0.28], [0.49, -0.25], [0.69, 0.25], [0.88, -0.28]],
      boxes: [[0.11, -0.3], [0.11, 0.3], [0.45, 0.28], [0.67, -0.28], [0.94, 0]]
    }
  ];

  /* --------------------------------------------------- closed spline & grid */
  function denseClosed(R) {
    var ps = R.p, n = ps.length, out = [];
    for (var i = 0; i < n; i++) {
      var p0 = ps[(i - 1 + n) % n], p1 = ps[i], p2 = ps[(i + 1) % n], p3 = ps[(i + 2) % n];
      var f1 = p1[2] || 1, f2 = p2[2] || 1;
      var k = Math.max(4, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 4));
      for (var j = 0; j < k; j++) {
        var t = j / k, t2 = t * t, t3 = t2 * t;
        var x = 0.5 * (2 * p1[0] + (p2[0] - p0[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (3 * p1[0] - p0[0] - 3 * p2[0] + p3[0]) * t3);
        var y = 0.5 * (2 * p1[1] + (p2[1] - p0[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * p3Zero(t2) + (3 * p1[1] - p0[1] - 3 * p2[1] + p3[1]) * t3);
        out.push([x, y, f1 + (f2 - f1) * t]);
      }
    }
    out.push([ps[0][0], ps[0][1], ps[0][2] || 1]);
    return out;
  }
  function p3Zero(v) { return v; }

  function resampleClosed(d) {
    var step = DK.STEP, pts = [{ x: d[0][0], y: d[0][1], f: d[0][2], s: 0 }];
    var px = d[0][0], py = d[0][1], pf = d[0][2], s = 0, need = step;
    for (var i = 1; i < d.length; i++) {
      var qx = d[i][0], qy = d[i][1], qf = d[i][2], l = Math.hypot(qx - px, qy - py);
      while (l >= need) {
        var t = need / l;
        px += (qx - px) * t; py += (qy - py) * t; pf += (qf - pf) * t;
        s += need; l -= need; need = step;
        pts.push({ x: px, y: py, f: pf, s: s });
      }
      need -= l; s += l; px = qx; py = qy; pf = qf;
    }
    var totalLen = s;
    // Drop the final sample if it sits almost on top of pts[0] so wrap-around segment has healthy length.
    while (pts.length > 4 && totalLen - pts[pts.length - 1].s < step * 0.45) pts.pop();
    return { pts: pts, len: totalLen };
  }

  DK.at = function (L, s) {
    var pts = L.pts, n = pts.length, len = L.len;
    s = wrapS(len, s);
    var i = Math.min(n - 1, Math.floor(s / DK.STEP));
    while (i > 0 && pts[i].s > s) i--;
    while (i < n - 1 && pts[i + 1].s <= s) i++;
    var a = pts[i], b = pts[(i + 1) % n];
    var bs = i + 1 < n ? b.s : len;
    var span = Math.max(1e-6, bs - a.s);
    var u = clamp((s - a.s) / span, 0, 1);
    var tx = b.x - a.x, ty = b.y - a.y, l = Math.hypot(tx, ty) || 1;
    tx /= l; ty /= l;
    return {
      x: a.x + (b.x - a.x) * u,
      y: a.y + (b.y - a.y) * u,
      tx: tx, ty: ty,
      nx: -ty, ny: tx,
      hw: a.hw + (b.hw - a.hw) * u,
      s: s
    };
  };

  function segProject(L, idx, x, y) {
    var sg = L.segs[idx], dx = sg.bx - sg.ax, dy = sg.by - sg.ay;
    var u = clamp(((x - sg.ax) * dx + (y - sg.ay) * dy) / sg.ll, 0, 1);
    var cx = sg.ax + dx * u, cy = sg.ay + dy * u;
    var ex = x - cx, ey = y - cy;
    return {
      idx: idx, u: u, x: cx, y: cy,
      tx: sg.tx, ty: sg.ty, nx: sg.nx, ny: sg.ny,
      hw: sg.hw0 + (sg.hw1 - sg.hw0) * u,
      s: wrapS(L.len, sg.s + sg.l * u),
      off: ex * sg.nx + ey * sg.ny,
      d2: ex * ex + ey * ey
    };
  }

  DK.project = function (L, x, y, hintS) {
    var segs = L.segs, n = segs.length, best = null;
    if (hintS != null) {
      var hs = wrapS(L.len, hintS), center = Math.floor(hs / DK.STEP) % n;
      var win = 26;
      for (var d = -win; d <= win; d++) {
        var j = (center + d + n) % n;
        var cand = segProject(L, j, x, y);
        if (!best || cand.d2 < best.d2) best = cand;
      }
      if (best && best.d2 <= Math.pow(best.hw + 72, 2)) return best;
    }
    best = null;
    for (var i = 0; i < n; i++) {
      var c = segProject(L, i, x, y);
      if (!best || c.d2 < best.d2) best = c;
    }
    return best;
  };

  DK.build = function (i, P, raw) {
    var R = raw || DK.TRACKS[i];
    P = P || DK.params(0.3);
    var sampled = resampleClosed(denseClosed(R));
    var pts = sampled.pts, n = pts.length, len = sampled.len, ws = P.roadWidth;
    var L = {
      i: i, R: R, P: P, world: R.world, pts: pts, len: len, segs: [],
      cps: [], boosts: [], hazards: [], bumpers: [], coins: [], boxes: [], portals: [], magnets: [], gridSlots: []
    };
    for (var k = 0; k < n; k++) {
      var p = pts[k], prev = pts[(k - 1 + n) % n], next = pts[(k + 1) % n];
      p.hw = R.w * 0.5 * p.f * ws;
      var tx = next.x - prev.x, ty = next.y - prev.y, l = Math.hypot(tx, ty) || 1;
      p.tx = tx / l; p.ty = ty / l; p.nx = -p.ty; p.ny = p.tx;
    }
    for (k = 0; k < n; k++) {
      var a = pts[k], b = pts[(k + 1) % n];
      var dx = b.x - a.x, dy = b.y - a.y, sl = Math.hypot(dx, dy) || 1e-6;
      var stx = dx / sl, sty = dy / sl;
      L.segs.push({
        ax: a.x, ay: a.y, bx: b.x, by: b.y,
        ll: dx * dx + dy * dy || 1e-6, l: sl, s: a.s,
        tx: stx, ty: sty, nx: -sty, ny: stx,
        hw0: a.hw, hw1: b.hw, hw: Math.min(a.hw, b.hw)
      });
    }

    function placeAt(u, offShare) {
      var s = wrapS(len, u * len), c = DK.at(L, s);
      var room = Math.max(8, c.hw - DK.KART_R - 4);
      var off = clamp(offShare || 0, -0.95, 0.95) * room;
      return { s: s, off: off, share: offShare || 0, x: c.x + c.nx * off, y: c.y + c.ny * off, tx: c.tx, ty: c.ty, nx: c.nx, ny: c.ny, hw: c.hw };
    }

    // 4 sector checkpoints around the closed circuit (0 = finish line, 1..3 = anti-cheat sectors).
    for (var ci = 0; ci < 4; ci++) {
      var cpS = (ci / 4) * len, cp = DK.at(L, cpS);
      L.cps.push({ idx: ci, s: cpS, x: cp.x, y: cp.y, tx: cp.tx, ty: cp.ty, nx: cp.nx, ny: cp.ny, hw: cp.hw });
    }

    (R.boosts || []).forEach(function (q) {
      var p0 = placeAt(q[0], q[1]);
      L.boosts.push({ s: p0.s, off: p0.off, len: q[2] || 84, w: 30, kind: q[3] || 'ruler', x: p0.x, y: p0.y, tx: p0.tx, ty: p0.ty, nx: p0.nx, ny: p0.ny });
    });
    (R.hazards || []).forEach(function (q) {
      var p0 = placeAt(q[0], q[1]);
      L.hazards.push({ s: p0.s, off: p0.off, r: q[2] || 22, kind: q[3] || 'glue', x: p0.x, y: p0.y });
    });
    (R.bumpers || []).forEach(function (q) {
      var c = DK.at(L, wrapS(len, q[0] * len));
      var off = (q[1] || 0) * (c.hw - 10);
      L.bumpers.push({ s: c.s, off: off, r: q[2] || 16, kind: q[3] || 'eraser', x: c.x + c.nx * off, y: c.y + c.ny * off, hitT: 0 });
    });
    (R.coins || []).forEach(function (q) {
      var p0 = placeAt(q[0], q[1]);
      L.coins.push({ s: p0.s, off: p0.off, x: p0.x, y: p0.y });
    });
    (R.boxes || []).forEach(function (q) {
      var p0 = placeAt(q[0], q[1]);
      L.boxes.push({ s: p0.s, off: p0.off, x: p0.x, y: p0.y });
    });
    (R.portals || []).forEach(function (q, pi) {
      var pIn = placeAt(q[0], q[1]), pOut = placeAt(q[2], q[3]);
      L.portals.push({
        id: pi, color: q[4] || '#3df0ff', r: 22,
        sIn: pIn.s, xIn: pIn.x, yIn: pIn.y,
        sOut: pOut.s, xOut: pOut.x, yOut: pOut.y, txOut: pOut.tx, tyOut: pOut.ty, offOut: pOut.off
      });
    });
    (R.magnets || []).forEach(function (q) {
      var s0 = wrapS(len, q[0] * len), s1 = wrapS(len, q[1] * len);
      var mid = DK.at(L, wrapS(len, ((q[0] + q[1]) * 0.5) * len));
      L.magnets.push({ s0: s0, s1: s1, side: q[2] || 1, x: mid.x + mid.nx * (q[2] || 1) * (mid.hw + 22), y: mid.y + mid.ny * (q[2] || 1) * (mid.hw + 22), ang: Math.atan2(-mid.ny * (q[2] || 1), -mid.nx * (q[2] || 1)) });
    });

    // 2x2 starting grid just ahead of s = 0 in sector 0 so human karts sit side-by-side in front.
    var slots = [[34, -0.36], [34, 0.36], [12, -0.36], [12, 0.36]];
    slots.forEach(function (sl) {
      var c = DK.at(L, sl[0]), off = sl[1] * (c.hw - DK.KART_R - 4);
      L.gridSlots.push({ s: sl[0], off: off, x: c.x + c.nx * off, y: c.y + c.ny * off, ang: Math.atan2(c.ty, c.tx) });
    });
    return L;
  };

  /* --------------------------------------------------- race creation & step */
  var BOT_PAINTS = [1, 2, 3, 4, 5];
  var BOT_TOPPERS = [1, 3, 4, 2];

  DK.create = function (trackIdx, opts) {
    opts = opts || {};
    var humans = opts.humans === 2 ? 2 : 1;
    var P = opts.params || DK.params(0.3);
    var L = DK.build(trackIdx, P);
    var rng = makeRng(opts.seed || (101 + trackIdx * 977));
    var p1Paint = opts.paint != null ? opts.paint : 0;
    var p1Topper = opts.topper != null ? opts.topper : 0;
    var p2Paint = opts.p2Paint != null ? opts.p2Paint : (p1Paint === 1 ? 3 : 1);
    var p2Topper = opts.p2Topper != null ? opts.p2Topper : (p1Topper === 2 ? 1 : 2);

    var usedPaints = [p1Paint];
    if (humans === 2) usedPaints.push(p2Paint);

    var karts = [];
    for (var i = 0; i < 4; i++) {
      var isHuman = i < humans;
      var slot = L.gridSlots[i];
      var paint = i === 0 ? p1Paint : (i === 1 && humans === 2) ? p2Paint : pickBotPaint(usedPaints, i);
      if (!isHuman) usedPaints.push(paint);
      var topper = i === 0 ? p1Topper : (i === 1 && humans === 2) ? p2Topper : BOT_TOPPERS[i % BOT_TOPPERS.length];
      karts.push({
        id: i,
        human: isHuman,
        playerNum: isHuman ? i + 1 : 0,
        critter: i,
        paint: paint,
        topper: topper,
        x: slot.x, y: slot.y, z: 0,
        ang: slot.ang,
        vx: 0, vy: 0, speed: 0,
        s: slot.s, off: slot.off,
        lap: 0, sector: 0,
        progress: slot.s,
        rank: i + 1,
        finished: false, finishTime: 0,
        dist: 0, gasTime: 0, inputs: 0, started: !isHuman,
        item: '', itemHoldT: 0,
        turboT: 0, padBoostT: 0, bubbleT: 0, hopT: 0, hopDur: 0.75,
        spinT: 0, spinA: 0, butterT: 0, glueIn: false, portalCd: 0, bumpCd: 0,
        driftT: 0, driftDir: 0, miniBoostT: 0,
        aiLane: (i % 2 ? 0.24 : -0.24) * (0.7 + rng() * 0.5),
        aiDelay: isHuman ? 0 : 0.22 + i * 0.08,
        aiSkill: 0.94 + (i === 3 ? -0.05 : i === 2 ? 0 : 0.04)
      });
    }

    return {
      L: L, P: P, humans: humans, rng: rng,
      t: 0, clock: 0, done: false, mercyT: 0,
      finishedCount: 0, winner: -1,
      karts: karts,
      coins: L.coins.map(function () { return false; }),
      coinsGot: 0,
      boxes: L.boxes.map(function () { return 0; }),
      bumpers: L.bumpers.map(function () { return 0; }),
      splats: [],
      ev: []
    };
  };

  function pickBotPaint(used, idx) {
    for (var k = 0; k < DK.PAINTS.length; k++) {
      var cand = (BOT_PAINTS[(idx + k) % BOT_PAINTS.length]) % DK.PAINTS.length;
      if (used.indexOf(cand) === -1) return cand;
    }
    return idx % DK.PAINTS.length;
  }

  function rollItem(w, kart) {
    var r = w.rng(), rank = kart.rank;
    if (rank === 1) return r < 0.38 ? 'bubble' : r < 0.72 ? 'spring' : r < 0.9 ? 'turbo' : 'splat';
    if (rank === 2) return r < 0.32 ? 'splat' : r < 0.62 ? 'turbo' : r < 0.82 ? 'spring' : 'bubble';
    return r < 0.44 ? 'turbo' : r < 0.78 ? 'splat' : r < 0.92 ? 'spring' : 'bubble';
  }

  DK.useItem = function (w, kartId) {
    var k = w.karts[kartId];
    if (!k || !k.item || w.done || k.finished) return false;
    var item = k.item;
    k.item = '';
    k.itemHoldT = 0;
    if (item === 'turbo') {
      k.turboT = 1.65;
      k.spinT = 0;
      k.speed = Math.max(k.speed, DK.TOP_SPEED * 1.25);
    } else if (item === 'bubble') {
      k.bubbleT = 6.0;
    } else if (item === 'spring') {
      k.hopDur = 0.75;
      k.hopT = 0.75;
      k.spinT = 0;
      k.speed = Math.max(k.speed, DK.TOP_SPEED * 0.95) + 75;
    } else if (item === 'splat') {
      spawnSplat(w, k);
    }
    w.ev.push({ t: 'item', kart: k.id, human: k.human, item: item, x: k.x, y: k.y });
    return true;
  };

  function spawnSplat(w, owner) {
    var L = w.L;
    var target = null, bestDelta = Infinity;
    for (var i = 0; i < w.karts.length; i++) {
      var other = w.karts[i];
      if (other.id === owner.id || other.finished) continue;
      if (!other.started) continue;
      var ds = wrapS(L.len, other.s - owner.s);
      if (ds > 15 && ds < L.len * 0.75 && ds < bestDelta) {
        bestDelta = ds;
        target = other.id;
      }
    }
    var c = DK.at(L, wrapS(L.len, owner.s + 26));
    w.splats.push({
      owner: owner.id,
      target: target != null ? target : -1,
      s: wrapS(L.len, owner.s + 26),
      off: clamp(owner.off, -c.hw * 0.6, c.hw * 0.6),
      x: owner.x + Math.cos(owner.ang) * 22,
      y: owner.y + Math.sin(owner.ang) * 22,
      speed: DK.TOP_SPEED * 1.58,
      life: 3.4
    });
  }

  function arcSpanContains(len, s0, s1, s) {
    if (s0 <= s1) return s >= s0 && s <= s1;
    return s >= s0 || s <= s1;
  }

  function aiInput(w, k, dt) {
    if (k.aiDelay > 0) {
      k.aiDelay = Math.max(0, k.aiDelay - dt);
      return { gas: 0, brake: 0, steer: 0, item: false, active: false };
    }
    var L = w.L, look = 92 + k.speed * 0.22;
    var targetS = wrapS(L.len, k.s + look);
    var wantOff = k.aiLane * (L.R.w * 0.35);

    // Dodge upcoming hazards, bumpers and unstarted human karts.
    for (var hi = 0; hi < L.hazards.length; hi++) {
      var hz = L.hazards[hi], ds = wrapS(L.len, hz.s - k.s);
      if (ds > 0 && ds < 175 && (Math.abs(wantOff - hz.off) < hz.r + DK.KART_R + 14 || Math.abs(k.off - hz.off) < hz.r + DK.KART_R + 10)) {
        wantOff = hz.off >= 0 ? -L.R.w * 0.32 : L.R.w * 0.32;
      }
    }
    for (var bi = 0; bi < L.bumpers.length; bi++) {
      var bm = L.bumpers[bi], dbs = wrapS(L.len, bm.s - k.s);
      if (dbs > 0 && dbs < 175) {
        wantOff = bm.off >= 0 ? -L.R.w * 0.34 : L.R.w * 0.34;
      }
    }
    for (var ki = 0; ki < w.karts.length; ki++) {
      var ok = w.karts[ki];
      if (ok.id !== k.id && !ok.started) {
        var dks = wrapS(L.len, ok.s - k.s);
        if (dks < 130 || dks > L.len - 40) {
          if (Math.abs(wantOff - ok.off) < DK.KART_R * 2.5) wantOff = ok.off >= 0 ? -L.R.w * 0.32 : L.R.w * 0.32;
        }
      }
    }

    var aim = DK.at(L, targetS);
    var maxOff = Math.max(10, aim.hw - DK.KART_R - 8);
    wantOff = clamp(wantOff, -maxOff, maxOff);
    var tx = aim.x + aim.nx * wantOff, ty = aim.y + aim.ny * wantOff;
    var diff = wrapAngle(Math.atan2(ty - k.y, tx - k.x) - k.ang);
    var steer = clamp(diff / 0.52, -1, 1);
    var gas = Math.abs(diff) > 1.15 ? 0.65 : 1;

    var useIt = false;
    if (k.item) {
      k.itemHoldT += dt;
      if (k.itemHoldT > 0.95) useIt = true;
    }
    return { gas: gas, brake: 0, steer: steer, item: useIt, active: true };
  }

  function botSpeedFactor(w, k) {
    var P = w.P, base = P.botSpeed * k.aiSkill;
    // Measure distance against leading human kart for gentle kid-friendly rubber-banding.
    var humanBest = -Infinity;
    for (var i = 0; i < w.humans; i++) {
      if (w.karts[i].progress > humanBest) humanBest = w.karts[i].progress;
    }
    if (!Number.isFinite(humanBest)) return base;
    var lead = (k.progress - humanBest) / w.L.len; // positive when bot is ahead of player
    if (lead > 0.08) return Math.max(0.55, base - Math.min(1, lead * 1.6) * P.mercy);
    if (lead < -0.15) return Math.min(1.06, base + Math.min(1, (-lead - 0.15) * 1.4) * P.catchup);
    return base;
  }

  DK.step = function (w, dt, inputs) {
    inputs = inputs || [];
    var L = w.L, P = w.P;
    w.t += dt;
    if (w.done) return;
    var humanStarted = false;
    for (var hi = 0; hi < w.humans; hi++) {
      var rawH = inputs[hi] || {};
      if (w.karts[hi].started || rawH.active || rawH.gas > 0 || rawH.brake > 0 || Math.abs(+rawH.steer || 0) > 0.02 || rawH.item) {
        humanStarted = true;
        break;
      }
    }
    if (humanStarted) w.clock += dt;

    // Decay box respawn & bumper wobble timers.
    for (var bx = 0; bx < w.boxes.length; bx++) if (w.boxes[bx] > 0) w.boxes[bx] = Math.max(0, w.boxes[bx] - dt);
    for (var bm = 0; bm < w.bumpers.length; bm++) if (w.bumpers[bm] > 0) w.bumpers[bm] = Math.max(0, w.bumpers[bm] - dt * 3);

    // Step each kart.
    for (var i = 0; i < w.karts.length; i++) {
      var k = w.karts[i];
      var inp;
      if (k.finished) {
        // Victorious cruise lap at gentle speed.
        inp = aiInput(w, k, dt);
        inp.gas = 0.55; inp.item = false;
      } else if (k.human) {
        var raw = inputs[k.id] || {};
        var gas = clamp(+raw.gas || 0, 0, 1);
        var brake = clamp(+raw.brake || 0, 0, 1);
        var steer = clamp(+raw.steer || 0, -1, 1);
        var item = !!raw.item;
        var active = !!(raw.active || gas > 0 || brake > 0 || Math.abs(steer) > 0.02 || item);
        if (active) {
          k.started = true;
          k.inputs++;
          if (gas > 0 || brake > 0 || Math.abs(steer) > 0.02) k.gasTime += dt;
        }
        inp = { gas: gas, brake: brake, steer: steer, item: item, active: active };
      } else {
        inp = aiInput(w, k, dt);
      }

      if (inp.item && k.item && !k.finished) DK.useItem(w, k.id);

      // Timers on kart.
      if (k.turboT > 0) k.turboT = Math.max(0, k.turboT - dt);
      if (k.padBoostT > 0) k.padBoostT = Math.max(0, k.padBoostT - dt);
      if (k.bubbleT > 0) k.bubbleT = Math.max(0, k.bubbleT - dt);
      if (k.butterT > 0) k.butterT = Math.max(0, k.butterT - dt);
      if (k.portalCd > 0) k.portalCd = Math.max(0, k.portalCd - dt);
      if (k.bumpCd > 0) k.bumpCd = Math.max(0, k.bumpCd - dt);
      if (k.miniBoostT > 0) k.miniBoostT = Math.max(0, k.miniBoostT - dt);
      if (k.hopT > 0) {
        k.hopT = Math.max(0, k.hopT - dt);
        var hk = 1 - k.hopT / k.hopDur;
        k.z = Math.sin(hk * Math.PI) * 28;
        if (k.hopT === 0) {
          k.z = 0;
          w.ev.push({ t: 'land', kart: k.id, human: k.human, x: k.x, y: k.y });
        }
      } else k.z = 0;

      if (!k.started) continue;

      if (k.spinT > 0) {
        k.spinT = Math.max(0, k.spinT - dt);
        k.spinA += dt * 11;
        k.speed *= Math.max(0, 1 - dt * 4.2);
      } else {
        k.spinA = 0;
      }

      // Top speed & surface modifiers.
      var baseTop = DK.TOP_SPEED * (k.human ? 1 : botSpeedFactor(w, k));
      var top = baseTop;
      if (k.turboT > 0) top *= 1.38;
      else if (k.padBoostT > 0) top *= 1.28;
      else if (k.miniBoostT > 0) top *= 1.15;

      var hazardSlow = 1;
      var inGlue = false;
      if (k.z <= 2 && k.turboT <= 0 && k.bubbleT <= 0) {
        for (var hzIdx = 0; hzIdx < L.hazards.length; hzIdx++) {
          var hz = L.hazards[hzIdx];
          var hdx = k.x - hz.x, hdy = k.y - hz.y;
          if (hdx * hdx + hdy * hdy <= Math.pow(hz.r + DK.KART_R * 0.65, 2)) {
            if (hz.kind === 'glue') { hazardSlow = Math.min(hazardSlow, 0.46); inGlue = true; }
            else if (hz.kind === 'paint') { hazardSlow = Math.min(hazardSlow, 0.62); inGlue = true; }
            else if (hz.kind === 'butter') {
              if (k.butterT <= 0.05) w.ev.push({ t: 'hazard', kind: 'butter', kart: k.id, human: k.human, x: k.x, y: k.y });
              k.butterT = 0.65;
            }
          }
        }
      }
      if (inGlue && !k.glueIn) {
        w.ev.push({ t: 'hazard', kind: 'glue', kart: k.id, human: k.human, x: k.x, y: k.y });
      }
      k.glueIn = inGlue;
      top *= hazardSlow;

      // Forward speed integration.
      if (k.spinT <= 0) {
        if (inp.gas > 0) {
          var acc = DK.ACCEL * (k.turboT > 0 || k.padBoostT > 0 ? 1.55 : 1);
          if (k.speed < top) k.speed = Math.min(top, k.speed + acc * inp.gas * dt);
          else k.speed = Math.max(top, k.speed - DK.DRAG * 1.8 * dt);
        } else if (inp.brake > 0) {
          k.speed -= (k.speed > 0 ? DK.BRAKE : DK.ACCEL * 0.55) * inp.brake * dt;
        } else {
          if (Math.abs(k.speed) < DK.DRAG * dt) k.speed = 0;
          else k.speed -= Math.sign(k.speed) * DK.DRAG * dt;
        }
        if (k.speed > top) k.speed = Math.max(top, k.speed - DK.DRAG * 1.8 * dt);
        if (k.speed < -115) k.speed = -115;

        // Steering & drift mini-boost.
        var steerAuth = Math.abs(k.speed) > 8 || inp.gas > 0 || inp.brake > 0 ? clamp(0.38 + Math.abs(k.speed) / 240, 0.38, 1.08) : 0;
        var revFlip = k.speed < -10 ? -1 : 1;
        if (k.butterT > 0) steerAuth *= 1.22;
        k.ang = wrapAngle(k.ang + inp.steer * DK.TURN * steerAuth * revFlip * dt);

        if (Math.abs(inp.steer) > 0.55 && k.speed > 175 && k.z <= 1) {
          var sd = inp.steer > 0 ? 1 : -1;
          if (k.driftDir === sd) k.driftT += dt;
          else { k.driftDir = sd; k.driftT = dt; }
        } else {
          if (k.driftT >= 0.55 && k.speed > 160) {
            k.miniBoostT = 0.4;
            k.speed = Math.min(baseTop * 1.2, k.speed + 38);
            w.ev.push({ t: 'driftBoost', kart: k.id, human: k.human, x: k.x, y: k.y });
          }
          k.driftT = 0; k.driftDir = 0;
        }
      }

      // Blend velocity vector with heading for smooth drifting / butter slides.
      var wantVx = Math.cos(k.ang) * k.speed, wantVy = Math.sin(k.ang) * k.speed;
      var grip = k.butterT > 0 ? 2.6 : (Math.abs(inp.steer) > 0.6 ? 6.8 : 10.5);
      var blend = Math.min(1, grip * dt);
      k.vx += (wantVx - k.vx) * blend;
      k.vy += (wantVy - k.vy) * blend;

      // Science Lab magnets gently pull karts toward the inside apex of the curve.
      for (var mi = 0; mi < L.magnets.length; mi++) {
        var mg = L.magnets[mi];
        if (arcSpanContains(L.len, mg.s0, mg.s1, k.s)) {
          var mc = DK.at(L, k.s);
          var pullOff = mg.side * mc.hw * 0.42 - k.off;
          k.vx += mc.nx * clamp(pullOff, -24, 24) * 5.2 * dt;
          k.vy += mc.ny * clamp(pullOff, -24, 24) * 5.2 * dt;
        }
      }

      var prevX = k.x, prevY = k.y, prevS = k.s;
      k.x += k.vx * dt;
      k.y += k.vy * dt;

      // Project onto track and apply gentle forgiving desk border guide.
      var pr = DK.project(L, k.x, k.y, prevS);
      var maxOff = pr.hw - DK.KART_R;
      if (Math.abs(pr.off) > maxOff) {
        var sign = pr.off >= 0 ? 1 : -1;
        k.x = pr.x + pr.nx * sign * maxOff;
        k.y = pr.y + pr.ny * sign * maxOff;
        pr.off = sign * maxOff;
        var vn = k.vx * pr.nx + k.vy * pr.ny;
        if (vn * sign > 0) {
          k.vx -= pr.nx * vn * 1.25;
          k.vy -= pr.ny * vn * 1.25;
        }
        var vt = k.vx * pr.tx + k.vy * pr.ty;
        k.speed *= 1 - (1 - P.wallKeep) * Math.min(1, dt * 8);
        if (vt >= 0) {
          var wallAng = Math.atan2(pr.ty, pr.tx);
          k.ang = wrapAngle(k.ang + wrapAngle(wallAng - k.ang) * Math.min(1, dt * 7));
        }
        if (k.bumpCd <= 0 && Math.abs(vn) > 65) {
          k.bumpCd = 0.25;
          w.ev.push({ t: 'wall', kart: k.id, human: k.human, x: k.x, y: k.y });
        }
      }

      // Bouncy tabletop bumpers (pink erasers, tape rolls, juice boxes, plasma coils).
      if (k.z <= 4) {
        for (var bIdx = 0; bIdx < L.bumpers.length; bIdx++) {
          var bmp = L.bumpers[bIdx];
          var bdx = k.x - bmp.x, bdy = k.y - bmp.y, br = bmp.r + DK.KART_R;
          var bd2 = bdx * bdx + bdy * bdy;
          if (bd2 < br * br) {
            var bd = Math.sqrt(bd2) || 1, bnx = bdx / bd, bny = bdy / bd;
            k.x = bmp.x + bnx * (br + 2);
            k.y = bmp.y + bny * (br + 2);
            var inward = bmp.off >= 0 ? -1 : 1;
            var bPush = Math.max(150, Math.abs(k.speed) * 0.72);
            k.vx = (bnx * 0.55 + pr.nx * inward * 0.65) * bPush + pr.tx * 95;
            k.vy = (bny * 0.55 + pr.ny * inward * 0.65) * bPush + pr.ty * 95;
            k.speed = Math.max(105, k.speed * 0.78);
            var bounceAng = Math.atan2(k.vy, k.vx);
            k.ang = wrapAngle(k.ang + wrapAngle(bounceAng - k.ang) * 0.45);
            w.bumpers[bIdx] = 1;
            if (k.bumpCd <= 0) {
              k.bumpCd = 0.22;
              w.ev.push({ t: 'bumper', kind: bmp.kind, kart: k.id, human: k.human, x: bmp.x, y: bmp.y });
            }
            pr = DK.project(L, k.x, k.y, pr.s);
          }
        }
      }

      // Boost strips & waffle ramps.
      if (k.z <= 6) {
        for (var bo = 0; bo < L.boosts.length; bo++) {
          var bst = L.boosts[bo];
          var rx = k.x - bst.x, ry = k.y - bst.y;
          var along = rx * bst.tx + ry * bst.ty, across = rx * bst.nx + ry * bst.ny;
          if (Math.abs(along) <= bst.len * 0.5 && Math.abs(across) <= bst.w * 0.5 + DK.KART_R * 0.5) {
            if (k.padBoostT <= 0.25) {
              w.ev.push({ t: 'boost', kind: bst.kind, kart: k.id, human: k.human, x: k.x, y: k.y });
              if (bst.kind === 'waffle' && k.hopT <= 0) { k.hopDur = 0.42; k.hopT = 0.42; }
            }
            k.padBoostT = 0.7;
            k.speed = Math.max(k.speed, baseTop * 1.24);
          }
        }
      }

      // Science Lab glowing warp portals.
      if (k.portalCd <= 0 && k.z <= 8) {
        for (var pi = 0; pi < L.portals.length; pi++) {
          var po = L.portals[pi];
          var pdx = k.x - po.xIn, pdy = k.y - po.yIn;
          if (pdx * pdx + pdy * pdy <= Math.pow(po.r + DK.KART_R * 0.6, 2)) {
            k.x = po.xOut; k.y = po.yOut;
            k.ang = Math.atan2(po.tyOut, po.txOut);
            k.speed = Math.max(k.speed, DK.TOP_SPEED * 1.15);
            k.vx = po.txOut * k.speed; k.vy = po.tyOut * k.speed;
            k.portalCd = 1.6;
            advanceSectors(w, k, pr.s, po.sOut);
            pr = DK.project(L, k.x, k.y, po.sOut);
            w.ev.push({ t: 'portal', kart: k.id, human: k.human, x: po.xOut, y: po.yOut, color: po.color });
            break;
          }
        }
      }

      // Track coins (collected by human karts).
      if (k.human && !k.finished) {
        for (var ci = 0; ci < L.coins.length; ci++) {
          if (!w.coins[ci]) {
            var cn = L.coins[ci], cdx = k.x - cn.x, cdy = k.y - cn.y;
            if (cdx * cdx + cdy * cdy <= DK.COIN_R * DK.COIN_R) {
              w.coins[ci] = true;
              w.coinsGot++;
              w.ev.push({ t: 'coin', kart: k.id, human: true, i: ci, x: cn.x, y: cn.y });
            }
          }
        }
      }

      // Rainbow gift boxes.
      if (!k.finished) {
        for (var gbi = 0; gbi < L.boxes.length; gbi++) {
          if (w.boxes[gbi] <= 0) {
            var gb = L.boxes[gbi], gdx = k.x - gb.x, gdy = k.y - gb.y;
            if (gdx * gdx + gdy * gdy <= DK.BOX_R * DK.BOX_R) {
              w.boxes[gbi] = 4.2;
              if (!k.item) {
                k.item = rollItem(w, k);
                k.itemHoldT = 0;
              }
              w.ev.push({ t: 'pickup', kart: k.id, human: k.human, item: k.item, x: gb.x, y: gb.y });
            }
          }
        }
      }

      var stepMove = Math.hypot(k.x - prevX, k.y - prevY);
      if (!k.finished) k.dist += stepMove;
      advanceSectors(w, k, prevS, pr.s);
      k.s = pr.s; k.off = pr.off;
    }

    // Kart-vs-kart gentle collisions (skipped during initial 2s launch grace, airborne hops, or unstarted humans).
    if (w.clock > 2.0) {
      for (var a = 0; a < w.karts.length; a++) {
        for (var b = a + 1; b < w.karts.length; b++) {
          var ka = w.karts[a], kb = w.karts[b];
          if (!ka.started || !kb.started) continue;
          if (ka.z > 10 || kb.z > 10) continue;
          var dx = kb.x - ka.x, dy = kb.y - ka.y, minD = DK.KART_R * 2;
          var d2 = dx * dx + dy * dy;
          if (d2 > 0 && d2 < minD * minD) {
            var d = Math.sqrt(d2), nx = dx / d, ny = dy / d, overlap = (minD - d) * 0.5;
            ka.x -= nx * overlap; ka.y -= ny * overlap;
            kb.x += nx * overlap; kb.y += ny * overlap;
            var push = (ka.bubbleT > 0 || kb.bubbleT > 0) ? 130 : 75;
            ka.vx -= nx * push; ka.vy -= ny * push;
            kb.vx += nx * push; kb.vy += ny * push;
          }
        }
      }
    }

    // Step homing paint-confetti rockets (splats).
    for (var si = w.splats.length - 1; si >= 0; si--) {
      var sp = w.splats[si];
      sp.life -= dt;
      if (sp.life <= 0) { w.splats.splice(si, 1); continue; }
      var tgt = sp.target >= 0 ? w.karts[sp.target] : null;
      if (tgt && !tgt.finished && tgt.started) {
        var tds = wrapS(L.len, tgt.s - sp.s);
        if (tds < 220) {
          sp.off += (tgt.off - sp.off) * Math.min(1, dt * 8);
        } else {
          sp.off *= Math.max(0, 1 - dt * 4);
        }
      } else {
        sp.off *= Math.max(0, 1 - dt * 4);
      }
      sp.s = wrapS(L.len, sp.s + sp.speed * dt);
      var sc = DK.at(L, sp.s);
      sp.x = sc.x + sc.nx * sp.off;
      sp.y = sc.y + sc.ny * sp.off;

      var hitKart = null;
      for (var hkIdx = 0; hkIdx < w.karts.length; hkIdx++) {
        var candK = w.karts[hkIdx];
        if (candK.id === sp.owner || candK.finished || !candK.started || candK.z > 10) continue;
        var sdx = candK.x - sp.x, sdy = candK.y - sp.y;
        if (sdx * sdx + sdy * sdy <= Math.pow(DK.KART_R + 14, 2)) { hitKart = candK; break; }
      }
      if (hitKart) {
        w.splats.splice(si, 1);
        if (hitKart.bubbleT > 0) {
          hitKart.bubbleT = 0;
          w.ev.push({ t: 'shieldPop', kart: hitKart.id, human: hitKart.human, x: hitKart.x, y: hitKart.y });
        } else {
          hitKart.spinT = 0.72;
          hitKart.speed *= 0.35;
          w.ev.push({ t: 'splat', from: sp.owner, kart: hitKart.id, human: hitKart.human, x: hitKart.x, y: hitKart.y });
        }
      }
    }

    // Update progress & live standings.
    updateStandings(w);

    // Check race end conditions.
    if (w.humans === 1) {
      if (w.karts[0].finished) finishRace(w);
    } else {
      var h0 = w.karts[0].finished, h1 = w.karts[1].finished;
      if (h0 && h1) finishRace(w);
      else if (h0 || h1) {
        w.mercyT += dt;
        if (w.mercyT >= 6.0) finishRace(w);
      }
    }
  };

  function advanceSectors(w, k, prevS, newS) {
    if (k.finished) return;
    var len = w.L.len;
    var sec = Math.min(3, Math.floor((newS / len) * 4));
    if (sec === k.sector + 1) {
      k.sector = sec;
    } else if (sec === k.sector + 2 && newS > prevS) {
      // Allow portals or very fast frames across a boundary when strictly forward.
      k.sector = sec;
    }
    // Crossing finish line forward (wrapping from sector 3 near end of loop to start of loop).
    if (prevS > len * 0.78 && newS < len * 0.25 && k.sector === 3) {
      k.lap++;
      k.sector = 0;
      if (k.lap >= DK.LAPS) {
        k.finished = true;
        k.finishTime = w.clock || w.t;
        k.rank = ++w.finishedCount;
        if (w.winner < 0) w.winner = k.id;
        w.ev.push({ t: 'finish', kart: k.id, human: k.human, rank: k.rank, time: k.finishTime });
      } else {
        w.ev.push({ t: 'lap', kart: k.id, human: k.human, lap: k.lap });
      }
    }
  }

  function updateStandings(w) {
    var len = w.L.len;
    for (var i = 0; i < w.karts.length; i++) {
      var k = w.karts[i];
      if (k.finished) {
        k.progress = DK.LAPS * len + (1000 - k.rank * 10);
      } else {
        // Prevent reversed karts behind the start line from appearing at s ~ len on current lap.
        var lapS = (k.sector === 0 && k.s > len * 0.75) ? k.s - len : Math.min(k.s, (k.sector + 1) * len * 0.25 + 40);
        k.progress = k.lap * len + lapS;
      }
    }
    var order = w.karts.slice().sort(function (a, b) {
      if (a.finished && b.finished) return a.rank - b.rank;
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      return b.progress - a.progress;
    });
    for (var r = 0; r < order.length; r++) {
      if (!order[r].finished) order[r].rank = r + 1;
    }
  }

  function finishRace(w) {
    if (w.done) return;
    updateStandings(w);
    w.done = true;
    for (var i = 0; i < w.karts.length; i++) {
      if (!w.karts[i].finished) w.karts[i].finishTime = w.clock || w.t;
    }
    if (w.winner < 0) {
      for (i = 0; i < w.karts.length; i++) if (w.karts[i].rank === 1) w.winner = w.karts[i].id;
    }
    w.ev.push({ t: 'raceEnd', winner: w.winner });
  }

  /* --------------------------------------------------- stars, DDA & saves */
  DK.starsForRank = function (rank) {
    return rank === 1 ? 3 : rank === 2 ? 2 : rank === 3 ? 1 : 0;
  };

  DK.outcome = function (rank, finished) {
    if (!finished) return 0.2;
    if (rank === 1) return 1;
    if (rank === 2) return 0.72;
    if (rank === 3) return 0.4;
    return 0.1;
  };

  DK.freshSave = function () {
    return {
      v: 1,
      tracks: DK.TRACKS.map(function () { return { s: 0, t: 0, c: 0 }; }),
      coins: 0,
      paints: DK.PAINTS.map(function (c, i) { return i ? 0 : 1; }),
      toppers: DK.TOPPERS.map(function (c, i) { return i ? 0 : 1; }),
      paint: 0,
      topper: 0
    };
  };

  function isInt(v, lo, hi) { return typeof v === 'number' && Math.floor(v) === v && v >= lo && v <= hi; }
  function asObj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : null; }

  DK.loadSave = function (raw) {
    var s = DK.freshSave(), r = asObj(raw);
    if (!r || r.v !== 1) return s;
    var tr = Array.isArray(r.tracks) ? r.tracks : [];
    s.tracks.forEach(function (e, i) {
      var o = asObj(tr[i]);
      if (!o) return;
      e.s = isInt(o.s, 0, 3) ? o.s : 0;
      e.t = e.s && isInt(o.t, 1, 36000) ? o.t : 0;
      var maxMask = (1 << (DK.TRACKS[i].coins || []).length) - 1;
      e.c = isInt(o.c, 0, 255) ? (o.c & maxMask) : 0;
    });
    s.coins = isInt(r.coins, 0, 99999) ? r.coins : 0;
    ['paints', 'toppers'].forEach(function (k) {
      var a = Array.isArray(r[k]) ? r[k] : [];
      s[k] = s[k].map(function (v, i) { return i === 0 || a[i] === 1 ? 1 : 0; });
    });
    s.paint = isInt(r.paint, 0, DK.PAINTS.length - 1) && s.paints[r.paint] ? r.paint : 0;
    s.topper = isInt(r.topper, 0, DK.TOPPERS.length - 1) && s.toppers[r.topper] ? r.topper : 0;
    return s;
  };

  DK.isOpen = function (s, i) {
    return i === 0 || (i > 0 && i < DK.TRACKS.length && s.tracks[i - 1].s > 0);
  };

  DK.totalStars = function (s) {
    var n = 0;
    s.tracks.forEach(function (e) { n += e.s; });
    return n;
  };

  DK.nextTrack = function (s) {
    var top = 0;
    for (var i = 0; i < DK.TRACKS.length; i++) {
      if (!DK.isOpen(s, i)) break;
      top = i;
      if (!s.tracks[i].s) return i;
    }
    return top;
  };

  function popcount(m) { var n = 0; while (m) { n += m & 1; m >>= 1; } return n; }

  DK.applyResult = function (s, i, rank, time, coinFlags) {
    var e = s.tracks[i], stars = DK.starsForRank(rank);
    var out = { first: !e.s && stars > 0, best: false, stars: stars, moreStars: stars > e.s, coins: 0, opened: -1, world: -1 };
    var tenths = clamp(Math.ceil(time * 10), 1, 36000), mask = 0;
    (coinFlags || []).forEach(function (g, k) { if (g) mask |= (1 << k); });
    var newTrackCoins = popcount(mask & ~e.c);
    var newStarCoins = Math.max(0, stars - e.s) * DK.STAR_COINS;
    var podiumBonus = stars > 0 && !newStarCoins && !newTrackCoins ? 1 : 0;
    out.coins = newTrackCoins + newStarCoins + podiumBonus;
    e.c |= mask;
    if (stars > 0) {
      out.best = !!e.s && (stars > e.s || tenths < e.t);
      if (stars > e.s) e.s = stars;
      if (!e.t || tenths < e.t) e.t = tenths;
    }
    s.coins = Math.min(99999, s.coins + out.coins);
    if (out.first && i + 1 < DK.TRACKS.length) {
      out.opened = i + 1;
      if ((i + 1) % 2 === 0) out.world = (i + 1) / 2;
    }
    return out;
  };

  DK.buy = function (s, kind, k) {
    var list = kind === 'topper' ? DK.TOPPERS : DK.PAINTS;
    var own = kind === 'topper' ? s.toppers : s.paints;
    var key = kind === 'topper' ? 'topper' : 'paint';
    if (!list[k]) return '';
    if (own[k]) { s[key] = k; return 'wear'; }
    if (s.coins < list[k].price) return '';
    s.coins -= list[k].price;
    own[k] = 1;
    s[key] = k;
    return 'bought';
  };

  if (root) root.DK = DK;
  if (typeof module === 'object' && module.exports) module.exports = DK;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this);
