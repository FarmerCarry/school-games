/* Shortcut Factory (مصنع الاختصارات): screens, the child's real shortcuts, the coach with
 * its giant keyboard, saves, skins and sound. engine.js runs the factory; art.js draws it.
 * This is the UI layer: it reads Kit.dda when a level starts and reports each finished try. */
(function () {
  'use strict';
  const J = Kit.juice, W = 1280, HH = 720;
  const $ = id => document.getElementById(id);
  const canvas = $('scene'), ui = $('ui');
  const calm = () => Kit.motion.reduced();
  let view = null, contextLost = false, lastFrame = 0, dirty = true;
  const fit = Kit.fit(canvas, W, HH, { webgl: true, maxDpr: 1.5, onResize: v => {
    ui.style.left = canvas.style.left; ui.style.top = canvas.style.top; ui.style.transform = 'scale(' + v.scale + ')';
    if (view) view.resize(Math.round(W * v.scale), Math.round(HH * v.scale));
    dirty = true;
  } });

  /* ---------------------------------------------------------------- save */
  const store = Kit.store('shortcut-factory');
  const saveStatus = Kit.saveStatus({ retry: persist });
  let save = SF.loadSave(store.get(SF.STORE_KEY, null));
  function persist() {
    if (store.set(SF.STORE_KEY, save) === false) { saveStatus.failed(); return false; }
    saveStatus.saved();
    return true;
  }
  // The campaign and the rush learn their own speed (Kit keeps it on this PC).
  const ddaMain = Kit.dda('shortcut-factory', { id: 'main', start: 0.25 });
  const ddaRush = Kit.dda('shortcut-factory', { id: 'rush', start: 0.3 });

  /* --------------------------------------------------------------- state */
  let screen = 'title', world = null, level = 0, time = 0, viewTime = 0, queue = [];
  let ending = null, result = null, resultT = 0, resultLock = 0, reported = false;
  let idle = 0, nudge = 0, advice = null, adviceT = 0, cueKey = '', cueAt = -1, banner = 0;
  const PRAISE = ['رائع!', 'ممتاز!', 'مذهل!', 'بطل!'];
  const ICON = { copy: 'i-copy', paste: 'i-paste', cut: 'i-cut', delete: 'i-del', undo: 'i-undo', redo: 'i-redo', selectAll: 'i-all', save: 'i-save' };

  /* ------------------------------------------------------------ screens */
  const SCREENS = { title: 'scrTitle', map: 'scrMap', skins: 'scrSkins', pause: 'scrPause', result: 'scrResult' };
  function setScreen(name) {
    screen = name;
    for (const k in SCREENS) $(SCREENS[k]).hidden = k !== name;
    const playing = name === 'play' || name === 'pause';
    $('hud').hidden = !playing; $('tools').hidden = !playing;
    if (!playing) hideCoach();
    dirty = true;
    focusGame();
  }
  function focusGame() { try { canvas.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  function say(text) { $('live').textContent = text; }
  function svg(id, cls) { return '<svg class="' + (cls || 'ic') + '" aria-hidden="true"><use href="#' + id + '"/></svg>'; }
  function cap(t) { return '<span class="kc" dir="ltr">' + t + '</span>'; }
  function combo(key) { return key === 'delete' ? cap('Delete') : '<span class="combo" dir="ltr">' + cap('Ctrl') + '<i>+</i>' + cap(SF.LETTER[key]) + '</span>'; }
  function chips() {
    const st = SF.totalStars(save) + '/' + SF.MAX_STARS;
    document.querySelectorAll('[data-chip="stars"]').forEach(el => { el.textContent = st; });
    document.querySelectorAll('[data-chip="coins"]').forEach(el => { el.textContent = String(save.coins); });
  }
  function toTitle() { leaveLevel(); chips(); setScreen('title'); say('مصنع الاختصارات. اضغط Enter للعب'); }
  function toMap() { leaveLevel(); buildMap(); chips(); setScreen('map'); say('خريطة المصنع'); }
  function play() {
    J.select();
    if (!save.stars[0]) startLevel(0); else toMap();
  }

  /* ---------------------------------------------------------------- map */
  function buildMap() {
    const box = $('mapHalls');
    let html = '';
    SF.HALLS.forEach((h, hi) => {
      html += '<div class="hall" style="--hc:' + h.color + '"><div class="hallName">' + h.name + '</div><div class="lvls">';
      SF.LEVELS.forEach((L, i) => {
        if (L.hall !== hi) return;
        const open = SF.isOpen(save, i), st = save.stars[i], nx = open && !st && i === SF.nextLevel(save);
        let stars = '';
        for (let s = 0; s < 3; s++) stars += svg('i-star', 'st' + (s < st ? ' on' : ''));
        html += '<button type="button" class="lvl' + (open ? '' : ' locked') + (nx ? ' next' : '') + '" data-lv="' + i + '"' + (open ? '' : ' disabled') +
          ' aria-label="المرحلة ' + L.id + '"><b dir="ltr">' + L.id + '</b>' + (open ? '<span class="stars">' + stars + '</span>' : svg('i-lock', 'lock')) +
          (L.fresh.length ? '<span class="newkey">' + svg(ICON[L.fresh[0]], 'ic') + '</span>' : '') + '</button>';
      });
      html += '</div></div>';
    });
    const ro = SF.rushOpen(save);
    html += '<div class="hall rush" style="--hc:#ff5f3d"><div class="hallName">السباق</div><button type="button" class="lvl big' + (ro ? '' : ' locked') + '" id="btnRush"' + (ro ? '' : ' disabled') +
      ' aria-label="السباق">' + svg(ro ? 'i-bolt' : 'i-lock', 'ic big') + '<span class="best">' + svg('i-trophy', 'ic') + '<b>' + save.rushBest + '</b></span></button></div>';
    box.innerHTML = html;
    box.querySelectorAll('.lvl[data-lv]').forEach(b => on(b, () => { if (!b.disabled) { J.select(); startLevel(+b.dataset.lv); } }));
    const r = $('btnRush'); if (r) on(r, () => { if (!r.disabled) { J.select(); startLevel(-1); } });
  }

  /* -------------------------------------------------------------- skins */
  function buildSkins() {
    let html = '';
    SF.SKINS.forEach((s, i) => {
      const own = save.skins[i], wear = save.skin === i;
      html += '<button type="button" class="skin' + (wear ? ' wear' : '') + (own ? ' own' : save.coins < s.cost ? ' poor' : '') + '" data-sk="' + i + '" aria-label="ذراع ' + (i + 1) + '">' +
        '<span class="sw" style="--a:' + s.a + ';--b:' + s.b + ';--c:' + s.c + '">' + svg('i-arm', 'ic arm') + '</span>' +
        (wear ? '<span class="tag ok">' + svg('i-check', 'ic') + '</span>' : own ? '' : '<span class="tag">' + svg('i-coin', 'ic') + '<b>' + s.cost + '</b></span>') + '</button>';
    });
    $('skinList').innerHTML = html;
    $('skinList').querySelectorAll('.skin').forEach(b => on(b, () => {
      const res = SF.buy(save, +b.dataset.sk);
      if (res === 'poor') { J.error(); b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); return; }
      if (res === 'buy') { J.coin(4); J.chime(2); } else J.select();
      view.setSkin(save.skin);
      persist(); chips(); buildSkins();
    }));
  }
  let skinsFrom = 'title';
  function openSkins() { J.select(); skinsFrom = screen; buildSkins(); chips(); setScreen('skins'); }
  function closeSkins() { J.back(); if (skinsFrom === 'map') toMap(); else toTitle(); }

  /* ------------------------------------------------------------- levels */
  function levelDef(i) { return i < 0 ? SF.RUSH : SF.LEVELS[i]; }
  function startLevel(i) {
    leaveLevel();
    level = i;
    const L = levelDef(i), d = i < 0 ? ddaRush : ddaMain;
    world = SF.create(L, { level: d.level, tier: d.tier, seed: (Math.random() * 1e9) >>> 0 });
    view.reset(world);
    queue.length = 0; ending = null; result = null; reported = false; idle = 0; nudge = 0; advice = null; adviceT = 0; cueKey = ''; cueAt = -1;
    Kit.stats.round(i < 0 ? 'rush' : 'h' + L.id);
    if (i === 0 && !save.coach) Kit.stats.tutorial('start');
    Kit.keys.reset();
    buildTools(L);
    $('hudLevel').textContent = i < 0 ? 'سباق' : L.id;
    $('hudHall').textContent = i < 0 ? '' : SF.HALLS[L.hall].name;
    $('hud').classList.toggle('rush', i < 0);
    $('hudClock').hidden = !(L.par > 0);
    banner = 1.6;
    $('banner').innerHTML = '<b dir="ltr">' + (i < 0 ? '' : L.id) + '</b><span>' + (i < 0 ? 'السباق!' : SF.HALLS[L.hall].name) + '</span>' +
      (L.fresh.length ? '<span class="fresh">' + L.fresh.map(k => svg(ICON[k], 'ic') + combo(k)).join('') + '</span>' : '');
    $('banner').hidden = false; $('banner').classList.remove('go'); void $('banner').offsetWidth; $('banner').classList.add('go');
    setScreen('play');
    J.whoosh(0.5);
    hud(true);
    say(i < 0 ? 'السباق' : 'المرحلة ' + L.id);
  }
  function leaveLevel() {
    Kit.stats.end('quit'); // only when a round is still open
    if (world && !world.done && !reported && world.t > 25 && world.misses > world.L.allow) { reported = true; (level < 0 ? ddaRush : ddaMain).result(0.25); }
    world = null; ending = null;
    $('banner').hidden = true;
    if (view && demo) view.reset(demo);
  }
  function pause(own) {
    if (screen !== 'play') return;
    queue.length = 0;
    setScreen('pause');
    if (own) J.back();
  }
  function resume() { if (screen !== 'pause') return; J.select(); setScreen('play'); Kit.keys.reset(); }
  function restart() { J.select(); startLevel(level); }

  /* -------------------------------------------------------------- tools */
  // The shortcut cards along the bottom: what this level's keys do.
  function buildTools(L) {
    $('tools').innerHTML = L.keys.map(k => '<div class="tool" data-k="' + k + '">' + svg(ICON[k], 'ic') + '<span class="nm">' + SF.AR[k] + '</span>' + combo(k) + '</div>').join('');
  }
  function flashTool(k, cls) {
    const el = $('tools').querySelector('[data-k="' + k + '"]');
    if (!el) return;
    el.classList.remove('hit', 'bad'); void el.offsetWidth; el.classList.add(cls);
  }

  /* ---------------------------------------------------------------- hud */
  let hudKey = '';
  function hud(force) {
    const w = world;
    if (!w) return;
    const L = w.L, left = L.par ? Math.max(0, Math.ceil(L.par - w.t)) : 0;
    const key = w.shipped + '|' + w.misses + '|' + left + '|' + w.hearts + '|' + w.score + '|' + w.boxes.length;
    if (!force && key === hudKey) return;
    hudKey = key;
    if (level < 0) {
      let h = '';
      for (let i = 0; i < 3; i++) h += svg('i-heart', 'ic heart' + (i < w.hearts ? ' on' : ''));
      $('hudBoxes').innerHTML = h + '<span class="score"><b>' + w.score + '</b></span>';
    } else {
      let b = '';
      for (let i = 0; i < w.boxes.length; i++) b += svg('i-box', 'ic bx' + (i < w.shipped ? ' on' : i === w.shipped ? ' cur' : ''));
      $('hudBoxes').innerHTML = b;
    }
    $('hudClock').querySelector('b').textContent = String(left);
    $('hudClock').classList.toggle('late', !!L.par && left <= 10);
    $('hudMiss').hidden = level < 0 || !w.misses;
    $('hudMiss').querySelector('b').textContent = String(w.misses);
  }

  /* -------------------------------------------------------------- floats */
  const FL = [];
  for (let i = 0; i < 10; i++) { const d = document.createElement('div'); d.className = 'float'; d.hidden = true; $('floats').appendChild(d); FL.push({ el: d, t: 9 }); }
  let flNext = 0;
  function float(text, p, cls) {
    if (!p) return;
    const f = FL[flNext]; flNext = (flNext + 1) % FL.length;
    f.t = 0; f.el.hidden = false; f.el.className = 'float ' + (cls || '');
    f.el.textContent = text;
    f.el.style.left = p.x.toFixed(0) + 'px'; f.el.style.top = p.y.toFixed(0) + 'px';
    f.el.classList.remove('go'); void f.el.offsetWidth; f.el.classList.add('go');
  }
  function floatsStep(dt) { for (const f of FL) if (f.t < 9) { f.t += dt; if (f.t > 1.2) { f.t = 9; f.el.hidden = true; } } }

  /* ------------------------------------------------------------- events */
  function cue(key) { cueKey = key; cueAt = performance.now(); }
  function acted(key) {
    idle = 0; nudge = 0;
    if (cueKey && key === cueKey && cueAt >= 0) { Kit.track.react(performance.now() - cueAt); cueKey = ''; cueAt = -1; }
  }
  const NAME_OF = { copy: 'copy', cut: 'cut', paste: 'paste', delete: 'delete', undo: 'undo', redo: 'redo', selectAll: 'selectAll', seal: 'save' };
  function handleEvents() {
    const w = world;
    for (const e of w.ev) {
      view.event(e, w);
      const k = NAME_OF[e.t];
      if (k) { flashTool(k, 'hit'); acted(k); }
      switch (e.t) {
        case 'select': if (e.id) { J.tap(); idle = Math.min(idle, 3); } break;
        case 'selectAll': J.toggle(true); break;
        case 'copy': J.pop(0.45); float(SF.AR.copy + '!', view.clipPoint(), 'cy'); break;
        case 'cut': J.whoosh(0.7); float(SF.AR.cut + '!', view.clipPoint(), 'or'); break;
        case 'paste': J.pop(1); break;
        case 'delete':
          J.impact(0.3);
          for (let i = 0; i < e.broken; i++) Kit.track.hit();
          if (e.broken) float('+' + e.broken, view.project(e.toys[0].x, 2.4, 0), 'gd');
          break;
        case 'undo': if (e.a !== 'steal') J.whoosh(0.35); break;
        case 'redo': J.whoosh(0.8); break;
        case 'seal': J.chime(2); Kit.track.hit(); break;
        case 'ship':
          J.coin(4); setTimeout(() => J.chime(1), 120);
          float('+' + e.coins, view.boxPoint(), 'gd big');
          view.shake(0.15);
          break;
        case 'drop':
          if (e.res === 'fill') {
            Kit.track.hit();
            setTimeout(() => J.coin(Math.min(5, e.combo)), 380);
            if (e.combo >= 3) float('×' + e.combo + ' ' + PRAISE[Math.min(3, e.combo - 3)], view.boxPoint(), 'combo');
          } else if (e.res === 'bad') {
            Kit.track.miss();
            setTimeout(() => J.error(), 380);
            float('✗', view.boxPoint(), 'bad big');
            say('لعبة مكسورة وصلت إلى الصندوق');
          } else setTimeout(() => J.land(0.25), 400);
          break;
        case 'full': J.chime(1); cue('save'); float('Ctrl + S', view.boxPoint(), 'cy big'); break;
        case 'wave': J.whoosh(0.3); break;
        case 'steal': J.jump(0.6); cue('undo'); setTimeout(() => float('Ctrl + Z', view.gremlinPoint(), 'pu big'), 300); say('نطّوط أخذ لعبة! اضغط Ctrl و Z'); break;
        case 'gundo': J.back(); cue('redo'); setTimeout(() => float('Ctrl + Y', view.gremlinPoint(), 'pu big'), 200); say('نطّوط تراجع عن لصقك! اضغط Ctrl و Y'); break;
        case 'escape': J.error(); Kit.track.miss(); break;
        case 'foil': J.streak(3); Kit.track.hit(); float('أمسكتك!', view.gremlinPoint(), 'gd big'); view.shake(0.2); break;
        case 'cue': J.chime(1); cue(e.key); break;
        case 'learnt': J.star(1); float('أحسنت!', view.clipPoint(), 'gd big'); break;
        case 'nothing': J.error(); flashTool(e.a, 'bad'); nudge = 2.6; adviceT = 0; break;
        case 'blocked': J.error(); break;
        case 'win': finish(); break;
        case 'over': finish(); break;
      }
    }
    w.ev.length = 0;
  }

  /* ----------------------------------------------------- the coach */
  // A giant keyboard lights Ctrl and the letter, and a see-through hand presses them.
  // For "pick a toy first" the hand taps the toy instead.
  const coach = { on: false, key: '', id: 0 };
  function buildKeyboard() {
    const rows = [['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'Delete'], ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH'], ['Control', 'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB']];
    const AR = { KeyQ: 'ض', KeyW: 'ص', KeyE: 'ث', KeyR: 'ق', KeyT: 'ف', KeyY: 'غ', KeyA: 'ش', KeyS: 'س', KeyD: 'ي', KeyF: 'ب', KeyG: 'ل', KeyH: 'ا', KeyZ: 'ئ', KeyX: 'ء', KeyC: 'ؤ', KeyV: 'ر', KeyB: 'لا' };
    $('kb').innerHTML = rows.map((r, ri) => '<div class="row r' + ri + '">' + r.map(c => {
      const lab = c === 'Control' ? 'Ctrl' : c === 'Delete' ? 'Delete' : c.slice(3);
      return '<span class="key' + (c.length > 4 && c.indexOf('Key') ? ' wide' : '') + '" data-code="' + c + '"><b>' + lab + '</b>' + (AR[c] ? '<i>' + AR[c] + '</i>' : '') + '</span>';
    }).join('') + '</div>').join('');
  }
  function hideCoach() {
    coach.on = false; coach.key = '';
    $('coach').hidden = true; $('hand').hidden = true;
  }
  function showCoach(a) {
    const key = a.key;
    if (key === 'select') {
      $('coach').hidden = true;
      const p = view.toyPoint(world, a.id);
      if (!p) { $('hand').hidden = true; return; }
      $('hand').hidden = false;
      $('hand').style.transform = 'translate(' + (p.x - 18).toFixed(0) + 'px,' + (p.y - 4).toFixed(0) + 'px)';
      coach.on = true; coach.key = key;
      return;
    }
    $('hand').hidden = true;
    if (coach.key !== key) {
      coach.key = key;
      const code = SF.KEY[key];
      $('kb').querySelectorAll('.key').forEach(el => { el.classList.toggle('on', el.dataset.code === code || (key !== 'delete' && el.dataset.code === 'Control')); });
      $('coachName').innerHTML = svg(ICON[key], 'ic') + '<span>' + SF.AR[key] + '</span>' + combo(key);
      $('coach').classList.toggle('one', key === 'delete');
      $('coach').hidden = false;
      // The hand's two fingers sit on the lit keys.
      const kb = $('kb').getBoundingClientRect(), s = fit.scale || 1;
      const place = (el, f) => {
        if (!el) { f.hidden = true; return; }
        const r = el.getBoundingClientRect();
        f.hidden = false;
        f.style.left = ((r.left - kb.left + r.width / 2) / s).toFixed(0) + 'px'; f.style.top = ((r.top - kb.top + r.height / 2) / s).toFixed(0) + 'px';
      };
      place(key === 'delete' ? null : $('kb').querySelector('[data-code="Control"]'), $('f1'));
      place($('kb').querySelector('[data-code="' + code + '"]'), $('f2'));
    }
    coach.on = true;
    say('اضغط ' + (key === 'delete' ? 'Delete' : 'Ctrl و ' + SF.LETTER[key]) + ' لـ' + SF.AR[key]);
  }
  function coachStep(dt) {
    idle += dt; nudge = Math.max(0, nudge - dt);
    adviceT -= dt;
    const tools = $('tools');
    if (adviceT <= 0) {
      adviceT = 0.25;
      advice = SF.advice(world);
      tools.querySelectorAll('.tool').forEach(el => el.classList.toggle('tip', !!advice && el.dataset.k === advice.key));
    }
    const wait = level === 0 && !save.coach ? 3 : 6;
    const want = advice && (world.hold || idle >= wait || nudge > 0) && banner <= 0.4;
    if (want) showCoach(advice);
    else if (coach.on) hideCoach();
  }

  /* --------------------------------------------------------------- input */
  function on(el, fn) {
    el.addEventListener('click', e => { e.stopPropagation(); if (e.detail > 1) return; Kit.audio.unlock(); if (e.detail > 0) { el.blur(); focusGame(); } fn(e); });
  }
  on($('btnPlay'), play);
  on($('btnMap'), () => { J.select(); toMap(); });
  on($('btnSkins'), openSkins);
  on($('mapHome'), () => { J.back(); toTitle(); });
  on($('mapSkins'), openSkins);
  on($('skinsBack'), closeSkins);
  on($('btnPause'), () => pause(true));
  on($('btnResume'), resume);
  on($('btnRestart'), restart);
  on($('btnHome'), () => { J.back(); toMap(); });
  on($('resNext'), () => { if (resultLock <= 0) next(); });
  on($('resAgain'), () => { if (resultLock <= 0) again(); });
  on($('resMap'), () => { if (resultLock <= 0) { J.back(); toMap(); } });
  // Clicking a toy picks it (the nearest one on screen); clicking the floor drops the pick.
  canvas.addEventListener('pointerdown', e => {
    Kit.audio.unlock();
    focusGame();
    if (screen !== 'play' || !world || ending) return;
    const r = canvas.getBoundingClientRect(), s = fit.scale || 1;
    const id = view.pick(world, (e.clientX - r.left) / s, (e.clientY - r.top) / s);
    if (id != null) SF.select(world, id);
    else if (world.sel.length) SF.select(world, null);
    idle = Math.min(idle, 2);
  });
  // Real shortcuts, by physical key (so an Arabic keyboard layout works too). Kit.keys skips
  // Ctrl combinations, so they are read here. The page's own Ctrl+S, Ctrl+A and the others
  // are stopped on every screen; nothing else (Ctrl+W, Ctrl+T, Tab ...) is ever touched.
  const COMBO = { KeyC: 'copy', KeyV: 'paste', KeyX: 'cut', KeyZ: 'undo', KeyY: 'redo', KeyA: 'selectAll', KeyS: 'save', KeyD: '' };
  window.addEventListener('keydown', e => {
    if (e.isComposing || Kit.keys.isNativeTarget(e.target)) return;
    const mod = e.ctrlKey || e.metaKey;
    let act = null;
    if (mod && !e.altKey && Object.prototype.hasOwnProperty.call(COMBO, e.code)) {
      e.preventDefault();
      act = COMBO[e.code];
      if (act === 'undo' && e.shiftKey) act = 'redo';
    } else if (!mod && !e.altKey && (e.code === 'Delete' || e.code === 'Backspace')) {
      e.preventDefault();
      act = 'delete';
    }
    if (!act || e.repeat) return;
    if (screen === 'play' && world && !ending && queue.length < 8) queue.push(act);
  });
  function handleKeys() {
    const K = Kit.keys, go = K.anyPressed(['Enter', 'NumpadEnter', 'Space']);
    if (screen === 'title') { if (go) play(); }
    else if (screen === 'map') {
      if (go) { J.select(); startLevel(SF.nextLevel(save)); } else if (K.pressed('Escape')) { J.back(); toTitle(); }
    } else if (screen === 'skins') { if (go || K.pressed('Escape')) closeSkins(); }
    else if (screen === 'play') {
      if (K.pressed('Escape') || K.pressed('KeyP')) pause(true);
      else if (world && !ending) {
        if (K.pressed('ArrowRight')) { SF.selectStep(world, 1); idle = Math.min(idle, 2); }
        if (K.pressed('ArrowLeft')) { SF.selectStep(world, -1); idle = Math.min(idle, 2); }
      }
    } else if (screen === 'pause') { if (K.anyPressed(['Escape', 'Enter', 'NumpadEnter', 'Space', 'KeyP'])) resume(); else if (K.pressed('KeyR')) restart(); }
    else if (screen === 'result' && resultLock <= 0) {
      if (go) next(); else if (K.pressed('KeyR')) again();
      else if (K.pressed('Escape')) { J.back(); toMap(); }
    }
  }

  /* ------------------------------------------------------------- result */
  function finish() {
    const w = world, L = w.L;
    let out;
    if (level < 0) {
      out = SF.applyRush(save, w);
      out.stars = 0;
      Kit.stats.end('end', w.score);
      ddaRush.result(SF.outcome(w, null));
      J.fail();
    } else {
      const r = SF.result(w);
      out = SF.apply(save, level, r);
      out.r = r;
      if (level === 0 && !save.coach) Kit.stats.tutorial('done');
      if (level === 0) save.coach = true;
      Kit.stats.end('win', r.stars);
      ddaMain.result(SF.outcome(w, r));
      J.levelUp();
    }
    reported = true;
    persist();
    result = { out: out, level: level, L: L, w: w };
    ending = { t: 0 };
    hideCoach();
  }
  function showResult() {
    ending = null;
    const out = result.out, rush = result.level < 0, w = result.w;
    resultT = 0; resultLock = 0.6;
    $('resTitle').textContent = rush ? 'السباق' : result.L.id + ' · ' + SF.HALLS[result.L.hall].name;
    $('resStars').hidden = rush;
    $('resStars').querySelectorAll('svg').forEach(s => s.classList.remove('on', 'pop'));
    $('resBoxes').textContent = String(w.shipped);
    $('resMiss').textContent = String(w.misses);
    $('resMissBox').hidden = rush;
    $('resScoreBox').hidden = !rush;
    $('resScore').textContent = String(w.score);
    $('resTimeBox').hidden = rush || !result.L.par;
    if (!rush) { $('resTime').textContent = Math.round(w.t) + ' / ' + result.L.par; $('resTimeBox').classList.toggle('good', !result.L.par || w.t <= result.L.par); }
    $('resCoins').textContent = '+' + out.coins;
    $('resBest').hidden = true; $('resOpen').hidden = true;
    const hasNext = !rush && result.level + 1 < SF.COUNT && SF.isOpen(save, result.level + 1);
    $('resNext').setAttribute('aria-label', hasNext ? 'المرحلة التالية' : 'الخريطة');
    chips();
    say(rush ? 'انتهى السباق. النقاط ' + w.score : 'أحسنت! ' + out.stars + ' من 3 نجوم');
    setScreen('result');
  }
  function resultStep(dt) {
    const before = resultT, out = result.out;
    resultT += dt;
    const at = t => before < t && resultT >= t;
    for (let i = 0; i < out.stars; i++) if (at(0.3 + i * 0.35)) { const s = $('resStars').children[i]; s.classList.add('on', 'pop'); J.star(i + 1); }
    if (at(0.4 + out.stars * 0.35)) {
      if (out.best) { $('resBest').hidden = false; J.chime(3); }
      if (out.rushOpened) { $('resOpen').hidden = false; J.chime(2); }
    }
  }
  function next() {
    if (!result) return;
    J.select();
    const n = result.level + 1;
    if (result.level >= 0 && n < SF.COUNT && SF.isOpen(save, n)) startLevel(n); else toMap();
  }
  function again() { if (result) { J.select(); startLevel(result.level); } }

  /* ------------------------------------------------- the menus' attract run */
  // Behind the title the factory runs by itself, silently, with the coach's own moves.
  let demo = null, demoT = 0;
  function demoStep(dt) {
    if (!demo || (demo.done && demoT < -2)) { demo = SF.create(SF.RUSH, { level: 0.2, tier: 1, seed: 11 }); demo.hearts = 99; view.reset(demo); demoT = 1; }
    demoT -= dt;
    if (demoT <= 0 && !demo.done) {
      const a = SF.advice(demo);
      if (a) { if (a.key === 'select') SF.select(demo, a.id); else SF.act(demo, a.key); }
      demoT = a && a.key === 'select' ? 0.7 : 1.1;
    }
    SF.step(demo, dt);
    for (const e of demo.ev) view.event(e, demo);
    demo.ev.length = 0;
  }

  /* ----------------------------------------------------------------- loop */
  function playStep(dt) {
    if (queue.length) {
      const list = queue.splice(0, queue.length);
      for (const a of list) if (!ending) SF.act(world, a);
    }
    SF.step(world, dt);
    handleEvents();
    if (!world) return;
    if (banner > 0) banner -= dt;
    if (ending) { ending.t += dt; if (ending.t > 1.4) showResult(); }
    else { coachStep(dt); hud(false); }
  }
  function update(dt) {
    if (screen !== 'pause') time += dt;
    handleKeys();
    if (screen === 'play' && world) playStep(dt);
    else if (screen === 'result' && result) { resultStep(dt); if (resultLock > 0) resultLock -= dt; }
    else if (screen === 'title' || screen === 'map' || screen === 'skins') demoStep(dt);
    if (screen !== 'pause') { floatsStep(dt); dirty = true; }
    Kit.keys.endFrame();
  }
  function render() {
    if (!view || contextLost) return;
    if (screen === 'pause' && !dirty) return;
    const now = performance.now(), playing = screen === 'play';
    if (!view.mayDraw(now, playing)) return;
    if (playing && lastFrame && view.frameTime(now - lastFrame)) fit.resize();
    lastFrame = now;
    const dt = Math.max(0, Math.min(0.1, time - viewTime));
    viewTime = time;
    const w = world && (screen === 'play' || screen === 'pause' || screen === 'result') ? world : demo;
    view.update({ w: w, dt: screen === 'pause' ? 0 : dt, calm: calm() });
    view.render();
    if (coach.on && coach.key === 'select' && advice && world) showCoach(advice);
    dirty = false;
  }

  /* --------------------------------------------------- test and debug hook */
  const page = (x, y) => { const r = canvas.getBoundingClientRect(); return { x: r.left + x * fit.scale, y: r.top + y * fit.scale }; };
  const r3 = v => Math.round(v * 1000) / 1000;
  function snapshot() {
    const w = world, box = w ? SF.active(w) : null, c = w ? w.counts : null;
    return {
      screen: screen, paused: screen === 'pause', level: level, id: w ? w.L.id : '', tier: w ? w.tier : 0,
      hold: w && w.hold ? w.hold.key : '', advice: w && !w.done ? (SF.advice(w) || { key: '' }).key : '', coach: coach.on ? coach.key : '',
      time: w ? r3(w.t) : 0, toys: w ? w.toys.length : 0, toyList: w ? w.toys.map(t => ({ id: t.id, k: t.k, c: t.c, b: t.b, x: r3(t.x) })) : [],
      sel: w ? w.sel.slice() : [], clip: w && w.clip ? w.clip.length : 0, clipCut: !!(w && w.clipCut),
      box: w ? w.box : 0, boxes: w ? w.boxes.length : 0, lines: box ? box.lines.map(l => ({ k: l.k, c: l.c, n: l.n, got: l.got })) : [], boxState: box ? box.state : '',
      shipped: w ? w.shipped : 0, copies: c ? c.copy : 0, pastes: c ? c.paste : 0, cuts: c ? c.cut : 0, deletes: c ? c.delete : 0,
      undos: c ? c.undo : 0, redos: c ? c.redo : 0, selectAlls: c ? c.selectAll : 0, seals: c ? c.save : 0,
      misses: w ? w.misses : 0, hits: w ? w.hits : 0, hearts: w ? w.hearts : 0, score: w ? w.score : 0, gremlin: w && w.gremlin ? w.gremlin.kind + ':' + w.gremlin.phase : '',
      done: !!(w && w.done), won: !!(w && w.won), ending: !!ending, stars: result ? result.out.stars : 0,
      coins: save.coins, skin: save.skin, calm: calm(), particles: view ? view.particleCount() : 0
    };
  }

  /* ---------------------------------------------------------------- init */
  Kit.muteButton({ key: false });
  Kit.lifecycle({ pause: () => pause(false), reset: () => { queue.length = 0; } });
  Kit.motion.onChange(() => { dirty = true; });
  window.addEventListener('pageshow', () => { dirty = true; });
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); contextLost = true; pause(false); $('contextNotice').hidden = false; });
  canvas.addEventListener('webglcontextrestored', () => { contextLost = false; $('contextNotice').hidden = true; dirty = true; fit.resize(); });
  let loop = null;
  try {
    view = SF.createView(canvas);
    view.setSkin(save.skin);
    fit.resize();
    buildKeyboard();
    toTitle();
    window.__game = {
      get state() { return snapshot(); },
      get save() { return JSON.parse(JSON.stringify(save)); },
      get world() { return world; },
      point: page,
      toyPoint: id => { const p = view.toyPoint(world, id); return p ? page(p.x, p.y) : null; },
      drawCalls: () => view.info().calls
    };
    loop = Kit.loop(update, render);
    view.prepare(() => { render(); view.whenDrawn(() => Kit.ready(), 3000); });
  } catch (error) {
    if (loop) loop.stop();
    for (const k in SCREENS) $(SCREENS[k]).hidden = true;
    $('hud').hidden = true; $('tools').hidden = true;
    $('scrError').hidden = false;
    Kit.fail(error);
  }
})();
