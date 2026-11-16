/* Balloon Blast — screens, match flow, stats. The engine never calls Kit.stats. */
(function () {
  'use strict';
  var BLB = window.BLB, BBD = window.BBD, BBAI = window.BBAI, BBR = window.BBR, BBS = window.BBS;
  var $ = function (id) { return document.getElementById(id); };
  var canvas = $('game'), ui = $('ui');
  function place(v) {
    ui.style.transform = 'translate(' + canvas.style.left + ',' + canvas.style.top + ') scale(' + v.scale + ')';
  }
  var view = Kit.fit(canvas, 1280, 720, { onResize: place });
  canvas.addEventListener('contextrestored', function () { BBR.boot(); view.resize(); });
  Kit.muteButton();
  var store = Kit.store('balloon-blast');
  var saveUI = Kit.saveStatus({ retry: function () { persist(); } });
  var battleDda = Kit.dda('balloon-blast', { id: 'battle', target: 0.72, tiers: 5 });
  var advDda = Kit.dda('balloon-blast', { id: 'adv', target: 0.72, tiers: 5 });

  function clamp(n, a, b) { n = n | 0; return n < a ? a : n > b ? b : n; }
  function unlocked(s, id) {
    var c = BBD.critter(id);
    return (s.wins || 0) >= c.wins || (s.stars || 0) >= c.stars;
  }
  function loadSave() {
    var raw = store.get('save', null);
    var s = { v: 1, wins: 0, stars: 0, coins: 0, critter: 'frog', balloon: 0, arena: 'garden', best: {} };
    if (raw && typeof raw === 'object') {
      s.wins = clamp(raw.wins, 0, 9999);
      s.stars = clamp(raw.stars, 0, 9999);
      s.coins = clamp(raw.coins, 0, 999999);
      if (BBD.CRITTERS.some(function (c) { return c.id === raw.critter; })) s.critter = raw.critter;
      s.balloon = clamp(raw.balloon, 0, BBD.BALLOONS.length - 1);
      if (BBD.ARENAS.some(function (a) { return a.id === raw.arena; })) s.arena = raw.arena;
      var best = raw.best && typeof raw.best === 'object' ? raw.best : {};
      BBD.STAGES.forEach(function (st) { s.best[st.id] = clamp(best[st.id], 0, 3); });
    }
    if (!unlocked(s, s.critter)) s.critter = 'frog';
    if (!arenaOpen(s, s.arena)) s.arena = 'garden';
    return s;
  }
  function arenaOpen(s, id) {
    var a = BBD.arena(id);
    return s.wins >= a.wins || s.stars >= a.stars;
  }
  var save = loadSave();
  function persist() {
    var ok = store.set('save', save) !== false;
    if (ok) saveUI.saved(); else saveUI.failed();
    return ok;
  }

  var screen = 'title', paused = false, world = null, demo = null, cfg = null;
  var scores = [0, 0, 0, 0], roundsPlayed = 0, reported = false, banner = '', bannerT = 0;
  var resultLock = 0;

  function show(id) {
    ['scrTitle', 'scrDuo', 'scrAdv', 'scrPause', 'scrResult'].forEach(function (s) {
      $(s).hidden = s !== id;
    });
    $('pauseBtn').hidden = !(screen === 'play' && !paused);
  }

  function starsOf(id) { return save.best[id] || 0; }
  function worldOpen(w) {
    if (w <= 1) return true;
    var prev = BBD.STAGES.filter(function (s) { return s.world === w - 1 && s.stage === 6; })[0];
    return starsOf(prev.id) > 0;
  }
  function paintTitle() {
    var n = BBD.CRITTERS.filter(function (c) { return unlocked(save, c.id); }).length;
    $('progLine').textContent = 'النجوم ' + Kit.fmt(save.stars) + ' · الانتصارات ' + Kit.fmt(save.wins) + ' · الشخصيات ' + Kit.fmt(n) + ' من ' + Kit.fmt(BBD.CRITTERS.length);
    var box = $('crits');
    box.innerHTML = '';
    BBD.CRITTERS.forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = c.id === 'frog' ? '🐸' : c.id === 'penguin' ? '🐧' : c.id === 'robot' ? '🤖' : c.id === 'cat' ? '🐱' : c.id === 'dino' ? '🦖' : c.id === 'panda' ? '🐼' : c.id === 'bee' ? '🐝' : '🐪';
      b.disabled = !unlocked(save, c.id);
      b.className = save.critter === c.id ? 'on' : '';
      b.addEventListener('click', function () {
        if (!unlocked(save, c.id)) return;
        save.critter = c.id; BBS.select(); persist(); paintTitle();
      });
      box.appendChild(b);
    });
  }

  function freshDemo() {
    demo = BLB.newMatch({
      seed: (Math.random() * 9999) | 0, intro: 0, demo: true, tier: 3, arena: save.arena,
      players: [0, 1, 2, 3].map(function (i) {
        return { cpu: true, team: i, tier: 3, critter: BBD.CRITTERS[i].id };
      })
    });
  }

  function tuneBattle() {
    battleDda.pick([0.45, 0.36, 0.27, 0.18, 0.12]);
    return battleDda.tier;
  }
  function tuneAdv() {
    return advDda.pick([1, 2, 3, 4, 5]);
  }

  function begin(next) {
    cfg = next;
    paused = false;
    reported = false;
    scores = [0, 0, 0, 0];
    roundsPlayed = 0;
    banner = '';
    screen = 'play';
    if (!next.demo) {
      if (next.mode === 'adv') {
        var tierA = tuneAdv();
        var id = 'w' + next.stage.world + '-' + next.stage.stage + (next.duo ? ':duo' : '');
        Kit.stats.round(id);
        next.tier = tierA;
      } else {
        var tierB = tuneBattle();
        var rid = next.duo ? (next.team ? 'team:duo' : 'battle:duo') : ('cpu-' + tierB);
        Kit.stats.round(rid);
        next.tier = tierB;
      }
    }
    openRound();
    show(null);
  }

  function specs(tier) {
    var me = save.critter;
    if (cfg.mode === 'adv') return null;
    if (!cfg.duo) {
      return [
        { cpu: false, team: 0, critter: me },
        { cpu: true, team: 1, tier: tier, critter: 'penguin' },
        { cpu: true, team: 2, tier: tier, critter: 'cat' },
        { cpu: true, team: 3, tier: tier, critter: 'robot' }
      ];
    }
    if (cfg.team) {
      return [
        { cpu: false, team: 0, critter: me },
        { cpu: false, team: 0, critter: 'penguin' },
        { cpu: true, team: 1, tier: tier, critter: 'cat' },
        { cpu: true, team: 1, tier: tier, critter: 'robot' }
      ];
    }
    return [
      { cpu: false, team: 0, critter: me },
      { cpu: false, team: 1, critter: 'penguin' },
      { cpu: true, team: 2, tier: tier, critter: 'cat' },
      { cpu: true, team: 3, tier: tier, critter: 'robot' }
    ];
  }

  function openRound() {
    var seed = (cfg.seed || 1) + roundsPlayed * 17;
    if (cfg.mode === 'adv') {
      world = BLB.newStage({
        stage: cfg.stage, seed: seed, coop: !!cfg.duo, tier: cfg.tier || 1,
        p1: save.critter, p2: 'penguin', intro: cfg.demo ? 0 : 1.2, arena: cfg.stage.arena
      });
    } else {
      world = BLB.newMatch({
        seed: seed, tier: cfg.tier || 3, intro: cfg.demo ? 0 : 2.2, arena: arenaOpen(save, save.arena) ? save.arena : 'garden',
        kind: cfg.team ? 'team' : 'ffa', players: specs(cfg.tier || 3), demo: !!cfg.demo
      });
    }
    world.battle = cfg.mode !== 'adv';
  }

  function labels() {
    if (!cfg) return [];
    if (cfg.mode === 'adv') return cfg.duo ? ['أنت', 'صديقك'] : ['أنت'];
    if (!cfg.duo) return ['أنت', 'كمبيوتر', 'كمبيوتر', 'كمبيوتر'];
    if (cfg.team) return ['أنت', 'صديقك', 'كمبيوتر', 'كمبيوتر'];
    return ['اللاعب 1', 'اللاعب 2', 'كمبيوتر', 'كمبيوتر'];
  }

  function drain(w, quiet) {
    if (!w || !w.events.length) return;
    var ev = w.events.splice(0, w.events.length);
    for (var i = 0; i < ev.length; i++) {
      var e = ev[i];
      if (e.t === 'boom') {
        if (!quiet) BBS.boom(e.n);
      } else if (e.t === 'crate') BBR.fx('crate', (e.c + 0.5) * BLB.TILE, (e.r + 0.5) * BLB.TILE);
      else if (e.t === 'gift') BBR.fx('item', (e.c + 0.5) * BLB.TILE, (e.r + 0.5) * BLB.TILE);
      else if (e.t === 'drop' && !quiet) BBS.drop();
      else if (e.t === 'kick' && !quiet) BBS.kick();
      else if (e.t === 'item') { if (!quiet) BBS.item(); BBR.fx('item', (e.c ? e.c : 2) * BLB.TILE, 80); }
      else if (e.t === 'trap') {
        if (!quiet) BBS.trap();
        if (!quiet && !cfg.demo) {
          var vic = w.players[e.victim];
          if (e.own && vic && !vic.cpu) Kit.track.miss();
          if (!e.own && e.by === 0 && vic && vic.team !== 0) Kit.track.hit();
          if (vic && vic.robot && e.by === 0) Kit.track.hit();
        }
      } else if (e.t === 'free') {
        if (!quiet) BBS.free();
        var freed = w.players[e.id];
        if (freed) BBR.fx('free', freed.x, freed.y);
      } else if (e.t === 'pop') {
        if (!quiet) BBS.pop();
        var who = w.players[e.victim];
        if (who) BBR.fx('pop', who.x, who.y);
        if (!quiet && !cfg.demo && e.owner === 0) Kit.track.hit();
      } else if (e.t === 'boss' && !quiet) BBS.boom(2);
    }
  }

  function finishMatch() {
    if (reported || !cfg || cfg.demo) return;
    reported = true;
    var win = false, score = 0, stars = 0;
    if (cfg.duo) Kit.stats.end('end');
    else if (cfg.mode === 'adv') {
      stars = world.stars || 0;
      win = world.outcome === 'win';
      Kit.stats.end(win ? 'win' : 'lose', stars);
      advDda.result(stars / 3);
      var prev = save.best[cfg.stage.id] || 0;
      if (stars > prev) save.best[cfg.stage.id] = stars;
      save.stars = 0;
      BBD.STAGES.forEach(function (st) { save.stars += save.best[st.id] || 0; });
      save.coins += stars * 6;
    } else {
      score = scores[0] || 0;
      win = score >= 2;
      Kit.stats.end(win ? 'win' : 'lose', score);
      battleDda.result(score / 3);
      if (win) save.wins++;
      save.coins += win ? 12 + score * 4 : 4;
    }
    persist();
    var head = $('resBanner');
    head.className = 'banner' + (!cfg.duo && !win ? ' lose' : '');
    if (cfg.mode === 'adv') {
      head.textContent = win ? 'نجحت!' : 'حاول مرة أخرى';
      $('resStars').textContent = stars ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : '☆☆☆';
      $('resSub').textContent = 'نجوم ' + Kit.fmt(stars) + ' · عملات ' + Kit.fmt(save.coins);
    } else if (cfg.duo) {
      var best = 0, who = 0;
      scores.forEach(function (n, i) { if (n > best) { best = n; who = i; } });
      head.textContent = cfg.team ? (scores[0] >= 2 ? 'فزتم!' : 'فاز الكمبيوتر') : ('فاز اللاعب ' + Kit.fmt(who + 1));
      $('resStars').textContent = '';
      $('resSub').textContent = 'الجولات ' + scores.filter(function (n, i) { return world.players[i] && !world.players[i].robot; }).join(' - ');
    } else {
      head.textContent = win ? 'فزت!' : 'خسرت';
      $('resStars').textContent = '';
      $('resSub').textContent = 'جولات ' + Kit.fmt(score) + ' · عملات ' + Kit.fmt(save.coins);
    }
    var fresh = BBD.CRITTERS.filter(function (c) { return unlocked(save, c.id); });
    $('resUnlock').textContent = 'الشخصيات المفتوحة: ' + Kit.fmt(fresh.length) + ' من ' + Kit.fmt(BBD.CRITTERS.length);
    screen = 'result';
    paused = false;
    resultLock = 0.45;
    show('scrResult');
    if (!cfg.duo && win) BBS.win(); else if (!cfg.duo) BBS.lose(); else BBS.win();
  }

  function onRoundDone() {
    if (world.winner >= 0 && world.winner < scores.length) scores[world.winner]++;
    roundsPlayed++;
    var over = cfg.mode === 'adv' || scores[0] >= 2 || roundsPlayed >= 3 || Math.max.apply(null, scores) >= 2;
    if (cfg.mode !== 'adv' && cfg.duo && !cfg.team) over = Math.max.apply(null, scores) >= 2 || roundsPlayed >= 3;
    if (cfg.mode !== 'adv' && cfg.team) over = scores[0] >= 2 || scores[1] >= 2 || roundsPlayed >= 3;
    if (over) finishMatch();
    else {
      banner = 'الجولة التالية!';
      bannerT = 1.5;
      openRound();
    }
  }

  function pauseGame() {
    if (screen !== 'play' || paused) return;
    paused = true;
    screen = 'pause';
    show('scrPause');
    BBS.pause(true);
    Kit.keys.reset();
  }
  function resume() {
    if (screen !== 'pause') return;
    paused = false;
    screen = 'play';
    show(null);
    BBS.pause(false);
  }
  function restart() {
    if (!cfg || cfg.demo) return;
    BBS.tap();
    begin(cfg);
  }
  function toTitle() {
    world = null;
    cfg = null;
    paused = false;
    screen = 'title';
    show('scrTitle');
    paintTitle();
    if (!demo) freshDemo();
    BBS.back();
  }

  function readHuman(i, duo) {
    var K = Kit.keys;
    var x, y, drop, kick;
    if (!duo) {
      x = (K.down('ArrowRight') || K.down('KeyD') ? 1 : 0) - (K.down('ArrowLeft') || K.down('KeyA') ? 1 : 0);
      y = (K.down('ArrowDown') || K.down('KeyS') ? 1 : 0) - (K.down('ArrowUp') || K.down('KeyW') ? 1 : 0);
      drop = K.pressed('Space') || K.pressed('Enter') || K.pressed('NumpadEnter') || K.pressed('Slash');
      kick = K.pressed('KeyE') || K.pressed('Period');
      return { x: x, y: y, drop: drop, kick: kick };
    }
    if (i === 0) {
      return {
        x: (K.down('KeyD') ? 1 : 0) - (K.down('KeyA') ? 1 : 0),
        y: (K.down('KeyS') ? 1 : 0) - (K.down('KeyW') ? 1 : 0),
        drop: K.pressed('Space'), kick: K.pressed('KeyE')
      };
    }
    return {
      x: (K.down('ArrowRight') ? 1 : 0) - (K.down('ArrowLeft') ? 1 : 0),
      y: (K.down('ArrowDown') ? 1 : 0) - (K.down('ArrowUp') ? 1 : 0),
      drop: K.pressed('Slash') || K.pressed('Enter') || K.pressed('NumpadEnter'),
      kick: K.pressed('Period')
    };
  }

  function inputsFor(w) {
    var duo = cfg && cfg.duo;
    var humans = w.players.map(function (p, i) { return p.cpu ? null : readHuman(i, duo); });
    return BBAI.mix(w, humans);
  }

  function update(dt) {
    var K = Kit.keys;
    if (screen === 'title') {
      if (K.anyPressed(['Enter', 'NumpadEnter', 'Space'])) { BBS.tap(); begin({ mode: 'battle', duo: false, team: false, seed: (Math.random() * 9999) | 0 }); }
      if (demo) { BLB.step(demo, dt, BBAI.inputs(demo)); drain(demo, true); if (demo.phase !== 'play') freshDemo(); }
    } else if (screen === 'duo') {
      if (K.pressed('Escape')) toTitle();
    } else if (screen === 'adv') {
      if (K.pressed('Escape')) toTitle();
    } else if (screen === 'play') {
      if (K.anyPressed(['KeyP', 'Escape'])) { pauseGame(); K.endFrame(); return; }
      if (!paused && world) {
        BLB.step(world, dt, inputsFor(world));
        drain(world, false);
        if (bannerT > 0) bannerT -= dt;
        if (world.phase === 'end' || world.phase === 'won' || world.phase === 'lost') onRoundDone();
      }
    } else if (screen === 'pause' || paused) {
      if (K.anyPressed(['KeyP', 'Escape'])) resume();
      else if (K.pressed('KeyR')) restart();
    } else if (screen === 'result') {
      if (resultLock > 0) resultLock -= dt;
      else if (K.anyPressed(['Enter', 'NumpadEnter', 'Space', 'KeyR'])) restart();
      else if (K.pressed('Escape')) toTitle();
    }
    K.endFrame();
  }

  function render() {
    var w = screen === 'title' ? (demo || world) : world;
    if (!w) return;
    var lap = '';
    if (screen === 'play' && world && world.battle && world.phase === 'play' && world.freeze <= 0) {
      var alive = {};
      world.players.forEach(function (p) { if (p.state !== 'out') alive[p.team] = 1; });
      if (Object.keys(alive).length <= 1 && world.time < world.minEnd) lap = 'الجولة لك!';
    }
    BBR.draw(view.ctx, w, {
      hud: screen === 'play' || screen === 'pause',
      labels: labels(),
      banner: bannerT > 0 ? banner : lap
    });
  }

  $('play1').addEventListener('click', function () { BBS.tap(); begin({ mode: 'battle', duo: false, team: false, seed: (Math.random() * 9999) | 0 }); });
  $('play2').addEventListener('click', function () { BBS.select(); screen = 'duo'; show('scrDuo'); });
  $('playAdv').addEventListener('click', function () { BBS.select(); screen = 'adv'; show('scrAdv'); buildAdv(); });
  $('duoFfa').addEventListener('click', function () { BBS.tap(); begin({ mode: 'battle', duo: true, team: false, seed: (Math.random() * 9999) | 0 }); });
  $('duoTeam').addEventListener('click', function () { BBS.tap(); begin({ mode: 'battle', duo: true, team: true, seed: (Math.random() * 9999) | 0 }); });
  $('duoBack').addEventListener('click', toTitle);
  $('advBack').addEventListener('click', toTitle);
  $('bResume').addEventListener('click', resume);
  $('bRestart').addEventListener('click', restart);
  $('bMenu').addEventListener('click', toTitle);
  $('rAgain').addEventListener('click', function () { if (resultLock <= 0) restart(); });
  $('rMenu').addEventListener('click', toTitle);
  $('pauseBtn').addEventListener('click', pauseGame);

  var advWorld = 1;
  function buildAdv() {
    var row = $('worlds');
    row.innerHTML = '';
    BBD.WORLDS.forEach(function (w) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = w.name;
      b.disabled = !worldOpen(w.id);
      b.addEventListener('click', function () { advWorld = w.id; BBS.select(); buildAdv(); });
      row.appendChild(b);
    });
    var grid = $('stages');
    grid.innerHTML = '';
    BBD.STAGES.filter(function (s) { return s.world === advWorld; }).forEach(function (s) {
      var b = document.createElement('button');
      b.type = 'button';
      var prev = s.stage === 1 || starsOf('w' + s.world + '-' + (s.stage - 1)) > 0;
      b.disabled = !prev;
      b.innerHTML = Kit.fmt(s.stage) + '<small>' + '★'.repeat(starsOf(s.id)) + '</small>';
      b.addEventListener('click', function () {
        if (b.disabled) return;
        BBS.tap();
        begin({ mode: 'adv', duo: $('coop').checked, team: false, stage: s, seed: s.world * 10 + s.stage });
      });
      grid.appendChild(b);
    });
  }

  window.__game = {
    get screen() { return paused ? 'pause' : screen; },
    get paused() { return paused; },
    get world() { return world; },
    get scores() { return scores; },
    get demoing() { return screen === 'title' && !!demo; },
    info: function () {
      var p = world && world.players[0];
      return {
        t: world ? +world.time.toFixed(2) : 0,
        phase: world ? world.phase : '',
        px: p ? Math.round(p.x) : 0,
        py: p ? Math.round(p.y) : 0,
        freeze: world ? world.freeze : 0
      };
    },
    start: function (o) {
      o = o || {};
      if (o.mode === 'duo' || o.mode === 'team') begin({ mode: 'battle', duo: true, team: o.mode === 'team' || !!o.team, seed: o.seed || 3 });
      else if (o.mode === 'adv' || o.mode === 'adventure') begin({ mode: 'adv', duo: !!o.duo, stage: BBD.stageById(o.stage || 'w1-1'), seed: o.seed || 2 });
      else begin({ mode: 'battle', duo: false, team: false, seed: o.seed || 4 });
    },
    endNow: function (winner) { if (world) { BLB.forceEnd(world, winner || 0); } },
    winRound: function (team) { if (world) BLB.forceEnd(world, team || 0); },
    setTime: function (t) { if (world) { world.time = t; world.freeze = 0; } }
  };

  Kit.loop(update, render);
  BBR.boot();
  show('scrTitle');
  paintTitle();
  freshDemo();
  if (document.fonts && document.fonts.load) {
    document.fonts.load('700 40px Fredoka', 'ب').then(function () { BBR.boot(); }).catch(function () {});
  }
  Kit.lifecycle({ pause: function () { pauseGame(); } });
  Kit.ready();
})();
