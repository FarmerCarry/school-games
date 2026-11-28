/*
 * Drift King — game flow, input, effects, HUD, shop, missions, gifts, saving.
 */
(function () {
  'use strict';
  var DK = window.DK;
  var M = Math, abs = M.abs, min = M.min, max = M.max, flr = M.floor, sin = M.sin, cos = M.cos, PI = M.PI; function ran() { return M.random(); }

  var W = 1280, H = 720;
  var store = Kit.store('drift-king');
  var GIFT_MS = 8 * 60 * 1000;

  /* ------------------------------------------------------------- save */
  function savedNumber(value, fractional) {
    var n = typeof value === 'number' || typeof value === 'string' ? Number(value) : 0;
    if (!isFinite(n) || n < 0) return 0;
    n = min(n, Number.MAX_SAFE_INTEGER);
    return fractional ? n : flr(n);
  }
  function savedIds(value, known) {
    return Array.isArray(value) ? value.filter(function (id, i) {
      return typeof id === 'string' && known.indexOf(id) >= 0 && value.indexOf(id) === i;
    }) : [];
  }
  function normalizeSave(data) {
    var owned = savedIds(data.owned, DK.CARS.map(function (car) { return car.id; }));
    if (owned.indexOf('red') < 0) owned.unshift('red');
    return {
      v: 1,
      best: savedNumber(data.best), bestDist: savedNumber(data.bestDist, true),
      coins: savedNumber(data.coins), owned: owned,
      car: owned.indexOf(data.car) >= 0 ? data.car : 'red',
      runs: savedNumber(data.runs),
      done: savedIds(data.done, MISSIONS.map(function (m) { return m.id; })),
      giftAt: savedNumber(data.giftAt), gems: savedNumber(data.gems)
    };
  }
  function loadSave() {
    var data = store.get('save', null);
    if (!data || typeof data !== 'object' || Array.isArray(data) || data.v !== 1) {
      data = {};
      ['best', 'bestDist', 'coins', 'owned', 'car', 'runs', 'done', 'giftAt', 'gems'].forEach(function (key) {
        data[key] = store.get(key, null);
      });
    }
    return normalizeSave(data);
  }
  // A single setItem is atomic. Legacy keys remain untouched: a failed first
  // write cannot damage old progress; after success this record is authoritative.
  // Every write is the whole record, so one confirmed write clears the warning.
  // A rejected purchase (commitSave) changes nothing and has its own toast.
  var saveStatus = Kit.saveStatus({ retry: function () { persist(); } });
  function persist(next) {
    var ok = store.set('save', next || save);
    if (ok) saveStatus.saved(); else if (!next) saveStatus.failed();
    return ok;
  }
  function commitSave(next) {
    if (!persist(next)) return false;
    for (var key in next) save[key] = next[key];
    return true;
  }

  /* ---------------------------------------------------------- missions */
  var MISSIONS = [
    { id: 's150', text: 'اجمع 150 نقطة في جولة', type: 'score', n: 150, r: 25 },
    { id: 'c10', text: 'اجمع 10 عملات في جولة', type: 'coins', n: 10, r: 25 },
    { id: 'p3', text: '3 انعطافات ممتازة متتالية', type: 'combo', n: 3, r: 30 },
    { id: 'j1', text: 'اقفز من فوق منحدر', type: 'jumps', n: 1, r: 30 },
    { id: 's400', text: 'اجمع 400 نقطة في جولة', type: 'score', n: 400, r: 40 },
    { id: 'r5', text: 'العب 5 جولات', type: 'runs', n: 5, r: 30 },
    { id: 'z2', text: 'انطلق حتى الغروب الذهبي', type: 'zone', n: 2, r: 50 },
    { id: 'c25', text: 'اجمع 25 عملة في جولة', type: 'coins', n: 25, r: 50 },
    { id: 'p6', text: '6 انعطافات ممتازة متتالية', type: 'combo', n: 6, r: 60 },
    { id: 'buy', text: 'اشترِ سيارة جديدة', type: 'cars', n: 2, r: 40, noCount: true },
    { id: 's800', text: 'اجمع 800 نقطة في جولة', type: 'score', n: 800, r: 80 },
    { id: 'g1', text: 'اجمع جوهرة زرقاء', type: 'gems', n: 1, r: 40 },
    { id: 'j4', text: '4 قفزات في جولة واحدة', type: 'jumps', n: 4, r: 70 },
    { id: 'z3', text: 'انطلق حتى الشفق البنفسجي', type: 'zone', n: 3, r: 90 },
    { id: 'p10', text: '10 انعطافات ممتازة متتالية', type: 'combo', n: 10, r: 100 },
    { id: 's1500', text: 'اجمع 1500 نقطة في جولة', type: 'score', n: 1500, r: 150 },
    { id: 'c50', text: 'اجمع 50 عملة في جولة', type: 'coins', n: 50, r: 120 },
    { id: 'z4', text: 'انطلق حتى ليل النجوم', type: 'zone', n: 4, r: 150 },
    { id: 'r30', text: 'العب 30 جولة', type: 'runs', n: 30, r: 120 },
    { id: 'p15', text: '15 انعطافًا ممتازًا متتاليًا', type: 'combo', n: 15, r: 180 },
    { id: 's2500', text: 'اجمع 2500 نقطة في جولة', type: 'score', n: 2500, r: 250 },
    { id: 'cars6', text: 'امتلك 6 سيارات', type: 'cars', n: 6, r: 200 },
    { id: 'z5', text: 'انطلق حتى فجر الحلوى', type: 'zone', n: 5, r: 250 },
    { id: 's4000', text: 'اجمع 4000 نقطة في جولة', type: 'score', n: 4000, r: 400 }
  ];
  var save = loadSave();
  function activeMissions() {
    var out = [];
    for (var k = 0; k < MISSIONS.length && out.length < 3; k++) if (save.done.indexOf(MISSIONS[k].id) < 0) out.push(MISSIONS[k]);
    return out;
  }
  function missionValue(m, st) {
    switch (m.type) {
      case 'score': return st ? st.score : 0;
      case 'coins': return st ? st.coins : 0;
      case 'combo': return st ? st.maxCombo : 0;
      case 'jumps': return st ? st.jumps : 0;
      case 'zone': return st ? st.zone : 0;
      case 'gems': return st ? st.gems : 0;
      case 'runs': return save.runs;
      case 'cars': return save.owned.length;
    }
    return 0;
  }
  function checkMissions(st, quiet) {
    var act = activeMissions(), got = [];
    for (var k = 0; k < act.length; k++) {
      var m = act[k];
      if (missionValue(m, st) >= m.n) {
        save.done.push(m.id);
        save.coins += m.r;
        if (st) st.missionCoins += m.r;
        persist();
        got.push(m.id);
        if (!quiet) toast('مهمة مكتملة! <span dir="ltr">+' + m.r + '</span>', true);
        DK.snd.mission();
      }
    }
    return got;
  }
  function missionHTML(list, st, just) {
    return list.map(function (m) {
      var v = min(m.n, missionValue(m, st));
      var done = save.done.indexOf(m.id) >= 0;
      var pct = done ? 100 : M.round(v / m.n * 100);
      return '<div class="mis' + (done ? ' done' : '') + (just && just.indexOf(m.id) >= 0 ? ' just' : '') + '"><span class="chk"></span><div class="mt">' + m.text +
        (m.n > 1 && !done && m.type !== 'zone' && !m.noCount ? ' <span dir="ltr">(' + v + '/' + m.n + ')</span>' : '') +
        '<div class="mb"><i style="width:' + pct + '%"></i></div></div><span class="mr"><i class="coin sm"></i><span dir="ltr">' + (done ? '+' : '') + m.r + '</span></span></div>';
    }).join('');
  }

  /* ------------------------------------------------------------ canvas */
  function $(id) { return document.getElementById(id); }
  function setT(id, v) { $(id).textContent = v; }
  var canvas = $('c');
  var ui = $('ui');
  var view = Kit.fit(canvas, W, H, {
    onResize: function (v) {
      var r = canvas.style;
      ui.style.left = r.left; ui.style.top = r.top;
      ui.style.transform = 'scale(' + v.scale + ')';
      stillMode = null;   // resizing cleared the canvas
    }
  });
  view.resize();
  var ctx = view.ctx;
  // Confetti gets its own layer above the DOM panels, so the big rewards
  // (new best, gift, new car) rain over the panel instead of behind it.
  // Small flat pieces need no HiDPI pixels.
  var fxCanvas = $('fx');
  var fxView = Kit.fit(fxCanvas, W, H, { maxDpr: 1 }), fx = fxView.ctx;
  canvas.addEventListener('contextrestored', view.resize);
  fxCanvas.addEventListener('contextrestored', fxView.resize);
  var muteBtn = Kit.muteButton();
  muteBtn.setAttribute('aria-label', 'تشغيل الصوت أو كتمه');
  muteBtn.title = 'الصوت (M)';

  /* ------------------------------------------------------------- state */
  var G = {
    mode: 'title', time: 0, road: null, car: null, model: DK.carById(save.car),
    cam: { x: 0, y: 0, S: 50 }, shake: Kit.shake(), parts: [], popups: [],
    skids: { d: new Float32Array(900 * 4), cap: 900, n: 0, head: 0 },
    carVis: { yaw: PI, pitch: 0, roll: 0, sq: 1, sqv: 0 },
    skyDist: 0, bestFlag: null, groundUnder: true, pal: null, turbo: 0, ghost: null, run: null
  };
  window.__game = G;
  var run = null;          // per-run stats
  var GHOST_HZ = 5, GHOST_MAX = 600, ghostRec = [], ghostData = null;
  function loadGhost() {
    var g = store.get('ghost', null);
    ghostData = g && Array.isArray(g.d) && g.d.length >= 4 && g.d.length % 2 === 0 ? g : null;
  }
  var armed = false;       // hold input must be released once after start
  var mouseDown = false;
  var overT = 0, fallT = 0, poofed = false;
  var lastRear = [null, null];
  var flash = 0, bannerT = 0, bannerText = '', bannerSub = '';
  var hudPop = 0, comboPop = 0;
  var confetti = [];
  var BANNER_T = 1.8;
  Kit.motion.onChange(function (reduced) { if (reduced) { confetti.length = 0; flash = 0; } });

  // particle pool
  for (var pi = 0; pi < 320; pi++) G.parts.push({ life: 0 });
  var pNext = 0;
  function spawn(x, y, z, vx, vy, vz, life, size, grow, col, type, extra) {
    var q = G.parts[pNext]; pNext = (pNext + 1) % G.parts.length;
    q.x = x; q.y = y; q.z = z; q.vx = vx; q.vy = vy; q.vz = vz; q.life = life; q.max = life;
    q.size = size; q.grow = grow; q.col = col; q.type = type || 0; q.rot = ran() * 6; q.alpha = extra || 0.8;
    q.g = type === 2 ? -6 : (type === 4 ? 1.5 : 0.6);
    return q;
  }

  function newWorld(seed) {
    G.road = new DK.Road(seed);
    G.car = new DK.Car();
    G.cam.x = 0; G.cam.y = 0;
    G.skids.n = 0; G.skids.head = 0;
    lastRear[0] = lastRear[1] = null;
    for (var k = 0; k < G.parts.length; k++) G.parts[k].life = 0;
    G.popups.length = 0;
    G.carVis.yaw = PI; G.carVis.pitch = 0; G.carVis.roll = 0; G.carVis.sq = 1; G.carVis.sqv = 0;
    G.skyDist = 0;
    snapCam();
  }
  function snapCam() {
    var c = G.car;
    G.cam.x = c.x - 1.5; G.cam.y = c.y;
  }

  /* ------------------------------------------------------------- input */
  window.addEventListener('pointerdown', function (e) {
    if (e.button !== 0) return;
    if (e.target && e.target.closest && e.target.closest('button, .gcard, .giftbox, .panel')) return;
    mouseDown = true;
    try { canvas.focus({ preventScroll: true }); } catch (er) { /* ignore */ }
  });
  window.addEventListener('pointerup', function () { mouseDown = false; });
  function holdInput() { return Kit.keys.down('Space') || mouseDown; }

  /* -------------------------------------------------------------- DOM */
  var el = {
    title: $('title'), garage: $('garage'), pause: $('pause'), over: $('over'), gift: $('gift'),
    btnPause: $('btnPause'), toast: $('toast')
  };
  function show(node, on) { node.hidden = !on; }
  function click(id, fn) {
    var b = $(id);
    b.addEventListener('click', function (e) { e.stopPropagation(); Kit.audio.unlock(); DK.snd.click(); fn(); if (e.detail > 0) b.blur(); });
  }
  var toastTimer = 0;
  function toast(text, coin) {
    el.toast.classList.toggle('top', G.mode === 'garage');
    el.toast.innerHTML = (coin ? '<i class="coin sm"></i>' : '') + text;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.classList.remove('show'); }, 2200);
  }

  function refreshTitle() {
    setT('tBest', Kit.fmt(save.best));
    setT('tCoins', Kit.fmt(save.coins));
    $('tMissions').innerHTML = missionHTML(activeMissions(), null);
    $('garageBadge').hidden = !canAffordNew();
    refreshGift();
  }
  function canAffordNew() {
    for (var k = 0; k < DK.CARS.length; k++) {
      var c = DK.CARS[k];
      if (save.owned.indexOf(c.id) < 0 && c.price <= save.coins) return true;
    }
    return false;
  }
  function giftReady() { return Date.now() - save.giftAt >= GIFT_MS; }
  function refreshGift() {
    var b = $('btnGift'), lbl = $('giftLabel');
    if (giftReady()) { b.classList.add('ready'); b.classList.remove('wait'); lbl.textContent = 'هدية مجانية!'; }
    else {
      b.classList.remove('ready'); b.classList.add('wait');
      var ms = GIFT_MS - (Date.now() - save.giftAt), m = flr(ms / 60000), s = flr(ms / 1000) % 60;
      lbl.innerHTML = 'هدية بعد <span dir="ltr">' + m + ':' + (s < 10 ? '0' : '') + s + '</span>';
    }
  }
  setInterval(function () { if (G.mode === 'title') refreshGift(); }, 1000);

  /* ------------------------------------------------------------ flow */
  function toTitle() {
    clearTimeout(overTimer);
    G.mode = 'title';
    DK.snd.stopEngine();
    show(el.title, true); show(el.over, false); show(el.pause, false); show(el.garage, false); show(el.gift, false);
    show(el.btnPause, false);
    G.model = DK.carById(save.car);
    G.turbo = 0; G.ghost = null; G.run = null;
    newWorld((ran() * 1e9) | 0);
    refreshTitle();
  }

  function startRun() {
    Kit.audio.unlock();
    // a quick replay must not bring the results celebration onto the new road
    clearTimeout(overTimer); confetti.length = 0;
    show(el.title, false); show(el.over, false); show(el.pause, false); show(el.garage, false); show(el.gift, false);
    show(el.btnPause, true);
    G.model = DK.carById(save.car);
    newWorld((ran() * 1e9) | 0);
    G.mode = 'play';
    // play stats: each run is a round; the hold/release coach starts on a fresh save
    Kit.stats.round('run');
    if (!save.runs && save.best < 60) Kit.stats.tutorial('start');
    run = { score: 0, bonus: 0, coins: 0, gems: 0, combo: 0, maxCombo: 0, cleanChain: 0, turbo: 0, mult: 1, multAcc: 0, prevProg: 0, t: 0,
      perfects: 0, jumps: 0, zone: 0, corners: 0, missionCoins: 0, beatBest: false, coinStreak: 0, coinStreakT: 0 };
    G.run = run; G.turbo = 0; ghostRec = []; loadGhost();
    G.ghost = ghostData ? { x: 0, y: 0, z: 0, yaw: DK.ANG[0], vis: false, model: DK.carById(ghostData.car) } : null;
    armed = !holdInput();
    overT = 0; fallT = 0; poofed = false; bannerT = 0;
    G.bestFlag = null;
    DK.snd.startEngine(G.model.pitch);
    DK.snd.start();
    canvas.focus({ preventScroll: true });
  }

  function pauseGame() {
    if (G.mode !== 'play') return;
    G.mode = 'paused';
    DK.snd.stopEngine(true);
    show(el.pause, true);
    confetti.length = 0;   // frozen pieces would sit on the pause buttons
    persist();
  }
  // Restart/Menu from the pause screen keep a record the run already beat.
  // Runs and missions still count only at game over (no farming by restarting).
  function bankPausedRun() {
    if (G.mode !== 'paused' || !run || !G.car) return;
    run.score = flr(G.car.progress) + run.bonus;
    if (run.score <= save.best && G.car.progress <= save.bestDist) return;
    save.best = max(save.best, run.score);
    save.bestDist = max(save.bestDist, G.car.progress);
    persist();
  }
  function resumeGame() {
    if (G.mode !== 'paused') return;
    show(el.pause, false);
    G.mode = 'play';
    armed = !holdInput();
    DK.snd.startEngine(G.model.pitch);
  }

  var overMissions = [], overTimer = 0;
  var FALL_TITLES = ['إلى الغيوم!', 'طِرتَ بعيدًا!', 'أوووه!', 'بوووم في الغيوم!', 'انزلاق أكثر من اللازم!'];
  function gameOver() {
    G.mode = 'over';
    // a mission toast from the last seconds of the run would cover the panel's buttons
    clearTimeout(toastTimer); el.toast.classList.remove('show');
    overT = 0;
    show(el.btnPause, false);
    var st = run;
    st.score = flr(G.car.progress) + st.bonus;
    Kit.stats.end('end', st.score);
    save.runs++;
    var prevBest = save.best, prevDist = save.bestDist;
    // Celebrate a new best, but not a tiny first score of a few points.
    var newBest = st.score > save.best && (prevBest > 0 ? true : st.score >= 30);
    if (st.score > save.best) save.best = st.score;
    if (G.car.progress > save.bestDist) save.bestDist = G.car.progress;
    overMissions = activeMissions();
    var justDone = checkMissions(st, true);
    persist();
    if ((st.score > prevBest || G.car.progress > prevDist) && ghostRec.length >= 4) {
      store.set('ghost', { d: ghostRec, car: save.car });
    }
    setT('oTitle', FALL_TITLES[(ran() * FALL_TITLES.length) | 0]);
    setT('oScore', '0');
    setT('oDist', flr(G.car.progress));
    setT('oPerf', st.perfects);
    setT('oCombo', st.maxCombo);
    setT('oCoins', '+' + (st.coins + st.missionCoins));
    var ob = $('oBest');
    ob.classList.remove('close');
    if (newBest) ob.textContent = prevBest > 0 ? 'الرقم السابق: ' + Kit.fmt(prevBest) : 'أول رقم قياسي لك!';
    else if (st.score >= save.best * 0.75 && save.best - st.score > 0) {
      ob.textContent = 'قريب جدًا! ينقصك ' + Kit.fmt(save.best - st.score + 1) + ' نقطة فقط';
      ob.classList.add('close');
    } else ob.textContent = 'الأفضل: ' + Kit.fmt(save.best);
    show($('oRibbon'), newBest);
    document.querySelector('.panel.over').classList.toggle('nb', newBest);
    renderNextCar();
    $('oMissions').innerHTML = missionHTML(overMissions, st, justDone);
    show(el.over, true);
    DK.snd.stopEngine();
    if (newBest) {
      overTimer = setTimeout(function () { DK.snd.best(); burstConfetti(90, 'top'); }, 350);
    } else overTimer = setTimeout(function () { Kit.sfx.lose(); }, 150);
    countUp($('oScore'), st.score, 700);
  }
  function countUp(node, target, ms) {
    var t0 = performance.now();
    function f() {
      var k = min(1, (performance.now() - t0) / ms);
      node.textContent = Kit.fmt(target * (1 - M.pow(1 - k, 3)));
      if (k < 1 && G.mode === 'over') requestAnimationFrame(f); else node.textContent = Kit.fmt(target);
    }
    f();
  }

  /* ---------------------------------------------------------- garage */
  // Screen-space bounds of a car model (at S = 1) over a full turn, so a
  // preview can be scaled to fit its canvas whatever the car's shape.
  var boundsCache = {};
  function carBounds(car) {
    if (boundsCache[car.id]) return boundsCache[car.id];
    var I = DK.ISO, b = { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 }, zh = car.hover ? 0.15 : 0;
    function add(x, y, z, r) {
      for (var a = 0; a < 12; a++) {
        var yaw = a / 12 * PI * 2, cy = cos(yaw), sy = sin(yaw);
        var X = cy * x - sy * y, Y = sy * x + cy * y;
        var px = (X - Y) * I.PX, py = (X + Y) * I.PY - (z + zh) * I.PZ;
        if (px - r < b.x0) b.x0 = px - r; if (px + r > b.x1) b.x1 = px + r;
        if (py - r < b.y0) b.y0 = py - r; if (py + r > b.y1) b.y1 = py + r;
      }
    }
    car.parts.forEach(function (p) {
      if (p.t === 'b') add(p.c[0], p.c[1], p.c[2], p.r);
      else p.v.forEach(function (v) { add(v[0], v[1], v[2], 0); });
    });
    b.y1 = max(b.y1, 0.5);   // leave room for the ground shadow
    boundsCache[car.id] = b;
    return b;
  }
  var PREVIEW_YAW = 0.2;
  function drawPreview(cv, car, yaw) {
    var c2 = cv.getContext('2d');
    c2.setTransform(1, 0, 0, 1, 0, 0);
    c2.clearRect(0, 0, cv.width, cv.height);
    var b = carBounds(car);
    var S = min(cv.width * 0.9 / (b.x1 - b.x0), cv.height * 0.9 / (b.y1 - b.y0));
    var ox = cv.width / 2 - (b.x0 + b.x1) / 2 * S, oy = cv.height / 2 - (b.y0 + b.y1) / 2 * S;
    c2.fillStyle = 'rgba(60,30,100,0.15)';
    c2.beginPath(); c2.ellipse(ox, oy + S * 0.1, S * 1.0, S * 0.42, 0, 0, PI * 2); c2.fill();
    DK.drawCar(c2, car, { x: ox, y: oy, S: S, yaw: yaw, pitch: 0, roll: 0, sq: 1, z: car.hover ? 0.15 : 0 });
  }
  var gCards = [];
  var gYaw = 0.2;
  function buildGarage() {
    var grid = $('grid');
    grid.innerHTML = '';
    gCards = [];
    DK.CARS.forEach(function (car) {
      var d = document.createElement('div');
      d.className = 'gcard';
      d.innerHTML = '<canvas width="340" height="240"></canvas><div class="gname">' + car.name + '</div><div class="gact"></div>';
      d.addEventListener('click', function (e) { e.stopPropagation(); garageClick(car); });
      grid.appendChild(d);
      gCards.push({ car: car, node: d, cv: d.querySelector('canvas') });
    });
  }
  function refreshGarage() {
    $('gCoins').textContent = Kit.fmt(save.coins);
    gCards.forEach(function (g) {
      var owned = save.owned.indexOf(g.car.id) >= 0, sel = save.car === g.car.id;
      g.node.classList.toggle('sel', sel);
      g.node.classList.toggle('locked', !owned);
      var act = g.node.querySelector('.gact');
      if (sel) act.innerHTML = '<div class="owned">✔ مختارة</div>';
      else if (owned) act.innerHTML = '<div class="owned">اختر</div>';
      else act.innerHTML = '<button class="nbtn ' + (save.coins >= g.car.price ? 'gold' : 'ghost') + '" type="button"><i class="coin"></i><span dir="ltr">' + Kit.fmt(g.car.price) + '</span></button>';
      drawPreview(g.cv, g.car, sel ? gYaw : PREVIEW_YAW);
    });
  }
  function garageClick(car) {
    Kit.audio.unlock();
    var owned = save.owned.indexOf(car.id) >= 0;
    var next = normalizeSave(save);
    next.car = car.id;
    if (owned) {
      if (!commitSave(next)) { DK.snd.deny(); toast('تعذّر حفظ الاختيار. حاول مرة أخرى.'); return; }
      G.model = car; DK.snd.click(); refreshGarage();
      return;
    }
    if (save.coins >= car.price) {
      next.coins -= car.price; next.owned.push(car.id);
      if (!commitSave(next)) {
        DK.snd.deny(); toast('تعذّر الحفظ. لم تُخصم العملات، حاول مرة أخرى.');
        return;
      }
      G.model = car; DK.snd.buy(); toast('سيارة جديدة: ' + car.name + '!');
      burstConfetti(60, 'top');
      checkMissions(null);
      refreshGarage();
    } else {
      DK.snd.deny();
      toast('تحتاج ' + Kit.fmt(car.price - save.coins) + ' عملة أخرى', true);
    }
  }
  var garageFrom = 'title';
  function openGarage(from) {
    garageFrom = from;
    if (!gCards.length) buildGarage();
    show(el.title, false); show(el.over, false);
    show(el.garage, true);
    refreshGarage();
    G.mode = 'garage';
  }
  function closeGarage() {
    show(el.garage, false);
    if (garageFrom === 'over') { G.mode = 'over'; overT = 1; show(el.over, true); refreshOverAfterGarage(); }
    else { G.mode = 'title'; show(el.title, true); refreshTitle(); }
  }
  function refreshOverAfterGarage() {
    // a car bought in the garage may have completed a mission
    $('oMissions').innerHTML = missionHTML(overMissions, run);
    renderNextCar();
  }
  // "Next car" progress block on the game-over panel.
  function renderNextCar() {
    var nx = null;
    for (var k = 0; k < DK.CARS.length; k++) if (save.owned.indexOf(DK.CARS[k].id) < 0) { nx = DK.CARS[k]; break; }
    var on = $('oNext');
    if (!nx) { on.innerHTML = ''; return; }
    var ready = save.coins >= nx.price;
    var pct = min(100, M.round(save.coins / nx.price * 100));
    on.classList.toggle('ready', ready);
    on.innerHTML = '<canvas width="220" height="140"></canvas><div class="ntxt">' +
      (ready ? 'يمكنك شراء «' + nx.name + '» الآن!' : 'السيارة التالية: «' + nx.name + '»') +
      '<div class="nbar"><i style="width:' + pct + '%"></i></div></div>' +
      '<div style="font-weight:700;direction:ltr;white-space:nowrap"><i class="coin sm"></i> ' + Kit.fmt(min(save.coins, nx.price)) + ' / ' + Kit.fmt(nx.price) + '</div>';
    drawPreview(on.querySelector('canvas'), nx, PREVIEW_YAW);
  }

  /* ------------------------------------------------------------- gift */
  var giftOpened = false;
  function openGift() {
    if (!giftReady()) { DK.snd.deny(); toast('الهدية القادمة قريبًا!'); return; }
    giftOpened = false;
    $('giftBox').classList.remove('open');
    show($('giftAmount'), false); show($('btnGiftOk'), false); show($('giftHint'), true);
    $('giftTitle').textContent = 'صندوق هدايا!';
    show(el.title, false); show(el.gift, true);
    G.mode = 'gift';
  }
  function crackGift() {
    if (giftOpened) return;
    giftOpened = true;
    var amt = 30 + flr(ran() * 6) * 10;
    if (ran() < 0.15) amt = 150;
    save.coins += amt; save.giftAt = Date.now(); persist();
    $('giftBox').classList.add('open');
    $('giftTitle').textContent = amt >= 150 ? 'جائزة كبرى!' : 'رائع!';
    var ga = $('giftAmount');
    ga.querySelector('span').textContent = '+' + amt;
    show(ga, true); show($('giftHint'), false); show($('btnGiftOk'), true);
    DK.snd.gift();
    burstConfetti(80, 'top');
  }
  $('giftBox').addEventListener('click', function (e) { e.stopPropagation(); Kit.audio.unlock(); crackGift(); });
  function closeGift() {
    show(el.gift, false); show(el.title, true); G.mode = 'title'; refreshTitle();
  }

  click('btnPlay', startRun);
  click('btnGarage', function () { openGarage('title'); });
  click('btnGift', openGift);
  click('btnGiftOk', closeGift);
  click('btnGarageClose', closeGarage);
  click('btnPause', pauseGame);
  click('btnResume', resumeGame);
  click('btnRestart', function () { bankPausedRun(); startRun(); });
  click('btnMenu', function () { bankPausedRun(); toTitle(); });
  click('btnAgain', startRun);
  click('btnOverGarage', function () { openGarage('over'); });
  click('btnOverMenu', toTitle);
  ['btnPause'].forEach(function (id) { $(id).addEventListener('pointerdown', function (e) { e.stopPropagation(); }); });

  /* ------------------------------------------------------- effects */
  function popup(text, x, y, z, col, size, sub, life) {
    if (G.popups.length > 12) G.popups.shift();
    G.popups.push({ text: text, sub: sub, x: x, y: y, z: z, col: col, size: size || 40, t: 0, life: life || 1.1 });
  }
  // Decorative: skipped with reduced motion. 'top' rains gently from the top
  // edge over a results/gift/garage panel instead of bursting mid-screen;
  // 'sides' (every in-play burst) pops from both ends of the zone ribbon
  // (400 px wide at y 150) and only moves outwards, so no piece crosses the
  // score, best, combo or zone text in the HUD band.
  function burstConfetti(n, from) {
    if (Kit.motion.reduced()) return;
    var cols = ['#ff4d8d', '#ffd23f', '#3ddc84', '#3d8bff', '#b36bff', '#ff9a2e'], top = from === 'top';
    for (var k = 0; k < n; k++) {
      if (confetti.length > 240) confetti.shift();
      var p = { x: W / 2 + (ran() - 0.5) * (top ? 800 : 300), y: top ? 60 : H * 0.35, vx: (ran() - 0.5) * 900, vy: top ? -150 - ran() * 350 : -300 - ran() * 600, fall: top ? 340 : 1e9, r: ran() * 6, vr: (ran() - 0.5) * 12, c: cols[k % cols.length], life: 2.2 + ran(), s: 6 + ran() * 6 };
      if (from === 'sides') {
        var side = k < n / 2 ? -1 : 1;
        p.x = W / 2 + side * (215 + ran() * 30); p.y = 150;
        p.vx = side * (40 + ran() * 200); p.vy = -150 - ran() * 400;
      }
      confetti.push(p);
    }
  }
  function flashScreen(a) { if (!Kit.motion.reduced()) flash = a; }
  var SMOKE = {
    puff: ['#ffffff', '#f4f0ff'], pink: ['#ffd1ea', '#ffb3dc'], blue: ['#d8e6ff', '#ffffff'],
    dust: ['#e8cfa8', '#d9b88a'], sprinkle: ['#ff6fb5', '#ffd23f', '#6fd6ff', '#7ee08f', '#ffffff'],
    bubble: ['#9fe6ff', '#ffffff'], spark: ['#7dffb0', '#c6ffda'], gold: ['#ffd23f', '#fff09a'], fire: ['#fff27a']
  };
  var RAINBOW = ['#ff5a6e', '#ff9a2e', '#ffd23f', '#3ddc84', '#3d8bff', '#b36bff'];
  function emitSmoke(x, y, intensity) {
    var st = G.model.smoke, cols = SMOKE[st] || SMOKE.puff;
    var rainbow = run && run.combo >= 5;
    var vx = (ran() - 0.5) * 0.8, vy = (ran() - 0.5) * 0.8;
    var col = rainbow ? RAINBOW[(G.time * 12 | 0) % RAINBOW.length] : cols[(ran() * cols.length) | 0];
    if (st === 'fire') spawn(x, y, 0.15, vx, vy, 0.8, 0.5, 0.12, 0.3, col, rainbow ? 0 : 4);
    else if (st === 'sprinkle') {
      spawn(x, y, 0.1, vx, vy, 0.5, 0.7, 0.18, 0.5, rainbow ? col : '#ffffff', 0, 0.7);
      if (ran() < 0.6) spawn(x, y, 0.3, vx * 2, vy * 2, 2.5, 0.8, 0.06, 0, cols[(ran() * 4) | 0], 2);
    } else if (st === 'bubble') spawn(x, y, 0.2, vx, vy, 0.9, 0.9, 0.08, 0.2, rainbow ? col : cols[0], 3);
    else if (st === 'spark' || st === 'gold') {
      spawn(x, y, 0.2, vx, vy, 0.6, 0.6, 0.12, 0.35, rainbow ? col : cols[1], 0, 0.6);
      if (ran() < 0.5) spawn(x, y, 0.3, vx * 1.5, vy * 1.5, 1.2, 0.6, 0.12, 0, cols[0], 1);
    } else spawn(x, y, 0.12, vx, vy, 0.45, 0.75 + intensity * 0.3, st === 'dust' ? 0.22 : 0.16, st === 'dust' ? 0.75 : 0.55, col, 0, 0.85);
  }
  function burst(x, y, z, n, cols, type, spd, life, size) {
    for (var k = 0; k < n; k++) {
      var a = ran() * PI * 2, s = spd * (0.5 + ran() * 0.5);
      spawn(x, y, z, cos(a) * s, sin(a) * s, (ran() * 0.8 + 0.4) * spd, life * (0.7 + ran() * 0.5), size, type === 0 ? size : 0, cols[k % cols.length], type);
    }
  }
  function addSkid(x1, y1, x2, y2) {
    var sk = G.skids, o = sk.head * 4;
    sk.d[o] = x1; sk.d[o + 1] = y1; sk.d[o + 2] = x2; sk.d[o + 3] = y2;
    sk.head = (sk.head + 1) % sk.cap;
    if (sk.n < sk.cap) sk.n++;
  }

  /* --------------------------------------------------------- update */
  var stepping = false;
  function update(dt) {
    if (G.debug && G.debug.frozen && !stepping) return;
    var m = G.mode;
    if (m !== 'paused') G.time += dt;   // clouds and coins resume where they stopped
    if (m === 'play' || m === 'title' || m === 'falling' || m === 'over' || m === 'garage' || m === 'gift') {
      if (m === 'play' || m === 'falling' || m === 'title' || m === 'gift') simulate(dt);
    }
    // popups / particles always animate except while paused
    if (m !== 'paused') {
      for (var k = G.popups.length - 1; k >= 0; k--) { G.popups[k].t += dt; if (G.popups[k].t >= G.popups[k].life) G.popups.splice(k, 1); }
      for (k = 0; k < G.parts.length; k++) {
        var q = G.parts[k];
        if (q.life <= 0) continue;
        q.life -= dt;
        q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
        q.vx *= 0.97; q.vy *= 0.97; q.vz += q.g * dt;
        if (q.type === 2) { q.vz -= 8 * dt; }
      }
      for (k = confetti.length - 1; k >= 0; k--) {
        var c = confetti[k];
        c.life -= dt; c.vy = min(c.fall, c.vy + 900 * dt); c.vx *= 0.99; c.x += c.vx * dt; c.y += c.vy * dt; c.r += c.vr * dt;
        if (c.life <= 0 || c.y > H + 40) confetti.splice(k, 1);
      }
    }
    G.shake.update(dt);
    if (flash > 0) flash -= dt * 2.5;
    if (bannerT > 0) bannerT -= dt;
    if (hudPop > 0) hudPop -= dt * 4;
    if (comboPop > 0) comboPop -= dt * 3;

    // keys
    var K = Kit.keys;
    if (m === 'title') {
      if (K.pressed('Space') || K.pressed('Enter') || K.pressed('NumpadEnter')) startRun();
    } else if (m === 'play') {
      if (K.pressed('KeyP') || K.pressed('Escape')) pauseGame();
    } else if (m === 'paused') {
      if (K.pressed('KeyP') || K.pressed('Escape')) resumeGame();
      else if (K.pressed('KeyR')) { bankPausedRun(); startRun(); }
    } else if (m === 'over') {
      overT += dt;
      if (overT > 0.45 && (K.pressed('Space') || K.pressed('Enter') || K.pressed('KeyR') || K.pressed('NumpadEnter'))) startRun();
      else if (K.pressed('Escape')) toTitle();
    } else if (m === 'garage') {
      if (K.pressed('Escape')) closeGarage();
      gYaw += dt * 1.2;
    } else if (m === 'gift') {
      if (K.pressed('Space') || K.pressed('Enter')) { if (!giftOpened) crackGift(); else closeGift(); }
      else if (K.pressed('Escape') && giftOpened) closeGift();
    }
    K.endFrame();
  }

  function simulate(dt) {
    var car = G.car, road = G.road, m = G.mode;
    road.ensure(car.seg);
    var hold;
    if (m === 'play') {
      var raw = holdInput();
      if (!armed && !raw) armed = true;
      hold = armed && raw;
      if (hold !== G.lastHold && car.state === 'drive') DK.snd.flick();
      G.lastHold = hold;
    } else {
      hold = DK.botHold(car, road, DK.LEAD);
    }
    G.hold = hold;
    DK.step(car, road, dt, hold);
    var attract = m === 'title' || m === 'garage' || m === 'gift';
    if (attract && car.state === 'fall') { newWorld((ran() * 1e9) | 0); return; }

    // events
    var ev = car.events;
    for (var k = 0; k < ev.length; k++) handleEvent(ev[k]);
    ev.length = 0;

    var seg = road.get(car.seg);
    // skids + smoke
    var slip = abs(car.slip);
    var vis = G.carVis;
    if (car.state === 'drive') {
      var cy = cos(car.head), sy = sin(car.head);
      var r = G.model.rear;
      for (var w = 0; w < 2; w++) {
        var lx = r[0], ly = w ? r[1] : -r[1];
        var wx = car.x + lx * cy - ly * sy, wy = car.y + lx * sy + ly * cy;
        if (slip > 0.1 && !car.air && car.z < 0.05) {
          if (!G.model.hover && lastRear[w]) addSkid(lastRear[w][0], lastRear[w][1], wx, wy);
          if (lastRear[w]) { lastRear[w][0] = wx; lastRear[w][1] = wy; } else lastRear[w] = [wx, wy];
          if (ran() < min(0.9, slip * 2.2)) emitSmoke(wx, wy, slip);
        } else lastRear[w] = null;
      }
      if (G.turbo > 0 && ran() < (G.turbo > 1 ? 0.9 : 0.65)) {
        var bx2 = car.x - cos(car.head) * 0.92, by2 = car.y - sin(car.head) * 0.92;
        spawn(bx2, by2, car.z + 0.25, -cos(car.vel) * 2.2, -sin(car.vel) * 2.2, 0.25, 0.3, 0.12, 0.12, ['#29c8ff', '#8ff4ff', '#ffffff'][(ran() * 3) | 0], 0, 0.9);
      }
      if (G.model.smoke === 'fire' && ran() < 0.5) {
        var bx = car.x - cos(car.head) * 0.9, by = car.y - sin(car.head) * 0.9;
        spawn(bx, by, car.z + 0.35, -cos(car.vel) * 1.5, -sin(car.vel) * 1.5, 0.3, 0.3, 0.1, 0.15, '#fff27a', 4);
      }
      if (G.model.hover && ran() < 0.3) spawn(car.x, car.y, car.z + 0.1, 0, 0, -0.3, 0.5, 0.1, 0.1, '#9cf5c8', 1);
    }
    // car visual pose
    if (car.state === 'drive') {
      var ty = car.head + car.slip * 0.28;
      vis.yaw += DK.wrap(ty - vis.yaw) * min(1, dt * 20);
      vis.roll += ((-car.slip * 0.32) - vis.roll) * min(1, dt * 10);
      vis.pitch += ((car.air ? -0.12 : 0) - vis.pitch) * min(1, dt * 6);
    } else {
      vis.yaw = car.head; vis.pitch = car.fall.pitch; vis.roll = car.fall.roll;
    }
    vis.sqv += (1 - vis.sq) * 260 * dt; vis.sqv *= M.pow(0.001, dt); vis.sq += vis.sqv * dt;
    vis.sq = max(0.6, min(1.4, vis.sq));
    G.groundUnder = !car.air || DK.inSeg(seg, car.x, car.y, 0) && !(seg.gap && DK.along(seg, car.x, car.y) > seg.gap.a && DK.along(seg, car.x, car.y) < seg.gap.b);

    // coins, slipstream multiplier, and best-run ghost
    if (car.state === 'drive' && run && m === 'play') {
      run.t += dt;
      var dp = car.progress - run.prevProg;
      if (dp > 0) {
        run.prevProg = car.progress;
        if (run.mult > 1) {
          run.multAcc += dp * (run.mult - 1);
          var add = flr(run.multAcc);
          if (add > 0) { run.bonus += add; run.multAcc -= add; }
        }
      }
      if (ghostRec.length < GHOST_MAX * 2) {
        var gn = flr(run.t * GHOST_HZ);
        while (ghostRec.length / 2 <= gn) ghostRec.push(M.round(car.progress * 10), M.round(DK.lateral(seg, car.x, car.y) * 100));
      }
      if (G.ghost && ghostData) {
        var gd = ghostData.d, gf = run.t * GHOST_HZ, gi = flr(gf), gk = gf - gi, gcnt = gd.length / 2;
        if (run.t > 0.15 && gi < gcnt - 1) {
          var gpr = (gd[gi * 2] + (gd[gi * 2 + 2] - gd[gi * 2]) * gk) / 10;
          var glt = (gd[gi * 2 + 1] + (gd[gi * 2 + 3] - gd[gi * 2 + 1]) * gk) / 100;
          var gp = road.pointAtDist(gpr, glt);
          if (gp) { G.ghost.x = gp.x; G.ghost.y = gp.y; G.ghost.z = gp.z; G.ghost.yaw = gp.yaw; G.ghost.vis = true; }
          else G.ghost.vis = false;
        } else G.ghost.vis = false;
      }
      var coins = road.coins;
      for (k = 0; k < coins.length; k++) {
        var c = coins[k];
        if (c.taken || abs(c.seg - car.seg) > 2) continue;
        var dx = c.x - car.x, dy = c.y - car.y, dz = c.z - (car.z + 0.4), d2 = dx * dx + dy * dy;
        if (run.turbo > 0 && d2 < 12.25) {
          var pull = min(1, dt * 13);
          c.x -= dx * pull; c.y -= dy * pull; c.z += (car.z + 0.4 - c.z) * pull;
          dx = c.x - car.x; dy = c.y - car.y; dz = c.z - (car.z + 0.4); d2 = dx * dx + dy * dy;
        }
        if (d2 < 0.62 && abs(dz) < 0.9) collectCoin(c);
      }
      if (run.coinStreakT > 0) { run.coinStreakT -= dt; if (run.coinStreakT <= 0) run.coinStreak = 0; }
      // score + best flag
      var sc = flr(car.progress) + run.bonus;
      run.score = sc;
      if (!run.beatBest && save.best >= 50 && sc > save.best) {
        run.beatBest = true;
        popup('رقم قياسي!', car.x, car.y, 1.8, '#ffd23f', 50, null, 1.6);
        DK.snd.best(); burstConfetti(50, 'sides'); flashScreen(0.6);
      }
      var z = flr(car.progress / DK.ZONE_LEN);
      if (z > run.zone) {
        run.zone = z;
        bannerT = BANNER_T; bannerText = DK.zoneName(z); bannerSub = 'المنطقة ' + (z + 1) + '  •  \u2066+10\u2069';
        run.coins += 10; save.coins += 10;
        DK.snd.zone(); burstConfetti(40, 'sides');
      }
      if ((G.time * 60 | 0) % 30 === 0) checkMissions(run);
      if (!G.bestFlag && save.bestDist > 40) {
        var bp = road.pointAtDist(save.bestDist);
        if (bp) G.bestFlag = { seg: bp.seg, s: bp.s };
      }
      if (G.bestFlag && G.bestFlag.seg.i < road.base) G.bestFlag = null;
    }

    // falling
    if (car.state === 'fall') {
      fallT += dt;
      if (!poofed && car.z < -5.5) {
        poofed = true;
        burst(car.x, car.y, car.z, 16, ['#ffffff', '#f0ecff'], 0, 3, 0.9, 0.5);
        DK.snd.poof();
        G.shake.add(5);
      }
      if (m === 'falling' && fallT > 1.25) gameOver();
    }

    // camera
    var c = G.cam;
    if (car.state === 'drive') {
      var look = 1.6, back = (m === 'title' || m === 'garage' || m === 'gift') ? 1.4 : -1.2;
      var tx = car.x + cos(car.vel) * look + back, ty2 = car.y + sin(car.vel) * look + back;
      c.x += (tx - c.x) * min(1, dt * 4.5);
      c.y += (ty2 - c.y) * min(1, dt * 4.5);
      var targetS = 50 - (car.v - 6.8) * 1.5;
      c.S += (targetS - c.S) * min(1, dt * 1.5);
      G.skyDist = car.progress;
    }
    if (m === 'title' || m === 'garage' || m === 'gift') c.S = 54;
  }

  function collectCoin(c) {
    c.taken = true;
    var val = c.kind === 1 ? 5 : 1;
    run.coins += val; save.coins += val;
    if (c.kind === 1) {
      run.gems++; save.gems++;
      DK.snd.gem();
      burst(c.x, c.y, c.z, 12, ['#35e0ff', '#b6f6ff', '#ffffff'], 1, 3, 0.6, 0.14);
      popup('+5', c.x, c.y, c.z + 0.5, '#6ff0ff', 40);
    } else {
      run.coinStreak++; run.coinStreakT = 0.8;
      DK.snd.coin(run.coinStreak);
      burst(c.x, c.y, c.z, 6, ['#ffd23f', '#fff09a'], 1, 2.2, 0.45, 0.1);
      popup('+1', c.x, c.y, c.z + 0.4, '#ffd23f', 28, null, 0.7);
    }
    hudPop = 1;
  }

  function handleEvent(e) {
    var car = G.car, play = G.mode === 'play';
    switch (e.t) {
      case 'corner':
        if (!play) break;
        // the coach is done the first time a run clears 6 corners while its hints still show
        if (++run.corners === 6 && save.best < 60 && save.runs < 12) Kit.stats.tutorial('done');
        if (e.q !== 'close' && (e.minEdge == null || e.minEdge >= 0.15)) {
          run.cleanChain++;
          var nt = run.cleanChain >= 10 ? 2 : run.cleanChain >= 5 ? 1 : 0;
          run.mult = nt + 1;
          if (nt > run.turbo) {
            run.turbo = nt; G.turbo = nt;
            DK.snd.turbo(nt);
            popup(nt > 1 ? 'توربو خارق! ×3' : 'انزلاق توربو! ×2', car.x, car.y, 2.0, '#6ff0ff', 44, 'مغناطيس عملات ⚡', 1.3);
            burst(car.x, car.y, 0.5, 16, ['#35e0ff', '#8ff4ff', '#ffffff'], 1, 4.2, 0.6, 0.15);
            flashScreen(0.4);
          } else { run.turbo = nt; G.turbo = nt; }
        } else { run.cleanChain = 0; run.turbo = 0; run.mult = 1; G.turbo = 0; }
        if (e.q === 'perfect') {
          run.combo++; run.perfects++;
          run.maxCombo = max(run.maxCombo, run.combo);
          var mult = min(run.combo, 10);
          var bonus = 3 * mult * run.mult;
          run.bonus += bonus;
          var words = ['ممتاز!', 'رائع!', 'مذهل!', 'خارق!', 'أسطوري!'];
          var wd = words[min(words.length - 1, flr((run.combo - 1) / 3))];
          popup(wd, car.x, car.y, 1.6, run.combo >= 5 ? '#ff7ad1' : '#ffe14d', 44 + min(run.combo, 10) * 1.5, '+' + bonus + (run.combo > 1 ? '  x' + run.combo : ''));
          DK.snd.perfect(run.combo);
          burst(car.x, car.y, 0.4, 8 + min(run.combo, 10), ['#ffe14d', '#ffffff', '#ff7ad1'], 1, 3.5, 0.55, 0.13);
          comboPop = 1; hudPop = 1;
          if (run.combo === 5 || run.combo === 10 || run.combo === 20) { flashScreen(0.5); burstConfetti(30, 'sides'); }
        } else {
          if (run.combo >= 3) popup('انتهت السلسلة', car.x, car.y, 1.4, '#ffffff', 26, null, 0.9);
          run.combo = 0;
          if (e.q === 'close') { popup('على الحافة!', car.x, car.y, 1.5, '#7df3ff', 38, '+2'); run.bonus += 2; DK.snd.close(); }
        }
        break;
      case 'jump':
        if (play) run.jumps++;
        DK.snd.jump();
        G.carVis.sqv = 3.2; G.shake.add(2.5);
        burst(car.x, car.y, 0.4, 12, ['#35e0ff', '#b6f6ff', '#ffffff'], 1, 3.2, 0.55, 0.14);
        break;
      case 'land':
        DK.snd.land();
        G.carVis.sqv = -5.5;
        G.shake.add(5.5);
        burst(car.x, car.y, 0.12, 16, ['#35e0ff', '#ffe14d', '#ffffff'], 1, 4.2, 0.55, 0.15);
        burst(car.x, car.y, 0.05, 8, ['#ffffff', '#c6f6ff'], 0, 2.5, 0.45, 0.18);
        if (play) { var jb = 10 * run.mult; run.bonus += jb; popup('قفزة السماء!', car.x, car.y, 1.5, '#6ff0ff', 42, '+' + jb); }
        break;
      case 'fall':
        if (!play) break;
        G.mode = 'falling';
        fallT = 0;
        DK.snd.stopEngine();
        DK.snd.fall();
        G.shake.add(6);
        run.combo = 0; run.cleanChain = 0; run.turbo = 0; run.mult = 1; G.turbo = 0;
        break;
    }
  }

  /* ---------------------------------------------------------- render */
  // Under the garage, pause and (once settled) results panels nothing moves:
  // draw the world once and keep that frame until the mode changes, a resize
  // or context restore clears the canvas, or the font arrives.
  var stillMode = null;   // mode whose still frame is on the canvas
  function sceneStill() {
    var m = G.mode, settled = flash <= 0 && !G.shake.power;
    if (m === 'garage') return true;
    if (m === 'paused') return settled && hudPop <= 0 && comboPop <= 0;   // HUD pops shrink back first
    if (m !== 'over' || overT <= 1 || !settled || G.popups.length) return false;
    for (var k = 0; k < G.parts.length; k++) if (G.parts[k].life > 0) return false;
    return true;
  }
  function render() {
    drawConfetti();
    if (G.mode === 'garage') {
      for (var k = 0; k < gCards.length; k++) if (gCards[k].car.id === save.car) drawPreview(gCards[k].cv, gCards[k].car, gYaw);
    }
    if (sceneStill()) {
      if (stillMode === G.mode) return;
      stillMode = G.mode;
    } else stillMode = null;
    ctx.save();
    DK.drawWorld(ctx, G);
    ctx.restore();
    if (G.mode === 'play' || G.mode === 'falling' || G.mode === 'paused') drawHUD();
    if (G.mode === 'play') drawHint();
    if (flash > 0) {
      ctx.fillStyle = 'rgba(255,255,255,' + (flash * 0.5).toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
    }
    if (bannerOn()) drawBanner();
  }
  // The #fx layer is visible only while confetti is alive.
  function drawConfetti() {
    if (!confetti.length) {
      if (!fxCanvas.hidden) { fx.clearRect(0, 0, W, H); fxCanvas.hidden = true; }
      return;
    }
    if (fxCanvas.hidden) fxCanvas.hidden = false;
    fx.clearRect(0, 0, W, H);
    for (var k = 0; k < confetti.length; k++) {
      var c = confetti[k];
      fx.save(); fx.translate(c.x, c.y); fx.rotate(c.r);
      fx.globalAlpha = min(1, c.life);
      fx.fillStyle = c.c; fx.fillRect(-c.s / 2, -c.s / 4, c.s, c.s / 2);
      fx.restore();
    }
  }

  function txt(s, x, y, size, fill, align, stroke, lw) {
    ctx.font = '700 ' + size + 'px Fredoka';
    ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'rtl';
    if (stroke) { ctx.lineJoin = 'round'; ctx.lineWidth = lw || size * 0.2; ctx.strokeStyle = stroke; ctx.strokeText(s, x, y); }
    ctx.fillStyle = fill; ctx.fillText(s, x, y);
  }
  function coinIcon(x, y, r) {
    var d = function (cx, cy, rr, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(cx, cy, rr, 0, PI * 2); ctx.fill(); };
    d(x + 1.5, y + 1.5, r, '#e59a12'); d(x, y, r, '#ffd23f'); d(x - r * 0.25, y - r * 0.25, r * 0.45, '#fff09a');
  }

  function drawHUD() {
    var sc = run ? run.score : 0;
    var p = 1 + max(0, hudPop) * 0.18;
    ctx.save();
    ctx.translate(W / 2, 52); ctx.scale(p, p);
    txt(Kit.fmt(sc), 0, 0, 64, '#ffffff', 'center', 'rgba(60,20,100,0.75)', 12);
    ctx.restore();
    if (save.best > 0) txt('الأفضل ' + Kit.fmt(max(save.best, sc)), W / 2, 100, 20, '#ffffff', 'center', 'rgba(60,20,100,0.6)', 6);
    // combo (the zone banner takes its place for a moment)
    if (run && run.combo >= 2 && !bannerOn()) {
      var cp = 1 + max(0, comboPop) * 0.3;
      ctx.save(); ctx.translate(W / 2, 138); ctx.scale(cp, cp);
      var col = run.combo >= 10 ? '#ff7ad1' : run.combo >= 5 ? '#ffb13b' : '#ffe14d';
      txt('سلسلة ممتازة \u2066x' + run.combo + '\u2069', 0, 0, 28, col, 'center', 'rgba(60,20,100,0.75)', 7);
      ctx.restore();
    }
    if (run && run.turbo > 0 && !bannerOn()) {
      txt('توربو السحب \u2066×' + run.mult + '\u2069 ⚡', W / 2, run.combo >= 2 ? 172 : 138, 24, '#6ff0ff', 'center', 'rgba(20,50,110,0.85)', 6);
    }
    // coins (top-left)
    ctx.fillStyle = 'rgba(36,18,74,0.68)';
    roundRect(16, 14, 170, 50, 25); ctx.fill();
    coinIcon(44, 39, 15);
    ctx.save(); ctx.translate(70, 40);
    var cps = 1 + max(0, hudPop) * 0.15; ctx.scale(cps, cps);
    txt(Kit.fmt(save.coins), 0, 0, 30, '#ffe14d', 'left', 'rgba(60,20,100,0.7)', 6);
    ctx.restore();
    // zone progress
    if (G.car) {
      var zl = DK.ZONE_LEN, pr = G.car.progress, z = flr(pr / zl), f = (pr - z * zl) / zl;
      ctx.fillStyle = 'rgba(36,18,74,0.68)';
      roundRect(16, 70, 170, 42, 21); ctx.fill();
      txt(DK.zoneName(z), 101, 84, 17, '#ffffff', 'center');
      ctx.fillStyle = 'rgba(15,8,38,0.55)'; roundRect(28, 97, 146, 8, 4); ctx.fill();
      ctx.fillStyle = '#ffd23f'; roundRect(28, 97, max(14, 146 * f), 8, 4); ctx.fill();
    }
  }
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
  }

  // The zone banner is a compact ribbon in the HUD band under the score, so
  // the road ahead stays clear while the speed climbs.
  function bannerOn() { return bannerT > 0 && (G.mode === 'play' || G.mode === 'falling'); }
  function drawBanner() {
    var t = BANNER_T - bannerT;
    var a = t < 0.3 ? t / 0.3 : bannerT < 0.4 ? bannerT / 0.4 : 1;
    var sc = t < 0.3 && !Kit.motion.reduced() ? 0.6 + t / 0.3 * 0.4 + sin(t / 0.3 * PI) * 0.15 : 1;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(W / 2, 150); ctx.scale(sc, sc);
    ctx.fillStyle = 'rgba(40,20,80,0.4)';
    roundRect(-200, -31, 400, 62, 28); ctx.fill();
    txt(bannerText, 0, -9, 32, '#ffe14d', 'center', 'rgba(60,20,100,0.8)', 7);
    txt(bannerSub, 0, 18, 17, '#ffffff', 'center', 'rgba(60,20,100,0.6)', 4);
    ctx.restore();
  }

  function drawHint() {
    // Hints stay until the child has once cleared about 6-8 corners in a run
    // (best 60), with a cap so they do not linger forever.
    if (save.best >= 60 || save.runs >= 12 || !run || run.corners >= 6) return;
    var car = G.car, road = G.road;
    if (car.state !== 'drive' || car.air) return;
    var want = DK.botHold(car, road, DK.LEAD + car.v * 0.2);
    var nxt = road.get(car.seg + 1);
    var holding = G.hold;
    var X = DK.sx(car.x, car.y), Y = DK.sy(car.x, car.y, 0);
    var msg = null, now = false;
    if (want && !holding) { msg = 'اضغط مع الاستمرار!'; now = true; }
    else if (!want && holding) { msg = 'اترك الزر!'; now = true; }
    else if (nxt) msg = nxt.dir === 1 ? 'اضغط عند المنعطف' : 'اترك عند المنعطف';
    if (!msg) return;
    var sg = road.get(car.seg), px = min(W - 148, X + 335), py = min(H - 46, Y + (sg && sg.dir ? 52 : -18));
    var pulse = now ? 1.08 + sin(G.time * 14) * 0.08 : 1;
    ctx.save(); ctx.translate(px, py); ctx.scale(pulse, pulse);
    ctx.fillStyle = now ? '#ff4d8d' : 'rgba(36,18,74,0.82)';
    roundRect(-136, -27, 272, 54, 27); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-134, -8); ctx.lineTo(-134, 12); ctx.lineTo(-150, 4); ctx.closePath(); ctx.fill();
    txt(msg, 0, 1, now ? 28 : 24, '#ffffff', 'center');
    ctx.restore();
  }

  /* ------------------------------------------------------------ boot */
  toTitle();
  // a still frame drawn before the font arrived is redrawn with it
  document.fonts && document.fonts.load && document.fonts.load('700 40px Fredoka', 'بA1').then(function () { stillMode = null; }, function () { });
  var lastEng = 0;
  Kit.loop(update, function () {
    render();
    if (G.mode === 'play' && G.car) {
      lastEng++;
      if (lastEng % 3 === 0) DK.snd.updateEngine(G.car.v, G.car.slip, !!G.car.air);
    }
  });

  // debug / test hook
  G.debug = {
    start: startRun,
    skip: function (d) { if (G.mode !== 'play') return; var car = G.car, road = G.road; while (road.last().d0 < car.progress + d + 50) road.addSeg(); var target = car.progress + d; var p = road.pointAtDist(target); if (p) { car.x = p.x; car.y = p.y; car.seg = p.seg.i; car.head = car.vel = DK.ANG[p.seg.dir]; car.progress = target; if (run) run.prevProg = target; car.corner = null; car.air = null; car.z = 0; road.ensure(car.seg); snapCam(); G.bestFlag = null; } },
    autopilot: false,
    stepN: function (n) { stepping = true; for (var k = 0; k < n; k++) update(1 / 60); stepping = false; return G.mode; },
    frozen: false,
    toRamp: function () {
      var car = G.car, road = G.road;
      for (var k = car.seg + 3; k < car.seg + 200; k++) {
        while (road.last().i < k + 2) road.addSeg();
        var sg = road.get(k);
        if (sg && sg.gap) { G.debug.skip(sg.d0 - car.progress - 2); return k; }
      }
      return -1;
    },
    save: save,
    addCoins: function (n) { save.coins += n; persist(); refreshTitle(); }
  };
  // optional autopilot for automated tests
  var origHold = holdInput;
  holdInput = function () { return G.debug.autopilot && G.mode === 'play' ? DK.botHold(G.car, G.road, DK.LEAD) : origHold(); };
  Kit.lifecycle({ pause: pauseGame, reset: function () { mouseDown = false; } });
  Kit.ready();
})();

