/* Hoop Heads - screens, menus, game flow, main loop and debug hook. */
(function () {
  'use strict';
  var HH = window.HH, S = HH.sfx, W = HH.W, H = HH.H;
  var save = HH.save, CH = HH.CHARS;
  var $ = function (id) { return document.getElementById(id); };

  var canvas = $('game'), ui = $('ui');
  function placeUI(v) {
    ui.style.transform = 'translate(' + canvas.style.left + ',' + canvas.style.top + ') scale(' + v.scale + ')';
  }
  var view = Kit.fit(canvas, W, H, { onResize: placeUI });
  var ctx = view.ctx;
  Kit.muteButton();

  var state = 'title', match = null, demo = null, cfg = null, tour = null;
  var confirmFrom = null, confirmYes = null, resultPrimary = null;
  var scorePop = [0, 0], youT = 0, uiT = 0, demoT = 0;
  var SCREENS = ['scrTitle', 'scrSelect', 'scrCups', 'scrLadder', 'scrShop', 'scrPause', 'scrConfirm', 'scrResult', 'scrTrophy'];

  function show(id) {
    SCREENS.forEach(function (s) { $(s).hidden = s !== id; });
    $('pauseBtn').hidden = !(state === 'play');
    clearFocus();
  }
  function persist() { HH.persist(); }
  function toast(msg) {
    var t = $('toast'); t.textContent = msg; t.hidden = false;
    t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
    clearTimeout(toast.h); toast.h = setTimeout(function () { t.hidden = true; }, 1900);
  }
  function unlockedChars() { return CH.filter(HH.isUnlocked); }
  function randomOpp(not) {
    var pool = CH.filter(function (c) { return !c.secret && c.id !== not; });
    return Kit.pick(pool).id;
  }

  // Space/Enter must not also "click" a focused DOM button (we handle keys ourselves).
  window.addEventListener('keydown', function (e) {
    if ((e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') && e.target && e.target.tagName === 'BUTTON') e.preventDefault();
  }, true);
  ui.addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) b.blur(); });

  /* -------------------------------------------------------- keyboard nav */
  var focusEl = null;
  function clearFocus() { if (focusEl) focusEl.classList.remove('kfocus'); focusEl = null; }
  function setFocus(el) { clearFocus(); focusEl = el; if (el) el.classList.add('kfocus'); }
  function navList(root) {
    return Array.prototype.filter.call(root.querySelectorAll('.nav'), function (el) { return el.offsetParent !== null && !el.disabled; });
  }
  function moveFocus(root, dx, dy) {
    var list = navList(root);
    if (!list.length) return;
    if (!focusEl || list.indexOf(focusEl) < 0) { setFocus(root.querySelector('.nav.def') && navList(root).indexOf(root.querySelector('.nav.def')) >= 0 ? root.querySelector('.nav.def') : list[0]); S.move(); return; }
    var r = focusEl.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    var best = null, bs = 1e9;
    list.forEach(function (el) {
      if (el === focusEl) return;
      var q = el.getBoundingClientRect(), x = q.left + q.width / 2 - cx, y = q.top + q.height / 2 - cy;
      var along = x * dx + y * dy, side = Math.abs(x * dy) + Math.abs(y * dx);
      if (along <= 4) return;
      var sc = along + side * 2.2;
      if (sc < bs) { bs = sc; best = el; }
    });
    if (best) { setFocus(best); S.move(); }
  }
  function navKeys(root, onEnter, onBack) {
    var K = Kit.keys;
    if (K.anyPressed(['ArrowUp', 'KeyW'])) moveFocus(root, 0, -1);
    if (K.anyPressed(['ArrowDown', 'KeyS'])) moveFocus(root, 0, 1);
    if (K.anyPressed(['ArrowLeft', 'KeyA'])) moveFocus(root, -1, 0);
    if (K.anyPressed(['ArrowRight', 'KeyD'])) moveFocus(root, 1, 0);
    if (K.anyPressed(['Enter', 'NumpadEnter', 'Space'])) {
      if (focusEl && root.contains(focusEl)) focusEl.click();
      else if (onEnter) onEnter();
    }
    if (K.pressed('Escape') && onBack) onBack();
  }

  /* ---------------------------------------------------------- drawing */
  function headCanvas(cv, ch, opts) {
    opts = opts || {};
    var c = cv.getContext('2d'), w = cv.width, h = cv.height;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, w, h);
    var r = w * (opts.rs || 0.29);
    HH.drawHead(c, ch, w / 2, h * 0.55, r, opts.facing || 1, { t: opts.t || 0, mood: opts.mood || 'normal', blink: false, lx: 0.3, ly: 0 });
    if (opts.locked) {
      c.globalCompositeOperation = 'source-atop';
      c.fillStyle = 'rgba(12,10,30,0.92)'; c.fillRect(0, 0, w, h);
      c.globalCompositeOperation = 'source-over';
      HH.text(c, '?', w / 2, h * 0.57, w * 0.35, '#ffd23f', 'center', { stroke: '#1d1235', sw: w * 0.04 });
    }
  }
  function drawTrophy(cv, color, locked, t) {
    var c = cv.getContext('2d'), w = cv.width, h = cv.height, A = HH.art;
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, w, h);
    c.save(); c.scale(w / 200, h / 200);
    if (!locked) {
      c.globalAlpha = 0.35; c.fillStyle = color;
      for (var i = 0; i < 10; i++) { c.save(); c.translate(100, 80); c.rotate(i * Math.PI / 5 + (t || 0) * 0.5); c.beginPath(); c.moveTo(0, 0); c.lineTo(-10, -95); c.lineTo(10, -95); c.closePath(); c.fill(); c.restore(); }
      c.globalAlpha = 1;
    }
    var col = locked ? '#4a4766' : color;
    c.lineWidth = 6; c.strokeStyle = '#1d1235'; c.lineJoin = 'round';
    // handles
    c.beginPath(); c.arc(52, 70, 24, Math.PI * 0.5, Math.PI * 1.5); c.stroke();
    c.beginPath(); c.arc(148, 70, 24, -Math.PI * 0.5, Math.PI * 0.5); c.stroke();
    c.lineWidth = 12; c.strokeStyle = col;
    c.beginPath(); c.arc(52, 70, 24, Math.PI * 0.55, Math.PI * 1.45); c.stroke();
    c.beginPath(); c.arc(148, 70, 24, -Math.PI * 0.45, Math.PI * 0.45); c.stroke();
    // bowl
    c.beginPath(); c.moveTo(50, 36); c.lineTo(150, 36); c.quadraticCurveTo(150, 120, 100, 128); c.quadraticCurveTo(50, 120, 50, 36); c.closePath();
    var g = c.createLinearGradient(50, 0, 150, 0); g.addColorStop(0, locked ? '#5a5776' : '#fff'); g.addColorStop(0.35, col); g.addColorStop(1, locked ? '#34314d' : shade(color));
    c.fillStyle = g; c.fill(); c.lineWidth = 6; c.strokeStyle = '#1d1235'; c.stroke();
    // stem + base
    A.rr(c, 88, 126, 24, 26, 4); A.fs(c, col, 5);
    A.rr(c, 62, 150, 76, 20, 6); A.fs(c, col, 5);
    A.rr(c, 52, 168, 96, 20, 6); A.fs(c, locked ? '#2a2840' : '#6b3a1d', 5);
    // ball emblem
    if (!locked) { HH.drawBall(c, 100, 76, 20, 0.3, 'classic'); }
    else HH.text(c, '🔒', 100, 80, 40, '#fff', 'center');
    c.restore();
  }
  function shade(hex) {
    var n = parseInt(hex.slice(1), 16), r = (n >> 16) * 0.6, g = ((n >> 8) & 255) * 0.6, b = (n & 255) * 0.6;
    return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
  }
  HH.drawTrophy = drawTrophy;

  /* =================================================================== TITLE */
  var logoChars = ['robo', 'granny'];
  function showTitle() {
    state = 'title';
    show('scrTitle');
    $('tCoins').textContent = save.coins;
    $('tWins').textContent = save.stats.wins;
    $('tDunks').textContent = save.stats.dunks;
    $('tChars').textContent = unlockedChars().length + ' من ' + CH.length;
    var cups = $('tCups'); cups.innerHTML = '';
    HH.CUPS.forEach(function (cp) {
      var cv = document.createElement('canvas'); cv.width = 96; cv.height = 96; cv.title = cp.name;
      drawTrophy(cv, cp.color, !save.cups[cp.id], 0);
      cups.appendChild(cv);
    });
    var next = CH.filter(function (c) { return c.secret && !HH.isUnlocked(c); })[0];
    $('tNext').textContent = next ? ('🔒 ' + next.unlock.text + ' لتفتح «' + next.name + '»' + (HH.unlockProgress(next) ? ' (' + HH.unlockProgress(next) + ')' : '')) : 'فتحت كل الشخصيات! أنت أسطورة 🏆';
    var un = unlockedChars();
    logoChars = [Kit.pick(un).id, Kit.pick(un).id];
    if (!demo) newDemo();
  }
  function newDemo() {
    var un = unlockedChars();
    var a = Kit.pick(un), b = Kit.pick(un.filter(function (c) { return c !== a; }));
    demo = HH.newMatch({ mode: 'demo', p1: a.id, p2: b.id, lv: 1.8, lv1: 1.8 });
    demoT = 0;
  }
  Array.prototype.forEach.call(document.querySelectorAll('#mainMenu .mbtn'), function (b) {
    b.classList.add('nav');
    b.addEventListener('click', function () {
      S.click();
      var act = b.getAttribute('data-act');
      if (act === 'cpu' || act === 'duo') openSelect(act);
      else if (act === 'tour') openCups();
      else if (act === 'shop') openShop();
    });
  });
  function quickPlay() {
    var p1 = HH.isUnlocked(HH.charById(save.p1)) ? save.p1 : 'robo';
    startMatch({ mode: 'cpu', p1: p1, p2: randomOpp(p1), lv: save.diff, len: save.len, target: save.len <= 60 ? 11 : 21 });
  }

  /* ================================================================= SELECT */
  var sel = { mode: 'cpu', idx: [0, 1], ready: [false, false], startT: -1 };
  var grid = $('charGrid'), cards = [];
  CH.forEach(function (ch, i) {
    var b = document.createElement('button'); b.type = 'button'; b.className = 'cc';
    var cv = document.createElement('canvas'); cv.width = 132; cv.height = 132;
    var nm = document.createElement('div'); nm.className = 'nm';
    b.appendChild(cv); b.appendChild(nm);
    b.addEventListener('click', function () { cardClick(i); });
    b.addEventListener('dblclick', function () { if (sel.mode !== 'duo') selGo(); });
    grid.appendChild(b);
    cards.push({ el: b, cv: cv, nm: nm, ch: ch });
  });
  function refreshCards() {
    cards.forEach(function (cd, i) {
      var un = HH.isUnlocked(cd.ch);
      cd.el.classList.toggle('locked', !un);
      cd.nm.textContent = un ? cd.ch.name : '؟؟؟';
      cd.el.classList.toggle('s0', sel.idx[0] === i);
      cd.el.classList.toggle('s1', sel.mode === 'duo' && sel.idx[1] === i);
      var old = cd.el.querySelectorAll('.lock,.newb,.tag'); Array.prototype.forEach.call(old, function (e) { e.remove(); });
      if (!un) { var l = document.createElement('span'); l.className = 'lock'; l.textContent = '🔒'; cd.el.appendChild(l); }
      else if (cd.ch.secret && save.seen.indexOf(cd.ch.id) < 0) { var n = document.createElement('span'); n.className = 'newb'; n.textContent = 'جديد!'; cd.el.appendChild(n); }
      if (sel.idx[0] === i) { var t0 = document.createElement('span'); t0.className = 'tag t0'; t0.textContent = '1'; cd.el.appendChild(t0); }
      if (sel.mode === 'duo' && sel.idx[1] === i) { var t1 = document.createElement('span'); t1.className = 'tag t1'; t1.textContent = '2'; cd.el.appendChild(t1); }
      headCanvas(cd.cv, cd.ch, { locked: !un, t: uiT });
    });
    [0, 1].forEach(function (pl) { fillPCard(pl); });
    var canGo = HH.isUnlocked(CH[sel.idx[0]]) && (sel.mode !== 'duo' || HH.isUnlocked(CH[sel.idx[1]]));
    $('selGo').disabled = !canGo;
    drawBigHeads();
  }
  function statBars(ch) {
    var rows = [['سرعة', ch.spd], ['قفز', ch.jmp], ['تصويب', ch.sht]];
    return rows.map(function (r) { return '<div class="srow"><span>' + r[0] + '</span><div class="sbar"><i style="width:' + (r[1] * 20) + '%"></i></div></div>'; }).join('');
  }
  function fillPCard(pl) {
    var isDuo = sel.mode === 'duo';
    var nameEl = $('pname' + pl), descEl = $('pdesc' + pl), stEl = $('pstats' + pl), keysEl = $('pkeys' + pl);
    $('pready' + pl).hidden = !(isDuo && sel.ready[pl]);
    if (pl === 1 && !isDuo) {
      if (sel.mode === 'tour') {
        var cp = tour.cup;
        $('who1').textContent = 'البطولة';
        nameEl.textContent = cp.name; descEl.textContent = 'اهزم 5 خصوم متتاليين!';
        stEl.innerHTML = '<div class="small">الجائزة: <span class="coin"></span><b>' + cp.reward + '</b></div>';
        keysEl.innerHTML = '';
      } else {
        $('who1').textContent = 'الخصم';
        nameEl.textContent = 'مفاجأة!'; descEl.textContent = 'خصم عشوائي من الكمبيوتر';
        stEl.innerHTML = '<div class="small">الصعوبة: <b class="hot">' + HH.DIFF_NAMES[save.diff] + '</b></div>';
        keysEl.innerHTML = '';
      }
      return;
    }
    var ch = CH[sel.idx[pl]], un = HH.isUnlocked(ch);
    $('who' + pl).textContent = isDuo ? 'اللاعب ' + (pl + 1) : 'أنت';
    nameEl.textContent = un ? ch.name : '؟؟؟';
    if (un) { descEl.textContent = ch.desc; stEl.innerHTML = statBars(ch); }
    else {
      descEl.innerHTML = '<span class="lockinfo">🔒 ' + ch.unlock.text + (HH.unlockProgress(ch) ? ' (' + HH.unlockProgress(ch) + ')' : '') + '</span>';
      stEl.innerHTML = '';
    }
    if (isDuo) keysEl.innerHTML = pl === 0
      ? '<span dir="ltr"><span class="sg-key">A</span><span class="sg-key">D</span><span class="sg-key">W</span><span class="sg-key">S</span></span> اختر &nbsp; <span class="sg-key">مسافة</span> جاهز'
      : '<span dir="ltr"><span class="sg-key">←</span><span class="sg-key">→</span><span class="sg-key">↑</span><span class="sg-key">↓</span></span> اختر &nbsp; <span class="sg-key">Enter</span> جاهز';
    else keysEl.innerHTML = '<span dir="ltr"><span class="sg-key">←</span><span class="sg-key">→</span></span> اختر &nbsp; <span class="sg-key">Enter</span> ابدأ';
  }
  function drawBigHeads() {
    [0, 1].forEach(function (pl) {
      var cv = $('bigHead' + pl);
      if (pl === 1 && sel.mode !== 'duo') {
        if (sel.mode === 'tour') { drawTrophy(cv, tour.cup.color, false, uiT); return; }
        var c = cv.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cv.width, cv.height);
        HH.art.circ(c, 110, 118, 70); HH.art.fs(c, '#3b2f8a', 0);
        c.lineWidth = 6; c.strokeStyle = '#ff5a5a'; c.stroke();
        HH.text(c, '?', 110, 124 + Math.sin(uiT * 4) * 5, 110, '#ffd23f', 'center', { stroke: '#1d1235', sw: 10 });
        return;
      }
      var ch = CH[sel.idx[pl]];
      headCanvas(cv, ch, { t: uiT, locked: !HH.isUnlocked(ch), facing: pl === 0 ? 1 : -1, rs: 0.27, mood: sel.ready[pl] ? 'happy' : 'normal' });
    });
    cards.forEach(function (cd, i) {
      if (sel.idx[0] === i || (sel.mode === 'duo' && sel.idx[1] === i)) headCanvas(cd.cv, cd.ch, { locked: !HH.isUnlocked(cd.ch), t: uiT });
    });
  }
  function openSelect(mode) {
    sel.mode = mode; sel.ready = [false, false]; sel.startT = -1;
    state = 'select'; show('scrSelect');
    $('selTitle').textContent = mode === 'duo' ? 'اختارا لاعبيكما!' : mode === 'tour' ? 'اختر بطلك للبطولة!' : 'اختر لاعبك!';
    var i0 = CH.indexOf(HH.charById(save.p1)); if (!HH.isUnlocked(CH[i0])) i0 = 0;
    var i1 = CH.indexOf(HH.charById(save.p2)); if (!HH.isUnlocked(CH[i1]) || i1 === i0) i1 = (i0 + 1) % 10;
    sel.idx = [i0, i1];
    $('diffGrp').hidden = mode !== 'cpu';
    $('lenGrp').hidden = mode === 'tour';
    buildOpts();
    refreshCards();
  }
  function buildOpts() {
    Array.prototype.forEach.call(document.querySelectorAll('#diffGrp .chip'), function (c) { c.classList.toggle('on', +c.getAttribute('data-diff') === save.diff); });
    Array.prototype.forEach.call(document.querySelectorAll('#lenGrp .chip'), function (c) { c.classList.toggle('on', +c.getAttribute('data-len') === save.len); });
    var cc = $('courtChips'); cc.innerHTML = '';
    HH.COURTS.forEach(function (ct) {
      if (save.ownCourts.indexOf(ct.id) < 0) return;
      var b = document.createElement('button'); b.type = 'button'; b.className = 'chip' + (save.court === ct.id ? ' on' : '');
      b.textContent = ct.name;
      b.addEventListener('click', function () { S.click(); save.court = ct.id; persist(); buildOpts(); newDemo(); });
      cc.appendChild(b);
    });
  }
  Array.prototype.forEach.call(document.querySelectorAll('#diffGrp .chip'), function (c) {
    c.addEventListener('click', function () { S.click(); save.diff = +c.getAttribute('data-diff'); persist(); buildOpts(); fillPCard(1); });
  });
  Array.prototype.forEach.call(document.querySelectorAll('#lenGrp .chip'), function (c) {
    c.addEventListener('click', function () { S.click(); save.len = +c.getAttribute('data-len'); persist(); buildOpts(); });
  });
  function cardClick(i) {
    if (sel.mode === 'duo') {
      var pl = !sel.ready[0] ? 0 : (!sel.ready[1] ? 1 : 0);
      if (sel.ready[0] && sel.ready[1]) { sel.ready = [false, false]; }
      sel.idx[pl] = i; S.move();
      if (HH.isUnlocked(CH[i])) { sel.ready[pl] = true; S.click(); markSeen(CH[i]); }
      else lockedToast(CH[i]);
    } else {
      if (sel.idx[0] === i && HH.isUnlocked(CH[i])) { selGo(); return; }
      sel.idx[0] = i; S.move();
      if (!HH.isUnlocked(CH[i])) lockedToast(CH[i]); else markSeen(CH[i]);
    }
    refreshCards();
  }
  function lockedToast(ch) { S.error(); toast('🔒 ' + ch.unlock.text); }
  function markSeen(ch) { if (ch.secret && save.seen.indexOf(ch.id) < 0) { save.seen.push(ch.id); persist(); } }
  function selMove(pl, d) { sel.idx[pl] = (sel.idx[pl] + d + CH.length) % CH.length; sel.ready[pl] = false; S.move(); refreshCards(); }
  function selKeys() {
    var K = Kit.keys;
    if (K.pressed('Escape')) { selBack(); return; }
    if (sel.mode === 'duo') {
      if (K.pressed('KeyA')) selMove(0, -1);
      if (K.pressed('KeyD')) selMove(0, 1);
      if (K.pressed('KeyW')) selMove(0, -5);
      if (K.pressed('KeyS')) selMove(0, 5);
      if (K.pressed('ArrowLeft')) selMove(1, -1);
      if (K.pressed('ArrowRight')) selMove(1, 1);
      if (K.pressed('ArrowUp')) selMove(1, -5);
      if (K.pressed('ArrowDown')) selMove(1, 5);
      [['Space', 0], ['Enter', 1], ['NumpadEnter', 1]].forEach(function (k) {
        if (!K.pressed(k[0])) return;
        var pl = k[1], ch = CH[sel.idx[pl]];
        if (!HH.isUnlocked(ch)) { lockedToast(ch); return; }
        sel.ready[pl] = !sel.ready[pl]; S.click(); markSeen(ch); refreshCards();
      });
      if (sel.ready[0] && sel.ready[1]) { if (sel.startT < 0) sel.startT = 0.6; }
      else sel.startT = -1;
    } else {
      if (K.anyPressed(['KeyA', 'ArrowLeft'])) selMove(0, -1);
      if (K.anyPressed(['KeyD', 'ArrowRight'])) selMove(0, 1);
      if (K.anyPressed(['KeyW', 'ArrowUp'])) selMove(0, -5);
      if (K.anyPressed(['KeyS', 'ArrowDown'])) selMove(0, 5);
      if (K.anyPressed(['Enter', 'NumpadEnter', 'Space'])) selGo();
    }
  }
  function selBack() { S.click(); if (sel.mode === 'tour') openCups(); else showTitle(); }
  function selGo() {
    var c0 = CH[sel.idx[0]];
    if (!HH.isUnlocked(c0)) { lockedToast(c0); return; }
    if (sel.mode === 'duo') {
      var c1 = CH[sel.idx[1]];
      if (!HH.isUnlocked(c1)) { lockedToast(c1); return; }
      save.p1 = c0.id; save.p2 = c1.id; persist();
      startMatch({ mode: 'duo', p1: c0.id, p2: c1.id, len: save.len, target: save.len <= 60 ? 11 : 21 });
      return;
    }
    save.p1 = c0.id; persist(); markSeen(c0);
    if (sel.mode === 'tour') { beginTour(c0.id); return; }
    startMatch({ mode: 'cpu', p1: c0.id, p2: randomOpp(c0.id), lv: save.diff, len: save.len, target: save.len <= 60 ? 11 : 21 });
  }
  $('selBack').addEventListener('click', selBack);
  $('selGo').addEventListener('click', function () { S.click(); selGo(); });

  /* ================================================================== CUPS */
  var cupCards = [];
  function openCups() {
    state = 'cups'; show('scrCups');
    var row = $('cupRow'); row.innerHTML = ''; cupCards = [];
    HH.CUPS.forEach(function (cp) {
      var locked = cp.need && !save.cups[cp.need];
      var won = save.cups[cp.id];
      var b = document.createElement('button'); b.type = 'button';
      b.className = 'cupc nav' + (locked ? ' locked' : '') + (won ? ' won' : '');
      var cv = document.createElement('canvas'); cv.width = 240; cv.height = 240;
      var boss = HH.charById(cp.boss);
      b.innerHTML = '';
      b.appendChild(cv);
      var h = document.createElement('h4'); h.textContent = cp.name; b.appendChild(h);
      var d = document.createElement('div'); d.className = 'cdesc';
      d.textContent = locked ? '🔒 اربح ' + HH.findById(HH.CUPS, cp.need).name + ' أولًا' : (['خصوم سهلون للبداية', 'خصوم أقوى وأسرع', 'فقط للأبطال الحقيقيين!'][HH.CUPS.indexOf(cp)]);
      b.appendChild(d);
      var r = document.createElement('div'); r.className = 'reward'; r.innerHTML = 'الجائزة: <span class="coin"></span>' + cp.reward + ' + شخصية سرية';
      b.appendChild(r);
      var st = document.createElement('div'); st.className = 'state'; st.textContent = won ? 'فزت بها! ✔' : (locked ? '' : 'العب الآن ◀');
      b.appendChild(st);
      drawTrophy(cv, cp.color, locked, 0);
      b.addEventListener('click', function () {
        if (locked) { S.error(); toast('🔒 اربح ' + HH.findById(HH.CUPS, cp.need).name + ' أولًا'); return; }
        S.click();
        tour = { cup: cp, stage: 0, char: null, opps: [] };
        openSelect('tour');
      });
      row.appendChild(b);
      cupCards.push({ cv: cv, cp: cp, locked: locked });
      if (!locked && !won && !focusEl) setFocus(b);
    });
  }
  $('cupsBack').addEventListener('click', function () { S.click(); showTitle(); });

  function beginTour(charId) {
    tour.char = charId; tour.stage = 0;
    var pool = CH.filter(function (c) { return !c.secret && c.id !== charId; });
    Kit.shuffle(pool);
    var boss = tour.cup.boss;
    if (boss === charId) boss = pool[5].id;
    tour.opps = [pool[0].id, pool[1].id, pool[2].id, pool[3].id, boss];
    openLadder();
  }
  function openLadder() {
    state = 'ladder'; show('scrLadder');
    var cp = tour.cup;
    $('ladTitle').textContent = cp.name;
    $('ladSub').textContent = tour.stage === 0 ? 'اهزم الخصوم الخمسة واحدًا تلو الآخر!' : (tour.stage === 4 ? 'المباراة الأخيرة ضد الزعيم!' : (5 - tour.stage === 2 ? 'رائع! بقي خصمان فقط' : 'رائع! بقي ' + (5 - tour.stage) + ' خصوم'));
    var lad = $('ladder'); lad.innerHTML = '';
    tour.opps.forEach(function (id, i) {
      var ch = HH.charById(id);
      var d = document.createElement('div');
      var isBoss = i === 4;
      d.className = 'lslot' + (i < tour.stage ? ' done' : '') + (i === tour.stage ? ' cur' : '') + (isBoss ? ' boss' : '');
      var cv = document.createElement('canvas'); cv.width = 180; cv.height = 180;
      var hidden = isBoss && tour.stage < 4 && !HH.isUnlocked(ch);
      headCanvas(cv, ch, { locked: hidden, facing: -1, mood: i < tour.stage ? 'sad' : 'normal' });
      if (isBoss) { var bt = document.createElement('div'); bt.className = 'bosst'; bt.textContent = 'الزعيم'; d.appendChild(bt); }
      var num = document.createElement('div'); num.className = 'num'; num.textContent = 'الخصم ' + (i + 1); d.appendChild(num);
      d.appendChild(cv);
      var n = document.createElement('div'); n.className = 'ln'; n.textContent = hidden ? '؟؟؟' : ch.name; d.appendChild(n);
      var lv = document.createElement('div'); lv.className = 'lv'; lv.textContent = 'القوة: ' + '★★★★★'.slice(0, Math.max(1, Math.min(5, Math.round(cp.lv[i] * 1.5 + 1))));
      d.appendChild(lv);
      lad.appendChild(d);
    });
    $('ladGo').textContent = '';
    $('ladGo').innerHTML = (tour.stage === 0 ? 'العب!' : 'المباراة التالية!') + ' <small dir="ltr">Enter</small>';
  }
  function ladGo() { S.click(); startTourMatch(); }
  function startTourMatch() {
    var cp = tour.cup;
    startMatch({ mode: 'tour', p1: tour.char, p2: tour.opps[tour.stage], lv: cp.lv[tour.stage], len: 60, target: 11 });
  }
  $('ladGo').addEventListener('click', ladGo);
  $('ladBack').addEventListener('click', function () {
    S.click();
    askConfirm('الانسحاب من البطولة؟', function () { tour = null; openCups(); });
  });

  /* ================================================================== SHOP */
  var shopTab = 'balls';
  function openShop() { state = 'shop'; show('scrShop'); buildShop(); }
  function buildShop() {
    $('shopCoins').textContent = save.coins;
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) { t.classList.toggle('on', t.getAttribute('data-tab') === shopTab); });
    var g = $('shopGrid'); g.innerHTML = '';
    var list = shopTab === 'balls' ? HH.BALLS : HH.COURTS;
    var own = shopTab === 'balls' ? save.ownBalls : save.ownCourts;
    var cur = shopTab === 'balls' ? save.ball : save.court;
    list.forEach(function (it) {
      var owned = own.indexOf(it.id) >= 0;
      var b = document.createElement('button'); b.type = 'button';
      b.className = 'si nav' + (owned ? ' own' : '') + (cur === it.id ? ' eq' : '') + (!owned && save.coins < it.price ? ' poor' : '');
      var cv = document.createElement('canvas');
      if (shopTab === 'balls') { cv.width = 120; cv.height = 120; cv.style.width = '100px'; cv.style.height = '100px'; var c = cv.getContext('2d'); HH.drawBall(c, 60, 60, 48, 0.4, it.id); }
      else { cv.width = 320; cv.height = 180; cv.style.width = '226px'; cv.style.height = '127px'; HH.drawCourtPreview(cv.getContext('2d'), it.id, 320, 180); }
      b.appendChild(cv);
      var n = document.createElement('div'); n.className = 'sn'; n.textContent = it.name; b.appendChild(n);
      var p = document.createElement('div'); p.className = 'sp';
      if (cur === it.id) p.textContent = 'مُختارة ✔';
      else if (owned) p.textContent = 'اختر';
      else p.innerHTML = '<span class="coin"></span>' + it.price;
      b.appendChild(p);
      b.addEventListener('click', function () { shopClick(it, owned); });
      g.appendChild(b);
    });
  }
  function shopClick(it, owned) {
    var own = shopTab === 'balls' ? save.ownBalls : save.ownCourts;
    if (!owned) {
      if (save.coins < it.price) { S.error(); toast('تحتاج ' + (it.price - save.coins) + ' عملة إضافية!'); return; }
      save.coins -= it.price; own.push(it.id); S.buy(); toast('اشتريت «' + it.name + '»! 🎉');
    } else S.click();
    if (shopTab === 'balls') save.ball = it.id; else { save.court = it.id; newDemo(); }
    persist();
    var fIdx = focusEl ? navList($('scrShop')).indexOf(focusEl) : -1;
    buildShop();
    if (fIdx >= 0) setFocus(navList($('scrShop'))[fIdx]);
  }
  Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) {
    t.classList.add('nav');
    t.addEventListener('click', function () { S.click(); shopTab = t.getAttribute('data-tab'); buildShop(); });
  });
  $('shopBack').addEventListener('click', function () { S.click(); showTitle(); });

  /* ================================================================= MATCH */
  function startMatch(c) {
    cfg = c;
    match = HH.newMatch({ mode: c.mode, p1: c.p1, p2: c.p2, lv: c.lv, len: c.len, target: c.target });
    state = 'play'; show(null);
    youT = 3.5; scorePop = [0, 0];
    S.whistle();
  }
  function matchInfo(m) {
    var c = cfg, tags, marks, mode = '', sub = 'الأول إلى ' + m.target;
    if (c.mode === 'duo') { tags = ['اللاعب 1', 'اللاعب 2']; marks = ['1', '2']; }
    else if (c.mode === 'tour') { tags = ['أنت', 'الخصم ' + (tour.stage + 1) + ' من 5']; marks = ['أنت', null]; mode = tour.cup.name + ' • المباراة ' + (tour.stage + 1) + ' من 5'; }
    else { tags = ['أنت', 'كمبيوتر • ' + HH.DIFF_NAMES[c.lv]]; marks = ['أنت', null]; }
    var w = m.winner, winText = '';
    if (w >= 0) winText = c.mode === 'duo' ? ('فاز اللاعب ' + (w + 1) + '!') : (w === 0 ? 'فزت!' : 'خسرت!');
    return {
      court: save.court, ball: save.ball, hud: true, tags: tags, marks: marks, mode: mode, sub: sub,
      scorePop: scorePop, youT: youT, winText: winText,
      introSub: m.players[0].ch.name + ' ضد ' + m.players[1].ch.name
    };
  }
  function processEvents(m) {
    while (m.events.length) {
      var e = m.events.shift();
      if (e.type === 'score') scorePop[e.p] = 1;
      if (e.type === 'end') onMatchEnd();
    }
  }
  function pauseGame() {
    if (state !== 'play') return;
    state = 'pause'; show('scrPause');
    $('pauseKeys').innerHTML = cfg.mode === 'duo'
      ? 'اللاعب 1: <span dir="ltr"><span class="sg-key">A</span><span class="sg-key">D</span></span> حركة، <span class="sg-key">W</span> قفز، <span class="sg-key">S</span> تصويب<br>اللاعب 2: <span dir="ltr"><span class="sg-key">←</span><span class="sg-key">→</span></span> حركة، <span class="sg-key">↑</span> قفز، <span class="sg-key">↓</span> تصويب'
      : '<span dir="ltr"><span class="sg-key">A</span><span class="sg-key">D</span></span> حركة، <span class="sg-key">W</span> قفز، <span class="sg-key">S</span> تصويب (أو الأسهم)<br>اقفز قرب السلة واضغط <span class="sg-key">S</span> = دانك!';
    setFocus($('pResume'));
    Kit.keys.reset();
    // held keys are forgotten while paused, so drop a half-charged shot instead of firing it on resume
    match.players.forEach(function (p) { if (p.ctrl === 'human') { p.charging = false; p.charge = 0; p.prevShoot = false; p.prevJump = false; } });
  }
  function resume() { state = 'play'; show(null); S.click(); }
  function restart() {
    S.click();
    if (cfg.mode === 'tour') startTourMatch(); else startMatch(cfg);
  }
  function toMenu() { match = null; tour = null; showTitle(); }
  $('pauseBtn').addEventListener('click', function () { pauseGame(); });
  $('pResume').classList.add('nav'); $('pRestart').classList.add('nav'); $('pMenu').classList.add('nav');
  $('pResume').addEventListener('click', resume);
  $('pRestart').addEventListener('click', restart);
  $('pMenu').addEventListener('click', function () { S.click(); askConfirm('الخروج من المباراة؟', toMenu); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) pauseGame(); });

  function askConfirm(msg, yes) {
    confirmFrom = state; confirmYes = yes;
    state = 'confirm';
    $('cfText').textContent = msg;
    SCREENS.forEach(function (s) { if (s !== 'scrConfirm' && s !== 'scrLadder') $(s).hidden = true; });
    $('scrConfirm').hidden = false;
    clearFocus(); setFocus($('cfNo'));
  }
  $('cfYes').classList.add('nav'); $('cfNo').classList.add('nav');
  $('cfYes').addEventListener('click', function () { S.click(); $('scrConfirm').hidden = true; var y = confirmYes; confirmYes = null; state = confirmFrom; y(); });
  $('cfNo').addEventListener('click', cfNo);
  function cfNo() {
    S.click(); $('scrConfirm').hidden = true; state = confirmFrom;
    if (state === 'pause') { $('scrPause').hidden = false; setFocus($('pResume')); }
    if (state === 'ladder') openLadder();
  }

  /* ---------------------------------------------------------------- results */
  function onMatchEnd() {
    var m = match, c = cfg, a = m.players[0], b = m.players[1];
    var win = m.winner === 0;
    var before = CH.filter(HH.isUnlocked).map(function (x) { return x.id; });
    var st = save.stats;
    st.games++;
    var humans = c.mode === 'duo' ? [a, b] : [a];
    humans.forEach(function (p) {
      st.points += p.st.pts; st.dunks += p.st.dunks; st.threes += p.st.threes; st.blocks += p.st.blocks; st.steals += p.st.steals;
    });
    var coins = 0, newRec = false;
    if (c.mode === 'duo') coins = Math.floor((a.score + b.score) / 2) + 10;
    else {
      if (win) st.wins++;
      coins = a.score + (win ? (c.mode === 'tour' ? 20 + tour.stage * 6 : 15 + c.lv * 10) : 5) + a.st.dunks * 2 + a.st.blocks * 2 + a.st.steals;
      if (c.mode === 'cpu') {
        if (win) { save.streak++; if (save.streak > save.bestStreak) { save.bestStreak = save.streak; newRec = save.streak >= 2; } }
        else save.streak = 0;
      }
    }
    save.coins += coins;
    var after = CH.filter(HH.isUnlocked).map(function (x) { return x.id; });
    var fresh = after.filter(function (id) { return before.indexOf(id) < 0; });
    persist();

    // fill the screen
    var banner = $('resBanner');
    banner.className = 'res-banner' + (c.mode !== 'duo' && !win ? ' lose' : '');
    banner.textContent = c.mode === 'duo' ? ('فاز اللاعب ' + (m.winner + 1) + '!') : (win ? (m.overtime ? 'فزت بالسلة الذهبية!' : 'فزت! 🎉') : 'خسرت… حاول مجددًا!');
    [a, b].forEach(function (p, i) {
      headCanvas($('resHead' + i), p.ch, { mood: m.winner === i ? 'happy' : 'sad', facing: i ? -1 : 1, t: 0 });
      $('resName' + i).textContent = p.ch.name;
      $('resS' + i).textContent = p.score;
    });
    var chips = [];
    function chip(label, v) { chips.push('<span class="st">' + label + '<b dir="ltr">' + v + '</b></span>'); }
    if (c.mode === 'duo') {
      chip('دانك', a.st.dunks + ' - ' + b.st.dunks); chip('ثلاثيات', a.st.threes + ' - ' + b.st.threes);
      chip('صدّ', a.st.blocks + ' - ' + b.st.blocks); chip('خطف', a.st.steals + ' - ' + b.st.steals);
    } else {
      chip('السلات', a.st.made); chip('ثلاثيات', a.st.threes); chip('دانك', a.st.dunks); chip('صدّ', a.st.blocks); chip('خطف', a.st.steals);
    }
    $('resStats').innerHTML = chips.join('');
    var coinHtml = '<span class="coin"></span>+<span id="coinCount">0</span>';
    if (c.mode === 'cpu' && win && save.streak >= 2) coinHtml += '<span class="newrec">' + (newRec ? 'رقم قياسي جديد! ' : '') + streakText(save.streak) + ' 🔥</span>';
    $('resCoins').innerHTML = coinHtml;
    countUp($('coinCount'), coins);
    var un = $('resUnlock');
    if (fresh.length) {
      var ch = HH.charById(fresh[0]);
      un.hidden = false; un.innerHTML = '';
      var cv = document.createElement('canvas'); cv.width = 90; cv.height = 90;
      headCanvas(cv, ch, { mood: 'happy' });
      un.appendChild(cv);
      var sp = document.createElement('span'); sp.textContent = 'شخصية جديدة: ' + ch.name + '!'; un.appendChild(sp);
    } else un.hidden = true;

    // buttons
    var again = $('rAgain'), menu = $('rMenu');
    again.classList.add('nav', 'def'); menu.classList.add('nav');
    if (c.mode === 'tour') {
      if (win) {
        tour.stage++;
        if (tour.stage >= 5) { finishTour(coins); return; }
        again.innerHTML = 'المباراة التالية <small dir="ltr">Enter</small>';
        resultPrimary = function () { S.click(); openLadder(); };
        menu.innerHTML = 'انسحاب <small dir="ltr">Esc</small>';
      } else {
        again.innerHTML = 'حاول مجددًا <small dir="ltr">Enter</small>';
        resultPrimary = function () { restart(); };
        menu.innerHTML = 'انسحاب <small dir="ltr">Esc</small>';
      }
    } else {
      again.innerHTML = 'العب مجددًا <small dir="ltr">Enter</small>';
      resultPrimary = function () {
        if (c.mode === 'cpu') { cfg = { mode: 'cpu', p1: c.p1, p2: randomOpp(c.p1), lv: save.diff, len: c.len, target: c.target }; }
        restart();
      };
      menu.innerHTML = 'القائمة <small dir="ltr">Esc</small>';
    }
    state = 'result'; show('scrResult');
    setFocus(again);
    if (c.mode === 'duo' || win) S.win(); else S.lose();
  }
  function streakText(n) {
    if (n === 2) return 'انتصاران متتاليان';
    return n + (n <= 10 ? ' انتصارات متتالية' : ' انتصارًا متتاليًا');
  }
  function countUp(el, n) {
    var t0 = performance.now();
    (function step() {
      var k = Math.min(1, (performance.now() - t0) / 900);
      el.textContent = Math.round(n * k);
      if (k < 1 && document.body.contains(el)) requestAnimationFrame(step);
      else if (n > 0) S.coin();
    })();
  }
  $('rAgain').addEventListener('click', function () { if (resultPrimary) resultPrimary(); });
  $('rMenu').addEventListener('click', function () { S.click(); if (cfg && cfg.mode === 'tour') { tour = null; match = null; openCups(); } else toMenu(); });

  function finishTour(matchCoins) {
    var cp = tour.cup;
    var firstTime = !save.cups[cp.id];
    var before = CH.filter(HH.isUnlocked).map(function (x) { return x.id; });
    save.cups[cp.id] = true;
    var reward = firstTime ? cp.reward : Math.round(cp.reward / 3);
    save.coins += reward;
    persist();
    var fresh = CH.filter(HH.isUnlocked).filter(function (x) { return before.indexOf(x.id) < 0; });
    state = 'trophy'; show('scrTrophy');
    $('trText').innerHTML = 'فزت بـ' + cp.name + '!<br><span class="coin"></span><b class="hot">+' + (reward + matchCoins) + '</b>';
    var un = $('trUnlock'); un.innerHTML = '';
    if (fresh.length) {
      var cv = document.createElement('canvas'); cv.width = 90; cv.height = 90; headCanvas(cv, fresh[0], { mood: 'happy' });
      un.appendChild(cv);
      var sp = document.createElement('span'); sp.textContent = 'شخصية سرية جديدة: ' + fresh[0].name + '!'; un.appendChild(sp);
      un.hidden = false;
    } else un.hidden = true;
    $('trOk').classList.add('nav');
    setFocus($('trOk'));
    S.win(); setTimeout(function () { S.cheer(true); }, 400);
  }
  $('trOk').addEventListener('click', function () { S.click(); tour = null; match = null; openCups(); });

  /* ============================================================== MAIN LOOP */
  function update(dt) {
    var K = Kit.keys;
    uiT += dt;
    switch (state) {
      case 'title':
        if (K.anyPressed(['ArrowUp', 'KeyW', 'ArrowDown', 'KeyS', 'ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD']) || focusEl) navKeys($('scrTitle'), quickPlay, null);
        else if (K.anyPressed(['Enter', 'NumpadEnter', 'Space'])) { S.click(); quickPlay(); }
        break;
      case 'select':
        selKeys();
        if (sel.startT >= 0) { sel.startT -= dt; if (sel.startT < 0 && sel.ready[0] && sel.ready[1]) selGo(); }
        break;
      case 'cups': navKeys($('scrCups'), null, function () { S.click(); showTitle(); }); break;
      case 'ladder': navKeys($('scrLadder'), ladGo, function () { $('ladBack').click(); }); break;
      case 'shop': navKeys($('scrShop'), null, function () { S.click(); showTitle(); }); break;
      case 'play':
        if (K.anyPressed(['KeyP', 'Escape'])) { pauseGame(); break; }
        HH.stepMatch(match, dt);
        processEvents(match);
        youT = Math.max(0, youT - dt);
        scorePop[0] = Math.max(0, scorePop[0] - dt * 3); scorePop[1] = Math.max(0, scorePop[1] - dt * 3);
        break;
      case 'pause':
        if (K.anyPressed(['KeyP', 'Escape'])) { resume(); break; }
        if (K.pressed('KeyR')) { restart(); break; }
        navKeys($('scrPause'), resume, null);
        break;
      case 'confirm': navKeys($('scrConfirm'), null, cfNo); break;
      case 'result':
        if (match) HH.stepMatch(match, dt);
        if (K.pressed('KeyR')) { resultPrimary && resultPrimary(); break; }
        navKeys($('scrResult'), resultPrimary, function () { $('rMenu').click(); });
        break;
      case 'trophy':
        if (match) HH.stepMatch(match, dt);
        navKeys($('scrTrophy'), function () { $('trOk').click(); }, function () { $('trOk').click(); });
        break;
    }
    // background demo match behind the menus
    if (!match && demo && state !== 'play') {
      S.enabled = false; HH.stepMatch(demo, dt); S.enabled = true;
      demoT += dt; if (demoT > 90) newDemo();
    }
    K.endFrame();
  }

  var menuAnimT = 0;
  function render() {
    var m = match || demo;
    if (m) {
      var info = match ? matchInfo(match) : { court: save.court, ball: save.ball, hud: false };
      HH.render(ctx, view, m, info);
    }
    menuAnimT += 1;
    if (menuAnimT % 2) return; // animate menu canvases at ~30 fps
    if (state === 'title') {
      [['logoHeadR', 0, 1], ['logoHeadL', 1, -1]].forEach(function (d) {
        headCanvas($(d[0]), HH.charById(logoChars[d[1]]), { t: uiT, facing: d[2], rs: 0.27, mood: Math.sin(uiT * 0.8 + d[1] * 2) > 0.6 ? 'happy' : 'normal' });
      });
    } else if (state === 'select') drawBigHeads();
    else if (state === 'cups') cupCards.forEach(function (cc) { if (!cc.locked) drawTrophy(cc.cv, cc.cp.color, false, uiT); });
    else if (state === 'trophy') drawTrophy($('trophyCv'), tour ? tour.cup.color : '#ffc93a', false, uiT);
  }

  Kit.loop(update, render);
  showTitle();
  // make sure canvas text redraws once the Arabic font is ready
  if (document.fonts && document.fonts.load) {
    Promise.all([document.fonts.load('700 40px Fredoka', 'بسلة'), document.fonts.load('700 30px Fredoka', '3')]).then(function () {
      HH.resetBg();
      if (state === 'title') showTitle();
      else if (state === 'shop') buildShop();
    }).catch(function () {});
  }

  /* ============================================================ DEBUG HOOK */
  window.__game = {
    get state() { return state; },
    get match() { return match; },
    get demo() { return demo; },
    get sel() { return sel; },
    save: save,
    info: function () {
      var m = match || demo; if (!m) return null;
      return { state: state, phase: m.phase, time: +m.time.toFixed(1), score: [m.players[0].score, m.players[1].score], ball: { x: Math.round(m.ball.x), y: Math.round(m.ball.y), state: m.ball.state, holder: m.ball.holder ? m.ball.holder.idx : -1 }, p: m.players.map(function (p) { return { x: Math.round(p.x), y: Math.round(p.y), ch: p.ch.id, fire: p.fire, streak: p.streak }; }) };
    },
    start: function (o) { o = o || {}; startMatch({ mode: o.mode || 'cpu', p1: o.p1 || 'robo', p2: o.p2 || 'alien', lv: o.lv == null ? 1 : o.lv, len: o.len || 120, target: o.target || 21 }); },
    tour: function (cupIdx, stage, charId) { tour = { cup: HH.CUPS[cupIdx || 0], stage: 0, char: null, opps: [] }; beginTour(charId || 'robo'); tour.stage = stage || 0; openLadder(); },
    endNow: function (winner) { if (!match) return; match.players[winner || 0].score += 5; match.time = 0.05; },
    setTime: function (t) { if (match) match.time = t; },
    give: function (idx, x) {
      if (!match) return;
      var p = match.players[idx || 0], o = match.players[1 - (idx || 0)];
      if (match.phase === 'intro') { match.phase = 'play'; }
      if (x != null) p.x = x;
      if (o.x > p.x - 120 && o.x < p.x + 120) o.x = p.x < 640 ? p.x + 400 : p.x - 400;
      HH._t.giveBall(match, p, true);
    },
    place: function (idx, x) { if (match) { match.players[idx].x = x; } },
    coins: function (n) { save.coins += n; persist(); },
    fire: function (idx) { if (match) { var p = match.players[idx || 0]; p.fire = true; p.streak = 2; } },
    skipIntro: function () { if (match && match.phase === 'intro') match.phaseT = 0.01; }
  };
})();
