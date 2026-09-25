/* Pizza Empire (إمبراطورية البيتزا) — main game. */
(function () {
  'use strict';
  var PZ = window.PZ, Art = window.PZArt, K = window.Kit;
  var W = 1280, H = 720, PX = 400;          // play area starts at x = PX
  var CX = 840, CY = 405, R = 142;           // the big pizza
  var WIN = { x: 452, y: 98, w: 776, h: 230 }; // kitchen window
  var COUNTER_Y = 508;
  var TAU = Math.PI * 2;
  var store = K.store('pizza-clicker');
  var $ = function (id) { return document.getElementById(id); };
  var NB = PZ.BUILDINGS.length;

  /* ============================================================ state */
  function fresh() {
    return {
      v: 1, pizzas: 0, runBaked: 0, lifetime: 0, handBaked: 0, clicks: 0,
      owned: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], ups: {}, ach: {}, crusts: 0, rebirths: 0, golden: 0,
      skin: 'classic', skins: { classic: 1 }, seenSkins: { classic: 1 }, bestCombo: 0, rainCaught: 0,
      skinChanged: false, awayCollected: false, t: Date.now(), playTime: 0, buyAmt: 1, seenAch: 0,
      tut: 0
    };
  }
  function num(v, d) { return typeof v === 'number' && isFinite(v) && v >= 0 ? v : d; }
  function load() {
    var f = fresh(), d = store.get('save', null);
    if (!d || typeof d !== 'object') return f;
    for (var k in f) {
      if (!Object.prototype.hasOwnProperty.call(d, k)) continue;
      if (typeof f[k] === 'number') f[k] = num(d[k], f[k]);
      else if (typeof f[k] === 'boolean') f[k] = !!d[k];
      else if (typeof f[k] === 'string') f[k] = typeof d[k] === 'string' ? d[k] : f[k];
      else if (Array.isArray(f[k])) { if (Array.isArray(d[k])) for (var i = 0; i < f[k].length; i++) f[k][i] = Math.floor(num(d[k][i], 0)); }
      else if (d[k] && typeof d[k] === 'object') f[k] = d[k];
    }
    if (!PZ.SKIN[f.skin] || !f.skins[f.skin]) f.skin = 'classic';
    if ([1, 10, 100].indexOf(f.buyAmt) < 0) f.buyAmt = 1;
    return f;
  }
  var S = load();

  // derived values
  var D = { bmult: [], flav: 1, achBonus: 1, crustBonus: 1, clickBase: 1, clickPct: 0, goldRate: 1, goldDur: 1, goldStay: 1 };
  function recalc() {
    var i, u, tb = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], clickX = 0, pct = 0, flav = 1, achUps = 0, gold = {};
    var upCount = 0;
    for (var id in S.ups) {
      u = PZ.UPG[id]; if (!u) continue;
      upCount++;
      if (u.kind === 'b') tb[u.b]++;
      else if (u.kind === 'click') clickX++;
      else if (u.kind === 'pct') pct += u.val;
      else if (u.kind === 'flav') flav *= 1 + u.val;
      else if (u.kind === 'ach') achUps++;
      else if (u.kind === 'gold') gold[u.id] = 1;
    }
    var achCount = 0;
    for (var a in S.ach) if (PZ.ACH[a]) achCount++;
    S.achCount = achCount; S.upCount = upCount;
    D.flav = flav;
    D.achPer = 1 + achUps;
    D.achBonus = 1 + achCount * 0.01 * D.achPer;
    D.crustBonus = 1 + S.crusts * PZ.CRUST_BONUS;
    D.clickBase = Math.pow(2, clickX);
    D.clickPct = pct;
    D.goldRate = gold.g0 ? 2 : 1; D.goldDur = gold.g1 ? 2 : 1; D.goldStay = gold.g2 ? 2 : 1;
    var tot = 0, total = 0;
    for (i = 0; i < NB; i++) {
      D.bmult[i] = Math.pow(2, tb[i]) * flav * D.achBonus * D.crustBonus;
      total += S.owned[i] * PZ.BUILDINGS[i].pps * D.bmult[i];
      tot += S.owned[i];
    }
    S.totalOwned = tot;
    S.ppsBase = total;
  }
  recalc();

  /* ============================================================ runtime */
  var mode = 'title';      // title | play | pause
  var modalOpen = null;    // name of the open modal
  var buffs = { frenzy: 0, frenzyMax: 0, click: 0, clickMax: 0 };
  var combo = 0, lastClickT = -9, clickTimes = [], comboShown = 0;
  var golden = null, goldenTimer = S.golden ? K.rand(40, 70) : K.rand(22, 30);
  var rain = { toSpawn: 0, spawnT: 0, items: [], caughtThis: 0 };
  var now = 0;             // game clock (s)
  var started = false;
  var hiddenAt = 0;

  function frenzyMult() { return buffs.frenzy > 0 ? 7 : 1; }
  function ppsNow() { return S.ppsBase * frenzyMult(); }
  function comboMult() { return 1 + Math.min(combo, 100) / 200; }
  function clickValue() {
    var v = (D.clickBase * D.crustBonus + ppsNow() * D.clickPct) * comboMult();
    if (buffs.click > 0) v *= 77;
    return v;
  }
  // signed number that keeps its "+" on the left inside RTL text
  // Only the numeric part is isolated: "+1.2 مليون" must keep the Arabic word
  // to the LEFT of the number (RTL order), otherwise it reads backwards.
  function plus(s) {
    s = String(s);
    var sp = s.indexOf(' ');
    if (sp < 0) return '<bdi dir="ltr">+' + s + '</bdi>';
    return '<bdi dir="ltr">+' + s.slice(0, sp) + '</bdi>' + s.slice(sp);
  }
  function gain(n, hand) {
    if (!(n > 0)) return;
    S.pizzas += n; S.runBaked += n; S.lifetime += n;
    if (hand) S.handBaked += n;
  }

  /* ============================================================ views */
  var stage = $('stage'), bg = $('bg'), fx = $('fx'), heroCv = $('hero');
  var bctx = bg.getContext('2d'), fctx = fx.getContext('2d'), hctx = heroCv.getContext('2d');
  var scale = 1, dpr = 1, px = 1;
  var cacheWall = document.createElement('canvas'), cacheCounter = document.createElement('canvas');
  var pizzaCache = document.createElement('canvas');
  var pizzaCacheSkin = '';

  function resize() {
    var ww = window.innerWidth, wh = window.innerHeight;
    scale = Math.min(ww / W, wh / H);
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    px = scale * dpr;
    var ox = Math.round((ww - W * scale) / 2), oy = Math.round((wh - H * scale) / 2);
    stage.style.transform = 'translate(' + ox + 'px,' + oy + 'px) scale(' + scale + ')';
    [bg, fx].forEach(function (c) { c.width = Math.round(W * px); c.height = Math.round(H * px); });
    heroCv.width = Math.round(300 * px); heroCv.height = Math.round(250 * px);
    buildCaches();
    pizzaCacheSkin = '';
  }
  function toLogical(e) {
    var r = stage.getBoundingClientRect();
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
  }

  /* ------------------------------------------------------- static art */
  function buildCaches() {
    var c;
    // wall with a hole for the window
    cacheWall.width = Math.round(W * px); cacheWall.height = Math.round(H * px);
    c = cacheWall.getContext('2d');
    c.setTransform(px, 0, 0, px, 0, 0);
    c.clearRect(0, 0, W, H);
    var g = c.createLinearGradient(0, 0, 0, COUNTER_Y);
    g.addColorStop(0, '#fbe3b5'); g.addColorStop(1, '#f2c98a');
    c.fillStyle = g; c.fillRect(PX, 0, W - PX, COUNTER_Y + 10);
    // tiles
    c.strokeStyle = 'rgba(190,120,60,0.22)'; c.lineWidth = 2;
    for (var y = 0; y < COUNTER_Y; y += 40) {
      c.beginPath(); c.moveTo(PX, y); c.lineTo(W, y); c.stroke();
      for (var x = PX + ((y / 40) % 2 ? 20 : 0); x < W; x += 40) { c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 40); c.stroke(); }
    }
    // checker strip under the window
    for (var k = 0; k < 22; k++) {
      c.fillStyle = k % 2 ? '#e8413a' : '#fff4e0';
      c.fillRect(PX + k * 40, 352, 40, 16);
    }
    c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(PX, 368, W - PX, 3);
    // window hole
    c.save();
    Art.rr(c, WIN.x, WIN.y, WIN.w, WIN.h, 22);
    c.globalCompositeOperation = 'destination-out'; c.fillStyle = '#000'; c.fill();
    c.restore();
    // frame
    Art.rr(c, WIN.x - 12, WIN.y - 12, WIN.w + 24, WIN.h + 24, 30);
    Art.rr(c, WIN.x, WIN.y, WIN.w, WIN.h, 22);
    c.save();
    Art.rr(c, WIN.x - 12, WIN.y - 12, WIN.w + 24, WIN.h + 24, 30);
    c.lineWidth = 5; c.strokeStyle = '#4a1f0c'; c.stroke();
    c.restore();
    c.lineWidth = 12; c.strokeStyle = '#a0522d';
    Art.rr(c, WIN.x - 6, WIN.y - 6, WIN.w + 12, WIN.h + 12, 26); c.stroke();
    c.lineWidth = 3; c.strokeStyle = '#4a1f0c';
    Art.rr(c, WIN.x, WIN.y, WIN.w, WIN.h, 22); c.stroke();
    // sill
    Art.rr(c, WIN.x - 24, WIN.y + WIN.h + 6, WIN.w + 48, 16, 6); Art.fs(c, '#b5652f', '#4a1f0c', 4);
    // little shelves with jars at the wall sides
    shelf(c, 414, 395); shelf(c, 1150, 395);

    // counter
    cacheCounter.width = Math.round(W * px); cacheCounter.height = Math.round(H * px);
    c = cacheCounter.getContext('2d');
    c.setTransform(px, 0, 0, px, 0, 0);
    c.clearRect(0, 0, W, H);
    Art.rr(c, PX - 10, COUNTER_Y, W - PX + 20, 26, 8); Art.fs(c, '#e9e2d6', '#4a1f0c', 4);
    c.fillStyle = 'rgba(255,255,255,0.6)'; c.fillRect(PX, COUNTER_Y + 5, W - PX, 4);
    var g2 = c.createLinearGradient(0, COUNTER_Y + 26, 0, H);
    g2.addColorStop(0, '#b8612a'); g2.addColorStop(1, '#8c4318');
    c.fillStyle = g2; c.fillRect(PX, COUNTER_Y + 26, W - PX, H - COUNTER_Y - 26);
    c.strokeStyle = '#4a1f0c'; c.lineWidth = 4;
    c.beginPath(); c.moveTo(PX, COUNTER_Y + 28); c.lineTo(W, COUNTER_Y + 28); c.stroke();
    for (var p = 0; p < 6; p++) {
      var x0 = PX + 20 + p * 145;
      Art.rr(c, x0, COUNTER_Y + 44, 125, 120, 14);
      c.lineWidth = 4; c.strokeStyle = 'rgba(74,31,12,0.45)'; c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.06)'; c.fill();
    }
  }
  function shelf(c, x, y) {
    Art.rr(c, x, y, 116, 10, 3); Art.fs(c, '#a0522d', '#4a1f0c', 3);
    var cols = ['#e0402a', '#3aa845', '#ffd43b'];
    for (var i = 0; i < 3; i++) {
      Art.rr(c, x + 8 + i * 36, y - 34, 28, 34, 8); Art.fs(c, 'rgba(235,250,255,0.9)', '#4a1f0c', 3);
      Art.rr(c, x + 11 + i * 36, y - 20, 22, 18, 5); Art.fs(c, cols[i]);
      Art.rr(c, x + 9 + i * 36, y - 40, 26, 8, 3); Art.fs(c, '#b5462a', '#4a1f0c', 2.5);
    }
  }

  function ensurePizzaCache() {
    if (pizzaCacheSkin === S.skin + px) return;
    pizzaCacheSkin = S.skin + px;
    var size = (R + 8) * 2;
    pizzaCache.width = Math.round(size * px); pizzaCache.height = Math.round(size * px);
    var c = pizzaCache.getContext('2d');
    c.setTransform(px, 0, 0, px, 0, 0);
    c.clearRect(0, 0, size, size);
    c.translate(size / 2, size / 2);
    Art.pizza(c, PZ.SKIN[S.skin], R, true);
  }

  // small images used in the DOM (data URLs)
  var imgCache = {};
  function iconURL(key, size, draw) {
    if (imgCache[key]) return imgCache[key];
    var c = document.createElement('canvas');
    c.width = c.height = size * 2;
    var x = c.getContext('2d');
    x.scale(2, 2);
    draw(x, size);
    imgCache[key] = c.toDataURL();
    return imgCache[key];
  }
  function pizzaIconURL() {
    return iconURL('pz', 24, function (c, s) { Art.miniPizza(c, s / 2, s / 2, s * 0.44); });
  }
  function upIconURL(u) { return iconURL('u_' + u.id, 48, function (c, s) { Art.upgradeIcon(c, u, s); }); }
  function trophyURL(on) { return iconURL('tr' + on, 44, function (c, s) { Art.trophy(c, s / 2, s / 2 + 2, s * 0.9, on ? '#ffc928' : '#c9bca5'); }); }

  /* ============================================================ sound */
  var A = K.audio;
  var snd = {
    click: function (n) {
      var f = 330 + Math.min(n, 60) * 9 + Math.random() * 30;
      A.tone({ freq: f, to: f * 1.7, type: 'sine', dur: 0.08, vol: 0.28 });
      A.noise({ dur: 0.05, vol: 0.08, filter: 2600, to: 600 });
    },
    buy: function () {
      A.tone({ freq: 880, type: 'square', dur: 0.06, vol: 0.12 });
      A.tone({ freq: 1320, type: 'square', dur: 0.12, vol: 0.12, delay: 0.06 });
      A.tone({ freq: 140, to: 70, type: 'triangle', dur: 0.12, vol: 0.25 });
    },
    no: function () { A.tone({ freq: 170, to: 120, type: 'square', dur: 0.16, vol: 0.1 }); },
    upgrade: function () { K.sfx.power(); },
    ach: function () { [784, 988, 1175, 1568].forEach(function (f, i) { A.tone({ freq: f, type: 'triangle', dur: 0.18, vol: 0.22, delay: i * 0.08 }); }); },
    goldAppear: function () { [1568, 2093, 2637, 3136].forEach(function (f, i) { A.tone({ freq: f, type: 'sine', dur: 0.12, vol: 0.1, delay: i * 0.06 }); }); },
    goldClick: function () { K.sfx.win(); A.noise({ dur: 0.3, vol: 0.12, filter: 5000, to: 1500 }); },
    goldMiss: function () { A.tone({ freq: 700, to: 300, type: 'sine', dur: 0.3, vol: 0.1 }); },
    catchRain: function (n) { A.tone({ freq: 600 + n * 30, to: 900 + n * 40, type: 'sine', dur: 0.08, vol: 0.22 }); },
    combo: function () { [659, 880, 1175].forEach(function (f, i) { A.tone({ freq: f, type: 'square', dur: 0.08, vol: 0.12, delay: i * 0.05 }); }); },
    ui: function () { K.sfx.click(); },
    rebirth: function () {
      A.tone({ freq: 200, to: 1600, type: 'sawtooth', dur: 1.1, vol: 0.12 });
      [523, 659, 784, 1047, 1319, 1568].forEach(function (f, i) { A.tone({ freq: f, type: 'triangle', dur: 0.25, vol: 0.25, delay: 0.9 + i * 0.1 }); });
      A.noise({ dur: 0.8, vol: 0.3, filter: 1500, to: 80, delay: 0.9 });
    },
    collect: function () { [523, 659, 784, 1047].forEach(function (f, i) { A.tone({ freq: f, type: 'square', dur: 0.1, vol: 0.14, delay: i * 0.05 }); }); }
  };

  /* ============================================================ fx */
  var parts = [], floats = [];
  var MAXP = 360, MAXF = 50;
  var shakeP = 0, shakeX = 0, shakeY = 0;
  function spawnPart(x, y, vx, vy, life, size, color, shape, g) {
    if (parts.length >= MAXP) parts.shift();
    parts.push({ x: x, y: y, vx: vx, vy: vy, life: life, max: life, size: size, color: color, shape: shape || 0, rot: Math.random() * TAU, vr: K.rand(-8, 8), g: g == null ? 900 : g });
  }
  function toppingBurst(x, y, n, spd) {
    var cols = PZ.SKIN[S.skin].parts;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * TAU, sp = (spd || 330) * K.rand(0.45, 1);
      spawnPart(x, y, Math.cos(a) * sp, Math.sin(a) * sp - 180, K.rand(0.5, 0.9), K.rand(7, 13), K.pick(cols), K.randInt(0, 2));
    }
  }
  function sparkle(x, y, n, cols) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * TAU, sp = K.rand(80, 380);
      spawnPart(x, y, Math.cos(a) * sp, Math.sin(a) * sp, K.rand(0.5, 1), K.rand(6, 12), K.pick(cols || ['#fff6a0', '#ffd700', '#ffffff']), 3, 150);
    }
  }
  function confetti(n) {
    var cols = ['#ff5a5f', '#ffb13b', '#ffe14d', '#5fd35f', '#4fa3ff', '#b36bff', '#ffffff'];
    for (var i = 0; i < n; i++) spawnPart(K.rand(PX, W), K.rand(-60, -10), K.rand(-60, 60), K.rand(60, 260), K.rand(2, 3.5), K.rand(8, 14), K.pick(cols), 4, 160);
  }
  function floatText(x, y, text, opt) {
    opt = opt || {};
    if (floats.length >= MAXF) floats.shift();
    floats.push({ x: x, y: y, vy: opt.vy || -90, life: opt.life || 1, max: opt.life || 1, text: text, size: opt.size || 30, color: opt.color || '#ffffff', rtl: !!opt.rtl, pop: 0, combo: !!opt.combo });
  }
  function shake(p) { shakeP = Math.max(shakeP, p); }

  /* ============================================================ pizza state */
  var pz = { s: 1, sv: 0, sq: 0, sqv: 0, mood: 0, moodT: 0, blinkT: 3, blink: 0, hover: false };
  var mouse = { x: CX, y: CY - 200 };

  var COMBO_WORDS = [[10, 'جميل!'], [25, 'رائع!'], [50, 'ممتاز!'], [100, 'نار!'], [200, 'أسطوري!'], [400, 'خارق!']];

  function clickPizza(x, y) {
    var t = performance.now();
    while (clickTimes.length && t - clickTimes[0] > 1000) clickTimes.shift();
    if (clickTimes.length >= 16) return; // anti auto-click cap
    clickTimes.push(t);
    combo = now - lastClickT < 0.65 ? combo + 1 : 1;
    lastClickT = now;
    if (combo > S.bestCombo) S.bestCombo = combo;
    var v = clickValue();
    gain(v, true);
    S.clicks++;
    // juice
    pz.s = Math.max(0.86, pz.s - 0.075); pz.sqv = Math.min(pz.sqv + 3.2, 6);
    pz.mood = 1; pz.moodT = 0.22;
    toppingBurst(x, y, 6);
    floatText(x + K.rand(-10, 10), y - 20, '+' + PZ.fmt(v), { size: buffs.click > 0 ? 38 : 30, color: buffs.click > 0 ? '#7fe0ff' : '#ffffff' });
    snd.click(combo);
    for (var i = 0; i < COMBO_WORDS.length; i++) {
      if (combo === COMBO_WORDS[i][0]) {
        for (var fi = floats.length - 1; fi >= 0; fi--) if (floats[fi].combo) floats.splice(fi, 1);
        floatText(CX, CY - R - 40, COMBO_WORDS[i][1], { size: 56, color: '#ffe14d', rtl: true, life: 1.3, vy: -40, combo: true });
        sparkle(CX, CY - R - 40, 18);
        snd.combo(); shake(6);
      }
    }
    if (S.tut < 1 && S.clicks >= 5) S.tut = 1;
  }

  /* ============================================================ golden pizza */
  function spawnGolden() {
    var fromLeft = Math.random() < 0.5;
    var life = 11 * D.goldStay;
    golden = {
      x0: fromLeft ? PX + 60 : W - 60, x1: fromLeft ? W - 60 : PX + 60,
      y: K.rand(170, 470), t: 0, life: life, R: 44, x: 0, yy: 0, ph: Math.random() * TAU
    };
    golden.x = golden.x0; golden.yy = golden.y;
    snd.goldAppear();
  }
  function scheduleGolden() { goldenTimer = K.rand(50, 95) / D.goldRate; }
  var GOLD_EFFECTS = [
    { id: 'frenzy', w: 40 }, { id: 'lucky', w: 34 }, { id: 'rain', w: 16 }, { id: 'click', w: 10 }
  ];
  function clickGolden(forced) {
    var g = golden; golden = null;
    scheduleGolden();
    S.golden++;
    snd.goldClick(); shake(8);
    sparkle(g.x, g.yy, 30);
    var eff = forced;
    if (!eff) {
      var tot = 0, i; for (i = 0; i < GOLD_EFFECTS.length; i++) tot += GOLD_EFFECTS[i].w;
      var r = Math.random() * tot;
      for (i = 0; i < GOLD_EFFECTS.length; i++) { r -= GOLD_EFFECTS[i].w; if (r <= 0) { eff = GOLD_EFFECTS[i].id; break; } }
      if (S.golden <= 1) eff = 'frenzy';
      // ×7 of (almost) nothing is a let-down: with no real production yet,
      // give the ×77 super clicks instead so the first golden pizza always feels huge.
      if (eff === 'frenzy' && S.ppsBase < 2) eff = 'click';
    }
    if (eff === 'frenzy') {
      buffs.frenzy = buffs.frenzyMax = 30 * D.goldDur;
      showBanner('هيجان البيتزا!', 'الإنتاج <bdi dir="ltr">×7</bdi> لمدة ' + Math.round(buffs.frenzy) + ' ثانية');
    } else if (eff === 'click') {
      buffs.click = buffs.clickMax = 13 * D.goldDur;
      showBanner('نقرات خارقة!', 'كل نقرة <bdi dir="ltr">×77</bdi> لمدة ' + Math.round(buffs.click) + ' ثانية. انقر بسرعة!');
    } else if (eff === 'rain') {
      rain.toSpawn = 26; rain.spawnT = 0; rain.caughtThis = 0;
      showBanner('مطر البيتزا!', 'انقر على البيتزا المتساقطة لتجمعها!');
    } else {
      var v = Math.max(13, Math.min(S.pizzas * 0.2, S.ppsBase * 1200), D.clickBase * D.crustBonus * 30);
      gain(v, false);
      showBanner('محظوظ!', plus(PZ.fmt(v)) + ' بيتزا');
      floatText(g.x, g.yy, '+' + PZ.fmt(v), { size: 40, color: '#ffe14d', life: 1.6 });
    }
  }
  function rainValue() { return Math.max(S.ppsBase * 8, D.clickBase * D.crustBonus * 6, 5); }

  /* ============================================================ buying */
  function buyBuilding(i, rowEl) {
    var n = S.buyAmt, cost = PZ.buildCost(i, S.owned[i], n);
    if (S.pizzas < cost) { snd.no(); flash(rowEl, 'shake'); return false; }
    var firstOne = S.owned[i] === 0;
    S.pizzas -= cost; S.owned[i] += n;
    recalc(); snd.buy(); flash(rowEl, 'bump');
    if (firstOne && i > 0) { showBanner('مبنى جديد!', PZ.BUILDINGS[i].name); confetti(50); snd.upgrade(); }
    // particles from the shop row
    if (rowEl) {
      var r = rowEl.getBoundingClientRect(), sr = stage.getBoundingClientRect();
      var lx = (r.left + 30 - sr.left) / scale, ly = (r.top + r.height / 2 - sr.top) / scale;
      sparkle(lx + 300, ly, 10, ['#fff6a0', '#ffd700', '#7dff9a']);
    }
    var sp = scenePos(i);
    if (sp) { toppingBurst(sp.x, sp.y, 10, 260); floatText(sp.x, sp.y - 30, '+' + n, { size: 30, color: '#7dff9a' }); }
    if (S.tut < 2 && i === 0) S.tut = 2;
    save();
    refreshShop(true);
    return true;
  }
  function buyUpgrade(u, el) {
    if (S.ups[u.id]) return;
    if (S.pizzas < u.cost) { snd.no(); flash(el, 'shake'); return; }
    S.pizzas -= u.cost; S.ups[u.id] = 1;
    recalc(); snd.upgrade();
    if (el) {
      var r = el.getBoundingClientRect(), sr = stage.getBoundingClientRect();
      sparkle((r.left + r.width / 2 - sr.left) / scale, (r.top + r.height / 2 - sr.top) / scale, 16);
    }
    hideTip();
    save();
    refreshShop(true);
  }
  function flash(el, cls) {
    if (!el) return;
    el.classList.remove('bump', 'shake');
    void el.offsetWidth;
    el.classList.add(cls);
  }

  /* ============================================================ shop UI */
  var listEl = $('list'), upsEl = $('ups');
  var rows = [];
  function buildShop() {
    for (var i = 0; i < NB; i++) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'brow';
      var cv = document.createElement('canvas'); cv.width = cv.height = 108;
      var info = document.createElement('div'); info.className = 'info';
      var nm = document.createElement('div'); nm.className = 'nm';
      var cost = document.createElement('div'); cost.className = 'cost';
      var img = document.createElement('img'); img.src = pizzaIconURL(); img.alt = '';
      var cs = document.createElement('span');
      cost.appendChild(img); cost.appendChild(cs);
      info.appendChild(nm); info.appendChild(cost);
      var cnt = document.createElement('div'); cnt.className = 'cnt';
      b.appendChild(cv); b.appendChild(info); b.appendChild(cnt);
      listEl.appendChild(b);
      var row = { el: b, cv: cv, nm: nm, cs: cs, cnt: cnt, state: '', costTxt: '', cntTxt: '', i: i };
      rows.push(row);
      (function (row) {
        b.addEventListener('click', function () {
          if (row.state === 'mystery' || row.state === 'hidden') return;
          buyBuilding(row.i, row.el);
          tipFor = null; showBuildingTip(row);
        });
        b.addEventListener('mouseenter', function () { if (row.state !== 'mystery') showBuildingTip(row); });
        b.addEventListener('mouseleave', hideTip);
      })(row);
    }
    var amts = $('amt').querySelectorAll('button');
    Array.prototype.forEach.call(amts, function (btn) {
      btn.addEventListener('click', function () {
        S.buyAmt = +btn.getAttribute('data-n'); snd.ui(); paintAmt(); refreshShop(true);
      });
    });
    paintAmt();
  }
  function paintAmt() {
    Array.prototype.forEach.call($('amt').querySelectorAll('button'), function (btn) {
      btn.classList.toggle('on', +btn.getAttribute('data-n') === S.buyAmt);
    });
  }
  function drawRowIcon(row, dark) {
    var c = row.cv.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, 108, 108);
    Art.icon(c, row.i, 54, 56, 98, 0, row.i === 0 ? 0 : 0);
    if (dark) {
      c.globalCompositeOperation = 'source-atop';
      c.fillStyle = '#2a120a'; c.fillRect(0, 0, 108, 108);
      c.globalCompositeOperation = 'source-over';
    }
  }
  function revealed(i) { return S.owned[i] > 0 || S.lifetime >= PZ.BUILDINGS[i].cost * 0.5 || i === 0; }
  var upsSig = null;
  function refreshShop(force) {
    var lastRevealed = -1, i;
    for (i = 0; i < NB; i++) if (revealed(i)) lastRevealed = i;
    for (i = 0; i < NB; i++) {
      var row = rows[i];
      var st = i <= lastRevealed ? 'show' : i <= lastRevealed + 2 ? 'mystery' : 'hidden';
      if (st !== row.state) {
        row.state = st;
        row.el.style.display = st === 'hidden' ? 'none' : '';
        row.el.classList.toggle('mystery', st === 'mystery');
        drawRowIcon(row, st === 'mystery');
        row.nm.textContent = st === 'mystery' ? '؟؟؟' : PZ.BUILDINGS[i].name;
      }
      if (st === 'hidden') continue;
      var cost = PZ.buildCost(i, S.owned[i], S.buyAmt);
      var ct = PZ.fmt(cost);
      if (ct !== row.costTxt) { row.costTxt = ct; row.cs.textContent = ct; }
      var nt = S.owned[i] ? String(S.owned[i]) : '';
      if (nt !== row.cntTxt) { row.cntTxt = nt; row.cnt.textContent = nt; }
      var no = S.pizzas < cost;
      if (row.no !== no) { row.no = no; row.el.classList.toggle('no', no); }
    }
    $('bNote').textContent = S.totalOwned ? 'لديك ' + S.totalOwned : '';
    // upgrades
    var avail = [];
    for (i = 0; i < PZ.UPGRADES.length; i++) {
      var u = PZ.UPGRADES[i];
      if (!S.ups[u.id] && u.cond(S)) avail.push(u);
    }
    avail.sort(function (a, b) { return a.cost - b.cost; });
    var sig = avail.map(function (u) { return u.id; }).join(',');
    if (sig !== upsSig || force) {
      if (sig !== upsSig) {
        upsSig = sig;
        upsEl.textContent = '';
        if (!avail.length) {
          var e = document.createElement('div'); e.className = 'empty'; e.textContent = 'اصنع المزيد من البيتزا لتظهر ترقيات جديدة!';
          upsEl.appendChild(e);
        }
        avail.forEach(function (u) {
          var b = document.createElement('button');
          b.type = 'button'; b.className = 'up'; b.setAttribute('data-id', u.id);
          var im = document.createElement('img'); im.src = upIconURL(u); im.alt = '';
          b.appendChild(im);
          b.addEventListener('click', function () { buyUpgrade(u, b); });
          b.addEventListener('mouseenter', function () { showUpgradeTip(u, b); });
          b.addEventListener('mouseleave', hideTip);
          upsEl.appendChild(b);
        });
      }
    }
    $('upsNote').textContent = avail.length ? String(avail.length) : '';
    Array.prototype.forEach.call(upsEl.querySelectorAll('.up'), function (b) {
      var u = PZ.UPG[b.getAttribute('data-id')];
      var ok = S.pizzas >= u.cost;
      b.classList.toggle('no', !ok); b.classList.toggle('ok', ok);
    });
    if (tipFor) tipFor();
  }

  /* ------------------------------------------------------------ tooltips */
  var tipEl = $('tip'), tipFor = null;
  function placeTip(el) {
    var r = el.getBoundingClientRect(), sr = stage.getBoundingClientRect();
    var y = (r.top - sr.top) / scale;
    tipEl.hidden = false;
    var h = tipEl.offsetHeight;
    tipEl.style.top = Math.max(8, Math.min(H - h - 8, y + (r.height / scale) / 2 - h / 2)) + 'px';
  }
  function showBuildingTip(row) {
    var i = row.i, b = PZ.BUILDINGS[i];
    tipFor = function () {
      var cost = PZ.buildCost(i, S.owned[i], S.buyAmt);
      var each = b.pps * D.bmult[i], tot = each * S.owned[i];
      var pct = S.ppsBase > 0 ? Math.round(tot / S.ppsBase * 100) : 0;
      if (pct < 1 && tot > 0) pct = '<1';
      var html = '<div class="th"><img src="' + bIconURL(i) + '" alt=""><div><div class="tn">' + b.name + (S.buyAmt > 1 ? ' <span dir="ltr">×' + S.buyAmt + '</span>' : '') + '</div>' +
        '<div class="tc' + (S.pizzas < cost ? ' no' : '') + '"><img src="' + pizzaIconURL() + '" alt="">' + PZ.fmt(cost) + '</div></div></div>' +
        '<div class="td">' + b.desc + '</div>' +
        '<div class="ts">كل واحد يصنع <b>' + PZ.fmtRate(each) + '</b> في الثانية' +
        (S.owned[i] ? '<br>لديك <b>' + S.owned[i] + '</b> تصنع <b>' + PZ.fmtRate(tot) + '</b> في الثانية <bdi dir="ltr">(' + (pct === '<1' ? '&lt;1' : pct) + '%)</bdi>' : '') + '</div>';
      if (tipEl._h !== html) { tipEl.innerHTML = html; tipEl._h = html; }
    };
    tipFor(); placeTip(row.el);
  }
  function showUpgradeTip(u, el) {
    tipFor = function () {
      var html = '<div class="th"><img src="' + upIconURL(u) + '" alt=""><div><div class="tn">' + u.name + '</div>' +
        '<div class="tc' + (S.pizzas < u.cost ? ' no' : '') + '"><img src="' + pizzaIconURL() + '" alt="">' + PZ.fmt(u.cost) + '</div></div></div>' +
        '<div class="td">' + u.desc + '</div>' +
        '<div class="ts">' + (S.pizzas >= u.cost ? '<b>انقر للشراء!</b>' : 'تحتاج <b>' + PZ.fmt(u.cost - S.pizzas) + '</b> بيتزا أخرى') + '</div>';
      if (tipEl._h !== html) { tipEl.innerHTML = html; tipEl._h = html; }
    };
    tipFor(); placeTip(el);
  }
  function hideTip() { tipFor = null; tipEl.hidden = true; tipEl._h = ''; }
  function bIconURL(i) { return iconURL('b' + i, 48, function (c, s) { Art.icon(c, i, s / 2, s / 2 + 1, s * 0.92, 0, 0); }); }

  /* ============================================================ HUD */
  var countEl = $('count'), rateEl = $('rate'), buffsEl = $('buffs');
  var lastCountTxt = '', lastRateTxt = '', lastBuffTxt = '';
  function refreshHud() {
    var ct = PZ.fmt(S.pizzas) + ' <span class="w">بيتزا</span>';
    if (ct !== lastCountTxt) { lastCountTxt = ct; countEl.innerHTML = ct; }
    var rt = 'في الثانية: ' + PZ.fmtRate(ppsNow());
    if (buffs.frenzy > 0) rt += ' <bdi class="boost" dir="ltr">×7</bdi>';
    if (S.crusts > 0) rt += ' &nbsp;<span class="crust">🌟 ' + plus(Math.round(S.crusts * PZ.CRUST_BONUS * 100) + '%') + '</span>';
    if (rt !== lastRateTxt) { lastRateTxt = rt; rateEl.innerHTML = rt; }
    var bt = '';
    if (buffs.frenzy > 0) bt += '<div class="buff">🔥 هيجان البيتزا <bdi dir="ltr">×7</bdi> — ' + Math.ceil(buffs.frenzy) + '<i style="width:' + (buffs.frenzy / buffs.frenzyMax * 100).toFixed(1) + '%"></i></div>';
    if (buffs.click > 0) bt += '<div class="buff click">⚡ نقرات خارقة <bdi dir="ltr">×77</bdi> — ' + Math.ceil(buffs.click) + '<i style="width:' + (buffs.click / buffs.clickMax * 100).toFixed(1) + '%"></i></div>';
    if (bt !== lastBuffTxt) { lastBuffTxt = bt; buffsEl.innerHTML = bt; }
    // rebirth button
    var rb = $('bReb');
    var show = S.lifetime >= 1e6 || S.rebirths > 0;
    rb.hidden = !show;
    if (show) {
      var ready = rebirthReady();
      rb.classList.toggle('ready', ready); rb.classList.toggle('wait', !ready);
    }
    // badges
    var na = S.achCount - S.seenAch;
    var ab = $('achBadge');
    ab.hidden = na <= 0; if (na > 0) ab.textContent = '+' + na;
    var ns = false;
    for (var k in S.skins) if (!S.seenSkins[k]) ns = true;
    $('skinBadge').hidden = !ns;
  }

  // goal chip
  var goalText = $('goalText'), goalBar = $('goalBar'), lastGoal = '';
  function refreshGoal() {
    var best = null, bp = -1;
    for (var i = 0; i < PZ.ACHIEVEMENTS.length; i++) {
      var a = PZ.ACHIEVEMENTS[i];
      if (!a.goal || S.ach[a.id] || !a.prog) continue;
      if (a.id.indexOf('own1_') === 0 && !revealed(+a.id.slice(5))) continue;
      var p = Math.min(0.999, a.prog(S));
      if (p > bp) { bp = p; best = a; }
    }
    var txt = best ? '🎯 ' + best.desc : '🎯 أنت بطل البيتزا!';
    if (txt !== lastGoal) { lastGoal = txt; goalText.textContent = txt; }
    goalBar.style.width = (best ? Math.max(2, bp * 100) : 100).toFixed(1) + '%';
  }

  // news ticker
  var newsEl = $('news'), newsT = 0, lastNews = -1;
  function nextNews() {
    var pool = [];
    for (var i = 0; i < PZ.NEWS.length; i++) {
      var n = PZ.NEWS[i];
      if (i !== lastNews && (n[0] < 0 || S.owned[n[0]] > 0)) pool.push(i);
    }
    // prefer lines about the newest building
    var pick = K.pick(pool);
    var top = -1; for (var b = NB - 1; b >= 0; b--) if (S.owned[b] > 0) { top = b; break; }
    if (Math.random() < 0.4) { var tp = pool.filter(function (j) { return PZ.NEWS[j][0] === top; }); if (tp.length) pick = K.pick(tp); }
    lastNews = pick;
    newsEl.classList.add('fade');
    setTimeout(function () {
      newsEl.innerHTML = '<b>أخبار البيتزا:</b> ' + PZ.NEWS[pick][1];
      newsEl.classList.remove('fade');
    }, 400);
  }

  // hint bubble
  var hintEl = $('hint'), hintKey = '';
  function refreshHint() {
    var key = '', txt = '', cls = '', x = 0, y = 0;
    if (mode === 'play' && !modalOpen) {
      if (S.tut < 1) { key = 'click'; txt = 'انقر على البيتزا!'; cls = 'down'; x = CX; y = CY - R - 70; }
      else if (S.owned[0] === 0 && S.pizzas >= PZ.buildCost(0, 0, 1) && S.tut < 2) { key = 'buy'; txt = 'اشترِ طاهيًا يخبز لك!'; cls = 'left'; x = 410; y = rowY(0); }
      else if (golden && S.golden === 0) { key = 'gold'; txt = 'انقر البيتزا الذهبية!'; cls = 'down'; x = K.clamp(golden.x, PX + 130, W - 130); y = golden.yy - 110; }
    }
    if (key !== hintKey) {
      hintKey = key;
      hintEl.hidden = !key;
      if (key) { hintEl.textContent = txt; hintEl.className = cls; }
    }
    if (key) {
      var w = hintEl.offsetWidth, h = hintEl.offsetHeight;
      if (cls === 'down') { hintEl.style.left = (x - w / 2) + 'px'; hintEl.style.top = (y - h / 2) + 'px'; }
      else { hintEl.style.left = (x + 14) + 'px'; hintEl.style.top = (y - h / 2) + 'px'; }
    }
  }
  function rowY(i) {
    var r = rows[i].el.getBoundingClientRect(), sr = stage.getBoundingClientRect();
    return (r.top + r.height / 2 - sr.top) / scale;
  }

  /* ------------------------------------------------------------ toasts */
  var toastsEl = $('toasts');
  function toast(img, top, name, desc) {
    var t = document.createElement('div'); t.className = 'toast';
    t.innerHTML = '<img alt="" src="' + img + '"><div><div class="tt">' + top + '</div><div class="tn">' + name + '</div>' + (desc ? '<div class="td">' + desc + '</div>' : '') + '</div>';
    toastsEl.appendChild(t);
    while (toastsEl.children.length > 3) toastsEl.removeChild(toastsEl.firstChild);
    setTimeout(function () { t.classList.add('out'); }, 3600);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 4000);
  }
  var bannerEl = $('banner'), bannerTO = 0;
  function showBanner(big, small) {
    bannerEl.className = '';
    bannerEl.innerHTML = '<div><b>' + big + '</b><span>' + small + '</span></div>';
    clearTimeout(bannerTO);
    bannerTO = setTimeout(function () { bannerEl.className = 'out'; setTimeout(function () { if (bannerEl.className === 'out') bannerEl.innerHTML = ''; }, 400); }, 2200);
  }

  /* ============================================================ checks */
  function checkAchievements() {
    var got = false;
    for (var i = 0; i < PZ.ACHIEVEMENTS.length; i++) {
      var a = PZ.ACHIEVEMENTS[i];
      if (S.ach[a.id]) continue;
      if (a.cond(S)) {
        S.ach[a.id] = 1; got = true;
        toast(trophyURL(true), 'كأس جديدة! (' + plus('1%') + ' إنتاج)', a.name, a.desc);
      }
    }
    if (got) { recalc(); snd.ach(); sparkle(1120, 140, 14); }
    for (var j = 0; j < PZ.SKINS.length; j++) {
      var sk = PZ.SKINS[j];
      if (!S.skins[sk.id] && sk.cond(S)) {
        S.skins[sk.id] = 1;
        toast(skinURL(sk), 'شكل بيتزا جديد!', sk.name, 'اختره من زر 🎨');
      }
    }
  }
  function skinURL(sk) {
    return iconURL('sk_' + sk.id, 44, function (c, s) { c.translate(s / 2, s / 2); Art.pizza(c, sk, s * 0.45, true); Art.face(c, s * 0.45, 0, 0, false, 0); });
  }

  /* ============================================================ rebirth */
  function rebirthGain() { return Math.max(0, PZ.crustsFor(S.lifetime) - S.crusts); }
  function rebirthReady() { return S.runBaked >= PZ.REBIRTH_MIN && rebirthGain() >= 1; }
  function openRebirth() {
    var ready = rebirthReady(), g = rebirthGain();
    var html = '<button class="close" data-act="close" type="button">✕</button><h2>🌟 انطلاقة ذهبية</h2>' +
      '<p style="max-width:620px">ابدأ إمبراطورية جديدة من الصفر! ستخسر البيتزا والمباني والترقيات،<br>لكنك تربح <b>قشورًا ذهبية</b>: كل قشرة تزيد إنتاجك <b>10%</b> إلى الأبد.<br>الكؤوس وأشكال البيتزا تبقى معك.</p>';
    if (ready) {
      html += '<div>ستحصل على</div><div class="crustbig">🌟 ' + PZ.fmt(g) + ' قشرة ذهبية</div>' +
        '<p>إنتاجك سيصبح <b>' + plus(Math.round((S.crusts + g) * PZ.CRUST_BONUS * 100) + '%') + '</b> بدل <b>' + plus(Math.round(S.crusts * PZ.CRUST_BONUS * 100) + '%') + '</b></p>' +
        '<div class="row"><button class="btn gold" data-act="reb" data-primary="1" type="button">انطلق! 🌟</button><button class="btn alt" data-act="close" type="button">ليس الآن</button></div>';
    } else {
      var need = Math.max(0, PZ.REBIRTH_MIN - S.runBaked);
      html += '<div class="crustbig" style="color:#a08a60">🔒</div><p>اصنع <b>' + PZ.fmt(need) + '</b> بيتزا أخرى في هذه الجولة لتفتح الانطلاقة الذهبية.</p>' +
        (g < 1 && need <= 0 ? '<p>اصنع المزيد من البيتزا لتربح قشرة جديدة!</p>' : '') +
        '<div class="row"><button class="btn" data-act="close" data-primary="1" type="button">حسنًا</button></div>';
    }
    openModal('rebirth', html, 720, function (act) {
      if (act === 'reb') doRebirth();
      else closeModal();
    });
  }
  function doRebirth() {
    var g = rebirthGain();
    if (!rebirthReady()) return;
    var runBaked = S.runBaked;
    S.crusts += g; S.rebirths++;
    S.pizzas = 0; S.runBaked = 0; S.owned = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; S.ups = {};
    buffs.frenzy = buffs.click = 0; golden = null; rain.items.length = 0; rain.toSpawn = 0;
    scheduleGolden();
    recalc(); checkAchievements(); save();
    upsSig = 'x'; refreshShop(true);
    snd.rebirth(); confetti(140); shake(14);
    var html = '<h2>إمبراطورية جديدة!</h2>' +
      '<p>لقد صنعت <b>' + PZ.fmt(runBaked) + '</b> بيتزا في الجولة السابقة!</p>' +
      '<div class="crustbig">' + plus(PZ.fmt(g)) + ' 🌟</div>' +
      '<p>لديك الآن <b>' + PZ.fmt(S.crusts) + '</b> قشرة ذهبية = إنتاج <b>' + plus(Math.round(S.crusts * PZ.CRUST_BONUS * 100) + '%') + '</b> للأبد!</p>' +
      '<div class="row"><button class="btn gold" data-act="close" data-primary="1" type="button">لنبدأ!</button></div>' +
      '<div class="keyhint"><span class="sg-key">Enter</span></div>';
    openModal('reborn', html, 640, function () { closeModal(); });
  }

  /* ============================================================ modals */
  var modalEl = $('modal'), mcard = $('mcard'), modalCb = null;
  function openModal(name, html, width, cb) {
    hideTip();
    modalOpen = name; modalCb = cb;
    mcard.style.width = width + 'px';
    mcard.innerHTML = html;
    modalEl.hidden = false;
    mcard.style.animation = 'none'; void mcard.offsetWidth; mcard.style.animation = '';
  }
  function closeModal() {
    modalEl.hidden = true; modalOpen = null; modalCb = null; mcard.innerHTML = '';
    snd.ui();
  }
  mcard.addEventListener('click', function (e) {
    var t = e.target.closest('[data-act]');
    if (!t || !modalCb) return;
    modalCb(t.getAttribute('data-act'), t);
  });
  modalEl.addEventListener('pointerdown', function (e) {
    if (e.target === modalEl && (modalOpen === 'ach' || modalOpen === 'skins')) closeModal();
  });

  function openAch() {
    S.seenAch = S.achCount;
    var html = '<button class="close" data-act="close" type="button">✕</button><h2>🏆 الكؤوس</h2>' +
      '<div class="achsum">جمعت ' + S.achCount + ' من ' + PZ.ACHIEVEMENTS.length + ' — كل كأس تزيد إنتاجك ' + plus(D.achPer + '%') + ' (المجموع ' + plus(Math.round((D.achBonus - 1) * 100) + '%') + ')</div>' +
      '<div id="achGrid" class="scroll">';
    PZ.ACHIEVEMENTS.forEach(function (a) {
      var on = !!S.ach[a.id];
      html += '<div class="ach' + (on ? '' : ' lock') + '"><img alt="" src="' + trophyURL(on) + '"><div><div class="an">' + a.name + '</div><div class="ad">' + a.desc + '</div></div></div>';
    });
    html += '</div>';
    openModal('ach', html, 920, function (act) { if (act === 'close') closeModal(); });
    snd.ui();
  }
  function openSkins() {
    var html = '<button class="close" data-act="close" type="button">✕</button><h2>🎨 أشكال البيتزا</h2><p>اختر شكل بيتزاك المفضّل! افتح أشكالًا جديدة باللعب.</p><div id="skinGrid">';
    PZ.SKINS.forEach(function (sk) {
      var own = !!S.skins[sk.id], on = S.skin === sk.id, isNew = own && !S.seenSkins[sk.id];
      html += '<button type="button" class="skin' + (on ? ' on' : '') + (own ? '' : ' lock') + (isNew ? ' new' : '') + '" data-act="skin" data-id="' + sk.id + '">' +
        '<canvas width="220" height="220" data-sk="' + sk.id + '"></canvas><div class="sn">' + (own ? sk.name : '🔒 ' + sk.name) + '</div>' +
        '<div class="ss">' + (on ? '✔ مختارة' : own ? 'انقر للاختيار' : sk.need) + '</div></button>';
    });
    html += '</div>';
    openModal('skins', html, 900, function (act, el) {
      if (act === 'close') { closeModal(); return; }
      var id = el.getAttribute('data-id');
      if (!S.skins[id]) { snd.no(); flash(el, 'shake'); return; }
      if (S.skin !== id) { S.skin = id; S.skinChanged = true; pizzaCacheSkin = ''; save(); }
      snd.buy(); toppingBurst(CX, CY, 24, 420);
      openSkins();
    });
    Array.prototype.forEach.call(mcard.querySelectorAll('canvas[data-sk]'), function (cv) {
      var sk = PZ.SKIN[cv.getAttribute('data-sk')];
      var c = cv.getContext('2d');
      c.translate(110, 110);
      Art.pizza(c, sk, 96, true);
      Art.face(c, 96, 0, 0.3, false, 0);
      if (!S.skins[sk.id]) {
        c.globalCompositeOperation = 'source-atop'; c.fillStyle = 'rgba(60,40,30,0.72)'; c.fillRect(-110, -110, 220, 220); c.globalCompositeOperation = 'source-over';
      }
    });
    for (var k in S.skins) S.seenSkins[k] = 1;
  }

  function fmtDuration(sec) {
    var m = Math.floor(sec / 60), h = Math.floor(m / 60); m = m % 60;
    function mins(n) { return n === 1 ? 'دقيقة واحدة' : n === 2 ? 'دقيقتان' : n <= 10 ? n + ' دقائق' : n + ' دقيقة'; }
    function hrs(n) { return n === 1 ? 'ساعة واحدة' : n === 2 ? 'ساعتان' : n <= 10 ? n + ' ساعات' : n + ' ساعة'; }
    if (h === 0) return mins(Math.max(1, m));
    return m ? hrs(h) + ' و' + mins(m) : hrs(h);
  }
  function offlineGain(sec) { return S.ppsBase * Math.min(sec, 3 * 3600) * 0.5; }
  function openOffline(sec, amt) {
    var html = '<h2>مرحبًا بعودتك!</h2>' +
      '<p>أثناء غيابك (' + fmtDuration(Math.min(sec, 3 * 3600)) + ') صنع فريقك:</p>' +
      '<div class="bignum">' + plus(PZ.fmt(amt)) + ' بيتزا</div>' +
      '<p style="font-size:15px;opacity:.8">(الفريق يعمل بنصف السرعة حين تغيب، حتى 3 ساعات)</p>' +
      '<div class="row"><button class="btn" data-act="take" data-primary="1" type="button">اجمعها! 🍕</button></div>' +
      '<div class="keyhint"><span class="sg-key">Enter</span></div>';
    openModal('offline', html, 600, function () {
      gain(amt, false); S.awayCollected = true;
      closeModal(); snd.collect(); toppingBurst(CX, CY, 40, 520); shake(6);
      floatText(CX, CY - 60, '+' + PZ.fmt(amt), { size: 44, color: '#7dff9a', life: 1.6 });
      save();
    });
  }
  function openResetConfirm() {
    var html = '<h2>امسح كل شيء؟</h2><p>ستختفي كل البيتزا والمباني والكؤوس والقشور الذهبية.<br><b>لا يمكن التراجع!</b></p>' +
      '<div class="row"><button class="btn red" data-act="yes" type="button">نعم، امسح</button><button class="btn alt" data-act="no" data-primary="1" type="button">لا، تراجع</button></div>';
    openModal('reset', html, 560, function (act) {
      if (act === 'yes') {
        store.remove('save');
        S = fresh(); recalc();
        buffs.frenzy = buffs.click = 0; golden = null; rain.items.length = 0; rain.toSpawn = 0; goldenTimer = K.rand(22, 30);
        pizzaCacheSkin = ''; upsSig = 'x';
        rows.forEach(function (r) { r.state = ''; r.costTxt = null; r.cntTxt = null; r.no = null; });
        parts.length = 0; floats.length = 0; combo = 0; toastsEl.textContent = '';
        paintAmt(); refreshShop(true); refreshHud(); refreshGoal(); save();
        closeModal(); setPause(false); showTitle();
      } else closeModal();
    });
  }

  /* ============================================================ modes */
  var titleEl = $('title'), pauseEl = $('pause');
  function showTitle() {
    mode = 'title'; hideTip();
    titleEl.hidden = false; pauseEl.hidden = true;
    $('bPlay').textContent = S.lifetime > 0 ? 'تابع!' : 'العب!';
    $('titleProg').innerHTML = S.lifetime > 0
      ? 'بيتزا مصنوعة: ' + PZ.fmt(S.lifetime) + ' &nbsp;•&nbsp; 🏆 ' + S.achCount + '/' + PZ.ACHIEVEMENTS.length + (S.crusts ? ' &nbsp;•&nbsp; 🌟 ' + PZ.fmt(S.crusts) : '')
      : 'هل تستطيع أن تصنع مليار بيتزا؟';
  }
  function startGame() {
    if (mode !== 'title') return;
    K.audio.unlock();
    titleEl.hidden = true;
    mode = 'play';
    snd.collect();
    if (!started) {
      started = true;
      var sec = (Date.now() - S.t) / 1000;
      if (sec > 60 && S.ppsBase > 0) {
        var amt = offlineGain(sec);
        if (amt >= 1) openOffline(sec, amt);
      }
    }
    S.t = Date.now();
  }
  function setPause(p) {
    if (p && mode === 'play') {
      mode = 'pause'; hideTip();
      var el = $('pauseStats');
      var mins = Math.floor(S.playTime / 60);
      el.innerHTML =
        '<span>كل البيتزا التي صنعتها</span><b>' + PZ.fmt(S.lifetime) + '</b>' +
        '<span>بيتزا في هذه الجولة</span><b>' + PZ.fmt(S.runBaked) + '</b>' +
        '<span>بيتزا في الثانية</span><b>' + PZ.fmtRate(S.ppsBase) + '</b>' +
        '<span>عدد النقرات</span><b>' + PZ.fmt(S.clicks) + '</b>' +
        '<span>أطول كومبو</span><b>' + S.bestCombo + '</b>' +
        '<span>بيتزا ذهبية</span><b>' + S.golden + '</b>' +
        '<span>القشور الذهبية</span><b>' + PZ.fmt(S.crusts) + '</b>' +
        '<span>وقت اللعب (دقيقة)</span><b>' + mins + '</b>';
      pauseEl.hidden = false; snd.ui();
    } else if (!p && mode === 'pause') {
      mode = 'play'; pauseEl.hidden = true; snd.ui();
    }
  }

  /* ============================================================ input */
  bg.addEventListener('pointerdown', function (e) {
    if (e.button !== 0) return;
    var p = toLogical(e);
    mouse.x = p.x; mouse.y = p.y;
    if (mode !== 'play' || modalOpen) return;
    // rain first
    for (var i = rain.items.length - 1; i >= 0; i--) {
      var it = rain.items[i];
      if (Math.hypot(it.x - p.x, it.y - p.y) < it.R + 14) { catchRain(i); return; }
    }
    if (golden && Math.hypot(golden.x - p.x, golden.yy - p.y) < golden.R * 1.35) { clickGolden(); return; }
    if (Math.hypot(p.x - CX, p.y - CY) < R * 1.04) clickPizza(p.x, p.y);
  });
  window.addEventListener('pointermove', function (e) {
    var p = toLogical(e); mouse.x = p.x; mouse.y = p.y;
  });
  function catchRain(i) {
    var it = rain.items[i]; rain.items.splice(i, 1);
    var v = rainValue();
    gain(v, false); S.rainCaught++; rain.caughtThis++;
    toppingBurst(it.x, it.y, 8, 300);
    floatText(it.x, it.y - 20, '+' + PZ.fmt(v), { size: 28, color: '#ffe14d' });
    snd.catchRain(rain.caughtThis);
  }

  window.addEventListener('keydown', function (e) {
    if (e.repeat) return;
    var c = e.code;
    if (mode === 'title') {
      if (c === 'Enter' || c === 'Space' || c === 'NumpadEnter') { e.preventDefault(); startGame(); }
      return;
    }
    if (modalOpen) {
      if (c === 'Escape') { if (modalCb) modalCb('close'); else closeModal(); }
      else if (c === 'Enter' || c === 'NumpadEnter') {
        e.preventDefault();
        var prim = mcard.querySelector('[data-primary]');
        if (prim) prim.click();
      }
      return;
    }
    if (mode === 'pause') {
      if (c === 'KeyP' || c === 'Escape' || c === 'Enter' || c === 'Space') { e.preventDefault(); setPause(false); }
      return;
    }
    if (c === 'KeyP' || c === 'Escape') { setPause(true); return; }
    if (c === 'Space') {
      e.preventDefault();
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      clickPizza(CX + K.rand(-R * 0.5, R * 0.5), CY + K.rand(-R * 0.5, R * 0.3));
    }
  });
  // stop buttons from keeping focus (so Space never re-triggers them)
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('button');
    if (b) b.blur();
  });

  $('bPlay').addEventListener('click', startGame);
  $('bPause').addEventListener('click', function () { setPause(true); });
  $('bResume').addEventListener('click', function () { setPause(false); });
  $('bMenu').addEventListener('click', function () { save(); pauseEl.hidden = true; showTitle(); snd.ui(); });
  $('bReset').addEventListener('click', function () { snd.ui(); openResetConfirm(); });
  $('bAch').addEventListener('click', function () { if (mode === 'play' && !modalOpen) openAch(); });
  $('bSkin').addEventListener('click', function () { if (mode === 'play' && !modalOpen) { openSkins(); snd.ui(); } });
  $('bReb').addEventListener('click', function () { if (mode === 'play' && !modalOpen) { openRebirth(); snd.ui(); } });

  var muteBtn = K.muteButton();
  stage.appendChild(muteBtn);

  /* ============================================================ save */
  var noSave = false; // debug only: lets tests fake time away
  function save() { if (noSave || !started) return; S.t = Date.now(); store.set('save', S); }
  window.addEventListener('pagehide', save);
  window.addEventListener('beforeunload', save);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { hiddenAt = Date.now(); if (started) save(); }
    else if (hiddenAt && mode === 'play') {
      var sec = (Date.now() - hiddenAt) / 1000;
      hiddenAt = 0;
      if (sec > 20 && S.ppsBase > 0) {
        var amt = offlineGain(sec);
        gain(amt, false);
        toast(pizzaIconURL(), 'أثناء غيابك', plus(PZ.fmt(amt)) + ' بيتزا', fmtDuration(sec));
      }
    }
  });

  /* ============================================================ update */
  var uiT = 0, achT = 0, saveT = 0, goalT = 0;
  function update(dt) {
    now += dt;
    if (mode !== 'play') { K.keys.endFrame(); return; }
    S.playTime += dt;
    var p = ppsNow();
    gain(p * dt, false);
    if (buffs.frenzy > 0) buffs.frenzy = Math.max(0, buffs.frenzy - dt);
    if (buffs.click > 0) buffs.click = Math.max(0, buffs.click - dt);
    if (now - lastClickT > 0.65) combo = 0;

    // golden pizza
    if (golden && !modalOpen) {
      var g = golden;
      g.t += dt;
      var k = g.t / g.life;
      g.x = g.x0 + (g.x1 - g.x0) * k;
      g.yy = g.y + Math.sin(g.t * 2.2 + g.ph) * 40;
      if (Math.random() < 0.4) spawnPart(g.x + K.rand(-30, 30), g.yy + K.rand(-30, 30), K.rand(-30, 30), K.rand(-60, 0), 0.6, K.rand(5, 9), K.pick(['#fff6a0', '#ffd700', '#fff']), 3, 0);
      if (g.t >= g.life) { golden = null; scheduleGolden(); snd.goldMiss(); }
    } else if (!golden && !modalOpen) {
      goldenTimer -= dt;
      if (goldenTimer <= 0) spawnGolden();
    }
    // pizza rain
    if (rain.toSpawn > 0) {
      rain.spawnT -= dt;
      if (rain.spawnT <= 0) {
        rain.spawnT = 0.25;
        rain.toSpawn--;
        rain.items.push({ x: K.rand(PX + 50, W - 50), y: -40, vy: K.rand(170, 250), rot: Math.random() * TAU, vr: K.rand(-3, 3), R: 30 });
      }
    }
    for (var i = rain.items.length - 1; i >= 0; i--) {
      var it = rain.items[i];
      it.y += it.vy * dt; it.rot += it.vr * dt;
      if (it.y > H + 40) rain.items.splice(i, 1);
    }
    // pizza spring
    pz.sv += (1 - pz.s) * 260 * dt - pz.sv * 14 * dt; pz.s += pz.sv * dt;
    pz.sqv += -pz.sq * 300 * dt - pz.sqv * 12 * dt; pz.sq = K.clamp(pz.sq + pz.sqv * dt, -1, 1);
    if (pz.moodT > 0) { pz.moodT -= dt; if (pz.moodT <= 0) pz.mood = 0; }
    pz.blinkT -= dt;
    if (pz.blinkT <= 0) { pz.blink = 0.13; pz.blinkT = K.rand(2.5, 5); }
    if (pz.blink > 0) pz.blink -= dt;
    pz.hover = Math.hypot(mouse.x - CX, mouse.y - CY) < R * 1.04;

    // particles
    for (var j = parts.length - 1; j >= 0; j--) {
      var q = parts[j];
      q.life -= dt;
      if (q.life <= 0) { parts.splice(j, 1); continue; }
      q.vy += q.g * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.rot += q.vr * dt;
    }
    for (var f = floats.length - 1; f >= 0; f--) {
      var fl = floats[f];
      fl.life -= dt; fl.y += fl.vy * dt; fl.pop += dt;
      if (fl.life <= 0) floats.splice(f, 1);
    }
    shakeP = Math.max(0, shakeP - dt * 40);
    shakeX = (Math.random() - 0.5) * 2 * shakeP; shakeY = (Math.random() - 0.5) * 2 * shakeP;

    uiT -= dt; achT -= dt; saveT -= dt; goalT -= dt; newsT -= dt;
    if (uiT <= 0) { uiT = 0.1; refreshHud(); refreshShop(false); refreshHint(); }
    if (achT <= 0) { achT = 0.25; checkAchievements(); }
    if (goalT <= 0) { goalT = 0.5; refreshGoal(); }
    if (newsT <= 0) { newsT = 9; nextNews(); }
    if (saveT <= 0) { saveT = 5; save(); }
    K.keys.endFrame();
  }

  /* ============================================================ render */
  function render() {
    if (mode === 'title') { renderHero(); return; }
    renderScene();
    renderFx();
    bg.style.cursor = (mode === 'play' && (pz.hover || (golden && Math.hypot(golden.x - mouse.x, golden.yy - mouse.y) < golden.R * 1.35))) ? 'pointer' : 'default';
  }

  function skyMode() { return S.owned[9] > 0 ? 2 : S.owned[7] > 0 ? 1 : 0; }
  var STARS = [], HOUSES = [];
  (function () { var r = Art.rng(3), cols = ['#ffe3b3', '#d7f0c8', '#f9d0da', '#d6e4ff', '#fff1c4']; for (var x = WIN.x + 20; x < WIN.x + WIN.w - 40; x += 70 + r() * 60) HOUSES.push({ x: x, w: 30 + r() * 14, h: 22 + r() * 16, c: cols[Math.floor(r() * 5)] }); })();
  (function () { var r = Art.rng(7); for (var i = 0; i < 40; i++) STARS.push({ x: WIN.x + r() * WIN.w, y: WIN.y + r() * (WIN.h - 60), s: 1 + r() * 2.2, p: r() * TAU }); })();

  function renderScene() {
    var c = bctx, t = now;
    c.setTransform(px, 0, 0, px, 0, 0);
    c.save();
    c.translate(shakeX, shakeY);
    // ---- sky inside the window
    c.save();
    Art.rr(c, WIN.x, WIN.y, WIN.w, WIN.h, 22); c.clip();
    var sm = skyMode();
    var g = c.createLinearGradient(0, WIN.y, 0, WIN.y + WIN.h);
    if (sm === 0) { g.addColorStop(0, '#5cc8ff'); g.addColorStop(1, '#c9f1ff'); }
    else if (sm === 1) { g.addColorStop(0, '#1b2a6b'); g.addColorStop(1, '#6a4fb3'); }
    else { g.addColorStop(0, '#12082e'); g.addColorStop(1, '#4a1a78'); }
    c.fillStyle = g; c.fillRect(WIN.x, WIN.y, WIN.w, WIN.h);
    var i, n;
    if (sm > 0) {
      for (i = 0; i < STARS.length; i++) {
        var st = STARS[i];
        c.globalAlpha = 0.5 + 0.5 * Math.sin(t * 2 + st.p);
        c.fillStyle = '#fff'; c.fillRect(st.x, st.y, st.s, st.s);
      }
      c.globalAlpha = 1;
    }
    if (sm === 0) {
      // sun
      c.save(); c.translate(WIN.x + 70, WIN.y + 55); c.rotate(t * 0.3);
      Art.star(c, 0, 0, 44, 30, 12); Art.fs(c, '#ffe14d');
      c.restore();
      Art.circ(c, WIN.x + 70, WIN.y + 55, 26); Art.fs(c, '#ffcf2e', '#f0a400', 3);
      // clouds
      for (i = 0; i < 4; i++) {
        var cx = WIN.x + ((i * 230 + t * (10 + i * 3)) % (WIN.w + 200)) - 100, cy = WIN.y + 30 + (i % 2) * 45;
        c.fillStyle = 'rgba(255,255,255,0.92)';
        Art.circ(c, cx, cy, 18); c.fill(); Art.circ(c, cx + 20, cy - 8, 22); c.fill(); Art.circ(c, cx + 42, cy, 16); c.fill();
        c.fillRect(cx, cy, 42, 16);
      }
    }
    // galaxies (far back)
    n = Math.min(S.owned[9], 3);
    for (i = 0; i < n; i++) Art.icon(c, 9, WIN.x + 150 + i * 250, WIN.y + 60 + (i % 2) * 20, 90 - i * 10, t + i);
    // moon base
    if (S.owned[7] > 0) {
      Art.icon(c, 7, WIN.x + 80, WIN.y + 70, 100, t);
      n = Math.min(S.owned[7], 4);
      for (i = 1; i < n; i++) { c.save(); c.translate(WIN.x + 40 + i * 30, WIN.y + 115 - Math.abs(Math.sin(t * 2 + i)) * 10); Art.circ(c, 0, 0, 6); Art.fs(c, '#fff', '#3b2314', 2); c.restore(); }
    }
    // portal
    if (S.owned[8] > 0) {
      n = Math.min(S.owned[8], 2);
      for (i = 0; i < n; i++) {
        var pxp = WIN.x + WIN.w - 90 - i * 170, pyp = WIN.y + 70;
        c.save(); c.translate(pxp, pyp); c.scale(1, 0.9 + 0.05 * Math.sin(t * 3));
        Art.icon(c, 8, 0, 0, 100, t + i);
        c.restore();
      }
    }
    // airships
    n = Math.min(S.owned[6], 4);
    for (i = 0; i < n; i++) {
      var ax = WIN.x + ((i * 260 + t * (22 + i * 6)) % (WIN.w + 160)) - 80, ay = WIN.y + 40 + i * 26 + Math.sin(t * 1.5 + i) * 6;
      Art.icon(c, 6, ax, ay, 70, t + i);
    }
    // hills + skyline
    c.fillStyle = sm === 0 ? '#7ccf5a' : sm === 1 ? '#3b6b4a' : '#3a2a6a';
    c.beginPath(); c.moveTo(WIN.x, WIN.y + WIN.h - 40);
    for (var hx = 0; hx <= WIN.w; hx += 20) c.lineTo(WIN.x + hx, WIN.y + WIN.h - 44 - Math.sin(hx * 0.012) * 16 - Math.sin(hx * 0.031) * 7);
    c.lineTo(WIN.x + WIN.w, WIN.y + WIN.h); c.lineTo(WIN.x, WIN.y + WIN.h); c.closePath(); c.fill();
    var base = WIN.y + WIN.h - 34;
    for (i = 0; i < HOUSES.length; i++) {
      var hh = HOUSES[i];
      c.fillStyle = sm === 0 ? hh.c : sm === 1 ? '#5a5f96' : '#4a3a86';
      c.fillRect(hh.x, base - hh.h + 6, hh.w, hh.h);
      c.beginPath(); c.moveTo(hh.x - 5, base - hh.h + 7); c.lineTo(hh.x + hh.w / 2, base - hh.h - 14); c.lineTo(hh.x + hh.w + 5, base - hh.h + 7); c.closePath();
      c.fillStyle = sm === 0 ? '#d9573a' : '#3a2f6a'; c.fill();
      c.fillStyle = sm === 0 ? '#bfe9ff' : '#ffe98a';
      c.fillRect(hh.x + hh.w / 2 - 5, base - hh.h + 14, 10, 9);
    }
    var nf = Math.min(S.owned[5], 3), np = Math.min(S.owned[4], 5);
    for (i = 0; i < nf; i++) Art.icon(c, 5, WIN.x + 110 + i * 250, base - 34, 72, t + i * 0.7);
    for (i = 0; i < np; i++) Art.icon(c, 4, WIN.x + 50 + i * 165 + (i % 2) * 20, base - 28, 56, t);
    // street
    c.fillStyle = '#4a4a5a'; c.fillRect(WIN.x, WIN.y + WIN.h - 30, WIN.w, 30);
    c.fillStyle = '#ffe14d';
    for (var dx = 0; dx < WIN.w; dx += 50) c.fillRect(WIN.x + dx + ((t * 40) % 50), WIN.y + WIN.h - 16, 24, 3);
    var ns = Math.min(S.owned[2], 4), nt = Math.min(S.owned[3], 3);
    for (i = 0; i < nt; i++) {
      var tx = WIN.x + ((i * 300 + t * 70) % (WIN.w + 160)) - 80;
      Art.icon(c, 3, tx, WIN.y + WIN.h - 32, 58, t);
    }
    for (i = 0; i < ns; i++) {
      var sx = WIN.x + ((i * 210 + 90 + t * (120 + i * 12)) % (WIN.w + 120)) - 60;
      Art.icon(c, 2, sx, WIN.y + WIN.h - 22 + Math.sin(t * 12 + i) * 1, 40, t);
    }
    c.restore();

    // ---- wall
    c.drawImage(cacheWall, 0, 0, W, H);

    // ---- ovens + chefs behind the counter
    var ov = Math.min(S.owned[1], 2);
    var ovSlots = [462, 1218];
    for (i = 0; i < ov; i++) Art.icon(c, 1, ovSlots[i], COUNTER_Y - 44, 104, t + i * 0.5);
    var ch = Math.min(S.owned[0], 4);
    var chSlots = [590, 1090, 660, 1020];
    for (i = 0; i < ch; i++) Art.sceneChef(c, chSlots[i], COUNTER_Y + 14, 0.95, t, i);

    // ---- counter
    c.drawImage(cacheCounter, 0, 0, W, H);
    // pizza box stacks grow with total baked
    var boxes = Math.min(18, Math.floor(Math.log10(Math.max(1, S.lifetime)) * 1.4));
    for (i = 0; i < boxes; i++) {
      var side = i % 2, lvl = i >> 1;
      pizzaBox(c, side ? 1200 : 480, 668 - lvl * 14, i);
    }

    // ---- pizza
    var boost = buffs.frenzy > 0 || buffs.click > 0;
    // glow
    var gg = c.createRadialGradient(CX, CY, R * 0.8, CX, CY, R * 1.55);
    gg.addColorStop(0, boost ? 'rgba(255,230,90,0.75)' : 'rgba(255,240,200,0.55)'); gg.addColorStop(1, 'rgba(255,240,200,0)');
    c.fillStyle = gg; Art.circ(c, CX, CY, R * 1.55); c.fill();
    if (boost) {
      c.save(); c.translate(CX, CY); c.rotate(t * 0.6);
      c.fillStyle = buffs.click > 0 ? 'rgba(140,220,255,0.35)' : 'rgba(255,220,60,0.35)';
      for (i = 0; i < 12; i++) { c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, R * 1.9, i * TAU / 12, i * TAU / 12 + 0.22); c.closePath(); c.fill(); }
      c.restore();
    }
    // plate shadow
    c.fillStyle = 'rgba(60,20,5,0.28)';
    Art.ell(c, CX, COUNTER_Y + 16, R * 0.95, 16); c.fill();
    // heat ring
    if (combo >= 3) {
      var k = Math.min(1, combo / 100);
      c.lineWidth = 10; c.lineCap = 'round';
      c.strokeStyle = 'rgba(90,26,10,0.35)';
      c.beginPath(); c.arc(CX, CY, R + 20, 0, TAU); c.stroke();
      c.strokeStyle = k < 0.5 ? '#ffb13b' : k < 1 ? '#ff6a2a' : '#ff2a5a';
      c.beginPath(); c.arc(CX, CY, R + 20, -Math.PI / 2, -Math.PI / 2 + TAU * k); c.stroke();
    }
    ensurePizzaCache();
    var bob = Math.sin(t * 2) * 4;
    var hs = pz.hover && mode === 'play' ? 1.03 : 1;
    var sx2 = pz.s * hs * (1 + pz.sq * 0.06), sy2 = pz.s * hs * (1 - pz.sq * 0.06);
    c.save();
    c.translate(CX, CY + bob);
    c.scale(sx2, sy2);
    var cs = (R + 8) * 2;
    c.drawImage(pizzaCache, -cs / 2, -cs / 2, cs, cs);
    // face
    var tx2 = mouse.x, ty2 = mouse.y;
    if (golden) { tx2 = golden.x; ty2 = golden.yy; }
    var lx = tx2 - CX, ly = ty2 - CY, ll = Math.hypot(lx, ly) || 1;
    var lk = Math.min(1, ll / 200);
    var mood = pz.mood || (golden || boost ? 2 : 0);
    Art.face(c, R, lx / ll * lk, ly / ll * lk, pz.blink > 0, mood);
    c.restore();
    // combo label
    if (combo >= 10) {
      c.font = '700 24px Fredoka'; c.textBaseline = 'middle'; c.lineJoin = 'round';
      var word = 'حماس', mul = '×' + comboMult().toFixed(2).replace(/0$/, '');
      var w1 = c.measureText(word).width, w2 = c.measureText(mul).width, gap = 8;
      var left = CX - (w1 + w2 + gap) / 2, ly2 = CY + R + 44;
      c.lineWidth = 6; c.strokeStyle = '#5a1a0a';
      c.direction = 'ltr'; c.textAlign = 'left';
      c.strokeText(mul, left, ly2); c.fillStyle = combo >= 100 ? '#ff6a8a' : '#ffe14d'; c.fillText(mul, left, ly2);
      c.direction = 'rtl'; c.textAlign = 'right';
      c.strokeText(word, left + w2 + gap + w1, ly2); c.fillStyle = '#ffffff'; c.fillText(word, left + w2 + gap + w1, ly2);
      c.direction = 'ltr';
    }
    c.restore();
  }
  function pizzaBox(c, x, y, i) {
    Art.rr(c, x - 44 + (i % 2) * 4, y, 88, 14, 3); Art.fs(c, i % 3 === 1 ? '#f7d49a' : '#f4c77b', '#4a1f0c', 3);
    c.fillStyle = '#e8413a'; c.fillRect(x - 10 + (i % 2) * 4, y + 4, 20, 5);
  }

  function renderFx() {
    var c = fctx;
    c.setTransform(px, 0, 0, px, 0, 0);
    c.clearRect(0, 0, W, H);
    c.save(); c.translate(shakeX, shakeY);
    var i;
    // rain pizzas
    for (i = 0; i < rain.items.length; i++) {
      var it = rain.items[i];
      c.save(); c.translate(it.x, it.y); c.rotate(it.rot);
      Art.circ(c, 0, 0, it.R + 6); c.fillStyle = 'rgba(255,240,150,0.35)'; c.fill();
      Art.miniPizza(c, 0, 0, it.R);
      c.restore();
    }
    // golden pizza
    if (golden) {
      var fade = Math.min(1, golden.t * 3, (golden.life - golden.t) * 2);
      c.globalAlpha = Math.max(0, fade);
      var pulse = 1 + Math.sin(now * 8) * 0.06;
      Art.goldenPizza(c, golden.x, golden.yy, golden.R * pulse, now);
      c.globalAlpha = 1;
    }
    // particles
    for (i = 0; i < parts.length; i++) {
      var p = parts[i];
      c.globalAlpha = Math.min(1, p.life / p.max * 1.5);
      c.fillStyle = p.color;
      if (p.shape === 0) { Art.circ(c, p.x, p.y, p.size / 2); c.fill(); }
      else if (p.shape === 1) { Art.ell(c, p.x, p.y, p.size / 2, p.size / 4, p.rot); c.fill(); }
      else if (p.shape === 2) { c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66); c.restore(); }
      else if (p.shape === 3) { Art.star(c, p.x, p.y, p.size / 2, p.size / 5, 4, p.rot); c.fill(); }
      else { c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2 * Math.abs(Math.cos(p.rot * 2))); c.restore(); }
    }
    c.globalAlpha = 1;
    // floating text
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
    for (i = 0; i < floats.length; i++) {
      var f = floats[i];
      var sc = f.pop < 0.12 ? 0.6 + f.pop / 0.12 * 0.5 : f.pop < 0.22 ? 1.1 - (f.pop - 0.12) : 1;
      c.globalAlpha = Math.min(1, f.life / f.max * 2.2);
      c.font = '700 ' + Math.round(f.size * sc) + 'px Fredoka';
      c.lineWidth = Math.max(4, f.size * 0.2); c.strokeStyle = '#4a1606'; c.fillStyle = f.color;
      var sp = f.rtl ? -1 : f.text.indexOf(' ');
      if (sp < 0) {
        // single run (a number, or a pure Arabic word)
        c.direction = f.rtl ? 'rtl' : 'ltr'; c.textAlign = 'center';
        var hw = c.measureText(f.text).width / 2, fx0 = K.clamp(f.x, PX + 8 + hw, W - 8 - hw);
        c.strokeText(f.text, fx0, f.y); c.fillText(f.text, fx0, f.y);
      } else {
        // "+1.2 مليون": number on the right, Arabic word on its left (RTL reading order)
        var nTxt = f.text.slice(0, sp), wTxt = f.text.slice(sp + 1);
        var wn = c.measureText(nTxt).width, ww = c.measureText(wTxt).width, gp = f.size * 0.25 * sc;
        var tw = wn + gp + ww, lx0 = K.clamp(f.x - tw / 2, PX + 8, W - 8 - tw);
        c.textAlign = 'left';
        c.direction = 'rtl'; c.strokeText(wTxt, lx0, f.y); c.fillText(wTxt, lx0, f.y);
        c.direction = 'ltr'; c.strokeText(nTxt, lx0 + ww + gp, f.y); c.fillText(nTxt, lx0 + ww + gp, f.y);
      }
    }
    c.globalAlpha = 1; c.direction = 'ltr';
    c.restore();
  }

  var heroT = 0;
  function renderHero() {
    var c = hctx;
    heroT += 1 / 60;
    c.setTransform(px, 0, 0, px, 0, 0);
    c.clearRect(0, 0, 300, 250);
    ensurePizzaCache();
    var b = Math.abs(Math.sin(heroT * 3));
    var cx = 150, cy = 130 - b * 16;
    c.fillStyle = 'rgba(90,26,10,0.3)';
    Art.ell(c, 150, 235, 90 - b * 20, 10); c.fill();
    function minis(back) {
      for (var i = 0; i < 3; i++) {
        var a = heroT * 1.4 + i * TAU / 3;
        if ((Math.sin(a) < 0) !== back) continue;
        var k = 0.8 + 0.2 * Math.sin(a);
        Art.miniPizza(c, 150 + Math.cos(a) * 135, 130 + Math.sin(a) * 30, 14 * k);
      }
    }
    minis(true);
    c.save(); c.translate(cx, cy);
    var sq = b < 0.15 ? (0.15 - b) * 0.8 : 0;
    c.scale(0.72 * (1 + sq), 0.72 * (1 - sq));
    var cs = (R + 8) * 2;
    c.drawImage(pizzaCache, -cs / 2, -cs / 2, cs, cs);
    Art.face(c, R, Math.sin(heroT * 1.3) * 0.8, 0.2, (heroT % 3.5) < 0.12, b > 0.9 ? 1 : 0);
    c.restore();
    minis(false);
  }

  // Where a building shows up in the scene (for purchase effects).
  function scenePos(i) {
    switch (i) {
      case 0: return { x: [590, 1090, 660, 1020][Math.min(S.owned[0], 4) - 1] || 640, y: 430 };
      case 1: return { x: S.owned[1] > 1 ? 1218 : 462, y: 460 };
      case 2: case 3: return { x: CX, y: WIN.y + WIN.h - 30 };
      case 4: case 5: return { x: CX, y: WIN.y + WIN.h - 60 };
      default: return { x: CX, y: WIN.y + 70 };
    }
  }

  /* ============================================================ boot */
  function drawHowIcons() {
    var hi = document.createElement('canvas'); hi.width = hi.height = 68;
    Art.icon(hi.getContext('2d'), 0, 34, 36, 64, 0, 0);
    $('howIcon').appendChild(hi);
    var hg = document.createElement('canvas'); hg.width = hg.height = 68;
    Art.goldenPizza(hg.getContext('2d'), 34, 34, 20, 0);
    $('howGold').appendChild(hg);
  }

  buildShop();
  drawHowIcons();
  resize();
  window.addEventListener('resize', resize);
  refreshShop(true); refreshHud(); refreshGoal();
  newsEl.innerHTML = '<b>أخبار البيتزا:</b> ' + PZ.NEWS[0][1]; lastNews = 0; newsT = 9;
  checkAchievements();
  showTitle();
  document.fonts && document.fonts.load && document.fonts.load('700 40px Fredoka', 'ب').catch(function () { });
  K.loop(update, render);

  /* ============================================================ debug */
  window.__game = {
    get S() { return S; }, get D() { return D; },
    get mode() { return mode; }, get modal() { return modalOpen; },
    get golden() { return golden; }, get rain() { return rain.items.length + rain.toSpawn; }, get buffs() { return buffs; },
    get combo() { return combo; }, get parts() { return parts.length; },
    get rainItems() { return rain.items; },
    prof: function () { var o = {}, f = { hud: refreshHud, shop: function () { refreshShop(false); }, hint: refreshHint, ach: checkAchievements, goal: refreshGoal, scene: renderScene, fx: renderFx }; for (var k in f) { var t = performance.now(); for (var i = 0; i < 10; i++) f[k](); o[k] = +((performance.now() - t) / 10).toFixed(2); } return o; },
    bench: function (n) { n = n || 30; var t0 = performance.now(); for (var i = 0; i < n; i++) { renderScene(); renderFx(); } var t1 = performance.now(); for (i = 0; i < n; i++) update(1 / 60); return { renderMs: +((t1 - t0) / n).toFixed(2), updateMs: +((performance.now() - t1) / n).toFixed(2) }; },
    pps: function () { return ppsNow(); },
    add: function (n) { gain(n, false); refreshShop(true); return S.pizzas; },
    skip: function (sec) { gain(S.ppsBase * sec, false); return S.pizzas; },
    buy: function (i, n) { var a = S.buyAmt; S.buyAmt = n || 1; var r = buyBuilding(i, rows[i].el); S.buyAmt = a; return r; },
    buyUp: function (id) { buyUpgrade(PZ.UPG[id]); return !!S.ups[id]; },
    spawnGolden: function () { spawnGolden(); return golden; },
    clickGolden: function (kind) { if (!golden) spawnGolden(); clickGolden(kind); return buffs; },
    click: function (n) { for (var i = 0; i < (n || 1); i++) { clickTimes.length = 0; clickPizza(CX, CY); } return S.pizzas; },
    rebirth: function () { doRebirth(); return S.crusts; },
    openRebirth: openRebirth, openAch: openAch, openSkins: openSkins, closeModal: closeModal,
    offline: function (sec) { openOffline(sec, offlineGain(sec)); },
    save: save, fmt: PZ.fmt,
    setTime: function (sec) { save(); S.t = Date.now() - sec * 1000; store.set('save', S); noSave = true; }
  };
})();
