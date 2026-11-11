/* Math Gates (بوابات الحساب): screens, keyboard and mouse, the first-level coach, the
 * HUD, saves and sound. engine.js runs the level; art.js draws it in 3D.
 * This is the UI layer: it reads Kit.dda at every level start and reports each finished
 * level back to it. */
(function () {
  'use strict';
  var MG = window.MG, J = Kit.juice;
  function $(id) { return document.getElementById(id); }
  var canvas = $('scene'), ui = $('ui'), body = document.body;
  var LEFT = ['ArrowLeft', 'KeyA'], RIGHT = ['ArrowRight', 'KeyD'], GO = ['Enter', 'NumpadEnter', 'Space'];
  var PRAISE = ['أحسنت!', 'رائع!', 'ممتاز!', 'مذهل!'];
  var LQ = /[?&]lq\b/.test(location.search);

  /* --------------------------------------------------------------- save */
  var store = Kit.store('math-gates'), saveStatus = Kit.saveStatus({ retry: persist });
  var save = MG.loadSave(store.get('save', null));
  function persist() {
    if (store.set('save', save) === false) { saveStatus.failed(); return false; }
    saveStatus.saved();
    return true;
  }
  // One difficulty for every level (Kit keeps it on this PC). A PC that has never
  // played starts at the gentlest tier.
  var dda = Kit.dda('math-gates', { id: 'main', start: 0.15 });

  /* -------------------------------------------------------------- state */
  var mode = 'title', run = null, cur = 0, attempt = 0, view = null, time = 0, viewTime = 0, dirty = true, snap = true, contextLost = false;
  var result = null, resultT = 0, resultLock = 0, wardFrom = 'title', timers = [], streak = 0, shown = -1, lastFrame = 0;
  var ptr = { down: false, lane: -1, fresh: false }, coach = { on: false, rows: 0, t: 0 };
  var menuRun = MG.create({ level: 0, tier: 2, seed: 7 });
  menuRun.d = 8; menuRun.count = 14;
  var uiS = 1, uiL = 0, uiT = 0;
  var calm = function () { return Kit.motion.reduced(); };
  function say(text) { $('live').textContent = text; }
  function focusGame() { try { canvas.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  // Celebrations wait on the game clock, so a pause freezes them too; leaving a level drops them.
  function later(t, fn) { timers.push({ t: t, fn: fn }); }
  function ltr(t) { return '<span dir="ltr">' + t + '</span>'; }

  /* ------------------------------------------------------------ screens */
  var SCREENS = { title: 'title', map: 'map', wardrobe: 'wardrobe', paused: 'pause-screen', result: 'result' };
  function setMode(next) {
    mode = next; body.dataset.mode = next;
    for (var k in SCREENS) $(SCREENS[k]).hidden = k !== next;
    $('hud').hidden = !(next === 'play' || next === 'paused');
    dirty = true;
    if (next === 'play') focusGame();
  }
  function stars() { return MG.totalStars(save); }
  function chips() {
    $('title-stars').textContent = String(stars()); $('map-stars').textContent = String(stars());
    $('title-coins').textContent = String(save.coins); $('bank').textContent = String(save.coins);
    $('btn-wardrobe').classList.toggle('ring', MG.unlocks(save.seen, save.coins).length > 0);
  }
  function toTitle() { run = null; chips(); setMode('title'); snap = true; }
  function play() {
    J.select();
    if (!stars()) startLevel(0); else toMap();
  }

  /* ---------------------------------------------------------------- map */
  var pebbles = [], cards = [];
  function buildMap() {
    var box = $('worlds');
    MG.WORLDS.forEach(function (Wd, w) {
      var card = document.createElement('div');
      card.className = 'world w' + w;
      card.innerHTML = '<div class="wtop"><span class="op" dir="ltr">' + Wd.icon + '</span><b>' + Wd.name + '</b><small>' + Wd.sub + '</small></div>' +
        '<svg class="lock" aria-hidden="true"><use href="#i-lock"/></svg>';
      var row = document.createElement('div'); row.className = 'lv';
      for (var n = 0; n < MG.PER_WORLD; n++) (function (i) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'pebble';
        b.innerHTML = '<b dir="ltr">' + (n + 1) + '</b><span class="st">' + '<svg aria-hidden="true"><use href="#i-star"/></svg>'.repeat(3) + '</span><svg class="lock" aria-hidden="true"><use href="#i-lock"/></svg>';
        on(b, function () { pickLevel(i, b); });
        row.appendChild(b); pebbles[i] = b;
      })(w * MG.PER_WORLD + n);
      card.appendChild(row); box.appendChild(card); cards.push(card);
    });
  }
  function refreshMap() {
    var next = MG.nextLevel(save);
    pebbles.forEach(function (b, i) {
      var open = MG.isOpen(save, i), st = save.stars[i];
      b.classList.toggle('locked', !open); b.classList.toggle('done', st > 0); b.classList.toggle('next', i === next && open && !st);
      b.querySelectorAll('.st svg').forEach(function (s, k) { s.classList.toggle('on', k < st); });
      b.setAttribute('aria-label', 'المرحلة ' + MG.LEVELS[i].tag + (open ? '، ' + st + ' من 3 نجوم' : ' (مقفلة)'));
    });
    cards.forEach(function (c, w) { c.classList.toggle('locked', !MG.worldOpen(save, w)); });
    chips();
  }
  function toMap() { run = null; refreshMap(); setMode('map'); snap = true; J.whoosh(0.4); }
  function wiggle(el) { el.classList.remove('wiggle'); void el.offsetWidth; el.classList.add('wiggle'); setTimeout(function () { el.classList.remove('wiggle'); }, 450); }
  function pickLevel(i, el) {
    if (!MG.isOpen(save, i)) { J.error(); wiggle(el); return; }
    J.select(); startLevel(i);
  }

  /* ------------------------------------------------------------ wardrobe */
  var HAT_ART = {
    none: '<circle cx="32" cy="32" r="21" fill="none" stroke="#c9c2dc" stroke-width="7"/><path d="M17 47 L47 17" stroke="#c9c2dc" stroke-width="7" stroke-linecap="round"/>',
    party: '<path d="M32 4 L48 54 H16 Z" fill="#7a5cff" stroke="#2a2140" stroke-width="4" stroke-linejoin="round"/><path d="M26 22 H38 M22 36 H42" stroke="#ffd23f" stroke-width="5"/><circle cx="32" cy="7" r="6" fill="#ff4f9a" stroke="#2a2140" stroke-width="3"/>',
    bow: '<path d="M32 32 L8 16 L8 48 Z M32 32 L56 16 L56 48 Z" fill="#ff4f9a" stroke="#2a2140" stroke-width="4" stroke-linejoin="round"/><circle cx="32" cy="32" r="8" fill="#ff86c0" stroke="#2a2140" stroke-width="4"/>',
    cap: '<path d="M10 40 Q10 14 32 14 Q52 14 52 40 Z" fill="#ff4b4b" stroke="#2a2140" stroke-width="4"/><path d="M8 40 H62 Q60 48 44 48 H8 Z" fill="#ff4b4b" stroke="#2a2140" stroke-width="4" stroke-linejoin="round"/><circle cx="32" cy="14" r="4" fill="#fff"/>',
    crown: '<path d="M8 50 L8 18 L22 32 L32 12 L42 32 L56 18 L56 50 Z" fill="#ffc21a" stroke="#2a2140" stroke-width="4" stroke-linejoin="round"/><circle cx="32" cy="40" r="5" fill="#ff3b6b"/>',
    flower: '<g stroke="#2a2140" stroke-width="3"><circle cx="32" cy="14" r="10" fill="#ff86c0"/><circle cx="50" cy="28" r="10" fill="#ff86c0"/><circle cx="44" cy="48" r="10" fill="#ff86c0"/><circle cx="20" cy="48" r="10" fill="#ff86c0"/><circle cx="14" cy="28" r="10" fill="#ff86c0"/><circle cx="32" cy="32" r="10" fill="#ffd23f"/></g>',
    wizard: '<path d="M32 4 L46 50 H18 Z" fill="#6b4fe6" stroke="#2a2140" stroke-width="4" stroke-linejoin="round"/><path d="M4 50 H60 Q60 58 32 58 Q4 58 4 50 Z" fill="#5b3fd1" stroke="#2a2140" stroke-width="4"/><circle cx="30" cy="30" r="4" fill="#ffe14d"/><circle cx="36" cy="18" r="3" fill="#ffe14d"/>',
    propeller: '<path d="M12 46 Q12 22 32 22 Q52 22 52 46 Z" fill="#ff4b4b" stroke="#2a2140" stroke-width="4"/><path d="M22 23 Q32 34 42 23" fill="#ffd23f"/><path d="M32 22 V12" stroke="#2a2140" stroke-width="4"/><path d="M8 10 H56" stroke="#4fb8ff" stroke-width="7" stroke-linecap="round"/>'
  };
  function hex(c) { return '#' + c.toString(16).padStart(6, '0'); }
  function colorPic(c) {
    var fill = c.c < 0 ? 'url(#g-rainbow)' : hex(c.c);
    return '<svg class="pic" viewBox="0 0 64 64" aria-hidden="true"><ellipse cx="32" cy="36" rx="22" ry="24" fill="' + fill + '" stroke="#2a2140" stroke-width="4"/><circle cx="25" cy="31" r="5.5" fill="#fff"/><circle cx="39" cy="31" r="5.5" fill="#fff"/><circle cx="25.5" cy="32" r="3" fill="#2a2140"/><circle cx="39.5" cy="32" r="3" fill="#2a2140"/><ellipse cx="17" cy="40" rx="4" ry="2.6" fill="#ff8fb0"/><ellipse cx="47" cy="40" rx="4" ry="2.6" fill="#ff8fb0"/></svg>';
  }
  function hatPic(h) { return '<svg class="pic" viewBox="0 0 64 64" aria-hidden="true">' + HAT_ART[h.id] + '</svg>'; }
  var tiles = [];
  function buildWardrobe() {
    [['color', MG.COLORS, 'colors'], ['hat', MG.HATS, 'hats']].forEach(function (g) {
      g[1].forEach(function (it, i) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'tile';
        b.innerHTML = (g[0] === 'color' ? colorPic(it) : hatPic(it)) + '<span class="need"><i class="coin"></i><b dir="ltr">' + it.need + '</b></span><svg class="lock" aria-hidden="true"><use href="#i-lock"/></svg>';
        on(b, function () { equip(g[0], i, b); });
        $(g[2]).appendChild(b);
        tiles.push({ type: g[0], i: i, el: b, need: it.need });
      });
    });
  }
  function refreshWardrobe() {
    tiles.forEach(function (t) {
      var locked = t.need > save.coins, onNow = (t.type === 'color' ? save.color : save.hat) === t.i;
      t.el.classList.toggle('locked', locked); t.el.classList.toggle('on', onNow);
      t.el.setAttribute('aria-label', (t.type === 'color' ? 'لون ' : 'قبعة ') + (t.i + 1) + (locked ? ' (مقفل)' : ''));
      t.el.setAttribute('aria-pressed', String(onNow));
    });
    chips();
  }
  function openWardrobe(from) {
    wardFrom = from; J.select();
    if (save.seen !== save.coins) { save.seen = save.coins; persist(); }
    run = null; refreshWardrobe(); setMode('wardrobe'); snap = true;
  }
  function closeWardrobe() { J.back(); if (wardFrom === 'map') toMap(); else toTitle(); }
  function equip(type, i, el) {
    var list = type === 'color' ? MG.COLORS : MG.HATS;
    if (list[i].need > save.coins) { J.error(); wiggle(el); return; }
    if (type === 'color') save.color = i; else save.hat = i;
    persist(); view.setLook(save.color, save.hat); J.select();
    view.burst(0, 1.2, -menuRun.d, { count: 26, speed: 3.5, life: 0.9, size: 0.12 });
    refreshWardrobe();
  }

  /* ------------------------------------------------------------- levels */
  function resetPlay() {
    ptr.down = false; ptr.fresh = false; Kit.keys.reset();
    timers = []; streak = 0; shown = -1; result = null;
    clearFloats(); $('popup').hidden = true; $('rivalNum').hidden = true; $('multChip').hidden = true; $('pointer').hidden = true;
  }
  function startLevel(i) {
    // The difficulty is read at every start.
    var tier = dda.tier, L = MG.LEVELS[i];
    cur = i; attempt++;
    run = MG.create({ level: i, tier: tier, seed: (Math.random() * 4294967296) >>> 0 });
    resetPlay();
    view.reset(run); snap = true;
    $('hud-level').textContent = L.tag;
    $('hud-rival').textContent = String(run.rival);
    $('hud-coins').textContent = '0';
    coach.on = !save.coach && i === 0; coach.rows = 0; coach.t = 0;
    $('coach').hidden = !(coach.on || run.tier === 1 && i % MG.PER_WORLD === 0);
    $('coach').classList.remove('out');
    showBanner(L);
    setMode('play');
    say(MG.WORLDS[L.world].name + '، المرحلة ' + L.tag);
    J.whoosh(0.5);
  }
  function restart() { J.select(); startLevel(cur); }
  function pause(own) {
    if (mode !== 'play') return;
    ptr.down = false; Kit.keys.reset();
    setMode('paused');
    if (own) J.back();
  }
  function resume() {
    if (mode !== 'paused' || contextLost) return;
    J.select(); Kit.keys.reset();
    setMode('play');
  }
  function quit() { J.back(); toMap(); }
  function showBanner(L) {
    var b = $('banner');
    b.innerHTML = '<span class="big" dir="ltr">' + L.tag + '</span><span>' + MG.WORLDS[L.world].name + '</span>';
    b.hidden = false; b.classList.remove('out');
    later(2.4, function () { b.classList.add('out'); });
    later(2.9, function () { b.hidden = true; });
  }

  /* ---------------------------------------------------- floats and popups */
  var floatPool = [], floating = [];
  function uiPoint(p) { var q = view.project(p.x, p.y, p.z); return { x: (q.x * window.innerWidth - uiL) / uiS, y: (q.y * window.innerHeight - uiT) / uiS, behind: q.behind }; }
  function float(textHtml, cls, at) {
    var el = floatPool.pop();
    if (!el) { el = document.createElement('div'); $('floats').appendChild(el); }
    el.className = 'float ' + (cls || ''); el.innerHTML = textHtml; el.style.display = '';
    var a = at ? uiPoint(at) : { x: 640, y: 300 };
    floating.push({ el: el, x: a.x, y: a.y, t: 0 });
    if (floating.length > 6) dropFloat(0);
  }
  function dropFloat(i) { var f = floating.splice(i, 1)[0]; f.el.style.display = 'none'; floatPool.push(f.el); }
  function clearFloats() { while (floating.length) dropFloat(0); }
  function stepFloats(dt) {
    for (var i = floating.length - 1; i >= 0; i--) {
      var f = floating[i];
      f.t += dt;
      f.el.style.transform = 'translate(' + (f.x).toFixed(1) + 'px,' + (f.y - (calm() ? 0 : f.t * 70)).toFixed(1) + 'px)';
      f.el.style.opacity = String(Math.max(0, 1 - Math.max(0, f.t - 0.8) / 0.4));
      if (f.t > 1.2) dropFloat(i);
    }
  }
  // A big message in the middle (Arabic words, whole), removed on the game clock.
  var popupGen = 0;
  function popup(html, cls, secs) {
    var el = $('popup'), gen = ++popupGen;
    el.className = 'popup ' + (cls || ''); el.innerHTML = html; el.hidden = false;
    void el.offsetWidth; el.classList.add('show');
    later(secs || 1.5, function () { if (gen === popupGen) el.hidden = true; });
  }

  /* -------------------------------------------------------------- events */
  function gateText(g) { return MG.labels(g).join(' '); }
  function handleEvents() {
    var ev = run.ev;
    for (var i = 0; i < ev.length; i++) {
      var e = ev[i], row;
      switch (e.t) {
        case 'lane': J.whoosh(0.25); break;
        case 'coin':
          J.coin(1 + (e.n % 5)); view.coinGot(run.coins.filter(function (c) { return c.id === e.id; })[0]);
          $('hud-coins').textContent = String(run.runCoins); wiggle($('hud-coins').parentNode);
          break;
        case 'hit':
          J.impact(0.5); J.pop(0.3); view.shake(0.45); view.knock(e.id); streak = 0;
          if (e.lost) float(ltr(MG.MINUS + e.lost), 'bad', view.crowdTop);
          break;
        case 'reveal':
          row = run.rows[e.row];
          if (row.passed === false && run.next === e.row && e.row > 0) J.pop(0.15);
          break;
        case 'gate':
          row = run.rows[e.row];
          view.gatePop(e.row, e.lane, e.after >= e.before);
          if (e.after > e.before) { J.pop(0.7); view.burst(MG.laneX(e.lane), 2, -row.d, { count: 22, speed: 5, life: 0.9 }); }
          else if (e.after < e.before) { J.back(); view.shake(0.2); }
          float(ltr(e.after >= e.before ? '+' + (e.after - e.before) : MG.MINUS + (e.before - e.after)), e.after >= e.before ? 'good' : 'bad', view.crowdTop);
          if (e.best) {
            streak++;
            J.streak(Math.min(8, streak));
            if (streak >= 2 && (streak === 2 || streak % 2 === 0)) popup(PRAISE[Math.min(3, Math.floor(streak / 2) - 1)], 'praise', 1.1);
          } else {
            streak = 0;
            // A learning moment, never a scolding: the best gate is named, in gold.
            if (e.bestLane >= 0) popup('<span class="lbl">الأفضل</span><span class="gate" dir="ltr">' + gateText(row.gates[e.bestLane]) + '</span>', 'hint', 1.6);
          }
          if (coach.on) coach.rows++;
          break;
        case 'quiz':
          row = run.rows[e.row];
          view.gatePop(e.row, e.lane, e.right);
          var eq = ltr(row.q.text.replace('?', String(row.q.ans)));
          if (e.right) {
            J.chime(2); J.pop(1);
            view.burst(MG.laneX(e.lane), 2.4, -row.d, { count: 40, speed: 6, life: 1.2 });
            popup('<b>صح!</b>' + eq, 'right', 1.8);
            float(ltr('+' + (e.after - e.before)), 'good', view.crowdTop);
          } else {
            J.error();
            popup('<b>حاول مرة أخرى</b>' + eq, 'wrong', 2.2);
            if (e.after < e.before) float(ltr(MG.MINUS + (e.before - e.after)), 'bad', view.crowdTop);
          }
          say(row.q.text.replace('?', String(row.q.ans)));
          break;
        case 'rounded': float('≈', 'bad', view.crowdTop); break;
        case 'finish':
          J.whoosh(0.8); $('pointer').hidden = true; $('coach').hidden = true;
          popup(ltr('<b class="mine">' + e.count + '</b> ' + (e.count > e.rival ? '&gt;' : e.count < e.rival ? '&lt;' : '=') + ' <b class="foe">' + e.rival + '</b>'), 'versus', 1.6);
          break;
        case 'clash': J.pop(Math.random()); if (!calm()) view.burst(0, 0.8, -(run.battleD + 5), { count: 3, speed: 4, life: 0.7, size: 0.14 }); break;
        case 'won':
          J.levelUp(); view.shake(0.3);
          for (var k = 0; k < 3; k++) view.burst(-3 + k * 3, 2.5, -(run.battleD + 5), { count: 30, speed: 6, up: 0.9, life: 1.4 });
          popup('<b>فزت!</b>', 'right', 1.2);
          $('rivalNum').hidden = true;
          break;
        case 'lost': J.fail(); popup('<b>' + (e.left === 0 && e.theirs === 0 ? 'تعادل!' : 'قريب!') + '</b>', 'wrong', 1.6); break;
        case 'step':
          J.coin(Math.min(5, 1 + Math.floor(e.k / 2)));
          var mc = $('multChip'); mc.hidden = false; mc.textContent = '×' + e.k; wiggle(mc);
          if (e.k === e.goal && e.k === MG.STEPS) { J.chime(3); view.burst(0, MG.STEPS * 0.5 + 1.5, -(run.battleD + 12 + 15), { count: 40, speed: 6, life: 1.4 }); }
          break;
        case 'done': finishLevel(); break;
      }
    }
    ev.length = 0;
  }

  // The result is saved the moment the level ends, before the celebration.
  function finishLevel() {
    var res = run.result, before = save.coins, prevStars = save.stars[cur];
    var out = MG.applyResult(save, cur, res);
    persist();
    dda.result(MG.outcome(res));
    result = { res: res, out: out, before: before, prevStars: prevStars, next: cur < MG.LEVELS_N - 1 && MG.isOpen(save, cur + 1) };
    later(res.won ? 0.4 : 0.2, showResult);
  }
  function showResult() {
    var r = result, res = r.res;
    resultT = 0; resultLock = 0.6;
    $('res-title').textContent = !res.won ? 'حاول مرة أخرى!' : res.stars >= 3 ? 'مذهل!' : res.stars === 2 ? 'رائع!' : 'فزت!';
    $('res-stars').querySelectorAll('.star').forEach(function (s) { s.classList.remove('on', 'pop'); });
    $('res-stars').querySelectorAll('.cap').forEach(function (c, i) { c.classList.toggle('got', [res.won, res.big, res.won && res.allRight][i]); });
    $('res-count').textContent = String(res.count); $('res-rival').textContent = String(res.rival);
    $('res-cmp').innerHTML = res.count > res.rival ? '&gt;' : res.count < res.rival ? '&lt;' : '=';
    $('res-coins').textContent = '+0';
    $('res-mult').textContent = '×' + Math.max(1, res.mult); $('res-mult').hidden = !res.won;
    $('res-quiz').textContent = res.right + '/' + res.asked;
    $('res-best').hidden = true; $('res-gift').hidden = true;
    var nextOk = res.won && r.next;
    $('res-next').hidden = !nextOk;
    $('res-again').classList.toggle('play', !nextOk);
    $('result').classList.toggle('lost', !res.won);
    say(res.won ? 'فزت، ' + res.stars + ' من 3 نجوم' : 'حاول مرة أخرى');
    setMode('result');
  }
  // Stars pop in one by one on the game clock, the coins count up, then the rewards.
  function stepResult(dt) {
    var r = result, res = r.res, before = resultT;
    resultT += dt;
    function at(t) { return before < t && resultT >= t; }
    // Each star sits over its goal: the win, a big crowd, every question right.
    var goals = [res.won, res.big, res.won && res.allRight].map(function (g, k) { return g ? k : -1; }).filter(function (k) { return k >= 0; });
    goals.forEach(function (k, i) { if (at(0.3 + i * 0.4)) { $('res-stars').querySelectorAll('.star')[k].classList.add('on', 'pop'); J.star(i + 1); } });
    var k = Math.min(1, Math.max(0, (resultT - 0.2) / 1.1)), c = Math.round(res.coins * k);
    if ($('res-coins').textContent !== '+' + c) { $('res-coins').textContent = '+' + c; if (c % 4 === 0 && c) J.coin(1 + (c / 4 | 0) % 5); }
    if (at(0.5 + res.stars * 0.4)) {
      if (r.out.best) { $('res-best').hidden = false; J.chime(3); view.burst(0, 3, -(run.battleD + 20), { count: 40 }); }
      if (r.out.unlocked.length) {
        var it = r.out.unlocked[r.out.unlocked.length - 1];
        $('res-gift').innerHTML = (it.type === 'color' ? colorPic(MG.COLORS[it.i]) : hatPic(MG.HATS[it.i])) + '<span>جديد!</span>';
        $('res-gift').hidden = false; J.chime(2);
      }
    }
  }
  function next() {
    if (!result) return;
    if (result.res.won && result.next) { J.select(); startLevel(cur + 1); } else again();
  }
  function again() { if (result) restart(); }

  /* -------------------------------------------------------------- input */
  // A mouse click hands the keyboard back to the game; keyboard activation keeps focus.
  // The second click of a double click is dropped (it would land on the next screen).
  function on(el, fn) {
    el.addEventListener('click', function (e) { e.stopPropagation(); if (e.detail > 1) return; Kit.audio.unlock(); if (e.detail > 0) { el.blur(); focusGame(); } fn(e); });
  }
  on($('btnPlay'), play);
  on($('btn-map'), function () { J.select(); toMap(); });
  on($('btn-wardrobe'), function () { openWardrobe('title'); });
  on($('map-home'), function () { J.back(); toTitle(); });
  on($('map-wardrobe'), function () { openWardrobe('map'); });
  on($('wardrobe-back'), closeWardrobe);
  on($('btnPause'), function () { pause(true); });
  on($('btnResume'), resume);
  on($('btnRestart'), function () { if (mode === 'paused') restart(); });
  on($('btnQuit'), function () { if (mode === 'paused') quit(); });
  on($('res-next'), function () { if (mode === 'result' && resultLock <= 0) next(); });
  on($('res-again'), function () { if (mode === 'result' && resultLock <= 0) again(); });
  on($('res-map'), function () { if (mode === 'result' && resultLock <= 0) { J.back(); toMap(); } });
  on($('res-gift'), function () { if (mode === 'result') openWardrobe('map'); });

  function laneOf(e) { return view.laneAt(e.clientX / Math.max(1, window.innerWidth)); }
  canvas.addEventListener('pointerdown', function (e) {
    focusGame();
    if (e.button !== 0 || mode !== 'play') return;
    ptr.down = true; ptr.lane = laneOf(e); ptr.fresh = true;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!ptr.down || mode !== 'play') return;
    var l = laneOf(e);
    if (l !== ptr.lane) { ptr.lane = l; ptr.fresh = true; }
  });
  function release() { ptr.down = false; }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('lostpointercapture', release);
  function handleKeys() {
    var K = Kit.keys, go = K.anyPressed(GO), esc = K.pressed('Escape');
    if (mode === 'title') { if (go) play(); }
    else if (mode === 'map') { if (go) { J.select(); startLevel(MG.nextLevel(save)); } else if (esc) { J.back(); toTitle(); } }
    else if (mode === 'wardrobe') { if (go || esc) closeWardrobe(); }
    else if (mode === 'play') { if (K.anyPressed(['KeyP', 'Escape'])) pause(true); }
    else if (mode === 'paused') { if (K.anyPressed(['KeyP', 'Escape', 'Enter', 'NumpadEnter', 'Space'])) resume(); else if (K.pressed('KeyR')) restart(); }
    else if (mode === 'result' && resultLock <= 0) {
      if (go) next();
      else if (K.pressed('KeyR')) again();
      else if (esc) { J.back(); toMap(); }
    }
  }
  function inputs() {
    var K = Kit.keys, mv = (K.anyPressed(RIGHT) ? 1 : 0) - (K.anyPressed(LEFT) ? 1 : 0), inp = { move: mv, lane: null };
    if (mv) ptr.fresh = false;
    else if (ptr.fresh) { inp.lane = ptr.lane; ptr.fresh = false; }
    return inp;
  }

  /* --------------------------------------------------------------- HUD */
  function updateHud() {
    var k = Math.round(MG.progress(run) * 400) / 400;
    $('trip-fill').style.width = (k * 100).toFixed(1) + '%';
    $('trip-me').style.left = 'calc(' + (k * 100).toFixed(1) + '% - 24px)';
  }
  function placeLabels() {
    var num = $('crowdNum');
    if (!(mode === 'play' || mode === 'paused' || mode === 'result') || !run) { num.hidden = true; $('rivalNum').hidden = true; $('pointer').hidden = true; return; }
    var B = run.battle, count = B && !B.won ? B.ours : run.count;
    if (run.phase === 'stairs' && run.stairs) count = run.stairs.left;
    if (count !== shown) {
      var up = count > shown && shown >= 0, nb = num.firstChild;
      nb.classList.remove('up', 'down'); void nb.offsetWidth;
      if (shown >= 0 && !B) nb.classList.add(up ? 'up' : 'down');
      nb.textContent = String(count); shown = count;
    }
    var p = uiPoint(view.crowdTop);
    num.hidden = p.behind || run.phase === 'done' && mode === 'result' && !run.result.won;
    num.style.transform = 'translate(' + p.x.toFixed(1) + 'px,' + p.y.toFixed(1) + 'px)';
    var rv = $('rivalNum'), rt = view.rivalTop, showRival = rt.on && (run.battleD - run.d < 70) && !(B && B.done && B.won);
    if (showRival) {
      var q = uiPoint(rt);
      rv.hidden = q.behind;
      rv.firstChild.textContent = String(B ? B.theirs : run.rival);
      rv.style.transform = 'translate(' + q.x.toFixed(1) + 'px,' + q.y.toFixed(1) + 'px)';
    } else rv.hidden = true;
    // The first level, the first two gate rows: an arrow over the best gate.
    var pt = $('pointer'), row = run.rows[run.next];
    if (coach.on && coach.rows < 2 && row && row.shown && row.kind === 'gate' && run.phase === 'run' && row.d - run.d < 40) {
      var a = uiPoint({ x: MG.laneX(row.best), y: 3.9, z: -row.d });
      pt.hidden = a.behind; pt.style.transform = 'translate(' + a.x.toFixed(1) + 'px,' + a.y.toFixed(1) + 'px)';
    } else pt.hidden = true;
  }

  /* ---------------------------------------------------------------- loop */
  function stepPlay(dt) {
    MG.step(run, dt, inputs());
    handleEvents();
    if (mode !== 'play') return;
    updateHud();
    if (!$('coach').hidden) { coach.t += dt; if (coach.t > (coach.on ? 9 : 6) || coach.rows >= 2) { $('coach').classList.add('out'); later(0.5, function () { $('coach').hidden = true; }); coach.t = -99; } }
  }
  function update(dt) {
    if (mode !== 'paused') time += dt;
    handleKeys();
    if (mode === 'play') stepPlay(dt);
    else if (mode === 'result') {
      stepResult(dt); if (resultLock > 0) resultLock -= dt;
      if (run && run.phase !== 'done') { MG.step(run, dt, {}); handleEvents(); }
    }
    if (mode !== 'paused') {
      for (var i = timers.length - 1; i >= 0; i--) { var q = timers[i]; q.t -= dt; if (q.t <= 0) { timers.splice(i, 1); q.fn(); } }
      stepFloats(dt);
      dirty = true;
    }
    Kit.keys.endFrame();
  }
  function render() {
    if (!view || contextLost || (!dirty && mode === 'paused')) return;
    var now = performance.now();
    if (mode === 'play' && lastFrame && view.frameTime(now - lastFrame)) layout();
    lastFrame = now;
    var dt = Math.max(0, Math.min(0.1, time - viewTime));
    viewTime = time;
    var playing = mode === 'play' || mode === 'paused' || mode === 'result';
    view.update({ mode: playing && run ? 'play' : mode === 'wardrobe' ? 'wardrobe' : 'menu', run: playing && run ? run : menuRun, dt: dt, t: time, tier: run ? run.tier : 2, snap: snap });
    snap = false;
    view.render();
    placeLabels();
    dirty = false;
  }
  function layout() {
    var w = window.innerWidth, h = window.innerHeight;
    uiS = Math.min(w / 1280, h / 720); uiL = (w - 1280 * uiS) / 2; uiT = (h - 720 * uiS) / 2;
    ui.style.transform = 'scale(' + uiS + ')'; ui.style.left = uiL + 'px'; ui.style.top = uiT + 'px';
    if (view) view.resize(w, h);
    dirty = true;
    if (mode === 'paused' && view) { view.update({ mode: 'play', run: run, dt: 0, t: time, tier: run.tier }); view.render(); placeLabels(); dirty = false; }
  }

  /* ------------------------------------------------- test and debug hook */
  function rowInfo(row) {
    if (!row) return null;
    return { i: row.i, kind: row.kind, d: row.d, shown: row.shown, passed: row.passed, best: row.best, pick: row.pick,
      labels: row.gates ? row.gates.map(gateText) : null, answers: row.answers ? row.answers.slice() : null,
      ans: row.q ? row.q.ans : null, text: row.q ? row.q.text : null,
      results: row.gates && run ? row.gates.map(function (g) { return MG.pass(g, run.count); }) : null };
  }
  function snapshot() {
    var r = run;
    return {
      screen: mode, paused: mode === 'paused', level: cur, attempt: attempt, world: r ? r.world : 0, tier: r ? r.tier : 0,
      lane: r ? r.lane : 1, x: r ? Math.round(r.x * 1000) / 1000 : 0, d: r ? Math.round(r.d * 1000) / 1000 : 0, t: r ? Math.round(r.t * 1000) / 1000 : 0,
      count: r ? r.count : 0, par: r ? r.par : 0, rival: r ? r.rival : 0, phase: r ? r.phase : '', runCoins: r ? r.runCoins : 0,
      coins: save.coins, passed: r ? r.next : 0, rows: r ? r.R : 0, next: r ? rowInfo(r.rows[r.next]) : null,
      asked: r ? r.asked : 0, right: r ? r.right : 0, hits: r ? r.hits : 0, battleD: r ? r.battleD : 0,
      obstacles: r ? r.obs.map(function (o) { return { d: o.d, lanes: o.lanes.slice(), kind: o.kind, passed: o.passed, hit: o.hit }; }) : [],
      result: result ? { won: result.res.won, stars: result.res.stars, count: result.res.count, coins: result.res.coins, best: result.out.best } : null,
      popup: $('popup').hidden ? '' : $('popup').textContent, calm: !!(view && view.calm), glyphs: view ? view.glyphCount() : 0,
      calls: view ? view.renderer.info.render.calls : 0, triangles: view ? view.renderer.info.render.triangles : 0, programs: view && view.renderer.info.programs ? view.renderer.info.programs.length : 0
    };
  }

  /* ---------------------------------------------------------------- init */
  Kit.muteButton();
  Kit.lifecycle({ pause: function () { pause(false); }, reset: function () { ptr.down = false; ptr.fresh = false; } });
  Kit.motion.onChange(function (r) { if (view) view.calm = r; dirty = true; });
  window.addEventListener('resize', layout);
  window.addEventListener('pageshow', function () { dirty = true; });
  canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); contextLost = true; pause(false); $('context-notice').hidden = false; });
  canvas.addEventListener('webglcontextrestored', function () { contextLost = false; $('context-notice').hidden = true; snap = true; dirty = true; if (view) view.rebake(); layout(); });
  var loop = null;
  try {
    view = MG.createView(canvas, { lq: LQ });
    view.calm = calm();
    view.setLook(save.color, save.hat);
    view.reset(menuRun);
    // Numbers drawn into the atlas are drawn again once the font is there.
    if (document.fonts && document.fonts.load) document.fonts.load('700 40px Fredoka', 'صح 0123456789+×÷').then(function () { view.rebake(); dirty = true; }, function () { /* fallback fonts */ });
    buildMap(); buildWardrobe();
    layout(); toTitle(); render();
    window.__game = {
      get state() { return snapshot(); },
      get save() { return JSON.parse(JSON.stringify(save)); },
      // Where a world point is on the page, for tests that aim the real mouse.
      point: function (x, y, z) { var p = view.project(x, y, z || 0); return { x: p.x * window.innerWidth, y: p.y * window.innerHeight }; },
      lanePoint: function (l) { var p = view.lanePoint(l); return { x: p.x * window.innerWidth, y: p.y * window.innerHeight }; }
    };
    loop = Kit.loop(update, render);
    Kit.ready();
  } catch (error) {
    if (loop) loop.stop();
    for (var k in SCREENS) $(SCREENS[k]).hidden = true;
    $('error-screen').hidden = false;
    body.dataset.mode = 'error';
    Kit.fail(error);
  }
})();
