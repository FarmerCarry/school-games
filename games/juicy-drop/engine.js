/* سلة الفواكه (Juicy Drop: Turbo Monster-Fruit Blaster) — Pure 2D Physics & Arcade Engine.
 * Dual UMD export: Node `module.exports` + Browser `window.JDEngine`.
 * Strictly pure: ZERO DOM, ZERO Kit, ZERO timers, ZERO localStorage, ZERO Math.random. */
(function (root) {
  'use strict';

  var E = {};
  var W = 1280, H = 720, CX = 640, CLOUD_Y = 86, TOP_Y = 148, FLOOR_Y = 666, BASE_HW = 260;
  var GRAVITY = 1140, SUBSTEPS = 4, MAX_V = 960;

  E.W = W; E.H = H; E.CX = CX;
  E.CLOUD_Y = CLOUD_Y; E.TOP_Y = TOP_Y; E.FLOOR_Y = FLOOR_Y; E.BASE_HW = BASE_HW;
  E.RAINBOW_R = 28; E.SUPER_BOOM_BONUS = 600; E.FEVER_DURATION = 8.0;

  E.FRUITS = [
    { tier: 0, id: 'berry', name: 'توت النينجا', r: 17, score: 4, color: '#5c6bc0', shade: '#283593', glow: '#9fa8da', accent: '#ff3d6e' },
    { tier: 1, id: 'cherry', name: 'كرزة الشرارة', r: 23, score: 8, color: '#ff3d6e', shade: '#ad1447', glow: '#ff80ab', accent: '#ffe033' },
    { tier: 2, id: 'kiwi', name: 'كيوي الأشواك', r: 30, score: 14, color: '#7cb342', shade: '#33691e', glow: '#c5e1a5', accent: '#dce775' },
    { tier: 3, id: 'lemon', name: 'ليمونة التوربو', r: 38, score: 24, color: '#ffe033', shade: '#c79100', glow: '#fff59d', accent: '#38bdf8' },
    { tier: 4, id: 'orange', name: 'برتقالة الكاراتيه', r: 47, score: 38, color: '#ff8f1f', shade: '#bf360c', glow: '#ffcc80', accent: '#1b1640' },
    { tier: 5, id: 'apple', name: 'تفاحة الصاروخ', r: 57, score: 58, color: '#ff3b30', shade: '#9a0007', glow: '#ff8a80', accent: '#4ade80' },
    { tier: 6, id: 'pom', name: 'رمّانة الفارس', r: 69, score: 86, color: '#e91e63', shade: '#880e4f', glow: '#f48fb1', accent: '#ffd54f' },
    { tier: 7, id: 'melon', name: 'شمّام الملاكم', r: 82, score: 124, color: '#9ccc65', shade: '#558b2f', glow: '#dcedc8', accent: '#ff5252' },
    { tier: 8, id: 'pine', name: 'أناناس الآلي', r: 96, score: 175, color: '#ffb300', shade: '#e65100', glow: '#ffe082', accent: '#00e5ff' },
    { tier: 9, id: 'watermelon', name: 'البطيخة الخارقة', r: 112, score: 250, color: '#2ecc71', shade: '#145a32', glow: '#a9dfbf', accent: '#ffd23f' }
  ];

  E.MODES = {
    classic: { id: 'classic', name: 'الدمج الكلاسيكي', desc: 'ادمج الوحوش واصنع البطيخة الخارقة!' },
    crates: { id: 'crates', name: 'تحطيم الصناديق', desc: 'ادمج قرب الصناديق المصفّحة لتفجيرها!' },
    rush: { id: 'rush', name: 'سباق الـ 90 ثانية', desc: 'سرعة قصوى وأدوات مضاعفة لجمع النجوم!', duration: 90, targets: [500, 1100, 1850] }
  };

  E.DIFFS = {
    easy: { id: 'easy', name: 'سهل', hwBonus: 16, overGrace: 3.4, dropCd: 0.23, magnet: 22, feverGain: 22, gadgets: { bomb: 2, shake: 2, swap: 3 }, pool: [0, 1, 2, 3], mergeHint: true, parDrops: 26, targetMult: 0.75, bumper: false },
    mid: { id: 'mid', name: 'متوسط', hwBonus: 0, overGrace: 2.5, dropCd: 0.25, magnet: 10, feverGain: 18, gadgets: { bomb: 1, shake: 1, swap: 2 }, pool: [0, 1, 2, 3, 4], mergeHint: false, parDrops: 28, targetMult: 1.0, bumper: false },
    hero: { id: 'hero', name: 'بطل', hwBonus: -8, overGrace: 1.9, dropCd: 0.20, magnet: 4, feverGain: 15, gadgets: { bomb: 1, shake: 1, swap: 1 }, pool: [0, 1, 2, 3, 4, 4], mergeHint: false, parDrops: 30, targetMult: 1.3, bumper: true }
  };

  E.DROPPERS = [
    { id: 'claw', name: 'مخلب الآلي', price: 0, color: '#ffd23f' },
    { id: 'cloud', name: 'سحابة البرق', price: 25, color: '#38bdf8' },
    { id: 'ufo', name: 'صحن فضائي', price: 50, color: '#a855f7' },
    { id: 'cannon', name: 'مدفع العصير', price: 80, color: '#ff3d6e' }
  ];

  E.TANKS = [
    { id: 'glass', name: 'زجاج التوربو', price: 0, rim: '#7dd3fc', wall: '#38bdf8', glow: '#0ea5e9' },
    { id: 'magma', name: 'حمم البركان', price: 30, rim: '#ff8f1f', wall: '#ff3d6e', glow: '#f97316' },
    { id: 'neon', name: 'نيون الفضاء', price: 55, rim: '#4ade80', wall: '#a855f7', glow: '#22d3ee' },
    { id: 'gold', name: 'الخلاط الذهبي', price: 90, rim: '#ffe033', wall: '#f59e0b', glow: '#fbbf24' }
  ];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  E.clamp = clamp;

  function makeRng(seed) {
    var s = (seed >>> 0) || 0x2468ace1;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pickTier(w, avoid) {
    var p = w.D.pool, t = p[Math.floor(w.rnd() * p.length) % p.length];
    return (avoid != null && t === avoid) ? p[(p.indexOf(t) + 1) % p.length] : t;
  }

  function buildCrates(diffId, jar) {
    var by = jar.bottom, ez = diffId === 'easy';
    var list = [
      { ox: -156, y: by - 36, hp: 1, kind: 'wood', prize: 2 },
      { ox: 0, y: by - 36, hp: ez ? 1 : 2, kind: ez ? 'wood' : 'ice', prize: 3 },
      { ox: 156, y: by - 36, hp: 1, kind: 'wood', prize: 2 },
      { ox: -84, y: by - 122, hp: ez ? 1 : 2, kind: ez ? 'wood' : 'ice', prize: 3 },
      { ox: 84, y: by - 122, hp: ez ? 1 : 2, kind: ez ? 'wood' : 'ice', prize: 4 }
    ];
    if (!ez) list.push({ ox: -168, y: by - 208, hp: 1, kind: 'wood', prize: 3 }, { ox: 168, y: by - 208, hp: 1, kind: 'wood', prize: 3 });
    if (diffId === 'hero') list.push({ ox: 0, y: by - 216, hp: 2, kind: 'ice', prize: 4 });
    return list.map(function (c, i) {
      return { id: i + 1, x: clamp(CX + c.ox, jar.left + 40, jar.right - 40), y: c.y, r: 34, hp: c.hp, maxHp: c.hp, kind: c.kind, prize: c.prize, hitAnim: 0 };
    });
  }

  E.create = function (opts) {
    opts = opts || {};
    var modeId = E.MODES[opts.mode] ? opts.mode : 'classic';
    var diffId = E.DIFFS[opts.diff] ? opts.diff : 'mid';
    var M = E.MODES[modeId], D = E.DIFFS[diffId];
    var ddaVal = typeof opts.dda === 'number' && isFinite(opts.dda) ? clamp(opts.dda, 0, 1) : 0.35;
    var hw = BASE_HW + D.hwBonus;
    var jar = { cx: CX, hw: hw, left: CX - hw, right: CX + hw, top: TOP_Y, bottom: FLOOR_Y };
    var rm = modeId === 'rush' ? 2 : 1;
    var targets = M.targets ? M.targets.map(function (v) { return Math.round((v * D.targetMult) / 10) * 10; }) : [0, 0, 0];

    var w = {
      mode: modeId, diff: diffId, M: M, D: D, jar: jar,
      rnd: makeRng(opts.seed != null ? opts.seed : 1337), nextId: 1,
      time: 0, timeLeft: modeId === 'rush' ? M.duration : 0, targets: targets,
      cloudX: CX, dropCd: 0, baseDropCd: modeId === 'rush' ? Math.min(0.17, D.dropCd) : D.dropCd,
      magnet: clamp(D.magnet + (0.5 - ddaVal) * 8, 2, 30),
      maxOverTime: clamp(D.overGrace + (0.5 - ddaVal) * 0.5, 1.4, 4.2),
      overTimer: 0, warning: false, drops: 0, merges: 0, score: 0,
      combo: 0, maxCombo: 0, comboTimer: 0, fever: 0, feverTime: 0, feverActive: false, shakeAnim: 0,
      highestTier: 0, seen: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      gadgets: { bomb: D.gadgets.bomb * rm, shake: D.gadgets.shake * rm, swap: D.gadgets.swap * rm },
      cratesTotal: 0, cratesSmashed: 0, superBooms: 0,
      currentTier: 0, currentPower: null, nextTier: 0,
      bumper: (modeId === 'rush' && D.bumper) ? { x: CX, y: 318, r: 22, vx: 135 } : null,
      fruits: [], crates: modeId === 'crates' ? buildCrates(diffId, jar) : [],
      done: false, won: false, over: false, stars: 0, ev: []
    };
    w.cratesTotal = w.crates.length;
    w.currentTier = pickTier(w, null);
    w.nextTier = pickTier(w, null);
    w.seen[w.currentTier] = 1;
    return w;
  };

  E.dropRadius = function (w) { return w.currentPower === 'rainbow' ? E.RAINBOW_R : E.FRUITS[w.currentTier].r; };
  E.cloudBounds = function (w) { var r = E.dropRadius(w); return { min: w.jar.left + r + 4, max: w.jar.right - r - 4 }; };

  E.spawnFruit = function (w, tier, x, y, vx, vy, power) {
    var rb = power === 'rainbow', r = rb ? E.RAINBOW_R : E.FRUITS[tier].r;
    var f = {
      id: w.nextId++, tier: rb ? -1 : tier, power: rb ? 'rainbow' : null,
      x: clamp(x, w.jar.left + r, w.jar.right - r), y: y, vx: vx || 0, vy: vy || 0,
      r: r, mass: r * r, rot: 0, vr: 0, squash: 0, squashV: 0, age: 0, landed: false, merged: false
    };
    if (!rb && tier >= 0 && tier < E.FRUITS.length) {
      w.seen[tier] = 1;
      if (tier > w.highestTier) w.highestTier = tier;
    }
    w.fruits.push(f);
    return f;
  };

  E.aimInfo = function (w) {
    var dr = E.dropRadius(w), x = w.cloudX, bestY = w.jar.bottom - dr, hitFruit = null;
    for (var i = 0; i < w.fruits.length; i++) {
      var f = w.fruits[i], dx = x - f.x, sR = dr + f.r;
      if (Math.abs(dx) < sR) {
        var cy = f.y - Math.sqrt(Math.max(0, sR * sR - dx * dx));
        if (cy >= TOP_Y - 30 && cy < bestY) { bestY = cy; hitFruit = f; }
      }
    }
    for (var c = 0; c < w.crates.length; c++) {
      var cr = w.crates[c], cdx = x - cr.x, cR = dr + cr.r;
      if (Math.abs(cdx) < cR) {
        var ccy = cr.y - Math.sqrt(Math.max(0, cR * cR - cdx * cdx));
        if (ccy < bestY) { bestY = ccy; hitFruit = null; }
      }
    }
    if (w.bumper && Math.abs(x - w.bumper.x) < dr + w.bumper.r) {
      var bS = dr + w.bumper.r, bcy = w.bumper.y - Math.sqrt(Math.max(0, bS * bS - (x - w.bumper.x) * (x - w.bumper.x)));
      if (bcy < bestY) { bestY = bcy; hitFruit = null; }
    }
    var willMerge = !!(hitFruit && (w.currentPower === 'rainbow' || hitFruit.power === 'rainbow' || hitFruit.tier === w.currentTier));
    return {
      x: x, yStart: CLOUD_Y + dr * 0.5, yHit: Math.max(TOP_Y, bestY),
      targetId: hitFruit ? hitFruit.id : 0, targetX: hitFruit ? hitFruit.x : x,
      targetY: hitFruit ? hitFruit.y : bestY, targetR: hitFruit ? hitFruit.r : dr, willMerge: willMerge
    };
  };

  function addFever(w, gain) {
    if (w.feverActive || w.done) return;
    w.fever = clamp(w.fever + gain, 0, 100);
    if (w.fever >= 100) {
      w.fever = 100; w.feverActive = true; w.feverTime = E.FEVER_DURATION;
      w.currentPower = 'rainbow';
      var b = E.cloudBounds(w);
      w.cloudX = clamp(w.cloudX, b.min, b.max);
      w.ev.push({ t: 'fever_start' });
    }
  }

  function damageCrate(w, idx, dmg) {
    var cr = w.crates[idx];
    if (!cr) return;
    cr.hp -= dmg; cr.hitAnim = 0.25;
    if (cr.hp <= 0) {
      w.crates.splice(idx, 1); w.cratesSmashed++;
      var pts = 45 * (w.feverActive ? 2 : 1);
      w.score += pts; addFever(w, 14);
      var sp = E.spawnFruit(w, cr.prize, cr.x, cr.y, (w.rnd() - 0.5) * 60, -110, null);
      sp.age = 1.2; sp.landed = true; sp.squash = 0.24;
      w.ev.push({ t: 'crate_smash', x: cr.x, y: cr.y, kind: cr.kind, prize: cr.prize, points: pts });
      if (w.mode === 'crates' && w.crates.length === 0 && !w.done) {
        w.done = true; w.won = true;
        w.stars = w.drops <= w.D.parDrops ? 3 : w.drops <= w.D.parDrops + 12 ? 2 : 1;
        w.ev.push({ t: 'win', stars: w.stars });
      }
    } else {
      w.ev.push({ t: 'crate_hit', x: cr.x, y: cr.y, kind: cr.kind });
    }
  }

  function damageCratesNear(w, x, y, radius, dmg) {
    for (var i = w.crates.length - 1; i >= 0; i--) {
      if (Math.hypot(w.crates[i].x - x, w.crates[i].y - y) <= radius + w.crates[i].r) damageCrate(w, i, dmg);
    }
  }

  E.useGadget = function (w, kind) {
    if (!w || w.done) return false;
    if (kind === 'bomb') {
      if (w.gadgets.bomb <= 0 || (!w.fruits.length && !w.crates.length)) return false;
      w.gadgets.bomb--;
      var blasted = w.fruits.filter(function (f) { return f.power !== 'rainbow'; })
        .sort(function (a, b) { return a.tier !== b.tier ? a.tier - b.tier : a.y - b.y; }).slice(0, 3);
      var ids = {};
      for (var i = 0; i < blasted.length; i++) {
        ids[blasted[i].id] = true;
        var pts = 20 * (w.feverActive ? 2 : 1);
        w.score += pts;
        w.ev.push({ t: 'bomb_pop', x: blasted[i].x, y: blasted[i].y, tier: blasted[i].tier, points: pts });
      }
      w.fruits = w.fruits.filter(function (f) { return !ids[f.id]; });
      for (var k = Math.min(1, w.crates.length - 1); k >= 0; k--) damageCrate(w, k, 1);
      w.overTimer = Math.max(0, w.overTimer - 1.2);
      w.ev.push({ t: 'gadget', kind: 'bomb', count: blasted.length });
      return true;
    }
    if (kind === 'shake') {
      if (w.gadgets.shake <= 0) return false;
      w.gadgets.shake--; w.shakeAnim = 0.55; w.overTimer = Math.max(0, w.overTimer * 0.35);
      for (var s = 0; s < w.fruits.length; s++) {
        var f = w.fruits[s], mate = null, bestD = 9999;
        for (var m = 0; m < w.fruits.length; m++) {
          var o = w.fruits[m];
          if (o !== f && o.tier === f.tier && f.tier >= 0) {
            var d = Math.hypot(o.x - f.x, o.y - f.y);
            if (d < bestD) { bestD = d; mate = o; }
          }
        }
        var dir = mate ? Math.sign(mate.x - f.x) : (s % 2 ? 1 : -1);
        f.vx += dir * 210 + (w.rnd() - 0.5) * 70;
        f.vy -= 270 + (s % 3) * 45;
        f.vr += dir * 4;
      }
      w.ev.push({ t: 'gadget', kind: 'shake' });
      return true;
    }
    if (kind === 'swap') {
      if (w.gadgets.swap <= 0) return false;
      w.gadgets.swap--;
      if (w.currentPower === 'rainbow') {
        w.currentPower = null; w.currentTier = w.nextTier; w.nextTier = pickTier(w, w.currentTier);
      } else {
        var old = w.currentTier;
        w.currentTier = w.nextTier === old ? pickTier(w, old) : w.nextTier;
        w.nextTier = old;
      }
      w.seen[w.currentTier] = 1;
      var b = E.cloudBounds(w);
      w.cloudX = clamp(w.cloudX, b.min, b.max);
      w.ev.push({ t: 'gadget', kind: 'swap', tier: w.currentTier });
      return true;
    }
    return false;
  };

  function resolveCircleStatic(f, sx, sy, sr, bounce) {
    var dx = f.x - sx, dy = f.y - sy, minD = f.r + sr, d2 = dx * dx + dy * dy;
    if (d2 >= minD * minD) return;
    var d = Math.sqrt(d2), nx = d > 0.001 ? dx / d : 0, ny = d > 0.001 ? dy / d : -1, pen = minD - d;
    f.x += nx * pen; f.y += ny * pen;
    var vn = f.vx * nx + f.vy * ny;
    if (vn < 0) {
      f.vx -= (1 + bounce) * vn * nx; f.vy -= (1 + bounce) * vn * ny;
      f.vr = clamp(f.vr + nx * 2.5, -10, 10);
      if (-vn > 160) f.squashV -= Math.min(3.2, -vn * 0.006);
      f.landed = true;
    }
  }

  function performMerge(w, a, b) {
    a.merged = b.merged = true;
    var mx = (a.x + b.x) * 0.5, my = (a.y + b.y) * 0.5;
    var baseTier = (a.power === 'rainbow' && b.power === 'rainbow') ? 4 : a.power === 'rainbow' ? b.tier : b.power === 'rainbow' ? a.tier : a.tier;
    var wasRainbow = a.power === 'rainbow' || b.power === 'rainbow';

    w.merges++;
    w.combo = w.comboTimer > 0 ? w.combo + 1 : 1;
    if (w.combo > w.maxCombo) w.maxCombo = w.combo;
    w.comboTimer = 2.2;
    if (w.merges % 5 === 0) w.gadgets.swap = Math.min(5, w.gadgets.swap + 1);
    if (w.merges % 8 === 0) w.gadgets.shake = Math.min(4, w.gadgets.shake + 1);
    if (w.merges % 10 === 0) w.gadgets.bomb = Math.min(4, w.gadgets.bomb + 1);

    if (baseTier >= 9) {
      var boomPts = E.SUPER_BOOM_BONUS * (w.feverActive ? 2 : 1);
      w.score += boomPts; w.superBooms++; addFever(w, 100);
      damageCratesNear(w, mx, my, 220, 2);
      w.ev.push({ t: 'mega_boom', x: mx, y: my, points: boomPts });
      return;
    }

    var toTier = baseTier + 1, spec = E.FRUITS[toTier];
    var pts = Math.round(spec.score * (1 + Math.min(4, w.combo - 1) * 0.25) * (w.feverActive ? 2 : 1));
    w.score += pts;
    addFever(w, w.D.feverGain + Math.min(12, w.combo * 3));

    var nf = E.spawnFruit(w, toTier, mx, Math.min(my, w.jar.bottom - spec.r), (a.vx + b.vx) * 0.25, Math.min(-75, (a.vy + b.vy) * 0.2 - 55), null);
    nf.age = Math.max(a.age, b.age, 1.2); nf.landed = true; nf.squash = -0.28; nf.squashV = 4.2;

    for (var i = 0; i < w.fruits.length; i++) {
      var o = w.fruits[i];
      if (o === nf || o.merged) continue;
      var waveR = spec.r * 2.4 + o.r + 40, dx = o.x - mx, dy = o.y - my, dist = Math.hypot(dx, dy);
      if (dist > 1 && dist < waveR) {
        var push = (1 - dist / waveR) * (110 + toTier * 16);
        o.vx += (dx / dist) * push; o.vy += (dy / dist) * push - 40;
      }
    }
    damageCratesNear(w, mx, my, spec.r + 56, (w.feverActive || wasRainbow || toTier >= 5) ? 2 : 1);
    w.ev.push({ t: 'merge', x: mx, y: nf.y, tier: baseTier, toTier: toTier, points: pts, combo: w.combo, rainbow: wasRainbow });
  }

  E.step = function (w, dt, inp) {
    if (!w || w.done) return;
    inp = inp || {}; dt = clamp(dt || 0, 0, 0.05);
    if (dt <= 0 && !inp.drop && !inp.gadget && inp.x == null && !inp.move) return;

    w.time += dt;
    if (w.dropCd > 0) w.dropCd = Math.max(0, w.dropCd - dt);
    if (w.comboTimer > 0 && (w.comboTimer = Math.max(0, w.comboTimer - dt)) === 0) w.combo = 0;
    if (w.shakeAnim > 0) w.shakeAnim = Math.max(0, w.shakeAnim - dt);
    if (w.feverActive) {
      w.feverTime = Math.max(0, w.feverTime - dt);
      w.fever = (w.feverTime / E.FEVER_DURATION) * 100;
      if (w.feverTime <= 0) { w.feverActive = false; w.fever = 0; w.ev.push({ t: 'fever_end' }); }
    }
    for (var ci = 0; ci < w.crates.length; ci++) if (w.crates[ci].hitAnim > 0) w.crates[ci].hitAnim = Math.max(0, w.crates[ci].hitAnim - dt);
    if (w.bumper) {
      w.bumper.x += w.bumper.vx * dt;
      if (w.bumper.x > CX + 132) { w.bumper.x = CX + 132; w.bumper.vx = -Math.abs(w.bumper.vx); }
      else if (w.bumper.x < CX - 132) { w.bumper.x = CX - 132; w.bumper.vx = Math.abs(w.bumper.vx); }
    }

    var bounds = E.cloudBounds(w);
    if (typeof inp.x === 'number' && isFinite(inp.x)) w.cloudX = clamp(inp.x, bounds.min, bounds.max);
    else if (inp.move) w.cloudX = clamp(w.cloudX + clamp(inp.move, -1, 1) * 540 * dt, bounds.min, bounds.max);
    else w.cloudX = clamp(w.cloudX, bounds.min, bounds.max);

    if (inp.gadget) E.useGadget(w, inp.gadget);
    if (inp.drop && w.dropCd <= 0 && !w.done) {
      var dr = E.dropRadius(w), dropX = clamp(w.cloudX, w.jar.left + dr + 4, w.jar.right - dr - 4);
      w.cloudX = dropX;
      var dropped = E.spawnFruit(w, w.currentTier, dropX, TOP_Y - 10, 0, 190, w.currentPower);
      w.drops++;
      w.dropCd = w.feverActive ? w.baseDropCd * 0.72 : w.baseDropCd;
      w.ev.push({ t: 'drop', x: dropped.x, y: dropped.y, tier: dropped.tier, power: dropped.power });
      w.currentPower = null; w.currentTier = w.nextTier; w.nextTier = pickTier(w, null);
      w.seen[w.currentTier] = 1;
      var nb = E.cloudBounds(w);
      w.cloudX = clamp(w.cloudX, nb.min, nb.max);
    }
    if (dt <= 0) return;

    var sdt = dt / SUBSTEPS;
    for (var sub = 0; sub < SUBSTEPS; sub++) {
      var n = w.fruits.length;
      for (var i = 0; i < n; i++) {
        var f = w.fruits[i];
        f.vy = clamp(f.vy + GRAVITY * sdt, -MAX_V, MAX_V);
        f.vx = clamp(f.vx * 0.9985, -MAX_V, MAX_V);
        f.x += f.vx * sdt; f.y += f.vy * sdt; f.rot += f.vr * sdt; f.vr *= 0.985;
        if (f.x - f.r < w.jar.left) { f.x = w.jar.left + f.r; if (f.vx < 0) { f.vx = -f.vx * 0.28; f.vr = -f.vy / f.r * 0.2; } }
        else if (f.x + f.r > w.jar.right) { f.x = w.jar.right - f.r; if (f.vx > 0) { f.vx = -f.vx * 0.28; f.vr = f.vy / f.r * 0.2; } }
        if (f.y + f.r > w.jar.bottom) {
          f.y = w.jar.bottom - f.r;
          if (f.vy > 0) {
            if (f.vy > 190 && !f.landed) w.ev.push({ t: 'land', x: f.x, y: f.y + f.r, power: clamp(f.vy / 650, 0.2, 1) });
            if (f.vy > 150) f.squashV -= Math.min(3.5, f.vy * 0.0065);
            f.vy = Math.abs(f.vy * 0.22) < 22 ? 0 : -f.vy * 0.22;
          }
          f.vx *= 0.94; f.vr = (f.vx / f.r) * 0.85; f.landed = true;
        }
        for (var c = 0; c < w.crates.length; c++) resolveCircleStatic(f, w.crates[c].x, w.crates[c].y, w.crates[c].r, 0.28);
        if (w.bumper) resolveCircleStatic(f, w.bumper.x, w.bumper.y, w.bumper.r, 0.65);
      }

      var toMerge = [];
      for (var aI = 0; aI < n; aI++) {
        var a = w.fruits[aI];
        if (a.merged) continue;
        for (var bI = aI + 1; bI < n; bI++) {
          var b = w.fruits[bI];
          if (b.merged) continue;
          var dx = b.x - a.x, dy = b.y - a.y, minD = a.r + b.r, dist = Math.hypot(dx, dy);
          var canMerge = (a.power === 'rainbow' || b.power === 'rainbow' || a.tier === b.tier);
          if (canMerge && dist < minD + w.magnet) {
            if (dist <= minD + 2.5) { a.merged = b.merged = true; toMerge.push([a, b]); break; }
            else if (dist > 0.01) {
              var pull = 260 * sdt, ux = dx / dist, uy = dy / dist;
              a.vx += ux * pull; a.vy += uy * pull; b.vx -= ux * pull; b.vy -= uy * pull;
            }
          }
          if (dist < minD) {
            if (dist < 0.001) { dx = ((a.id + b.id) % 2 ? 1 : -1) * 0.4; dy = -0.4; dist = Math.hypot(dx, dy); }
            else if (Math.abs(dx) < 0.05 && !canMerge) { dx += ((a.id + b.id) % 2 ? 0.35 : -0.35); dist = Math.hypot(dx, dy); }
            var nx = dx / dist, ny = dy / dist, pen = minD - dist;
            var invA = 1 / a.mass, invB = 1 / b.mass, invS = invA + invB;
            a.x -= nx * pen * (invA / invS); a.y -= ny * pen * (invA / invS);
            b.x += nx * pen * (invB / invS); b.y += ny * pen * (invB / invS);
            var rvx = b.vx - a.vx, rvy = b.vy - a.vy, vn = rvx * nx + rvy * ny;
            if (vn < 0) {
              var imp = -(1.25) * vn / invS;
              a.vx -= imp * invA * nx; a.vy -= imp * invA * ny;
              b.vx += imp * invB * nx; b.vy += imp * invB * ny;
              var tx = -ny, ty = nx, vt = (rvx * tx + rvy * ty) * 0.18;
              a.vx += vt * tx * (invA / invS); b.vx -= vt * tx * (invB / invS);
              a.vr = clamp(a.vr + vt / a.r * 0.9, -12, 12); b.vr = clamp(b.vr - vt / b.r * 0.9, -12, 12);
              if (-vn > 150) {
                var sq = Math.min(2.8, -vn * 0.005);
                a.squashV -= sq; b.squashV -= sq;
                if (!a.landed || !b.landed) w.ev.push({ t: 'land', x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5, power: clamp(-vn / 700, 0.2, 0.9) });
              }
              a.landed = b.landed = true;
            }
          }
        }
      }
      if (toMerge.length > 0) {
        w.fruits = w.fruits.filter(function (f) { return !f.merged; });
        for (var mI = 0; mI < toMerge.length; mI++) performMerge(w, toMerge[mI][0], toMerge[mI][1]);
      }
    }

    var rimCrossed = false;
    for (var fi = 0; fi < w.fruits.length; fi++) {
      var fr = w.fruits[fi];
      fr.age += dt;
      fr.squashV += (-fr.squash * 68 - fr.squashV * 11) * dt;
      fr.squash = clamp(fr.squash + fr.squashV * dt, -0.35, 0.35);
      if (fr.age > 1.15 && (fr.y - fr.r) < w.jar.top - 4) rimCrossed = true;
    }
    if (rimCrossed && !w.done) {
      var prevW = w.warning;
      w.overTimer += dt; w.warning = w.overTimer >= 0.35;
      if (w.warning && !prevW) w.ev.push({ t: 'warn' });
      if (w.overTimer >= w.maxOverTime) { w.done = w.over = true; w.ev.push({ t: 'overflow' }); return; }
    } else {
      w.overTimer = Math.max(0, w.overTimer - dt * 2.2);
      if (w.overTimer < 0.2) w.warning = false;
    }

    if (w.mode === 'rush' && !w.done && (w.timeLeft = Math.max(0, w.timeLeft - dt)) <= 0) {
      w.done = true;
      var st = w.score >= w.targets[2] ? 3 : w.score >= w.targets[1] ? 2 : w.score >= w.targets[0] ? 1 : 0;
      w.stars = st;
      if (st >= 1) { w.won = true; w.ev.push({ t: 'win', stars: st }); }
      else { w.over = true; w.ev.push({ t: 'time_up', stars: 0 }); }
    }
  };

  E.defaultSave = function () {
    return { v: 2, coins: 0, best: { classic: 0, crates: 0, rush: 0 }, stars: { crates: 0, rush: 0 }, dropper: 0, droppers: [1, 0, 0, 0], tank: 0, tanks: [1, 0, 0, 0] };
  };

  E.loadSave = function (raw) {
    var d = E.defaultSave();
    if (!raw || typeof raw !== 'object') return d;
    d.coins = clamp(raw.coins | 0, 0, 999999);
    if (raw.best && typeof raw.best === 'object') {
      d.best.classic = clamp(raw.best.classic | 0, 0, 9999999);
      d.best.crates = clamp(raw.best.crates | 0, 0, 9999999);
      d.best.rush = clamp(raw.best.rush | 0, 0, 9999999);
    } else if (typeof raw.bestEndless === 'number') d.best.classic = clamp(raw.bestEndless | 0, 0, 9999999);
    if (raw.stars && typeof raw.stars === 'object') {
      d.stars.crates = clamp(raw.stars.crates | 0, 0, 3);
      d.stars.rush = clamp(raw.stars.rush | 0, 0, 3);
    }
    if (Array.isArray(raw.droppers)) for (var i = 0; i < 4; i++) d.droppers[i] = i === 0 || raw.droppers[i] ? 1 : 0;
    if (Array.isArray(raw.tanks)) for (var j = 0; j < 4; j++) d.tanks[j] = j === 0 || raw.tanks[j] ? 1 : 0;
    d.dropper = d.droppers[raw.dropper | 0] ? (raw.dropper | 0) : 0;
    d.tank = d.tanks[raw.tank | 0] ? (raw.tank | 0) : 0;
    return d;
  };

  E.roundReward = function (w) {
    if (!w || w.drops < 3) return 0;
    var base = Math.floor(w.score / 55) + w.superBooms * 12 + (w.won ? 10 + w.stars * 6 : 0);
    return clamp(base, w.won ? 12 : (w.merges >= 2 ? 3 : 0), 120);
  };

  E.buyOrEquip = function (save, kind, idx) {
    var cat = kind === 'tank' ? E.TANKS : E.DROPPERS, own = kind === 'tank' ? save.tanks : save.droppers;
    if (idx < 0 || idx >= cat.length) return false;
    if (own[idx]) { if (kind === 'tank') save.tank = idx; else save.dropper = idx; return 'equipped'; }
    if (save.coins < cat[idx].price) return false;
    save.coins -= cat[idx].price; own[idx] = 1;
    if (kind === 'tank') save.tank = idx; else save.dropper = idx;
    return 'bought';
  };

  if (typeof module === 'object' && module.exports) module.exports = E;
  if (root) root.JDEngine = E;
})(typeof window !== 'undefined' ? window : null);
