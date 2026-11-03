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
  var cardAt = 0;
  var STAND = 292;
  var padT = 0;
  var reelSnd = 0;
  var goldT = 0;
  var statsOpen = '';
  var gull = null;
  var bye = null;
  var parts = [];
  var pops = [];
  var rings = [];
  var fliers = [];
  var perfectStreak = 0;
  var goalFx = null;
  var hit = 0;
  var creakT = 0;
  var bookPage = 0;
  var WX = { rain: 'السمك جائع!', rainbow: 'سمك ملون!', night: 'سمك يضيء!', frenzy: 'السمك مجنون!' };
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
    $('hud').hidden = mode === 'title' || mode === 'result';
    var play = mode === 'play' || mode === 'pause';
    $('questLine').hidden = !play;
    if (mode !== 'play') hush();
    var ready = game && game.state.anglers[0].phase === 'ready';
    $('hint').hidden = true;
    $('coach').hidden = !(mode === 'play' && !panel && !revealing() && !taught && ready && !game.state.derby);
    if (mode !== 'result') clearParty();
    if (mode !== 'play' || panel) { mouseDown = false; edge = false; }
    dirty = true;
    refreshHud(true);
    if (mode === 'title') refreshTitle();
    if (mode === 'play' && revealing()) fillCard();
  }

  function refreshTitle() {
    var s = liveSave();
    var spot = LL.SPOTS[s.spot] || LL.SPOTS[0];
    var known = LL.bookCount(s.book);
    $('titleProgress').textContent = 'الكتاب ' + known + '/60 · ' + s.coins + ' عملة · ' + spot.name;
    var ring = $('titleRing');
    if (ring) ring.style.background = 'conic-gradient(#ffcc00 ' + (known / 60 * 360) + 'deg, rgba(255,255,255,0.22) 0deg)';
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
    $('timerDot').hidden = $('timerPill').hidden;
    $('timerPill').textContent = clock;
    if (!goalFx) {
      var q = s.quests && s.quests[0];
      $('questText').textContent = q ? (q.have + '/' + q.n) : '';
    }
    var phrase = game ? (WX[game.state.event.id] || '') : '';
    $('eventText').textContent = phrase;
    $('eventBanner').className = phrase ? game.state.event.id : '';
    $('eventBanner').hidden = !(mode === 'play' && !panel && !revealing() && phrase);
  }

  function questNow() {
    return liveSave().quests.map(function (q) {
      return { k: q.k, have: q.have, n: q.n, reward: q.reward, text: q.text };
    });
  }

  function startGoalStamp(reward, next) {
    var line = next.have + '/' + next.n;
    if (Kit.motion.reduced()) {
      goalFx = null;
      $('questStamp').hidden = true;
      $('questLine').classList.remove('ll-stamp');
      $('questLine').classList.remove('ll-slide');
      $('questText').textContent = line;
      return;
    }
    goalFx = { t: 0, shown: 0, next: line };
    $('questStamp').hidden = false;
    $('questStamp').textContent = 'تم! +' + reward;
    $('questLine').classList.add('ll-stamp');
    $('questLine').classList.remove('ll-slide');
  }

  function watchQuest(before) {
    if (!before) return;
    var after = questNow();
    for (var i = 0; i < before.length; i++) {
      var prev = before[i];
      var next = after[i];
      if (!prev || !next || prev.have >= prev.n) continue;
      if (next.k !== prev.k || next.have < prev.have) {
        startGoalStamp(prev.reward, next);
        if (mode === 'play') shout('مهمة تمت!');
        return;
      }
    }
  }

  function hush() {
    shoutT = 0;
    var el = $('shout');
    el.hidden = true;
    el.textContent = '';
    pops.length = 0;
    bye = null;
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

  function pingCoins() {
    var pill = $('coinNum').parentNode;
    pill.classList.remove('ll-ping');
    void pill.offsetWidth;
    pill.classList.add('ll-ping');
  }

  function flyCoins(x, y) {
    if (Kit.motion.reduced()) { pingCoins(); return; }
    for (var i = 0; i < 6 && fliers.length < 24; i++) {
      fliers.push({ x: x + (i - 2.5) * 18, y: y, t: -i * 0.05, dur: 0.62 });
    }
  }

  function clearParty() {
    $('scr-result').classList.remove('ll-party');
    $('confetti').textContent = '';
    $('resultHat').hidden = true;
  }

  function spawnConfetti() {
    var box = $('confetti');
    box.textContent = '';
    if (Kit.motion.reduced()) return;
    var colors = ['#ff5d7a', '#ffcc00', '#7dffb2', '#7ec8ff', '#fff'];
    for (var i = 0; i < 48; i++) {
      var bit = document.createElement('i');
      bit.className = 'll-bit';
      bit.style.left = ((i * 17) % 100) + '%';
      bit.style.background = colors[i % colors.length];
      bit.style.animationDelay = ((i % 12) * 0.16) + 's';
      bit.style.animationDuration = (1.7 + (i % 5) * 0.28) + 's';
      box.appendChild(bit);
    }
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
      var start = bookPage * 24;
      for (var i = start; i < start + 24 && i < 60; i++) {
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
      var nav = document.createElement('div');
      nav.className = 'll-row';
      nav.appendChild(btn('◀', 'book', bookPage - 1, false, bookPage <= 0));
      nav.appendChild(btn((bookPage + 1) + ' / 3', 'book', bookPage, true, true));
      nav.appendChild(btn('▶', 'book', bookPage + 1, false, bookPage >= 2));
      body.appendChild(nav);
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

  function star(g, x, y, r) {
    g.beginPath();
    g.moveTo(x, y - r);
    g.lineTo(x + r * 0.32, y - r * 0.32);
    g.lineTo(x + r, y);
    g.lineTo(x + r * 0.32, y + r * 0.32);
    g.lineTo(x, y + r);
    g.lineTo(x - r * 0.32, y + r * 0.32);
    g.lineTo(x - r, y);
    g.lineTo(x - r * 0.32, y - r * 0.32);
    g.closePath();
    g.fill();
  }

  function catchGlow(fish) {
    if (fish.boss) return '#ffc400';
    if (fish.junk) return '#c48a4a';
    return ['#ff6a00', '#1288ff', '#7a3dff', '#ff4b8d', '#ff9a00'][Math.min(fish.rare | 0, 4)];
  }

  function glowFade(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + (a || 0) + ')';
  }

  function fishBounds(img) {
    if (img._b) return img._b;
    var iw = img.width, ih = img.height;
    var data = img.getContext('2d').getImageData(0, 0, iw, ih).data;
    var minx = iw, miny = ih, maxx = 0, maxy = 0;
    for (var y = 0; y < ih; y++) {
      for (var x = 0; x < iw; x++) {
        if (data[(y * iw + x) * 4 + 3] < 16) continue;
        if (x < minx) minx = x;
        if (x > maxx) maxx = x;
        if (y < miny) miny = y;
        if (y > maxy) maxy = y;
      }
    }
    img._b = maxx < minx ? { x: 0, y: 0, w: iw, h: ih } : { x: minx, y: miny, w: maxx - minx + 1, h: maxy - miny + 1 };
    return img._b;
  }

  function paintCatchFish() {
    var fish = game && game.state.anglers[0].fish;
    var view = $('fishView');
    if (!fish || !view) return;
    var g = view.getContext('2d');
    var w = view.width, h = view.height;
    var glow = catchGlow(fish);
    var box = { x: 80, y: 40, w: w - 160, h: h - 128 };
    g.clearRect(0, 0, w, h);
    var gx = w / 2, gy = box.y + box.h * 0.48;
    var rad = g.createRadialGradient(gx, gy, 24, gx, gy, 250);
    rad.addColorStop(0, glowFade(glow, 0.72));
    rad.addColorStop(0.55, glowFade(glow, 0.28));
    rad.addColorStop(1, glowFade(glow, 0));
    g.fillStyle = rad;
    g.beginPath();
    g.arc(gx, gy, 250, 0, 6.3);
    g.fill();
    g.globalAlpha = 1;
    var marks = [[14, 36], [14, 110], [14, 180], [14, 250], [w - 14, 36], [w - 14, 110], [w - 14, 180], [w - 14, 250]];
    for (var i = 0; i < 8; i++) {
      var sx = marks[i][0], sy = marks[i][1];
      if (sx > box.x && sx < box.x + box.w && sy > box.y && sy < box.y + box.h) continue;
      g.globalAlpha = 0.9;
      g.fillStyle = i % 2 ? '#fff' : glow;
      star(g, sx, sy, 10 + (i % 3) * 3);
    }
    g.globalAlpha = 1;
    var img = Art.sprite(fish, true);
    var ob = fishBounds(img);
    var fitW = 260, fitH = 160;
    var sc = Math.min(fitW / ob.w, fitH / ob.h);
    var dw = ob.w * sc, dh = ob.h * sc;
    var fx = (w - dw) / 2, fy = 28 + (fitH - dh) / 2;
    g.drawImage(img, ob.x, ob.y, ob.w, ob.h, fx, fy, dw, dh);
    for (var d = 0; d < 6; d++) {
      var side = d < 3 ? -1 : 1;
      var dx = (side < 0 ? fx : fx + dw) + side * 18;
      var dy = fy + 16 + (d % 3) * Math.max(28, dh * 0.28) + Math.sin(time * 4 + d) * 6;
      g.fillStyle = '#e7f8ff';
      g.beginPath();
      g.ellipse(dx, dy, 5, 8, side * 0.4, 0, 6.3);
      g.fill();
    }
    var cm = Math.max(8, Math.round((fish.w || 0.4) * 22));
    var hand = 48;
    var bar = Math.max(36, Math.min(220, cm * 1.4));
    var ry = h - 36;
    g.fillStyle = '#ffd2b8';
    g.strokeStyle = '#16324a';
    g.lineWidth = 3;
    g.beginPath();
    g.roundRect(w / 2 - 150, ry - 8, 28, 22, 6);
    g.fill();
    g.stroke();
    g.fillStyle = bar > hand ? '#ffcc00' : '#7ee0ff';
    g.fillRect(w / 2 - 110, ry - 4, bar, 14);
    g.strokeRect(w / 2 - 110, ry - 4, bar, 14);
    g.fillStyle = '#fff';
    g.font = '700 22px Fredoka';
    g.textAlign = 'left';
    g.direction = 'ltr';
    g.fillText(cm + ' cm', w / 2 - 100 + bar + 10, ry + 10);
  }

  function bounce(el) {
    el.classList.remove('ll-bounce');
    void el.offsetWidth;
    el.classList.add('ll-bounce');
  }

  function fillCard() {
    var fish = game.state.anglers[0].fish;
    if (!fish) return;
    var key = fish.id + ':' + fish.w + ':' + fish.rb + ':' + fish.glow + ':' + fish.day;
    if (key === cardKey) return;
    cardKey = key;
    cardAt = time;
    var s = liveSave();
    var box = $('scr-card').querySelector('.ll-cardbox');
    var golden = fish.rare >= 3 || fish.boss;
    box.classList.toggle('ll-gold', golden);
    box.style.borderColor = golden ? '#ffcc00' : catchGlow(fish);
    paintCatchFish();
    $('cardNew').hidden = !(!(s.book[fish.id] > 0));
    var record = !!(s.book[fish.id] > 0 && fish.w > s.book[fish.id]);
    $('cardBest').hidden = !record;
    if (record) {
      bounce($('cardBest'));
      Sfx.best();
      shake.add(12);
      goldT = Math.max(goldT, 0.5);
      burst(640, 240, 22, ['#ffe14a', '#fff8d0', '#ff9a1a']);
    }
    $('cardName').textContent = fish.name;
    $('cardWeight').textContent = fish.w.toFixed(1) + ' كغ';
    var rare = $('cardRare');
    var tier = fish.boss ? 4 : Math.min(fish.rare | 0, 4);
    rare.className = 'll-ribbon r' + tier;
    rare.textContent = fish.junk ? 'غريب' : (fish.boss ? 'زعيم' : LL.RARE_NAME[fish.rare]);
    var stars = $('cardStars');
    if (stars) stars.textContent = fish.junk ? '●' : '★★★★★'.slice(0, tier + 1);
    var banner = $('cardBanner');
    if (banner) banner.style.background = catchGlow(fish);
    var perfect = $('cardPerfect');
    if (perfect) perfect.hidden = !fish.perfectReel;
    var tags = [];
    if (fish.rb) tags.push('قوس ×5');
    if (fish.day) tags.push('سمكة اليوم ×3');
    if (fish.glow) tags.push('مضيئة ×1.5');
    var price = LL.priceOf(fish);
    if (fish.perfectReel && !fish.junk) price = Math.round(price * 1.5);
    $('cardPrice').textContent = price + ' عملة' + (tags.length ? ' · ' + tags.join(' · ') : '');
    $('cardHint').textContent = '';
    $('btnKeep').disabled = !!fish.junk;
    bounce($('cardWeight'));
    bounce($('cardNew'));
  }

  function choose(choice) {
    if (!revealing()) return;
    var beforeQ = questNow();
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
      if (res.price) {
        pop('+' + res.price, 640, 420, '#e09a00');
        flyCoins(640, 390);
      }
    } else if (res.choice === 'release') {
      shout('مع السلامة!');
      burst(640, 360, 16, ['#b8ffcf', '#fff']);
    } else {
      shout('إلى الحوض!');
    }
    watchQuest(beforeQ);
    persist();
    refreshHud(true);
    paintChrome();
  }

  function onPanelClick(e) {
    var b = e.target.closest('[data-act]');
    if (!b || !game) return;
    var act = b.getAttribute('data-act');
    var idx = Number(b.getAttribute('data-i'));
    if (act === 'book') {
      if (idx >= 0 && idx <= 2 && idx !== bookPage) { bookPage = idx; fillPanel(); }
    } else if (act === 'travel') {
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
    fliers.length = 0;
    perfectStreak = 0;
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
    // 'endless' is the open session id: under 20 s pays nothing, and the
    // existing 40 XP cap for one player and game in this tab still applies.
    Kit.stats.round('endless');
    statsOpen = 'solo';
  }

  function startDerby() {
    var sec = liveSave().derby || 180;
    bootGame(2, { players: 2, seconds: sec, spot: 1, forceSpot: 1 });
    // A :pvp id is a two-player round on one PC, so it is not a personal win.
    Kit.stats.round('derby:pvp');
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

  function portrait(i, win) {
    var canvas = document.createElement('canvas');
    canvas.className = 'll-pod-face';
    canvas.width = win ? 200 : 150;
    canvas.height = win ? 148 : 108;
    var c = canvas.getContext('2d');
    var sc = win ? 0.68 : 0.46;
    c.save();
    c.translate(canvas.width / 2, canvas.height - 4);
    c.scale(sc, sc);
    Art.angler(c, 0, 0, 1, i === 0 ? '#3ec6ff' : '#ff8a3d', 0.4, 'idle', 0, !!(game && game.state.save.hat), 1);
    c.restore();
    return canvas;
  }

  function showResult() {
    var st = game.state;
    mode = 'result';
    panel = '';
    hush();
    $('resultTitle').textContent = st.draw ? 'تعادل!' : ('فاز اللاعب ' + (st.winner + 1));
    var hero = $('resultHero');
    var bestFish = null;
    var caughtN = 0;
    for (var hi = 0; hi < st.anglers.length; hi++) {
      var bag = st.anglers[hi].catches || [];
      caughtN += bag.length;
      for (var hk = 0; hk < bag.length; hk++) {
        if (!bestFish || bag[hk].w > bestFish.w) bestFish = bag[hk];
      }
    }
    if (hero) {
      hero.hidden = !bestFish;
      if (bestFish && LL.FISH[bestFish.id]) {
        var hg = hero.getContext('2d');
        hg.clearRect(0, 0, hero.width, hero.height);
        Art.drawFish(hg, LL.FISH[bestFish.id], 16, 8, 288, 154, false);
      }
    }
    var pod = $('podium');
    pod.textContent = '';
    for (var i = 0; i < st.anglers.length; i++) {
      var win = st.winner === i;
      var box = document.createElement('div');
      box.className = 'll-pod' + (win ? ' win' : '');
      box.appendChild(portrait(i, win));
      if (st.crown === i) {
        var crown = document.createElement('div');
        crown.className = 'll-crown';
        crown.textContent = 'التاج';
        box.appendChild(crown);
      }
      var h = document.createElement('h3');
      h.textContent = 'لاعب ' + (i + 1);
      var p = document.createElement('p');
      p.className = 'll-kg';
      p.dir = 'ltr';
      p.textContent = st.anglers[i].weight.toFixed(1) + ' كغ';
      var small = document.createElement('div');
      small.className = 'll-best';
      small.textContent = 'أكبر سمكة ' + st.anglers[i].best.toFixed(1);
      box.appendChild(h);
      box.appendChild(p);
      box.appendChild(small);
      pod.appendChild(box);
    }
    $('resultSub').textContent = caughtN ? ('صيد ' + caughtN) : '';
    var freshHat = !st.save.hat;
    if (freshHat) {
      st.save.hat = 1;
      persist();
    }
    $('resultHat').hidden = !freshHat;
    $('scr-result').classList.add('ll-party');
    spawnConfetti();
    Kit.sfx.win();
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

  function handleEvents(ev, before) {
    for (var i = 0; i < ev.length; i++) {
      var e = ev[i];
      if (e.t === 'cast') {
        taught = true;
        $('coach').hidden = true;
        Sfx.cast();
        if (e.perfect) {
          perfectStreak++;
          Sfx.perfect();
          shout(perfectStreak >= 2 ? 'ممتاز!' : 'رائع!');
          burst(640, 280, 18, ['#ffe14a', '#fff']);
          shake.add(5);
        } else perfectStreak = 0;
      } else if (e.t === 'nibble') {
        Sfx.plip();
        var dip = bobberOf(game.state.anglers[e.i]);
        rings.push({ x: dip.x, y: dip.y, t: 0 });
        rings.push({ x: dip.x, y: dip.y, t: -0.16 });
        burst(dip.x, dip.y - 8, 10, ['#fff', '#d7f4ff', '#7ee0ff']);
      }       else if (e.t === 'bite') {
        var bitten = game.state.anglers[e.i].fish;
        Kit.track.cue();
        Sfx.bite(bitten ? bitten.rare : 0);
        shout('!', true);
        shake.add(7);
        var biteAt = bobberOf(game.state.anglers[e.i]);
        rings.push({ x: biteAt.x, y: biteAt.y, t: 0 });
        burst(biteAt.x, biteAt.y, 12, ['#e7f8ff', '#fff', '#7ee0ff']);
      } else if (e.t === 'hook') {
        Kit.track.hit();
        hit = 0.08;
        Sfx.splash(0);
        shake.add(9);
        var hookedAt = bobberOf(game.state.anglers[e.i]);
        rings.push({ x: hookedAt.x, y: hookedAt.y, t: 0 });
        burst(hookedAt.x, hookedAt.y, 16, ['#fff', '#7ee0ff', '#e7f8ff']);
      }
      else if (e.t === 'splash') burst(bobberOf(game.state.anglers[e.i]).x, 330, e.kind === 'cast' ? 10 : 6, ['#e7f8ff', '#7ee0ff']);
      else if (e.t === 'catch') {
        Kit.track.hit();
        hit = 0.08;
        var fish = game.state.anglers[e.i].fish;
        Sfx.catch(fish ? fish.rare : 0);
        Sfx.splash(1);
        if (fish && fish.perfectReel) { Sfx.perfect(); shout('ممتاز!'); }
        else if (fish && (fish.rare >= 3 || fish.boss)) { Sfx.rare(); goldT = 0.7; shout(fish.name); }
        else shout('أمسكتها!');
        if (fish && (fish.rare >= 3 || fish.boss)) goldT = 0.7;
        shake.add(fish && (fish.rare >= 3 || fish.boss) ? (fish.rare >= 4 || fish.boss ? 16 : 12) : 6);
        burst(640, 300, fish && fish.rare >= 3 ? 36 : 14, ['#ffe14a', '#fff6c2', '#fff', '#ffb000']);
        if (fish && (fish.rare >= 4 || fish.boss) && !Kit.motion.reduced()) slow = 0.4;
        pop((fish ? fish.w.toFixed(1) : '') + ' كغ', 640, 240, '#fff');
      }       else if (e.t === 'escape') {
        Kit.track.miss();
        Sfx.miss();
        shout('مع السلامة!');
        bye = { id: e.id, i: e.i, t: 0 };
      } else if (e.t === 'miss') { Kit.track.miss(); Sfx.miss(); shout('هرب!'); }
      else if (e.t === 'scare') { Kit.track.miss(); Sfx.miss(); shout('فزع!'); }
      else if (e.t === 'reveal') {
        $('shout').hidden = true;
        shoutT = 0;
        persist();
        cardKey = '';
        paintChrome();
      }
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
    watchQuest(before);
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
    if (goldT > 0) goldT = Math.max(0, goldT - dt);
    var arrived = false;
    for (var f = fliers.length - 1; f >= 0; f--) {
      var fl = fliers[f];
      fl.t += dt;
      if (fl.t < fl.dur) continue;
      fliers.splice(f, 1);
      arrived = true;
    }
    if (arrived) { pingCoins(); Kit.sfx.coin(); }
    if (goalFx) {
      goalFx.t += dt;
      if (goalFx.t >= 0.7 && !goalFx.shown) {
        goalFx.shown = 1;
        $('questStamp').hidden = true;
        $('questText').textContent = goalFx.next;
        $('questLine').classList.remove('ll-stamp');
        $('questLine').classList.add('ll-slide');
      }
      if (goalFx.t >= 1.25) {
        $('questLine').classList.remove('ll-slide');
        goalFx = null;
      }
    }
  }

  function update(dt) {
    var keys = keysUI();
    if (simOn()) {
      if (hit > 0) {
        hit = Math.max(0, hit - dt);
      } else {
        var scale = slow > 0 && !Kit.motion.reduced() ? 0.35 : 1;
        if (slow > 0) slow = Math.max(0, slow - dt);
        var before = questNow();
        var ev = game.step(dt * scale, readInput());
        handleEvents(ev, before);
      }
      var a0 = game.state.anglers[0];
      if (hit <= 0 && a0.phase === 'reel') {
        if (!a0.inside) shake.add(3.2);
        reelSnd += dt;
        var gap = Math.max(0.045, 0.16 - Math.min(0.11, Math.abs(a0.zoneV) * 0.09));
        if (!a0.inside) gap *= 0.7;
        if (reelSnd > gap) { reelSnd = 0; Sfx.reel(a0.inside ? 0 : 1); }
        if (!a0.inside && a0.tension > 0.62) {
          creakT += dt;
          if (creakT > 0.28) { creakT = 0; Sfx.creak(); }
        }
      }
      time += hit > 0 ? dt * 0.05 : dt;
      shake.update(dt);
      stepJuice(hit > 0 ? dt * 0.2 : dt);
      refreshHud(false);
      if (a0.phase === 'reveal') fillCard();
    } else if (mode === 'play' && panel === 'aqua') {
      aquaT += dt;
      time += dt;
    } else if (mode === 'title') {
      time += dt;
    } else if (mode === 'result') {
      time += dt;
      shake.update(dt);
      stepJuice(dt);
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
    var splash = 0;
    if (a.dip > 0) splash = Math.sin(Math.min(1, a.dip / 0.26) * Math.PI);
    else if (a.phase === 'bite') splash = 0.9;
    else if (a.phase === 'reel') splash = a.inside ? 0.2 : 0.65;
    var plunge = splash * 36;
    if (a.phase === 'reel' && a.fish) plunge += (0.55 - a.fish.y) * 42;
    var y = 338 + plunge + Math.sin(time * 2.2 + a.i) * 3;
    if (a.phase === 'flight') {
      var u = Math.min(1, a.flightT / 0.42);
      var tip = anglerX(a.i) + face * 46;
      x = tip + (x - tip) * u;
      y = 250 + (y - 250) * u - Math.sin(u * 3.1416) * 70;
    }
    return { x: x, y: y, splash: splash };
  }

  function drawWorld(spot, night, t) {
    var pal = Art.backdrop(ctx, spot, t, night);
    Art.props(ctx, spot, pal, t, 300);
    Art.water(ctx, pal, 300, t, spot);
    Art.life(ctx, spot, pal, t, 300);
    return pal;
  }

  function drawGround(pal, spot, anglers) {
    if (spot === 1 || spot === 2) { Art.dock(ctx, pal, 300); return; }
    if (spot === 3) return;
    for (var i = 0; i < anglers.length; i++) Art.shore(ctx, pal, anglers[i].x, anglers[i].face, 300, spot);
  }

  function drawShadows() {
    var lanes = [
      { x: 150, y: 545, w: 72, dir: 1, id: 0, sway: 55 },
      { x: 230, y: 655, w: 48, dir: -1, id: 2, sway: 40 },
      { x: 1020, y: 530, w: 84, dir: -1, id: 3, sway: 50 },
      { x: 1120, y: 650, w: 58, dir: 1, id: 5, sway: 42 }
    ];
    for (var i = 0; i < lanes.length; i++) {
      var L = lanes[i];
      var px = L.x + Math.sin(time * 0.28 + i * 1.4) * L.sway;
      var py = L.y + Math.sin(time * 0.7 + i) * 5;
      Art.fishShadow(ctx, px, py, L.w, L.dir, 0.32, L.id);
    }
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
      var pose = a.phase === 'show' ? 'cheer' : (a.phase === 'charge' || a.phase === 'flight' ? 'cast' : (a.phase === 'reel' ? 'reel' : ((a.phase === 'wait' || a.phase === 'bite') ? 'wait' : 'idle')));
      var power = a.phase === 'charge' ? a.power : (a.phase === 'reel' ? (a.inside ? 0.35 : 0.9) : (a.phase === 'flight' ? 1 : 0));
      var shirt = i === 0 ? '#3ec6ff' : '#ff8a3d';
      var tip = Art.angler(ctx, anglerX(i), STAND, face, shirt, time + a.reelSpin, pose, power, !!st.save.hat);
      if (a.phase === 'charge') {
        var mx = anglerX(i) + face * 92;
        Art.arcMeter(ctx, mx, STAND - 70, a.power);
        if (!taught && !st.derby) Art.hand(ctx, mx + Math.cos(Math.PI + a.power * Math.PI) * 62, STAND - 70 - 20 + Math.sin(time * 6) * 4, a.power > 0.15);
      } else if (a.phase === 'ready' && !taught && !st.derby && i === 0) {
        Art.arcMeter(ctx, anglerX(i) + face * 92, STAND - 70, (time * 0.35) % 1);
        Art.hand(ctx, anglerX(i) + face * 92, STAND - 120, Math.sin(time * 3) > 0.2);
      }
      if (a.phase !== 'ready' && a.phase !== 'reveal' && a.phase !== 'scared' && a.phase !== 'show') {
        var b = bobberOf(a);
        var hot = a.phase === 'reel' && (!a.inside || a.tension > 0.62);
        var wob = a.phase === 'wait' ? Math.sin(time * 8) * 6 : (a.phase === 'reel' ? Math.sin(time * (a.inside ? 10 : 22)) * (hot ? 16 : 8) : 0);
        Art.line(ctx, tip.x, tip.y, b.x, b.y, wob, hot);
        if (a.phase === 'reel' && a.fish) {
          ctx.save();
          ctx.translate(b.x, b.y + 26);
          ctx.rotate(Math.sin(time * (a.inside ? 7 : 16)) * (a.inside ? 0.2 : 0.55));
          Art.blit(ctx, a.fish, 0, 0, a.inside ? 0.62 : 0.78, time);
          ctx.restore();
        }
        Art.bobber(ctx, b.x, b.y, time, b.splash);
        if (a.phase === 'bite') {
          ctx.font = '700 72px Fredoka';
          ctx.textAlign = 'center';
          ctx.direction = 'ltr';
          ctx.fillStyle = '#ffe14a';
          ctx.fillText('!', b.x, b.y - 28);
        }
      }
      if (a.phase === 'show' && a.fish) {
        var u = Math.min(1, a.showT / 0.85);
        var from = bobberOf(a);
        var x = from.x + (anglerX(i) + face * 36 - from.x) * u;
        var y = from.y + (STAND - 250 - from.y) * u - Math.sin(u * 3.1416) * 90;
        var sc = 1.5 + u * 0.8;
        Art.blit(ctx, a.fish, x, y, sc, time);
      }
      if ((a.phase === 'show' || a.phase === 'reveal') && a.fish && (a.fish.rare >= 3 || a.fish.boss)) {
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
      if (wave.t < 0) continue;
      ctx.globalAlpha = Math.max(0, 1 - wave.t / 0.6);
      ctx.strokeStyle = '#e7f8ff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(wave.x, wave.y, 12 + wave.t * 96, 5 + wave.t * 28, 0, 0, 6.2832);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    for (var k = 0; k < pops.length; k++) Art.label(ctx, pops[k].text, pops[k].x, pops[k].y, 32, pops[k].color);
    for (var f = 0; f < fliers.length; f++) {
      var fl = fliers[f];
      if (fl.t <= 0) continue;
      var u = Math.min(1, fl.t / fl.dur);
      var e = u * u * (3 - 2 * u);
      var x = fl.x + (1120 - fl.x) * e;
      var y = fl.y + (36 - fl.y) * e - Math.sin(e * Math.PI) * 90;
      ctx.fillStyle = '#b67d00';
      ctx.beginPath(); ctx.arc(x + 2, y + 2, 11, 0, 6.3); ctx.fill();
      ctx.fillStyle = '#ffcc00';
      ctx.beginPath(); ctx.arc(x, y, 9, 0, 6.3); ctx.fill();
      ctx.fillStyle = '#fff6c2';
      ctx.beginPath(); ctx.arc(x - 3, y - 3, 3, 0, 6.3); ctx.fill();
    }
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
    var draw = dirty || mode === 'title' || mode === 'result' || (mode === 'play' && (!panel || panel === 'aqua'));
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
    if (mode === 'play' && game) {
      var look = null;
      for (var zi = 0; zi < game.state.anglers.length; zi++) {
        if (game.state.anglers[zi].phase === 'reel') look = bobberOf(game.state.anglers[zi]);
      }
      if (look) {
        ctx.translate(look.x, look.y);
        ctx.scale(1.15, 1.15);
        ctx.translate(-look.x, -look.y);
      }
    }
    var pal = drawWorld(spot, night, time);
    if (game && (mode === 'play' || mode === 'pause' || mode === 'result')) {
      drawDecor(game.state.save);
      drawShadows();
      var feet = [];
      for (var gi = 0; gi < game.state.anglers.length; gi++) feet.push({ x: anglerX(gi), face: faceOf(gi) });
      drawGround(pal, game.state.spot, feet);
      drawAnglers();
      drawWeather(game.state.event);
    } else {
      drawDecor(save);
      var home = save.spot || 0;
      if (home === 1 || home === 2) Art.dock(ctx, pal, 300);
      else if (home !== 3) Art.shore(ctx, pal, 210, 1, 300, home);
      var tip = Art.angler(ctx, 210, STAND, 1, '#3ec6ff', time, 'idle', 0.15, !!save.hat);
      Art.line(ctx, tip.x, tip.y, 620, 360, Math.sin(time * 2) * 4);
      Art.bobber(ctx, 620, 360 + Math.sin(time * 2) * 3, time, 0.12);
      drawWeather({ id: 'calm' });
    }
    drawFx();
    if (goldT > 0) {
      ctx.globalAlpha = Math.min(0.45, goldT);
      ctx.fillStyle = '#ffe14a';
      ctx.fillRect(-20, -20, 1320, 760);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    if (mode === 'play' && game && !revealing()) {
      var bars = game.state.anglers;
      for (var ri = 0; ri < bars.length; ri++) {
        if (bars[ri].phase !== 'reel') continue;
        var rw = bars.length === 1 ? 560 : 520;
        var ry = bars.length === 1 ? 118 : (ri === 0 ? 96 : 204);
        Art.reel(ctx, (1280 - rw) / 2, ry, rw, bars[ri], time);
      }
    }
    if (mode === 'play' && revealing()) paintCatchFish();
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
    hook: function (id, i) { if (game) game.hookTest(i || 0, id); },
    saveNow: persist
  };

  Kit.loop(update, render);
  var readySent = false;
  function markReady() { if (!readySent) { readySent = true; Kit.ready(); } }
  setTimeout(markReady, 600);
  if (document.fonts && document.fonts.load) document.fonts.load('700 40px Fredoka', 'ب').then(markReady, markReady);
  else markReady();
})();
