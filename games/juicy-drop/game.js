/* سلّة الفواكه (Juicy Drop): screens, input, sounds and saves. The rules live in engine.js
 * (JDEngine), the 3D picture in art.js (JDArt); this file wires them to the page.
 * Screens: title -> play <-> pause -> over (the jar empties) -> result; title -> jars. */
(function () {
  'use strict';
  var E = window.JDEngine, J = Kit.juice, F = E.FRUITS;
  var $ = function (id) { return document.getElementById(id); };
  var canvas = $('gl'), ui = $('ui');
  var store = Kit.store('juicy-drop');
  var save = E.loadSave(store.get('jar3', null));
  var dda = Kit.dda('juicy-drop', { id: 'main' });
  var saveStatus = Kit.saveStatus({ retry: persist });
  var SCREENS = { title: 'scrTitle', pause: 'scrPause', result: 'scrResult', skins: 'scrSkins' };

  var view = null, world = null, demo = null, screen = 'title', contextLost = false, dirty = true;
  var clock = 0, viewClock = 0, lastFrame = 0, menuAcc = 0;
  var heldPop = 1, mouseAim = false, lastMouse = null, idle = 0, ghostOn = false;
  var overT = 0, popQueue = [], popT = 0, result = null, runToastBest = false, runTop = -1;
  var dangerTick = 0, landSound = 0, starTimers = [];

  function calm() { return Kit.motion.reduced(); }
  function persist() {
    if (store.set('jar3', save)) saveStatus.saved(); else saveStatus.failed();
  }

  /* ------------------------------------------------------------ layout */
  var fit = Kit.fit(canvas, 1280, 720, { webgl: true, maxDpr: 1.5, onResize: function (v) {
    ui.style.left = canvas.style.left; ui.style.top = canvas.style.top;
    ui.style.transform = 'scale(' + v.scale + ')';
    if (view) view.resize(Math.round(1280 * v.scale), Math.round(720 * v.scale));
    dirty = true;
  } });

  function show(name) {
    screen = name;
    for (var k in SCREENS) $(SCREENS[k]).hidden = k !== name;
    $('hud').hidden = !(name === 'play' || name === 'pause' || name === 'over');
    if (name !== 'play') setGhost(false);
    dirty = true;
  }
  function focusGame() { try { canvas.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }

  /* ------------------------------------------------------------ title demo */
  // A quiet bot fills a jar behind the title. It never makes a sound or touches the save.
  var demoAim = 4.2, demoWait = 0.5, demoDir = 1;
  function newDemo() {
    demo = E.create({ seed: 77, pool: 5, grace: 8, charges: 0 });
    // Fill it a little before anyone sees it.
    for (var i = 0; i < 9; i++) { demoStepBot(0.9); for (var s = 0; s < 54; s++) { E.step(demo, 1 / 60); demo.ev.length = 0; } }
  }
  function demoStepBot(dt) {
    demoWait -= dt;
    if (demoWait > 0 || !E.canDrop(demo)) return;
    // Aim at a fruit of the same kind when there is one near the top, else wander.
    var best = null, fr = demo.fruits;
    for (var i = 0; i < fr.length; i++) if (fr[i].lv === demo.held && (!best || fr[i].y > best.y)) best = fr[i];
    demoAim = best ? best.x : demoAim + demoDir * 1.7;
    if (demoAim > E.JW - 0.8 || demoAim < 0.8) demoDir = -demoDir;
    E.setAim(demo, demoAim);
    E.drop(demo);
    demoWait = 1.3;
  }
  function stepDemo(dt) {
    if (!demo) newDemo();
    if (calm()) return;
    demoStepBot(dt);
    E.step(demo, dt);
    for (var i = 0; i < demo.ev.length; i++) if (view) view.event(demo.ev[i]);
    demo.ev.length = 0;
    if (demo.height > E.LINE - 1.4 || demo.over) newDemo();
  }

  /* ------------------------------------------------------------ rounds */
  function startRound() {
    var pool = dda.pick([4, 4, 5, 5, 5]), grace = dda.value(3.5, 2.0);
    world = E.create({ seed: (Math.random() * 4294967296) >>> 0, pool: pool, grace: grace, charges: 1 });
    world.grace0 = grace;
    if (lastMouse && mouseAim) E.setAim(world, view.jarX(lastMouse.x, lastMouse.y));
    heldPop = 1; idle = 0; overT = 0; popQueue.length = 0; result = null; runToastBest = false; runTop = save.top;
    dangerTick = 0;
    clearStars();
    if (view) view.clearFx();
    $('floats').textContent = ''; $('toast').hidden = true;
    Kit.stats.round('endless');
    if (!save.coach) Kit.stats.tutorial('start');
    show('play');
    paintHud(true);
    focusGame();
  }
  function quitRound() {
    if (world && !world.over && (screen === 'play' || screen === 'pause')) Kit.stats.end('quit');
  }
  function toTitle() {
    quitRound();
    world = null;
    if (view) view.clearFx();
    show('title');
    paintTitle();
    focusGame();
  }
  function pause() {
    if (screen !== 'play') return;
    show('pause');
    J.back();
    focusGame();
  }
  function resume() {
    if (screen !== 'pause') return;
    show('play');
    J.select();
    focusGame();
  }

  /* ------------------------------------------------------------ input */
  function logical(e) { return fit.toLogical(e.clientX, e.clientY); }
  window.addEventListener('pointermove', function (e) {
    lastMouse = logical(e);
    if (screen === 'play' && world && view) { mouseAim = true; E.setAim(world, view.jarX(lastMouse.x, lastMouse.y)); }
  });
  canvas.addEventListener('pointerdown', function (e) {
    if (e.button !== 0) return;
    lastMouse = logical(e);
    if (screen !== 'play' || !world || !view) return;
    mouseAim = true;
    E.setAim(world, view.jarX(lastMouse.x, lastMouse.y));
    tryDrop();
  });

  function tryDrop() {
    if (!world || world.over) return false;
    if (!E.canDrop(world)) return false;
    var f = E.drop(world);
    if (!f) return false;
    heldPop = 0; idle = 0;
    setGhost(false);
    if (view) view.squeeze();
    J.whoosh(0.55);
    return true;
  }
  function tryBlast() {
    if (!world || screen !== 'play') return;
    if (!E.blast(world)) { J.error(); wiggle($('btnBlast')); }
  }
  function wiggle(el) { el.classList.remove('wiggle'); void el.offsetWidth; el.classList.add('wiggle'); }

  var K = Kit.keys;
  function keysPlay(dt) {
    if (K.anyPressed(['Escape', 'KeyP'])) { pause(); return; }
    var dir = (K.anyDown(['ArrowRight', 'KeyD']) ? 1 : 0) - (K.anyDown(['ArrowLeft', 'KeyA']) ? 1 : 0);
    if (dir) { mouseAim = false; E.setAim(world, world.aim + dir * 9 * dt); idle = Math.min(idle, 1); }
    if (K.anyPressed(['Space', 'ArrowDown'])) tryDrop();
    if (K.pressed('KeyS')) tryBlast();
  }
  function keysMenus() {
    if (screen === 'title') {
      if (K.anyPressed(['Enter', 'Space'])) { J.select(); startRound(); }
    } else if (screen === 'pause') {
      if (K.anyPressed(['Escape', 'KeyP', 'Enter', 'Space'])) resume();
      else if (K.pressed('KeyR')) { J.select(); quitRound(); startRound(); }
    } else if (screen === 'result') {
      if (K.anyPressed(['Enter', 'Space', 'KeyR'])) { J.select(); startRound(); }
      else if (K.pressed('Escape')) { J.back(); toTitle(); }
    } else if (screen === 'skins') {
      if (K.anyPressed(['Escape', 'Enter'])) closeSkins();
    }
  }

  /* ------------------------------------------------------------ events */
  var floats = $('floats'), floatCount = 0;
  function float(x, y, text, size, color) {
    if (floats.childElementCount > 14) floats.removeChild(floats.firstChild);
    var d = document.createElement('div');
    d.className = 'float'; d.textContent = text;
    d.style.left = x.toFixed(0) + 'px'; d.style.top = y.toFixed(0) + 'px';
    d.style.fontSize = size + 'px'; d.style.color = color || '#fff';
    floats.appendChild(d);
    floatCount++;
    setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, calm() ? 700 : 1000);
  }
  var toastTimer = 0;
  function toast(html) {
    var t = $('toast');
    t.innerHTML = html; t.hidden = false;
    t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 1800);
  }
  function fruitIcon(lv) {
    var f = F[lv];
    return '<i class="fruit-ico" style="--c:' + f.color + ';--c2:' + f.juice + ';width:46px;height:46px;border-width:4px;box-shadow:none"></i>';
  }
  function say(text) { $('live').textContent = text; }

  function onEvent(e) {
    if (view) view.event(e);
    var p;
    switch (e.t) {
      case 'land':
        if (e.power > 3 && clock - landSound > 0.08) { landSound = clock; J.land(Math.min(1, e.power / 14)); }
        break;
      case 'merge':
        J.pop(Math.min(1, e.lv / 10));
        if (e.combo > 1) J.streak(Math.min(13, e.combo));
        Kit.track.hit();
        p = view.project(e.x, e.y + 0.3, 0.5);
        float(p.x, p.y, '+' + e.points, 30 + Math.min(20, e.lv * 2.5), '#fff');
        if (e.combo > 1) float(p.x, p.y - 46, '×' + e.combo, 40 + Math.min(24, e.combo * 4), '#ffd23f');
        if (!save.coach) { save.coach = true; Kit.stats.tutorial('done'); persist(); }
        if (e.lv > runTop) {
          runTop = e.lv;
          if (e.lv > save.top && e.lv >= 4) {
            J.chime(e.lv >= 8 ? 3 : e.lv >= 6 ? 2 : 1);
            toast(fruitIcon(e.lv) + '<span>' + F[e.lv].name + ' جديدة!</span>');
            say('فاكهة جديدة: ' + F[e.lv].name);
          }
        }
        bumpScore();
        break;
      case 'melon':
        J.levelUp(); Kit.track.hit();
        p = view.project(e.x, e.y, 0.5);
        float(p.x, p.y, '+' + e.points, 64, '#ff5470');
        bumpScore();
        break;
      case 'charge':
        J.coin(3);
        p = view.project(e.x, e.y + 1, 0.5);
        float(p.x, p.y, '⚡', 54, '#ffd23f');
        wiggle($('btnBlast'));
        break;
      case 'pop': J.pop(0.3); break;
      case 'blast':
        J.impact(0.7);
        bumpScore();
        break;
      case 'danger':
        J.error(); Kit.track.miss(); dangerTick = 0;
        say('انتبه! الفواكه فوق الخط');
        break;
      case 'over':
        J.fail();
        beginOver();
        break;
    }
  }
  var scoreEl = $('score'), bumpT = 0;
  function bumpScore() { scoreEl.classList.add('bump'); bumpT = 0.12; }

  /* ------------------------------------------------------------ HUD */
  var shown = { score: -1, best: -1, charges: -1, hot: null, danger: -1 };
  function paintHud(force) {
    if (!world) return;
    if (force || shown.score !== world.score) {
      shown.score = world.score; scoreEl.textContent = Kit.fmt(world.score);
      if (!runToastBest && save.best > 0 && world.score > save.best) {
        runToastBest = true;
        toast('<span>رقم جديد!</span>'); J.chime(2); say('رقم جديد!');
      }
    }
    var best = Math.max(save.best, world.score);
    if (force || shown.best !== best) { shown.best = best; $('best').textContent = Kit.fmt(best); }
    if (force || shown.charges !== world.charges) {
      shown.charges = world.charges; $('blastCount').textContent = String(world.charges);
      $('btnBlast').classList.toggle('empty', world.charges <= 0);
    }
    var hot = world.charges > 0 && world.danger > 0.25;
    if (force || shown.hot !== hot) { shown.hot = hot; $('btnBlast').classList.toggle('hot', hot); }
    var dg = Math.round(world.danger * 100) / 100;
    if (force || shown.danger !== dg) { shown.danger = dg; $('dangerGlow').style.opacity = String(calm() ? dg * 0.6 : dg); }
    if (view) {
      var b = view.bubblePoint(), nt = $('nextTag');
      nt.style.left = b.x.toFixed(0) + 'px'; nt.style.top = b.y.toFixed(0) + 'px';
    }
  }
  function paintTitle() {
    $('titleBest').querySelector('b').textContent = Kit.fmt(save.best);
    $('titleBest').hidden = save.best <= 0;
    var top = 0;
    for (var i = 0; i < E.SKINS.length; i++) if (E.skinOpen(save, i)) top = i;
    $('btnSkins').querySelector('.dot').hidden = top <= save.seen;
  }

  /* ------------------------------------------------------------ the coach */
  var ghost = $('ghost');
  function setGhost(on) {
    if (ghostOn === on) return;
    ghostOn = on; ghost.hidden = !on;
    if (on && view) {
      var p = view.project(E.JW / 2, E.LINE - 2.2, 0.5);
      ghost.style.transform = 'translate(' + p.x.toFixed(0) + 'px,' + p.y.toFixed(0) + 'px)';
    }
  }

  /* ------------------------------------------------------------ game over */
  function beginOver() {
    show('over');
    overT = 0; popT = 0.5;
    popQueue = world.fruits.slice().sort(function (a, b) { return (b.y + b.r) - (a.y + a.r); });
    Kit.stats.end('end', world.score);
    dda.result(E.outcome(world.maxLevel));
  }
  function stepOver(dt) {
    overT += dt;
    popT -= dt;
    var gap = Math.min(0.07, 1.1 / Math.max(1, popQueue.length));
    while (popT <= 0 && popQueue.length) {
      var f = popQueue.shift(), i = world.fruits.indexOf(f);
      if (i >= 0) world.fruits.splice(i, 1);
      if (view) view.splash(f.x, f.y, f.lv, 0.5);
      J.pop(Math.min(1, f.lv / 10));
      popT += gap;
    }
    if (!popQueue.length && popT < -0.45) showResult();
  }
  function clearStars() { starTimers.forEach(clearTimeout); starTimers.length = 0; }
  function showResult() {
    var run = { score: world.score, maxLevel: world.maxLevel };
    result = E.applyResult(save, run);
    persist();
    var lv = Math.max(0, run.maxLevel), f = F[lv];
    var ico = $('resFruit');
    ico.style.setProperty('--c', f.color); ico.style.setProperty('--c2', f.juice);
    $('resFruitName').textContent = f.name;
    $('resScore').textContent = Kit.fmt(run.score);
    var newBest = result.best && result.prevBest > 0;
    $('resBest').hidden = true; $('resOpen').hidden = true;
    var stars = $('resStars').children;
    for (var i = 0; i < 3; i++) stars[i].setAttribute('class', '');
    show('result');
    clearStars();
    var delay = calm() ? 0 : 380;
    for (var s = 0; s < result.stars; s++) {
      (function (k) {
        starTimers.push(setTimeout(function () { stars[k].setAttribute('class', calm() ? 'on' : 'on pop'); J.star(k + 1); }, delay * (k + 1)));
      })(s);
    }
    starTimers.push(setTimeout(function () {
      if (newBest) { $('resBest').hidden = false; J.levelUp(); if (view) view.confetti(90); }
      if (result.opened.length) { $('resOpen').hidden = false; if (!newBest) J.chime(3); }
    }, delay * (result.stars + 1)));
    say('النتيجة ' + run.score + (newBest ? '، رقم جديد!' : ''));
    focusGame();
  }

  /* ------------------------------------------------------------ jars */
  function hex(n) { return '#' + ('000000' + n.toString(16)).slice(-6); }
  function buildSkins() {
    var list = $('skinList');
    list.textContent = '';
    E.SKINS.forEach(function (sk, i) {
      var art = JDArt.SKINS[i], open = E.skinOpen(save, i);
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'jd-btn skin' + (save.skin === i ? ' worn' : '') + (open ? '' : ' locked');
      b.setAttribute('aria-label', 'جرّة ' + sk.name + (open ? '' : ' — مقفلة حتى ' + F[sk.need].name));
      b.setAttribute('aria-pressed', String(save.skin === i));
      var rim = art.rim.length > 1 ? 'linear-gradient(90deg,' + art.rim.map(hex).join(',') + ')' : hex(art.rim[0]);
      var jar = document.createElement('div');
      jar.className = 'jar';
      jar.style.background = 'linear-gradient(180deg, rgba(255,255,255,0.35), ' + hex(art.back) + ')';
      jar.style.setProperty('--rim', rim);
      b.appendChild(jar);
      if (!open) {
        var need = document.createElement('div');
        need.className = 'need';
        need.innerHTML = '<svg aria-hidden="true"><use href="#i-lock"/></svg><i class="fruit-ico" style="--c:' + F[sk.need].color + ';--c2:' + F[sk.need].juice + '"></i>';
        b.appendChild(need);
      }
      b.addEventListener('click', function () {
        if (!E.skinOpen(save, i)) { J.error(); wiggle(b); return; }
        save.skin = i; persist();
        if (view) view.setSkin(i);
        J.select();
        buildSkins();
        try { list.children[i].focus({ preventScroll: true }); } catch (e) { /* ignore */ }
      });
      list.appendChild(b);
    });
  }
  function openSkins() {
    var top = 0;
    for (var i = 0; i < E.SKINS.length; i++) if (E.skinOpen(save, i)) top = i;
    if (top > save.seen) { save.seen = top; persist(); }
    buildSkins();
    show('skins');
    J.select();
    setTimeout(function () { try { $('skinList').children[save.skin].focus({ preventScroll: true }); } catch (e) { /* ignore */ } }, 0);
  }
  function closeSkins() {
    J.back();
    show('title');
    paintTitle();
    focusGame();
  }

  /* ------------------------------------------------------------ buttons */
  function on(id, fn) {
    $(id).addEventListener('click', function (e) { fn(e); if (e.detail > 0) e.currentTarget.blur(); });
    $(id).addEventListener('pointerdown', function (e) { e.stopPropagation(); });
  }
  on('btnPlay', function () { J.select(); startRound(); });
  on('btnSkins', openSkins);
  on('skinsBack', closeSkins);
  on('btnPause', function () { pause(); });
  on('btnResume', function () { resume(); });
  on('btnRestart', function () { J.select(); quitRound(); startRound(); });
  on('btnHome', function () { J.back(); toTitle(); });
  on('resAgain', function () { J.select(); startRound(); });
  on('resHome', function () { J.back(); toTitle(); });
  on('btnBlast', function () { tryBlast(); focusGame(); });

  /* ------------------------------------------------------------ loop */
  function update(dt) {
    if (contextLost) { K.endFrame(); return; }
    clock += dt;
    if (screen === 'play' && world) {
      keysPlay(dt);
      if (screen === 'play') {
        E.step(world, dt);
        var ev = world.ev;
        world.ev = [];
        for (var i = 0; i < ev.length; i++) onEvent(ev[i]);
        if (screen === 'play') {
          heldPop = Math.min(1, heldPop + dt / 0.28);
          idle += dt;
          var wait = save.games === 0 && world.drops === 0 ? 1.5 : 4;
          setGhost(idle > wait && !world.warn);
          if (world.warn) {
            dangerTick -= dt;
            if (dangerTick <= 0 && world.danger > 0.3) { J.countdown(1); dangerTick = 0.55 - world.danger * 0.25; }
          }
        }
        paintHud(false);
      }
    } else if (screen === 'over') {
      stepOver(dt);
      world.ev.length = 0;
      paintHud(false);
    } else {
      keysMenus();
      if (screen === 'title' || screen === 'skins') stepDemo(dt);
    }
    if (bumpT > 0 && (bumpT -= dt) <= 0) scoreEl.classList.remove('bump');
    K.endFrame();
    if (screen !== 'pause') dirty = true;
  }

  function frameState() {
    var playing = screen === 'play' || screen === 'pause' || screen === 'over' || screen === 'result';
    var w = playing ? world : demo;
    var mode = playing ? 'play' : 'title';
    return {
      t: clock, dt: Math.max(0, Math.min(0.1, clock - viewClock)), mode: mode, w: w,
      aim: w ? w.aim : E.JW / 2,
      held: w && !(playing && (screen === 'over' || screen === 'result')) ? w.held : -1,
      heldPop: playing ? heldPop : Math.min(1, w ? 1 - w.cool / E.COOLDOWN : 1),
      next: playing && world && screen !== 'over' && screen !== 'result' ? world.next : -1,
      top: Math.max(save.top, playing && world ? world.maxLevel : -1),
      runTop: playing && world ? world.maxLevel : -1,
      warn: !!(w && w.warn && playing), guide: playing && screen === 'play'
    };
  }
  function render() {
    if (!view || contextLost) return;
    if (screen === 'pause' && !dirty) return;
    var now = performance.now();
    // Software graphics: the menus only need a calm picture, not 60 frames a second.
    if (view.soft && screen !== 'play' && screen !== 'over' && lastFrame && now - lastFrame < 60 && !dirty) return;
    if (screen === 'play' && lastFrame && view.frameTime(now - lastFrame)) fit.resize();
    lastFrame = now;
    view.calm = calm();
    var S = frameState();
    viewClock = clock;
    view.frame(S);
    view.render();
    dirty = false;
  }

  /* ------------------------------------------------------------ debug */
  function page(x, y) { var r = canvas.getBoundingClientRect(); return { x: r.left + x * fit.scale, y: r.top + y * fit.scale }; }
  function r3(v) { return Math.round(v * 1000) / 1000; }
  function snapshot() {
    var w = world;
    return {
      screen: screen, paused: screen === 'pause', time: w ? r3(w.t) : 0, aim: w ? r3(w.aim) : 0,
      drops: w ? w.drops : 0, fruits: w ? w.fruits.length : 0, score: w ? w.score : 0, best: save.best,
      combo: w ? w.combo : 0, bestCombo: w ? w.bestCombo : 0, charges: w ? w.charges : 0, danger: w ? r3(w.danger) : 0,
      over: !!(w && w.over), maxLevel: w ? w.maxLevel : -1, held: w ? w.held : -1, next: w ? w.next : -1,
      canDrop: !!(w && E.canDrop(w)), skin: save.skin, coach: save.coach, ghost: ghostOn,
      stars: result ? result.stars : 0, newBest: !!(result && result.best && result.prevBest > 0), opened: result ? result.opened.slice() : [],
      calm: calm(), particles: view ? view.particleCount() : 0, floats: floatCount,
      pool: w ? w.pool : 0, grace: w ? r3(w.grace) : 0, soft: !!(view && view.soft)
    };
  }

  /* ------------------------------------------------------------ init */
  Kit.muteButton();
  Kit.lifecycle({ pause: function () { pause(); }, reset: function () { /* keys are reset by Kit */ } });
  Kit.motion.onChange(function (r) { if (view) view.calm = r; dirty = true; });
  window.addEventListener('pageshow', function () { dirty = true; });
  canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); contextLost = true; pause(); $('contextNotice').hidden = false; });
  canvas.addEventListener('webglcontextrestored', function () { contextLost = false; $('contextNotice').hidden = true; dirty = true; fit.resize(); });

  var loop = null;
  try {
    view = JDArt.createView(canvas);
    view.calm = calm();
    view.setSkin(save.skin);
    fit.resize();
    newDemo();
    show('title');
    paintTitle();
    window.__game = {
      get state() { return snapshot(); },
      get save() { return JSON.parse(JSON.stringify(save)); },
      get world() { return world; },
      // Where a point of the 1280x720 picture, or a point of the jar (x from the left wall,
      // y up from the floor), is on the page.
      point: page,
      jarPoint: function (jx, jy) { var p = view.project(jx, jy, 0); return page(p.x, p.y); },
      drawCalls: function () { return view.info().calls; }
    };
    render();
    loop = Kit.loop(update, render);
    Kit.ready();
  } catch (error) {
    if (loop) loop.stop();
    for (var k in SCREENS) $(SCREENS[k]).hidden = true;
    $('hud').hidden = true;
    $('scrError').hidden = false;
    Kit.fail(error);
  }
})();
