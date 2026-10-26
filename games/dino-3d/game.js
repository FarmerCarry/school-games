(function () {
  'use strict';
  var canvas = document.getElementById('scene');
  var mode = 'ready', engine, renderer, dirty = true, contextLost = false;
  var store = Kit.store('dino-3d'), best = store.get('best', 0);
  if (!Number.isSafeInteger(best) || best < 0) best = 0;
  var quality = store.get('quality', 'high') === 'low' ? 'low' : 'high';
  var courseCode = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  // A course code (typed in, or picked with «مسار جديد» on the start screen) is the same
  // course for every child, so classmates can share it: it always plays tier 3, the
  // original balance, and its runs never change the difficulty. An empty code field and
  // «العب مسارًا جديدًا» give a surprise course whose tier Kit.dda fits to the child;
  // its code is never shown, because sharing it would not give the same course.
  var dda = Kit.dda('dino-3d'), shared = false;
  var bestPending = false, qualityPending = false, inputJumps = 0, milestoneUntil = 0;
  var pointerJump = false, pointerDuck = false, jumpQueued = false, controlDuck = false;
  var activePointer = null, loop, lastScore = -1, lastBest = -1;
  // A jump pressed just after a crash must not skip the result: Space and taps on the
  // scene restart only after this long (Enter, R and the Retry button work at once).
  var OVER_GUARD_MS = 600, overAt = 0;
  function overSettled() { return mode !== 'over' || performance.now() - overAt >= OVER_GUARD_MS; }
  function el(id) { return document.getElementById(id); }
  var saveStatus = Kit.saveStatus({ retry: save });
  // Original 5x7 bitmap numerals; the matching DOM text remains accessible.
  var digits = [
    [14,17,19,21,25,17,14], [4,12,4,4,4,4,14], [14,17,1,2,4,8,31],
    [30,1,1,14,1,1,30], [2,6,10,18,31,2,2], [31,16,16,30,1,1,30],
    [14,16,16,30,17,17,14], [31,1,2,4,8,8,8], [14,17,17,14,17,17,14], [14,17,17,15,1,1,14]
  ];
  function paintDigits(id, value) {
    var target = el(id), text = String(value).padStart(5, '0');
    target.width = text.length * 24 - 4; target.height = 28;
    var ctx = target.getContext('2d'); ctx.fillStyle = '#53634c';
    for (var i = 0; i < text.length; i++) {
      var rows = digits[Number(text[i])];
      for (var y = 0; y < 7; y++) for (var x = 0; x < 5; x++) {
        if (rows[y] & (1 << (4 - x))) ctx.fillRect(i * 24 + x * 4, y * 4, 4, 4);
      }
    }
  }
  function save() {
    if (bestPending && store.set('best', best)) bestPending = false;
    if (qualityPending && store.set('quality', quality)) qualityPending = false;
    if (bestPending || qualityPending) saveStatus.failed(); else saveStatus.saved();
  }
  function resetInput() {
    pointerJump = pointerDuck = jumpQueued = controlDuck = false;
    activePointer = null;
    Kit.keys.reset();
  }
  function focusGame() { canvas.focus({ preventScroll:true }); }
  function changeMode(next) {
    mode = next; document.body.dataset.mode = mode;
    el('ready-screen').hidden = mode !== 'ready';
    el('pause-screen').hidden = mode !== 'paused';
    el('over-screen').hidden = mode !== 'over';
    el('hud').hidden = mode === 'ready';
    el('pause-button').hidden = mode !== 'playing';
    el('course-tag').hidden = mode === 'ready' || !shared;
    // After a result a surprise course may come back at another tier, so its retry does
    // not promise the same course.
    el('retry').lastChild.textContent = shared ? 'أعد المسار نفسه' : 'العب مرة أخرى';
    dirty = true;
  }
  function refreshHUD() {
    var score = engine.state.score;
    document.body.classList.toggle('night', engine.state.night > 0.5);
    if (score !== lastScore) { el('score').textContent = String(score).padStart(5, '0'); paintDigits('score-digits', score); lastScore = score; }
    if (best !== lastBest) {
      el('best-score').textContent = String(best).padStart(5, '0');
      paintDigits('best-digits', best);
      el('menu-best').textContent = String(best); lastBest = best;
    }
    document.querySelector('.current-score').classList.toggle('milestone', mode === 'playing' && engine.state.elapsed < milestoneUntil);
  }
  // A run left from pause (Restart, R, New course or Menu) still keeps its best score;
  // finish() has already banked a run that crashed.
  function bankRun() {
    if (mode === 'paused' && engine.state.score > best) { best = engine.state.score; bestPending = true; save(); }
  }
  // Retry (R, Enter, the Retry and Restart buttons) replays the same course; a surprise
  // course reads its tier again, so a child who keeps retrying still gets help.
  function start() {
    if (!renderer || contextLost) return;
    bankRun(); resetInput();
    // The tier is read before the round starts (Kit.dda reports it; a code reports 3).
    var tier = shared ? 3 : dda.tier;
    if (shared) Kit.track.tier(3);
    engine.reset(Number(courseCode) + 1, tier);
    inputJumps = 0; milestoneUntil = 0; lastScore = -1; cued = cleared = 0;
    Kit.audio.unlock(); Kit.stats.round('endless');
    changeMode('playing'); refreshHUD(); focusGame();
  }
  function showCourse() {
    el('course-code').value = shared ? courseCode : '';
    el('active-course').textContent = courseCode;
    el('course-error').hidden = true;
    el('course-code').removeAttribute('aria-invalid');
  }
  function startSelected() {
    var code = el('course-code').value.trim();
    if (code && !/^[0-9]{4}$/.test(code)) {
      el('course-error').hidden = false;
      el('course-code').setAttribute('aria-invalid', 'true');
      el('course-code').focus(); return;
    }
    if (!renderer || contextLost) return;
    // A code cleared from the field gives a new surprise, not the shared course again.
    if (code) courseCode = code; else if (shared) courseCode = otherCode();
    shared = !!code;
    showCourse(); start();
  }
  // A different code; drawing and sound never use the engine's RNG.
  function otherCode() { return String((Number(courseCode) + 1 + Math.floor(Math.random() * 9999)) % 10000).padStart(4, '0'); }
  // On the start screen the new code is shown, to play or share; from a pause or a
  // result a new surprise course starts at once.
  function newCourse() {
    if (!renderer || contextLost) return;
    courseCode = otherCode(); shared = mode === 'ready';
    showCourse();
    if (mode !== 'ready') start();
    else { engine.reset(Number(courseCode) + 1, 3); dirty = true; }
  }
  function pause() {
    if (mode !== 'playing') return;
    resetInput(); changeMode('paused');
  }
  function resume() {
    if (mode !== 'paused' || contextLost) return;
    resetInput(); changeMode('playing'); focusGame();
  }
  function menu() {
    bankRun(); resetInput();
    if (!shared) courseCode = otherCode(); // the next surprise course is a new one
    engine.reset(Number(courseCode) + 1); milestoneUntil = 0; showCourse();
    changeMode('ready'); refreshHUD(); focusGame();
  }
  function finish() {
    if (mode !== 'playing') return;
    var score = engine.state.score, record = score > best;
    if (record) { best = score; bestPending = true; save(); Dino3D.sound('record'); }
    // Difficulty: the share of this tier's par score reached, from surprise courses only.
    // Early crashes ease the next course off; runs that reach the par make it harder.
    if (!shared) dda.result(Math.min(1, score / Dino3D.tier(engine.state.tier).par));
    Kit.stats.end('end', score);
    el('final-score').textContent = String(score); el('record').hidden = !record;
    overAt = performance.now();
    resetInput(); changeMode('over'); refreshHUD(); focusGame();
  }
  function update(dt) {
    if (mode === 'playing' && !contextLost) {
      var jump = pointerJump || jumpQueued || Kit.keys.anyDown(['Space','ArrowUp']) || Kit.keys.anyPressed(['Space','ArrowUp']);
      var duck = pointerDuck || controlDuck || Kit.keys.down('ArrowDown');
      jumpQueued = false;
      var events = engine.step(dt, {jump:jump, duck:duck});
      events.forEach(function (event) {
        if (event === 'jump') inputJumps++;
        if (event === 'milestone') milestoneUntil = engine.state.elapsed + 0.65;
        if (event === 'crash') Kit.track.miss();
        Dino3D.sound(event);
      });
      trackObstacles();
      if (!engine.state.alive) finish();
      refreshHUD(); dirty = true;
    }
    Kit.keys.endFrame();
  }
  // Kit.track: the next obstacle coming within CUE_S seconds is a cue (the next jump or
  // duck press gives a reaction time), unless it is a high bird the dinosaur simply runs
  // under; each obstacle that passes the dinosaur is a hit.
  var CUE_S = 1, cued = 0, cleared = 0;
  function trackObstacles() {
    var s = engine.state, list = s.obstacles, C = Dino3D.config;
    for (var i = 0; i < list.length; i++) {
      var o = list[i], reach = o.depth / 2 + C.playerHalfDepth;
      if (o.z > reach) { if (o.id > cleared) { cleared = o.id; Kit.track.hit(); } continue; }
      if (o.id > cued && o.bottom < C.playerTop && -reach - o.z < s.speed * CUE_S) { cued = o.id; Kit.track.cue(); }
      return;
    }
  }
  function draw() {
    if (!dirty || contextLost || !renderer || document.hidden) return;
    renderer.render(engine.state, {mode:mode, reducedMotion:Kit.motion.reduced(), quality:quality});
    dirty = false;
  }
  function resize() {
    if (renderer) renderer.resize(window.innerWidth, window.innerHeight);
    dirty = true;
  }
  function paintQuality() {
    el('quality').textContent = quality === 'low' ? 'الرسوم: خفيفة' : 'الرسوم: كاملة';
    el('quality').setAttribute('aria-pressed', String(quality === 'low'));
  }
  el('course-form').addEventListener('submit', function (e) { e.preventDefault(); startSelected(); });
  el('course-code').addEventListener('input', function () {
    this.value = this.value.replace(/[٠-٩۰-۹]/g, function (digit) { return String(digit.charCodeAt(0) - (digit <= '٩' ? 1632 : 1776)); });
    el('course-error').hidden = true; this.removeAttribute('aria-invalid');
  });
  ['new-course', 'new-course-paused', 'new-course-over'].forEach(function (id) { el(id).addEventListener('click', newCourse); });
  el('retry').addEventListener('click', start);
  el('restart').addEventListener('click', start);
  el('resume').addEventListener('click', resume);
  el('menu').addEventListener('click', menu);
  el('pause-menu').addEventListener('click', menu);
  el('pause-button').addEventListener('click', function () { pause(); focusGame(); });
  el('quality').addEventListener('click', function (e) {
    quality = quality === 'high' ? 'low' : 'high'; qualityPending = true;
    paintQuality(); save(); dirty = true; if (e.detail > 0) focusGame();
  });
  window.addEventListener('keydown', function (e) {
    // Kit leaves Ctrl shortcuts to the browser. A bare Ctrl key is also a duck control.
    if ((e.code === 'ControlLeft' || e.code === 'ControlRight') && !Kit.keys.isNativeTarget(e.target) && !e.altKey && !e.metaKey && !e.isComposing) {
      if (mode === 'playing') controlDuck = true;
      return;
    }
    // Keep retry available after tabbing through a result or pause button.
    var retryKey = e.code === 'KeyR' && (mode === 'paused' || mode === 'over') &&
      !e.isComposing && !e.ctrlKey && !e.altKey && !e.metaKey && !e.defaultPrevented &&
      !e.target.isContentEditable && e.target.closest && e.target.closest('button');
    if ((!Kit.isGameKeyEvent(e) && !retryKey) || e.repeat) return;
    if ((mode === 'ready' || mode === 'over') && (e.code === 'Space' || e.code === 'Enter' || (mode === 'over' && e.code === 'KeyR'))) {
      e.preventDefault();
      if (mode === 'ready') startSelected();
      else if (e.code !== 'Space' || overSettled()) start();
    }
    else if (e.code === 'KeyP' || e.code === 'Escape') { e.preventDefault(); if (mode === 'playing') pause(); else if (mode === 'paused') resume(); }
    else if (mode === 'paused' && e.code === 'KeyR') { e.preventDefault(); start(); }
  });
  window.addEventListener('keyup', function (e) { if (e.code === 'ControlLeft' || e.code === 'ControlRight') controlDuck = false; });
  canvas.addEventListener('pointerdown', function (e) {
    if (e.button !== 0 || activePointer !== null) return;
    focusGame();
    if (mode === 'ready' || mode === 'over') {
      if (mode === 'ready') startSelected();
      else if (overSettled()) start();
      return;
    }
    if (mode !== 'playing') return;
    e.preventDefault(); activePointer = e.pointerId;
    canvas.setPointerCapture(e.pointerId);
    var rect = canvas.getBoundingClientRect();
    pointerDuck = e.pointerType !== 'mouse' && e.clientY > rect.top + rect.height / 2;
    pointerJump = !pointerDuck; jumpQueued = pointerJump;
  });
  function releasePointer(e) {
    if (e.pointerId !== activePointer) return;
    pointerJump = pointerDuck = false; activePointer = null;
    if (e.type !== 'pointerup') jumpQueued = false;
  }
  canvas.addEventListener('pointerup', releasePointer);
  canvas.addEventListener('pointercancel', releasePointer);
  canvas.addEventListener('lostpointercapture', releasePointer);
  canvas.addEventListener('webglcontextlost', function (e) {
    e.preventDefault(); contextLost = true; pause(); el('context-notice').hidden = false;
  });
  canvas.addEventListener('webglcontextrestored', function () {
    contextLost = false; el('context-notice').hidden = true; resize();
  });
  Kit.lifecycle({pause:pause, reset:resetInput});
  Kit.motion.onChange(function () { dirty = true; });
  Kit.muteButton(); paintQuality(); showCourse();
  window.addEventListener('resize', resize);
  window.addEventListener('pageshow', function () { dirty = true; });
  try {
    engine = Dino3D.createEngine(Number(courseCode) + 1);
    renderer = Dino3D.createRenderer(canvas);
    resize(); refreshHUD(); draw();
    window.Dino3DGame = {
      get mode() { return mode; }, get state() { return engine.state; },
      get engine() { return engine; }, get renderer() { return renderer; },
      get best() { return best; }, get inputJumps() { return inputJumps; },
      get tier() { return engine.state.tier; }, get shared() { return shared; },
      start:start, pause:pause, resume:resume, restart:start, menu:menu
    };
    loop = Kit.loop(update, draw, {hz:60});
    Kit.ready();
  } catch (error) {
    if (loop) loop.stop();
    if (renderer) renderer.dispose();
    el('error-screen').hidden = false; el('ready-screen').hidden = true;
    Kit.fail(error);
  }
})();
