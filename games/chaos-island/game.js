/* جزيرة الفوضى — screens, input, save, juice. Simulation lives in engine.js. */
(function () {
  'use strict';
  var K = window.Kit, CI = window.CI;
  var $ = function (id) { return document.getElementById(id); };
  var W = CI.W, H = CI.H;

  var HAT_NAME = { cap: 'قبعة', flower: 'زهرة', prop: 'مروحة', cone: 'مخروط', star: 'نجمة', bucket: 'دلو', crown: 'تاج' };
  var OUTFITS = [
    { id: 'plain', name: 'عادي', price: 0 },
    { id: 'stripe', name: 'خطوط', price: 50 },
    { id: 'spot', name: 'نقاط', price: 50 },
    { id: 'cape', name: 'عباءة', price: 50 }
  ];
  var EMOTES = [{ id: 'wave', name: 'تلويح', price: 0 }, { id: 'dance', name: 'رقصة', price: 40 }];
  var ISLAND_PRICE = { candy: 80, toy: 140, snow: 220, sky: 320 };
  var PERKS = [{ id: 'dj', name: 'قفزة مزدوجة', price: 180 }, { id: 'quick', name: 'فقاعة سريعة', price: 180 }];

  function fresh() {
    return {
      v: 1, coins: 0, hat: 'none', hats: [], color: CI.COLORS[0], colors: [CI.COLORS[0]],
      outfit: 'plain', outfits: ['plain'], emote: 'wave', emotes: ['wave'],
      islands: ['beach'], perks: { dj: false, quick: false }, book: {},
      streak: 0, bestStreak: 0, bestRounds: 0, survivals: 0, jumps: 0,
      settings: { bots: 6, coop: false, perks2p: false, hard: false, island: 'beach' }
    };
  }
  function ownsList(list, id) { return list.indexOf(id) !== -1; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  var store = K.store('chaos-island');
  var save = fresh();
  function valid(s) {
    return !!(s && s.v === 1 && typeof s.coins === 'number' && isFinite(s.coins)
      && Array.isArray(s.hats) && Array.isArray(s.colors) && Array.isArray(s.islands)
      && Array.isArray(s.outfits) && Array.isArray(s.emotes)
      && s.perks && typeof s.perks === 'object' && s.book && typeof s.book === 'object'
      && s.settings && typeof s.settings.bots === 'number');
  }
  function load() {
    var raw = store.get('data', null);
    if (!valid(raw)) { save = fresh(); return; }
    var b = fresh();
    b.coins = Math.max(0, Math.floor(raw.coins));
    b.hats = raw.hats.filter(function (id) { return HAT_NAME[id]; });
    b.colors = raw.colors.filter(function (c) { return CI.COLORS.indexOf(c) !== -1; });
    if (!b.colors.length) b.colors = [CI.COLORS[0]];
    b.color = b.colors.indexOf(raw.color) !== -1 ? raw.color : b.colors[0];
    b.outfits = raw.outfits.filter(function (id) { return OUTFITS.some(function (o) { return o.id === id; }); });
    if (b.outfits.indexOf('plain') < 0) b.outfits.unshift('plain');
    b.outfit = b.outfits.indexOf(raw.outfit) !== -1 ? raw.outfit : 'plain';
    b.emotes = raw.emotes.filter(function (id) { return EMOTES.some(function (o) { return o.id === id; }); });
    if (b.emotes.indexOf('wave') < 0) b.emotes.unshift('wave');
    b.emote = b.emotes.indexOf(raw.emote) !== -1 ? raw.emote : 'wave';
    b.hat = raw.hat === 'none' || b.hats.indexOf(raw.hat) !== -1 ? (raw.hat || 'none') : 'none';
    b.islands = raw.islands.filter(function (id) { return CI.ISLANDS.some(function (n) { return n.id === id; }); });
    if (b.islands.indexOf('beach') < 0) b.islands.unshift('beach');
    b.perks = { dj: !!raw.perks.dj, quick: !!raw.perks.quick };
    b.book = {};
    Object.keys(raw.book).forEach(function (k) {
      var n = raw.book[k];
      if (n === 1 || n === 2) b.book[k] = n;
    });
    b.streak = Math.max(0, raw.streak | 0);
    b.bestStreak = Math.max(b.streak, raw.bestStreak | 0);
    b.bestRounds = clamp(raw.bestRounds | 0, 0, 5);
    b.survivals = Math.max(0, raw.survivals | 0);
    b.jumps = Math.max(0, raw.jumps | 0);
    var bots = clamp(raw.settings.bots | 0, 0, 6);
    var island = b.islands.indexOf(raw.settings.island) !== -1 ? raw.settings.island : 'beach';
    b.settings = { bots: bots, coop: !!raw.settings.coop, perks2p: !!raw.settings.perks2p, hard: !!raw.settings.hard, island: island };
    save = b;
  }
  load();
  var saveUi = K.saveStatus({ retry: persist });
  function persist() {
    if (store.set('data', save) === false) { saveUi.failed(); return false; }
    saveUi.saved();
    return true;
  }

  var cv = $('cv'), ui = $('ui');
  var sceneDirty = true, bakedId = '', bake = document.createElement('canvas');
  bake.width = W; bake.height = H;
  var view = K.fit(cv, W, H, {
    maxDpr: 1.5,
    onResize: function (v) {
      ui.style.transform = 'translate(' + cv.style.left + ',' + cv.style.top + ') scale(' + v.scale + ')';
      sceneDirty = true;
      bakedId = '';
    }
  });
  var ctx = view.ctx;
  cv.addEventListener('contextrestored', function () { bakedId = ''; sceneDirty = true; });
  var fx = K.particles(), shake = K.shake();
  var sprites = {};
  var floaters = [];
  var aim = { on: false, x: 0, y: 0 };
  var mode = 'title', world = null, attract = null, attractN = 1;
  var matchLive = false, reported = false, matches = 0, preBest = 0;
  var lastPlayers = 1, lastIsland = 'beach', lastDaily = false;
  var cardT = 0, boomT = 0, fontReady = false;

  if (document.fonts && document.fonts.load) {
    document.fonts.load('700 40px Fredoka', 'ب').then(function () { fontReady = true; sceneDirty = true; }).catch(function () {});
  }

  function burst(x, y, o) {
    fx.burst(x, y, o);
    if (fx.list.length > 200) fx.list.splice(0, fx.list.length - 200);
  }
  function popText(x, y, text, color) {
    floaters.push({ x: x, y: y, text: text, color: color || '#ffe14a', life: 0.9 });
    if (floaters.length > 16) floaters.shift();
  }
  var A = K.audio;
  var S = {
    jump: function () { K.sfx.jump(); },
    land: function () { K.sfx.land(); },
    pop: function () { K.sfx.pop(); },
    coin: function () { K.sfx.coin(); },
    boom: function () { K.sfx.boom(); },
    win: function () { K.sfx.win(); },
    lose: function () { K.sfx.lose(); },
    click: function () { K.sfx.click(); },
    siren: function () { K.sfx.power(); },
    intro: function (id) {
      var notes = {
        jelly: [392, 494, 587], meteor: [220, 196, 165], tornado: [523, 659, 784],
        sauce: [330, 277, 220], bowl: [440, 494, 554], quake: [160, 130, 98],
        gum: [587, 659, 784], snow: [523, 587, 659], beach: [494, 587, 698],
        ice: [698, 659, 523], spark: [880, 988, 1175], stomp: [196, 164, 130]
      }[id] || [523, 659, 784];
      var wave = id === 'quake' || id === 'stomp' ? 'sawtooth' : 'triangle';
      notes.forEach(function (f, i) { A.tone({ freq: f, type: wave, dur: 0.11, vol: 0.11, delay: i * 0.07 }); });
      if (id === 'meteor' || id === 'stomp') A.noise({ dur: 0.16, vol: 0.07, filter: 900, to: 180 });
    },
    tick: function (sec) { A.tone({ freq: sec <= 1 ? 880 : 540, type: 'square', dur: 0.05, vol: 0.07 }); },
    cheer: function () {
      [523, 659, 784, 1047].forEach(function (f, i) { A.tone({ freq: f, type: 'triangle', dur: 0.1, vol: 0.14, delay: i * 0.05 }); });
    },
    streak: function () { A.tone({ freq: 784, to: 1175, type: 'square', dur: 0.12, vol: 0.08 }); },
    fanfare: function () {
      [523, 659, 784].forEach(function (f, i) { A.tone({ freq: f, type: 'triangle', dur: 0.16, vol: 0.16, delay: i * 0.12 }); });
    },
    nope: function () { A.tone({ freq: 220, to: 140, type: 'square', dur: 0.12, vol: 0.12 }); },
    drop: function () { K.sfx.whoosh(); }
  };

  function humansOf(w) {
    var list = [];
    if (!w) return list;
    for (var i = 0; i < w.actors.length; i++) if (!w.actors[i].bot) list.push(w.actors[i]);
    return list;
  }
  function human(i) { var h = humansOf(world); return h[i || 0] || null; }
  function tipOf(id) {
    for (var i = 0; i < CI.DISASTERS.length; i++) if (CI.DISASTERS[i].id === id) return CI.DISASTERS[i].tip;
    return '';
  }
  var JOKES = {
    jelly: 'الجيلي يريد أن يسبح معك!',
    meteor: 'المارشملو ينزل من السماء!',
    tornado: 'الفشار يرقص في الهواء!',
    sauce: 'الأرض صارت صلصة حارة!',
    bowl: 'كرات البولينغ خرجت تلعب!',
    quake: 'البلاط يريد قيلولة!',
    gum: 'العلكة تنفخ الريح!',
    snow: 'كرات الثلج تريد عناقًا!',
    beach: 'كرة الشاطئ صارت عملاقة!',
    ice: 'الأرض تزلّج وحدها!',
    spark: 'اللمعان يغمز ثم يضرب!',
    stomp: 'الروبوت يمشي على أطراف أصابعه!'
  };
  var SHORT = {
    jelly: 'اصعد فوق البيوت',
    meteor: 'اهرب من الظل',
    tornado: 'امسك عكس الريح',
    sauce: 'ابقَ في الأعلى',
    bowl: 'اصعد عن الممر',
    quake: 'اقفز إذا اهتز',
    gum: 'امسك عكس الخطوط',
    snow: 'ابتعد عن الحافة',
    beach: 'ابتعد عن الظل',
    ice: 'امشِ بهدوء',
    spark: 'اخرج من الدائرة',
    stomp: 'ابتعد عن الظل'
  };
  var countSec = 0;
  var hitT = 0;
  function showCard(name, tip, hot, id) {
    $('siren-name').textContent = name;
    $('siren-joke').textContent = JOKES[id] || 'استعد للقفز!';
    $('siren-tip').textContent = SHORT[id] || tip || '';
    $('siren').hidden = false;
    $('siren').classList.toggle('hot', !!hot);
    cardT = hot ? 3.4 : 8;
    if (!hot) S.intro(id);
  }
  function cheer() {
    var el = $('cheer');
    el.hidden = false;
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
  }
  function streakWord(n) {
    if (n >= 4) return 'خارق!';
    if (n === 3) return 'ممتاز!';
    if (n === 2) return 'رائع!';
    return '';
  }
  function showStreak(word) {
    var el = $('streak');
    el.textContent = word;
    el.hidden = false;
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
  }
  function motionFull() {
    return document.documentElement.getAttribute('data-sg-motion') !== 'reduce';
  }
  function hudRound(w) {
    if (!w) return '';
    if (w.phase === 'podium' || w.round >= 5) return w.island.name + ' · انتهت الجولات';
    return w.island.name + ' · الجولة ' + (Math.min(w.round, 4) + 1) + '/5';
  }
  function paintCount(w) {
    var el = $('siren-count');
    var show = w && !w.attract && mode === 'play' && w.phase === 'inter';
    var sec = show ? Math.ceil(w.frames / 60) : 0;
    if (show && sec > 0 && sec <= 5) {
      if (sec !== countSec) { countSec = sec; el.textContent = String(sec); S.tick(sec); }
    } else if (countSec) {
      countSec = 0;
      el.textContent = '';
    }
  }
  function friendColor() {
    for (var i = 0; i < save.colors.length; i++) if (save.colors[i] !== save.color) return save.colors[i];
    return CI.COLORS[3];
  }
  function dress(w) {
    var hs = humansOf(w);
    for (var i = 0; i < hs.length; i++) {
      hs[i].color = i === 0 ? save.color : friendColor();
      hs[i].hat = save.hat;
      hs[i].outfit = save.outfit;
      if (i > 0) hs[i].x = Math.min(hs[0].x + 70 * i, W - 80);
    }
  }
  function todayNum() {
    var d = new Date();
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  }
  function makeAttract() {
    var ids = ['meteor', 'jelly', 'tornado', 'beach', 'spark', 'stomp'];
    var id = ids[attractN % ids.length];
    attract = CI.create({
      players: 0, bots: 8, seed: (attractN * 97 + 3) >>> 0, island: attractN % 5,
      attract: true, script: [{ id: id, id2: null, power: 2 }]
    });
    attractN++;
    for (var i = 0; i < 8 * 60; i++) CI.step(attract, 1 / 60);
    attract.ev.length = 0;
  }
  makeAttract();

  function beginMatch(opts) {
    clearFlies();
    opts = opts || {};
    var players = opts.players || 1;
    var daily = !!opts.daily;
    var island = opts.island || save.settings.island;
    if (!daily && save.islands.indexOf(island) < 0) island = 'beach';
    var hard = save.survivals >= 20 && !!save.settings.hard;
    var usePerks = players === 1 || !!save.settings.perks2p;
    var perks = [];
    for (var i = 0; i < players; i++) perks.push(usePerks ? { dj: !!save.perks.dj, quick: !!save.perks.quick } : {});
    world = CI.create({
      seed: (Date.now() ^ (matches + 1) * 131) >>> 0 || 1,
      island: island,
      players: players,
      bots: players === 1 ? 7 : save.settings.bots,
      hard: hard,
      coop: players > 1 && !!save.settings.coop,
      perks: perks
    });
    dress(world);
    lastPlayers = players;
    lastIsland = island;
    lastDaily = daily;
    preBest = save.bestRounds;
    matches++;
    K.stats.round('match');
    matchLive = true;
    reported = false;
    cardT = 0;
    setMode('play');
    try { K.audio.unlock(); } catch (e) {}
    focusGame();
  }

  var coinShown = '', coinHard = false, coinLag = 0, flyGen = 0;
  function paintCoins() {
    var el = $('hud-coins');
    var on = mode === 'play' || mode === 'pause';
    if (el.hidden === on) el.hidden = !on;
    if (!on) return;
    var n = String(Math.max(0, save.coins - coinLag));
    if (n !== coinShown) {
      $('hud-coin-n').textContent = n;
      if (coinShown !== '') { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
      coinShown = n;
    }
    var hard = !!(world && world.hard);
    if (hard !== coinHard) { el.classList.toggle('hard', hard); coinHard = hard; }
  }
  function clearFlies() {
    flyGen++;
    coinLag = 0;
    var box = $('flies');
    if (box) box.textContent = '';
  }
  function flyCoins(x, y, n) {
    if (!motionFull() || n <= 0) return;
    var gen = flyGen;
    coinLag += n;
    var box = $('flies');
    var bits = Math.min(6, Math.max(3, Math.round(n / 8)));
    if (box.childElementCount > 18) bits = 0;
    var tx = 148, ty = 34;
    for (var i = 0; i < bits; i++) {
      var node = document.createElement('i');
      var sx = x + (i - (bits - 1) / 2) * 12;
      var sy = y - 10;
      node.style.left = sx + 'px';
      node.style.top = sy + 'px';
      box.appendChild(node);
      (function (el, delay, fromX, fromY) {
        var dx = tx - fromX, dy = ty - fromY;
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            el.style.transition = 'transform .62s cubic-bezier(.18,.8,.22,1) ' + delay + 'ms, opacity .16s linear ' + (460 + delay) + 'ms';
            el.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(.5)';
            el.style.opacity = '0';
          });
        });
        setTimeout(function () {
          try { if (el.parentNode) el.parentNode.removeChild(el); } catch (e) {}
        }, 820 + delay);
      })(node, i * 50, sx, sy);
    }
    setTimeout(function () {
      if (gen !== flyGen) return;
      coinLag = Math.max(0, coinLag - n);
      try { S.coin(); paintCoins(); } catch (e) {}
    }, 640);
  }
  function setMode(next) {
    mode = next;
    var map = { title: 'scr-title', setup: 'scr-setup', shop: 'scr-shop', book: 'scr-book', pause: 'scr-pause', result: 'scr-result' };
    Object.keys(map).forEach(function (k) { $(map[k]).hidden = k !== next; });
    $('btnPause').hidden = next !== 'play';
    if (next !== 'play' && next !== 'pause') $('siren').hidden = true;
    if (next !== 'play') { $('cheer').hidden = true; $('streak').hidden = true; }
    if (next !== 'play' && next !== 'pause') clearFlies();
    $('confetti').hidden = next !== 'result';
    paintCoins();
    sceneDirty = true;
    if (next === 'title') paintTitle();
    if (next === 'shop') renderShop();
    if (next === 'book') renderBook();
    if (next === 'setup') renderSetup();
  }
  function focusGame() {
    var el = document.activeElement;
    if (el && el.blur && el !== cv) el.blur();
    try { cv.focus({ preventScroll: true }); } catch (e) { cv.focus(); }
  }
  function pause() {
    if (mode !== 'play') return;
    var you = human(0);
    $('p-info').textContent = hudRound(world) + ' · ' + (you ? you.rounds : 0) + ' نجاة';
    setMode('pause');
    S.click();
  }
  function resume() {
    if (mode !== 'pause') return;
    setMode('play');
    K.keys.reset();
    focusGame();
  }
  function toMenu() {
    if (matchLive) {
      var you = human(0);
      K.stats.end('end', you ? you.coins : 0);
      matchLive = false;
    }
    reported = true;
    persist();
    setMode('title');
  }
  function restart() {
    if (mode !== 'play' && mode !== 'pause' && mode !== 'result') return;
    beginMatch({ players: lastPlayers, island: lastIsland, daily: lastDaily });
  }
  function openResult() {
    if (reported) return;
    reported = true;
    matchLive = false;
    var hs = humansOf(world);
    var you = hs[0];
    var rounds = you ? you.rounds : 0;
    var record = rounds > preBest;
    if (record) save.bestRounds = rounds;
    var score = 0;
    for (var i = 0; i < hs.length; i++) score += hs[i].coins;
    if (hs.length > 1) K.stats.end(hs[0].rounds === hs[1].rounds ? 'draw' : 'end', score);
    else K.stats.end(rounds >= 3 ? 'win' : rounds === 0 ? 'lose' : 'end', score);
    persist();
    paintResult(record);
    setMode('result');
    if (rounds > 0) S.fanfare(); else S.lose();
    burst(W / 2, 160, { count: 48, colors: ['#ffe14a', '#ff5d8f', '#7cf29a', '#4cc9f0', '#fff'], speed: 360, life: 1.1, size: 7, gravity: 380 });
    shower();
  }

  function noteBook(id, gold) {
    var cur = save.book[id] || 0;
    var next = gold ? 2 : 1;
    if (next > cur) save.book[id] = next;
  }
  function eat(w) {
    if (!w || w.attract) { if (w) w.ev.length = 0; return; }
    var dirty = false;
    var ev = w.ev;
    for (var i = 0; i < ev.length; i++) {
      var e = ev[i];
      var actor = e.id != null ? w.actors[e.id] : null;
      var mine = actor && !actor.bot;
      if (e.t === 'jump' && mine) { save.jumps++; S.jump(); }
      else if (e.t === 'pop') {
        burst(e.x, e.y, { count: mine ? 14 : 8, colors: ['#fff', '#b9ecff', '#ffd0ea'], speed: 180, life: 0.45, size: 5, gravity: -40 });
        popText(e.x, e.y - 20, 'بوب!', '#fff');
        if (mine) { S.pop(); shake.add(5); }
      } else if (e.t === 'boom') {
        if (boomT <= 0) { S.boom(); boomT = 0.18; }
        shake.add(e.p || 3);
        var cols = e.k === 'meteor' ? ['#fff', '#ffd0ea'] : ['#ffe14a', '#fff'];
        burst(e.x, e.y, { count: 8, colors: cols, speed: 160, life: 0.4, size: 5, gravity: 200 });
      } else if (e.t === 'coin' && mine) {
        save.coins += e.n;
        if (!e.lived) save.streak = 0;
        popText(e.x, e.y - 30, '+' + e.n, '#ffe14a');
        flyCoins(e.x, e.y, e.n);
        if (!motionFull()) S.coin();
        dirty = true;
      } else if (e.t === 'ok' && mine) {
        save.survivals++;
        save.streak = actor.streak;
        if (actor.streak > save.bestStreak) save.bestStreak = actor.streak;
        if (w.dis[0]) noteBook(w.dis[0].id, w.hard);
        if (w.dis[1]) noteBook(w.dis[1].id, w.hard);
        burst(actor.x + actor.w / 2, actor.y + actor.h, { count: 18, colors: ['#7cf29a', '#ffe14a', '#fff', '#ff5d8f'], speed: 220, life: 0.55, size: 5, gravity: 280 });
        shake.add(4);
        hitT = 0.14;
        cheer();
        S.cheer();
        var word = streakWord(actor.streak);
        if (word) { showStreak(word); S.streak(); }
        dirty = true;
      } else if (e.t === 'siren') {
        var name = e.name + (e.name2 ? ' + ' + e.name2 : '');
        showCard(name, tipOf(e.id), true, e.id);
        S.siren();
      } else if (e.t === 'round') {
        showCard(e.name + (e.name2 ? ' + ' + e.name2 : ''), tipOf(e.id), false, e.id);
        var hs = humansOf(w);
        if (hs[1] && hs[0]) hs[1].x = Math.min(hs[0].x + 70, W - 80);
      } else if (e.t === 'drop' && mine) S.drop();
      else if (e.t === 'cloud' && mine) S.pop();
    }
    ev.length = 0;
    if (dirty) persist();
  }

  function held(codes) { return K.keys.anyDown(codes); }
  function ax(neg, pos) {
    var n = held(neg), p = held(pos);
    if (n === p) return 0;
    return p ? 1 : -1;
  }
  function readSlot(slot, players) {
    var p1 = players < 2;
    var x = p1 ? ax(['ArrowLeft', 'KeyA'], ['ArrowRight', 'KeyD']) : (slot === 0 ? ax(['KeyA'], ['KeyD']) : ax(['ArrowLeft'], ['ArrowRight']));
    var y = p1 ? ax(['ArrowUp', 'KeyW'], ['ArrowDown', 'KeyS']) : (slot === 0 ? ax(['KeyW'], ['KeyS']) : ax(['ArrowUp'], ['ArrowDown']));
    var jump = p1 ? held(['ArrowUp', 'KeyW', 'Space']) : (slot === 0 ? held(['KeyW', 'Space']) : held(['ArrowUp']));
    var down = p1 ? held(['ArrowDown', 'KeyS']) : (slot === 0 ? held(['KeyS']) : held(['ArrowDown']));
    var drop = p1 ? held(['Space', 'KeyE']) : (slot === 0 ? held(['KeyE']) : held(['Enter', 'NumpadEnter']));
    var brace = p1 ? held(['KeyF', 'ShiftLeft', 'ShiftRight']) : (slot === 0 ? held(['KeyF', 'ShiftLeft']) : held(['Slash']));
    var emote = p1 ? K.keys.pressed('KeyQ') : (slot === 0 ? K.keys.pressed('KeyQ') : K.keys.pressed('Period'));
    return { x: x, y: y, jump: jump, down: down, drop: drop, brace: brace, emote: emote };
  }
  function steerMouse(inp, actor) {
    if (!aim.on || !actor || inp.x) return;
    var dx = aim.x - (actor.x + actor.w / 2);
    if (Math.abs(dx) > 16) inp.x = dx > 0 ? 1 : -1;
    if (actor.mode === 'cloud') {
      var dy = aim.y - (actor.y + actor.h / 2);
      if (!inp.y && Math.abs(dy) > 16) inp.y = dy > 0 ? 1 : -1;
    }
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function bodySprite(color) {
    var c = sprites[color];
    if (c) return c;
    c = document.createElement('canvas');
    c.width = 64; c.height = 80;
    var g = c.getContext('2d');
    g.fillStyle = 'rgba(0,0,0,.18)';
    g.beginPath(); g.ellipse(32, 74, 14, 5, 0, 0, 7); g.fill();
    g.fillStyle = color;
    roundRect(g, 16, 28, 32, 36, 14);
    g.fill();
    g.beginPath(); g.arc(32, 22, 16, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,.35)';
    g.beginPath(); g.arc(26, 16, 5, 0, 7); g.fill();
    sprites[color] = c;
    return c;
  }
  function puff(g, x, y, rx, ry) {
    g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 7); g.fill();
  }
  function hill(g, x, y, r) {
    g.beginPath(); g.arc(x, y, r, Math.PI, 0); g.closePath(); g.fill();
  }
  function bakeIsland(island) {
    var g = bake.getContext('2d');
    var id = island.id;
    g.clearRect(0, 0, W, H);
    g.fillStyle = island.sky;
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#fffdf2';
    g.fillRect(0, 400, W, 320);
    g.fillStyle = island.sky;
    g.globalAlpha = 0.4;
    g.fillRect(0, 330, W, 100);
    g.globalAlpha = 1;
    g.fillStyle = id === 'snow' ? '#d5e6f0' : id === 'sky' ? '#b7a4ee' : id === 'candy' ? '#ffb3dd' : id === 'toy' ? '#c5d4f8' : '#b7e38a';
    hill(g, 160, 500, 160); hill(g, 480, 520, 200); hill(g, 860, 510, 180); hill(g, 1160, 530, 150);
    g.fillStyle = id === 'snow' ? '#fff' : '#ffe14a';
    g.beginPath(); g.arc(id === 'snow' ? 1100 : 150, 78, id === 'snow' ? 26 : 40, 0, 7); g.fill();
    if (id !== 'snow') {
      g.fillStyle = 'rgba(255,225,74,.28)';
      g.beginPath(); g.arc(150, 78, 62, 0, 7); g.fill();
    }
    g.fillStyle = '#fff';
    for (var i = 0; i < 5; i++) {
      var cx = 240 + i * 200, cy = 64 + (i % 3) * 26;
      puff(g, cx, cy, 44, 15); puff(g, cx + 28, cy + 6, 24, 11);
    }
    if (id === 'beach') {
      g.fillStyle = '#ff5d8f';
      g.beginPath(); g.arc(390, 575, 34, Math.PI, 0); g.fill();
      g.fillStyle = '#fff';
      g.fillRect(388, 530, 4, 52);
      g.fillStyle = '#e7c98a';
      g.beginPath(); g.ellipse(820, 600, 14, 7, 0.5, 0, 7); g.fill();
      g.beginPath(); g.ellipse(1180, 590, 10, 5, -0.4, 0, 7); g.fill();
    } else if (id === 'candy') {
      var sticks = [140, 340, 760, 1080];
      for (var c = 0; c < sticks.length; c++) {
        g.fillStyle = '#fff';
        g.fillRect(sticks[c], 470, 8, 120);
        g.fillStyle = c % 2 ? '#ff5d8f' : '#7cf29a';
        g.beginPath(); g.arc(sticks[c] + 4, 456, 22, 0, 7); g.fill();
        g.fillStyle = '#fff';
        g.fillRect(sticks[c] - 14, 450, 36, 6);
      }
      g.fillStyle = '#c77dff'; puff(g, 560, 575, 36, 26);
      g.fillStyle = '#ffe14a'; puff(g, 630, 595, 22, 16);
      g.fillStyle = '#fff'; puff(g, 500, 600, 16, 12);
    } else if (id === 'toy') {
      var cols = ['#ff5d8f', '#ffe14a', '#4cc9f0', '#7cf29a', '#c77dff'];
      for (var b = 0; b < 5; b++) {
        g.fillStyle = cols[b];
        g.fillRect(70 + b * 62, 548 - (b % 3) * 22, 46, 46);
      }
      g.strokeStyle = '#2b2148'; g.lineWidth = 6;
      g.fillStyle = '#ff8c42';
      g.beginPath(); g.arc(980, 530, 32, 0, 7); g.fill();
      g.beginPath(); g.arc(980, 530, 14, 0, 7); g.stroke();
      g.fillStyle = '#fff';
      g.fillRect(900, 488, 170, 8); g.fillRect(900, 512, 170, 8);
    } else if (id === 'snow') {
      g.fillStyle = '#fff';
      for (var s = 0; s < 26; s++) g.fillRect((s * 97) % 1240 + 16, 28 + (s % 5) * 34, 4, 4);
      function pine(x, y) {
        g.fillStyle = '#2f6b4f';
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + 26, y + 64); g.lineTo(x - 26, y + 64); g.fill();
        g.beginPath(); g.moveTo(x, y + 34); g.lineTo(x + 34, y + 96); g.lineTo(x - 34, y + 96); g.fill();
        g.fillStyle = '#6b4634'; g.fillRect(x - 4, y + 96, 8, 14);
      }
      pine(150, 470); pine(280, 500); pine(1040, 480);
      g.fillStyle = '#fff';
      g.beginPath(); g.arc(760, 568, 20, 0, 7); g.arc(760, 534, 13, 0, 7); g.fill();
      g.fillStyle = '#ff8c42'; g.fillRect(748, 528, 24, 4);
      g.fillStyle = '#2b2148'; g.fillRect(754, 528, 3, 3); g.fillRect(766, 528, 3, 3);
    } else {
      g.fillStyle = 'rgba(255,255,255,.88)';
      g.fillRect(60, 200, 130, 14); g.fillRect(86, 224, 78, 10);
      g.fillRect(980, 170, 160, 14); g.fillRect(1020, 194, 90, 10);
      g.fillRect(420, 520, 80, 10); g.fillRect(640, 470, 100, 10); g.fillRect(860, 545, 70, 10);
      g.fillStyle = '#ffe66d';
      for (var t = 0; t < 16; t++) g.fillRect(60 + (t * 83) % 1140, 30 + (t % 4) * 18, 4, 4);
    }
    bakedId = island.id;
  }

  function drawHat(a) {
    var hat = a.hat;
    if (!hat || hat === 'none') return;
    ctx.fillStyle = '#2b2148';
    if (hat === 'cap') { ctx.fillStyle = '#3d7dff'; ctx.fillRect(-12, -62, 24, 8); ctx.fillRect(-4, -70, 16, 10); }
    else if (hat === 'flower') {
      ctx.fillStyle = '#ff5d8f';
      for (var i = 0; i < 5; i++) { var ang = i * 1.25; ctx.beginPath(); ctx.arc(Math.cos(ang) * 7, -68 + Math.sin(ang) * 7, 4, 0, 7); ctx.fill(); }
      ctx.fillStyle = '#ffe14a'; ctx.beginPath(); ctx.arc(0, -68, 4, 0, 7); ctx.fill();
    } else if (hat === 'prop') {
      ctx.fillStyle = '#888'; ctx.fillRect(-2, -74, 4, 10);
      ctx.save(); ctx.translate(0, -76); ctx.rotate((a._t || 0) * 14);
      ctx.fillStyle = '#4cc9f0'; ctx.fillRect(-16, -3, 32, 6); ctx.restore();
    } else if (hat === 'cone') {
      ctx.fillStyle = '#ff8c42'; ctx.beginPath(); ctx.moveTo(-10, -58); ctx.lineTo(0, -80); ctx.lineTo(10, -58); ctx.fill();
    } else if (hat === 'star') {
      ctx.fillStyle = '#ffe14a'; ctx.beginPath();
      ctx.moveTo(0, -78); ctx.lineTo(4, -68); ctx.lineTo(14, -68); ctx.lineTo(6, -62); ctx.lineTo(9, -52); ctx.lineTo(0, -58); ctx.lineTo(-9, -52); ctx.lineTo(-6, -62); ctx.lineTo(-14, -68); ctx.lineTo(-4, -68); ctx.fill();
    } else if (hat === 'bucket') {
      ctx.fillStyle = '#c47b4a'; ctx.fillRect(-12, -74, 24, 16); ctx.fillRect(-14, -76, 28, 4);
    } else if (hat === 'crown') {
      ctx.fillStyle = '#ffe14a'; ctx.beginPath();
      ctx.moveTo(-12, -58); ctx.lineTo(-12, -74); ctx.lineTo(-4, -64); ctx.lineTo(0, -78); ctx.lineTo(4, -64); ctx.lineTo(12, -74); ctx.lineTo(12, -58); ctx.fill();
    }
  }
  function ovalLimb(x, y, ang, len, thick, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.fillStyle = color;
    ctx.strokeStyle = '#2b2148';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(0, len * 0.5, thick, len * 0.5, 0, 0, 7);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  function drawActor(a, w) {
    var idle = !a.plant && a.ground && a.mode === 'run' && Math.abs(a.vx) < 22;
    var bob = a.plant ? 0 : (a.ground && Math.abs(a.vx) > 30 ? Math.sin(w.time * 14 + a.id) * 3 : (idle ? Math.sin(w.time * 2.1 + a.id) * 2.5 : 0));
    ctx.save();
    ctx.translate(a.x + a.w / 2, a.y + a.h);
    if (a.face < 0) ctx.scale(-1, 1);
    if (idle) ctx.rotate(Math.sin(w.time * 1.5 + a.id) * 0.06);
    if (a.mode === 'bubble') {
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#d7f4ff';
      ctx.beginPath(); ctx.arc(0, -36, 28, 0, 7); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = a.color;
      ctx.beginPath(); ctx.arc(0, -36, 12, 0, 7); ctx.fill();
      face(0, -36, 1);
      ctx.restore();
      return;
    }
    if (a.mode === 'cloud') {
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.ellipse(0, -20, 26, 14, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(-16, -12, 14, 10, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(16, -12, 14, 10, 0, 0, 7); ctx.fill();
      face(0, -18, 1);
      if (a.cd <= 0) {
        ctx.fillStyle = '#ffe14a';
        ctx.beginPath(); ctx.ellipse(0, 2, 8, 4, 0.4, 0, 7); ctx.fill();
      }
      ctx.restore();
      return;
    }
    var sq = a.sq || 1;
    var sx = a.plant ? 1 : 0.9, sy = a.plant ? 1 : 1.1;
    if (sq > 1.02) { sx = sq; sy = 1 / sq; }
    else if (!a.ground && a.vy < -40) { sx = 0.76; sy = 1.34; }
    else if (!a.ground && a.vy > 220) { sx = 1.14; sy = 0.84; }
    else if (idle) { sy = 1 + Math.sin(w.time * 2.2 + a.id) * 0.04; sx = 1 / sy; }
    ctx.translate(0, bob);
    if (a.outfit === 'cape') {
      ctx.fillStyle = '#5b4b8a';
      ctx.beginPath(); ctx.moveTo(-8, -40); ctx.lineTo(-22, -8); ctx.lineTo(0, -16); ctx.fill();
    }
    ctx.scale(sx, sy);
    var img = bodySprite(a.color);
    ctx.drawImage(img, -32, -78, 64, 80);
    if (a.outfit === 'stripe') {
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      ctx.fillRect(-14, -42, 28, 4); ctx.fillRect(-14, -32, 28, 4);
    } else if (a.outfit === 'spot') {
      ctx.fillStyle = 'rgba(255,255,255,.7)';
      ctx.beginPath(); ctx.arc(-6, -36, 3, 0, 7); ctx.arc(7, -28, 3, 0, 7); ctx.fill();
    }
    face(0, -56, idle && Math.sin(w.time * 1.7 + a.id * 2) > 0.93);
    if (a.plant) {
      var wave = Math.sin(w.time * 7 + a.id) * 0.35;
      ovalLimb(-9, -16, 0.08, 18, 8, a.color);
      ovalLimb(9, -16, -0.08, 18, 8, a.color);
      ovalLimb(-15, -46, Math.PI + 0.5 + wave, 20, 7.2, a.color);
      ovalLimb(15, -46, Math.PI - 0.5 - wave, 20, 7.2, a.color);
    } else if (a.ground && (Math.abs(a.vx) > 20 || idle)) {
      ctx.fillStyle = '#2b2148';
      var swing = Math.sin(w.time * (idle ? 3 : 16) + a.id) * (idle ? 2 : 4);
      ctx.fillRect(-10, -8, 6, 8 + swing);
      ctx.fillRect(4, -8, 6, 8 - swing);
    }
    a._t = w.time;
    drawHat(a);
    ctx.scale(1 / sx, 1 / sy);
    if (a.emoteT > 0) {
      ctx.strokeStyle = '#2b2148'; ctx.lineWidth = 3;
      ctx.beginPath();
      if (a.emote === 'dance') { ctx.arc(0, -30, 18, 0, Math.sin(w.time * 10) > 0 ? 3 : 1); }
      else { ctx.moveTo(16, -40); ctx.lineTo(26, -56); }
      ctx.stroke();
    }
    ctx.restore();
  }
  function face(x, y, blink) {
    ctx.fillStyle = '#2b2148';
    if (blink === true) {
      ctx.strokeStyle = '#2b2148'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 8, y - 2); ctx.lineTo(x - 2, y - 2);
      ctx.moveTo(x + 2, y - 2); ctx.lineTo(x + 8, y - 2);
      ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(x - 5, y - 2, 2.2, 0, 7); ctx.arc(x + 5, y - 2, 2.2, 0, 7); ctx.fill();
    }
    ctx.strokeStyle = '#2b2148'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y + 2, 4, 0.2, Math.PI - 0.2); ctx.stroke();
  }
  function drawPlats(w) {
    var island = w.island;
    for (var i = 0; i < w.plats.length; i++) {
      var p = w.plats[i];
      if (p.gone) continue;
      var x = p.x + (p.ox || 0);
      if (p.solid && p.h > 40) {
        ctx.fillStyle = island.id === 'candy' ? '#fff' : '#fff7ea';
        ctx.fillRect(x, p.y, p.w, p.h);
        ctx.fillStyle = island.accent;
        ctx.fillRect(x, p.y, p.w, 10);
        ctx.fillStyle = '#9fd7ff';
        ctx.fillRect(x + 16, p.y + 28, 18, 16);
        ctx.fillRect(x + p.w - 36, p.y + 28, 18, 16);
        ctx.fillStyle = '#2b2148';
        ctx.fillRect(x + p.w * 0.5 - 9, p.y + p.h - 34, 18, 34);
        ctx.fillStyle = '#ffe14a';
        ctx.fillRect(x + p.w * 0.5 + 2, p.y + p.h - 20, 4, 4);
      } else {
        ctx.fillStyle = p.ground ? island.ground : '#fff';
        ctx.fillRect(x, p.y, p.w, Math.min(p.h, p.ground ? 28 : p.h));
        ctx.fillStyle = p.spine ? '#7cf29a' : island.accent;
        ctx.fillRect(x, p.y, p.w, 6);
        if (p.ground) {
          ctx.fillStyle = island.id === 'snow' || island.id === 'candy' ? '#fff' : island.id === 'sky' ? '#ffe66d' : '#2f6b4f';
          for (var gx = x + 14; gx < x + p.w - 8; gx += 46) {
            ctx.beginPath();
            ctx.moveTo(gx, p.y + 6);
            ctx.lineTo(gx + 4, p.y - 8);
            ctx.lineTo(gx + 8, p.y + 6);
            ctx.fill();
          }
        }
      }
    }
  }
  function drawItems(w) {
    for (var i = 0; i < w.items.length; i++) {
      var it = w.items[i];
      ctx.save();
      ctx.translate(it.x, it.y);
      if (it.k === 'peel') {
        ctx.fillStyle = '#ffe14a';
        ctx.beginPath(); ctx.ellipse(0, 0, 12, 6, 0.6, 0, 7); ctx.fill();
        ctx.fillStyle = '#f0c43a';
        ctx.beginPath(); ctx.ellipse(-6, 2, 5, 3, -0.8, 0, 7); ctx.fill();
      } else {
        ctx.fillStyle = '#7cf29a';
        ctx.beginPath(); ctx.ellipse(0, 0, 16, 7, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillRect(-4, -2, 8, 3);
      }
      ctx.restore();
    }
  }
  function drawMarker(a, w) {
    if (a.bot) return;
    var y = a.y - 14 + Math.sin(w.time * 8 + a.id) * 4;
    ctx.fillStyle = a.slot === 0 ? '#ffe14a' : '#7cf29a';
    ctx.beginPath();
    ctx.moveTo(a.x + a.w / 2, y);
    ctx.lineTo(a.x + a.w / 2 - 8, y - 14);
    ctx.lineTo(a.x + a.w / 2 + 8, y - 14);
    ctx.fill();
  }
  function chevron(x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x, y - s);
    ctx.lineTo(x + s * 0.75, y);
    ctx.lineTo(x, y - s * 0.32);
    ctx.lineTo(x - s * 0.75, y);
    ctx.closePath();
    ctx.fill();
  }
  function upArrow(s) {
    ctx.beginPath();
    ctx.moveTo(0, -22 * s);
    ctx.lineTo(16 * s, -2 * s);
    ctx.lineTo(7 * s, -2 * s);
    ctx.lineTo(7 * s, 16 * s);
    ctx.lineTo(-7 * s, 16 * s);
    ctx.lineTo(-7 * s, -2 * s);
    ctx.lineTo(-16 * s, -2 * s);
    ctx.closePath();
  }
  function spineSteps(w) {
    var steps = [];
    for (var i = 0; i < w.plats.length; i++) {
      var p = w.plats[i];
      if (p.spine && !p.solid && !p.gone) steps.push(p);
    }
    steps.sort(function (a, b) { return b.y - a.y; });
    return steps.length > 1 ? steps : null;
  }
  function laneX(steps, p) {
    var lane = steps[steps.length - 1].x + 72;
    return Math.max(p.x + 36, Math.min(p.x + p.w - 36, lane));
  }
  function climbAt(steps, u) {
    var seg = Math.max(0, Math.min(steps.length - 1.001, u * (steps.length - 1)));
    var i0 = Math.floor(seg);
    var f = seg - i0;
    var e = f * f * (3 - 2 * f);
    var a = steps[i0], b = steps[i0 + 1];
    return {
      x: laneX(steps, a) + (laneX(steps, b) - laneX(steps, a)) * e,
      y: a.y + (b.y - a.y) * e,
      hop: Math.sin(f * Math.PI) * 36
    };
  }
  function drawHint(w) {
    if (w.attract || w.round !== 0 || w.phase !== 'inter') return;
    var steps = spineSteps(w);
    if (!steps) return;
    var elapsed = (8 * 60 - w.frames) / 60;
    var ghostU = elapsed < 0.4 ? -1 : Math.min(1, (elapsed - 0.4) / 2.15);
    var arrowU = elapsed < 2.55 ? -1 : Math.min(1, (elapsed - 2.55) / 3.4);
    var arrowFade = elapsed > 6.2 ? Math.max(0, 1 - (elapsed - 6.2) / 1) : (arrowU < 0 ? 0 : 1);
    if (ghostU < 0 && arrowFade <= 0) return;
    ctx.save();
    for (var s = 0; s < steps.length; s++) {
      var along = Math.max(ghostU, arrowU);
      var lit = along * (steps.length - 1) + 0.15 >= s;
      ctx.globalAlpha = lit ? 1 : 0.8;
      ctx.fillStyle = lit ? '#ffe14a' : 'rgba(255,255,255,.7)';
      chevron(laneX(steps, steps[s]), steps[s].y - 18, lit ? 14 : 10);
    }
    if (ghostU >= 0 && ghostU < 1.02 && elapsed < 2.85) {
      var gpos = climbAt(steps, Math.min(1, ghostU));
      var gfade = elapsed > 2.45 ? Math.max(0, 1 - (elapsed - 2.45) / 0.4) : 1;
      ctx.save();
      ctx.globalAlpha = 0.62 * gfade;
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      ctx.beginPath();
      ctx.ellipse(gpos.x, gpos.y - 30 - gpos.hop, 20, 28, 0, 0, 7);
      ctx.fill();
      drawActor({
        x: gpos.x - 16, y: gpos.y - 48 - gpos.hop, w: 32, h: 48, face: 1, id: 2,
        color: save.color, hat: save.hat, outfit: save.outfit,
        mode: 'run', ground: true, vx: 80, vy: 0, sq: 1, emote: '', emoteT: 0, bot: true
      }, w);
      ctx.restore();
    }
    if (arrowFade > 0) {
      var apos = climbAt(steps, Math.max(0, arrowU));
      ctx.globalAlpha = arrowFade;
      ctx.translate(apos.x, apos.y - 50 + Math.sin(w.time * 10) * 3);
      ctx.fillStyle = '#2b2148';
      upArrow(1.18);
      ctx.fill();
      ctx.fillStyle = '#ffe14a';
      upArrow(1);
      ctx.fill();
    }
    ctx.restore();
  }
  function drawTitleKid(w) {
    if (mode !== 'title') return;
    var kid = {
      x: 148, y: 592, w: 32, h: 48, face: 1, id: 1, slot: 0, bot: false,
      color: save.color, hat: save.hat, outfit: save.outfit,
      mode: 'run', ground: true, vx: 0, vy: 0, sq: 1, emote: '', emoteT: 0
    };
    drawActor(kid, w);
    drawMarker(kid, w);
  }
  function drawHud(w) {
    ctx.direction = 'rtl';
    ctx.textBaseline = 'top';
    var sec = Math.max(0, Math.ceil(w.frames / 60));
    var showClock = w.phase === 'danger' || w.phase === 'stamp';
    ctx.textAlign = 'center';
    ctx.strokeStyle = '#2b2148';
    if (showClock) {
      var hot = w.phase === 'danger' && sec <= 10;
      ctx.font = '700 ' + (hot ? 54 : 40) + 'px Fredoka';
      ctx.fillStyle = hot ? (Math.sin(w.time * 10) > 0 ? '#e23b2f' : '#fff') : '#fff';
      ctx.lineWidth = 6;
      var label = w.phase === 'stamp' ? 'نجا!' : String(sec);
      ctx.strokeText(label, W / 2, 12);
      ctx.fillText(label, W / 2, 12);
    }
    ctx.font = '700 22px Fredoka';
    ctx.fillStyle = '#fff';
    ctx.lineWidth = 6;
    var line = hudRound(w);
    var lineY = showClock ? 62 : 16;
    ctx.strokeText(line, W / 2, lineY);
    ctx.fillText(line, W / 2, lineY);
    var list = w.actors, n = list.length, gap = 54;
    var x0 = (W - n * gap) / 2;
    for (var i = 0; i < n; i++) {
      var a = list[i];
      var x = x0 + i * gap + 22;
      ctx.fillStyle = a.color;
      ctx.beginPath(); ctx.arc(x, 688, 16, 0, 7); ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = a.bot ? '#2b2148' : '#ffe14a';
      ctx.stroke();
      if (w.phase === 'stamp' || w.phase === 'podium') {
        ctx.font = '700 18px Fredoka';
        ctx.textAlign = 'center';
        ctx.fillStyle = a.mode === 'run' ? '#146b32' : '#e23b2f';
        ctx.fillText(a.mode === 'run' ? '✓' : '×', x, 678);
      }
    }
  }
  var WASH = {
    jelly: '#ff4fa3', meteor: '#ff8cbf', tornado: '#f4d35e', sauce: '#e23b2f',
    bowl: '#8b6bb8', quake: '#c47b4a', gum: '#ff7ad9', snow: '#9fd4ee',
    beach: '#ffe14a', ice: '#7ec8ff', spark: '#ffe66d', stomp: '#c5cedb'
  };
  function drawWaves(w) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.8)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    for (var row = 0; row < 2; row++) {
      ctx.beginPath();
      var y0 = 650 + row * 10;
      for (var x = 0; x <= W; x += 18) {
        var y = y0 + Math.sin(w.time * 1.8 + x * 0.045 + row * 2) * (4 + row * 2);
        if (x) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
  function drawPalm(x, base, t, leaf) {
    ctx.save();
    ctx.translate(x, base);
    ctx.rotate(Math.sin(t) * 0.1);
    ctx.fillStyle = '#8a5a32';
    ctx.fillRect(-6, -78, 12, 82);
    ctx.fillStyle = leaf;
    for (var i = 0; i < 4; i++) {
      ctx.save();
      ctx.translate(0, -78);
      ctx.rotate(-1.15 + i * 0.78 + Math.sin(t + i) * 0.1);
      ctx.beginPath();
      ctx.ellipse(20, 0, 26, 7, 0, 0, 7);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = '#c46a2b';
    ctx.beginPath(); ctx.arc(0, -80, 6, 0, 7); ctx.fill();
    ctx.restore();
  }
  function drawGulls(w) {
    for (var i = 0; i < 2; i++) {
      var x = ((w.time * 40 + i * 540) % (W + 180)) - 90;
      var y = 158 + i * 34 + Math.sin(w.time * 1.2 + i) * 8;
      var flap = Math.sin(w.time * 8 + i * 2) * 7;
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.ellipse(0, 0, 13, 5, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(-7, -1, 5, 4, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#ffe14a';
      ctx.beginPath(); ctx.moveTo(-12, -1); ctx.lineTo(-18, 1); ctx.lineTo(-12, 3); ctx.fill();
      ctx.strokeStyle = '#c5d4e0';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-1, -1); ctx.quadraticCurveTo(-14, -12 - flap, -24, 2);
      ctx.moveTo(1, -1); ctx.quadraticCurveTo(14, -12 - flap, 24, 2);
      ctx.stroke();
      ctx.restore();
    }
  }
  function drawAlert(w) {
    if (!w.dis || !w.dis.length) return;
    var danger = w.phase === 'danger';
    if (!danger && !w.warn) return;
    var col = WASH[w.dis[0].id] || '#ff5d8f';
    var hot = w.warn || Math.ceil(w.frames / 60) <= 10;
    ctx.save();
    ctx.globalAlpha = hot && Math.sin(w.time * 8) > 0 ? 0.7 : 0.4;
    ctx.fillStyle = col;
    ctx.fillRect(0, 0, W, 12);
    ctx.fillRect(0, H - 12, W, 12);
    ctx.fillRect(0, 0, 12, H);
    ctx.fillRect(W - 12, 0, 12, H);
    ctx.restore();
    if (!danger || !$('siren').hidden) return;
    var name = w.dis[0].name + (w.dis[1] ? ' + ' + w.dis[1].name : '');
    ctx.save();
    ctx.direction = 'rtl';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 28px Fredoka';
    var tw = Math.min(820, ctx.measureText(name).width + 56);
    var left = (W - tw) / 2;
    ctx.fillStyle = '#2b2148';
    ctx.fillRect(left, 100, tw, 46);
    ctx.fillStyle = col;
    ctx.fillRect(left + 6, 106, tw - 12, 34);
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#2b2148';
    ctx.strokeText(name, W / 2, 124);
    ctx.fillStyle = '#fff';
    ctx.fillText(name, W / 2, 124);
    ctx.restore();
  }
  function drawWorld(w) {
    if (!w) return;
    if (bakedId !== w.island.id) bakeIsland(w.island);
    ctx.save();
    ctx.translate(shake.x, shake.y);
    ctx.drawImage(bake, 0, 0);
    var leaf = w.island.id === 'candy' ? '#ff5d8f' : w.island.id === 'snow' ? '#2f6b4f' : w.island.id === 'toy' ? '#7cf29a' : '#3d8c4a';
    drawPalm(250, 640, w.time, leaf);
    drawPalm(1040, 650, w.time + 1.4, leaf);
    drawGulls(w);
    drawPlats(w);
    drawWaves(w);
    CI.drawDisasters(ctx, w);
    drawItems(w);
    for (var i = 0; i < w.actors.length; i++) drawActor(w.actors[i], w);
    drawTitleKid(w);
    drawHint(w);
    for (var m = 0; m < w.actors.length; m++) drawMarker(w.actors[m], w);
    fx.draw(ctx);
    ctx.restore();
    if (w !== attract) { drawAlert(w); drawHud(w); }
    ctx.direction = 'rtl';
    ctx.textAlign = 'center';
    ctx.font = '700 28px Fredoka';
    for (var f = 0; f < floaters.length; f++) {
      var t = floaters[f];
      ctx.globalAlpha = Math.max(0, t.life);
      ctx.strokeStyle = '#2b2148';
      ctx.lineWidth = 5;
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }
  function render() {
    if (mode === 'pause' && !sceneDirty) return;
    sceneDirty = false;
    var w = (mode === 'play' || mode === 'pause' || mode === 'result') ? world : attract;
    ctx.direction = 'rtl';
    drawWorld(w);
    if (mode === 'result') paintPortraits();
  }

  function landJuice(w) {
    var hs = humansOf(w);
    for (var i = 0; i < hs.length; i++) {
      var a = hs[i];
      var g = a.mode === 'run' ? a.ground : null;
      if (g && !a._wasG) {
        S.land();
        burst(a.x + a.w / 2, a.y + a.h, { count: 5, color: '#f6d38a', speed: 80, life: 0.25, size: 4, gravity: 200 });
      }
      a._wasG = g;
    }
  }
  function update(dt) {
    if (mode === 'pause') { K.keys.endFrame(); return; }
    if (cardT > 0) { cardT -= dt; if (cardT <= 0) $('siren').hidden = true; }
    if (boomT > 0) boomT -= dt;
    for (var i = floaters.length - 1; i >= 0; i--) {
      floaters[i].life -= dt; floaters[i].y -= 36 * dt;
      if (floaters[i].life <= 0) floaters.splice(i, 1);
    }
    var playing = mode === 'play' || mode === 'result';
    var w = playing ? world : attract;
    if (hitT > 0 && mode === 'play') {
      hitT -= dt;
      fx.update(dt);
      shake.update(dt);
      K.keys.endFrame();
      return;
    }
    if (playing && world && mode === 'play') {
      var players = world.players;
      var ins = [readSlot(0, players), readSlot(1, players)];
      var hs = humansOf(world);
      if (hs[0]) steerMouse(ins[0], hs[0]);
      CI.setInput(world, 0, ins[0]);
      CI.setInput(world, 1, ins[1]);
    }
    if (w) {
      var before = w.phase;
      CI.step(w, dt);
      if (playing) {
        eat(w);
        landJuice(w);
        if (before !== 'podium' && w.phase === 'podium') openResult();
      } else {
        w.ev.length = 0;
        if (w.phase === 'stamp' || w.phase === 'podium') makeAttract();
      }
    }
    fx.update(dt);
    shake.update(dt);
    if (mode === 'result') podiumT += dt;
    paintCount(mode === 'play' ? world : null);
    if (mode === 'play') paintCoins();
    K.keys.endFrame();
  }

  function paintTitle() {
    $('t-coins').textContent = String(save.coins);
    $('t-streak').textContent = 'سلسلة: ' + save.bestStreak;
    $('t-surv').textContent = 'نجاة: ' + save.survivals + '/20';
  }
  function chip(label, on, fn) {
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    if (on) b.className = 'on';
    b.addEventListener('click', function () { S.click(); fn(); });
    return b;
  }
  function renderSetup() {
    var box = $('setupOpts');
    box.innerHTML = '';
    var row = document.createElement('div');
    row.className = 'opts';
    for (var n = 0; n <= 6; n++) {
      (function (k) {
        row.appendChild(chip('روبوتات ' + k, save.settings.bots === k, function () {
          save.settings.bots = k; persist(); renderSetup();
        }));
      })(n);
    }
    box.appendChild(row);
    var row2 = document.createElement('div');
    row2.className = 'opts';
    row2.appendChild(chip(save.settings.coop ? 'تعاون: يعمل' : 'تعاون: متوقف', save.settings.coop, function () {
      save.settings.coop = !save.settings.coop; persist(); renderSetup();
    }));
    row2.appendChild(chip(save.settings.perks2p ? 'ميزات المتجر: تعمل' : 'ميزات المتجر: متوقفة', save.settings.perks2p, function () {
      save.settings.perks2p = !save.settings.perks2p; persist(); renderSetup();
    }));
    if (save.survivals >= 20) {
      row2.appendChild(chip(save.settings.hard ? 'صعب: يعمل' : 'صعب: متوقف', save.settings.hard, function () {
        save.settings.hard = !save.settings.hard; persist(); renderSetup();
      }));
    }
    box.appendChild(row2);
    var row3 = document.createElement('div');
    row3.className = 'opts';
    CI.ISLANDS.forEach(function (island) {
      var open = save.islands.indexOf(island.id) !== -1;
      row3.appendChild(chip(island.name + (open ? '' : ' 🔒'), save.settings.island === island.id, function () {
        if (!open) { S.nope(); return; }
        save.settings.island = island.id; persist(); renderSetup();
      }));
    });
    var daily = CI.daily(todayNum());
    var dIsland = CI.ISLANDS.filter(function (n) { return n.id === daily.island; })[0];
    row3.appendChild(chip('جزيرة اليوم: ' + dIsland.name, false, function () {
      beginMatch({ players: 2, island: daily.island, daily: true });
    }));
    box.appendChild(row3);
  }
  function shopBtn(label, owned, price, fn) {
    var card = document.createElement('div');
    card.className = 'item';
    var b = document.createElement('b');
    b.textContent = label;
    card.appendChild(b);
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'buy';
    btn.textContent = owned ? 'البس' : (price ? price + ' عملة' : 'مجاني');
    btn.disabled = !owned && price > save.coins;
    btn.addEventListener('click', fn);
    card.appendChild(btn);
    return card;
  }
  function renderShop() {
    $('shop-coins').textContent = 'عملاتك: ' + save.coins;
    var grid = $('shopGrid');
    grid.innerHTML = '';
    grid.appendChild(shopBtn('بدون قبعة', true, 0, function () { save.hat = 'none'; persist(); S.click(); renderShop(); }));
    CI.HATS.forEach(function (id) {
      var owned = ownsList(save.hats, id);
      grid.appendChild(shopBtn(HAT_NAME[id], owned, 20, function () {
        if (!owned) {
          if (save.coins < 20) { S.nope(); return; }
          save.coins -= 20; save.hats.push(id);
        }
        save.hat = id; persist(); S.coin(); renderShop(); paintTitle();
      }));
    });
    CI.COLORS.forEach(function (c, idx) {
      var owned = ownsList(save.colors, c);
      var card = shopBtn('لون ' + (idx + 1), owned, owned ? 0 : 25, function () {
        if (!owned) {
          if (save.coins < 25) { S.nope(); return; }
          save.coins -= 25; save.colors.push(c);
        }
        save.color = c; persist(); S.coin(); renderShop(); paintTitle();
      });
      card.style.background = c;
      grid.appendChild(card);
    });
    OUTFITS.forEach(function (o) {
      var owned = ownsList(save.outfits, o.id);
      grid.appendChild(shopBtn(o.name, owned, owned ? 0 : o.price, function () {
        if (!owned && o.price) {
          if (save.coins < o.price) { S.nope(); return; }
          save.coins -= o.price; save.outfits.push(o.id);
        }
        save.outfit = o.id; persist(); S.click(); renderShop(); paintTitle();
      }));
    });
    EMOTES.forEach(function (o) {
      var owned = ownsList(save.emotes, o.id);
      grid.appendChild(shopBtn(o.name, owned, owned ? 0 : o.price, function () {
        if (!owned && o.price) {
          if (save.coins < o.price) { S.nope(); return; }
          save.coins -= o.price; save.emotes.push(o.id);
        }
        save.emote = o.id; persist(); S.click(); renderShop(); paintTitle();
      }));
    });
    CI.ISLANDS.forEach(function (island) {
      if (island.id === 'beach') return;
      var owned = save.islands.indexOf(island.id) !== -1;
      var price = ISLAND_PRICE[island.id];
      grid.appendChild(shopBtn(island.name, owned, owned ? 0 : price, function () {
        if (!owned) {
          if (save.coins < price) { S.nope(); return; }
          save.coins -= price; save.islands.push(island.id);
        }
        save.settings.island = island.id; persist(); S.coin(); renderShop();
      }));
    });
    PERKS.forEach(function (p) {
      var owned = !!save.perks[p.id];
      grid.appendChild(shopBtn(p.name, owned, owned ? 0 : p.price, function () {
        if (owned) { S.click(); return; }
        if (save.coins < p.price) { S.nope(); return; }
        save.coins -= p.price; save.perks[p.id] = true; persist(); S.coin(); renderShop(); paintTitle();
      }));
    });
  }
  function renderBook() {
    var grid = $('bookGrid');
    grid.innerHTML = '';
    CI.DISASTERS.forEach(function (d) {
      var rank = save.book[d.id] || 0;
      var card = document.createElement('div');
      card.className = 'dcard' + (rank ? '' : ' lock') + (rank === 2 ? ' gold' : '');
      var b = document.createElement('b');
      b.textContent = rank ? d.name : '؟؟؟';
      card.appendChild(b);
      var tip = document.createElement('div');
      tip.textContent = rank ? d.tip : 'انجح مرة لتفتحها';
      card.appendChild(tip);
      grid.appendChild(card);
    });
  }
  function shower() {
    var box = $('confetti');
    if (!box.childElementCount) {
      var colors = ['#ffe14a', '#ff5d8f', '#7cf29a', '#4cc9f0', '#fff', '#c77dff'];
      for (var i = 0; i < 28; i++) {
        var bit = document.createElement('i');
        bit.style.left = (i * 37 % 100) + '%';
        bit.style.background = colors[i % colors.length];
        bit.style.animationDelay = ((i % 7) * 0.16) + 's';
        bit.style.animationDuration = (1.35 + (i % 5) * 0.16) + 's';
        box.appendChild(bit);
      }
    }
    box.hidden = false;
  }
  var portraits = [];
  var podiumT = 0;
  function affordNudge() {
    var hat = CI.HATS.some(function (id) { return save.hats.indexOf(id) < 0; });
    if (hat && save.coins >= 20) return 'قبعة جديدة!';
    var color = CI.COLORS.some(function (c) { return save.colors.indexOf(c) < 0; });
    if (color && save.coins >= 25) return 'لون جديد!';
    return '';
  }
  function paintPortraits() {
    for (var i = 0; i < portraits.length; i++) {
      var slot = portraits[i];
      var g = slot.g;
      var a = slot.actor;
      g.clearRect(0, 0, 130, 168);
      g.save();
      g.translate(65, 162);
      g.scale(1.32, 1.32);
      var prev = ctx;
      ctx = g;
      drawActor({
        x: -16, y: -48, w: 32, h: 48, face: 1, id: a.id,
        color: a.color, hat: a.hat, outfit: a.outfit,
        mode: 'run', ground: true, vx: 0, vy: 0, sq: 1, plant: true,
        emote: '', emoteT: 0
      }, { time: podiumT + a.id });
      ctx = prev;
      g.restore();
    }
  }
  function paintResult(record) {
    $('banner').hidden = !record;
    var hs = humansOf(world);
    var you = hs[0];
    $('r-title').textContent = you && you.rounds >= 3 ? 'نجوت!' : 'انتهت الجولات';
    var nudge = affordNudge();
    $('r-nudge').hidden = !nudge;
    if (nudge) $('r-nudge').textContent = nudge;
    var rank = world.actors.slice().sort(function (a, b) { return (b.rounds - a.rounds) || (b.coins - a.coins); });
    var slots = [];
    if (rank[1]) slots.push({ a: rank[1], place: 2, cls: 'p2' });
    if (rank[0]) slots.push({ a: rank[0], place: 1, cls: 'p1' });
    if (rank[2]) slots.push({ a: rank[2], place: 3, cls: 'p3' });
    var pod = $('podium');
    pod.innerHTML = '';
    portraits = [];
    podiumT = 0;
    for (var i = 0; i < slots.length; i++) {
      var slot = slots[i];
      var a = slot.a;
      var d = document.createElement('div');
      d.className = 'pod ' + slot.cls;
      var canvas = document.createElement('canvas');
      canvas.width = 130;
      canvas.height = 168;
      d.appendChild(canvas);
      var step = document.createElement('div');
      step.className = 'step';
      var place = document.createElement('strong');
      place.textContent = String(slot.place);
      var name = document.createElement('span');
      name.textContent = a.name;
      var score = document.createElement('b');
      score.textContent = a.rounds + '/5';
      step.appendChild(place);
      step.appendChild(name);
      step.appendChild(score);
      d.appendChild(step);
      pod.appendChild(d);
      portraits.push({ g: canvas.getContext('2d'), actor: a, place: slot.place });
    }
    var bits = [];
    if (world.titles) world.titles.forEach(function (t) {
      var a = world.actors[t.id];
      if (a) bits.push(a.name + ': ' + t.title);
    });
    $('r-titles').textContent = bits.join(' · ');
  }

  $('btnPlay').addEventListener('click', function () { beginMatch({ players: 1 }); });
  $('btnTwo').addEventListener('click', function () { setMode('setup'); S.click(); });
  $('btnStart').addEventListener('click', function () { beginMatch({ players: 2 }); });
  $('btnSetupBack').addEventListener('click', function () { setMode('title'); });
  $('btnShop').addEventListener('click', function () { setMode('shop'); S.click(); });
  $('btnShopBack').addEventListener('click', function () { setMode('title'); });
  $('btnBook').addEventListener('click', function () { setMode('book'); S.click(); });
  $('btnBookBack').addEventListener('click', function () { setMode('title'); });
  $('btnPause').addEventListener('click', pause);
  $('btnResume').addEventListener('click', resume);
  $('btnRestart').addEventListener('click', restart);
  $('btnAgain').addEventListener('click', restart);
  $('btnMenu').addEventListener('click', toMenu);
  $('btnResultMenu').addEventListener('click', toMenu);
  $('r-nudge').addEventListener('click', function () { S.click(); setMode('shop'); });

  window.addEventListener('keydown', function (e) {
    if (!K.isGameKeyEvent(e) || e.repeat) return;
    if (e.code === 'Escape' && (mode === 'setup' || mode === 'shop' || mode === 'book')) { setMode('title'); return; }
    if (e.code === 'KeyP' || e.code === 'Escape') {
      if (mode === 'play') pause();
      else if (mode === 'pause') resume();
      return;
    }
    if (e.code === 'KeyR' && (mode === 'play' || mode === 'pause' || mode === 'result')) { restart(); return; }
    if ((e.code === 'Enter' || e.code === 'Space') && mode === 'title') beginMatch({ players: 1 });
    else if ((e.code === 'Enter' || e.code === 'Space') && mode === 'result') restart();
  });
  cv.addEventListener('pointerdown', function (e) {
    if (e.button !== 0 || mode !== 'play') return;
    var l = view.toLogical(e.clientX, e.clientY);
    aim.on = true; aim.x = l.x; aim.y = l.y;
  });
  cv.addEventListener('pointermove', function (e) {
    if (!aim.on) return;
    var l = view.toLogical(e.clientX, e.clientY);
    aim.x = l.x; aim.y = l.y;
  });
  window.addEventListener('pointerup', function () { aim.on = false; });

  K.muteButton();
  K.lifecycle({
    pause: function () { if (mode === 'play') pause(); },
    reset: function () { aim.on = false; }
  });
  paintTitle();
  setMode('title');

  window.__game = {
    get mode() { return mode; },
    state: function () {
      var live = mode === 'play' || mode === 'pause' || mode === 'result';
      return { screen: mode, phase: live && world ? world.phase : 'title', paused: mode === 'pause' };
    },
    get player() { return human(0); },
    get world() { return world; },
    get save() { return save; },
    get matches() { return matches; },
    inputs: function () { return [readSlot(0, world ? world.players : 1), readSlot(1, world ? world.players : 1)]; },
    tick: function (n, draw) {
      for (var i = 0; i < (n || 1); i++) update(1 / 60);
      if (draw !== false) render();
    },
    hudLine: function () { return world ? hudRound(world) : ''; },
    persist: persist
  };
  K.loop(update, render);
  K.ready();
})();
