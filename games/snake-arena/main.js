/* Snake Arena — game flow, input, UI screens, saving. */
(function () {
  'use strict';
  var SA = window.SA, W = SA.world, R = SA.render, sfx = SA.sfx;
  var store = Kit.store('snake-arena');
  function $(id) { return document.getElementById(id); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* --------------------------------------------------------------- save */
  var DEF = { bestLen: 0, totalKills: 0, bestKills: 0, games: 0, bestTime: 0, totalFood: 0, bestRank: 0, powerups: 0, top1Time: 0 };
  var stats = {}, saved = store.get('stats', null), k;
  for (k in DEF) stats[k] = saved && typeof saved[k] === 'number' && isFinite(saved[k]) ? saved[k] : DEF[k];
  function saveStats() { store.set('stats', stats); }

  function byId(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  function unlocked(item, st) { return !item.req || SA.reqMet(item.req, st || stats); }
  var prefs = { skin: store.get('skin', 'lime'), eyes: store.get('eyes', 'round'), name: store.get('name', null) };
  if (!byId(SA.SKINS, prefs.skin) || !unlocked(byId(SA.SKINS, prefs.skin))) prefs.skin = 'lime';
  if (!byId(SA.EYES, prefs.eyes) || !unlocked(byId(SA.EYES, prefs.eyes))) prefs.eyes = 'round';
  if (typeof prefs.name !== 'string' || SA.PLAYER_NAMES.indexOf(prefs.name) < 0) prefs.name = Kit.pick(SA.PLAYER_NAMES);
  function savePrefs() { store.set('skin', prefs.skin); store.set('eyes', prefs.eyes); store.set('name', prefs.name); }
  function curSkin() { return byId(SA.SKINS, prefs.skin); }

  /* -------------------------------------------------------------- state */
  var G = {
    state: 'title', timeScale: 1, slowT: 0, shake: 0, run: null, overT: 0, dieT: 0,
    skinsFrom: 'title', demoFocus: null, kb: false, kbMouse: { x: 0, y: 0 }, lastStart: 0,
    hud: { toasts: [], feed: [], lenPulse: 0, warn: 0, hint: null, hintA: 0, kills: 0, rank: 1 }
  };
  SA.game = G;

  /* -------------------------------------------------------------- input */
  var mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2, down: false };
  var cv = $('cv');
  window.addEventListener('pointermove', function (e) { mouse.x = e.clientX; mouse.y = e.clientY; });
  cv.addEventListener('pointerdown', function (e) {
    mouse.x = e.clientX; mouse.y = e.clientY;
    if (G.state === 'play') mouse.down = true;
    try { cv.focus({ preventScroll: true }); } catch (err) { /* ignore */ }
  });
  window.addEventListener('pointerup', function () { mouse.down = false; });
  window.addEventListener('blur', function () { mouse.down = false; });
  document.addEventListener('visibilitychange', function () { if (document.hidden && G.state === 'play') pauseGame(); });

  /* ------------------------------------------------------------ HUD bits */
  function toast(txt, col, sub, size, dur) {
    var list = G.hud.toasts;
    if (list.length >= 3) list.shift();
    list.push({ txt: txt, col: col || '#fff', sub: sub || '', size: size || 44, dur: dur || 1.8, age: 0 });
  }
  function feed(txt, col) {
    var list = G.hud.feed;
    if (list.length >= 4) list.shift();
    list.push({ txt: txt, col: col || 'rgba(255,255,255,0.85)', life: 4.5 });
  }

  /* ------------------------------------------------------------- screens */
  var screens = ['title', 'skins', 'pause', 'over'];
  function showScreen(id) {
    for (var i = 0; i < screens.length; i++) $(screens[i]).hidden = screens[i] !== id;
    $('btnPause').hidden = id !== null;
  }

  function refreshTitle() {
    $('tName').textContent = prefs.name;
    $('tSkinName').textContent = curSkin().name;
    $('tBest').textContent = Kit.fmt(stats.bestLen);
    $('tKills').textContent = Kit.fmt(stats.totalKills);
    var u = 0, i;
    for (i = 0; i < SA.SKINS.length; i++) if (unlocked(SA.SKINS[i])) u++;
    $('tUnl').textContent = u + '/' + SA.SKINS.length;
  }

  function toMenu() {
    W.reset('demo');
    R.clearFx();
    G.state = 'title'; G.timeScale = 1; G.slowT = 0;
    G.demoFocus = null;
    G.hud.toasts.length = 0; G.hud.feed.length = 0;
    showScreen('title');
    refreshTitle();
    sfx.boostHum(false);
  }

  function startGame() {
    var now = performance.now();
    if (now - G.lastStart < 250) return;
    G.lastStart = now;
    Kit.audio.unlock();
    W.reset('play');
    W.spawnPlayer(prefs.name, curSkin(), prefs.eyes);
    R.clearFx();
    var p = W.player;
    R.cam.x = p.hx; R.cam.y = p.hy; R.cam.zoom = 1.25;
    G.state = 'play'; G.timeScale = 1; G.slowT = 0; G.shake = 0;
    mouse.down = false;
    G.hud.toasts.length = 0; G.hud.feed.length = 0; G.hud.kills = 0; G.hud.warn = 0; G.hud.hint = null; G.hud.hintA = 0;
    G.run = {
      t: 0, kills: 0, combo: 0, lastKillT: -99, food: 0, powerups: 0, bestRank: 99, top1T: 0,
      said: {}, milestone: 0, eatAcc: 0, eatT: 0, warnT: 0, unlockT: 0, announced: {},
      deathLen: 0, deathRank: 0, killer: null, reason: ''
    };
    showScreen(null);
    toast('انطلق!', '#8dff3a', 'كُل النقاط المضيئة لتكبر', 56, 1.6);
    sfx.start();
    try { cv.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }

  function pauseGame() {
    if (G.state !== 'play') return;
    G.state = 'paused';
    mouse.down = false;
    sfx.boostHum(false);
    showScreen('pause');
    $('pBest').textContent = Kit.fmt(stats.bestLen);
    $('pLen').textContent = Kit.fmt(W.player.mass);
  }
  function resume() {
    if (G.state !== 'paused') return;
    G.state = 'play';
    showScreen(null);
    sfx.click();
  }

  /* ------------------------------------------------------- unlock checks */
  function projected() {
    var r = G.run, p = W.player, st = {};
    for (var k2 in stats) st[k2] = stats[k2];
    var len = G.state === 'play' ? Math.floor(p.mass) : r.deathLen;
    st.bestLen = Math.max(stats.bestLen, len);
    st.totalKills = stats.totalKills + r.kills;
    st.bestKills = Math.max(stats.bestKills, r.kills);
    st.games = stats.games + 1;
    st.bestTime = Math.max(stats.bestTime, Math.floor(r.t));
    st.totalFood = stats.totalFood + Math.floor(r.food);
    st.bestRank = r.bestRank < 99 ? (stats.bestRank ? Math.min(stats.bestRank, r.bestRank) : r.bestRank) : stats.bestRank;
    st.powerups = stats.powerups + r.powerups;
    st.top1Time = Math.max(stats.top1Time, Math.floor(r.top1T));
    return st;
  }
  function liveUnlockCheck() {
    var st = projected(), lists = [SA.SKINS, SA.EYES];
    for (var l = 0; l < 2; l++) {
      for (var i = 0; i < lists[l].length; i++) {
        var it = lists[l][i];
        if (!it.req || G.run.announced[it.id] || unlocked(it)) continue;
        if (SA.reqMet(it.req, st)) {
          G.run.announced[it.id] = 1;
          toast(l === 0 ? 'شكل جديد: ' + it.name + '!' : 'عيون جديدة: ' + it.name + '!', '#7dfcff', 'تجده في قائمة الأشكال', 36, 2.4);
          sfx.unlock();
        }
      }
    }
  }

  /* -------------------------------------------------------------- events */
  var KILL_WORDS = ['', 'ضربة مزدوجة!', 'ثلاثية!', 'لا يمكن إيقافك!', 'أسطوري!'];
  function onDeath(e) {
    var s = e.s, p = W.player, i, cam = R.cam;
    var cols = s.skin.rainbow ? SA.RAINBOW : s.skin.colors;
    var dx = s.hx - cam.x, dy = s.hy - cam.y, near = Math.sqrt(dx * dx + dy * dy) < 1400 / cam.zoom;
    if (near) {
      var cnt = Math.min(16, 4 + Math.floor(s.n / 40));
      for (i = 0; i < cnt; i++) {
        var j = Math.floor(i * (s.n - 1) / (cnt - 1));
        R.burst(s.pointX(j), s.pointY(j), { n: 4, cols: cols, speed: 240, life: 0.7, size: Math.min(12, s.r * 0.4), jit: s.r });
      }
      R.ring(s.hx, s.hy, '#ffffff', 80 + s.r * 2.5, 0.5);
      R.burst(s.hx, s.hy, { n: 22, cols: ['#ffffff', cols[0], cols[cols.length - 1]], speed: 460, life: 0.8, size: 7 });
    }
    var inGame = G.state === 'play' || G.state === 'dying';
    if (s === p) { playerDied(e); return; }
    if (!inGame) return;
    if (e.killer === p && G.state === 'play') {
      var r = G.run;
      r.kills++; G.hud.kills = r.kills;
      r.combo = W.time - r.lastKillT < 5 ? r.combo + 1 : 1;
      r.lastKillT = W.time;
      sfx.kill(r.combo - 1);
      G.shake = Math.max(G.shake, 9);
      G.timeScale = 0.3; G.slowT = 0.2;
      toast('أطحت بـ ' + s.name + '!', '#ffe36b', KILL_WORDS[Math.min(4, r.combo - 1)], 44, 2);
      R.floatText(s.hx, s.hy, 'بوب!', '#ffffff', 40);
      R.ring(s.hx, s.hy, '#ffe36b', 160 + s.r * 3, 0.7);
      feed('أنت أطحت بـ ' + s.name, '#ffe36b');
    } else {
      if (near) {
        var d = Math.sqrt(dx * dx + dy * dy) * cam.zoom;
        sfx.popFar(clamp(1 - d / 1100, 0, 1) * 0.8);
      }
      if (e.killer) feed(e.killer.name + ' أطاح بـ ' + s.name);
      else if (near || s.mass > 200) feed(s.name + ' لمس الحافة');
    }
  }

  function playerDied(e) {
    var p = W.player, r = G.run;
    if (!r || G.state !== 'play') return;
    G.state = 'dying'; G.dieT = 0;
    r.deathLen = Math.floor(p.mass);
    var above = 0;
    for (var i = 0; i < W.snakes.length; i++) if (W.snakes[i].alive && W.snakes[i].mass > p.mass) above++;
    r.deathRank = above + 1;
    r.total = W.ranked.length;
    r.killer = e.killer; r.reason = e.reason;
    sfx.boostHum(false);
    sfx.die();
    G.shake = 22; G.timeScale = 0.35; G.slowT = 0.8;
    R.floatText(p.hx, p.hy, 'أوه لا!', '#ff7aa8', 46);
    $('btnPause').hidden = true;
  }

  function onPower(e) {
    if (G.state !== 'play') return;
    var def = SA.POWERS[e.type];
    G.run.powerups++;
    sfx.power();
    toast(def.name, def.color, e.type === 0 ? 'الطعام ينجذب إليك' : e.type === 1 ? 'كل حبة تساوي ضعفين' : 'سرّع بلا خسارة', 40, 1.8);
    R.ring(e.x, e.y, def.color, 140, 0.6);
    R.burst(e.x, e.y, { n: 24, cols: [def.color, '#ffffff'], speed: 380, life: 0.7, size: 7 });
  }

  function handleEvents() {
    var ev = W.events, p = W.player;
    for (var i = 0; i < ev.length; i++) {
      var e = ev[i];
      if (e.t === 'eat') {
        if (G.state !== 'play') continue;
        sfx.eat(e.big);
        G.run.food += e.v; G.run.eatAcc += e.v;
        G.hud.lenPulse = Math.min(1, G.hud.lenPulse + (e.big ? 0.5 : 0.2));
      } else if (e.t === 'boost') {
        if (e.s === p && G.state === 'play') {
          sfx.boostStart();
          R.burst(p.hx, p.hy, { n: 8, col: '#ffffff', speed: 200, life: 0.35, size: 5, vx: -Math.cos(p.ang) * 250, vy: -Math.sin(p.ang) * 250 });
        }
      } else if (e.t === 'death') onDeath(e);
      else if (e.t === 'power') onPower(e);
    }
    ev.length = 0;
  }

  /* ------------------------------------------------------------ game tick */
  var MILESTONES = [50, 100, 200, 300, 500, 750, 1000, 1500, 2000, 3000, 5000];
  var HINTS = [
    { from: 1.5, to: 7, txt: 'وجّه الثعبان بالفأرة وكُل النقاط المضيئة', games: 3 },
    { from: 8, to: 14, txt: 'اضغط مطولًا على الفأرة أو مسافة للتسريع!', games: 3 },
    { from: 16, to: 22, txt: 'اجعل رؤوس الثعابين تصطدم بجسمك لتفجيرها!', games: 4 },
    { from: 26, to: 31, txt: 'التقط الفقاعات الملوّنة لتحصل على قوى خارقة', games: 2 }
  ];
  function runTick(dt) {
    var r = G.run, p = W.player, h = G.hud;
    r.t += dt;
    var rank = W.rankOf(p);
    h.rank = rank;
    if (r.t > 1.5 && rank < r.bestRank) {
      if (rank === 1 && !r.said.r1) { r.said.r1 = r.said.r3 = r.said.r10 = 1; toast('أنت الأول!', '#ffd21f', 'لديك التاج الآن', 52, 2.4); sfx.crown(); G.shake = Math.max(G.shake, 5); }
      else if (rank <= 3 && !r.said.r3) { r.said.r3 = r.said.r10 = 1; toast('المركز ' + rank + '!', '#ffe36b', 'أنت من الكبار', 44, 2); sfx.rankUp(); }
      else if (rank <= 10 && !r.said.r10) { r.said.r10 = 1; toast('دخلت قائمة المتصدرين!', '#b9f7ff', '', 38, 2); sfx.rankUp(); }
      r.bestRank = rank;
    }
    if (rank === 1) r.top1T += dt;

    if (r.milestone < MILESTONES.length && p.mass >= MILESTONES[r.milestone]) {
      toast('الطول ' + MILESTONES[r.milestone] + '!', '#8dff3a', ['رائع!', 'ممتاز!', 'خرافي!', 'وحش!'][Math.min(3, r.milestone >> 1)], 46, 1.8);
      sfx.milestone();
      R.ring(p.hx, p.hy, '#8dff3a', 200 + p.r * 2, 0.7);
      r.milestone++;
    }

    // border warning
    var dc = Math.sqrt(p.hx * p.hx + p.hy * p.hy);
    h.warn = clamp((dc - (W.R - 480)) / 260, 0, 1);
    r.warnT -= dt;
    if (h.warn > 0.3 && r.warnT <= 0) { sfx.warn(); r.warnT = 0.7; }

    // "+N" popups while munching
    r.eatT += dt;
    if (r.eatT > 0.6) {
      if (r.eatAcc >= 4) R.floatText(p.hx, p.hy - p.r * 1.5, '+' + Math.round(r.eatAcc), '#b9ffda', 22 + Math.min(16, r.eatAcc * 0.4));
      r.eatAcc = 0; r.eatT = 0;
    }

    // hints for new players
    var hint = null;
    for (var i = 0; i < HINTS.length; i++) {
      var hd = HINTS[i];
      if (stats.games < hd.games && r.t > hd.from && r.t < hd.to) hint = hd.txt;
    }
    if (hint) { h.hint = hint; h.hintA = Math.min(1, h.hintA + dt * 3); } else { h.hintA = Math.max(0, h.hintA - dt * 3); if (h.hintA === 0) h.hint = null; }

    r.unlockT -= dt;
    if (r.unlockT <= 0) { r.unlockT = 1; liveUnlockCheck(); }
  }

  function controlPlayer() {
    var p = W.player, K = Kit.keys, cam = R.cam;
    var left = K.anyDown(['ArrowLeft', 'KeyA']), right = K.anyDown(['ArrowRight', 'KeyD']);
    if (left || right) { G.kb = true; G.kbMouse.x = mouse.x; G.kbMouse.y = mouse.y; }
    if (G.kb && Math.abs(mouse.x - G.kbMouse.x) + Math.abs(mouse.y - G.kbMouse.y) > 40) G.kb = false;
    if (G.kb) {
      p.want = p.ang + (right ? 1.2 : 0) - (left ? 1.2 : 0);
    } else {
      var sx = (p.hx - cam.x) * cam.zoom * R.ui + R.cssW / 2, sy = (p.hy - cam.y) * cam.zoom * R.ui + R.cssH / 2;
      var dx = mouse.x - sx, dy = mouse.y - sy;
      if (dx * dx + dy * dy > 64) p.want = Math.atan2(dy, dx);
    }
    p.boostWant = mouse.down || K.down('Space');
  }

  function updateCamera(dt) {
    var cam = R.cam, p = W.player, f = null, zt = 0.72;
    if (G.state === 'play' || G.state === 'paused') { f = p; zt = clamp(Math.pow(16 / p.r, 0.55), 0.4, 1.05); }
    else if (G.state === 'dying') { f = p; zt = clamp(Math.pow(16 / p.r, 0.55), 0.4, 1.05) * 1.12; }
    else if (G.state === 'over' || (G.state === 'skins' && G.skinsFrom === 'over')) {
      var kl = G.run && G.run.killer;
      f = kl && kl.alive ? kl : p; zt = 0.85;
    } else {
      if (!G.demoFocus || !G.demoFocus.alive) {
        var best = null;
        for (var i = 0; i < W.snakes.length; i++) {
          var s = W.snakes[i];
          if (s.alive && !s.isPlayer && s.mass > 60 && s.mass < 700 && (!best || Math.random() < 0.3)) best = s;
        }
        G.demoFocus = best || W.ranked[0];
      }
      f = G.demoFocus; zt = 0.8;
    }
    if (f) {
      var lead = f.alive ? 45 : 0;
      var tx = f.hx + Math.cos(f.ang) * lead, ty = f.hy + Math.sin(f.ang) * lead;
      var ease = 1 - Math.exp(-dt * (G.state === 'play' ? 9 : 3));
      cam.x += (tx - cam.x) * ease; cam.y += (ty - cam.y) * ease;
    }
    cam.zoom += (zt - cam.zoom) * (1 - Math.exp(-dt * 2.2));
    G.shake = Math.max(0, G.shake - dt * 45);
    cam.sx = (Math.random() - 0.5) * 2 * G.shake / cam.zoom;
    cam.sy = (Math.random() - 0.5) * 2 * G.shake / cam.zoom;
  }

  /* ------------------------------------------------------------ game over */
  function fmtTime(s) { s = Math.floor(s); var m = Math.floor(s / 60), x = s % 60; return m + ':' + (x < 10 ? '0' : '') + x; }

  function nextGoal() {
    var best = null, bp = -1, lists = [SA.SKINS, SA.EYES];
    for (var l = 0; l < 2; l++) for (var i = 0; i < lists[l].length; i++) {
      var it = lists[l][i];
      if (unlocked(it)) continue;
      var pr = SA.reqProgress(it.req, stats);
      if (pr > bp) { bp = pr; best = { it: it, eyes: l === 1, p: pr }; }
    }
    return best;
  }

  function showOver() {
    var r = G.run, i;
    var before = {}, lists = [SA.SKINS, SA.EYES];
    for (var l = 0; l < 2; l++) for (i = 0; i < lists[l].length; i++) before[lists[l][i].id] = unlocked(lists[l][i]);
    var oldBest = stats.bestLen;
    var st = projected();
    for (var kk in st) stats[kk] = st[kk];
    saveStats();
    var newBest = r.deathLen > oldBest && stats.games > 1;

    G.state = 'over'; G.overT = 0;
    showScreen('over');
    $('oTitle').textContent = newBest ? 'رقم قياسي جديد!' : Kit.pick(['بوب!', 'أوووه!', 'بووم!']);
    $('oTitle').className = newBest ? 'otitle gold' : 'otitle';
    $('oSub').textContent = r.reason === 'border' ? 'لمستَ حافة الساحة' : (r.killer ? 'اصطدمتَ بـ ' + r.killer.name : 'انفجرت!');
    $('oLen').textContent = Kit.fmt(r.deathLen);
    $('oRank').textContent = '#' + r.deathRank;
    $('oKills').textContent = r.kills;
    $('oTime').textContent = fmtTime(r.t);
    $('oBestV').textContent = Kit.fmt(stats.bestLen);

    // new unlocks
    var ul = $('oUnlocks'); ul.innerHTML = '';
    var got = 0;
    for (l = 0; l < 2; l++) for (i = 0; i < lists[l].length; i++) {
      var it = lists[l][i];
      if (!before[it.id] && unlocked(it) && got < 3) {
        got++;
        var d = document.createElement('div'); d.className = 'unl';
        var c = document.createElement('canvas'); c.width = l === 0 ? 150 : 60; c.height = l === 0 ? 50 : 60;
        if (l === 0) R.drawPreview(c, it, 'happy', 1, { r: 11, n: 26, sp: 4.6, amp: 5 });
        else R.drawHeadPreview(c, curSkin(), it.id, 1);
        var sp = document.createElement('span');
        sp.textContent = (l === 0 ? 'شكل جديد: ' : 'عيون جديدة: ') + it.name;
        d.appendChild(c); d.appendChild(sp); ul.appendChild(d);
      }
    }
    ul.hidden = got === 0;

    var ng = nextGoal(), nx = $('oNext');
    if (ng) {
      nx.hidden = false;
      $('oNextTxt').textContent = 'الهدف التالي (' + (ng.eyes ? 'عيون ' : 'شكل ') + ng.it.name + '): ' + SA.reqText(ng.it.req);
      $('oNextFill').style.width = Math.round(ng.p * 100) + '%';
    } else nx.hidden = true;

    if (newBest) { confetti(); sfx.newBest(); }
    else if (got) sfx.unlock();
  }

  function confetti() {
    var box = $('confetti'); box.innerHTML = '';
    var cols = ['#ffd21f', '#ff4d8d', '#39ff88', '#3ad7ff', '#b06bff', '#ff8a3d'];
    for (var i = 0; i < 70; i++) {
      var d = document.createElement('i');
      d.style.left = (Math.random() * 100) + '%';
      d.style.background = cols[i % cols.length];
      d.style.animationDelay = (Math.random() * 0.8) + 's';
      d.style.animationDuration = (2 + Math.random() * 1.6) + 's';
      d.style.transform = 'rotate(' + (Math.random() * 360) + 'deg)';
      box.appendChild(d);
    }
    setTimeout(function () { box.innerHTML = ''; }, 4800);
  }

  /* --------------------------------------------------------- skins screen */
  var skinCards = [], eyeCards = [];
  function openSkins(from) {
    G.skinsFrom = from; G.state = 'skins';
    showScreen('skins');
    buildSkinGrids();
    sfx.click();
  }
  function closeSkins() {
    sfx.click();
    refreshTitle();
    if (G.skinsFrom === 'over') { G.state = 'over'; G.overT = 1; showScreen('over'); }
    else { G.state = 'title'; showScreen('title'); }
  }
  function buildSkinGrids() {
    var grid = $('skinGrid'), eg = $('eyeGrid');
    grid.innerHTML = ''; eg.innerHTML = ''; skinCards = []; eyeCards = [];
    SA.SKINS.forEach(function (sk) {
      var ok = unlocked(sk);
      var b = document.createElement('button'); b.type = 'button';
      b.className = 'card' + (ok ? '' : ' locked') + (sk.id === prefs.skin ? ' sel' : '');
      var c = document.createElement('canvas'); c.width = 132; c.height = 44;
      R.drawPreview(c, sk, prefs.eyes, 0.6, { r: 10, n: 27, sp: 4.3, amp: 4 });
      b.appendChild(c);
      var nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = sk.name; b.appendChild(nm);
      if (!ok) {
        var lk = document.createElement('div'); lk.className = 'req'; lk.textContent = SA.reqText(sk.req); b.appendChild(lk);
        var bar = document.createElement('div'); bar.className = 'bar';
        var fill = document.createElement('i'); fill.style.width = Math.round(SA.reqProgress(sk.req, stats) * 100) + '%';
        bar.appendChild(fill); b.appendChild(bar);
        var lock = document.createElement('div'); lock.className = 'lock'; b.appendChild(lock);
      }
      b.addEventListener('click', function () {
        b.blur();
        if (!unlocked(sk)) { b.classList.remove('nope'); void b.offsetWidth; b.classList.add('nope'); sfx.warn(); return; }
        prefs.skin = sk.id; savePrefs(); sfx.select();
        skinCards.forEach(function (x) { x.el.classList.toggle('sel', x.id === prefs.skin); });
        refreshEyeCards();
      });
      grid.appendChild(b);
      skinCards.push({ el: b, id: sk.id });
    });
    SA.EYES.forEach(function (ey) {
      var ok = unlocked(ey);
      var b = document.createElement('button'); b.type = 'button';
      b.className = 'card eye' + (ok ? '' : ' locked') + (ey.id === prefs.eyes ? ' sel' : '');
      var c = document.createElement('canvas'); c.width = 56; c.height = 56;
      b.appendChild(c);
      var nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = ey.name; b.appendChild(nm);
      if (!ok) {
        b.title = SA.reqText(ey.req);
        var lk = document.createElement('div'); lk.className = 'req'; lk.textContent = SA.reqText(ey.req); b.appendChild(lk);
        var lock = document.createElement('div'); lock.className = 'lock'; b.appendChild(lock);
      }
      b.addEventListener('click', function () {
        b.blur();
        if (!unlocked(ey)) { b.classList.remove('nope'); void b.offsetWidth; b.classList.add('nope'); sfx.warn(); return; }
        prefs.eyes = ey.id; savePrefs(); sfx.select();
        eyeCards.forEach(function (x) { x.el.classList.toggle('sel', x.id === prefs.eyes); });
      });
      eg.appendChild(b);
      eyeCards.push({ el: b, id: ey.id, c: c });
    });
    refreshEyeCards();
    var n = 0; SA.SKINS.forEach(function (s) { if (unlocked(s)) n++; });
    var m = 0; SA.EYES.forEach(function (s) { if (unlocked(s)) m++; });
    $('sCount').textContent = 'الأشكال ' + n + '/' + SA.SKINS.length + ' · العيون ' + m + '/' + SA.EYES.length;
  }
  function refreshEyeCards() {
    eyeCards.forEach(function (x) { R.drawHeadPreview(x.c, curSkin(), x.id, 0.5); });
  }

  function cycleSkin(dir) {
    var list = SA.SKINS.filter(function (s) { return unlocked(s); });
    var i = 0;
    for (var j = 0; j < list.length; j++) if (list[j].id === prefs.skin) i = j;
    i = (i + dir + list.length) % list.length;
    prefs.skin = list[i].id; savePrefs();
    $('tSkinName').textContent = list[i].name;
    sfx.select();
  }

  /* ---------------------------------------------------------- DOM wiring */
  function onBtn(id, fn) {
    var b = $(id);
    b.addEventListener('click', function (e) { e.stopPropagation(); b.blur(); Kit.audio.unlock(); fn(); });
  }
  onBtn('btnPlay', startGame);
  onBtn('btnSkins', function () { openSkins('title'); });
  onBtn('btnDice', function () {
    var n = prefs.name, t = 0;
    while (n === prefs.name && t++ < 20) n = Kit.pick(SA.PLAYER_NAMES);
    prefs.name = n; savePrefs(); $('tName').textContent = n; sfx.select();
  });
  onBtn('skPrev', function () { cycleSkin(-1); });
  onBtn('skNext', function () { cycleSkin(1); });
  onBtn('btnSkinsDone', closeSkins);
  onBtn('btnResume', resume);
  onBtn('btnRestart', startGame);
  onBtn('btnMenu', function () { sfx.click(); toMenu(); });
  onBtn('btnAgain', startGame);
  onBtn('btnOSkins', function () { openSkins('over'); });
  onBtn('btnOMenu', function () { sfx.click(); toMenu(); });
  onBtn('btnPause', pauseGame);
  $('btnPause').addEventListener('pointerdown', function (e) { e.stopPropagation(); });

  /* ------------------------------------------------------------ main loop */
  function update(dt) {
    var K = Kit.keys;
    if (G.state === 'title') {
      if (K.anyPressed(['Space', 'Enter', 'NumpadEnter'])) startGame();
      else if (K.pressed('ArrowLeft')) cycleSkin(-1);
      else if (K.pressed('ArrowRight')) cycleSkin(1);
    } else if (G.state === 'skins') {
      if (K.anyPressed(['Escape', 'Enter'])) closeSkins();
    } else if (G.state === 'play') {
      if (K.anyPressed(['KeyP', 'Escape'])) pauseGame();
    } else if (G.state === 'paused') {
      if (K.anyPressed(['KeyP', 'Escape', 'Enter'])) resume();
      else if (K.pressed('KeyR')) startGame();
      K.endFrame();
      return;
    } else if (G.state === 'over') {
      if (G.overT > 0.7) {
        if (K.anyPressed(['Space', 'Enter', 'KeyR', 'NumpadEnter'])) startGame();
        else if (K.pressed('Escape')) { sfx.click(); toMenu(); }
      }
    }

    var p = W.player;
    if (G.state === 'play' && p.alive) controlPlayer();
    else if (!p.alive) p.boostWant = false;
    if (W.mode === 'play' && G.run) {
      W.D = clamp(0.2 + G.run.t / 300 + p.mass / 2500, 0.2, 1);
      W.huntPlayer = G.run.t > 12;
    }
    if (G.slowT > 0) { G.slowT -= dt; G.timeScale += (1 - G.timeScale) * dt * 2; if (G.slowT <= 0) G.timeScale = 1; }
    var sdt = dt * G.timeScale;
    W.update(sdt);
    handleEvents();
    R.updateFx(sdt);
    updateCamera(dt);

    var h = G.hud, i;
    h.lenPulse = Math.max(0, h.lenPulse - dt * 3);
    for (i = h.toasts.length - 1; i >= 0; i--) { h.toasts[i].age += dt; if (h.toasts[i].age > h.toasts[i].dur) h.toasts.splice(i, 1); }
    for (i = h.feed.length - 1; i >= 0; i--) { h.feed[i].life -= dt; if (h.feed[i].life <= 0) h.feed.splice(i, 1); }

    if (G.state === 'play') runTick(dt);
    else if (G.state === 'dying') { G.dieT += dt; if (G.dieT > 1.5) showOver(); }
    else if (G.state === 'over') G.overT += dt;
    sfx.boostHum(G.state === 'play' && p.alive && p.boosting);
    K.endFrame();
  }

  var tPrev = $('tPrev'), sPrev = $('sPrev');
  function render() {
    R.drawWorld(W.ranked[0]);
    var st = G.state;
    if (st === 'play' || st === 'dying' || st === 'paused') R.drawHud(G.hud);
    var t = performance.now() / 1000;
    if (st === 'title') R.drawPreview(tPrev, curSkin(), prefs.eyes, t, { r: 19, n: 46, sp: 7.4, amp: 13 });
    else if (st === 'skins') R.drawPreview(sPrev, curSkin(), prefs.eyes, t, { r: 16, n: 44, sp: 6.4, amp: 11 });
  }

  /* ---------------------------------------------------------------- boot */
  R.init(cv);
  W.reset('demo');
  refreshTitle();
  showScreen('title');
  Kit.muteButton();
  // Warm up a few seconds of demo so the title background is lively right away.
  for (var w = 0; w < 90; w++) W.update(1 / 60);
  W.events.length = 0;
  Kit.loop(update, render);

  // Debug / automated-test hook.
  window.__game = {
    get state() { return G.state; },
    get player() { var p = W.player; return { alive: p.alive, len: Math.floor(p.mass), x: Math.round(p.hx), y: Math.round(p.hy), r: p.r, n: p.n, kills: G.run ? G.run.kills : 0, rank: W.rankOf(p), boosting: p.boosting }; },
    get stats() { return JSON.parse(JSON.stringify(stats)); },
    get prefs() { return JSON.parse(JSON.stringify(prefs)); },
    info: function () {
      var alive = 0, pts = 0;
      W.snakes.forEach(function (s) { if (s.alive) { alive++; pts += s.n; } });
      return { state: G.state, snakes: alive, points: pts, food: W.foodCount(), hash: W.hashCount(), stepMs: +W.stepMs.toFixed(3), drawn: R.drawnSnakes, D: +W.D.toFixed(2), zoom: +R.cam.zoom.toFixed(2), time: +W.time.toFixed(1) };
    },
    setMass: function (m) { var p = W.player; if (p.alive) p.grow(m - p.mass); },
    god: function (sec) { W.player.protect = sec || 9999; },
    killPlayer: function () { if (W.player.alive) W.killSnake(W.player, null, 'border'); },
    // Put a small bot right in front of the player's body so it crashes (tests kill credit).
    trapBot: function () {
      var p = W.player, b = W.snakes[1];
      if (!p.alive) return false;
      var i = Math.min(p.n - 1, 10), x = p.pointX(i), y = p.pointY(i);
      var nx = -Math.sin(p.ang), ny = Math.cos(p.ang);
      W.spawnBotAt(b, x + nx * 70, y + ny * 70, Math.atan2(-ny, -nx), 10);
      b.protect = 0;
      return true;
    },
    power: function (type) { var def = SA.POWERS[type || 0]; W.player.pw[def.id] = def.dur; },
    unlockAll: function () { stats.bestLen = 99999; stats.totalKills = 999; stats.bestKills = 99; stats.games = 99; stats.bestTime = 9999; stats.totalFood = 99999; stats.bestRank = 1; stats.powerups = 99; stats.top1Time = 999; saveStats(); refreshTitle(); },
    resetSave: function () { for (var k3 in DEF) stats[k3] = DEF[k3]; saveStats(); refreshTitle(); }
  };
})();
