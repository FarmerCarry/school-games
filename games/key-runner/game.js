/* Picture-first tower climb. The engine never calls Kit.stats. */
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
  var prevKey = {};
  var shake = 0;
  var fovKick = 0;
  var activity = 'tower';
  var hitUntil = 0;
  var combo = 0;
  var comboAt = 0;
  var resultAt = 0;
  var heldWin = null;
  var scripted = false;

  function persist() {
    save.best = Math.max(save.best || 0, save.speed || 0);
    if (store.set('save', save)) saveStatus.saved();
    else saveStatus.failed();
  }
  function clock(t) {
    t = Math.max(0, t || 0);
    var m = Math.floor(t / 60);
    var s = Math.floor(t % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }
  function paintMenus() {
    var q = el('quality');
    var low = save.quality === 'low';
    q.setAttribute('aria-pressed', low ? 'true' : 'false');
    q.textContent = low ? 'الرسوم: خفيفة' : 'الرسوم: كاملة';
    var best = el('menu-best');
    if (best) best.textContent = save.bestTime ? clock(save.bestTime) : '—';
    var flags = el('menu-flags');
    if (flags) flags.textContent = String(save.flags || 0);
  }
  function screens() {
    el('title-screen').hidden = mode !== 'title';
    el('duo-screen').hidden = mode !== 'duo';
    el('pause-screen').hidden = mode !== 'paused';
    el('result-screen').hidden = mode !== 'result';
    el('hud').hidden = mode === 'title' || mode === 'duo' || mode === 'result';
    el('pause-button').hidden = mode !== 'play';
    el('quality').hidden = mode === 'play';
    el('hint').hidden = mode !== 'play';
    document.body.dataset.mode = mode;
    document.body.dataset.duo = duo && mode === 'play' ? '1' : '0';
  }
  function endRound(result, score) {
    if (!roundId) return;
    Kit.stats.end(result, score);
    roundId = '';
  }
  function beginRound(id) {
    if (roundId) endRound('end', 0);
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
    combo = 0;
    resultAt = 0;
    heldWin = null;
    eng.reset(runOpts(Object.assign({ mode: nextMode === 'race' ? 'race' : 'world', world: 0 }, opts || {})));
    eng.state.armed = true;
    mode = 'play';
    dirty = true;
    if (round) beginRound(round);
    screens();
    paintMenus();
    focusGame();
    paintPips(0);
    KR.music(true, 0);
    if (!duo) view.playGhost(eng.state);
  }
  function paintPips(n) {
    var dots = el('pips').querySelectorAll('i');
    for (var i = 0; i < dots.length; i++) dots[i].classList.toggle('on', i < n);
  }
  function starsFor(time) {
    var stages = KR.worlds()[0].stages;
    var gold = 0, silver = 0, bronze = 0;
    for (var i = 0; i < stages.length; i++) {
      gold += stages[i].gold;
      silver += stages[i].silver;
      bronze += stages[i].bronze;
    }
    if (time <= gold) return 3;
    if (time <= silver) return 2;
    if (time <= bronze) return 1;
    return 1;
  }
  function unlockTrail(flags) {
    var trail = flags >= 8 ? 3 : flags >= 6 ? 2 : flags >= 3 ? 1 : 0;
    if (trail && save.owned.trails.indexOf(trail) < 0) save.owned.trails.push(trail);
    if (trail > save.trail) save.trail = trail;
  }
  function showResult(time, flags, fresh) {
    mode = 'result';
    dirty = true;
    var stars = starsFor(time);
    el('result-title').textContent = 'قمة البرج!';
    el('result-line').textContent = flags + '/8   ' + clock(time);
    el('result-record').hidden = !fresh;
    el('stars').setAttribute('data-stars', String(stars));
    el('tower-mark').style.bottom = Math.min(92, 8 + flags * 10) + '%';
    screens();
    KR.music(false, 0);
  }
  function startClimb() {
    Kit.audio.unlock();
    go('world', { speed: save.speed }, 'tower');
    persist();
  }
  function startRace() {
    Kit.audio.unlock();
    go('race', { players: 2, speed: 0, shoe: 1, rebirths: 0, charm: false }, 'duo');
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
    var race = activity === 'race';
    mode = 'play';
    combo = 0;
    resultAt = 0;
    eng.reset(runOpts(race ? { mode: 'race', world: 0, players: 2, speed: 0, shoe: 1, rebirths: 0, charm: false } : { mode: 'world', world: 0 }));
    eng.state.armed = true;
    dirty = true;
    screens();
    focusGame();
    paintPips(0);
  }
  function menu() {
    endRound('end', 0);
    duo = false;
    activity = 'tower';
    mode = 'title';
    resultAt = 0;
    heldWin = null;
    eng.reset(runOpts({ mode: 'world', world: 0 }));
    dirty = true;
    screens();
    paintMenus();
    KR.music(false, 0);
  }
  function onEvents(events) {
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      if (ev.e === 'jump') { KR.sound('jump'); shake = Math.max(shake, 0.04); }
      else if (ev.e === 'land') {
        KR.sound('land', ev.row);
        var landed = eng.state.players[ev.p];
        if (landed) view.dust(landed.x, landed.y + 0.05, landed.z, 10);
      }
      else if (ev.e === 'press') {
        var now = performance.now();
        combo = now - comboAt < 900 ? combo + 1 : 1;
        comboAt = now;
        KR.sound('press', combo);
        view.pressKey(ev.id);
        view.burst(ev.x, ev.y + 0.35, ev.z, 0xffe14a, 6);
      }
      else if (ev.e === 'bounce') {
        KR.sound('bounce');
        shake = 0.12;
        var bounced = eng.state.players[ev.p];
        if (bounced) view.burst(bounced.x, bounced.y + 0.3, bounced.z, 0x7dffa0, 8);
      }
      else if (ev.e === 'haste') {
        KR.sound('haste');
        fovKick = 8;
      }
      else if (ev.e === 'checkpoint' || ev.e === 'stage') {
        if (ev.e === 'checkpoint') {
          KR.sound('checkpoint');
          hitUntil = performance.now() + 100;
          var saved = eng.state.players[ev.p];
          if (saved) view.burst(saved.x, saved.y + 1.2, saved.z, 0xff4eb6, 16);
        }
        if (ev.e === 'stage' && !duo) {
          var flags = ev.stage + 1;
          if (flags > (save.flags || 0)) save.flags = flags;
          unlockTrail(save.flags);
          paintPips(flags);
          persist();
        } else if (ev.e === 'stage') paintPips(ev.stage + 1);
      }
      else if (ev.e === 'fall') {
        KR.sound(ev.why === 'flood' ? 'splash' : 'fall');
        shake = 0.1;
      }
      else if (ev.e === 'glug') KR.sound('glug');
      else if (ev.e === 'world' && !duo) {
        var time = eng.state.time;
        var fresh = !save.bestTime || time < save.bestTime;
        if (fresh) {
          save.bestTime = time;
          KR.sound('record');
        }
        save.flags = 8;
        unlockTrail(8);
        persist();
        endRound('win', Math.round(time));
        heldWin = { time: time, fresh: fresh };
        resultAt = performance.now() + 700;
        var winner = eng.state.players[ev.p];
        if (winner) view.burst(winner.x, winner.y + 1.6, winner.z, 0xffe14a, 18);
        KR.sound('world');
      }
    }
    if (eng.state.over && duo && mode === 'play') {
      endRound(eng.state.over.type === 'draw' ? 'draw' : 'end', 0);
      mode = 'result';
      dirty = true;
      el('result-title').textContent = eng.state.over.type === 'draw' ? 'تعادل!' : 'انتهى السباق';
      el('result-line').textContent = eng.state.over.winner === 1 ? 'الوردي' : 'الأزرق';
      el('result-record').hidden = true;
      el('stars').setAttribute('data-stars', '1');
      screens();
      KR.music(false, 0);
    }
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
    if (scripted && mode === 'play') return KR.suggest(eng.state, 0);
    var players = eng.state.players;
    var cam = (edge('KeyQ') ? -1 : 0) + (edge('KeyE') ? 1 : 0);
    if (!duo) {
      var ix = (Kit.keys.down('KeyD') || Kit.keys.down('ArrowRight') ? 1 : 0) - (Kit.keys.down('KeyA') || Kit.keys.down('ArrowLeft') ? 1 : 0);
      var iz = (Kit.keys.down('KeyW') || Kit.keys.down('ArrowUp') ? 1 : 0) - (Kit.keys.down('KeyS') || Kit.keys.down('ArrowDown') ? 1 : 0);
      return padInput(players[0], ix, iz, Kit.keys.down('Space'), edge('KeyR'), cam);
    }
    return [
      padInput(players[0],
        (Kit.keys.down('KeyD') ? 1 : 0) - (Kit.keys.down('KeyA') ? 1 : 0),
        (Kit.keys.down('KeyW') ? 1 : 0) - (Kit.keys.down('KeyS') ? 1 : 0),
        Kit.keys.down('Space'), edge('KeyG'), cam),
      padInput(players[1],
        (Kit.keys.down('ArrowRight') ? 1 : 0) - (Kit.keys.down('ArrowLeft') ? 1 : 0),
        (Kit.keys.down('ArrowUp') ? 1 : 0) - (Kit.keys.down('ArrowDown') ? 1 : 0),
        Kit.keys.down('Enter') || Kit.keys.down('NumpadEnter'),
        edge('Period'), 0)
    ];
  }
  function hud() {
    var pl = eng.state.players[0];
    var gap = pl.y - (eng.state.floodY || -2.2);
    var danger = Math.max(0, Math.min(1, 1 - gap / 7));
    el('choco-fill').style.height = (16 + danger * 84) + '%';
    el('choco').classList.toggle('hot', danger > 0.72);
  }
  function update(dt) {
    if (mode === 'paused' || mode === 'result' || mode === 'duo' || contextLost) return;
    if (resultAt && mode === 'play') {
      dirty = true;
      if (performance.now() >= resultAt && heldWin) {
        showResult(heldWin.time, 8, heldWin.fresh);
        heldWin = null;
      }
      return;
    }
    if (performance.now() < hitUntil) { dirty = true; return; }
    var input = mode === 'title' ? {} : readInput();
    onEvents(eng.step(dt, input));
    if (mode === 'play') {
      hud();
      KR.music(true, eng.state.players[0].y);
      KR.musicTick();
    }
  }
  function draw() {
    if ((mode === 'paused' || mode === 'result') && !dirty) return;
    if (contextLost) return;
    dirty = false;
    shake *= 0.86;
    fovKick *= 0.86;
    if (Kit.motion.reduced()) { shake = 0; fovKick = 0; }
    view.render(eng.state, {
      engine: eng, quality: save.quality, reduced: Kit.motion.reduced(),
      shake: shake, fovKick: fovKick
    });
  }
  function buildRaces() {
    var root = el('race-list');
    root.innerHTML = '';
    var button = document.createElement('button');
    button.id = 'race-0';
    button.type = 'button';
    button.className = 'choice';
    button.textContent = 'برج الحلوى';
    button.addEventListener('click', startRace);
    root.appendChild(button);
  }

  el('play').addEventListener('click', startClimb);
  el('duo').addEventListener('click', function () { mode = 'duo'; buildRaces(); screens(); });
  el('duo-back').addEventListener('click', function () { mode = 'title'; screens(); });
  el('resume').addEventListener('click', resume);
  el('restart').addEventListener('click', restart);
  el('pause-menu').addEventListener('click', menu);
  el('pause-button').addEventListener('click', pause);
  el('again').addEventListener('click', startClimb);
  el('result-menu').addEventListener('click', menu);
  el('quality').addEventListener('click', function () {
    save.quality = save.quality === 'low' ? 'high' : 'low';
    paintMenus();
    persist();
    if (fit) fit.resize();
    dirty = true;
  });
  window.addEventListener('keydown', function (e) {
    if (!Kit.isGameKeyEvent(e) || e.repeat) return;
    if ((mode === 'title' || mode === 'result') && (e.code === 'Space' || e.code === 'Enter')) {
      e.preventDefault();
      startClimb();
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
    eng = KR.createEngine(runOpts({ mode: 'world', world: 0 }));
    view = KR.createView(canvas);
    fit = Kit.fit(canvas, 1280, 800, {
      webgl: true,
      maxDpr: 1.5,
      onResize: function () {
        canvas.style.right = 'auto';
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
      start: startClimb, pause: pause, resume: resume, restart: restart, menu: menu,
      set auto(on) { scripted = !!on; },
      draws: function () { return view.drawCalls(); },
      get engine() { return eng; },
      reveal: function () {
        var time = eng.state.time;
        var fresh = !save.bestTime || time < save.bestTime;
        if (fresh) save.bestTime = time;
        save.flags = 8;
        unlockTrail(8);
        showResult(time, 8, fresh);
        dirty = true;
        draw();
      }
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
