/* سباق المكاتب — Pure Micro-Machines Kart Simulation Engine (Node + Browser UMD) */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DKEngine = factory();
})(typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VIEW_W = 1280, VIEW_H = 720, WORLD_W = 2800, WORLD_H = 2000;
  var KART_W = 54, KART_H = 38, KART_R = 21;
  var LAPS = 3, TOP_SPEED = 470, STAR_COINS = 3, TAU = Math.PI * 2;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function wrapS(len, s) { s = s % len; return s < 0 ? s + len : s; }
  function wrapAngle(a) { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; }
  function makeRng(seed) {
    var s = (seed >>> 0) || 0x9e3779b9;
    return function () {
      s = (s + 0x6d2b79f5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var CUPS = [
    { id: 0, name: 'مكتب الرسم', sub: 'أقلام شمع وممحاة عملاقة وقفزات المساطر', bg: '#e7b97a', grid: '#d6a463', road: '#3a3f58', curbA: '#ff5964', curbB: '#ffffff' },
    { id: 1, name: 'مختبر العلوم', sub: 'مغناطيس التسارع ودوارق فوارة وملفات تسلا', bg: '#1e5062', grid: '#173f4e', road: '#2b3648', curbA: '#38bdf8', curbB: '#bef264' },
    { id: 2, name: 'ورشة الحاسوب', sub: 'مفاتيح مضيئة ترتد وجسور كابلات ومراوح تبريد', bg: '#192036', grid: '#242e4c', road: '#272c44', curbA: '#00e5ff', curbB: '#ff4ecd' },
    { id: 3, name: 'كأس الفسحة الكبرى', sub: 'صناديق البيتزا والعصير وتحدي الدباسة العضاضة', bg: '#c94b3b', grid: '#b33d2e', road: '#3d3347', curbA: '#ffd23f', curbB: '#ffffff' }
  ];

  var ITEMS = [
    { id: 'ink_rocket', name: 'صاروخ الحبر' },
    { id: 'eraser_turbo', name: 'تيربو الممحاة' },
    { id: 'clip_magnet', name: 'مغناطيس المشابك' },
    { id: 'glue_trap', name: 'بقعة الصمغ' },
    { id: 'ruler_jump', name: 'قفزة المسطرة' }
  ];

  var RIVALS = [
    { name: 'بطل التيربو', body: '#2ec4ff', trim: '#ffd23f', style: 1 },
    { name: 'قرش الحبر', body: '#9b5de5', trim: '#00f5d4', style: 2 },
    { name: 'آلي المسطرة', body: '#ff9f1c', trim: '#ffffff', style: 3 }
  ];

  var KARTS = [
    { id: 0, name: 'البرق الأحمر', price: 0, body: '#ff4757', trim: '#ffd23f', cockpit: '#2f3542' },
    { id: 1, name: 'سيارة الممحاة النفاثة', price: 10, body: '#ff6b9d', trim: '#48dbfb', cockpit: '#1e272e' },
    { id: 2, name: 'شاحنة الدباسة', price: 16, body: '#5352ed', trim: '#dfe4ea', cockpit: '#1e272e' },
    { id: 3, name: 'مركبة الفضاء الورقية', price: 22, body: '#ffffff', trim: '#1e90ff', cockpit: '#0a3d62' },
    { id: 4, name: 'الوحش الذهبي', price: 30, body: '#ffcc00', trim: '#ff3838', cockpit: '#2c2c54' }
  ];

  var FLAMES = [
    { id: 0, name: 'لهب برتقالي', price: 0, c0: '#ff7b00', c1: '#ffd23f' },
    { id: 1, name: 'برق أزرق', price: 8, c0: '#00b4d8', c1: '#caf0f8' },
    { id: 2, name: 'نيون زمردي', price: 12, c0: '#10b981', c1: '#d9f99d' },
    { id: 3, name: 'شعاع بنفسجي', price: 16, c0: '#a855f7', c1: '#f5d0fe' },
    { id: 4, name: 'وهج شمسي', price: 22, c0: '#ff2e63', c1: '#ffee32' }
  ];

  var DIFFS = {
    easy: { key: 'easy', name: 'سهل', desc: 'حواجز أقلام ناعمة · توجيه ذكي مع انطلاق تلقائي · منافسة ودودة!', autoGas: true, steerAssist: 0.52, roadScale: 1.1, openEdges: false, botBase: 0.77, botSpan: 0.07, mercy: 0.24, botAggro: 0.25, coinMult: 1 },
    normal: { key: 'normal', name: 'متوسط', desc: 'سباق 3 دورات حماسي · معارك صناديق المفاجآت · اختصارات المساطر!', autoGas: false, steerAssist: 0.14, roadScale: 1.0, openEdges: false, botBase: 0.87, botSpan: 0.08, mercy: 0.14, botAggro: 0.55, coinMult: 1 },
    hero: { key: 'hero', name: 'بطل', desc: 'خصوم شرسون · حواف مكتب مفتوحة للقفز · مكافأة عملات إضافية!', autoGas: false, steerAssist: 0, roadScale: 0.95, openEdges: true, botBase: 0.95, botSpan: 0.08, mercy: 0.06, botAggro: 0.88, coinMult: 1.5 }
  };

  var TRACKS = [
    { id: '1-1', cup: 0, world: 0, name: 'حلبة الألوان', w: 265, ctrl: [[860, 1520], [1720, 1520], [2340, 1340], [2360, 720], [1800, 380], [980, 380], [420, 720], [440, 1340]], ramps: [[0.10, 0], [0.56, 0]], pads: [[0.28, -45], [0.76, 45], [0.90, 0]], hazards: [[0.42, 52, 'paint'], [0.82, -52, 'paint']], bumpers: [[0.66, 0, 'eraser']] },
    { id: '1-2', cup: 0, world: 0, name: 'جسر المساطر', w: 255, ctrl: [[820, 1560], [1680, 1560], [2360, 1380], [2380, 780], [1880, 380], [1400, 760], [920, 380], [400, 740], [420, 1380]], ramps: [[0.12, 0], [0.49, 0], [0.78, 0]], pads: [[0.30, 50], [0.64, -50], [0.92, 0]], hazards: [[0.24, -55, 'paint'], [0.50, 0, 'paint'], [0.85, 55, 'paint']], bumpers: [[0.38, 45, 'eraser'], [0.70, -45, 'eraser']] },
    { id: '1-3', cup: 0, world: 0, name: 'قلعة الممحاة', w: 248, ctrl: [[800, 1560], [1600, 1560], [2180, 1280], [2400, 780], [1980, 380], [1420, 620], [920, 360], [420, 620], [560, 1100], [400, 1440]], ramps: [[0.11, -30], [0.46, 0], [0.80, 30]], pads: [[0.26, 45], [0.58, -45], [0.72, 40], [0.93, 0]], hazards: [[0.34, -50, 'paint'], [0.64, 52, 'paint'], [0.87, -45, 'paint']], bumpers: [[0.19, 48, 'eraser'], [0.52, -48, 'eraser'], [0.76, 0, 'eraser']] },
    { id: '2-1', cup: 1, world: 1, name: 'مدار المغناطيس', w: 255, ctrl: [[860, 1540], [1740, 1540], [2380, 1280], [2360, 560], [1800, 360], [1400, 820], [980, 360], [420, 580], [400, 1280]], ramps: [[0.12, 0], [0.68, 0]], pads: [[0.28, -50], [0.84, 50], [0.93, 0]], hazards: [[0.38, 52, 'slime'], [0.75, -52, 'slime']], magnets: [[0.52, 0]], coils: [[0.22, 55]] },
    { id: '2-2', cup: 1, world: 1, name: 'منعطفات المختبر', w: 248, ctrl: [[820, 1560], [1680, 1560], [2380, 1400], [2400, 880], [1860, 740], [2200, 360], [1320, 360], [520, 480], [660, 980], [380, 1360]], ramps: [[0.10, 0], [0.54, 0]], pads: [[0.24, 48], [0.44, -48], [0.78, 45], [0.92, 0]], hazards: [[0.32, -52, 'slime'], [0.55, 0, 'slime'], [0.84, 50, 'slime']], magnets: [[0.39, -35], [0.68, 35]], coils: [[0.18, -52], [0.62, 52]] },
    { id: '2-3', cup: 1, world: 1, name: 'عاصفة تسلا', w: 244, ctrl: [[820, 1580], [1720, 1580], [2400, 1340], [2080, 840], [2380, 400], [1560, 340], [1120, 680], [560, 380], [380, 960], [420, 1460]], ramps: [[0.11, 0], [0.48, 0], [0.76, 0]], pads: [[0.27, -45], [0.60, 45], [0.91, 0]], hazards: [[0.35, 50, 'slime'], [0.66, -50, 'slime']], magnets: [[0.21, 0], [0.55, 0]], coils: [[0.41, -48], [0.71, 48], [0.85, 0]] },
    { id: '3-1', cup: 2, world: 2, name: 'لوحة المفاتيح', w: 255, ctrl: [[800, 1540], [1780, 1540], [2400, 1400], [2400, 660], [1900, 380], [1220, 380], [1120, 900], [520, 900], [380, 1360]], ramps: [[0.11, 0], [0.52, 0]], pads: [[0.30, -45], [0.88, 0]], bumpers: [[0.22, 52, 'keycap'], [0.64, -50, 'keycap'], [0.78, 48, 'keycap']], winds: [[0.36, 0.45], [0.68, 0.75]] },
    { id: '3-2', cup: 2, world: 2, name: 'جسر الكابلات', w: 248, ctrl: [[820, 1560], [1680, 1560], [2380, 1380], [2400, 760], [1900, 380], [1400, 720], [920, 380], [400, 660], [620, 1040], [380, 1400]], ramps: [[0.10, 0], [0.46, 0], [0.74, 0]], pads: [[0.25, 48], [0.60, -48], [0.91, 0]], hazards: [[0.47, 0, 'slime'], [0.83, -52, 'slime']], bumpers: [[0.33, -48, 'keycap'], [0.55, 48, 'keycap'], [0.68, -45, 'keycap']], winds: [[0.16, 0.24], [0.61, 0.68]] },
    { id: '3-3', cup: 2, world: 2, name: 'إعصار المروحة', w: 242, ctrl: [[800, 1580], [1760, 1580], [2400, 1380], [2400, 520], [1880, 360], [1660, 920], [1140, 920], [920, 360], [380, 540], [380, 1380]], ramps: [[0.11, -30], [0.53, 0], [0.84, 30]], pads: [[0.26, 45], [0.68, -45], [0.93, 0]], bumpers: [[0.19, 50, 'keycap'], [0.43, -45, 'keycap'], [0.61, 45, 'keycap'], [0.76, -50, 'keycap']], winds: [[0.28, 0.37], [0.50, 0.58], [0.86, 0.94]] },
    { id: '4-1', cup: 3, world: 3, name: 'ساحة البيتزا', w: 255, ctrl: [[820, 1540], [1800, 1540], [2400, 1260], [2260, 540], [1540, 360], [840, 440], [380, 860], [420, 1400]], ramps: [[0.11, 0], [0.50, 0], [0.78, 0]], pads: [[0.26, -50], [0.64, 50], [0.91, 0]], hazards: [[0.35, 52, 'juice'], [0.70, -52, 'juice']], chompers: [[0.43, -38], [0.84, 38]] },
    { id: '4-2', cup: 3, world: 3, name: 'متاهة العصير', w: 246, ctrl: [[800, 1580], [1600, 1580], [2380, 1420], [2400, 860], [1880, 680], [2220, 340], [1360, 380], [920, 740], [460, 420], [360, 1020], [420, 1460]], ramps: [[0.10, 0], [0.48, 0], [0.76, 0]], pads: [[0.24, 48], [0.58, -48], [0.89, 0]], hazards: [[0.18, -50, 'juice'], [0.49, 0, 'juice'], [0.68, 50, 'juice'], [0.83, -48, 'juice']], chompers: [[0.32, 40], [0.62, -40], [0.93, 35]] },
    { id: '4-3', cup: 3, world: 3, name: 'تحدي الدباسة العملاقة', w: 242, ctrl: [[800, 1580], [1760, 1580], [2400, 1400], [2400, 960], [1880, 780], [2320, 360], [1400, 340], [500, 360], [920, 780], [380, 1020], [400, 1460]], ramps: [[0.09, 0], [0.38, 0], [0.64, 0], [0.86, 0]], pads: [[0.20, -45], [0.48, 45], [0.74, -45], [0.94, 0]], hazards: [[0.28, 50, 'juice'], [0.56, -50, 'juice'], [0.80, 48, 'juice']], coils: [[0.43, -48]], chompers: [[0.15, 42], [0.52, 0], [0.70, 42], [0.90, -40]] }
  ];

  function catmull(p0, p1, p2, p3, t) {
    var t2 = t * t, t3 = t2 * t;
    return [
      0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
      0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
    ];
  }

  function params(ddaLevel, diffKey) {
    var lv = typeof ddaLevel === 'number' && isFinite(ddaLevel) ? clamp(ddaLevel, 0, 1) : 0.35;
    var key = DIFFS[diffKey] ? diffKey : (typeof ddaLevel === 'number' && !diffKey ? (lv < 0.25 ? 'easy' : lv > 0.78 ? 'hero' : 'normal') : 'normal');
    var d = DIFFS[key];
    return {
      diff: d.key, autoGas: d.autoGas, steerAssist: d.steerAssist, roadWidth: d.roadScale,
      openEdges: d.openEdges, botSpeed: d.botBase + d.botSpan * lv,
      mercy: d.mercy * (1 - 0.3 * lv), botAggro: clamp(d.botAggro + 0.15 * lv, 0.15, 0.96), coinMult: d.coinMult
    };
  }

  function build(trackIdx, prm) {
    var idx = clamp(trackIdx | 0, 0, TRACKS.length - 1), R = TRACKS[idx], p = prm || params(0.35, 'normal');
    var ctrl = R.ctrl, n = ctrl.length, raw = [], subs = 32;
    for (var i = 0; i < n; i++) {
      var p0 = ctrl[(i - 1 + n) % n], p1 = ctrl[i], p2 = ctrl[(i + 1) % n], p3 = ctrl[(i + 2) % n];
      for (var j = 0; j < subs; j++) raw.push(catmull(p0, p1, p2, p3, j / subs));
    }
    var cum = [0], total = 0;
    for (var k = 0; k < raw.length; k++) {
      var a = raw[k], b = raw[(k + 1) % raw.length];
      total += Math.hypot(b[0] - a[0], b[1] - a[1]);
      cum.push(total);
    }
    var count = Math.max(80, Math.round(total / 18)), pts = [], hw = (R.w * (p.roadWidth || 1)) * 0.5, ri = 0;
    for (var m = 0; m < count; m++) {
      var targetS = (m / count) * total;
      while (ri < raw.length - 1 && cum[ri + 1] < targetS) ri++;
      var u = (targetS - cum[ri]) / (cum[ri + 1] - cum[ri] || 1);
      var c0 = raw[ri], c1 = raw[(ri + 1) % raw.length];
      pts.push({ x: lerp(c0[0], c1[0], u), y: lerp(c0[1], c1[1], u), s: targetS, hw: hw });
    }
    for (var q = 0; q < count; q++) {
      var prev = pts[(q - 1 + count) % count], next = pts[(q + 1) % count];
      var dx = next.x - prev.x, dy = next.y - prev.y, dl = Math.hypot(dx, dy) || 1;
      pts[q].tx = dx / dl; pts[q].ty = dy / dl; pts[q].nx = -pts[q].ty; pts[q].ny = pts[q].tx;
    }

    var L = { idx: idx, R: R, cup: CUPS[R.cup], pts: pts, len: total, hw: hw, cps: [0, total * 0.25, total * 0.5, total * 0.75] };
    function place(spec, extra) {
      var s = wrapS(total, spec[0] * total), off = spec[1] || 0, c = at(L, s);
      var o = { s: s, off: off, x: c.x + c.nx * off, y: c.y + c.ny * off, ang: Math.atan2(c.ty, c.tx) };
      if (extra) for (var ek in extra) o[ek] = extra[ek];
      return o;
    }
    L.ramps = (R.ramps || []).map(function (sp) { return place(sp, { w: 92, len: 112 }); });
    L.pads = (R.pads || []).map(function (sp) { return place(sp, { r: 44 }); });
    L.hazards = (R.hazards || []).map(function (sp) { return place(sp, { r: 38, kind: sp[2] || 'paint' }); });
    L.bumpers = (R.bumpers || []).map(function (sp) { return place(sp, { r: 30, kind: sp[2] || 'eraser' }); });
    L.magnets = (R.magnets || []).map(function (sp) { return place(sp, { r: 190 }); });
    L.coils = (R.coils || []).map(function (sp, ci) { return place(sp, { r: 36, phase: ci * 1.1, period: 2.6 }); });
    L.chompers = (R.chompers || []).map(function (sp, ci) { return place(sp, { r: 42, phase: ci * 0.85, period: 2.2 }); });
    L.winds = (R.winds || []).map(function (sp) { return { s0: sp[0] * total, s1: sp[1] * total }; });

    L.boxes = [];
    var boxFracs = [0.06, 0.31, 0.59, 0.83];
    for (var bi = 0; bi < boxFracs.length; bi++) {
      L.boxes.push(place([boxFracs[bi], -46], { id: bi * 2 }));
      L.boxes.push(place([boxFracs[bi], 46], { id: bi * 2 + 1 }));
    }
    L.coins = [];
    for (var ci2 = 0; ci2 < 12; ci2++) {
      L.coins.push(place([(0.08 + ci2 * 0.076) % 0.96, (ci2 % 3 === 0) ? 0 : (ci2 % 2 === 0 ? 48 : -48)], { id: ci2 }));
    }
    var propTypes = [
      ['crayon_r', 'ruler', 'eraser', 'notebook', 'crayon_b'],
      ['beaker', 'magnet_prop', 'notebook', 'beaker', 'ruler'],
      ['keyboard', 'mouse', 'ruler', 'keyboard', 'eraser'],
      ['pizza', 'juice_box', 'stapler_prop', 'pizza', 'juice_box']
    ][R.cup];
    L.props = [];
    for (var pi = 0; pi < 16; pi++) {
      var pc = at(L, (pi / 16) * total), side = (pi % 2 === 0) ? 1 : -1, distOut = hw + 135 + (pi % 3) * 38;
      var px = pc.x + pc.nx * side * distOut, py = pc.y + pc.ny * side * distOut;
      if (px < 90 || px > WORLD_W - 90 || py < 90 || py > WORLD_H - 90) continue;
      var clear = true;
      for (var qi = 0; qi < pts.length; qi += 3) if (Math.hypot(px - pts[qi].x, py - pts[qi].y) < hw + 82) { clear = false; break; }
      if (clear) L.props.push({ x: px, y: py, rot: (pi * 0.9) % TAU, kind: propTypes[pi % propTypes.length] });
    }
    return L;
  }

  function at(L, s) {
    var ws = wrapS(L.len, s), pts = L.pts, n = pts.length;
    var f = (ws / L.len) * n, i0 = Math.floor(f) % n, i1 = (i0 + 1) % n, u = f - Math.floor(f);
    var a = pts[i0], b = pts[i1], tx = lerp(a.tx, b.tx, u), ty = lerp(a.ty, b.ty, u), tl = Math.hypot(tx, ty) || 1;
    tx /= tl; ty /= tl;
    return { x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u), tx: tx, ty: ty, nx: -ty, ny: tx, s: ws, hw: a.hw };
  }

  function refineNearest(L, x, y, i) {
    var pts = L.pts, n = pts.length, p = pts[i], next = pts[(i + 1) % n];
    var sx = next.x - p.x, sy = next.y - p.y, sl2 = sx * sx + sy * sy || 1;
    var t = clamp(((x - p.x) * sx + (y - p.y) * sy) / sl2, 0, 1);
    var c = at(L, wrapS(L.len, p.s + t * (L.len / n)));
    c.off = (x - c.x) * c.nx + (y - c.y) * c.ny;
    return c;
  }

  function nearest(L, x, y, hintS) {
    var pts = L.pts, n = pts.length, bestI = 0, bestD = 1e18;
    if (typeof hintS === 'number') {
      var center = Math.floor((wrapS(L.len, hintS) / L.len) * n), span = Math.max(12, (n * 0.14) | 0);
      for (var d = -span; d <= span; d++) {
        var idx = (center + d + n) % n, dx = x - pts[idx].x, dy = y - pts[idx].y, d2 = dx * dx + dy * dy;
        if (d2 < bestD) { bestD = d2; bestI = idx; }
      }
      if (bestD < (L.hw * 2.8) * (L.hw * 2.8)) return refineNearest(L, x, y, bestI);
    }
    bestD = 1e18;
    for (var i = 0; i < n; i++) {
      var dx2 = x - pts[i].x, dy2 = y - pts[i].y, dist2 = dx2 * dx2 + dy2 * dy2;
      if (dist2 < bestD) { bestD = dist2; bestI = i; }
    }
    return refineNearest(L, x, y, bestI);
  }

  function create(trackIdx, opts) {
    opts = opts || {};
    var prm = opts.params || params(opts.dda == null ? 0.35 : opts.dda, opts.diff || 'normal');
    var L = build(trackIdx, prm), humans = opts.humans === 2 ? 2 : 1;
    var rng = makeRng(opts.seed == null ? (101 + (trackIdx | 0) * 37) : opts.seed);
    var karts = [], gridS = [0, L.len - 28, L.len - 62, L.len - 92], gridOff = [-56, 56, -18, 22];
    for (var i = 0; i < 4; i++) {
      var isHuman = i < humans, c = at(L, gridS[i]);
      var gx = c.x + c.nx * gridOff[i], gy = c.y + c.ny * gridOff[i];
      var rv = RIVALS[(i - humans + RIVALS.length) % RIVALS.length];
      karts.push({
        id: i, human: isHuman, name: isHuman ? (humans === 2 ? (i === 0 ? 'لاعب 1' : 'لاعب 2') : 'أنت') : rv.name,
        kartIdx: isHuman ? (i === 0 ? (opts.kart || 0) : ((opts.kart2 != null ? opts.kart2 : 1) % KARTS.length)) : (1 + (i % 3)),
        flameIdx: isHuman ? (opts.flame || 0) : (i % FLAMES.length), rivalStyle: isHuman ? 0 : rv.style,
        bodyColor: isHuman ? (i === 0 ? KARTS[opts.kart || 0].body : '#2ec4ff') : rv.body,
        trimColor: isHuman ? (i === 0 ? KARTS[opts.kart || 0].trim : '#a8ff78') : rv.trim,
        started: !isHuman, aiDelay: isHuman ? 0 : 0.04 + i * 0.06, aiSkill: 0.94 + i * 0.035, aiLane: (i % 2 === 0 ? -1 : 1) * 32, aiItemT: 1.2 + rng() * 1.4,
        spawnX: gx, spawnY: gy, x: gx, y: gy, z: 0, vz: 0, vx: 0, vy: 0, speed: 0, ang: Math.atan2(c.ty, c.tx), s: gridS[i], off: gridOff[i],
        sector: 0, lap: 0, totalDist: 0, dist: 0, rank: i + 1, finished: false, finishTime: 0, gasTime: 0, inputs: 0,
        drifting: false, driftDir: 0, driftT: 0, driftLv: 0, miniBoostT: 0, padBoostT: 0, turboT: 0, magnetT: 0, spinT: 0, inkedT: 0, warpT: 0, airTrick: false, item: '', coins: 0
      });
    }
    var p1 = karts[0];
    return {
      L: L, R: L.R, trackIdx: L.idx, id: L.R.id, humans: humans, params: prm, rng: rng, worldTime: 0, time: 0, done: false, winner: -1, finishOrder: [], karts: karts,
      boxes: L.boxes.map(function (b) { return { x: b.x, y: b.y, s: b.s, cd: 0 }; }),
      coins: L.coins.map(function (cn) { return { x: cn.x, y: cn.y, s: cn.s, taken: false }; }),
      traps: [], rockets: [], cam: { x: clamp(p1.x + 120, VIEW_W * 0.5, WORLD_W - VIEW_W * 0.5), y: clamp(p1.y, VIEW_H * 0.5, WORLD_H - VIEW_H * 0.5), zoom: 1.0 }, ev: []
    };
  }

  function rollItem(w, rank) {
    var r = w.rng();
    if (rank >= 3) return r < 0.34 ? 'eraser_turbo' : r < 0.66 ? 'ink_rocket' : r < 0.90 ? 'clip_magnet' : 'ruler_jump';
    if (rank === 2) return r < 0.32 ? 'ink_rocket' : r < 0.56 ? 'clip_magnet' : r < 0.78 ? 'ruler_jump' : r < 0.92 ? 'eraser_turbo' : 'glue_trap';
    return r < 0.38 ? 'glue_trap' : r < 0.70 ? 'ruler_jump' : r < 0.90 ? 'clip_magnet' : 'ink_rocket';
  }

  function useItem(w, kartId) {
    var k = w.karts[kartId];
    if (!k || !k.item || k.spinT > 0 || k.finished) return false;
    if (k.human && !k.started) k.started = true;
    var it = k.item; k.item = '';
    if (it === 'eraser_turbo') { k.turboT = 2.5; k.speed = Math.max(k.speed, TOP_SPEED * 1.18); w.ev.push({ t: 'item', kind: it, kart: k.id, x: k.x, y: k.y }); return true; }
    if (it === 'clip_magnet') { k.magnetT = 3.2; w.ev.push({ t: 'item', kind: it, kart: k.id, x: k.x, y: k.y }); return true; }
    if (it === 'glue_trap') {
      var bx = k.x - Math.cos(k.ang) * 44, by = k.y - Math.sin(k.ang) * 44;
      w.traps.push({ x: bx, y: by, r: 34, owner: k.id, armT: 0.35, life: 18 });
      k.miniBoostT = Math.max(k.miniBoostT, 0.35); w.ev.push({ t: 'item', kind: it, kart: k.id, x: bx, y: by }); return true;
    }
    if (it === 'ruler_jump') { k.vz = 395; k.z = Math.max(k.z, 2); k.airTrick = true; k.miniBoostT = Math.max(k.miniBoostT, 1.15); w.ev.push({ t: 'item', kind: it, kart: k.id, x: k.x, y: k.y }); return true; }
    if (it === 'ink_rocket') {
      var target = -1, bestAhead = 1e9;
      for (var i = 0; i < w.karts.length; i++) {
        var o = w.karts[i]; if (o.id === k.id || !o.started || o.finished) continue;
        var ahead = wrapS(w.L.len, o.s - k.s); if (ahead > 15 && ahead < bestAhead) { bestAhead = ahead; target = o.id; }
      }
      w.rockets.push({ owner: k.id, target: target, s: wrapS(w.L.len, k.s + 42), off: k.off, x: k.x + Math.cos(k.ang) * 34, y: k.y + Math.sin(k.ang) * 34, ang: k.ang, speed: 780, life: 4.2 });
      w.ev.push({ t: 'item', kind: it, kart: k.id, x: k.x, y: k.y }); return true;
    }
    return false;
  }

  function aiControl(w, k, dt) {
    if (k.aiDelay > 0) { k.aiDelay = Math.max(0, k.aiDelay - dt); return { gas: 0, brake: 0, steer: 0, drift: false, item: false }; }
    var L = w.L, look = 135 + k.speed * 0.22, wantOff = k.aiLane;
    for (var hi = 0; hi < L.hazards.length; hi++) {
      var hz = L.hazards[hi], ds = wrapS(L.len, hz.s - k.s);
      if (ds > 0 && ds < 220 && Math.abs(wantOff - hz.off) < hz.r + KART_R + 14) wantOff = hz.off >= 0 ? -L.hw * 0.45 : L.hw * 0.45;
    }
    for (var ti = 0; ti < w.traps.length; ti++) if (Math.hypot(w.traps[ti].x - k.x, w.traps[ti].y - k.y) < 180) wantOff = -k.off;
    var aim = at(L, k.s + look), diff = wrapAngle(Math.atan2(aim.y + aim.ny * wantOff - k.y, aim.x + aim.nx * wantOff - k.x) - k.ang);
    var fire = false;
    if (k.item && (k.aiItemT -= dt) <= 0) { k.aiItemT = 1.0 + w.rng() * 1.4; fire = w.rng() < w.params.botAggro; }
    return { gas: 1, brake: 0, steer: clamp(diff / 0.52, -1, 1), drift: Math.abs(diff) > 0.55 && k.speed > 260, item: fire };
  }

  function step(w, dt, inputs) {
    if (w.done) { updateCamera(w, dt); return w.ev; }
    dt = clamp(dt || 1 / 60, 0.001, 0.05);
    w.worldTime += dt;
    inputs = inputs || [];
    var L = w.L, prm = w.params, leaderDist = 0;
    for (var bi = 0; bi < w.boxes.length; bi++) if (w.boxes[bi].cd > 0) w.boxes[bi].cd = Math.max(0, w.boxes[bi].cd - dt);
    for (var li = 0; li < w.karts.length; li++) if (w.karts[li].totalDist > leaderDist) leaderDist = w.karts[li].totalDist;

    for (var i = 0; i < w.karts.length; i++) {
      var k = w.karts[i], inp;
      if (k.human && !k.finished) {
        var raw = inputs[i] || {};
        var hasAct = !!(raw.active || raw.gas > 0 || raw.brake > 0 || Math.abs(raw.steer || 0) > 0.01 || raw.drift || raw.item || raw.targetAngle != null || raw.dirX || raw.dirY);
        if (hasAct) { k.started = true; k.inputs++; }
        if (!k.started) { k.x = k.spawnX; k.y = k.spawnY; k.speed = 0; k.vx = 0; k.vy = 0; k.dist = 0; continue; }
        var gas = raw.gas || 0, brake = raw.brake || 0, steer = clamp(raw.steer || 0, -1, 1), flow = at(L, k.s + 115);
        if (prm.autoGas) {
          if ((raw.dirX || raw.dirY) && !(raw.gas > 0 && Math.abs(steer) > 0.1)) {
            var dLen = Math.hypot(raw.dirX || 0, raw.dirY || 0) || 1;
            var ndx = (raw.dirX || 0) / dLen, ndy = (raw.dirY || 0) / dLen;
            var dot = ndx * flow.tx + ndy * flow.ty;
            if (dot > 0.52 || (ndy > 0.5 && !raw.gas && flow.ty > -0.2)) {
              steer = clamp(wrapAngle(Math.atan2(ndy * 0.65 + flow.ty * 0.55, ndx * 0.65 + flow.tx * 0.55) - k.ang) / 0.45, -1, 1);
              brake = 0;
            } else if (k.speed < 60) brake = 0;
          }
          if (brake <= 0) gas = 1;
        } else if (Math.abs(steer) > 0.2 && brake <= 0 && gas <= 0 && k.speed < 220) {
          gas = 0.72;
        }
        if (raw.targetAngle != null) steer = clamp(wrapAngle(raw.targetAngle - k.ang) / 0.45, -1, 1);
        else if (prm.steerAssist > 0 && gas > 0) {
          var flowDiff = wrapAngle(Math.atan2(flow.ty, flow.tx) - k.ang);
          steer = Math.abs(steer) < 0.05 ? clamp(flowDiff * prm.steerAssist * 1.15, -0.7, 0.7) : clamp(steer + flowDiff * prm.steerAssist * 0.3, -1, 1);
        }
        inp = { gas: gas, brake: brake, steer: steer, drift: !!raw.drift, item: !!raw.item };
      } else inp = aiControl(w, k, dt);

      if (k.human && k.started && !k.finished && i === 0) w.time += dt;
      if (k.human && inp.gas > 0 && !k.finished) k.gasTime += dt;
      if (inp.item && k.item) useItem(w, k.id);

      if (k.miniBoostT > 0) k.miniBoostT = Math.max(0, k.miniBoostT - dt);
      if (k.padBoostT > 0) k.padBoostT = Math.max(0, k.padBoostT - dt);
      if (k.turboT > 0) k.turboT = Math.max(0, k.turboT - dt);
      if (k.magnetT > 0) k.magnetT = Math.max(0, k.magnetT - dt);
      if (k.inkedT > 0) k.inkedT = Math.max(0, k.inkedT - dt);
      if (k.warpT > 0) k.warpT = Math.max(0, k.warpT - dt);

      if (k.spinT > 0) {
        k.spinT = Math.max(0, k.spinT - dt);
        k.speed *= Math.pow(0.18, dt);
        k.drifting = false; k.driftT = 0; k.driftLv = 0;
      } else {
        var wantDrift = (inp.drift || Math.abs(inp.steer) > 0.72) && k.speed > 180 && k.z <= 18 && !k.airTrick;
        if (inp.drift && !k.drifting && k.z <= 0 && k.speed > 150) {
          k.vz = 145;
          w.ev.push({ t: 'hop', kart: k.id, x: k.x, y: k.y });
        }
        if (wantDrift && Math.abs(inp.steer) > 0.22) {
          if (!k.drifting) { k.drifting = true; k.driftDir = inp.steer > 0 ? 1 : -1; }
          k.driftT += dt * (inp.drift ? 1.35 : 0.85);
          k.driftLv = k.driftT >= 1.05 ? 2 : k.driftT >= 0.42 ? 1 : 0;
        } else if (k.drifting) {
          if (k.driftLv > 0) {
            k.miniBoostT = Math.max(k.miniBoostT, k.driftLv === 2 ? 1.5 : 0.85);
            w.ev.push({ t: 'driftBoost', lv: k.driftLv, kart: k.id, x: k.x, y: k.y });
          }
          k.drifting = false; k.driftT = 0; k.driftLv = 0;
        }

        var turnRate = k.drifting ? 3.35 : 2.75;
        k.ang = wrapAngle(k.ang + inp.steer * turnRate * clamp(0.45 + Math.abs(k.speed) / TOP_SPEED, 0.45, 1.15) * dt);

        var maxSpd = TOP_SPEED;
        if (!k.human) {
          maxSpd *= prm.botSpeed * k.aiSkill;
          var p1Ref = w.karts[0];
          if (p1Ref.started && !p1Ref.finished) {
            var lead = k.totalDist - p1Ref.totalDist;
            if (lead > 340) maxSpd *= clamp(1 - prm.mercy * 0.9, 0.72, 1);
            else if (lead < -520) maxSpd *= 1.06;
          }
        } else if (leaderDist - k.totalDist > 320) {
          maxSpd *= 1 + prm.mercy * clamp((leaderDist - k.totalDist) / 1100, 0, 1);
        }
        if (k.turboT > 0) maxSpd *= 1.42;
        else if (k.padBoostT > 0) maxSpd *= 1.28;
        else if (k.miniBoostT > 0) maxSpd *= 1.22;
        if (k.magnetT > 0) maxSpd *= (k.rank > 1 ? 1.25 : 1.12);
        for (var wi = 0; wi < L.winds.length; wi++) if (k.s >= L.winds[wi].s0 && k.s <= L.winds[wi].s1) maxSpd *= 1.24;

        var accel = (k.turboT > 0 || k.padBoostT > 0 || k.miniBoostT > 0) ? 920 : 580;
        if (inp.gas > 0) k.speed = Math.min(maxSpd, k.speed + accel * inp.gas * dt);
        else if (inp.brake > 0) k.speed = Math.max(-TOP_SPEED * 0.38, k.speed - 620 * inp.brake * dt);
        else { k.speed *= Math.pow(0.22, dt); if (Math.abs(k.speed) < 3) k.speed = 0; }
        if (k.speed > maxSpd) k.speed = lerp(k.speed, maxSpd, clamp(dt * 4, 0, 1));
      }

      if (k.z > 0 || k.vz !== 0) {
        k.z += k.vz * dt; k.vz -= 980 * dt;
        if (k.z <= 0) {
          k.z = 0; k.vz = 0;
          if (k.airTrick) { k.airTrick = false; k.miniBoostT = Math.max(k.miniBoostT, 0.9); w.ev.push({ t: 'trickLand', kart: k.id, x: k.x, y: k.y }); }
        }
      }

      var grip = k.drifting ? 6.5 : 13.0;
      k.vx = lerp(k.vx, Math.cos(k.ang) * k.speed, clamp(grip * dt, 0, 1));
      k.vy = lerp(k.vy, Math.sin(k.ang) * k.speed, clamp(grip * dt, 0, 1));
      var prevX = k.x, prevY = k.y;
      k.x += k.vx * dt; k.y += k.vy * dt;
      if (!k.finished) k.dist += Math.hypot(k.x - prevX, k.y - prevY);

      var prevS = k.s, proj = nearest(L, k.x, k.y, k.s);
      k.s = proj.s; k.off = proj.off;
      var wallLim = L.hw - KART_R * 0.55;
      if (prm.openEdges && k.z <= 2 && Math.abs(k.off) > L.hw * 1.24) {
        var safe = at(L, k.s);
        k.x = safe.x; k.y = safe.y; k.off = 0; k.ang = Math.atan2(safe.ty, safe.tx);
        k.speed *= 0.45; k.vx = safe.tx * k.speed; k.vy = safe.ty * k.speed; k.warpT = 0.7;
        w.ev.push({ t: 'edgeDrop', kart: k.id, x: k.x, y: k.y });
      } else if (Math.abs(k.off) > wallLim) {
        var sign = k.off > 0 ? 1 : -1;
        k.x = proj.x + proj.nx * sign * wallLim; k.y = proj.y + proj.ny * sign * wallLim; k.off = sign * wallLim;
        var tanAng = Math.atan2(proj.ty, proj.tx);
        k.ang = wrapAngle(lerp(k.ang, k.ang + wrapAngle(tanAng - k.ang), prm.diff === 'easy' ? 0.55 : 0.3));
        k.speed *= prm.diff === 'easy' ? 0.96 : 0.88;
        k.vx = Math.cos(k.ang) * k.speed; k.vy = Math.sin(k.ang) * k.speed;
      }

      var sec = Math.min(3, Math.floor((k.s / L.len) * 4));
      if (sec === k.sector + 1) k.sector = sec;
      else if (k.sector === 3 && sec === 0 && prevS > L.len * 0.7 && k.s < L.len * 0.3) {
        k.sector = 0;
        if (!k.finished) {
          k.lap++;
          w.ev.push({ t: 'lap', kart: k.id, lap: k.lap, x: k.x, y: k.y });
          if (k.lap >= LAPS) {
            k.finished = true; k.finishTime = i === 0 ? w.time : w.worldTime;
            w.finishOrder.push(k.id); k.rank = w.finishOrder.length;
            w.ev.push({ t: 'finish', kart: k.id, rank: k.rank });
            if (w.winner < 0) w.winner = k.id;
          }
        }
      }
      var effS = (k.lap === 0 && k.sector === 0 && k.s > L.len * 0.75) ? (k.s - L.len) : k.s;
      k.totalDist = k.lap * L.len + Math.min(effS, (k.sector + 1) * (L.len * 0.25) + 40);
      interactTrack(w, k, dt);
    }

    for (var a = 0; a < 4; a++) {
      for (var b = a + 1; b < 4; b++) {
        var ka = w.karts[a], kb = w.karts[b];
        if (!ka.started || !kb.started || Math.abs(ka.z - kb.z) > 22) continue;
        var dx = kb.x - ka.x, dy = kb.y - ka.y, dist = Math.hypot(dx, dy), minD = KART_R * 2;
        if (dist > 0.01 && dist < minD) {
          var nx = dx / dist, ny = dy / dist, pen = (minD - dist) * 0.5;
          ka.x -= nx * pen; ka.y -= ny * pen; kb.x += nx * pen; kb.y += ny * pen;
          if (ka.turboT > 0 && kb.turboT <= 0) { kb.spinT = Math.max(kb.spinT, 0.65); w.ev.push({ t: 'ram', kart: a, victim: b, x: kb.x, y: kb.y }); }
          else if (kb.turboT > 0 && ka.turboT <= 0) { ka.spinT = Math.max(ka.spinT, 0.65); w.ev.push({ t: 'ram', kart: b, victim: a, x: ka.x, y: ka.y }); }
          else { ka.vx -= nx * 70; ka.vy -= ny * 70; kb.vx += nx * 70; kb.vy += ny * 70; w.ev.push({ t: 'bump', x: (ka.x + kb.x) * 0.5, y: (ka.y + kb.y) * 0.5 }); }
        }
      }
    }

    stepProjectilesAndTraps(w, dt);
    updateRanksAndFinish(w);
    if (w.humans === 2) checkTwoPlayerWarp(w);
    updateCamera(w, dt);
    return w.ev;
  }

  function interactTrack(w, k, dt) {
    var L = w.L, coinReach = k.magnetT > 0 ? 270 : (KART_R + 22);
    for (var ci = 0; ci < w.coins.length; ci++) {
      var cn = w.coins[ci];
      if (cn.taken) continue;
      var cd = Math.hypot(cn.x - k.x, cn.y - k.y);
      if (cd < coinReach) {
        if (k.magnetT > 0 && cd > KART_R + 22) { cn.x = lerp(cn.x, k.x, clamp(dt * 9, 0, 1)); cn.y = lerp(cn.y, k.y, clamp(dt * 9, 0, 1)); }
        else { cn.taken = true; k.coins++; w.ev.push({ t: 'coin', kart: k.id, x: cn.x, y: cn.y }); }
      }
    }
    for (var bi = 0; bi < w.boxes.length; bi++) {
      var bx = w.boxes[bi];
      if (bx.cd <= 0 && Math.hypot(bx.x - k.x, bx.y - k.y) < KART_R + 28) {
        bx.cd = 3.5; if (!k.item) k.item = rollItem(w, k.rank);
        w.ev.push({ t: 'box', kart: k.id, item: k.item, x: bx.x, y: bx.y });
      }
    }
    for (var mi = 0; mi < L.magnets.length; mi++) if (Math.hypot(L.magnets[mi].x - k.x, L.magnets[mi].y - k.y) < L.magnets[mi].r) k.speed = Math.min(TOP_SPEED * 1.32, k.speed + 420 * dt);
    if (k.z > 10) return;

    for (var ri = 0; ri < L.ramps.length; ri++) {
      var rm = L.ramps[ri];
      if (Math.hypot(rm.x - k.x, rm.y - k.y) < 56 && k.vz <= 0) {
        k.vz = 365; k.z = 3; k.airTrick = true; k.miniBoostT = Math.max(k.miniBoostT, 1.05);
        w.ev.push({ t: 'ramp', kart: k.id, x: rm.x, y: rm.y });
      }
    }
    for (var pi = 0; pi < L.pads.length; pi++) {
      var pd = L.pads[pi];
      if (Math.hypot(pd.x - k.x, pd.y - k.y) < pd.r + KART_R * 0.6 && k.padBoostT < 0.3) {
        k.padBoostT = 0.85; k.speed = Math.max(k.speed, TOP_SPEED * 1.24);
        w.ev.push({ t: 'pad', kart: k.id, x: pd.x, y: pd.y });
      }
    }
    for (var bmi = 0; bmi < L.bumpers.length; bmi++) {
      var bm = L.bumpers[bmi], bd = Math.hypot(bm.x - k.x, bm.y - k.y);
      if (bd > 0.01 && bd < bm.r + KART_R) {
        var nx = (k.x - bm.x) / bd, ny = (k.y - bm.y) / bd;
        k.x = bm.x + nx * (bm.r + KART_R + 2); k.y = bm.y + ny * (bm.r + KART_R + 2);
        if (bm.kind === 'keycap') { k.vz = 220; k.z = 2; k.padBoostT = Math.max(k.padBoostT, 0.55); }
        else { k.vx = nx * 240; k.vy = ny * 240; }
        w.ev.push({ t: 'bumper', kind: bm.kind, kart: k.id, x: bm.x, y: bm.y });
      }
    }
    if (k.turboT > 0 || k.warpT > 0 || k.spinT > 0) return;
    for (var hi = 0; hi < L.hazards.length; hi++) {
      var hz = L.hazards[hi];
      if (Math.hypot(hz.x - k.x, hz.y - k.y) < hz.r + KART_R * 0.4) {
        k.speed *= Math.pow(0.25, dt);
        if (w.rng() < dt * 3) w.ev.push({ t: 'hazard', kind: hz.kind, kart: k.id, x: k.x, y: k.y });
      }
    }
    for (var ci2 = 0; ci2 < L.coils.length; ci2++) {
      var co = L.coils[ci2];
      if (((w.worldTime + co.phase) % co.period) < 0.85 && Math.hypot(co.x - k.x, co.y - k.y) < co.r + KART_R * 0.5) {
        k.spinT = 0.7; w.ev.push({ t: 'zap', kart: k.id, x: k.x, y: k.y });
      }
    }
    for (var chi = 0; chi < L.chompers.length; chi++) {
      var ch = L.chompers[chi];
      if (((w.worldTime + ch.phase) % ch.period) < 0.65 && Math.hypot(ch.x - k.x, ch.y - k.y) < ch.r + KART_R * 0.5) {
        k.spinT = 0.8; w.ev.push({ t: 'chomp', kart: k.id, x: k.x, y: k.y });
      }
    }
  }

  function stepProjectilesAndTraps(w, dt) {
    var L = w.L;
    for (var ti = w.traps.length - 1; ti >= 0; ti--) {
      var tr = w.traps[ti];
      tr.life -= dt; if (tr.armT > 0) tr.armT -= dt;
      if (tr.life <= 0) { w.traps.splice(ti, 1); continue; }
      for (var ki = 0; ki < 4; ki++) {
        var k = w.karts[ki];
        if (!k.started || k.z > 10 || k.spinT > 0 || (tr.owner === k.id && tr.armT > 0)) continue;
        if (Math.hypot(tr.x - k.x, tr.y - k.y) < tr.r + KART_R * 0.6) {
          w.traps.splice(ti, 1);
          if (k.turboT <= 0) { k.spinT = 0.85; k.speed *= 0.35; w.ev.push({ t: 'glueHit', kart: k.id, owner: tr.owner, x: k.x, y: k.y }); }
          break;
        }
      }
    }
    for (var ri = w.rockets.length - 1; ri >= 0; ri--) {
      var rk = w.rockets[ri];
      if ((rk.life -= dt) <= 0) { w.rockets.splice(ri, 1); continue; }
      rk.s = wrapS(L.len, rk.s + rk.speed * dt);
      var rc = at(L, rk.s);
      if (rk.target >= 0 && w.karts[rk.target] && w.karts[rk.target].started) {
        var tk = w.karts[rk.target];
        if (Math.hypot(tk.x - rk.x, tk.y - rk.y) < 360) {
          var ta = Math.atan2(tk.y - rk.y, tk.x - rk.x);
          rk.x += Math.cos(ta) * rk.speed * dt; rk.y += Math.sin(ta) * rk.speed * dt; rk.ang = ta;
        } else {
          rk.off = lerp(rk.off, tk.off, clamp(dt * 4, 0, 1));
          rk.x = rc.x + rc.nx * rk.off; rk.y = rc.y + rc.ny * rk.off; rk.ang = Math.atan2(rc.ty, rc.tx);
        }
      } else { rk.x = rc.x + rc.nx * rk.off; rk.y = rc.y + rc.ny * rk.off; rk.ang = Math.atan2(rc.ty, rc.tx); }
      for (var kj = 0; kj < 4; kj++) {
        var vic = w.karts[kj];
        if (kj === rk.owner || !vic.started || vic.finished) continue;
        if (Math.hypot(vic.x - rk.x, vic.y - rk.y) < KART_R + 22) {
          w.rockets.splice(ri, 1);
          if (vic.turboT <= 0) { vic.spinT = 0.9; vic.inkedT = 2.4; vic.speed *= 0.3; w.ev.push({ t: 'inkHit', kart: vic.id, owner: rk.owner, x: vic.x, y: vic.y }); }
          else w.ev.push({ t: 'shieldBlock', kart: vic.id, x: vic.x, y: vic.y });
          break;
        }
      }
    }
  }

  function updateRanksAndFinish(w) {
    var order = w.karts.slice().sort(function (a, b) {
      if (a.finished && b.finished) return a.rank - b.rank;
      return a.finished ? -1 : b.finished ? 1 : b.totalDist - a.totalDist;
    });
    for (var i = 0; i < order.length; i++) if (!order[i].finished) order[i].rank = i + 1;
    var humansDone = true;
    for (var h = 0; h < w.humans; h++) if (!w.karts[h].finished) humansDone = false;
    if (humansDone) w.done = true;
  }

  function checkTwoPlayerWarp(w) {
    var p1 = w.karts[0], p2 = w.karts[1];
    if (!p1.started || !p2.started || p1.finished || p2.finished) return;
    var gap = p1.totalDist - p2.totalDist;
    if (Math.abs(gap) > 820) {
      var leader = gap > 0 ? p1 : p2, trailer = gap > 0 ? p2 : p1;
      if (trailer.warpT > 0) return;
      var targetS = wrapS(w.L.len, leader.s - 105), c = at(w.L, targetS);
      trailer.x = c.x; trailer.y = c.y; trailer.s = targetS; trailer.off = 0;
      trailer.ang = Math.atan2(c.ty, c.tx);
      trailer.speed = Math.max(trailer.speed, leader.speed * 0.92);
      trailer.vx = c.tx * trailer.speed; trailer.vy = c.ty * trailer.speed;
      trailer.lap = leader.lap; trailer.sector = Math.min(3, Math.floor((targetS / w.L.len) * 4));
      trailer.totalDist = trailer.lap * w.L.len + targetS;
      trailer.spinT = 0; trailer.warpT = 0.9;
      w.ev.push({ t: 'warp', kart: trailer.id, x: trailer.x, y: trailer.y });
    }
  }

  function updateCamera(w, dt) {
    var p1 = w.karts[0], tx, ty, tz;
    if (w.humans === 2 && w.karts[1].started) {
      var p2 = w.karts[1];
      tx = (p1.x + p2.x) * 0.5 + (Math.cos(p1.ang) + Math.cos(p2.ang)) * 38;
      ty = (p1.y + p2.y) * 0.5 + (Math.sin(p1.ang) + Math.sin(p1.ang)) * 38;
      tz = clamp(Math.min(VIEW_W / (Math.abs(p1.x - p2.x) + 340), VIEW_H / (Math.abs(p1.y - p2.y) + 240)), 0.64, 0.98);
    } else {
      var look = p1.started ? (65 + p1.speed * 0.16) : 120;
      tx = p1.x + Math.cos(p1.ang) * look; ty = p1.y + Math.sin(p1.ang) * look;
      tz = p1.turboT > 0 ? 0.93 : (p1.speed > 320 ? 0.97 : 1.02);
    }
    var kLerp = clamp((dt || 1 / 60) * 7.5, 0, 1);
    w.cam.zoom = lerp(w.cam.zoom, tz, kLerp);
    var halfW = (VIEW_W * 0.5) / w.cam.zoom, halfH = (VIEW_H * 0.5) / w.cam.zoom;
    w.cam.x = lerp(w.cam.x, clamp(tx, halfW, WORLD_W - halfW), kLerp);
    w.cam.y = lerp(w.cam.y, clamp(ty, halfH, WORLD_H - halfH), kLerp);
  }

  function starsForRank(rank) { return rank === 1 ? 3 : rank === 2 ? 2 : rank === 3 ? 1 : 0; }
  function freshSave() {
    return { v: 2, diff: 'easy', coins: 0, kart: 0, flame: 0, karts: [1, 0, 0, 0, 0], flames: [1, 0, 0, 0, 0], tracks: TRACKS.map(function () { return { s: 0, t: 0 }; }) };
  }
  function loadSave(raw) {
    var base = freshSave();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.v !== 2) return base;
    if (!Array.isArray(raw.tracks) || raw.tracks.length !== TRACKS.length) return base;
    if (typeof raw.coins !== 'number' || !isFinite(raw.coins) || raw.coins < 0) return base;
    if (!Array.isArray(raw.karts) || raw.karts.length !== KARTS.length) return base;
    if (!Array.isArray(raw.flames) || raw.flames.length !== FLAMES.length) return base;
    var ki = raw.kart | 0, fi = raw.flame | 0;
    if (ki < 0 || ki >= KARTS.length || !raw.karts[ki] || fi < 0 || fi >= FLAMES.length || !raw.flames[fi]) return base;
    base.diff = DIFFS[raw.diff] ? raw.diff : 'easy';
    base.coins = Math.floor(raw.coins); base.kart = ki; base.flame = fi;
    base.karts = raw.karts.map(function (v, i) { return i === 0 || v ? 1 : 0; });
    base.flames = raw.flames.map(function (v, i) { return i === 0 || v ? 1 : 0; });
    base.tracks = raw.tracks.map(function (tr) {
      if (!tr || typeof tr !== 'object') return { s: 0, t: 0 };
      return { s: clamp(tr.s | 0, 0, 3), t: typeof tr.t === 'number' && tr.t > 0 && isFinite(tr.t) ? Math.round(tr.t * 10) / 10 : 0 };
    });
    return base;
  }
  function isOpen(save, idx) { return idx >= 0 && idx < TRACKS.length; }
  function totalStars(save) { var sum = 0; for (var i = 0; i < save.tracks.length; i++) sum += save.tracks[i].s | 0; return sum; }
  function applyResult(save, trackIdx, rank, raceTime, pickedCoins, diffKey) {
    var idx = clamp(trackIdx | 0, 0, TRACKS.length - 1), rec = save.tracks[idx], stars = starsForRank(rank), prev = rec.s;
    if (stars > rec.s) rec.s = stars;
    var bestNew = false;
    if (raceTime > 0 && (rec.t === 0 || raceTime < rec.t)) { rec.t = Math.round(raceTime * 10) / 10; bestNew = prev > 0; }
    var earned = Math.round(((pickedCoins | 0) + Math.max(0, stars - prev) * STAR_COINS + (stars > 0 ? 2 : 1)) * (DIFFS[diffKey] ? DIFFS[diffKey].coinMult : 1));
    save.coins += earned;
    return { stars: stars, earned: earned, bestNew: bestNew, nextIdx: (idx + 1) % TRACKS.length };
  }
  function buy(save, shelf, idx) {
    var list = shelf === 'kart' ? KARTS : shelf === 'flame' ? FLAMES : null;
    if (!list || idx < 0 || idx >= list.length) return '';
    var owned = shelf === 'kart' ? save.karts : save.flames;
    if (owned[idx]) { if (shelf === 'kart') save.kart = idx; else save.flame = idx; return 'wear'; }
    if (save.coins < list[idx].price) return '';
    save.coins -= list[idx].price; owned[idx] = 1;
    if (shelf === 'kart') save.kart = idx; else save.flame = idx;
    return 'bought';
  }

  return {
    VIEW_W: VIEW_W, VIEW_H: VIEW_H, WORLD_W: WORLD_W, WORLD_H: WORLD_H,
    KART_W: KART_W, KART_H: KART_H, KART_R: KART_R, LAPS: LAPS, TOP_SPEED: TOP_SPEED, STAR_COINS: STAR_COINS,
    CUPS: CUPS, WORLDS: CUPS, TRACKS: TRACKS, ITEMS: ITEMS, RIVALS: RIVALS, KARTS: KARTS, FLAMES: FLAMES, DIFFS: DIFFS,
    clamp: clamp, lerp: lerp, wrapS: wrapS, wrapAngle: wrapAngle,
    params: params, build: build, at: at, nearest: nearest,
    create: create, step: step, useItem: useItem, updateCamera: updateCamera,
    starsForRank: starsForRank, freshSave: freshSave, loadSave: loadSave, isOpen: isOpen, totalStars: totalStars, applyResult: applyResult, buy: buy
  };
});
