/*
 * Munch Rope - game layer: screens, input, juice, rendering, saving.
 * Physics lives in sim.js, art in draw.js, levels in levels.js.
 */
(function () {
  'use strict';
  var Sim = window.MunchSim, Art = window.MunchArt, LEVELS = window.MUNCH_LEVELS;
  var BOXES = LEVELS.BOXES, SOL = window.MUNCH_SOLUTIONS || [];
  var W = 1280, H = 720, TAU = Math.PI * 2, NL = LEVELS.length;
  var MAXSTARS = NL * 3;

  var canvas = document.getElementById('cv');
  var ui = document.getElementById('ui');
  var bg = {};
  var view = Kit.fit(canvas, W, H, { maxDpr: 2, onResize: onResize });
  var ctx = view.ctx;
  var store = Kit.store('candy-rope');
  var muteBtn = Kit.muteButton();
  muteBtn.setAttribute('aria-label', 'تشغيل الصوت أو كتمه');
  muteBtn.title = 'الصوت (M)';
  var shake = Kit.shake();

  function $(id) { return document.getElementById(id); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function ease(t) { t = clamp(t, 0, 1); return 1 - Math.pow(1 - t, 3); }
  function back(t) { t = clamp(t, 0, 1); var c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }

  function onResize(v) {
    var r = canvas.getBoundingClientRect();
    ui.style.transform = 'translate(' + r.left + 'px,' + r.top + 'px) scale(' + v.scale + ')';
    bg = {};
  }
  onResize(view);
  if (document.fonts && document.fonts.load) {
    Promise.all([document.fonts.load('700 28px Fredoka', 'ب'), document.fonts.load('700 28px Fredoka', 'A')])
      .then(function () { bg = {}; }, function () { /* ignore */ });
  }

  /* ------------------------------------------------------------ saving */
  var prog = (function () {
    var p = store.get('prog', null);
    if (!p || typeof p !== 'object') p = {};
    if (!Array.isArray(p.stars)) p.stars = [];
    for (var i = 0; i < NL; i++) if (typeof p.stars[i] !== 'number') p.stars[i] = -1;
    p.candy = p.candy | 0; p.hat = p.hat | 0; p.seen = p.seen | 0;
    if (!p.fails || typeof p.fails !== 'object') p.fails = {};
    return p;
  })();
  function save() { store.set('prog', prog); }
  // Arabic star counts (accusative): 1 -> نجمة واحدة, 2 -> نجمتين, 3-10 -> N نجوم, 11+ -> N نجمة
  function nStars(n) { return n === 1 ? 'نجمة واحدة' : n === 2 ? 'نجمتين' : n >= 3 && n <= 10 ? n + ' نجوم' : n + ' نجمة'; }
  // "a / b" kept left-to-right inside Arabic text
  function frac(a, b) { return '<span dir="ltr">' + a + ' / ' + b + '</span>'; }
  function totalStars() { var s = 0; for (var i = 0; i < NL; i++) s += Math.max(0, prog.stars[i]); return s; }
  function boxOf(i) { for (var b = BOXES.length - 1; b >= 0; b--) if (i >= BOXES[b].from) return b; return 0; }
  function boxUnlocked(b) { return totalStars() >= BOXES[b].need; }
  function boxStars(b) { var s = 0; for (var i = BOXES[b].from; i < BOXES[b].to; i++) s += Math.max(0, prog.stars[i]); return s; }
  function levelUnlocked(i) {
    if (i < 0 || i >= NL) return false;
    var b = boxOf(i);
    if (!boxUnlocked(b)) return false;
    return i === BOXES[b].from || prog.stars[i - 1] >= 0;
  }
  if (prog.candy >= Art.CANDIES.length || Art.CANDIES[prog.candy].need > totalStars()) prog.candy = 0;
  if (prog.hat >= Art.HATS.length || Art.HATS[prog.hat].need > totalStars()) prog.hat = 0;

  /* ------------------------------------------------------------ sound */
  var A = Kit.audio;
  var SFX = {
    cut: function () {
      A.noise({ dur: 0.12, vol: 0.22, filter: 7000, to: 1800 });
      A.tone({ freq: 1500, to: 700, type: 'triangle', dur: 0.08, vol: 0.12 });
    },
    star: function (n) {
      var f = [784, 988, 1175][clamp(n - 1, 0, 2)];
      A.tone({ freq: f, type: 'square', dur: 0.08, vol: 0.13 });
      A.tone({ freq: f * 1.5, type: 'sine', dur: 0.22, vol: 0.2, delay: 0.06 });
      A.tone({ freq: f * 2, type: 'sine', dur: 0.18, vol: 0.08, delay: 0.12 });
    },
    tick: function (n) { A.tone({ freq: 1200 + n * 200, type: 'sine', dur: 0.06, vol: 0.12 }); },
    attach: function () {
      A.tone({ freq: 260, to: 560, type: 'triangle', dur: 0.12, vol: 0.25 });
      A.tone({ freq: 560, to: 760, type: 'sine', dur: 0.1, vol: 0.12, delay: 0.08 });
    },
    bubble: function () { A.tone({ freq: 180, to: 620, type: 'sine', dur: 0.25, vol: 0.28 }); A.tone({ freq: 400, to: 900, type: 'sine', dur: 0.15, vol: 0.1, delay: 0.12 }); },
    pop: function () { A.tone({ freq: 500, to: 1400, type: 'sine', dur: 0.07, vol: 0.3 }); A.noise({ dur: 0.06, vol: 0.18, filter: 5000 }); },
    puff: function () { A.noise({ dur: 0.32, vol: 0.32, filter: 1600, to: 250 }); A.tone({ freq: 140, to: 70, type: 'sine', dur: 0.2, vol: 0.2 }); },
    bounce: function () { A.tone({ freq: 160, to: 540, type: 'sine', dur: 0.2, vol: 0.32 }); A.tone({ freq: 90, to: 240, type: 'triangle', dur: 0.16, vol: 0.18 }); },
    spike: function () { A.noise({ dur: 0.3, vol: 0.4, filter: 3500, to: 200 }); A.tone({ freq: 420, to: 90, type: 'square', dur: 0.22, vol: 0.14 }); },
    eat: function () {
      for (var i = 0; i < 3; i++) {
        A.noise({ dur: 0.07, vol: 0.3, filter: 1400, delay: i * 0.17 });
        A.tone({ freq: 190, to: 110, type: 'square', dur: 0.07, vol: 0.12, delay: i * 0.17 });
      }
      [523, 659, 784, 1047].forEach(function (f, i) { A.tone({ freq: f, type: 'triangle', dur: 0.14, vol: 0.26, delay: 0.55 + i * 0.08 }); });
      A.tone({ freq: 1319, type: 'sine', dur: 0.4, vol: 0.18, delay: 0.87 });
    },
    lose: function () {
      A.tone({ freq: 330, to: 300, type: 'triangle', dur: 0.28, vol: 0.28 });
      A.tone({ freq: 294, to: 262, type: 'triangle', dur: 0.28, vol: 0.28, delay: 0.3 });
      A.tone({ freq: 247, to: 175, type: 'triangle', dur: 0.6, vol: 0.28, delay: 0.6 });
    },
    ooh: function () { A.tone({ freq: 330, to: 520, type: 'sine', dur: 0.22, vol: 0.12 }); },
    click: function () { A.tone({ freq: 700, type: 'square', dur: 0.04, vol: 0.1 }); A.tone({ freq: 1050, type: 'sine', dur: 0.06, vol: 0.08, delay: 0.03 }); },
    winStar: function (i) { A.tone({ freq: 660 * Math.pow(1.26, i), type: 'square', dur: 0.1, vol: 0.14 }); A.tone({ freq: 1320 * Math.pow(1.26, i), type: 'sine', dur: 0.3, vol: 0.16, delay: 0.05 }); },
    unlock: function () { [784, 988, 1175, 1568].forEach(function (f, i) { A.tone({ freq: f, type: 'triangle', dur: 0.14, vol: 0.22, delay: i * 0.07 }); }); },
    whoosh: function () { A.noise({ dur: 0.18, vol: 0.12, filter: 4000, to: 900 }); }
  };

  /* ------------------------------------------------------------ particles */
  var PMAX = 520, parts = [], pn = 0;
  for (var pi = 0; pi < PMAX; pi++) parts.push({ on: false });
  function spawn(x, y, vx, vy, life, size, color, type, g) {
    var p = parts[pn]; pn = (pn + 1) % PMAX;
    p.on = true; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = life; p.max = life; p.size = size;
    p.color = color; p.type = type || 0; p.g = g == null ? 600 : g; p.rot = Math.random() * TAU; p.vr = (Math.random() - 0.5) * 10;
    return p;
  }
  function burst(x, y, n, o) {
    for (var i = 0; i < n; i++) {
      var a = o.angle != null ? o.angle + (Math.random() - 0.5) * (o.spread || TAU) : Math.random() * TAU;
      var sp = (o.speed || 250) * (0.35 + Math.random() * 0.65);
      spawn(x + (Math.random() - 0.5) * (o.jitter || 0), y + (Math.random() - 0.5) * (o.jitter || 0),
        Math.cos(a) * sp, Math.sin(a) * sp, (o.life || 0.7) * (0.6 + Math.random() * 0.4),
        (o.size || 6) * (0.6 + Math.random() * 0.7), o.colors ? o.colors[(Math.random() * o.colors.length) | 0] : (o.color || '#fff'),
        o.type || 0, o.g);
    }
  }
  function updateParts(dt) {
    for (var i = 0; i < PMAX; i++) {
      var p = parts[i]; if (!p.on) continue;
      p.life -= dt; if (p.life <= 0) { p.on = false; continue; }
      p.vy += p.g * dt; p.vx *= (1 - 1.5 * dt); p.vy *= (1 - 1.5 * dt);
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    }
  }
  function drawParts() {
    for (var i = 0; i < PMAX; i++) {
      var p = parts[i]; if (!p.on) continue;
      var k = p.life / p.max;
      ctx.globalAlpha = Math.min(1, k * 1.6);
      ctx.fillStyle = p.color;
      if (p.type === 0) { ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.4 + 0.6 * k), 0, TAU); ctx.fill(); }
      else if (p.type === 1) { Art.starPath(ctx, p.x, p.y, p.size, p.size * 0.45, p.rot); ctx.fill(); }
      else if (p.type === 2) {
        var s = p.size * (0.3 + 0.7 * Math.sin(k * Math.PI));
        ctx.beginPath(); ctx.moveTo(p.x, p.y - s * 2); ctx.lineTo(p.x + s * 0.5, p.y - s * 0.5); ctx.lineTo(p.x + s * 2, p.y); ctx.lineTo(p.x + s * 0.5, p.y + s * 0.5);
        ctx.lineTo(p.x, p.y + s * 2); ctx.lineTo(p.x - s * 0.5, p.y + s * 0.5); ctx.lineTo(p.x - s * 2, p.y); ctx.lineTo(p.x - s * 0.5, p.y - s * 0.5); ctx.fill();
      } else if (p.type === 3) {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.beginPath(); ctx.moveTo(-p.size, -p.size * 0.6); ctx.lineTo(p.size, -p.size * 0.3); ctx.lineTo(0, p.size * 0.8); ctx.closePath(); ctx.fill();
        ctx.restore();
      } else if (p.type === 4) {
        var hs = p.size;
        ctx.beginPath(); ctx.moveTo(p.x, p.y + hs);
        ctx.bezierCurveTo(p.x - hs * 1.6, p.y - hs * 0.2, p.x - hs * 0.7, p.y - hs * 1.4, p.x, p.y - hs * 0.5);
        ctx.bezierCurveTo(p.x + hs * 0.7, p.y - hs * 1.4, p.x + hs * 1.6, p.y - hs * 0.2, p.x, p.y + hs); ctx.fill();
      } else if (p.type === 5) {
        ctx.globalAlpha = k * 0.7;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.6 - k * 0.8), 0, TAU); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  var texts = [];
  function floatText(txt, x, y, color, size) {
    texts.push({ txt: txt, x: x, y: y, life: 1.1, color: color || '#fff', size: size || 34 });
    if (texts.length > 8) texts.shift();
  }

  /* ------------------------------------------------------------ Munch */
  function newMunch() {
    return { t: 0, blink: 0, blinkT: 2, blinkA: 0, mouth: 0, mood: 'idle', moodT: 0, lookX: 0, lookY: 0, sq: 0, sqv: 0,
      ant: 0, antv: 0, chew: false, excite: 0, tear: 0, hop: 0, hopv: 0, hat: 'none', oohed: false };
  }
  function munchMood(m, mood) { m.mood = mood; m.moodT = 0; }
  function updateMunch(m, w, dt) {
    m.t += dt; m.moodT += dt;
    m.hat = Art.HATS[prog.hat].id;
    // blink
    m.blinkT -= dt;
    if (m.blinkT <= 0) { m.blinkA = 0.18; m.blinkT = 1.8 + Math.random() * 3; }
    if (m.blinkA > 0) { m.blinkA -= dt; m.blink = Math.sin(Math.PI * clamp(1 - m.blinkA / 0.18, 0, 1)); } else m.blink = 0;
    var c = w ? w.candy : null;
    var tx = 0, ty = 0.2, near = 0;
    if (c && c.alive) {
      var dx = c.x - w.munch.x, dy = c.y - (w.munch.y - 14), d = Math.sqrt(dx * dx + dy * dy) || 1;
      var k = Math.min(1, d / 60);
      tx = dx / d * k; ty = dy / d * k;
      near = clamp((310 - d) / 210, 0, 1);
    }
    m.lookX += (tx - m.lookX) * Math.min(1, dt * 10);
    m.lookY += (ty - m.lookY) * Math.min(1, dt * 10);
    var mouthT = 0;
    if (m.mood === 'idle') {
      mouthT = near; m.excite += (near - m.excite) * Math.min(1, dt * 8);
      if (near > 0.45 && !m.oohed) { m.oohed = true; m.sqv -= 2.5; if (w && w === G.world) SFX.ooh(); }
      if (near < 0.1) m.oohed = false;
    } else if (m.mood === 'eat') {
      m.chew = m.moodT > 0.08 && m.moodT < 1.2;
      mouthT = m.moodT < 0.08 ? 1 : 0;
      if (m.chew) m.sq = Math.sin(m.moodT * 18) * 0.07;
      if (m.moodT > 1.2) { munchMood(m, 'happy'); m.chew = false; m.hopv = -520; }
    } else if (m.mood === 'happy') {
      m.excite = 0;
      if (m.hop === 0 && m.moodT % 1.3 < 0.05) m.hopv = -380;
    } else if (m.mood === 'sad') {
      m.excite = 0; m.tear = (m.moodT % 1.6) / 1.6;
    }
    m.mouth += (mouthT - m.mouth) * Math.min(1, dt * (m.mood === 'eat' ? 30 : 12));
    // squash spring
    m.sqv += (-m.sq * 220 - m.sqv * 9) * dt; m.sq += m.sqv * dt;
    // hop
    if (m.hop < 0 || m.hopv < 0) {
      m.hopv += 2200 * dt; m.hop += m.hopv * dt;
      if (m.hop >= 0) { m.hop = 0; m.hopv = 0; m.sq = 0.16; m.sqv = 0; }
    }
    // antenna spring (reacts to motion, wiggles now and then)
    var antT = m.mood === 'sad' ? 0.9 : Math.sin(m.t * 1.7) * 0.12;
    m.antv += ((antT - m.ant) * 70 - m.antv * 5) * dt + (m.sqv * 0.02);
    if (Math.random() < dt * 0.5 && m.mood !== 'sad') m.antv += (Math.random() - 0.5) * 8;
    m.ant += m.antv * dt;
  }

  /* ------------------------------------------------------------ state */
  var G = {
    state: 'title', level: 0, world: null, munch: newMunch(), intro: 0, introT: 0, t: 0, endT: 0, panel: false,
    hudStars: 0, slotPop: [0, 0, 0], flyers: [], hint: 0, hintItems: [], tipT: 0, tut: false, replay: null, rIdx: 0,
    titleWorld: null, titleMunch: newMunch(), titleRespawn: 0, timers: [], sparkT: 0
  };
  var TITLE_LEVEL = { candy: [1010, 300], munch: [960, 565], ropes: [{ x: 960, y: 84 }], stars: [] };
  function newTitleWorld() { G.titleWorld = Sim.create(TITLE_LEVEL); G.titleWorld.born = G.t; munchMood(G.titleMunch, 'idle'); }
  newTitleWorld();

  var screens = ['sTitle', 'sBoxes', 'sLevels', 'sStyle', 'sPause', 'sWin', 'sFail'];
  function show(id) {
    screens.forEach(function (s) { $(s).hidden = s !== id; });
    $('hud').hidden = !(G.state === 'play');
  }
  function clearTimers() { G.timers.forEach(clearTimeout); G.timers = []; }
  function later(fn, ms) { G.timers.push(setTimeout(fn, ms)); }

  function hasHl(L, what) { return !!(L.hl && (' ' + L.hl + ' ').indexOf(' ' + what + ' ') >= 0); }

  function toast(msg, ms) {
    var t = $('toast');
    t.textContent = msg; t.hidden = false;
    t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
    clearTimeout(toast.h); toast.h = setTimeout(function () { t.hidden = true; }, ms || 2200);
  }

  /* ------------------------------------------------------------ flow */
  function goTitle() {
    clearTimers(); G.state = 'title'; show('sTitle'); refreshTitle();
  }
  function refreshTitle() {
    var ts = totalStars(), done = 0;
    for (var i = 0; i < NL; i++) if (prog.stars[i] >= 0) done++;
    $('tProgress').innerHTML = '<span dir="ltr"><span class="st">&#9733; ' + ts + '</span> / ' + MAXSTARS + '</span> &nbsp;&middot;&nbsp; المراحل: ' + frac(done, NL);
    $('styleNew').hidden = !hasNewStyle();
  }
  function hasNewStyle() {
    var ts = totalStars();
    return Art.CANDIES.some(function (c) { return c.need > prog.seen && c.need <= ts; }) || Art.HATS.some(function (c) { return c.need > prog.seen && c.need <= ts; });
  }
  function nextLevelToPlay() {
    for (var i = 0; i < NL; i++) if (levelUnlocked(i) && prog.stars[i] < 0) return i;
    for (i = 0; i < NL; i++) if (levelUnlocked(i) && prog.stars[i] < 3) return i;
    return -1;
  }
  function playPressed() {
    SFX.click();
    var i = nextLevelToPlay();
    if (i < 0) openBoxes(); else startLevel(i);
  }
  function openBoxes() {
    clearTimers(); G.state = 'boxes'; show('sBoxes');
    $('bxStars').innerHTML = frac('&#9733; ' + totalStars(), MAXSTARS);
    var list = $('bxList'); list.innerHTML = '';
    BOXES.forEach(function (b, bi) {
      var el = document.createElement('button');
      var open = boxUnlocked(bi);
      el.type = 'button';
      el.className = 'boxcard ' + b.theme + (open ? '' : ' locked');
      el.innerHTML = '<div class="art"><div class="bx"></div><div class="lid"></div></div>' +
        '<div class="bname">' + b.name + '</div>' +
        '<div class="bstars">' + frac('&#9733; ' + boxStars(bi), (b.to - b.from) * 3) + '</div>' +
        (open ? '' : '<div class="lock">&#128274; يُفتح عند ' + nStars(b.need) + '</div>');
      el.addEventListener('click', function () {
        if (!open) { SFX.lose(); toast('ما زلت تحتاج إلى ' + nStars(b.need - totalStars()) + ' لفتحه!'); return; }
        SFX.click(); openLevels(bi);
      });
      list.appendChild(el);
    });
  }
  function openLevels(bi) {
    clearTimers(); G.state = 'levels'; G.box = bi; show('sLevels');
    var b = BOXES[bi];
    $('lvTitle').textContent = b.name;
    $('lvStars').innerHTML = frac('&#9733; ' + boxStars(bi), (b.to - b.from) * 3);
    var grid = $('lvGrid'); grid.innerHTML = '';
    var nxt = nextLevelToPlay();
    for (var i = b.from; i < b.to; i++) {
      (function (i) {
        var el = document.createElement('button'); el.type = 'button';
        var un = levelUnlocked(i), st = prog.stars[i];
        el.className = 'lv' + (un ? (st >= 0 ? ' done' : '') : ' locked') + (i === nxt ? ' next' : '');
        if (!un) el.innerHTML = '&#128274;';
        else {
          var ss = '<div class="ss">';
          for (var k = 0; k < 3; k++) ss += '<i class="' + (st > k ? 'on' : '') + '"></i>';
          el.innerHTML = (i + 1) + ss + '</div>';
        }
        el.title = LEVELS[i].name;
        el.addEventListener('click', function () {
          if (!un) { SFX.lose(); toast('أنهِ المرحلة ' + i + ' أولًا!'); return; }
          SFX.click(); startLevel(i);
        });
        grid.appendChild(el);
      })(i);
    }
  }
  function openStyle() {
    clearTimers(); G.state = 'style'; show('sStyle');
    prog.seen = Math.max(prog.seen, totalStars()); save();
    $('stStars').innerHTML = '&#9733; ' + totalStars();
    buildPicks('stCandy', Art.CANDIES, 'candy');
    buildPicks('stHat', Art.HATS, 'hat');
  }
  function buildPicks(id, list, field) {
    var box = $(id); box.innerHTML = '';
    var ts = totalStars();
    list.forEach(function (it, i) {
      var el = document.createElement('button'); el.type = 'button';
      var un = it.need <= ts;
      el.className = 'pick' + (prog[field] === i ? ' sel' : '') + (un ? '' : ' locked');
      var cv = document.createElement('canvas'); cv.width = 192; cv.height = 168;
      var c2 = cv.getContext('2d');
      if (!un) c2.globalAlpha = 0.35;
      if (field === 'candy') Art.drawCandy(c2, 96, 84, -0.3, i, 2.1, 0);
      else {
        var mm = newMunch(); mm.hat = it.id; mm.t = 0.6; mm.lookY = 0.3;
        Art.drawMunch(c2, mm, 96, 108, 0.8);
      }
      el.appendChild(cv);
      var sp = document.createElement('span');
      sp.innerHTML = un ? it.name : '<span dir="ltr">&#128274; &#9733; ' + it.need + '</span>';
      el.appendChild(sp);
      el.addEventListener('click', function () {
        if (!un) { SFX.lose(); toast('«' + it.name + '» تُفتح عندما تجمع ' + nStars(it.need) + '!'); return; }
        prog[field] = i; save(); SFX.pop();
        buildPicks(id, list, field);
      });
      box.appendChild(el);
    });
  }

  function startLevel(i, opts) {
    opts = opts || {};
    clearTimers();
    G.level = i; G.box = boxOf(i);
    G.world = Sim.create(LEVELS[i]);
    G.state = 'play'; show(null); $('hud').hidden = false;
    G.intro = 0.55; G.introT = 0; G.endT = 0; G.panel = false;
    G.hudStars = 0; G.slotPop = [0, 0, 0]; G.flyers = [];
    G.replay = opts.replay || null; G.rIdx = 0;
    G.hint = opts.hint ? 6 : 0; buildHint();
    G.tipT = LEVELS[i].tip ? 5.5 : 0;
    G.tut = i === 0 && prog.stars[0] < 0;
    G.munch = newMunch(); G.munch.hopv = -420;
    trail.length = 0;
    for (var k = 0; k < PMAX; k++) parts[k].on = false;
    texts.length = 0;
    $('bHint').classList.toggle('glow', (prog.fails[i] || 0) >= 2 && prog.stars[i] < 0);
    SFX.whoosh();
  }
  function restart() { SFX.click(); startLevel(G.level); }

  function pause() {
    if (G.state !== 'play') return;
    G.state = 'pause'; show('sPause'); SFX.click();
  }
  function resume() {
    if (G.state !== 'pause') return;
    G.state = 'play'; show(null); SFX.click();
    Kit.keys.reset();
  }

  function onWin() {
    var i = G.level, s = G.world.starsGot;
    var before = totalStars(), prev = prog.stars[i];
    var boxWas = BOXES.map(function (b, bi) { return boxUnlocked(bi); });
    if (s > prev) prog.stars[i] = s;
    prog.fails[i] = 0;
    save();
    var after = totalStars();
    var unlocks = [];
    BOXES.forEach(function (b, bi) { if (!boxWas[bi] && boxUnlocked(bi)) unlocks.push('&#127873; فُتح ' + b.name + '!'); });
    Art.CANDIES.forEach(function (c) { if (c.need > before && c.need <= after) unlocks.push('&#127852; حلوى جديدة: ' + c.name + '!'); });
    Art.HATS.forEach(function (c) { if (c.need > before && c.need <= after) unlocks.push('&#10024; قبعة جديدة: ' + c.name + '!'); });
    G.win = { stars: s, best: s > Math.max(0, prev) && prev >= 0, first: prev < 0, unlocks: unlocks };
  }
  function showWinPanel() {
    G.panel = true; show('sWin');
    var s = G.win.stars;
    $('wTitle').textContent = ['أكلها!', 'لذيذ!', 'رائع!', 'مثالي!'][s];
    $('wLevel').textContent = 'المرحلة ' + (G.level + 1) + ' · ' + LEVELS[G.level].name;
    var stars = $('wStars').children;
    for (var k = 0; k < 3; k++) stars[k].className = '';
    for (k = 0; k < s; k++) (function (k) { later(function () { stars[k].className = 'on'; SFX.winStar(k); shake.add(3); }, 250 + k * 280); })(k);
    $('wBest').hidden = !G.win.best;
    var u = $('wUnlocks'); u.innerHTML = '';
    G.win.unlocks.forEach(function (msg, j) {
      later(function () { var d = document.createElement('div'); d.innerHTML = msg; u.appendChild(d); SFX.unlock(); }, 400 + s * 280 + j * 350);
    });
    var last = G.level + 1 >= NL;
    $('wNext').innerHTML = last ? 'انتهيت! &#127881;' : 'التالي &#9664; <span class="sg-key">Enter</span>';
  }
  function nextLevel() {
    SFX.click();
    var n = G.level + 1;
    if (n >= NL) { openBoxes(); toast('أطعمت قضّوم كل الحلوى! اجمع كل النجوم!', 3500); return; }
    if (levelUnlocked(n)) { startLevel(n); return; }
    openBoxes();
    var b = BOXES[boxOf(n)];
    toast('ما زلت تحتاج إلى ' + nStars(b.need - totalStars()) + ' لفتح ' + b.name + '!', 3200);
  }

  function onLose() {
    var i = G.level;
    prog.fails[i] = (prog.fails[i] || 0) + 1; save();
  }
  function showFailPanel() {
    G.panel = true; show('sFail');
    var w = G.world, i = G.level;
    var close = w.nearest < 150;
    $('fTitle').textContent = close ? 'كدت تنجح!' : ['يا خسارة!', 'أوه لا!', 'أوبس!'][(prog.fails[i] || 0) % 3];
    $('fReason').textContent = w.reason === 'spikes' ? 'لمست الحلوى الأشواك!' : w.reason === 'float' ? 'طارت الفقاعة بعيدًا!' : 'سقطت الحلوى خارج الصندوق!';
    $('fSkip').hidden = !((prog.fails[i] || 0) >= 3 && prog.stars[i] < 0 && i + 1 < NL);
    $('fHint').hidden = !SOL[i];
  }
  function skipLevel() {
    SFX.click();
    var i = G.level;
    if (prog.stars[i] < 0) prog.stars[i] = 0;
    save();
    nextLevel();
  }

  /* ------------------------------------------------------------ hint */
  function buildHint() {
    var plan = SOL[G.level], items = [];
    if (plan) plan.forEach(function (a) {
      var last = items[items.length - 1];
      if (last && last.a === a[1] && last.k === a[2]) { last.n++; return; }
      items.push({ a: a[1], k: a[2], n: 1 });
    });
    G.hintItems = items;
  }
  function hintPos(it, w) {
    if (it.a === 'cut') {
      for (var i = 0; i < w.ropes.length; i++) {
        var r = w.ropes[i];
        if (r.key === it.k && r.pts) { var p = r.pts[Math.floor(r.pts.length / 2)]; return { x: p.x, y: p.y }; }
      }
      var idx = +it.k.slice(1);
      var o = it.k[0] === 'p' ? w.pins[idx] : w.rings[idx];
      if (o && it.k[0] === 'g' && o.used) return null;
      return o ? { x: o.x, y: o.y + (it.k[0] === 'g' ? 0 : 30) } : null;
    }
    if (it.a === 'pop') return w.candy.bubble ? { x: w.candy.x, y: w.candy.y } : (w.bubbles[0] ? { x: w.bubbles[0].x, y: w.bubbles[0].y } : null);
    if (it.a === 'puff') { var b = w.blowers[it.k]; return b ? { x: b.x, y: b.y } : null; }
    return null;
  }
  function showHint() {
    if (G.state !== 'play') return;
    G.hint = 6; SFX.click();
    $('bHint').classList.remove('glow');
  }

  /* ------------------------------------------------------------ input */
  var trail = [];
  var ptr = { down: false, x: 0, y: 0 };
  function activeWorld() {
    if (G.state === 'play') return G.world;
    if (G.state === 'title') return G.titleWorld;
    return null;
  }
  function segHit(ax, ay, bx, by, cx, cy, dx, dy) {
    var rx = bx - ax, ry = by - ay, sx = dx - cx, sy = dy - cy;
    var den = rx * sy - ry * sx;
    if (Math.abs(den) < 1e-9) return false;
    var t = ((cx - ax) * sy - (cy - ay) * sx) / den;
    var u = ((cx - ax) * ry - (cy - ay) * rx) / den;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
  }
  function swipe(x0, y0, x1, y1) {
    var w = activeWorld();
    if (!w || w.state !== 'play') return;
    var ropes = w.ropes.slice();
    for (var i = 0; i < ropes.length; i++) {
      var r = ropes[i], p = r.pts;
      if (!p || !r.alive) continue;
      for (var j = 0; j < p.length - 1; j++) {
        if (segHit(x0, y0, x1, y1, p[j].x, p[j].y, p[j + 1].x, p[j + 1].y) ||
            Sim.distToSeg((p[j].x + p[j + 1].x) / 2, (p[j].y + p[j + 1].y) / 2, x0, y0, x1, y1) < 5) {
          Sim.cutRope(w, r, j, false);
          break;
        }
      }
    }
  }
  function tap(x, y) {
    var w = activeWorld();
    if (!w || w.state !== 'play') return;
    var c = w.candy;
    if (c.bubble && Sim.dist(x, y, c.x, c.y) < 64) { Sim.pop(w); return; }
    for (var i = 0; i < w.blowers.length; i++) {
      if (Sim.dist(x, y, w.blowers[i].x, w.blowers[i].y) < 60) { Sim.puff(w, i); return; }
    }
  }
  window.addEventListener('pointerdown', function (e) {
    if (e.button !== 0 || e.target !== canvas) return;
    var p = view.toLogical(e.clientX, e.clientY);
    ptr.down = true; ptr.x = p.x; ptr.y = p.y;
    try { canvas.focus({ preventScroll: true }); } catch (err) { /* ignore */ }
    if (G.state === 'play' && G.replay) return;
    tap(p.x, p.y);
    trail.push({ x: p.x, y: p.y, t: G.t });
  });
  window.addEventListener('pointermove', function (e) {
    if (!ptr.down) return;
    var p = view.toLogical(e.clientX, e.clientY);
    if (!(G.state === 'play' && G.replay)) swipe(ptr.x, ptr.y, p.x, p.y);
    var d = Sim.dist(ptr.x, ptr.y, p.x, p.y);
    if (d > 2 && (G.state === 'play' || G.state === 'title')) {
      trail.push({ x: p.x, y: p.y, t: G.t });
      if (trail.length > 40) trail.shift();
      if (Math.random() < 0.6) spawn(p.x, p.y, (Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60, 0.4, 4 + Math.random() * 3, Math.random() < 0.5 ? '#fff' : '#ffe14d', 2, 80);
    }
    ptr.x = p.x; ptr.y = p.y;
  });
  function up() { ptr.down = false; }
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  window.addEventListener('blur', up);

  window.addEventListener('keydown', function (e) {
    if (e.repeat) return;
    var k = e.code;
    var go = k === 'Enter' || k === 'Space' || k === 'NumpadEnter';
    switch (G.state) {
      case 'title': if (go) { e.preventDefault(); playPressed(); } break;
      case 'boxes': if (k === 'Escape') { SFX.click(); goTitle(); } break;
      case 'levels': if (k === 'Escape') { SFX.click(); openBoxes(); } break;
      case 'style': if (k === 'Escape') { SFX.click(); goTitle(); } break;
      case 'play':
        if (k === 'KeyR') restart();
        else if (k === 'KeyP' || k === 'Escape') pause();
        else if (k === 'KeyH') showHint();
        break;
      case 'pause':
        if (k === 'KeyP' || k === 'Escape') resume();
        else if (k === 'KeyR') restart();
        break;
      case 'won':
        if (k === 'KeyR') restart();
        else if (go && G.panel) { e.preventDefault(); nextLevel(); }
        else if (k === 'Escape' && G.panel) { SFX.click(); openLevels(G.box); }
        break;
      case 'lost':
        if (k === 'KeyR' || go) { e.preventDefault(); restart(); }
        else if (k === 'KeyH') { restartWithHint(); }
        else if (k === 'Escape' && G.panel) { SFX.click(); openLevels(G.box); }
        break;
    }
  });
  function restartWithHint() { SFX.click(); startLevel(G.level, { hint: true }); }

  function btn(id, fn) {
    var b = $(id);
    b.addEventListener('click', function (e) { e.stopPropagation(); fn(); b.blur(); });
  }
  btn('tPlay', playPressed);
  btn('tLevels', function () { SFX.click(); openBoxes(); });
  btn('tStyle', function () { SFX.click(); openStyle(); });
  btn('bxBack', function () { SFX.click(); goTitle(); });
  btn('lvBack', function () { SFX.click(); openBoxes(); });
  btn('stBack', function () { SFX.click(); goTitle(); });
  btn('bPause', pause);
  btn('bRestart', restart);
  btn('bHint', showHint);
  btn('pResume', resume);
  btn('pRestart', restart);
  btn('pLevels', function () { SFX.click(); openLevels(G.box); });
  btn('pMenu', function () { SFX.click(); goTitle(); });
  btn('wLevels', function () { SFX.click(); openLevels(G.box); });
  btn('wReplay', restart);
  btn('wNext', nextLevel);
  btn('fLevels', function () { SFX.click(); openLevels(G.box); });
  btn('fRetry', restart);
  btn('fHint', restartWithHint);
  btn('fSkip', skipLevel);

  /* ------------------------------------------------------------ events -> juice */
  var HUD_SLOT = function (k) { return { x: 196 + k * 44, y: 40 }; };
  function handleEvents(w, main) {
    var ev = w.events, m = main ? G.munch : G.titleMunch;
    for (var i = 0; i < ev.length; i++) {
      var e = ev[i];
      var sk = Art.CANDIES[prog.candy];
      switch (e.type) {
        case 'cut':
          SFX.cut();
          burst(e.x, e.y, 10, { speed: 220, colors: ['#fff', '#ffe14d', '#e9b872'], type: 2, size: 5, g: 200, life: 0.5 });
          burst(e.x, e.y, 6, { speed: 140, color: '#9b6a35', size: 3, life: 0.5 });
          G.tut = false;
          if (G.tipT > 1) G.tipT = 1;
          break;
        case 'star':
          SFX.star(e.n);
          burst(e.x, e.y, 16, { speed: 320, colors: ['#ffe14d', '#fff', '#ffb800'], type: 1, size: 7, g: 300, life: 0.7 });
          burst(e.x, e.y, 8, { speed: 120, color: '#fff', type: 2, size: 6, g: 0, life: 0.5 });
          floatText(['حلو!', 'رائع!', 'خارق!'][clamp(e.n - 1, 0, 2)], e.x, e.y - 30, '#fff6a0', 30);
          if (main) G.flyers.push({ x0: e.x, y0: e.y, k: e.n - 1, t: 0 });
          shake.add(2);
          break;
        case 'attach':
          SFX.attach();
          burst(e.x, e.y, 12, { speed: 200, colors: ['#fff', '#b8f0ff'], type: 2, size: 5, g: 0, life: 0.5 });
          break;
        case 'bubble':
          SFX.bubble();
          burst(e.x, e.y, 10, { speed: 160, color: 'rgba(200,240,255,0.9)', size: 6, g: -100, life: 0.6 });
          if (G.tipT <= 0 && main && hasHl(LEVELS[G.level], 'bubble')) G.tipT = 2;
          break;
        case 'pop':
          SFX.pop();
          burst(e.x, e.y, 18, { speed: 280, color: 'rgba(220,245,255,0.95)', size: 5, g: 200, life: 0.45 });
          if (G.tipT > 1) G.tipT = 1;
          break;
        case 'puff':
          SFX.puff();
          for (var k = 0; k < 9; k++) {
            var a = e.a + (Math.random() - 0.5) * 0.7, sp = 250 + Math.random() * 350;
            spawn(e.x, e.y, Math.cos(a) * sp, Math.sin(a) * sp, 0.5 + Math.random() * 0.3, 10 + Math.random() * 10, 'rgba(255,255,255,0.85)', 5, 0);
          }
          if (G.tipT > 1) G.tipT = 1;
          break;
        case 'bounce':
          SFX.bounce();
          burst(e.x, e.y, 10, { speed: 220, colors: ['#fff', '#ff6f91', '#ffe14d'], type: 2, size: 5, g: 300, life: 0.5 });
          m.sqv += 0; shake.add(3);
          break;
        case 'spike':
          SFX.spike();
          burst(e.x, e.y, 22, { speed: 420, colors: [sk.a, sk.b, sk.wrap], type: 3, size: 9, g: 900, life: 1.0 });
          burst(e.x, e.y, 8, { speed: 200, color: '#fff', type: 2, size: 6, g: 0, life: 0.4 });
          shake.add(12);
          munchMood(m, 'sad'); m.sqv += 3;
          if (main) { G.state = 'lost'; G.endT = 0; onLose(); later(SFX.lose, 350); }
          else G.titleRespawn = 1.6;
          break;
        case 'lost':
          munchMood(m, 'sad'); m.sqv += 3;
          if (main) { G.state = 'lost'; G.endT = 0; onLose(); SFX.lose(); }
          else G.titleRespawn = 1.4;
          break;
        case 'eat':
          SFX.eat();
          munchMood(m, 'eat'); m.sq = -0.25; m.sqv = 0; m.antv += 14;
          burst(e.x, e.y, 26, { speed: 420, colors: ['#ffe14d', '#fff', '#7ed957', '#ff6f91'], type: 2, size: 7, g: 250, life: 0.9 });
          burst(w.munch.x, w.munch.y - 40, 7, { speed: 180, angle: -Math.PI / 2, spread: 1.6, color: '#ff4f7a', type: 4, size: 9, g: -120, life: 1.3 });
          floatText('لذيذ!', w.munch.x, w.munch.y < 210 ? w.munch.y + 120 : w.munch.y - 110, '#ffffff', 48);
          shake.add(6);
          if (main) { G.state = 'won'; G.endT = 0; onWin(); }
          else G.titleRespawn = 2.2;
          break;
      }
    }
    ev.length = 0;
  }

  /* ------------------------------------------------------------ update */
  function update(dt) {
    G.t += dt;
    shake.update(dt);
    updateParts(dt);
    for (var i = texts.length - 1; i >= 0; i--) { texts[i].life -= dt; texts[i].y -= 40 * dt; if (texts[i].life <= 0) texts.splice(i, 1); }
    while (trail.length && G.t - trail[0].t > 0.22) trail.shift();

    var s = G.state;
    if (s === 'title' || s === 'boxes' || s === 'levels' || s === 'style') {
      var tw = G.titleWorld;
      Sim.step(tw); handleEvents(tw, false);
      updateMunch(G.titleMunch, tw, dt);
      if (G.titleRespawn > 0) { G.titleRespawn -= dt; if (G.titleRespawn <= 0) newTitleWorld(); }
      return;
    }
    if (s === 'pause') return;
    var w = G.world;
    if (!w) return;
    if (s === 'play') {
      G.introT += dt;
      if (G.intro > 0) G.intro -= dt;
      else {
        if (G.replay) {
          while (G.rIdx < G.replay.length && G.replay[G.rIdx][0] <= w.frame) { Sim.act(w, G.replay[G.rIdx].slice(1)); G.rIdx++; }
        }
        Sim.step(w);
      }
      if (G.tipT > 0) G.tipT -= dt;
      if (G.hint > 0) G.hint -= dt;
    } else {
      Sim.step(w);
      G.endT += dt;
      if (!G.panel) {
        if (s === 'won' && G.endT > 1.5) showWinPanel();
        if (s === 'lost' && G.endT > 1.1) showFailPanel();
      }
    }
    handleEvents(w, true);
    updateMunch(G.munch, w, dt);
    // flying stars to HUD
    for (i = G.flyers.length - 1; i >= 0; i--) {
      var f = G.flyers[i]; f.t += dt * 2.2;
      if (f.t >= 1) { G.flyers.splice(i, 1); G.hudStars++; G.slotPop[f.k] = 1; SFX.tick(f.k); }
    }
    for (i = 0; i < 3; i++) if (G.slotPop[i] > 0) G.slotPop[i] = Math.max(0, G.slotPop[i] - dt * 3);
    // ambient sparkles on stars
    G.sparkT -= dt;
    if (G.sparkT <= 0) {
      G.sparkT = 0.12;
      var st = w.stars[(Math.random() * w.stars.length) | 0];
      if (st && !st.got) spawn(st.x + (Math.random() - 0.5) * 50, st.y + (Math.random() - 0.5) * 50, 0, -20, 0.6, 4, '#fff8c0', 2, 0);
    }
  }

  /* ------------------------------------------------------------ render */
  function getBg(theme) {
    if (!bg[theme]) bg[theme] = Art.makeBackground(theme, W, H, Math.min(2, view.scale * view.dpr));
    return bg[theme];
  }
  var starSprite = null;
  function getStarSprite() {
    if (starSprite) return starSprite;
    var c = document.createElement('canvas'); c.width = c.height = 128;
    var g = c.getContext('2d');
    var rg = g.createRadialGradient(64, 64, 10, 64, 64, 62);
    rg.addColorStop(0, 'rgba(255,240,150,0.75)'); rg.addColorStop(1, 'rgba(255,240,150,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
    Art.starPath(g, 64, 66, 30, 14, 0);
    var lg = g.createLinearGradient(0, 36, 0, 96); lg.addColorStop(0, '#fff7a8'); lg.addColorStop(0.5, '#ffd000'); lg.addColorStop(1, '#ff9d00');
    g.fillStyle = lg; g.fill(); g.lineWidth = 5; g.lineJoin = 'round'; g.strokeStyle = '#a35a00'; g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.ellipse(55, 56, 7, 4, -0.6, 0, TAU); g.fill();
    starSprite = c; return c;
  }

  function ropePath(pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length - 1; i++) {
      var mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
    }
    ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
  }
  function drawRope(pts, alpha, theme) {
    if (!pts || pts.length < 2) return;
    ctx.globalAlpha = alpha;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ropePath(pts);
    ctx.strokeStyle = '#4a2a0c'; ctx.lineWidth = 9; ctx.stroke();
    ctx.strokeStyle = theme === 'gift' ? '#fff3f8' : '#f1c98a'; ctx.lineWidth = 5; ctx.stroke();
    ctx.setLineDash([7, 7]); ctx.lineDashOffset = 0;
    ctx.strokeStyle = theme === 'gift' ? '#ff4f8f' : '#c07c33'; ctx.lineWidth = 5; ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }
  function drawPin(x, y, moving) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.arc(x + 2, y + 4, 13, 0, TAU); ctx.fill();
    var g = ctx.createRadialGradient(x - 4, y - 4, 2, x, y, 13);
    g.addColorStop(0, '#fff6c8'); g.addColorStop(0.5, moving ? '#7fd6ff' : '#ffc93c'); g.addColorStop(1, moving ? '#1d7fc4' : '#c47f00');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 12, 0, TAU); ctx.fill();
    ctx.lineWidth = 3.5; ctx.strokeStyle = '#4a2a0c'; ctx.stroke();
    ctx.fillStyle = '#4a2a0c'; ctx.beginPath(); ctx.arc(x, y, 3.5, 0, TAU); ctx.fill();
  }
  function drawTrack(o) {
    var m = o.move; if (!m) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(70,35,10,0.35)'; ctx.lineWidth = 16;
    ctx.beginPath();
    if (m.cx != null) ctx.arc(m.cx, m.cy, m.r, 0, TAU); else { ctx.moveTo(o.x0, o.y0); ctx.lineTo(m.x2, m.y2); }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 3; ctx.setLineDash([2, 12]);
    ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
  }
  function drawRing(g) {
    if (g.used) return;
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.beginPath(); ctx.arc(g.x, g.y, g.r, 0, TAU); ctx.fill();
    ctx.setLineDash([14, 10]); ctx.lineDashOffset = -G.t * 30;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 4; ctx.stroke();
    ctx.setLineDash([]);
    // coiled rope
    ctx.strokeStyle = '#4a2a0c'; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.arc(g.x, g.y, 20, 0, TAU); ctx.stroke();
    ctx.strokeStyle = '#f1c98a'; ctx.lineWidth = 4; ctx.stroke();
    ctx.restore();
    drawPin(g.x, g.y, !!g.move);
  }
  function drawSpikes(s) {
    ctx.save();
    ctx.translate(s.x, s.y); ctx.rotate(s.a);
    var hw = s.w / 2, n = Math.max(2, Math.round(s.w / 22)), step = s.w / n;
    ctx.lineJoin = 'round';
    for (var side = -1; side <= 1; side += 2) {
      ctx.beginPath();
      for (var i = 0; i < n; i++) {
        var x0 = -hw + i * step;
        ctx.moveTo(x0, 0); ctx.lineTo(x0 + step / 2, side * 20); ctx.lineTo(x0 + step, 0);
      }
      var g = ctx.createLinearGradient(0, 0, 0, side * 20);
      g.addColorStop(0, '#9aa3b5'); g.addColorStop(1, '#f2f5fa');
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = '#2e3446'; ctx.lineWidth = 3; ctx.stroke();
    }
    Art.roundRect(ctx, -hw - 4, -7, s.w + 8, 14, 7);
    ctx.fillStyle = '#6b7488'; ctx.fill(); ctx.strokeStyle = '#2e3446'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(-hw, -4, s.w, 3);
    ctx.restore();
  }
  function drawTramp(t) {
    ctx.save();
    ctx.translate(t.x, t.y); ctx.rotate(t.a);
    var hw = t.w / 2, bend = Math.sin(t.anim * Math.PI) * 16;
    // springy legs + base
    ctx.lineCap = 'round';
    for (var s = -1; s <= 1; s += 2) {
      var lx = s * (hw - 18);
      ctx.strokeStyle = '#2b1238'; ctx.lineWidth = 9;
      ctx.beginPath(); ctx.moveTo(lx, 8); ctx.lineTo(lx, 34); ctx.stroke();
      ctx.strokeStyle = '#ffd21f'; ctx.lineWidth = 4;
      ctx.beginPath();
      for (var k = 0; k <= 6; k++) { var yy = 10 + k * 4 * (1 - t.anim * 0.3); ctx.lineTo(lx + (k % 2 ? 5 : -5), yy); }
      ctx.stroke();
    }
    Art.roundRect(ctx, -hw + 6, 32, t.w - 12, 10, 5);
    ctx.fillStyle = '#7a3b9e'; ctx.fill(); ctx.strokeStyle = '#2b1238'; ctx.lineWidth = 3; ctx.stroke();
    // pad
    ctx.beginPath();
    ctx.moveTo(-hw, -2); ctx.quadraticCurveTo(0, -2 + bend * 2, hw, -2);
    ctx.lineTo(hw, 12); ctx.quadraticCurveTo(0, 12 + bend * 2, -hw, 12); ctx.closePath();
    ctx.fillStyle = '#ff3b6b'; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.fillStyle = '#fff';
    for (var x = -hw; x < hw; x += 26) ctx.fillRect(x, -12, 13, 44);
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(-hw, -2 + bend, t.w, 4);
    ctx.restore();
    ctx.strokeStyle = '#2b1238'; ctx.lineWidth = 4; ctx.stroke();
    ctx.fillStyle = '#2b1238';
    ctx.beginPath(); ctx.moveTo(-hw + 8, 5); ctx.arc(-hw, 5, 8, 0, TAU); ctx.moveTo(hw + 8, 5); ctx.arc(hw, 5, 8, 0, TAU); ctx.fill();
    ctx.restore();
  }
  function drawBlower(b, pulse) {
    ctx.save();
    ctx.translate(b.x, b.y); ctx.rotate(b.a);
    var sq = b.anim;
    ctx.scale(1 - sq * 0.25, 1 + sq * 0.15);
    // nozzle
    ctx.beginPath(); ctx.moveTo(14, -12); ctx.lineTo(40, -19); ctx.lineTo(40, 19); ctx.lineTo(14, 12); ctx.closePath();
    ctx.fillStyle = '#ffd21f'; ctx.fill(); ctx.strokeStyle = '#2b1238'; ctx.lineWidth = 3.5; ctx.stroke();
    // body
    ctx.beginPath(); ctx.ellipse(-8, 0, 32, 28, 0, 0, TAU);
    var g = ctx.createRadialGradient(-18, -12, 4, -8, 0, 34);
    g.addColorStop(0, '#b8ecff'); g.addColorStop(1, '#2a9fe0');
    ctx.fillStyle = g; ctx.fill(); ctx.stroke();
    ctx.restore();
    // face stays upright
    ctx.save(); ctx.translate(b.x - Math.cos(b.a) * 8, b.y - Math.sin(b.a) * 8);
    ctx.fillStyle = '#2b1238';
    ctx.beginPath(); ctx.moveTo(-8 + 3.5, -5); ctx.arc(-8, -5, 3.5, 0, TAU); ctx.moveTo(8 + 3.5, -5); ctx.arc(8, -5, 3.5, 0, TAU); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#2b1238';
    ctx.beginPath(); if (sq > 0.2) ctx.arc(0, 6, 4, 0, TAU); else ctx.arc(0, 3, 6, 0.3, Math.PI - 0.3); ctx.stroke();
    ctx.fillStyle = 'rgba(255,120,160,0.6)'; ctx.beginPath(); ctx.moveTo(-15 + 4, 4); ctx.arc(-15, 4, 4, 0, TAU); ctx.moveTo(15 + 4, 4); ctx.arc(15, 4, 4, 0, TAU); ctx.fill();
    ctx.restore();
    if (pulse) {
      var k = (G.t * 1.2) % 1;
      ctx.strokeStyle = 'rgba(255,255,255,' + (1 - k) + ')'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(b.x, b.y, 40 + k * 30, 0, TAU); ctx.stroke();
    }
  }
  function drawBubbleAt(x, y, r, t) {
    var wob = Math.sin(t * 6) * 0.05;
    ctx.save(); ctx.translate(x, y); ctx.scale(1 + wob, 1 - wob);
    var g = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r);
    g.addColorStop(0, 'rgba(255,255,255,0.35)'); g.addColorStop(0.7, 'rgba(160,225,255,0.18)'); g.addColorStop(1, 'rgba(120,200,255,0.45)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 3; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(0, 0, r * 0.72, Math.PI * 1.1, Math.PI * 1.4); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(r * 0.45, -r * 0.45, 3.5, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function drawWorld(w, m, theme, munchScale, intro) {
    var i, sk = prog.candy;
    for (i = 0; i < w.pins.length; i++) drawTrack(w.pins[i]);
    for (i = 0; i < w.rings.length; i++) if (!w.rings[i].used) drawTrack(w.rings[i]);
    for (i = 0; i < w.spikes.length; i++) drawTrack(w.spikes[i]);
    for (i = 0; i < w.rings.length; i++) drawRing(w.rings[i]);
    for (i = 0; i < w.tramps.length; i++) drawTramp(w.tramps[i]);
    for (i = 0; i < w.spikes.length; i++) drawSpikes(w.spikes[i]);
    var firstBlowerLevel = G.state === 'play' && w === G.world && hasHl(LEVELS[G.level], 'puff') && !w.actions;
    for (i = 0; i < w.blowers.length; i++) drawBlower(w.blowers[i], firstBlowerLevel);
    // Munch
    Art.drawStand(ctx, w.munch.x, w.munch.y + (munchScale - 1) * 56, theme);
    Art.drawMunch(ctx, m, w.munch.x, w.munch.y + m.hop, munchScale);
    // stars
    var ss = getStarSprite();
    for (i = 0; i < w.stars.length; i++) {
      var st = w.stars[i];
      if (st.got) continue;
      var k = intro != null ? back((intro - 0.1 - i * 0.08) / 0.35) : 1;
      if (k <= 0) continue;
      var bob = Math.sin(G.t * 3 + i) * 4, sc = (0.9 + Math.sin(G.t * 4 + i * 2) * 0.06) * k;
      ctx.save(); ctx.translate(st.x, st.y + bob); ctx.rotate(Math.sin(G.t * 2 + i) * 0.15); ctx.scale(sc, sc);
      ctx.drawImage(ss, -40, -40, 80, 80);
      ctx.restore();
    }
    for (i = 0; i < w.bubbles.length; i++) if (!w.bubbles[i].used) drawBubbleAt(w.bubbles[i].x, w.bubbles[i].y, 40, G.t + i);
    // ropes
    for (i = 0; i < w.pieces.length; i++) drawRope(w.pieces[i].pts, Math.min(1, w.pieces[i].life * 1.5), theme);
    for (i = 0; i < w.ropes.length; i++) drawRope(w.ropes[i].pts, 1, theme);
    for (i = 0; i < w.pins.length; i++) drawPin(w.pins[i].x, w.pins[i].y, !!w.pins[i].move);
    for (i = 0; i < w.rings.length; i++) if (w.rings[i].used) drawPin(w.rings[i].x, w.rings[i].y, !!w.rings[i].move);
    // candy
    var c = w.candy;
    if (c.alive) {
      var ck = intro != null ? back(intro / 0.4) : 1;
      Art.drawCandy(ctx, c.x, c.y, c.rot, sk, ck, G.t);
      if (c.bubble) {
        drawBubbleAt(c.x, c.y, 44, G.t);
        if (G.state === 'play' && w.bubbles.length && hasHl(LEVELS[G.level], 'pop') && c.bubbleT > 0.4) {
          var q = (G.t * 1.3) % 1;
          ctx.strokeStyle = 'rgba(255,255,255,' + (1 - q) + ')'; ctx.lineWidth = 4;
          ctx.beginPath(); ctx.arc(c.x, c.y, 50 + q * 30, 0, TAU); ctx.stroke();
        }
      }
    }
  }

  function drawTrail() {
    if (trail.length < 2) return;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (var pass = 0; pass < 2; pass++) {
      for (var i = 1; i < trail.length; i++) {
        var a = trail[i - 1], b = trail[i];
        var k = 1 - (G.t - b.t) / 0.22; if (k <= 0) continue;
        var f = i / trail.length;
        ctx.strokeStyle = pass ? 'rgba(255,255,255,' + k + ')' : 'rgba(255,90,170,' + (k * 0.55) + ')';
        ctx.lineWidth = pass ? 2 + 5 * f * k : 6 + 12 * f * k;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }
  }

  function pill(x, y, w, h) {
    Art.roundRect(ctx, x, y, w, h, h / 2);
    ctx.fillStyle = 'rgba(43,18,56,0.72)'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.stroke();
  }
  function drawHud() {
    var ss = getStarSprite();
    pill(14, 12, 318, 56);
    ctx.fillStyle = '#fff'; ctx.font = '700 26px Fredoka, "Segoe UI", sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    var lvTxt = 'المرحلة ' + (G.level + 1);
    if (ctx.measureText(lvTxt).width > 140) ctx.font = '700 22px Fredoka, "Segoe UI", sans-serif';
    ctx.fillText(lvTxt, 34, 43);
    for (var k = 0; k < 3; k++) {
      var p = HUD_SLOT(k);
      ctx.save(); ctx.translate(p.x, p.y);
      if (G.hudStars > k) {
        var sc = 1 + G.slotPop[k] * 0.6;
        ctx.scale(sc, sc); ctx.drawImage(ss, -26, -26, 52, 52);
      } else {
        Art.starPath(ctx, 0, 1, 17, 8, 0);
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.stroke();
      }
      ctx.restore();
    }
    // flying stars
    for (var i = 0; i < G.flyers.length; i++) {
      var f = G.flyers[i], t = ease(f.t), to = HUD_SLOT(f.k);
      var x = f.x0 + (to.x - f.x0) * t, y = f.y0 + (to.y - f.y0) * t - Math.sin(t * Math.PI) * 80;
      var s = 1.2 - 0.5 * t;
      ctx.drawImage(ss, x - 40 * s, y - 40 * s, 80 * s, 80 * s);
    }
    ctx.textBaseline = 'alphabetic';
  }
  function drawTip() {
    var L = LEVELS[G.level];
    if (G.tipT > 0 && L.tip) {
      var a = Math.min(1, G.tipT, (5.5 - G.tipT) * 3 + 0.001);
      if (G.tipT > 5.5) a = 1;
      ctx.globalAlpha = clamp(a, 0, 1);
      ctx.font = '700 26px Fredoka, "Segoe UI", sans-serif';
      var tw = ctx.measureText(L.tip).width + 50;
      var mw = G.world.munch, tx = 640, ty = 677;
      if (mw.y > 470 && Math.abs(mw.x - 640) < tw / 2 + 80) tx = mw.x <= 640 ? mw.x + 90 + tw / 2 : mw.x - 90 - tw / 2;
      tx = clamp(tx, tw / 2 + 10, W - 10 - tw / 2);
      pill(tx - tw / 2, ty - 29, tw, 56);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(L.tip, tx, ty);
      ctx.textBaseline = 'alphabetic'; ctx.globalAlpha = 1;
    }
    if (G.intro > 0 || G.introT < 1.6) {
      var k = G.introT;
      var y = k < 0.3 ? -60 + ease(k / 0.3) * 180 : k < 1.2 ? 120 : 120 - ease((k - 1.2) / 0.35) * 220;
      ctx.font = '700 54px Fredoka, "Segoe UI", sans-serif'; ctx.textAlign = 'center';
      ctx.lineWidth = 10; ctx.strokeStyle = '#2b1238'; ctx.lineJoin = 'round';
      var txt = LEVELS[G.level].name;
      ctx.strokeText(txt, 640, y); ctx.fillStyle = '#fff'; ctx.fillText(txt, 640, y);
    }
  }
  function drawTutorial(w) {
    if (!G.tut || !w.ropes.length) return;
    var r = w.ropes[0], p = r.pts[Math.floor(r.pts.length * 0.45)];
    var k = (G.t % 1.8) / 1.8;
    if (k > 0.75) return;
    var u = ease(k / 0.75);
    var x = p.x - 120 + u * 240, y = p.y - 40 + u * 80;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(p.x - 120, p.y - 40); ctx.lineTo(x, y); ctx.stroke();
    // hand
    ctx.save(); ctx.translate(x + 14, y + 24); ctx.rotate(-0.4);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#2b1238'; ctx.lineWidth = 4;
    Art.roundRect(ctx, -8, -34, 16, 40, 8); ctx.fill(); ctx.stroke();
    Art.roundRect(ctx, -18, -4, 40, 34, 14); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  function drawHints(w) {
    if (G.hint <= 0 || !G.hintItems.length) return;
    var a = Math.min(1, G.hint);
    ctx.globalAlpha = a;
    ctx.font = '700 24px Fredoka, "Segoe UI", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    var seen = {};
    for (var i = 0; i < G.hintItems.length; i++) {
      var it = G.hintItems[i], p = hintPos(it, w);
      if (!p) continue;
      var key = Math.round(p.x / 30) + ',' + Math.round(p.y / 30);
      var off = (seen[key] || 0); seen[key] = off + 1;
      var x = p.x + off * 40, y = p.y - 44;
      if (x < 370 && y < 120) y = 120; // keep the marker + label clear of the HUD pill
      var pulse = 1 + Math.sin(G.t * 6 + i) * 0.08;
      ctx.save(); ctx.translate(x, y); ctx.scale(pulse, pulse);
      ctx.fillStyle = '#ffe14d'; ctx.strokeStyle = '#2b1238'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(0, 0, 22, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-8, 18); ctx.lineTo(0, 32); ctx.lineTo(8, 18); ctx.fill();
      ctx.fillStyle = '#2b1238'; ctx.fillText(String(i + 1), 0, 1);
      ctx.restore();
      var lbl = it.a === 'cut' ? 'اقطع' : it.a === 'pop' ? 'فرقع' : it.n === 2 ? 'انفخ مرتين' : it.n > 2 ? 'انفخ ' + it.n + ' مرات' : 'انفخ';
      ctx.font = '700 18px Fredoka, "Segoe UI", sans-serif';
      ctx.lineWidth = 5; ctx.strokeStyle = '#2b1238'; ctx.strokeText(lbl, x, y - 36);
      ctx.fillStyle = '#fff'; ctx.fillText(lbl, x, y - 36);
      ctx.font = '700 24px Fredoka, "Segoe UI", sans-serif';
    }
    ctx.textBaseline = 'alphabetic'; ctx.globalAlpha = 1;
  }
  function drawTexts() {
    ctx.textAlign = 'center'; ctx.lineJoin = 'round';
    for (var i = 0; i < texts.length; i++) {
      var t = texts[i], k = t.life / 1.1;
      var s = t.size * (k > 0.85 ? 1 + (k - 0.85) * 3 : 1);
      ctx.globalAlpha = Math.min(1, k * 2);
      ctx.font = '700 ' + Math.round(s) + 'px Fredoka, "Segoe UI", sans-serif';
      ctx.lineWidth = 7; ctx.strokeStyle = '#2b1238'; ctx.strokeText(t.txt, t.x, t.y);
      ctx.fillStyle = t.color; ctx.fillText(t.txt, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }
  function drawEndOverlay() {
    // big Munch next to the result panel
    var k = ease(G.endT > 0 ? (G.panelT || 0) / 0.4 : 0);
    ctx.fillStyle = 'rgba(40,14,60,' + (0.35 * k) + ')'; ctx.fillRect(0, 0, W, H);
    var cx = 960, cy = 380;
    ctx.save();
    ctx.globalAlpha = k;
    if (G.state === 'won') {
      ctx.translate(cx, cy + 30); ctx.rotate(G.t * 0.3);
      for (var i = 0; i < 12; i++) {
        ctx.fillStyle = i % 2 ? 'rgba(255,240,150,0.28)' : 'rgba(255,255,255,0.12)';
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 520, i * TAU / 12, (i + 1) * TAU / 12); ctx.fill();
      }
    }
    ctx.restore();
    if (k > 0.01) {
      var m = G.munch;
      ctx.save(); ctx.globalAlpha = k;
      var sc = 2.1 * back(k);
      Art.drawMunch(ctx, m, cx, cy - 20 + m.hop * 0.6, sc);
      ctx.restore();
    }
  }

  function render() {
    var s = G.state;
    ctx.save();
    ctx.direction = 'rtl'; // every canvas string is Arabic; all calls set textAlign explicitly
    if (s === 'title' || s === 'boxes' || s === 'levels' || s === 'style') {
      ctx.drawImage(getBg('cardboard'), 0, 0, W, H);
      drawTitleDeco();
      ctx.translate(shake.x, shake.y);
      drawWorld(G.titleWorld, G.titleMunch, 'cardboard', 1.35, null);
      drawParts(); drawTexts(); drawTrail();
      ctx.restore();
      return;
    }
    var w = G.world;
    if (!w) { ctx.restore(); return; }
    var theme = BOXES[G.box].theme;
    ctx.drawImage(getBg(theme), 0, 0, W, H);
    ctx.translate(shake.x, shake.y);
    drawWorld(w, G.munch, theme, 1, s === 'play' && G.introT < 1 ? G.introT : null);
    drawHints(w);
    drawParts();
    drawTexts();
    drawTrail();
    drawTutorial(w);
    ctx.restore();
    drawHud();
    if (s === 'play') drawTip();
    if ((s === 'won' || s === 'lost') && G.panel) drawEndOverlay();
  }

  var deco = [];
  for (var di = 0; di < 7; di++) deco.push({ x: 60 + di * 190 + Math.random() * 60, y: Math.random() * 720, v: 20 + Math.random() * 25, r: Math.random() * 6, s: 0.8 + Math.random() * 0.5 });
  function drawTitleDeco() {
    ctx.globalAlpha = 0.28;
    var ts = totalStars();
    for (var i = 0; i < deco.length; i++) {
      var d = deco[i];
      var y = (d.y + G.t * d.v) % 820 - 50;
      var skin = i % Art.CANDIES.length;
      if (Art.CANDIES[skin].need > ts) skin = i % 2;
      Art.drawCandy(ctx, d.x, y, d.r + G.t * 0.5, skin, d.s, G.t);
    }
    ctx.globalAlpha = 1;
  }

  /* ------------------------------------------------------------ loop */
  var loop = Kit.loop(function (dt) {
    update(dt);
    if (G.panel) G.panelT = (G.panelT || 0) + dt; else G.panelT = 0;
    Kit.keys.endFrame();
  }, render);

  document.addEventListener('visibilitychange', function () { if (document.hidden && G.state === 'play') pause(); });

  goTitle();

  /* ------------------------------------------------------------ debug hook */
  window.__game = {
    info: function () {
      var w = G.world, n = 0;
      for (var i = 0; i < PMAX; i++) if (parts[i].on) n++;
      return {
        state: G.state, level: G.level, panel: G.panel, totalStars: totalStars(), prog: prog.stars.slice(),
        world: w ? { state: w.state, frame: w.frame, stars: w.starsGot, ropes: w.ropes.length, candy: [Math.round(w.candy.x), Math.round(w.candy.y)], bubble: w.candy.bubble } : null,
        particles: n
      };
    },
    start: function (i) { startLevel(i); },
    world: function () { return G.world; },
    replay: function (i) { startLevel(i, { replay: SOL[i] }); },
    solution: function (i) { return SOL[i]; },
    unlockAll: function () { for (var i = 0; i < NL; i++) if (prog.stars[i] < 0) prog.stars[i] = 3; save(); },
    resetSave: function () { store.remove('prog'); },
    swipe: function (x0, y0, x1, y1) { swipe(x0, y0, x1, y1); },
    loop: loop,
    bench: function (n) { n = n || 30; var t0 = performance.now(); for (var i = 0; i < n; i++) render(); var t1 = performance.now(); for (i = 0; i < n; i++) update(1 / 60); return { renderMs: (t1 - t0) / n, updateMs: (performance.now() - t1) / n }; }
  };
})();
