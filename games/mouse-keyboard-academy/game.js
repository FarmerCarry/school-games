/*
 * أكاديمية الفأرة واللوحة. A teacher opens the page and a child follows eight
 * stations. Nothing here can fail the child: no timer, lives, or sound.
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
  var jumpWorld = null;
  var jumpRaf = 0;
  var maze = null;
  var dragging = false;
  var lastClick = null;
  var noteText = '';
  var heldDown = Object.create(null);
  var edgeDown = Object.create(null);
  var STAR_SPOTS = [[18, 22], [78, 28], [24, 68], [80, 66]];
  var BALLOON_SPOTS = [[50, 42], [28, 58], [72, 36], [38, 32], [64, 60]];
  var FRUITS = ['🍎', '🍊', '🍌', '🍇'];

  function $(id) { return document.getElementById(id); }
  function field() { return $('field'); }
  function typingTarget(e) {
    return !!(e.target && e.target.closest && e.target.closest('input, textarea, select'));
  }
  function clearEdges() { heldDown = Object.create(null); edgeDown = Object.create(null); }

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
    var n = MKA.stickerCount(save);
    var html = '';
    for (var i = 0; i < MKA.STATIONS.length; i++) html += '<span class="' + (i < n ? 'on' : '') + '">⭐</span>';
    $('stickers').innerHTML = html;
  }
  function setPrompt() {
    var station = MKA.stationById(stationId);
    var text = station && screen !== 'map' && screen !== 'cert' ? station.prompt : (screen === 'cert' ? 'شهادة' : 'اختر محطة');
    if (station && (screen === 'play' || screen === 'pause')) text += '  ' + progress + ' / ' + goal;
    if (noteText) text += '  ' + noteText;
    if (hintOn && station && screen === 'play') text += '  ' + station.hint;
    promptEl.textContent = text;
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
    }, MKA.HINT_MS);
  }
  function hideToast() {
    clearTimeout(toastTimer);
    toastEl.hidden = true;
  }
  function praise() {
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, 700);
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
    paintStickers();
    setPrompt();
  }

  function showOverlay(html) {
    hideToast();
    cancelJump();
    overlay.innerHTML = html;
    overlay.hidden = false;
  }

  function renderMap() {
    var html = '<div class="map">';
    for (var i = 0; i < MKA.STATIONS.length; i++) {
      var station = MKA.STATIONS[i];
      var open = MKA.isOpen(save, station.id);
      var done = !!(save.done && save.done[station.id]);
      html += '<button type="button" class="station' + (done ? ' done' : '') + '" data-act="open" data-station="' + station.id + '"' +
        (open ? '' : ' disabled') + '><span class="ico" aria-hidden="true">' + station.icon + '</span><span>' + station.title + '</span></button>';
    }
    var label = MKA.allDone(save) ? 'الشهادة' : (MKA.stickerCount(save) ? 'أكمل' : 'ابدأ');
    html += '</div><button type="button" class="go" id="btnStart">' + label + '</button>';
    view.innerHTML = html;
    hideOverlay();
    noteText = '';
    langHintEl.hidden = true;
    updateChrome();
    var start = $('btnStart');
    if (start) start.focus();
  }
  function showMap() {
    quitRound();
    cancelJump();
    clearTimeout(hintTimer);
    hintOn = false;
    dragging = false;
    stationId = '';
    progress = 0;
    screen = 'map';
    renderMap();
  }
  function showCert() {
    quitRound();
    cancelJump();
    screen = 'cert';
    stationId = '';
    view.innerHTML = '<div class="cert"><h2>شهادة</h2><p class="cert-name" id="certName" dir="auto"></p>' +
      '<p>أكملت المحطات الثمانية</p><div class="stars" aria-hidden="true">⭐⭐⭐⭐⭐⭐⭐⭐</div><div id="certForm"></div>' +
      '<button type="button" data-act="map">الخريطة</button></div>';
    $('certName').textContent = save.name || '';
    if (!save.name) $('certForm').innerHTML = nameFormHTML();
    hideOverlay();
    noteText = '';
    updateChrome();
  }
  function nameFormHTML() {
    return '<form id="nameForm" class="name-form"><label for="kidName">اسمك</label> ' +
      '<input id="kidName" name="kid" dir="auto" maxlength="32" autocomplete="off" spellcheck="false"> ' +
      '<button type="submit">تم</button></form>';
  }
  function showCelebrate() {
    screen = 'celebrate';
    var next = MKA.allDone(save) ? 'الشهادة' : 'التالي';
    showOverlay('<div class="panel celebrate"><div class="big" aria-hidden="true">⭐</div><p>أحسنت!</p>' +
      '<div class="actions"><button type="button" id="btnNext" data-act="next">' + next + '</button></div></div>');
    updateChrome();
    say('أحسنت');
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
    status.saved();
    cancelJump();
    clearEdges();
    showMap();
    return true;
  }
  function pausePlay() {
    if (screen !== 'play') return;
    screen = 'pause';
    clearTimeout(hintTimer);
    dragging = false;
    cancelJump();
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
    armIdle();
    if (stationId === 'jump') startJumpLoop();
  }
  function closeOverlay() {
    if (screen === 'pause') resumePlay();
    else {
      hideOverlay();
      if (screen === 'play' && stationId === 'jump') startJumpLoop();
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
    noteText = '';
    setPrompt();
    say(station.prompt);
  }
  function refreshStation() {
    if (stationId === 'scroll') { markFriends(); setPrompt(); return; }
    if (stationId === 'move') renderMove();
    else if (stationId === 'click') renderClick();
    else if (stationId === 'double') renderDouble();
    else if (stationId === 'drag') renderDrag();
    else if (stationId === 'letters') paintLetters();
    else if (stationId === 'arrows') paintMaze();
    setPrompt();
  }
  function openStation(id) {
    if (!MKA.isOpen(save, id)) return;
    quitRound();
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
    armIdle();
    updateChrome();
  }
  function restartStation() {
    if (stationId && MKA.stationById(stationId)) openStation(stationId);
  }
  function startLesson() {
    if (MKA.allDone(save)) { showCert(); return; }
    for (var i = 0; i < MKA.STATIONS.length; i++) {
      var id = MKA.STATIONS[i].id;
      if (MKA.isOpen(save, id) && !save.done[id]) { openStation(id); return; }
    }
  }
  function teacherJump(id) {
    if (!MKA.stationById(id)) return;
    save = MKA.jumpTo(save, id);
    persist();
    openStation(id);
  }
  function finishStation() {
    if (screen !== 'play' || !roundOpen) return;
    screen = 'celebrate';
    cancelJump();
    clearTimeout(hintTimer);
    hintOn = false;
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
    var step = MKA.noteSuccess(progress, goal);
    progress = step.progress;
    praise();
    armIdle();
    if (stationId === 'letters' && step.complete) {
      paintLetters();
      setPrompt();
      return;
    }
    if (step.complete) { finishStation(); return; }
    refreshStation();
  }

  function renderMove() {
    var spot = STAR_SPOTS[Math.min(progress, STAR_SPOTS.length - 1)];
    field().innerHTML = '<div class="buddy" id="buddy">🐭</div><div class="star" style="left:' + spot[0] + '%;top:' + spot[1] + '%">⭐</div>' +
      '<div class="coach" id="coach" style="left:' + spot[0] + '%;top:' + spot[1] + '%">👆</div>';
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
    if (Math.hypot(dx, dy) <= MKA.STAR_R) succeed();
  }

  function renderClick() {
    var spot = BALLOON_SPOTS[progress % BALLOON_SPOTS.length];
    var scale = MKA.balloonScale(progress);
    field().innerHTML = '<button type="button" class="balloon" data-act="pop" style="left:' + spot[0] + '%;top:' + spot[1] +
      '%;transform:translate(-50%,-50%) scale(' + scale + ')">🎈</button><div class="coach" style="left:' + spot[0] + '%;top:' + spot[1] + '%">👆</div>';
  }
  function renderDouble() {
    field().innerHTML = '<div class="chest" id="chest">🎁</div><div class="coach" style="left:50%;top:42%">👆</div>';
  }
  function onChestUp(e) {
    if (screen !== 'play' || stationId !== 'double' || !e.target.closest || !e.target.closest('#chest')) return;
    var result = MKA.doubleClick(lastClick, performance.now(), MKA.DOUBLE_MS);
    lastClick = result.time;
    var chest = $('chest');
    if (chest) chest.classList.toggle('armed', !result.opened && result.time != null);
    armIdle();
    if (result.opened) succeed();
  }

  function renderDrag() {
    field().innerHTML = '<div class="fruit" id="fruit">' + FRUITS[progress % FRUITS.length] + '</div><div class="zone" id="zone">🐰</div>' +
      '<div class="coach" style="left:18%;top:48%">👆</div>';
  }
  function onPointerDown(e) {
    if (screen !== 'play' || stationId !== 'drag' || !overlay.hidden) return;
    var fruit = e.target.closest && e.target.closest('#fruit');
    if (!fruit) return;
    dragging = true;
    try { fruit.setPointerCapture(e.pointerId); } catch (err) { /* the pointer still moves the fruit */ }
    moveFruit(e);
    armIdle();
  }
  function moveFruit(e) {
    var fruit = $('fruit');
    var box = field();
    if (!fruit || !box) return;
    var fr = box.getBoundingClientRect();
    fruit.style.left = (e.clientX - fr.left - fruit.offsetWidth / 2) + 'px';
    fruit.style.top = (e.clientY - fr.top - fruit.offsetHeight / 2) + 'px';
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
    else { fruit.style.left = ''; fruit.style.top = ''; }
  }

  function renderScroll() {
    field().innerHTML = '<div class="scroller" id="scroller" tabindex="0">' +
      '<div class="spacer"></div><div class="friend">🐭</div>' +
      '<div class="spacer"></div><div class="friend">🐱</div>' +
      '<div class="spacer"></div><div class="friend">🐰</div>' +
      '<div class="spacer"></div></div><div class="down-hint coach">👇</div>';
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
      '<button type="button" class="key" data-code="ArrowUp">↑</button>' +
      '<button type="button" class="key" data-code="ArrowLeft">←</button>' +
      '<button type="button" class="key" data-code="ArrowDown">↓</button>' +
      '<button type="button" class="key" data-code="ArrowRight">→</button></div>';
    field().innerHTML = html;
    paintMaze();
  }
  function paintMaze() {
    if (!maze) return;
    var hint = hintOn ? MKA.mazeHint(maze) : '';
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
      cell.className = cls;
      cell.textContent = maze.x === x && maze.y === y ? '🐭' : (ch === 'G' ? '🚪' : (ch >= '1' && ch <= '3' && Number(ch) > maze.flags ? '🚩' : ''));
    }
    var keys = document.querySelectorAll('#field .pad .key');
    for (var k = 0; k < keys.length; k++) keys[k].classList.toggle('lit', !!(hint && keys[k].getAttribute('data-code') === hint));
  }
  function stepMaze(code) {
    if (!maze || screen !== 'play') return;
    maze = MKA.mazeStep(maze, code);
    paintMaze();
    if (maze.done) succeed();
  }

  function renderJump() {
    jumpWorld = MKA.jumpStart();
    field().innerHTML = '<div class="track" dir="ltr"><div class="ground"></div><div class="kid" id="kid">🧒</div>' +
      '<div class="bush" style="left:26%">🌿</div><div class="bush" style="left:52%">🌿</div><div class="bush" style="left:78%">🌿</div>' +
      '<div class="door">🚪</div></div><p class="jump-note" id="jumpNote" hidden>الباب لاحقًا</p>' +
      '<div class="jump-keys" dir="ltr"><span class="key" id="keySpace">مسافة</span><span class="key" id="keyEnter">Enter</span></div>';
    paintJump();
    startJumpLoop();
  }
  function paintJump() {
    var kid = $('kid');
    if (!kid || !jumpWorld) return;
    kid.style.left = (jumpWorld.x / 10) + '%';
    kid.classList.toggle('up', jumpWorld.phase === 'hop');
    var spaceKey = $('keySpace');
    var enterKey = $('keyEnter');
    if (spaceKey) spaceKey.classList.toggle('lit', hintOn && jumpWorld.phase !== 'door');
    if (enterKey) enterKey.classList.toggle('lit', hintOn && jumpWorld.phase === 'door');
    var later = $('jumpNote');
    if (later) later.hidden = jumpWorld.note !== 'later';
  }
  function startJumpLoop() {
    cancelJump();
    var last = 0;
    function frame(now) {
      if (screen !== 'play' || stationId !== 'jump' || !jumpWorld || jumpWorld.done) return;
      var dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      var input = { space: !!edgeDown.Space, spaceHeld: !!heldDown.Space, enter: !!edgeDown.Enter };
      edgeDown.Space = false;
      edgeDown.Enter = false;
      jumpWorld = MKA.jumpStep(jumpWorld, dt, input);
      paintJump();
      if (jumpWorld.done) finishStation();
      else jumpRaf = requestAnimationFrame(frame);
    }
    jumpRaf = requestAnimationFrame(frame);
  }

  function renderLetters() {
    var html = '<div class="kbd" dir="ltr">';
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
    var want = MKA.LETTERS[progress] || '';
    var keys = document.querySelectorAll('#field .kbd .key');
    for (var i = 0; i < keys.length; i++) keys[i].classList.toggle('on', keys[i].getAttribute('data-code') === want);
    if (progress >= MKA.LETTERS.length && !$('nameForm')) {
      var slot = $('nameSlot');
      if (slot) {
        slot.innerHTML = nameFormHTML();
        var input = $('kidName');
        if (input) { input.value = save.name || ''; input.focus(); }
      }
    }
  }
  function pressCode(code, eventKey) {
    if (screen !== 'play' || stationId !== 'letters' || progress >= MKA.LETTERS.length) return;
    var hint = MKA.languageHint(code, eventKey);
    langHintEl.hidden = !hint;
    langHintEl.textContent = hint;
    if (!MKA.acceptKey(MKA.LETTERS[progress], code)) {
      var key = document.querySelector('#field .kbd .key[data-code="' + code + '"]');
      if (key) {
        key.classList.add('bad');
        setTimeout(function () { key.classList.remove('bad'); }, 350);
      }
      armIdle();
      return;
    }
    succeed();
  }

  function onPointerMove(e) {
    if (!overlay.hidden) return;
    if (stationId === 'move') pointerOnStar(e);
    if (dragging) moveFruit(e);
  }
  function onPointerUp(e) {
    onChestUp(e);
    endDrag(e);
  }
  function onClick(e) {
    var act = e.target.closest ? e.target.closest('[data-act], #btnMap, #btnPause, #btnTeacher, #btnNew, #btnStart, #btnResume, #btnRestart, [data-code]') : null;
    if (!act) return;
    if (act.id === 'btnPause') { pausePlay(); return; }
    if (act.id === 'btnResume') { resumePlay(); return; }
    if (act.id === 'btnRestart') { restartStation(); return; }
    if (act.id === 'btnMap' || act.getAttribute('data-act') === 'map') { showMap(); return; }
    if (act.id === 'btnTeacher') { showTeacher(); return; }
    if (act.id === 'btnNew' || act.getAttribute('data-act') === 'ask-reset') { askReset(); return; }
    if (act.id === 'btnStart') { startLesson(); return; }
    if (act.getAttribute('data-act') === 'open') { openStation(act.getAttribute('data-station')); return; }
    if (act.getAttribute('data-act') === 'jump') { teacherJump(act.getAttribute('data-station')); return; }
    if (act.getAttribute('data-act') === 'do-reset') { resetStudent(); return; }
    if (act.getAttribute('data-act') === 'close') { closeOverlay(); return; }
    if (act.getAttribute('data-act') === 'next') {
      if (MKA.allDone(save)) showCert();
      else showMap();
      return;
    }
    if (act.getAttribute('data-act') === 'pop') {
      if (screen === 'play' && stationId === 'click') succeed();
      return;
    }
    var code = act.getAttribute('data-code');
    if (!code || screen !== 'play') return;
    if (stationId === 'arrows') stepMaze(code);
    else if (stationId === 'letters') pressCode(code, MKA.AR[code] || '');
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
    if (screen !== 'play') return;
    if (e.code === 'Space' || e.code === 'Enter' || e.code.indexOf('Arrow') === 0 || e.code === 'PageUp' || e.code === 'PageDown' || e.code === 'Home' || e.code === 'End') {
      e.preventDefault();
    }
    if (e.repeat) return;
    heldDown[e.code] = true;
    edgeDown[e.code] = true;
    if (stationId === 'arrows') stepMaze(e.code);
    else if (stationId === 'scroll') scrollKey(e.code);
    else if (stationId === 'letters') pressCode(e.code, e.key);
  }
  function onSubmit(e) {
    if (!e.target || e.target.id !== 'nameForm') return;
    e.preventDefault();
    var input = e.target.querySelector('input');
    var result = MKA.acceptName(input ? input.value : '');
    if (!result.ok) { if (input) input.focus(); return; }
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
  app.addEventListener('scroll', function (e) {
    if (e.target && e.target.id === 'scroller') checkFriends();
  }, true);
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

  save = MKA.loadSave(store.get('save', null));
  var query = '';
  try { query = new URLSearchParams(location.search).get('station') || ''; } catch (err) { query = ''; }
  if (query && MKA.stationById(query)) {
    save = MKA.jumpTo(save, query);
    persist();
    openStation(query);
  } else showMap();

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
