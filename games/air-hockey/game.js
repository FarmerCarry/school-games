/*
 * Air Hockey (هوكي الهواء): the UI layer. It owns the screens, input, saving, Kit
 * telemetry and DDA; the pure engine (engine.js), the CPU brain (ai.js) and the data
 * (data.js) never touch Kit or the DOM. scene.js draws the 3D table with three.js.
 *
 * Kit.dda slides each ladder opponent's skill between its lo and hi for the children on
 * this PC; every finished match against the CPU reports one result.
 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var E = window.AHEngine, AI = window.AHAI, D = window.AHData;
  var W = 1280, H = 720;
  var canvas = $('game'), ui = $('ui'), ghostEl = $('ghost'), countEl = $('count');
  var calm = function () { return Kit.motion.reduced(); };
  var view = null, soft = false, contextLost = false;
  var fit = Kit.fit(canvas, W, H, { webgl: true, maxDpr: 1.5, onResize: function (v) {
    ui.style.left = canvas.style.left; ui.style.top = canvas.style.top; ui.style.transform = 'scale(' + v.scale + ')';
    if (view) view.resize(Math.round(W * v.scale), Math.round(H * v.scale));
  } });
  var ptr = Kit.pointer(fit);
  function sfx(name, a) { var J = Kit.juice; if (J && J[name]) J[name](a); }

  /* ---------------------------------------------------------------- save */
  var store = Kit.store('air-hockey');
  var saveStatus = Kit.saveStatus({ retry: persist });
  function int(v, lo, hi, d) { v = Math.floor(+v); return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; }
  function loadSave(raw) {
    raw = raw && typeof raw === 'object' ? raw : {};
    var s = { stars: int(raw.stars, 0, 9999, 0), open: int(raw.open, 1, D.LADDER.length, 1), best: [], pick: 0, m: 0, p: 0, t: 0, played: int(raw.played, 0, 1e6, 0) };
    for (var i = 0; i < D.LADDER.length; i++) s.best.push(int(raw.best && raw.best[i], 0, 3, 0));
    s.pick = int(raw.pick, 0, s.open - 1, 0);
    s.m = int(raw.m, 0, D.MALLETS.length - 1, 0); if (D.MALLETS[s.m].need > s.stars) s.m = 0;
    s.p = int(raw.p, 0, D.PUCKS.length - 1, 0); if (D.PUCKS[s.p].need > s.stars) s.p = 0;
    s.t = int(raw.t, 0, D.TABLES.length - 1, 0); if (D.TABLES[s.t].need > s.stars) s.t = 0;
    return s;
  }
  var save = loadSave(store.get('v2', null));
  function persist() {
    if (store.set('v2', save) === false) { saveStatus.failed(); return false; }
    saveStatus.saved();
    return true;
  }
  var dda = Kit.dda('air-hockey', { id: 'cpu', tiers: 5 });

  /* --------------------------------------------------------------- state */
  var screen = 'title', mode = 'demo', opp = 0, world = null, brains = [null, null];
  var controls = [{ x: 0, y: 0, spd: 0 }, { x: 0, y: 0, spd: 0 }];
  var ts = 1, hitStop = 0, winSlow = 0, vdt = 0, vt = 0, introFirst = false, countShown = -1;
  var mouseOn = false, keyMode = false, idleT = 0, moved = false, ghostDone = false, strongCd = 0;
  var lastRender = 0, result = null, shownScore = [-1, -1], badgeText = ['', ''], mpShown = false;
  var tmpPick = { x: 0, y: 0 }, tmpProj = { x: 0, y: 0 };
  var SCREENS = { title: 'scrTitle', pause: 'scrPause', result: 'scrResult', skins: 'scrSkins' };
  var KEYS1 = { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'] };
  var KEYS2 = { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'] };
  var KEYS_ALL = { up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'] };
  var MOVE_CODES = { KeyW: 1, KeyA: 1, KeyS: 1, KeyD: 1, ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1 };
  var POWER_NAMES = { multi: 'أقراص كثيرة!', big: 'مضرب عملاق!', mini: 'مرمى صغير!' };
  var BADGE_NAMES = { big: 'مضرب عملاق', mini: 'مرمى صغير' };
  var PRAISE = ['هدف!', 'رائع!', 'ممتاز!', 'هدف!'];

  function duo() { return mode === 'duo'; }
  function playerLook() { return D.MALLETS[save.m]; }
  function duoLook() { return save.m === 3 || save.m === 5 ? D.MALLETS[1] : { color: '#ff4f5e', dark: '#b31f2e', acc: '' }; }
  function lookOf(side) {
    if (side === 0) return playerLook();
    if (mode === 'duo') return duoLook();
    return D.LADDER[opp];
  }
  function nameOf(side) {
    if (mode === 'duo') return side === 0 ? 'اللاعب 1' : 'اللاعب 2';
    return side === 0 ? 'أنت' : D.LADDER[opp].name;
  }

  /* --------------------------------------------------------------- faces */
  // A little portrait of a mallet: the same face and accessory as the 3D one.
  var ACC = {
    bow: '<path d="M14 -44 L34 -54 L30 -34 Z M14 -44 L-4 -56 L0 -36 Z" fill="#ff4fb4" stroke="#1c2250" stroke-width="4" stroke-linejoin="round"/><circle cx="14" cy="-44" r="6" fill="#ffd1ea" stroke="#1c2250" stroke-width="4"/>',
    ears: '<path d="M-38 -22 L-34 -58 L-10 -40 Z M38 -22 L34 -58 L10 -40 Z" fill="DARK" stroke="#1c2250" stroke-width="4" stroke-linejoin="round"/>',
    antenna: '<path d="M0 -42 L0 -60" stroke="#1c2250" stroke-width="5"/><circle cx="0" cy="-63" r="8" fill="#ffd23f" stroke="#1c2250" stroke-width="4"/>',
    band: '<path d="M-42 -22 Q0 -36 42 -22 L41 -12 Q0 -26 -41 -12 Z" fill="#1c2250"/><path d="M38 -18 L56 -26 L52 -10 Z" fill="#1c2250"/>',
    crown: '<path d="M-26 -36 L-30 -62 L-14 -48 L0 -66 L14 -48 L30 -62 L26 -36 Z" fill="#ffd23f" stroke="#1c2250" stroke-width="4" stroke-linejoin="round"/>',
    horns: '<path d="M-26 -36 Q-40 -50 -34 -66 Q-22 -50 -12 -42 Z M26 -36 Q40 -50 34 -66 Q22 -50 12 -42 Z" fill="#fff3c2" stroke="#1c2250" stroke-width="4" stroke-linejoin="round"/>',
    halo: '<ellipse cx="0" cy="-58" rx="26" ry="8" fill="none" stroke="#ffd23f" stroke-width="7"/>'
  };
  function faceSVG(look, mood) {
    var acc = ACC[look.acc] ? ACC[look.acc].replace('DARK', look.dark) : '';
    var mouth = mood === 'sad' ? '<path d="M-12 22 Q0 12 12 22" fill="none" stroke="#1c2250" stroke-width="5" stroke-linecap="round"/>'
      : '<path d="M-14 14 Q0 28 14 14" fill="#1c2250" stroke="#1c2250" stroke-width="4" stroke-linejoin="round"/>';
    return '<svg viewBox="-60 -72 120 132" aria-hidden="true">' + acc +
      '<circle cx="0" cy="0" r="44" fill="' + look.dark + '" stroke="#1c2250" stroke-width="5"/>' +
      '<circle cx="0" cy="-5" r="36" fill="' + look.color + '"/>' +
      '<ellipse cx="-14" cy="-22" rx="12" ry="6" fill="#fff" opacity=".45"/>' +
      '<ellipse cx="-14" cy="-4" rx="9" ry="11" fill="#fff" stroke="#1c2250" stroke-width="3"/><ellipse cx="14" cy="-4" rx="9" ry="11" fill="#fff" stroke="#1c2250" stroke-width="3"/>' +
      '<circle cx="-12" cy="-2" r="5" fill="#1c2250"/><circle cx="16" cy="-2" r="5" fill="#1c2250"/>' +
      '<circle cx="-26" cy="12" r="6" fill="#ff7eb6" opacity=".7"/><circle cx="26" cy="12" r="6" fill="#ff7eb6" opacity=".7"/>' +
      mouth + '</svg>';
  }
  function setFace(id, look, mood) { $(id).innerHTML = faceSVG(look, mood); }
  var STAR = '<svg aria-hidden="true"><use href="#i-star"/></svg>';
  var LOCK = '<svg class="lk" aria-hidden="true"><use href="#i-lock"/></svg>';

  /* -------------------------------------------------------------- popups */
  var pops = [], popAt = 0;
  for (var pi = 0; pi < 8; pi++) {
    var pe = document.createElement('div');
    pe.className = 'pop'; pe.hidden = true; $('pops').appendChild(pe);
    pops.push({ el: pe, timer: 0 });
  }
  // Text that pops up at a stage point (1280x720) and is removed by a timer.
  function popup(text, x, y, color, big) {
    var p = pops[popAt]; popAt = (popAt + 1) % pops.length;
    clearTimeout(p.timer);
    p.el.textContent = text;
    p.el.className = 'pop' + (big ? ' big' : '');
    p.el.style.left = Math.round(Math.max(120, Math.min(W - 120, x))) + 'px';
    p.el.style.top = Math.round(Math.max(90, Math.min(H - 40, y))) + 'px';
    p.el.style.color = color || '#fff';
    p.el.hidden = false;
    void p.el.offsetWidth;
    p.timer = setTimeout(function () { p.el.hidden = true; }, big ? 1300 : 900);
  }
  function popAtTable(text, x, y, color, big) {
    if (!view) return;
    view.project(x, y, 0.4, tmpProj);
    popup(text, tmpProj.x, tmpProj.y, color, big);
  }
  function announce(text) { $('live').textContent = text; }

  /* ------------------------------------------------------------- screens */
  function show(name) {
    screen = name;
    for (var k in SCREENS) $(SCREENS[k]).hidden = k !== name;
    $('hud').hidden = !(name === 'play' || name === 'pause');
    if (name !== 'play') { ghostEl.hidden = true; $('vs').hidden = true; countEl.textContent = ''; }
    document.body.classList.toggle('hide-cursor', name === 'play' && mouseOn);
  }

  function buildLadder() {
    var box = $('ladder');
    box.textContent = '';
    D.LADDER.forEach(function (L, i) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'foe' + (i === save.pick ? ' on' : '');
      var open = i < save.open;
      b.disabled = !open;
      b.setAttribute('aria-label', open ? L.name : 'مقفل');
      b.setAttribute('aria-pressed', String(i === save.pick));
      var stars = '';
      if (open) { stars = '<div class="won">'; for (var s = 0; s < 3; s++) stars += STAR.replace('<svg', '<svg class="' + (s < save.best[i] ? '' : 'off') + '"'); stars += '</div>'; }
      b.innerHTML = '<div class="face">' + faceSVG(L) + '</div>' + (open ? stars : LOCK);
      b.addEventListener('click', function () { if (i < save.open) choose(i); });
      box.appendChild(b);
    });
  }
  function choose(i) {
    if (i === save.pick) return;
    save.pick = i; persist();
    sfx('select');
    opp = i;
    buildLadder();
    if (view && screen === 'title') view.setLook(1, D.LADDER[i]);
  }
  function paintStars() { $('titleStars').querySelector('b').textContent = Kit.fmt(save.stars); $('skinStars').querySelector('b').textContent = Kit.fmt(save.stars); }

  function demoWorld() {
    world = E.create({ target: 99, powerUps: true, seed: (Math.random() * 1e9) | 0, firstServe: 0.8, serveSide: Math.random() < 0.5 ? 0 : 1 });
    brains = [AI.create(0, 0.55, 3), AI.create(1, 0.5, 7)];
  }
  function toTitle() {
    mode = 'demo'; opp = save.pick;
    demoWorld();
    if (view) { view.setLook(0, playerLook()); view.setLook(1, D.LADDER[opp]); view.fx.clear(); view.snapCamera(); }
    buildLadder(); paintStars();
    show('title');
  }

  /* --------------------------------------------------------------- match */
  function startMatch(m, k) {
    mode = m; opp = k == null ? save.pick : k;
    var L = D.LADDER[opp], target = m === 'duo' ? D.DUO_GOALS : L.goals;
    world = E.create({ target: target, powerUps: m === 'duo' || L.power, seed: (Math.random() * 1e9) | 0, firstServe: 2.6, serveSide: Math.random() < 0.5 ? 0 : 1, firstItem: 9 });
    brains = [null, null];
    if (m === 'cpu') {
      var skill = Kit.lerp(L.lo, L.hi, dda.level);
      brains[1] = AI.create(1, skill, (Math.random() * 1e9) | 0);
      Kit.stats.round('cpu' + (opp + 1));
    } else Kit.stats.round('duo');
    ts = 1; hitStop = 0; winSlow = 0; introFirst = true; countShown = -1; result = null;
    keyMode = false; mouseOn = false; idleT = 0; moved = false; strongCd = 0;
    shownScore = [-1, -1]; badgeText = ['', '']; mpShown = false;
    $('badge0').hidden = $('badge1').hidden = true; $('matchPoint').hidden = true;
    for (var s = 0; s < 2; s++) {
      setFace('face' + s, lookOf(s)); $('name' + s).textContent = nameOf(s);
      setFace('vsFace' + s, lookOf(s)); $('vsName' + s).textContent = nameOf(s);
      var pips = '';
      for (var i = 0; i < target; i++) pips += '<i></i>';
      $('pips' + s).innerHTML = pips;
    }
    if (view) { view.setLook(0, lookOf(0)); view.setLook(1, lookOf(1)); view.fx.clear(); view.snapCamera(); }
    paintScore(false);
    show('play');
    $('vs').hidden = false;
    sfx('whoosh', 0.6);
    announce(nameOf(0) + ' ضد ' + nameOf(1));
  }

  function paintScore(bump) {
    for (var s = 0; s < 2; s++) {
      var n = world.score[s];
      if (n === shownScore[s]) continue;
      shownScore[s] = n;
      var el = $('score' + s);
      el.textContent = n;
      if (bump && !calm()) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
      var pips = $('pips' + s).children;
      for (var i = 0; i < pips.length; i++) pips[i].className = i < n ? 'on' : '';
    }
  }

  function pause() {
    if (screen !== 'play') return;
    show('pause');
    sfx('back');
  }
  function resume() {
    if (screen !== 'pause') return;
    show('play');
    sfx('tap');
  }
  function restart() {
    Kit.stats.end('quit');
    startMatch(mode, opp);
  }
  function home() {
    if (screen === 'pause' || screen === 'play') Kit.stats.end('quit');
    sfx('back');
    toTitle();
  }

  function finishMatch() {
    var w = world, mine = w.score[0], theirs = w.score[1], won = w.winner === 0;
    var card = $('scrResult').querySelector('.card');
    var unlock = '';
    var stars = 0;
    if (mode === 'cpu') {
      stars = D.stars(mine, theirs, w.target);
      var before = unlockedCount();
      if (won) {
        save.stars += stars;
        save.best[opp] = Math.max(save.best[opp], stars);
        if (opp + 1 < D.LADDER.length && save.open < opp + 2) { save.open = opp + 2; unlock = 'خصم جديد: ' + D.LADDER[opp + 1].name + '!'; }
        if (opp + 1 < save.open) save.pick = opp + 1;
      }
      if (!unlock && unlockedCount() > before) unlock = 'ألوان جديدة!';
      save.played++;
      persist();
      dda.result(won ? 1 : Math.min(0.6, mine / w.target * 0.6));
      Kit.stats.end(won ? 'win' : 'lose', mine);
      $('resTitle').textContent = won ? 'فزت!' : 'حاول مرة أخرى!';
    } else {
      save.played++; persist();
      Kit.stats.end('end', Math.max(mine, theirs));
      $('resTitle').textContent = 'فاز ' + nameOf(w.winner) + '!';
    }
    var celebrate = won || mode === 'duo';
    card.className = 'card result' + (celebrate ? ' win' : '');
    setFace('resFace0', lookOf(0), mode === 'cpu' && !won ? 'sad' : '');
    setFace('resFace1', lookOf(1), mode === 'cpu' && won ? 'sad' : (mode === 'duo' && w.winner === 0 ? 'sad' : ''));
    $('resMine').textContent = mine; $('resTheirs').textContent = theirs;
    var starEls = $('resStars').children;
    $('resStars').style.display = mode === 'cpu' ? '' : 'none';
    for (var i = 0; i < 3; i++) starEls[i].setAttribute('class', i < stars ? 'on' : '');
    $('resUnlock').hidden = !unlock; $('resUnlock').textContent = unlock;
    $('btnNext').hidden = !(mode === 'cpu' && won && opp + 1 < save.open);
    result = { won: won, stars: stars };
    if (celebrate) {
      if (view) view.fx.confetti([lookOf(w.winner).color, '#ffd23f', '#ffffff', '#5ff2ff', '#ff4fb4']);
      Kit.sfx.win();
      for (var s = 0; s < stars; s++) (function (j) { setTimeout(function () { if (screen === 'result') sfx('star', j + 1); }, 450 + j * 250); })(s);
    } else sfx('fail');
    if (view) { view.mood(w.winner, 'happy', 99); view.mood(1 - w.winner, 'sad', 99); }
    announce($('resTitle').textContent + ' ' + mine + ' - ' + theirs);
    show('result');
  }
  function unlockedCount() {
    var n = 0;
    [D.MALLETS, D.PUCKS, D.TABLES].forEach(function (list) { list.forEach(function (it) { if (it.need <= save.stars) n++; }); });
    return n;
  }

  /* --------------------------------------------------------------- skins */
  var ROWS = [{ id: 'rowM', list: D.MALLETS, key: 'm' }, { id: 'rowP', list: D.PUCKS, key: 'p' }, { id: 'rowT', list: D.TABLES, key: 't' }];
  function swatchArt(row, it) {
    if (row.key === 'm') return '<div class="face">' + faceSVG(it) + '</div>';
    if (row.key === 'p') {
      var glow = it.glow === 'rainbow' ? 'conic-gradient(#ff4f5e,#ffd23f,#3ee39a,#3fa9ff,#b06cff,#ff4f5e)' : it.glow;
      return '<span style="position:absolute;inset:6px;border-radius:50%;background:' + glow + ';"></span><span style="position:absolute;inset:18px;border-radius:50%;background:' + it.color + ';border:3px solid #1c2250;"></span>';
    }
    return '<span style="position:absolute;inset:0;border-radius:50%;background:linear-gradient(135deg,' + it.top + ' 0 48%,' + it.line + ' 48% 54%,' + it.top2 + ' 54% 100%);box-shadow:inset 0 0 0 7px ' + it.rim + ';"></span>';
  }
  function buildSkins() {
    ROWS.forEach(function (row) {
      var box = $(row.id);
      box.textContent = '';
      row.list.forEach(function (it, i) {
        var b = document.createElement('button'), open = it.need <= save.stars;
        b.type = 'button'; b.className = 'sw' + (save[row.key] === i ? ' on' : '');
        b.style.background = row.key === 'm' ? '#fff' : '#1c2250';
        b.disabled = !open;
        b.setAttribute('aria-pressed', String(save[row.key] === i));
        b.setAttribute('aria-label', open ? String(i + 1) : 'مقفل: ' + it.need + ' نجمة');
        b.innerHTML = swatchArt(row, it) + (open ? '' : '<div class="lk"><svg aria-hidden="true"><use href="#i-lock"/></svg><span>' + it.need + STAR + '</span></div>');
        b.addEventListener('click', function () {
          if (it.need > save.stars || save[row.key] === i) return;
          save[row.key] = i; persist(); sfx('select');
          applySkins(); buildSkins();
          var btn = $(row.id).children[i]; if (btn) btn.focus();
        });
        box.appendChild(b);
      });
    });
  }
  function applySkins() {
    if (!view) return;
    view.setLook(0, playerLook());
    view.setPuck(D.PUCKS[save.p]);
    view.setTable(D.TABLES[save.t]);
  }
  function toSkins() {
    mode = 'skins';
    world = E.create({ target: 99, powerUps: false, seed: 5, firstServe: 1e9 });
    world.mallets[0].x = world.mallets[0].px = -95; world.mallets[0].y = world.mallets[0].py = 345;
    world.pucks[0].x = 5; world.pucks[0].y = 300;
    brains = [null, null];
    buildSkins(); paintStars();
    if (view) { view.setLook(0, playerLook()); view.fx.clear(); }
    show('skins');
    sfx('select');
  }

  /* --------------------------------------------------------------- input */
  function axis(keys) {
    var dx = (Kit.keys.anyDown(keys.right) ? 1 : 0) - (Kit.keys.anyDown(keys.left) ? 1 : 0);
    var dy = (Kit.keys.anyDown(keys.down) ? 1 : 0) - (Kit.keys.anyDown(keys.up) ? 1 : 0);
    return { dx: dx, dy: dy };
  }
  function readPlayer(s, out) {
    var m = world.mallets[s];
    var a = axis(duo() ? (s === 0 ? KEYS1 : KEYS2) : KEYS_ALL);
    out.x = m.x; out.y = m.y; out.spd = 1100;
    if (a.dx || a.dy) {
      var l = Math.sqrt(a.dx * a.dx + a.dy * a.dy);
      out.x = m.x + a.dx / l * 400; out.y = m.y + a.dy / l * 400;
      if (s === 0) { keyMode = true; noteMove(); }
      return;
    }
    if (s === 0 && mouseOn && !keyMode && view && view.pick(ptr.x, ptr.y, tmpPick)) {
      out.x = tmpPick.x; out.y = tmpPick.y; out.spd = 3000;
    }
  }
  function noteMove() {
    if (moved) return;
    moved = true;
    if (!ghostEl.hidden) { ghostEl.hidden = true; Kit.stats.tutorial('done'); ghostDone = true; }
  }
  window.addEventListener('pointermove', function () {
    if (screen !== 'play') return;
    if (!mouseOn || keyMode) { mouseOn = true; keyMode = false; document.body.classList.add('hide-cursor'); }
    noteMove();
  });
  window.addEventListener('keydown', function (e) {
    if (!Kit.isGameKeyEvent(e)) return;
    var c = e.code;
    if (screen === 'play') {
      if (c === 'Escape' || c === 'KeyP') { e.preventDefault(); pause(); }
      return;
    }
    if (e.repeat) return;
    if (screen === 'pause') {
      if (c === 'Escape' || c === 'KeyP' || c === 'Enter' || c === 'Space') { e.preventDefault(); resume(); }
      else if (c === 'KeyR') restart();
    } else if (screen === 'title') {
      if (c === 'Enter' || c === 'Space') { e.preventDefault(); sfx('tap'); startMatch('cpu', save.pick); }
      else if (c === 'ArrowRight' || c === 'ArrowLeft') { var n = save.pick + (c === 'ArrowRight' ? 1 : -1); if (n >= 0 && n < save.open) choose(n); }
    } else if (screen === 'result') {
      if (c === 'Enter' || c === 'Space' || c === 'KeyR') { e.preventDefault(); again(); }
      else if (c === 'KeyN' && !$('btnNext').hidden) next();
      else if (c === 'Escape') home();
    } else if (screen === 'skins') {
      if (c === 'Escape') { e.preventDefault(); sfx('back'); toTitle(); }
    }
  });
  function again() { sfx('tap'); startMatch(mode === 'duo' ? 'duo' : 'cpu', opp); }
  function next() { sfx('tap'); if (opp + 1 < save.open) { save.pick = opp + 1; persist(); startMatch('cpu', opp + 1); } }

  function blurIfMouse(fn) { return function (e) { fn(); if (e && e.detail > 0 && e.currentTarget) e.currentTarget.blur(); }; }
  $('btnPlay').addEventListener('click', blurIfMouse(function () { sfx('tap'); startMatch('cpu', save.pick); }));
  $('btnDuo').addEventListener('click', blurIfMouse(function () { sfx('tap'); startMatch('duo', save.pick); }));
  $('btnSkins').addEventListener('click', blurIfMouse(toSkins));
  $('btnSkinsBack').addEventListener('click', blurIfMouse(function () { sfx('back'); toTitle(); }));
  $('pauseBtn').addEventListener('click', blurIfMouse(pause));
  $('btnResume').addEventListener('click', blurIfMouse(resume));
  $('btnRestart').addEventListener('click', blurIfMouse(restart));
  $('btnHome').addEventListener('click', blurIfMouse(home));
  $('btnAgain').addEventListener('click', blurIfMouse(again));
  $('btnNext').addEventListener('click', blurIfMouse(next));
  $('btnResHome').addEventListener('click', blurIfMouse(home));

  /* -------------------------------------------------------------- update */
  function update(dt) {
    if (contextLost || screen === 'pause' || !world) { Kit.keys.endFrame(); ptr.endFrame(); return; }
    if (screen === 'play') updatePlay(dt);
    else updateMenu(dt);
    Kit.keys.endFrame(); ptr.endFrame();
  }

  function updateMenu(dt) {
    var w = world;
    if (screen === 'title') {
      AI.think(brains[0], w, dt, controls[0]);
      AI.think(brains[1], w, dt, controls[1]);
      E.step(w, dt, controls);
      if (w.phase === 'over' || w.t > 240) demoWorld();
    } else if (screen === 'skins') {
      controls[0].x = -95; controls[0].y = 345; controls[0].spd = 600;
      controls[1].x = w.mallets[1].x; controls[1].y = w.mallets[1].y; controls[1].spd = 600;
      E.step(w, dt, controls);
    } else {
      // Result: the winner's slow motion finishes, then the table rests.
      winSlow = Math.max(0, winSlow - dt);
      var k = winSlow > 0 && !calm() ? 0.3 : 1;
      E.step(w, dt * k, null);
      vdt += dt * k; vt += dt * k;
      return;
    }
    vdt += dt; vt += dt;
  }

  function updatePlay(dt) {
    var w = world, i;
    strongCd = Math.max(0, strongCd - dt);
    // Time: hit-stop on big hits, slow motion when a match-point puck is about to go in.
    var want = 1;
    if (winSlow > 0) { winSlow -= dt; want = 0.25; }
    else if (E.matchPoint(w) && w.phase === 'play' && E.incoming(w, 0.32) >= 0) want = 0.3;
    if (calm()) want = 1;
    ts += (want - ts) * Math.min(1, dt * 14);
    var sim = dt * ts;
    if (hitStop > 0) { hitStop -= dt; sim = 0; }

    readPlayer(0, controls[0]);
    if (brains[1]) { if (sim > 0) AI.think(brains[1], w, sim, controls[1]); }
    else readPlayer(1, controls[1]);
    if (sim > 0) {
      E.step(w, sim, controls);
      for (i = 0; i < w.events.length; i++) onEvent(w.events[i]);
    }
    vdt += sim; vt += sim;
    if (screen !== 'play') return; // the match just ended

    // Intro: the VS banner, then 3-2-1.
    if (introFirst && w.phase === 'serve') {
      var left = w.phaseT, n = left > 1.5 ? 0 : left > 1.0 ? 3 : left > 0.5 ? 2 : 1;
      $('vs').hidden = left <= 1.5;
      if (n && n !== countShown) {
        countShown = n; countEl.textContent = n;
        countEl.classList.remove('tick'); void countEl.offsetWidth; countEl.classList.add('tick');
        sfx('countdown', n);
      }
    }
    // The wordless coach: after a few idle seconds, show how to move.
    if (!moved && !introFirst && !ghostDone) {
      idleT += dt;
      if (idleT > 2.5 && ghostEl.hidden) { ghostEl.hidden = false; Kit.stats.tutorial('start'); }
    }
    paintBadges();
  }

  function paintBadges() {
    var w = world;
    for (var s = 0; s < 2; s++) {
      var parts = [];
      if (w.mallets[s].bigT > 0) parts.push(BADGE_NAMES.big + ' ' + Math.ceil(w.mallets[s].bigT));
      if (w.goals[s].miniT > 0) parts.push(BADGE_NAMES.mini + ' ' + Math.ceil(w.goals[s].miniT));
      var text = parts.join(' · ');
      if (text === badgeText[s]) continue;
      badgeText[s] = text;
      var b = $('badge' + s);
      b.hidden = !text; b.textContent = text;
    }
    var mp = E.matchPoint(w) && w.winner < 0;
    if (mp !== mpShown) { mpShown = mp; $('matchPoint').hidden = !mp; }
  }

  function colorOf(side) { return lookOf(side).color; }
  function onEvent(ev) {
    var w = world;
    switch (ev.type) {
      case 'hit': {
        var power = Math.max(0.12, Math.min(1, ev.b / 2200));
        sfx('impact', power);
        if (view) { view.fx.hit(ev.c, ev.d, power, colorOf(ev.a)); view.squash(ev.a, power); }
        if (power > 0.7 && !calm()) hitStop = 0.04;
        if (power > 0.8 && strongCd <= 0 && (ev.a === 0 || duo())) { strongCd = 2; popAtTable('قوية!', ev.c, ev.d, '#ffd23f'); }
        break;
      }
      case 'wall':
        sfx('land', Math.max(0.1, Math.min(0.6, ev.a / 2500)));
        if (view) view.fx.wall(ev.b, ev.c, Math.min(1, ev.a / 2000), '#ffffff');
        break;
      case 'post':
        sfx('chime', 1);
        if (view) view.fx.wall(ev.b, ev.c, 1, '#ffd23f');
        break;
      case 'goal': {
        var scorer = ev.a, into = 1 - scorer, final = w.winner >= 0;
        if (view) {
          view.fx.goal(into, ev.b, colorOf(scorer), final || E.matchPoint(w));
          view.mood(scorer, 'happy', 1.6); view.mood(into, 'sad', 1.6);
        }
        sfx('chime', final ? 3 : 2);
        if (final) Kit.sfx.boom();
        paintScore(true);
        var text = final ? (mode === 'cpu' ? (scorer === 0 ? 'فزت!' : 'أوه!') : 'فوز!') : (mode === 'cpu' && scorer === 1 ? 'أوه!' : PRAISE[(w.score[scorer] - 1) % PRAISE.length]);
        popAtTable(text, ev.b, into === 0 ? E.T.HL - 60 : -E.T.HL + 60, colorOf(scorer), true);
        if (mode === 'cpu') { if (scorer === 0) Kit.track.hit(); else Kit.track.miss(); }
        if (final) winSlow = 1.0;
        announce(nameOf(scorer) + ': هدف! ' + w.score[0] + ' - ' + w.score[1]);
        break;
      }
      case 'power':
        sfx('levelUp');
        if (view) view.fx.power(ev.c, ev.d, ev.a);
        popAtTable(POWER_NAMES[ev.a] || '', ev.c, ev.d, '#ff4fb4');
        if (view) view.mood(ev.b, 'o', 1);
        break;
      case 'item':
        sfx('pop', 0.6);
        break;
      case 'go':
        if (introFirst) {
          introFirst = false; countEl.textContent = ''; $('vs').hidden = true; countShown = -1;
          sfx('countdown', 0);
          popup('انطلق!', W / 2, 330, '#3ddc84', true);
          idleT = 0;
        } else sfx('whoosh', 0.4);
        break;
      case 'over':
        finishMatch();
        break;
    }
  }

  /* -------------------------------------------------------------- render */
  function render() {
    if (!view || contextLost) return;
    var now = performance.now(), first = !lastRender, ms = first ? 16 : now - lastRender;
    // Software WebGL: menus redraw at about 15 frames a second so the page stays responsive.
    if (soft && screen !== 'play' && !first && ms < 62) return;
    lastRender = now;
    view.calm = calm();
    view.update({ w: world, mode: screen === 'title' ? 'title' : screen === 'skins' ? 'skins' : screen === 'result' ? 'result' : 'play', duo: duo(), t: vt, dt: Math.min(0.1, vdt) });
    vdt = 0;
    view.render();
    if (!ghostEl.hidden && world) {
      var m = world.mallets[0];
      view.project(m.x, m.y - 30, 0.9, tmpProj);
      ghostEl.style.left = Math.round(tmpProj.x) + 'px'; ghostEl.style.top = Math.round(Math.max(150, tmpProj.y - 20)) + 'px';
    }
    if (screen === 'play' && view.frameTime(ms)) fit.resize();
  }

  /* ------------------------------------------------------------- snapshot */
  function r1(v) { return Math.round(v * 10) / 10; }
  function snapshot() {
    var w = world;
    return {
      screen: screen, paused: screen === 'pause', demo: screen === 'title' || screen === 'skins', mode: mode, opp: opp,
      phase: w ? w.phase : '', score: w ? w.score.slice() : [0, 0], target: w ? w.target : 0,
      pucks: w ? w.pucks.filter(function (p) { return p.alive; }).map(function (p) { return [r1(p.x), r1(p.y)]; }) : [],
      mallets: w ? w.mallets.map(function (m) { return [r1(m.x), r1(m.y)]; }) : [],
      item: w && w.item.alive ? w.item.kind : '', t: w ? Math.round(w.t * 1000) / 1000 : 0,
      stars: save.stars, open: save.open, best: save.best.slice(), pick: save.pick, skins: [save.m, save.p, save.t],
      ghost: !ghostEl.hidden, timeScale: Math.round(ts * 100) / 100, result: result ? { won: result.won, stars: result.stars } : null,
      soft: soft
    };
  }
  function page(x, y) {
    var r = canvas.getBoundingClientRect();
    return { x: r.left + x * fit.scale, y: r.top + y * fit.scale };
  }

  /* ---------------------------------------------------------------- init */
  function detectSoft() {
    try {
      var c = document.createElement('canvas'), gl = c.getContext('webgl');
      if (!gl) return false;
      var ext = gl.getExtension('WEBGL_debug_renderer_info');
      var name = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
      var lose = gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
      return /swiftshader|llvmpipe|software|basic render/i.test(name);
    } catch (e) { return false; }
  }

  Kit.muteButton();
  Kit.lifecycle({ pause: pause, reset: function () { keyMode = false; } });
  canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); contextLost = true; pause(); $('contextNotice').hidden = false; });
  canvas.addEventListener('webglcontextrestored', function () { contextLost = false; $('contextNotice').hidden = true; applySkins(); fit.resize(); });
  var loop = null;
  try {
    soft = detectSoft();
    view = AHScene.create(canvas, { T: E.T, soft: soft });
    view.calm = calm();
    applySkins();
    fit.resize();
    toTitle();
    window.__game = {
      state: snapshot,
      get world() { return world; },
      get view() { return view; },
      get save() { return JSON.parse(JSON.stringify(save)); },
      // Page coordinates of a stage point (1280x720) or of a table point (engine units).
      point: page,
      tablePoint: function (x, y) { view.project(x, y, 0, tmpProj); return page(tmpProj.x, tmpProj.y); },
      render: function () { lastRender = 0; render(); },
      drawCalls: function () { return view.info().calls; }
    };
    view.compile();
    render();
    if (soft) { try { view.renderer.getContext().finish(); } catch (e) { /* ignore */ } }
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
