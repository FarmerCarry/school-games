/*
 * Moto Madness — game flow, input, camera, effects, HUD, menus and saving.
 */
(function () {
  'use strict';
  var MM = window.MM, MMR = window.MMR, MMA = window.MMA;
  var canvas = document.getElementById('game');
  // cap the canvas backing store (~1.8M pixels) so fullscreen stays smooth on integrated graphics
  var fitOpts = { maxDpr: 2 };
  function capDpr() {
    var sc = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
    var px = 1280 * sc * 720 * sc;
    fitOpts.maxDpr = Math.max(0.5, Math.min(2, Math.sqrt(1.8e6 / Math.max(1, px))));
  }
  capDpr();
  window.addEventListener('resize', capDpr);
  var view = Kit.fit(canvas, 1280, 720, fitOpts);
  var ctx = view.ctx;
  var store = Kit.store('moto-madness');
  var $ = function (id) { return document.getElementById(id); };
  var TAU = Math.PI * 2;
  var muteBtn = Kit.muteButton();
  muteBtn.setAttribute('aria-label', 'تشغيل الصوت أو كتمه');
  muteBtn.title = 'الصوت (M)';

  /* ------------------------------------------------------------ skins */
  var PAINTS = [
    { name: 'الصاروخ الأحمر', body: '#ff3b3b', dark: '#9e1b1b', accent: '#ffd23f', rim: '#ffd23f', cost: 0 },
    { name: 'الأخضر الليموني', body: '#7ed321', dark: '#3f7a0c', accent: '#ffffff', rim: '#ffffff', cost: 3 },
    { name: 'أزرق المحيط', body: '#2f8bff', dark: '#16459e', accent: '#7ff0ff', rim: '#7ff0ff', cost: 7 },
    { name: 'أصفر الشمس', body: '#ffd000', dark: '#9e7a00', accent: '#1d1d24', rim: '#2b2d3a', cost: 12 },
    { name: 'البنفسجي اللامع', body: '#a45cff', dark: '#5a26a8', accent: '#ff9cf2', rim: '#ff9cf2', cost: 18 },
    { name: 'وردي الحلوى', body: '#ff6fb5', dark: '#a8326d', accent: '#ffffff', rim: '#ffffff', cost: 25 },
    { name: 'منتصف الليل', body: '#2b2d3a', dark: '#0f1017', accent: '#29e6ff', rim: '#29e6ff', cost: 33 },
    { name: 'البطل الذهبي', body: '#ffc21a', dark: '#a3700a', accent: '#fff4b0', rim: '#fff4b0', cost: 42 },
    { name: 'قوس قزح', rainbow: true, body: '#ff3b3b', dark: '#2b2d3a', accent: '#ffffff', rim: '#ffffff', cost: 52 }
  ];
  var SUITS = [
    { name: 'الكلاسيكية', suit: '#2f6bff', suitDark: '#1d3f9e', suitAccent: '#ffffff', helmet: '#ffffff', helmet2: '#ff3b3b', cost: 0 },
    { name: 'النار', suit: '#ff5a1f', suitDark: '#a8330c', suitAccent: '#ffd23f', helmet: '#ffd23f', helmet2: '#ff3b3b', cost: 5 },
    { name: 'الغابة', suit: '#2fa84f', suitDark: '#1a6b30', suitAccent: '#ffe066', helmet: '#2fa84f', helmet2: '#ffe066', cost: 10 },
    { name: 'الجليد', suit: '#9fdcff', suitDark: '#5a9fcc', suitAccent: '#2f6bff', helmet: '#ffffff', helmet2: '#29c6ff', cost: 15 },
    { name: 'النينجا', suit: '#2a2b36', suitDark: '#121319', suitAccent: '#ff3b3b', helmet: '#2a2b36', helmet2: '#ff3b3b', cost: 22 },
    { name: 'المجرّة', suit: '#6a2cff', suitDark: '#3a168f', suitAccent: '#ff4fd8', helmet: '#1b1140', helmet2: '#ff4fd8', cost: 30 },
    { name: 'الروبوت', suit: '#aeb6c8', suitDark: '#6a7086', suitAccent: '#29e6ff', helmet: '#dfe5ee', helmet2: '#29e6ff', cost: 38 },
    { name: 'النجم الخارق', suit: '#ffd23f', suitDark: '#b58a00', suitAccent: '#ff3b3b', helmet: '#ffd23f', helmet2: '#ffffff', cost: 48 }
  ];

  /* ------------------------------------------------------------- save */
  var NL = MM.LEVELS.length;
  var save = store.get('save', null);
  if (!save || typeof save !== 'object') save = {};
  if (!Array.isArray(save.stars)) save.stars = [];
  if (!Array.isArray(save.best)) save.best = [];
  save.paint = save.paint | 0; save.suit = save.suit | 0; save.flips = save.flips | 0;
  function persist() { store.set('save', save); }
  function totalStars() { var s = 0; for (var i = 0; i < NL; i++) s += save.stars[i] | 0; return s; }
  function unlocked(i) { return i === 0 || (save.stars[i - 1] | 0) > 0; }
  function nextLevelToPlay() { for (var i = 0; i < NL; i++) if (!(save.stars[i] > 0)) return i; return NL - 1; }
  function skin() {
    var p = PAINTS[save.paint] || PAINTS[0], s = SUITS[save.suit] || SUITS[0], o = {}, k;
    if (totalStars() < p.cost) p = PAINTS[0];
    if (totalStars() < s.cost) s = SUITS[0];
    for (k in p) o[k] = p[k];
    for (k in s) o[k] = s[k];
    return o;
  }
  var curSkin = skin();

  /* ----------------------------------------------------------- state */
  var state = 'title';
  var levelIdx = 0, world = null, level = null, demo = false, demoIdx = 0, demoCrashes = 0;
  var cam = { x: 0, y: 0, zoom: 1 };
  var shake = Kit.shake();
  var clock = 0, finishT = 0, lean = 0, crouch = 0, bannerT = 0, bonusFlash = 0, prevTime = 0, hurry = 0;
  var levelsCache = [];
  function getLevel(i) { if (!levelsCache[i]) levelsCache[i] = MM.build(MM.LEVELS[i]); return levelsCache[i]; }

  /* --------------------------------------------------------- particles */
  var P = [], PMAX = 520;
  for (var pi = 0; pi < PMAX; pi++) P.push({ on: false });
  var pNext = 0;
  function part(x, y, vx, vy, life, size, color, type, g, drag) {
    var p = P[pNext]; pNext = (pNext + 1) % PMAX;
    p.on = true; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = life; p.max = life; p.size = size; p.color = color;
    p.type = type || 0; p.g = g == null ? 600 : g; p.drag = drag || 0; p.rot = Math.random() * TAU; p.vr = (Math.random() - 0.5) * 12;
    return p;
  }
  function burst(x, y, n, o) {
    for (var i = 0; i < n; i++) {
      var a = o.angle != null ? o.angle + (Math.random() - 0.5) * (o.spread || TAU) : Math.random() * TAU;
      var sp = (o.speed || 200) * (0.35 + Math.random() * 0.65);
      var col = o.colors[Math.floor(Math.random() * o.colors.length)];
      part(x + (Math.random() - 0.5) * (o.jx || 0), y + (Math.random() - 0.5) * (o.jy || 0), Math.cos(a) * sp, Math.sin(a) * sp,
        (o.life || 0.6) * (0.6 + Math.random() * 0.5), (o.size || 6) * (0.6 + Math.random() * 0.7), col, o.type || 0, o.g, o.drag);
    }
  }
  function stepParticles(dt) {
    for (var i = 0; i < PMAX; i++) {
      var p = P[i];
      if (!p.on) continue;
      p.life -= dt;
      if (p.life <= 0) { p.on = false; continue; }
      p.vy += p.g * dt;
      if (p.drag) { var d = 1 - p.drag * dt; p.vx *= d; p.vy *= d; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    }
  }
  function drawParticles(c) {
    for (var i = 0; i < PMAX; i++) {
      var p = P[i];
      if (!p.on) continue;
      var k = p.life / p.max;
      c.globalAlpha = Math.min(1, k * 1.6);
      c.fillStyle = p.color;
      if (p.type === 1) { // puff (grows)
        c.beginPath(); c.arc(p.x, p.y, p.size * (1.6 - k * 0.8), 0, TAU); c.fill();
      } else if (p.type === 2) { MMR.star(c, p.x, p.y, p.size, p.color); }
      else if (p.type === 3) { // confetti
        c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); c.restore();
      } else c.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    c.globalAlpha = 1;
  }
  function clearParticles() { for (var i = 0; i < PMAX; i++) P[i].on = false; pops.length = 0; wpops.length = 0; }

  /* ------------------------------------------------------------ popups */
  var pops = [], wpops = [];
  function bigPop(text, sub, color) {
    pops.push({ text: text, sub: sub || '', color: color || '#ffd23f', t: 0, life: 1.5 });
    if (pops.length > 3) pops.shift();
  }
  function worldPop(text, x, y, color, size) {
    wpops.push({ text: text, x: x, y: y, color: color || '#fff', t: 0, life: 1.1, size: size || 34 });
    if (wpops.length > 8) wpops.shift();
  }

  /* ------------------------------------------------------------- ghost */
  // Your best run is recorded (15 samples a second) and replayed as a see-through rider to race against.
  var GHOST_HZ = 15, GHOST_MAX = GHOST_HZ * 150;
  var rec = [], ghost = null, ghostX = null;
  var GHOST_SKIN = { body: '#ffffff', dark: '#8f98c4', accent: '#ffffff', rim: '#dfe5ff', suit: '#e9edff', suitDark: '#aab2d8', suitAccent: '#ffffff', helmet: '#ffffff', helmet2: '#aab2d8' };
  var ghostPose = { x: 0, y: 0, a: 0, lean: 0, crouch: 0, wheels: [{ x: 0, y: 0, rot: 0 }, { x: 0, y: 0, rot: 0 }] };
  function loadGhost(i) {
    var g = store.get('ghost' + i, null);
    ghost = g && Array.isArray(g.d) && g.d.length >= 6 && g.d.length % 3 === 0 ? g.d : null;
  }
  function recordGhost() {
    var w = world;
    if (!w.started || w.finished || rec.length >= GHOST_MAX * 3) return;
    var n = Math.floor(w.time * GHOST_HZ);
    while (rec.length / 3 <= n) { var b = w.bike; rec.push(Math.round(b.x), Math.round(b.y), Math.round(b.a * 100)); }
  }
  function drawGhost(g) {
    ghostX = null;
    if (!ghost || demo || !world.started || world.time < 0.2) return;
    var f = world.time * GHOST_HZ, i = Math.floor(f), k = f - i, n = ghost.length / 3;
    if (i >= n - 1) { i = n - 2; k = 1; }
    var x = ghost[i * 3] + (ghost[i * 3 + 3] - ghost[i * 3]) * k, y = ghost[i * 3 + 1] + (ghost[i * 3 + 4] - ghost[i * 3 + 1]) * k;
    var a0 = ghost[i * 3 + 2] / 100, a1 = ghost[i * 3 + 5] / 100, a = a0 + (a1 - a0) * k;
    if (Math.abs(a1 - a0) > 3) a = a1; // wrapped / respawned: don't sweep through a full turn
    var ca = Math.cos(a), sa = Math.sin(a), P = ghostPose;
    ghostX = x;
    P.x = x; P.y = y; P.a = a;
    for (var j = 0; j < 2; j++) {
      var an = MM.ANCHORS[j], lx = an.ax + an.ux * 4, ly = an.ay + an.uy * 4;
      P.wheels[j].x = x + lx * ca - ly * sa; P.wheels[j].y = y + lx * sa + ly * ca; P.wheels[j].rot = x / MM.WHEEL_R;
    }
    g.save();
    g.globalAlpha = 0.38;
    MMR.drawBike(g, P, GHOST_SKIN, clock);
    g.globalAlpha = 0.8;
    g.font = 'bold 18px Fredoka, sans-serif'; g.textAlign = 'center'; g.direction = 'rtl';
    g.lineWidth = 4; g.lineJoin = 'round'; g.strokeStyle = 'rgba(20,20,45,0.7)';
    g.strokeText('أفضل جولة لك', x, y - 108); g.fillStyle = '#ffffff'; g.fillText('أفضل جولة لك', x, y - 108);
    g.restore();
  }

  /* --------------------------------------------------------- level flow */
  function setWorld(i, isDemo) {
    level = getLevel(i);
    world = new MM.World(level);
    MMR.setTheme(ctx, level);
    demo = isDemo;
    var b = world.bike;
    cam.x = b.x + 220; cam.y = b.y - 60; cam.zoom = 0.95;
    clearParticles();
    lean = 0; crouch = 0; finishT = 0;
  }
  function startDemo() {
    var cands = [];
    for (var i = 0; i < NL; i++) if (unlocked(i)) cands.push(i);
    demoIdx = cands[Math.floor(Math.random() * cands.length)] || 0;
    demoCrashes = 0;
    setWorld(demoIdx, true);
    world.started = true;
  }
  function startLevel(i) {
    levelIdx = i;
    setWorld(i, false);
    state = 'play';
    bannerT = 0; prevTime = 0; hurry = 0; stuckT = 0;
    rec = []; loadGhost(i);
    showOverlay(null);
    Kit.keys.reset();
    MMA.go();
    canvas.focus();
  }
  function restartLevel() {
    world.restart();
    clearParticles();
    bannerT = 0; finishT = 0; state = 'play'; stuckT = 0; prevTime = 0; hurry = 0; rec = [];
    showOverlay(null);
    var b = world.bike; cam.x = b.x + 220; cam.y = b.y - 60;
    MMA.respawn();
  }

  /* --------------------------------------------------------- overlays */
  var OVS = ['title', 'levels', 'garage', 'pause', 'complete'];
  function showOverlay(id) {
    for (var i = 0; i < OVS.length; i++) $(OVS[i]).hidden = OVS[i] !== id;
    $('pauseBtn').hidden = id !== null;
  }
  function goTitle() {
    state = 'title';
    if (!demo) startDemo();
    $('titleStat').textContent = '★ ' + totalStars() + ' من ' + NL * 3 + '   ·   المراحل المنجزة: ' + save.stars.filter(function (s) { return s > 0; }).length + ' من ' + NL + (save.flips ? '   ·   الشقلبات: ' + save.flips : '');
    showOverlay('title');
    MMA.silence();
  }

  var sel = 0;
  function fmt(t) {
    if (t == null) return '--';
    var m = Math.floor(t / 60), s = t - m * 60;
    return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
  }
  function goLevels() {
    state = 'levels';
    if (!demo) startDemo();
    buildLevelGrid();
    showOverlay('levels');
    MMA.silence();
  }
  function buildLevelGrid() {
    var g = $('levelGrid'), html = '', nxt = nextLevelToPlay();
    if (!(sel >= 0 && sel < NL) || !unlocked(sel)) sel = nxt;
    for (var w = 0; w < MM.WORLDS.length; w++) {
      var W = MM.WORLDS[w], ws = 0;
      for (var j = 0; j < 5; j++) ws += save.stars[w * 5 + j] | 0;
      html += '<div class="mm-world"><div class="mm-wname">' + W.name + '<small>★ ' + ws + ' من 15</small></div>';
      for (j = 0; j < 5; j++) {
        var i = w * 5 + j, lk = !unlocked(i), st = save.stars[i] | 0;
        var stars = '';
        for (var k = 0; k < 3; k++) stars += '<span class="' + (k < st ? 'on' : 'off') + '">★</span>';
        html += '<button type="button" class="mm-tile' + (lk ? ' locked' : '') + (i === sel ? ' sel' : '') + (!lk && st === 0 && i === nxt ? ' next' : '') +
          '" data-i="' + i + '" style="background:' + tileColor(W.id, j) + '">' +
          (lk ? '🔒' : (w + 1) + '-' + (j + 1)) + '<span class="nm">' + MM.LEVELS[i].name + '</span>' +
          (lk ? '' : '<span class="st">' + stars + '</span>') + '</button>';
      }
      html += '</div>';
    }
    g.innerHTML = html;
    $('lvStars').textContent = '★ ' + totalStars() + ' من ' + NL * 3;
  }
  function tileColor(id, j) {
    var c = { grass: ['#34b34a', '#2a9a3d'], desert: ['#f59a2a', '#e07d12'], winter: ['#3aa8f0', '#2a86d0'], factory: ['#8b4cf0', '#6a2cd0'] }[id];
    return 'linear-gradient(180deg,' + c[0] + ',' + c[1] + ')';
  }
  $('levelGrid').addEventListener('click', function (e) {
    var t = e.target.closest('.mm-tile');
    if (!t) return;
    var i = +t.getAttribute('data-i');
    if (!unlocked(i)) { MMA.bonk(); return; }
    MMA.click();
    startLevel(i);
  });
  $('levelGrid').addEventListener('mouseover', function (e) {
    var t = e.target.closest('.mm-tile');
    if (!t) return;
    var i = +t.getAttribute('data-i');
    if (unlocked(i) && i !== sel) { sel = i; markSel(); }
  });
  function markSel() {
    var tiles = $('levelGrid').querySelectorAll('.mm-tile');
    for (var i = 0; i < tiles.length; i++) tiles[i].classList.toggle('sel', +tiles[i].getAttribute('data-i') === sel);
  }
  function moveSel(dx, dy) {
    var c = sel % 5, r = Math.floor(sel / 5);
    c = Math.max(0, Math.min(4, c + dx)); r = Math.max(0, Math.min(3, r + dy));
    var n = r * 5 + c;
    if (unlocked(n)) { sel = n; markSel(); MMA.click(); }
  }

  /* ------------------------------------------------------------ garage */
  var pv = $('preview'), pctx = pv.getContext('2d');
  function goGarage(from) {
    garageFrom = from;
    state = 'garage';
    if (!demo) startDemo();
    buildGarage();
    showOverlay('garage');
    MMA.silence();
  }
  var garageFrom = 'title';
  function buildGarage() {
    var ts = totalStars();
    function row(el, list, cur, kind) {
      var h = '';
      for (var i = 0; i < list.length; i++) {
        var it = list[i], lk = ts < it.cost;
        var bg = kind === 'paint' ? (it.rainbow ? 'linear-gradient(135deg,#ff3b3b,#ffd23f,#3ddc84,#2f8bff,#a45cff)' : 'linear-gradient(135deg,' + it.body + ' 55%,' + it.accent + ' 56%)')
          : 'linear-gradient(135deg,' + it.suit + ' 55%,' + it.helmet2 + ' 56%)';
        h += '<button type="button" class="mm-sw' + (lk ? ' locked' : '') + (i === cur ? ' cur' : '') + '" data-k="' + kind + '" data-i="' + i + '" title="' + it.name + '" style="background:' + bg + '">' +
          (lk ? '<span dir="ltr">🔒★' + it.cost + '</span>' : '') + '</button>';
      }
      el.innerHTML = h;
    }
    row($('paintRow'), PAINTS, save.paint, 'paint');
    row($('suitRow'), SUITS, save.suit, 'suit');
    $('paintName').textContent = PAINTS[save.paint].name;
    $('suitName').textContent = SUITS[save.suit].name;
    $('gStars').textContent = '★ ' + ts + ' من ' + NL * 3;
  }
  function garageClick(e) {
    var t = e.target.closest('.mm-sw');
    if (!t) return;
    var k = t.getAttribute('data-k'), i = +t.getAttribute('data-i');
    var it = (k === 'paint' ? PAINTS : SUITS)[i];
    if (totalStars() < it.cost) { MMA.bonk(); return; }
    if (k === 'paint') save.paint = i; else save.suit = i;
    persist(); curSkin = skin(); MMA.click(); buildGarage();
  }
  $('paintRow').addEventListener('click', garageClick);
  $('suitRow').addEventListener('click', garageClick);
  function drawPreview(t) {
    pctx.setTransform(2, 0, 0, 2, 0, 0);
    pctx.clearRect(0, 0, 420, 200);
    pctx.fillStyle = 'rgba(0,0,0,0.3)'; pctx.beginPath(); pctx.ellipse(210, 172, 120, 12, 0, 0, TAU); pctx.fill();
    pctx.save(); pctx.translate(210, 124); pctx.scale(1.4, 1.4);
    var bounce = Math.sin(t * 3) * 1.5, rot = t * 4;
    MMR.drawBike(pctx, { x: 0, y: bounce, a: Math.sin(t * 1.5) * 0.04, lean: Math.sin(t * 1.2) * 0.3, crouch: 0,
      wheels: [{ x: -44, y: 24, rot: rot }, { x: 46, y: 24, rot: rot }] }, curSkin, t);
    pctx.restore();
  }

  /* ---------------------------------------------------------- complete */
  var lastResult = null;
  function starsFor(i, t) { var s = MM.LEVELS[i].stars; return t <= s[0] ? 3 : t <= s[1] ? 2 : 1; }
  function showComplete() {
    state = 'complete';
    MMA.silence();
    var t = world.finalTime, i = levelIdx, st = starsFor(i, t);
    var before = totalStars();
    var prevBest = save.best[i], newBest = prevBest == null || t < prevBest - 0.0001;
    if (newBest) {
      save.best[i] = Math.round(t * 100) / 100;
      if (rec.length >= 6 && rec.length < GHOST_MAX * 3) store.set('ghost' + i, { d: rec });
    }
    save.stars[i] = Math.max(save.stars[i] | 0, st);
    save.flips += world.flips;
    persist();
    var after = totalStars();
    $('cTitle').textContent = i === NL - 1 ? '🏆 أنهيت كل المراحل! أنت بطل!' : 'أنهيت المرحلة!';
    $('cTime').textContent = fmt(t);
    $('cBest').innerHTML = newBest && prevBest != null ? '<span class="mm-best">رقم قياسي جديد!</span>' : (prevBest != null ? '<p class="mm-sub">أفضل وقت: ' + fmt(save.best[i]) + '</p>' : '');
    if (newBest && rec.length >= 6) $('cBest').innerHTML += '<p class="mm-sub">👻 العب مجددًا وسابق أفضل جولة لك!</p>';
    var info = [];
    if (world.flips) info.push('الشقلبات: ' + world.flips + ' (وفّرت ' + world.bonus + ' ث)');
    info.push('السقطات: ' + world.crashes);
    if (world.smashed) info.push('الصناديق: ' + world.smashed);
    $('cInfo').textContent = info.join('   ·   ');
    // unlocks
    var un = [];
    PAINTS.forEach(function (p) { if (p.cost > before && p.cost <= after) un.push('لون ' + p.name); });
    SUITS.forEach(function (p) { if (p.cost > before && p.cost <= after) un.push('بدلة ' + p.name); });
    var teaser = '';
    if (!un.length) {
      var nx = null;
      PAINTS.concat(SUITS).forEach(function (p) { if (p.cost > after && (!nx || p.cost < nx.cost)) nx = p; });
      if (nx) teaser = '<p class="mm-sub">🎁 الجائزة القادمة: <b>' + (nx.body ? 'لون ' : 'بدلة ') + nx.name + '</b> عند ★' + nx.cost + ' (معك ★' + after + ')</p>';
    }
    $('cUnlock').innerHTML = un.length ? '<div class="mm-unlock">🎁 جديد في المرآب: ' + un.join('، ') + '!</div>' : teaser;
    var s = MM.LEVELS[i].stars;
    $('cNext').textContent = st < 3 ? (st === 1 ? '★★ أقل من ' + fmt(s[1]) + '   ·   ★★★ أقل من ' + fmt(s[0]) : '★★★ أقل من ' + fmt(s[0]) + ' — الشقلبات توفّر الوقت!') : 'ممتاز! حصلت على 3 نجوم!';
    $('btnNext').textContent = i < NL - 1 ? 'التالي ◀' : '☰ المراحل';
    $('btnCLevels').hidden = i === NL - 1;
    $('cKeys').innerHTML = i < NL - 1 ? '<span class="sg-key">Enter</span> التالي &nbsp; <span class="sg-key">R</span> إعادة &nbsp; <span class="sg-key">Esc</span> المراحل'
      : '<span class="sg-key">Enter</span> المراحل &nbsp; <span class="sg-key">R</span> إعادة';
    var els = $('cStars').children;
    for (var k = 0; k < 3; k++) els[k].classList.remove('on');
    showOverlay('complete');
    for (k = 0; k < st; k++) {
      (function (k) {
        setTimeout(function () {
          if (state !== 'complete') return;
          els[k].classList.add('on'); MMA.star(k);
          for (var j = 0; j < 22; j++) part(640 + (k - 1) * 90, 200, (Math.random() - 0.5) * 700, -Math.random() * 500 - 100, 1.2, 10, ['#ffd23f', '#ff5ab4', '#3fb7ff', '#3ddc84'][j % 4], 3, 700);
        }, 350 + k * 330);
      })(k);
    }
    if (newBest && prevBest != null) setTimeout(function () { if (state === 'complete') Kit.sfx.power(); }, 350 + st * 330);
    if (un.length) setTimeout(function () { if (state === 'complete') MMA.unlock(); }, 500 + st * 330);
    lastResult = { stars: st, time: t, newBest: newBest };
  }
  function nextLevel() {
    if (levelIdx < NL - 1 && unlocked(levelIdx + 1)) startLevel(levelIdx + 1);
    else { sel = levelIdx; goLevels(); }
  }

  /* ------------------------------------------------------------ pause */
  function pause() {
    if (state !== 'play') return;
    state = 'paused';
    showOverlay('pause');
    MMA.silence();
  }
  function resume() {
    if (state !== 'paused') return;
    state = 'play';
    showOverlay(null);
    Kit.keys.reset();
    canvas.focus();
  }
  document.addEventListener('visibilitychange', function () { if (document.hidden) pause(); });
  window.addEventListener('blur', function () { if (state === 'play' && world && world.started && !world.finished) pause(); });

  /* --------------------------------------------------------- buttons */
  function btn(id, fn) {
    $(id).addEventListener('click', function (e) { e.currentTarget.blur(); MMA.click(); fn(); });
  }
  btn('btnPlay', function () { goLevels(); });
  btn('btnGarage', function () { goGarage('title'); });
  btn('btnLvBack', goTitle);
  btn('btnLvGarage', function () { goGarage('levels'); });
  btn('btnGarageBack', function () { if (garageFrom === 'levels') goLevels(); else goTitle(); });
  btn('btnResume', resume);
  btn('btnRestart', restartLevel);
  btn('btnPauseLevels', function () { sel = levelIdx; demo = false; startDemo(); goLevels(); });
  btn('btnNext', nextLevel);
  btn('btnRetry', function () { startLevel(levelIdx); });
  btn('btnCLevels', function () { sel = levelIdx; startDemo(); goLevels(); });
  $('pauseBtn').addEventListener('click', function (e) { e.currentTarget.blur(); pause(); });
  $('pauseBtn').addEventListener('pointerdown', function (e) { e.stopPropagation(); });

  window.addEventListener('keydown', function (e) {
    var c = e.code;
    if (e.repeat && c !== 'ArrowLeft' && c !== 'ArrowRight' && c !== 'ArrowUp' && c !== 'ArrowDown') return;
    var ok = c === 'Enter' || c === 'Space' || c === 'NumpadEnter';
    if (ok || c === 'Escape') e.preventDefault();
    if (state === 'title') {
      if (ok) { MMA.click(); goLevels(); } else if (c === 'KeyG') goGarage('title');
    } else if (state === 'levels') {
      // the level grid flows right-to-left (Arabic), so ← goes to the next level
      if (c === 'ArrowLeft' || c === 'KeyA') moveSel(1, 0);
      else if (c === 'ArrowRight' || c === 'KeyD') moveSel(-1, 0);
      else if (c === 'ArrowUp' || c === 'KeyW') moveSel(0, -1);
      else if (c === 'ArrowDown' || c === 'KeyS') moveSel(0, 1);
      else if (ok) { if (unlocked(sel)) { MMA.click(); startLevel(sel); } }
      else if (c === 'Escape' || c === 'Backspace') goTitle();
      else if (c === 'KeyG') goGarage('levels');
    } else if (state === 'garage') {
      if (ok || c === 'Escape') { if (garageFrom === 'levels') goLevels(); else goTitle(); }
    } else if (state === 'play') {
      if (c === 'KeyP' || c === 'Escape') pause();
      else if (c === 'KeyR') restartLevel();
    } else if (state === 'paused') {
      if (c === 'KeyP' || c === 'Escape' || ok) resume();
      else if (c === 'KeyR') restartLevel();
    } else if (state === 'complete') {
      if (ok) nextLevel();
      else if (c === 'KeyR') startLevel(levelIdx);
      else if (c === 'Escape') { sel = levelIdx; startDemo(); goLevels(); }
    }
  });
  canvas.addEventListener('pointerdown', function () { canvas.focus(); });

  /* ----------------------------------------------------------- events */
  var T = function () { return MMR.theme(); };
  function crateCols() { return MMR.themeId() === 'factory' ? ['#6f7aa3', '#3b4266', '#aab4d8'] : ['#d69a52', '#8a5a26', '#f0c080']; }
  function handleEvents(sound) {
    var ev = world.events, b = world.bike, th = T();
    for (var i = 0; i < ev.length; i++) {
      var e = ev[i];
      switch (e.type) {
        case 'start': if (sound) bigPop('انطلق!', '', '#5dff9d'); break;
        case 'land': {
          var k = Math.min(1, e.v / 1300);
          for (var w = 0; w < 2; w++) { var wh = b.wheels[w]; burst(wh.x, wh.y + 18, 6 + Math.round(k * 10), { colors: th.dust, speed: 160 + k * 200, angle: -Math.PI / 2, spread: 2.6, life: 0.6, size: 9, type: 1, g: -40, drag: 3 }); }
          if (e.v > 700) shake.add(3 + k * 6);
          crouch = Math.min(1, crouch + k);
          if (sound) MMA.land(e.v);
          if (e.air > 1.5) worldPop('طيران عالٍ!', b.x, b.y - 90, '#7ff0ff', 30);
          else if (e.perfect && !world.pendingFlip) worldPop('هبوط رائع!', b.x, b.y - 90, '#b8ff6a', 26);
          break;
        }
        case 'bump': if (sound) MMA.bump(); crouch = Math.min(1, crouch + 0.3); break;
        case 'flip': {
          var names = ['', '', ' مزدوجة', ' ثلاثية', ' رباعية', ' خارقة'];
          var nm = (e.dir === 'back' ? 'شقلبة خلفية' : 'شقلبة أمامية') + (e.n < names.length ? names[e.n] : ' خارقة') + '!';
          bigPop(nm, 'وفّرت ' + e.n + (e.n === 1 ? ' ثانية' : ' ث'), e.n > 1 ? '#ff5ab4' : '#ffd23f');
          bonusFlash = 1.2;
          burst(b.x, b.y - 40, 26 + e.n * 10, { colors: ['#ffd23f', '#ff5ab4', '#3fb7ff', '#3ddc84', '#fff'], speed: 520, life: 1.0, size: 11, type: 3, g: 500 });
          if (sound) MMA.flip(e.n);
          break;
        }
        case 'crash': {
          shake.add(12);
          burst(e.x, e.y, 14, { colors: ['#ffd23f', '#fff'], speed: 380, life: 0.8, size: 12, type: 2, g: 300 });
          burst(b.x, b.y + 20, 16, { colors: th.dust, speed: 260, life: 0.8, size: 12, type: 1, g: -30, drag: 3 });
          var words = e.why === 'spikes' ? ['آخ!', 'أوتش!'] : e.why === 'boulder' ? ['انبطحت!', 'بونك!'] : e.why === 'fall' ? ['أووه!'] : ['بونك!', 'أوف!', 'سقطة!', 'آخ!'];
          worldPop(words[Math.floor(Math.random() * words.length)], e.x, e.y - 60, '#ff5a5f', 52);
          if (sound) MMA.crash();
          break;
        }
        case 'respawn':
          burst(e.x, e.y, 20, { colors: ['#ffffff', '#dfe7ff'], speed: 260, life: 0.5, size: 14, type: 1, g: 0, drag: 4 });
          if (sound) MMA.respawn();
          break;
        case 'checkpoint':
          burst(e.x + 40, e.y - 130, 30, { colors: ['#3ddc84', '#ffd23f', '#ffffff'], speed: 420, life: 1.0, size: 10, type: 3, g: 500 });
          if (sound) { MMA.checkpoint(); bigPop('نقطة حفظ!', '', '#3ddc84'); }
          break;
        case 'finish':
          finishT = 0.001;
          for (var f = 0; f < 3; f++) burst(level.finishX + (f - 1) * 90, e.y - 250, 40, { colors: ['#ffd23f', '#ff5ab4', '#3fb7ff', '#3ddc84', '#ff5a5f'], speed: 600, life: 1.6, size: 12, type: 3, g: 420 });
          if (sound) { MMA.finish(); bigPop('وصلت!', fmt(world.finalTime), '#ffffff'); }
          break;
        case 'bounce':
          burst(e.x, e.y, 16, { colors: ['#ffffff', '#ffe0f0', '#ffd23f'], speed: 300, angle: -Math.PI / 2, spread: 2.4, life: 0.7, size: 7, type: 1, g: 200 });
          shake.add(3);
          if (sound) { MMA.bounce(); worldPop('بوينغ!', e.x, e.y - 80, '#ff9cf2', 32); }
          break;
        case 'boost':
          if (sound) { MMA.boost(); worldPop('تيربو!', b.x, b.y - 90, '#ffb21f', 36); }
          burst(b.x - 40, b.y + 20, 12, { colors: ['#ffb21f', '#ffe14d'], speed: 300, angle: Math.PI, spread: 0.8, life: 0.4, size: 7, g: 0 });
          break;
        case 'crate':
          burst(e.x, e.y, 10, { colors: crateCols(), speed: 300, life: 0.8, size: 8, g: 900 });
          if (sound) MMA.crate();
          break;
        case 'crateBreak':
          burst(e.x, e.y, 12, { colors: crateCols(), speed: 360, life: 0.9, size: 9, g: 1000 });
          if (sound) MMA.crateBreak();
          break;
        case 'creak': if (sound) MMA.creak(); break;
        case 'plank': if (sound) MMA.plank(); break;
        case 'thunk': if (sound) MMA.thunk(); shake.add(2); break;
        case 'boulder':
          shake.add(6);
          if (sound) { MMA.boulder(); bigPop('اهرب!!!', 'لا تتوقف!', '#ff5a5f'); }
          break;
        case 'boulderBreak':
          shake.add(10);
          burst(e.x, e.y, 30, { colors: MMR.themeId() === 'winter' ? ['#ffffff', '#dbeeff'] : ['#8e8f9c', '#a9aab6', '#5d5e6b'], speed: 600, life: 1.1, size: 14, g: 1000 });
          if (sound) { MMA.boulderBreak(); worldPop('نجوت!', e.x + 200, e.y - 120, '#3ddc84', 40); }
          break;
        case 'rumble': shake.add(Math.min(8, e.v / 150)); if (sound) MMA.rumble(); break;
        case 'thud': if (sound) MMA.thud(); break;
        case 'loop': if (sound) { MMA.loop(); worldPop('لفّة كاملة!', e.x, e.y - 40, '#7ff0ff', 40); } break;
        case 'wheelie': if (sound) { MMA.wheelie(); worldPop('على عجلة واحدة!', b.x, b.y - 100, '#b8ff6a', 32); } break;
        case 'lift': if (sound) MMA.lift(); break;
        case 'liftStop': if (sound) MMA.liftStop(); break;
      }
    }
  }

  /* ----------------------------------------------------------- update */
  var auto = false, chaser = null, stuckX = 0, stuckT = 0;
  function isOnLift() { for (var i = 0; i < world.movers.length; i++) if (world.movers[i].on) return true; return false; }
  var readInput = function () {
    if (auto) return MM.autopilot(world, { flips: true });
    var K = Kit.keys;
    var l = (K.anyDown(['ArrowRight', 'KeyD']) ? 1 : 0) - (K.anyDown(['ArrowLeft', 'KeyA']) ? 1 : 0);
    return { gas: K.anyDown(['ArrowUp', 'KeyW']), brake: K.anyDown(['ArrowDown', 'KeyS']), lean: l };
  };
  var lastInp = { gas: false, brake: false, lean: 0 };
  function update(dt) {
    clock += dt;
    if (state === 'play') {
      var inp = readInput();
      lastInp = inp;
      world.step(inp);
      recordGhost();
      handleEvents(true);
      emitTrail(inp);
      if (world.finished) {
        finishT += dt;
        if (finishT > 1.6) showComplete();
      }
      bannerT += dt;
      // "hurry" beep when a star time runs out
      var s = MM.LEVELS[levelIdx].stars, cur = world.time - world.bonus;
      if (world.started && !world.finished) {
        if ((prevTime <= s[0] && cur > s[0]) || (prevTime <= s[1] && cur > s[1])) { hurry = 1; MMA.bonk(); }
      }
      prevTime = cur;
      // stuck detection (for the "Press R" hint)
      if (Math.abs(world.bike.x - stuckX) > 60 || !world.started || world.finished || world.crashed || isOnLift()) { stuckX = world.bike.x; stuckT = 0; }
      else stuckT += dt;
      // still going nowhere after 6 s of trying: tumble off and go back to the last checkpoint
      if (stuckT > 6 && inp.gas) { world.crash('stuck'); stuckT = 0; }
      var b = world.bike;
      MMA.engine(!world.crashed || world.crashT > 1.2, b.wheels[0].s, inp.gas && !world.crashed && world.started, !world.grounded, dt);
    } else if (state === 'title' || state === 'levels' || state === 'garage') {
      var di = MM.autopilot(world, { flips: true });
      lastInp = di;
      world.step(di);
      handleEvents(false);
      emitTrail(di);
      for (var i = 0; i < world.events.length; i++) if (world.events[i].type === 'crash') demoCrashes++;
      if (world.finished) { finishT += dt; if (finishT > 1.5) startDemo(); }
      if (demoCrashes > 2) startDemo();
    } else if (state === 'complete') {
      world.step({});
    }
    if (state !== 'paused') {
      stepParticles(dt);
      updateCamera(dt);
      shake.update(dt);
      var tl = lastInp.lean || 0;
      lean += (tl - lean) * Math.min(1, dt * 10);
      crouch = Math.max(0, crouch - dt * 3);
      for (var p = pops.length - 1; p >= 0; p--) { pops[p].t += dt; if (pops[p].t > pops[p].life) pops.splice(p, 1); }
      for (p = wpops.length - 1; p >= 0; p--) { wpops[p].t += dt; if (wpops[p].t > wpops[p].life) wpops.splice(p, 1); }
      if (bonusFlash > 0) bonusFlash -= dt;
      if (hurry > 0) hurry -= dt;
    }
    Kit.keys.endFrame();
  }

  var trailT = 0;
  function emitTrail(inp) {
    var b = world.bike, th = T(), rw = b.wheels[0];
    if (world.crashed) return;
    var sp = Math.abs(b.vx);
    if (rw.air < 0.05) {
      var slip = Math.abs(rw.s - (rw.vx * -(rw.ny || -1) + rw.vy * (rw.nx || 0)));
      var n = (inp.gas ? (slip > 120 ? 2 : sp > 200 ? 0.6 : 0.3) : sp > 500 ? 0.25 : 0);
      trailT += n;
      while (trailT >= 1) {
        trailT -= 1;
        var col = th.dust[Math.floor(Math.random() * th.dust.length)];
        part(rw.x - 12, rw.y + 16, -80 - Math.random() * 140 - sp * 0.1, -40 - Math.random() * 120, 0.5 + Math.random() * 0.4, 7 + Math.random() * 7, col, 1, -60, 2.5);
        if (MMR.themeId() === 'factory' && Math.random() < 0.5) part(rw.x - 10, rw.y + 18, -200 - Math.random() * 200, -80 - Math.random() * 200, 0.35, 3, '#ffe14d', 0, 900);
      }
      if (rw.gk === 'i' && sp > 250 && Math.random() < 0.5) part(rw.x, rw.y + 18, -sp * 0.3, -100, 0.4, 5, '#ffffff', 0, 400);
    }
    // exhaust puffs
    if (inp.gas && Math.random() < 0.25) {
      var ca = Math.cos(b.a), sa = Math.sin(b.a), ex = b.x + (-56) * ca - (-4) * sa, ey = b.y + (-56) * sa + (-4) * ca;
      part(ex, ey, -60 * ca - Math.random() * 40, -30 - Math.random() * 30, 0.5, 5, 'rgba(200,200,210,0.7)', 1, -80, 2);
    }
  }

  function updateCamera(dt) {
    var b = world.bike, tx, ty;
    if (world.crashed && world.rider) { tx = (b.x + world.rider.x) / 2 + 120; ty = (b.y + world.rider.y) / 2 - 60; }
    else {
      tx = b.x + 190 + Kit.clamp(b.vx * 0.3, -260, 300);
      ty = b.y - 50 + Kit.clamp(b.vy * 0.14, -90, 170);
      if (demo) { tx += 90; ty -= 150; }
    }
    var sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
    var zt = Kit.clamp(0.98 - sp / 1500 * 0.16 - (world.grounded ? 0 : 0.04), 0.8, 0.98);
    // big air: pull back so the ground below stays in view
    if (!world.grounded && !world.crashed) {
      var gy = world.groundAt(b.x + b.vx * 0.3, b.y - 20);
      if (gy < 1e8) {
        var gap = gy - b.y;
        if (gap > 200) { zt = Math.min(zt, Kit.clamp(560 / (gap + 260), 0.6, 1)); ty = Math.max(ty, b.y + gap * 0.42); }
      }
    }
    // a boulder is chasing: pull back so you can see it coming
    chaser = null;
    for (var i = 0; i < world.rollers.length; i++) {
      var r = world.rollers[i];
      if (r.kind === 'boulder' && !r.dead && b.x - r.x < 1400 && b.x - r.x > -200) chaser = r;
    }
    if (chaser && !world.crashed) {
      var gapx = b.x - chaser.x;
      tx = Math.min(tx, (b.x + chaser.x) / 2 + 260);
      zt = Math.min(zt, Kit.clamp(1180 / (gapx + 820), 0.62, 1));
    }
    var kx = Math.min(1, dt * 5), ky = Math.min(1, dt * 4);
    cam.x += (tx - cam.x) * kx; cam.y += (ty - cam.y) * ky;
    cam.zoom += (zt - cam.zoom) * Math.min(1, dt * 1.5);
    // keep the bike on screen no matter what
    var hw = 640 / cam.zoom - 90, hh = 360 / cam.zoom - 90;
    cam.x = Kit.clamp(cam.x, b.x - hw, b.x + hw);
    cam.y = Kit.clamp(cam.y, b.y - hh, b.y + hh);
    cam.x = Math.max(cam.x, 640 / cam.zoom + 20);
  }

  /* ----------------------------------------------------------- render */
  function render() {
    if (!world || window.__noRender) return;
    var c = { x: cam.x + shake.x, y: cam.y + shake.y, zoom: cam.zoom };
    ctx.save();
    MMR.drawWorld(ctx, world, c, clock, curSkin, { lean: lean, crouch: crouch, beforeBike: drawGhost, afterBike: function (g) {
      drawParticles(g);
      // flip meter while spinning in the air
      var w = world, bk = w.bike;
      if (!w.grounded && !w.crashed && w.airT > 0.15) {
        var rot = bk.a - w.takeoffA, ar = Math.abs(rot);
        if (ar > 0.7) {
          var full = Math.floor((ar + 1.1) / TAU), part = ar - full * TAU;
          g.save(); g.translate(bk.x, bk.y - 10);
          g.globalAlpha = Math.min(1, (ar - 0.7) * 2);
          g.lineCap = 'round';
          g.strokeStyle = 'rgba(20,20,45,0.45)'; g.lineWidth = 10;
          g.beginPath(); g.arc(0, 0, 96, 0, TAU); g.stroke();
          var ok = full > 0;
          g.strokeStyle = ok ? '#5dff9d' : '#ffd23f'; g.lineWidth = 7;
          g.beginPath();
          if (rot < 0) g.arc(0, 0, 96, -Math.PI / 2, -Math.PI / 2 - Math.min(TAU - 0.01, ok ? part + 0.001 : ar), true);
          else g.arc(0, 0, 96, -Math.PI / 2, -Math.PI / 2 + Math.min(TAU - 0.01, ok ? part + 0.001 : ar));
          g.stroke();
          if (ok) {
            g.font = 'bold 30px Fredoka, sans-serif'; g.textAlign = 'center'; g.lineJoin = 'round';
            g.direction = 'ltr';
            g.lineWidth = 6; g.strokeStyle = '#1b1d3a'; g.strokeText('×' + full, 0, -108);
            g.fillStyle = '#5dff9d'; g.fillText('×' + full, 0, -108);
          }
          g.restore(); g.globalAlpha = 1;
        }
      }
      // world popups
      for (var i = 0; i < wpops.length; i++) {
        var p = wpops[i], k = p.t / p.life, sc = p.t < 0.15 ? 0.5 + p.t / 0.15 * 0.7 : 1.2 - Math.min(0.2, (p.t - 0.15));
        g.save(); g.translate(p.x, p.y - k * 60); g.scale(sc, sc);
        g.globalAlpha = k > 0.75 ? (1 - k) * 4 : 1;
        g.font = 'bold ' + p.size + 'px Fredoka, sans-serif'; g.textAlign = 'center'; g.direction = 'rtl';
        g.lineWidth = 7; g.strokeStyle = '#1b1d3a'; g.lineJoin = 'round'; g.strokeText(p.text, 0, 0);
        g.fillStyle = p.color; g.fillText(p.text, 0, 0);
        g.restore();
      }
      g.globalAlpha = 1;
    } });
    ctx.restore();
    if (state === 'play' || state === 'paused' || state === 'complete') drawHUD();
    else drawDemoHUD();
    drawBigPops();
    if (state === 'garage') drawPreview(clock);
  }

  function outlined(text, x, y, size, color, align, lw, dir) {
    ctx.font = 'bold ' + size + 'px Fredoka, sans-serif';
    ctx.textAlign = align || 'left'; ctx.direction = dir || 'rtl'; ctx.lineJoin = 'round';
    ctx.lineWidth = lw || 7; ctx.strokeStyle = 'rgba(20,20,45,0.9)'; ctx.strokeText(text, x, y);
    ctx.fillStyle = color || '#fff'; ctx.fillText(text, x, y);
  }
  function drawHUD() {
    var L = MM.LEVELS[levelIdx], w = world, cur = Math.max(0, w.time - w.bonus);
    if (w.finished) cur = w.finalTime;
    // timer
    var tcol = cur <= L.stars[0] ? '#ffffff' : cur <= L.stars[1] ? '#ffe9a8' : '#ffc0c0';
    var pulse = hurry > 0 ? 1 + hurry * 0.25 : 1;
    ctx.save(); ctx.translate(26, 62); ctx.scale(pulse, pulse);
    outlined(fmt(cur), 0, 0, 50, tcol, 'left', 9, 'ltr');
    ctx.restore();
    // star target
    var st = cur <= L.stars[0] ? 3 : cur <= L.stars[1] ? 2 : 1;
    var target = st === 3 ? L.stars[0] : st === 2 ? L.stars[1] : null;
    for (var i = 0; i < 3; i++) {
      ctx.fillStyle = 'rgba(20,20,45,0.9)'; MMR.star(ctx, 40 + i * 30, 94, 15, 'rgba(20,20,45,0.85)');
      MMR.star(ctx, 40 + i * 30, 94, 11, i < st ? '#ffd23f' : 'rgba(255,255,255,0.25)');
    }
    if (target != null) outlined('أقل من ' + fmt(target), 130, 102, 20, '#ffffff', 'left', 5);
    if (bonusFlash > 0 || w.bonus > 0) {
      ctx.globalAlpha = bonusFlash > 0 ? 1 : 0.8;
      outlined('الشقلبات وفّرت ' + w.bonus + ' ث', 26, 136, bonusFlash > 0 ? 24 : 18, '#b8ff6a', 'left', 5);
      ctx.globalAlpha = 1;
    }
    // progress bar
    var lv = w.level, px = 440, pw = 400, py = 26;
    var prog = Kit.clamp((w.bike.x - lv.start.x) / (lv.finishX - lv.start.x), 0, 1);
    ctx.fillStyle = 'rgba(20,20,45,0.6)'; MMR.rrect(ctx, px - 6, py - 6, pw + 12, 20, 10); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; MMR.rrect(ctx, px, py, pw, 8, 4); ctx.fill();
    ctx.fillStyle = '#3ddc84'; MMR.rrect(ctx, px, py, Math.max(8, pw * prog), 8, 4); ctx.fill();
    for (i = 0; i < lv.checkpoints.length; i++) {
      var cx = px + pw * (lv.checkpoints[i].x - lv.start.x) / (lv.finishX - lv.start.x);
      ctx.fillStyle = i <= w.cp ? '#3ddc84' : '#ff5a5f'; ctx.fillRect(cx - 2, py - 8, 4, 22);
    }
    ctx.fillStyle = '#fff'; ctx.fillRect(px + pw - 2, py - 10, 4, 26);
    ctx.fillStyle = '#1d1d24'; ctx.fillRect(px + pw + 2, py - 10, 12, 6); ctx.fillStyle = '#fff'; ctx.fillRect(px + pw + 2, py - 4, 12, 6);
    if (ghostX != null) { // your best run on the progress bar
      var gp = Kit.clamp((ghostX - lv.start.x) / (lv.finishX - lv.start.x), 0, 1);
      ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.arc(px + pw * gp, py + 4, 8, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(20,20,45,0.6)'; ctx.lineWidth = 2; ctx.stroke();
    }
    ctx.fillStyle = curSkin.rainbow ? '#ffd23f' : curSkin.body; ctx.beginPath(); ctx.arc(px + pw * prog, py + 4, 9, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
    // boulder warning when it is off the left edge
    if (chaser && !w.crashed) {
      var sx = (chaser.x - cam.x) * cam.zoom + 640;
      if (sx < -chaser.r * cam.zoom) {
        var sy = Kit.clamp((chaser.y - cam.y) * cam.zoom + 360, 160, 640), fl = Math.sin(clock * 16) > 0;
        ctx.fillStyle = fl ? '#ff3b3b' : '#ffd23f';
        ctx.beginPath(); ctx.moveTo(14, sy); ctx.lineTo(54, sy - 30); ctx.lineTo(54, sy + 30); ctx.closePath(); ctx.fill();
        outlined('!', 70, sy + 14, 42, fl ? '#ffd23f' : '#ff3b3b', 'center', 6, 'ltr');
      }
    }
    // level name
    var wi = Math.floor(levelIdx / 5) + 1, li = levelIdx % 5 + 1;
    outlined(wi + '-' + li + '  ' + L.name, 640, 64, 22, '#ffffff', 'center', 5);
    if (stuckT > 4 && state === 'play') {
      ctx.globalAlpha = 0.75 + 0.25 * Math.sin(clock * 6);
      ctx.fillStyle = 'rgba(15,18,45,0.72)'; MMR.rrect(ctx, 470, 600, 340, 56, 18); ctx.fill();
      outlined('عالق؟ اضغط R لتبدأ من جديد', 640, 637, 24, '#ffffff', 'center', 5);
      ctx.globalAlpha = 1;
    }
    // intro banner
    if (!w.started && state === 'play') {
      var a = 0.75 + 0.25 * Math.sin(clock * 6);
      ctx.fillStyle = 'rgba(15,18,45,0.72)'; MMR.rrect(ctx, 430, 520, 420, 90, 22); ctx.fill();
      outlined(wi + '-' + li + '  ' + L.name, 640, 558, 32, '#ffd23f', 'center', 7);
      ctx.globalAlpha = a;
      outlined('اضغط ↑ باستمرار لتنطلق!', 640, 594, 24, '#ffffff', 'center', 5);
      ctx.globalAlpha = 1;
    }
  }
  function drawDemoHUD() { }
  function drawBigPops() {
    for (var i = 0; i < pops.length; i++) {
      var p = pops[i], k = p.t / p.life;
      var sc = p.t < 0.18 ? 0.3 + (p.t / 0.18) * 1.0 : p.t < 0.3 ? 1.3 - (p.t - 0.18) / 0.12 * 0.3 : 1;
      var y = 200 + i * 10 - (k > 0.7 ? (k - 0.7) * 120 : 0);
      ctx.save(); ctx.translate(640, y); ctx.scale(sc, sc); ctx.rotate(-0.04);
      ctx.globalAlpha = k > 0.8 ? (1 - k) * 5 : 1;
      outlined(p.text, 0, 0, 64, p.color, 'center', 12);
      if (p.sub) outlined(p.sub, 0, 46, 34, '#ffffff', 'center', 7);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  /* ------------------------------------------------------------- boot */
  startDemo();
  goTitle();
  var perf = { u: 0, r: 0 };
  Kit.loop(function (dt) { var t0 = performance.now(); update(dt); perf.u = perf.u * 0.95 + (performance.now() - t0) * 0.05; },
    function () { var t0 = performance.now(); render(); perf.r = perf.r * 0.95 + (performance.now() - t0) * 0.05; });

  // debug hook for automated checks
  window.__game = {
    get state() { return state; },
    get level() { return levelIdx; },
    get world() { return world; },
    get save() { return save; },
    perf: perf,
    // fast-forward n fixed steps (for headless tests); keys: {gas,brake,lean} overrides input while stepping
    step: function (n, keys) { var sv = readInput; if (keys) readInput = function () { return keys; }; for (var i = 0; i < (n | 0); i++) update(1 / 60); readInput = sv; },
    start: function (i) { startLevel(i | 0); },
    set auto(v) { auto = !!v; },
    get auto() { return auto; },
    finish: function () { if (state === 'play') { var x = world.level.finishX - 90; world.placeBike(x, world.groundAt(x, -1e9, true) - 44, 0); world.bike.vx = 300; world.started = true; } },
    unlockAll: function () { for (var i = 0; i < NL; i++) save.stars[i] = Math.max(save.stars[i] | 0, 3); persist(); curSkin = skin(); },
    get ghost() { return ghost; },
    reset: function () { save = { stars: [], best: [], paint: 0, suit: 0, flips: 0 }; persist(); for (var i = 0; i < NL; i++) store.remove('ghost' + i); ghost = null; curSkin = skin(); }
  };
})();
