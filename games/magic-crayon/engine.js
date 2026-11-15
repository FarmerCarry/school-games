/* Magic Crayon (القلم السحري) pure 2D physics & puzzle engine.
 * Pure UMD module: no DOM, no Kit, no timers, no Math.random, no localStorage.
 * Exposes window.MC in browsers and module.exports = MC in Node. */
(function (root) {
  'use strict';
  var MC = {};
  var W = 1280, H = 720, TAU = Math.PI * 2;
  MC.W = W; MC.H = H;
  MC.BALL_R = 18;
  MC.WALL_R = 8;
  MC.INK_R = 5;
  MC.PAD_R = 9;
  MC.GATE_R = 7;
  MC.STAR_R = 24;
  MC.CUP_W = 68;
  MC.CUP_H = 54;
  MC.MIN_SEG = 8;
  MC.MAX_SEG = 13;
  MC.GRAV = 680;
  MC.MAX_V = 880;
  MC.SUB = 4;
  MC.PER_WORLD = 5;

  MC.EASY = { inkBonus: 1.35, cupMagnet: 1.3, bounceAssist: 1.05 };
  MC.HARD = { inkBonus: 0.92, cupMagnet: 0.9, bounceAssist: 0.96 };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  MC.clamp = clamp;

  MC.params = function (k) {
    k = clamp(typeof k === 'number' && k === k ? k : 0.3, 0, 1);
    return {
      inkBonus: MC.EASY.inkBonus + (MC.HARD.inkBonus - MC.EASY.inkBonus) * k,
      cupMagnet: MC.EASY.cupMagnet + (MC.HARD.cupMagnet - MC.EASY.cupMagnet) * k,
      bounceAssist: MC.EASY.bounceAssist + (MC.HARD.bounceAssist - MC.EASY.bounceAssist) * k
    };
  };

  function normParams(P) {
    var base = MC.params(0.3);
    if (!P || typeof P !== 'object') return base;
    return {
      inkBonus: clamp(+P.inkBonus || base.inkBonus, 0.5, 2.5),
      cupMagnet: clamp(+P.cupMagnet || base.cupMagnet, 0.5, 2),
      bounceAssist: clamp(+P.bounceAssist || base.bounceAssist, 0.7, 1.5)
    };
  }

  /* ------------------------------------------------------------- worlds */
  MC.WORLDS = [
    { id: 'bridges', name: 'دفتر الجسور', color: '#ff5964', paper: '#fffcf2', paper2: '#f6efe0', line: '#cbe2f6', accent: '#ff9f1c' },
    { id: 'bounce', name: 'الوسائد النطّاطة', color: '#ff4d94', paper: '#fff7fb', paper2: '#f9e8f2', line: '#f2cde3', accent: '#ff4d94' },
    { id: 'wind', name: 'مراوح الهواء', color: '#00b4d8', paper: '#f3fcff', paper2: '#e3f5fb', line: '#bce5f5', accent: '#00b4d8' },
    { id: 'portals', name: 'البوابات العجيبة', color: '#845ec2', paper: '#f8f4ff', paper2: '#ece4fb', line: '#dad0f5', accent: '#845ec2' }
  ];

  /* ------------------------------------------------------------- levels */
  // Coordinates live in 1280x720 logical space, below the top HUD bar (y >= 88).
  // walls: [ax, ay, bx, by]
  // pads: [ax, ay, bx, by, power] (pink trampoline capsules; normal points -dy, dx if left->right)
  // fans: { x, y, w, h, dx, dy, force }
  // slimes: { x, y, w, h }
  // gates: { x, y, len, a0, minA, maxA, k } (spring-hinged swinging planks)
  // portals: { ax, ay, bx, by, r, exitA, exitSpeed, color }
  // gravPads: { x, y, w, h, dir } (-1 upward, +1 downward)
  // starts: [[x, y], ...] (1 marble normally, 2 marbles on double-rescue levels)
  var RAW = [
    // ==================== WORLD 1: دفتر الجسور (Notebook Bridges) ====================
    {
      name: 'الجسر الأول', start: [140, 294], cup: [1085, 424], ink: 780, par: 520,
      walls: [[75, 312, 380, 356], [760, 368, 1030, 392]],
      stars: [[475, 336], [575, 342], [675, 348]],
      guide: [[368, 355], [570, 362], [772, 369]]
    },
    {
      name: 'المنحدر السريع', start: [140, 184], cup: [1085, 548], ink: 940, par: 720,
      walls: [[75, 204, 300, 238], [850, 496, 1030, 516]],
      stars: [[430, 286], [585, 358], [740, 432]],
      guide: [[288, 236], [575, 378], [862, 497]]
    },
    {
      name: 'التلة اللطيفة', start: [120, 174], cup: [1085, 376], ink: 900, par: 620,
      walls: [[70, 196, 360, 348], [810, 326, 1030, 344]],
      stars: [[470, 344], [600, 342], [730, 318]],
      guide: [[348, 344], [575, 374], [822, 327]]
    },
    {
      name: 'الدرجتان', start: [130, 170], cup: [1090, 566], ink: 880, par: 600,
      walls: [[75, 190, 290, 224], [485, 354, 695, 376], [875, 514, 1035, 534]],
      stars: [[390, 268], [590, 345], [805, 392]],
      guide: [[280, 222], [495, 355]]
    },
    {
      name: 'المنعطف المرتد', start: [145, 156], cup: [195, 582], ink: 980, par: 680,
      walls: [[85, 176, 430, 236], [825, 250, 825, 470], [795, 450, 600, 486], [410, 520, 250, 548]],
      stars: [[595, 275], [700, 445], [505, 482]],
      guide: [[420, 234], [795, 345]]
    },

    // ==================== WORLD 2: الوسائد النطّاطة (Bouncy Pads) ====================
    {
      name: 'القفزة الوردية', start: [125, 252], cup: [1085, 396], ink: 800, par: 500,
      walls: [[70, 272, 260, 296], [825, 346, 1030, 364], [1150, 195, 1150, 415]],
      pads: [[525, 548, 665, 548, 595]],
      stars: [[395, 405], [680, 330], [835, 255]],
      guide: [[250, 295], [535, 542]]
    },
    {
      name: 'قفزتان في الهواء', start: [115, 252], cup: [1105, 404], ink: 860, par: 560,
      walls: [[65, 272, 225, 292], [920, 354, 1050, 372], [1170, 95, 1170, 420]],
      pads: [[365, 552, 495, 552, 515], [645, 558, 795, 540, 695]],
      stars: [[545, 325], [755, 445], [965, 330]]
    },
    {
      name: 'فوق الجدار', start: [120, 246], cup: [1085, 524], ink: 820, par: 520,
      walls: [[70, 266, 250, 290], [655, 340, 655, 650], [755, 382, 1030, 492], [1150, 95, 1150, 535]],
      pads: [[465, 560, 605, 560, 675]],
      stars: [[365, 415], [655, 275], [760, 220]]
    },
    {
      name: 'نطّة الوادي', start: [120, 188], cup: [1085, 322], ink: 880, par: 560,
      walls: [[70, 208, 280, 302], [440, 452, 560, 468], [860, 270, 1030, 290]],
      pads: [[635, 556, 775, 536, 710]],
      stars: [[368, 362], [585, 468], [805, 252]]
    },
    {
      name: 'القوس البهلواني', start: [115, 236], cup: [1095, 480], ink: 960, par: 720,
      walls: [[65, 256, 245, 280], [585, 375, 585, 650], [885, 428, 1040, 448]],
      pads: [[420, 558, 555, 548, 735]],
      stars: [[340, 405], [605, 185], [965, 410]]
    },

    // ==================== WORLD 3: مراوح الهواء (Breezy Fans) ====================
    {
      name: 'عمود النسيم', start: [125, 438], cup: [1085, 378], ink: 880, par: 580,
      walls: [[70, 458, 310, 488], [720, 326, 1030, 346], [1150, 90, 1150, 405]],
      fans: [{ x: 430, y: 165, w: 215, h: 440, dx: 0.24, dy: -1, force: 1850 }],
      stars: [[385, 478], [545, 390], [690, 285]]
    },
    {
      name: 'بحيرة الدغدغة', start: [125, 296], cup: [1085, 408], ink: 940, par: 640,
      walls: [[70, 316, 295, 348], [770, 356, 1030, 376], [1150, 90, 1150, 435]],
      fans: [{ x: 495, y: 165, w: 215, h: 395, dx: 0.26, dy: -1, force: 1850 }],
      slimes: [{ x: 345, y: 584, w: 495, h: 52 }],
      stars: [[405, 365], [565, 365], [675, 292]]
    },
    {
      name: 'البوابة المتأرجحة', start: [120, 216], cup: [1085, 518], ink: 880, par: 560,
      walls: [[70, 236, 305, 315], [840, 468, 1030, 486]],
      gates: [{ x: 565, y: 365, len: 105, a0: 0.04, minA: -0.35, maxA: 0.48, k: 12 }],
      slimes: [{ x: 380, y: 590, w: 410, h: 48 }],
      stars: [[415, 322], [575, 338], [745, 422]]
    },
    {
      name: 'نسيم مزدوج', start: [120, 448], cup: [1090, 342], ink: 940, par: 620,
      walls: [[70, 468, 265, 494], [860, 290, 1035, 310], [1155, 95, 1155, 360]],
      fans: [
        { x: 435, y: 175, w: 195, h: 400, dx: 0.16, dy: -1, force: 1850 },
        { x: 585, y: 165, w: 255, h: 165, dx: 0.72, dy: -0.22, force: 820 }
      ],
      slimes: [{ x: 325, y: 585, w: 535, h: 50 }],
      stars: [[365, 502], [535, 370], [745, 225]]
    },
    {
      name: 'عاصفة الدفتر', start: [115, 244], cup: [1095, 346], ink: 980, par: 660,
      walls: [[65, 264, 245, 288], [885, 294, 1040, 314], [1160, 95, 1160, 365]],
      pads: [[415, 542, 540, 542, 645]],
      gates: [{ x: 635, y: 355, len: 88, a0: 0.05, minA: -0.4, maxA: 0.5, k: 12 }],
      fans: [{ x: 715, y: 165, w: 175, h: 395, dx: 0.22, dy: -1, force: 1680 }],
      slimes: [{ x: 550, y: 588, w: 330, h: 48 }],
      stars: [[335, 395], [600, 244], [755, 195]]
    },

    // ==================== WORLD 4: البوابات العجيبة (Portal Sketchbook) ====================
    {
      name: 'حلقة الانتقال', start: [125, 244], cup: [1085, 408], ink: 880, par: 580,
      walls: [[70, 264, 255, 286], [580, 130, 580, 620], [885, 356, 1030, 376]],
      portals: [{ ax: 485, ay: 420, bx: 675, by: 255, r: 36, exitA: 0.18, exitSpeed: 245, color: '#ff7b00', color2: '#00bbf9' }],
      stars: [[375, 340], [755, 262], [855, 280]]
    },
    {
      name: 'مقلب الجاذبية', start: [125, 468], cup: [1065, 548], ink: 960, par: 660,
      walls: [[70, 488, 300, 518], [510, 138, 650, 132], [810, 132, 920, 128]],
      gravPads: [
        { x: 385, y: 405, w: 125, h: 155, dir: -1 },
        { x: 920, y: 82, w: 135, h: 185, dir: 1 }
      ],
      slimes: [{ x: 500, y: 590, w: 420, h: 48 }],
      stars: [[490, 340], [730, 155], [980, 330]]
    },
    {
      name: 'بوابة السماء', start: [120, 246], cup: [1090, 368], ink: 900, par: 580,
      walls: [[70, 266, 250, 290], [625, 130, 625, 630], [895, 316, 1035, 336]],
      pads: [[420, 552, 555, 552, 670]],
      portals: [{ ax: 555, ay: 280, bx: 705, by: 240, r: 38, exitA: 0.16, exitSpeed: 245, color: '#f72585', color2: '#4cc9f0' }],
      slimes: [{ x: 650, y: 588, w: 280, h: 48 }],
      stars: [[360, 415], [770, 245], [860, 250]]
    },
    {
      name: 'إنقاذ الصديق', starts: [[125, 186], [560, 344]], cup: [1085, 538], ink: 960, par: 650,
      walls: [[70, 206, 300, 246], [505, 366, 685, 386], [880, 486, 1030, 506]],
      stars: [[405, 295], [625, 348], [790, 430]]
    },
    {
      name: 'المهرجان السحري', starts: [[120, 246], [740, 310]], cup: [1095, 488], ink: 1020, par: 680,
      walls: [[70, 266, 250, 290], [605, 135, 605, 630], [695, 334, 825, 354], [925, 436, 1040, 456]],
      pads: [[405, 550, 540, 550, 665]],
      portals: [{ ax: 535, ay: 280, bx: 655, by: 275, r: 38, exitA: 0.28, exitSpeed: 260, color: '#ff9f1c', color2: '#2ec4b6' }],
      slimes: [{ x: 620, y: 588, w: 300, h: 48 }],
      stars: [[340, 410], [765, 316], [875, 390]]
    }
  ];

  MC.LEVELS = RAW.map(function (r, i) {
    var wi = Math.floor(i / MC.PER_WORLD), li = i % MC.PER_WORLD;
    return {
      index: i,
      id: (wi + 1) + '-' + (li + 1),
      world: wi,
      name: r.name,
      dir: r.dir || 1,
      starts: r.starts || [r.start],
      cup: { x: r.cup[0], y: r.cup[1] },
      ink: r.ink,
      inkPar: r.par,
      walls: r.walls || [],
      pads: r.pads || [],
      fans: r.fans || [],
      slimes: r.slimes || [],
      gates: r.gates || [],
      portals: r.portals || [],
      gravPads: r.gravPads || [],
      stars: r.stars || [],
      guide: r.guide || null
    };
  });

  /* ---------------------------------------------------------- build & sim */
  function makeSeg(ax, ay, bx, by, r, kind, extra) {
    var dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1e-6;
    var s = { ax: ax, ay: ay, bx: bx, by: by, dx: dx, dy: dy, l: l, ll: dx * dx + dy * dy || 1e-6, r: r, kind: kind || 'wall' };
    if (extra) for (var k in extra) s[k] = extra[k];
    return s;
  }

  MC.build = function (levelIdx, params) {
    var idx = clamp(levelIdx | 0, 0, MC.LEVELS.length - 1);
    var R = MC.LEVELS[idx], P = normParams(params);
    var walls = R.walls.map(function (w) { return makeSeg(w[0], w[1], w[2], w[3], MC.WALL_R, 'wall'); });
    // Cup physical walls: flared rim funneling into the cup base.
    var cx = R.cup.x, cy = R.cup.y, hw = MC.CUP_W / 2, hh = MC.CUP_H / 2;
    var cupWalls = [
      makeSeg(cx - hw - 8, cy - hh - 4, cx - hw + 5, cy + hh, 5, 'cup'),
      makeSeg(cx + hw + 8, cy - hh - 4, cx + hw - 5, cy + hh, 5, 'cup'),
      makeSeg(cx - hw + 5, cy + hh, cx + hw - 5, cy + hh, 6, 'cup')
    ];
    // Worlds without slime puddles have a friendly notebook pencil-tray floor along the bottom.
    var hasBottomFloor = R.slimes.length === 0;
    if (hasBottomFloor) walls.push(makeSeg(24, H - 22, W - 24, H - 22, 8, 'floor'));
    var pads = R.pads.map(function (p, i) {
      var dx = p[2] - p[0], dy = p[3] - p[1], l = Math.hypot(dx, dy) || 1;
      // Normal points "up" (negative y side of left->right pad).
      var nx = dy / l, ny = -dx / l;
      if (ny > 0) { nx = -nx; ny = -ny; }
      return makeSeg(p[0], p[1], p[2], p[3], MC.PAD_R, 'pad', { i: i, nx: nx, ny: ny, power: p[4] * P.bounceAssist });
    });
    return {
      i: idx, R: R, P: P, id: R.id, name: R.name, world: R.world, dir: R.dir,
      inkMax: Math.round(R.ink * P.inkBonus), inkPar: R.inkPar,
      walls: walls, cupWalls: cupWalls, pads: pads,
      fans: R.fans, slimes: R.slimes, gates: R.gates, portals: R.portals, gravPads: R.gravPads,
      stars: R.stars, cup: R.cup, starts: R.starts, guide: R.guide, hasBottomFloor: hasBottomFloor
    };
  };

  MC.create = function (levelIdx, params) {
    var L = MC.build(levelIdx, params);
    var balls = L.starts.map(function (st, i) {
      return {
        i: i, x: st[0], y: st[1], sx: st[0], sy: st[1],
        vx: 0, vy: 0, ang: 0, vang: 0, grav: 1,
        inCup: false, popped: false, portalCd: 0, inWind: false
      };
    });
    var gates = L.gates.map(function (g) {
      return { ang: g.a0 || 0, vang: 0 };
    });
    return {
      L: L, P: L.P, t: 0, rollT: 0,
      rolling: false, done: false, popped: false,
      strokes: [], active: null, inkUsed: 0,
      balls: balls, ball: balls[0], gates: gates,
      padBoing: L.pads.map(function () { return 0; }),
      stars: L.stars.map(function () { return false; }), starsGot: 0,
      ev: []
    };
  };

  /* ---------------------------------------------------------- crayon ink */
  function clampDrawPt(w, x, y) {
    x = clamp(x, 18, W - 18);
    y = clamp(y, 82, H - 20);
    // Keep newly drawn points from overlapping directly inside a marble or inside the cup mouth.
    for (var i = 0; i < w.balls.length; i++) {
      var b = w.balls[i];
      if (b.inCup) continue;
      var dx = x - b.x, dy = y - b.y, d = Math.hypot(dx, dy), minD = MC.BALL_R + MC.INK_R + 2;
      if (d < minD) {
        if (d < 0.01) { dx = 0; dy = 1; d = 1; }
        x = b.x + dx / d * minD;
        y = b.y + dy / d * minD;
      }
    }
    var cx = w.L.cup.x, cy = w.L.cup.y;
    var cdx = x - cx, cdy = y - cy, cd = Math.hypot(cdx, cdy);
    if (cd < 32) {
      if (cd < 0.01) { cdx = 0; cdy = -1; cd = 1; }
      x = cx + cdx / cd * 32;
      y = cy + cdy / cd * 32;
    }
    return [clamp(x, 18, W - 18), clamp(y, 82, H - 20)];
  }

  MC.beginStroke = function (w, x, y) {
    if (w.done || w.popped) return false;
    if (w.active) MC.endStroke(w);
    if (w.L.inkMax - w.inkUsed < MC.MIN_SEG) {
      w.ev.push({ t: 'noInk', x: x, y: y });
      return false;
    }
    var p = clampDrawPt(w, x, y);
    w.active = { pts: [p], segs: [], ink: 0, pushed: false };
    return true;
  };

  MC.moveStroke = function (w, x, y) {
    var st = w.active;
    if (!st || w.done || w.popped) return false;
    var target = clampDrawPt(w, x, y);
    var last = st.pts[st.pts.length - 1];
    var dx = target[0] - last[0], dy = target[1] - last[1], dist = Math.hypot(dx, dy);
    if (dist < MC.MIN_SEG) return false;
    var steps = Math.max(1, Math.ceil(dist / MC.MAX_SEG));
    var added = false;
    for (var k = 1; k <= steps; k++) {
      var rem = w.L.inkMax - w.inkUsed;
      if (rem < 2) {
        w.ev.push({ t: 'noInk', x: last[0], y: last[1] });
        MC.endStroke(w);
        break;
      }
      var nx = last[0] + (target[0] - last[0]) * (k / steps);
      var ny = last[1] + (target[1] - last[1]) * (k / steps);
      var p = clampDrawPt(w, nx, ny);
      var prev = st.pts[st.pts.length - 1];
      var segLen = Math.hypot(p[0] - prev[0], p[1] - prev[1]);
      if (segLen < 2) continue;
      if (segLen > rem) {
        var f = rem / segLen;
        p = [prev[0] + (p[0] - prev[0]) * f, prev[1] + (p[1] - prev[1]) * f];
        segLen = rem;
      }
      st.pts.push(p);
      st.segs.push(makeSeg(prev[0], prev[1], p[0], p[1], MC.INK_R, 'ink'));
      st.ink += segLen;
      w.inkUsed += segLen;
      if (!st.pushed) { st.pushed = true; w.strokes.push(st); }
      w.ev.push({ t: 'draw', x: p[0], y: p[1], len: segLen });
      added = true;
      if (w.L.inkMax - w.inkUsed <= 0.5) { MC.endStroke(w); break; }
    }
    return added;
  };

  MC.endStroke = function (w) {
    var st = w.active;
    if (!st) return false;
    w.active = null;
    if (st.pushed) {
      delete st.pushed;
      w.ev.push({ t: 'strokeEnd', ink: st.ink });
      return true;
    }
    return false;
  };

  MC.drawStroke = function (w, pts) {
    if (!pts || pts.length < 2) return false;
    MC.beginStroke(w, pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) MC.moveStroke(w, pts[i][0], pts[i][1]);
    return MC.endStroke(w);
  };

  function recalcInk(w) {
    var sum = 0;
    for (var i = 0; i < w.strokes.length; i++) sum += w.strokes[i].ink;
    w.inkUsed = sum;
  }

  MC.undo = function (w) {
    if (w.done || w.popped) return false;
    if (w.active) MC.endStroke(w);
    if (!w.strokes.length) return false;
    var removed = w.strokes.pop();
    recalcInk(w);
    w.ev.push({ t: 'undo', ink: removed.ink });
    return true;
  };

  MC.segDist2 = function (x, y, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay, ll = dx * dx + dy * dy;
    var u = ll ? clamp(((x - ax) * dx + (y - ay) * dy) / ll, 0, 1) : 0;
    var px = ax + dx * u - x, py = ay + dy * u - y;
    return px * px + py * py;
  };

  MC.eraseAt = function (w, x, y, radius) {
    if (w.done || w.popped) return false;
    if (w.active) MC.endStroke(w);
    if (!w.strokes.length) return false;
    var r2 = Math.pow(radius || 28, 2), best = -1, bestD2 = r2;
    for (var i = w.strokes.length - 1; i >= 0; i--) {
      var segs = w.strokes[i].segs;
      for (var j = 0; j < segs.length; j++) {
        var sg = segs[j], d2 = MC.segDist2(x, y, sg.ax, sg.ay, sg.bx, sg.by);
        if (d2 <= bestD2) { bestD2 = d2; best = i; }
      }
    }
    if (best < 0) return MC.undo(w);
    var removed = w.strokes.splice(best, 1)[0];
    recalcInk(w);
    w.ev.push({ t: 'undo', ink: removed.ink });
    return true;
  };

  MC.launch = function (w) {
    if (w.rolling || w.done || w.popped) return false;
    if (w.active) MC.endStroke(w);
    w.rolling = true;
    for (var i = 0; i < w.balls.length; i++) {
      var b = w.balls[i];
      // Primary marble gets a lively start push; rescue buddy waits gently until nudged or rolls slightly if on a slope.
      b.vx = i === 0 ? w.L.dir * 95 : 0;
      b.vy = 0;
    }
    w.ev.push({ t: 'launch', x: w.ball.x, y: w.ball.y });
    return true;
  };

  /* ------------------------------------------------------ physics step */
  function collideCapsule(b, sg, restitution, friction) {
    var dx = sg.dx, dy = sg.dy, u = ((b.x - sg.ax) * dx + (b.y - sg.ay) * dy) / sg.ll;
    var interior = u > 0.001 && u < 0.999;
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    var px = sg.ax + dx * u, py = sg.ay + dy * u;
    var nx = b.x - px, ny = b.y - py;
    var d2 = nx * nx + ny * ny, minD = MC.BALL_R + sg.r;
    if (d2 >= minD * minD) return null;
    var d = Math.sqrt(d2);
    var unx, uny;
    if (d > 1e-5) { unx = nx / d; uny = ny / d; }
    else { unx = -dy / sg.l; uny = dx / sg.l; d = 0; }
    return { sg: sg, pen: minD - d, unx: unx, uny: uny, interior: interior, e: restitution, mu: friction, px: px, py: py };
  }

  function applyContact(b, c, dt) {
    // Recompute actual overlap so multiple contacts in a substep never over-push.
    var sg = c.sg, dx = sg.dx, dy = sg.dy;
    var u = clamp(((b.x - sg.ax) * dx + (b.y - sg.ay) * dy) / sg.ll, 0, 1);
    var px = sg.ax + dx * u, py = sg.ay + dy * u;
    var nx = b.x - px, ny = b.y - py, d = Math.hypot(nx, ny), minD = MC.BALL_R + sg.r;
    if (d >= minD) return false;
    var unx = d > 1e-5 ? nx / d : c.unx, uny = d > 1e-5 ? ny / d : c.uny;
    var pen = minD - d;
    b.x += unx * pen;
    b.y += uny * pen;
    var vn = b.vx * unx + b.vy * uny;
    if (vn < 0) {
      var tx = -uny, ty = unx;
      var vt = b.vx * tx + b.vy * ty;
      vt *= Math.max(0, 1 - c.mu * dt);
      var newVn = -vn * c.e;
      b.vx = unx * newVn + tx * vt;
      b.vy = uny * newVn + ty * vt;
      b.vang = vt / MC.BALL_R;
    }
    return true;
  }

  function stepGate(w, gi, dt) {
    var g = w.L.gates[gi], st = w.gates[gi];
    // Spring torque gently pulls the plank back toward g.a0, with smooth damping.
    var acc = -(st.ang - (g.a0 || 0)) * (g.k || 12) - st.vang * 4.5;
    st.vang += acc * dt;
    st.ang += st.vang * dt;
    if (st.ang < g.minA) { st.ang = g.minA; if (st.vang < 0) st.vang = 0; }
    if (st.ang > g.maxA) { st.ang = g.maxA; if (st.vang > 0) st.vang = 0; }
  }

  MC.gateEndpoints = function (g, ang) {
    var ca = Math.cos(ang), sa = Math.sin(ang);
    return [g.x - ca * g.len, g.y - sa * g.len, g.x + ca * g.len, g.y + sa * g.len];
  };

  function substep(w, dt) {
    var L = w.L, P = w.P;
    for (var gi = 0; gi < L.gates.length; gi++) stepGate(w, gi, dt);

    // Ball-to-ball collision for double-marble rescue levels.
    if (w.balls.length > 1) {
      for (var a = 0; a < w.balls.length; a++) {
        for (var m = a + 1; m < w.balls.length; m++) {
          var b1 = w.balls[a], b2 = w.balls[m];
          if (b1.inCup || b2.inCup) continue;
          var bdx = b2.x - b1.x, bdy = b2.y - b1.y, bd = Math.hypot(bdx, bdy), minB = MC.BALL_R * 2;
          if (bd > 0 && bd < minB) {
            var ux = bdx / bd, uy = bdy / bd, overlap = (minB - bd) * 0.5;
            b1.x -= ux * overlap; b1.y -= uy * overlap;
            b2.x += ux * overlap; b2.y += uy * overlap;
            var rv = (b2.vx - b1.vx) * ux + (b2.vy - b1.vy) * uy;
            if (rv < 0) {
              var imp = -rv * 0.92;
              b1.vx -= ux * imp; b1.vy -= uy * imp;
              b2.vx += ux * imp; b2.vy += uy * imp;
            }
          }
        }
      }
    }

    for (var bi = 0; bi < w.balls.length; bi++) {
      var b = w.balls[bi];
      if (b.inCup) {
        // Nestled happily inside the Golden Star Cup.
        var tx = L.cup.x + (bi ? 10 : (w.balls.length > 1 ? -10 : 0)), ty = L.cup.y + 8;
        b.x += (tx - b.x) * Math.min(1, dt * 14);
        b.y += (ty - b.y) * Math.min(1, dt * 14);
        b.vx = 0; b.vy = 0;
        continue;
      }
      if (b.portalCd > 0) b.portalCd = Math.max(0, b.portalCd - dt);

      // Gravity.
      b.vy += MC.GRAV * b.grav * dt;

      // Wind fans.
      var nowWind = false;
      for (var fi = 0; fi < L.fans.length; fi++) {
        var f = L.fans[fi];
        if (b.x + MC.BALL_R > f.x && b.x - MC.BALL_R < f.x + f.w &&
            b.y + MC.BALL_R > f.y && b.y - MC.BALL_R < f.y + f.h) {
          b.vx += f.dx * f.force * dt;
          b.vy += f.dy * f.force * dt;
          // Gentle vertical damping inside updrafts keeps floating smooth and controllable.
          if (Math.abs(f.dy) > 0.5) b.vy *= (1 - 1.15 * dt);
          nowWind = true;
        }
      }
      if (nowWind && !b.inWind) w.ev.push({ t: 'wind', x: b.x, y: b.y });
      b.inWind = nowWind;

      // Gravity-flip pads.
      for (var gpi = 0; gpi < L.gravPads.length; gpi++) {
        var gp = L.gravPads[gpi];
        if (b.x > gp.x && b.x < gp.x + gp.w && b.y > gp.y && b.y < gp.y + gp.h && b.grav !== gp.dir) {
          b.grav = gp.dir;
          b.vy = gp.dir * Math.max(80, Math.abs(b.vy) * 0.35);
          w.ev.push({ t: 'grav', dir: gp.dir, x: b.x, y: b.y });
        }
      }

      // Teleport portals.
      if (b.portalCd <= 0) {
        for (var pi = 0; pi < L.portals.length; pi++) {
          var po = L.portals[pi];
          var da = Math.hypot(b.x - po.ax, b.y - po.ay);
          var db = Math.hypot(b.x - po.bx, b.y - po.by);
          if (da <= po.r || db <= po.r) {
            var fromA = da <= po.r;
            var ox = fromA ? po.bx : po.ax, oy = fromA ? po.by : po.ay;
            var sp = Math.max(po.exitSpeed || 280, Math.hypot(b.vx, b.vy));
            var ea = fromA ? (po.exitA != null ? po.exitA : Math.atan2(b.vy, b.vx)) : Math.PI + (po.exitA || 0);
            var fx = b.x, fy = b.y;
            b.x = ox + Math.cos(ea) * 8;
            b.y = oy + Math.sin(ea) * 8;
            b.vx = Math.cos(ea) * sp;
            b.vy = Math.sin(ea) * sp;
            b.portalCd = 0.45;
            w.ev.push({ t: 'portal', i: pi, fx: fx, fy: fy, x: b.x, y: b.y });
            break;
          }
        }
      }

      // Cup magnet pull near the golden cup mouth.
      var cmx = L.cup.x - b.x, cmy = (L.cup.y - 8) - b.y, cmd = Math.hypot(cmx, cmy);
      var magR = 64 * P.cupMagnet;
      if (cmd > 1 && cmd < magR) {
        var pull = (1 - cmd / magR) * 420 * P.cupMagnet;
        b.vx += (cmx / cmd) * pull * dt;
        b.vy += (cmy / cmd) * pull * dt;
      }

      // Air damping & speed cap.
      b.vx *= (1 - 0.05 * dt);
      b.vy *= (1 - 0.05 * dt);
      var vmag = Math.hypot(b.vx, b.vy);
      if (vmag > MC.MAX_V) { b.vx = b.vx / vmag * MC.MAX_V; b.vy = b.vy / vmag * MC.MAX_V; }

      // Integrate position & spin.
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.ang += b.vang * dt;

      // Side & ceiling sketchbook boundaries.
      if (b.x < 18 + MC.BALL_R) { b.x = 18 + MC.BALL_R; if (b.vx < 0) b.vx = -b.vx * 0.35; }
      if (b.x > W - 18 - MC.BALL_R) { b.x = W - 18 - MC.BALL_R; if (b.vx > 0) b.vx = -b.vx * 0.35; }
      if (b.y < 82 + MC.BALL_R) { b.y = 82 + MC.BALL_R; if (b.vy < 0) b.vy = -b.vy * 0.25; }

      // Bouncy trampoline pads.
      for (var pdi = 0; pdi < L.pads.length; pdi++) {
        var pd = L.pads[pdi];
        var pc = collideCapsule(b, pd, 1, 0);
        if (pc) {
          b.x += pc.unx * (pc.pen + 1);
          b.y += pc.uny * (pc.pen + 1);
          var pvn = b.vx * pd.nx + b.vy * pd.ny;
          var ptx = -pd.ny, pty = pd.nx;
          var pvt = b.vx * ptx + b.vy * pty;
          var boost = Math.max(pd.power, -pvn * 1.08);
          b.vx = pd.nx * boost + ptx * pvt * 0.98;
          b.vy = pd.ny * boost + pty * pvt * 0.98;
          if (w.padBoing[pdi] <= 0.15) w.ev.push({ t: 'bounce', i: pdi, x: b.x, y: b.y });
          w.padBoing[pdi] = 1;
        }
      }

      // Swinging hinged gates.
      for (var gti = 0; gti < L.gates.length; gti++) {
        var gt = L.gates[gti], gst = w.gates[gti];
        var ep = MC.gateEndpoints(gt, gst.ang);
        var gSeg = makeSeg(ep[0], ep[1], ep[2], ep[3], MC.GATE_R, 'gate');
        var gc = collideCapsule(b, gSeg, 0.12, 0.14);
        if (gc) {
          applyContact(b, gc, dt);
          // Marble weight & momentum tip the hinged plank!
          var rx = b.x - gt.x, ry = b.y - gt.y;
          var torque = (rx * b.grav * 0.028) + (rx * b.vy - ry * b.vx) * 0.00018;
          gst.vang += clamp(torque, -14, 14) * dt * 60;
        }
      }

      // Collect contacts from static walls, cup walls, and player crayon strokes.
      // Interior segment contacts resolve BEFORE endpoint contacts so polyline joints never snag!
      var contacts = [], i, j, stSegs, cc;
      for (i = 0; i < L.walls.length; i++) {
        cc = collideCapsule(b, L.walls[i], 0.08, 0.14);
        if (cc) contacts.push(cc);
      }
      for (i = 0; i < L.cupWalls.length; i++) {
        cc = collideCapsule(b, L.cupWalls[i], 0.05, 1.4);
        if (cc) contacts.push(cc);
      }
      for (i = 0; i < w.strokes.length; i++) {
        stSegs = w.strokes[i].segs;
        for (j = 0; j < stSegs.length; j++) {
          cc = collideCapsule(b, stSegs[j], 0.06, 0.12);
          if (cc) contacts.push(cc);
        }
      }
      contacts.sort(function (c1, c2) {
        if (c1.interior !== c2.interior) return c1.interior ? -1 : 1;
        return c2.pen - c1.pen;
      });
      for (i = 0; i < contacts.length; i++) applyContact(b, contacts[i], dt);

      // Collectible floating stars.
      for (var si = 0; si < L.stars.length; si++) {
        if (!w.stars[si]) {
          var st = L.stars[si];
          if (Math.hypot(b.x - st[0], b.y - st[1]) <= MC.BALL_R + MC.STAR_R) {
            w.stars[si] = true;
            w.starsGot++;
            w.ev.push({ t: 'star', i: si, x: st[0], y: st[1] });
          }
        }
      }

      // Ticklish purple slime puddles!
      for (var sli = 0; sli < L.slimes.length; sli++) {
        var sl = L.slimes[sli];
        var nearX = clamp(b.x, sl.x + 6, sl.x + sl.w - 6);
        var nearY = clamp(b.y, sl.y + 6, sl.y + sl.h);
        if (Math.hypot(b.x - nearX, b.y - nearY) < MC.BALL_R - 2) {
          b.popped = true;
          w.popped = true;
          w.ev.push({ t: 'pop', kind: 'slime', x: b.x, y: b.y });
          return;
        }
      }

      // Out-of-bounds bottom safety check (on slime levels without a bottom tray).
      if (b.y > H + 48) {
        b.popped = true;
        w.popped = true;
        w.ev.push({ t: 'pop', kind: 'fall', x: b.x, y: H - 16 });
        return;
      }

      // Golden Star Cup capture check!
      var cupDist = Math.hypot(b.x - L.cup.x, b.y - (L.cup.y + 4));
      if (cupDist <= 26 * P.cupMagnet && Math.abs(b.x - L.cup.x) <= MC.CUP_W * 0.45) {
        b.inCup = true;
        b.vx = 0; b.vy = 0;
        w.ev.push({ t: 'ballCup', i: bi, x: L.cup.x, y: L.cup.y });
      }
    }

    var allIn = true;
    for (var k = 0; k < w.balls.length; k++) if (!w.balls[k].inCup) allIn = false;
    if (allIn && !w.done) {
      w.done = true;
      w.ev.push({ t: 'goal', x: L.cup.x, y: L.cup.y });
    }
  }

  MC.step = function (w, dt) {
    dt = clamp(+dt || 1 / 60, 0, 0.05);
    w.t += dt;
    for (var p = 0; p < w.padBoing.length; p++) {
      if (w.padBoing[p] > 0) w.padBoing[p] = Math.max(0, w.padBoing[p] - dt * 3.5);
    }
    if (!w.rolling || w.done || w.popped) return w;
    w.rollT += dt;
    var sdt = dt / MC.SUB;
    for (var s = 0; s < MC.SUB && !w.done && !w.popped; s++) substep(w, sdt);
    return w;
  };

  /* -------------------------------------------------- stars, shop, saves */
  // 1 star for reaching the cup, +1 for all 3 level stars, +1 for keeping ink <= par!
  MC.stars = function (L, starsGot, inkUsed) {
    return 1 + (starsGot >= L.stars.length ? 1 : 0) + (inkUsed <= L.inkPar + 0.5 ? 1 : 0);
  };

  MC.outcome = function (won, stars) {
    if (!won) return 0.15;
    return stars >= 3 ? 1 : stars === 2 ? 0.78 : 0.55;
  };

  MC.CRAYONS = [
    { id: 'rainbow', name: 'قوس قزح', color: '#ff5964', glow: '#ffca3a', rainbow: true, price: 0 },
    { id: 'cyan', name: 'سماوي نيون', color: '#00d9f5', glow: '#90f6ff', price: 4 },
    { id: 'pink', name: 'وردي حلوى', color: '#ff5ca8', glow: '#ffc2e2', price: 6 },
    { id: 'emerald', name: 'زمردي', color: '#10b981', glow: '#6ee7b7', price: 8 },
    { id: 'gold', name: 'ذهبي لامع', color: '#f59e0b', glow: '#fde68a', glitter: true, price: 12 },
    { id: 'galaxy', name: 'مجرة', color: '#7c3aed', glow: '#d8b4fe', galaxy: true, price: 16 }
  ];

  MC.SKINS = [
    { id: 'smiley', name: 'كرة مبتسمة', body: '#ffbe0b', rim: '#fb5607', price: 0 },
    { id: 'soccer', name: 'كرة قدم', body: '#ffffff', rim: '#1e293b', price: 4 },
    { id: 'melon', name: 'بطيخة', body: '#2ec4b6', rim: '#ff4d6d', price: 6 },
    { id: 'cat', name: 'قطة مرحة', body: '#ff9f1c', rim: '#e76f51', price: 8 },
    { id: 'astro', name: 'خوذة فضاء', body: '#4cc9f0', rim: '#4361ee', price: 12 },
    { id: 'crown', name: 'تاج ذهبي', body: '#ffd166', rim: '#ef476f', price: 16 }
  ];

  MC.freshSave = function () {
    return {
      v: 1,
      lv: MC.LEVELS.map(function () { return { s: 0, ink: 0, c: 0 }; }),
      coins: 0,
      crayons: MC.CRAYONS.map(function (_, i) { return i ? 0 : 1; }),
      skins: MC.SKINS.map(function (_, i) { return i ? 0 : 1; }),
      crayon: 0,
      skin: 0,
      coach: false
    };
  };

  function isInt(v, lo, hi) { return typeof v === 'number' && Math.floor(v) === v && v >= lo && v <= hi; }
  function asObj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : null; }

  MC.loadSave = function (raw) {
    var s = MC.freshSave(), r = asObj(raw);
    if (!r || r.v !== 1) return s;
    var lv = Array.isArray(r.lv) ? r.lv : [];
    s.lv.forEach(function (e, i) {
      var o = asObj(lv[i]);
      if (!o) return;
      e.s = isInt(o.s, 0, 3) ? o.s : 0;
      e.ink = e.s && isInt(o.ink, 0, 99999) ? o.ink : 0;
      e.c = isInt(o.c, 0, 7) ? o.c : 0;
    });
    s.coins = isInt(r.coins, 0, 99999) ? r.coins : 0;
    ['crayons', 'skins'].forEach(function (k) {
      var a = Array.isArray(r[k]) ? r[k] : [];
      s[k] = s[k].map(function (_, i) { return i === 0 || a[i] === 1 ? 1 : 0; });
    });
    s.crayon = isInt(r.crayon, 0, MC.CRAYONS.length - 1) && s.crayons[r.crayon] ? r.crayon : 0;
    s.skin = isInt(r.skin, 0, MC.SKINS.length - 1) && s.skins[r.skin] ? r.skin : 0;
    s.coach = r.coach === true;
    return s;
  };

  MC.isOpen = function (s, i) {
    return i === 0 || (i > 0 && i < MC.LEVELS.length && s.lv[i - 1].s > 0);
  };

  MC.totalStars = function (s) {
    var n = 0;
    for (var i = 0; i < s.lv.length; i++) n += s.lv[i].s;
    return n;
  };

  MC.nextLevel = function (s) {
    var top = 0;
    for (var i = 0; i < MC.LEVELS.length; i++) {
      if (!MC.isOpen(s, i)) break;
      top = i;
      if (!s.lv[i].s) return i;
    }
    return top;
  };

  function popcount(m) { var n = 0; while (m) { n += m & 1; m >>= 1; } return n; }

  MC.applyResult = function (s, i, stars, inkUsed, starFlags) {
    var e = s.lv[i];
    var used = clamp(Math.round(inkUsed), 0, 99999);
    var mask = 0;
    (starFlags || []).forEach(function (g, k) { if (g) mask |= 1 << k; });
    var newStars = Math.max(0, stars - e.s);
    var newPickups = popcount(mask & ~e.c);
    var earnedCoins = newStars * 2 + newPickups;
    var out = {
      first: !e.s,
      best: !!e.s && (stars > e.s || used < e.ink),
      moreStars: stars > e.s,
      coins: earnedCoins,
      opened: -1,
      world: -1
    };
    if (stars > e.s) e.s = stars;
    if (!e.ink || used < e.ink) e.ink = used;
    e.c |= mask;
    s.coins = Math.min(99999, s.coins + earnedCoins);
    if (out.first && i + 1 < MC.LEVELS.length) {
      out.opened = i + 1;
      if ((i + 1) % MC.PER_WORLD === 0) out.world = (i + 1) / MC.PER_WORLD;
    }
    return out;
  };

  MC.buy = function (s, kind, k) {
    var isSkin = kind === 'skin';
    var list = isSkin ? MC.SKINS : MC.CRAYONS;
    var own = isSkin ? s.skins : s.crayons;
    var key = isSkin ? 'skin' : 'crayon';
    if (!list[k]) return '';
    if (own[k]) { s[key] = k; return 'wear'; }
    if (s.coins < list[k].price) return '';
    s.coins -= list[k].price;
    own[k] = 1;
    s[key] = k;
    return 'bought';
  };

  if (typeof window !== 'undefined') window.MC = MC;
  if (typeof module !== 'undefined' && module.exports) module.exports = MC;
  else if (root) root.MC = MC;
})(typeof globalThis !== 'undefined' ? globalThis : this);
