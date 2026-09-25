/*
 * Fire & Ice — main: screens, input, sound, saving, HUD and the level map.
 */
(function () {
  'use strict';
  var FI = window.FI, R = FI.R, Kit = window.Kit;
  var T = FI.T;
  var LEVELS = FI.LEVELS;
  var NL = LEVELS.length;
  var store = Kit.store('fire-and-ice');

  /* ------------------------------------------------------------ save */
  var save = {
    unlocked: Kit.clamp(store.get('unlocked', 1) | 0, 1, NL),
    best: store.get('best', {}) || {},
    hat: store.get('hat', 'none'),
    solo: !!store.get('solo', false),
    music: store.get('music', true) !== false,
    beaten: !!store.get('beaten', false)
  };
  function persist() {
    store.set('unlocked', save.unlocked); store.set('best', save.best); store.set('hat', save.hat);
    store.set('solo', save.solo); store.set('music', save.music); store.set('beaten', save.beaten);
  }
  function totalStars() {
    var s = 0;
    for (var i = 0; i < NL; i++) if (save.best[i]) s += save.best[i].stars || 0;
    return s;
  }
  function hatUnlocked(h) { return totalStars() >= h.stars; }
  if (!R.HATS.some(function (h) { return h.id === save.hat && hatUnlocked(h); })) save.hat = 'none';

  /* ---------------------------------------------------------- canvas */
  var canvas = document.getElementById('game');
  var layersDirty = true;
  var view = Kit.fit(canvas, R.VW, R.VH, { onResize: function () { layersDirty = true; } });
  var ctx = view.ctx;
  var ptr = Kit.pointer(view);
  var fx = R.particles();
  var shake = Kit.shake();
  Kit.muteButton();
  var $ = function (id) { return document.getElementById(id); };

  /* ----------------------------------------------------------- state */
  var mode = 'title';          // title | map | play | paused
  var world = null, levelIdx = 0;
  var titleWorld = null;
  var anim = { fire: mkAnim(), ice: mkAnim() };
  var soloActive = 'fire';
  var time = 0;
  var deadShown = false, winShown = false, winAt = 0;
  var banner = 0;
  var mapSel = Math.min(save.unlocked, NL) - 1;
  var mapHover = -1;
  var bot = null;
  var flash = 0;
  var lastPush = 0, lastFanSnd = 0;
  var toasts = [];

  function mkAnim() { return { sx: 1, sy: 1, vs: 0, run: 0, blink: 0, bt: 2, face: 1, air: false, vy: 0, push: 0, happy: false, lean: 0, ember: 0 }; }

  /* ----------------------------------------------------------- sound */
  var A = Kit.audio;
  function tone(o) { A.tone(o); }
  function noise(o) { A.noise(o); }
  var SFX = {
    jump: function (k) {
      if (k === 'fire') { tone({ freq: 240, to: 520, type: 'square', dur: 0.12, vol: 0.08 }); noise({ dur: 0.08, vol: 0.05, filter: 2400, to: 900 }); }
      else { tone({ freq: 520, to: 1040, type: 'triangle', dur: 0.12, vol: 0.14 }); tone({ freq: 1560, type: 'sine', dur: 0.06, vol: 0.05, delay: 0.04 }); }
    },
    land: function (v) { tone({ freq: 150, to: 70, type: 'triangle', dur: 0.07, vol: Math.min(0.2, 0.05 + v / 6000) }); },
    gem: function (k) {
      var f = k === 'fire' ? [784, 1175, 1568] : [1047, 1568, 2093];
      f.forEach(function (q, i) { tone({ freq: q, type: k === 'fire' ? 'square' : 'sine', dur: 0.09, vol: k === 'fire' ? 0.07 : 0.13, delay: i * 0.055 }); });
    },
    button: function (on) {
      if (on) { tone({ freq: 320, to: 180, type: 'square', dur: 0.07, vol: 0.09 }); noise({ dur: 0.05, vol: 0.08, filter: 1500 }); }
      else tone({ freq: 380, to: 460, type: 'square', dur: 0.05, vol: 0.05 });
    },
    lever: function () { tone({ freq: 520, type: 'square', dur: 0.03, vol: 0.08 }); tone({ freq: 780, type: 'square', dur: 0.05, vol: 0.08, delay: 0.05 }); noise({ dur: 0.06, vol: 0.06, filter: 3000 }); },
    mover: function () { noise({ dur: 0.35, vol: 0.05, filter: 420, to: 160 }); tone({ freq: 70, to: 90, type: 'sawtooth', dur: 0.3, vol: 0.03 }); },
    moverStop: function () { tone({ freq: 95, to: 55, type: 'triangle', dur: 0.1, vol: 0.12 }); },
    push: function () { noise({ dur: 0.1, vol: 0.05, filter: 700, to: 300 }); },
    portal: function () { tone({ freq: 300, to: 1500, type: 'sine', dur: 0.22, vol: 0.12 }); tone({ freq: 1500, to: 600, type: 'sine', dur: 0.2, vol: 0.08, delay: 0.12 }); },
    bonk: function () { tone({ freq: 210, to: 150, type: 'square', dur: 0.05, vol: 0.05 }); },
    fan: function () { noise({ dur: 0.3, vol: 0.06, filter: 2500, to: 700 }); },
    door: function () { tone({ freq: 660, type: 'sine', dur: 0.1, vol: 0.14 }); tone({ freq: 990, type: 'sine', dur: 0.16, vol: 0.14, delay: 0.08 }); },
    die: function (cause) {
      if (cause === 'lava') { noise({ dur: 0.7, vol: 0.28, filter: 6000, to: 700 }); tone({ freq: 700, to: 180, type: 'triangle', dur: 0.5, vol: 0.18 }); }
      else if (cause === 'water') { noise({ dur: 0.6, vol: 0.28, filter: 2200, to: 250 }); tone({ freq: 380, to: 90, type: 'sawtooth', dur: 0.45, vol: 0.08 }); }
      else { tone({ freq: 220, to: 55, type: 'square', dur: 0.3, vol: 0.12 }); noise({ dur: 0.35, vol: 0.25, filter: 700, to: 120 }); tone({ freq: 120, to: 300, type: 'sine', dur: 0.15, vol: 0.12, delay: 0.25 }); }
      [392, 330, 262].forEach(function (f, i) { tone({ freq: f, type: 'triangle', dur: 0.18, vol: 0.14, delay: 0.35 + i * 0.13 }); });
    },
    win: function () { [523, 659, 784, 1047, 784, 1047, 1319].forEach(function (f, i) { tone({ freq: f, type: 'triangle', dur: 0.16, vol: 0.22, delay: i * 0.09 }); }); },
    star: function (i) { var f = [880, 1109, 1319][i] || 1319; tone({ freq: f, type: 'triangle', dur: 0.3, vol: 0.2 }); tone({ freq: f * 2, type: 'sine', dur: 0.2, vol: 0.07, delay: 0.05 }); },
    swap: function () { tone({ freq: 620, to: 1000, type: 'sine', dur: 0.09, vol: 0.14 }); },
    click: function () { Kit.sfx.click(); },
    locked: function () { tone({ freq: 200, to: 140, type: 'square', dur: 0.12, vol: 0.08 }); }
  };

  // Soft background music: a bouncy temple loop (pentatonic).
  var music = { next: 0, step: 0 };
  var BEAT = 0.26;
  var BASS = [110, 110, 87.31, 87.31, 98, 98, 82.41, 82.41];
  var MEL = [440, 0, 523, 587, 659, 0, 587, 523, 440, 0, 392, 440, 523, 0, 0, 0,
    349, 0, 440, 523, 587, 0, 523, 440, 392, 0, 440, 494, 330, 0, 0, 0,
    440, 0, 659, 0, 784, 659, 587, 523, 587, 0, 523, 440, 392, 0, 440, 0,
    349, 440, 523, 0, 494, 0, 440, 392, 330, 0, 392, 494, 440, 0, 0, 0];
  function updateMusic() {
    var ac = A.ctx;
    if (!ac || A.muted || !save.music || mode === 'paused' || document.hidden) { if (ac) music.next = ac.currentTime + 0.1; return; }
    if (music.next < ac.currentTime) music.next = ac.currentTime + 0.05;
    while (music.next < ac.currentTime + 0.2) {
      var d = music.next - ac.currentTime, s = music.step;
      var bar = Math.floor(s / 8) % 8;
      if (s % 4 === 0) tone({ freq: BASS[bar], type: 'sine', dur: 0.4, vol: 0.09, delay: d });
      if (s % 4 === 2) tone({ freq: BASS[bar] * 1.5, type: 'sine', dur: 0.2, vol: 0.05, delay: d });
      var m = MEL[s % MEL.length];
      if (m) tone({ freq: m, type: 'triangle', dur: 0.22, vol: 0.045, delay: d });
      if (s % 2 === 1) noise({ dur: 0.03, vol: 0.012, filter: 7000, delay: d });
      music.step++; music.next += BEAT;
    }
  }

  /* ---------------------------------------------------------- input */
  var K = Kit.keys;
  function readInput() {
    var ice = { l: K.down('KeyA'), r: K.down('KeyD'), j: K.down('KeyW') };
    var fire = { l: K.down('ArrowLeft'), r: K.down('ArrowRight'), j: K.down('ArrowUp') };
    if (save.solo) {
      var both = { l: ice.l || fire.l, r: ice.r || fire.r, j: ice.j || fire.j || K.down('Space') };
      var none = { l: false, r: false, j: false };
      return soloActive === 'fire' ? { fire: both, ice: none } : { ice: both, fire: none };
    }
    return { ice: ice, fire: fire };
  }
  function enterPressed() { return K.pressed('Enter') || K.pressed('Space') || K.pressed('NumpadEnter'); }

  /* ------------------------------------------------------- overlays */
  var overlays = ['titleScreen', 'pauseScreen', 'deadScreen', 'winScreen', 'finalScreen'];
  function showOverlay(id) {
    overlays.forEach(function (o) { $(o).hidden = o !== id; });
  }
  function hideOverlays() { showOverlay(null); }

  /* ----------------------------------------------------------- flow */
  function goTitle() {
    mode = 'title';
    world = null; bot = null;
    showOverlay('titleScreen');
    refreshTitle();
    $('pauseBtn').hidden = true;
  }
  function goMap() {
    mode = 'map';
    world = null; bot = null;
    hideOverlays();
    $('pauseBtn').hidden = true;
    mapSel = Kit.clamp(mapSel, 0, save.unlocked - 1);
  }
  function startLevel(i) {
    levelIdx = i;
    bot = null;
    world = FI.build(LEVELS[i], i);
    R.prepare(world, view.scale * view.dpr);
    layersDirty = false;
    anim = { fire: mkAnim(), ice: mkAnim() };
    anim.ice.face = 1; anim.fire.face = -1;
    world.fire.face = world.fire.x > world.ice.x ? 1 : -1;
    fx.clear();
    deadShown = false; winShown = false;
    mode = 'play';
    hideOverlays();
    $('pauseBtn').hidden = false;
    banner = 2.2;
    flash = 0.35;
    K.reset();
  }
  function restart() { if (world) { SFX.click(); startLevel(levelIdx); } }
  function pause() {
    if (mode !== 'play' || !world || world.state !== 'play') return;
    mode = 'paused';
    refreshPause();
    showOverlay('pauseScreen');
    SFX.click();
  }
  function resume() {
    if (mode !== 'paused') return;
    mode = 'play';
    hideOverlays();
    K.reset();
    SFX.click();
  }
  function continueLevel() {
    // first level without a gold medal among the unlocked ones, else the newest
    for (var i = 0; i < save.unlocked; i++) if (!save.best[i]) return i;
    return save.unlocked - 1;
  }

  /* -------------------------------------------------------- title UI */
  function refreshTitle() {
    var st = totalStars();
    $('titleStars').textContent = st + ' / ' + NL * 3;
    $('titleLevel').textContent = save.beaten ? 'Temple escaped! Go for gold!' : 'Level ' + (continueLevel() + 1) + ' of ' + NL;
    $('modeDuo').classList.toggle('on', !save.solo);
    $('modeSolo').classList.toggle('on', save.solo);
    $('howSolo').hidden = !save.solo;
    $('howDuo').hidden = save.solo;
    $('playBtn').textContent = (save.unlocked > 1 || save.best[0]) ? '▶  Continue' : '▶  Play';
  }
  function setSolo(v) {
    save.solo = !!v; persist(); refreshTitle(); refreshPause();
  }
  function refreshPause() {
    $('pauseSolo').textContent = save.solo ? 'Solo mode: ON' : 'Solo mode: OFF';
    $('pauseMusic').textContent = save.music ? 'Music: ON' : 'Music: OFF';
    $('pauseLevel').textContent = world ? 'Level ' + (levelIdx + 1) + ' · ' + LEVELS[levelIdx].name : '';
  }

  /* ------------------------------------------------------ win / dead */
  function fmtTime(t) {
    var m = Math.floor(t / 60), s = t - m * 60;
    return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
  }
  function fmtPar(t) { var m = Math.floor(t / 60), s = Math.round(t - m * 60); return m + ':' + (s < 10 ? '0' : '') + s; }

  var winTimers = [];
  function showWin() {
    winShown = true;
    var def = LEVELS[levelIdx], w = world;
    var gemsAll = w.gemsGot.fire === w.gemsTotal.fire && w.gemsGot.ice === w.gemsTotal.ice;
    var fast = w.t <= def.par;
    var stars = 1 + (gemsAll ? 1 : 0) + (fast ? 1 : 0);
    var prev = save.best[levelIdx];
    var starsBefore = totalStars();
    var newBest = !prev || stars > prev.stars || w.t < prev.time - 0.05;
    var rec = prev ? { stars: Math.max(prev.stars, stars), time: Math.min(prev.time, w.t) } : { stars: stars, time: w.t };
    save.best[levelIdx] = rec;
    var firstClear = levelIdx === NL - 1 && !save.beaten;
    if (levelIdx + 1 < NL) save.unlocked = Math.max(save.unlocked, levelIdx + 2);
    if (levelIdx === NL - 1) save.beaten = true;
    var starsAfter = totalStars();
    var newHats = R.HATS.filter(function (h) { return h.stars > starsBefore && h.stars <= starsAfter; });
    if (newHats.length) save.hat = newHats[newHats.length - 1].id;
    persist();

    var medal = ['bronze', 'silver', 'gold'][stars - 1];
    $('winMedal').className = 'medal ' + medal;
    $('winMedalText').textContent = medal.toUpperCase();
    $('winTitle').textContent = def.name + ' escaped!';
    var crit = [
      ['Escaped the level', true],
      ['All gems  ' + (w.gemsGot.fire + w.gemsGot.ice) + ' / ' + (w.gemsTotal.fire + w.gemsTotal.ice), gemsAll],
      ['Beat par time  ' + fmtPar(def.par), fast]
    ];
    var box = $('winStars');
    box.innerHTML = '';
    crit.forEach(function (c, i) {
      var d = document.createElement('div');
      d.className = 'crit' + (c[1] ? ' got' : '');
      d.innerHTML = '<span class="bigstar">★</span><span class="clabel"></span>';
      d.querySelector('.clabel').textContent = c[0];
      box.appendChild(d);
    });
    $('winTime').textContent = 'Time ' + fmtTime(w.t) + (prev ? '   ·   Best ' + fmtTime(rec.time) : '');
    $('winNew').hidden = !(newBest && prev);
    $('winHat').hidden = !newHats.length;
    if (newHats.length) $('winHat').textContent = '🎩 New hat unlocked: ' + newHats[newHats.length - 1].name + '!';
    $('winNext').hidden = levelIdx >= NL - 1;
    $('winFinal').hidden = levelIdx < NL - 1;
    showOverlay('winScreen');
    // pop stars one by one
    winTimers.forEach(clearTimeout); winTimers = [];
    var els = box.querySelectorAll('.crit');
    crit.forEach(function (c, i) {
      winTimers.push(setTimeout(function () {
        if (mode !== 'play') return;
        els[i].classList.add('show');
        if (c[1]) SFX.star(i);
      }, 350 + i * 380));
    });
    if (newBest && prev) winTimers.push(setTimeout(function () { if (mode === 'play') SFX.win(); }, 1500));
    if (firstClear) winTimers.push(setTimeout(function () { if (mode === 'play' && winShown) showFinal(); }, 2600));
  }
  function showFinal() {
    $('finalStars').textContent = totalStars() + ' / ' + NL * 3;
    showOverlay('finalScreen');
    SFX.win();
    for (var i = 0; i < 120; i++) confetti(Math.random() * 1280, -20 - Math.random() * 200, true);
  }
  function nextLevel() {
    if (levelIdx + 1 < NL) { SFX.click(); startLevel(levelIdx + 1); }
    else { SFX.click(); goMap(); }
  }

  var DEATH = {
    lava: ['Ice melted!', 'Ice can’t touch the lava. Only Fire can walk on it!'],
    water: ['Fire fizzled out!', 'Fire can’t touch the water. Only Ice can swim in it!'],
    goo: ['Splat! Green goo!', 'Green goo is bad for BOTH of you. Jump over it!']
  };
  function showDead() {
    deadShown = true;
    var d = DEATH[world.deadCause] || DEATH.goo;
    var t = world.deadCause === 'goo' ? (world.deadWho === 'fire' ? 'Splat! Fire fell in the goo!' : 'Splat! Ice fell in the goo!') : d[0];
    $('deadTitle').textContent = t;
    $('deadTip').textContent = d[1];
    $('deadScreen').className = 'sg-overlay dead-' + world.deadWho;
    showOverlay('deadScreen');
  }

  /* ---------------------------------------------------------- events */
  function feet(p) { return { x: p.x + p.w / 2, y: p.y + p.h }; }
  function handleEvents(w, quiet) {
    var ev = w.events;
    for (var i = 0; i < ev.length; i++) {
      var e = ev[i];
      switch (e.t) {
        case 'jump': {
          var f = feet(e.p), a = anim[e.p.kind];
          a.sy = 1.32; a.vs = 0;
          if (!quiet) SFX.jump(e.p.kind);
          fx.burst(f.x, f.y - 2, { count: 7, colors: ['#d8c3a0', '#b89c74'], speed: 90, angle: -Math.PI / 2, spread: Math.PI * 0.9, life: 0.35, size: 3.5, g: 200, drag: 3 });
          if (e.p.kind === 'fire') fx.burst(f.x, f.y - 10, { count: 5, colors: ['#ffb347', '#ff6a00', '#ffe066'], speed: 120, life: 0.5, size: 2.5, g: -100, add: true });
          else fx.burst(f.x, f.y - 10, { count: 5, colors: ['#e8fbff', '#9fe6ff'], speed: 110, life: 0.5, size: 2.4, g: 60, shape: 2 });
          break;
        }
        case 'land': {
          var f2 = feet(e.p), a2 = anim[e.p.kind];
          var v = Math.min(900, e.v || 0);
          a2.sy = 1 - Math.min(0.34, v / 2200); a2.vs = 0;
          if (!quiet) SFX.land(v);
          fx.burst(f2.x, f2.y - 1, { count: Math.round(4 + v / 90), colors: ['#d8c3a0', '#b89c74', '#fff2d8'], speed: 60 + v / 6, angle: -Math.PI / 2, spread: Math.PI * 1.2, life: 0.4, size: 3.4, g: 300, drag: 2 });
          if (v > 700) shake.add(3);
          break;
        }
        case 'gem': {
          if (!quiet) SFX.gem(e.gem.kind);
          var col = e.gem.kind === 'fire' ? ['#ff3b2f', '#ffb347', '#fff1a8'] : ['#1fa2ff', '#9ce8ff', '#ffffff'];
          fx.burst(e.gem.x, e.gem.y, { count: 16, colors: col, speed: 220, life: 0.6, size: 3, g: 100, shape: 2, add: true, drag: 2 });
          toast('+1', e.gem.x, e.gem.y - 10, e.gem.kind === 'fire' ? '#ffb347' : '#9ce8ff');
          break;
        }
        case 'button': {
          if (!quiet) SFX.button(e.on);
          if (e.on) fx.burst(e.b.x + 16, e.b.y + 28, { count: 8, color: FI.CHAN_COLORS[e.b.ch], speed: 120, angle: -Math.PI / 2, spread: 2, life: 0.35, size: 2.5, g: 300, add: true });
          break;
        }
        case 'lever': {
          if (!quiet) SFX.lever();
          fx.burst(e.lv.x + 16, e.lv.y + 12, { count: 10, colors: [FI.CHAN_COLORS[e.lv.ch], '#fff'], speed: 160, life: 0.35, size: 2.2, g: 400, add: true });
          break;
        }
        case 'moverStart': if (!quiet && e.m.ch && !e.m.auto) SFX.mover(); break;
        case 'moverStop': if (!quiet && e.m.ch && !e.m.auto) SFX.moverStop(); break;
        case 'bonk': if (!quiet) SFX.bonk(); break;
        case 'portal': {
          if (!quiet) SFX.portal();
          var pc = e.from.color;
          fx.burst(e.from.x + 16, e.from.y + 32, { count: 18, colors: [pc, '#fff'], speed: 200, life: 0.5, size: 3, g: 0, add: true, drag: 3 });
          fx.burst(e.to.x + 16, e.to.y + 32, { count: 22, colors: [pc, '#fff'], speed: 240, life: 0.6, size: 3, g: 0, add: true, drag: 3 });
          if (e.e.isPlayer) { anim[e.e.kind].sy = 0.7; anim[e.e.kind].vs = 0; }
          break;
        }
        case 'door': {
          if (!quiet) SFX.door();
          var ex = w.exits[e.kind];
          fx.burst(ex.x + 16, ex.y + 20, { count: 14, colors: e.kind === 'fire' ? ['#ffb347', '#fff1a8'] : ['#9ce8ff', '#ffffff'], speed: 130, life: 0.7, size: 2.6, g: -40, shape: 2, add: true, drag: 1 });
          break;
        }
        case 'die': {
          var p = e.p, cx = p.x + p.w / 2, cy = p.y + p.h / 2;
          if (!quiet) SFX.die(e.cause);
          shake.add(9);
          if (e.cause === 'lava') {
            fx.burst(cx, cy, { count: 26, colors: ['#ffffff', '#dfe8ee', '#c7d3dc'], speed: 140, life: 1.1, size: 7, g: -160, drag: 1.5 });
            fx.burst(cx, cy + 10, { count: 18, colors: ['#4fb8ff', '#9fe6ff', '#ffffff'], speed: 260, angle: -Math.PI / 2, spread: 2.2, life: 0.7, size: 3.5, g: 700 });
          } else if (e.cause === 'water') {
            fx.burst(cx, cy, { count: 26, colors: ['#5b5b66', '#7c7c88', '#44444f'], speed: 130, life: 1.2, size: 7, g: -150, drag: 1.5 });
            fx.burst(cx, cy + 10, { count: 16, colors: ['#ff9100', '#ffe066', '#ff3d00'], speed: 240, angle: -Math.PI / 2, spread: 2.2, life: 0.6, size: 3, g: 600, add: true });
          } else {
            fx.burst(cx, cy + 8, { count: 30, colors: ['#8cf04a', '#57d62f', '#d8ff5c', p.kind === 'fire' ? '#ff7a1f' : '#4fb8ff'], speed: 300, angle: -Math.PI / 2, spread: 2.6, life: 0.8, size: 5, g: 900 });
          }
          break;
        }
        case 'win': {
          if (!quiet) SFX.win();
          ['fire', 'ice'].forEach(function (k) {
            var ex2 = w.exits[k];
            for (var c = 0; c < 30; c++) confetti(ex2.x + 16, ex2.y + 10, false);
          });
          winAt = time;
          break;
        }
      }
    }
    ev.length = 0;
  }
  var CONF = ['#ff5a1f', '#ffd230', '#2f9bff', '#8cf04a', '#ff6fae', '#b56cff', '#ffffff'];
  function confetti(x, y, screen) {
    var p = fx.add({ x: x, y: y, vx: (Math.random() - 0.5) * (screen ? 200 : 420), vy: screen ? 60 + Math.random() * 120 : -250 - Math.random() * 300,
      life: screen ? 3 + Math.random() * 1.5 : 1.6 + Math.random(), size: 3 + Math.random() * 3, color: CONF[Math.floor(Math.random() * CONF.length)], g: screen ? 90 : 520, drag: 0.8, shape: 1 });
    p.shrink = false; p.screen = !!screen;
  }
  function toast(text, x, y, color) {
    toasts.push({ text: text, x: x, y: y, color: color, life: 0.9 });
    if (toasts.length > 12) toasts.shift();
  }

  /* ------------------------------------------------------ animation */
  function updAnim(a, p, dt, w) {
    var sp = Math.abs(p.vx);
    a.face = p.face;
    a.air = !p.grounded && !p.inFan ? true : !p.grounded;
    a.vy = p.vy;
    if (p.grounded && sp > 15) a.run += dt * sp * 0.055;
    else a.run += (Math.round(a.run / Math.PI) * Math.PI - a.run) * Math.min(1, dt * 10);
    a.vs += ((1 - a.sy) * 420 - a.vs * 16) * dt;
    a.sy += a.vs * dt;
    if (a.air && Math.abs(a.sy - 1) < 0.08) a.sy += (1 + Kit.clamp(-p.vy / 3000, -0.08, 0.12) - a.sy) * Math.min(1, dt * 12);
    a.sx = 1 + (1 - a.sy) * 0.85;
    a.bt -= dt;
    if (a.blink > 0) a.blink -= dt;
    if (a.bt < 0) { a.blink = 0.13; a.bt = 1.8 + Math.random() * 3; }
    a.push = !!p.pushing;
    a.happy = p.atDoor || (w.state === 'won');
    a.lean += ((p.pushing ? 0.2 : Kit.clamp(p.vx / 1600, -0.12, 0.12) * p.face) - a.lean) * Math.min(1, dt * 12);
    a.vxn = p.vx / 235;
    // ambient particles
    a.ember -= dt;
    if (a.ember < 0 && p.alive) {
      if (p.kind === 'fire') {
        a.ember = 0.07 + Math.random() * 0.08;
        fx.add({ x: p.x + p.w / 2 + (Math.random() - 0.5) * 12, y: p.y - 8, vx: (Math.random() - 0.5) * 30 - p.vx * 0.2, vy: -40 - Math.random() * 50, life: 0.5, size: 2.2, color: Math.random() < 0.5 ? '#ffb347' : '#ffe066', g: -40, add: true });
      } else {
        a.ember = 0.18 + Math.random() * 0.2;
        fx.add({ x: p.x + p.w / 2 + (Math.random() - 0.5) * 18, y: p.y - 4 + Math.random() * 10, vx: (Math.random() - 0.5) * 20, vy: -10, life: 0.6, size: 2, color: '#e8fbff', g: 30, shape: 2 });
      }
    }
    if (p.pushing && time - lastPush > 0.14 && p.grounded) {
      lastPush = time; SFX.push();
      fx.burst(p.x + p.w / 2 + p.pushing * 20, p.y + p.h - 2, { count: 2, color: '#c9ad85', speed: 60, angle: -Math.PI / 2, spread: 1.5, life: 0.3, size: 2.5, g: 200 });
    }
    if (p.inFan && time - lastFanSnd > 0.6) { lastFanSnd = time; SFX.fan(); }
  }
  function ambientWorld(w, dt) {
    // embers off lava, occasional drips
    var runs = w.deco.runs;
    for (var i = 0; i < runs.length; i++) {
      var r = runs[i];
      if (Math.random() < dt * r.w / 32 * (r.type === 2 ? 0.7 : 0.25)) {
        var lava = r.type === FI.TILE.LAVA, goo = r.type === FI.TILE.GOO;
        fx.add({ x: r.x + Math.random() * r.w, y: r.y + 8, vx: (Math.random() - 0.5) * 20, vy: -30 - Math.random() * 50, life: 0.9, size: lava ? 2.2 : 1.8,
          color: lava ? '#ffb347' : goo ? '#d8ff5c' : '#dff8ff', g: lava ? -20 : 40, add: lava, back: true });
      }
    }
    for (i = 0; i < w.fans.length; i++) {
      var f = w.fans[i];
      if (f.on && Math.random() < dt * 6) fx.add({ x: f.x + 4 + Math.random() * (f.w - 8), y: f.y, vx: 0, vy: -250 - Math.random() * 100, life: (f.y - f.top) / 330, size: 1.8, color: 'rgba(255,255,255,0.8)', g: 0, back: true });
    }
  }

  /* --------------------------------------------------------- update */
  function update(dt) {
    time += dt;
    if (layersDirty) {
      layersDirty = false;
      if (world) R.prepare(world, view.scale * view.dpr);
      if (titleWorld) R.prepare(titleWorld, view.scale * view.dpr);
    }
    updateMusic();
    if (mode === 'title') updateTitle(dt);
    else if (mode === 'map') updateMap(dt);
    else if (mode === 'play') updatePlay(dt);
    else if (mode === 'paused') {
      if (K.pressed('KeyP') || K.pressed('Escape') || enterPressed()) resume();
      else if (K.pressed('KeyR')) restart();
    }
    fx.update(dt);
    shake.update(dt);
    for (var i = toasts.length - 1; i >= 0; i--) { toasts[i].life -= dt; toasts[i].y -= 40 * dt; if (toasts[i].life <= 0) toasts.splice(i, 1); }
    if (flash > 0) flash -= dt;
    if (banner > 0) banner -= dt;
    K.endFrame();
    ptr.endFrame();
  }

  function updatePlay(dt) {
    var w = world;
    if (w.state === 'play') {
      if (K.pressed('KeyP') || K.pressed('Escape')) { pause(); return; }
      if (K.pressed('KeyR')) { restart(); return; }
      if (save.solo && (K.pressed('Tab') || K.pressed('ShiftLeft') || K.pressed('ShiftRight'))) {
        soloActive = soloActive === 'fire' ? 'ice' : 'fire';
        SFX.swap();
        var sp = w[soloActive];
        fx.burst(sp.x + sp.w / 2, sp.y + 10, { count: 12, colors: soloActive === 'fire' ? ['#ffb347', '#fff1a8'] : ['#9ce8ff', '#fff'], speed: 150, life: 0.4, size: 2.5, g: 0, shape: 2, add: true, drag: 2 });
        anim[soloActive].sy = 1.2; anim[soloActive].vs = 0;
      }
    }
    var input;
    if (bot) { input = FI.botInput(); try { bot.tick(w, input); } catch (e) { bot = null; } if (bot && bot.done()) bot = null; }
    else input = readInput();
    FI.step(w, input, dt);
    handleEvents(w, false);
    updAnim(anim.fire, w.fire, dt, w);
    updAnim(anim.ice, w.ice, dt, w);
    ambientWorld(w, dt);
    if (w.state === 'dead') {
      if (!deadShown && w.deadT > 0.85) showDead();
      if (w.deadT > 0.25 && (K.pressed('KeyR') || (deadShown && enterPressed()))) restart();
      else if (deadShown && K.pressed('Escape')) { SFX.click(); goMap(); }
    } else if (w.state === 'won') {
      if (!winShown && time - winAt > 0.7) showWin();
      if (winShown) {
        if (!$('finalScreen').hidden) { if (enterPressed() || K.pressed('Escape')) { SFX.click(); goMap(); } }
        else if (enterPressed()) nextLevel();
        else if (K.pressed('KeyR')) restart();
        else if (K.pressed('Escape') || K.pressed('KeyL')) { SFX.click(); goMap(); }
      }
    }
  }

  /* ----------------------------------------------------- title scene */
  var TITLE_MAP = [
    '########################################',
    '#......................................#',
    '#......................................#',
    '#......................................#',
    '#......................................#',
    '#......................................#',
    '#......................................#',
    '#......................................#',
    '#......................................#',
    '#......................................#',
    '#......................................#',
    '#......................................#',
    '#......................................#',
    '#.i..................................f.#',
    '#---...............................---.#',
    '#......................................#',
    '#.........#....................#.......#',
    '#.........#....................#.......#',
    '#.........#....................#.......#',
    '#...I.....#....................#...F...#',
    '###WWW#####....................###LLL###',
    '########################################'
  ];
  var titleAI = { ice: { t: 0, dir: 0, j: false }, fire: { t: 0.7, dir: 0, j: false } };
  function ensureTitleWorld() {
    if (titleWorld) return;
    titleWorld = FI.build({ name: 'title', map: TITLE_MAP, signs: [] }, 40);
    R.prepare(titleWorld, view.scale * view.dpr);
  }
  function aiInput(dt) {
    var out = {};
    ['ice', 'fire'].forEach(function (k) {
      var s = titleAI[k];
      s.t -= dt;
      if (s.t < 0) {
        var r = Math.random();
        s.dir = r < 0.35 ? -1 : r < 0.7 ? 1 : 0;
        s.j = Math.random() < 0.55;
        s.t = 0.35 + Math.random() * 0.9;
        s.jt = 0.25;
      }
      s.jt -= dt;
      out[k] = { l: s.dir < 0, r: s.dir > 0, j: s.j && s.jt > 0 };
    });
    return out;
  }
  function updateTitle(dt) {
    ensureTitleWorld();
    var w = titleWorld;
    FI.step(w, aiInput(dt), dt);
    handleEvents(w, true);
    updAnim(anim.fire, w.fire, dt, w);
    updAnim(anim.ice, w.ice, dt, w);
    ambientWorld(w, dt);
    if (enterPressed()) { SFX.click(); startLevel(continueLevel()); }
    else if (K.pressed('KeyL')) { SFX.click(); goMap(); }
    else if (K.pressed('Digit1')) setSolo(false);
    else if (K.pressed('Digit2')) setSolo(true);
  }

  /* -------------------------------------------------------- level map */
  var NODES = [];
  (function () {
    var xs = [230, 500, 770, 1040];
    for (var i = 0; i < NL; i++) {
      var row = Math.floor(i / 4), col = i % 4;
      if (row % 2 === 1) col = 3 - col;
      NODES.push({ x: xs[col], y: 555 - row * 170 });
    }
  })();
  var MAPBTN = {
    back: { x: 30, y: 648, w: 150, h: 50 },
    hatL: { x: 1000, y: 650, w: 44, h: 46 },
    hatR: { x: 1210, y: 650, w: 44, h: 46 },
    play: { x: 540, y: 648, w: 200, h: 54 }
  };
  function inBtn(b, x, y) { return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h; }
  function cycleHat(d) {
    var list = R.HATS, i = 0;
    for (var k = 0; k < list.length; k++) if (list[k].id === save.hat) i = k;
    for (var n = 0; n < list.length; n++) {
      i = (i + d + list.length) % list.length;
      if (hatUnlocked(list[i])) break;
    }
    save.hat = list[i].id; persist();
    SFX.swap();
  }
  function tryStart(i) {
    if (i < save.unlocked) { SFX.click(); startLevel(i); }
    else SFX.locked();
  }
  function updateMap(dt) {
    ensureTitleWorld();
    var w = titleWorld;
    FI.step(w, { ice: { l: false, r: false, j: false }, fire: { l: false, r: false, j: false } }, dt);
    w.events.length = 0;
    updAnim(anim.fire, w.fire, dt, w); updAnim(anim.ice, w.ice, dt, w);
    var prevSel = mapSel;
    if (K.pressed('ArrowRight') || K.pressed('KeyD')) mapSel++;
    if (K.pressed('ArrowLeft') || K.pressed('KeyA')) mapSel--;
    if (K.pressed('ArrowUp') || K.pressed('KeyW')) mapSel += 4;
    if (K.pressed('ArrowDown') || K.pressed('KeyS')) mapSel -= 4;
    mapSel = Kit.clamp(mapSel, 0, save.unlocked - 1);
    if (mapSel !== prevSel) SFX.click();
    if (K.pressed('KeyH')) cycleHat(1);
    if (enterPressed()) tryStart(mapSel);
    else if (K.pressed('Escape')) { SFX.click(); goTitle(); return; }
    mapHover = -1;
    for (var i = 0; i < NL; i++) if (Kit.dist(ptr.x, ptr.y, NODES[i].x, NODES[i].y) < 48) mapHover = i;
    canvas.style.cursor = (mapHover >= 0 && mapHover < save.unlocked) || inBtn(MAPBTN.back, ptr.x, ptr.y) || inBtn(MAPBTN.hatL, ptr.x, ptr.y) || inBtn(MAPBTN.hatR, ptr.x, ptr.y) || inBtn(MAPBTN.play, ptr.x, ptr.y) ? 'pointer' : 'default';
    if (ptr.pressed) {
      if (mapHover >= 0) { if (mapHover < save.unlocked) { if (mapSel === mapHover) tryStart(mapHover); else { mapSel = mapHover; SFX.click(); } } else SFX.locked(); }
      else if (inBtn(MAPBTN.back, ptr.x, ptr.y)) { SFX.click(); goTitle(); }
      else if (inBtn(MAPBTN.hatL, ptr.x, ptr.y)) cycleHat(-1);
      else if (inBtn(MAPBTN.hatR, ptr.x, ptr.y)) cycleHat(1);
      else if (inBtn(MAPBTN.play, ptr.x, ptr.y)) tryStart(mapSel);
    }
  }

  /* --------------------------------------------------------- render */
  function render() {
    var g = ctx;
    g.fillStyle = '#140c08';
    g.fillRect(0, 0, R.VW, R.VH);
    if (mode === 'title') renderTitle(g);
    else if (mode === 'map') renderMap(g);
    else if (world) renderPlay(g);
    // screen-space confetti on top
    if (flash > 0) { g.fillStyle = 'rgba(20,10,5,' + Math.min(1, flash / 0.35) + ')'; g.fillRect(0, 0, R.VW, R.VH); }
  }

  function renderTitle(g) {
    if (!titleWorld) return;
    R.drawWorld(g, titleWorld, time, anim, fx, { hat: save.hat === 'none' ? null : save.hat });
  }

  function renderPlay(g) {
    var w = world;
    R.drawWorld(g, w, time, anim, fx, { shakeX: shake.x, shakeY: shake.y, hat: save.hat === 'none' ? null : save.hat, soloActive: save.solo ? soloActive : null });
    // toasts in world space
    g.save(); g.translate(w.cam.ox, w.cam.oy); g.scale(w.cam.s, w.cam.s);
    g.textAlign = 'center'; g.font = '700 18px ' + R.FONT;
    toasts.forEach(function (t) {
      g.globalAlpha = Math.min(1, t.life * 2.5);
      g.lineWidth = 4; g.strokeStyle = 'rgba(30,10,0,0.8)'; g.strokeText(t.text, t.x, t.y);
      g.fillStyle = t.color; g.fillText(t.text, t.x, t.y);
    });
    g.globalAlpha = 1; g.textAlign = 'left';
    // "waiting" bubbles
    ['fire', 'ice'].forEach(function (k) {
      var p = w[k], o = w[k === 'fire' ? 'ice' : 'fire'];
      if (w.state === 'play' && p.atDoor && !o.atDoor) bubble(g, p.x + p.w / 2, p.y - 18, k === 'fire' ? 'Come on, Ice!' : 'Come on, Fire!', time);
    });
    g.restore();
    drawHud(g, w);
  }

  function bubble(g, x, y, text, t) {
    g.font = '600 13px ' + R.FONT;
    var tw = g.measureText(text).width + 16;
    y += Math.sin(t * 4) * 2;
    g.fillStyle = 'rgba(255,255,255,0.95)';
    R.rr(g, x - tw / 2, y - 24, tw, 22, 10); g.fill();
    g.beginPath(); g.moveTo(x - 5, y - 3); g.lineTo(x + 5, y - 3); g.lineTo(x, y + 4); g.fill();
    g.fillStyle = '#2a1a10'; g.textAlign = 'center';
    g.fillText(text, x, y - 8.5);
    g.textAlign = 'left';
  }

  function pill(g, x, y, w, h) {
    g.fillStyle = 'rgba(18,10,6,0.62)';
    R.rr(g, x, y, w, h, h / 2); g.fill();
    g.strokeStyle = 'rgba(255,220,160,0.22)'; g.lineWidth = 2; g.stroke();
  }

  function drawHud(g, w) {
    var def = LEVELS[levelIdx];
    g.textBaseline = 'middle';
    // level name
    g.font = '700 18px ' + R.FONT;
    var name = def.name;
    var nw = g.measureText(name).width;
    pill(g, 10, 6, nw + 62, 34);
    g.fillStyle = '#ffcc33';
    g.beginPath(); g.arc(28, 23, 13, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#3a2400'; g.textAlign = 'center'; g.font = '700 16px ' + R.FONT;
    g.fillText(String(levelIdx + 1), 28, 24);
    g.textAlign = 'left'; g.fillStyle = '#fff'; g.font = '700 18px ' + R.FONT;
    g.fillText(name, 48, 24);
    // key reminder
    g.font = '600 13px ' + R.FONT; g.fillStyle = 'rgba(255,240,210,0.6)';
    g.fillText('R restart  ·  P pause', nw + 84, 24);
    // timer
    var under = w.t <= def.par;
    pill(g, 560, 6, 160, 34);
    g.textAlign = 'center';
    g.font = '700 20px ' + R.FONT;
    g.fillStyle = under ? '#ffe066' : '#ffffff';
    g.fillText(fmtTime(w.t), 618, 24);
    g.font = '600 12px ' + R.FONT;
    g.fillStyle = under ? 'rgba(255,230,120,0.9)' : 'rgba(255,255,255,0.55)';
    g.fillText('par ' + fmtPar(def.par), 685, 25);
    // gems
    pill(g, 970, 6, 190, 34);
    R.drawGem(g, 996, 23, 'fire', time, 0.8);
    R.drawGem(g, 1082, 23, 'ice', time + 1, 0.8);
    g.font = '700 18px ' + R.FONT; g.textAlign = 'left'; g.fillStyle = '#fff';
    g.fillText(w.gemsGot.fire + '/' + w.gemsTotal.fire, 1011, 24);
    g.fillText(w.gemsGot.ice + '/' + w.gemsTotal.ice, 1097, 24);
    // solo banner
    if (save.solo && w.state === 'play') {
      var who = soloActive === 'fire' ? 'FIRE' : 'ICE';
      g.font = '700 16px ' + R.FONT;
      var txt = 'SOLO:  moving ' + who + '   ·   Tab / Shift = swap';
      var tw = g.measureText(txt).width + 40;
      pill(g, 640 - tw / 2, 676, tw, 34);
      g.textAlign = 'center';
      g.fillStyle = soloActive === 'fire' ? '#ffb347' : '#9ce8ff';
      g.fillText(txt, 640, 694);
    }
    // level banner
    if (banner > 0) {
      var k = banner > 1.9 ? (2.2 - banner) / 0.3 : banner < 0.4 ? banner / 0.4 : 1;
      g.globalAlpha = Math.max(0, Math.min(1, k));
      g.fillStyle = 'rgba(15,8,4,0.55)';
      g.fillRect(0, 290, 1280, 110);
      g.textAlign = 'center';
      g.font = '700 22px ' + R.FONT; g.fillStyle = '#ffcc33';
      g.fillText('LEVEL ' + (levelIdx + 1), 640, 318);
      g.font = '700 46px ' + R.FONT; g.fillStyle = '#fff';
      g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,0.4)'; g.strokeText(def.name, 640, 362);
      g.fillText(def.name, 640, 362);
      g.globalAlpha = 1;
    }
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  }

  function renderMap(g) {
    if (titleWorld) R.drawWorld(g, titleWorld, time, anim, null, { hat: null, noKids: true });
    g.fillStyle = 'rgba(12,6,3,0.62)'; g.fillRect(0, 0, 1280, 720);
    g.textBaseline = 'middle';
    // header
    g.textAlign = 'center';
    g.font = '700 44px ' + R.FONT;
    g.lineWidth = 8; g.strokeStyle = 'rgba(0,0,0,0.5)';
    g.strokeText('Temple Map', 640, 48);
    var tg = g.createLinearGradient(0, 28, 0, 70); tg.addColorStop(0, '#ffe27a'); tg.addColorStop(1, '#ff9a2b');
    g.fillStyle = tg; g.fillText('Temple Map', 640, 48);
    // star total
    pill(g, 30, 26, 170, 42);
    g.font = '700 22px ' + R.FONT; g.fillStyle = '#ffd230';
    g.fillText('★ ' + totalStars() + ' / ' + NL * 3, 115, 48);
    // path
    g.lineCap = 'round';
    for (var i = 0; i < NL - 1; i++) {
      var a = NODES[i], b = NODES[i + 1];
      var done = i + 1 < save.unlocked;
      g.strokeStyle = done ? 'rgba(255,214,120,0.85)' : 'rgba(255,255,255,0.18)';
      g.lineWidth = 7; g.setLineDash([2, 16]);
      g.beginPath(); g.moveTo(a.x, a.y);
      if (a.y !== b.y) { var dx = a.x > 640 ? 110 : -110; g.bezierCurveTo(a.x + dx, a.y, b.x + dx, b.y, b.x, b.y); }
      else g.lineTo(b.x, b.y);
      g.stroke();
    }
    g.setLineDash([]);
    // top goal
    var goal = NODES[NL - 1];
    // nodes
    for (i = 0; i < NL; i++) {
      var n = NODES[i], unlocked = i < save.unlocked, best = save.best[i];
      var sel = i === mapSel, hov = i === mapHover;
      var bounce = sel ? Math.sin(time * 5) * 4 : 0;
      var r = sel ? 44 : hov && unlocked ? 42 : 38;
      var y = n.y + bounce;
      if (sel) { g.globalCompositeOperation = 'lighter'; R.drawGlow(g, 'rgba(255,200,80,0.55)', n.x, y, 80); g.globalCompositeOperation = 'source-over'; }
      g.fillStyle = 'rgba(0,0,0,0.4)'; g.beginPath(); g.ellipse(n.x, n.y + 40, r * 0.9, 10, 0, 0, Math.PI * 2); g.fill();
      var ring = best ? (best.stars === 3 ? '#ffd230' : best.stars === 2 ? '#dfe7f2' : '#e0955a') : unlocked ? '#b98a4e' : '#5a5a60';
      g.fillStyle = '#2a170a'; g.beginPath(); g.arc(n.x, y, r + 4, 0, Math.PI * 2); g.fill();
      g.fillStyle = ring; g.beginPath(); g.arc(n.x, y, r, 0, Math.PI * 2); g.fill();
      var inner = g.createLinearGradient(0, y - r, 0, y + r);
      if (unlocked) { var fireish = i % 2 === 0; inner.addColorStop(0, fireish ? '#ff9a3c' : '#5cc8ff'); inner.addColorStop(1, fireish ? '#d9380f' : '#1d63d6'); }
      else { inner.addColorStop(0, '#77757a'); inner.addColorStop(1, '#46444a'); }
      g.fillStyle = inner; g.beginPath(); g.arc(n.x, y, r - 6, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.25)'; g.beginPath(); g.ellipse(n.x - 8, y - r * 0.42, r * 0.45, r * 0.2, -0.3, 0, Math.PI * 2); g.fill();
      if (unlocked) {
        g.font = '700 ' + (sel ? 34 : 30) + 'px ' + R.FONT; g.fillStyle = '#fff';
        g.lineWidth = 5; g.strokeStyle = 'rgba(0,0,0,0.35)'; g.strokeText(String(i + 1), n.x, y + 2);
        g.fillText(String(i + 1), n.x, y + 2);
      } else drawLock(g, n.x, y);
      // stars
      for (var s = 0; s < 3; s++) {
        var got = best && best.stars > s;
        star(g, n.x - 24 + s * 24, n.y + r + 18, 10, got ? '#ffd230' : 'rgba(255,255,255,0.18)', got);
      }
    }
    // kids beside selected node
    var sn = NODES[mapSel];
    var hat = save.hat === 'none' ? null : save.hat;
    var ka = { sx: 1, sy: 1 + Math.sin(time * 6) * 0.03, run: 0, blink: anim.ice.blink, face: 1, air: false, vy: 0, happy: true, lean: 0 };
    var kb = { sx: 1, sy: 1 + Math.sin(time * 6 + 1.5) * 0.03, run: 0, blink: anim.fire.blink, face: -1, air: false, vy: 0, happy: true, lean: 0 };
    R.drawKid(g, 'ice', sn.x - 70, sn.y + 30, ka, time, hat);
    R.drawKid(g, 'fire', sn.x + 70, sn.y + 30, kb, time, hat);
    // bottom bar
    g.fillStyle = 'rgba(10,5,2,0.6)'; g.fillRect(0, 630, 1280, 90);
    btn(g, MAPBTN.back, '◀ Back', inBtn(MAPBTN.back, ptr.x, ptr.y), '#ffffff', '#1d2340');
    btn(g, MAPBTN.play, '▶ Play ' + (mapSel + 1), inBtn(MAPBTN.play, ptr.x, ptr.y), '#ffcc00', '#3a2a00');
    var def = LEVELS[mapSel], best2 = save.best[mapSel];
    g.textAlign = 'left';
    g.font = '700 22px ' + R.FONT; g.fillStyle = '#fff';
    g.fillText(def.name, 200, 663);
    g.font = '500 15px ' + R.FONT; g.fillStyle = 'rgba(255,240,210,0.8)';
    g.fillText(best2 ? 'Best ' + fmtTime(best2.time) + '  ·  par ' + fmtPar(def.par) : 'Par time ' + fmtPar(def.par), 200, 690);
    // hat chooser
    var hatObj = R.HATS.filter(function (h) { return h.id === save.hat; })[0] || R.HATS[0];
    btn(g, MAPBTN.hatL, '◀', inBtn(MAPBTN.hatL, ptr.x, ptr.y), '#ffffff', '#1d2340');
    btn(g, MAPBTN.hatR, '▶', inBtn(MAPBTN.hatR, ptr.x, ptr.y), '#ffffff', '#1d2340');
    g.textAlign = 'center';
    g.font = '600 13px ' + R.FONT; g.fillStyle = 'rgba(255,240,210,0.75)';
    g.fillText('HAT  (H)', 1127, 656);
    g.font = '700 19px ' + R.FONT; g.fillStyle = '#fff';
    g.fillText(hatObj.name, 1127, 680);
    var nextHat = R.HATS.filter(function (h) { return h.stars > totalStars(); })[0];
    if (nextHat) {
      g.font = '500 13px ' + R.FONT; g.fillStyle = '#ffd230';
      g.fillText('Next hat at ★' + nextHat.stars, 1127, 702);
    }
    g.fillStyle = 'rgba(255,240,210,0.6)'; g.font = '500 14px ' + R.FONT;
    g.fillText('Arrows to choose · Enter to play', 640, 712);
    g.textBaseline = 'alphabetic'; g.textAlign = 'left';
  }
  function btn(g, b, label, hov, bg, ink) {
    var y = b.y + (hov ? -2 : 0);
    g.fillStyle = 'rgba(0,0,0,0.35)'; R.rr(g, b.x, b.y + 5, b.w, b.h, b.h / 2); g.fill();
    g.fillStyle = bg; R.rr(g, b.x, y, b.w, b.h, b.h / 2); g.fill();
    g.fillStyle = ink; g.textAlign = 'center'; g.font = '700 20px ' + R.FONT;
    g.fillText(label, b.x + b.w / 2, y + b.h / 2 + 1);
  }
  function star(g, x, y, r, col, shine) {
    g.fillStyle = col;
    g.beginPath();
    for (var i = 0; i < 10; i++) {
      var a = -Math.PI / 2 + i * Math.PI / 5, rr2 = i % 2 ? r * 0.45 : r;
      g.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2);
    }
    g.closePath(); g.fill();
    if (shine) { g.strokeStyle = '#8a5a00'; g.lineWidth = 1.5; g.stroke(); }
  }
  function drawLock(g, x, y) {
    g.strokeStyle = '#d8d8de'; g.lineWidth = 4;
    g.beginPath(); g.arc(x, y - 6, 8, Math.PI, 0); g.stroke();
    g.fillStyle = '#d8d8de'; R.rr(g, x - 12, y - 6, 24, 18, 4); g.fill();
    g.fillStyle = '#46444a'; g.beginPath(); g.arc(x, y + 2, 3, 0, Math.PI * 2); g.fill();
  }

  /* ---------------------------------------------------------- wiring */
  function on(id, fn) {
    $(id).addEventListener('click', function (e) { e.stopPropagation(); A.unlock(); fn(); this.blur(); });
  }
  on('playBtn', function () { SFX.click(); startLevel(continueLevel()); });
  on('mapBtn', function () { SFX.click(); goMap(); });
  on('modeDuo', function () { SFX.click(); setSolo(false); });
  on('modeSolo', function () { SFX.click(); setSolo(true); });
  on('resumeBtn', resume);
  on('restartBtn', function () { restart(); });
  on('pauseMapBtn', function () { SFX.click(); goMap(); });
  on('pauseSolo', function () { SFX.click(); setSolo(!save.solo); });
  on('pauseMusic', function () { SFX.click(); save.music = !save.music; persist(); refreshPause(); });
  on('retryBtn', function () { restart(); });
  on('deadMapBtn', function () { SFX.click(); goMap(); });
  on('winNext', nextLevel);
  on('winFinal', function () { SFX.click(); showFinal(); });
  on('winReplay', function () { restart(); });
  on('winMap', function () { SFX.click(); goMap(); });
  on('finalMap', function () { SFX.click(); goMap(); });
  on('pauseBtn', function () { if (mode === 'play') pause(); else if (mode === 'paused') resume(); });
  $('pauseBtn').addEventListener('pointerdown', function (e) { e.stopPropagation(); });
  document.addEventListener('visibilitychange', function () { if (document.hidden && mode === 'play' && world && world.state === 'play') pause(); });
  window.addEventListener('blur', function () { if (mode === 'play' && world && world.state === 'play' && !bot) pause(); });

  if (document.fonts && document.fonts.load) {
    document.fonts.load('700 20px Fredoka').then(function () { layersDirty = true; }, function () { /* ignore */ });
  }

  // debug / test hook
  window.__game = {
    get mode() { return mode; },
    get world() { return world; },
    get save() { return save; },
    load: function (n) { startLevel(Kit.clamp((n | 0) - 1, 0, NL - 1)); },
    unlockAll: function () { save.unlocked = NL; persist(); },
    win: function () { if (world) { world.state = 'won'; world.events.push({ t: 'win' }); } },
    bot: function (n) {
      if (!FI.Runner || !FI.SOLUTIONS) return 'load bot.js + solutions.js first';
      startLevel(n - 1); bot = new FI.Runner(FI.SOLUTIONS[n]); banner = 0; return 'running';
    },
    solo: function (v) { setSolo(v); },
    stars: totalStars,
    particles: function () { return fx.count(); }
  };

  goTitle();
  Kit.loop(update, render);
})();
