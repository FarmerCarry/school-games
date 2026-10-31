/* سباق التوربو — tracks, karts and items. Pure data: no DOM, no Kit. */
(function () {
  'use strict';
  var TAU = Math.PI * 2;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function wrap(a) { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; }

  // A polar oval: one radius per angle, so the ribbon cannot cross itself.
  function polar(cx, cy, rx, ry, n, waves) {
    var pts = [];
    for (var i = 0; i < n; i++) {
      var t = (i + 0.5) / n * TAU;
      // The last ripple is only there to stretch the lap. It stays star-shaped.
      var m = 1 + 0.06 * Math.sin(8 * t + rx * 0.01), w;
      for (w = 0; w < waves.length; w++) m += waves[w][0] * Math.sin(waves[w][1] * t + waves[w][2]);
      if (m < 0.5) m = 0.5;
      var c = Math.cos(t), s = Math.sin(t);
      var rad = m / Math.sqrt((c / rx) * (c / rx) + (s / ry) * (s / ry));
      pts.push({ x: cx + rad * c, y: cy + rad * s });
    }
    return pts;
  }

  // One sideways figure-8. The two lobes meet at the middle; that meeting is the bridge.
  function eight(n) {
    var pts = [];
    for (var i = 0; i < n; i++) {
      var t = (i + 0.5) / n * TAU;
      pts.push({ x: 640 + Math.sin(t) * 468, y: 378 + Math.sin(t * 2) * 226 });
    }
    return pts;
  }

  function tangentAt(pts, i) {
    var n = pts.length;
    var a = pts[i], b = pts[(i + 1) % n];
    var dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
    return { x: a.x, y: a.y, tx: dx / L, ty: dy / L };
  }

  function bake(spec) {
    var pts = spec.pts, n = pts.length, i, a, b, dx, dy;
    var cum = new Array(n + 1);
    cum[0] = 0;
    for (i = 0; i < n; i++) {
      a = pts[i]; b = pts[(i + 1) % n];
      dx = b.x - a.x; dy = b.y - a.y;
      cum[i + 1] = cum[i] + (Math.hypot(dx, dy) || 0.001);
    }
    var total = cum[n];
    var ang = new Array(n);
    for (i = 0; i < n; i++) ang[i] = Math.atan2(pts[(i + 1) % n].y - pts[i].y, pts[(i + 1) % n].x - pts[i].x);
    var line = new Array(n), curv = new Array(n);
    for (i = 0; i < n; i++) {
      var t = tangentAt(pts, i);
      var big = wrap(ang[(i + 8) % n] - ang[i]);
      var mag = clamp(big * 26, -22, 22);
      // Screen-clockwise normal. A clockwise bend offsets onto the inside of the corner.
      line[i] = { x: pts[i].x + (-t.ty) * mag, y: pts[i].y + t.tx * mag };
      curv[i] = Math.abs(big);
    }
    var cps = [], gates = 8, half = spec.width * 0.58;
    for (i = 0; i < gates; i++) {
      var s = i / gates * total;
      var p = at(pts, cum, total, s);
      cps.push({
        i: i, s: s, x: p.x, y: p.y, tx: p.tx, ty: p.ty, nx: -p.ty, ny: p.tx,
        ax: p.x + (-p.ty) * half, ay: p.y + p.tx * half,
        bx: p.x - (-p.ty) * half, by: p.y - p.tx * half
      });
    }
    function fracS(f) { return f * total; }
    var zones = (spec.zones || []).map(function (z) { return { kind: z.kind, s0: fracS(z.t0), s1: fracS(z.t1) }; });
    var pads = (spec.pads || []).map(fracS);
    var boxes = (spec.boxes || []).map(function (f) { return { s: fracS(f) }; });
    var decor = (spec.decor || []).slice();
    return {
      id: spec.id, name: spec.name, cup: spec.cup, theme: spec.theme, par: spec.par,
      pts: pts, line: line, curv: curv, cum: cum, total: total, width: spec.width,
      cps: cps, zones: zones, pads: pads, boxes: boxes, decor: decor,
      bridge: spec.bridge || null
    };
  }

  function at(pts, cum, total, s) {
    var n = pts.length;
    s = ((s % total) + total) % total;
    var lo = 0, hi = n - 1;
    while (lo < hi) {
      var mid = (lo + hi + 1) >> 1;
      if (cum[mid] <= s) lo = mid; else hi = mid - 1;
    }
    var seg = lo, span = cum[seg + 1] - cum[seg] || 1, u = (s - cum[seg]) / span;
    var a = pts[seg], b = pts[(seg + 1) % n];
    var dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
    return { x: a.x + dx * u, y: a.y + dy * u, tx: dx / L, ty: dy / L, seg: seg, s: s };
  }

  // A few toys sitting off the asphalt. Seeded, so the picture never changes.
  function sprinkle(theme, salt) {
    var x = (salt * 1103515245 + 12345) >>> 0;
    function rnd() { x = (1664525 * x + 1013904223) >>> 0; return x / 4294967296; }
    var kinds = theme === 'toy'
      ? ['block', 'block', 'crayon', 'ball', 'block']
      : ['planet', 'cup', 'star', 'cookie', 'planet'];
    var cols = theme === 'toy'
      ? ['#ff5a7a', '#ffd23f', '#4dabff', '#7d5cff', '#3ddc84', '#ff8a3d']
      : ['#8be9ff', '#ffe28a', '#d9c6ff', '#ffb4d9', '#b8ff9a'];
    var out = [], k, tries = 0;
    while (out.length < 14 && tries < 80) {
      tries++;
      out.push({
        k: kinds[(rnd() * kinds.length) | 0],
        x: 70 + rnd() * 1140,
        y: 64 + rnd() * 590,
        s: 0.6 + rnd() * 0.8,
        c: cols[(rnd() * cols.length) | 0],
        r: rnd() * TAU
      });
    }
    return out;
  }

  var N = 128;
  var specs = [
    { id: 0, name: 'حلقة السجادة', cup: 0, theme: 'toy', par: 74, width: 124,
      pts: polar(640, 386, 430, 226, N, [[0.055, 2, 0.4], [0.04, 5, 1.1]]),
      zones: [{ kind: 'carpet', t0: 0.12, t1: 0.30 }],
      pads: [0.46, 0.82], boxes: [0.34, 0.68] },
    { id: 1, name: 'طريق المكعبات', cup: 0, theme: 'toy', par: 76, width: 118,
      pts: polar(640, 384, 418, 220, N, [[0.11, 3, 0.3], [0.045, 6, 1.4]]),
      zones: [{ kind: 'carpet', t0: 0.55, t1: 0.72 }],
      pads: [0.22, 0.74], boxes: [0.4, 0.9] },
    { id: 2, name: 'منعطف الأقلام', cup: 0, theme: 'toy', par: 75, width: 120,
      pts: polar(640, 388, 424, 218, N, [[0.08, 4, 0.9], [0.035, 7, 0.2]]),
      zones: [{ kind: 'carpet', t0: 0.04, t1: 0.16 }],
      pads: [0.28, 0.62], boxes: [0.18, 0.78] },
    { id: 3, name: 'حلبة الدمى', cup: 0, theme: 'toy', par: 77, width: 122,
      pts: polar(640, 386, 408, 230, N, [[0.13, 2, 0.7], [0.04, 5, 2.1]]),
      zones: [{ kind: 'carpet', t0: 0.38, t1: 0.52 }],
      pads: [0.18, 0.7], boxes: [0.3, 0.86] },
    { id: 4, name: 'زلاجة السكر', cup: 1, theme: 'space', par: 76, width: 122,
      pts: polar(640, 384, 426, 222, N, [[0.07, 3, 0.5], [0.04, 8, 1.0]]),
      zones: [{ kind: 'ice', t0: 0.48, t1: 0.70 }],
      pads: [0.2, 0.84], boxes: [0.36, 0.74] },
    { id: 5, name: 'قفزة القمر', cup: 1, theme: 'space', par: 75, width: 120,
      pts: polar(640, 388, 422, 224, N, [[0.09, 2, 1.2], [0.04, 4, 0.4]]),
      zones: [{ kind: 'ramp', t0: 0.40, t1: 0.50 }],
      pads: [0.24, 0.66], boxes: [0.16, 0.8] },
    { id: 6, name: 'مدار البسكويت', cup: 1, theme: 'space', par: 78, width: 116,
      pts: polar(640, 386, 414, 216, N, [[0.085, 3, 2.0], [0.05, 5, 0.6]]),
      zones: [{ kind: 'ice', t0: 0.18, t1: 0.32 }, { kind: 'ramp', t0: 0.60, t1: 0.70 }],
      pads: [0.08, 0.5], boxes: [0.4, 0.88] },
    { id: 7, name: 'جسر النجوم', cup: 1, theme: 'space', par: 80, width: 112,
      pts: eight(160),
      zones: [{ kind: 'ice', t0: 0.18, t1: 0.30 }],
      pads: [0.12, 0.62], boxes: [0.4, 0.84],
      bridge: { over0: 0.5, over1: 1 } }
  ];

  var TRACKS = specs.map(function (spec) {
    spec.decor = sprinkle(spec.theme, spec.id + 3);
    var track = bake(spec);
    // Drop decorations that landed on the asphalt.
    track.decor = track.decor.filter(function (d) {
      var best = 1e9, i, a, b, dx, dy, L2, u, x, y;
      for (i = 0; i < track.pts.length; i++) {
        a = track.pts[i]; b = track.pts[(i + 1) % track.pts.length];
        dx = b.x - a.x; dy = b.y - a.y; L2 = dx * dx + dy * dy || 1;
        u = clamp(((d.x - a.x) * dx + (d.y - a.y) * dy) / L2, 0, 1);
        x = a.x + dx * u - d.x; y = a.y + dy * u - d.y;
        if (x * x + y * y < best) best = x * x + y * y;
      }
      return best > (track.width * 0.5 + 28) * (track.width * 0.5 + 28);
    });
    return track;
  });

  var KARTS = [
    { id: 'spark', name: 'برق', speed: 1, grip: 1, accel: 1, price: 0, blurb: 'متوازن وسهل' },
    { id: 'bubble', name: 'فقاعة', speed: 0.94, grip: 1.2, accel: 0.98, price: 0, blurb: 'يلتصق بالمنعطف' },
    { id: 'rocket', name: 'صاروخ', speed: 1.06, grip: 0.84, accel: 0.9, price: 90, blurb: 'سريع وينزلق' },
    { id: 'bee', name: 'نحلة', speed: 0.96, grip: 1.04, accel: 1.18, price: 80, blurb: 'ينطلق بسرعة' },
    { id: 'slide', name: 'زلّاق', speed: 1.03, grip: 0.78, accel: 1.04, price: 130, blurb: 'ملك الانزلاق' },
    { id: 'crown', name: 'تاج', speed: 1.05, grip: 1.06, accel: 1.06, price: 200, blurb: 'قوي في كل شيء' }
  ];

  var PAINTS = [
    { name: 'أحمر', color: '#ff4b4b', price: 0 },
    { name: 'أزرق', color: '#3aa0ff', price: 0 },
    { name: 'أصفر', color: '#ffd23f', price: 25 },
    { name: 'أخضر', color: '#3ddc84', price: 25 },
    { name: 'بنفسجي', color: '#b06bff', price: 45 },
    { name: 'برتقالي', color: '#ff8a2a', price: 45 },
    { name: 'وردي', color: '#ff6fa8', price: 70 },
    { name: 'سماوي', color: '#2ee6ff', price: 70 }
  ];

  var STICKERS = [
    { name: 'بدون', id: 'none', price: 0 },
    { name: 'نجمة', id: 'star', price: 30 },
    { name: 'برق', id: 'bolt', price: 30 },
    { name: 'قلب', id: 'heart', price: 50 },
    { name: 'كعكة', id: 'cookie', price: 50 }
  ];

  var HATS = [
    { name: 'بدون', id: 'none', price: 0 },
    { name: 'قبعة', id: 'cap', price: 40 },
    { name: 'تاج صغير', id: 'crown', price: 80 },
    { name: 'خوذة هلال', id: 'moon', price: 60 },
    { name: 'أذن دب', id: 'ears', price: 70 },
    { name: 'مروحة', id: 'prop', price: 100 }
  ];

  var HORNS = [
    { name: 'بيب', id: 'beep', price: 0 },
    { name: 'دوب', id: 'doot', price: 25 },
    { name: 'جرس', id: 'bell', price: 25 },
    { name: 'صفارة', id: 'whistle', price: 40 },
    { name: 'نغمة', id: 'tune', price: 60 }
  ];

  var ITEMS = [
    { id: 'jelly', name: 'بركة الجيلي' },
    { id: 'spring', name: 'نابض' },
    { id: 'shield', name: 'فقاعة' },
    { id: 'cookie', name: 'كعكة التوربو' },
    { id: 'rocket', name: 'صاروخ لعبة' }
  ];

  var CPU = [
    { name: 'فلفول', color: '#ff5a5a', body: 2 },
    { name: 'دونات', color: '#ffd23f', body: 1 },
    { name: 'بلبل', color: '#3ddc84', body: 3 },
    { name: 'قمقم', color: '#b06bff', body: 4 },
    { name: 'زقزوق', color: '#ff8a2a', body: 5 },
    { name: 'لولو', color: '#49b6ff', body: 0 }
  ];

  var CUPS = [
    { name: 'كأس غرفة الألعاب', theme: 'toy' },
    { name: 'كأس المطبخ والفضاء', theme: 'space' }
  ];

  window.TKD = {
    TRACKS: TRACKS, KARTS: KARTS, PAINTS: PAINTS, STICKERS: STICKERS, HATS: HATS,
    HORNS: HORNS, ITEMS: ITEMS, CPU: CPU, CUPS: CUPS, at: at
  };
})();
