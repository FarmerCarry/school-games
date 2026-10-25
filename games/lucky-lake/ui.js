/* Screens, input, juice, saving and play statistics. The simulation stays in engine.js. */
(function () {
  'use strict';
  var LL = window.LuckyLake;
  var Art = window.LLArt;
  var Sfx = window.LLAudio;
  var $ = function (id) { return document.getElementById(id); };
  var canvas = $('game');
  var ui = $('ui');
  var dirty = true;
  var paints = 0;
  var view = Kit.fit(canvas, 1280, 720, { onResize: function (v) {
    ui.style.left = canvas.style.left;
    ui.style.top = canvas.style.top;
    ui.style.transform = 'scale(' + v.scale + ')';
    dirty = true;
  } });
  var ctx = view.ctx;

  var store = Kit.store('lucky-lake');
  var saveStatus = Kit.saveStatus({ retry: persist });
  var save = LL.normalize(store.get('save', null));
  var game = null;
  var mode = 'title';
  var panel = '';
  var mouseDown = false;
  var edge = false;
  var arm = false;
  var time = 0;
  var aquaT = 0;
  var slow = 0;
  var taught = save.caught > 0;
  var shoutT = 0;
  var padT = 0;
  var reelSnd = 0;
  var statsOpen = '';
  var gull = null;
  var bye = null;
  var parts = [];
  var pops = [];
  var rings = [];
  var shake = Kit.shake();
  var hudCache = '';
  var cardKey = '';

  function persist() {
    var data = game ? game.exportSave() : save;
    if (store.set('save', data) === false) { saveStatus.failed(); return false; }
    save = data;
    saveStatus.saved();
    return true;
  }

  function dayStamp() {
    var d = new Date();
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  }

  function liveSave() { return game ? game.state.save : save; }

  function revealing() {
    return !!(game && !game.state.derby && game.state.anglers[0].phase === 'reveal');
  }

  function simOn() {
    return mode === 'play' && !!game && !panel && !revealing();
  }

  function focusGame() { try { canvas.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }

  function show(id, on) { $(id).hidden = !on; }

  function paintChrome() {
    show('scr-title', mode === 'title');
    show('scr-pause', mode === 'pause');
    show('scr-result', mode === 'result');
    show('scr-card', mode === 'play' && revealing());
    show('scr-panel', mode === 'play' && !!panel && !revealing());
    $('hud').hidden = mode === 'title';
    var play = mode === 'play' || mode === 'pause';
    $('questLine').hidden = !play;
    $('eventBanner').hidden = !play;
    var ready = game && game.state.anglers[0].phase === 'ready';
    $('hint').hidden = !(mode === 'play' && !panel && !revealing() && !taught && ready && !game.state.derby);
    if (mode !== 'play' || panel) { mouseDown = false; edge = false; }
    dirty = true;
    refreshHud(true);
    if (mode === 'title') refreshTitle();
    if (mode === 'play' && revealing()) fillCard();
  }

  function refreshTitle() {
    var s = liveSave();
    var spot = LL.SPOTS[s.spot] || LL.SPOTS[0];
    $('titleProgress').textContent = 'الكتاب ' + LL.bookCount(s.book) + '/60 · ' + s.coins + ' عملة · ' + spot.name;
    $('easyToggle').checked = !!s.easy;
    $('easyPause').checked = !!s.easy;
    var buttons = document.querySelectorAll('[data-sec]');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].setAttribute('aria-pressed', String(Number(buttons[i].getAttribute('data-sec')) === s.derby));
    }
  }

  function refreshHud(force) {
    var s = liveSave();
    var spot = game ? game.state.spot : s.spot;
    var name = (LL.SPOTS[spot] || LL.SPOTS[0]).name;
    if (game && game.state.derby) name = 'مسابقة · ' + name;
    var left = game && game.state.derby ? Math.max(0, Math.ceil(game.state.left)) : 0;
    var clock = Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0');
    var book = LL.bookCount(s.book) + '/60';
    var evKey = game ? game.state.event.id + Math.ceil(game.state.event.left) : '';
    var key = s.coins + '|' + book + '|' + name + '|' + clock + '|' + evKey;
    if (!force && key === hudCache) return;
    hudCache = key;
    $('coinNum').textContent = String(s.coins);
    $('bookNum').textContent = book;
    $('spotPill').textContent = name;
    $('timerPill').hidden = !(game && game.state.derby);
    $('timerPill').textContent = clock;
    var q = s.quests && s.quests[0];
    $('questLine').textContent = q ? (q.text + '  ' + q.have + '/' + q.n) : '';
    if (game) {
      var ev = game.state.event;
      var info = LL.EVENTS[ev.id] || LL.EVENTS.calm;
      var sec = Math.max(0, Math.ceil(ev.left));
      $('eventBanner').textContent = '';
      var strong = document.createElement('b');
      strong.textContent = info.name + ' · ' + sec;
      var small = document.createElement('small');
      small.textContent = info.odds;
      $('eventBanner').appendChild(strong);
      $('eventBanner').appendChild(small);
    }
  }

  function burst(x, y, n, colors) {
    if (Kit.motion.reduced()) return;
    for (var i = 0; i < n && parts.length < 200; i++) {
      var a = Math.random() * 6.2832;
      var sp = 70 + Math.random() * 240;
      parts.push({
        x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 80,
        life: 0.35 + Math.random() * 0.4, max: 0.75,
        size: 3 + Math.random() * 5,
        color: colors[i % colors.length], g: 520
      });
    }
  }

  function pop(text, x, y, color) {
    pops.push({ text: text, x: x, y: y, life: 0.95, color: color || '#ffe14a' });
  }

  function shout(text, bang) {
    var el = $('shout');
    el.hidden = false;
    el.textContent = text;
    el.className = bang ? 'bang' : '';
    shoutT = bang ? 0.7 : 1.15;
  }

  function closePanel() { panel = ''; paintChrome(); }

  function togglePanel(name) {
    if (mode !== 'play' || revealing()) return;
    panel = panel === name ? '' : name;
    if (panel) fillPanel();
    paintChrome();
  }

  function btn(label, act, idx, on, disabled) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'll-card' + (on ? ' on' : '');
    b.setAttribute('data-act', act);
    b.setAttribute('data-i', String(idx));
    b.disabled = !!disabled;
    b.innerHTML = label;
    return b;
  }

  function fillPanel() {
    var s = liveSave();
    var body = $('panelBody');
    body.textContent = '';
    if (panel === 'shop') {
      $('panelTitle').textContent = 'المتجر';
      var grid = document.createElement('div');
      grid.className = 'll-grid';
      LL.RODS.forEach(function (rod, i) {
        var owned = !!s.rods[i];
        var label = '<b>' + rod.name + '</b><small>' + (owned ? (s.rod === i ? 'في اليد' : 'جهّز') : rod.cost + ' عملة') + '</small>';
        grid.appendChild(btn(label, owned ? 'equip' : 'rod', i, s.rod === i, !owned && s.coins < rod.cost));
      });
      LL.BAITS.forEach(function (bait, i) {
        var label = '<b>' + bait.name + '</b><small>' + bait.note + ' · ' + (s.bait[i] || 0) + ' · ' + bait.cost + '</small>';
        grid.appendChild(btn(label, 'bait', i, s.baitOn === i, s.coins < bait.cost || s.bait[i] > 89));
      });
      grid.appendChild(btn('<b>بلا طُعم</b><small>السنارة وحدها</small>', 'baitOn', -1, s.baitOn < 0, false));
      grid.appendChild(btn('<b>قارب</b><small>' + (s.boat ? 'عندك' : '100 عملة · يفتح الشعاب') + '</small>', 'boat', 0, !!s.boat, !!s.boat || s.coins < 100));
      LL.DECOR.forEach(function (d, i) {
        grid.appendChild(btn('<b>' + d.name + '</b><small>' + (s.decor[i] ? 'في البحيرة' : d.cost + ' عملة') + '</small>', 'decor', i, !!s.decor[i], !!s.decor[i] || s.coins < d.cost));
      });
      body.appendChild(grid);
      return;
    }
    if (panel === 'book') {
      $('panelTitle').textContent = 'كتاب الأسماك';
      var odds = LL.odds({ luck: game ? game.state.anglers[0].rod.luck : 0, spot: game ? game.state.spot : s.spot, day: game ? game.state.day : dayStamp(), event: game ? game.state.event.id : 'calm' });
      var line = document.createElement('p');
      line.className = 'll-odds';
      line.textContent = odds.rare.map(function (r) { return r.name + ' ' + r.pct + '%'; }).join(' · ') + ' · غريب ' + odds.junk + '%';
      if (odds.rainbow) line.textContent += ' · قوس ' + odds.rainbow + '%';
      if (odds.glow) line.textContent += ' · مضيئة ' + odds.glow + '%';
      body.appendChild(line);
      var book = document.createElement('div');
      book.className = 'll-book';
      for (var i = 0; i < 60; i++) {
        var fish = LL.FISH[i];
        var caught = s.book[i] > 0;
        var cell = document.createElement('div');
        cell.className = 'll-fish' + (caught ? '' : ' missed');
        cell.appendChild(fishCanvas(fish, !caught));
        var name = document.createElement('b');
        name.textContent = caught || fish.junk ? fish.name : '؟؟؟';
        var meta = document.createElement('small');
        meta.textContent = caught ? (s.book[i].toFixed(1) + ' كغ') : (fish.boss ? 'زعيم' : LL.RARE_NAME[fish.rare] || '');
        cell.appendChild(name);
        cell.appendChild(meta);
        book.appendChild(cell);
      }
      body.appendChild(book);
      return;
    }
    if (panel === 'map') {
      $('panelTitle').textContent = 'الخريطة';
      var spots = document.createElement('div');
      spots.className = 'll-grid';
      LL.SPOTS.forEach(function (spot, i) {
        var open = LL.spotOpen(s, i);
        var label = '<b>' + spot.name + '</b><small>' + (open ? (game.state.spot === i ? 'أنت هنا' : 'سافر') : spot.need) + '</small>';
        spots.appendChild(btn(label, 'travel', i, game.state.spot === i, !open));
      });
      body.appendChild(spots);
      return;
    }
    if (panel === 'aqua') {
      $('panelTitle').textContent = 'الحوض ' + s.aqua.length + '/24';
      var note = document.createElement('p');
      note.className = 'll-odds';
      note.textContent = s.aqua.length ? 'أسماكك تسبح خلف هذه النافذة.' : 'الحوض فارغ. اختر «حوض» عندما تصطاد سمكة.';
      body.appendChild(note);
    }
  }

  function fishCanvas(fish, sil) {
    var c = document.createElement('canvas');
    c.width = 96;
    c.height = 56;
    c.getContext('2d').drawImage(sil ? Art.silhouette(fish) : Art.sprite(fish, false), 0, 0);
    return c;
  }

  function fillCard() {
    var fish = game.state.anglers[0].fish;
    if (!fish) return;
    var key = fish.id + ':' + fish.w + ':' + fish.rb + ':' + fish.glow + ':' + fish.day;
    if (key === cardKey) return;
    cardKey = key;
    var s = liveSave();
    var viewFish = $('fishView');
    var g = viewFish.getContext('2d');
    g.clearRect(0, 0, viewFish.width, viewFish.height);
    Art.blit(g, fish, 110, 62, 1.15, time);
    $('cardNew').hidden = !(!(s.book[fish.id] > 0));
    $('cardName').textContent = fish.name;
    $('cardWeight').textContent = fish.w.toFixed(1) + ' كغ';
    var rare = $('cardRare');
    rare.className = 'll-ribbon' + (fish.rare >= 2 ? ' r' + Math.min(fish.rare, 4) : '');
    rare.textContent = fish.junk ? 'غريب' : (fish.boss ? 'زعيم' : LL.RARE_NAME[fish.rare]);
    var tags = [];
    if (fish.rb) tags.push('قوس ×5');
    if (fish.day) tags.push('سمكة اليوم ×3');
    if (fish.glow) tags.push('مضيئة ×1.5');
    if (s.book[fish.id] > 0 && fish.w > s.book[fish.id]) tags.push('رقم قياسي!');
    $('cardPrice').textContent = LL.priceOf(fish) + ' عملة' + (tags.length ? ' · ' + tags.join(' · ') : '');
    $('cardHint').textContent = '';
    $('btnKeep').disabled = !!fish.junk;
  }

  function choose(choice) {
    if (!revealing()) return;
    var res = game.resolve(0, choice);
    if (!res.ok) {
      if (res.full) $('cardHint').textContent = 'الحوض ممتلئ (24). بِع سمكة أو أطلقها.';
      return;
    }
    cardKey = '';
    if (res.stolen) {
      Sfx.gull();
      shout('النورس سرقها!');
      gull = { x: -40, y: 120, t: 0 };
    } else if (res.hint) {
      shout(res.hint);
      shoutT = 2.4;
    } else if (res.choice === 'sell') {
      Sfx.catch(0);
      if (res.price) pop('+' + res.price, 1040, 80, '#ffe14a');
    } else if (res.choice === 'release') {
      shout('مع السلامة!');
      burst(640, 360, 16, ['#b8ffcf', '#fff']);
    } else {
      shout('إلى الحوض!');
    }
    persist();
    refreshHud(true);
    paintChrome();
  }

  function onPanelClick(e) {
    var b = e.target.closest('[data-act]');
    if (!b || !game) return;
    var act = b.getAttribute('data-act');
    var idx = Number(b.getAttribute('data-i'));
    if (act === 'travel') {
      if (game.travel(idx)) { Sfx.cast(); persist(); closePanel(); }
    } else if (game.buy(act, idx)) {
      Sfx.buy();
      pop('تم', 1040, 90, '#fff');
      persist();
      refreshHud(true);
      fillPanel();
    }
    if (e.detail > 0) b.blur();
  }

  function setEasy(on) {
    var s = liveSave();
    s.easy = on ? 1 : 0;
    if (game) game.setEasy(on);
    persist();
    refreshTitle();
  }

  function setSeconds(sec) {
    save.derby = sec;
    if (game) game.setDerby(sec);
    else liveSave().derby = sec;
    persist();
    refreshTitle();
  }

  function bootGame(players, extra) {
    var data = game ? game.exportSave() : save;
    game = LL.createGame(Object.assign({
      save: data,
      seed: (Math.random() * 1e9) >>> 0,
      day: dayStamp(),
      players: players,
      easy: data.easy
    }, extra || {}));
    panel = '';
    cardKey = '';
    slow = 0;
    parts.length = 0;
    pops.length = 0;
    rings.length = 0;
    gull = null;
    bye = null;
    taught = game.state.save.caught > 0;
    mode = 'play';
    arm = Kit.keys.down('Space') || mouseDown;
    Kit.keys.reset();
    mouseDown = false;
    edge = false;
    hudCache = '';
    paintChrome();
    focusGame();
  }

  function startSolo() {
    bootGame(1, { spot: liveSave().spot });
    Kit.stats.round('solo');
    statsOpen = 'solo';
  }

  function startDerby() {
    var sec = liveSave().derby || 180;
    bootGame(2, { players: 2, seconds: sec, spot: 1, forceSpot: 1 });
    Kit.stats.round('derby');
    statsOpen = 'derby';
  }

  function endSolo() {
    if (statsOpen === 'solo' && game) {
      Kit.stats.end('end', LL.bookCount(game.state.save.book));
      statsOpen = '';
    }
  }

  function toMenu() {
    endSolo();
    if (game) save = game.exportSave();
    persist();
    panel = '';
    mode = 'title';
    paintChrome();
  }

  function pause() {
    if (mode !== 'play') return;
    mode = 'pause';
    mouseDown = false;
    edge = false;
    paintChrome();
  }

  function resume() {
    if (mode !== 'pause') return;
    mode = 'play';
    Kit.keys.reset();
    mouseDown = false;
    edge = false;
    paintChrome();
    focusGame();
  }

  function restartCast() {
    if (!game) return;
    game.resetCast();
    panel = '';
    cardKey = '';
    mode = 'play';
    persist();
    paintChrome();
    focusGame();
  }

  function showResult() {
    var st = game.state;
    mode = 'result';
    panel = '';
    $('resultTitle').textContent = st.draw ? 'تعادل!' : ('فاز اللاعب ' + (st.winner + 1));
    var pod = $('podium');
    pod.textContent = '';
    for (var i = 0; i < st.anglers.length; i++) {
      var box = document.createElement('div');
      box.className = 'll-pod' + (st.winner === i ? ' win' : '');
      var h = document.createElement('h3');
      h.textContent = 'لاعب ' + (i + 1) + (st.crown === i ? ' 👑' : '');
      var p = document.createElement('p');
      p.dir = 'ltr';
      p.textContent = st.anglers[i].weight.toFixed(1) + ' كغ';
      var small = document.createElement('small');
      small.textContent = 'أكبر سمكة ' + st.anglers[i].best.toFixed(1);
      box.appendChild(h);
      box.appendChild(p);
      box.appendChild(small);
      pod.appendChild(box);
    }
    $('resultSub').textContent = 'يفوز مجموع الأوزان. التاج لأكبر سمكة في المسابقة.';
    paintChrome();
  }

  function downP1() {
    var held = Kit.keys.down('Space') || mouseDown;
    if (arm) { if (!held) arm = false; return false; }
    return held;
  }

  function readInput() {
    var card = revealing();
    var block = mode !== 'play' || !!panel || card;
    return {
      down: !block && downP1(),
      pressed: !block && (Kit.keys.pressed('Space') || edge),
      left: !block && (Kit.keys.down('KeyA') || (game.state.anglers.length === 1 && Kit.keys.down('ArrowLeft'))),
      right: !block && (Kit.keys.down('KeyD') || (game.state.anglers.length === 1 && Kit.keys.down('ArrowRight'))),
      p2down: !block && game.state.anglers.length > 1 && (Kit.keys.down('Enter') || Kit.keys.down('NumpadEnter')),
      p2pressed: !block && game.state.anglers.length > 1 && (Kit.keys.pressed('Enter') || Kit.keys.pressed('NumpadEnter')),
      p2left: !block && Kit.keys.down('ArrowLeft'),
      p2right: !block && Kit.keys.down('ArrowRight')
    };
  }

  function questSnap() {
    return liveSave().quests.map(function (q) { return q.k + ':' + q.have + ':' + q.n; }).join('|');
  }

  function handleEvents(ev, before) {
    for (var i = 0; i < ev.length; i++) {
      var e = ev[i];
      if (e.t === 'cast') {
        taught = true;
        Sfx.cast();
        if (e.perfect) { Sfx.perfect(); shout('رمية ممتازة!'); burst(640, 280, 18, ['#ffe14a', '#fff']); shake.add(5); }
      } else if (e.t === 'nibble') {
        Sfx.plip();
        var dip = bobberOf(game.state.anglers[e.i]);
        rings.push({ x: dip.x, y: dip.y, t: 0 });
      } else if (e.t === 'bite') {
        Sfx.bite();
        shout('!', true);
        shake.add(7);
        var biteAt = bobberOf(game.state.anglers[e.i]);
        rings.push({ x: biteAt.x, y: biteAt.y, t: 0 });
        burst(biteAt.x, biteAt.y, 12, ['#e7f8ff', '#fff', '#7ee0ff']);
      }
      else if (e.t === 'splash') burst(bobberOf(game.state.anglers[e.i]).x, 330, e.kind === 'cast' ? 10 : 6, ['#e7f8ff', '#7ee0ff']);
      else if (e.t === 'catch') {
        var fish = game.state.anglers[e.i].fish;
        Sfx.catch(fish ? fish.rare : 0);
        Sfx.splash(!!(fish && (fish.rare >= 3 || fish.boss)));
        shout(fish && (fish.rare >= 3 || fish.boss) ? fish.name : 'أمسكتها!');
        shake.add(fish && (fish.rare >= 4 || fish.boss) ? 12 : 6);
        burst(640, 300, fish && fish.rare >= 3 ? 28 : 14, ['#ffe14a', '#7ee0ff', '#fff', '#ff8ad4']);
        if (fish && (fish.rare >= 4 || fish.boss) && !Kit.motion.reduced()) slow = 0.4;
        pop((fish ? fish.w.toFixed(1) : '') + ' كغ', 640, 240, '#fff');
      }       else if (e.t === 'escape') {
        Sfx.miss();
        shout('مع السلامة!');
        bye = { id: e.id, i: e.i, t: 0 };
      } else if (e.t === 'miss') { Sfx.miss(); shout('هرب!'); }
      else if (e.t === 'scare') { Sfx.miss(); shout('فزع!'); }
      else if (e.t === 'reveal') { persist(); cardKey = ''; paintChrome(); }
      else if (e.t === 'banked') {
        var w = game.state.anglers[e.i].weight;
        pop(w.toFixed(1), e.i ? 180 : 1100, 80, '#ffe14a');
        refreshHud(true);
      } else if (e.t === 'derby') {
        if (statsOpen === 'derby') { Kit.stats.end(e.result, e.score); statsOpen = ''; }
        persist();
        showResult();
      }
    }
    if (before && questSnap() !== before) {
      shout('مهمة تمت!');
      pop('+', 1040, 120, '#b8ffcf');
      refreshHud(true);
    }
  }

  function stepJuice(dt) {
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.life -= dt;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (var r = rings.length - 1; r >= 0; r--) {
      rings[r].t += dt;
      if (rings[r].t > 0.6) rings.splice(r, 1);
    }
    for (var k = pops.length - 1; k >= 0; k--) {
      pops[k].life -= dt;
      pops[k].y -= dt * 46;
      if (pops[k].life <= 0) pops.splice(k, 1);
    }
    if (gull) { gull.t += dt; gull.x += dt * 520; if (gull.x > 1360) gull = null; }
    if (bye) { bye.t += dt; if (bye.t > 0.9) bye = null; }
    if (shoutT > 0) { shoutT -= dt; if (shoutT <= 0) $('shout').hidden = true; }
  }

  function update(dt) {
    var keys = keysUI();
    if (simOn()) {
      var scale = slow > 0 && !Kit.motion.reduced() ? 0.35 : 1;
      if (slow > 0) slow = Math.max(0, slow - dt);
      var before = questSnap();
      var ev = game.step(dt * scale, readInput());
      handleEvents(ev, before);
      var a0 = game.state.anglers[0];
      if (a0.phase === 'reel' && (Kit.keys.down('Space') || mouseDown)) {
        reelSnd += dt;
        if (reelSnd > 0.16) { reelSnd = 0; Sfx.reel(); }
      }
      time += dt;
      shake.update(dt);
      stepJuice(dt);
      padT += dt;
      if (padT > 1.6) { padT = 0; Sfx.pad(); }
      refreshHud(false);
      if (a0.phase === 'reveal') fillCard();
    } else if (mode === 'play' && panel === 'aqua') {
      aquaT += dt;
      time += dt;
    } else if (mode === 'title') {
      time += dt;
      padT += dt;
      if (padT > 2.4) { padT = 0; Sfx.pad(); }
    }
    if (keys) { /* UI keys already applied */ }
    edge = false;
    Kit.keys.endFrame();
  }

  function keysUI() {
    if (mode === 'title' && (Kit.keys.pressed('Enter') || Kit.keys.pressed('NumpadEnter') || Kit.keys.pressed('Space'))) {
      startSolo();
      return true;
    }
    if (mode === 'result' && (Kit.keys.pressed('Enter') || Kit.keys.pressed('NumpadEnter') || Kit.keys.pressed('KeyR'))) {
      startDerby();
      return true;
    }
    if (mode === 'pause' && Kit.keys.pressed('KeyR')) { restartCast(); return true; }
    var esc = Kit.keys.pressed('Escape');
    var pkey = Kit.keys.pressed('KeyP');
    if (mode === 'play' && panel && esc) { closePanel(); return true; }
    if (mode === 'play' && revealing()) {
      if (Kit.keys.pressed('Digit1')) choose('sell');
      else if (Kit.keys.pressed('Digit2')) choose('keep');
      else if (Kit.keys.pressed('Digit3')) choose('release');
      else if (pkey) pause();
      return true;
    }
    if (mode === 'play' && !panel) {
      if (Kit.keys.pressed('Digit1')) togglePanel('shop');
      else if (Kit.keys.pressed('Digit2')) togglePanel('book');
      else if (Kit.keys.pressed('Digit3')) togglePanel('aqua');
      else if (Kit.keys.pressed('Digit4')) togglePanel('map');
    } else if (mode === 'play' && panel) {
      if (Kit.keys.pressed('Digit1')) togglePanel('shop');
      else if (Kit.keys.pressed('Digit2')) togglePanel('book');
      else if (Kit.keys.pressed('Digit3')) togglePanel('aqua');
      else if (Kit.keys.pressed('Digit4')) togglePanel('map');
    }
    if ((esc || pkey) && mode === 'play') pause();
    else if ((esc || pkey) && mode === 'pause') resume();
    return true;
  }

  function faceOf(i) { return !game || game.state.anglers.length === 1 || i === 0 ? 1 : -1; }
  function anglerX(i) { return !game || game.state.anglers.length === 1 ? 210 : (i === 0 ? 168 : 1112); }

  function bobberOf(a) {
    var face = faceOf(a.i);
    var dist = a.phase === 'ready' || a.phase === 'charge' ? 0.15 : (a.dist || 0.4);
    var x = anglerX(a.i) + face * (150 + dist * 460 + a.aim * 80);
    x = Math.max(70, Math.min(1210, x));
    var dip = a.dip > 0 ? 18 * Math.min(1, a.dip / 0.26) : 0;
    var y = 338 + dip + Math.sin(time * 2.2 + a.i) * 2;
    if (a.phase === 'flight') {
      var u = Math.min(1, a.flightT / 0.42);
      var tip = anglerX(a.i) + face * 46;
      x = tip + (x - tip) * u;
      y = 250 + (y - 250) * u - Math.sin(u * 3.1416) * 70;
    }
    return { x: x, y: y };
  }

  function drawWorld(spot, night, t) {
    var pal = Art.backdrop(ctx, spot, t, night);
    Art.props(ctx, spot, pal, t, 300);
    Art.water(ctx, pal, 300, t, spot === 2 ? 760 : 980);
    return pal;
  }

  function drawShadows() {
    var list = game.state.shadows;
    ctx.save();
    ctx.fillStyle = '#042033';
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      ctx.globalAlpha = 0.28;
      ctx.beginPath();
      ctx.ellipse(180 + s.x * 920, 390 + s.y * 250, 36 * s.s, 12 * s.s, 0, 0, 6.2832);
      ctx.fill();
    }
    var anglers = game.state.anglers;
    for (var n = 0; n < anglers.length; n++) {
      var a = anglers[n];
      if (a.phase !== 'wait' && a.phase !== 'bite') continue;
      var u = a.phase === 'bite' ? 1 : Math.min(1, a.waitT / Math.max(0.2, a.waitNeed));
      var b = bobberOf(a);
      var x = b.x - 220 * (1 - u) * faceOf(n);
      var y = 470 - u * 110 + Math.sin(time * 3 + n) * 8;
      var wide = 22 + u * 18;
      ctx.globalAlpha = 0.35 + u * 0.25;
      ctx.beginPath();
      ctx.ellipse(x, y, wide, 9 + u * 4, 0, 0, 6.2832);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawDecor(s) {
    if (s.decor[0]) { ctx.fillStyle = '#2f8a48'; ctx.fillRect(250, 250, 8, 40); ctx.beginPath(); ctx.arc(254, 246, 16, 0, 6.3); ctx.fill(); }
    if (s.decor[1]) { ctx.fillStyle = '#e07a5f'; ctx.fillRect(300, 230, 46, 28); ctx.fillStyle = '#ffd24a'; ctx.fillRect(312, 214, 22, 16); }
    if (s.decor[2]) {
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      for (var i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(360 + i * 18, 280 - ((time * 40 + i * 20) % 80), 4, 0, 6.3); ctx.fill(); }
    }
    if (s.decor[3]) { ctx.fillStyle = '#ffe56a'; ctx.fillRect(430, 70, 4, 18); ctx.beginPath(); ctx.arc(432, 64, 7, 0, 6.3); ctx.fill(); }
  }

  function drawAnglers() {
    var st = game.state;
    for (var i = 0; i < st.anglers.length; i++) {
      var a = st.anglers[i];
      var face = faceOf(i);
      var lean = a.phase === 'charge' ? a.power : (a.phase === 'reel' ? 0.35 : 0);
      var shirt = i === 0 ? '#3ec6ff' : '#ff8a3d';
      var tip = Art.angler(ctx, anglerX(i), 332, face, shirt, time, lean);
      if (a.phase === 'charge') Art.meter(ctx, anglerX(i) + face * 48 - 13, 150, a.power);
      if (a.phase !== 'ready' && a.phase !== 'reveal' && a.phase !== 'scared') {
        var b = bobberOf(a);
        var wob = a.phase === 'wait' ? Math.sin(time * 8) * 6 : 0;
        Art.line(ctx, tip.x, tip.y, b.x, b.y, wob);
        Art.bobber(ctx, b.x, b.y);
        if (a.phase === 'bite') {
          ctx.font = '700 72px Fredoka';
          ctx.textAlign = 'center';
          ctx.direction = 'ltr';
          ctx.fillStyle = '#ffe14a';
          ctx.fillText('!', b.x, b.y - 28);
        }
      }
      if (a.phase === 'reel') {
        var rx = st.anglers.length === 1 ? 1088 : (i === 0 ? 24 : 1170);
        Art.reel(ctx, rx, 168, 300, a);
      }
      if (a.phase === 'show' && a.fish) {
        var u = Math.min(1, a.showT / 0.85);
        var from = bobberOf(a);
        var x = from.x + (anglerX(i) - from.x) * u;
        var y = from.y + (180 - from.y) * u - Math.sin(u * 3.1416) * 120;
        var sc = (1.1 + u * 0.8) * (1 + Math.sin(u * 9) * 0.08);
        Art.blit(ctx, a.fish, x, y, sc, time);
      }
      if ((a.phase === 'show' || a.phase === 'reveal') && a.fish && (a.fish.rare >= 4 || a.fish.boss)) {
        ctx.strokeStyle = '#ffd76a';
        ctx.lineWidth = 12;
        ctx.strokeRect(8, 8, 1264, 704);
      }
    }
  }

  function drawAqua() {
    var s = liveSave();
    ctx.fillStyle = '#08345a';
    ctx.fillRect(0, 0, 1280, 720);
    ctx.fillStyle = '#0e6ea8';
    ctx.fillRect(80, 70, 1120, 580);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 8;
    ctx.strokeRect(80, 70, 1120, 580);
    for (var i = 0; i < s.aqua.length; i++) {
      var pet = s.aqua[i];
      var def = LL.FISH[pet.id];
      if (!def) continue;
      var fish = Object.assign({}, def, { w: pet.w, rb: pet.rb, glow: 0 });
      var speed = def.beh === 'dart' ? 120 : 48;
      var x = 140 + ((i * 160 + aquaT * speed) % 980);
      var y = 150 + (i % 6) * 78 + Math.sin(aquaT * (def.beh === 'jump' ? 4 : 1.3) + i) * 16;
      if (def.beh === 'sink') y += 24;
      if (def.beh === 'float') y -= 20;
      Art.blit(ctx, fish, x, y, 0.72, aquaT);
    }
  }

  function drawFx() {
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    if (gull) Art.gull(ctx, gull.x, gull.y + Math.sin(gull.t * 9) * 10, gull.t);
    if (bye && LL.FISH[bye.id]) {
      var from = anglerX(bye.i);
      var x = from + faceOf(bye.i) * (80 + bye.t * 220);
      var y = 300 - Math.sin(bye.t * 3.5) * 80;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.sin(bye.t * 14) * 0.4);
      Art.blit(ctx, LL.FISH[bye.id], 0, 0, 0.8, time);
      ctx.restore();
    }
    for (var ring = 0; ring < rings.length; ring++) {
      var wave = rings[ring];
      ctx.globalAlpha = Math.max(0, 1 - wave.t / 0.6);
      ctx.strokeStyle = '#e7f8ff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(wave.x, wave.y, 8 + wave.t * 70, 0, 6.2832);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    for (var k = 0; k < pops.length; k++) Art.label(ctx, pops[k].text, pops[k].x, pops[k].y, 32, pops[k].color);
  }

  function drawWeather(ev) {
    if (!ev) return;
    if (ev.id === 'rain') {
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 2;
      for (var i = 0; i < 28; i++) {
        var x = (i * 47 + time * 180) % 1280;
        var y = (i * 83 + time * 320) % 300;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 6, y + 16);
        ctx.stroke();
      }
    }
    if (ev.id === 'rainbow') {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      var colors = ['#ff5d7a', '#ffd24a', '#7dffb2', '#7ec8ff'];
      for (var c = 0; c < 4; c++) {
        ctx.strokeStyle = colors[c];
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(980, 210, 70 + c * 10, Math.PI, 0);
        ctx.stroke();
      }
    }
    if (ev.id === 'night') {
      for (var f = 0; f < 10; f++) {
        ctx.globalAlpha = 0.35 + Math.sin(time * 3 + f) * 0.35;
        ctx.fillStyle = '#fff6b0';
        ctx.fillRect((f * 113 + time * 16) % 1280, 30 + (f * 37) % 160, 3, 3);
      }
      ctx.globalAlpha = 1;
    }
  }

  function render() {
    var draw = dirty || mode === 'title' || (mode === 'play' && (!panel || panel === 'aqua'));
    if (!draw) return;
    dirty = false;
    paints++;
    ctx.setTransform(view.scale * view.dpr, 0, 0, view.scale * view.dpr, 0, 0);
    ctx.clearRect(0, 0, 1280, 720);
    if (mode === 'play' && panel === 'aqua' && game) { drawAqua(); drawFx(); return; }
    var spot = game ? game.state.spot : (save.spot || 0);
    var night = game && game.state.event.id === 'night' ? 1 : 0;
    ctx.save();
    ctx.translate(shake.x, shake.y);
    drawWorld(spot, night, time);
    if (game && (mode === 'play' || mode === 'pause' || mode === 'result')) {
      drawDecor(game.state.save);
      drawShadows();
      drawAnglers();
      drawWeather(game.state.event);
    } else {
      drawDecor(save);
      var tip = Art.angler(ctx, 210, 332, 1, '#3ec6ff', time, 0.2);
      Art.line(ctx, tip.x, tip.y, 620, 360, Math.sin(time * 2) * 4);
      Art.bobber(ctx, 620, 360 + Math.sin(time * 2) * 3);
      drawWeather({ id: 'calm' });
    }
    drawFx();
    ctx.restore();
  }

  function on(el, fn) {
    el.addEventListener('click', function (e) {
      fn();
      if (e.detail > 0) el.blur();
    });
  }

  canvas.addEventListener('pointerdown', function (e) {
    if (e.button !== 0 || mode !== 'play' || panel || revealing()) return;
    mouseDown = true;
    edge = true;
  });
  window.addEventListener('pointerup', function () { mouseDown = false; });
  window.addEventListener('pointercancel', function () { mouseDown = false; });

  on($('btnPlay'), startSolo);
  on($('btnDerby'), startDerby);
  on($('btnPause'), pause);
  on($('btnResume'), resume);
  on($('btnRestart'), restartCast);
  on($('btnMenu'), toMenu);
  on($('btnAgain'), startDerby);
  on($('btnResultMenu'), toMenu);
  on($('btnSell'), function () { choose('sell'); });
  on($('btnKeep'), function () { choose('keep'); });
  on($('btnFree'), function () { choose('release'); });
  on($('btnPanelClose'), closePanel);
  on($('btnShop'), function () { togglePanel('shop'); });
  on($('btnBook'), function () { togglePanel('book'); });
  on($('btnAqua'), function () { togglePanel('aqua'); });
  on($('btnMap'), function () { togglePanel('map'); });
  $('panelBody').addEventListener('click', onPanelClick);
  $('easyToggle').addEventListener('change', function () { setEasy($('easyToggle').checked); });
  $('easyPause').addEventListener('change', function () { setEasy($('easyPause').checked); });
  var secs = document.querySelectorAll('[data-sec]');
  for (var i = 0; i < secs.length; i++) {
    secs[i].addEventListener('click', function (e) {
      setSeconds(Number(e.currentTarget.getAttribute('data-sec')));
      if (e.detail > 0) e.currentTarget.blur();
    });
  }

  Kit.muteButton();
  Kit.lifecycle({
    pause: pause,
    reset: function () { mouseDown = false; edge = false; }
  });
  paintChrome();
  refreshTitle();

  window.__game = {
    get mode() { return mode; },
    get phase() { return game ? game.state.anglers[0].phase : 'title'; },
    get charge() { return game ? game.state.anglers[0].power : 0; },
    get tick() { return game ? game.state.tick : 0; },
    get p2charge() { return game && game.state.anglers[1] ? game.state.anglers[1].power : 0; },
    get paints() { return paints; },
    set paints(v) { paints = v; },
    state: function () {
      var a = game && game.state.anglers[0];
      return { screen: mode, phase: a ? a.phase : 'title', paused: mode === 'pause', modal: panel || (a && a.phase === 'reveal' ? 'card' : '') };
    },
    get world() { return game ? game.state : null; },
    give: function (n) {
      liveSave().coins += n;
      persist();
      refreshHud(true);
      refreshTitle();
    },
    hook: function (id) { if (game) game.hookTest(0, id); },
    saveNow: persist
  };

  Kit.loop(update, render);
  var readySent = false;
  function markReady() { if (!readySent) { readySent = true; Kit.ready(); } }
  setTimeout(markReady, 600);
  if (document.fonts && document.fonts.load) document.fonts.load('700 40px Fredoka', 'ب').then(markReady, markReady);
  else markReady();
})();
