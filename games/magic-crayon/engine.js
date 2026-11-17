/* القلم السحري (Magic Crayon: Turbo Stunt Rider) — Pure 2D stunt-pod & smart crayon physics.
 * Dual Node (module.exports) + Browser (window.MCEngine). Zero DOM, timers, random, or Kit globals. */
(function (root) {
  'use strict';
  var MCEngine = {};
  var W = 1280, H = 720;
  MCEngine.W = W; MCEngine.H = H;
  MCEngine.BALL_R = 22; MCEngine.WALL_R = 8; MCEngine.INK_R = 8;
  MCEngine.STAR_R = 28; MCEngine.GOAL_R = 46;
  MCEngine.MIN_RAW = 10; MCEngine.MAX_SEG = 14; MCEngine.SNAP_R = 26;
  MCEngine.GRAV = 760; MCEngine.MAX_V = 980; MCEngine.SUB = 5; MCEngine.PER_WORLD = 5;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  MCEngine.clamp = clamp;

  MCEngine.INKS = [
    { id: 'bridge', key: '1', name: 'قلم الجسر', color: '#2563eb', hi: '#60a5fa', cost: 1.0 },
    { id: 'turbo',  key: '2', name: 'قلم التيربو', color: '#f97316', hi: '#fde047', cost: 1.15 },
    { id: 'spring', key: '3', name: 'قلم القفز', color: '#10b981', hi: '#6ee7b7', cost: 1.15 }
  ];

  MCEngine.WORLDS = [
    { id: 'arena',   name: 'حلبة البداية',   color: '#2563eb', skyTop: '#dbeafe', skyBot: '#fef9c3', grid: '#bfdbfe', beam: '#f59e0b' },
    { id: 'factory', name: 'مصنع التيربو',   color: '#f97316', skyTop: '#e0f2fe', skyBot: '#ffedd5', grid: '#fed7aa', beam: '#0284c7' },
    { id: 'volcano', name: 'بركان المغامرة', color: '#dc2626', skyTop: '#fee2e2', skyBot: '#fef08a', grid: '#fecaca', beam: '#7c2d12' }
  ];

  MCEngine.PODS = [
    { id: 'rocket',  name: 'عربة كرّوم النفاثة', body: '#ef4444', trim: '#fbbf24', wheel: '#1e293b', price: 0 },
    { id: 'flame',   name: 'كرة اللهب',          body: '#f97316', trim: '#fde047', wheel: '#7c2d12', price: 8 },
    { id: 'monster', name: 'عجلة الوحش',         body: '#22c55e', trim: '#38bdf8', wheel: '#0f172a', price: 14 },
    { id: 'space',   name: 'كبسولة الفضاء',      body: '#f8fafc', trim: '#06b6d4', wheel: '#334155', price: 20 },
    { id: 'shark',   name: 'قرش النيون',         body: '#8b5cf6', trim: '#22d3ee', wheel: '#1e1b4b', price: 28 }
  ];

  MCEngine.TRAILS = [
    { id: 'comic',   name: 'طيف الكوميكس', colors: ['#38bdf8', '#fbbf24'], price: 0 },
    { id: 'spark',   name: 'شرارات البرق', colors: ['#fde047', '#38bdf8', '#ffffff'], price: 6 },
    { id: 'rainbow', name: 'قوس قزح',      colors: ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#a855f7'], price: 12 },
    { id: 'blaze',   name: 'نار التيربو',  colors: ['#ef4444', '#f97316', '#fde047'], price: 18 }
  ];

  MCEngine.TIERS = {
    easy:   { id: 'easy',   name: 'سهل',   inkMult: 2.0,  starMagnet: 2.4, goalMagnet: 1.28, bounceAssist: 1.06, hazardSpeed: 0.78, shield: 1, showGuide: true },
    normal: { id: 'normal', name: 'متوسط', inkMult: 1.35, starMagnet: 1.2, goalMagnet: 1.08, bounceAssist: 1.0,  hazardSpeed: 1.0,  shield: 0, showGuide: false },
    hero:   { id: 'hero',   name: 'بطل',   inkMult: 1.08, starMagnet: 1.0, goalMagnet: 1.0,  bounceAssist: 0.98, hazardSpeed: 1.25, shield: 0, showGuide: false }
  };

  MCEngine.params = function (tierId, ddaVal) {
    var T = MCEngine.TIERS[tierId] || MCEngine.TIERS.normal;
    var d = clamp(typeof ddaVal === 'number' && ddaVal === ddaVal ? ddaVal : 0.35, 0, 1);
    return {
      tier: T.id, inkMult: T.inkMult * (1.08 - 0.16 * d), starMagnet: T.starMagnet * (1.06 - 0.1 * d),
      goalMagnet: T.goalMagnet, bounceAssist: T.bounceAssist, hazardSpeed: T.hazardSpeed * (0.94 + 0.12 * d),
      shield: T.shield, showGuide: T.showGuide
    };
  };

  /* --------------------------------------------------- 15 Open Stunt Stages */
  var RAW = [
    // World 1: حلبة البداية (1-1 .. 1-5)
    { name: 'جسر الانطلاق', start: [140, 272], goal: [1085, 318], ink: 680, par: 460,
      walls: [[70, 292, 380, 344], [740, 356, 1180, 376], [60, 642, 1220, 642], [60, 480, 60, 642], [1220, 480, 1220, 642]],
      crates: [{ x: 865, y: 336, kind: 'wood' }, { x: 920, y: 338, kind: 'wood' }],
      stars: [[475, 322], [565, 324], [655, 328]], guide: [[380, 344], [560, 350], [740, 356]] },
    { name: 'تحطيم الصناديق', start: [130, 182], goal: [1095, 430], ink: 720, par: 500,
      walls: [[70, 202, 340, 294], [500, 380, 720, 400], [880, 468, 1185, 486], [60, 645, 1220, 645]],
      crates: [{ x: 590, y: 360, kind: 'wood' }, { x: 640, y: 362, kind: 'wood' }, { x: 615, y: 320, kind: 'wood' }],
      stars: [[420, 316], [615, 320], [805, 416]], guide: [[340, 294], [500, 380]] },
    { name: 'قفزة السبرنغ', start: [130, 224], goal: [1075, 222], ink: 620, par: 380,
      walls: [[70, 244, 350, 352], [755, 266, 1165, 282], [1165, 105, 1165, 282], [60, 645, 1220, 645]],
      crates: [{ x: 915, y: 248, kind: 'wood' }], stars: [[460, 385], [600, 215], [735, 210]],
      guide: [[415, 448], [560, 434]], guideInk: 2 },
    { name: 'مدفع الحلبة', start: [130, 272], goal: [1090, 304], ink: 620, par: 360,
      walls: [[70, 292, 315, 345], [880, 344, 1180, 364], [1180, 115, 1180, 364], [60, 645, 1220, 645]],
      cannons: [{ x: 515, y: 412, ang: -0.54, speed: 770 }], rings: [{ x: 720, y: 306, r: 46, boost: 130 }],
      crates: [{ x: 975, y: 324, kind: 'wood' }], stars: [[415, 362], [720, 306], [855, 278]], guide: [[315, 345], [500, 415]] },
    { name: 'مهرجان القفز', start: [125, 182], goal: [1090, 326], ink: 700, par: 440,
      walls: [[70, 202, 320, 292], [505, 392, 700, 336], [860, 366, 1185, 386], [1185, 115, 1185, 386], [60, 645, 1220, 645]],
      rings: [{ x: 760, y: 312, r: 48, boost: 175 }],
      crates: [{ x: 585, y: 342, kind: 'wood' }, { x: 635, y: 328, kind: 'wood' }],
      stars: [[415, 322], [760, 312], [890, 325]], guide: [[320, 292], [505, 392]] },
    // World 2: مصنع التيربو (2-1 .. 2-5)
    { name: 'مسار التيربو', start: [135, 444], goal: [1095, 224], ink: 720, par: 480,
      walls: [[70, 468, 305, 484], [665, 430, 950, 266], [950, 266, 1185, 278], [1185, 100, 1185, 278], [60, 645, 1220, 645]],
      crates: [{ x: 995, y: 244, kind: 'wood' }], stars: [[485, 438], [785, 330], [935, 240]],
      guide: [[305, 484], [485, 468], [665, 430]], guideInk: 1 },
    { name: 'عمود الرياح', start: [130, 428], goal: [1090, 264], ink: 640, par: 380,
      walls: [[70, 448, 315, 488], [755, 304, 1185, 324], [1185, 100, 1185, 324], [60, 645, 1220, 645]],
      fans: [{ x: 475, y: 135, w: 230, h: 455, dx: 0.22, dy: -1, force: 2320 }],
      crates: [{ x: 895, y: 284, kind: 'wood' }], stars: [[410, 476], [605, 430], [735, 265]] },
    { name: 'الجسر المتحرك', start: [130, 228], goal: [1095, 384], ink: 720, par: 480,
      walls: [[70, 248, 295, 298], [860, 424, 1185, 444], [1185, 140, 1185, 444], [60, 645, 1220, 645]],
      movers: [{ ax: 470, ay: 368, bx: 705, by: 382, dx: 18, dy: 10, speed: 1.35, phase: 0 }],
      crates: [{ x: 960, y: 404, kind: 'wood' }], stars: [[385, 315], [585, 344], [785, 388]] },
    { name: 'حلقات النيترو', start: [125, 302], goal: [1090, 288], ink: 640, par: 380,
      walls: [[70, 322, 275, 356], [910, 328, 1185, 348], [1185, 100, 1185, 348], [60, 645, 1220, 645]],
      rings: [{ x: 555, y: 290, r: 48, boost: 165 }, { x: 775, y: 282, r: 48, boost: 165 }],
      stars: [[405, 315], [555, 290], [775, 282]] },
    { name: 'مصنع الأبطال', start: [120, 452], goal: [1095, 258], ink: 740, par: 480,
      walls: [[70, 472, 265, 500], [910, 298, 1185, 318], [1185, 95, 1185, 318], [60, 645, 1220, 645]],
      cannons: [{ x: 430, y: 512, ang: -0.74, speed: 745 }],
      fans: [{ x: 570, y: 135, w: 215, h: 350, dx: 0.3, dy: -0.96, force: 2050 }],
      crates: [{ x: 985, y: 278, kind: 'wood' }], stars: [[345, 485], [645, 330], [840, 195]] },
    // World 3: بركان المغامرة (3-1 .. 3-5)
    { name: 'فوق الحمم', start: [130, 260], goal: [1095, 324], ink: 780, par: 580,
      walls: [[70, 280, 320, 340], [850, 364, 1185, 384], [1185, 120, 1185, 384]],
      hazards: [{ kind: 'lava', x: 320, y: 605, w: 540, h: 65 }], rings: [{ x: 590, y: 298, r: 48, boost: 155 }],
      crates: [{ x: 945, y: 344, kind: 'wood' }], stars: [[445, 305], [590, 298], [745, 302]] },
    { name: 'سلسلة المتفجرات', start: [125, 218], goal: [1095, 298], ink: 680, par: 420,
      walls: [[70, 238, 315, 322], [485, 412, 755, 420], [925, 338, 1185, 358], [1185, 95, 1185, 358]],
      hazards: [{ kind: 'lava', x: 315, y: 605, w: 620, h: 65 }],
      crates: [{ x: 565, y: 388, kind: 'tnt' }, { x: 615, y: 388, kind: 'wood' }, { x: 665, y: 388, kind: 'tnt' }, { x: 615, y: 344, kind: 'wood' }],
      stars: [[400, 344], [615, 320], [830, 268]] },
    { name: 'مناشير البركان', start: [125, 318], goal: [1095, 320], ink: 680, par: 420,
      walls: [[70, 338, 295, 392], [815, 362, 1185, 380], [1185, 95, 1185, 380]],
      hazards: [{ kind: 'lava', x: 295, y: 605, w: 610, h: 65 }, { kind: 'saw', x: 595, y: 425, r: 34 }],
      rings: [{ x: 615, y: 202, r: 52, boost: 215 }], stars: [[405, 365], [615, 202], [790, 275]] },
    { name: 'برج الرياح الناري', start: [125, 450], goal: [1125, 358], ink: 740, par: 480,
      walls: [[70, 470, 275, 500], [940, 386, 1185, 404], [1185, 130, 1185, 404]],
      hazards: [{ kind: 'lava', x: 275, y: 605, w: 665, h: 65 }, { kind: 'saw', x: 785, y: 520, r: 32 }],
      fans: [{ x: 505, y: 230, w: 215, h: 325, dx: 0.24, dy: -1, force: 2350 }],
      movers: [{ ax: 730, ay: 358, bx: 905, by: 372, dx: 8, dy: 0, speed: 1.25, phase: 0 }],
      crates: [{ x: 995, y: 362, kind: 'tnt' }], stars: [[380, 488], [605, 442], [935, 352]] },
    { name: 'قمة البطل', start: [120, 240], goal: [1110, 244], ink: 740, par: 460,
      walls: [[70, 260, 265, 312], [755, 354, 920, 362], [995, 288, 1200, 304], [1200, 90, 1200, 304]],
      hazards: [{ kind: 'lava', x: 265, y: 608, w: 740, h: 62 }, { kind: 'saw', x: 565, y: 465, r: 35 }],
      cannons: [{ x: 455, y: 372, ang: -0.55, speed: 755 }], rings: [{ x: 655, y: 248, r: 50, boost: 130 }],
      crates: [{ x: 835, y: 330, kind: 'tnt' }, { x: 875, y: 332, kind: 'wood' }],
      stars: [[355, 332], [655, 248], [945, 248]] }
  ];

  MCEngine.SANDBOX_RAW = {
    id: 'sandbox', index: 15, world: 0, sandbox: true, infiniteInk: true,
    name: 'الملعب الحر', start: [145, 228], goal: [1110, 232], ink: 999999, par: 999999,
    walls: [[70, 248, 300, 292], [950, 272, 1195, 288], [1195, 95, 1195, 288], [60, 480, 175, 640], [175, 640, 1105, 640], [1105, 640, 1220, 480]],
    cannons: [{ x: 350, y: 585, ang: -0.76, speed: 820 }],
    fans: [{ x: 865, y: 285, w: 175, h: 345, dx: -0.18, dy: -1, force: 1850 }],
    rings: [{ x: 560, y: 350, r: 48, boost: 165 }, { x: 740, y: 265, r: 48, boost: 165 }],
    crates: [{ x: 520, y: 616, kind: 'wood' }, { x: 570, y: 616, kind: 'tnt' }, { x: 620, y: 616, kind: 'wood' }],
    stars: [[445, 325], [650, 285], [885, 235]]
  };

  function makeSeg(ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy);
    return l < 0.001
      ? { ax: ax, ay: ay, bx: bx, by: by, dx: 1, dy: 0, l: 0, nx: 0, ny: -1 }
      : { ax: ax, ay: ay, bx: bx, by: by, dx: dx / l, dy: dy / l, l: l, nx: dy / l, ny: -dx / l };
  }

  function normalizeRaw(r, i) {
    var wi = r.sandbox ? 0 : Math.floor(i / MCEngine.PER_WORLD), li = i % MCEngine.PER_WORLD;
    return {
      index: i, id: r.id || ((wi + 1) + '-' + (li + 1)), world: wi,
      sandbox: !!r.sandbox, infiniteInk: !!r.infiniteInk, name: r.name,
      start: [r.start[0], r.start[1]], goal: { x: r.goal[0], y: r.goal[1], r: MCEngine.GOAL_R },
      inkBase: r.ink, inkPar: r.par,
      walls: (r.walls || []).map(function (w) { return w.slice(); }),
      movers: (r.movers || []).map(function (m) { return Object.assign({}, m); }),
      crates: (r.crates || []).map(function (c) { return { x: c.x, y: c.y, kind: c.kind || 'wood', size: 38 }; }),
      cannons: (r.cannons || []).map(function (c) { return Object.assign({}, c); }),
      fans: (r.fans || []).map(function (f) {
        var l = Math.hypot(f.dx, f.dy) || 1;
        return { x: f.x, y: f.y, w: f.w, h: f.h, dx: f.dx / l, dy: f.dy / l, force: f.force };
      }),
      rings: (r.rings || []).map(function (rg) { return Object.assign({}, rg); }),
      hazards: (r.hazards || []).map(function (hz) { return Object.assign({}, hz); }),
      stars: (r.stars || []).map(function (s) { return [s[0], s[1]]; }),
      guide: r.guide ? r.guide.map(function (p) { return [p[0], p[1]]; }) : null,
      guideInk: r.guideInk || 0
    };
  }

  MCEngine.STAGES = RAW.map(normalizeRaw);
  MCEngine.SANDBOX = normalizeRaw(MCEngine.SANDBOX_RAW, 15);

  MCEngine.build = function (stageOrIdx, P) {
    P = P || MCEngine.params('normal', 0.35);
    var base = stageOrIdx === 'sandbox' || stageOrIdx === 15 ? MCEngine.SANDBOX : MCEngine.STAGES[clamp(stageOrIdx | 0, 0, MCEngine.STAGES.length - 1)];
    return {
      index: base.index, id: base.id, world: base.world, sandbox: base.sandbox, infiniteInk: base.infiniteInk,
      name: base.name, start: base.start.slice(), goal: { x: base.goal.x, y: base.goal.y, r: base.goal.r * P.goalMagnet },
      inkMax: base.infiniteInk ? 999999 : Math.round(base.inkBase * P.inkMult), inkPar: base.inkPar,
      wallSegs: base.walls.map(function (w) { return makeSeg(w[0], w[1], w[2], w[3]); }),
      walls: base.walls.map(function (w) { return w.slice(); }),
      movers: base.movers.map(function (m) { return Object.assign({}, m); }),
      crates: base.crates.map(function (c) { return Object.assign({ smashed: false }, c); }),
      cannons: base.cannons.map(function (c) { return Object.assign({ cd: 0 }, c); }),
      fans: base.fans.map(function (f) { return Object.assign({}, f); }),
      rings: base.rings.map(function (rg) { return Object.assign({ cd: 0 }, rg); }),
      hazards: base.hazards.map(function (hz) { return Object.assign({}, hz); }),
      stars: base.stars.map(function (s) { return [s[0], s[1]]; }),
      guide: base.guide, guideInk: base.guideInk
    };
  };

  function makeBall(L, P) {
    return { x: L.start[0], y: L.start[1], vx: 0, vy: 0, ang: 0, spin: 0, grounded: 0, hopAvail: true, turboT: 0, shield: P.shield || 0 };
  }

  MCEngine.create = function (stageOrIdx, P) {
    P = P || MCEngine.params('normal', 0.35);
    var L = MCEngine.build(stageOrIdx, P);
    return {
      L: L, P: P, t: 0, rollT: 0, rolling: false, done: false, crashed: false, crashT: 0,
      ink: 0, inkUsed: 0, score: 0, strokes: [], active: null, ball: makeBall(L, P),
      movers: L.movers.map(function (m) { return makeSeg(m.ax, m.ay, m.bx, m.by); }),
      moverV: L.movers.map(function () { return { vx: 0, vy: 0 }; }),
      stars: L.stars.map(function () { return false; }),
      starsPos: L.stars.map(function (s) { return [s[0], s[1]]; }),
      starsGot: 0, input: { steer: 0 }, sfxCd: { turbo: 0, spring: 0, wind: 0 }, ev: []
    };
  };

  MCEngine.resetPod = function (w) {
    w.rolling = false; w.rollT = 0; w.done = false; w.crashed = false; w.crashT = 0;
    w.ball = makeBall(w.L, w.P);
    w.stars = w.L.stars.map(function () { return false; });
    w.starsPos = w.L.stars.map(function (s) { return [s[0], s[1]]; });
    w.starsGot = 0;
    for (var i = 0; i < w.L.crates.length; i++) w.L.crates[i].smashed = false;
    for (i = 0; i < w.L.cannons.length; i++) w.L.cannons[i].cd = 0;
    for (i = 0; i < w.L.rings.length; i++) w.L.rings[i].cd = 0;
    w.ev.length = 0;
  };

  MCEngine.resetStage = function (w) {
    w.t = 0; w.strokes.length = 0; w.active = null; w.inkUsed = 0; w.score = 0;
    MCEngine.resetPod(w);
  };

  /* -------------------- Smart Crayon Smoothing & Gap Sealing -------------- */
  function snapPoint(w, x, y, skipStroke) {
    var bestX = x, bestY = y, bestD = MCEngine.SNAP_R, i, wl, st, p0, p1, d;
    for (i = 0; i < w.L.walls.length; i++) {
      wl = w.L.walls[i];
      d = Math.hypot(x - wl[0], y - wl[1]); if (d < bestD) { bestD = d; bestX = wl[0]; bestY = wl[1]; }
      d = Math.hypot(x - wl[2], y - wl[3]); if (d < bestD) { bestD = d; bestX = wl[2]; bestY = wl[3]; }
    }
    for (i = 0; i < w.strokes.length; i++) {
      st = w.strokes[i];
      if (st === skipStroke || st.pts.length < 2) continue;
      p0 = st.pts[0]; p1 = st.pts[st.pts.length - 1];
      d = Math.hypot(x - p0[0], y - p0[1]); if (d < bestD) { bestD = d; bestX = p0[0]; bestY = p0[1]; }
      d = Math.hypot(x - p1[0], y - p1[1]); if (d < bestD) { bestD = d; bestX = p1[0]; bestY = p1[1]; }
    }
    return [bestX, bestY];
  }

  function smoothAndSubdivide(raw) {
    if (raw.length < 2) return raw.slice();
    var dense = [raw[0]], i, k, a, b, d, n;
    for (i = 1; i < raw.length; i++) {
      a = raw[i - 1]; b = raw[i]; d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      n = Math.max(1, Math.ceil(d / 36));
      for (k = 1; k <= n; k++) dense.push([a[0] + (b[0] - a[0]) * (k / n), a[1] + (b[1] - a[1]) * (k / n)]);
    }
    var cur = dense;
    if (cur.length >= 3) {
      for (var pass = 0; pass < 2; pass++) {
        var next = [cur[0]];
        for (i = 0; i < cur.length - 1; i++) {
          a = cur[i]; b = cur[i + 1];
          next.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]]);
          next.push([0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
        }
        next.push(cur[cur.length - 1]);
        cur = next;
      }
    }
    var out = [cur[0]];
    for (i = 1; i < cur.length; i++) {
      a = out[out.length - 1]; b = cur[i]; d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (d < 3.5 && i < cur.length - 1) continue;
      n = Math.max(1, Math.ceil(d / MCEngine.MAX_SEG));
      for (k = 1; k <= n; k++) out.push([a[0] + (b[0] - a[0]) * (k / n), a[1] + (b[1] - a[1]) * (k / n)]);
    }
    return out;
  }

  function rebuildStroke(st) {
    st.pts = smoothAndSubdivide(st.raw);
    st.segs = [];
    for (var i = 0; i < st.pts.length - 1; i++) {
      var sg = makeSeg(st.pts[i][0], st.pts[i][1], st.pts[i + 1][0], st.pts[i + 1][1]);
      if (sg.l > 0.2) st.segs.push(sg);
    }
    var rawLen = 0;
    for (i = 1; i < st.raw.length; i++) rawLen += Math.hypot(st.raw[i][0] - st.raw[i - 1][0], st.raw[i][1] - st.raw[i - 1][1]);
    st.len = rawLen;
    st.cost = rawLen * MCEngine.INKS[st.ink].cost;
  }

  function recomputeInk(w) {
    var sum = 0;
    for (var i = 0; i < w.strokes.length; i++) sum += w.strokes[i].cost;
    w.inkUsed = sum;
  }

  MCEngine.setInk = function (w, inkIdx) { w.ink = clamp(inkIdx | 0, 0, MCEngine.INKS.length - 1); };

  MCEngine.beginStroke = function (w, x, y, inkOpt) {
    if (w.done || w.crashed) return false;
    if (!w.L.infiniteInk && w.inkUsed >= w.L.inkMax - 2) { w.ev.push({ t: 'noInk', x: x, y: y }); return false; }
    if (w.active) MCEngine.endStroke(w);
    var ink = inkOpt != null ? clamp(inkOpt | 0, 0, 2) : w.ink;
    var sn = snapPoint(w, clamp(x, 24, W - 24), clamp(y, 82, H - 20), null);
    w.active = { ink: ink, raw: [[sn[0], sn[1]]], pts: [[sn[0], sn[1]]], segs: [], len: 0, cost: 0, boing: 0, pushed: false };
    return true;
  };

  MCEngine.moveStroke = function (w, x, y) {
    var st = w.active;
    if (!st || w.done || w.crashed) return false;
    x = clamp(x, 24, W - 24); y = clamp(y, 82, H - 20);
    var last = st.raw[st.raw.length - 1], dx = x - last[0], dy = y - last[1], d = Math.hypot(dx, dy);
    if (d < (st.raw.length === 1 ? 6 : MCEngine.MIN_RAW)) return false;
    var mult = MCEngine.INKS[st.ink].cost;
    if (!w.L.infiniteInk) {
      var remLen = (w.L.inkMax - w.inkUsed) / mult;
      if (remLen <= 1) { w.ev.push({ t: 'noInk', x: x, y: y }); MCEngine.endStroke(w); return false; }
      if (d > remLen) { x = last[0] + (dx / d) * remLen; y = last[1] + (dy / d) * remLen; }
    }
    if (st.raw.length >= 2) {
      var prev = st.raw[st.raw.length - 2];
      if ((last[0] - prev[0]) * dx + (last[1] - prev[1]) * dy < 0 && d < 18) return false;
    }
    st.raw.push([x, y]);
    if (!st.pushed) { st.pushed = true; w.strokes.push(st); }
    rebuildStroke(st);
    recomputeInk(w);
    w.ev.push({ t: 'draw', x: x, y: y, ink: st.ink });
    return true;
  };

  MCEngine.endStroke = function (w) {
    var st = w.active;
    if (!st) return false;
    w.active = null;
    if (!st.pushed || st.raw.length < 2) return false;
    var end = st.raw[st.raw.length - 1], sn = snapPoint(w, end[0], end[1], st);
    var sd = Math.hypot(sn[0] - end[0], sn[1] - end[1]);
    if (sd > 0.5 && st.len >= 18 && (w.L.infiniteInk || w.inkUsed + sd * MCEngine.INKS[st.ink].cost <= w.L.inkMax + 18)) {
      st.raw.push([sn[0], sn[1]]);
      rebuildStroke(st);
      recomputeInk(w);
    }
    w.ev.push({ t: 'strokeEnd', ink: st.ink });
    return true;
  };

  MCEngine.drawStroke = function (w, pts, inkOpt) {
    if (!pts || pts.length < 2 || !MCEngine.beginStroke(w, pts[0][0], pts[0][1], inkOpt)) return false;
    var ok = false;
    for (var i = 1; i < pts.length; i++) if (MCEngine.moveStroke(w, pts[i][0], pts[i][1])) ok = true;
    MCEngine.endStroke(w);
    return ok;
  };

  MCEngine.undo = function (w) {
    if (w.active) MCEngine.endStroke(w);
    if (!w.strokes.length) return false;
    w.strokes.pop();
    recomputeInk(w);
    return true;
  };

  MCEngine.eraseAt = function (w, x, y, r) {
    r = r || 28;
    for (var i = w.strokes.length - 1; i >= 0; i--) {
      var segs = w.strokes[i].segs;
      for (var j = 0; j < segs.length; j++) {
        if (closestOnSeg(x, y, segs[j]).d <= r) { w.strokes.splice(i, 1); recomputeInk(w); return true; }
      }
    }
    return false;
  };

  MCEngine.launch = function (w) {
    if (w.done || w.crashed) return false;
    if (!w.rolling) {
      w.rolling = true;
      w.ball.vx = Math.max(w.ball.vx, 55);
      w.ev.push({ t: 'launch', x: w.ball.x, y: w.ball.y });
      return true;
    }
    if (w.ball.hopAvail) {
      w.ball.hopAvail = false;
      w.ball.vy = Math.min(w.ball.vy - 240, -260);
      w.ball.vx += (w.ball.vx >= -10 ? 1 : -1) * 145;
      w.ball.turboT = 0.25;
      w.ev.push({ t: 'hop', x: w.ball.x, y: w.ball.y });
      return true;
    }
    return false;
  };

  MCEngine.addSandboxProp = function (w, kind, x, y) {
    if (!w.L.sandbox) return false;
    x = clamp(x, 90, W - 90); y = clamp(y, 120, H - 90);
    if (kind === 'wood' || kind === 'tnt') {
      if (w.L.crates.length > 24) w.L.crates.shift();
      w.L.crates.push({ x: x, y: y, kind: kind, size: 38, smashed: false });
    } else if (kind === 'ring') {
      if (w.L.rings.length > 10) w.L.rings.shift();
      w.L.rings.push({ x: x, y: y, r: 48, boost: 165, cd: 0 });
    } else if (kind === 'cannon') {
      if (w.L.cannons.length > 6) w.L.cannons.shift();
      w.L.cannons.push({ x: x, y: y, ang: -0.58, speed: 780, cd: 0 });
    } else return false;
    return true;
  };

  /* ---------------------------------------------- Physics & Stunt Collisions */
  function closestOnSeg(px, py, sg) {
    var t = sg.l > 0 ? clamp(((px - sg.ax) * sg.dx + (py - sg.ay) * sg.dy) / sg.l, 0, 1) : 0;
    var cx = sg.ax + sg.dx * sg.l * t, cy = sg.ay + sg.dy * sg.l * t, rx = px - cx, ry = py - cy;
    return { cx: cx, cy: cy, rx: rx, ry: ry, d: Math.hypot(rx, ry), t: t };
  }

  function resolveCapsuleSeg(b, sg, rad, surfVx, surfVy) {
    var cp = closestOnSeg(b.x, b.y, sg), minD = MCEngine.BALL_R + rad;
    if (cp.d >= minD) return false;
    var nx = cp.d > 0.001 ? cp.rx / cp.d : sg.nx, ny = cp.d > 0.001 ? cp.ry / cp.d : sg.ny;
    b.x += nx * (minD - cp.d); b.y += ny * (minD - cp.d);
    var vn = (b.vx - surfVx) * nx + (b.vy - surfVy) * ny;
    if (vn < 0) { b.vx -= 1.06 * vn * nx; b.vy -= 1.06 * vn * ny; }
    if (ny < -0.25) {
      b.grounded = 0.1; b.hopAvail = true;
      if (Math.abs(b.vx) < 20 && surfVx !== 0) b.vx += surfVx * 0.02;
    }
    b.spin = (-ny * b.vx + nx * b.vy) / MCEngine.BALL_R;
    return true;
  }

  function resolveStroke(w, b, st, subDt) {
    var segs = st.segs;
    if (!segs.length) return;
    var best = null, bestSeg = null;
    for (var i = 0; i < segs.length; i++) {
      var cp = closestOnSeg(b.x, b.y, segs[i]);
      if (!best || cp.d < best.d) { best = cp; bestSeg = segs[i]; }
    }
    var minD = MCEngine.BALL_R + MCEngine.INK_R;
    if (!best || best.d >= minD) return;
    var nx = best.d > 0.001 ? best.rx / best.d : bestSeg.nx, ny = best.d > 0.001 ? best.ry / best.d : bestSeg.ny;
    b.x += nx * (minD - best.d); b.y += ny * (minD - best.d);
    var vn = b.vx * nx + b.vy * ny;
    if (st.ink === 2) {
      var outVn = Math.max(-vn * 0.92, 560 * w.P.bounceAssist);
      b.vx += (outVn - vn) * nx; b.vy += (outVn - vn) * ny - 30;
      b.hopAvail = true; st.boing = 1;
      if (w.sfxCd.spring <= 0) { w.sfxCd.spring = 0.14; w.ev.push({ t: 'spring', x: best.cx, y: best.cy }); }
      return;
    }
    if (vn < 0) { b.vx -= 1.05 * vn * nx; b.vy -= 1.05 * vn * ny; }
    if (ny < -0.2) { b.grounded = 0.1; b.hopAvail = true; }
    if (st.ink === 1) {
      var tx = bestSeg.dx, ty = bestSeg.dy;
      if (tx < -0.2 && b.vx > 60 && w.L.goal.x > b.x) { tx = -tx; ty = -ty; }
      var vt = b.vx * tx + b.vy * ty, boostVt = clamp(Math.max(vt, 320) + 1900 * subDt, -840, 840);
      b.vx += (boostVt - vt) * tx; b.vy += (boostVt - vt) * ty;
      b.turboT = 0.28;
      if (w.sfxCd.turbo <= 0) { w.sfxCd.turbo = 0.14; w.ev.push({ t: 'turbo', x: best.cx, y: best.cy }); }
    }
    b.spin = (-ny * b.vx + nx * b.vy) / MCEngine.BALL_R;
  }

  function explodeTntChain(w, cx, cy) {
    var queue = [[cx, cy]];
    while (queue.length) {
      var q = queue.shift();
      for (var i = 0; i < w.L.crates.length; i++) {
        var c = w.L.crates[i];
        if (!c.smashed && Math.hypot(c.x - q[0], c.y - q[1]) <= 115) {
          c.smashed = true; w.score += c.kind === 'tnt' ? 50 : 25;
          w.ev.push({ t: 'crate', x: c.x, y: c.y, kind: c.kind });
          if (c.kind === 'tnt') queue.push([c.x, c.y]);
        }
      }
    }
    var b = w.ball;
    b.vy = Math.min(b.vy - 260, -340); b.vx = Math.max(b.vx + 190, 340);
    b.turboT = 0.35; b.hopAvail = true;
  }

  function triggerHazard(w, kind, hx, hy) {
    var b = w.ball;
    if (w.L.sandbox) return;
    if (b.shield > 0) {
      b.shield--; b.vy = -420; b.vx = -95; b.y = Math.min(b.y, hy - 28); b.hopAvail = true;
      w.ev.push({ t: 'shield', x: b.x, y: b.y });
      return;
    }
    w.crashed = true; w.crashT = 0.78;
    w.ev.push({ t: 'crash', x: b.x, y: b.y, kind: kind });
  }

  MCEngine.step = function (w, dt) {
    dt = clamp(dt || 0, 0, 0.05);
    w.t += dt;
    var i, hs = w.P.hazardSpeed;
    for (var k in w.sfxCd) if (w.sfxCd[k] > 0) w.sfxCd[k] = Math.max(0, w.sfxCd[k] - dt);
    for (i = 0; i < w.strokes.length; i++) if (w.strokes[i].boing > 0) w.strokes[i].boing = Math.max(0, w.strokes[i].boing - dt * 3.2);
    for (i = 0; i < w.L.cannons.length; i++) if (w.L.cannons[i].cd > 0) w.L.cannons[i].cd -= dt;
    for (i = 0; i < w.L.rings.length; i++) if (w.L.rings[i].cd > 0) w.L.rings[i].cd -= dt;
    for (i = 0; i < w.L.movers.length; i++) {
      var m = w.L.movers[i], ph = w.t * m.speed * hs + (m.phase || 0), s = Math.sin(ph), c = Math.cos(ph) * m.speed * hs;
      w.movers[i] = makeSeg(m.ax + m.dx * s, m.ay + m.dy * s, m.bx + m.dx * s, m.by + m.dy * s);
      w.moverV[i] = { vx: m.dx * c, vy: m.dy * c };
    }
    if (w.crashed) { w.crashT -= dt; if (w.crashT <= 0) MCEngine.resetPod(w); return; }
    if (!w.rolling || w.done) return;

    w.rollT += dt;
    var b = w.ball, subDt = dt / MCEngine.SUB;
    if (b.grounded > 0) b.grounded = Math.max(0, b.grounded - dt);
    if (b.turboT > 0) b.turboT = Math.max(0, b.turboT - dt);

    for (var sub = 0; sub < MCEngine.SUB; sub++) {
      b.vy += MCEngine.GRAV * subDt;
      if (w.input.steer) b.vx += w.input.steer * (b.grounded > 0 ? 250 : 150) * subDt;
      else if (b.grounded > 0 && b.vx >= -15 && b.vx < 280) b.vx += 160 * subDt;

      for (i = 0; i < w.L.fans.length; i++) {
        var f = w.L.fans[i];
        if (b.x >= f.x && b.x <= f.x + f.w && b.y >= f.y && b.y <= f.y + f.h) {
          b.vx += f.dx * f.force * subDt; b.vy += f.dy * f.force * subDt;
          if (w.sfxCd.wind <= 0) { w.sfxCd.wind = 0.35; w.ev.push({ t: 'wind', x: b.x, y: b.y }); }
        }
      }
      var sp = Math.hypot(b.vx, b.vy);
      if (sp > MCEngine.MAX_V) { b.vx = (b.vx / sp) * MCEngine.MAX_V; b.vy = (b.vy / sp) * MCEngine.MAX_V; }
      b.x += b.vx * subDt; b.y += b.vy * subDt; b.ang += b.spin * subDt;

      if (b.x < MCEngine.BALL_R + 10) { b.x = MCEngine.BALL_R + 10; if (b.vx < 0) b.vx *= -0.45; }
      if (b.x > W - MCEngine.BALL_R - 10) { b.x = W - MCEngine.BALL_R - 10; if (b.vx > 0) b.vx *= -0.45; }
      if (b.y < MCEngine.BALL_R + 82) { b.y = MCEngine.BALL_R + 82; if (b.vy < 0) b.vy *= -0.3; }

      for (i = 0; i < w.L.wallSegs.length; i++) resolveCapsuleSeg(b, w.L.wallSegs[i], MCEngine.WALL_R, 0, 0);
      for (i = 0; i < w.movers.length; i++) resolveCapsuleSeg(b, w.movers[i], MCEngine.WALL_R, w.moverV[i].vx, w.moverV[i].vy);
      for (i = 0; i < w.strokes.length; i++) resolveStroke(w, b, w.strokes[i], subDt);

      for (i = 0; i < w.L.crates.length; i++) {
        var cr = w.L.crates[i];
        if (!cr.smashed && Math.hypot(b.x - cr.x, b.y - cr.y) <= MCEngine.BALL_R + cr.size * 0.56) {
          if (cr.kind === 'tnt') explodeTntChain(w, cr.x, cr.y);
          else { cr.smashed = true; b.vx *= 0.94; w.score += 25; w.ev.push({ t: 'crate', x: cr.x, y: cr.y, kind: 'wood' }); }
        }
      }
      for (i = 0; i < w.L.cannons.length; i++) {
        var cn = w.L.cannons[i];
        if (cn.cd <= 0 && Math.hypot(b.x - cn.x, b.y - cn.y) <= MCEngine.BALL_R + 24) {
          cn.cd = 0.55; b.x = cn.x + Math.cos(cn.ang) * 28; b.y = cn.y + Math.sin(cn.ang) * 28;
          b.vx = Math.cos(cn.ang) * cn.speed; b.vy = Math.sin(cn.ang) * cn.speed;
          b.turboT = 0.35; b.hopAvail = true; w.ev.push({ t: 'cannon', x: cn.x, y: cn.y, ang: cn.ang });
        }
      }
      for (i = 0; i < w.L.rings.length; i++) {
        var rg = w.L.rings[i];
        if (rg.cd <= 0 && Math.hypot(b.x - rg.x, b.y - rg.y) <= rg.r + 8) {
          rg.cd = 0.6;
          var rsp = Math.hypot(b.vx, b.vy) || 1, targetSp = clamp(rsp * 1.2 + rg.boost, 420, MCEngine.MAX_V);
          b.vx = (b.vx / rsp) * targetSp; b.vy = (b.vy / rsp) * targetSp - 35;
          b.turboT = 0.35; w.score += 40; w.ev.push({ t: 'ring', x: rg.x, y: rg.y });
        }
      }
      var collectR = MCEngine.STAR_R * (w.P.tier === 'easy' ? 1.25 : 1.05), magnetR = MCEngine.STAR_R * w.P.starMagnet * 1.7;
      for (i = 0; i < w.starsPos.length; i++) {
        if (w.stars[i]) continue;
        var spx = w.starsPos[i][0], spy = w.starsPos[i][1], sd = Math.hypot(b.x - spx, b.y - spy);
        if (sd <= collectR) {
          w.stars[i] = true; w.starsGot++; w.score += 100; w.ev.push({ t: 'star', i: i, x: spx, y: spy });
        } else if (sd < magnetR && sd > 1) {
          w.starsPos[i][0] += ((b.x - spx) / sd) * 280 * subDt;
          w.starsPos[i][1] += ((b.y - spy) / sd) * 280 * subDt;
        }
      }
      for (i = 0; i < w.L.hazards.length; i++) {
        var hz = w.L.hazards[i];
        if (hz.kind === 'lava' && b.x + 14 >= hz.x && b.x - 14 <= hz.x + hz.w && b.y + MCEngine.BALL_R >= hz.y) {
          triggerHazard(w, 'lava', b.x, hz.y); if (w.crashed) return;
        } else if (hz.kind === 'saw' && Math.hypot(b.x - hz.x, b.y - hz.y) <= MCEngine.BALL_R + hz.r - 4) {
          triggerHazard(w, 'saw', hz.x, hz.y); if (w.crashed) return;
        }
      }
      if (b.y > H + 70) {
        if (w.L.sandbox) { b.x = w.L.start[0]; b.y = w.L.start[1]; b.vx = 60; b.vy = 0; }
        else { triggerHazard(w, 'out', b.x, H - 20); if (w.crashed) return; }
      }
      if (Math.hypot(b.x - w.L.goal.x, b.y - w.L.goal.y) <= w.L.goal.r) {
        if (w.L.sandbox) {
          b.x = w.L.start[0]; b.y = w.L.start[1]; b.vx = 120; b.vy = -40;
          w.stars = w.L.stars.map(function () { return false; });
          w.starsPos = w.L.stars.map(function (s) { return [s[0], s[1]]; });
          for (var ci = 0; ci < w.L.crates.length; ci++) w.L.crates[ci].smashed = false;
          w.score += 150; w.ev.push({ t: 'sandboxGoal', x: w.L.goal.x, y: w.L.goal.y });
        } else {
          w.done = true; w.score += 200; w.ev.push({ t: 'goal', x: w.L.goal.x, y: w.L.goal.y });
          return;
        }
      }
    }
  };

  /* -------------------------------------------- Scoring, Save & Garage Shop */
  MCEngine.calcStars = function (L, starsGot, inkUsed) {
    if (starsGot >= 3 && inkUsed <= L.inkPar) return 3;
    return starsGot >= 2 || inkUsed <= L.inkPar ? 2 : 1;
  };
  MCEngine.outcome = function (won, stars) { return !won ? 0 : stars >= 3 ? 1 : stars === 2 ? 0.72 : 0.48; };
  MCEngine.isOpen = function () { return true; };

  MCEngine.freshSave = function () {
    return {
      v: 2, tier: 'normal', coins: 0, pod: 0, trail: 0, pods: [1, 0, 0, 0, 0], trails: [1, 0, 0, 0],
      lv: MCEngine.STAGES.map(function () { return { s: 0, ink: 0 }; })
    };
  };

  MCEngine.loadSave = function (raw) {
    var f = MCEngine.freshSave(), i;
    if (!raw || typeof raw !== 'object' || raw.v !== 2 || !Array.isArray(raw.lv)) return f;
    f.tier = MCEngine.TIERS[raw.tier] ? raw.tier : 'normal';
    f.coins = clamp(raw.coins | 0, 0, 99999);
    if (Array.isArray(raw.pods)) for (i = 1; i < f.pods.length; i++) f.pods[i] = raw.pods[i] ? 1 : 0;
    if (Array.isArray(raw.trails)) for (i = 1; i < f.trails.length; i++) f.trails[i] = raw.trails[i] ? 1 : 0;
    f.pod = f.pods[raw.pod | 0] ? (raw.pod | 0) : 0;
    f.trail = f.trails[raw.trail | 0] ? (raw.trail | 0) : 0;
    for (i = 0; i < f.lv.length; i++) {
      var r = raw.lv[i];
      if (r && typeof r === 'object') {
        var s = clamp(r.s | 0, 0, 3);
        f.lv[i] = { s: s, ink: s > 0 ? clamp(r.ink | 0, 0, 99999) : 0 };
      }
    }
    return f;
  };

  MCEngine.totalStars = function (save) {
    var n = 0;
    for (var i = 0; i < save.lv.length; i++) n += save.lv[i].s;
    return n;
  };

  MCEngine.applyWin = function (save, idx, stars, inkUsed) {
    idx = clamp(idx | 0, 0, save.lv.length - 1);
    var rec = save.lv[idx], gainStars = Math.max(0, stars - rec.s);
    var coins = gainStars * 3 + 2, best = rec.ink === 0 || Math.round(inkUsed) < rec.ink;
    if (stars > rec.s) rec.s = stars;
    if (best) rec.ink = Math.round(inkUsed);
    save.coins = clamp(save.coins + coins, 0, 99999);
    return { coins: coins, best: best, gainStars: gainStars };
  };

  MCEngine.buy = function (save, kind, idx) {
    var isPod = kind === 'pod', list = isPod ? MCEngine.PODS : MCEngine.TRAILS, own = isPod ? save.pods : save.trails;
    if (idx < 0 || idx >= list.length) return '';
    if (own[idx]) { if (isPod) save.pod = idx; else save.trail = idx; return 'equip'; }
    if (save.coins < list[idx].price) return '';
    save.coins -= list[idx].price; own[idx] = 1;
    if (isPod) save.pod = idx; else save.trail = idx;
    return 'bought';
  };

  if (typeof module === 'object' && module.exports) module.exports = MCEngine;
  if (root) root.MCEngine = MCEngine;
})(typeof window !== 'undefined' ? window : this);
