(function () {
  'use strict';
  var app = document.getElementById('boardApp');
  var game = app.getAttribute('data-game');
  var isConnect = game === 'connect-four';
  var rules = window.SGBoardRules;
  var juice = Kit.juice;
  var title = isConnect ? 'أربعة على التوالي' : 'إكس أو';
  var variant = 'classic', roundVariant = 'classic', selectedPower = null;
  var mode = 'menu', state = rules.create(game), startingSeat = 1;
  var paused = false;
  var aiTimer = null, dropTimer = null, fallingCell = null, confetti = null, confettiTimer = null, unlanded = false;
  var cells = [], moveButtons = [], pendingBoardFocus = null;
  var levels = ['easy', 'medium', 'hard'], levelNames = { easy: 'سهل', medium: 'متوسط', hard: 'صعب' };
  var personas = {
    easy: { name: 'روبوت نعسان', desc: 'يتثاءب ويغفل أحياناً' },
    medium: { name: 'روبوت مشاغب', desc: 'سريع ويحب المقالب' },
    hard: { name: 'البروفيسور الآلي', desc: 'عبقري التكتيك' }
  };
  var avatarMemo = {};
  var store = Kit.store(game), saveStatus = Kit.saveStatus({ retry: saveProgress });
  // The chosen (saved) level and the one this round is played at: a level picked mid-round waits for the next round.
  var progress = loadProgress(), level = progress.level, roundLevel = level;
  // The session score lasts until the mode changes; computer wins are saved.
  var score = { 1: 0, 2: 0 }, firstWin = false;
  // Play statistics: a round counts from its first move by a child, so a level re-deal before it is no round.
  var counted = false;

  function avatarSvg(kind, mood) {
    var eyes, mouth, extra = '';
    if (kind === 'hero' || kind === 'player2') {
      var gold = kind === 'hero';
      var shell = gold ? '#ffc93c' : '#ff5970';
      var rim = gold ? '#9a5b04' : '#8f1329';
      var shine = gold ? '#fff3a8' : '#ffb8c3';
      var accent = gold ? '#38bdf8' : '#fde047';
      if (mood === 'happy') {
        eyes = '<path d="M12.5 22.5q2.5-3 5 0M22.5 22.5q2.5-3 5 0" fill="none" stroke="' + accent + '" stroke-width="2.4" stroke-linecap="round"/>';
        mouth = '<path d="M15.5 27.2q4.5 4 9 0" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>';
      } else if (mood === 'shocked') {
        eyes = '<circle cx="15" cy="22" r="3.1" fill="#fff"/><circle cx="15" cy="22" r="1.3" fill="#0b132b"/><circle cx="25" cy="22" r="3.1" fill="#fff"/><circle cx="25" cy="22" r="1.3" fill="#0b132b"/>';
        mouth = '<circle cx="20" cy="28" r="2.2" fill="#ff6b81"/>';
      } else {
        eyes = '<circle cx="15" cy="22" r="2.4" fill="' + accent + '"/><circle cx="14.2" cy="21.1" r=".9" fill="#fff"/><circle cx="25" cy="22" r="2.4" fill="' + accent + '"/><circle cx="24.2" cy="21.1" r=".9" fill="#fff"/>';
        mouth = '<path d="M16.5 27.3q3.5 2.4 7 0" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/>';
      }
      var crest = gold
        ? '<path d="M20 4.5l1.7 3.4 3.8.5-2.7 2.6.6 3.7L20 13l-3.4 1.7.6-3.7-2.7-2.6 3.8-.5Z" fill="#fff3a8" stroke="' + rim + '" stroke-width="1.3" stroke-linejoin="round"/>'
        : '<path d="M21.5 4.2L17 11h3.2l-1.5 4.8L24 9.5h-3.1Z" fill="#fde047" stroke="' + rim + '" stroke-width="1.2" stroke-linejoin="round"/>';
      return '<svg viewBox="0 0 40 40"><circle cx="20" cy="22" r="14.5" fill="' + shell + '" stroke="' + rim + '" stroke-width="2.4"/>' +
        '<path d="M9.5 16.5q4-6 12-6.5" fill="none" stroke="' + shine + '" stroke-width="2.4" stroke-linecap="round"/>' +
        '<rect x="9" y="17" width="22" height="14" rx="6.5" fill="#131c3d" stroke="' + rim + '" stroke-width="2"/>' +
        eyes + mouth + crest + '</svg>';
    }
    if (kind === 'easy') {
      // Sleepy Bot: mint robot with drooping nightcap antenna
      var ant = mood === 'shocked'
        ? '<path d="M20 10V3.5" stroke="#0f766e" stroke-width="2.4" stroke-linecap="round"/><circle cx="20" cy="3.5" r="2.8" fill="#fde047" stroke="#0f766e" stroke-width="1.5"/>'
        : '<path d="M20 10c0-5.5 8.5-5.5 9.5-1" fill="none" stroke="#0f766e" stroke-width="2.4" stroke-linecap="round"/><circle cx="29.8" cy="10" r="2.8" fill="#fde047" stroke="#0f766e" stroke-width="1.5"/>';
      if (mood === 'happy') {
        eyes = '<path d="M12.5 22.5q2.5-3 5 0M22.5 22.5q2.5-3 5 0" fill="none" stroke="#5eead4" stroke-width="2.3" stroke-linecap="round"/>';
        mouth = '<path d="M15.5 27.5q4.5 3.6 9 0" fill="none" stroke="#5eead4" stroke-width="2.1" stroke-linecap="round"/>';
      } else if (mood === 'shocked') {
        eyes = '<circle cx="15" cy="21.8" r="3.3" fill="#fff"/><circle cx="15" cy="21.8" r="1.3" fill="#0f172a"/><circle cx="25" cy="21.8" r="3.3" fill="#fff"/><circle cx="25" cy="21.8" r="1.3" fill="#0f172a"/>';
        mouth = '<rect x="17" y="26.5" width="6" height="3.8" rx="1.9" fill="#fb7185"/>';
      } else if (mood === 'thinking') {
        eyes = '<line x1="12.5" y1="22" x2="17.5" y2="22" stroke="#5eead4" stroke-width="2.4" stroke-linecap="round"/><circle cx="25" cy="21.8" r="2.4" fill="#fde047"/>';
        mouth = '<circle cx="20.5" cy="27.8" r="1.9" fill="#5eead4"/>';
      } else {
        eyes = '<circle cx="15" cy="22.5" r="2.3" fill="#5eead4"/><path d="M12 20.8h6" stroke="#132238" stroke-width="2.4"/><line x1="12.3" y1="21.2" x2="17.7" y2="21.8" stroke="#5eead4" stroke-width="1.8" stroke-linecap="round"/>' +
          '<circle cx="25" cy="22.5" r="2.3" fill="#5eead4"/><path d="M22 20.8h6" stroke="#132238" stroke-width="2.4"/><line x1="22.3" y1="21.8" x2="27.7" y2="21.2" stroke="#5eead4" stroke-width="1.8" stroke-linecap="round"/>';
        mouth = '<path d="M16.5 28q1.8-1.4 3.5 0t3.5 0" fill="none" stroke="#99f6e4" stroke-width="1.9" stroke-linecap="round"/>';
      }
      return '<svg viewBox="0 0 40 40">' + ant +
        '<rect x="4.5" y="19" width="3.5" height="7" rx="1.7" fill="#14b8a6" stroke="#0f766e" stroke-width="1.6"/>' +
        '<rect x="32" y="19" width="3.5" height="7" rx="1.7" fill="#14b8a6" stroke="#0f766e" stroke-width="1.6"/>' +
        '<rect x="7" y="10" width="26" height="24" rx="9" fill="#2dd4bf" stroke="#0f766e" stroke-width="2.4"/>' +
        '<rect x="10" y="15.5" width="20" height="15" rx="5.5" fill="#132238"/>' + eyes + mouth + '</svg>';
    }
    if (kind === 'medium') {
      // Cheeky Bot: vibrant orange bot with lightning side-coils & mischievous visor
      if (mood === 'happy') {
        eyes = '<path d="M12.2 22.5l2.6-2.5 2.6 2.5M22.6 22.5l2.6-2.5 2.6 2.5" fill="none" stroke="#38bdf8" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>';
        mouth = '<path d="M14 26.8h12c-.5 3.5-11.5 3.5-12 0Z" fill="#fde047"/>';
      } else if (mood === 'shocked') {
        eyes = '<path d="M13 19.5l4 4m0-4l-4 4M23 19.5l4 4m0-4l-4 4" stroke="#fb7185" stroke-width="2.3" stroke-linecap="round"/>';
        mouth = '<path d="M14.5 28.2l2.7-1.8 2.8 1.8 2.8-1.8 2.7 1.8" fill="none" stroke="#fde047" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
      } else if (mood === 'thinking') {
        eyes = '<rect x="12.5" y="20" width="15" height="3.2" rx="1.6" fill="#38bdf8"/><circle cx="23.5" cy="21.6" r="1.8" fill="#fff"/>';
        mouth = '<line x1="16" y1="27.5" x2="24" y2="27" stroke="#fde047" stroke-width="2.1" stroke-linecap="round"/>';
      } else {
        eyes = '<polygon points="12.2,19.6 18,21.2 12.8,23.2" fill="#38bdf8"/><polygon points="27.8,19.6 22,21.2 27.2,23.2" fill="#38bdf8"/>';
        mouth = '<path d="M14.5 27.3l2.7 1.5 2.8-1.5 2.8 1.5 2.7-1.5" fill="none" stroke="#fde047" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
      }
      return '<svg viewBox="0 0 40 40">' +
        '<path d="M20 4l-2.2 5h4.4Z" fill="#fde047" stroke="#9a3412" stroke-width="1.5" stroke-linejoin="round"/>' +
        '<path d="M3.5 18l4 2.5-3 3.5M36.5 18l-4 2.5 3 3.5" fill="none" stroke="#fde047" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<rect x="7" y="9.5" width="26" height="24.5" rx="7.5" fill="#fb923c" stroke="#9a3412" stroke-width="2.4"/>' +
        '<rect x="10" y="15.5" width="20" height="15.5" rx="5" fill="#1b1433"/>' + eyes + mouth + '</svg>';
    }
    // Hard: Professor Mech — royal indigo mech with golden crown & glowing monocle
    var monocle = mood === 'shocked'
      ? '<circle cx="28" cy="18.5" r="4.6" fill="#fde04726" stroke="#facc15" stroke-width="2"/>'
      : '<circle cx="25" cy="21.5" r="4.7" fill="#fde04722" stroke="#facc15" stroke-width="2"/><line x1="29.5" y1="23" x2="31.5" y2="29" stroke="#facc15" stroke-width="1.5"/>';
    if (mood === 'happy') {
      eyes = '<path d="M12.5 22q2.3-2.6 4.6 0M22.7 22q2.3-2.6 4.6 0" fill="none" stroke="#fde047" stroke-width="2.3" stroke-linecap="round"/>';
      mouth = '<path d="M15.5 27.2q4.5 3 9-.5" fill="none" stroke="#fde047" stroke-width="2.1" stroke-linecap="round"/>';
    } else if (mood === 'shocked') {
      eyes = '<circle cx="15" cy="21.8" r="3" fill="#fff"/><circle cx="15" cy="21.8" r="1.2" fill="#1e1b4b"/><circle cx="25" cy="21.8" r="3" fill="#fff"/><circle cx="25" cy="21.8" r="1.2" fill="#1e1b4b"/>';
      mouth = '<rect x="16.2" y="26.5" width="7.6" height="3.8" rx="1.2" fill="#fb7185"/>';
    } else if (mood === 'thinking') {
      eyes = '<rect x="12.5" y="20.6" width="5" height="2.2" rx="1" fill="#facc15"/><circle cx="25" cy="21.5" r="2.2" fill="#facc15"/><path d="M25 18.2v6.6M21.7 21.5h6.6" stroke="#fff" stroke-width="1.1"/>';
      mouth = '<line x1="16.5" y1="27.8" x2="23.5" y2="27.8" stroke="#c7d2fe" stroke-width="2" stroke-linecap="round"/>';
    } else {
      eyes = '<polygon points="12.3,20.2 17.8,21.3 12.8,23" fill="#facc15"/><circle cx="25" cy="21.5" r="2.2" fill="#facc15"/>';
      mouth = '<path d="M16 27.8q4.5 1.4 8.2-1" fill="none" stroke="#fde047" stroke-width="2" stroke-linecap="round"/>';
    }
    extra = '<path d="M12.5 10.2L14 4.2l6 3.6 6-3.6 1.5 6Z" fill="#facc15" stroke="#854d0e" stroke-width="1.6" stroke-linejoin="round"/>';
    return '<svg viewBox="0 0 40 40">' + extra +
      '<rect x="7" y="9.8" width="26" height="24.5" rx="7.5" fill="#6366f1" stroke="#312e81" stroke-width="2.4"/>' +
      '<rect x="10" y="15.5" width="20" height="15.5" rx="5" fill="#13112e"/>' + eyes + mouth + monocle + '</svg>';
  }

  function setAvatar(id, kind, mood) {
    var node = el(id);
    if (!node) return;
    var key = kind + ':' + mood;
    node.dataset.persona = kind;
    node.dataset.mood = mood;
    if (avatarMemo[id] === key) return;
    avatarMemo[id] = key;
    node.innerHTML = avatarSvg(kind, mood);
  }

  function createState(chosenVariant) {
    var v = chosenVariant || roundVariant;
    return v === 'twist' ? rules.create(game, { variant: 'twist' }) : rules.create(game);
  }

  document.documentElement.classList.add(game);
  app.innerHTML = '<header class="game-header"><div class="header-copy"><div class="title-row"><h1>' + title + '</h1>' +
      '<span id="twistBadge" class="twist-badge" hidden>' + (isConnect ? 'أقراص القوة ⚡' : 'المتلاشية ⚡') + '</span></div>' +
      '<p id="headerSub">' + (isConnect ? 'اجمع 4 أقراص في صف واحد لتفوز!' : 'اجمع 3 علامات في صف واحد لتفوز!') + '</p></div>' +
      '<button id="soundButton" class="sound-button" type="button">الصوت: يعمل</button></header>' +
    '<div class="play-layout"><aside class="game-menu" aria-labelledby="modeTitle">' +
      '<div><h2 id="modeTitle">كيف تريد أن تلعب؟</h2><p id="modeDescription" class="mode-description">اختر طريقة اللعب وابدأ فوراً.</p></div>' +
      '<div id="variantBox" class="variant-box"><div id="variantChoices" class="variant-choices" role="group" aria-label="نمط اللعب">' +
        '<button type="button" data-variant="classic" aria-pressed="true">كلاسيكي</button>' +
        '<button type="button" data-variant="twist" aria-pressed="false">' + (isConnect ? 'أقراص القوة ⚡' : 'متلاشية ⚡') + '</button></div></div>' +
      '<div id="levelBox" class="level-box"><div class="level-choices" role="group" aria-label="مستوى الكمبيوتر">' + levels.map(function (name) {
        return '<button type="button" data-level="' + name + '">' + levelNames[name] + '</button>';
      }).join('') + '</div>' +
        '<div id="rivalCard" class="rival-card"><span id="rivalAvatar" class="rival-mini-avatar" aria-hidden="true"></span>' +
          '<div class="rival-meta"><strong id="rivalName"></strong><span id="rivalDesc"></span></div></div>' +
        '<p id="levelTally" class="level-tally">انتصاراتك: <span id="levelWins"></span></p></div>' +
      (isConnect ? '<div id="powerBar" class="power-bar" role="group" aria-label="أقراص القوة" hidden>' +
        '<button type="button" id="powerAnvil" class="power-btn anvil" data-power="anvil" aria-pressed="false">' +
          '<span class="power-emo" aria-hidden="true">💥</span><span class="power-name">مطرقة</span><b id="anvilCount" class="power-count">1</b></button>' +
        '<button type="button" id="powerZap" class="power-btn zap" data-power="zap" aria-pressed="false">' +
          '<span class="power-emo" aria-hidden="true">⚡</span><span class="power-name">برق</span><b id="zapCount" class="power-count">1</b></button></div>' : '') +
      '<div id="modeChoices" class="mode-choices">' +
        (isConnect
          ? '<button id="pcButton" class="button" type="button">العب ضد الكمبيوتر</button><button id="localButton" class="button secondary" type="button">لاعبان على نفس الجهاز</button>'
          : '<button id="localButton" class="button" type="button">لاعبان على نفس الجهاز</button><button id="pcButton" class="button secondary" type="button">العب ضد الكمبيوتر</button>') +
      '</div>' +
      '<div class="player-guide"><p><span class="guide-token one" aria-hidden="true">' + (isConnect ? '★' : 'X') + '</span><span id="guide1">اللاعب الأول</span><span>' + (isConnect ? 'الأصفر' : 'إكس') + '</span></p>' +
        '<p><span class="guide-token two" aria-hidden="true">' + (isConnect ? '⚡' : 'O') + '</span><span id="guide2">اللاعب الثاني</span><span>' + (isConnect ? 'الأحمر' : 'دائرة') + '</span></p></div>' +
      '<p class="keyboard-hint">الأسهم للتنقل · Enter للعب<br>P للاستراحة · M للصوت</p></aside>' +
      '<section class="board-area" aria-label="لوحة اللعب"><div class="round-bar">' +
        '<div id="seat1" class="seat"><span id="seat1Avatar" class="seat-avatar" aria-hidden="true"></span><span class="seat-token" aria-hidden="true">' + (isConnect ? '★' : 'X') + '</span><span id="seat1Name">اللاعب الأول</span><b id="score1" class="score">0</b></div>' +
        '<span class="versus">ضد</span><div id="seat2" class="seat"><span id="seat2Avatar" class="seat-avatar" aria-hidden="true"></span><span class="seat-token second" aria-hidden="true">' + (isConnect ? '⚡' : 'O') + '</span><span id="seat2Name">اللاعب الثاني</span><b id="score2" class="score">0</b></div></div>' +
        '<div class="board-wrap"><div id="gameBoard" class="game-board ' + (isConnect ? 'connect-board' : 'tic-board') + '" role="group" aria-label="' + title + '"></div>' +
          '<svg id="winBeam" class="win-beam" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" hidden>' +
            '<line id="winBeamGlow" class="beam-glow" x1="0" y1="0" x2="0" y2="0"/><line id="winBeamCore" class="beam-core" x1="0" y1="0" x2="0" y2="0"/></svg>' +
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
    // Two players on one PC report no winner; against the computer the child is seat 1.
    Kit.stats.end(state.draw ? 'draw' : mode === 'local' ? 'end' : state.winner === 1 ? 'win' : 'lose');
    if (!state.winner) return;
    score[state.winner]++;
    if (mode !== 'computer' || state.winner !== 1) return;
    firstWin = progress.wins[roundLevel] === 0;
    progress.wins[roundLevel]++;
    saveProgress();
  }
  // Sound and celebration once a mark appears or a disc lands.
  function landed() {
    var seat = state.board[state.last];
    if (isConnect) {
      if (state.lastPower === 'anvil') { if (juice) juice.impact(0.95); Kit.sfx.land(); }
      else if (state.lastPower === 'zap') { if (juice) { juice.pop(0.25); juice.coin(3); } Kit.sfx.land(); }
      else { if (juice) juice.land(0.65); Kit.sfx.land(); }
    } else {
      if (juice) juice.tap();
      Kit.audio.tone({ freq: seat === 1 ? 600 : 450, to: seat === 1 ? 900 : 680, type: 'sine', dur: 0.09, vol: 0.25 });
      if (state.vanished >= 0 && juice) juice.pop(0.6);
    }
    if (state.draw) { if (juice) juice.pop(0.5); else Kit.sfx.pop(); }
    if (!state.winner) return;
    var cheer = mode === 'local' || state.winner === 1, total = el('score' + state.winner);
    if (cheer) { if (juice) juice.levelUp(); Kit.sfx.win(); celebrate(); }
    else { if (juice) juice.fail(); else Kit.sfx.lose(); }
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
    if (!fallingCell) return false;
    fallingCell.classList.remove('dropping');
    fallingCell.style.removeProperty('--drop-from');
    fallingCell = null;
    return true;
  }
  // A final disc cut short by a hidden page keeps its result sound and celebration for later.
  function stopTimers(keepRound) {
    var cut = stopDrop() && finished();
    clearThinking(); clearConfetti();
    unlanded = !!keepRound && (unlanded || cut);
  }
  function landLater() {
    if (!unlanded || document.hidden) return;
    unlanded = false; landed();
  }
  function canMove() {
    return mode !== 'menu' && !finished() && !paused && !fallingCell && !document.hidden &&
      (mode === 'local' || state.turn === 1);
  }
  function syncPowerChoice() {
    if (!isConnect || roundVariant !== 'twist' || mode === 'menu' || finished()) {
      selectedPower = null;
      return;
    }
    var activePowers = state.powers && state.powers[state.turn];
    if (!activePowers) { selectedPower = null; return; }
    if (selectedPower && !activePowers[selectedPower]) selectedPower = null;
    if (!selectedPower && rules.legalMoves(state).length === 0 && activePowers.anvil > 0) {
      selectedPower = 'anvil';
    }
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
    if (juice) juice.whoosh(0.8);
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
      // With reduced motion a disc lands at once, so the 2nd click of a double-click would play the other seat's turn.
      button.addEventListener('click', function (event) { if (event.detail > 1) return; play(Number(event.currentTarget.dataset.move)); });
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
  function seatDisplayName(seat) {
    if (mode === 'computer' && seat === 2) return personas[roundLevel].name;
    return playerLabel(seat);
  }
  function tokenLabel(seat) {
    return isConnect ? (seat === 1 ? 'الأصفر' : 'الأحمر') : (seat === 1 ? 'إكس' : 'دائرة');
  }
  function updateWinBeam() {
    var beam = el('winBeam');
    var won = state.winning || [];
    var targetLen = isConnect ? 4 : 3;
    if (!finished() || fallingCell || won.length < targetLen) {
      beam.setAttribute('hidden', '');
      return;
    }
    var wrapRect = el('gameBoard').parentNode.getBoundingClientRect();
    if (!wrapRect.width || !wrapRect.height) {
      beam.setAttribute('hidden', '');
      return;
    }
    var endIdx = targetLen - 1;
    var cols = isConnect ? 7 : 3;
    var stepR = Math.floor(won[1] / cols) - Math.floor(won[0] / cols);
    var stepC = (won[1] % cols) - (won[0] % cols);
    while (endIdx + 1 < won.length &&
           Math.floor(won[endIdx + 1] / cols) - Math.floor(won[endIdx] / cols) === stepR &&
           (won[endIdx + 1] % cols) - (won[endIdx] % cols) === stepC) {
      endIdx++;
    }
    var a = cells[won[0]].getBoundingClientRect();
    var b = cells[won[endIdx]].getBoundingClientRect();
    if (!a.width || !b.width) { beam.setAttribute('hidden', ''); return; }
    var x1 = (((a.left + a.right) / 2 - wrapRect.left) / wrapRect.width) * 100;
    var y1 = (((a.top + a.bottom) / 2 - wrapRect.top) / wrapRect.height) * 100;
    var x2 = (((b.left + b.right) / 2 - wrapRect.left) / wrapRect.width) * 100;
    var y2 = (((b.top + b.bottom) / 2 - wrapRect.top) / wrapRect.height) * 100;
    ['winBeamGlow', 'winBeamCore'].forEach(function (id) {
      var line = el(id);
      line.setAttribute('x1', x1.toFixed(2));
      line.setAttribute('y1', y1.toFixed(2));
      line.setAttribute('x2', x2.toFixed(2));
      line.setAttribute('y2', y2.toFixed(2));
    });
    beam.removeAttribute('hidden');
  }
  function renderAvatars() {
    var seat2Kind = mode === 'computer' ? roundLevel : 'player2';
    var mood1 = 'idle', mood2 = 'idle';
    if (mode !== 'menu') {
      if (finished()) {
        if (state.draw) { mood1 = 'shocked'; mood2 = 'shocked'; }
        else if (state.winner === 1) { mood1 = 'happy'; mood2 = 'shocked'; }
        else { mood1 = 'shocked'; mood2 = 'happy'; }
      } else if (!paused) {
        if (state.turn === 1) mood1 = 'active';
        else mood2 = mode === 'computer' ? 'thinking' : 'active';
      }
    }
    setAvatar('seat1Avatar', 'hero', mood1);
    setAvatar('seat2Avatar', seat2Kind, mood2);
    setAvatar('rivalAvatar', level, mode === 'computer' && level === roundLevel ? mood2 : 'idle');
    el('rivalName').textContent = personas[level].name;
    el('rivalDesc').textContent = personas[level].desc;
  }
  function renderBoard(animateLast) {
    var activeVariant = mode === 'menu' ? variant : roundVariant;
    syncPowerChoice();
    app.dataset.mode = mode;
    app.dataset.variant = activeVariant;
    app.dataset.power = selectedPower || '';
    app.dataset.paused = String(paused);
    el('twistBadge').hidden = activeVariant !== 'twist';
    el('headerSub').textContent = activeVariant === 'twist'
      ? (isConnect ? 'طور أقراص القوة ⚡ استعمل المطرقة والبرق واجمع 4 لتفوز!' : 'طور المتلاشية ⚡ 3 علامات لكل لاعب بلا تعادل!')
      : (isConnect ? 'اجمع 4 أقراص في صف واحد لتفوز!' : 'اجمع 3 علامات في صف واحد لتفوز!');
    el('gameBoard').dataset.moves = String(state.moves);
    el('gameBoard').dataset.turn = String(state.turn);
    el('gameBoard').dataset.winner = String(state.winner || 0);
    el('gameBoard').dataset.draw = String(state.draw);
    el('gameBoard').dataset.lastPower = state.lastPower || '';
    var won = state.winning || [];
    var vanishNow = !isConnect && activeVariant === 'twist' && !finished() && state.queues && state.queues[state.turn].length >= 3
      ? state.queues[state.turn][0] : -1;
    var vanishSoon = !isConnect && activeVariant === 'twist' && !finished() && state.queues && state.queues[3 - state.turn].length >= 3
      ? state.queues[3 - state.turn][0] : -1;
    cells.forEach(function (cell, i) {
      cell.classList.toggle('one', state.board[i] === 1);
      cell.classList.toggle('two', state.board[i] === 2);
      cell.classList.toggle('winning', won.indexOf(i) !== -1);
      cell.classList.toggle('last', state.last === i);
      cell.classList.toggle('vanishing', i === vanishNow);
      cell.classList.toggle('vanishing-soon', i === vanishSoon);
      cell.classList.toggle('vanished-poof', !!animateLast && state.vanished === i);
      cell.classList.toggle('power-hit', !!state.lastPower && (state.last === i || state.affected === i));
      if (isConnect) {
        var col = i % 7;
        var previewTarget = selectedPower === 'anvil' && state.board[col] !== 0
          ? i < 7
          : !state.board[i] && (i >= 35 || !!state.board[i + 7]);
        if (selectedPower === 'anvil' && state.board[col] === 0) {
          var topInCol = -1;
          for (var r = 0; r < 6; r++) if (state.board[r * 7 + col]) { topInCol = r * 7 + col; break; }
          previewTarget = topInCol === -1 ? i >= 35 : (state.board[topInCol] !== state.turn ? i === topInCol : i === topInCol - 7);
        }
        cell.classList.toggle('landing', previewTarget);
      } else {
        var cellState = state.board[i] ? tokenLabel(state.board[i]) + (i === vanishNow ? ' (ستتلاشى في هذه النقلة)' : '') : 'فارغ';
        cell.setAttribute('aria-label', 'المربع ' + (i + 1) + ': ' + cellState);
      }
    });
    if (animateLast) dropDisc();
    el('gameBoard').classList.toggle('settled', finished() && !fallingCell);
    updateWinBeam();
    var enabled = canMove();
    var legal = rules.legalMoves(state, selectedPower);
    moveButtons.forEach(function (button, i) {
      var disabled = !enabled || legal.indexOf(i) === -1;
      if (disabled && document.activeElement === button) pendingBoardFocus = i;
      button.disabled = disabled;
    });
    [1, 2].forEach(function (seat) {
      el('seat' + seat).classList.toggle('active', mode !== 'menu' && state.turn === seat && !finished());
      el('seat' + seat + 'Name').textContent = seatDisplayName(seat);
      el('guide' + seat).textContent = seatDisplayName(seat);
      el('score' + seat).textContent = String(score[seat]);
    });
    renderAvatars();
    el('variantBox').hidden = mode !== 'menu';
    variantButtons.forEach(function (button) {
      button.setAttribute('aria-pressed', String(button.dataset.variant === variant));
    });
    if (isConnect) {
      var showPowers = mode !== 'menu' && roundVariant === 'twist';
      el('powerBar').hidden = !showPowers;
      if (showPowers && state.powers) {
        var holder = mode === 'computer' ? 1 : state.turn;
        var bag = state.powers[holder];
        el('anvilCount').textContent = String(bag.anvil);
        el('zapCount').textContent = String(bag.zap);
        powerButtons.forEach(function (btn) {
          var pType = btn.dataset.power;
          var avail = enabled && bag[pType] > 0 && rules.legalMoves(state, pType).length > 0;
          btn.disabled = !avail;
          btn.setAttribute('aria-pressed', String(selectedPower === pType));
        });
      }
    }
    el('modeChoices').hidden = mode !== 'menu';
    el('levelBox').hidden = mode !== 'computer';
    levelButtons.forEach(function (button) {
      button.setAttribute('aria-pressed', String(button.dataset.level === level));
      button.classList.toggle('won', progress.wins[button.dataset.level] > 0);
      // A level that waits for the next round is only ringed; the level being played stays lit.
      button.classList.toggle('pending', level !== roundLevel && button.dataset.level === level);
      button.classList.toggle('playing', level !== roundLevel && button.dataset.level === roundLevel);
    });
    el('levelWins').textContent = levels.map(function (name) { return levelNames[name] + '\u00a0' + progress.wins[name]; }).join(' · ');
    el('modeTitle').textContent = mode === 'menu' ? 'كيف تريد أن تلعب؟' : mode === 'local' ? 'لاعبان على نفس الجهاز' : 'العب ضد الكمبيوتر';
    el('modeDescription').textContent = mode === 'menu' ? 'اختر طريقة اللعب وابدأ فوراً.' : mode === 'local' ? 'تبادلا الأدوار باستخدام نفس الفأرة.' : level !== roundLevel ? 'يبدأ «' + levelNames[level] + '» في الجولة التالية.' : 'اختر مستوى الكمبيوتر:';
    var turnText, hint = isConnect ? 'اضغط على أي عمود لإسقاط قرصك.' : 'اضغط على مربع فارغ لوضع علامتك.';
    if (activeVariant === 'twist' && mode !== 'menu' && !finished() && !paused) {
      if (isConnect) {
        hint = selectedPower === 'anvil' ? 'المطرقة الساحقة 💥 تسحق القرص العلوي للخصم!'
          : selectedPower === 'zap' ? 'قرص البرق ⚡ يقلب قرص الخصم تحته إلى لونك!'
          : 'اختر عموداً أو فعّل قرص قوة (Q مطرقة · E برق).';
      } else {
        hint = vanishNow !== -1 ? 'العلامة المتوهجة ستتلاشى عند وضع علامتك الجديدة ⚡' : '3 علامات فقط لكل لاعب في الملعب — لا تعادل!';
      }
    }
    if (mode === 'menu') {
      turnText = 'اختر طريقة اللعب للبدء';
      hint = activeVariant === 'twist'
        ? (isConnect ? 'لكل لاعب قرص مطرقة 💥 وقرص برق ⚡ لقلب الموازين!' : 'تختفي أقدم علامة بعد الثالثة… مواجهة بلا تعادل!')
        : (isConnect ? 'أفقياً، عمودياً أو قطرياً… أول 4 يفوز!' : 'أفقياً، عمودياً أو قطرياً… أول 3 يفوز!');
    } else if (finished()) {
      turnText = state.draw ? 'تعادل! جولة أخرى؟' : mode === 'local' ? 'فاز ' + playerLabel(state.winner) + ' — ' + tokenLabel(state.winner) + '!' :
        state.winner !== 1 ? 'فاز الكمبيوتر… جرّب مرة أخرى!' : firstWin ? 'جديد! هزمت الكمبيوتر ال' + levelNames[roundLevel] + '!' : 'فزت! أحسنت اللعب!';
      hint = mode === 'computer' && startingSeat === 2 ? 'تبدأ أنت الجولة التالية.' : 'يبدأ ' + playerLabel(3 - startingSeat) + ' الجولة التالية.';
      var nextLevel = levels[levels.indexOf(roundLevel) + 1];
      if (mode === 'computer' && level === roundLevel && state.winner === 1 && nextLevel && progress.wins[roundLevel] >= 2 && !progress.wins[nextLevel]) hint = 'جاهز لتحدي المستوى ال' + levelNames[nextLevel] + '؟';
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
    syncPowerChoice();
    var next = rules.play(state, move, selectedPower);
    if (!next) return;
    selectedPower = null;
    if (!counted) {
      counted = true;
      var statMode = (roundVariant === 'twist' ? 'twist-' : '') + (mode === 'local' ? mode : 'cpu-' + roundLevel);
      Kit.stats.round(statMode);
    }
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
      var next = rules.play(state, rules.chooseMove(state, roundLevel));
      if (!next) return;
      state = next;
      if (finished()) scoreRound();
      renderBoard(true);
    }, 420);
  }
  function newRound() {
    stopTimers(); pendingBoardFocus = null; roundVariant = variant; selectedPower = null;
    state = createState(roundVariant); state.turn = startingSeat;
    paused = false; firstWin = false; counted = false; roundLevel = level;
    renderBoard(); scheduleComputer(); focusBoard();
  }
  function start(selectedMode) {
    if (juice) juice.select();
    mode = selectedMode; startingSeat = 1; score = { 1: 0, 2: 0 }; newRound();
  }
  function setVariant(value) {
    if ((value !== 'classic' && value !== 'twist') || value === variant) return;
    variant = value;
    if (juice) juice.toggle(variant === 'twist');
    if (mode === 'menu') { roundVariant = variant; selectedPower = null; state = createState(variant); renderBoard(); }
  }
  function togglePower(power) {
    if (!isConnect || roundVariant !== 'twist' || !canMove() || !state.powers) return;
    if (!state.powers[state.turn][power] || !rules.legalMoves(state, power).length) return;
    selectedPower = selectedPower === power ? null : power;
    if (juice) juice.toggle(!!selectedPower);
    renderBoard();
  }
  // Once the player has moved, including any finished round, a new level waits for the next round,
  // so a misclick never throws away a round or its celebration. The session score is kept.
  function setLevel(value) {
    if (value === level) return;
    if (juice) juice.tap();
    level = value; saveProgress();
    if (counted || state.board.indexOf(1) !== -1) renderBoard();
    else { startingSeat = 1; newRound(); }
  }
  function leaveMatch() {
    if (juice) juice.back();
    stopTimers(); pendingBoardFocus = null; mode = 'menu'; roundVariant = variant; selectedPower = null;
    state = createState(variant); startingSeat = 1; score = { 1: 0, 2: 0 };
    paused = false; renderBoard(); el(isConnect ? 'pcButton' : 'localButton').focus();
  }
  function pause(value, moveFocus) {
    if (mode === 'menu' || finished()) return;
    if (moveFocus && juice) juice.toggle(!value);
    paused = value; stopTimers(); renderBoard();
    if (!paused) { scheduleComputer(); if (moveFocus) focusBoard(); }
    else if (moveFocus) el('resumeButton').focus();
  }
  el('localButton').addEventListener('click', function () { start('local'); });
  el('pcButton').addEventListener('click', function () { start('computer'); });
  var variantButtons = [].slice.call(app.querySelectorAll('[data-variant]'));
  variantButtons.forEach(function (button) {
    button.addEventListener('click', function () { setVariant(button.dataset.variant); });
  });
  var powerButtons = [].slice.call(app.querySelectorAll('[data-power]'));
  powerButtons.forEach(function (button) {
    button.addEventListener('click', function () { togglePower(button.dataset.power); });
  });
  var levelButtons = [].slice.call(app.querySelectorAll('[data-level]'));
  levelButtons.forEach(function (button) {
    button.addEventListener('click', function () { setLevel(button.dataset.level); });
  });
  // The match buttons re-centre as they show and hide, so the 2nd click of a double-click on
  // Pause or Play again lands on the button that slid under it; keyboard activation has detail 0.
  // Its mousedown is ignored too, which keeps focus where the 1st click put it (Resume or the
  // board), so the Enter that follows still resumes or plays.
  el('leaveMatch').addEventListener('click', function (event) { if (event.detail > 1) return; leaveMatch(); });
  el('pauseButton').addEventListener('click', function (event) { if (event.detail > 1) return; pause(true, true); });
  app.querySelector('.match-actions').addEventListener('mousedown', function (event) { if (event.detail > 1) event.preventDefault(); });
  el('resumeButton').addEventListener('click', function () { pause(false, true); });
  el('rematchButton').addEventListener('click', function () {
    if (mode === 'menu' || !finished() || fallingCell) return;
    if (juice) juice.select();
    startingSeat = 3 - startingSeat;
    newRound();
  });
  // Kit's mute button and preference updates, with the board's text label.
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
  window.addEventListener('resize', function () { if (finished() && !fallingCell) updateWinBeam(); });
  // A delayed disc or computer move must not steal focus from another control.
  document.addEventListener('focusin', function (event) {
    if (event.target !== document.body && moveButtons.indexOf(event.target) === -1) pendingBoardFocus = null;
  });
  // A focused button clicks on every auto-repeated Enter, and focus then moves to the
  // next free cell or Play again, so one held key would play whole rounds by itself.
  app.addEventListener('keydown', function (event) {
    if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault();
  }, true);
  window.addEventListener('keydown', function (event) {
    var target = event.target;
    if ((target && (target.isContentEditable || (typeof target.matches === 'function' && target.matches('input,textarea,select')))) ||
        event.isComposing || event.ctrlKey || event.altKey || event.metaKey || event.repeat) return;
    if (event.code === 'KeyM') { Kit.audio.unlock(); Kit.audio.toggleMute(); }
    if ((event.code === 'KeyP' || event.code === 'Escape') && mode !== 'menu' && !finished()) {
      event.preventDefault(); pause(!paused, true);
    }
    if (event.code === 'KeyR' && finished()) el('rematchButton').click();
    if (isConnect && roundVariant === 'twist' && canMove()) {
      if (event.code === 'KeyQ') { event.preventDefault(); togglePower('anvil'); }
      else if (event.code === 'KeyE') { event.preventDefault(); togglePower('zap'); }
    }
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      if (mode !== 'menu' && !paused && !finished()) pause(true, false);
      stopTimers(true);
    }
    renderBoard(); landLater();
  });
  window.addEventListener('pagehide', function () {
    if (mode !== 'menu' && !paused && !finished()) paused = true;
    stopTimers(true); renderBoard();
  });
  window.addEventListener('pageshow', function (event) {
    if (!event.persisted || document.hidden) return;
    // A restored page remains paused until the player explicitly resumes.
    renderBoard(); scheduleComputer(); landLater();
  });
  makeBoard(); renderSound(); renderBoard();
  Kit.lifecycle({ pause: function () { pause(true, false); } });
  Kit.ready();
}());
