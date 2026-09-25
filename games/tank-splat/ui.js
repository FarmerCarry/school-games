/* Paint Tanks — menus, saving, shop, campaign and the main loop. */
(function () {
  'use strict';
  var A = window.TS_ART, S = window.TS_SND, TG = window.TS_GAME;
  var W = 1280, H = 720;
  var store = Kit.store('tank-splat');

  /* ------------------------------------------------------------ data */
  var BOTS = [
    { name: 'كعكة', hat: 1 }, { name: 'فلفول', hat: 2 }, { name: 'زلزول', hat: 6 }, { name: 'سكّر', hat: 3 },
    { name: 'دبدوب', hat: 7 }, { name: 'برقوق', hat: 5 }, { name: 'شمشم', hat: 8 }, { name: 'نمنم', hat: 9 }, { name: 'فستق', hat: 4 }
  ];
  var DIFF_NAME = { easy: 'سهل', medium: 'متوسط', hard: 'صعب' };
  var STAGES = [
    { name: 'أول لطخة', bots: [['easy', 0]], target: 3 },
    { name: 'صديقان مشاغبان', bots: [['easy', 1], ['easy', 2]], target: 3 },
    { name: 'الخصم الذكي', bots: [['medium', 3]], target: 3 },
    { name: 'معركة الحلوى', bots: [['easy', 8], ['medium', 4]], target: 3 },
    { name: 'ثلاثي الألوان', bots: [['medium', 5], ['medium', 1]], target: 3 },
    { name: 'القنّاص', bots: [['hard', 6]], target: 3 },
    { name: 'العاصفة', bots: [['medium', 2], ['hard', 7]], target: 3 },
    { name: 'نهائي البطولة', bots: [['medium', 4], ['hard', 6], ['hard', 7]], target: 5 }
  ];
  var CROWN = 10, CROWN_STARS = 24;

  /* ------------------------------------------------------------ save */
  var save = {
    coins: store.get('coins', 0) | 0,
    stars: store.get('stars', [0, 0, 0, 0, 0, 0, 0, 0]),
    hats: store.get('hats', [0]),
    splats: store.get('splats', [0]),
    equip: store.get('equip', [{ hat: 0, splat: 0 }, { hat: 0, splat: 0 }, { hat: 0, splat: 0 }]),
    free: store.get('free', { humans: 2, bots: 0, diff: 'medium', target: 5 }),
    stats: store.get('stats', { matches: 0, wins: 0, splats: 0 })
  };
  if (!Array.isArray(save.stars) || save.stars.length !== 8) save.stars = [0, 0, 0, 0, 0, 0, 0, 0];
  if (!Array.isArray(save.hats)) save.hats = [0];
  if (!Array.isArray(save.splats)) save.splats = [0];
  if (!Array.isArray(save.equip) || save.equip.length !== 3) save.equip = [{ hat: 0, splat: 0 }, { hat: 0, splat: 0 }, { hat: 0, splat: 0 }];
  function persist() {
    store.set('coins', save.coins); store.set('stars', save.stars); store.set('hats', save.hats);
    store.set('splats', save.splats); store.set('equip', save.equip); store.set('free', save.free); store.set('stats', save.stats);
  }
  function totalStars() { return save.stars.reduce(function (a, b) { return a + b; }, 0); }
  function unlockedStage() { var i = 0; while (i < STAGES.length - 1 && save.stars[i] > 0) i++; return i; }

  /* ------------------------------------------------------------ view */
  var cv = document.getElementById('cv');
  var ui = document.getElementById('ui');
  var app = { screen: 'title', game: null, demo: null, match: null, lock: 0, campSel: 0, shopSlot: 0, shopKind: 'hat', resT: 0 };
  var view = Kit.fit(cv, W, H, {
    onResize: function (v) {
      ui.style.left = cv.style.left; ui.style.top = cv.style.top;
      ui.style.transform = 'scale(' + v.scale + ')';
      TG.setQuality(v.scale * v.dpr, app.screen === 'game' || app.screen === 'pause' || app.screen === 'result' ? app.game : app.demo);
    }
  });
  var ctx = view.ctx;
  Kit.muteButton({ key: false });
  cv.addEventListener('pointerdown', function () { cv.focus(); });

  function $(id) { return document.getElementById(id); }
  function qa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function bindCounts() {
    qa('[data-bind="coins"]').forEach(function (e) { e.textContent = save.coins; });
    qa('[data-bind="stars"]').forEach(function (e) { e.textContent = totalStars(); });
  }

  var toastT = 0;
  function toast(msg) {
    var t = $('toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('on'); }, 1600);
  }

  /* ------------------------------------------------------------ screens */
  function show(name) {
    app.screen = name;
    ['title', 'camp', 'free', 'shop', 'pause', 'result'].forEach(function (s) { $('scr-' + s).hidden = s !== name; });
    $('pauseBtn').hidden = name !== 'game';
    app.lock = performance.now() + 250;
    bindCounts();
    if (name === 'camp') buildStages();
    if (name === 'free') buildFree();
    if (name === 'shop') buildShop();
    var g = (name === 'game' || name === 'pause' || name === 'result') ? app.game : app.demo;
    if (g) TG.setQuality(view.scale * view.dpr, g);
  }

  function makeDemo() {
    var bots = Kit.shuffle(BOTS.slice()).slice(0, 3);
    var slots = Kit.shuffle([0, 1, 2, 3]);
    app.demo = TG.create({
      demo: true, target: 9999,
      players: bots.map(function (b, i) { return { bot: i === 0 ? 'hard' : 'medium', slot: slots[i], name: b.name, hat: b.hat, splat: i }; })
    });
  }

  /* ------------------------------------------------------------ match setup */
  function startCampaign(i) {
    var st = STAGES[i];
    var players = [{ human: true, ctrl: 0, slot: 0, name: 'أنت', hat: save.equip[0].hat, splat: save.equip[0].splat }];
    st.bots.forEach(function (b, k) {
      var bd = BOTS[b[1]];
      players.push({ bot: b[0], slot: k + 1, name: bd.name, hat: bd.hat, splat: k % 3 });
    });
    app.match = { kind: 'camp', stage: i, players: players, target: st.target };
    beginMatch();
  }
  function freePlayers() {
    var f = save.free, players = [], names = ['الأخضر', 'الأحمر', 'الأزرق'];
    for (var h = 0; h < f.humans; h++) {
      players.push({ human: true, ctrl: h, slot: h, name: f.humans === 1 ? 'أنت' : names[h], hat: save.equip[h].hat, splat: save.equip[h].splat });
    }
    var pool = Kit.shuffle(BOTS.slice());
    for (var b = 0; b < f.bots; b++) {
      players.push({ bot: f.diff, slot: f.humans + b, name: pool[b].name, hat: pool[b].hat, splat: b % 3 });
    }
    return players;
  }
  function startFree() {
    app.match = { kind: 'free', players: freePlayers(), target: save.free.target };
    beginMatch();
  }
  function beginMatch() {
    var mt = app.match;
    app.game = TG.create({ players: mt.players, target: mt.target, stage: mt.stage, onEnd: onMatchEnd });
    S.click();
    show('game');
  }

  /* ------------------------------------------------------------ results */
  function onMatchEnd(G, winner) {
    var mt = app.match;
    var human = G.tanks[0];
    var solo = G.humans === 1;
    G.coins += 5; // a little something just for playing
    save.coins += G.coins;
    save.stats.matches++;
    G.tanks.forEach(function (t) { if (t.human) save.stats.splats += t.splats; });
    var won = winner && winner.human;
    if (won) save.stats.wins++;
    var starsNow = 0, newStars = 0, note = '';
    if (mt.kind === 'camp' && won) {
      var maxOpp = 0;
      G.tanks.forEach(function (t) { if (t !== human) maxOpp = Math.max(maxOpp, t.score); });
      starsNow = 1 + (maxOpp <= 1 ? 1 : 0) + (maxOpp === 0 ? 1 : 0);
      var before = totalStars(), firstWin = save.stars[mt.stage] === 0;
      if (starsNow > save.stars[mt.stage]) { newStars = starsNow - save.stars[mt.stage]; save.stars[mt.stage] = starsNow; }
      if (before < CROWN_STARS && totalStars() >= CROWN_STARS) note = 'فتحت التاج الذهبي في المتجر!';
      else if (firstWin && mt.stage < STAGES.length - 1) note = 'فتحت المرحلة التالية!';
      else if (firstWin) note = 'أنت بطل البطولة كلها!';
      else if (newStars > 0) note = 'نجوم جديدة!';
    }
    persist();

    // fill result card
    var title, sub;
    if (solo) title = won ? 'أنت البطل!' : 'حظًّا أوفر!';
    else title = winner ? 'بطل المباراة: ' + winner.name : 'انتهت المباراة';
    sub = mt.kind === 'camp' ? 'المرحلة ' + (mt.stage + 1) + ': ' + STAGES[mt.stage].name : 'مباراة مع الأصدقاء';
    $('resTitle').textContent = title;
    $('resSub').textContent = sub;
    var rows = G.tanks.slice().sort(function (a, b) { return b.score - a.score; });
    $('resTable').innerHTML = '';
    rows.forEach(function (t) {
      var r = document.createElement('div'); r.className = 'rrow' + (t === winner ? ' win' : '');
      var i = document.createElement('i'); i.style.background = t.pal.main;
      var s = document.createElement('span'); s.textContent = t.name;
      var b = document.createElement('b'); b.textContent = t.score;
      r.appendChild(i); r.appendChild(s); r.appendChild(b);
      $('resTable').appendChild(r);
    });
    var st = $('resStars'); st.innerHTML = '';
    if (mt.kind === 'camp') {
      for (var k = 0; k < 3; k++) {
        var e = document.createElement('span');
        e.className = 'star' + (k < starsNow ? ' pop' : ' off');
        e.style.animationDelay = (0.5 + k * 0.35) + 's';
        st.appendChild(e);
        if (k < starsNow) (function (k) { setTimeout(function () { S.star(k); }, 500 + k * 350); })(k);
      }
    }
    app.resCoins = G.coins; app.resShown = 0;
    $('resCoins').textContent = '+0';
    $('resNote').textContent = note;
    $('resNote').className = 'res-note' + (note ? ' bump' : '');
    var main = $('resMain');
    app.resMainAct = 'again';
    if (mt.kind === 'camp' && won && mt.stage < STAGES.length - 1) { main.innerHTML = 'المرحلة التالية ←'; app.resMainAct = 'next'; }
    else if (mt.kind === 'camp' && !won) main.innerHTML = 'حاول مجددًا';
    else main.innerHTML = 'العب مجددًا';
    main.innerHTML += ' <kbd class="sg-key">Enter</kbd>';
    $('resAgain').hidden = app.resMainAct === 'again';
    if (won || !solo) S.fanfare(); else S.lose();
    app.resT = 0;
    show('result');
    app.lock = performance.now() + 1000;
  }

  function resMain() {
    if (app.resMainAct === 'next') startCampaign(app.match.stage + 1);
    else beginMatch();
  }

  /* ------------------------------------------------------------ campaign screen */
  function miniTank(c, x, y, pal, hat, s, a) {
    A.drawTank(c, { x: x, y: y, a: a == null ? -Math.PI / 2 : a, pal: pal, hat: hat, t: 0, scale: s });
  }
  function buildStages() {
    var box = $('stages'); box.innerHTML = '';
    var un = unlockedStage();
    app.campSel = Math.min(app.campSel, un);
    if (save.stars[app.campSel] > 0 && app.campSel < un) app.campSel = un;
    STAGES.forEach(function (st, i) {
      var d = document.createElement('button');
      d.className = 'stage' + (i > un ? ' locked' : '') + (save.stars[i] > 0 ? ' won' : '') + (i === app.campSel ? ' sel' : '');
      d.style.animationDelay = (i * 0.04) + 's';
      d.innerHTML = '<div class="num">' + (i + 1) + '</div><div class="sname"></div><canvas width="480" height="200"></canvas><div class="who"></div><div class="diff"></div><div class="stars"></div>';
      d.querySelector('.sname').textContent = st.name;
      d.querySelector('.who').textContent = 'ضد: ' + st.bots.map(function (b) { return BOTS[b[1]].name; }).join('، ');
      var hard = st.bots.reduce(function (m, b) { return b[0] === 'hard' ? 'hard' : (b[0] === 'medium' && m !== 'hard' ? 'medium' : m); }, 'easy');
      var df = d.querySelector('.diff'); df.textContent = DIFF_NAME[hard]; df.classList.add(hard);
      var ss = d.querySelector('.stars');
      for (var k = 0; k < 3; k++) { var e = document.createElement('span'); e.className = 'star' + (k < save.stars[i] ? '' : ' off'); ss.appendChild(e); }
      var c = d.querySelector('canvas').getContext('2d');
      c.scale(2, 2);
      var nb = st.bots.length, sp = nb > 2 ? 46 : 56;
      var px = nb > 2 ? 200 : 180, vx = px - 44;
      miniTank(c, px, 58, A.PAL[0], save.equip[0].hat, 0.9, -Math.PI / 2);
      TG.text(c, 'ضد', vx, 60, 17, '#2a2240', 'center');
      st.bots.forEach(function (b, k) { miniTank(c, vx - 44 - k * sp, 58, A.PAL[k + 1], BOTS[b[1]].hat, 0.9, -Math.PI / 2); });
      if (i > un) {
        var lk = document.createElement('div'); lk.className = 'lock';
        lk.innerHTML = '<div class="lock-ico"></div><div>اربح المرحلة ' + i + ' أولًا</div>';
        d.querySelector('.who').style.visibility = 'hidden';
        d.appendChild(lk);
      }
      d.addEventListener('click', function () {
        if (i > un) { S.nope(); toast('هذه المرحلة مقفلة!'); return; }
        app.campSel = i; startCampaign(i);
      });
      d.addEventListener('mouseenter', function () { if (i <= un) S.hover(); });
      box.appendChild(d);
    });
  }
  function moveCamp(dx) {
    var un = unlockedStage();
    var n = Kit.clamp(app.campSel + dx, 0, un);
    if (n !== app.campSel) { app.campSel = n; S.hover(); qa('.stage').forEach(function (e, i) { e.classList.toggle('sel', i === n); }); }
  }

  /* ------------------------------------------------------------ free screen */
  function buildFree() {
    var f = save.free;
    if (f.humans + f.bots < 2) f.bots = 2 - f.humans;
    if (f.humans + f.bots > 4) f.bots = 4 - f.humans;
    qa('.pills').forEach(function (p) {
      var key = p.getAttribute('data-opt');
      qa('button', p).forEach(function (b) {
        var v = b.getAttribute('data-v'); v = key === 'diff' ? v : +v;
        b.classList.toggle('on', f[key] === v);
        var dis = false;
        if (key === 'bots') dis = f.humans + v < 2 || f.humans + v > 4;
        b.disabled = dis;
      });
      if (key === 'diff') p.classList.toggle('off', f.bots === 0);
    });
    var lu = $('lineup'); lu.innerHTML = '';
    var hints = ['W A S D + Q', '↑ ← ↓ → + /', 'I J K L + U'];
    freePreview().forEach(function (pl) {
      var d = document.createElement('div'); d.className = 'lu';
      d.innerHTML = '<canvas width="180" height="136"></canvas><b></b><span></span>';
      d.querySelector('b').textContent = pl.name;
      var sp = d.querySelector('span');
      if (pl.human) sp.textContent = f.humans === 1 ? 'WASD / ↑←↓→' : hints[pl.ctrl];
      else { sp.textContent = 'كمبيوتر - ' + DIFF_NAME[pl.bot]; sp.style.direction = 'rtl'; }
      var c = d.querySelector('canvas').getContext('2d'); c.scale(2, 2);
      miniTank(c, 45, 38, A.PAL[pl.slot], pl.hat, 1.05, -Math.PI / 2);
      lu.appendChild(d);
    });
  }
  function freePreview() {
    var f = save.free, out = [], names = ['الأخضر', 'الأحمر', 'الأزرق'];
    for (var h = 0; h < f.humans; h++) out.push({ human: true, ctrl: h, slot: h, name: f.humans === 1 ? 'أنت' : names[h], hat: save.equip[h].hat });
    for (var b = 0; b < f.bots; b++) out.push({ bot: f.diff, slot: f.humans + b, name: 'كمبيوتر ' + (b + 1), hat: BOTS[b].hat });
    return out;
  }
  qa('.pills').forEach(function (p) {
    p.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b || b.disabled) return;
      var key = p.getAttribute('data-opt'), v = b.getAttribute('data-v');
      save.free[key] = key === 'diff' ? v : +v;
      if (key === 'humans') {
        if (save.free.humans + save.free.bots < 2) save.free.bots = 2 - save.free.humans;
        if (save.free.humans + save.free.bots > 4) save.free.bots = 4 - save.free.humans;
      }
      S.click(); persist(); buildFree();
    });
  });

  /* ------------------------------------------------------------ shop */
  function buildShop() {
    qa('#slotTabs button').forEach(function (b) { b.classList.toggle('on', +b.getAttribute('data-slot') === app.shopSlot); });
    qa('#kindTabs button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-kind') === app.shopKind); });
    var box = $('items'); box.innerHTML = '';
    var list = app.shopKind === 'hat' ? A.HATS : A.SPLATS;
    var owned = app.shopKind === 'hat' ? save.hats : save.splats;
    var eq = save.equip[app.shopSlot][app.shopKind];
    var pal = A.PAL[app.shopSlot];
    list.forEach(function (it, i) {
      var d = document.createElement('button');
      var has = owned.indexOf(i) >= 0 || (app.shopKind === 'hat' && i === CROWN && totalStars() >= CROWN_STARS);
      var crown = app.shopKind === 'hat' && i === CROWN;
      d.className = 'item' + (has ? ' owned' : '') + (eq === i ? ' eq' : '') + (!has && !crown && save.coins < it.price ? ' poor' : '');
      d.style.animationDelay = (i * 0.025) + 's';
      d.innerHTML = '<canvas width="220" height="192"></canvas><div class="iname"></div><div class="ibtn"></div>';
      d.querySelector('.iname').textContent = it.name;
      var ib = d.querySelector('.ibtn');
      if (eq === i) ib.textContent = 'مُختار ✓';
      else if (has) ib.textContent = 'اختر';
      else if (crown) ib.innerHTML = '<span class="star"></span>' + CROWN_STARS;
      else ib.innerHTML = '<span class="coin"></span>' + it.price;
      var c = d.querySelector('canvas').getContext('2d'); c.scale(2, 2);
      if (app.shopKind === 'hat') {
        miniTank(c, 55, 58, pal, i, 1.35, -Math.PI / 2);
      } else {
        A.drawSplat(c, 55, 48, 30, pal.paint, i, mulberry(7 + i));
      }
      d.addEventListener('click', function () { shopClick(i, has, crown, it, d); });
      box.appendChild(d);
    });
  }
  function shopClick(i, has, crown, it, el) {
    var kind = app.shopKind;
    if (has) { save.equip[app.shopSlot][kind] = i; S.click(); }
    else if (crown) { S.nope(); el.classList.add('shake'); toast('اجمع ' + CROWN_STARS + ' نجمة في البطولة لتفتحه!'); return; }
    else if (save.coins >= it.price) {
      save.coins -= it.price;
      (kind === 'hat' ? save.hats : save.splats).push(i);
      save.equip[app.shopSlot][kind] = i;
      S.buy(); toast('اشتريت: ' + it.name + '!');
    } else {
      S.nope(); el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
      toast('تحتاج ' + (it.price - save.coins) + ' عملة إضافية');
      return;
    }
    persist(); bindCounts(); buildShop();
  }
  qa('#slotTabs button').forEach(function (b) { b.addEventListener('click', function () { app.shopSlot = +b.getAttribute('data-slot'); S.click(); buildShop(); }); });
  qa('#kindTabs button').forEach(function (b) { b.addEventListener('click', function () { app.shopKind = b.getAttribute('data-kind'); S.click(); buildShop(); }); });
  function mulberry(seed) {
    return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }

  /* ------------------------------------------------------------ actions */
  var ACTS = {
    title: function () { S.click(); show('title'); },
    camp: function () { S.click(); app.campSel = unlockedStage(); show('camp'); },
    free: function () { S.click(); show('free'); },
    shop: function () { S.click(); show('shop'); },
    startFree: startFree,
    resume: function () { S.click(); show('game'); },
    restart: function () { beginMatch(); },
    menu: function () { S.click(); app.game = null; show('title'); },
    resMain: resMain
  };
  ui.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (!b) return;
    Kit.audio.unlock();
    ACTS[b.getAttribute('data-act')]();
    b.blur();
  });
  ui.addEventListener('mouseover', function (e) { var b = e.target.closest('.btn'); if (b && b !== app.hoverEl) { app.hoverEl = b; S.hover(); } });
  $('pauseBtn').addEventListener('click', function (e) { e.stopPropagation(); pause(); this.blur(); });

  function pause() { if (app.screen === 'game') { S.click(); show('pause'); } }

  window.addEventListener('keydown', function (e) {
    if (e.code === 'Slash' || e.code === 'Quote' || (e.code === 'Backspace' && app.screen !== 'title')) e.preventDefault();
    if (e.repeat) return;
    var k = e.code, sc = app.screen;
    if (sc === 'game') {
      if (k === 'KeyP' || k === 'Escape') { pause(); e.preventDefault(); }
      return;
    }
    if (performance.now() < app.lock) return;
    var enter = k === 'Enter' || k === 'Space' || k === 'NumpadEnter';
    if (sc === 'pause') {
      if (k === 'KeyP' || k === 'Escape') ACTS.resume();
      else if (k === 'KeyR') ACTS.restart();
    } else if (sc === 'title') {
      if (enter) ACTS.camp();
    } else if (sc === 'camp') {
      if (enter) startCampaign(app.campSel);
      else if (k === 'Escape' || k === 'Backspace') ACTS.title();
      else if (k === 'ArrowLeft') moveCamp(1);
      else if (k === 'ArrowRight') moveCamp(-1);
      else if (k === 'ArrowDown') moveCamp(4);
      else if (k === 'ArrowUp') moveCamp(-4);
    } else if (sc === 'free') {
      if (enter) startFree();
      else if (k === 'Escape' || k === 'Backspace') ACTS.title();
    } else if (sc === 'shop') {
      if (k === 'Escape' || k === 'Backspace') ACTS.title();
    } else if (sc === 'result') {
      if (enter) resMain();
      else if (k === 'KeyR') beginMatch();
      else if (k === 'Escape') ACTS.menu();
    }
  });

  document.addEventListener('visibilitychange', function () { if (document.hidden) pause(); });
  window.addEventListener('blur', function () { pause(); });

  /* ------------------------------------------------------------ loop */
  function update(dt) {
    var sc = app.screen;
    if (sc === 'game' || sc === 'result') { if (app.game) app.game.update(dt); }
    else if (sc !== 'pause') app.demo.update(dt);
    if (sc === 'result') {
      app.resT += dt;
      if (app.resShown < app.resCoins && app.resT > 0.4) {
        app.resShown = Math.min(app.resCoins, app.resShown + Math.max(1, Math.ceil(app.resCoins * dt * 1.2)));
        $('resCoins').textContent = '+' + app.resShown;
        if (Math.random() < 0.5) S.pop();
      }
    }
    Kit.keys.endFrame();
  }

  function render() {
    var sc = app.screen;
    var g = (sc === 'game' || sc === 'pause' || sc === 'result') ? app.game : app.demo;
    if (!g) return;
    g.render(ctx);
    if (sc === 'result') drawTrophyScene(g);
  }

  function drawTrophyScene(G) {
    var c = ctx, t = app.resT;
    c.fillStyle = 'rgba(30,18,70,0.6)'; c.fillRect(0, 0, W, H);
    var w = G.matchWinner || G.tanks[0];
    var s = TG.easeBack(Math.min(1, t * 2));
    A.drawTrophy(c, 330, 470, 1.25 * s, t);
    var bounce = Math.abs(Math.sin(t * 4)) * 14;
    var sq = Math.max(0, 1 - Math.abs(Math.sin(t * 4)) * 3) * 0.6;
    A.drawTank(c, { x: 330, y: 250 - bounce - (1 - s) * 300, a: -Math.PI / 2, pal: w.pal, hat: w.hat, t: t, scale: 2.5, sq: sq, blink: (t % 3) < 0.12 });
    // the others watch from below
    var others = G.tanks.filter(function (x) { return x !== w; });
    others.forEach(function (o, i) {
      var ox = 330 + (i - (others.length - 1) / 2) * 150, oy = 650;
      A.drawTank(c, { x: ox, y: oy, a: -Math.PI / 2, pal: o.pal, hat: o.hat, t: t, scale: 1.2, dead: 1, paint: w.pal.paint,
        blobs: [-8, -6, 7, 9, 4, 6, -2, 10, 5] });
    });
    TG.text(c, w.name, 330, 105 - (1 - s) * 200, 44, '#fff', 'center', '#2a2240', 9);
  }

  makeDemo();
  show('title');
  Kit.loop(update, render);
  // Redraw once the Arabic web font is ready (canvas text uses it).
  if (document.fonts && document.fonts.load) document.fonts.load('700 40px Fredoka', 'ب').then(function () { bindCounts(); }, function () {});

  /* ------------------------------------------------------------ debug hook */
  window.__game = {
    app: app, save: save, STAGES: STAGES,
    state: function () {
      var g = app.game;
      return {
        screen: app.screen, coins: save.coins, stars: save.stars.slice(),
        game: g ? { state: g.state, round: g.round, scores: g.tanks.map(function (t) { return t.score; }), alive: g.tanks.map(function (t) { return t.alive; }), balls: g.balls.length, parts: g.parts.length, rects: g.maze.rects.length } : null
      };
    },
    start: function (i) { startCampaign(i || 0); },
    startFree: function (h, b, d, tgt) { save.free = { humans: h, bots: b, diff: d || 'medium', target: tgt || 3 }; startFree(); },
    // Replace every human with a bot of the given difficulty (for automatic test matches).
    autoplay: function (diff) {
      if (!app.game) return false;
      app.game.tanks.forEach(function (t) { if (t.human) t.bot = window.TS_BOT.create(diff || 'hard'); });
      return true;
    },
    winRound: function () {
      var g = app.game; if (!g || g.state !== 'play') return false;
      g.tanks.forEach(function (t, i) { if (i > 0 && t.alive) { t.alive = false; t.dead = 1; } });
      return true;
    },
    loseRound: function () {
      var g = app.game; if (!g || g.state !== 'play') return false;
      g.tanks[0].alive = false; g.tanks[0].dead = 1;
      g.tanks.forEach(function (t, i) { if (i > 1 && t.alive) { t.alive = false; t.dead = 1; } });
      return true;
    },
    show: function (n) { show(n); return app.screen; },
    sim: function (sec) { for (var i = 0; i < sec * 60; i++) update(1 / 60); return this.state(); },
    reset: function () { ['coins', 'stars', 'hats', 'splats', 'equip', 'free', 'stats'].forEach(function (k) { store.remove(k); }); }
  };
})();
