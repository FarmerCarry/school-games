/*
 * أكاديمية الفأرة واللوحة. A new student first sees how to hold the mouse,
 * rest on the home-row bumps, and sit up straight. Then eight stations.
 * A ghost hand shows each motion before the child tries. Nothing here
 * can fail the child: no timer and no lives. A miss wiggles the target and
 * plays the hand again. Sound and speech are optional and follow mute.
 * Rules live in rules.js (window.MKA). This file only draws, listens, and saves.
 */
(function () {
  'use strict';

  var MKA = window.MKA;
  var store = Kit.store('mouse-keyboard-academy');
  var status = Kit.saveStatus({ retry: function () { persist(); } });
  var app = document.getElementById('app');
  var view = document.getElementById('view');
  var overlay = document.getElementById('overlay');
  var promptEl = document.getElementById('prompt');
  var langHintEl = document.getElementById('langHint');
  var liveEl = document.getElementById('live');
  var toastEl = document.getElementById('toast');

  var screen = 'map';
  var stationId = '';
  var progress = 0;
  var goal = 0;
  var save = MKA.freshSave();
  var hintOn = false;
  var roundOpen = false;
  var tutStart = false;
  var tutDone = false;
  var hintTimer = 0;
  var toastTimer = 0;
  var armTimer = 0;
  var releaseTimer = 0;
  var laterTimer = 0;
  var scrollMiss = 0;
  var jumpWorld = null;
  var jumpRaf = 0;
  var maze = null;
  var dragging = false;
  var lastClick = null;
  var gestureHit = false;
  var said = Object.create(null);
  var voice = undefined;
  var demoGen = 0;
  var demoAnims = [];
  var demoTimers = [];
  var heldDown = Object.create(null);
  var edgeDown = Object.create(null);
  var STAR_SPOTS = [[50, 44], [24, 30], [76, 32], [34, 70]];
  var BALLOON_SPOTS = [[50, 42], [34, 56], [66, 38], [42, 36], [60, 58]];
  var FRUITS = ['🍎', '🍊', '🍌', '🍇'];
  var ARROW_GLYPH = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
  var gripCard = 0;
  var gripBits = 0;
  var gripReady = false;
  var gripBack = 'lesson';
  var FINGER_COLOR = { thumb: '#e85d4c', index: '#1c8ed8', middle: '#3aaa3a', ring: '#e0a106', pinky: '#9b59d0' };
  var KEY_FINGER = {
    KeyQ: 'pinky', KeyA: 'pinky', KeyZ: 'pinky',
    KeyW: 'ring', KeyS: 'ring', KeyX: 'ring',
    KeyE: 'middle', KeyD: 'middle', KeyC: 'middle',
    KeyR: 'index', KeyT: 'index', KeyF: 'index', KeyG: 'index', KeyV: 'index', KeyB: 'index',
    KeyY: 'index', KeyU: 'index', KeyH: 'index', KeyJ: 'index', KeyN: 'index', KeyM: 'index',
    KeyI: 'middle', KeyK: 'middle', Comma: 'middle',
    KeyO: 'ring', KeyL: 'ring', Period: 'ring',
    KeyP: 'pinky', Semicolon: 'pinky', Quote: 'pinky', Slash: 'pinky'
  };

  function $(id) { return document.getElementById(id); }
  function field() { return $('field'); }
  function typingTarget(e) {
    return !!(e.target && e.target.closest && e.target.closest('input, textarea, select'));
  }
  function clearEdges() { heldDown = Object.create(null); edgeDown = Object.create(null); }
  function naming() {
    return screen === 'play' && stationId === 'letters' && progress >= goal && !!$('nameForm');
  }
  function reduced() {
    return !!(window.Kit && Kit.motion && Kit.motion.reduced());
  }

  function persist() {
    if (store.set('save', save)) status.saved();
    else status.failed();
  }
  function quitRound() {
    if (!roundOpen) return;
    Kit.stats.end('quit', MKA.stickerCount(save));
    roundOpen = false;
  }
  function paintStickers() {
    var html = '';
    for (var i = 0; i < MKA.STATIONS.length; i++) {
      var id = MKA.STATIONS[i].id;
      var cls = save.done && save.done[id] ? 'on' : (id === stationId ? 'now' : '');
      html += '<span class="' + cls + '">⭐</span>';
    }
    $('stickers').innerHTML = html;
  }
  function promptPhrase() {
    if (screen === 'grip') return ['أمسك بلطف', 'ضع السبابتين', 'اجلس مستقيمًا'][gripCard] || 'أمسك بلطف';
    if (naming()) return 'اسمك';
    var station = MKA.stationById(stationId);
    if (station && screen !== 'map' && screen !== 'cert') return station.prompt;
    if (screen === 'cert') return 'شهادة';
    if (MKA.stickerCount(save) > 0 && !MKA.allDone(save)) return 'التالي';
    return 'ابدأ';
  }
  function promptIcon() {
    if (screen === 'grip') return ['🖱️', '⌨️', '🧒'][gripCard] || '🖱️';
    if (naming()) return '✏️';
    var station = MKA.stationById(stationId);
    if (station && screen !== 'map' && screen !== 'cert') return station.icon;
    if (screen === 'cert') return '🏅';
    return '🖱️';
  }
  function setPrompt() {
    var text = document.createElement('span');
    text.className = 'prompt-text';
    text.textContent = promptPhrase();
    promptEl.replaceChildren();
    var icon = document.createElement('span');
    icon.className = 'prompt-ico';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = promptIcon();
    promptEl.appendChild(icon);
    promptEl.appendChild(text);
    paintPips();
  }
  function paintPips() {
    var host = $('pips');
    if (!host) return;
    if (screen === 'grip') {
      var icons = ['🖱️', '⌨️', '🧒'];
      var marks = '';
      for (var g = 0; g < 3; g++) marks += '<span class="' + (g < gripCard ? 'on' : (g === gripCard ? 'now' : '')) + '">' + icons[g] + '</span>';
      host.innerHTML = marks;
      return;
    }
    if (screen !== 'play' && screen !== 'pause') { host.innerHTML = ''; return; }
    var html = '';
    if (stationId === 'arrows' && maze) {
      for (var i = 1; i <= 3; i++) html += '<span class="' + (maze.flags >= i ? 'on' : '') + '">🚩</span>';
      html += '<span class="' + (maze.done ? 'on' : '') + '">🚪</span>';
    } else if (stationId === 'jump' && jumpWorld) {
      for (var j = 0; j < jumpWorld.obstacles.length; j++) html += '<span class="' + (jumpWorld.jumps > j ? 'on' : '') + '">🌿</span>';
      html += '<span class="' + (jumpWorld.phase === 'door' || jumpWorld.done ? 'on' : '') + '">🚪</span>';
    } else {
      var total = naming() ? goal : goal;
      for (var n = 0; n < total; n++) html += '<span class="' + (n < progress ? 'on' : '') + '">⭐</span>';
    }
    host.innerHTML = html;
  }
  function applyHint() {
    app.classList.toggle('hinting', !!hintOn && screen === 'play');
    if (stationId === 'arrows') paintMaze();
    if (stationId === 'jump') paintJump();
    setPrompt();
  }
  function armIdle() {
    clearTimeout(hintTimer);
    hintOn = false;
    applyHint();
    if (screen !== 'play') return;
    hintTimer = setTimeout(function () {
      if (screen !== 'play') return;
      hintOn = true;
      applyHint();
      playDemo();
      speak(promptPhrase());
    }, MKA.HINT_MS);
  }
  function hideToast() {
    clearTimeout(toastTimer);
    toastEl.hidden = true;
  }
  function praise() {
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, 900);
  }
  function say(text) { if (liveEl) liveEl.textContent = text; }
  function cancelJump() {
    if (jumpRaf) cancelAnimationFrame(jumpRaf);
    jumpRaf = 0;
  }
  function hideOverlay() {
    overlay.hidden = true;
    overlay.innerHTML = '';
  }
  function updateChrome() {
    $('btnMap').hidden = screen === 'map';
    $('btnPause').hidden = screen !== 'play';
    app.classList.toggle('playing', screen === 'play');
    paintStickers();
    setPrompt();
  }

  function cheer() { try { Kit.audio.unlock(); Kit.sfx.coin(); } catch (err) { /* sound is optional */ } }
  function boop() {
    try { Kit.audio.unlock(); Kit.audio.tone({ freq: 330, to: 220, type: 'sine', dur: 0.16, vol: 0.1 }); }
    catch (err) { /* a miss stays gentle even if audio is missing */ }
  }
  function fanfare() { try { Kit.audio.unlock(); Kit.sfx.win(); } catch (err) { /* sound is optional */ } }
  function tap() { try { Kit.audio.unlock(); Kit.sfx.click(); } catch (err) { /* sound is optional */ } }

  function findVoice() {
    if (!window.speechSynthesis || !speechSynthesis.getVoices) { voice = null; return; }
    var list = [];
    try { list = speechSynthesis.getVoices() || []; } catch (err) { voice = null; return; }
    voice = null;
    for (var i = 0; i < list.length; i++) {
      if (/^ar([-_]|$)/i.test(list[i].lang || '')) { voice = list[i]; break; }
    }
  }
  function hush() {
    if (!window.speechSynthesis) return;
    try { speechSynthesis.cancel(); } catch (err) { /* speech is optional */ }
  }
  function speak(text) {
    if (!text || !window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
    if (Kit.audio.muted) { hush(); return; }
    if (voice === undefined) findVoice();
    if (!voice) return;
    try {
      hush();
      var utter = new SpeechSynthesisUtterance(text);
      utter.voice = voice;
      utter.lang = voice.lang;
      utter.rate = 0.9;
      speechSynthesis.speak(utter);
    } catch (err) { /* never depend on speech */ }
  }
  function speakOnce(text) {
    var key = stationId + ':' + progress + ':' + (naming() ? 'n' : '') + ':' + text;
    if (said[key]) return;
    said[key] = 1;
    speak(text);
  }
  if (window.speechSynthesis) {
    findVoice();
    try { speechSynthesis.addEventListener('voiceschanged', findVoice); } catch (err) { /* older engines */ }
  }
  Kit.audio.onMuteChange(function (muted) { if (muted) hush(); });

  function cancelAnims() {
    for (var i = 0; i < demoAnims.length; i++) { try { demoAnims[i].cancel(); } catch (err) { /* already finished */ } }
    demoAnims = [];
    for (i = 0; i < demoTimers.length; i++) { clearTimeout(demoTimers[i].t); demoTimers[i].done(); }
    demoTimers = [];
  }
  function hideGhost() {
    var ghost = $('ghost');
    if (ghost) ghost.hidden = true;
  }
  function stopDemo() {
    demoGen++;
    cancelAnims();
    hideGhost();
  }
  function showGhost(ch) {
    var ghost = $('ghost');
    if (!ghost) return null;
    ghost.textContent = ch || '👆';
    ghost.hidden = false;
    return ghost;
  }
  function centerOf(el) {
    var host = $('fx');
    if (!el || !host) return null;
    var hostBox = host.getBoundingClientRect();
    var rect = el.getBoundingClientRect();
    if (!rect.width && !rect.height) return null;
    return {
      x: rect.left - hostBox.left + rect.width / 2,
      y: rect.top - hostBox.top + rect.height / 2
    };
  }
  function place(ghost, point) {
    ghost.style.left = point.x + 'px';
    ghost.style.top = point.y + 'px';
  }
  function wait(ms, gen) {
    return new Promise(function (resolve) {
      var item = { t: 0, done: resolve };
      item.t = setTimeout(function () { resolve(); }, ms);
      demoTimers.push(item);
      if (gen !== demoGen) resolve();
    });
  }
  function glide(ghost, from, to, ms, gen) {
    if (gen !== demoGen || !ghost.animate) return Promise.resolve();
    place(ghost, from);
    var anim = ghost.animate(
      [{ left: from.x + 'px', top: from.y + 'px' }, { left: to.x + 'px', top: to.y + 'px' }],
      { duration: ms, easing: 'ease-in-out', fill: 'forwards' }
    );
    demoAnims.push(anim);
    return anim.finished.then(function () {
      if (gen === demoGen) place(ghost, to);
    }).catch(function () { return null; });
  }
  function pressGhost(ghost, times, gen) {
    if (gen !== demoGen || !ghost.animate) return Promise.resolve();
    var frames = [];
    for (var i = 0; i < times; i++) {
      frames.push({ marginTop: '0px', offset: i / times });
      frames.push({ marginTop: '18px', offset: (i + 0.45) / times });
    }
    frames.push({ marginTop: '0px', offset: 1 });
    var anim = ghost.animate(frames, { duration: 320 * times, easing: 'ease-in-out' });
    demoAnims.push(anim);
    return anim.finished.catch(function () { return null; });
  }
  function playDemo() {
    stopDemo();
    var gen = demoGen;
    if (screen !== 'play' || reduced()) return Promise.resolve(gen);
    return runDemo(gen).then(function () {
      if (gen === demoGen) hideGhost();
      return gen;
    });
  }
  function runDemo(gen) {
    var ghost;
    var target;
    var from;
    var to;
    if (naming()) {
      ghost = showGhost('👆');
      target = $('kidName');
      to = centerOf(target);
      var key = document.querySelector('#field .kbd .key[data-code="KeyH"]');
      var keyPoint = centerOf(key);
      if (!ghost || !to || !keyPoint) return Promise.resolve();
      from = { x: to.x + 80, y: to.y - 70 };
      place(ghost, from);
      return wait(160, gen)
        .then(function () { return gen === demoGen ? glide(ghost, from, to, 500, gen) : null; })
        .then(function () { return gen === demoGen ? glide(ghost, to, keyPoint, 700, gen) : null; })
        .then(function () { return gen === demoGen ? pressGhost(ghost, 1, gen) : null; });
    }
    if (stationId === 'move') {
      ghost = showGhost('🖱️');
      target = document.querySelector('#field .star');
      to = centerOf(target);
      if (!ghost || !to) return Promise.resolve();
      from = { x: Math.min(to.x + 220, app.clientWidth - 70), y: Math.max(70, to.y - 90) };
      place(ghost, from);
      return wait(180, gen).then(function () { return gen === demoGen ? glide(ghost, from, to, 1100, gen) : null; });
    }
    if (stationId === 'click' || stationId === 'double') {
      ghost = showGhost('👆');
      target = stationId === 'click' ? document.querySelector('#field .balloon') : $('chest');
      to = centerOf(target);
      if (!ghost || !to) return Promise.resolve();
      from = { x: to.x + 30, y: to.y - 90 };
      place(ghost, from);
      return wait(120, gen)
        .then(function () { return gen === demoGen ? glide(ghost, from, to, 500, gen) : null; })
        .then(function () { return gen === demoGen ? pressGhost(ghost, stationId === 'double' ? 2 : 1, gen) : null; });
    }
    if (stationId === 'drag') {
      ghost = showGhost('👆');
      var fruit = $('fruit');
      var zone = $('zone');
      from = centerOf(fruit);
      to = centerOf(zone);
      if (!ghost || !from || !to) return Promise.resolve();
      place(ghost, from);
      return wait(200, gen)
        .then(function () { return gen === demoGen ? pressGhost(ghost, 1, gen) : null; })
        .then(function () { return gen === demoGen ? glide(ghost, from, to, 1100, gen) : null; });
    }
    if (stationId === 'scroll') {
      ghost = showGhost('👆');
      target = document.querySelector('#field .mouse-wheel');
      to = centerOf(target);
      if (!ghost || !to) return Promise.resolve();
      from = { x: to.x, y: to.y - 70 };
      place(ghost, from);
      return wait(120, gen)
        .then(function () { return gen === demoGen ? glide(ghost, from, to, 400, gen) : null; })
        .then(function () { return gen === demoGen ? glide(ghost, to, { x: to.x, y: to.y + 48 }, 500, gen) : null; })
        .then(function () { return gen === demoGen ? glide(ghost, { x: to.x, y: to.y + 48 }, to, 400, gen) : null; });
    }
    if (stationId === 'arrows') {
      ghost = showGhost('👆');
      var code = maze ? MKA.mazeHint(maze) : '';
      target = code ? document.querySelector('#field .pad .key[data-code="' + code + '"]') : null;
      to = centerOf(target);
      if (!ghost || !to) return Promise.resolve();
      from = { x: to.x, y: to.y - 70 };
      place(ghost, from);
      return wait(120, gen)
        .then(function () { return gen === demoGen ? glide(ghost, from, to, 450, gen) : null; })
        .then(function () { return gen === demoGen ? pressGhost(ghost, 1, gen) : null; });
    }
    if (stationId === 'jump') {
      ghost = showGhost('👆');
      var door = jumpWorld && jumpWorld.phase === 'door';
      target = $(door ? 'keyEnter' : 'keySpace');
      to = centerOf(target);
      if (!ghost || !to) return Promise.resolve();
      from = { x: to.x, y: to.y - 80 };
      place(ghost, from);
      return wait(120, gen)
        .then(function () { return gen === demoGen ? glide(ghost, from, to, 450, gen) : null; })
        .then(function () { return gen === demoGen ? pressGhost(ghost, 1, gen) : null; });
    }
    if (stationId === 'letters') {
      ghost = showGhost('👆');
      var want = MKA.LETTERS[progress] || '';
      target = want ? document.querySelector('#field .kbd .key[data-code="' + want + '"]') : null;
      to = centerOf(target);
      if (!ghost || !to) return Promise.resolve();
      from = { x: to.x, y: to.y - 80 };
      place(ghost, from);
      return wait(120, gen)
        .then(function () { return gen === demoGen ? glide(ghost, from, to, 500, gen) : null; })
        .then(function () { return gen === demoGen ? pressGhost(ghost, 1, gen) : null; });
    }
    return Promise.resolve();
  }
  function coachNow() {
    if (screen !== 'play') return;
    armIdle();
    speakOnce(promptPhrase());
    playDemo();
  }
  function nudge(el) {
    if (!el) return;
    el.classList.remove('nudge');
    void el.offsetWidth;
    el.classList.add('nudge');
    setTimeout(function () { el.classList.remove('nudge'); }, 500);
  }
  var oopsAt = -1000;
  function oops(el) {
    var now = performance.now();
    if (now - oopsAt < 450) return;
    oopsAt = now;
    nudge(el);
    boop();
    playDemo();
    armIdle();
  }
  function sparkle(el) {
    var host = (el && el.closest && el.closest('#overlay')) || $('fx');
    if (!host || !el || reduced()) return;
    var hostBox = host.getBoundingClientRect();
    var rect = el.getBoundingClientRect();
    if (!rect.width && !rect.height) return;
    var burst = document.createElement('div');
    burst.className = 'spark';
    burst.style.left = (rect.left - hostBox.left + rect.width / 2) + 'px';
    burst.style.top = (rect.top - hostBox.top + rect.height / 2) + 'px';
    var bits = ['✨', '⭐', '✨', '🌟', '✨', '⭐'];
    for (var i = 0; i < bits.length; i++) {
      var bit = document.createElement('span');
      bit.textContent = bits[i];
      var angle = Math.PI * 2 * i / bits.length;
      bit.style.setProperty('--dx', Math.round(Math.cos(angle) * 78) + 'px');
      bit.style.setProperty('--dy', Math.round(Math.sin(angle) * 64) + 'px');
      burst.appendChild(bit);
    }
    host.appendChild(burst);
    setTimeout(function () { if (burst.parentNode) burst.parentNode.removeChild(burst); }, 750);
  }
  function clearCoach() {
    clearTimeout(hintTimer);
    clearTimeout(armTimer);
    clearTimeout(releaseTimer);
    clearTimeout(laterTimer);
    clearTimeout(scrollMiss);
    releaseTimer = 0;
    stopDemo();
    hush();
    hintOn = false;
  }

  function showOverlay(html) {
    hideToast();
    cancelJump();
    overlay.innerHTML = html;
    overlay.hidden = false;
  }

  function mouseArt() {
    return [
      '<svg class="grip-art" viewBox="0 0 760 380" role="img" aria-label="كيف تمسك الفأرة">',
      '<rect width="760" height="380" fill="#f3d7b0"/>',
      '<rect y="308" width="760" height="72" fill="#e2c08a"/>',
      '<g class="wrist"><ellipse cx="380" cy="322" rx="74" ry="30" fill="#f6c7a4" stroke="#1c2250" stroke-width="3"/>',
      '<text x="380" y="328" text-anchor="middle" font-size="16">المعصم</text></g>',
      '<g class="slide-mouse">',
      '<ellipse cx="380" cy="258" rx="110" ry="44" fill="#f6c7a4" stroke="#1c2250" stroke-width="3"/>',
      '<text x="380" y="264" text-anchor="middle" font-size="18">الكف بلطف</text>',
      '<rect x="268" y="108" width="224" height="132" rx="44" fill="#e4e7f2" stroke="#1c2250" stroke-width="4"/>',
      '<g class="mbtn target" data-grip="left" tabindex="0" role="button">',
      '<rect x="278" y="116" width="98" height="70" rx="16" fill="#d6ecfa" stroke="#1c2250" stroke-width="3"/>',
      '<text x="327" y="146" text-anchor="middle" font-size="16">الزر</text>',
      '<text x="327" y="168" text-anchor="middle" font-size="16">الأيسر</text></g>',
      '<g class="mbtn" data-grip="right" tabindex="0" role="button">',
      '<rect x="384" y="116" width="98" height="70" rx="16" fill="#d9f5d6" stroke="#1c2250" stroke-width="3"/>',
      '<text x="433" y="146" text-anchor="middle" font-size="16">الزر</text>',
      '<text x="433" y="168" text-anchor="middle" font-size="16">الأيمن</text></g>',
      '<g class="finger index"><rect x="300" y="28" width="40" height="96" rx="18" fill="#1c8ed8" stroke="#1c2250" stroke-width="3"/>',
      '<text x="248" y="78" text-anchor="middle" font-size="16">سبابة</text></g>',
      '<g class="finger middle"><rect x="414" y="28" width="40" height="96" rx="18" fill="#3aaa3a" stroke="#1c2250" stroke-width="3"/>',
      '<text x="500" y="48" text-anchor="middle" font-size="16">وسطى</text></g>',
      '<g class="finger ring"><rect x="508" y="102" width="32" height="74" rx="15" fill="#e0a106" stroke="#1c2250" stroke-width="3"/>',
      '<text x="600" y="140" text-anchor="middle" font-size="16">بنصر</text></g>',
      '<g class="finger pinky"><rect x="548" y="136" width="28" height="58" rx="13" fill="#9b59d0" stroke="#1c2250" stroke-width="3"/>',
      '<text x="640" y="172" text-anchor="middle" font-size="16">خنصر</text></g>',
      '<g class="finger thumb"><ellipse cx="228" cy="196" rx="28" ry="42" fill="#e85d4c" stroke="#1c2250" stroke-width="3"/>',
      '<text x="150" y="202" text-anchor="middle" font-size="16">إبهام</text></g>',
      '<text x="640" y="230" text-anchor="middle" font-size="16">← حرّكها →</text>',
      '</g></svg>'
    ].join('');
  }
  function keyboardArt() {
    var keyW = 62;
    var keyH = 48;
    var gap = 4;
    var rows = MKA.KEY_ROWS;
    var y0 = [8, 62, 116];
    var home = {};
    var r;
    var c;
    for (r = 0; r < MKA.HOME_LEFT.length; r++) home[MKA.HOME_LEFT[r]] = 1;
    for (r = 0; r < MKA.HOME_RIGHT.length; r++) home[MKA.HOME_RIGHT[r]] = 1;
    var parts = ['<svg class="grip-art" viewBox="0 0 900 340" role="img" aria-label="صف الارتكاز">',
      '<rect width="900" height="340" fill="#fff6ea"/>'];
    for (r = 0; r < rows.length; r++) {
      var rowW = rows[r].length * keyW + (rows[r].length - 1) * gap;
      var x0 = (900 - rowW) / 2;
      for (c = 0; c < rows[r].length; c++) {
        var code = rows[r][c];
        var x = Math.round(x0 + c * (keyW + gap));
        var y = y0[r];
        var finger = KEY_FINGER[code] || 'index';
        var bump = code === 'KeyF' || code === 'KeyJ';
        parts.push('<g class="keyhit' + (bump ? ' target' : '') + '" data-code="' + code + '" tabindex="0" role="button">');
        parts.push('<rect x="' + x + '" y="' + y + '" width="' + keyW + '" height="' + keyH + '" rx="8" fill="' + FINGER_COLOR[finger] + '" fill-opacity="' + (home[code] ? '1' : '0.38') + '" stroke="#1c2250" stroke-width="' + (home[code] ? '4' : '2') + '"/>');
        parts.push('<text x="' + (x + keyW / 2) + '" y="' + (y + 24) + '" text-anchor="middle" font-size="18">' + MKA.AR[code] + '</text>');
        parts.push('<text x="' + (x + keyW / 2) + '" y="' + (y + 40) + '" text-anchor="middle" font-size="11">' + MKA.EN[code] + '</text>');
        if (bump) parts.push('<circle cx="' + (x + keyW / 2) + '" cy="' + (y + 8) + '" r="4" fill="#ffcc00" stroke="#1c2250"/>');
        parts.push('</g>');
      }
    }
    parts.push('<rect x="250" y="174" width="400" height="42" rx="12" fill="#f7c1b8" stroke="#1c2250" stroke-width="3"/>');
    parts.push('<ellipse cx="400" cy="195" rx="22" ry="14" fill="#e85d4c" stroke="#1c2250" stroke-width="2"/>');
    parts.push('<ellipse cx="500" cy="195" rx="22" ry="14" fill="#e85d4c" stroke="#1c2250" stroke-width="2"/>');
    parts.push('<text x="450" y="236" text-anchor="middle" font-size="16">الإبهامان على المسافة</text>');
    var hands = [
      [190, 'pinky'], [216, 'ring'], [242, 'middle'], [268, 'index'],
      [632, 'index'], [658, 'middle'], [684, 'ring'], [710, 'pinky']
    ];
    for (c = 0; c < hands.length; c++) {
      parts.push('<ellipse cx="' + hands[c][0] + '" cy="268" rx="14" ry="16" fill="' + FINGER_COLOR[hands[c][1]] + '" stroke="#1c2250" stroke-width="2"/>');
    }
    parts.push('<ellipse cx="229" cy="308" rx="96" ry="26" fill="#f6c7a4" stroke="#1c2250" stroke-width="3"/>');
    parts.push('<ellipse cx="671" cy="308" rx="96" ry="26" fill="#f6c7a4" stroke="#1c2250" stroke-width="3"/>');
    parts.push('<text x="229" y="314" text-anchor="middle" font-size="16">اليسرى</text>');
    parts.push('<text x="671" y="314" text-anchor="middle" font-size="16">اليمنى</text>');
    parts.push('</svg>');
    return parts.join('');
  }
  function postureArt() {
    return [
      '<svg class="grip-art" viewBox="0 0 760 400" role="img" aria-label="الجلسة">',
      '<rect width="760" height="400" fill="#fff6ea"/>',
      '<circle cx="68" cy="52" r="22" fill="#ffcc00" stroke="#1c2250" stroke-width="3"/>',
      '<rect y="332" width="760" height="68" fill="#e2c08a"/>',
      '<rect x="150" y="96" width="16" height="130" rx="6" fill="#7d93c7" stroke="#1c2250"/>',
      '<rect x="150" y="214" width="130" height="14" rx="4" fill="#7d93c7" stroke="#1c2250"/>',
      '<rect x="168" y="228" width="12" height="90" fill="#5c709e"/>',
      '<rect x="250" y="228" width="12" height="90" fill="#5c709e"/>',
      '<rect x="188" y="214" width="22" height="110" rx="10" fill="#3d4d86"/>',
      '<rect x="236" y="214" width="22" height="110" rx="10" fill="#3d4d86"/>',
      '<rect x="430" y="188" width="250" height="16" rx="4" fill="#c9843d" stroke="#1c2250"/>',
      '<rect x="460" y="204" width="12" height="128" fill="#a56a32"/>',
      '<rect x="640" y="204" width="12" height="128" fill="#a56a32"/>',
      '<rect x="470" y="64" width="180" height="116" rx="12" fill="#1c2250"/>',
      '<rect x="484" y="78" width="152" height="86" rx="6" fill="#d7f4ff"/>',
      '<text x="560" y="54" text-anchor="middle" font-size="16">أعلى الشاشة</text>',
      '<g class="sit target" data-sit="feet" tabindex="0" role="button">',
      '<rect class="sit-ring" x="160" y="300" width="130" height="58" rx="16" fill="transparent" stroke="#ffcc00" stroke-width="4"/>',
      '<ellipse cx="198" cy="328" rx="26" ry="12" fill="#1c2250"/>',
      '<ellipse cx="250" cy="328" rx="26" ry="12" fill="#1c2250"/>',
      '<text x="224" y="348" text-anchor="middle" font-size="16">قدمان</text></g>',
      '<g class="sit target" data-sit="back" tabindex="0" role="button">',
      '<rect class="sit-ring" x="164" y="112" width="100" height="108" rx="18" fill="rgba(255,204,0,0.12)" stroke="#ffcc00" stroke-width="4"/>',
      '<rect x="184" y="128" width="64" height="88" rx="18" fill="#ffcc00" stroke="#1c2250" stroke-width="3"/>',
      '<text x="216" y="168" text-anchor="middle" font-size="15">ظهر</text>',
      '<text x="216" y="188" text-anchor="middle" font-size="15">مستقيم</text></g>',
      '<circle cx="214" cy="86" r="36" fill="#f6c7a4" stroke="#1c2250" stroke-width="3"/>',
      '<circle cx="202" cy="82" r="4" fill="#1c2250"/>',
      '<circle cx="228" cy="82" r="4" fill="#1c2250"/>',
      '<path d="M200 98 Q214 112 228 98" fill="none" stroke="#1c2250" stroke-width="3" stroke-linecap="round"/>',
      '<rect x="236" y="150" width="150" height="16" rx="8" fill="#f6c7a4" stroke="#1c2250" stroke-width="3"/>',
      '<text x="70" y="168" text-anchor="middle" font-size="15">كتفان</text>',
      '<text x="70" y="188" text-anchor="middle" font-size="15">مرتاحان</text>',
      '<g class="sit target" data-sit="eyes" tabindex="0" role="button">',
      '<rect class="sit-ring" x="246" y="48" width="220" height="44" rx="12" fill="transparent" stroke="#ffcc00" stroke-width="4"/>',
      '<line x1="250" y1="78" x2="470" y2="64" stroke="#1c8ed8" stroke-width="4" stroke-dasharray="8 6"/>',
      '<text x="360" y="70" text-anchor="middle" font-size="16">العينان</text></g>',
      '</svg>'
    ].join('');
  }
  function legendHTML() {
    var names = [['thumb', 'إبهام'], ['index', 'سبابة'], ['middle', 'وسطى'], ['ring', 'بنصر'], ['pinky', 'خنصر']];
    var html = '<p class="legend">';
    for (var i = 0; i < names.length; i++) {
      html += '<span><i style="background:' + FINGER_COLOR[names[i][0]] + '"></i>' + names[i][1] + '</span>';
    }
    return html + '</p>';
  }
  function renderGrip() {
    gripReady = false;
    var art = gripCard === 0 ? mouseArt() : gripCard === 1 ? keyboardArt() : postureArt();
    var cap = gripCard === 0 ? 'الكف بلطف على الفأرة. لا تعصرها.'
      : gripCard === 1 ? 'حرّك السبابتين حتى تحسّ النتوء، ثم اضغط ب و ت.'
      : 'المس الظهر والقدمين والعينين.';
    var extra = '';
    if (gripCard === 0) {
      extra = '<p class="grip-note">المعصم على الطاولة. حرّكها ولا ترفعها.</p>' +
        '<p class="grip-note">للمعلم: بدّل الزرين لليد اليسرى من إعدادات الجهاز.</p>';
    } else if (gripCard === 1) {
      extra = legendHTML() + '<div class="check-row"><button type="button" class="big-key target" data-code="KeyF">' + MKA.AR.KeyF +
        '</button><button type="button" class="big-key target" data-code="KeyJ">' + MKA.AR.KeyJ + '</button></div>';
    }
    view.innerHTML = '<div class="grip"><div class="grip-stage">' + art + '</div><p class="grip-cap">' + cap + '</p>' + extra +
      '<div class="grip-next-row"><button type="button" class="next" id="btnGripNext" data-act="grip-next" hidden><span>التالي</span><span class="next-arrow" aria-hidden="true">←</span></button></div></div>';
    hideOverlay();
    langHintEl.hidden = true;
    updateChrome();
    say(promptPhrase());
  }
  function showGrip(back) {
    quitRound();
    clearCoach();
    cancelJump();
    dragging = false;
    stationId = '';
    progress = 0;
    screen = 'grip';
    gripCard = 0;
    gripBits = 0;
    gripReady = false;
    gripBack = back === 'map' ? 'map' : 'lesson';
    renderGrip();
    speakOnce(promptPhrase());
  }
  function gripCardReady() {
    if (gripReady) return;
    gripReady = true;
    praise();
    say('أحسنت');
    speak('أحسنت');
    var btn = $('btnGripNext');
    if (btn) { btn.hidden = false; btn.focus(); }
    paintPips();
  }
  function gripAdvance() {
    if (screen !== 'grip' || !gripReady) return;
    if (gripCard < 2) {
      gripCard += 1;
      gripBits = 0;
      renderGrip();
      speakOnce(promptPhrase());
      return;
    }
    save = MKA.markGrip(save);
    persist();
    if (gripBack === 'map') showMap();
    else openStation('move', true);
  }
  function gripMouse(which) {
    if (screen !== 'grip' || gripCard !== 0) return;
    var left = document.querySelector('[data-grip="left"]');
    var right = document.querySelector('[data-grip="right"]');
    if (which === 'left') {
      if (gripBits & 1) return;
      gripBits |= 1;
      if (left) { left.classList.add('done'); left.classList.remove('target'); }
      if (right) right.classList.add('target');
      sparkle(left);
      cheer();
      return;
    }
    if (which !== 'right') return;
    if (!(gripBits & 1)) { oops(document.querySelector('.grip-stage')); return; }
    if (gripBits & 2) return;
    gripBits |= 2;
    if (right) { right.classList.add('done'); right.classList.remove('target'); }
    sparkle(right);
    cheer();
    gripCardReady();
  }
  function gripBump(code) {
    if (screen !== 'grip' || gripCard !== 1) return;
    var result = MKA.bumpPress(gripBits, code);
    if (!result.hit) {
      oops(document.querySelector('.big-key.target') || document.querySelector('.grip-stage'));
      return;
    }
    gripBits = result.bits;
    var nodes = document.querySelectorAll('[data-code="' + code + '"]');
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].classList.add('done');
      nodes[i].classList.remove('target');
    }
    sparkle(document.querySelector('.big-key[data-code="' + code + '"]'));
    cheer();
    if (result.done) gripCardReady();
  }
  function gripSit(part) {
    if (screen !== 'grip' || gripCard !== 2) return;
    var bit = part === 'back' ? 1 : part === 'feet' ? 2 : part === 'eyes' ? 4 : 0;
    if (!bit || (gripBits & bit)) return;
    gripBits |= bit;
    var el = document.querySelector('[data-sit="' + part + '"]');
    if (el) { el.classList.add('done'); el.classList.remove('target'); sparkle(el); }
    cheer();
    if (gripBits === 7) gripCardReady();
  }
  function renderMap() {
    var html = '<button type="button" class="grip-link" id="btnGrip">كيف أمسك الفأرة واللوحة؟</button><div class="map">';
    var nextId = '';
    for (var n = 0; n < MKA.STATIONS.length; n++) {
      if (MKA.isOpen(save, MKA.STATIONS[n].id) && !(save.done && save.done[MKA.STATIONS[n].id])) { nextId = MKA.STATIONS[n].id; break; }
    }
    for (var i = 0; i < MKA.STATIONS.length; i++) {
      var station = MKA.STATIONS[i];
      var open = MKA.isOpen(save, station.id);
      var done = !!(save.done && save.done[station.id]);
      html += '<button type="button" class="station' + (done ? ' done' : '') + (station.id === nextId ? ' now' : '') + '" data-act="open" data-station="' + station.id + '"' +
        (open ? '' : ' disabled') + '><span class="num">' + (i + 1) + '</span><span class="ico" aria-hidden="true">' + station.icon + '</span><span>' + station.title + '</span>' +
        (done ? '<span class="mark" aria-hidden="true">⭐</span>' : (!open ? '<span class="mark" aria-hidden="true">🔒</span>' : '')) + '</button>';
    }
    var label = MKA.allDone(save) ? 'الشهادة' : (MKA.stickerCount(save) ? 'التالي' : 'ابدأ');
    html += '</div><div class="start-row"><span class="map-hand" aria-hidden="true">👆</span><button type="button" class="go" id="btnStart">' + label + '</button></div>';
    view.innerHTML = html;
    hideOverlay();
    langHintEl.hidden = true;
    updateChrome();
    var start = $('btnStart');
    if (start) start.focus();
  }
  function showMap() {
    quitRound();
    clearCoach();
    cancelJump();
    dragging = false;
    stationId = '';
    progress = 0;
    screen = 'map';
    renderMap();
    speakOnce(promptPhrase());
  }
  function showCert() {
    quitRound();
    clearCoach();
    cancelJump();
    screen = 'cert';
    stationId = '';
    view.innerHTML = '<div class="cert"><h2>شهادة</h2><p class="cert-name" id="certName" dir="auto"></p>' +
      '<p>أكملت المحطات الثمانية</p><div class="stars" aria-hidden="true">⭐⭐⭐⭐⭐⭐⭐⭐</div><div id="certForm"></div>' +
      '<button type="button" data-act="map">الخريطة</button></div>';
    $('certName').textContent = save.name || '';
    if (!save.name) $('certForm').innerHTML = nameFormHTML();
    hideOverlay();
    updateChrome();
    speak('شهادة');
  }
  function nameFormHTML() {
    return '<form id="nameForm" class="name-form"><label for="kidName">اسمك</label> ' +
      '<input id="kidName" class="target" name="kid" dir="auto" maxlength="32" autocomplete="off" spellcheck="false"> ' +
      '<button type="submit">تم</button></form>';
  }
  function showCelebrate() {
    screen = 'celebrate';
    var nextLabel = MKA.allDone(save) ? 'الشهادة' : 'التالي';
    var arrow = MKA.allDone(save) ? '' : '<span class="next-arrow" aria-hidden="true">←</span>';
    showOverlay('<div class="panel celebrate"><div class="big" aria-hidden="true">⭐</div><p>أحسنت!</p>' +
      '<div class="actions"><button type="button" id="btnNext" class="next" data-act="next"><span>' + nextLabel + '</span>' + arrow + '</button></div></div>');
    updateChrome();
    say('أحسنت');
    fanfare();
    speak('أحسنت');
    var panel = overlay.querySelector('.panel');
    if (panel) sparkle(panel);
    var next = $('btnNext');
    if (next) next.focus();
  }
  function showTeacher() {
    var html = '<div class="panel"><h2>للمعلم</h2><p>القفز يفتح المحطة دون منح ملصق.</p><div class="jumps">';
    for (var i = 0; i < MKA.STATIONS.length; i++) {
      var station = MKA.STATIONS[i];
      html += '<button type="button" data-act="jump" data-station="' + station.id + '">' + station.title + '</button>';
    }
    html += '</div><div class="actions"><button type="button" data-act="ask-reset">طالب جديد</button>' +
      '<button type="button" data-act="close">رجوع</button></div></div>';
    showOverlay(html);
  }
  function askReset() {
    showOverlay('<div class="panel"><h2>طالب جديد</h2><p>نبدأ من جديد على هذا الجهاز؟</p><div class="actions">' +
      '<button type="button" id="btnYesReset" data-act="do-reset">نعم</button>' +
      '<button type="button" data-act="close">لا</button></div></div>');
  }
  function resetStudent() {
    var next = MKA.freshSave();
    if (!store.set('save', next)) { status.failed(); return false; }
    quitRound();
    save = next;
    said = Object.create(null);
    status.saved();
    cancelJump();
    clearEdges();
    showGrip('lesson');
    return true;
  }
  function pausePlay() {
    if (screen !== 'play') return;
    screen = 'pause';
    clearTimeout(hintTimer);
    clearTimeout(releaseTimer);
    releaseTimer = 0;
    dragging = false;
    cancelJump();
    stopDemo();
    hush();
    showOverlay('<div class="panel"><h2>استراحة</h2><div class="actions">' +
      '<button type="button" id="btnResume">تابع</button>' +
      '<button type="button" id="btnRestart">من جديد</button>' +
      '<button type="button" data-act="map">الخريطة</button></div></div>');
    updateChrome();
    var resume = $('btnResume');
    if (resume) resume.focus();
  }
  function resumePlay() {
    if (screen !== 'pause') return;
    screen = 'play';
    hideOverlay();
    updateChrome();
    if (stationId === 'jump') {
      if (jumpNeedsIntro()) armJumpIntro();
      else startJumpLoop();
    }
    coachNow();
  }
  function closeOverlay() {
    if (screen === 'pause') resumePlay();
    else {
      hideOverlay();
      if (screen === 'play' && stationId === 'jump' && !jumpNeedsIntro()) startJumpLoop();
    }
  }

  function renderStation() {
    var station = MKA.stationById(stationId);
    view.innerHTML = '<div id="field" data-station="' + station.id + '"></div>';
    if (station.id === 'move') renderMove();
    else if (station.id === 'click') renderClick();
    else if (station.id === 'double') renderDouble();
    else if (station.id === 'drag') renderDrag();
    else if (station.id === 'scroll') renderScroll();
    else if (station.id === 'arrows') renderMaze();
    else if (station.id === 'jump') renderJump();
    else if (station.id === 'letters') renderLetters();
    langHintEl.hidden = true;
    setPrompt();
    say(station.prompt);
  }
  function refreshStation() {
    if (stationId === 'scroll') {
      var box = field();
      if (box) box.classList.toggle('scrolled', progress > 0);
      markFriends();
      setPrompt();
      return;
    }
    if (stationId === 'move') renderMove();
    else if (stationId === 'click') renderClick();
    else if (stationId === 'double') renderDouble();
    else if (stationId === 'drag') renderDrag();
    else if (stationId === 'letters') paintLetters();
    else if (stationId === 'arrows') paintMaze();
    setPrompt();
  }
  function openStation(id, force) {
    if (!force && MKA.gripNeeded(save)) { showGrip('lesson'); return; }
    if (!MKA.isOpen(save, id)) return;
    quitRound();
    clearCoach();
    cancelJump();
    clearEdges();
    dragging = false;
    lastClick = null;
    maze = null;
    jumpWorld = null;
    stationId = id;
    progress = 0;
    goal = MKA.stationById(id).goal;
    hintOn = false;
    screen = 'play';
    Kit.stats.round(stationId);
    roundOpen = true;
    if (!tutStart && MKA.stickerCount(save) === 0) { Kit.stats.tutorial('start'); tutStart = true; }
    hideOverlay();
    renderStation();
    updateChrome();
    coachNow();
  }
  function restartStation() {
    if (stationId && MKA.stationById(stationId)) openStation(stationId, true);
  }
  function startLesson() {
    if (MKA.gripNeeded(save)) { showGrip('lesson'); return; }
    if (MKA.allDone(save)) { showCert(); return; }
    for (var i = 0; i < MKA.STATIONS.length; i++) {
      var id = MKA.STATIONS[i].id;
      if (MKA.isOpen(save, id) && !save.done[id]) { openStation(id); return; }
    }
  }
  function goNext() {
    if (MKA.allDone(save)) { showCert(); return; }
    startLesson();
  }
  function teacherJump(id) {
    if (!MKA.stationById(id)) return;
    save = MKA.jumpTo(save, id);
    persist();
    openStation(id, true);
  }
  function finishStation() {
    if (screen !== 'play' || !roundOpen) return;
    screen = 'celebrate';
    clearCoach();
    cancelJump();
    dragging = false;
    save = MKA.markDone(save, stationId);
    var score = MKA.stickerCount(save);
    Kit.stats.end('win', score);
    roundOpen = false;
    if (MKA.allDone(save) && !tutDone) { Kit.stats.tutorial('done'); tutDone = true; }
    persist();
    showCelebrate();
    paintStickers();
  }
  function succeed() {
    if (screen !== 'play') return;
    var target = document.querySelector('#field .target');
    var step = MKA.noteSuccess(progress, goal);
    progress = step.progress;
    cheer();
    if (target) sparkle(target);
    praise();
    if (stationId === 'letters' && step.complete) {
      paintLetters();
      updateChrome();
      coachNow();
      return;
    }
    if (step.complete) { finishStation(); return; }
    refreshStation();
    coachNow();
  }

  function renderMove() {
    var spot = STAR_SPOTS[Math.min(progress, STAR_SPOTS.length - 1)];
    var radius = MKA.starRadius(progress);
    var size = Math.round(radius * 1.55);
    field().innerHTML = '<div class="buddy" id="buddy" style="left:82%;top:22%">🐭</div>' +
      '<div class="star target" style="left:' + spot[0] + '%;top:' + spot[1] + '%;width:' + size + 'px;height:' + size + 'px;font-size:' + Math.round(size * 0.72) + 'px">⭐</div>';
  }
  function pointerOnStar(e) {
    if (screen !== 'play' || stationId !== 'move') return;
    var star = document.querySelector('#field .star');
    var box = field();
    if (!star || !box) return;
    var sr = star.getBoundingClientRect();
    var fr = box.getBoundingClientRect();
    var buddy = $('buddy');
    if (buddy) {
      buddy.style.left = (e.clientX - fr.left) + 'px';
      buddy.style.top = (e.clientY - fr.top) + 'px';
    }
    var dx = e.clientX - (sr.left + sr.width / 2);
    var dy = e.clientY - (sr.top + sr.height / 2);
    if (Math.hypot(dx, dy) <= MKA.starRadius(progress)) { gestureHit = true; succeed(); }
  }

  function renderClick() {
    var spot = BALLOON_SPOTS[progress % BALLOON_SPOTS.length];
    var scale = MKA.balloonScale(progress);
    field().innerHTML = '<button type="button" class="balloon target" data-act="pop" style="left:' + spot[0] + '%;top:' + spot[1] +
      '%;transform:scale(' + scale + ')">🎈</button>';
  }
  function renderDouble() {
    field().innerHTML = '<div class="chest target" id="chest">🎁</div><div class="taps" id="taps"><i></i><i></i></div>';
  }
  function paintTaps(armed) {
    var taps = $('taps');
    if (taps) taps.classList.toggle('one', !!armed);
  }
  function onChestUp(e) {
    if (screen !== 'play' || stationId !== 'double' || !e.target.closest || !e.target.closest('#chest')) return;
    var prev = lastClick;
    var now = performance.now();
    var windowMs = MKA.doubleWindow(progress);
    var result = MKA.doubleClick(prev, now, windowMs);
    lastClick = result.time;
    if (result.opened) {
      clearTimeout(armTimer);
      paintTaps(false);
      succeed();
      return;
    }
    var tooSlow = typeof prev === 'number' && now - prev > windowMs;
    var chest = $('chest');
    if (chest) chest.classList.add('armed');
    paintTaps(true);
    clearTimeout(armTimer);
    armTimer = setTimeout(function () {
      var still = $('chest');
      if (screen !== 'play' || stationId !== 'double' || !still || !still.classList.contains('armed')) return;
      still.classList.remove('armed');
      paintTaps(false);
      lastClick = null;
      oops(still);
    }, windowMs + 60);
    if (tooSlow) oops(chest);
    else armIdle();
  }

  function renderDrag() {
    var big = progress === 0 ? ' big' : '';
    var left = progress === 0 ? 58 : 70;
    field().innerHTML = '<div class="fruit target' + big + '" id="fruit">' + FRUITS[progress % FRUITS.length] + '</div>' +
      '<div class="zone target' + big + '" id="zone" style="left:' + left + '%">🐰</div>';
  }
  function onPointerDown(e) {
    if (screen !== 'play' || !overlay.hidden) return;
    if (!e.target.closest || !e.target.closest('#field')) return;
    if (stationId === 'drag') {
      var fruit = e.target.closest('#fruit');
      if (!fruit) { oops(document.querySelector('#field .fruit')); return; }
      dragging = true;
      try { fruit.setPointerCapture(e.pointerId); } catch (err) { /* the pointer still moves the fruit */ }
      moveFruit(e);
      armIdle();
      return;
    }
    if (stationId === 'move') return;
    if (stationId === 'click' && !e.target.closest('.balloon')) oops(document.querySelector('#field .balloon'));
    else if (stationId === 'double' && !e.target.closest('#chest')) oops($('chest'));
    else if (stationId === 'scroll' && e.target.closest('#scroller')) {
      var scroller = $('scroller');
      var top = scroller ? scroller.scrollTop : 0;
      clearTimeout(scrollMiss);
      scrollMiss = setTimeout(function () {
        var again = $('scroller');
        if (again && again.scrollTop === top && screen === 'play' && stationId === 'scroll') oops(document.querySelector('#field .mouse-wheel'));
      }, 420);
    }
  }
  function moveFruit(e) {
    var fruit = $('fruit');
    var box = field();
    if (!fruit || !box) return;
    var fr = box.getBoundingClientRect();
    fruit.style.left = (e.clientX - fr.left) + 'px';
    fruit.style.top = (e.clientY - fr.top) + 'px';
  }
  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    var zone = $('zone');
    var fruit = $('fruit');
    if (!zone || !fruit) return;
    var rect = zone.getBoundingClientRect();
    var hit = MKA.dropHits(e.clientX, e.clientY, { x: rect.left, y: rect.top, w: rect.width, h: rect.height }, MKA.DROP_SLOP);
    if (hit) succeed();
    else {
      fruit.style.left = '';
      fruit.style.top = '';
      oops(fruit);
    }
  }

  function renderScroll() {
    field().innerHTML = '<div class="scroller" id="scroller" tabindex="0">' +
      '<div class="spacer"><b>👇</b><b>👇</b></div><div class="friend">🐭</div>' +
      '<div class="spacer"><b>👇</b><b>👇</b></div><div class="friend">🐱</div>' +
      '<div class="spacer"><b>👇</b><b>👇</b></div><div class="friend">🐰</div>' +
      '<div class="spacer"></div></div>' +
      '<div class="wheel-mouse" id="wheelMouse"><div class="mouse-body"><span class="mouse-btn"></span><span class="mouse-wheel target"></span><span class="mouse-btn"></span></div></div>' +
      '<button type="button" class="key down-key" data-code="ArrowDown">↓</button>';
    requestAnimationFrame(layoutScroll);
  }
  function layoutScroll() {
    var scroller = $('scroller');
    if (!scroller || stationId !== 'scroll') return;
    var height = Math.ceil(scroller.clientHeight * 1.05);
    var spacers = scroller.querySelectorAll('.spacer');
    for (var i = 0; i < spacers.length; i++) spacers[i].style.height = height + 'px';
    checkFriends();
  }
  function markFriends() {
    var scroller = $('scroller');
    if (!scroller) return;
    var nodes = scroller.querySelectorAll('.friend');
    for (var i = 0; i < nodes.length; i++) nodes[i].classList.toggle('met', i < progress);
  }
  function checkFriends() {
    if (stationId !== 'scroll' || screen !== 'play') return;
    var scroller = $('scroller');
    if (!scroller) return;
    var nodes = scroller.querySelectorAll('.friend');
    var count = 0;
    for (var i = 0; i < nodes.length; i++) {
      if (MKA.friendReached(scroller.scrollTop, scroller.clientHeight, nodes[i].offsetTop, nodes[i].offsetHeight)) count++;
    }
    while (progress < count && progress < goal && screen === 'play') succeed();
  }
  function scrollKey(code) {
    var scroller = $('scroller');
    if (!scroller) return;
    var page = Math.round(scroller.clientHeight * 0.85);
    if (code === 'ArrowDown') scroller.scrollTop += 80;
    else if (code === 'ArrowUp') scroller.scrollTop -= 80;
    else if (code === 'PageDown' || code === 'Space') scroller.scrollTop += page;
    else if (code === 'PageUp') scroller.scrollTop -= page;
    else if (code === 'Home') scroller.scrollTop = 0;
    else if (code === 'End') scroller.scrollTop = scroller.scrollHeight;
    else return;
    clearTimeout(scrollMiss);
    checkFriends();
  }

  function renderMaze() {
    maze = MKA.mazeStart();
    var html = '<div class="maze" dir="ltr">';
    for (var y = 0; y < MKA.MAZE_ROWS.length; y++) {
      html += '<div class="mrow">';
      for (var x = 0; x < MKA.MAZE_ROWS[y].length; x++) {
        html += '<div class="mcell" data-x="' + x + '" data-y="' + y + '"></div>';
      }
      html += '</div>';
    }
    html += '</div><div class="pad" dir="ltr">' +
      '<div class="pad-row"><button type="button" class="key" data-code="ArrowUp">↑</button></div>' +
      '<div class="pad-row"><button type="button" class="key" data-code="ArrowLeft">←</button>' +
      '<button type="button" class="key" data-code="ArrowDown">↓</button>' +
      '<button type="button" class="key" data-code="ArrowRight">→</button></div></div>';
    field().innerHTML = html;
    paintMaze();
  }
  function paintMaze() {
    if (!maze) return;
    var hint = MKA.mazeHint(maze);
    var step = ARROW_GLYPH[hint] ? {
      x: maze.x + (hint === 'ArrowRight' ? 1 : hint === 'ArrowLeft' ? -1 : 0),
      y: maze.y + (hint === 'ArrowDown' ? 1 : hint === 'ArrowUp' ? -1 : 0)
    } : null;
    var cells = document.querySelectorAll('#field .mcell');
    for (var i = 0; i < cells.length; i++) {
      var cell = cells[i];
      var x = Number(cell.getAttribute('data-x'));
      var y = Number(cell.getAttribute('data-y'));
      var ch = MKA.MAZE_ROWS[y].charAt(x);
      var cls = 'mcell';
      if (ch === '#') cls += ' wall';
      else cls += ' path';
      if (maze.x === x && maze.y === y) cls += ' player';
      else if (ch === 'G') cls += ' goal';
      else if (ch >= '1' && ch <= '3' && Number(ch) > maze.flags) cls += ' flag';
      if (step && step.x === x && step.y === y) cls += ' next target';
      cell.className = cls;
      var show = '';
      if (maze.x === x && maze.y === y) show = '🐭';
      else if (ch === 'G') show = '🚪';
      else if (ch >= '1' && ch <= '3' && Number(ch) > maze.flags) show = '🚩';
      else if (step && step.x === x && step.y === y) show = ARROW_GLYPH[hint];
      cell.textContent = show;
    }
    var keys = document.querySelectorAll('#field .pad .key');
    for (var k = 0; k < keys.length; k++) keys[k].classList.toggle('target', !!(hint && keys[k].getAttribute('data-code') === hint));
    paintPips();
  }
  function stepMaze(code) {
    if (!maze || screen !== 'play') return;
    var before = maze.x + ',' + maze.y;
    var flags = maze.flags;
    maze = MKA.mazeStep(maze, code);
    paintMaze();
    if (maze.done) succeed();
    else if (maze.x + ',' + maze.y === before) oops(document.querySelector('#field .mcell.player'));
    else {
      tap();
      if (maze.flags > flags) {
        cheer();
        praise();
        sparkle(document.querySelector('#field .mcell.player'));
      }
      armIdle();
    }
  }

  function jumpNeedsIntro() {
    return !!(jumpWorld && jumpWorld.jumps === 0 && jumpWorld.phase === 'run' && jumpWorld.x <= 40 && !jumpRaf);
  }
  function armJumpIntro() {
    clearTimeout(releaseTimer);
    releaseTimer = setTimeout(function () {
      releaseTimer = 0;
      if (screen === 'play' && stationId === 'jump' && jumpNeedsIntro()) startJumpLoop();
    }, reduced() ? 30 : 2400);
  }
  function renderJump() {
    jumpWorld = MKA.jumpStart();
    field().innerHTML = '<div class="track" dir="ltr"><div class="ground"></div><div class="kid" id="kid">🧒</div>' +
      '<div class="bush" style="left:26%">🌿</div><div class="bush" style="left:52%">🌿</div><div class="bush" style="left:78%">🌿</div>' +
      '<div class="door" id="door">🚪</div></div><p class="jump-note" id="jumpNote" hidden>🚪 لاحقًا</p>' +
      '<div class="jump-keys" dir="ltr"><button type="button" class="key space" id="keySpace" data-code="Space">مسافة</button>' +
      '<button type="button" class="key" id="keyEnter" data-code="Enter">Enter</button></div>';
    paintJump();
    armJumpIntro();
  }
  function paintJump() {
    var kid = $('kid');
    if (!kid || !jumpWorld) return;
    kid.style.left = (jumpWorld.x / 10) + '%';
    kid.classList.toggle('up', jumpWorld.phase === 'hop');
    var door = jumpWorld.phase === 'door';
    var spaceKey = $('keySpace');
    var enterKey = $('keyEnter');
    if (spaceKey) {
      spaceKey.classList.toggle('target', !door);
      spaceKey.classList.toggle('dim', door);
    }
    if (enterKey) {
      enterKey.classList.toggle('target', door);
      enterKey.classList.toggle('dim', !door);
    }
    var bushes = document.querySelectorAll('#field .bush');
    for (var i = 0; i < bushes.length; i++) bushes[i].classList.toggle('target', jumpWorld.phase === 'wait' && i === jumpWorld.jumps);
    var doorEl = $('door');
    if (doorEl) doorEl.classList.toggle('target', door);
    paintPips();
  }
  function showLater() {
    var later = $('jumpNote');
    if (later) later.hidden = false;
    nudge($('keySpace'));
    boop();
    playDemo();
    clearTimeout(laterTimer);
    laterTimer = setTimeout(function () {
      var note = $('jumpNote');
      if (note) note.hidden = true;
    }, 1600);
  }
  function startJumpLoop() {
    if (screen !== 'play' || stationId !== 'jump' || !jumpWorld || jumpWorld.done) return;
    if (jumpRaf) return;
    clearTimeout(releaseTimer);
    releaseTimer = 0;
    var last = 0;
    var shown = jumpWorld.phase === 'door' ? 'enter' : 'space';
    function frame(now) {
      if (screen !== 'play' || stationId !== 'jump' || !jumpWorld || jumpWorld.done) { jumpRaf = 0; return; }
      var dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      var pace = jumpWorld.jumps >= 2 ? 0.88 : jumpWorld.jumps === 1 ? 0.72 : 0.55;
      var input = { space: !!edgeDown.Space, spaceHeld: !!heldDown.Space, enter: !!edgeDown.Enter };
      edgeDown.Space = false;
      edgeDown.Enter = false;
      jumpWorld = MKA.jumpStep(jumpWorld, dt * pace, input);
      paintJump();
      if (jumpWorld.note === 'later') showLater();
      var mode = jumpWorld.phase === 'door' ? 'enter' : 'space';
      if (mode !== shown) { shown = mode; playDemo(); speak(mode === 'enter' ? 'Enter' : 'مسافة'); }
      if (jumpWorld.done) finishStation();
      else jumpRaf = requestAnimationFrame(frame);
    }
    jumpRaf = requestAnimationFrame(frame);
  }

  function renderLetters() {
    var html = '<p class="big-letter target" id="bigLetter"></p><div class="kbd" dir="ltr">';
    for (var r = 0; r < MKA.KEY_ROWS.length; r++) {
      html += '<div class="krow">';
      for (var i = 0; i < MKA.KEY_ROWS[r].length; i++) {
        var code = MKA.KEY_ROWS[r][i];
        html += '<button type="button" class="key" data-code="' + code + '"><b>' + MKA.AR[code] + '</b><small>' + MKA.EN[code] + '</small></button>';
      }
      html += '</div>';
    }
    html += '</div><div id="nameSlot"></div>';
    field().innerHTML = html;
    paintLetters();
  }
  function paintLetters() {
    var want = progress >= MKA.LETTERS.length ? '' : (MKA.LETTERS[progress] || '');
    var keys = document.querySelectorAll('#field .kbd .key');
    for (var i = 0; i < keys.length; i++) {
      var on = keys[i].getAttribute('data-code') === want;
      keys[i].classList.toggle('on', on);
      keys[i].classList.toggle('target', on);
    }
    var big = $('bigLetter');
    if (big) {
      big.textContent = want ? MKA.AR[want] : '';
      big.hidden = !want;
    }
    var box = field();
    if (box) box.classList.toggle('naming', progress >= MKA.LETTERS.length);
    if (progress >= MKA.LETTERS.length && !$('nameForm')) {
      var slot = $('nameSlot');
      if (slot) {
        slot.innerHTML = nameFormHTML();
        var input = $('kidName');
        if (input) { input.value = save.name || ''; input.focus(); }
      }
      langHintEl.hidden = true;
    }
  }
  function typeName(code) {
    var ch = MKA.AR[code];
    var input = $('kidName');
    if (!ch || !input) return;
    input.value = MKA.cleanName((input.value || '') + ch);
    input.focus();
    tap();
    armIdle();
  }
  function pressCode(code, eventKey) {
    if (screen !== 'play' || stationId !== 'letters') return;
    if (naming()) { typeName(code); return; }
    if (progress >= MKA.LETTERS.length) return;
    var hint = MKA.languageHint(code, eventKey);
    langHintEl.hidden = !hint;
    langHintEl.textContent = hint;
    if (!MKA.acceptKey(MKA.LETTERS[progress], code)) {
      oops(document.querySelector('#field .kbd .key[data-code="' + code + '"]') || $('bigLetter'));
      return;
    }
    succeed();
  }

  function onPointerMove(e) {
    if (!overlay.hidden) return;
    if (stationId === 'move' && screen === 'play') {
      var ghost = $('ghost');
      if (ghost && !ghost.hidden) stopDemo();
      pointerOnStar(e);
    }
    if (dragging) moveFruit(e);
  }
  function onPointerUp(e) {
    onChestUp(e);
    endDrag(e);
    if (stationId === 'move' && screen === 'play' && overlay.hidden && !gestureHit && e.target.closest && e.target.closest('#field')) {
      oops(document.querySelector('#field .star'));
    }
    gestureHit = false;
    if (e.target.closest && e.target.closest('#keySpace, #keyEnter')) {
      delete heldDown.Space;
      delete heldDown.Enter;
    }
  }
  function onClick(e) {
    var act = e.target.closest ? e.target.closest('[data-act], #btnMap, #btnPause, #btnTeacher, #btnNew, #btnStart, #btnResume, #btnRestart, #btnGrip, [data-code], [data-grip], [data-sit]') : null;
    if (!act) return;
    if (act.id === 'btnPause') { pausePlay(); return; }
    if (act.id === 'btnResume') { resumePlay(); return; }
    if (act.id === 'btnRestart') { restartStation(); return; }
    if (act.id === 'btnMap' || act.getAttribute('data-act') === 'map') { showMap(); return; }
    if (act.id === 'btnTeacher') { showTeacher(); return; }
    if (act.id === 'btnNew' || act.getAttribute('data-act') === 'ask-reset') { askReset(); return; }
    if (act.id === 'btnStart') { startLesson(); return; }
    if (act.id === 'btnGrip') { showGrip('map'); return; }
    if (act.getAttribute('data-act') === 'grip-next') { gripAdvance(); return; }
    if (screen === 'grip') {
      var which = act.getAttribute('data-grip');
      if (which) { gripMouse(which); return; }
      var sit = act.getAttribute('data-sit');
      if (sit) { gripSit(sit); return; }
      var bump = act.getAttribute('data-code');
      if (bump) gripBump(bump);
      return;
    }
    if (act.getAttribute('data-act') === 'open') { openStation(act.getAttribute('data-station')); return; }
    if (act.getAttribute('data-act') === 'jump') { teacherJump(act.getAttribute('data-station')); return; }
    if (act.getAttribute('data-act') === 'do-reset') { resetStudent(); return; }
    if (act.getAttribute('data-act') === 'close') { closeOverlay(); return; }
    if (act.getAttribute('data-act') === 'next') { goNext(); return; }
    if (act.getAttribute('data-act') === 'pop') {
      if (screen === 'play' && stationId === 'click') succeed();
      return;
    }
    var code = act.getAttribute('data-code');
    if (!code || screen !== 'play') return;
    if (stationId === 'arrows') stepMaze(code);
    else if (stationId === 'letters') pressCode(code, MKA.AR[code] || '');
    else if (stationId === 'scroll') scrollKey(code);
    else if (stationId === 'jump' && (code === 'Space' || code === 'Enter')) {
      heldDown[code] = true;
      edgeDown[code] = true;
      if (!jumpRaf) startJumpLoop();
    }
  }
  function onKeyDown(e) {
    if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
    if (typingTarget(e)) return;
    if (e.code === 'KeyP' || e.code === 'Escape') {
      if (e.repeat) return;
      e.preventDefault();
      if (screen === 'play') pausePlay();
      else if (screen === 'pause') resumePlay();
      return;
    }
    if (screen === 'pause' && e.code === 'KeyR' && !e.repeat) {
      e.preventDefault();
      restartStation();
      return;
    }
    if (screen === 'grip') {
      if (e.repeat || e.code === 'Space' || e.code === 'Enter') return;
      if (gripCard === 1) gripBump(e.code);
      return;
    }
    if (screen !== 'play') return;
    if (e.code === 'Space' || e.code === 'Enter' || e.code.indexOf('Arrow') === 0 || e.code === 'PageUp' || e.code === 'PageDown' || e.code === 'Home' || e.code === 'End') {
      e.preventDefault();
    }
    if (e.repeat) return;
    heldDown[e.code] = true;
    edgeDown[e.code] = true;
    if (stationId === 'arrows') stepMaze(e.code);
    else if (stationId === 'scroll') {
      if (e.code === 'ArrowDown' || e.code === 'ArrowUp' || e.code === 'PageDown' || e.code === 'PageUp' || e.code === 'Home' || e.code === 'End' || e.code === 'Space') scrollKey(e.code);
      else if (e.code !== 'KeyM') oops(document.querySelector('#field .mouse-wheel'));
    } else if (stationId === 'letters') pressCode(e.code, e.key);
    else if (stationId === 'jump') {
      if (e.code === 'Space' || e.code === 'Enter') { if (!jumpRaf) startJumpLoop(); }
      else if (e.code !== 'KeyM') oops($(jumpWorld && jumpWorld.phase === 'door' ? 'keyEnter' : 'keySpace'));
    } else if (stationId === 'move' && e.code !== 'KeyM') oops(document.querySelector('#field .star'));
    else if ((stationId === 'click' || stationId === 'double') && e.code !== 'KeyM') {
      oops(stationId === 'click' ? document.querySelector('#field .balloon') : $('chest'));
    }
  }
  function onSubmit(e) {
    if (!e.target || e.target.id !== 'nameForm') return;
    e.preventDefault();
    var input = e.target.querySelector('input');
    var result = MKA.acceptName(input ? input.value : '');
    if (!result.ok) {
      oops(input);
      if (input) input.focus();
      return;
    }
    save.name = result.name;
    if (screen === 'play' && stationId === 'letters') finishStation();
    else {
      persist();
      var cert = $('certName');
      if (cert) cert.textContent = save.name;
      var slot = $('certForm');
      if (slot) slot.innerHTML = '';
    }
  }

  app.addEventListener('click', onClick);
  app.addEventListener('pointerdown', onPointerDown);
  app.addEventListener('pointermove', onPointerMove);
  app.addEventListener('pointerup', onPointerUp);
  app.addEventListener('wheel', function () {
    if (stationId === 'scroll' && screen === 'play') clearTimeout(scrollMiss);
  }, { passive: true });
  app.addEventListener('scroll', function (e) {
    if (e.target && e.target.id === 'scroller') checkFriends();
  }, true);
  app.addEventListener('contextmenu', function (e) {
    var act = e.target.closest && e.target.closest('[data-grip="right"]');
    if (screen !== 'grip' || !act) return;
    e.preventDefault();
    gripMouse('right');
  });
  app.addEventListener('submit', onSubmit);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', function (e) { delete heldDown[e.code]; });
  window.addEventListener('blur', clearEdges);
  window.addEventListener('resize', function () {
    if (stationId === 'scroll' && screen === 'play') layoutScroll();
  });

  Kit.lifecycle({
    pause: function () { pausePlay(); },
    reset: function () { clearEdges(); }
  });
  Kit.muteButton();

  save = MKA.loadSave(store.get('save', null));
  var query = '';
  try { query = new URLSearchParams(location.search).get('station') || ''; } catch (err) { query = ''; }
  if (query && MKA.stationById(query)) {
    save = MKA.jumpTo(save, query);
    persist();
    openStation(query, true);
  } else if (MKA.gripNeeded(save)) showGrip('lesson');
  else showMap();

  window.__game = {
    get screen() { return screen; },
    get station() { return stationId; },
    get progress() { return progress; },
    get goal() { return goal; },
    get save() { return save; },
    get hint() { return hintOn; },
    get phase() { return jumpWorld ? jumpWorld.phase : ''; },
    starPoint: function () {
      var star = document.querySelector('#field .star:not(.got)');
      if (!star) return { x: 0, y: 0 };
      var rect = star.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }
  };
  Kit.ready();
})();
