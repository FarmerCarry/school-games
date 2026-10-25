/*
 * أكاديمية الفأرة واللوحة — station rules.
 * Pure data and functions: no DOM, no Kit, no storage. The page (game.js) draws
 * and saves; Node tests load this file in a sandbox. A damaged save must never
 * throw, and nothing here can fail a child (no timers, lives, or penalties).
 */
(function () {
  'use strict';

  var STATIONS = [
    { id: 'move', goal: 4, icon: '⭐', title: 'حرّك الفأرة', hint: 'إلى النجمة', prompt: 'حرّك الفأرة' },
    { id: 'click', goal: 5, icon: '🎈', title: 'نقرة واحدة', hint: 'انقر هنا', prompt: 'انقر البالون' },
    { id: 'double', goal: 3, icon: '🎁', title: 'نقرتان', hint: 'مرتين بسرعة', prompt: 'انقر مرتين' },
    { id: 'drag', goal: 4, icon: '🍎', title: 'اسحب', hint: 'إلى الحيوان', prompt: 'اسحب الفاكهة' },
    { id: 'scroll', goal: 3, icon: '🐭', title: 'مرّر', hint: 'إلى الأسفل', prompt: 'حرّك العجلة' },
    { id: 'arrows', goal: 1, icon: '⬆️', title: 'الأسهم', hint: 'اتبع السهم', prompt: 'اضغط الأسهم' },
    { id: 'jump', goal: 1, icon: '🚪', title: 'مسافة ثم Enter', hint: 'مسافة', prompt: 'مسافة للقفز' },
    { id: 'letters', goal: 4, icon: '⌨️', title: 'الحروف', hint: 'هذا المفتاح', prompt: 'اضغط المفتاح' }
  ];

  // Windows Arabic (101) letter block, physical positions. event.code selects the
  // key; the big label is Arabic and the small one is the Latin letter on the same key.
  var AR = {
    KeyQ: 'ض', KeyW: 'ص', KeyE: 'ث', KeyR: 'ق', KeyT: 'ف', KeyY: 'غ', KeyU: 'ع', KeyI: 'ه', KeyO: 'خ', KeyP: 'ح',
    KeyA: 'ش', KeyS: 'س', KeyD: 'ي', KeyF: 'ب', KeyG: 'ل', KeyH: 'ا', KeyJ: 'ت', KeyK: 'ن', KeyL: 'م',
    Semicolon: 'ك', Quote: 'ط',
    KeyZ: 'ئ', KeyX: 'ء', KeyC: 'ؤ', KeyV: 'ر', KeyB: 'لا', KeyN: 'ى', KeyM: 'ة',
    Comma: 'و', Period: 'ز', Slash: 'ظ'
  };
  var EN = {
    KeyQ: 'Q', KeyW: 'W', KeyE: 'E', KeyR: 'R', KeyT: 'T', KeyY: 'Y', KeyU: 'U', KeyI: 'I', KeyO: 'O', KeyP: 'P',
    KeyA: 'A', KeyS: 'S', KeyD: 'D', KeyF: 'F', KeyG: 'G', KeyH: 'H', KeyJ: 'J', KeyK: 'K', KeyL: 'L',
    Semicolon: ';', Quote: "'",
    KeyZ: 'Z', KeyX: 'X', KeyC: 'C', KeyV: 'V', KeyB: 'B', KeyN: 'N', KeyM: 'M',
    Comma: ',', Period: '.', Slash: '/'
  };
  var KEY_ROWS = [
    ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP'],
    ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote'],
    ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period', 'Slash']
  ];
  // ا ب ت then م — familiar letters, each on its real Arabic-101 key.
  var LETTERS = ['KeyH', 'KeyF', 'KeyJ', 'KeyL'];
  // Home row under A S D F and J K L ; . On Arabic 101 those keys are ش س ي ب and ت ن م ك.
  // F and J (ب and ت) are the bump keys an index finger can feel.
  var HOME_LEFT = ['KeyA', 'KeyS', 'KeyD', 'KeyF'];
  var HOME_RIGHT = ['KeyJ', 'KeyK', 'KeyL', 'Semicolon'];
  var FINGER_OF = {
    KeyA: 'pinky', KeyS: 'ring', KeyD: 'middle', KeyF: 'index',
    KeyJ: 'index', KeyK: 'middle', KeyL: 'ring', Semicolon: 'pinky'
  };

  var MAZE_ROWS = [
    '##########',
    '#S1......#',
    '#######..#',
    '#2.......#',
    '#.########',
    '#3.......#',
    '########.#',
    '#.......G#',
    '##########'
  ];
  var DIRS = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };

  var JUMP = { speed: 170, bufferTap: 2.5, hopTime: 0.5, stopGap: 64, clearGap: 48 };

  function stationIndex(id) {
    for (var i = 0; i < STATIONS.length; i++) if (STATIONS[i].id === id) return i;
    return -1;
  }
  function stationById(id) {
    var i = stationIndex(id);
    return i < 0 ? null : STATIONS[i];
  }
  function freshSave() {
    return { v: 1, done: {}, unlocked: 1, name: '', grip: false };
  }
  function cleanName(value) {
    var text = String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
    return Array.from(text).slice(0, 16).join('');
  }
  function clampInt(value, lo, hi, fallback) {
    var n = typeof value === 'number' ? value : typeof value === 'string' && /^-?\d+$/.test(value) ? Number(value) : NaN;
    if (!isFinite(n) || Math.floor(n) !== n) return fallback;
    return n < lo ? lo : n > hi ? hi : n;
  }
  // Salvage whatever is still a real station flag. Junk, arrays, and wrong types
  // become a fresh academy instead of throwing or trapping the next child.
  function loadSave(raw) {
    var save = freshSave();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return save;
    if (raw.done && typeof raw.done === 'object' && !Array.isArray(raw.done)) {
      for (var i = 0; i < STATIONS.length; i++) {
        if (raw.done[STATIONS[i].id] === true) save.done[STATIONS[i].id] = true;
      }
    }
    save.unlocked = clampInt(raw.unlocked, 1, STATIONS.length + 1, 1);
    for (i = 0; i < STATIONS.length; i++) {
      if (save.done[STATIONS[i].id]) save.unlocked = Math.max(save.unlocked, i + 2);
    }
    if (save.unlocked > STATIONS.length + 1) save.unlocked = STATIONS.length + 1;
    save.name = cleanName(raw.name);
    save.grip = raw.grip === true;
    return save;
  }
  function markGrip(save) {
    var next = loadSave(save);
    next.grip = true;
    return next;
  }
  // A brand-new student sees how to hold the mouse and keyboard before the stations.
  // Anyone who already earned a sticker, or who was moved ahead, is not sent back.
  function gripNeeded(save) {
    return !!(save && save.grip !== true && stickerCount(save) === 0 && (save.unlocked | 0) <= 1);
  }
  // Bit 1 is the F bump (ب), bit 2 is the J bump (ت). Any other key is not a hit.
  function bumpPress(bits, code) {
    var next = bits | 0;
    if (code === 'KeyF') next |= 1;
    else if (code === 'KeyJ') next |= 2;
    else return { bits: next, done: next === 3, hit: false };
    return { bits: next, done: next === 3, hit: true };
  }
  function markDone(save, id) {
    var next = loadSave(save);
    var i = stationIndex(id);
    if (i < 0) return next;
    next.done[id] = true;
    next.unlocked = Math.min(STATIONS.length + 1, Math.max(next.unlocked, i + 2));
    return next;
  }
  function jumpTo(save, id) {
    var next = loadSave(save);
    var i = stationIndex(id);
    if (i < 0) return next;
    next.unlocked = Math.max(next.unlocked, i + 1);
    return next;
  }
  function isOpen(save, id) {
    var i = stationIndex(id);
    return i >= 0 && !!save && i < save.unlocked;
  }
  function stickerCount(save) {
    var n = 0;
    for (var i = 0; i < STATIONS.length; i++) if (save && save.done && save.done[STATIONS[i].id]) n++;
    return n;
  }
  function allDone(save) {
    return stickerCount(save) === STATIONS.length;
  }
  function noteSuccess(progress, goal) {
    var n = (progress | 0) + 1;
    if (n < 1) n = 1;
    if (n > goal) n = goal;
    return { progress: n, complete: n >= goal };
  }
  function hintDue(idleMs, waitMs) {
    return idleMs >= (waitMs == null ? 5000 : waitMs);
  }
  // A second press on the same target inside the window opens it. A late press
  // becomes the first of a new pair — never a mistake.
  function doubleClick(lastTime, now, windowMs) {
    var span = windowMs == null ? 800 : windowMs;
    if (typeof lastTime === 'number' && typeof now === 'number' && now >= lastTime && now - lastTime <= span) {
      return { opened: true, time: null };
    }
    return { opened: false, time: typeof now === 'number' ? now : null };
  }
  function scriptOf(key) {
    var text = String(key == null ? '' : key);
    if (/[ء-ي]/.test(text)) return 'ar';
    if (/^[a-zA-Z]$/.test(text)) return 'en';
    return 'other';
  }
  function acceptKey(expectedCode, eventCode) {
    return !!expectedCode && expectedCode === eventCode;
  }
  // The big key label is Arabic. A Latin character means the OS layout is
  // English; the physical key (event.code) still counts.
  function languageHint(code, eventKey) {
    if (!AR[code]) return '';
    if (scriptOf(eventKey) !== 'en') return '';
    return 'لوحة المفاتيح بالإنجليزية. انظر الحرف الصغير.';
  }
  function dropHits(x, y, rect, slop) {
    if (!rect || !isFinite(x) || !isFinite(y)) return false;
    var pad = slop == null ? 64 : slop;
    return x >= rect.x - pad && x <= rect.x + rect.w + pad && y >= rect.y - pad && y <= rect.y + rect.h + pad;
  }
  // Reached once the friend has entered the view, including a fast flick past it.
  function friendReached(viewTop, viewHeight, friendTop, friendHeight) {
    if (!(viewHeight > 0) || !(friendHeight >= 0) || !isFinite(viewTop) || !isFinite(friendTop)) return false;
    return friendTop + friendHeight * 0.35 <= viewTop + viewHeight;
  }
  function balloonScale(index) {
    var n = index | 0;
    if (n < 0) n = 0;
    var scale = 1 - n * 0.14;
    return scale < 0.48 ? 0.48 : scale;
  }
  // The first try is the biggest and the most patient. Later tries shrink a little.
  function starRadius(index) {
    var n = index | 0;
    if (n < 0) n = 0;
    var radius = 112 - n * 10;
    return radius < 80 ? 80 : radius;
  }
  function doubleWindow(index) {
    var n = index | 0;
    if (n <= 0) return 1400;
    if (n === 1) return 1100;
    return 800;
  }
  function acceptName(value) {
    var name = cleanName(value);
    return { ok: name.length >= 1, name: name };
  }

  function mazeStart() {
    for (var y = 0; y < MAZE_ROWS.length; y++) {
      var x = MAZE_ROWS[y].indexOf('S');
      if (x >= 0) return { x: x, y: y, flags: 0, done: false };
    }
    return { x: 1, y: 1, flags: 0, done: false };
  }
  function mazeStep(state, code) {
    var next = { x: state.x, y: state.y, flags: state.flags | 0, done: !!state.done };
    var d = DIRS[code];
    if (!d || next.done) return next;
    var x = next.x + d[0], y = next.y + d[1];
    if (y < 0 || x < 0 || y >= MAZE_ROWS.length || x >= MAZE_ROWS[0].length) return next;
    var cell = MAZE_ROWS[y].charAt(x);
    if (cell === '#' || (cell === 'G' && next.flags < 3)) return next;
    next.x = x;
    next.y = y;
    if (cell === String(next.flags + 1)) next.flags += 1;
    if (cell === 'G' && next.flags >= 3) next.done = true;
    return next;
  }
  function mazeHint(state) {
    if (!state || state.done) return '';
    var want = String((state.flags | 0) + 1);
    var target = null;
    for (var y = 0; y < MAZE_ROWS.length && !target; y++) {
      for (var x = 0; x < MAZE_ROWS[y].length; x++) {
        var cell = MAZE_ROWS[y].charAt(x);
        if (cell === want || ((state.flags | 0) >= 3 && cell === 'G')) { target = { x: x, y: y }; break; }
      }
    }
    if (!target) return '';
    var dirs = [['ArrowRight', 1, 0], ['ArrowLeft', -1, 0], ['ArrowDown', 0, 1], ['ArrowUp', 0, -1]];
    var queue = [{ x: state.x, y: state.y, first: '' }];
    var seen = {};
    seen[state.x + ',' + state.y] = 1;
    while (queue.length) {
      var cur = queue.shift();
      if (cur.x === target.x && cur.y === target.y && cur.first) return cur.first;
      for (var i = 0; i < dirs.length; i++) {
        var nx = cur.x + dirs[i][1], ny = cur.y + dirs[i][2], key = nx + ',' + ny;
        if (seen[key] || ny < 0 || nx < 0 || ny >= MAZE_ROWS.length || nx >= MAZE_ROWS[0].length) continue;
        cell = MAZE_ROWS[ny].charAt(nx);
        if (cell === '#' || (cell === 'G' && (state.flags | 0) < 3)) continue;
        seen[key] = 1;
        queue.push({ x: nx, y: ny, first: cur.first || dirs[i][0] });
      }
    }
    return '';
  }

  function jumpStart() {
    return {
      x: 40, phase: 'run', jumps: 0, buffer: 0, hopT: 0, done: false, note: '',
      obstacles: [260, 520, 780], doorX: 920, speed: JUMP.speed
    };
  }
  function beginHop(w) {
    w.phase = 'hop';
    w.hopT = 0;
    w.jumps += 1;
    w.buffer = 0;
    return w;
  }
  function jumpCopy(world) {
    return {
      x: world.x, phase: world.phase, jumps: world.jumps, buffer: world.buffer, hopT: world.hopT,
      done: world.done, note: '', obstacles: world.obstacles, doorX: world.doorX, speed: world.speed
    };
  }
  // One step. Crossing a bush without Space waits in front of it. Space early,
  // late, or held still clears that bush. Enter opens the door only at the door.
  function jumpStep(world, dt, input) {
    var w = jumpCopy(world);
    input = input || {};
    dt = typeof dt === 'number' && dt > 0 ? Math.min(0.05, dt) : 0;
    if (w.done) return w;
    if (input.enter && w.phase !== 'door') w.note = 'later';
    if (input.space) w.buffer = JUMP.bufferTap;
    if (input.spaceHeld) w.buffer = Math.max(w.buffer, 0.35);
    if (w.phase === 'door') {
      if (input.enter) { w.done = true; w.note = ''; }
      return w;
    }
    if (w.phase === 'wait') {
      if (w.buffer > 0) w = beginHop(w);
      else w.buffer = Math.max(0, w.buffer - dt);
      if (input.enter && w.phase === 'door') { w.done = true; w.note = ''; }
      return w;
    }
    if (w.phase === 'hop') {
      w.hopT += dt;
      w.x += w.speed * dt;
      var cleared = w.obstacles[w.jumps - 1] + JUMP.clearGap;
      if (w.hopT >= JUMP.hopTime && w.x >= cleared) { w.phase = 'run'; w.hopT = 0; }
      if (w.jumps >= w.obstacles.length && w.x >= w.doorX - 36) {
        w.phase = 'door';
        w.x = w.doorX - 36;
      }
      if (input.enter && w.phase === 'door') { w.done = true; w.note = ''; }
      return w;
    }
    w.buffer = Math.max(0, w.buffer - dt);
    var next = w.obstacles[w.jumps];
    var nx = w.x + w.speed * dt;
    if (next != null) {
      var stop = next - JUMP.stopGap;
      if (w.x <= stop && nx >= stop) {
        w.x = stop;
        if (w.buffer > 0) w = beginHop(w);
        else w.phase = 'wait';
        if (input.enter && w.phase === 'door') { w.done = true; w.note = ''; }
        return w;
      }
    }
    if (w.jumps >= w.obstacles.length && nx >= w.doorX - 36) {
      w.phase = 'door';
      w.x = w.doorX - 36;
    } else w.x = nx;
    if (input.enter && w.phase === 'door') { w.done = true; w.note = ''; }
    return w;
  }

  var api = {
    STATIONS: STATIONS,
    DOUBLE_MS: 800,
    HINT_MS: 5000,
    DROP_SLOP: 64,
    STAR_R: 84,
    LETTERS: LETTERS,
    HOME_LEFT: HOME_LEFT,
    HOME_RIGHT: HOME_RIGHT,
    FINGER_OF: FINGER_OF,
    KEY_ROWS: KEY_ROWS,
    AR: AR,
    EN: EN,
    MAZE_ROWS: MAZE_ROWS,
    freshSave: freshSave,
    loadSave: loadSave,
    markDone: markDone,
    jumpTo: jumpTo,
    isOpen: isOpen,
    stationIndex: stationIndex,
    stationById: stationById,
    stickerCount: stickerCount,
    allDone: allDone,
    noteSuccess: noteSuccess,
    hintDue: hintDue,
    doubleClick: doubleClick,
    scriptOf: scriptOf,
    acceptKey: acceptKey,
    languageHint: languageHint,
    dropHits: dropHits,
    friendReached: friendReached,
    balloonScale: balloonScale,
    starRadius: starRadius,
    doubleWindow: doubleWindow,
    cleanName: cleanName,
    acceptName: acceptName,
    markGrip: markGrip,
    gripNeeded: gripNeeded,
    bumpPress: bumpPress,
    mazeStart: mazeStart,
    mazeStep: mazeStep,
    mazeHint: mazeHint,
    jumpStart: jumpStart,
    jumpStep: jumpStep
  };
  window.MKA = api;
})();
