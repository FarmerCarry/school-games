(function () {
  'use strict';
  var app = document.getElementById('boardApp');
  var game = app.getAttribute('data-game');
  var isConnect = game === 'connect-four';
  var rules = window.SGBoardRules;
  var title = isConnect ? 'أربعة على التوالي' : 'إكس أو';
  var mode = 'lobby', state = rules.create(game), match = null, players = [], invitation = null;
  var name = '', connection = 'idle', pendingMove = false, pendingInvite = false, paused = false;
  var aiTimer = null, moveTimer = null, abandonedMatch = null, hiddenPaused = false;
  var cells = [], moveButtons = [];

  app.classList.add(game);
  app.innerHTML = '<header class="game-header"><div><h1>' + title + '</h1><p>' +
    (isConnect ? 'اجمع 4 أقراص في صف واحد لتفوز!' : 'اجمع 3 علامات في صف واحد لتفوز!') +
    '</p></div><button id="soundButton" class="sound-button" type="button">الصوت: يعمل</button></header>' +
    '<div class="play-layout"><aside class="lobby" aria-labelledby="lobbyTitle">' +
      '<div><h2 id="lobbyTitle">لاعبو هذه اللعبة</h2><p id="connectionStatus" class="connection" role="status"></p></div>' +
      '<form id="nameForm" class="name-form"><label for="playerName">ما اسمك؟</label><div class="name-row">' +
        '<input id="playerName" name="playerName" placeholder="اكتب اسمك" maxlength="20" minlength="2" autocomplete="off" required>' +
        '<button id="joinButton" class="button" type="submit">دخول</button></div></form>' +
      '<div id="identity" class="identity" hidden><span class="avatar" aria-hidden="true">أ</span><strong id="myName"></strong>' +
        '<button id="logoutButton" class="text-button" type="button">خروج</button></div>' +
      '<button id="retryButton" class="text-button" type="button" hidden>إعادة الاتصال</button>' +
      '<section id="invitePanel" class="invitation" aria-label="دعوة للعب" hidden><p id="inviteText" role="status"></p>' +
        '<div class="invite-actions"><button id="acceptInvite" class="button small" type="button">قبول</button>' +
        '<button id="declineInvite" class="button small secondary" type="button">رفض</button>' +
        '<button id="cancelInvite" class="button small secondary" type="button">إلغاء الدعوة</button></div></section>' +
      '<p id="notice" class="notice" role="status" hidden></p>' +
      '<section class="players-section" aria-labelledby="playersHeading"><div class="players-heading"><h3 id="playersHeading">من هنا؟</h3>' +
        '<span id="playersCount" class="players-count">اللاعبون: 0</span></div><ul id="playerList" class="player-list"></ul>' +
        '<p id="emptyLobby" class="empty-lobby"></p></section>' +
      '<div class="computer-choice"><button id="pcButton" class="button" type="button">العب ضد الكمبيوتر</button>' +
        '<p>جاهز دائماً، حتى بدون إنترنت</p></div></aside>' +
      '<section class="board-area" aria-label="لوحة اللعب"><div class="round-bar">' +
        '<div id="seat1" class="seat"><span class="seat-token" aria-hidden="true"></span><span id="seat1Name">أنت</span></div>' +
        '<span class="versus">ضد</span><div id="seat2" class="seat"><span class="seat-token second" aria-hidden="true"></span><span id="seat2Name">الكمبيوتر أو زميلك</span></div></div>' +
        '<div class="board-wrap"><div id="gameBoard" class="game-board ' + (isConnect ? 'connect-board' : 'tic-board') + '" role="group" aria-label="' + title + '"></div>' +
          '<div id="pauseLayer" class="pause-layer" hidden><h2>استراحة قصيرة</h2><button id="resumeButton" class="button" type="button">متابعة اللعب</button></div></div>' +
        '<p id="turnLine" class="turn-line" role="status" aria-live="polite"></p><p id="boardHint" class="board-hint"></p>' +
        '<div class="match-actions"><button id="rematchButton" class="button" type="button" hidden>العب مرة أخرى</button>' +
          '<button id="pauseButton" class="button secondary" type="button" hidden>استراحة</button>' +
          '<button id="leaveMatch" class="button secondary" type="button" hidden>العودة إلى اللاعبين</button></div></section></div>';
  function el(id) { return document.getElementById(id); }
  function showNotice(text) { el('notice').textContent = text || ''; el('notice').hidden = !text; }
  function sound(win) {
    if (!window.Kit) return;
    if (win) Kit.sfx.coin(); else Kit.sfx.click();
  }
  function clearThinking() { clearTimeout(aiTimer); aiTimer = null; }
  function clearMove() { clearTimeout(moveTimer); moveTimer = null; pendingMove = false; }
  function finished() { return !!(state.winner || state.draw); }
  function mine() {
    if (mode !== 'online' || !match) return 1;
    var player = match.players.find(function (p) { return p.id === client.id(); });
    return player ? player.seat : 0;
  }
  function everyoneHere() { return !!(match && match.connected && match.players.every(function (p) { return match.connected.indexOf(p.id) !== -1; })); }
  function canMove() {
    if (mode === 'lobby' || finished() || paused || pendingMove || document.hidden) return false;
    if (mode === 'computer') return state.turn === 1;
    return connection === 'online' && everyoneHere() && state.turn === mine();
  }
  function send(message) {
    if (client.send(message)) return true;
    showNotice('انقطع الاتصال. حاول مجدداً بعد عودته.');
    return false;
  }
  var client = SGMultiplayer.create({ game: game, onStatus: function (value) {
    connection = value;
    if (value !== 'online') { players = []; invitation = null; pendingInvite = false; clearMove(); }
    renderLobby(); renderBoard();
  }, onMessage: receive });

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
  function renderBoard() {
    if (!client) return;
    app.dataset.mode = mode;
    el('gameBoard').dataset.moves = String(state.moves);
    el('gameBoard').dataset.turn = String(state.turn);
    el('gameBoard').dataset.winner = String(state.winner || 0);
    var enabled = canMove(), legal = rules.legalMoves(state), won = state.winning || [];
    cells.forEach(function (cell, i) {
      cell.classList.toggle('one', state.board[i] === 1);
      cell.classList.toggle('two', state.board[i] === 2);
      cell.classList.toggle('winning', won.indexOf(i) !== -1);
      cell.classList.toggle('last', state.last === i);
      if (!isConnect) cell.setAttribute('aria-label', 'المربع ' + (i + 1) + ': ' + (state.board[i] === 1 ? 'إكس' : state.board[i] === 2 ? 'دائرة' : 'فارغ'));
    });
    moveButtons.forEach(function (button, i) { button.disabled = !enabled || legal.indexOf(i) === -1; });
    el('seat1').classList.toggle('active', mode !== 'lobby' && state.turn === 1 && !finished());
    el('seat2').classList.toggle('active', mode !== 'lobby' && state.turn === 2 && !finished());
    if (mode === 'online' && match) {
      match.players.forEach(function (p) { el('seat' + p.seat + 'Name').textContent = p.name + (p.id === client.id() ? ' (أنت)' : ''); });
    } else {
      el('seat1Name').textContent = name || 'أنت';
      el('seat2Name').textContent = mode === 'computer' ? 'الكمبيوتر' : 'الكمبيوتر أو زميلك';
    }
    var turnText, hint = isConnect ? 'اضغط على أي عمود لإسقاط قرصك.' : 'اضغط على مربع فارغ لوضع علامتك.';
    if (mode === 'lobby') { turnText = 'اختر الكمبيوتر أو تحدَّ زميلاً'; hint = isConnect ? 'أفقياً، عمودياً أو قطرياً… أول 4 يفوز!' : 'أفقياً، عمودياً أو قطرياً… أول 3 يفوز!'; }
    else if (finished()) {
      if (state.draw) turnText = 'تعادل! جولة أخرى؟';
      else turnText = state.winner === mine() ? 'فزت! أحسنت اللعب!' : (mode === 'computer' ? 'فاز الكمبيوتر… جرّب مرة أخرى!' : 'فاز زميلك… جولة أخرى؟');
      hint = mode === 'online' && match.endedReason === 'inactive' ? 'انتهت الجولة بعد فترة طويلة بدون لعب.' :
        mode === 'online' && match.endedReason === 'disconnected' ? 'انتهت الجولة لأن أحد اللاعبين فقد الاتصال.' :
        mode === 'online' && match.endedReason ? 'انتهت الجولة بعد مغادرة أحد اللاعبين.' : 'تحدٍّ صغير… وفرصة جديدة للفوز!';
    } else if (paused) turnText = 'اللعبة متوقفة مؤقتاً';
    else if (mode === 'online' && connection !== 'online') turnText = 'نحاول إعادة الاتصال…';
    else if (mode === 'online' && !everyoneHere()) { turnText = 'ننتظر عودة زميلك…'; hint = 'تتوقف النقلات حتى يعود الاتصال.'; }
    else if (pendingMove) turnText = 'جارٍ إرسال نقلتك…';
    else if (state.turn === mine()) turnText = isConnect ? 'دورك! اختر عموداً' : 'دورك! اختر مربعاً';
    else turnText = mode === 'computer' ? 'الكمبيوتر يفكّر…' : 'دور زميلك';
    el('turnLine').textContent = turnText;
    el('boardHint').textContent = hint;
    el('pauseLayer').hidden = !paused;
    el('pauseButton').hidden = mode !== 'computer' || finished();
    el('leaveMatch').hidden = mode === 'lobby';
    el('rematchButton').hidden = mode === 'lobby' || !finished();
    var asked = mode === 'online' && match && (match.rematch || []).indexOf(client.id()) !== -1;
    el('rematchButton').disabled = mode === 'online' && (connection !== 'online' || !everyoneHere() || asked);
    el('rematchButton').textContent = asked ? 'ننتظر موافقة زميلك…' : 'العب مرة أخرى';
    if (mode === 'online' && finished() && !asked && (match.rematch || []).length) el('rematchButton').textContent = 'زميلك يريد جولة أخرى — هيا!';
    el('pcButton').disabled = mode === 'online';
    el('pcButton').textContent = mode === 'computer' ? 'جولة جديدة ضد الكمبيوتر' : 'العب ضد الكمبيوتر';
  }
  function renderLobby() {
    if (!client) return;
    var hasIdentity = !!client.id();
    var online = connection === 'online';
    el('connectionStatus').classList.toggle('online', online);
    el('connectionStatus').textContent = online ? 'متصل — هذه الغرفة لهذه اللعبة فقط' :
      connection === 'connecting' ? 'جارٍ الدخول…' : connection === 'reconnecting' ? 'نحاول إعادة الاتصال…' :
      !client.configured() ? 'اللعب مع الزملاء غير متاح حالياً' : connection === 'unavailable' ? 'تعذّر الاتصال الآن' : 'ادخل باسمك للعب مع زملائك';
    el('nameForm').hidden = hasIdentity;
    el('identity').hidden = !hasIdentity;
    el('myName').textContent = name;
    el('joinButton').disabled = connection === 'connecting' || connection === 'reconnecting';
    el('retryButton').hidden = !(client.configured() && connection === 'unavailable' && hasIdentity);
    var others = players.filter(function (p) { return p.id !== client.id(); });
    el('playersCount').textContent = 'اللاعبون: ' + others.length;
    var list = el('playerList');
    list.textContent = '';
    others.forEach(function (player) {
      var row = document.createElement('li'); row.className = 'player'; row.dataset.playerId = player.id;
      var avatar = document.createElement('span'); avatar.className = 'avatar'; avatar.setAttribute('aria-hidden', 'true');
      avatar.textContent = Array.from(player.name)[0] || '؟';
      var info = document.createElement('span'); info.className = 'player-info';
      var playerName = document.createElement('b'); playerName.className = 'player-name'; playerName.textContent = player.name;
      var status = document.createElement('span'); status.className = 'player-status' + (player.status === 'available' ? ' available' : '');
      status.textContent = player.status === 'available' ? 'متاح للعب' : player.status === 'invited' ? 'لديه دعوة' : 'يلعب الآن';
      info.appendChild(playerName); info.appendChild(status);
      var invite = document.createElement('button'); invite.type = 'button'; invite.className = 'button small secondary invite-button'; invite.textContent = 'تحدَّ';
      invite.setAttribute('aria-label', 'تحدَّ ' + player.name);
      invite.disabled = !online || mode !== 'lobby' || !!invitation || pendingInvite || player.status !== 'available';
      invite.addEventListener('click', function () {
        if (send({ type: 'invite', to: player.id })) { pendingInvite = true; showNotice('جارٍ إرسال الدعوة…'); renderLobby(); }
      });
      row.appendChild(avatar); row.appendChild(info); row.appendChild(invite); list.appendChild(row);
    });
    el('emptyLobby').hidden = !!others.length;
    el('emptyLobby').textContent = online ? 'لا يوجد زملاء هنا بعد.\nالعب ضد الكمبيوتر حتى يصلوا!' : 'سترى هنا زملاءك الموجودين\nداخل هذه اللعبة.';
    el('invitePanel').hidden = !invitation;
    if (invitation) {
      var incoming = invitation.to.id === client.id();
      el('inviteText').textContent = incoming ? invitation.from.name + ' يدعوك للعب! هل تقبل؟' : 'أرسلت دعوة إلى ' + invitation.to.name + '. ننتظر رده…';
      el('acceptInvite').hidden = !incoming; el('declineInvite').hidden = !incoming; el('cancelInvite').hidden = incoming;
      el('acceptInvite').disabled = !online; el('declineInvite').disabled = !online; el('cancelInvite').disabled = !online;
    }
  }
  var errorMessages = {
    'invalid-name': 'اكتب اسماً من 2 إلى 20 حرفاً. استخدم الحروف والأرقام والمسافات.',
    'name-taken': 'هذا الاسم مستخدم. اختر اسماً آخر.',
    'session-active': 'هذا الاسم مفتوح في نافذة أخرى. أغلقها أو ادخل باسم جديد.',
    'invalid-token': 'انتهت جلستك. ادخل باسمك من جديد.',
    'session-expired': 'انتهت جلستك. ادخل باسمك من جديد.',
    'invalid-session': 'انتهت جلستك. ادخل باسمك من جديد.',
    'rate-limit': 'تمهّل قليلاً ثم حاول مجدداً.',
    'rate-limited': 'تمهّل قليلاً ثم حاول مجدداً.',
    'invite-cooldown': 'انتظر قليلاً قبل إرسال دعوة أخرى.',
    'unavailable': 'هذا اللاعب مشغول الآن. اختر زميلاً آخر.',
    'player-unavailable': 'هذا اللاعب مشغول الآن. اختر زميلاً آخر.',
    'target-unavailable': 'هذا اللاعب مشغول الآن. اختر زميلاً آخر.',
    'busy': 'أكمل جولتك أو دعوتك أولاً.',
    'player-busy': 'هذا اللاعب مشغول الآن. اختر زميلاً آخر.',
    'invalid-player': 'غادر هذا اللاعب الغرفة. اختر زميلاً آخر.',
    'invalid-invite': 'انتهت الدعوة. يمكنك إرسال دعوة جديدة.',
    'invalid-match': 'انتهت هذه الجولة. عُد إلى اللاعبين لبدء تحدٍّ جديد.',
    'invite-expired': 'انتهت الدعوة. يمكنك إرسال دعوة جديدة.',
    'opponent-offline': 'انقطع اتصال زميلك. ننتظر عودته.',
    'room-full': 'الغرفة ممتلئة الآن. جرّب بعد قليل.',
    'server-full': 'الغرفة ممتلئة الآن. جرّب بعد قليل.',
    'not-your-turn': 'انتظر دورك أولاً.',
    'stale-version': 'تم تحديث اللوحة. جرّب نقلتك من جديد.',
    'stale-state': 'تم تحديث اللوحة. جرّب نقلتك من جديد.',
    'invalid-move': 'اختر مكاناً متاحاً.',
    'match-ended': 'انتهت الجولة. يمكنك بدء جولة جديدة.'
  };
  function receive(message) {
    if (message.type === 'welcome') {
      name = message.name; el('playerName').value = name; showNotice('');
      if (mode === 'online' && match && !match.players.some(function (p) { return p.id === message.id; })) {
        match = null; mode = 'lobby'; state = rules.create(game);
        showNotice('انتهت الجلسة السابقة. يمكنك بدء تحدٍّ جديد.');
      }
      if (mode === 'computer') client.send({ type: 'status', status: 'playing' });
      renderLobby(); renderBoard();
    } else if (message.type === 'lobby') { players = message.players || []; renderLobby(); }
    else if (message.type === 'invite') { invitation = message; pendingInvite = false; showNotice(''); sound(false); renderLobby(); }
    else if (message.type === 'invite-ended') {
      if (!invitation || invitation.id === message.id) invitation = null;
      pendingInvite = false;
      var reasons = { declined: 'لم يقبل زميلك الدعوة هذه المرة.', expired: 'انتهت الدعوة. جرّب زميلاً آخر!', cancelled: 'أُلغيت الدعوة.', disconnected: 'غادر اللاعب الغرفة.', unavailable: 'اللاعب غير متاح الآن.' };
      showNotice(reasons[message.reason] || ''); renderLobby();
    } else if (message.type === 'match') {
      if (message.id === abandonedMatch) {
        client.send({ type: 'leave-match', matchId: message.id });
        client.send({ type: 'status', status: mode === 'computer' ? 'playing' : 'available' });
        return;
      }
      var wasFinished = mode === 'online' && finished(), previousMoves = mode === 'online' ? state.moves : -1;
      clearThinking(); clearMove(); paused = false; hiddenPaused = false; invitation = null; pendingInvite = false;
      match = message; state = message.state; mode = 'online';
      showNotice('');
      if (finished() && !wasFinished) sound(state.winner === mine());
      else if (state.moves > previousMoves && previousMoves >= 0) sound(false);
      renderLobby(); renderBoard();
    } else if (message.type === 'error') {
      clearMove(); pendingInvite = false;
      showNotice(errorMessages[message.code] || 'لم تنجح المحاولة. جرّب مجدداً بعد قليل.');
      renderLobby(); renderBoard();
    }
  }
  function play(move) {
    if (!canMove()) return;
    if (mode === 'online') {
      if (send({ type: 'move', matchId: match.id, move: move, version: match.version })) {
        pendingMove = true; renderBoard();
        moveTimer = setTimeout(function () {
          if (pendingMove) { showNotice('نراجع الاتصال… ستعود اللوحة تلقائياً.'); client.connect(name); }
        }, 10000);
      }
      return;
    }
    var next = rules.play(state, move);
    if (!next) return;
    state = next; sound(finished() && state.winner === 1); renderBoard(); scheduleComputer();
  }
  function scheduleComputer() {
    clearThinking();
    if (mode !== 'computer' || paused || document.hidden || finished() || state.turn !== 2) return;
    aiTimer = setTimeout(function () {
      aiTimer = null;
      if (mode !== 'computer' || paused || document.hidden || finished()) return;
      var next = rules.play(state, rules.chooseMove(state));
      if (next) { state = next; sound(false); renderBoard(); }
    }, 420);
  }
  function startComputer() {
    if (mode === 'online') return;
    if (invitation) client.send(invitation.to.id === client.id() ? { type: 'respond', id: invitation.id, accept: false } : { type: 'cancel', id: invitation.id });
    invitation = null; pendingInvite = false; clearThinking(); clearMove();
    state = rules.create(game); match = null; mode = 'computer'; paused = false; hiddenPaused = false;
    client.send({ type: 'status', status: 'playing' }); showNotice(''); renderLobby(); renderBoard();
  }
  function leaveMatch() {
    if (mode === 'online' && match) { abandonedMatch = match.id; client.send({ type: 'leave-match', matchId: match.id }); }
    clearThinking(); clearMove(); mode = 'lobby'; match = null; state = rules.create(game); paused = false; hiddenPaused = false;
    client.send({ type: 'status', status: 'available' }); showNotice(''); renderLobby(); renderBoard();
  }
  function pause(value) {
    if (mode !== 'computer' || finished()) return;
    paused = value; clearThinking(); renderBoard();
    if (!paused) scheduleComputer(); else el('resumeButton').focus();
  }
  el('nameForm').addEventListener('submit', function (event) {
    event.preventDefault();
    var value = el('playerName').value.trim().replace(/\s+/g, ' ');
    if (Array.from(value).length < 2 || Array.from(value).length > 20) { showNotice(errorMessages['invalid-name']); return; }
    name = value; showNotice('');
    if (!client.configured()) { showNotice('اللعب مع الزملاء غير متاح حالياً. يمكنك اللعب ضد الكمبيوتر!'); renderBoard(); return; }
    client.connect(name);
  });
  el('retryButton').addEventListener('click', function () { client.connect(name); });
  el('logoutButton').addEventListener('click', function () {
    if (mode === 'online') leaveMatch();
    invitation = null; players = []; client.disconnect(true); name = ''; el('playerName').value = ''; showNotice(''); renderLobby(); renderBoard();
  });
  el('pcButton').addEventListener('click', startComputer);
  el('leaveMatch').addEventListener('click', leaveMatch);
  el('pauseButton').addEventListener('click', function () { pause(true); });
  el('resumeButton').addEventListener('click', function () { hiddenPaused = false; pause(false); });
  el('rematchButton').addEventListener('click', function () {
    if (mode === 'computer') startComputer();
    else if (match && send({ type: 'rematch', matchId: match.id })) el('rematchButton').disabled = true;
  });
  el('acceptInvite').addEventListener('click', function () {
    if (invitation && send({ type: 'respond', id: invitation.id, accept: true })) el('acceptInvite').disabled = true;
  });
  el('declineInvite').addEventListener('click', function () { if (invitation) send({ type: 'respond', id: invitation.id, accept: false }); });
  el('cancelInvite').addEventListener('click', function () { if (invitation) send({ type: 'cancel', id: invitation.id }); });
  function renderSound() { el('soundButton').textContent = Kit.audio.muted ? 'الصوت: مغلق' : 'الصوت: يعمل'; el('soundButton').setAttribute('aria-pressed', String(!Kit.audio.muted)); }
  el('soundButton').addEventListener('click', function () { Kit.audio.unlock(); Kit.audio.toggleMute(); renderSound(); });
  window.addEventListener('keydown', function (event) {
    var target = event.target;
    if ((target && (target.isContentEditable || (typeof target.matches === 'function' && target.matches('input,textarea,select')))) ||
        event.isComposing || event.ctrlKey || event.altKey || event.metaKey || event.repeat) return;
    if (event.code === 'KeyM') { Kit.audio.toggleMute(); renderSound(); }
    if ((event.code === 'KeyP' || event.code === 'Escape') && mode === 'computer') { event.preventDefault(); hiddenPaused = false; pause(!paused); }
    if (event.code === 'KeyR' && finished()) el('rematchButton').click();
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && mode === 'computer' && !paused && !finished()) { hiddenPaused = true; pause(true); }
    else if (!document.hidden && hiddenPaused) { hiddenPaused = false; pause(false); }
    renderBoard();
  });
  window.addEventListener('pagehide', function () { clearThinking(); clearMove(); client.disconnect(false); });
  window.addEventListener('pageshow', function (event) { if (event.persisted) { if (client.canResume()) client.connect(client.savedName()); scheduleComputer(); } });
  makeBoard(); renderSound();
  name = client.savedName(); el('playerName').value = name;
  renderLobby(); renderBoard();
  if (client.canResume() && client.configured()) client.connect(name);
}());
