/* Castle Crash screens, input, saving and play stats. */
(function () {
  'use strict';
  var CC = window.CC, CCL = window.CCL, CCS = window.CCS, CCR = window.CCR, S = window.CCA;
  var W = 1280, H = 720;
  var canvas = document.getElementById('cv');
  var ui = document.getElementById('ui');
  var view = Kit.fit(canvas, W, H, { onResize: placeUi });
  var ctx = view.ctx;
  var pointer = Kit.pointer(view);
  var shake = Kit.shake();
  canvas.addEventListener('contextrestored', function () { view.resize(); });
  function placeUi(v) {
    ui.style.left = v.canvas.style.left; ui.style.top = v.canvas.style.top;
    ui.style.width = W + 'px'; ui.style.height = H + 'px';
    ui.style.transform = 'scale(' + v.scale + ')';
    drew = false;
  }
  function $(id) { return document.getElementById(id); }
  function show(id) {
    ['scrTitle', 'scrLevels', 'scrAmmo', 'scrPause', 'scrResult'].forEach(function (s) { $(s).hidden = s !== id; });
    $('hud').hidden = id !== '' && scr !== 'play';
  }

  var store = Kit.store('castle-crash');
  var saveUI = Kit.saveStatus({ retry: function () { persist(); } });
  var saveFailed = false;
  var FORKS = ['#8a4b22', '#c45c26', '#3a6b4a', '#6a4a9a'];
  var HATS = ['#ff5a6a', '#3ec6ff', '#ffe56a', '#b06bff', '#7CFF6B', '#ff9f1c'];
  var AMMO_META = {
    ball: { name: 'الكرة النطّاطة', color: '#ff4d4d', tip: 'ترتطم وترتد. اضغط مجددًا في الهواء لتقوّيها.' },
    marble: { name: 'كرات ثلاثية', color: '#b06bff', tip: 'اضغط في الهواء لتتفرق إلى ثلاث كرات.' },
    bowl: { name: 'كرة البولينغ', color: '#2a2a2a', tip: 'ثقيلة. اضغط في الهواء لتنزل بقوة.' },
    boom: { name: 'رغوة الانفجار', color: '#ffd23a', tip: 'اضغط في الهواء لتدفع القوالب بعيدًا.' },
    ice: { name: 'كاسرة الجليد', color: '#3ec6ff', tip: 'قوية على الجليد. اضغط لنفخة باردة.' }
  };
  var NEW_AT = { 2: 'marble', 4: 'bowl', 9: 'ice', 16: 'boom' };
  var WORLD_STARS = [0, 12, 30];

  function num(v, max) { v = Math.floor(Number(v)); if (!isFinite(v) || v < 0) return 0; return v > max ? max : v; }
  function loadSave() {
    var stars = store.get('stars', []), out = [], i;
    if (!Array.isArray(stars)) stars = [];
    for (i = 0; i < 24; i++) out.push(num(stars[i], 3));
    var seen = store.get('seen', {});
    if (!seen || typeof seen !== 'object') seen = {};
    var clean = {};
    CC.ORDER.forEach(function (id) { if (seen[id]) clean[id] = 1; });
    return {
      stars: out, pops: num(store.get('pops', 0), 1000000), collapse: num(store.get('collapse', 0), 100000),
      skin: num(store.get('skin', 0), 3), hat: num(store.get('hat', 0), 5), seen: clean
    };
  }
  var save = loadSave();
  var SAVE_KEYS = ['stars', 'pops', 'collapse', 'skin', 'hat', 'seen'];
  function persist() {
    var ok = true;
    SAVE_KEYS.forEach(function (k) { if (store.set(k, save[k]) === false) ok = false; });
    saveFailed = !ok;
    if (ok) saveUI.saved(); else saveUI.failed();
    return ok;
  }

  var dda = Kit.dda('castle-crash', { id: 'levels', tiers: 5, target: 0.72 });
  var ddaDuel = Kit.dda('castle-crash', { id: 'duel', tiers: 5, target: 0.72 });
  var scr = 'title', session = null, reported = false, tracked = 0, drag = null;
  var slowT = 0, slowSkip = 0, auto = null, toastT = 0, levelIndex = 0, mode = 'level', duelSeed = 3;
  var previewN = [0.6, 0.51, 0.42, 0.33, 0.25];
  var toughN = [0.8, 0.9, 1, 1.1, 1.2];

  function starCount() { var n = 0, i; for (i = 0; i < 24; i++) n += save.stars[i]; return n; }
  function worldOpen(w) { return starCount() >= WORLD_STARS[w]; }
  function levelOpen(i) { return worldOpen(Math.floor(i / 8)) && (i === 0 || save.stars[i - 1] > 0 || (i % 8 === 0)); }

  function paintTitle() {
    $('tStars').textContent = Kit.fmt(starCount());
    $('tCollapse').textContent = Kit.fmt(save.collapse);
  }
  function paintLevels() {
    var host = $('worlds'); host.innerHTML = '';
    var names = ['غابة الخشب', 'قمم الجليد', 'صحراء الحجر'];
    for (var w = 0; w < 3; w++) {
      var box = document.createElement('div');
      box.className = 'world' + (worldOpen(w) ? '' : ' locked');
      var h = document.createElement('h3');
      h.textContent = names[w] + (worldOpen(w) ? '' : ' · ' + WORLD_STARS[w] + '★');
      box.appendChild(h);
      var grid = document.createElement('div'); grid.className = 'lvls';
      for (var l = 0; l < 8; l++) {
        var idx = w * 8 + l;
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = String(l + 1);
        var sm = document.createElement('small');
        sm.textContent = '★★★'.slice(0, save.stars[idx]) || '·';
        b.appendChild(sm);
        b.disabled = !levelOpen(idx);
        b.setAttribute('data-level', String(idx));
        grid.appendChild(b);
      }
      box.appendChild(grid); host.appendChild(box);
    }
  }
  function paintHud() {
    if (!session) return;
    if (session.mode === 'level') {
      $('hFort').textContent = 'القلعة ' + (session.fort + 1) + '/3';
      $('hTurn').hidden = true;
    } else {
      $('hFort').textContent = session.turn === 0 ? 'اللاعب 1' : (session.cpu ? 'الكمبيوتر' : 'اللاعب 2');
      $('hTurn').hidden = false;
      $('hWho').textContent = String(session.turn + 1);
      $('hTime').textContent = String(Math.max(0, Math.ceil(CC.TIME.duelCap - session.turnT)));
    }
    $('hAmmo').textContent = session.mode === 'level' ? String(session.ammoLeft) : '∞';
    var sig = session.allow.join(',') + ':' + session.ammo;
    if (paintHud.sig === sig) return;
    paintHud.sig = sig;
    var row = $('hAmmos'); row.innerHTML = '';
    session.allow.forEach(function (id) {
      var b = document.createElement('button');
      b.type = 'button'; b.title = AMMO_META[id].name;
      b.style.background = AMMO_META[id].color;
      if (id === session.ammo) b.className = 'on';
      b.setAttribute('data-ammo', id);
      b.textContent = id === 'bowl' ? '●' : '•';
      row.appendChild(b);
    });
  }
  function toast(text) {
    var el = $('toast'); el.hidden = false; el.textContent = text; toastT = 1.6;
  }

  function go(screen) {
    scr = screen;
    show(screen === 'play' ? '' : 'scr' + screen.charAt(0).toUpperCase() + screen.slice(1));
    if (screen === 'title') { show('scrTitle'); paintTitle(); }
    if (screen === 'levels') { show('scrLevels'); paintLevels(); }
    if (screen === 'play') { $('hud').hidden = false; paintHud.sig = ''; paintHud(); }
    if (screen !== 'play') drag = null;
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  }

  function beginLevel(index) {
    levelIndex = index;
    mode = 'level';
    var fresh = NEW_AT[index];
    if (fresh && !save.seen[fresh]) {
      $('demoBall').style.background = AMMO_META[fresh].color;
      $('demoName').textContent = AMMO_META[fresh].name;
      $('demoTip').textContent = AMMO_META[fresh].tip;
      go('ammo');
      S.newAmmo();
      return;
    }
    var tier = dda.tier;
    var level = CCL.levels[index];
    session = CC.startLevel(level, {
      preview: previewN[tier - 1], tough: toughN[tier - 1], spare: tier <= 2 ? 1 : 0, seed: 1 + index
    });
    reported = false; tracked = 0; slowT = 0; auto = null;
    Kit.stats.round('w' + level.world + '-' + level.level);
    go('play');
    S.tap();
  }
  function beginDuel(cpu) {
    mode = cpu ? 'cpu' : 'pvp';
    var tier = cpu ? ddaDuel.tier : 3;
    duelSeed = (duelSeed * 17 + 3) % 80000 + 1;
    session = CC.startDuel({ seed: duelSeed, tier: tier, cpu: cpu ? 1 : 0, preview: cpu ? previewN[Math.min(4, tier - 1)] : 0.45 });
    reported = false; tracked = 0; slowT = 0; auto = null;
    if (cpu) Kit.stats.round('duel-cpu'); else Kit.stats.round('duel:pvp');
    go('play');
    S.tap();
  }
  function commit(result, score, ratio) {
    if (reported) return;
    reported = true;
    if (mode === 'level') {
      dda.result(ratio);
      Kit.stats.end(result, score);
      var i = levelIndex;
      if (result === 'win' && score > save.stars[i]) save.stars[i] = score;
      if (session.bestCollapse > save.collapse) save.collapse = session.bestCollapse;
      save.pops += session.popped;
      persist();
    } else if (mode === 'cpu') {
      ddaDuel.result(ratio);
      Kit.stats.end(result, score);
      save.pops += session.sidePop[0];
      persist();
    } else {
      Kit.stats.end('end');
    }
  }
  function showResult() {
    var win = session.phase === 'win' || (session.mode === 'duel' && session.winner === 0);
    if (session.mode === 'duel' && !session.cpu) {
      $('rTitle').textContent = session.winner === 0 ? 'اللاعب 1 فرقع الكل!' : 'اللاعب 2 فرقع الكل!';
      $('rStars').textContent = '';
      $('rSub').textContent = 'هلاميات: ' + session.sidePop[0] + ' — ' + session.sidePop[1];
      commit('end');
    } else if (mode === 'cpu') {
      var mine = session.sidePop[0];
      $('rTitle').textContent = win ? 'هزمت الكمبيوتر!' : 'الكمبيوتر فاز هذه المرة';
      $('rStars').textContent = '';
      $('rSub').textContent = 'فرقعْت ' + mine + ' هلاميات';
      commit(win ? 'win' : 'lose', mine, mine / 3);
      if (win) S.win(); else S.lose();
    } else {
      var stars = session.stars || 0;
      $('rTitle').textContent = session.phase === 'win' ? 'القلعة سقطت!' : 'نفدت الطلقات';
      $('rStars').textContent = stars ? '★★★'.slice(0, stars) : 'حاول مجددًا';
      $('rSub').textContent = 'طلقات متبقية: ' + Math.max(0, session.ammoLeft) + ' · انهيار: ' + session.bestCollapse;
      commit(session.phase === 'win' ? 'win' : 'lose', stars, stars / 3);
      if (session.phase === 'win') { S.win(); if (stars) S.star(stars); } else S.lose();
    }
    go('result');
  }

  function aimKeys(dt) {
    if (!session || session.phase !== 'aim') return;
    var up = false, down = false, left = false, right = false, fire = false;
    if (session.mode !== 'duel' || session.turn === 0) {
      up = Kit.keys.down('KeyW') || (session.mode !== 'duel' && Kit.keys.down('ArrowUp'));
      down = Kit.keys.down('KeyS') || (session.mode !== 'duel' && Kit.keys.down('ArrowDown'));
      left = Kit.keys.down('KeyA') || (session.mode !== 'duel' && Kit.keys.down('ArrowLeft'));
      right = Kit.keys.down('KeyD') || (session.mode !== 'duel' && Kit.keys.down('ArrowRight'));
      fire = Kit.keys.pressed('Space') || (session.mode !== 'duel' && Kit.keys.pressed('Enter'));
    }
    if (session.mode === 'duel' && session.turn === 1 && !session.cpu) {
      up = Kit.keys.down('ArrowUp'); down = Kit.keys.down('ArrowDown');
      left = Kit.keys.down('ArrowLeft'); right = Kit.keys.down('ArrowRight');
      fire = Kit.keys.pressed('Enter') || Kit.keys.pressed('Slash');
    }
    if (session.mode !== 'duel') {
      up = up || Kit.keys.down('ArrowUp') || Kit.keys.down('KeyW');
      down = down || Kit.keys.down('ArrowDown') || Kit.keys.down('KeyS');
      left = left || Kit.keys.down('ArrowLeft') || Kit.keys.down('KeyA');
      right = right || Kit.keys.down('ArrowRight') || Kit.keys.down('KeyD');
    }
    if (up) session.angle = Math.min(1.25, session.angle + 1.15 * dt);
    if (down) session.angle = Math.max(0.08, session.angle - 1.15 * dt);
    if (right) session.power = Math.min(1, session.power + 0.65 * dt);
    if (left) session.power = Math.max(0.15, session.power - 0.65 * dt);
    if (fire) { S.fire(session.ammo === 'bowl'); CC.fire(session); }
    if (Kit.keys.pressed('KeyQ') || Kit.keys.pressed('KeyE') || Kit.keys.pressed('Comma') || (session.mode !== 'duel' && Kit.keys.pressed('Period'))) {
      var i = session.allow.indexOf(session.ammo);
      var dir = (Kit.keys.pressed('KeyE') || Kit.keys.pressed('Period')) ? 1 : -1;
      session.ammo = session.allow[(i + dir + session.allow.length) % session.allow.length];
      S.tap(); paintHud();
    }
  }
  function powerKey() {
    if (!session || session.phase !== 'fly') return;
    var tap = Kit.keys.pressed('Space') || Kit.keys.pressed('KeyE');
    if (session.mode === 'duel' && session.turn === 1) tap = Kit.keys.pressed('Period');
    else if (session.mode !== 'duel') tap = tap || Kit.keys.pressed('Enter');
    if (tap) { if (CC.tap(session)) S.blast(); }
  }

  function dragAim() {
    if (!session || session.phase !== 'aim') { drag = null; return; }
    var s = session.sling;
    if (pointer.pressed) {
      var dx = pointer.x - s.x, dy = pointer.y - s.y;
      if (dx * dx + dy * dy < 110 * 110) drag = { x: pointer.x, y: pointer.y };
    }
    if (drag && pointer.down) {
      drag.x = pointer.x; drag.y = pointer.y;
      var pullX = pointer.x - s.x, pullY = pointer.y - s.y;
      var len = Math.hypot(pullX, pullY);
      session.power = Math.max(0.15, Math.min(1, len / 130));
      var lx = -pullX, ly = -pullY, dir = session.dir || 1;
      session.angle = Math.max(0.08, Math.min(1.25, Math.atan2(-ly, lx * dir)));
    }
    if (drag && pointer.released) {
      S.fire(session.ammo === 'bowl');
      CC.fire(session);
      drag = null;
    }
  }

  function hear() {
    if (!session) return;
    var ev = session.events, i;
    for (i = 0; i < ev.length; i++) {
      CCR.burstFrom(ev[i]);
      if (ev[i].t === 'fire') S.fire(ev[i].ammo === 'bowl');
      else if (ev[i].t === 'pop') { S.pop(); shake.add(5); if (!Kit.motion.reduced()) slowT = 0.5; }
      else if (ev[i].t === 'break') { S.break(ev[i].mat); shake.add(ev[i].mat === 'stone' ? 4 : 2); }
      else if (ev[i].t === 'blast') { S.blast(); shake.add(7); }
      else if (ev[i].t === 'crack') S.crack();
      else if (ev[i].t === 'tap' && ev[i].ammo !== 'boom') S.pull();
    }
  }

  function update(dt) {
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').hidden = true; }
    if (scr === 'title') {
      if (Kit.keys.pressed('Enter') || Kit.keys.pressed('Space')) $('bPlay').click();
    } else if (scr === 'result') {
      if (Kit.keys.pressed('Enter') || Kit.keys.pressed('Space') || Kit.keys.pressed('KeyR')) $('bAgain').click();
      if (Kit.keys.pressed('Escape')) $('bResultMenu').click();
    } else if (scr === 'pause') {
      if (Kit.keys.pressed('KeyP') || Kit.keys.pressed('Enter') || Kit.keys.pressed('Space')) resume();
    } else if (scr === 'levels') {
      if (Kit.keys.pressed('Escape')) go('title');
    } else if (scr === 'ammo') {
      if (Kit.keys.pressed('Enter') || Kit.keys.pressed('Space')) $('bAmmoGo').click();
    } else if (scr === 'play' && session) {
      if (Kit.keys.pressed('KeyP') || Kit.keys.pressed('Escape')) { pauseGame(); Kit.keys.endFrame(); pointer.endFrame(); return; }
      if (auto && session.phase === 'aim' && auto.length) {
        var shot = auto.shift();
        session.angle = shot.ang; session.power = shot.p; session.ammo = shot.a; session.pendingTap = shot.tap;
        CC.fire(session);
      }
      var flying = session.phase === 'fly';
      aimKeys(dt);
      if (flying) powerKey();
      dragAim();
      var scale = slowT > 0 && !Kit.motion.reduced() ? 0.5 : 1;
      if (slowT > 0) slowT -= dt;
      if (scale < 1) { slowSkip++; if (slowSkip % 2) { Kit.keys.endFrame(); pointer.endFrame(); return; } }
      CC.step(session);
      hear();
      if (session.shotDone !== tracked) {
        tracked = session.shotDone;
        if (session.lastPop > 0) Kit.track.hit(); else Kit.track.miss();
      }
      CCR.stepParts(dt);
      shake.update(dt);
      paintHud();
      if (session.phase === 'win' || session.phase === 'lose' || session.phase === 'over') showResult();
    }
    Kit.keys.endFrame();
    pointer.endFrame();
  }
  var drew = false;
  function render() {
    if (!session) {
      ctx.setTransform(view.ctx.getTransform());
      ctx.drawImage(CCR.sky(0), 0, 0);
      drew = true;
      return;
    }
    // Keep the paused and result frame instead of clearing it.
    if (scr !== 'play') {
      if (drew) return;
    } else drew = false;
    ctx.setTransform(view.ctx.getTransform());
    ctx.save();
    ctx.translate(shake.x, shake.y);
    var dots = null;
    if (session.phase === 'aim') {
      var all = CC.predict(session, session.angle, session.power, session.ammo, 90);
      var n = Math.floor(all.length * (session.preview || 0.4) / 2) * 2;
      dots = all.slice(0, n);
    }
    CCR.draw(ctx, session, { drag: drag, dots: dots, hat: HATS[save.hat], fork: FORKS[save.skin] });
    ctx.restore();
    if (scr !== 'play') drew = true;
  }

  function pauseGame() {
    if (scr !== 'play') return;
    scr = 'pause';
    show('scrPause');
    $('hud').hidden = true;
  }
  function resume() {
    if (scr !== 'pause') return;
    scr = 'play';
    show('');
    $('hud').hidden = false;
    S.tap();
  }
  function restart() {
    if (mode === 'level') beginLevel(levelIndex);
    else beginDuel(mode === 'cpu');
  }

  $('bPlay').onclick = function () { var i = 0; while (i < 23 && save.stars[i] > 0 && levelOpen(i + 1)) i++; beginLevel(levelOpen(i) ? i : 0); };
  $('bLevels').onclick = function () { go('levels'); S.tap(); };
  $('bLevelsBack').onclick = function () { go('title'); S.back(); };
  $('bCpu').onclick = function () { beginDuel(true); };
  $('bDuel').onclick = function () { beginDuel(false); };
  $('bPause').onclick = function () { pauseGame(); this.blur(); };
  $('bResume').onclick = function () { resume(); this.blur(); };
  $('bRestart').onclick = function () { restart(); this.blur(); };
  $('bMenu').onclick = function () { session = null; go('title'); S.back(); };
  $('bAgain').onclick = function () { restart(); };
  $('bResultMenu').onclick = function () { session = null; go('title'); S.back(); };
  $('bAmmoGo').onclick = function () {
    var id = NEW_AT[levelIndex];
    if (id) save.seen[id] = 1;
    persist();
    beginLevel(levelIndex);
  };
  $('worlds').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b || b.disabled) return;
    beginLevel(Number(b.getAttribute('data-level')));
  });
  $('hAmmos').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b || !session) return;
    session.ammo = b.getAttribute('data-ammo');
    S.tap(); paintHud(); b.blur();
  });

  Kit.muteButton();
  Kit.lifecycle({
    pause: function () { pauseGame(); },
    reset: function () { drag = null; pointer.reset(); }
  });
  Kit.loop(update, render);
  paintTitle();
  go('title');
  if (document.fonts && document.fonts.load) {
    document.fonts.load('700 40px Fredoka', 'ب').then(function () { drew = false; }).catch(function () {});
  }

  window.__game = {
    get state() { return scr; },
    get paused() { return scr === 'pause'; },
    get aim() { return session ? session.angle : 0; },
    get phase() { return session ? session.phase : ''; },
    get shots() { return session ? session.used : 0; },
    get clock() { return session ? session.time : 0; },
    get session() { return session; },
    get save() { return save; },
    slingPoint: function () {
      if (!session) return { x: 214, y: 552 };
      var r = canvas.getBoundingClientRect();
      return { x: r.left + session.sling.x * view.scale, y: r.top + session.sling.y * view.scale };
    },
    start: function (opts) {
      opts = opts || {};
      if (opts.mode === 'duel') beginDuel(!opts.pvp);
      else beginLevel(opts.level || 0);
    },
    solve: function () {
      if (mode !== 'level' || !session) return;
      auto = (CCS[session.level.id] || []).slice();
    },
    endNow: function () {
      if (!session || reported) return;
      if (session.mode === 'duel' && !session.cpu) { session.phase = 'over'; session.winner = 0; session.time = 21; showResult(); }
      else if (mode === 'cpu') { session.phase = 'over'; session.winner = 0; session.sidePop[0] = 3; showResult(); }
      else { session.phase = 'win'; session.stars = 3; showResult(); }
    },
    setTime: function (t) { if (session) session.turnT = CC.TIME.duelCap - t; }
  };
  Kit.ready();
})();
