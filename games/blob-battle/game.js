/* معركة الهلام (Blob Battle) — original blob-eating arena game. All code and art original. */
(function () {
  'use strict';
  var BB = window.BB;
  var W = 1280, H = 720, TAU = Math.PI * 2;
  var clamp = Kit.clamp, rand = Kit.rand;
  var FONT = 'Fredoka, sans-serif';

  function $(id) { return document.getElementById(id); }
  var ui = $('ui');
  var cv = $('c');
  var view = Kit.fit(cv, W, H, { onResize: function (v) { ui.style.transform = 'scale(' + v.scale + ')'; } });
  var ctx = view.ctx;
  var ptr = Kit.pointer(view);
  var store = Kit.store('blob-battle');
  var A = Kit.audio;

  /* ================================================================ config */
  var MAXC = 16, MIN_SPLIT = 36, EJ_MIN = 34, EJ_COST = 16, EJ_MASS = 12, VM = 100, BS = 100;
  var START_MASS = 20;
  var PCOLS = ['#ff5c8a', '#ffb31a', '#3ddc84', '#2fb5ff', '#8e5cff', '#ff7a3d', '#12c9b5', '#f368e0'];
  var ARENAS = [
    { name: 'ساحة الحديقة', diff: 'سهلة', size: 3400, bots: 16, vir: 12, smart: 0.3, aggro: 0.18, hate: 0.75, start: [12, 110], caps: [70, 1000], spd: 0.93, pellets: 2600,
      theme: { bg: '#f3fbee', grid: '#d9eed0', out: '#b9dfaa', border: '#58c247' }, icon: '🌳' },
    { name: 'ساحة المحيط', diff: 'متوسطة', size: 3800, bots: 19, vir: 16, smart: 0.6, aggro: 0.42, hate: 1, start: [12, 230], caps: [100, 2000], spd: 0.97, pellets: 3000,
      theme: { bg: '#edf7ff', grid: '#cfe5f6', out: '#a4cff0', border: '#2f93e0' }, icon: '🌊', need: { a: 0, m: 500 } },
    { name: 'ساحة البركان', diff: 'صعبة', size: 4200, bots: 22, vir: 22, smart: 0.9, aggro: 0.72, hate: 1.2, start: [15, 380], caps: [130, 3200], spd: 1, pellets: 3400,
      theme: { bg: '#fff3ea', grid: '#f5dac8', out: '#f1b394', border: '#ff6a3d' }, icon: '🌋', need: { a: 1, m: 800 } }
  ];
  var NAMES = ['بطبوط', 'فقاعة', 'زلابية', 'كعكوش', 'مشمش', 'بندق', 'فستق', 'سمسم', 'لولو', 'ميمي', 'توتو', 'دبدوب', 'قرقور',
    'نمنم', 'فرفور', 'زيزو', 'بسبوسة', 'كركر', 'شمشوم', 'فلفل', 'بلبل', 'سكّر', 'حلاوة', 'نونو', 'دودو', 'كرملة', 'مهلبية',
    'شطّور', 'هلاموش', 'دحدوح', 'جيلي', 'بالون', 'قطنة', 'زبدة', 'عسولة', 'برقوق', 'فشفوش', 'مربّى'];
  var BOT_FACES = ['eyes', 'eyes', 'smile', 'cool', 'tongue', 'sleepy', 'star'];
  var EAT_WORDS = ['هَم!', 'لذيذ!', 'نيام نيام!', 'التهام!', 'رائع!', 'يمّي!'];
  var COMBO_WORDS = { 2: 'أكلة مزدوجة!', 3: 'ثلاثية رائعة!', 4: 'رباعية خارقة!' };

  function radius(m) { return 4.4 * Math.sqrt(m) + 4; }
  function speedFor(m) { return 520 * Math.pow(m, -0.21); }
  function launchDist(m) { return 3.2 * radius(m) + 180; }
  function mergeTime(m) { return Math.min(22, 7 + m * 0.01); }

  /* ================================================================ save */
  var DEF = { best: 0, best1: 0, best2: 0, best3: 0, bestA3: 0, rounds: 0, roundEaten: 0, virusPops: 0, splitEats: 0, maxTime: 0,
    kings: 0, eatenTotal: 0, virusShots: 0, pellets: 0, arena2: 0, arena3: 0, kingTime: 0 };
  var stats = store.get('stats', {});
  if (!stats || typeof stats !== 'object') stats = {};
  for (var k in DEF) if (typeof stats[k] !== 'number' || !isFinite(stats[k])) stats[k] = DEF[k];
  var seenSkins = store.get('seen', []);
  if (!Array.isArray(seenSkins)) seenSkins = [];
  function saveStats() { store.set('stats', stats); }

  function skinUnlocked(s) {
    var u = s.unlock;
    if (u.t === 'free') return true;
    if (u.t === 'mass') return stats.best >= u.v;
    return (stats[u.k] || 0) >= u.v;
  }
  function skinReq(s) {
    var u = s.unlock;
    if (u.t === 'free') return '';
    if (u.t === 'mass') return 'اوصل إلى كتلة ' + u.v;
    return u.txt;
  }
  function arenaUnlocked(i) { return i === 0 || stats['arena' + (i + 1)] >= 1; }
  function countUnlocked() { var n = 0; BB.SKINS.forEach(function (s) { if (skinUnlocked(s)) n++; }); return n; }

  var selSkin = BB.SKIN_BY_ID[store.get('skin', 'mint')] || BB.SKINS[0];
  if (!skinUnlocked(selSkin)) selSkin = BB.SKINS[0];
  var browse = selSkin.index;
  var arenaIdx = clamp(store.get('arena', 0) | 0, 0, 2);
  if (!arenaUnlocked(arenaIdx)) arenaIdx = 0;
  var unlockedSet = {};
  BB.SKINS.forEach(function (s) { if (skinUnlocked(s)) unlockedSet[s.id] = 1; });
  // skins unlocked before "seen" existed count as seen
  if (!store.get('seenInit', false)) { seenSkins = Object.keys(unlockedSet); store.set('seen', seenSkins); store.set('seenInit', true); }

  /* ================================================================ world state */
  var state = 'title';        // title | skins | play | pause | dying | over
  var T = 0, realT = 0, timeScale = 1;
  var AR = ARENAS[arenaIdx], WS = AR.size;
  var owners = [], cells = [], viruses = [], ejected = [], virusQ = [];
  var player = null, lb = [], lbTimer = 0;
  var cam = { x: 1700, y: 1700, z: 0.6, follow: null, followT: 0 };
  var shake = Kit.shake();
  var round = null;
  var cellId = 0, ownerId = 0;
  var anyDead = false;
  var autoMode = null; // debug autoplay only

  /* ---------------------------------------------------------------- pellets (spatial hash) */
  var MAXP = 4000;
  var pX = new Float32Array(MAXP), pY = new Float32Array(MAXP), pBorn = new Float64Array(MAXP);
  var pCol = new Uint8Array(MAXP), pGold = new Uint8Array(MAXP);
  var pBk = new Int32Array(MAXP), pSlot = new Int32Array(MAXP);
  var pCount = 0, GW = 1, buckets = [];
  function bucketOf(x, y) { return clamp(Math.floor(x / BS), 0, GW - 1) + clamp(Math.floor(y / BS), 0, GW - 1) * GW; }
  function placePellet(i, init) {
    var x = rand(25, WS - 25), y = rand(25, WS - 25);
    pX[i] = x; pY[i] = y; pCol[i] = (Math.random() * PCOLS.length) | 0;
    pGold[i] = Math.random() < 0.018 ? 1 : 0;
    pBorn[i] = init ? -10 : T;
    var b = bucketOf(x, y); pBk[i] = b; pSlot[i] = buckets[b].length; buckets[b].push(i);
  }
  function removePellet(i) {
    var arr = buckets[pBk[i]], s = pSlot[i], last = arr[arr.length - 1];
    arr[s] = last; pSlot[last] = s; arr.pop();
  }
  function initPellets() {
    GW = Math.ceil(WS / BS); buckets = new Array(GW * GW);
    for (var b = 0; b < buckets.length; b++) buckets[b] = [];
    pCount = Math.min(MAXP, AR.pellets);
    for (var i = 0; i < pCount; i++) placePellet(i, true);
  }

  /* ---------------------------------------------------------------- owners & cells */
  function newOwner(isBot) {
    return { id: ++ownerId, isBot: isBot, name: '', skin: null, cells: [], alive: false, mass: 0, tx: WS / 2, ty: WS / 2,
      spd: 1, smart: 0.5, aggro: 0.3, hate: 1, respawn: 0, shield: 0, rank: 99, lastEater: null,
      ai: { next: 0, splitCD: 0, food: -1, fx: 0, fy: 0, wx: 0, wy: 0, wT: 0 } };
  }
  function newCell(o, x, y, m) {
    var c = { id: ++cellId, o: o, x: x, y: y, m: m, r: radius(m), dr: radius(m), vx: 0, vy: 0, bx: 0, by: 0,
      mergeAt: 0, splitT: -9, born: T, phase: Math.random() * 10, wob: 0.05, sa: 0, sq: 0, rot: 0, mouth: 0,
      blink: 0, blinkT: rand(1, 4), lx: 0, ly: 0.2, dead: false };
    o.cells.push(c); cells.push(c);
    return c;
  }
  var usedNames = {};
  function pickName() {
    for (var tries = 0; tries < 40; tries++) {
      var n = Kit.pick(NAMES);
      if (!usedNames[n]) { usedNames[n] = 1; return n; }
    }
    return Kit.pick(NAMES);
  }
  function safeSpot(minM) {
    var best = null, bestD = -1;
    for (var t = 0; t < 14; t++) {
      var x = rand(150, WS - 150), y = rand(150, WS - 150), md = 1e9;
      for (var i = 0; i < cells.length; i++) {
        var c = cells[i]; if (c.m < minM) continue;
        var d = Math.hypot(c.x - x, c.y - y) - c.r * 1.5 - launchDist(c.m / 2) * (c.m > minM * 2.6 ? 0.8 : 0);
        if (d < md) md = d;
      }
      if (md > bestD) { bestD = md; best = { x: x, y: y }; }
      if (md > 900) break;
    }
    return best;
  }
  function botSkin() {
    if (Math.random() < 0.55) return Kit.pick(BB.SKINS);
    return { id: 'bot', color: Kit.pick(BB.BOT_COLORS), face: Kit.pick(BOT_FACES) };
  }
  function spawnBot(o, m) {
    if (o.name) delete usedNames[o.name];
    o.name = pickName(); o.skin = botSkin();
    o.smart = clamp(AR.smart + rand(-0.15, 0.15), 0, 1);
    o.aggro = clamp(AR.aggro + rand(-0.12, 0.12), 0, 1);
    o.hate = AR.hate; o.spd = AR.spd;
    o.cap = AR.caps[0] + (AR.caps[1] - AR.caps[0]) * Math.pow(Math.random(), 1.7);
    o.cells.length = 0; o.alive = true; o.lastEater = null;
    o.ai.next = T + rand(0, 0.3); o.ai.splitCD = T + rand(3, 8); o.ai.food = -1;
    var p = safeSpot(m * 1.2);
    newCell(o, p.x, p.y, m);
    o.tx = p.x; o.ty = p.y; o.mass = m;
  }
  function spawnVirus(x, y) {
    if (x == null) {
      for (var t = 0; t < 10; t++) {
        x = rand(200, WS - 200); y = rand(200, WS - 200);
        var ok = true;
        for (var i = 0; i < cells.length; i++) if (Math.hypot(cells[i].x - x, cells[i].y - y) < cells[i].r + 120) { ok = false; break; }
        if (ok) break;
      }
    }
    var v = { x: x, y: y, m: VM, r: radius(VM), fed: 0, vx: 0, vy: 0, rot: Math.random() * TAU, dead: false, born: T };
    viruses.push(v);
    return v;
  }

  function buildWorld(withPlayer) {
    AR = ARENAS[arenaIdx]; WS = AR.size;
    owners.length = 0; cells.length = 0; viruses.length = 0; ejected.length = 0; virusQ.length = 0;
    parts.length = 0; floaters.length = 0; toasts.length = 0; usedNames = {};
    lb = []; player = null;
    initPellets();
    for (var v = 0; v < AR.vir; v++) spawnVirus();
    for (var b = 0; b < AR.bots; b++) {
      var o = newOwner(true); owners.push(o);
      var m = AR.start[0] + (AR.start[1] - AR.start[0]) * Math.pow(Math.random(), 2.2);
      spawnBot(o, m);
    }
    if (withPlayer) {
      player = newOwner(false); player.name = 'أنت'; player.skin = selSkin; player.spd = 1;
      owners.push(player);
      var p = safeSpot(25);
      newCell(player, p.x, p.y, START_MASS);
      player.alive = true; player.mass = START_MASS; player.shield = T + 3;
      player.tx = p.x; player.ty = p.y;
      cam.x = p.x; cam.y = p.y; cam.z = 1.5;
    } else {
      cam.x = WS / 2; cam.y = WS / 2; cam.z = 0.6; cam.follow = null;
    }
    updateLeaderboard();
  }

  /* ================================================================ actions */
  function splitOwner(o, tx, ty) {
    var list = o.cells.slice().sort(function (a, b) { return b.m - a.m; });
    var did = 0;
    for (var i = 0; i < list.length; i++) {
      if (o.cells.length >= MAXC) break;
      var c = list[i]; if (c.m < MIN_SPLIT) continue;
      var dx = tx - c.x, dy = ty - c.y, d = Math.sqrt(dx * dx + dy * dy);
      if (d < 1) { dx = c.lx || 1; dy = c.ly || 0; d = Math.sqrt(dx * dx + dy * dy) || 1; }
      var ux = dx / d, uy = dy / d, h = c.m / 2;
      c.m = h; c.r = radius(h);
      var nc = newCell(o, c.x + ux * c.r * 0.3, c.y + uy * c.r * 0.3, h);
      var v = launchDist(h) * 4.5;
      nc.bx = ux * v; nc.by = uy * v; nc.vx = c.vx; nc.vy = c.vy; nc.dr = c.r * 0.6;
      nc.splitT = c.splitT = T; nc.wob = 0.14; c.wob = 0.12; nc.lx = ux; nc.ly = uy; nc.phase = c.phase + 1.7;
      var mt = T + mergeTime(h * 2);
      c.mergeAt = mt; nc.mergeAt = mt;
      did++;
    }
    return did;
  }
  function ejectOwner(o, tx, ty) {
    var did = 0;
    for (var i = 0; i < o.cells.length; i++) {
      var c = o.cells[i]; if (c.m < EJ_MIN || ejected.length >= 160) continue;
      var dx = tx - c.x, dy = ty - c.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
      var ux = dx / d, uy = dy / d, a = Math.atan2(uy, ux) + rand(-0.12, 0.12);
      ux = Math.cos(a); uy = Math.sin(a);
      c.m -= EJ_COST; c.r = radius(c.m); c.wob += 0.03; c.bx -= ux * 40; c.by -= uy * 40;
      ejected.push({ x: c.x + ux * (c.r + 8), y: c.y + uy * (c.r + 8), vx: ux * 820, vy: uy * 820, m: EJ_MASS, r: 14,
        col: o.skin.color, o: o, t: T, dead: false, ph: Math.random() * 6 });
      did++;
    }
    return did;
  }

  /* ================================================================ bot brain */
  function ownerCenter(o, out) {
    var cx = 0, cy = 0, tm = 0, big = null;
    for (var i = 0; i < o.cells.length; i++) {
      var c = o.cells[i]; cx += c.x * c.m; cy += c.y * c.m; tm += c.m;
      if (!big || c.m > big.m) big = c;
    }
    out.x = cx / tm; out.y = cy / tm; out.m = tm; out.big = big;
    return out;
  }
  var tmpC = { x: 0, y: 0, m: 0, big: null };
  function think(o) {
    var s = o.smart;
    o.ai.next = T + (0.42 - s * 0.26) + Math.random() * 0.12;
    ownerCenter(o, tmpC);
    var cx = tmpC.x, cy = tmpC.y, me = tmpC.big, myM = me.m, myR = me.r;
    var vis = 360 + myR * 3 + s * 240;
    var fx = 0, fy = 0, threat = 0, prey = null, pScore = 0, preyD = 0, i, dx, dy, dist, edge, w;
    for (i = 0; i < cells.length; i++) {
      var c = cells[i]; if (c.o === o) continue;
      dx = c.x - cx; dy = c.y - cy; dist = Math.sqrt(dx * dx + dy * dy) || 1; edge = dist - c.r - myR;
      if (edge > vis) continue;
      if (c.m > myM * 1.2) {
        var reach = (c.m > myM * 2.6 && s > 0.35) ? launchDist(c.m / 2) : 60 + c.r * 0.4;
        var zone = reach + 90 + s * 120;
        if (edge < zone) {
          w = 1 - Math.max(0, edge) / zone; w *= w;
          fx -= dx / dist * w; fy -= dy / dist * w;
          if (w > threat) threat = w;
        }
      } else if (myM > c.m * 1.3 && c.m > 9) {
        if (c.o === player && T < player.shield) continue;
        var sc = c.m / (Math.max(0, edge) + 70) * (c.o === player ? o.hate : 1);
        if (sc > pScore) { pScore = sc; prey = c; preyD = edge; }
      }
    }
    if (myM > VM * 1.33) {
      for (i = 0; i < viruses.length; i++) {
        var v = viruses[i]; dx = v.x - cx; dy = v.y - cy; dist = Math.sqrt(dx * dx + dy * dy) || 1;
        edge = dist - v.r - myR;
        if (edge < 70) { w = 0.9 * (1 - Math.max(0, edge) / 70); fx -= dx / dist * w; fy -= dy / dist * w; if (w * 0.6 > threat) threat = w * 0.6; }
      }
    }
    var mw = 120 + myR;
    if (cx < mw) fx += (1 - cx / mw) * 0.7;
    if (cx > WS - mw) fx -= (1 - (WS - cx) / mw) * 0.7;
    if (cy < mw) fy += (1 - cy / mw) * 0.7;
    if (cy > WS - mw) fy -= (1 - (WS - cy) / mw) * 0.7;

    if (threat > 0.12 - s * 0.06) {
      var fl = Math.sqrt(fx * fx + fy * fy) || 1;
      o.tx = cx + fx / fl * 600; o.ty = cy + fy / fl * 600;
      return;
    }
    if (prey && Math.random() < 0.5 + o.aggro * 0.5) {
      var lead = 0.15 + s * 0.2;
      o.tx = prey.x + prey.vx * lead; o.ty = prey.y + prey.vy * lead;
      if (o.cells.length <= 2 && myM >= MIN_SPLIT && myM / 2 > prey.m * 1.3 && preyD < launchDist(myM / 2) * 0.85 &&
          T > o.ai.splitCD && threat < 0.02 && Math.random() < o.aggro) {
        splitOwner(o, o.tx, o.ty);
        o.ai.splitCD = T + rand(6, 11) - o.aggro * 3;
      }
      return;
    }
    var f = findFood(o, cx, cy, 260 + myR);
    if (f >= 0) { o.tx = pX[f]; o.ty = pY[f]; return; }
    if (T > o.ai.wT) { o.ai.wx = rand(300, WS - 300); o.ai.wy = rand(300, WS - 300); o.ai.wT = T + 4; }
    o.tx = o.ai.wx; o.ty = o.ai.wy;
  }
  function findFood(o, cx, cy, R) {
    var prev = o.ai.food;
    if (prev >= 0 && pX[prev] === o.ai.fx && pY[prev] === o.ai.fy && Math.hypot(pX[prev] - cx, pY[prev] - cy) < R) return prev;
    var x0 = clamp(Math.floor((cx - R) / BS), 0, GW - 1), x1 = clamp(Math.floor((cx + R) / BS), 0, GW - 1);
    var y0 = clamp(Math.floor((cy - R) / BS), 0, GW - 1), y1 = clamp(Math.floor((cy + R) / BS), 0, GW - 1);
    var best = -1, bs = 0;
    for (var by = y0; by <= y1; by++) for (var bx = x0; bx <= x1; bx++) {
      var arr = buckets[bx + by * GW];
      for (var k = 0; k < arr.length; k++) {
        var i = arr[k], d = Math.abs(pX[i] - cx) + Math.abs(pY[i] - cy);
        var sc = (pGold[i] ? 5 : 1) / (d + 30);
        if (sc > bs) { bs = sc; best = i; }
      }
    }
    o.ai.food = best;
    if (best >= 0) { o.ai.fx = pX[best]; o.ai.fy = pY[best]; }
    return best;
  }

  /* ================================================================ simulation */
  function sim(dt) {
    T += dt;
    var i, j, c, o;
    // player steering
    if (player && player.alive && state === 'play' && !autoMode) {
      player.tx = cam.x + (ptr.x - W / 2) / cam.z;
      player.ty = cam.y + (ptr.y - H / 2) / cam.z;
    }
    for (i = 0; i < owners.length; i++) {
      o = owners[i];
      if (!o.isBot) continue;
      if (o.alive) { if (T >= o.ai.next) think(o); }
      else if (T >= o.respawn) spawnBot(o, rand(12, 26) + (Math.random() < 0.2 ? rand(20, 60) : 0));
    }
    moveCells(dt);
    resolveOwn(dt);
    eatPellets();
    updateEjected(dt);
    updateViruses(dt);
    eatCells();
    virusPops();
    if (anyDead) cleanup();
    // decay
    for (i = 0; i < cells.length; i++) {
      c = cells[i];
      if (c.m > 300) c.m -= c.m * 0.0011 * dt;
      if (c.o.isBot && c.o.mass > c.o.cap) c.m -= c.m * 0.012 * dt * Math.min(3, c.o.mass / c.o.cap);
      c.r = radius(c.m);
    }
    for (i = 0; i < owners.length; i++) {
      o = owners[i]; if (!o.alive) continue;
      var tm = 0; for (j = 0; j < o.cells.length; j++) tm += o.cells[j].m;
      o.mass = tm;
    }
    lbTimer -= dt;
    if (lbTimer <= 0) { lbTimer = 0.25; updateLeaderboard(); }
    if (player && player.alive && round) trackPlayer(dt);
  }

  function moveCells(dt) {
    var k = Math.min(1, dt * 8), dec = Math.exp(-4.5 * dt);
    for (var i = 0; i < cells.length; i++) {
      var c = cells[i], o = c.o;
      var dx = o.tx - c.x, dy = o.ty - c.y, d = Math.sqrt(dx * dx + dy * dy) + 0.0001;
      var sp = speedFor(c.m) * o.spd;
      var slow = o === player ? Math.min(1, d * cam.z / 90) : Math.min(1, d / 40);
      c.vx += (dx / d * sp * slow - c.vx) * k;
      c.vy += (dy / d * sp * slow - c.vy) * k;
      var mx = c.vx + c.bx, my = c.vy + c.by;
      c.x += mx * dt; c.y += my * dt;
      c.bx *= dec; c.by *= dec;
      var lim = c.r * 0.5;
      if (c.x < lim) { c.x = lim; c.bx = Math.abs(c.bx) * 0.3; } else if (c.x > WS - lim) { c.x = WS - lim; c.bx = -Math.abs(c.bx) * 0.3; }
      if (c.y < lim) { c.y = lim; c.by = Math.abs(c.by) * 0.3; } else if (c.y > WS - lim) { c.y = WS - lim; c.by = -Math.abs(c.by) * 0.3; }
      // visuals
      var spd = Math.sqrt(mx * mx + my * my);
      c.sa = Math.atan2(my, mx);
      c.sq += (Math.min(0.2, spd / 5000 + Math.sqrt(c.bx * c.bx + c.by * c.by) / 6000) - c.sq) * Math.min(1, dt * 10);
      c.rot += c.vx * dt / Math.max(8, c.r);
      var ll = Math.min(1, d / 60);
      c.lx += (dx / d * ll - c.lx) * Math.min(1, dt * 6);
      c.ly += (dy / d * ll - c.ly) * Math.min(1, dt * 6);
      c.wob += (0.028 - c.wob) * Math.min(1, dt * 2.5);
      c.mouth = Math.max(0, c.mouth - dt * 3);
      c.blinkT -= dt;
      if (c.blinkT < 0) { c.blink = 1; if (c.blinkT < -0.13) { c.blink = 0; c.blinkT = rand(2, 5); } }
      c.dr += (c.r - c.dr) * Math.min(1, dt * 9);
    }
  }

  function resolveOwn(dt) {
    for (var oi = 0; oi < owners.length; oi++) {
      var o = owners[oi], L = o.cells;
      if (L.length < 2) continue;
      for (var i = 0; i < L.length; i++) {
        var a = L[i]; if (a.dead) continue;
        for (var j = i + 1; j < L.length; j++) {
          var b = L[j]; if (b.dead) continue;
          var dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy) || 0.01;
          if (T >= a.mergeAt && T >= b.mergeAt) {
            var big = a.m >= b.m ? a : b, sm = big === a ? b : a;
            if (d < big.r - sm.r * 0.25 || d < big.r * 0.6) {
              big.m += sm.m; big.r = radius(big.m); big.wob += 0.1; big.mouth = 0.6;
              sm.dead = true; anyDead = true;
              if (o === player) sfx.merge();
            } else if (d < (a.r + b.r) * 1.6) {
              var pull = Math.min(d, 90 * dt);
              a.x += dx / d * pull * (b.m / (a.m + b.m)); a.y += dy / d * pull * (b.m / (a.m + b.m));
              b.x -= dx / d * pull * (a.m / (a.m + b.m)); b.y -= dy / d * pull * (a.m / (a.m + b.m));
            }
          } else {
            var minD = a.r + b.r;
            if (d < minD && T - a.splitT > 0.28 && T - b.splitT > 0.28) {
              var ov = (minD - d) * 0.55, tm = a.m + b.m;
              a.x -= dx / d * ov * (b.m / tm); a.y -= dy / d * ov * (b.m / tm);
              b.x += dx / d * ov * (a.m / tm); b.y += dy / d * ov * (a.m / tm);
            }
          }
        }
      }
    }
  }

  var pelletSndT = 0, pelletStreak = 0;
  function eatPellets() {
    for (var ci = 0; ci < cells.length; ci++) {
      var c = cells[ci], r = c.r, r2 = r * r;
      var x0 = clamp(Math.floor((c.x - r) / BS), 0, GW - 1), x1 = clamp(Math.floor((c.x + r) / BS), 0, GW - 1);
      var y0 = clamp(Math.floor((c.y - r) / BS), 0, GW - 1), y1 = clamp(Math.floor((c.y + r) / BS), 0, GW - 1);
      var got = 0;
      for (var by = y0; by <= y1; by++) for (var bx = x0; bx <= x1; bx++) {
        var arr = buckets[bx + by * GW];
        for (var k = arr.length - 1; k >= 0; k--) {
          var i = arr[k], dx = pX[i] - c.x, dy = pY[i] - c.y;
          if (dx * dx + dy * dy < r2) {
            var gold = pGold[i];
            c.m += gold ? 6 : 1; got++;
            if (c.o === player) {
              round.pellets++; stats.pellets++;
              if (gold) {
                sfx.gold();
                burst(pX[i], pY[i], 10, ['#ffd23f', '#fff6a8', '#ffb31a'], 260, 6);
                floatText(pX[i], pY[i] - 10, '+6', '#ffb31a', 26);
              }
            }
            removePellet(i); placePellet(i, false);
          }
        }
      }
      if (got) {
        c.mouth = Math.min(1, c.mouth + 0.35 * got); c.r = radius(c.m);
        if (c.o === player && T - pelletSndT > 0.05) {
          pelletSndT = T; pelletStreak = Math.min(pelletStreak + 1, 24);
          sfx.pellet(pelletStreak);
        }
      }
    }
    if (T - pelletSndT > 0.6) pelletStreak = 0;
  }

  function updateEjected(dt) {
    var dec = Math.exp(-5 * dt);
    for (var i = 0; i < ejected.length; i++) {
      var e = ejected[i];
      e.x += e.vx * dt; e.y += e.vy * dt; e.vx *= dec; e.vy *= dec;
      e.x = clamp(e.x, 10, WS - 10); e.y = clamp(e.y, 10, WS - 10);
      // viruses soak up ejected mass
      for (var v = 0; v < viruses.length; v++) {
        var vi = viruses[v], dx = e.x - vi.x, dy = e.y - vi.y;
        if (dx * dx + dy * dy < vi.r * vi.r) {
          e.dead = true; vi.fed++; vi.m = VM + vi.fed * 7; vi.r = radius(vi.m);
          if (vi.fed >= 7) {
            vi.fed = 0; vi.m = VM; vi.r = radius(VM);
            var sp = Math.sqrt(e.vx * e.vx + e.vy * e.vy) || 1, ux = e.vx / sp, uy = e.vy / sp;
            if (sp < 5) { ux = 1; uy = 0; }
            if (viruses.length < AR.vir + 8) {
              var nv = spawnVirus(vi.x + ux * vi.r * 1.2, vi.y + uy * vi.r * 1.2);
              nv.vx = ux * 900; nv.vy = uy * 900;
            }
            if (e.o === player) { stats.virusShots++; sfx.virusShoot(); }
            burst(vi.x, vi.y, 14, ['#3cbf4f', '#7be07a', '#b6f25a'], 300, 8);
          }
          break;
        }
      }
      if (e.dead) continue;
      for (var j = 0; j < cells.length; j++) {
        var c = cells[j];
        if (c.m < 20 || (c.o === e.o && T - e.t < 0.35)) continue;
        var ddx = e.x - c.x, ddy = e.y - c.y, lim = c.r - e.r * 0.3;
        if (ddx * ddx + ddy * ddy < lim * lim) {
          c.m += e.m; c.r = radius(c.m); c.mouth = 1; e.dead = true;
          if (c.o === player) sfx.pellet(10);
          break;
        }
      }
    }
    var n = 0;
    for (i = 0; i < ejected.length; i++) if (!ejected[i].dead) ejected[n++] = ejected[i];
    ejected.length = n;
  }

  function updateViruses(dt) {
    var dec = Math.exp(-3 * dt);
    for (var i = 0; i < viruses.length; i++) {
      var v = viruses[i];
      v.x += v.vx * dt; v.y += v.vy * dt; v.vx *= dec; v.vy *= dec;
      if (v.x < v.r) { v.x = v.r; v.vx = Math.abs(v.vx); } else if (v.x > WS - v.r) { v.x = WS - v.r; v.vx = -Math.abs(v.vx); }
      if (v.y < v.r) { v.y = v.r; v.vy = Math.abs(v.vy); } else if (v.y > WS - v.r) { v.y = WS - v.r; v.vy = -Math.abs(v.vy); }
      v.rot += dt * 0.25;
    }
    for (i = virusQ.length - 1; i >= 0; i--) {
      if (T >= virusQ[i]) { virusQ.splice(i, 1); if (viruses.length < AR.vir) spawnVirus(); }
    }
  }

  function eatCells() {
    var n = cells.length;
    for (var i = 0; i < n; i++) {
      var a = cells[i]; if (a.dead) continue;
      for (var j = i + 1; j < n; j++) {
        var b = cells[j]; if (b.dead || a.o === b.o) continue;
        var dx = b.x - a.x, rr = a.r + b.r;
        if (dx > rr || dx < -rr) continue;
        var dy = b.y - a.y;
        if (dy > rr || dy < -rr) continue;
        var big = a.m >= b.m ? a : b, sm = big === a ? b : a;
        if (big.m < sm.m * 1.25) continue;
        var lim = big.r - sm.r * 0.35;
        if (lim <= 0 || dx * dx + dy * dy > lim * lim) continue;
        if (sm.o === player && T < player.shield) continue;
        eatCell(big, sm);
        if (a.dead) break;
      }
    }
  }

  var comboN = 0, comboT = 0, dbgEats = 0;
  function eatCell(big, sm) {
    big.m += sm.m; big.r = radius(big.m); big.mouth = 1; big.wob += 0.1;
    sm.dead = true; anyDead = true;
    sm.o.lastEater = big.o;
    var col = sm.o.skin.color;
    var onScreen = visible(sm.x, sm.y, sm.r + 50);
    if (onScreen) burst(sm.x, sm.y, Math.min(22, 8 + (sm.r / 6) | 0), [col, BB.light(col), '#ffffff'], 200 + sm.r * 3, Math.max(5, sm.r * 0.18));
    dbgEats++;
    if (big.o === player) {
      round.eaten++; stats.eatenTotal++;
      if (T - big.splitT < 1.5) stats.splitEats++;
      if (T - comboT < 2.5) comboN++; else comboN = 1;
      comboT = T;
      sfx.gulp(sm.m);
      shake.add(Math.min(9, 2 + sm.r * 0.05));
      floatText(sm.x, sm.y, '+' + Math.round(sm.m), '#ffffff', Math.min(46, 24 + sm.m * 0.08));
      var word = COMBO_WORDS[comboN] || (comboN > 4 ? 'لا أحد يوقفك!' : (sm.m > 90 ? 'وجبة ضخمة!' : Kit.pick(EAT_WORDS)));
      floatText(big.x, big.y - big.r - 20 / cam.z, word, comboN > 1 ? '#ffd23f' : '#7cf5c4', comboN > 1 ? 38 : 30, true);
      if (comboN > 1) sfx.combo(comboN);
    } else if (sm.o === player) {
      shake.add(8);
      sfx.ouch();
    }
  }

  function virusPops() {
    for (var i = 0; i < viruses.length; i++) {
      var v = viruses[i]; if (v.dead) continue;
      for (var j = 0; j < cells.length; j++) {
        var c = cells[j]; if (c.dead || c.m < VM * 1.33) continue;
        var dx = c.x - v.x, dy = c.y - v.y, lim = c.r - v.r * 0.4;
        if (lim > 0 && dx * dx + dy * dy < lim * lim) { popCell(c, v); break; }
      }
    }
    var n = 0;
    for (i = 0; i < viruses.length; i++) if (!viruses[i].dead) viruses[n++] = viruses[i];
    viruses.length = n;
  }
  function popCell(c, v) {
    var o = c.o;
    v.dead = true; virusQ.push(T + rand(6, 10));
    c.m += 50;
    var slots = MAXC - o.cells.length, share = c.m * 0.55;
    var n = Math.min(slots, 12, Math.floor(share / 14));
    if (visible(v.x, v.y, v.r + 60)) burst(v.x, v.y, 26, ['#3cbf4f', '#7be07a', '#b6f25a', '#1c7a33'], 420, 9);
    if (n > 0) {
      var each = share / n; c.m -= share;
      var base = Math.random() * TAU;
      for (var k = 0; k < n; k++) {
        var a = base + k / n * TAU + rand(-0.15, 0.15);
        var nc = newCell(o, c.x + Math.cos(a) * c.r * 0.3, c.y + Math.sin(a) * c.r * 0.3, each);
        var sp = launchDist(each) * 4.5 * rand(0.55, 0.9);
        nc.bx = Math.cos(a) * sp; nc.by = Math.sin(a) * sp; nc.splitT = T; nc.wob = 0.15; nc.dr = nc.r * 0.5;
      }
      var mt = T + mergeTime(c.m + share);
      for (k = 0; k < o.cells.length; k++) { o.cells[k].mergeAt = Math.max(o.cells[k].mergeAt, mt); }
      c.splitT = T;
    }
    c.r = radius(c.m); c.wob = 0.2;
    if (o === player) {
      stats.virusPops++; shake.add(14); sfx.virusPop();
      toast('بوووم! تفرّقت!', '#7be07a');
    }
  }

  function cleanup() {
    anyDead = false;
    var n = 0, i;
    for (i = 0; i < cells.length; i++) if (!cells[i].dead) cells[n++] = cells[i];
    cells.length = n;
    for (var oi = 0; oi < owners.length; oi++) {
      var o = owners[oi], L = o.cells, m = 0;
      for (i = 0; i < L.length; i++) if (!L[i].dead) L[m++] = L[i];
      L.length = m;
      if (o.alive && m === 0) ownerDied(o);
    }
  }

  function ownerDied(o) {
    o.alive = false; o.mass = 0;
    var killer = o.lastEater;
    if (o === player) {
      round.killer = killer;
      startDying();
      return;
    }
    o.respawn = T + rand(2, 5);
    if (killer === player && round) {
      toast('التهمت ' + o.name + '!', '#ffd23f');
    }
  }

  function updateLeaderboard() {
    lb.length = 0;
    for (var i = 0; i < owners.length; i++) if (owners[i].alive) lb.push(owners[i]);
    lb.sort(function (a, b) { return b.mass - a.mass; });
    for (i = 0; i < lb.length; i++) lb[i].rank = i + 1;
  }

  /* ================================================================ round tracking & unlocks */
  var saveT = 0;
  function trackPlayer(dt) {
    var m = player.mass;
    if (m > round.maxMass) round.maxMass = m;
    if (player.rank < round.bestRank) round.bestRank = player.rank;
    var key = 'best' + (arenaIdx + 1);
    if (m > stats.best) stats.best = Math.floor(m);
    if (m > stats[key]) stats[key] = Math.floor(m);
    stats.bestA3 = stats.best3;
    if (!round.bestToast && round.prevBest > 30 && m > round.prevBest) { round.bestToast = true; toast('رقم قياسي جديد!', '#ffd23f'); sfx.fanfare(); }
    if (round.eaten > stats.roundEaten) stats.roundEaten = round.eaten;
    var alive = T - round.t0;
    if (alive > stats.maxTime) stats.maxTime = Math.floor(alive);
    if (player.rank === 1) {
      round.kingRun += dt;
      if (round.kingRun > stats.kingTime) stats.kingTime = Math.floor(round.kingRun);
      if (!round.wasKing) { round.wasKing = true; stats.kings++; toast('أنت في المركز الأول!', '#ffd23f'); sfx.fanfare(); }
    } else round.kingRun = 0;
    // danger sense: a blob that can eat (or split-attack) one of your pieces is close
    var dg = 0;
    for (var a = 0; a < cells.length; a++) {
      var c = cells[a]; if (c.o === player) continue;
      for (var b = 0; b < player.cells.length; b++) {
        var pc = player.cells[b]; if (c.m < pc.m * 1.25) continue;
        var reach = c.m > pc.m * 2.6 ? launchDist(c.m / 2) * 0.8 : 110;
        var edge = Math.hypot(c.x - pc.x, c.y - pc.y) - c.r - pc.r;
        if (edge < reach) dg = Math.max(dg, 1 - Math.max(0, edge) / reach);
      }
    }
    if (T < player.shield) dg = 0;
    round.danger += (dg - round.danger) * Math.min(1, dt * 6);
    // arena unlocks
    for (var i = 1; i < ARENAS.length; i++) {
      var need = ARENAS[i].need;
      if (!arenaUnlocked(i) && need.a === arenaIdx && m >= need.m) {
        stats['arena' + (i + 1)] = 1;
        toast('فُتحت ' + ARENAS[i].name + '!', '#36e0d4'); sfx.unlock();
        round.newArena = i;
      }
    }
    round.checkT -= dt;
    if (round.checkT <= 0) { round.checkT = 0.4; checkUnlocks(); }
    saveT -= dt;
    if (saveT <= 0) { saveT = 5; saveStats(); }
    // teaching hint: split
    if (!round.hintSplit && T - round.t0 > 20 && m > 70 && !store.get('hintSplit', false)) {
      round.hintSplit = true; store.set('hintSplit', true);
      toast('اضغط مسافة لتنقسم وتنقضّ!', '#ffffff');
    }
  }
  function checkUnlocks() {
    for (var i = 0; i < BB.SKINS.length; i++) {
      var s = BB.SKINS[i];
      if (!unlockedSet[s.id] && skinUnlocked(s)) {
        unlockedSet[s.id] = 1;
        if (round) round.newSkins.push(s);
        toast('شكل جديد: ' + s.name, '#ff8fd0', s);
        sfx.unlock();
      }
    }
  }
  function nextMassSkin() {
    var best = null;
    for (var i = 0; i < BB.SKINS.length; i++) {
      var s = BB.SKINS[i];
      if (s.unlock.t === 'mass' && !skinUnlocked(s) && (!best || s.unlock.v < best.unlock.v)) best = s;
    }
    return best;
  }

  /* ================================================================ FX */
  var parts = [], floaters = [], toasts = [], confetti = [];
  function visible(x, y, r) {
    var hw = W / 2 / cam.z + r, hh = H / 2 / cam.z + r;
    return x > cam.x - hw && x < cam.x + hw && y > cam.y - hh && y < cam.y + hh;
  }
  function burst(x, y, n, cols, sp, size) {
    for (var i = 0; i < n; i++) {
      if (parts.length >= 420) return;
      var a = Math.random() * TAU, s = sp * rand(0.3, 1);
      parts.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: size * rand(0.6, 1.3), col: cols[(Math.random() * cols.length) | 0], t: 0, life: rand(0.35, 0.7) });
    }
  }
  function floatText(x, y, s, col, size, word) {
    if (floaters.length >= 24) floaters.shift();
    floaters.push({ x: x, y: y, s: s, col: col, size: size, t: 0, life: word ? 1.1 : 0.9, word: !!word });
  }
  function toast(s, col, skin) {
    if (toasts.length >= 4) toasts.shift();
    toasts.push({ s: s, col: col || '#fff', t: 0, skin: skin || null });
  }
  function fxUpdate(dt) {
    var i, n = 0;
    for (i = 0; i < parts.length; i++) {
      var p = parts[i]; p.t += dt;
      if (p.t >= p.life) continue;
      var d = Math.exp(-3 * dt); p.vx *= d; p.vy *= d; p.x += p.vx * dt; p.y += p.vy * dt;
      parts[n++] = p;
    }
    parts.length = n;
    n = 0;
    for (i = 0; i < floaters.length; i++) { var f = floaters[i]; f.t += dt; if (f.t < f.life) floaters[n++] = f; }
    floaters.length = n;
    if (toasts.length) { toasts[0].t += dt; if (toasts[0].t > 1.7) toasts.shift(); }
    n = 0;
    for (i = 0; i < confetti.length; i++) {
      var q = confetti[i]; q.t += dt; q.vy += 300 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.a += q.va * dt;
      if (q.y < H + 20) confetti[n++] = q;
    }
    confetti.length = n;
    shake.update(dt);
  }
  function confettiBurst() {
    var cols = ['#ff5c8a', '#ffd23f', '#3ddc84', '#2fb5ff', '#8e5cff', '#ff7a3d'];
    for (var i = 0; i < 120; i++) confetti.push({ x: rand(0, W), y: rand(-200, -10), vx: rand(-80, 80), vy: rand(0, 160), a: rand(0, 6), va: rand(-8, 8), col: Kit.pick(cols), s: rand(6, 12), t: 0 });
  }

  /* ================================================================ sound */
  var sfx = {
    pellet: function (n) { A.tone({ freq: 520 + n * 28, type: 'sine', dur: 0.045, vol: 0.07 }); },
    gold: function () { Kit.sfx.coin(); },
    gulp: function (m) {
      var f = Math.max(140, 460 - m * 0.8);
      A.tone({ freq: f, to: f * 0.35, type: 'sine', dur: 0.2, vol: 0.34 });
      A.tone({ freq: 880, to: 1500, type: 'triangle', dur: 0.09, vol: 0.14, delay: 0.07 });
    },
    combo: function (n) { for (var i = 0; i < Math.min(n, 5); i++) A.tone({ freq: 660 * Math.pow(1.19, i), type: 'square', dur: 0.07, vol: 0.09, delay: 0.1 + i * 0.05 }); },
    split: function () { A.noise({ dur: 0.18, vol: 0.16, filter: 2800, to: 500 }); A.tone({ freq: 280, to: 720, type: 'triangle', dur: 0.14, vol: 0.2 }); },
    eject: function () { A.tone({ freq: 760, to: 320, type: 'square', dur: 0.05, vol: 0.06 }); },
    merge: function () { A.tone({ freq: 240, to: 520, type: 'sine', dur: 0.16, vol: 0.2 }); },
    virusPop: function () { A.noise({ dur: 0.45, vol: 0.4, filter: 1600, to: 90 }); A.tone({ freq: 300, to: 60, type: 'sawtooth', dur: 0.3, vol: 0.15 }); },
    virusShoot: function () { A.tone({ freq: 200, to: 900, type: 'square', dur: 0.2, vol: 0.14 }); },
    ouch: function () { A.tone({ freq: 500, to: 180, type: 'triangle', dur: 0.2, vol: 0.25 }); },
    eaten: function () { A.noise({ dur: 0.3, vol: 0.3, filter: 1200, to: 100 }); Kit.sfx.lose(); },
    unlock: function () { Kit.sfx.power(); },
    fanfare: function () { Kit.sfx.win(); },
    click: function () { Kit.sfx.click(); }
  };

  /* ================================================================ flow */
  var dyingT = 0;
  function startGame() {
    A.unlock();
    buildWorld(true);
    round = { t0: T, maxMass: START_MASS, bestRank: 99, eaten: 0, pellets: 0, killer: null, prevBest: stats['best' + (arenaIdx + 1)],
      prevBestAll: stats.best, bestToast: false, wasKing: false, kingRun: 0, newSkins: [], newArena: -1, checkT: 0.4, hintSplit: false };
    comboN = 0; timeScale = 1; confetti.length = 0; round.danger = 0;
    state = 'play'; show(null);
    toast(AR.name, AR.theme.border);
    toast('كُل الحبوب لتكبر!', '#ffffff');
    Kit.keys.reset();
    sfx.split();
  }
  function startDying() {
    state = 'dying'; dyingT = 0; timeScale = 0.35;
    sfx.eaten(); shake.add(12);
    stats.rounds++;
    var alive = T - round.t0;
    round.alive = alive;
    checkUnlocks();
    saveStats();
    $('pauseBtn').hidden = true;
  }
  function showOver() {
    state = 'over'; timeScale = 1;
    show('scrOver');
    var k = round.killer;
    killerSkin = k ? k.skin : selSkin;
    $('oTitle').textContent = k ? 'التهمك ' + k.name + '!' : 'انتهت الجولة!';
    $('stMass').textContent = Kit.fmt(round.maxMass);
    var s = Math.floor(round.alive || 0);
    $('stTime').textContent = Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
    $('stRank').textContent = round.bestRank > 90 ? '-' : String(round.bestRank);
    $('stEat').textContent = String(round.eaten);
    var nb = round.maxMass > round.prevBest && round.maxMass > 30;
    $('newBest').hidden = !nb;
    if (nb) { confettiBurst(); setTimeout(function () { if (state === 'over') sfx.fanfare(); }, 250); }
    $('oBest').textContent = 'أفضل كتلة في ' + AR.name + ': ' + Kit.fmt(stats['best' + (arenaIdx + 1)]);
    var un = $('oUnlocks'); un.innerHTML = '';
    var list = round.newSkins.slice(0, 4);
    list.forEach(function (sk) {
      var chip = document.createElement('div'); chip.className = 'chip';
      var c2 = document.createElement('canvas'); c2.width = c2.height = 80;
      drawSkinIcon(c2, sk, false);
      var t = document.createElement('span'); t.textContent = 'جديد: ' + sk.name;
      chip.appendChild(c2); chip.appendChild(t); un.appendChild(chip);
    });
    if (round.newSkins.length > 4) { var more = document.createElement('div'); more.className = 'chip'; more.textContent = 'و' + (round.newSkins.length - 4) + ' أشكال أخرى'; un.appendChild(more); }
    if (round.newArena > 0) { var ac = document.createElement('div'); ac.className = 'chip'; ac.textContent = '🎉 فُتحت ' + ARENAS[round.newArena].name; un.appendChild(ac); }
    $('oGoal').innerHTML = goalHTML();
  }
  function goalHTML() {
    var lines = [];
    var s = nextMassSkin();
    if (s) {
      var left = s.unlock.v - Math.floor(round.maxMass);
      if (left > 0 && round.maxMass >= s.unlock.v * 0.7) lines.push('كدت تصل! ينقصك ' + left + ' فقط لتفتح «' + esc(s.name) + '»');
      else lines.push('اوصل إلى كتلة ' + s.unlock.v + ' لتفتح «' + esc(s.name) + '»');
    }
    for (var i = 1; i < ARENAS.length; i++) {
      if (!arenaUnlocked(i) && ARENAS[i].need.a === arenaIdx) { lines.push('اوصل إلى ' + ARENAS[i].need.m + ' هنا لتفتح ' + ARENAS[i].name); break; }
    }
    return lines.map(function (l) { return '<div>' + l + '</div>'; }).join('');
  }
  function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }

  function toMenu() {
    state = 'title'; timeScale = 1; round = null;
    buildWorld(false);
    show('scrTitle');
    refreshTitle();
  }
  function pauseGame() { if (state !== 'play') return; state = 'pause'; saveStats(); show('scrPause'); Kit.keys.reset(); }
  function resumeGame() { if (state !== 'pause') return; state = 'play'; show(null); Kit.keys.reset(); }

  function show(id) {
    ['scrTitle', 'scrSkins', 'scrPause', 'scrOver'].forEach(function (s) { $(s).hidden = s !== id; });
    $('pauseBtn').hidden = !(id === null && state === 'play');
  }

  /* ================================================================ title UI */
  var prevCv = $('skinPrev'), prevCtx = prevCv.getContext('2d');
  var killCv = $('killerCv'), killCtx = killCv.getContext('2d');
  var killerSkin = null;
  var fake = { t: 0, phase: 0, wob: 0.04, sa: 0, sq: 0, rot: 0, lx: 0, ly: 0.1, blink: 0, mouth: 0, skin: null };

  function drawSkinIcon(canvas, skin, locked) {
    var g = canvas.getContext('2d'), s = canvas.width;
    g.clearRect(0, 0, s, s);
    fake.t = 0; fake.phase = 0; fake.wob = 0.02; fake.sa = 0; fake.sq = 0; fake.lx = 0; fake.ly = 0.1; fake.blink = 0; fake.mouth = 0; fake.rot = 0; fake.skin = skin; fake.pts = 40;
    BB.drawBlob(g, s / 2, s / 2, s * 0.4, fake);
  }
  function refreshTitle() {
    var s = BB.SKINS[browse];
    $('skName').textContent = s.name;
    var lk = $('skLock');
    if (skinUnlocked(s)) { lk.textContent = s === selSkin ? '✔ هذا شكلك' : 'انقر لتختاره'; lk.className = 'ok'; }
    else { lk.textContent = '🔒 ' + skinReq(s); lk.className = ''; }
    $('skCount').textContent = countUnlocked() + '/' + BB.SKINS.length;
    buildArenaList();
  }
  function buildArenaList() {
    var el = $('arenaList'); el.innerHTML = '';
    ARENAS.forEach(function (a, i) {
      var un = arenaUnlocked(i);
      var b = document.createElement('button');
      b.type = 'button'; b.tabIndex = -1;
      b.className = 'arena' + (i === arenaIdx ? ' sel' : '') + (un ? '' : ' locked');
      b.style.setProperty('--ac', a.theme.border);
      var best = stats['best' + (i + 1)];
      var sub = un ? (best > 0 ? 'أفضل كتلة: ' + Kit.fmt(best) : 'جديدة! جرّبها') : '🔒 اوصل إلى ' + a.need.m + ' في ' + ARENAS[a.need.a].name;
      b.innerHTML = '<span class="adot">' + (un ? (i + 1) : '🔒') + '</span><span class="atx"><b>' + a.name +
        ' <span class="diff">' + a.diff + '</span></b><small>' + sub + '</small></span>';
      b.addEventListener('click', function () {
        b.blur();
        if (!arenaUnlocked(i)) { sfx.ouch(); return; }
        sfx.click();
        if (arenaIdx !== i) { arenaIdx = i; store.set('arena', i); buildWorld(false); }
        refreshTitle();
      });
      el.appendChild(b);
    });
  }
  function browseSkin(d) {
    browse = (browse + d + BB.SKINS.length) % BB.SKINS.length;
    var s = BB.SKINS[browse];
    if (skinUnlocked(s)) { selSkin = s; store.set('skin', s.id); }
    sfx.click(); refreshTitle();
    prevBounce = 1;
  }
  var prevBounce = 0;

  function buildSkinGrid() {
    var grid = $('skinGrid'); grid.innerHTML = '';
    BB.SKINS.forEach(function (s) {
      var un = skinUnlocked(s);
      var b = document.createElement('button');
      b.type = 'button'; b.tabIndex = -1;
      b.className = 'sk' + (un ? '' : ' locked') + (s === selSkin ? ' sel' : '');
      var c2 = document.createElement('canvas'); c2.width = c2.height = 120;
      drawSkinIcon(c2, s, !un);
      b.appendChild(c2);
      if (!un) { var l = document.createElement('span'); l.className = 'lk'; l.textContent = '🔒'; b.appendChild(l); }
      else if (seenSkins.indexOf(s.id) < 0) { var nw = document.createElement('span'); nw.className = 'nw'; nw.textContent = 'جديد'; b.appendChild(nw); }
      var info = function () {
        $('skinInfo').innerHTML = '<b>' + esc(s.name) + '</b> — ' + (un ? '<span class="have">' + (s === selSkin ? 'هذا شكلك ✔' : 'انقر لتختاره') + '</span>' : '<span class="req">🔒 ' + esc(skinReq(s)) + '</span>');
      };
      b.addEventListener('mouseenter', info);
      b.addEventListener('click', function () {
        b.blur();
        if (!un) { sfx.ouch(); info(); return; }
        selSkin = s; browse = s.index; store.set('skin', s.id); sfx.click();
        buildSkinGrid(); info();
      });
      grid.appendChild(b);
    });
    $('skCount2').textContent = countUnlocked() + '/' + BB.SKINS.length;
  }
  function openSkins() {
    state = 'skins'; show('scrSkins'); buildSkinGrid();
    $('skinInfo').innerHTML = 'مرّر الفأرة على شكل لترى كيف تفتحه';
    seenSkins = BB.SKINS.filter(skinUnlocked).map(function (s) { return s.id; });
    store.set('seen', seenSkins);
  }
  function closeSkins() { state = 'title'; show('scrTitle'); refreshTitle(); }

  function btn(id, fn) {
    var b = $(id);
    b.addEventListener('click', function (e) { e.stopPropagation(); b.blur(); A.unlock(); fn(); });
  }
  btn('btnPlay', function () { if (state === 'title') { sfx.click(); startGame(); } });
  btn('skPrev', function () { browseSkin(-1); });
  btn('skNext', function () { browseSkin(1); });
  btn('btnSkins', function () { sfx.click(); openSkins(); });
  btn('btnSkinsBack', function () { sfx.click(); closeSkins(); });
  btn('btnResume', function () { sfx.click(); resumeGame(); });
  btn('btnRestart', function () { sfx.click(); startGame(); });
  btn('btnMenu1', function () { sfx.click(); toMenu(); });
  btn('btnAgain', function () { sfx.click(); startGame(); });
  btn('btnMenu2', function () { sfx.click(); toMenu(); });
  var pauseBtn = $('pauseBtn');
  document.body.appendChild(pauseBtn);
  btn('pauseBtn', function () { if (state === 'play') { sfx.click(); pauseGame(); } });
  prevCv.addEventListener('click', function () { var s = BB.SKINS[browse]; if (skinUnlocked(s)) { selSkin = s; store.set('skin', s.id); sfx.click(); refreshTitle(); prevBounce = 1; } });
  Kit.muteButton();
  document.addEventListener('visibilitychange', function () { if (document.hidden && state === 'play') pauseGame(); });
  window.addEventListener('pagehide', saveStats);
  window.addEventListener('beforeunload', saveStats);

  /* ================================================================ input + update */
  var ejectT = 0;
  function update(dt) {
    realT += dt;
    var K = Kit.keys;
    if (state === 'title') {
      if (K.pressed('Enter') || K.pressed('NumpadEnter') || K.pressed('Space')) startGame();
      else if (K.pressed('ArrowLeft')) browseSkin(1);
      else if (K.pressed('ArrowRight')) browseSkin(-1);
    } else if (state === 'skins') {
      if (K.pressed('Escape') || K.pressed('Enter')) closeSkins();
    } else if (state === 'play') {
      if (K.pressed('KeyP') || K.pressed('Escape')) pauseGame();
      else {
        if (K.pressed('Space') && player.alive) { if (splitOwner(player, player.tx, player.ty)) { sfx.split(); shake.add(2); } }
        if (K.down('KeyW') && player.alive && T >= ejectT) { ejectT = T + 0.1; if (ejectOwner(player, player.tx, player.ty)) sfx.eject(); }
      }
    } else if (state === 'pause') {
      if (K.pressed('KeyP') || K.pressed('Escape')) resumeGame();
      else if (K.pressed('KeyR')) startGame();
    } else if (state === 'dying') {
      dyingT += dt;
      if (dyingT > 1.4) showOver();
    } else if (state === 'over') {
      if (K.pressed('Enter') || K.pressed('NumpadEnter') || K.pressed('Space') || K.pressed('KeyR')) startGame();
      else if (K.pressed('Escape')) toMenu();
    }
    if (state !== 'pause') {
      sim(dt * timeScale);
      fxUpdate(dt * (state === 'dying' ? 0.6 : 1));
      updateCam(dt);
    }
    K.endFrame(); ptr.endFrame();
  }

  function updateCam(dt) {
    var tx = cam.x, ty = cam.y, tz = cam.z;
    if (player && player.alive && (state === 'play' || state === 'pause')) {
      ownerCenter(player, tmpC);
      tx = tmpC.x; ty = tmpC.y;
      var x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (var i = 0; i < player.cells.length; i++) {
        var c = player.cells[i];
        x0 = Math.min(x0, c.x - c.r); x1 = Math.max(x1, c.x + c.r); y0 = Math.min(y0, c.y - c.r); y1 = Math.max(y1, c.y + c.r);
      }
      tz = Math.min(1.1 * Math.pow(tmpC.m / START_MASS, -0.19), W / (x1 - x0 + 700), H / (y1 - y0 + 420));
      tz = clamp(tz, 0.2, 1.15);
    } else {
      var f = null;
      if ((state === 'dying' || state === 'over') && round && round.killer && round.killer.alive) f = round.killer;
      else {
        if (!cam.follow || !cam.follow.alive || realT > cam.followT) {
          cam.follow = lb[(Math.random() * Math.min(4, lb.length)) | 0] || null; cam.followT = realT + 14;
        }
        f = cam.follow;
      }
      if (f && f.alive) {
        ownerCenter(f, tmpC); tx = tmpC.x; ty = tmpC.y;
        tz = state === 'dying' ? clamp(1.25 * Math.pow(tmpC.m / START_MASS, -0.19), 0.25, 1.2) : clamp(0.9 * Math.pow(tmpC.m / START_MASS, -0.19), 0.22, 0.7);
      }
    }
    var k = Math.min(1, dt * (state === 'play' ? 6 : 2.5));
    cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k;
    cam.z += (tz - cam.z) * Math.min(1, dt * 2.2);
  }

  /* ================================================================ rendering */
  var virusCv = document.createElement('canvas'); virusCv.width = virusCv.height = 200;
  (function paintVirus() {
    var g = virusCv.getContext('2d'); g.translate(100, 100);
    var n = 22, i, a, r;
    g.beginPath();
    for (i = 0; i < n * 2; i++) { a = i / (n * 2) * TAU; r = i % 2 ? 72 : 92; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    g.closePath(); g.fillStyle = '#2fae4a'; g.fill();
    g.lineJoin = 'round'; g.lineWidth = 6; g.strokeStyle = '#1a7331'; g.stroke();
    var gr = g.createRadialGradient(-22, -26, 8, 0, 0, 76);
    gr.addColorStop(0, '#9af07f'); gr.addColorStop(1, '#3cbf4f');
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 72, 0, TAU); g.fill();
    g.fillStyle = 'rgba(30,120,50,0.35)';
    [[-34, 26, 13], [30, 34, 10], [38, -18, 12], [-8, 46, 8], [-44, -8, 8]].forEach(function (p) { g.beginPath(); g.arc(p[0], p[1], p[2], 0, TAU); g.fill(); });
    g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.ellipse(-26, -34, 20, 10, -0.6, 0, TAU); g.fill();
    // grumpy-cute face
    g.fillStyle = '#16401f';
    g.beginPath(); g.arc(-18, -4, 7, 0, TAU); g.arc(18, -4, 7, 0, TAU); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(-20, -7, 2.5, 0, TAU); g.arc(16, -7, 2.5, 0, TAU); g.fill();
    g.strokeStyle = '#16401f'; g.lineWidth = 4; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-28, -18); g.lineTo(-10, -13); g.moveTo(28, -18); g.lineTo(10, -13); g.stroke();
    g.beginPath(); g.moveTo(-10, 16); g.lineTo(-4, 12); g.lineTo(2, 16); g.lineTo(8, 12); g.lineTo(12, 16); g.stroke();
  })();

  var visList = new Int32Array(MAXP);
  var drawList = [];
  var bo = { t: 0, phase: 0, wob: 0, sa: 0, sq: 0, pts: 20, blink: 0, mouth: 0 };

  function drawCell(g, c, z) {
    var skin = c.o.skin, col = skin.color, r = c.dr, zr = r * z, x = c.x, y = c.y;
    if (zr < 4) { g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); return; }
    bo.t = T; bo.phase = c.phase; bo.wob = c.wob; bo.sa = c.sa; bo.sq = c.sq; bo.blink = c.blink; bo.mouth = c.mouth;
    bo.pts = clamp(Math.round(zr / 2.4), 12, 48);
    BB.blobPath(g, x, y, r, bo);
    g.fillStyle = col; g.fill();
    var tex = skin.tex ? BB.texture(skin.tex) : null;
    if (tex && zr > 7) {
      g.save(); g.clip(); g.translate(x, y); if (skin.roll) g.rotate(c.rot);
      var s = r * 1.08; g.drawImage(tex, -s, -s, s * 2, s * 2);
      g.restore();
    }
    g.lineWidth = Math.max(1.5 / z, r * 0.075); g.strokeStyle = BB.dark(col); g.stroke();
    if (zr > 9) {
      g.fillStyle = 'rgba(255,255,255,0.3)';
      g.beginPath(); g.ellipse(x - r * 0.38, y - r * 0.42, r * 0.26, r * 0.15, -0.6, 0, TAU); g.fill();
    }
    if (zr > 10 && skin.face !== 'none') {
      g.save(); g.translate(x, y);
      BB.drawFace(g, skin.face || 'eyes', r, c.lx, c.ly, bo);
      g.restore();
    }
  }

  function drawName(g, c, z, myBig) {
    var r = c.dr, size = r * 0.3;
    if (size * z < 10) return;
    if (size * z > 34) size = 34 / z;
    var col = '#ffffff';
    if (myBig && c.o !== player) {
      if (myBig.m > c.m * 1.25) col = '#8dffb8';
      else if (c.m > myBig.m * 1.25) col = '#ff9a9a';
    }
    g.font = '700 ' + size.toFixed(1) + 'px ' + FONT;
    g.direction = 'rtl'; g.textAlign = 'center'; g.textBaseline = 'middle';
    var y = c.y + r * 0.66;
    g.lineJoin = 'round'; g.lineWidth = size * 0.24; g.strokeStyle = 'rgba(25,28,55,0.9)';
    g.strokeText(c.o.name, c.x, y); g.fillStyle = col; g.fillText(c.o.name, c.x, y);
  }

  function drawCrown(g, x, y, s) {
    g.beginPath();
    g.moveTo(x - s, y + s * 0.5); g.lineTo(x - s * 1.05, y - s * 0.45); g.lineTo(x - s * 0.5, y + s * 0.05);
    g.lineTo(x, y - s * 0.7); g.lineTo(x + s * 0.5, y + s * 0.05); g.lineTo(x + s * 1.05, y - s * 0.45); g.lineTo(x + s, y + s * 0.5);
    g.closePath(); g.fillStyle = '#ffd23f'; g.fill();
    g.lineJoin = 'round'; g.lineWidth = s * 0.14; g.strokeStyle = '#b87b00'; g.stroke();
    g.fillStyle = '#ff4f5e'; g.beginPath(); g.arc(x, y + s * 0.15, s * 0.16, 0, TAU); g.fill();
  }

  function render() {
    var g = ctx, sc = view.scale * view.dpr, th = AR.theme, z = cam.z;
    g.setTransform(sc, 0, 0, sc, 0, 0);
    g.fillStyle = th.out; g.fillRect(0, 0, W, H);
    g.save();
    g.translate(W / 2 + shake.x, H / 2 + shake.y); g.scale(z, z); g.translate(-cam.x, -cam.y);
    var vx0 = cam.x - W / 2 / z, vx1 = cam.x + W / 2 / z, vy0 = cam.y - H / 2 / z, vy1 = cam.y + H / 2 / z;
    // arena floor + grid
    var fx0 = Math.max(0, vx0), fx1 = Math.min(WS, vx1), fy0 = Math.max(0, vy0), fy1 = Math.min(WS, vy1);
    g.fillStyle = th.bg; g.fillRect(fx0, fy0, fx1 - fx0, fy1 - fy0);
    var step = z > 0.55 ? 50 : z > 0.3 ? 100 : 200, x, y;
    g.beginPath();
    for (x = Math.ceil(fx0 / step) * step; x <= fx1; x += step) { g.moveTo(x, fy0); g.lineTo(x, fy1); }
    for (y = Math.ceil(fy0 / step) * step; y <= fy1; y += step) { g.moveTo(fx0, y); g.lineTo(fx1, y); }
    g.lineWidth = 2 / z; g.strokeStyle = th.grid; g.stroke();
    g.lineWidth = 14; g.strokeStyle = th.border; g.strokeRect(-7, -7, WS + 14, WS + 14);

    // pellets (only visible buckets, batched by colour)
    var bx0 = clamp(Math.floor(vx0 / BS), 0, GW - 1), bx1 = clamp(Math.floor(vx1 / BS), 0, GW - 1);
    var by0 = clamp(Math.floor(vy0 / BS), 0, GW - 1), by1 = clamp(Math.floor(vy1 / BS), 0, GW - 1);
    var nv = 0, i, k, p;
    for (var by = by0; by <= by1; by++) for (var bx = bx0; bx <= bx1; bx++) {
      var arr = buckets[bx + by * GW];
      for (k = 0; k < arr.length; k++) visList[nv++] = arr[k];
    }
    for (var ci = 0; ci < PCOLS.length; ci++) {
      g.beginPath();
      for (k = 0; k < nv; k++) {
        p = visList[k]; if (pCol[p] !== ci || pGold[p]) continue;
        var pr = 7 * clamp((T - pBorn[p]) * 3, 0, 1);
        g.moveTo(pX[p] + pr, pY[p]); g.arc(pX[p], pY[p], pr, 0, TAU);
      }
      g.fillStyle = PCOLS[ci]; g.fill();
    }
    if (z > 0.3) {
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.beginPath();
      for (k = 0; k < nv; k++) { p = visList[k]; if (pGold[p] || T - pBorn[p] < 0.4) continue; g.moveTo(pX[p], pY[p] - 2.2); g.arc(pX[p] - 2.2, pY[p] - 2.2, 2.2, 0, TAU); }
      g.fill();
    }
    for (k = 0; k < nv; k++) {
      p = visList[k]; if (!pGold[p]) continue;
      var gs = (11 + Math.sin(T * 6 + p) * 2) * clamp((T - pBorn[p]) * 3, 0, 1);
      g.fillStyle = 'rgba(255,210,63,0.35)'; g.beginPath(); g.arc(pX[p], pY[p], gs * 1.6, 0, TAU); g.fill();
      starPath(g, pX[p], pY[p], gs, gs * 0.45, 5, T * 1.5 + p);
      g.fillStyle = '#ffd23f'; g.fill(); g.lineWidth = 2.5; g.strokeStyle = '#d18a00'; g.stroke();
    }

    // ejected blobs
    for (i = 0; i < ejected.length; i++) {
      var e = ejected[i];
      if (e.x < vx0 - 30 || e.x > vx1 + 30 || e.y < vy0 - 30 || e.y > vy1 + 30) continue;
      g.beginPath(); g.arc(e.x, e.y, e.r, 0, TAU); g.fillStyle = e.col; g.fill();
      g.lineWidth = 3; g.strokeStyle = BB.dark(e.col); g.stroke();
    }

    // cells + viruses sorted by mass
    drawList.length = 0;
    for (i = 0; i < cells.length; i++) {
      var c = cells[i], rr = c.dr + 10;
      if (c.x + rr < vx0 || c.x - rr > vx1 || c.y + rr < vy0 || c.y - rr > vy1) continue;
      drawList.push(c);
    }
    for (i = 0; i < viruses.length; i++) {
      var v = viruses[i], vr = v.r * 1.3;
      if (v.x + vr < vx0 || v.x - vr > vx1 || v.y + vr < vy0 || v.y - vr > vy1) continue;
      drawList.push(v);
    }
    drawList.sort(function (a, b) { return a.m - b.m || (a.id || 0) - (b.id || 0); });
    var myBig = null;
    if (player && player.alive) for (i = 0; i < player.cells.length; i++) if (!myBig || player.cells[i].m > myBig.m) myBig = player.cells[i];
    for (i = 0; i < drawList.length; i++) {
      var d = drawList[i];
      if (d.o) {
        drawCell(g, d, z);
        drawName(g, d, z, myBig);
        if (d.o === player && T < player.shield) {
          var sa = Math.min(1, (player.shield - T) * 1.5);
          g.save(); g.globalAlpha = 0.8 * sa; g.setLineDash([12, 10]); g.lineDashOffset = -T * 40;
          g.lineWidth = 4 / z; g.strokeStyle = '#2fb5ff'; g.beginPath(); g.arc(d.x, d.y, d.dr + 10 / z, 0, TAU); g.stroke();
          g.restore();
        }
      } else {
        var s = d.r / 72 * (1 + (T - d.born < 0.4 ? (0.4 - (T - d.born)) : 0));
        g.save(); g.translate(d.x, d.y); g.rotate(Math.sin(d.rot * 2) * 0.12); g.scale(s, s);
        g.drawImage(virusCv, -100, -100); g.restore();
      }
    }
    // crown on #1
    if (lb.length && lb[0].alive) {
      ownerCenter(lb[0], tmpC);
      var cb = tmpC.big;
      if (cb) drawCrown(g, cb.x, cb.y - cb.dr - Math.max(14, cb.dr * 0.18) + Math.sin(T * 3) * 3, Math.max(14, cb.dr * 0.25));
    }
    // particles
    for (i = 0; i < parts.length; i++) {
      var q = parts[i], life = 1 - q.t / q.life;
      g.globalAlpha = life; g.fillStyle = q.col;
      g.beginPath(); g.arc(q.x, q.y, q.r * (0.5 + life * 0.5), 0, TAU); g.fill();
    }
    g.globalAlpha = 1;
    g.restore();

    // floaters (screen space)
    for (i = 0; i < floaters.length; i++) {
      var f = floaters[i], fx = (f.x - cam.x) * z + W / 2, fy = (f.y - cam.y) * z + H / 2 - f.t * 50;
      var pop = f.t < 0.15 ? 0.6 + f.t / 0.15 * 0.5 : 1.1 - Math.min(0.1, (f.t - 0.15));
      g.globalAlpha = Math.min(1, (f.life - f.t) * 3);
      text(g, f.s, fx, fy, f.size * pop, f.col, 'center', f.size * 0.2);
    }
    g.globalAlpha = 1;
    if (state === 'play' || state === 'pause' || state === 'dying') drawHUD(g);
    // toasts
    if (toasts.length && state !== 'title' && state !== 'skins') {
      var t0 = toasts[0], tp = t0.t, sc2 = tp < 0.2 ? 0.5 + tp / 0.2 * 0.6 : tp < 0.3 ? 1.1 - (tp - 0.2) : 1;
      g.globalAlpha = Math.min(1, (1.7 - tp) * 3);
      var ty = state === 'over' ? 40 : 180;
      text(g, t0.s, W / 2, ty, 46 * sc2, t0.col, 'center', 10);
      g.globalAlpha = 1;
    }
    // confetti
    for (i = 0; i < confetti.length; i++) {
      var cf = confetti[i];
      g.save(); g.translate(cf.x, cf.y); g.rotate(cf.a); g.fillStyle = cf.col; g.fillRect(-cf.s / 2, -cf.s / 4, cf.s, cf.s / 2); g.restore();
    }
    // DOM canvases
    if (state === 'title') drawPreview();
    if (state === 'over') drawKiller();
  }

  function starPath(g, x, y, r1, r2, n, rot) {
    g.beginPath();
    for (var i = 0; i < n * 2; i++) { var a = rot + i / (n * 2) * TAU, r = i % 2 ? r2 : r1; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
    g.closePath();
  }

  function text(g, s, x, y, size, col, align, stroke) {
    g.font = '700 ' + Math.round(size) + 'px ' + FONT;
    g.direction = 'rtl'; g.textAlign = align; g.textBaseline = 'middle';
    if (stroke) { g.lineJoin = 'round'; g.lineWidth = stroke; g.strokeStyle = 'rgba(25,28,55,0.9)'; g.strokeText(s, x, y); }
    g.fillStyle = col; g.fillText(s, x, y);
  }
  function rrect(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }

  function drawHUD(g) {
    if (round && round.danger > 0.04 && state === 'play') {
      var da = round.danger * (0.6 + 0.4 * Math.sin(realT * 12));
      var vg = g.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.62);
      vg.addColorStop(0, 'rgba(255,40,60,0)'); vg.addColorStop(1, 'rgba(255,40,60,' + (0.45 * da).toFixed(3) + ')');
      g.fillStyle = vg; g.fillRect(0, 0, W, H);
    }
    // ---- leaderboard (top-left)
    var n = Math.min(10, lb.length), lx = 14, ly = 14, lw = 232, rowH = 25;
    var inTop = player && player.alive && player.rank <= 10;
    var lh = 46 + n * rowH + (inTop || !player || !player.alive ? 0 : rowH + 6) + 6;
    g.fillStyle = 'rgba(25,30,62,0.55)'; rrect(g, lx, ly, lw, lh, 16); g.fill();
    text(g, 'المتصدّرون', lx + lw / 2, ly + 22, 22, '#ffd23f', 'center', 0);
    for (var i = 0; i < n; i++) {
      var o = lb[i], y = ly + 48 + i * rowH + rowH / 2 - 4, me = o === player;
      if (me) { g.fillStyle = 'rgba(255,210,63,0.25)'; rrect(g, lx + 6, y - rowH / 2 + 1, lw - 12, rowH - 2, 8); g.fill(); }
      rowText(g, i + 1, o.name, lx, lw, y, me, o.skin.color);
    }
    if (!inTop && player && player.alive) {
      var y2 = ly + 48 + n * rowH + 6 + rowH / 2 - 4;
      g.fillStyle = 'rgba(255,210,63,0.25)'; rrect(g, lx + 6, y2 - rowH / 2 + 1, lw - 12, rowH - 2, 8); g.fill();
      rowText(g, player.rank, player.name, lx, lw, y2, true, player.skin.color);
    }

    if (!player) return;
    // ---- mass (top centre)
    var mass = Math.floor(player.alive ? player.mass : 0);
    g.fillStyle = 'rgba(25,30,62,0.55)'; rrect(g, W / 2 - 150, 10, 300, 60, 22); g.fill();
    text(g, 'الكتلة ' + mass, W / 2, 41, 36, '#ffffff', 'center', 0);
    // rank chip
    if (player.alive) text(g, 'المركز ' + player.rank + ' من ' + lb.length, W / 2, 86, 20, '#ffffff', 'center', 5);
    // next skin progress
    var ns = nextMassSkin();
    if (ns) {
      var bw = 230, bx = W / 2 - bw / 2, byy = 104, pr = clamp(mass / ns.unlock.v, 0, 1);
      g.fillStyle = 'rgba(25,30,62,0.5)'; rrect(g, bx, byy, bw, 14, 7); g.fill();
      g.fillStyle = '#ff8fd0'; rrect(g, bx + 2, byy + 2, Math.max(10, (bw - 4) * pr), 10, 5); g.fill();
      text(g, 'الشكل التالي: ' + ns.name + ' عند ' + ns.unlock.v, W / 2, byy + 30, 16, '#ffffff', 'center', 4);
    }
    // ---- minimap (bottom-right)
    var ms = 150, mx = W - ms - 14, my = H - ms - 14, k = ms / WS;
    g.fillStyle = 'rgba(25,30,62,0.45)'; rrect(g, mx - 4, my - 4, ms + 8, ms + 8, 12); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(mx, my, ms, ms);
    g.strokeStyle = 'rgba(40,50,90,0.2)'; g.lineWidth = 1; g.beginPath();
    for (i = 1; i < 5; i++) { g.moveTo(mx + i * ms / 5, my); g.lineTo(mx + i * ms / 5, my + ms); g.moveTo(mx, my + i * ms / 5); g.lineTo(mx + ms, my + i * ms / 5); }
    g.stroke();
    g.fillStyle = '#3cbf4f';
    for (i = 0; i < viruses.length; i++) { g.beginPath(); g.arc(mx + viruses[i].x * k, my + viruses[i].y * k, 2.2, 0, TAU); g.fill(); }
    if (lb.length && lb[0] !== player && lb[0].alive) {
      ownerCenter(lb[0], tmpC); drawCrown(g, mx + tmpC.x * k, my + tmpC.y * k, 7);
    }
    if (player.alive) {
      var vw = W / cam.z * k, vh = H / cam.z * k;
      g.strokeStyle = 'rgba(40,50,90,0.6)'; g.lineWidth = 1.5; g.strokeRect(mx + cam.x * k - vw / 2, my + cam.y * k - vh / 2, vw, vh);
      for (i = 0; i < player.cells.length; i++) {
        var c = player.cells[i];
        g.beginPath(); g.arc(mx + c.x * k, my + c.y * k, Math.max(3.5, c.r * k), 0, TAU);
        g.fillStyle = player.skin.color; g.fill(); g.lineWidth = 2; g.strokeStyle = '#fff'; g.stroke();
      }
    }
    // ---- controls hint (bottom-left)
    hintRow(g, 14, H - 50, 'مسافة', 'انقسم');
    hintRow(g, 14, H - 20, 'W', 'اقذف');
  }
  function rowText(g, num, name, lx, lw, y, me, col) {
    var right = lx + lw - 14;
    text(g, String(num), right, y, 18, me ? '#ffd23f' : '#c9d0ff', 'right', 0);
    g.fillStyle = col; g.beginPath(); g.arc(right - 34, y, 7, 0, TAU); g.fill();
    g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,0.8)'; g.stroke();
    text(g, name, right - 48, y, 18, me ? '#ffd23f' : '#ffffff', 'right', 0);
  }
  function hintRow(g, x, y, key, label) {
    g.font = '700 16px ' + FONT;
    g.direction = 'rtl';
    var lw = g.measureText(label).width;
    var kw = Math.max(32, g.measureText(key).width + 18);
    g.globalAlpha = 0.85;
    text(g, label, x, y, 17, '#ffffff', 'left', 5);
    g.globalAlpha = 1;
    var kx = x + lw + 10;
    g.fillStyle = '#9aa3c7'; rrect(g, kx, y - 11, kw, 25, 7); g.fill();
    g.fillStyle = '#ffffff'; rrect(g, kx, y - 13, kw, 24, 7); g.fill();
    text(g, key, kx + kw / 2, y - 1, 15, '#1d2340', 'center', 0);
  }

  function drawPreview() {
    var g = prevCtx, s = prevCv.width, sk = BB.SKINS[browse], un = skinUnlocked(sk);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, s, s);
    prevBounce = Math.max(0, prevBounce - 1 / 30);
    var r = s * 0.36 * (1 + Math.sin(prevBounce * 12) * prevBounce * 0.12);
    fake.t = realT; fake.phase = 1; fake.wob = 0.035; fake.sa = -Math.PI / 2; fake.sq = Math.sin(realT * 3) * 0.04;
    fake.rot = realT * 0.8; fake.lx = Math.sin(realT * 0.9) * 0.7; fake.ly = Math.cos(realT * 0.6) * 0.3;
    fake.blink = (realT % 3.3) < 0.12 ? 1 : 0; fake.mouth = 0; fake.skin = sk; fake.pts = 48;
    g.fillStyle = 'rgba(20,30,60,0.12)'; g.beginPath(); g.ellipse(s / 2, s * 0.9, r * 0.8, r * 0.14, 0, 0, TAU); g.fill();
    g.save();
    if (!un) g.globalAlpha = 0.35;
    BB.drawBlob(g, s / 2, s / 2 - 4 + Math.sin(realT * 3) * 4, r, fake);
    g.restore();
    if (!un) {
      g.font = '700 64px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.direction = 'ltr';
      g.fillStyle = '#23284a'; g.fillText('?', s / 2, s / 2);
    }
  }
  function drawKiller() {
    var g = killCtx, s = killCv.width;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, s, s);
    fake.t = realT; fake.phase = 2; fake.wob = 0.05; fake.sa = 0; fake.sq = 0; fake.rot = realT; fake.lx = 0; fake.ly = 0.3;
    fake.blink = 0; fake.mouth = 0.5 + Math.sin(realT * 8) * 0.5; fake.skin = killerSkin || selSkin; fake.pts = 40;
    BB.drawBlob(g, s / 2, s / 2, s * 0.4, fake);
  }

  /* ================================================================ boot */
  buildWorld(false);
  refreshTitle();
  show('scrTitle');
  Kit.loop(update, render);
  try { document.fonts.load('700 40px Fredoka', 'ب'); } catch (e) { /* ignore */ }

  /* debug hook for automated checks */
  window.__game = {
    info: function () {
      return { state: state, arena: arenaIdx, T: +T.toFixed(2), mass: player ? Math.round(player.mass) : null, playerCells: player ? player.cells.length : 0,
        alive: player ? player.alive : null, rank: player ? player.rank : null, bots: owners.filter(function (o) { return o.isBot && o.alive; }).length,
        cells: cells.length, pellets: pCount, viruses: viruses.length, ejected: ejected.length, particles: parts.length, zoom: +cam.z.toFixed(3),
        skin: selSkin.id, unlocked: countUnlocked(), stats: stats };
    },
    setMass: function (m) { if (player && player.alive) { player.cells[0].m = m; player.cells[0].r = radius(m); } },
    kill: function () {
      if (!player || !player.alive) return false;
      var big = lb[0] === player ? lb[1] : lb[0];
      player.lastEater = big || null;
      player.cells.forEach(function (c) { c.dead = true; }); anyDead = true; return true;
    },
    shieldOff: function () { if (player) player.shield = 0; },
    massList: function () { return 'eats=' + dbgEats + ' ' + lb.map(function (o) { return o.name + ':' + Math.round(o.mass) + '/' + o.cells.length; }).join(' '); },
    bench: function (sec) { var t0 = performance.now(); var n = Math.round(sec * 60); for (var i = 0; i < n; i++) sim(1 / 60); return ((performance.now() - t0) / n).toFixed(3) + 'ms/step'; },
    step: function (sec) { var n = Math.round(sec * 60); for (var i = 0; i < n; i++) { sim(1 / 60); fxUpdate(1 / 60); updateCam(1 / 60); } return this.info(); },
    unlockAll: function () { stats.best = 99999; ['rounds', 'roundEaten', 'virusPops', 'splitEats', 'maxTime', 'kings', 'eatenTotal', 'virusShots', 'pellets', 'arena2', 'arena3', 'kingTime', 'bestA3'].forEach(function (k) { stats[k] = 99999; }); saveStats(); checkUnlocks(); refreshTitle(); },
    arena: function (i) { arenaIdx = i; store.set('arena', i); if (state === 'title') { buildWorld(false); refreshTitle(); } },
    split: function () { return player ? splitOwner(player, player.tx, player.ty) : 0; },
    nearestVirus: function () { if (!player || !player.alive) return null; var c = player.cells[0], v = viruses[0]; c.x = v.x + 5; c.y = v.y; return true; },
    // debug: auto-play whole rounds headlessly. mode 'naive' = only chases food, 'bot' = uses the bot brain.
    auto: function (mode, rounds, maxSec) {
      var out = [];
      for (var r = 0; r < rounds; r++) {
        startGame(); autoMode = mode; var t0 = T, nextT = 0, peak = 0;
        while (state === 'play' && T - t0 < maxSec) {
          if (T >= nextT) {
            nextT = T + 0.2;
            if (mode === 'naive') { ownerCenter(player, tmpC); var f = findFood(player, tmpC.x, tmpC.y, 400); if (f >= 0) { player.tx = pX[f]; player.ty = pY[f]; } }
            else { player.smart = 0.5; player.aggro = 0.3; player.hate = 1; think(player); }
          }
          sim(1 / 60); fxUpdate(1 / 60); updateCam(1 / 60);
          if (player.mass > peak) peak = player.mass;
        }
        out.push({ t: Math.round(T - t0), peak: Math.round(peak), eaten: round.eaten, rank: round.bestRank, dead: state !== 'play', by: round.killer ? Math.round(round.killer.mass) : 0 });
        autoMode = null; state = 'play';
      }
      toMenu();
      return out;
    }
  };
})();
