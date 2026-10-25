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
  var gripReady = false;
  var gripBack = 'lesson';
  var GRIP_WORD = ['أمسك الفأرة', 'انقر هنا', 'حرّكها', 'اضغط', 'اجلس'];
  var GRIP_SAY = ['أمسك الفأرة', 'انقر الزر الآخر', 'حرّك الفأرة', 'اضغط المفتاح', 'اجلس'];
  var GRIP_ICON = ['🖱️', '👆', '⭐', '⌨️', '🧒'];

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
    if (screen === 'grip') return GRIP_WORD[gripCard] || GRIP_WORD[0];
    if (naming()) return 'اسمك';
    var station = MKA.stationById(stationId);
    if (station && screen !== 'map' && screen !== 'cert') return station.prompt;
    if (screen === 'cert') return 'شهادة';
    if (MKA.stickerCount(save) > 0 && !MKA.allDone(save)) return 'التالي';
    return 'ابدأ';
  }
  function promptIcon() {
    if (screen === 'grip') return GRIP_ICON[gripCard] || GRIP_ICON[0];
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
      var marks = '';
      for (var g = 0; g < GRIP_ICON.length; g++) marks += '<span class="' + (g < gripCard ? 'on' : (g === gripCard ? 'now' : '')) + '">' + GRIP_ICON[g] + '</span>';
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
    app.classList.toggle('gripping', screen === 'grip');
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
    var fallback = null;
    for (var i = 0; i < list.length; i++) {
      var lang = list[i].lang || '';
      if (!/^ar([-_]|$)/i.test(lang)) continue;
      if (/^ar[-_]SA$/i.test(lang)) { voice = list[i]; return; }
      if (!fallback) fallback = list[i];
    }
    voice = fallback;
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
    var stars = ['⭐', '🌟', '⭐', '✨', '⭐', '🌟', '⭐', '✨', '⭐', '🌟'];
    var dye = ['#ff5a78', '#ffcc00', '#3dce8e', '#4aa3ff', '#ff8a34', '#b07bff', '#ff5a78', '#ffcc00'];
    function fly(node, dx, dy, spin) {
      if (!node.animate) return;
      node.animate([
        { opacity: 1, transform: 'translate(0,0) scale(1)' },
        { opacity: 0, transform: 'translate(' + dx + 'px,' + dy + 'px) rotate(' + spin + 'deg) scale(0.7)' }
      ], { duration: 1000, easing: 'ease-out', fill: 'forwards' });
    }
    var i;
    for (i = 0; i < stars.length; i++) {
      var bit = document.createElement('span');
      bit.textContent = stars[i];
      var angle = Math.PI * 2 * i / stars.length;
      var dist = 150 + (i % 3) * 48;
      bit.style.fontSize = (52 + (i % 4) * 8) + 'px';
      burst.appendChild(bit);
      fly(bit, Math.round(Math.cos(angle) * dist), Math.round(Math.sin(angle) * dist * 0.7), i * 28);
    }
    for (i = 0; i < 8; i++) {
      var fleck = document.createElement('i');
      var a = Math.PI * 2 * i / 8 + 0.4;
      var far = 120 + (i % 3) * 36;
      fleck.style.background = dye[i];
      burst.appendChild(fleck);
      fly(fleck, Math.round(Math.cos(a) * far), Math.round(Math.sin(a) * far * 0.75), i * 45);
    }
    host.appendChild(burst);
    setTimeout(function () { if (burst.parentNode) burst.parentNode.removeChild(burst); }, 1100);
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

  function mouseFace(side) {
    var on = side === 'right' ? 'right' : 'left';
    return '<i class="bulb left' + (on === 'left' ? ' lit' : '') + '"></i><i class="bulb right' + (on === 'right' ? ' lit' : '') + '"></i><i class="split"></i><i class="eye"></i><i class="eye r"></i><i class="smile"></i>';
  }
  function handSvg(cls) {
    return '<svg class="' + cls + '" viewBox="26 26 216 186"><path d="M110 200C105 200 98 205 92 204C86 203 80 200 76 196C72 192 70 185 68 180C66 175 66 169 64 164C62 159 57 156 54 152C51 148 47 144 44 140C41 136 39 131 38 126C37 121 38 116 40 112C42 108 46 103 50 100C54 97 60 96 64 96C68 96 73 103 74 102C75 101 73 93 72 88C71 83 69 77 70 72C71 67 73 62 76 58C79 54 84 50 88 48C92 46 96 45 100 46C104 47 108 50 110 54C112 58 114 63 114 68C114 73 113 78 112 82C111 86 108 90 108 94C108 98 112 103 114 104C116 105 120 103 122 100C124 97 125 90 126 84C127 78 128 72 130 66C132 60 135 54 138 50C141 46 146 42 150 40C154 38 160 37 164 38C168 39 173 44 176 48C179 52 180 59 180 64C180 69 178 75 176 80C174 85 170 88 168 92C166 96 165 103 166 104C167 105 171 103 174 100C177 97 179 92 182 88C185 84 189 80 192 78C195 76 199 75 202 76C205 77 209 82 210 86C211 90 210 94 210 98C210 102 207 108 208 110C209 112 213 110 216 108C219 106 221 101 224 100C227 99 230 100 232 102C234 104 235 110 234 114C233 118 231 122 228 124C225 126 219 125 216 128C213 131 212 136 210 140C208 144 205 149 202 154C199 159 195 164 190 168C185 172 180 176 174 180C168 184 162 187 156 190C150 193 142 196 136 198C130 200 124 202 120 202C116 202 115 200 110 200Z"/></svg>';
  }
  function gripScene() {
    if (gripCard === 0 || gripCard === 1) {
      var side = gripCard === 1 ? 'right' : 'left';
      return '<div class="pair ' + side + '"><i class="wrist"></i>' + handSvg('hand ' + side) +
        '<button type="button" class="mousey target" data-grip="' + side + '">' + mouseFace(side) + '</button></div>';
    }
    if (gripCard === 2) {
      return '<div class="pair slide"><i class="wrist"></i><div class="glide">' + handSvg('hand left') +
        '<div class="mousey">' + mouseFace('left') + '</div></div></div>' +
        '<button type="button" class="catch target" data-grip="star" aria-label="نجمة">⭐</button>';
    }
    if (gripCard === 3) {
      return '<div class="keys"><div class="keywrap">' + handSvg('paw') +
        '<button type="button" class="bump target" data-code="KeyF">' + MKA.AR.KeyF + '<i class="nub"></i></button></div>' +
        '<div class="keywrap">' + handSvg('paw') +
        '<button type="button" class="bump target" data-code="KeyJ">' + MKA.AR.KeyJ + '<i class="nub"></i></button></div></div>';
    }
    return '<div class="sit"><i class="chair"></i><i class="desk"></i><i class="mon"></i><i class="kb"></i>' +
      '<button type="button" class="child" data-sit="kid"><i class="thigh far"></i><i class="shin far"></i><i class="foot far"></i>' +
      '<i class="thigh"></i><i class="shin"></i><i class="foot"></i>' +
      '<i class="torso"><i class="head"><i class="hair"></i><i class="eye"></i><i class="smile"></i></i></i>' +
      '<i class="uarm"></i><i class="farm"></i><i class="mitt"></i></button></div>';
  }
  function renderGrip() {
    gripReady = gripCard === 4;
    view.innerHTML = '<div class="grip"><div class="grip-stage go">' + gripScene() + '</div>' +
      '<div class="grip-bar"><button type="button" class="replay" data-act="grip-replay" aria-label="أعد">🔊</button>' +
      '<b class="yay" hidden>أحسنت!</b>' +
      '<button type="button" class="next' + (gripReady ? ' target' : '') + '" id="btnGripNext" data-act="grip-next"' + (gripReady ? '' : ' hidden') +
      '><span>التالي</span><span class="next-arrow" aria-hidden="true">←</span></button></div></div>';
    hideOverlay();
    hideToast();
    langHintEl.hidden = true;
    updateChrome();
    say(GRIP_WORD[gripCard]);
    speak(GRIP_SAY[gripCard]);
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
    gripReady = false;
    gripBack = back === 'map' ? 'map' : 'lesson';
    renderGrip();
  }
  function replayGrip() {
    if (screen !== 'grip') return;
    var stage = document.querySelector('.grip-stage');
    if (!stage) return;
    var kid = stage.querySelector('.child');
    if (kid) kid.classList.remove('sat');
    stage.classList.remove('go');
    void stage.offsetWidth;
    stage.classList.add('go');
    speak(GRIP_SAY[gripCard]);
  }
  function gripCardReady() {
    if (gripReady) return;
    gripReady = true;
    say('أحسنت');
    speak('أحسنت');
    celebrate(document.querySelector('.grip-stage .target'));
    var btn = $('btnGripNext');
    if (btn) { btn.hidden = false; btn.classList.add('target'); btn.focus(); }
    paintPips();
  }
  function gripAdvance() {
    if (screen !== 'grip' || !gripReady) return;
    if (gripCard < 4) {
      gripCard += 1;
      renderGrip();
      return;
    }
    save = MKA.markGrip(save);
    persist();
    if (gripBack === 'map') showMap();
    else openStation('move', true);
  }
  function gripMouse(which) {
    if (screen !== 'grip' || gripReady) return;
    if (gripCard === 0 && which === 'left') { gripCardReady(); return; }
    if (gripCard === 1 && which === 'right') { gripCardReady(); return; }
    if (gripCard === 2 && which === 'star') { gripCardReady(); return; }
    oops(document.querySelector('.grip-stage .target'));
  }
  function gripBump(code) {
    if (screen !== 'grip' || gripCard !== 3 || gripReady) return;
    if (code === 'KeyF' || code === 'KeyJ') { gripCardReady(); return; }
  }
  function celebrate(el) {
    var yay = document.querySelector('.yay');
    if (yay) yay.hidden = false;
    if (el) { el.classList.add('boing'); sparkle(el); }
    cheer();
  }
  function gripSit() {
    if (screen !== 'grip' || gripCard !== 4) return;
    var kid = document.querySelector('[data-sit="kid"]');
    if (!kid || kid.classList.contains('sat')) return;
    kid.classList.add('sat');
    celebrate(kid);
  }
  function renderMap() {
    var html = '<button type="button" class="grip-link" id="btnGrip">🖱️ كيف أمسك؟</button><div class="map">';
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
      '<div class="stars" aria-hidden="true">⭐⭐⭐⭐⭐⭐⭐⭐</div><div id="certForm"></div>' +
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
    var html = '<div class="panel"><h2>للمعلم</h2><p>القفز يفتح المحطة دون منح ملصق.</p>' +
      '<p>لليد اليسرى: بدّل زرّي الفأرة من إعدادات الجهاز.</p><div class="jumps">';
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
      '<div class="door" id="door">🚪</div></div><p class="jump-note" id="jumpNote" hidden>🚪</p>' +
      '<div class="jump-keys" dir="ltr"><button type="button" class="key space" id="keySpace" data-code="Space" aria-label="مسافة"></button>' +
      '<button type="button" class="key" id="keyEnter" data-code="Enter" aria-label="Enter">↵</button></div>';
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
    var letterBox = field();
    if (letterBox) letterBox.classList.toggle('show-latin', !!hint);
    if (!MKA.acceptKey(MKA.LETTERS[progress], code)) {
      oops(document.querySelector('#field .kbd .key[data-code="' + code + '"]') || $('bigLetter'));
      return;
    }
    succeed();
  }

  function onPointerMove(e) {
    if (!overlay.hidden) return;
    if (screen === 'grip' && gripCard === 2 && !gripReady) {
      var star = document.querySelector('[data-grip="star"]');
      if (star) {
        var box = star.getBoundingClientRect();
        if (e.clientX >= box.left && e.clientX <= box.right && e.clientY >= box.top && e.clientY <= box.bottom) gripMouse('star');
      }
    }
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
    if (act.getAttribute('data-act') === 'grip-replay') { replayGrip(); return; }
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
      if (gripCard === 3) gripBump(e.code);
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
