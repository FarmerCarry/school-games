/* Shortcut Factory (مصنع الاختصارات): screens, the mouse and the real keyboard shortcuts,
 * the shortcut demos, the coach (glowing keys and a pointing hand), effects, saves and sound.
 * engine.js runs the factory; art.js draws it. This is the UI layer: it reads Kit.dda when a
 * level starts (belt speed, the clock, the gremlin) and reports each finished or timed-out
 * level back to it.
 * Shortcuts are matched by KeyboardEvent.code plus Ctrl (or ⌘), so Ctrl+C is KeyC even while
 * Windows types Arabic and event.key is «ؤ». Only the factory's own shortcuts are taken:
 * Ctrl+W, Ctrl+T, Ctrl+N, Ctrl+P, Ctrl+R and F5 stay the browser's. */
(function () {
  'use strict';
  const SF = window.SF, A = SF.art, J = Kit.juice, W = SF.W, H = SF.H, BOX = SF.BOX;
  const $ = id => document.getElementById(id);
  const canvas = $('game'), ui = $('ui');
  const calm = () => Kit.motion.reduced();
  let dirty = true, ps = 1;
  const pxScale = v => Math.min(2, Math.max(0.5, Math.round(v.scale * v.dpr * 4) / 4));
  const view = Kit.fit(canvas, W, H, { maxDpr: 1.5, onResize: v => {
    ui.style.left = canvas.style.left; ui.style.top = canvas.style.top; ui.style.transform = 'scale(' + v.scale + ')';
    ps = pxScale(v); A.setScale(ps); dirty = true;
  } });
  const fx = Kit.particles(), shake = Kit.shake();
  const COPIER = { x: 1182, y: 296 }, BIN = { x: 92, y: 330 }, KB = { x: 226, y: 536, u: 36 };
  const SHEET = { x: 440, y: 112, w: 400, h: 356 };
  const ease = k => k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
  const back = k => { const c = 1.9; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };

  /* ---------------------------------------------------------------- save */
  const store = Kit.store('shortcut-factory');
  const saveStatus = Kit.saveStatus({ retry: persist });
  let save = SF.loadSave(store.get('save', null));
  function persist() {
    if (store.set('save', save) === false) { saveStatus.failed(); return false; }
    saveStatus.saved();
    return true;
  }
  // One difficulty for the whole factory, kept on this PC by Kit.
  const dda = Kit.dda('shortcut-factory', { id: 'main' });

  /* --------------------------------------------------------------- state */
  let screen = 'title', world = null, li = 0, time = 0, demo = null, ending = 0, result = null, resultT = 0, resultLock = 0;
  let idle = 0, hint = null, streak = 0, lastOk = -9, stampAnim = -1, sheetT = 0, typing = 0, tier = 1, menuOff = 0;
  const queue = [], held = {}, demoSeen = {};
  let floats = [], flyers = [], poofs = [], toast = null;
  let appear = {}, flash = {}, boxShake = {};
  const bump = { copier: 0, bin: 0 }, mood = { m: '', t: 0 }, hand = { on: false, x: 0, y: 0, t: 0 };

  /* ------------------------------------------------------------ screens */
  const SCREENS = { title: 'scrTitle', map: 'scrMap', shop: 'scrShop', pause: 'scrPause', result: 'scrResult' };
  function setScreen(name) {
    screen = name;
    for (const k in SCREENS) $(SCREENS[k]).hidden = k !== name;
    $('hud').hidden = name !== 'play';
    dirty = true;
    if (name === 'play') focusGame();
  }
  function focusGame() { try { canvas.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  function say(text) { $('live').textContent = text; }
  function chip(id, n) { $(id).querySelector('b').textContent = String(n); }
  function toTitle() {
    world = null;
    chip('titleStars', SF.totalStars(save) + '/' + SF.COUNT * 3);
    setScreen('title');
  }
  function play() {
    J.select();
    // A child who has never shipped a box goes straight to the first level.
    if (!SF.totalStars(save)) startLevel(0); else toMap();
  }

  /* ---------------------------------------------------------------- map */
  const levelBtns = [], worldCards = [];
  function keysHtml(act) {
    return SF.ACTS[act].keys.map(k => '<span class="sg-key">' + k + '</span>').join('+');
  }
  function buildMap() {
    const box = $('worlds');
    SF.WORLDS.forEach((Wd, wi) => {
      const row = document.createElement('div');
      row.className = 'wrow'; row.style.top = (92 + wi * 124) + 'px';
      const card = document.createElement('div');
      card.className = 'wcard'; card.style.background = Wd.color;
      card.innerHTML = '<b>' + Wd.name + '</b><span class="wkeys" dir="ltr">' + keysHtml(Wd.acts[0]) + '<i class="gap"></i>' + keysHtml(Wd.acts[1]) +
        '</span><span class="wst"><svg aria-hidden="true"><use href="#i-star"/></svg><i>0</i></span>';
      row.appendChild(card); worldCards.push(card);
      for (let n = 0; n < SF.PER_WORLD; n++) {
        const i = SF.levelOf(wi, n), L = SF.LEVELS[i], b = document.createElement('button');
        b.type = 'button'; b.className = 'sf-btn lvl';
        // Right to left like Arabic reading: a world's first level is next to its card.
        b.style.left = (822 - n * 126) + 'px';
        const t = L.teach[0], tag = t ? '<span class="tag">' + SF.ACTS[t].keys.join('+') + '</span>' : '';
        const ico = L.time ? '<span class="ico"><svg aria-hidden="true"><use href="#i-clock"/></svg></span>' : L.gremlin ? '<span class="ico"><svg aria-hidden="true"><use href="#i-gremlin"/></svg></span>' : '';
        b.innerHTML = tag + '<span class="num">' + (n + 1) + '</span><span class="st">' + '<svg><use href="#i-star"/></svg>'.repeat(3) + '</span>' + ico +
          '<span class="lock"><svg aria-hidden="true"><use href="#i-lock"/></svg></span>';
        on(b, () => pickLevel(i, b));
        row.appendChild(b); levelBtns.push(b);
      }
      box.appendChild(row);
    });
  }
  function refreshMap() {
    const next = SF.nextLevel(save);
    levelBtns.forEach((b, i) => {
      const open = SF.isOpen(save, i), st = save.stars[i];
      b.classList.toggle('locked', !open);
      b.classList.toggle('next', open && i === next);
      b.querySelectorAll('.st svg').forEach((s, k) => s.classList.toggle('on', k < st));
      b.setAttribute('aria-label', 'المرحلة ' + SF.LEVELS[i].id + (open ? '، ' + st + ' من 3 نجوم' : ' (مقفلة)'));
    });
    worldCards.forEach((c, wi) => {
      c.querySelector('.wst i').textContent = SF.worldStars(save, wi) + '/' + SF.PER_WORLD * 3;
      c.classList.toggle('locked', !SF.isOpen(save, SF.levelOf(wi, 0)));
    });
    chip('mapCoins', save.coins);
    chip('mapStars', SF.totalStars(save) + '/' + SF.COUNT * 3);
  }
  function toMap() { world = null; refreshMap(); setScreen('map'); J.whoosh(0.4); }
  function wiggle(el) { el.classList.remove('wiggle'); void el.offsetWidth; el.classList.add('wiggle'); setTimeout(() => el.classList.remove('wiggle'), 500); }
  function pickLevel(i, el) {
    if (!SF.isOpen(save, i)) { J.error(); wiggle(el); return; }
    J.select(); startLevel(i);
  }

  /* --------------------------------------------------------------- shop */
  const tiles = [];
  function buildShop() {
    [['hat', SF.HATS, 'hats'], ['color', SF.COLORS, 'colors']].forEach(([type, list, box]) => {
      list.forEach(item => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'sf-btn tile';
        b.innerHTML = '<canvas width="192" height="192"></canvas><b>' + item.name + '</b><span class="price"><i class="coin"></i><em></em></span>';
        on(b, () => buy(type, item, b));
        $(box).appendChild(b);
        tiles.push({ b: b, type: type, item: item });
      });
    });
  }
  function drawTile(t) {
    const c = t.b.querySelector('canvas'), g = c.getContext('2d');
    g.setTransform(2, 0, 0, 2, 0, 0); g.clearRect(0, 0, 96, 96);
    if (t.type === 'hat') {
      A.circle(g, 48, 62, 30); A.fill(g, '#ffd2a8'); A.ink(g, 4);
      A.ell(g, 38, 60, 4, 5); A.fill(g, A.INK); A.ell(g, 58, 60, 4, 5); A.fill(g, A.INK);
      g.beginPath(); g.moveTo(40, 74); g.quadraticCurveTo(48, 81, 56, 74); A.ink(g, 3);
      g.save(); g.translate(48, 40); g.scale(0.72, 0.72); A.hat(g, t.item.id, 0, 0, 0, true); g.restore();
    } else {
      const T = A.theme(t.item.id);
      A.rr(g, 6, 6, 84, 84, 18); g.save(); g.clip();
      g.fillStyle = T.wall; g.fillRect(6, 6, 84, 50); g.fillStyle = T.wall2; g.fillRect(20, 6, 14, 50); g.fillRect(52, 6, 14, 50);
      g.fillStyle = T.floor; g.fillRect(6, 56, 84, 34); g.fillStyle = T.desk; g.fillRect(6, 78, 84, 12);
      g.restore(); A.rr(g, 6, 6, 84, 84, 18); A.ink(g, 4);
      A.circle(g, 48, 58, 16); A.fill(g, T.suit); A.ink(g, 3.5);
      A.rr(g, 10, 22, 76, 8, 4); A.fill(g, T.pipe); A.ink(g, 2.5);
    }
  }
  function refreshShop() {
    tiles.forEach(t => {
      const owned = (t.type === 'hat' ? save.hats : save.colors).indexOf(t.item.id) >= 0, wearing = save[t.type] === t.item.id;
      t.b.classList.toggle('owned', owned);
      t.b.classList.toggle('on', wearing);
      t.b.classList.toggle('poor', !owned && save.coins < t.item.price);
      t.b.querySelector('em').textContent = wearing ? '✓' : owned ? '✓' : String(t.item.price);
      t.b.setAttribute('aria-label', t.item.name + (wearing ? ' (تلبسها)' : owned ? '' : '، السعر ' + t.item.price));
      if (!t.drawn) { drawTile(t); t.drawn = true; }
    });
    chip('shopCoins', save.coins);
    drawPreview();
  }
  function drawPreview() {
    const c = $('preview'), g = c.getContext('2d'), T = A.theme(save.color), k = c.width / 300;
    g.setTransform(k, 0, 0, k, 0, 0); g.clearRect(0, 0, 300, 400);
    g.fillStyle = T.wall; g.fillRect(0, 0, 300, 400);
    for (let x = -20; x < 300; x += 96) { g.fillStyle = T.wall2; g.fillRect(x, 0, 44, 400); }
    g.fillStyle = T.floor; g.fillRect(0, 300, 300, 100);
    A.worker(g, 140, 370, { hat: save.hat, theme: save.color, mood: 'happy', t: 0, still: true });
  }
  function openShop() { J.select(); refreshShop(); setScreen('shop'); }
  function closeShop() { toTitle(); }
  function buy(type, item, el) {
    const r = SF.buy(save, type, item.id);
    if (r === 'poor') { J.error(); wiggle(el); return; }
    persist();
    if (r === 'bought') { J.coin(3); J.levelUp(); const p = centerOf(el); if (p) burst(p.x, p.y, 30); }
    else J.toggle(true);
    A.reset();
    refreshShop();
  }

  /* -------------------------------------------------------------- level */
  function startLevel(i) {
    li = i;
    // Difficulty is read at every level start: the belts' speed, the clock, the gremlin.
    tier = dda.tier;
    world = SF.create(i, {
      seed: (Math.random() * 2147483647) | 0, speed: Math.round(dda.value(10, 58)),
      timeScale: dda.value(1.45, 0.85), parScale: dda.value(1.6, 1), gremlinEvery: dda.value(28, 12)
    });
    const def = world.def;
    // A new shortcut is shown once per visit; Restart and Play again go straight to work.
    demo = def.teach.length && !demoSeen[i] ? { acts: def.teach, t: 0, dur: def.teach.length > 1 ? 4.4 : 3 } : null;
    demoSeen[i] = true;
    ending = 0; result = null; idle = 0; hint = SF.hint(world); streak = 0; stampAnim = -1; sheetT = 0; typing = 0;
    queue.length = 0; floats = []; flyers = []; poofs = []; toast = null; appear = {}; flash = {}; boxShake = {};
    bump.copier = bump.bin = 0; mood.m = ''; mood.t = 0; hand.on = false;
    fx.clear(); Kit.keys.reset();
    say('المرحلة ' + def.id);
    setScreen('play');
    J.whoosh(0.5);
  }
  function endDemo() { if (!demo) return; demo = null; idle = 0; J.tap(); }
  function pause(own) {
    if (screen !== 'play') return;
    setScreen('pause');
    if (own) J.back();
  }
  function resume() {
    if (screen !== 'pause') return;
    J.select();
    setScreen('play');
    Kit.keys.reset();
  }
  function restart() { J.select(); startLevel(li); }
  function quitToMap() { J.back(); toMap(); }

  /* ------------------------------------------------------------ result */
  function finishLevel() {
    const w = world;
    ending = 0;
    const res = SF.applyResult(save, w);
    persist();
    dda.result(SF.outcome(w));
    const fail = w.phase !== 'done', Wd = SF.WORLDS[w.def.world];
    result = { res: res, fail: fail };
    resultT = 0; resultLock = 0.6;
    $('resTitle').textContent = fail ? 'انتهى الوقت!' : w.def.id + ' · ' + Wd.name;
    // This day's stars pop in one by one; «رقم جديد!» when they beat the best.
    $('resStars').querySelectorAll('svg').forEach(s => { s.classList.remove('on', 'pop'); });
    $('resCoins').textContent = '+' + res.coins;
    $('resBoxes').textContent = w.done + '/' + w.total;
    $('resTime').textContent = fmt(w.t);
    $('resBest').hidden = true; $('resNew').hidden = true;
    // Enter: the next level; after the very last one, the map; after a day that ran out, again.
    const go = fail ? 'again' : w.li + 1 < SF.COUNT ? 'next' : 'map';
    result.go = go;
    $('resNext').querySelector('use').setAttribute('href', '#i-' + go);
    $('resNext').setAttribute('aria-label', { next: 'المرحلة التالية', again: 'العب مرة أخرى', map: 'المراحل' }[go]);
    $('resEnterLabel').textContent = { next: 'التالي', again: 'مرة أخرى', map: 'المراحل' }[go];
    $('resAgain').hidden = go === 'again';
    $('resMap').hidden = go === 'map';
    say(fail ? 'انتهى الوقت' : res.stars + ' نجوم');
    setScreen('result');
  }
  function resultStep(dt) {
    const r = result, before = resultT;
    resultT += dt;
    if (resultLock > 0) resultLock -= dt;
    if (r.fail) return;
    const at = t => before < t && resultT >= t;
    for (let i = 0; i < r.res.stars; i++) {
      if (at(0.3 + i * 0.38)) {
        const s = $('resStars').children[i]; s.classList.add('on', 'pop'); J.star(i + 1);
        burst(520 + i * 120, 200, 18);
      }
    }
    const t1 = 0.4 + r.res.stars * 0.38;
    if (r.res.best && at(t1)) { $('resBest').hidden = false; J.chime(2); confetti(); }
    if (r.res.unlocked >= 0 && at(t1 + 0.3)) { $('resNew').hidden = false; J.levelUp(); }
  }
  function resultNext() {
    if (!result) return;
    J.select();
    if (result.go === 'map') toMap(); else startLevel(result.go === 'next' ? li + 1 : li);
  }
  function resultAgain() { if (result) { J.select(); startLevel(li); } }
  function fmt(s) { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

  /* --------------------------------------------------------------- input */
  function on(el, fn) {
    el.addEventListener('click', e => { e.stopPropagation(); if (e.detail > 1) return; Kit.audio.unlock(); if (e.detail > 0) { el.blur(); focusGame(); } fn(e); });
  }
  on($('btnPlay'), play);
  on($('btnLevels'), () => { J.select(); toMap(); });
  on($('btnShop'), openShop);
  on($('mapHome'), () => { J.back(); toTitle(); });
  on($('shopBack'), () => { J.back(); closeShop(); });
  on($('btnPause'), () => pause(true));
  on($('btnResume'), resume);
  on($('btnRestart'), restart);
  on($('btnMenu'), quitToMap);
  on($('resNext'), () => { if (resultLock <= 0) resultNext(); });
  on($('resAgain'), () => { if (resultLock <= 0) resultAgain(); });
  on($('resMap'), () => { if (resultLock <= 0) { J.back(); toMap(); } });

  const CTRL = { KeyC: 'copy', KeyV: 'paste', KeyX: 'cut', KeyZ: 'undo', KeyY: 'redo', KeyA: 'all', KeyS: 'save' };
  const ARROWS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
  const typingIn = t => !!(t && (t.isContentEditable || (t.closest && t.closest('input, textarea, select'))));
  function push(a) { if (queue.length < 30) queue.push(a); idle = 0; }
  // Tab moves the factory's selection while a level is on; in the menus it moves focus.
  Kit.keys.captureTab(() => screen === 'play');
  window.addEventListener('keydown', e => {
    held[e.code] = true;
    if (e.isComposing || typingIn(e.target)) return;
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      const act = CTRL[e.code];
      if (!act) return;
      // The page must not select its text, save itself or paste: the factory does it.
      e.preventDefault();
      if (screen === 'play' && !e.repeat) push({ t: e.code === 'KeyZ' && e.shiftKey ? 'redo' : act });
      return;
    }
    if (screen !== 'play' || !Kit.isGameKeyEvent(e)) return;
    const c = e.code;
    if (c === 'Delete' || c === 'Backspace') { e.preventDefault(); if (!e.repeat) push({ t: 'del' }); }
    else if (c === 'Enter' || c === 'NumpadEnter') { e.preventDefault(); if (!e.repeat) push({ t: 'enter' }); }
    else if (c === 'Tab') { e.preventDefault(); if (!e.repeat) push({ t: 'tab' }); }
    else if (ARROWS[c]) { e.preventDefault(); push({ t: 'move', dir: ARROWS[c], add: e.shiftKey }); }
    else if (c === 'Space' && demo) push({ t: 'enter' });
  });
  window.addEventListener('keyup', e => { held[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in held) held[k] = false; });
  canvas.addEventListener('pointerdown', e => {
    focusGame();
    if (e.button !== 0 || screen !== 'play') return;
    const p = view.toLogical(e.clientX, e.clientY);
    push({ t: 'click', x: p.x, y: p.y, add: e.shiftKey || e.ctrlKey || e.metaKey });
  });
  function handleKeys() {
    const K = Kit.keys, go = K.anyPressed(['Enter', 'NumpadEnter', 'Space']);
    if (screen === 'title') { if (go) play(); }
    else if (screen === 'map') { if (go) { J.select(); startLevel(SF.nextLevel(save)); } else if (K.pressed('Escape')) { J.back(); toTitle(); } }
    else if (screen === 'shop') { if (K.pressed('Escape')) { J.back(); closeShop(); } }
    else if (screen === 'play') { if (K.anyPressed(['KeyP', 'Escape'])) pause(true); }
    else if (screen === 'pause') { if (K.anyPressed(['KeyP', 'Escape', 'Enter', 'NumpadEnter', 'Space'])) resume(); else if (K.pressed('KeyR')) restart(); }
    else if (screen === 'result' && resultLock <= 0) {
      if (go) resultNext(); else if (K.pressed('KeyR')) resultAgain();
      else if (K.pressed('Escape')) { J.back(); toMap(); }
    }
  }

  /* ------------------------------------------------------------- actions */
  const KEYED = { copy: 1, paste: 1, cut: 1, del: 1, undo: 1, redo: 1, all: 1, save: 1, ship: 1, tab: 1 };
  function onBadge(w, c, x, y) { return Math.hypot(x - (c.x + 108), y - (BOX.y + 10)) < 40; }
  function doAct(a) {
    const w = world;
    if (w.phase !== 'play' && w.phase !== 'stamp') return;
    if (a.t === 'click') {
      // The day's sheet, a ready box's Enter button, then the toys and boxes.
      if (w.phase === 'stamp') {
        if (a.x > SHEET.x && a.x < SHEET.x + SHEET.w && a.y > SHEET.y && a.y < SHEET.y + SHEET.h) act({ t: 'save' }, true);
        return;
      }
      const b = SF.boxes(w).find(c => SF.ready(w, c) && onBadge(w, c, a.x, a.y));
      if (b) { act({ t: 'ship', con: b.i }, true); return; }
      act({ t: 'click', x: a.x, y: a.y, add: a.add }, true);
      return;
    }
    // The day's sheet is stamped with Ctrl+S, not Enter: show which keys.
    if (a.t === 'enter' && w.phase === 'stamp') { J.error(); float(640, SHEET.y + 300, 'Ctrl + S', '#ffd23f', 44); idle = 9; return; }
    act(a.t === 'enter' ? { t: 'ship' } : a, false);
  }
  function act(a, mouse) {
    const r = SF.act(world, a);
    if (KEYED[a.t] && !mouse) {
      toast = { act: a.t, ok: r === 'ok' || r === 'early', t: 0 };
      typing = 1;
      if (r === 'ok' && a.t !== 'tab') {
        streak = time - lastOk < 2.2 ? streak + 1 : 1;
        lastOk = time;
        if (streak >= 3) J.streak(Math.min(12, streak - 1));
      }
    }
    handleEvents();
  }

  /* ------------------------------------------------------------ effects */
  function float(x, y, text, color, size) {
    floats.push({ x: x, y: y, text: text, color: color || '#ffffff', size: size || 34, t: 0 });
    if (floats.length > 12) floats.shift();
  }
  function fly(t, x0, y0, x1, y1, dur, o) {
    o = o || {};
    flyers.push({ k: t.k, b: t.b, x0: x0, y0: y0, x1: x1, y1: y1, t: -(o.delay || 0), dur: dur, s0: o.s0 || 1, s1: o.s1 == null ? 0.6 : o.s1, spin: o.spin || 0, arc: o.arc == null ? 110 : o.arc, poof: !!o.poof });
    if (flyers.length > 30) flyers.shift();
  }
  function poof(x, y, color) { poofs.push({ x: x, y: y, t: 0, color: color || '#ffffff' }); if (poofs.length > 16) poofs.shift(); }
  function burst(x, y, n, colors) { fx.burst(x, y, { count: n, colors: colors || ['#ffd23f', '#ffffff', '#ff7eb6', '#4fd1ff'], speed: 320, life: 0.8, size: 8, gravity: 420 }); }
  function confetti() { if (calm()) return; for (let i = 0; i < 5; i++) burst(160 + i * 240, 120, 22, ['#ff7eb6', '#ffd23f', '#4fd1ff', '#5be38f', '#ffffff']); }
  function setMood(m, t) { mood.m = m; mood.t = t; }
  function centerOf(el) {
    const r = el.getBoundingClientRect();
    return r.width ? view.toLogical(r.left + r.width / 2, r.top + r.height / 2) : null;
  }
  const NOTHING = { copy: 'اختر لعبة أولًا', cut: 'اختر لعبة أولًا', del: 'اختر لعبة أولًا', paste: 'انسخ لعبة أولًا', undo: 'لا شيء للتراجع', redo: 'لا شيء للإعادة', all: 'لا ألعاب هنا' };
  function gremlinY(g) { return g.phase === 'mess' ? 300 : 262; }
  function handleEvents() {
    const w = world;
    for (const e of w.ev) {
      switch (e.t) {
        case 'select': if (e.ids.length) J.tap(); break;
        case 'copy':
          J.select(); bump.copier = 1;
          e.ids.forEach((id, i) => { const f = SF.find(w, id); if (f) { flash[id] = 0.5; fly(w.toys[id], f.x, f.y, COPIER.x, COPIER.y + 48, 0.38, { delay: i * 0.05, s1: 0.5 }); } });
          float(COPIER.x, COPIER.y - 20, 'نُسخت!', '#ffffff', 30);
          break;
        case 'cut':
          J.whoosh(0.6); bump.copier = 1;
          e.toys.forEach((g, i) => { fly(g, g.x, g.y, COPIER.x, COPIER.y + 48, 0.4, { delay: i * 0.05, s1: 0.5, spin: 6 }); poof(g.x, g.y); });
          float(COPIER.x, COPIER.y - 20, 'قُصّت!', '#ffffff', 30);
          break;
        case 'paste':
          J.pop(0.45); bump.copier = 1;
          e.ids.forEach((id, i) => {
            const f = SF.find(w, id), d = 0.3 + i * 0.07;
            if (!f) return;
            appear[id] = -d;
            fly(w.toys[id], COPIER.x, COPIER.y + 48, f.x, f.y, d, { s0: 0.5, s1: 1, arc: 140 });
          });
          break;
        case 'del': {
          J.whoosh(0.35); bump.bin = 1;
          let broken = 0;
          e.toys.forEach((g, i) => { if (g.b) broken++; fly(g, g.x, g.y, BIN.x, BIN.y + 30, 0.45, { delay: i * 0.05, s1: 0.3, spin: 9, arc: 160 }); });
          if (broken) { J.coin(1); float(BIN.x + 20, BIN.y - 10, '♻ رائع!', '#5be38f', 30); }
          break;
        }
        case 'undo': case 'redo':
          J.toggle(e.t === 'redo');
          e.ids.forEach(id => { const f = SF.find(w, id); if (f) { appear[id] = 0; poof(f.x, f.y, '#bfe9ff'); } });
          if (e.bonk) {
            J.impact(0.8); shake.add(6); setMood('happy', 1.4);
            float(w.g.x, gremlinY(w.g) - 70, 'بونك!', '#ffd23f', 46);
            burst(w.g.x, gremlinY(w.g), 24, ['#ffd23f', '#ffffff', '#c79bff']);
          } else if (e.label === 'gremlin' && e.t === 'undo') { setMood('happy', 1); float(640, 300, 'أصلحتها!', '#5be38f', 40); }
          break;
        case 'all': J.chime(1); e.ids.forEach(id => { flash[id] = 0.5; }); break;
        case 'ship': {
          const c = w.cons[e.con];
          J.coin(Math.min(5, e.combo)); J.whoosh(0.7); setMood('happy', 1.3);
          burst(c.x, BOX.y + 40, 26);
          float(c.x, BOX.y - 10, '+2', '#ffd23f', 40);
          if (e.combo > 1) { float(c.x, BOX.y + 40, 'كومبو ×' + e.combo, '#ff7eb6', 40); J.streak(Math.min(12, e.combo + 2)); }
          break;
        }
        case 'wrong':
          J.error(); boxShake[e.con] = 0.6; setMood('oops', 1.2);
          float(w.cons[e.con].x, BOX.y + 20, e.empty ? 'الصندوق فارغ!' : 'ليس بعد!', '#ffffff', 34);
          break;
        case 'full': J.error(); if (e.con >= 0) float(w.cons[e.con].x, BOX.y + 20, 'ممتلئ!', '#ffffff', 34); break;
        case 'nothing': if (NOTHING[e.a]) { J.error(); float(640, 300, NOTHING[e.a], '#ffffff', 34); } break;
        case 'arrive': J.whoosh(0.25); break;
        case 'gremlin': J.hover(); float(1180, 200, '!', '#ff5d6c', 60); break;
        case 'mess':
          J.impact(0.45); shake.add(5); setMood('oops', 1.6);
          poof(w.cons[e.con].x, BOX.y + 60, '#e2d4ff'); poof(w.cons[e.con].x - 60, BOX.y + 80, '#e2d4ff');
          float(w.g.x, gremlinY(w.g) - 80, 'هههه!', '#c79bff', 40);
          break;
        case 'allShipped':
          if (w.phase === 'stamp') { J.chime(2); sheetT = 0; }
          else { J.levelUp(); confetti(); setMood('wow', 2); ending = 1.5; }
          break;
        case 'stamp':
          J.impact(1); shake.add(10); stampAnim = 0; setMood('wow', 2);
          burst(640, SHEET.y + 206, 40, ['#e2364f', '#ffd23f', '#ffffff']);
          ending = 1.7;
          break;
        case 'saved': J.toggle(true); float(640, 300, 'تم الحفظ ✓', '#ffffff', 34); break;
        case 'timeup': J.fail(); setMood('oops', 3); float(640, 260, 'انتهى الوقت!', '#ffffff', 56); ending = 1.6; break;
      }
    }
    w.ev.length = 0;
  }

  /* ----------------------------------------------------------- the coach */
  function keyCenter(code) { const r = A.keyRect(code, KB.x, KB.y, KB.u); return r ? { x: r.x + r.w / 2, y: r.y + r.h / 2 } : null; }
  // The keys that glow on the keyboard: the demo's keys, or the next useful shortcut (always in
  // the first worlds and for an easy PC, after a few idle seconds later on).
  function glowCodes(w) {
    if (demo) { const s = demoStep(); return SF.ACTS[s.act].codes; }
    if (!hint) return [];
    const show = w.def.world <= 1 || tier <= 2 || idle > 4 || w.phase === 'stamp' || hint.act === 'gremlin';
    return show ? SF.ACTS[hint.act].codes : [];
  }
  function handTarget(w) {
    if (!hint || demo || ending || idle < (w.li === 0 ? 2.5 : 6)) return null;
    const h = hint;
    if (h.act === 'select') {
      const f = SF.find(w, h.toy);
      return f && (w.cons[f.con].type === 'box' || SF.visible(f.x)) ? { x: f.x, y: f.y - 4 } : null;
    }
    if (h.act === 'place') return { x: w.cons[h.con].x, y: BOX.y + 76 };
    if (h.act === 'ship') return { x: w.cons[h.con].x + 108, y: BOX.y + 10 };
    const codes = SF.ACTS[h.act].codes;
    return codes.length ? keyCenter(codes[codes.length - 1]) : null;
  }
  function coachStep(dt) {
    const target = handTarget(world);
    if (!target) { hand.on = false; return; }
    if (!hand.on) { hand.on = true; hand.t = 0; hand.x = target.x + 90; hand.y = target.y + 120; }
    hand.t += dt;
    const k = calm() ? 1 : Math.min(1, dt * 7);
    hand.x += (target.x - hand.x) * k; hand.y += (target.y - hand.y) * k;
  }

  /* ----------------------------------------------------------------- loop */
  function playStep(dt) {
    const w = world;
    const list = queue.splice(0, queue.length);
    for (const a of list) {
      if (demo) {
        // A click or Enter only closes the demo; a shortcut closes it and works.
        if (a.t === 'click' || a.t === 'enter') { if (demo.t > 0.3) endDemo(); continue; }
        endDemo();
      }
      if (!ending) doAct(a);
    }
    if (demo) { demo.t += dt; if (demo.t >= demo.dur) endDemo(); return; }
    if (ending > 0) {
      hint = null; hand.on = false;
      w.offset += w.speed * dt;
      ending -= dt;
      if (ending <= 0) finishLevel();
      return;
    }
    SF.step(w, dt);
    handleEvents();
    idle += dt;
    hint = SF.hint(w);
    if (w.phase === 'stamp') sheetT += dt;
    coachStep(dt);
  }
  function decay(dt) {
    for (let i = floats.length - 1; i >= 0; i--) { const f = floats[i]; f.t += dt; f.y -= dt * 40; if (f.t > 1.3) floats.splice(i, 1); }
    for (let i = flyers.length - 1; i >= 0; i--) { const f = flyers[i]; f.t += dt; if (f.t >= f.dur) { if (f.poof) poof(f.x1, f.y1); flyers.splice(i, 1); } }
    for (let i = poofs.length - 1; i >= 0; i--) { poofs[i].t += dt; if (poofs[i].t > 0.45) poofs.splice(i, 1); }
    for (const id in appear) { appear[id] += dt; if (appear[id] > 0.4) delete appear[id]; }
    for (const id in flash) { flash[id] -= dt; if (flash[id] <= 0) delete flash[id]; }
    for (const c in boxShake) { boxShake[c] -= dt; if (boxShake[c] <= 0) delete boxShake[c]; }
    bump.copier = Math.max(0, bump.copier - dt * 4); bump.bin = Math.max(0, bump.bin - dt * 3);
    if (mood.t > 0) { mood.t -= dt; if (mood.t <= 0) mood.m = ''; }
    typing = Math.max(0, typing - dt * 3);
    if (toast) { toast.t += dt; if (toast.t > 1.2) toast = null; }
    if (stampAnim >= 0) stampAnim += dt;
  }
  function update(dt) {
    time += dt;
    handleKeys();
    if (screen === 'play' && world) playStep(dt);
    else if (screen === 'result' && result) resultStep(dt);
    if (screen !== 'pause') {
      menuOff += dt * 60;
      fx.update(dt); shake.update(dt); decay(dt);
      if (fx.list.length > 300) fx.list.splice(0, fx.list.length - 300);
    }
    Kit.keys.endFrame();
  }

  /* --------------------------------------------------------------- render */
  const layers = {};
  // A picture that changes rarely (the HUD, the actions card): drawn only when its key changes.
  function layer(name, w, h, key, draw) {
    let L = layers[name];
    if (!L) L = layers[name] = { c: document.createElement('canvas'), key: null };
    const k = key + '@' + ps;
    if (L.key !== k) {
      L.key = k; L.c.width = Math.ceil(w * ps); L.c.height = Math.ceil(h * ps);
      const g = L.c.getContext('2d');
      g.setTransform(ps, 0, 0, ps, 0, 0);
      draw(g);
    }
    return L.c;
  }
  function drawToy(ctx, w, id, x, y, still, bob) {
    const t = w.toys[id];
    if (!t) return;
    let s = 1;
    const ap = appear[id];
    if (ap != null) { if (ap < 0) return; s = still ? 1 : back(Math.min(1, ap / 0.32)); }
    const sel = w.sel.indexOf(id) >= 0;
    let dy = bob || 0;
    if (sel) {
      const p = still ? 0.6 : (Math.sin(time * 7) + 1) / 2;
      A.circle(ctx, x, y, 44 + p * 3); A.fill(ctx, A.alpha('#ffe14d', 0.5 + 0.2 * p)); A.ink(ctx, 4, '#ffb800');
      dy -= still ? 4 : 4 + p * 4;
    }
    if (flash[id] > 0) { const k = 1 - flash[id] / 0.5; A.circle(ctx, x, y, 40 + k * 30); A.ink(ctx, 5, A.alpha('#ffffff', 1 - k)); }
    A.toy(ctx, t.k, t.b, x, y + dy, s, still || sel ? 0 : Math.sin(time * 5 + id) * 0.04);
    if (id === w.curToy && !sel) {
      ctx.setLineDash([8, 7]); A.circle(ctx, x, y, 44); A.ink(ctx, 4, '#ffffff'); ctx.setLineDash([]);
    }
  }
  function drawBox(ctx, w, c, still) {
    let dx = 0, dy = 0, k = 0;
    if (c.ship > 0) { const p = 1 - c.ship / 0.9, q = Math.max(0, (p - 0.4) / 0.6); k = Math.min(1, p / 0.35); dy = ease(q) * 300; }
    if (c.arrive > 0) dy -= ease(c.arrive / 0.7) * 340;
    if (boxShake[c.i] > 0 && !still) dx = Math.sin(boxShake[c.i] * 48) * 12 * boxShake[c.i];
    const live = SF.live(c), place = live && c.i === w.place && w.phase === 'play', n = SF.need(w, c), ready = live && n.ok;
    ctx.save(); ctx.translate(dx, dy);
    A.boxBack(ctx, c.x, BOX.y, k, place ? (w.clip ? '#ffe14d' : '#ffffff') : null);
    c.items.forEach((id, i) => { const p = SF.boxSpot(c, i); drawToy(ctx, w, id, p.x, p.y, still, 0); });
    A.boxFront(ctx, c.x, BOX.y, k);
    const have = {};
    for (const kind in c.order) have[kind] = c.order[kind] - (n.missing[kind] || 0);
    A.orderCard(ctx, c.x, BOX.y, c.order, have, ready ? 'ready' : boxShake[c.i] > 0 ? 'wrong' : '', c.oid);
    if (place) {
      ctx.setLineDash([16, 10]); ctx.lineDashOffset = still ? 0 : -time * 30;
      A.rr(ctx, c.x - 148, BOX.y - 30, 296, 238, 26); A.ink(ctx, 5, w.clip ? '#ffb800' : '#ffffff');
      ctx.setLineDash([]); ctx.lineDashOffset = 0;
      if (w.clip && !ready) { A.rr(ctx, c.x - 136, BOX.y - 16, 104, 40, 20); A.fill(ctx, '#ffffff'); A.ink(ctx, 3); A.caps(ctx, c.x - 84, BOX.y + 3, ['Ctrl', 'V'], 26); }
    }
    if (ready) A.enterBadge(ctx, c.x + 108, BOX.y + 10, still ? 0 : (Math.sin(time * 7) + 1) / 2);
    ctx.restore();
  }
  function drawFlyers(ctx, still) {
    for (const f of flyers) {
      if (f.t < 0) continue;
      const k = Math.min(1, f.t / f.dur), e = ease(k);
      const x = f.x0 + (f.x1 - f.x0) * e, y = f.y0 + (f.y1 - f.y0) * e - Math.sin(k * Math.PI) * f.arc;
      A.toy(ctx, f.k, f.b, x, y, f.s0 + (f.s1 - f.s0) * k, still ? 0 : f.spin * k);
    }
    for (const p of poofs) {
      const k = p.t / 0.45;
      ctx.globalAlpha = Math.max(0, 1 - k);
      for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2, d = still ? 26 : 14 + k * 38; A.circle(ctx, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d * 0.7, 16 - k * 6); A.fill(ctx, p.color); }
      ctx.globalAlpha = 1;
    }
  }
  function drawHud(ctx, w) {
    const def = w.def, Wd = SF.WORLDS[def.world], left = Math.ceil(w.left), coins = save.coins + w.done * 2 + w.bonus;
    const c = layer('hud', W, 70, [w.li, w.done, w.total, coins, w.limit ? left : -1].join('|'), g => {
      A.pill(g, 80, 6, 300, 54, Wd.color);
      A.rr(g, 88, 12, 76, 42, 21); A.fill(g, '#ffffff'); A.ink(g, 3.5);
      A.text(g, def.id, 126, 34, 26, A.INK);
      A.text(g, Wd.name, 272, 34, 26, A.INK);
      const n = w.total, x0 = 640 + (n - 1) * 21;
      A.pill(g, 640 - n * 21 - 18, 8, n * 42 + 36, 50, 'rgba(255,255,255,0.92)');
      // The first order on the right, like reading Arabic.
      for (let i = 0; i < n; i++) A.boxIcon(g, x0 - i * 42, 35, 1.05, i < w.done);
      if (w.limit) {
        const red = left <= 20;
        A.pill(g, 860, 8, 150, 50, red ? '#ff5d6c' : '#ffffff');
        A.clock(g, 986, 33, 15, 1 - w.left / w.limit);
        A.text(g, fmt(left), 918, 34, 28, red ? '#ffffff' : A.INK);
      }
      A.pill(g, 1046, 8, 150, 50, 'rgba(28,34,80,0.88)', '#ffffff');
      A.coin(g, 1074, 33, 15);
      A.text(g, String(coins), 1140, 34, 28, '#ffffff');
    });
    ctx.drawImage(c, 0, 0, W, 70);
  }
  function drawActions(ctx, w) {
    const list = SF.CARD.filter(a => w.def.tools[a]);
    const hl = demo ? demoStep().act : hint ? ({ gremlin: 'undo', place: 'select' }[hint.act] || hint.act) : '';
    const c = layer('acts', 368, 200, list.join() + '|' + hl, g => {
      A.rr(g, 4, 4, 360, 192, 24); A.fill(g, 'rgba(255,255,255,0.96)'); A.ink(g, 4);
      const cols = list.length > 6 ? 2 : 1, rows = Math.ceil(list.length / cols), rh = Math.min(cols === 2 ? 30 : 34, 178 / rows);
      const y0 = 100 - rows * rh / 2, cw = 348 / cols, fs = cols === 2 ? 18 : 22, kh = cols === 2 ? 24 : 30;
      list.forEach((a, i) => {
        const col = Math.floor(i / rows), row = i % rows, cx = 358 - (col + 0.5) * cw, cy = y0 + rh * (row + 0.5);
        if (a === hl) { A.rr(g, cx - cw / 2 + 2, cy - rh / 2 + 1, cw - 4, rh - 2, 12); A.fill(g, '#ffe14d'); }
        A.text(g, SF.ACTS[a].short || SF.ACTS[a].name, cx + cw / 2 - 10, cy + 1, fs, A.INK, { align: 'right' });
        const kw = A.capsW(g, SF.ACTS[a].keys, kh);
        A.caps(g, cx - cw / 2 + 10 + kw / 2, cy, SF.ACTS[a].keys, kh);
      });
    });
    ctx.drawImage(c, 902, 512, 368, 200);
  }
  function drawDesk(ctx, w, still) {
    A.worker(ctx, 110, 716, { hat: save.hat, theme: save.color, mood: mood.m, t: time, still: still, type: typing });
    const pulse = still ? 1 : (Math.sin(time * 7) + 1) / 2;
    A.keyboard(ctx, KB.x, KB.y, KB.u, { glow: glowCodes(w), down: demo ? demoHeld : (code => !!held[code]), pulse: pulse });
    drawActions(ctx, w);
  }
  function drawSheet(ctx, w, still) {
    const k = still ? 1 : Math.min(1, sheetT / 0.4), y = SHEET.y - (1 - back(k)) * 420;
    ctx.fillStyle = 'rgba(28,34,80,' + (0.4 * k).toFixed(2) + ')'; ctx.fillRect(0, 64, W, 436);
    A.rr(ctx, SHEET.x, y, SHEET.w, SHEET.h, 30); A.fill(ctx, '#fffdf4'); A.ink(ctx, 6);
    A.rr(ctx, 590, y - 20, 100, 38, 12); A.fill(ctx, '#9aa3c7'); A.ink(ctx, 4);
    A.text(ctx, 'عمل اليوم', 640, y + 52, 40, A.INK);
    const n = w.total;
    for (let i = 0; i < n; i++) A.boxIcon(ctx, 640 + (n - 1) * 23 - i * 46, y + 104, 1.2, true);
    const cy = y + 216;
    if (stampAnim < 0) {
      ctx.setLineDash([12, 9]); A.circle(ctx, 640, cy, 86); A.ink(ctx, 5, '#e2364f'); ctx.setLineDash([]);
      const p = still ? 1 : (Math.sin(time * 7) + 1) / 2;
      A.caps(ctx, 640, cy - 14, ['Ctrl', 'S'], 48, p > 0.5 ? 'glow' : '');
      A.text(ctx, 'اختم!', 640, cy + 44, 32, '#e2364f');
      A.stamper(ctx, 790, y + 190 + (still ? 0 : Math.sin(time * 4) * 8), 1);
    } else {
      const s = still ? 1 : 1 + Math.max(0, 1 - stampAnim / 0.16) * 1.3;
      A.stampMark(ctx, 640, cy, s, -0.18);
    }
  }
  const TEACH = {
    copy: 'اختر لعبة وانسخها', paste: 'ضع نسختها في الصندوق', place: 'انقر الصندوق لتلصق فيه', save: 'في آخر اليوم: احفظ واختم',
    cut: 'خذ اللعبة من مكانها', tab: 'انتقل إلى اللعبة التالية', del: 'أرسل اللعبة المكسورة للتدوير', undo: 'ارجع خطوة إلى الوراء',
    gremlin: 'بُرغي يخرّب الصناديق! تراجع عن خرابه', redo: 'أعد ما رجعت عنه', multi: 'اضغط Shift مع النقر', all: 'اختر كل الألعاب مرة واحدة', ship: 'أرسل الصندوق'
  };
  function demoStep() {
    const d = demo, per = d.dur / d.acts.length, i = Math.min(d.acts.length - 1, Math.floor(d.t / per));
    return { act: d.acts[i], lt: d.t - i * per, per: per };
  }
  // Which of the demo's keys are down now: Ctrl first, then the letter, then both let go.
  function demoDown(j) { const s = demoStep(); return s.lt > 0.35 + j * 0.45 && s.lt < s.per - 0.3; }
  function demoHeld(code) { const codes = SF.ACTS[demoStep().act].codes, j = codes.indexOf(code); return j >= 0 && demoDown(j); }
  function drawDemo(ctx, still) {
    const s = demoStep(), act = SF.ACTS[s.act], Wd = SF.WORLDS[world.def.world];
    ctx.fillStyle = 'rgba(28,34,80,0.55)'; ctx.fillRect(0, 0, W, 500);
    const k = still ? 1 : back(Math.min(1, demo.t / 0.3));
    ctx.save(); ctx.translate(640, 280); ctx.scale(k, k); ctx.translate(-640, -280);
    A.rr(ctx, 320, 84, 640, 392, 40); A.fill(ctx, '#ffffff'); A.ink(ctx, 7);
    A.rr(ctx, 320, 84, 640, 18, 9); A.fill(ctx, Wd.color);
    A.rr(ctx, 846, 64, 132, 46, 23); A.fill(ctx, '#ff5d9e'); A.ink(ctx, 4); A.text(ctx, 'جديد!', 912, 88, 28, '#ffffff');
    A.text(ctx, act.name, 640, 146, 54, A.INK);
    A.text(ctx, TEACH[s.act], 640, 200, 26, '#4b5383');
    // the keys, pressed down one after the other
    const h = 96, keys = act.keys;
    ctx.font = '700 ' + Math.round(h * 0.5) + 'px Fredoka';
    const ws = keys.map(key => key === 'انقر' ? h : Math.max(h, ctx.measureText(key).width + h * 0.6)), plus = h * 0.55;
    let x = 640 - (ws.reduce((a, b) => a + b, 0) + plus * (keys.length - 1)) / 2;
    keys.forEach((key, j) => {
      const d = demoDown(j);
      if (key === 'انقر') A.mouse(ctx, x + ws[j] / 2, 296, 2.1, d);
      else A.cap(ctx, x + ws[j] / 2, 296, key, h, d ? 'down' : '');
      x += ws[j];
      if (j < keys.length - 1) { A.text(ctx, '+', x + plus / 2, 296, 60, A.INK); x += plus; }
    });
    teachPic(ctx, s.act, s.lt, still);
    A.rr(ctx, 400, 448, 480, 12, 6); A.fill(ctx, '#e3e6f3');
    A.rr(ctx, 400, 448, Math.max(12, 480 * Math.min(1, demo.t / demo.dur)), 12, 6); A.fill(ctx, Wd.color);
    ctx.restore();
  }
  // A small picture of what the shortcut does, read right to left.
  function teachPic(ctx, act, lt, still) {
    const y = 396, on = lt > 0.9 || still, arrow = () => { A.poly(ctx, [600, y - 12, 600, y + 12, 576, y]); A.fill(ctx, '#9aa3c7'); A.rr(ctx, 598, y - 5, 86, 10, 5); A.fill(ctx, '#9aa3c7'); };
    const ring = (x, yy) => { A.circle(ctx, x, yy, 34); A.fill(ctx, A.alpha('#ffe14d', 0.6)); A.ink(ctx, 3, '#ffb800'); };
    if (act === 'copy') { ring(730, y); A.toy(ctx, 'duck', false, 730, y, 0.7); arrow(); if (on) { A.toy(ctx, 'duck', false, 540, y, 0.7); A.toy(ctx, 'duck', false, 480, y, 0.7); } }
    else if (act === 'paste' || act === 'place') {
      if (act === 'place') A.mouse(ctx, 740, y, 1, lt % 1 > 0.5);
      else { A.boxIcon(ctx, 740, y, 1.6, false); A.text(ctx, '?', 740, y - 40, 30, A.INK); }
      arrow(); A.boxIcon(ctx, 520, y + 8, 2.2, false); if (on) A.toy(ctx, 'duck', false, 520, y - 18, 0.62);
    } else if (act === 'cut') { A.scissors(ctx, 790, y, 1.1); A.toy(ctx, 'car', false, 730, y, 0.7); arrow(); if (on) A.toy(ctx, 'car', false, 520, y - 6, 0.7); }
    else if (act === 'del') { A.toy(ctx, 'duck', true, 730, y, 0.7); arrow(); A.recycle(ctx, 520, y, 26, '#3fc46f'); }
    else if (act === 'undo' || act === 'redo') A.arrowUndo(ctx, 640, y + 8, 30, act === 'redo', act === 'redo' ? '#5be38f' : '#4fd1ff');
    else if (act === 'gremlin') { ctx.save(); ctx.translate(730, y + 8); ctx.scale(0.62, 0.62); A.gremlin(ctx, 0, 0, { phase: 'mess', t: lt, still: still }); ctx.restore(); arrow(); A.arrowUndo(ctx, 520, y + 8, 26, false, '#4fd1ff'); }
    else if (act === 'save') { if (on) A.stampMark(ctx, 640, y, 0.42, -0.18); else A.stamper(ctx, 640, y + 30, 1); }
    else if (act === 'tab') {
      const n = Math.floor(lt / 0.5) % 3;
      ['duck', 'car', 'ball'].forEach((kind, i) => { if (i === n) ring(720 - i * 80, y); A.toy(ctx, kind, false, 720 - i * 80, y, 0.6); });
      A.cap(ctx, 470, y, '←', 40); A.cap(ctx, 420, y, '→', 40);
    } else if (act === 'multi' || act === 'all') {
      ['car', 'ball', 'duck'].forEach((kind, i) => {
        if (act === 'all' ? on : lt > 0.6 + i * 0.5) ring(720 - i * 80, y);
        A.toy(ctx, kind, false, 720 - i * 80, y, 0.6);
      });
      if (act === 'multi') A.mouse(ctx, 480, y, 1, lt % 0.5 > 0.25);
    } else if (act === 'ship') { A.boxIcon(ctx, 720, y, 2, true); arrow(); }
  }
  function drawFloats(ctx) {
    for (const f of floats) {
      ctx.globalAlpha = Math.max(0, 1 - Math.max(0, f.t - 0.8) / 0.5);
      A.text(ctx, f.text, f.x, f.y, f.size, f.color, { stroke: Math.max(6, f.size * 0.2) });
    }
    ctx.globalAlpha = 1;
    if (toast) {
      const a = SF.ACTS[toast.act];
      ctx.globalAlpha = Math.max(0, Math.min(1, (1.2 - toast.t) / 0.3));
      ctx.font = '700 22px Fredoka';
      const nw = ctx.measureText(a.name).width, kw = A.capsW(ctx, a.keys, 34), tw = nw + kw + 34;
      A.rr(ctx, 640 - tw / 2 - 14, 72, tw + 28, 50, 25); A.fill(ctx, toast.ok ? '#ffffff' : '#ffd9de'); A.ink(ctx, 4, toast.ok ? A.INK : '#e2364f');
      A.caps(ctx, 640 - tw / 2 + kw / 2, 96, a.keys, 34);
      A.text(ctx, a.name, 640 + tw / 2, 97, 26, A.INK, { align: 'right' });
      ctx.globalAlpha = 1;
    }
  }
  function drawPlay(ctx, w) {
    const still = calm(), theme = save.color, nb = w.def.belts.length;
    A.back(ctx, theme, nb);
    A.gears(ctx, theme, w.t, still || !w.speed);
    for (const c of w.cons) {
      if (c.type !== 'belt') continue;
      A.belt(ctx, c.y, w.offset, theme, still);
      c.items.forEach((id, s) => { if (id) drawToy(ctx, w, id, SF.beltX(w, s), c.y, still, 0); });
    }
    A.machines(ctx, theme, SF.BELT_Y[Math.max(0, nb - 1)], time, still);
    A.bin(ctx, BIN.x, BIN.y, bump.bin, time, still);
    A.copier(ctx, COPIER.x, COPIER.y, w.clip, bump.copier, time, still);
    for (const c of w.cons) if (c.type === 'box' && !c.gone) drawBox(ctx, w, c, still);
    const g = w.g;
    if (g.phase !== 'away') A.gremlin(ctx, g.x, gremlinY(g), { phase: g.phase, t: time, still: still, look: -1 });
    drawFlyers(ctx, still);
    drawDesk(ctx, w, still);
    drawHud(ctx, w);
    if (w.phase === 'stamp' || stampAnim >= 0) drawSheet(ctx, w, still);
    fx.draw(ctx);
    drawFloats(ctx);
    if (demo) drawDemo(ctx, still);
    if (hand.on && !demo) {
      const p = still ? 0 : Math.max(0, Math.sin(hand.t * 7));
      A.hand(ctx, hand.x, hand.y, p);
    }
  }
  // The title and the menus: a parade of toys on a long belt, the worker waving, the gremlin.
  const PARADE = ['duck', 'ball', 'car', 'robot', 'teddy', 'rocket', 'duck', 'car', 'teddy', 'ball'];
  function drawMenu(ctx) {
    const still = calm(), T = A.theme(save.color);
    const bg = layer('menu', W, H, save.color, g => {
      g.fillStyle = T.wall; g.fillRect(0, 0, W, H);
      for (let x = -40; x < W; x += 96) { g.fillStyle = T.wall2; g.fillRect(x, 0, 44, H); }
      A.rr(g, -10, 182, W + 20, 14, 7); A.fill(g, T.pipe); A.ink(g, 3.5);
      g.fillStyle = T.floor; g.fillRect(0, 640, W, 80);
      g.fillStyle = T.floor2; g.fillRect(0, 640, W, 6);
      A.rr(g, -10, 654, W + 20, 30, 14); A.fill(g, '#3b4166'); A.ink(g, 4);
    });
    ctx.drawImage(bg, 0, 0, W, H);
    A.gears(ctx, save.color, time, still);
    if (screen !== 'title') { ctx.fillStyle = 'rgba(28,34,80,0.35)'; ctx.fillRect(0, 0, W, H); return; }
    const off = still ? 0 : menuOff;
    ctx.save(); A.rr(ctx, 0, 660, W, 18, 9); ctx.clip();
    ctx.fillStyle = '#272c4a'; ctx.fillRect(0, 660, W, 18);
    const st = 34, o = ((-off % st) + st) % st;
    ctx.fillStyle = '#4b5383';
    for (let x = -st + o; x < W + st; x += st) { A.poly(ctx, [x, 660, x + 12, 660, x + 4, 678, x - 8, 678]); ctx.fill(); }
    ctx.restore();
    PARADE.forEach((kind, i) => {
      const x = 1400 - (((i * 140 + off) % 1400) + 1400) % 1400;
      A.toy(ctx, kind, i === 6, x, 626, 0.95, still ? 0 : Math.sin(time * 5 + i) * 0.05);
    });
    A.worker(ctx, 170, 626, { hat: save.hat, theme: save.color, mood: 'happy', t: time, still: still });
    if (!still) {
      // «بُرغي» peeks in now and then (without a sound: the title stays quiet).
      const k = (time % 11) / 11, gx = 1360 - Math.sin(Math.min(1, k * 2.2) * Math.PI) * 240;
      if (k < 0.46) A.gremlin(ctx, gx, 130 + Math.sin(time * 3) * 10, { phase: 'come', t: time, still: false, look: -1 });
    }
  }
  function render() {
    if (screen === 'pause' && !dirty) return;
    dirty = false;
    const ctx = view.ctx;
    ctx.save();
    ctx.translate(shake.x, shake.y);
    if ((screen === 'play' || screen === 'pause' || screen === 'result') && world) drawPlay(ctx, world);
    else drawMenu(ctx);
    if (screen === 'result') fx.draw(ctx);
    ctx.restore();
  }

  canvas.addEventListener('contextrestored', () => { A.reset(); for (const k in layers) layers[k].key = null; tiles.forEach(t => { t.drawn = false; }); dirty = true; });
  if (document.fonts && document.fonts.load) {
    // Text drawn into cached pictures is drawn again once the font is there.
    document.fonts.load('700 40px Fredoka', 'مصنع C').then(() => { A.reset(); for (const k in layers) layers[k].key = null; dirty = true; }, () => { /* fallback fonts */ });
  }

  /* --------------------------------------------------- test and debug hook */
  const page = (x, y) => { const r = canvas.getBoundingClientRect(); return { x: r.left + x * view.scale, y: r.top + y * view.scale }; };
  const round1 = v => Math.round(v * 10) / 10;
  function toyState(w, id) { const t = w.toys[id], f = SF.find(w, id); return { id: id, k: t.k, b: t.b, x: round1(f.x), y: round1(f.y), visible: w.cons[f.con].type === 'box' || SF.visible(f.x) }; }
  window.__game = {
    get state() {
      const w = world;
      return {
        screen: screen, paused: screen === 'pause', level: li, id: w ? w.def.id : '', phase: w ? w.phase : '', demo: !!demo, time: w ? Math.round(w.t * 1000) / 1000 : 0,
        offset: w ? round1(w.offset) : 0, speed: w ? w.speed : 0, tier: tier,
        sel: w ? w.sel.slice() : [], cur: w ? w.cur : -1, curToy: w ? w.curToy : 0, place: w ? w.place : -1,
        clip: w && w.clip ? { cut: w.clip.cut, kinds: w.clip.items.map(t => (t.b ? '!' : '') + t.k) } : null,
        undo: w ? w.undo.length : 0, redo: w ? w.redo.length : 0, done: w ? w.done : 0, total: w ? w.total : 0, mistakes: w ? w.mistakes : 0,
        left: w ? round1(w.left) : 0, limit: w ? w.limit : 0,
        belts: w ? w.cons.filter(c => c.type === 'belt').map(c => ({ i: c.i, items: c.items.filter(Boolean).map(id => toyState(w, id)) })) : [],
        boxes: w ? w.cons.filter(c => c.type === 'box').map(c => ({ i: c.i, order: SF.orderText(c.order), items: c.items.map(id => toyState(w, id)), ready: SF.ready(w, c), ship: c.ship > 0, gone: c.gone })) : [],
        gremlin: w ? w.g.phase : '', bonks: w ? w.bonks : 0, hint: hint ? hint.act : '', hand: hand.on, coins: save.coins, particles: fx.list.length, shake: shake.power,
        result: result && screen === 'result' ? { stars: result.res.stars, fail: result.fail, best: result.res.best, coins: result.res.coins } : null,
        focus: document.activeElement === canvas, scrollX: window.scrollX, scrollY: window.scrollY
      };
    },
    get save() { return JSON.parse(JSON.stringify(save)); },
    // The coach's next step ({ act, con, toy }), as the glowing keys and the hand show it.
    get hint() { return hint ? Object.assign({}, hint) : null; },
    // Where a logical point, a toy, a box or a box's Enter button is on the page, for tests
    // that move the real mouse there.
    point: page,
    toyPoint: id => { const f = world && SF.find(world, id); return f ? page(f.x, f.y) : null; },
    boxPoint: con => { const c = world && world.cons[con]; return c ? page(c.x + 30, BOX.y + 160) : null; },
    shipPoint: con => { const c = world && world.cons[con]; return c ? page(c.x + 108, BOX.y + 10) : null; },
    sheetPoint: () => page(640, SHEET.y + 216)
  };

  buildMap();
  buildShop();
  Kit.muteButton();
  Kit.lifecycle({ pause: () => pause(false), reset: () => { for (const k in held) held[k] = false; } });
  toTitle();
  Kit.loop(update, render);
  Kit.ready();
})();
