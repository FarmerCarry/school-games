/* Arabic HUD, saves and rounds. The engine never calls Kit.stats. */
(function () {
  'use strict';
  var KR = window.KeyRunner;
  function el(id) { return document.getElementById(id); }
  var store = Kit.store('key-runner');
  var save = KR.normalizeSave(store.get('save', null));
  var saveStatus = Kit.saveStatus({ retry: persist });
  var mode = 'title';
  var duo = false;
  var roundId = '';
  var dirty = true;
  var contextLost = false;
  var eng, view, loop, fit;
  var milestone = Math.floor(save.speed / 25);
  var toastUntil = 0;
  var bannerUntil = 0;
  var prevKey = {};
  var shake = 0;
  var fovKick = 0;
  var shownSpeed = -1;
  var floatTimer = 0;
  var rank = { '': 0, bronze: 1, silver: 2, gold: 3 };
  var activity = 'plaza';

  function persist() {
    save.best = Math.max(save.best || 0, save.speed || 0);
    if (store.set('save', save)) saveStatus.saved();
    else saveStatus.failed();
  }
  function paintMenus() {
    el('menu-speed').textContent = String(Math.round(save.speed));
    el('menu-wins').textContent = String(Math.round(save.wins));
    el('menu-progress').textContent = save.unlocked > 1
      ? ('عوالم مفتوحة: ' + save.unlocked + (save.rebirths ? ' · إعادات ' + save.rebirths : ''))
      : 'عالم واحد مفتوح';
    el('quality').textContent = save.quality === 'low' ? 'الرسوم: خفيفة' : 'الرسوم: كاملة';
    el('quality').setAttribute('aria-pressed', String(save.quality === 'low'));
    el('wins').textContent = String(Math.round(save.wins));
    if (el('shop-wins')) el('shop-wins').textContent = String(Math.round(save.wins));
  }
  function toast(text) {
    el('toast').hidden = false;
    el('toast').textContent = text;
    toastUntil = performance.now() + 2200;
  }
  function banner(text) {
    el('banner').hidden = false;
    el('banner').textContent = text;
    bannerUntil = performance.now() + 1600;
  }
  function floater(text) {
    var node = el('floater');
    node.hidden = false;
    node.textContent = text;
    node.classList.remove('up');
    void node.offsetWidth;
    node.classList.add('up');
    clearTimeout(floatTimer);
    floatTimer = setTimeout(function () { node.hidden = true; }, 650);
  }
  function screens() {
    el('title-screen').hidden = mode !== 'title';
    el('duo-screen').hidden = mode !== 'duo';
    el('shop-screen').hidden = mode !== 'shop';
    el('pause-screen').hidden = mode !== 'paused';
    el('result-screen').hidden = mode !== 'result';
    el('hud').hidden = mode === 'title' || mode === 'duo';
    el('pause-button').hidden = mode !== 'play';
    el('quality').hidden = mode === 'play';
    document.body.dataset.mode = mode;
    document.body.dataset.duo = duo && mode === 'play' ? '1' : '0';
    el('speed2').hidden = !(duo && mode === 'play');
  }
  function endRound(result, score) {
    if (!roundId) return;
    Kit.stats.end(result, score);
    roundId = '';
  }
  function beginRound(id) {
    if (roundId) endRound('end', Math.round(duo ? 0 : save.speed));
    roundId = id;
    Kit.stats.round(id);
  }
  function focusGame() {
    var node = document.activeElement;
    if (node && node.blur) node.blur();
    el('scene').focus({ preventScroll: true });
  }
  function runOpts(next) {
    return Object.assign({
      speed: save.speed, shoe: save.shoe, rebirths: save.rebirths, charm: !!save.charm, players: 1
    }, next || {});
  }
  function go(nextMode, opts, round) {
    duo = nextMode === 'race';
    activity = nextMode;
    eng.reset(runOpts(Object.assign({ mode: nextMode === 'race' ? 'race' : nextMode }, opts || {})));
    mode = 'play';
    dirty = true;
    if (round) beginRound(round);
    screens();
    paintMenus();
    focusGame();
  }
  function startPlaza() {
    go('plaza', { mode: 'plaza', speed: save.speed }, 'plaza');
    persist();
  }
  function canEnter(world) {
    var gate = KR.worlds()[world];
    if (world >= save.unlocked) return 'هذا العالم يفتح بعد الذي قبله';
    if (save.rebirths < gate.rebirth) return 'تحتاج ' + gate.rebirth + ' إعادة انطلاق';
    if (gate.charm && !save.owned.charm) return 'اشترِ حذاء القفز من المتجر أولًا';
    return '';
  }
  function enterWorld(world) {
    var why = canEnter(world);
    if (why) {
      toast(why);
      var pl = eng.state.players[0];
      pl.vy = 8;
      pl.onGround = false;
      pl.hop = true;
      return;
    }
    if (KR.worlds()[world].charm) save.charm = 1;
    go('world', { world: world, speed: save.speed, charm: !!save.charm }, 'w' + (world + 1));
  }
  function startTower() {
    if (save.unlocked < 4) { toast('برج المفاتيح يفتح بعد العالم الثالث'); return; }
    var seed = KR.dailySeed();
    go('tower', { seed: seed, speed: save.speed }, 'tower');
  }
  function startRace(world) {
    go('race', { world: world, players: 2, speed: 0, shoe: 1, rebirths: 0, charm: false }, 'duo');
  }
  function pause() {
    if (mode !== 'play') return;
    mode = 'paused';
    dirty = true;
    Kit.keys.reset();
    prevKey = {};
    screens();
  }
  function resume() {
    if (mode !== 'paused') return;
    mode = 'play';
    dirty = true;
    screens();
    focusGame();
  }
  function restart() {
    var opts = { mode: activity === 'race' ? 'race' : activity };
    if (activity === 'world' || activity === 'race') opts.world = eng.state.world;
    if (activity === 'tower') opts.seed = eng.state.seed;
    if (activity === 'race') { opts.players = 2; opts.speed = 0; opts.shoe = 1; opts.rebirths = 0; opts.charm = false; }
    mode = 'play';
    eng.reset(runOpts(opts));
    dirty = true;
    screens();
    focusGame();
  }
  function menu() {
    endRound('end', Math.round(duo ? 0 : save.speed));
    duo = false;
    activity = 'plaza';
    mode = 'title';
    eng.reset(runOpts({ mode: 'plaza' }));
    dirty = true;
    screens();
    paintMenus();
  }
  function noteStage(ev) {
    var key = ev.world + '-' + ev.stage;
    var prev = save.medals[key];
    var add = 0;
    if (!prev) add += 2;
    if (ev.word && !(prev && prev.word)) add += 3;
    if (ev.noFall && !(prev && prev.noFall)) add += 2;
    if ((rank[ev.medal] || 0) > (prev ? rank[prev.medal] || 0 : 0)) add += 1;
    if (!duo) save.wins += add;
    var medal = prev && (rank[prev.medal] || 0) > (rank[ev.medal] || 0) ? prev.medal : ev.medal;
    var time = prev && prev.time && prev.time < ev.time ? prev.time : ev.time;
    save.medals[key] = {
      time: time, medal: medal,
      noFall: (prev && prev.noFall) || ev.noFall ? 1 : 0,
      word: (prev && prev.word) || ev.word ? 1 : 0
    };
    if (add && !duo) floater('+' + add);
    banner(ev.medal === 'gold' ? 'ذهبي!' : 'مرحلة!');
    persist();
  }
  function finishWorld(world) {
    var next = Math.min(8, world + 2);
    var bonus = 0;
    if (save.unlocked < next) { save.unlocked = next; bonus = 4; save.wins += bonus; }
    persist();
    endRound('win', Math.round(save.wins));
    mode = 'result';
    dirty = true;
    el('result-title').textContent = 'أنهيت العالم!';
    el('result-line').textContent = KR.NAMES[world] + (bonus ? ' · +4 أوسمة' : '');
    el('result-record').hidden = save.speed < save.best;
    screens();
    view.burst(eng.state.players[0].x, eng.state.players[0].y + 1, eng.state.players[0].z, 0xffe56a, 24);
    KR.sound('world');
  }
  function finishTower(height) {
    var seed = String(eng.state.seed || KR.dailySeed());
    var best = save.tower[seed] || 0;
    if (height > best) save.tower[seed] = height;
    syncSpeed(true);
    persist();
    endRound('end', Math.round(height));
    mode = 'result';
    dirty = true;
    el('result-title').textContent = height > best ? 'رقم قياسي جديد!' : 'انتهى البرج';
    el('result-record').hidden = height <= best;
    el('result-line').textContent = 'الارتفاع ' + Math.round(height);
    screens();
  }
  function finishRace() {
    var over = eng.state.over || { type: 'end', winner: 0 };
    endRound(over.type === 'draw' ? 'draw' : 'end', 0);
    mode = 'result';
    dirty = true;
    el('result-record').hidden = true;
    el('result-title').textContent = over.type === 'draw' ? 'تعادل!' : 'انتهى السباق';
    el('result-line').textContent = over.winner === 1 ? 'الوردي وصل أولًا' : over.winner === 0 ? 'الأزرق وصل أولًا' : 'تعادل!';
    screens();
  }
  function syncSpeed(force) {
    if (duo) return;
    var sp = eng.state.players[0].speed;
    if (sp > save.speed) save.speed = sp;
    if (save.speed > save.best) save.best = save.speed;
    var bucket = Math.floor(save.speed / 25);
    if (force || bucket > milestone) {
      milestone = Math.max(milestone, bucket);
      persist();
    }
  }
  function onEvents(events) {
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      if (ev.e === 'jump') { KR.sound('jump'); shake = Math.max(shake, 0.04); }
      else if (ev.e === 'double') KR.sound('double');
      else if (ev.e === 'land') {
        KR.sound('land', ev.row);
        shake = Math.max(shake, 0.08);
        var landed = eng.state.players[ev.p];
        if (landed) view.burst(landed.x, landed.y + 0.15, landed.z, 0xfff3ea, 8);
      }
      else if (ev.e === 'bounce') KR.sound('bounce');
      else if (ev.e === 'launch') { KR.sound('launch'); shake = Math.max(shake, 0.1); }
      else if (ev.e === 'step') {
        KR.sound('step', ev.p);
        if (!duo || ev.p === 0) floater('+' + ev.n);
        if (eng.state.players[ev.p] && eng.state.players[ev.p].speed > 6) fovKick = Math.min(8, fovKick + 2.4);
        syncSpeed(false);
      }
      else if (ev.e === 'gate') { KR.sound('gate'); toast('تحتاج سرعة ' + ev.n); }
      else if (ev.e === 'fall') { KR.sound('fall'); shake = Math.max(shake, 0.12); }
      else if (ev.e === 'checkpoint') {
        banner('نقطة حفظ!');
        persist();
        var flag = eng.state.players[ev.p];
        if (flag) view.burst(flag.x, flag.y + 1.2, flag.z, 0xffe56a, 20);
      }
      else if (ev.e === 'stage') {
        if (duo) banner('مرحلة!');
        else { KR.sound('stage'); noteStage(ev); view.burst(eng.state.players[ev.p].x, 1.4, eng.state.players[ev.p].z, 0xfff1a8, 16); }
      }
      else if (ev.e === 'world' && !duo) finishWorld(ev.world);
      else if (ev.e === 'word') KR.sound('word');
      else if (ev.e === 'portal' && ev.p === 0) enterWorld(ev.world);
      else if (ev.e === 'shop' && ev.p === 0 && !duo) openShop();
      else if (ev.e === 'towerDoor' && ev.p === 0 && !duo) startTower();
      else if (ev.e === 'towerEnd') finishTower(ev.height);
    }
    if (eng.state.over && duo && mode === 'play') finishRace();
  }
  function edge(code) {
    var now = Kit.keys.down(code);
    var hit = now && !prevKey[code];
    prevKey[code] = now;
    return hit;
  }
  function wish(pl, ix, iz) {
    var yaw = pl.face + pl.cam;
    return {
      x: ix * Math.cos(yaw) + iz * Math.sin(yaw),
      z: -ix * Math.sin(yaw) + iz * Math.cos(yaw)
    };
  }
  function padInput(pl, ix, iz, jump, respawn, cam) {
    var w = wish(pl, ix, iz);
    return { x: w.x, z: w.z, jump: jump, respawn: respawn, cam: cam };
  }
  function readInput() {
    var players = eng.state.players;
    var cam = (edge('KeyQ') ? -1 : 0) + (edge('KeyE') ? 1 : 0);
    if (!duo) {
      var ix = (Kit.keys.down('KeyD') || Kit.keys.down('ArrowRight') ? 1 : 0) - (Kit.keys.down('KeyA') || Kit.keys.down('ArrowLeft') ? 1 : 0);
      var iz = (Kit.keys.down('KeyW') || Kit.keys.down('ArrowUp') ? 1 : 0) - (Kit.keys.down('KeyS') || Kit.keys.down('ArrowDown') ? 1 : 0);
      return padInput(players[0], ix, iz, Kit.keys.down('Space'), edge('KeyR'), cam);
    }
    var p1 = padInput(players[0],
      (Kit.keys.down('KeyD') ? 1 : 0) - (Kit.keys.down('KeyA') ? 1 : 0),
      (Kit.keys.down('KeyW') ? 1 : 0) - (Kit.keys.down('KeyS') ? 1 : 0),
      Kit.keys.down('Space'), edge('KeyG'), cam);
    var p2 = padInput(players[1],
      (Kit.keys.down('ArrowRight') ? 1 : 0) - (Kit.keys.down('ArrowLeft') ? 1 : 0),
      (Kit.keys.down('ArrowUp') ? 1 : 0) - (Kit.keys.down('ArrowDown') ? 1 : 0),
      Kit.keys.down('Enter') || Kit.keys.down('NumpadEnter') || Kit.keys.down('Slash'),
      edge('Period'), cam);
    return [p1, p2];
  }
  function hud() {
    var pl = eng.state.players[0];
    var speed = Math.round(pl.speed);
    var node = el('speed');
    if (speed !== shownSpeed) {
      node.textContent = String(speed);
      node.classList.remove('pop');
      void node.offsetWidth;
      node.classList.add('pop');
      shownSpeed = speed;
    }
    if (duo) el('speed-b').textContent = String(Math.round(eng.state.players[1].speed));
    el('wins').textContent = String(Math.round(save.wins));
    var place = 'الساحة';
    if (activity === 'world' || activity === 'race') place = KR.NAMES[eng.state.world] + ' · ' + (pl.stage + 1);
    else if (activity === 'tower') place = 'البرج · ' + Math.round(pl.maxY);
    el('place').textContent = place;
    var wordBox = el('word');
    if ((activity === 'world' || activity === 'race') && pl.stage === 5) {
      var word = KR.WORDS[eng.state.world];
      wordBox.hidden = false;
      wordBox.innerHTML = '';
      for (var i = 0; i < word.length; i++) {
        var bit = document.createElement('b');
        bit.textContent = word.charAt(i);
        if (i === pl.wordAt) bit.style.color = '#ff4eb6';
        wordBox.appendChild(bit);
      }
    } else wordBox.hidden = true;
  }
  var floodCue = 0;
  function update(dt) {
    if (mode === 'paused' || mode === 'shop' || mode === 'result' || mode === 'duo' || contextLost) return;
    var input = mode === 'title' ? {} : readInput();
    onEvents(eng.step(dt, input));
    if (mode === 'play') hud();
    var pl = eng.state.players[0];
    if (eng.state.flood && pl && pl.z >= eng.state.flood.z0 && eng.state.floodY > pl.y - 0.4 && eng.state.time - floodCue > 0.5) {
      floodCue = eng.state.time;
      KR.sound('flood', 1);
    }
  }
  function draw() {
    var now = performance.now();
    if (toastUntil && now > toastUntil) { el('toast').hidden = true; toastUntil = 0; }
    if (bannerUntil && now > bannerUntil) { el('banner').hidden = true; bannerUntil = 0; }
    if ((mode === 'paused' || mode === 'shop' || mode === 'result') && !dirty) return;
    if (contextLost) return;
    dirty = false;
    shake *= 0.86;
    fovKick *= 0.82;
    if (Kit.motion.reduced()) { shake = 0; fovKick = 0; }
    view.render(eng.state, {
      engine: eng, quality: save.quality, reduced: Kit.motion.reduced(),
      shake: shake, fovKick: fovKick, hat: duo ? 0 : save.hat, trail: duo ? 0 : save.trail, aura: duo ? 0 : save.aura
    });
  }
  function openShop() {
    if (mode !== 'play' || duo) return;
    mode = 'shop';
    dirty = true;
    buildShop();
    el('rebirth-ask').hidden = true;
    screens();
  }
  function closeShop() {
    if (mode !== 'shop') return;
    mode = 'play';
    dirty = true;
    eng.state.players[0].touchCd = 0.6;
    screens();
    focusGame();
  }
  function owned(kind, id) {
    if (kind === 'charm') return !!save.owned.charm;
    var list = save.owned[kind];
    return list && list.indexOf(id) >= 0;
  }
  function equip(kind, id) {
    if (kind === 'shoes') save.shoe = id;
    else if (kind === 'trails') save.trail = id;
    else if (kind === 'auras') save.aura = id;
    else if (kind === 'hats') save.hat = id;
    else if (kind === 'charm') save.charm = 1;
    eng.state.players[0].shoe = save.shoe;
    eng.state.players[0].rebirths = save.rebirths;
    eng.state.players[0].charm = !!save.charm;
  }
  function buy(kind, id, cost, need) {
    if (need && save.unlocked < need) { toast('يفتح بعد عالم سابق'); return; }
    if (owned(kind, id)) { equip(kind, id); persist(); buildShop(); return; }
    if (save.wins < cost) { toast('تحتاج ' + cost + ' أوسمة'); return; }
    save.wins -= cost;
    if (kind === 'charm') save.owned.charm = 1;
    else save.owned[kind].push(id);
    equip(kind, id);
    KR.sound('buy');
    floater('-' + cost);
    persist();
    buildShop();
  }
  function choice(label, on, disabled, click) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'choice' + (on ? ' on' : '');
    button.textContent = label;
    button.disabled = !!disabled;
    button.addEventListener('click', click);
    return button;
  }
  function buildShop() {
    var root = el('shop-list');
    root.innerHTML = '';
    el('shop-wins').textContent = String(Math.round(save.wins));
    function group(title, kind, items) {
      var head = document.createElement('p');
      head.className = 'meta';
      head.textContent = title;
      var row = document.createElement('div');
      row.className = 'row';
      items.forEach(function (item) {
        var have = owned(kind, item.id);
        var label = item.name + (have ? ' · معك' : ' · ' + item.cost);
        row.appendChild(choice(label, (kind === 'shoes' ? save.shoe : save[kind.slice(0, -1)] || save[kind]) === item.id, false, function () {
          buy(kind, item.id, item.cost, item.need);
        }));
      });
      root.appendChild(head);
      root.appendChild(row);
    }
    group('أحذية الخطوات', 'shoes', KR.SHOP.shoes);
    group('آثار', 'trails', KR.SHOP.trails);
    group('هالات', 'auras', KR.SHOP.auras);
    group('قبعات', 'hats', KR.SHOP.hats);
    var charm = KR.SHOP.charm;
    var row = document.createElement('div');
    row.className = 'row';
    row.appendChild(choice(charm.name + (save.owned.charm ? ' · معك' : ' · ' + charm.cost), !!save.charm, false, function () {
      buy('charm', 1, charm.cost, charm.need);
    }));
    root.appendChild(row);
  }
  function buildRaces() {
    var root = el('race-list');
    root.innerHTML = '';
    for (var i = 0; i < save.unlocked && i < 8; i++) {
      (function (world) {
        var button = choice(KR.NAMES[world], false, false, function () { startRace(world); });
        button.id = 'race-' + world;
        root.appendChild(button);
      })(i);
    }
  }
  function rebirth() {
    if (save.speed < 200) { toast('تحتاج سرعة 200'); return; }
    el('rebirth-ask').hidden = false;
  }
  function confirmRebirth() {
    save.rebirths += 1;
    save.speed = 0;
    milestone = 0;
    eng.state.players[0].speed = 0;
    eng.state.players[0].rebirths = save.rebirths;
    el('rebirth-ask').hidden = true;
    KR.sound('rebirth');
    banner('إعادة الانطلاق!');
    persist();
    buildShop();
    paintMenus();
  }

  el('play').addEventListener('click', startPlaza);
  el('duo').addEventListener('click', function () { mode = 'duo'; buildRaces(); screens(); });
  el('duo-back').addEventListener('click', function () { mode = 'title'; screens(); });
  el('resume').addEventListener('click', resume);
  el('restart').addEventListener('click', restart);
  el('pause-menu').addEventListener('click', menu);
  el('pause-button').addEventListener('click', function () { pause(); });
  el('again').addEventListener('click', startPlaza);
  el('result-menu').addEventListener('click', menu);
  el('shop-close').addEventListener('click', closeShop);
  el('rebirth').addEventListener('click', rebirth);
  el('rebirth-yes').addEventListener('click', confirmRebirth);
  el('rebirth-no').addEventListener('click', function () { el('rebirth-ask').hidden = true; });
  el('quality').addEventListener('click', function () {
    save.quality = save.quality === 'low' ? 'high' : 'low';
    paintMenus();
    persist();
    if (fit) fit.resize();
    dirty = true;
  });
  window.addEventListener('keydown', function (e) {
    if (!Kit.isGameKeyEvent(e) || e.repeat) return;
    if ((mode === 'title' || mode === 'result') && (e.code === 'Space' || e.code === 'Enter' || (mode === 'result' && e.code === 'KeyR'))) {
      e.preventDefault();
      startPlaza();
    } else if (mode === 'shop' && (e.code === 'Escape' || e.code === 'KeyP')) {
      e.preventDefault();
      closeShop();
    } else if (e.code === 'KeyP' || e.code === 'Escape') {
      e.preventDefault();
      if (mode === 'play') pause();
      else if (mode === 'paused') resume();
    } else if (mode === 'paused' && e.code === 'KeyR') {
      e.preventDefault();
      restart();
    }
  });

  var canvas = el('scene');
  canvas.addEventListener('webglcontextlost', function (e) {
    e.preventDefault();
    contextLost = true;
    if (mode === 'play') pause();
    el('context-notice').hidden = false;
  });
  canvas.addEventListener('webglcontextrestored', function () {
    contextLost = false;
    el('context-notice').hidden = true;
    dirty = true;
    if (fit) fit.resize();
  });

  Kit.lifecycle({ pause: pause, reset: function () { prevKey = {}; } });
  Kit.motion.onChange(function () { dirty = true; });
  Kit.muteButton();
  paintMenus();
  try {
    eng = KR.createEngine(runOpts({ mode: 'plaza' }));
    view = KR.createView(canvas);
    fit = Kit.fit(canvas, 1280, 720, {
      webgl: true,
      maxDpr: 1.5,
      onResize: function () {
        var dpr = save.quality === 'low' ? 1 : Math.min(1.5, window.devicePixelRatio || 1);
        view.setPixelRatio(dpr);
        dirty = true;
      }
    });
    document.fonts.load('700 40px Fredoka', 'ب').then(function () { view.rebuildText(); dirty = true; }).catch(function () {});
    screens();
    draw();
    window.KeyRunnerGame = window.__game = {
      get mode() { return mode; },
      get state() {
        var pl = eng.state.players[0];
        return {
          z: pl.z, y: pl.y, x: pl.x, speed: pl.speed, stage: pl.stage,
          players: eng.state.players.length, world: eng.state.world
        };
      },
      get save() { return save; },
      start: startPlaza, pause: pause, resume: resume, restart: restart, menu: menu
    };
    loop = Kit.loop(update, draw, { hz: 60 });
    Kit.ready();
  } catch (error) {
    if (loop) loop.stop();
    el('error-screen').hidden = false;
    el('title-screen').hidden = true;
    Kit.fail(error);
  }
})();
