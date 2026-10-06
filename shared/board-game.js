(function () {
  'use strict';
  var app = document.getElementById('boardApp');
  var game = app.getAttribute('data-game');
  var isConnect = game === 'connect-four';
  var rules = window.SGBoardRules;
  var title = isConnect ? 'أربعة على التوالي' : 'إكس أو';
  var mode = 'menu', state = rules.create(game), startingSeat = 1;
  var paused = false;
  var aiTimer = null, dropTimer = null, fallingCell = null, confetti = null, confettiTimer = null;
  var cells = [], moveButtons = [], pendingBoardFocus = null;
  var levels = ['easy', 'medium', 'hard'], levelNames = { easy: 'سهل', medium: 'متوسط', hard: 'صعب' };
  var store = Kit.store(game), saveStatus = Kit.saveStatus({ retry: saveProgress });
  var progress = loadProgress(), level = progress.level;
  // The session score lasts until the mode or level changes; computer wins are saved.
  var score = { 1: 0, 2: 0 }, firstWin = false;

  document.documentElement.classList.add(game);
  app.innerHTML = '<header class="game-header"><div><h1>' + title + '</h1><p>' +
    (isConnect ? 'اجمع 4 أقراص في صف واحد لتفوز!' : 'اجمع 3 علامات في صف واحد لتفوز!') +
    '</p></div><button id="soundButton" class="sound-button" type="button">الصوت: يعمل</button></header>' +
    '<div class="play-layout"><aside class="game-menu" aria-labelledby="modeTitle">' +
      '<div><h2 id="modeTitle">كيف تريد أن تلعب؟</h2><p id="modeDescription" class="mode-description">اختر طريقة اللعب وابدأ فوراً.</p></div>' +
      '<div id="levelBox" class="level-box"><div class="level-choices" role="group" aria-label="مستوى الكمبيوتر">' + levels.map(function (name) {
        return '<button type="button" data-level="' + name + '">' + levelNames[name] + '</button>';
      }).join('') + '</div><p id="levelTally" class="level-tally"></p></div>' +
      '<div id="modeChoices" class="mode-choices"><button id="localButton" class="button" type="button">لاعبان على نفس الجهاز</button>' +
        '<button id="pcButton" class="button secondary" type="button">العب ضد الكمبيوتر</button></div>' +
      '<div class="player-guide"><p><span class="guide-token one" aria-hidden="true">' + (isConnect ? '' : 'X') + '</span><span id="guide1">اللاعب الأول</span><span>' + (isConnect ? 'الأصفر' : 'إكس') + '</span></p>' +
        '<p><span class="guide-token two" aria-hidden="true">' + (isConnect ? '' : 'O') + '</span><span id="guide2">اللاعب الثاني</span><span>' + (isConnect ? 'الأحمر' : 'دائرة') + '</span></p></div>' +
      '<p class="keyboard-hint">الأسهم للتنقل · Enter للعب<br>P للاستراحة · M للصوت</p></aside>' +
      '<section class="board-area" aria-label="لوحة اللعب"><div class="round-bar">' +
        '<div id="seat1" class="seat"><span class="seat-token" aria-hidden="true">' + (isConnect ? '' : 'X') + '</span><span id="seat1Name">اللاعب الأول</span><b id="score1" class="score">0</b></div>' +
        '<span class="versus">ضد</span><div id="seat2" class="seat"><span class="seat-token second" aria-hidden="true">' + (isConnect ? '' : 'O') + '</span><span id="seat2Name">اللاعب الثاني</span><b id="score2" class="score">0</b></div></div>' +
        '<div class="board-wrap"><div id="gameBoard" class="game-board ' + (isConnect ? 'connect-board' : 'tic-board') + '" role="group" aria-label="' + title + '"></div>' +
          '<div id="pauseLayer" class="pause-layer" hidden><h2>استراحة قصيرة</h2><button id="resumeButton" class="button" type="button">متابعة اللعب</button></div></div>' +
        '<p id="turnLine" class="turn-line" role="status" aria-live="polite"></p><p id="boardHint" class="board-hint"></p>' +
        '<div class="match-actions"><button id="rematchButton" class="button" type="button" hidden>العب مرة أخرى</button>' +
          '<button id="pauseButton" class="button secondary" type="button" hidden>استراحة</button>' +
          '<button id="leaveMatch" class="button secondary" type="button" hidden>تغيير طريقة اللعب</button></div></section></div>';

  function el(id) { return document.getElementById(id); }
  function finished() { return !!(state.winner || state.draw); }
  // Saved progress against the computer: { level, wins: { easy, medium, hard } }.
  function loadProgress() {
    var saved = store.get('progress', null) || {}, wins = {};
    levels.forEach(function (name) {
      var count = saved.wins && saved.wins[name];
      wins[name] = Number.isInteger(count) && count > 0 ? count : 0;
    });
    return { level: levels.indexOf(saved.level) !== -1 ? saved.level : 'easy', wins: wins };
  }
  function saveProgress() {
    progress.level = level;
    if (store.set('progress', progress) === false) saveStatus.failed(); else saveStatus.saved();
  }
  // Count a finished round once, when its last move is made.
  function scoreRound() {
    firstWin = false;
    if (!state.winner) return;
    score[state.winner]++;
    if (mode !== 'computer' || state.winner !== 1) return;
    firstWin = progress.wins[level] === 0;
    progress.wins[level]++;
    saveProgress();
  }
  // Sound and celebration once a mark appears or a disc lands.
  function landed() {
    var seat = state.board[state.last];
    if (isConnect) Kit.sfx.land();
    else Kit.audio.tone({ freq: seat === 1 ? 600 : 450, to: seat === 1 ? 900 : 680, type: 'sine', dur: 0.09, vol: 0.25 });
    if (state.draw) Kit.sfx.pop();
    if (!state.winner) return;
    var cheer = mode === 'local' || state.winner === 1, total = el('score' + state.winner);
    if (cheer) { Kit.sfx.win(); celebrate(); } else Kit.sfx.lose();
    total.classList.remove('bump'); void total.offsetWidth; total.classList.add('bump');
  }
  // A short burst of CSS confetti over the board, skipped when motion is reduced.
  function celebrate() {
    clearConfetti();
    if (Kit.motion.reduced() || document.hidden) return;
    var wrap = el('gameBoard').parentNode, size = wrap.offsetWidth;
    confetti = document.createElement('div');
    confetti.className = 'confetti'; confetti.setAttribute('aria-hidden', 'true');
    for (var i = 0; i < 24; i++) {
      var piece = document.createElement('i');
      piece.style.cssText = '--x:' + Math.round((Math.random() - 0.5) * size * 0.8) + 'px;--y:' + Math.round(-size * (0.15 + Math.random() * 0.3)) +
        'px;--r:' + Math.round(Math.random() * 720 - 360) + 'deg;--h:' + Math.floor(Math.random() * 360) + ';--d:' + Math.floor(Math.random() * 200) + 'ms';
      confetti.appendChild(piece);
    }
    wrap.appendChild(confetti);
    confettiTimer = setTimeout(clearConfetti, 1500);
  }
  function clearConfetti() {
    clearTimeout(confettiTimer); confettiTimer = null;
    if (confetti) confetti.remove();
    confetti = null;
  }
  function clearThinking() { clearTimeout(aiTimer); aiTimer = null; }
  function stopDrop() {
    clearTimeout(dropTimer); dropTimer = null;
    if (!fallingCell) return;
    fallingCell.classList.remove('dropping');
    fallingCell.style.removeProperty('--drop-from');
    fallingCell = null;
  }
  function stopTimers() { clearThinking(); stopDrop(); clearConfetti(); }
  function canMove() {
    return mode !== 'menu' && !finished() && !paused && !fallingCell && !document.hidden &&
      (mode === 'local' || state.turn === 1);
  }
  function focusBoard() {
    pendingBoardFocus = 0;
    restoreBoardFocus();
  }
  function restoreBoardFocus() {
    if (pendingBoardFocus === null || paused || document.hidden || fallingCell || mode === 'menu') return;
    if (finished()) {
      pendingBoardFocus = null; el('rematchButton').focus(); return;
    }
    for (var step = 0; step < moveButtons.length; step++) {
      var button = moveButtons[(pendingBoardFocus + step) % moveButtons.length];
      if (!button.disabled) { pendingBoardFocus = null; button.focus(); return; }
    }
  }
  function dropDisc() {
    stopDrop();
    if (!isConnect || document.hidden || Kit.motion.reduced()) return landed();
    var cell = cells[state.last];
    if (!cell || !state.board[state.last]) return landed();
    var top = cells[state.last % 7].getBoundingClientRect();
    var target = cell.getBoundingClientRect();
    if (!target.height) return landed();
    cell.style.setProperty('--drop-from', (top.top - target.bottom) + 'px');
    fallingCell = cell;
    cell.classList.add('dropping');
    dropTimer = setTimeout(function () {
      stopDrop(); renderBoard(); landed(); scheduleComputer();
    }, 340);
  }
  function makeBoard() {
    var board = el('gameBoard');
    var count = isConnect ? 7 : 9;
    for (var i = 0; i < count; i++) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = isConnect ? 'column' : 'tic-cell';
      button.dataset.move = String(i);
      if (isConnect) {
        button.setAttribute('aria-label', 'العمود ' + (i + 1));
        for (var row = 0; row < 6; row++) {
          var cell = document.createElement('span');
          cell.className = 'cell'; cell.setAttribute('aria-hidden', 'true');
          cell.dataset.cell = String(row * 7 + i);
          cells[row * 7 + i] = cell; button.appendChild(cell);
        }
      } else { button.setAttribute('aria-label', 'المربع ' + (i + 1)); cells[i] = button; }
      button.addEventListener('click', function (event) { play(Number(event.currentTarget.dataset.move)); });
      button.addEventListener('keydown', boardKeys);
      moveButtons.push(button); board.appendChild(button);
    }
  }
  function boardKeys(event) {
    var key = event.key, index = Number(event.currentTarget.dataset.move), next = index;
    if (key === 'ArrowLeft') next -= 1;
    else if (key === 'ArrowRight') next += 1;
    else if (key === 'ArrowUp') next -= isConnect ? 1 : 3;
    else if (key === 'ArrowDown') next += isConnect ? 1 : 3;
    else return;
    event.preventDefault();
    var direction = next < index ? -1 : 1;
    next = (next + moveButtons.length) % moveButtons.length;
    for (var i = 0; i < moveButtons.length; i++) {
      if (!moveButtons[next].disabled) { moveButtons[next].focus(); break; }
      next = (next + direction + moveButtons.length) % moveButtons.length;
    }
  }
  function playerLabel(seat) {
    if (mode === 'computer') return seat === 1 ? 'أنت' : 'الكمبيوتر';
    return seat === 1 ? 'اللاعب الأول' : 'اللاعب الثاني';
  }
  function tokenLabel(seat) {
    return isConnect ? (seat === 1 ? 'الأصفر' : 'الأحمر') : (seat === 1 ? 'إكس' : 'دائرة');
  }
  function renderBoard(animateLast) {
    app.dataset.mode = mode;
    app.dataset.paused = String(paused);
    el('gameBoard').dataset.moves = String(state.moves);
    el('gameBoard').dataset.turn = String(state.turn);
    el('gameBoard').dataset.winner = String(state.winner || 0);
    el('gameBoard').dataset.draw = String(state.draw);
    var won = state.winning || [];
    cells.forEach(function (cell, i) {
      cell.classList.toggle('one', state.board[i] === 1);
      cell.classList.toggle('two', state.board[i] === 2);
      cell.classList.toggle('winning', won.indexOf(i) !== -1);
      cell.classList.toggle('last', state.last === i);
      // Connect 4 previews where a disc would land in the hovered column.
      if (isConnect) cell.classList.toggle('landing', !state.board[i] && (i >= 35 || !!state.board[i + 7]));
      if (!isConnect) cell.setAttribute('aria-label', 'المربع ' + (i + 1) + ': ' + (state.board[i] ? tokenLabel(state.board[i]) : 'فارغ'));
    });
    if (animateLast) dropDisc();
    el('gameBoard').classList.toggle('settled', finished() && !fallingCell);
    var enabled = canMove(), legal = rules.legalMoves(state);
    moveButtons.forEach(function (button, i) {
      var disabled = !enabled || legal.indexOf(i) === -1;
      if (disabled && document.activeElement === button) pendingBoardFocus = i;
      button.disabled = disabled;
    });
    [1, 2].forEach(function (seat) {
      el('seat' + seat).classList.toggle('active', mode !== 'menu' && state.turn === seat && !finished());
      el('seat' + seat + 'Name').textContent = playerLabel(seat);
      el('guide' + seat).textContent = playerLabel(seat);
      el('score' + seat).textContent = String(score[seat]);
    });
    el('modeChoices').hidden = mode !== 'menu';
    el('levelBox').hidden = mode !== 'computer';
    levelButtons.forEach(function (button) {
      button.setAttribute('aria-pressed', String(button.dataset.level === level));
      button.classList.toggle('won', progress.wins[button.dataset.level] > 0);
    });
    el('levelTally').textContent = 'انتصاراتك: ' + levels.map(function (name) { return levelNames[name] + '\u00a0' + progress.wins[name]; }).join(' · ');
    el('modeTitle').textContent = mode === 'menu' ? 'كيف تريد أن تلعب؟' : mode === 'local' ? 'لاعبان على نفس الجهاز' : 'العب ضد الكمبيوتر';
    el('modeDescription').textContent = mode === 'menu' ? 'اختر طريقة اللعب وابدأ فوراً.' : mode === 'local' ? 'تبادلا الأدوار باستخدام نفس الفأرة.' : 'اختر مستوى الكمبيوتر:';
    var turnText, hint = isConnect ? 'اضغط على أي عمود لإسقاط قرصك.' : 'اضغط على مربع فارغ لوضع علامتك.';
    if (mode === 'menu') {
      turnText = 'اختر طريقة اللعب للبدء';
      hint = isConnect ? 'أفقياً، عمودياً أو قطرياً… أول 4 يفوز!' : 'أفقياً، عمودياً أو قطرياً… أول 3 يفوز!';
    } else if (finished()) {
      turnText = state.draw ? 'تعادل! جولة أخرى؟' : mode === 'local' ? 'فاز ' + playerLabel(state.winner) + ' — ' + tokenLabel(state.winner) + '!' :
        state.winner !== 1 ? 'فاز الكمبيوتر… جرّب مرة أخرى!' : firstWin ? 'جديد! هزمت الكمبيوتر ال' + levelNames[level] + '!' : 'فزت! أحسنت اللعب!';
      hint = mode === 'computer' && startingSeat === 2 ? 'تبدأ أنت الجولة التالية.' : 'يبدأ ' + playerLabel(3 - startingSeat) + ' الجولة التالية.';
      var nextLevel = levels[levels.indexOf(level) + 1];
      if (mode === 'computer' && state.winner === 1 && nextLevel && progress.wins[level] >= 2 && !progress.wins[nextLevel]) hint = 'جاهز لتحدي المستوى ال' + levelNames[nextLevel] + '؟';
    } else if (paused) { turnText = 'اللعبة متوقفة مؤقتاً'; hint = 'اضغط «متابعة اللعب» عندما تكون جاهزاً.'; }
    else if (mode === 'local') turnText = 'دور ' + playerLabel(state.turn) + ' — ' + tokenLabel(state.turn);
    else turnText = state.turn === 1 ? (isConnect ? 'دورك! اختر عموداً' : 'دورك! اختر مربعاً') : 'الكمبيوتر يفكّر…';
    el('turnLine').textContent = turnText;
    el('boardHint').textContent = hint;
    el('pauseLayer').hidden = !paused;
    el('pauseButton').hidden = mode === 'menu' || finished() || paused;
    el('leaveMatch').hidden = mode === 'menu';
    el('rematchButton').hidden = mode === 'menu' || !finished();
    el('rematchButton').disabled = !!fallingCell;
    restoreBoardFocus();
  }
  function play(move) {
    if (!canMove()) return;
    var next = rules.play(state, move);
    if (!next) return;
    state = next;
    if (finished()) scoreRound();
    renderBoard(true); scheduleComputer();
  }
  function scheduleComputer() {
    clearThinking();
    if (mode !== 'computer' || paused || fallingCell || document.hidden || finished() || state.turn !== 2) return;
    aiTimer = setTimeout(function () {
      aiTimer = null;
      if (mode !== 'computer' || paused || document.hidden || finished() || state.turn !== 2) return;
      var next = rules.play(state, rules.chooseMove(state, level));
      if (!next) return;
      state = next;
      if (finished()) scoreRound();
      renderBoard(true);
    }, 420);
  }
  function newRound() {
    stopTimers(); pendingBoardFocus = null; state = rules.create(game); state.turn = startingSeat;
    paused = false; firstWin = false;
    renderBoard(); scheduleComputer(); focusBoard();
  }
  function start(selectedMode) { mode = selectedMode; startingSeat = 1; score = { 1: 0, 2: 0 }; newRound(); }
  function setLevel(value) {
    if (value === level) return;
    level = value; saveProgress(); start('computer');
  }
  function leaveMatch() {
    stopTimers(); pendingBoardFocus = null; mode = 'menu'; state = rules.create(game); startingSeat = 1; score = { 1: 0, 2: 0 };
    paused = false; renderBoard(); el('localButton').focus();
  }
  function pause(value, moveFocus) {
    if (mode === 'menu' || finished()) return;
    paused = value; stopTimers(); renderBoard();
    if (!paused) { scheduleComputer(); if (moveFocus) focusBoard(); }
    else if (moveFocus) el('resumeButton').focus();
  }
  el('localButton').addEventListener('click', function () { start('local'); });
  el('pcButton').addEventListener('click', function () { start('computer'); });
  var levelButtons = [].slice.call(app.querySelectorAll('[data-level]'));
  levelButtons.forEach(function (button) {
    button.addEventListener('click', function () { setLevel(button.dataset.level); });
  });
  el('leaveMatch').addEventListener('click', leaveMatch);
  el('pauseButton').addEventListener('click', function () { pause(true, true); });
  el('resumeButton').addEventListener('click', function () { pause(false, true); });
  el('rematchButton').addEventListener('click', function () {
    if (mode === 'menu' || !finished() || fallingCell) return;
    startingSeat = 3 - startingSeat;
    newRound();
  });
  // Keep Kit's classroom lock and preference updates, with the board's text label.
  var soundPlaceholder = el('soundButton'), soundButton = Kit.muteButton({ key: false });
  soundButton.id = 'soundButton'; soundButton.className = 'sound-button';
  soundButton.removeAttribute('aria-label');
  soundPlaceholder.parentNode.replaceChild(soundButton, soundPlaceholder);
  function renderSound() {
    soundButton.textContent = Kit.audio.muted ? 'الصوت: مغلق' : 'الصوت: يعمل';
    soundButton.setAttribute('aria-pressed', String(!Kit.audio.muted));
  }
  Kit.audio.onMuteChange(renderSound);
  Kit.motion.onChange(function (reduced) { if (reduced) clearConfetti(); });
  // A delayed disc or computer move must not steal focus from another control.
  document.addEventListener('focusin', function (event) {
    if (event.target !== document.body && moveButtons.indexOf(event.target) === -1) pendingBoardFocus = null;
  });
  window.addEventListener('keydown', function (event) {
    var target = event.target;
    if ((target && (target.isContentEditable || (typeof target.matches === 'function' && target.matches('input,textarea,select')))) ||
        event.isComposing || event.ctrlKey || event.altKey || event.metaKey || event.repeat) return;
    if (event.code === 'KeyM') { Kit.audio.unlock(); Kit.audio.toggleMute(); }
    if ((event.code === 'KeyP' || event.code === 'Escape') && mode !== 'menu' && !finished()) {
      event.preventDefault(); pause(!paused, true);
    }
    if (event.code === 'KeyR' && finished()) el('rematchButton').click();
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      if (mode !== 'menu' && !paused && !finished()) pause(true, false);
      stopTimers();
    }
    renderBoard();
  });
  window.addEventListener('pagehide', function () {
    if (mode !== 'menu' && !paused && !finished()) paused = true;
    stopTimers(); renderBoard();
  });
  window.addEventListener('pageshow', function (event) {
    if (!event.persisted || document.hidden) return;
    // A restored page remains paused until the player explicitly resumes.
    renderBoard(); scheduleComputer();
  });
  makeBoard(); renderSound(); renderBoard();
  Kit.lifecycle({ pause: function () { pause(true, false); } });
  Kit.ready();
}());
