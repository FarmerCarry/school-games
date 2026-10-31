/* هجوم الروبوتات — screens, input, save, and the only Kit.stats / Kit.dda / Kit.track calls. */
(function () {
  'use strict';

  var D = window.RSD;
  var RS = window.RS;
  var Draw = window.RSRender;
  var Sfx = window.RSAudio;
  var canvas = document.getElementById('game');
  var ui = document.getElementById('ui');
  var view = Kit.fit(canvas, 1280, 720, { maxDpr: 1.25, onResize: placeUi });
  var ctx = view.ctx;
  canvas.addEventListener('contextrestored', function () { Draw.boot(); dirty = true; });

  function placeUi(v) {
    ui.style.left = canvas.style.left;
    ui.style.top = canvas.style.top;
    ui.style.transform = 'scale(' + (v || view).scale + ')';
    dirty = true;
  }

  var store = Kit.store('robo-swarm');
  var saveUI = Kit.saveStatus({ retry: function () { persist(); } });
  var saveFailed = false;
  var SAVE_KEY = 'save';

  function num(v, lo, hi) {
    var n = typeof v === 'number' ? v : parseInt(v, 10);
    if (!isFinite(n)) return lo;
    n = Math.floor(n);
    return n < lo ? lo : n > hi ? hi : n;
  }
  function fresh() {
    return {
      coins: 0, best: 0, pops: 0, wins: 0, map: 1, endless: 0,
      heroes: [1, 0, 0, 0, 0, 0], meta: [0, 0, 0],
      boltsBest: 0, quickWins: 0, noDash: 0, mapWins: [0, 0, 0], revives: 0,
      trophies: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    };
  }
  function normalize(raw) {
    var s = fresh();
    if (!raw || typeof raw !== 'object') return s;
    s.coins = num(raw.coins, 0, 999999);
    s.best = num(raw.best, 0, 99999);
    s.pops = num(raw.pops, 0, 9999999);
    s.wins = num(raw.wins, 0, 99999);
    s.map = num(raw.map, 1, 3);
    s.endless = raw.endless ? 1 : 0;
    s.boltsBest = num(raw.boltsBest, 0, 9999999);
    s.quickWins = num(raw.quickWins, 0, 99999);
    s.noDash = num(raw.noDash, 0, 99999);
    s.revives = num(raw.revives, 0, 99999);
    if (Array.isArray(raw.heroes)) {
      for (var i = 0; i < 6; i++) s.heroes[i] = raw.heroes[i] ? 1 : 0;
    }
    s.heroes[0] = 1;
    if (Array.isArray(raw.meta)) {
      for (var m = 0; m < 3; m++) s.meta[m] = num(raw.meta[m], 0, 5);
    }
    if (Array.isArray(raw.mapWins)) {
      for (var w = 0; w < 3; w++) s.mapWins[w] = num(raw.mapWins[w], 0, 99999);
    }
    if (Array.isArray(raw.trophies)) {
      for (var t = 0; t < 10; t++) s.trophies[t] = raw.trophies[t] ? 1 : 0;
    }
    return s;
  }
  var save = normalize(store.get(SAVE_KEY, null));
  function persist() {
    var ok = store.set(SAVE_KEY, save) !== false;
    saveFailed = !ok;
    if (ok) saveUI.saved(); else saveUI.failed();
    return ok;
  }

  var dda = Kit.dda('robo-swarm', { id: 'run', target: 0.72, tiers: 5 });
  var shake = Kit.shake();
  Kit.muteButton();

  var screen = 'title';
  var run = null;
  var mode = { players: 1, map: 1, quick: false, endless: false, hero: 0 };
  var pick = { players: 1, quick: false, endless: false, map: 1, hero: 0 };
  var reported = false;
  var runLength = 270;
  var dirty = true;
  var uiT = 0;
  var cardKey = '';
  var focus = [0, 0];
  var inputs = [{ x: 0, y: 0, dash: 0 }, { x: 0, y: 0, dash: 0 }];
  var toastTimer = 0;
  var warnText = '', warnUntil = 0;

  function $(id) { return document.getElementById(id); }
  function show(id) {
    ['scrTitle', 'scrPause', 'scrResult', 'scrShop', 'scrTrophy'].forEach(function (s) {
      $(s).hidden = s !== id;
    });
  }
  function toast(text) {
    var el = $('toast');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 2400);
  }

  function clock(t) {
    var s = Math.max(0, Math.floor(t));
    var m = (s / 60) | 0;
    var r = s % 60;
    return m + ':' + (r < 10 ? '0' : '') + r;
  }
  function heartString(p) {
    var s = '';
    var hp = run.hp[p] | 0;
    var max = run.maxHp[p] | 0;
    for (var i = 0; i < max; i++) s += i < hp ? '♥' : '♡';
    return s;
  }

  function paintTitle() {
    $('coinLbl').textContent = Kit.fmt(save.coins);
    $('bestLbl').textContent = save.best ? ('أفضل صمود: ' + clock(save.best)) : 'أول جولة لك!';
    $('btnEndless').hidden = !save.endless;
    $('duoHint').hidden = pick.players !== 2;
    $('btn1p').className = 'rs-chip' + (pick.players === 1 ? ' on' : '');
    $('btn2p').className = 'rs-chip' + (pick.players === 2 ? ' on' : '');
    $('btnNormal').className = 'rs-chip' + (!pick.quick && !pick.endless ? ' on' : '');
    $('btnQuick').className = 'rs-chip' + (pick.quick ? ' on' : '');
    $('btnEndless').className = 'rs-chip' + (pick.endless ? ' on' : '');
    var maps = $('mapRow');
    maps.innerHTML = '';
    D.maps.forEach(function (m) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'rs-chip' + (pick.map === m.id ? ' on' : '');
      b.textContent = m.name;
      b.disabled = m.id > save.map;
      b.addEventListener('click', function () {
        if (m.id > save.map) return;
        pick.map = m.id;
        Sfx.ui('tap');
        paintTitle();
      });
      maps.appendChild(b);
    });
    var row = $('heroRow');
    row.innerHTML = '';
    D.heroes.forEach(function (h, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'rs-hero' + (pick.hero === i ? ' on' : '');
      b.disabled = !save.heroes[i];
      var c = document.createElement('canvas');
      c.width = 64; c.height = 64;
      if (save.heroes[i]) c.getContext('2d').drawImage(Draw.hero(i), 0, 0, 64, 64);
      b.appendChild(c);
      var name = document.createElement('span');
      name.textContent = save.heroes[i] ? h.name : 'قفل';
      b.appendChild(name);
      b.addEventListener('click', function () {
        if (!save.heroes[i]) return;
        pick.hero = i;
        Sfx.ui('tap');
        paintTitle();
      });
      row.appendChild(b);
    });
  }

  function paintShop() {
    $('shopCoins').textContent = Kit.fmt(save.coins);
    var list = $('shopList');
    list.innerHTML = '';
    D.meta.forEach(function (item, i) {
      var row = document.createElement('div');
      row.className = 'rs-item';
      var rank = save.meta[i];
      var label = document.createElement('div');
      label.innerHTML = '<b>' + item.name + '</b><div>' + item.desc + ' · الرتبة ' + rank + '/5</div>';
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sg-btn';
      if (rank >= 5) { btn.textContent = 'اكتمل'; btn.disabled = true; }
      else {
        var cost = item.cost[rank];
        btn.textContent = cost + ' عملة';
        btn.disabled = save.coins < cost;
        btn.addEventListener('click', function () { buy(i); });
      }
      row.appendChild(label);
      row.appendChild(btn);
      list.appendChild(row);
    });
  }
  function buy(i) {
    var rank = save.meta[i];
    if (rank >= 5) return;
    var cost = D.meta[i].cost[rank];
    if (save.coins < cost) { Sfx.ui('tap'); return; }
    save.coins -= cost;
    save.meta[i] = rank + 1;
    persist();
    if (Kit.juice) Kit.juice.coin(rank + 1);
    paintShop();
  }
  function paintTrophies() {
    var list = $('trophyList');
    list.innerHTML = '';
    D.trophies.forEach(function (tr, i) {
      var row = document.createElement('div');
      row.className = 'rs-trophy' + (save.trophies[i] ? '' : ' off');
      row.textContent = (save.trophies[i] ? '🏆 ' : '🔒 ') + tr.name + ' — ' + tr.line;
      list.appendChild(row);
    });
  }

  function openTitle() {
    screen = 'title';
    show('scrTitle');
    $('hud').hidden = true;
    $('btnPause').hidden = true;
    $('cards').hidden = true;
    $('bossBar').hidden = true;
    $('xpTrack').hidden = true;
    $('warn').hidden = true;
    warnText = '';
    warnUntil = 0;
    paintTitle();
    dirty = true;
  }

  function roundId(o) {
    if (o.players === 2) return (o.quick ? 'q' : 'm') + o.map + ':duo';
    if (o.endless) return 'endless';
    return (o.quick ? 'q' : 'm') + o.map;
  }

  function startRun(opts) {
    opts = opts || {};
    var players = opts.players === 2 ? 2 : 1;
    var map = num(opts.map || pick.map, 1, 3);
    if (map > save.map) map = 1;
    var quick = !!(opts.quick != null ? opts.quick : pick.quick);
    var endless = !!(opts.endless != null ? opts.endless : pick.endless) && players === 1 && !quick;
    var hero = num(opts.hero != null ? opts.hero : pick.hero, 0, 5);
    if (!save.heroes[hero]) hero = 0;
    var tier = dda.tier;
    var spawnMul = dda.pick([0.7, 0.8375, 0.975, 1.1125, 1.25]);
    var hpMul = dda.pick([0.8, 0.925, 1.05, 1.175, 1.3]);
    var bossMul = dda.pick([0.82, 0.94, 1.06, 1.18, 1.28]);
    mode = { players: players, map: map, quick: quick, endless: endless, hero: hero };
    Kit.stats.round(roundId(mode));
    reported = false;
    runLength = quick ? 150 : 270;
    run = RS.newRun({
      seed: (opts.seed != null ? opts.seed : ((Date.now() % 100000) + ((Math.random() * 100000) | 0))) >>> 0,
      players: players, map: map, quick: quick, endless: endless, tier: tier,
      spawnMul: spawnMul, hpMul: hpMul, bossMul: bossMul,
      hero: [hero, hero],
      meta: { heart: save.meta[0], speed: save.meta[1], reroll: save.meta[2] }
    });
    focus[0] = focus[1] = 0;
    cardKey = '';
    warnText = '';
    warnUntil = 0;
    Draw.resetCam(run);
    $('toast').hidden = true;
    screen = 'play';
    show(null);
    $('hud').hidden = false;
    $('btnPause').hidden = false;
    $('xpTrack').hidden = false;
    $('cards').hidden = true;
    dirty = true;
    Sfx.ui('go');
  }

  function starsFor(win, sec) {
    if (win) return 3;
    if (sec >= 120) return 2;
    if (sec >= 45) return 1;
    return 0;
  }

  function unlocksBefore() {
    return save.heroes.join('') + save.map + save.endless + save.trophies.join('');
  }
  function applyUnlocks() {
    if (save.pops >= 1) save.trophies[0] = 1;
    if (save.pops >= 100) save.trophies[1] = 1;
    if (save.pops >= 1000) { save.trophies[2] = 1; save.heroes[1] = 1; }
    if (save.wins >= 1) { save.trophies[3] = 1; save.endless = 1; }
    if (save.noDash >= 1) { save.trophies[4] = 1; save.heroes[2] = 1; }
    if (save.quickWins >= 1) { save.trophies[5] = 1; save.heroes[5] = 1; }
    if (save.mapWins[0] && save.mapWins[1] && save.mapWins[2]) save.trophies[6] = 1;
    if (save.boltsBest >= 500) { save.trophies[7] = 1; save.heroes[3] = 1; }
    if (save.revives >= 1) save.trophies[8] = 1;
    if (save.mapWins[0] >= 1 && save.map < 2) save.map = 2;
    if (save.mapWins[1] >= 1 && save.map < 3) save.map = 3;
    if (save.mapWins[1] >= 1) save.heroes[4] = 1;
  }

  function commitResult() {
    if (reported || !run) return;
    reported = true;
    if (run.over === 'win') run.t = Math.max(run.t, run.bossAt || 120);
    var sec = Math.max(0, Math.floor(run.t));
    var duo = mode.players === 2;
    if (!duo) dda.result(Math.min(1, sec / runLength));
    if (duo) Kit.stats.end('end');
    else if (mode.endless) Kit.stats.end('end', sec);
    else Kit.stats.end(run.over === 'win' ? 'win' : 'lose', sec);

    var before = unlocksBefore();
    var win = run.over === 'win';
    save.pops += run.pops | 0;
    save.revives += run.revives | 0;
    if (run.bolts > save.boltsBest) save.boltsBest = run.bolts | 0;
    if (sec > save.best) save.best = sec;
    var gained = Math.floor(sec * 0.35 + run.pops * 0.12 + (win ? 50 : 10));
    save.coins += gained;
    if (win && !mode.endless) {
      save.wins++;
      save.mapWins[mode.map - 1] = (save.mapWins[mode.map - 1] || 0) + 1;
      if (duo) { /* a shared win still opens the next map */ }
      else {
        if (mode.quick) save.quickWins++;
        if ((run.dashN[0] | 0) === 0) save.noDash++;
      }
    }
    if ((run.bossHits | 0) > 0) save.trophies[9] = 1;
    applyUnlocks();
    var freshUnlock = unlocksBefore() !== before;
    persist();
    var n = starsFor(win && !duo, sec);
    var star = '';
    for (var i = 0; i < 3; i++) star += i < n ? '★' : '<i>★</i>';
    $('resStars').innerHTML = star;
    if (duo) $('resTitle').textContent = 'أحسنتم!';
    else if (mode.endless) $('resTitle').textContent = 'صمدت!';
    else if (win) $('resTitle').textContent = 'فزت!';
    else $('resTitle').textContent = 'دخت!';
    $('resLine').textContent = 'صمود ' + sec + ' ثانية · ' + Kit.fmt(gained) + ' عملة · ' + Kit.fmt(run.pops) + ' فقعة';
    $('resUnlock').textContent = freshUnlock ? 'فتح جديد على الرفّ!' : '';
    if (win && !duo) Sfx.ui('win');
    else if (!duo && !mode.endless) Sfx.ui('lose');
    if (freshUnlock) toast('فتح جديد!');
  }

  function showResult() {
    screen = 'result';
    show('scrResult');
    $('hud').hidden = true;
    $('btnPause').hidden = true;
    $('cards').hidden = true;
    $('bossBar').hidden = true;
    $('xpTrack').hidden = true;
    $('warn').hidden = true;
    dirty = true;
  }

  function pauseGame() {
    if (screen !== 'play') return;
    screen = 'pause';
    show('scrPause');
    $('cards').hidden = true;
    dirty = true;
    Kit.keys.reset();
  }
  function resumeGame() {
    if (screen !== 'pause') return;
    screen = 'play';
    show(null);
    $('hud').hidden = false;
    $('btnPause').hidden = false;
    $('cards').hidden = !(run && run.cards);
    if (run && run.cards) buildCards();
    dirty = true;
    Sfx.ui('tap');
  }

  function axis(pos, neg) {
    return (Kit.keys.down(pos) ? 1 : 0) - (Kit.keys.down(neg) ? 1 : 0);
  }
  function gather() {
    var one = run.players === 1;
    var x = axis('KeyD', 'KeyA');
    var y = axis('KeyS', 'KeyW');
    if (one) { x += axis('ArrowRight', 'ArrowLeft'); y += axis('ArrowDown', 'ArrowUp'); }
    inputs[0].x = x;
    inputs[0].y = y;
    inputs[0].dash = (Kit.keys.down('Space') || (one && Kit.keys.down('Slash'))) ? 1 : 0;
    if (!one) {
      inputs[1].x = axis('ArrowRight', 'ArrowLeft');
      inputs[1].y = axis('ArrowDown', 'ArrowUp');
      inputs[1].dash = Kit.keys.down('Slash') ? 1 : 0;
    }
  }

  function cardSignature() {
    var s = String(run.level) + ':' + run.queue + ':';
    for (var p = 0; p < run.players; p++) s += (run.offers[p] || []).join(',') + '|';
    return s;
  }
  function buildCards() {
    var rows = $('cardRows');
    rows.innerHTML = '';
    for (var p = 0; p < run.players; p++) {
      var wrap = document.createElement('div');
      if (run.players === 2) {
        var who = document.createElement('div');
        who.className = 'rs-who';
        who.textContent = 'اللاعب ' + (p + 1);
        wrap.appendChild(who);
      }
      var offer = document.createElement('div');
      offer.className = 'rs-offer';
      (run.offers[p] || []).forEach(function (id, index) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'rs-card' + (id >= 10 ? ' evo' : '') + (focus[p] === index ? ' on' : '');
        b.setAttribute('data-p', String(p));
        b.setAttribute('data-i', String(index));
        var icon = document.createElement('canvas');
        icon.width = 96; icon.height = 96;
        icon.getContext('2d').drawImage(Draw.icon(id), 0, 0);
        var spec = id >= 10 ? D.evos[id - 10] : D.weapons[id];
        var name = document.createElement('span');
        name.className = 'nm';
        name.textContent = spec.name;
        var lv = document.createElement('span');
        lv.className = 'lv';
        if (id >= 10) lv.textContent = 'تطوّر';
        else {
          var cur = run.lv[p][id] || 0;
          lv.textContent = cur <= 0 ? 'جديد' : ('Lv ' + cur + ' → ' + (cur + 1));
        }
        var ds = document.createElement('span');
        ds.className = 'ds';
        ds.textContent = spec.desc;
        b.appendChild(icon); b.appendChild(name); b.appendChild(lv); b.appendChild(ds);
        b.addEventListener('click', function () {
          var pp = num(b.getAttribute('data-p'), 0, 1);
          var ii = num(b.getAttribute('data-i'), 0, 2);
          choose(pp, ii);
        });
        offer.appendChild(b);
      });
      wrap.appendChild(offer);
      if (run.reroll[p] > 0 && run.pick[p] < 0) {
        var rb = document.createElement('button');
        rb.type = 'button';
        rb.className = 'rs-reroll';
        rb.textContent = 'تبديل ' + run.reroll[p];
        rb.setAttribute('data-p', String(p));
        rb.addEventListener('click', function () {
          var pp = num(rb.getAttribute('data-p'), 0, 1);
          if (RS.reroll(run, pp)) { Sfx.ui('tap'); cardKey = ''; }
        });
        wrap.appendChild(rb);
      }
      rows.appendChild(wrap);
    }
    $('cards').hidden = false;
    cardKey = cardSignature();
  }
  function choose(p, index) {
    var offer = run.offers[p] || [];
    if (index < 0 || index >= offer.length) return;
    if (!RS.choose(run, p, offer[index])) return;
    if (Kit.juice) Kit.juice.select();
    cardKey = '';
    if (!run.cards) $('cards').hidden = true;
  }
  function moveFocus(p, dir) {
    var n = (run.offers[p] || []).length;
    if (!n || run.pick[p] >= 0) return;
    focus[p] = (focus[p] + dir + n) % n;
    cardKey = '';
  }
  function cardKeys() {
    var one = run.players === 1;
    var confirm = false;
    if (Kit.keys.pressed('KeyA') || (one && Kit.keys.pressed('ArrowLeft'))) { moveFocus(0, -1); confirm = true; }
    if (Kit.keys.pressed('KeyD') || (one && Kit.keys.pressed('ArrowRight'))) { moveFocus(0, 1); confirm = true; }
    if (!confirm && (Kit.keys.pressed('Space') || (one && Kit.keys.pressed('Enter')))) choose(0, focus[0]);
    if (run.players === 2) {
      var moved = false;
      if (Kit.keys.pressed('ArrowLeft')) { moveFocus(1, -1); moved = true; }
      if (Kit.keys.pressed('ArrowRight')) { moveFocus(1, 1); moved = true; }
      if (!moved && (Kit.keys.pressed('Enter') || Kit.keys.pressed('NumpadEnter') || Kit.keys.pressed('Slash'))) choose(1, focus[1]);
    }
    if (run.cards && Kit.keys.pressed('KeyR')) {
      if (RS.reroll(run, 0)) cardKey = '';
    }
    if (run.cards && cardKey !== cardSignature()) buildCards();
    else if (!run.cards) $('cards').hidden = true;
  }

  function events() {
    var reduced = Kit.motion.reduced();
    for (var i = 0; i < run.evN; i++) {
      var e = run.ev[i];
      if (e.k === 5) { Kit.track.hit(); shake.add(5); }
      else if (e.k === 3 && e.a) { Kit.track.miss(); shake.add(10); }
      else if (e.k === 4) { Kit.track.react(e.a | 0); shake.add(4); }
      else if (e.k === 1 && e.a >= 7) shake.add(e.a === 8 ? 16 : 8);
      else if (e.k === 6) shake.add(10);
      else if (e.k === 7) shake.add(reduced ? 0 : 16);
      else if (e.k === 10) shake.add(3);
      else if (e.k === 11) { warnText = e.a ? 'ملك الروبوتات!' : 'زعيم صغير!'; warnUntil = run.t + 2.6; }
    }
    Sfx.events(run);
    Draw.events(run, reduced);
    run.evN = 0;
  }

  function hud() {
    if (!run) return;
    $('hudTime').textContent = clock(run.t);
    var hearts = heartString(0);
    if (run.players === 2) hearts = '1 ' + hearts + '   2 ' + heartString(1);
    $('hearts').textContent = hearts;
    $('hudLv').textContent = String(run.level);
    var combo = $('combo');
    if (run.combo >= 3) { combo.hidden = false; combo.textContent = 'x' + run.combo; }
    else combo.hidden = true;
    var king = run.kingId;
    var bar = $('bossBar');
    if (king >= 0 && run.rAlive[king]) {
      bar.hidden = false;
      var pct = Math.max(0, run.rhp[king] / run.rmax[king]);
      bar.querySelector('i').style.width = (pct * 100) + '%';
    } else bar.hidden = true;
    var xp = run.next > 0 ? run.xp / run.next : 0;
    $('xpFill').style.width = (Math.max(0, Math.min(1, xp)) * 100) + '%';
    var soon = !run.kingAlive && !run.bossPopped && !run.endless && run.bossAt - run.t < 4 && run.bossAt - run.t > 0;
    var warn = $('warn');
    if (soon) { warn.hidden = false; warn.textContent = 'الملك يقترب!'; }
    else if (run.t < warnUntil && warnText) { warn.hidden = false; warn.textContent = warnText; }
    else warn.hidden = true;
  }

  function pressedStart() {
    if (document.activeElement && document.activeElement.tagName === 'BUTTON') return false;
    return Kit.keys.pressed('Enter') || Kit.keys.pressed('Space');
  }

  function update(dt) {
    if (screen === 'play' && run) {
      if (Kit.keys.pressed('KeyP') || Kit.keys.pressed('Escape')) pauseGame();
      if (screen === 'play') {
        if (run.cards) cardKeys();
        else gather();
        if (!run.over) RS.step(run, dt, inputs);
        events();
        hud();
        if (run.over && !reported) { commitResult(); showResult(); }
      }
    } else if (screen === 'title') {
      if (pressedStart()) startRun(pick);
    } else if (screen === 'pause') {
      if (Kit.keys.pressed('KeyP') || Kit.keys.pressed('Enter')) resumeGame();
      else if (Kit.keys.pressed('KeyR')) startRun(mode);
    } else if (screen === 'result') {
      var onButton = document.activeElement && document.activeElement.tagName === 'BUTTON';
      if (!onButton && (Kit.keys.pressed('Enter') || Kit.keys.pressed('Space') || Kit.keys.pressed('KeyR'))) startRun(mode);
      else if (Kit.keys.pressed('Escape')) openTitle();
    } else if ((screen === 'shop' || screen === 'trophy') && Kit.keys.pressed('Escape')) openTitle();
    Kit.keys.endFrame();
  }

  function render() {
    var reduced = Kit.motion.reduced();
    if (screen === 'pause' || screen === 'result') {
      if (!dirty) return;
      if (run) {
        Draw.draw(ctx, run, shake, [mode.hero, mode.hero], reduced, 0);
      }
      dirty = false;
      return;
    }
    if (screen === 'title' || screen === 'shop' || screen === 'trophy') {
      uiT += 1 / 60;
      Draw.title(ctx, uiT, (pick.map || 1) - 1, pick.hero || 0);
      return;
    }
    if (!run) return;
    shake.update(1 / 60);
    Draw.cam(run, 1 / 60);
    Draw.draw(ctx, run, shake, [mode.hero, mode.hero], reduced, 1 / 60);
    dirty = false;
  }

  $('btnPlay').addEventListener('click', function () { pick.players = pick.players === 2 ? 2 : 1; startRun(pick); });
  $('btn1p').addEventListener('click', function () { pick.players = 1; pick.endless = pick.endless; paintTitle(); });
  $('btn2p').addEventListener('click', function () { pick.players = 2; pick.endless = false; paintTitle(); });
  $('btnNormal').addEventListener('click', function () { pick.quick = false; pick.endless = false; paintTitle(); });
  $('btnQuick').addEventListener('click', function () { pick.quick = true; pick.endless = false; paintTitle(); });
  $('btnEndless').addEventListener('click', function () { pick.endless = true; pick.quick = false; pick.players = 1; paintTitle(); });
  $('btnShop').addEventListener('click', function () { screen = 'shop'; show('scrShop'); paintShop(); Sfx.ui('tap'); });
  $('btnShopBack').addEventListener('click', function () { Sfx.ui('back'); openTitle(); });
  $('btnTrophy').addEventListener('click', function () { screen = 'trophy'; show('scrTrophy'); paintTrophies(); Sfx.ui('tap'); });
  $('btnTrophyBack').addEventListener('click', function () { Sfx.ui('back'); openTitle(); });
  $('btnPause').addEventListener('click', function () { pauseGame(); });
  $('btnResume').addEventListener('click', function () { resumeGame(); });
  $('btnRestart').addEventListener('click', function () { startRun(mode); });
  $('btnMenu').addEventListener('click', function () { Sfx.ui('back'); run = null; openTitle(); });
  $('btnAgain').addEventListener('click', function () { startRun(mode); });
  $('btnResultMenu').addEventListener('click', function () { Sfx.ui('back'); openTitle(); });

  Draw.boot();
  openTitle();
  Kit.loop(update, render);

  window.__game = {
    get state() { return screen; },
    get paused() { return screen === 'pause'; },
    get run() { return run; },
    get px() { return run ? run.x[0] : 0; },
    get t() { return run ? run.t : 0; },
    get save() { return save; },
    get mode() { return mode; },
    particles: function () { return Draw.count(); },
    dmg: function () { return Draw.dmgCount(); },
    start: function (o) { startRun(o || pick); },
    endNow: function (kind) {
      if (!run || reported) return;
      if (kind === 'win') {
        run.t = Math.max(run.t, run.bossAt || 120);
        run.bossPopped = 1;
        run.over = 'win';
      } else if (kind === 'lose') run.over = 'lose';
      else run.over = kind === 'end' ? 'end' : 'lose';
      commitResult();
      showResult();
    },
    setTime: function (t) { if (run && isFinite(t)) run.t = t; },
    stress: function () { if (run) { RS.stress(run); dirty = true; } },
    levelUp: function () {
      if (!run || screen !== 'play') return;
      run.queue += 1;
      if (!run.cards) RS.step(run, 1 / 60, inputs);
      if (run.cards) buildCards();
    }
  };

  Kit.lifecycle({ pause: function () { pauseGame(); } });
  Kit.ready();
})();
