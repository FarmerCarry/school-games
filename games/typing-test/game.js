/* أصابع البرق (Lightning Fingers): screens, typing, the coach hand, saves, sound and play
 * statistics. engine.js runs the clouds and the speed test; art.js draws them.
 * This is the UI layer: it reads Kit.dda at every level start and reports Kit.stats rounds
 * and Kit.track cues, hits and misses (one hit per right key press, one miss per wrong one). */
(function () {
  'use strict';
  const TT = window.TT, A = TT.art, J = Kit.juice, W = TT.W, H = TT.H;
  const $ = id => document.getElementById(id);
  const canvas = $('game'), ui = $('ui');
  const calm = () => Kit.motion.reduced();
  let dirty = true;
  const view = Kit.fit(canvas, W, H, { maxDpr: 1.5, onResize: v => {
    ui.style.left = canvas.style.left; ui.style.top = canvas.style.top; ui.style.transform = 'scale(' + v.scale + ')';
    A.reset(); dirty = true;
  } });
  const fx = Kit.particles(), shake = Kit.shake();
  const pixelScale = () => Math.min(2, Math.max(0.5, Math.round(view.scale * view.dpr * 4) / 4));

  /* ---------------------------------------------------------------- save */
  const store = Kit.store('typing-test');
  const saveStatus = Kit.saveStatus({ retry: persist });
  let save = TT.loadSave(store.get('save', null));
  // The previous version kept only a language choice worth carrying over.
  if (!save.lang) { const old = store.get('settings', null); if (old && (old.lang === 'ar' || old.lang === 'en')) save.lang = old.lang; }
  function persist() {
    if (store.set('save', save) === false) { saveStatus.failed(); return false; }
    saveStatus.saved();
    return true;
  }
  // One difficulty controller per language: a child's Arabic and English typing differ.
  const dda = { ar: Kit.dda('typing-test', { id: 'ar' }), en: Kit.dda('typing-test', { id: 'en' }) };

  /* --------------------------------------------------------------- state */
  let screen = 'title', lang = save.lang || 'ar', world = null, cur = { w: 0, l: 0 }, time = 0;
  let test = null, testCfg = null, testResult = null, pausedFrom = '', ending = null, result = null, resultT = 0, resultLock = 0, busyT = 0;
  let coaching = false, menuIdle = 0, menuNext = 5, unlockFx = null, flashT = 0, introT = 0, shownWpm = 0, phase = 0, slide = 0;
  const coach = { idle: 0, next: 4 };
  const ghost = { on: false, x: 0, y: 0, t: 0, taps: 2, el: null, dom: false };
  const lit = {}; // code -> { kind: 'good' | 'bad', t }
  let sparks = [], bolts = [], bows = [], puffs = [], floats = [], flowers = [], deco = [], lastMiss = -9, glowBoost = 0, comboBump = 0, sunBump = [0, 0, 0];
  const PRAISE = ['رائع!', 'ممتاز!', 'مذهل!', 'خارق!'];

  /* ------------------------------------------------------------ screens */
  const SCREENS = { title: 'scrTitle', map: 'scrMap', pause: 'scrPause', result: 'scrResult', setup: 'scrSetup', tresult: 'scrTestResult', klass: 'scrClass' };
  function setScreen(name) {
    screen = name;
    for (const k in SCREENS) $(SCREENS[k]).hidden = k !== name && !(name === 'klass' && k === 'title');
    $('hud').hidden = name !== 'play' && name !== 'test';
    stopGhost();
    menuIdle = 0; menuNext = 5;
    dirty = true;
    if (name === 'play' || name === 'test') focusGame();
  }
  function focusGame() { try { canvas.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  function say(text) { $('live').textContent = text; }
  function starsText(n) { return n === 1 ? 'نجمة واحدة' : n === 2 ? 'نجمتان' : n + ' نجوم'; }
  function setChip(id) { $(id).querySelector('b').textContent = String(TT.total(save)); }

  function toTitle() {
    world = null; test = null;
    setScreen('title');
    setChip('titleStars');
    paintLangs();
  }
  function paintLangs() {
    $('btnAr').classList.toggle('ring', lang === 'ar');
    $('btnEn').classList.toggle('ring', lang === 'en');
  }
  function pickLang(l) {
    lang = l;
    if (save.lang !== l) { save.lang = l; persist(); }
    J.select();
    toMap(-1);
  }

  /* ---------------------------------------------------------------- map */
  const isles = [], pebbles = [];
  function on(el, fn) {
    // A mouse click hands the keyboard back to the game; a double click acts once.
    el.addEventListener('click', e => { e.stopPropagation(); if (e.detail > 1) return; Kit.audio.unlock(); if (e.detail > 0) { el.blur(); focusGame(); } fn(e); });
  }
  function buildMap() {
    const box = $('worlds');
    A.ISLES.forEach((p, w) => {
      const isle = document.createElement('button');
      isle.type = 'button'; isle.className = 'isle';
      isle.style.left = p.x + 'px'; isle.style.top = p.y + 'px';
      on(isle, () => openWorld(w));
      box.appendChild(isle); isles.push(isle);
      const row = [];
      for (let l = 0; l < TT.LEVELS; l++) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'pebble';
        b.dataset.w = String(w); b.dataset.l = String(l);
        b.style.left = (p.x + [96, 32, -32, -96][l]) + 'px'; b.style.top = (p.y + 104) + 'px';
        b.innerHTML = '<b>' + (l + 1) + '</b><span class="st" aria-hidden="true">' + '<svg><use href="#i-star"/></svg>'.repeat(3) + '</span>';
        on(b, () => pickLevel(w, l, b));
        box.appendChild(b); row.push(b);
      }
      pebbles.push(row);
    });
  }
  function refreshMap() {
    const next = TT.nextLevel(save, lang);
    pebbles.forEach((row, w) => {
      const open = TT.worldOpen(save, lang, w);
      isles[w].setAttribute('aria-label', 'العالم ' + (w + 1) + (open ? '' : ' (مقفل)'));
      row.forEach((b, l) => {
        const ok = TT.isOpen(save, lang, w, l), stars = save.stars[lang][w][l];
        b.classList.toggle('locked', !ok);
        b.classList.toggle('done', stars > 0);
        b.classList.toggle('next', next.w === w && next.l === l);
        b.querySelectorAll('.st svg').forEach((s, i) => s.classList.toggle('on', i < stars));
        b.setAttribute('aria-label', 'المرحلة ' + (l + 1) + (ok ? (stars ? '، ' + starsText(stars) : '') : ' (مقفلة)'));
      });
    });
    setChip('mapStars');
  }
  function toMap(fresh) {
    world = null; test = null;
    refreshMap();
    setScreen('map');
    J.whoosh(0.4);
    unlockFx = fresh >= 0 ? { w: fresh, t: 0 } : null;
    if (unlockFx) {
      J.levelUp();
      const p = A.ISLES[fresh];
      for (let i = 0; i < 4; i++) fx.burst(p.x, p.y - 30, { count: 22, colors: ['#ffd23f', '#ffffff', '#ff7eb6', '#4fd1ff'], speed: 340, life: 0.9, size: 8, gravity: 260 });
    }
  }
  function wiggle(el) { el.classList.remove('wiggle'); void el.offsetWidth; el.classList.add('wiggle'); setTimeout(() => el.classList.remove('wiggle'), 500); }
  function pickLevel(w, l, el) {
    if (!TT.isOpen(save, lang, w, l)) { J.tap(); wiggle(el); return; }
    J.select(); startLevel(w, l);
  }
  function openWorld(w) {
    if (!TT.worldOpen(save, lang, w)) { J.tap(); wiggle(isles[w]); return; }
    for (let l = 0; l < TT.LEVELS; l++) if (TT.isOpen(save, lang, w, l) && !save.stars[lang][w][l]) { J.select(); startLevel(w, l); return; }
    J.select(); startLevel(w, 0);
  }
  function startNext() { const n = TT.nextLevel(save, lang); J.select(); startLevel(n.w, n.l); }

  /* -------------------------------------------------------------- levels */
  function clearFx() { fx.clear(); sparks = []; bolts = []; bows = []; puffs = []; floats = []; for (const k in lit) delete lit[k]; glowBoost = 0; }
  function startLevel(w, l) {
    // Difficulty is read at every level start, before the round is reported.
    const tier = dda[lang].tier;
    const plan = TT.plan(lang, w, l, tier);
    world = TT.create(plan, (Math.random() * 2147483647) | 0);
    cur = { w: w, l: l };
    test = null;
    Kit.stats.round(plan.id);
    coaching = !save.coach;
    if (coaching) Kit.stats.tutorial('start');
    ending = null; result = null;
    clearFx(); clearGarden();
    coach.idle = 0; coach.next = coaching ? 2.2 : 4;
    shownWpm = 0; introT = 0;
    setScreen('play');
    Kit.keys.reset();
    J.whoosh(0.5);
  }
  function restart() {
    J.select();
    if (pausedFrom === 'test' || screen === 'tresult') startTest(testCfg.code ? testCfg : Object.assign({}, testCfg, { seed: newSeed() }));
    else startLevel(cur.w, cur.l);
  }
  function pause(own) {
    if (screen !== 'play' && screen !== 'test') return;
    pausedFrom = screen;
    setScreen('pause');
    if (own) J.back();
    say('استراحة');
  }
  function resume() {
    if (screen !== 'pause') return;
    J.select();
    setScreen(pausedFrom);
    Kit.keys.reset();
  }
  function quit() {
    Kit.stats.end('quit');
    J.back();
    if (pausedFrom === 'test') { if (testCfg && testCfg.code) toTitle(); else openSetup(); } else toMap(-1);
  }

  // A result is saved the moment the level ends, before the celebration.
  function finishLevel() {
    const r = TT.result(world), stars = TT.stars(r), prev = save.stars[lang][cur.w][cur.l];
    const nextWorld = cur.w + 1 < TT.WORLDS && !TT.worldOpen(save, lang, cur.w + 1) ? cur.w + 1 : -1;
    if (stars > prev) save.stars[lang][cur.w][cur.l] = stars;
    persist();
    dda[lang].result(TT.outcome(r));
    Kit.stats.end(r.won ? 'win' : 'lose', Math.round(r.wpm));
    result = { stars: stars, r: r, newWorld: nextWorld >= 0 && TT.worldOpen(save, lang, nextWorld) ? nextWorld : -1 };
    ending = { t: r.won ? 1.6 : 1.4 };
    if (r.won) {
      J.chime(stars);
      if (!calm()) for (let i = 0; i < 5; i++) fx.burst(160 + i * 240, 140, { count: 24, colors: ['#ff7eb6', '#ffd23f', '#4fd1ff', '#5be38f', '#ffffff'], speed: 380, life: 1.1, size: 9, gravity: 420 });
      shake.add(5);
    } else J.fail();
  }
  function showResult() {
    ending = null; resultT = 0; resultLock = 0.8;
    const r = result, won = r.r.won;
    $('resStars').hidden = !won;
    $('resRainy').hidden = won;
    $('resStars').querySelectorAll('svg').forEach(s => s.classList.remove('on'));
    $('resAcc').textContent = r.r.hits + r.r.errors ? Math.round(r.r.acc * 100) + '%' : '—';
    A.animalCard($('resAnimal'), TT.animal(r.r.wpm));
    $('resNext').setAttribute('aria-label', !won ? 'مرة أخرى' : cur.l < TT.LEVELS - 1 ? 'المرحلة التالية' : 'الخريطة');
    $('resNext').querySelector('use').setAttribute('href', won ? '#i-play' : '#i-again');
    $('resAgain').hidden = !won;
    say(won ? starsText(r.stars) : 'حاول مرة أخرى');
    setScreen('result');
  }
  function resultStep(dt) {
    const r = result, before = resultT;
    resultT += dt;
    const at = t => before < t && resultT >= t;
    if (r.r.won) {
      for (let i = 0; i < r.stars; i++) if (at(0.3 + i * 0.38)) { $('resStars').children[i].classList.add('on'); J.star(i + 1); burstAt(560 + i * 80, 250, '#ffd23f'); }
      if (at(0.5 + r.stars * 0.38) && r.newWorld >= 0) J.levelUp();
    }
    busyT += dt;
    if (resultT < 3 && busyT >= 1) { busyT = 0; Kit.stats.busy(); }
  }
  function next() {
    if (!result) return;
    J.select();
    if (!result.r.won) startLevel(cur.w, cur.l);
    else if (cur.l < TT.LEVELS - 1) startLevel(cur.w, cur.l + 1);
    else toMap(result.newWorld);
  }
  function again() { J.select(); startLevel(cur.w, cur.l); }

  /* ------------------------------------------------------- the speed test */
  const newSeed = () => (Math.random() * 2147483647) | 0;
  const TEST_IDS = { 30: 'test30', 60: 'test60' };
  function openSetup() {
    test = null; world = null;
    if (!save.tlang) save.tlang = lang;
    paintSetup();
    setScreen('setup');
  }
  function paintSetup() {
    document.querySelectorAll('[data-tlang]').forEach(b => b.classList.toggle('on', b.dataset.tlang === save.tlang));
    document.querySelectorAll('[data-tdur]').forEach(b => b.classList.toggle('on', +b.dataset.tdur === save.tdur));
    const k = save.tlang + save.tdur;
    $('setupBest').textContent = save.best[k] ? String(Math.round(save.best[k])) : '—';
    A.chart($('setupChart'), save.tests.filter(t => t.k === k).map(t => t.w), save.best[k]);
  }
  function startTest(cfg) {
    testCfg = cfg;
    test = TT.test(cfg);
    world = null;
    // The class challenge is one id for every code: a code is never put in statistics.
    Kit.stats.round(cfg.challenge ? 'class' : TEST_IDS[cfg.dur]);
    testResult = null; ending = null;
    clearFx();
    shownWpm = 0; slide = 0; coach.idle = 0; coach.next = 5;
    setScreen('test');
    Kit.keys.reset();
    J.whoosh(0.5);
  }
  function finishTest() {
    const r = TT.testResult(test), isBest = TT.addTest(save, test.lang, test.dur, r, !!testCfg.code);
    persist();
    Kit.stats.end('end', Math.round(r.wpm));
    testResult = { r: r, isBest: isBest, best: save.best[test.lang + test.dur] };
    ending = { t: 0.9 };
    J.chime(2);
    if (!calm()) for (let i = 0; i < 4; i++) fx.burst(240 + i * 260, 160, { count: 20, colors: ['#ff7eb6', '#ffd23f', '#4fd1ff', '#5be38f', '#ffffff'], speed: 360, life: 1, size: 9, gravity: 420 });
  }
  function showTestResult() {
    ending = null; resultT = 0; resultLock = 0.8;
    const t = testResult, r = t.r, k = r.lang + r.dur;
    $('trWpm').textContent = String(Math.round(r.wpm));
    $('trAcc').textContent = Math.round(r.acc) + '%';
    $('trBest').textContent = String(Math.round(t.best));
    $('trNewBest').hidden = true;
    $('trCode').hidden = !testCfg.code;
    $('trCodeNum').textContent = testCfg.code || '';
    A.animalCard($('trAnimal'), r.animal);
    A.chart($('trChart'), save.tests.filter(x => x.k === k).map(x => x.w), save.best[k]);
    say(Math.round(r.wpm) + ' كلمة في الدقيقة');
    setScreen('tresult');
  }
  function testResultStep(dt) {
    const before = resultT;
    resultT += dt;
    if (before < 0.35 && resultT >= 0.35) {
      if (testResult.isBest) { $('trNewBest').hidden = false; J.star(3); burstAt(640, 360, '#ffd23f'); } else J.star(1);
    }
    busyT += dt;
    if (resultT < 3 && busyT >= 1) { busyT = 0; Kit.stats.busy(); }
  }

  /* ---------------------------------------------------- class challenge */
  let code = '', klassMode = 'enter';
  function openClass() {
    J.select();
    code = ''; klassMode = 'enter';
    paintClass();
    setScreen('klass');
  }
  function paintClass() {
    $('classEnter').hidden = klassMode !== 'enter';
    $('classTeach').hidden = klassMode !== 'teach';
    $('classShow').hidden = klassMode !== 'show';
    const cells = $('codeDigits').children;
    for (let i = 0; i < 4; i++) { cells[i].textContent = code[i] || ''; cells[i].classList.toggle('cur', i === code.length); }
    $('codeGo').disabled = code.length !== 4;
    $('codeGo').classList.toggle('ring', code.length === 4);
  }
  function digit(d) {
    if (klassMode !== 'enter' || code.length >= 4) return;
    code += d; J.tap(); paintClass();
  }
  function backDigit() { if (klassMode === 'enter' && code) { code = code.slice(0, -1); J.back(); paintClass(); } }
  function goCode() {
    const p = TT.parseCode(code);
    if (!p) { J.error(); wiggle($('codeDigits')); code = ''; paintClass(); return; }
    J.select();
    startTest({ lang: p.lang, dur: p.dur, kind: p.kind, seed: p.seed, code: p.code, challenge: true });
  }
  // English sits in a direction isolate, so the line reads right to left: «English · 30 ثانية».
  function presetText(p) { return (p.lang === 'ar' ? 'عربي' : '\u2068English\u2069') + (p.kind === 'easy' ? ' سهل' : '') + ' · ' + p.dur + ' ثانية'; }
  function buildClass() {
    const pad = $('codePad');
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].forEach(d => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = d; b.dataset.d = d;
      on(b, () => digit(d)); pad.appendChild(b);
    });
    const del = document.createElement('button'); del.type = 'button'; del.setAttribute('aria-label', 'امسح');
    del.innerHTML = '<svg aria-hidden="true"><use href="#i-del"/></svg>'; on(del, backDigit); pad.appendChild(del);
    const box = $('presets');
    Object.keys(TT.PRESETS).forEach(n => {
      const p = TT.PRESETS[n], b = document.createElement('button');
      b.type = 'button'; b.dataset.p = n; b.textContent = presetText(p);
      on(b, () => showCode(+n)); box.appendChild(b);
    });
    on($('teacherBtn'), () => { J.select(); klassMode = 'teach'; paintClass(); });
    on($('classClose'), closeClass);
    on($('codeGo'), goCode);
    on($('showBack'), () => { J.back(); klassMode = 'teach'; paintClass(); });
    on($('showDice'), () => showCode(TT.parseCode($('showCode').textContent).preset));
    on($('showPlay'), () => { code = $('showCode').textContent; goCode(); });
  }
  function showCode(preset) {
    J.select();
    const c = TT.makeCode(preset, Math.floor(Math.random() * 1000)), p = TT.parseCode(c);
    $('showCode').textContent = c;
    $('showDesc').textContent = presetText(p);
    klassMode = 'show'; paintClass();
  }
  function closeClass() { J.back(); toTitle(); }

  /* --------------------------------------------------------------- input */
  on($('btnAr'), () => pickLang('ar'));
  on($('btnEn'), () => pickLang('en'));
  on($('btnTest'), () => { J.select(); openSetup(); });
  on($('btnClass'), openClass);
  on($('mapHome'), () => { J.back(); toTitle(); });
  on($('btnPause'), () => pause(true));
  on($('btnResume'), resume);
  on($('btnRestart'), restart);
  on($('btnMap'), quit);
  on($('resNext'), () => { if (resultLock <= 0) next(); });
  on($('resAgain'), () => { if (resultLock <= 0) again(); });
  on($('resMap'), () => { if (resultLock <= 0) { J.back(); toMap(result && result.r.won && cur.l === TT.LEVELS - 1 ? result.newWorld : -1); } });
  on($('setupHome'), () => { J.back(); toTitle(); });
  on($('btnGo'), () => { J.select(); startTest({ lang: save.tlang, dur: save.tdur, kind: 'test', seed: newSeed() }); });
  document.querySelectorAll('[data-tlang]').forEach(b => on(b, () => { J.toggle(true); save.tlang = b.dataset.tlang; persist(); paintSetup(); }));
  document.querySelectorAll('[data-tdur]').forEach(b => on(b, () => { J.toggle(true); save.tdur = +b.dataset.tdur; persist(); paintSetup(); }));
  on($('trAgain'), () => { if (resultLock <= 0) restart(); });
  on($('trHome'), () => { if (resultLock <= 0) { J.back(); toTitle(); } });

  canvas.addEventListener('pointerdown', () => { focusGame(); menuIdle = 0; });
  window.addEventListener('pointermove', () => { menuIdle = 0; });
  // Typing goes straight to the engine on keydown (a slow frame never drops a letter).
  // Esc pauses (in update); P is a letter here, so it never pauses.
  window.addEventListener('keydown', e => {
    if (screen === 'klass' && klassKey(e)) return;
    if (!Kit.isGameKeyEvent(e)) return;
    menuIdle = 0;
    if (screen !== 'play' && screen !== 'test') return;
    if (e.repeat || e.code === 'Escape') return;
    const ev = { key: e.key, code: e.code, shift: e.shiftKey };
    if (!TT.printable(ev)) return;
    e.preventDefault(); // ' and / open a quick-find bar in some browsers
    if (screen === 'play' && world && !ending) typeLevel(ev);
    else if (screen === 'test' && test && !test.over) typeTest(ev);
  });
  // The class challenge dialog takes digits (also Arabic-Indic ones), Backspace and Enter.
  function klassKey(e) {
    if (e.ctrlKey || e.altKey || e.metaKey || e.isComposing) return false;
    if (e.code === 'Escape') { e.preventDefault(); if (klassMode === 'enter') closeClass(); else { J.back(); klassMode = klassMode === 'show' ? 'teach' : 'enter'; paintClass(); } return true; }
    if (klassMode !== 'enter') return false;
    const d = /^[0-9]$/.test(e.key) ? e.key : /^[٠-٩]$/.test(e.key) ? String(e.key.charCodeAt(0) - 0x660) : /^(Digit|Numpad)[0-9]$/.test(e.code) ? e.code.slice(-1) : '';
    if (d) { e.preventDefault(); digit(d); return true; }
    if (e.code === 'Backspace') { e.preventDefault(); backDigit(); return true; }
    if ((e.code === 'Enter' || e.code === 'NumpadEnter') && !Kit.keys.isNativeTarget(e.target)) { e.preventDefault(); if (code.length === 4) goCode(); return true; }
    return false;
  }
  function handleKeys() {
    const K = Kit.keys, go = K.anyPressed(['Enter', 'NumpadEnter', 'Space']);
    if (screen === 'title') { if (go) pickLang(lang); }
    else if (screen === 'map') { if (go) startNext(); else if (K.pressed('Escape')) { J.back(); toTitle(); } }
    else if (screen === 'play' || screen === 'test') { if (K.pressed('Escape')) pause(true); }
    else if (screen === 'pause') { if (K.anyPressed(['Escape', 'Enter', 'NumpadEnter', 'Space'])) resume(); }
    else if (screen === 'result' && resultLock <= 0) {
      if (go) next(); else if (K.pressed('KeyR')) (result.r.won ? again() : next());
      else if (K.pressed('Escape')) { J.back(); toMap(-1); }
    } else if (screen === 'setup') {
      if (go) { J.select(); startTest({ lang: save.tlang, dur: save.tdur, kind: 'test', seed: newSeed() }); }
      else if (K.pressed('Escape')) { J.back(); toTitle(); }
    } else if (screen === 'tresult' && resultLock <= 0) {
      if (go || K.pressed('KeyR')) restart();
      else if (K.pressed('Escape')) { J.back(); toTitle(); }
    }
  }

  /* ------------------------------------------------------------- typing */
  function keyTop(code) { const k = TT.KEYS[code]; return k ? { x: k.x + k.w / 2, y: k.y + 4 } : { x: W / 2, y: TT.KB.y }; }
  function flashKey(code, kind) { if (TT.KEYS[code]) lit[code] = { kind: kind, t: kind === 'bad' ? 0.35 : 0.2 }; }
  function typeLevel(ev) {
    const n = TT.key(world, ev);
    if (n === 0) return;
    coach.idle = 0; stopGhost();
    flashKey(ev.code, n > 0 ? 'good' : 'bad');
    handleEvents(ev);
  }
  function typeTest(ev) {
    const n = TT.testKey(test, ev);
    if (n === 0) return;
    coach.idle = 0; stopGhost();
    flashKey(ev.code, n > 0 ? 'good' : 'bad');
    for (const e of test.ev) {
      if (e.t === 'key') { Kit.track.hit(); J.tap(); if (e.combo > 0 && e.combo % 25 === 0) praise(e.combo / 25 - 1, 640, 330); }
      else if (e.t === 'word') { J.pop(0.4); slide += 1; }
      else if (e.t === 'miss') miss(640, 230);
    }
    test.ev.length = 0;
  }
  function miss(x, y) {
    Kit.track.miss();
    glowBoost = 1;
    if (time - lastMiss > 0.3) J.error();
    lastMiss = time;
    if (!calm()) fx.burst(x, y, { count: 6, colors: ['#ffffff', '#c9cfe6'], speed: 140, life: 0.35, size: 6, gravity: 200 });
  }
  function praise(i, x, y) {
    float(x, y, PRAISE[Math.max(0, Math.min(3, i))], '#ffd23f', 64);
    J.chime(1);
    if (!calm()) fx.burst(x, y, { count: 28, colors: A.RAINBOW, speed: 380, life: 0.9, size: 8, gravity: 300 });
  }
  function float(x, y, text, color, size) {
    floats.push({ x: x, y: y, text: text, color: color, size: size || 34, t: 0 });
    if (floats.length > 14) floats.shift();
  }
  function burstAt(x, y, color) { fx.burst(x, y, { count: 16, colors: [color, '#ffffff', '#ffd23f'], speed: 300, life: 0.6, size: 8, gravity: 300 }); }
  function handleEvents(ev) {
    for (const e of world.ev) {
      if (e.t === 'ready') Kit.track.cue();
      else if (e.t === 'spawn') { /* clouds slide in quietly */ }
      else if (e.t === 'key') {
        Kit.track.hit(); J.tap();
        const c = TT.find(world, e.id), from = keyTop(ev ? ev.code : 'Space');
        if (c) sparks.push({ x1: from.x, y1: from.y, x2: c.letterX || c.x, y2: c.letterY || c.y, t: 0 });
        if (sparks.length > 12) sparks.shift();
        if (e.combo >= 3) comboBump = 1;
        if (e.combo > 0 && e.combo % 15 === 0) praise(e.combo / 15 - 1, W / 2, 210);
      } else if (e.t === 'zap') zap(e, ev);
      else if (e.t === 'miss') miss(e.x, e.y);
      else if (e.t === 'rain') {
        Kit.track.miss();
        J.land(0.4); shake.add(4);
        sunBump[Math.max(0, Math.min(2, e.suns))] = 1;
        float(e.x, e.y + 70, '☂', '#4fd1ff', 40);
      } else if (e.t === 'done' || e.t === 'lose') finishLevel();
    }
    world.ev.length = 0;
  }
  function zap(e, ev) {
    const from = keyTop(ev ? ev.code : 'Space'), c = TT.find(world, e.id);
    bolts.push({ x1: from.x, y1: from.y, x2: e.x, y2: e.y + 28, t: 0, seed: 1 + ((time * 1000) | 0) % 997 });
    bows.push({ x: e.x, y: e.y + 46, r: Math.max(60, (c ? c.w : 150) * 0.42), t: 0 });
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; puffs.push({ x: e.x, y: e.y, vx: Math.cos(a) * 160, vy: Math.sin(a) * 90, r: 22, t: 0 }); }
    if (puffs.length > 48) puffs.splice(0, puffs.length - 48);
    if (bolts.length > 4) bolts.shift();
    if (bows.length > 4) bows.shift();
    fx.burst(e.x, e.y + 30, { count: 14, colors: ['#6fd0ff', '#bfefff', '#ffffff'], speed: 140, life: 0.8, size: 6, gravity: 900, angle: Math.PI / 2, spread: 1.6 });
    fx.burst(e.x, e.y, { count: 18, colors: ['#ffd23f', '#ffffff', '#ff7eb6', '#4fd1ff'], speed: 320, life: 0.7, size: 7, gravity: 160 });
    float(e.x, e.y - 50, '+1', '#ffffff', 40);
    J.impact(0.35); J.pop(0.6);
    if (e.combo >= 3) J.streak(Math.min(13, Math.floor(e.combo / 3)));
    shake.add(3);
    if (!calm()) flashT = 0.16;
    // a flower grows in the garden for every cloud
    const side = flowers.length % 2, fxr = side ? 1040 + Math.random() * 216 : 24 + Math.random() * 212;
    if (flowers.length < 60) flowers.push({ x: fxr, y: 480 + Math.random() * 220, kind: (Math.random() * 6) | 0, t: 0 });
    if (coaching) { coaching = false; Kit.stats.tutorial('done'); if (!save.coach) { save.coach = true; persist(); } }
    coach.idle = 0; coach.next = 4;
  }

  /* --------------------------------------------------- the coach's hand */
  // A wordless coach: after a few idle seconds a hand taps the glowing key (or the button
  // to press on a menu). It runs on the game clock, so it freezes with a pause.
  const ghostEl = $('ghost');
  A.handInto(ghostEl);
  function showGhost(x, y, dom) { ghost.on = true; ghost.x = x; ghost.y = y; ghost.t = 0; ghost.dom = dom; }
  function stopGhost() { ghost.on = false; if (ghostEl) ghostEl.hidden = true; }
  function ghostStep(dt) {
    if (!ghost.on) return;
    ghost.t += dt;
    if (ghost.t > 2.2) { stopGhost(); return; }
    if (ghost.dom && ghostEl) {
      const press = ghostPress();
      ghostEl.hidden = false;
      ghostEl.style.transform = 'translate(' + (ghost.x - 40).toFixed(1) + 'px,' + (ghost.y - 98 + press * 10).toFixed(1) + 'px)';
      ghostEl.style.opacity = ghostAlpha().toFixed(2);
    }
  }
  function ghostPress() { return calm() ? 0 : Math.max(0, Math.sin(Math.min(1, (ghost.t % 0.8) / 0.5) * Math.PI)); }
  function ghostAlpha() { return Math.min(1, ghost.t * 5, (2.2 - ghost.t) * 5); }
  function coachStep(dt) {
    coach.idle += dt;
    if (ghost.on || coach.idle < coach.next) return;
    const k = currentKey();
    if (!k) { coach.next = coach.idle + 0.5; return; }
    const c = A.keyCenter(k.code);
    showGhost(c.x, c.y, false);
    coach.next = coach.idle + 6;
  }
  function centerOf(el) {
    const r = el.getBoundingClientRect();
    return r.width ? view.toLogical(r.left + r.width / 2, r.top + r.height / 2) : null;
  }
  function menuGhost() {
    let el = null;
    if (screen === 'title') el = lang === 'en' ? $('btnEn') : $('btnAr');
    else if (screen === 'map') el = document.querySelector('.pebble.next');
    else if (screen === 'result' && resultT > 1.5) el = $('resNext');
    else if (screen === 'setup') el = $('btnGo');
    if (!el) return;
    const p = centerOf(el);
    if (p) showGhost(p.x, p.y, true);
  }
  // The key to press now (with Shift when it needs it), for the glow and the coach.
  function currentKey() {
    if (screen === 'play' && world && !ending) { const n = TT.next(world); return n && n.key; }
    if (screen === 'test' && test && !test.over) {
      const w = TT.testWord(test);
      return test.ci >= w.length ? { code: 'Space', shift: false } : TT.nextKey(w, test.ci, test.lang);
    }
    return null;
  }

  /* ----------------------------------------------------------------- loop */
  function decay(dt) {
    for (const k in lit) { lit[k].t -= dt; if (lit[k].t <= 0) delete lit[k]; }
    glowBoost = Math.max(0, glowBoost - dt * 1.5); comboBump = Math.max(0, comboBump - dt * 4); flashT = Math.max(0, flashT - dt);
    for (let i = 0; i < 3; i++) sunBump[i] = Math.max(0, sunBump[i] - dt * 2);
    for (let i = sparks.length - 1; i >= 0; i--) { sparks[i].t += dt; if (sparks[i].t > 0.22) sparks.splice(i, 1); }
    for (let i = bolts.length - 1; i >= 0; i--) { bolts[i].t += dt; if (bolts[i].t > 0.32) bolts.splice(i, 1); }
    for (let i = bows.length - 1; i >= 0; i--) { bows[i].t += dt; if (bows[i].t > 1.3) bows.splice(i, 1); }
    for (let i = puffs.length - 1; i >= 0; i--) { const p = puffs[i]; p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.t > 0.5) puffs.splice(i, 1); }
    for (let i = floats.length - 1; i >= 0; i--) { const f = floats[i]; f.t += dt; f.y -= dt * 46; if (f.t > 1.1) floats.splice(i, 1); }
    for (const f of flowers) f.t += dt;
  }
  function playStep(dt) {
    if (!ending) {
      TT.step(world, dt);
      handleEvents(null);
      if (!ending) coachStep(dt);
      introT += dt;
      shownWpm += (TT.liveWpm(world) - shownWpm) * Math.min(1, dt * 3);
    } else {
      ending.t -= dt;
      busyT += dt;
      if (busyT >= 1) { busyT = 0; Kit.stats.busy(); }
      if (ending.t <= 0) showResult();
    }
  }
  function testStep(dt) {
    if (!ending) {
      const left = Math.ceil(test.dur - test.t);
      TT.testStep(test, dt);
      const now = Math.ceil(test.dur - test.t);
      if (test.started && now !== left && now >= 1 && now <= 3) J.countdown(now);
      for (const e of test.ev) if (e.t === 'over') finishTest();
      test.ev.length = 0;
      if (!ending) coachStep(dt);
      shownWpm += (TT.testLiveWpm(test) - shownWpm) * Math.min(1, dt * 3);
      slide = Math.max(0, slide - dt * 6);
    } else {
      ending.t -= dt;
      busyT += dt;
      if (busyT >= 1) { busyT = 0; Kit.stats.busy(); }
      if (ending.t <= 0) showTestResult();
    }
  }
  function decoStep(dt) {
    // Title clouds carry letters; now and then a silent bolt from the town pops one.
    while (deco.length < 5) {
      const ar = deco.length % 2 === 0, set = ar ? 'بتنملاسيكشعقف' : 'abcdefghklmnoprst';
      deco.push({ x: time < 0.1 ? 100 + deco.length * 260 : -120 - Math.random() * 500, y: 120 + Math.random() * 360, v: 26 + Math.random() * 22, text: set[(Math.random() * set.length) | 0], lang: ar ? 'ar' : 'en', w: 150, phase: Math.random() * 6, zap: 0 });
    }
    for (let i = deco.length - 1; i >= 0; i--) {
      const d = deco[i];
      d.x += d.v * dt;
      if (d.zap > 0) { d.zap += dt; if (d.zap > 0.4) deco.splice(i, 1); continue; }
      if (d.x > W + 140) deco.splice(i, 1);
    }
    if (!calm() && Math.random() < dt / 2.6) {
      const d = deco.find(o => !o.zap && o.x > 120 && o.x < W - 120 && (o.y > 300 || o.x < 330 || o.x > 950));
      if (d) {
        d.zap = 0.001;
        bolts.push({ x1: d.x + 60, y1: 640, x2: d.x, y2: d.y + 28, t: 0, seed: (Math.random() * 900) | 0 });
        bows.push({ x: d.x, y: d.y + 40, r: 70, t: 0 });
        fx.burst(d.x, d.y, { count: 14, colors: ['#ffd23f', '#ffffff', '#ff7eb6'], speed: 260, life: 0.6, size: 7, gravity: 160 });
      }
    }
  }
  const parade = { x: 0 };
  function update(dt) {
    time += dt;
    handleKeys();
    if (screen === 'play' && world) playStep(dt);
    else if (screen === 'test' && test) testStep(dt);
    else if (screen !== 'pause') {
      if (screen === 'title' || screen === 'klass') { decoStep(dt); parade.x += dt * 90; }
      if (screen === 'result') resultStep(dt);
      if (screen === 'tresult') testResultStep(dt);
      if (resultLock > 0) resultLock -= dt;
      if (unlockFx) { unlockFx.t += dt; if (unlockFx.t > 1.4) unlockFx = null; }
      if (screen !== 'klass') {
        menuIdle += dt;
        if (!ghost.on && menuIdle >= menuNext) { menuNext = menuIdle + 6; menuGhost(); }
      }
    }
    if (screen !== 'pause') {
      ghostStep(dt);
      fx.update(dt); shake.update(dt); decay(dt);
      if (fx.list.length > 300) fx.list.splice(0, fx.list.length - 300);
      phase += dt * (2 + Math.min(40, shownWpm) * 0.35);
    }
    Kit.keys.endFrame();
  }

  /* --------------------------------------------------------------- render */
  // Rainbows and puffs sit in the sky; bolts and sparks leave the keyboard, so they
  // are drawn over it (drawSparks), with the particles and the floating words.
  function drawSky(g) {
    for (const b of bows) A.rainbow(g, b.x, b.y, b.r, Math.min(1, b.t * 6) * Math.max(0, 1 - Math.max(0, b.t - 0.7) / 0.6));
    for (const p of puffs) A.puff(g, p.x, p.y, p.r * (1 + p.t * 1.5), Math.max(0, 1 - p.t / 0.5));
  }
  function drawFx(g) {
    const still = calm();
    for (const b of bolts) A.bolt(g, b.x1, b.y1, b.x2, b.y2, b.seed, b.t / 0.32);
    for (const s of sparks) {
      const k = Math.min(1, s.t / 0.2), x = s.x1 + (s.x2 - s.x1) * k, y = s.y1 + (s.y2 - s.y1) * k;
      g.globalAlpha = 1 - k * 0.3;
      A.starPath(g, x, y, 11, 5, k * 3); g.fillStyle = '#fff27a'; g.fill(); g.lineWidth = 2.5; g.strokeStyle = A.INK; g.stroke();
      g.globalAlpha = 1;
    }
    fx.draw(g);
    for (const f of floats) {
      g.globalAlpha = Math.max(0, 1 - Math.max(0, f.t - 0.6) / 0.5);
      const pop = still ? 1 : Math.min(1, 0.6 + f.t * 4);
      A.text(g, f.text, f.x, f.y, f.size * pop, f.color);
    }
    g.globalAlpha = 1;
  }
  function drawKeyboard(g, kbLang) {
    const still = calm();
    const C = A.KB_CROP;
    g.drawImage(A.keyboardBase(kbLang, pixelScale(), true), C.x, C.y, C.w, C.h);
    const k = currentKey();
    if (k) {
      A.keyLit(g, k.code, kbLang, 'glow', 1 + glowBoost, time, still);
      if (k.shift) A.keyLit(g, TT.leftHand(k.code) ? 'ShiftRight' : 'ShiftLeft', kbLang, 'glow', 1, time, still);
    }
    for (const code in lit) if (!k || code !== k.code || lit[code].kind === 'bad') A.keyLit(g, code, kbLang, lit[code].kind, 1, time, still);
    if (ghost.on && !ghost.dom) A.hand(g, ghost.x, ghost.y, ghostPress(), ghostAlpha());
  }
  function drawHud(g) {
    const still = calm(), w = world;
    // progress: clouds done of the level
    A.pill(g, 88, 14, 170, 58);
    A.cloudIcon(g, 126, 42, 1.2);
    A.text(g, w.done + '/' + w.total, 206, 44, 30, A.INK, { outline: 0 });
    A.track(g, TT.liveWpm(w), shownWpm, phase, time, still, w.plan.target);
    for (let i = 0; i < TT.SUNS; i++) {
      const s = 1 + sunBump[i] * 0.4;
      A.sun(g, 1150 - i * 56, 42, 19 * s, i >= w.suns, time, still);
    }
    if (w.combo >= 3) drawCombo(g, w.combo);
  }
  // The chain of right keys: a bolt, the count, and «سلسلة!».
  function drawCombo(g, n) {
    const s = 1 + comboBump * 0.18;
    g.save(); g.translate(348, 43); g.scale(s, s);
    A.pill(g, -74, -27, 148, 54, '#fff3c4');
    A.boltIcon(g, 50, -1, 1);
    A.text(g, 'سلسلة!', 4, -9, 19, A.INK, { outline: 0, rtl: true });
    A.text(g, String(n), 4, 12, 24, '#ff7a1a', { outline: 4 });
    g.restore();
  }
  // Grown flowers are baked into one cached strip of garden; only growing ones are drawn live.
  let garden = null, gardenPs = 0;
  function drawGarden(g) {
    const ps = pixelScale();
    if (!garden || gardenPs !== ps) {
      garden = document.createElement('canvas'); garden.width = Math.ceil(W * ps); garden.height = Math.ceil(290 * ps); gardenPs = ps;
      for (const f of flowers) f.baked = false;
    }
    const gc = garden.getContext('2d');
    let baked = false;
    for (const f of flowers) {
      if (!f.baked && (f.t >= 0.5 || calm())) { gc.setTransform(ps, 0, 0, ps, 0, -430 * ps); A.flower(gc, f.x, f.y, f.kind, 1); f.baked = true; }
      if (f.baked) baked = true; else A.flower(g, f.x, f.y, f.kind, f.t / 0.5);
    }
    if (baked) g.drawImage(garden, 0, 430, W, 290);
  }
  function clearGarden() { flowers = []; if (garden) garden.getContext('2d').clearRect(0, 0, garden.width, garden.height); }
  function drawPlay(g) {
    const w = world, still = calm(), P = w.plan;
    g.drawImage(A.scene('play', pixelScale()), 0, 0, W, H);
    A.driftClouds(g, time, still);
    drawGarden(g);
    const n = ending ? null : TT.next(w), target = n && n.cloud;
    const list = w.clouds.slice().sort((a, b) => (a.id === w.lock) - (b.id === w.lock) || a.y - b.y);
    for (const c of list) {
      if (c.state === 'zap') continue;
      const storm = P.wait ? 0 : Math.max(0, Math.min(0.85, (c.y - 160) / (TT.TOWN_Y - 160)));
      if (c.state === 'rain') A.rain(g, c.x, c.y, c.w, c.t / 1.5, time);
      g.globalAlpha = c.state === 'rain' ? Math.max(0, 1 - Math.max(0, c.t - 1) / 0.5) : 1;
      c.lang = P.lang; c.storm = c.state === 'rain' ? 1 : storm; c.locked = c.id === w.lock;
      c.next = c === target && n.key ? (n.key.code === 'KeyB' && P.lang === 'ar' ? 2 : 1) : 0;
      c.scale = c.state === 'in' ? 0.85 + 0.15 * Math.min(1, Math.max(0, (c.y + 70) / 166)) : 1;
      A.cloud(g, c, time, still);
      g.globalAlpha = 1;
    }
    drawSky(g);
    drawKeyboard(g, P.lang);
    drawFx(g);
    // the dotted guide from the letter to its key, for the youngest tiers and the first coach
    if (target && n.key && (P.guide || coaching) && target.letterX) {
      const k = TT.KEYS[n.key.code];
      A.guide(g, target.letterX, target.letterY + 26, k.x + k.w / 2, k.y - 6, time, still);
    }
    drawHud(g);
    // The level's number pops up for a moment as it starts.
    if (introT < 1.4 && !ending) {
      const k = introT / 1.4, s = still ? 1 : Math.min(1.08, 0.4 + k * 5) - Math.max(0, k * 5 - 1) * 0.08;
      g.save(); g.globalAlpha = Math.min(1, (1 - k) * 4); g.translate(640, 300); g.scale(Math.max(1, s), Math.max(1, s));
      A.pill(g, -120, -44, 240, 88, '#ffd23f');
      A.boltIcon(g, 76, 0, 1.5, '#ffffff');
      A.text(g, (cur.w + 1) + '-' + (cur.l + 1), -22, 3, 54, '#ffffff', { outline: 9 });
      g.restore();
    }
    if (flashT > 0) { g.fillStyle = 'rgba(255,255,240,' + (flashT * 1.4).toFixed(3) + ')'; g.fillRect(0, 0, W, H); }
  }
  // The speed test: the timer, the running animal, a ribbon of words and the keyboard.
  const ribbon = { y: 236 };
  function drawTest(g) {
    const s = test, still = calm(), ar = s.lang === 'ar', dir = ar ? -1 : 1;
    g.drawImage(A.scene('play', pixelScale()), 0, 0, W, H);
    A.driftClouds(g, time, still);
    // timer ring
    const left = s.dur - s.t, k = left / s.dur;
    g.beginPath(); g.arc(1140, 44, 36, 0, Math.PI * 2); g.fillStyle = '#ffffff'; g.fill(); g.lineWidth = 5; g.strokeStyle = A.INK; g.stroke();
    g.beginPath(); g.moveTo(1140, 44); g.arc(1140, 44, 30, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); g.closePath(); g.fillStyle = left <= 5 && s.started ? '#ff7e5f' : '#9fe4ff'; g.fill();
    A.text(g, String(Math.ceil(left)), 1140, 46, 32, '#ffffff', { outline: 6 });
    if (s.combo >= 3) drawCombo(g, s.combo);
    A.track(g, TT.testLiveWpm(s), shownWpm, phase, time, still);
    // the word card
    A.rr(g, 70, 136, 1140, 200, 40); g.fillStyle = 'rgba(28,34,80,0.3)'; g.fill();
    A.rr(g, 70, 130, 1140, 200, 40); g.fillStyle = '#ffffff'; g.fill(); g.lineWidth = 6; g.strokeStyle = A.INK; g.stroke();
    g.save(); A.rr(g, 76, 136, 1128, 188, 34); g.clip();
    const word = TT.testWord(s), cx = 640, size = 64;
    g.font = A.font(size); g.direction = ar ? 'rtl' : 'ltr'; g.textBaseline = 'middle';
    const cw = g.measureText(word).width, off = slide * 120 * dir * -1;
    // finished words on one side, coming words on the other
    let x = cx + off - dir * (cw / 2 + 40);
    g.font = A.font(40);
    for (let i = s.wi - 1; i >= 0 && Math.abs(x - cx) < 700; i--) {
      const ww = g.measureText(s.words[i]).width;
      g.globalAlpha = 0.45; A.text(g, s.words[i], x - dir * ww / 2, ribbon.y, 40, '#3fb85a', { outline: 0 });
      x -= dir * (ww + 36);
    }
    x = cx + off + dir * (cw / 2 + 44);
    for (let i = s.wi + 1; i < s.words.length && Math.abs(x - cx) < 700; i++) {
      g.font = A.font(44);
      const ww = g.measureText(s.words[i]).width;
      g.globalAlpha = i === s.wi + 1 ? 0.85 : 0.55; A.text(g, s.words[i], x + dir * ww / 2, ribbon.y, 44, '#7a83b8', { outline: 0 });
      x += dir * (ww + 40);
    }
    g.globalAlpha = 1;
    const c = { text: word, typed: Math.min(s.ci, word.length), x: cx + off, y: ribbon.y - 6, w: cw + 40, shake: 0, phase: 0, lang: s.lang, storm: 0, locked: false,
      next: s.ci < word.length ? (ar && word[s.ci] === 'ل' && /[اأإآ]/.test(word[s.ci + 1] || '') ? 2 : 1) : 0, scale: 1 };
    drawWord(g, c, size, still);
    g.restore();
    if (s.ci >= word.length) A.text(g, 'مسافة', 640, 300, 26, '#ff9f1c', { outline: 5 });
    if (!s.started) A.text(g, ar ? 'ابدأ الكتابة!' : 'ابدأ الكتابة! Start typing', 640, 382, 34, '#ffffff', { outline: 7 });
    if (testCfg && testCfg.code) { A.pill(g, 900, 18, 170, 52, '#fff3c4'); A.text(g, testCfg.code, 985, 45, 32, A.INK, { outline: 0 }); }
    drawKeyboard(g, s.lang);
    drawFx(g);
  }
  // A test word: like a cloud's word, without the cloud.
  function drawWord(g, c, size, still) {
    const ar = c.lang === 'ar';
    g.font = A.font(size); g.direction = ar ? 'rtl' : 'ltr'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const full = g.measureText(c.text).width, pre = n => n <= 0 ? 0 : g.measureText(c.text.slice(0, n) + (n < c.text.length ? '‍' : '')).width;
    const tw = pre(c.typed), edge = ar ? c.x + full / 2 : c.x - full / 2, dir = ar ? -1 : 1;
    g.fillStyle = A.INK; g.fillText(c.text, c.x, c.y);
    if (c.typed > 0) {
      g.save(); g.beginPath(); g.rect(ar ? edge - tw - 2 : edge - 6, c.y - 60, tw + 8, 120); g.clip();
      g.lineJoin = 'round'; g.lineWidth = 10; g.strokeStyle = A.INK; g.strokeText(c.text, c.x, c.y);
      g.fillStyle = '#ffd23f'; g.fillText(c.text, c.x, c.y);
      g.restore();
    }
    if (c.next) {
      const nw = Math.max(16, pre(c.typed + c.next) - tw), nx = edge + dir * (tw + nw / 2), p = still ? 1 : 0.75 + 0.25 * Math.sin(time * 9);
      A.rr(g, nx - nw / 2 - 3, c.y + size * 0.48, nw + 6, 10, 5); g.fillStyle = A.INK; g.fill();
      A.rr(g, nx - nw / 2, c.y + size * 0.48 + 2, nw, 6, 3); g.fillStyle = 'rgba(255,159,28,' + p.toFixed(3) + ')'; g.fill();
    }
  }
  function drawTitle(g) {
    const still = calm();
    g.drawImage(A.scene('title', pixelScale()), 0, 0, W, H);
    A.driftClouds(g, time, still);
    for (const d of deco) {
      const k = d.zap ? Math.min(1, d.zap / 0.25) : 0;
      if (k >= 1) continue;
      g.globalAlpha = 1 - k;
      A.cloud(g, { text: d.text, typed: d.zap ? 1 : 0, x: d.x, y: d.y, w: d.w, shake: 0, phase: d.phase, lang: d.lang, storm: 0, locked: false, next: 0, scale: 0.8 + k * 0.3 }, time, still);
      g.globalAlpha = 1;
    }
    // the six speed animals run along the street, slow to fast
    for (let i = 0; i < 6; i++) {
      const x = W + 80 - ((parade.x * (0.35 + i * 0.22) + i * 230) % (W + 200));
      A.animal(g, i, x, 668, 0.9, time * (3 + i * 2), still);
    }
    drawSky(g);
    drawFx(g);
  }
  function drawMap(g) {
    g.drawImage(A.map(lang, pixelScale()), 0, 0, W, H);
    A.ISLES.forEach((p, w) => {
      const fresh = unlockFx && unlockFx.w === w;
      if (!TT.worldOpen(save, lang, w)) {
        A.circle(g, p.x, p.y + 4, 36); g.fillStyle = 'rgba(255,255,255,0.85)'; g.fill(); g.lineWidth = 4; g.strokeStyle = A.INK; g.stroke();
        A.lock(g, p.x, p.y - 4);
      } else if (fresh && unlockFx.t < 0.8) {
        g.globalAlpha = 1 - unlockFx.t / 0.8; const s = 1 + unlockFx.t;
        g.save(); g.translate(p.x, p.y - 20); g.scale(s, s); A.lock(g, 0, 0); g.restore(); g.globalAlpha = 1;
      }
    });
    drawFx(g);
  }
  function drawBack(g) {
    g.drawImage(A.scene('title', pixelScale()), 0, 0, W, H);
    A.driftClouds(g, time, calm());
    drawSky(g);
    drawFx(g);
  }
  function render() {
    if (screen === 'pause' && !dirty) return;
    dirty = false;
    const g = view.ctx;
    g.save();
    g.translate(shake.x, shake.y);
    const base = screen === 'pause' ? pausedFrom : screen;
    if (base === 'title' || base === 'klass') drawTitle(g);
    else if (base === 'map') drawMap(g);
    else if ((base === 'play' || base === 'result') && world) drawPlay(g);
    else if ((base === 'test' || base === 'tresult') && test) drawTest(g);
    else drawBack(g);
    g.restore();
  }

  canvas.addEventListener('contextrestored', () => { A.reset(); garden = null; dirty = true; });
  if (document.fonts && document.fonts.load) {
    Promise.all([document.fonts.load('700 40px Fredoka', 'بتث'), document.fonts.load('700 40px Fredoka', 'Aa1')])
      .then(() => { A.reset(); dirty = true; }, () => { /* fallback fonts */ });
  }

  /* --------------------------------------------------- test and debug hook */
  const page = (x, y) => { const r = canvas.getBoundingClientRect(); return { x: r.left + x * view.scale, y: r.top + y * view.scale }; };
  function nextText() {
    if (screen === 'play' && world && !world.over) { const n = TT.next(world); return n ? n.cloud.text.slice(n.cloud.typed) : ''; }
    if (screen === 'test' && test && !test.over) { const w = TT.testWord(test); return test.ci >= w.length ? ' ' : w.slice(test.ci); }
    return '';
  }
  window.__game = {
    get state() {
      const w = world, s = test, k = currentKey();
      return {
        screen: screen, paused: screen === 'pause', pausedFrom: pausedFrom, lang: lang, mode: w ? 'level' : s ? (testCfg && testCfg.code ? 'class' : 'test') : '',
        world: cur.w, level: cur.l, tier: w ? w.plan.tier : 0, t: w ? Math.round(w.t * 1000) / 1000 : s ? Math.round(s.t * 1000) / 1000 : 0,
        keys: w ? w.hits : s ? s.hits : 0, errors: w ? w.errors : s ? s.errors : 0, chars: w ? w.chars : 0, done: w ? w.done : 0, total: w ? w.total : 0,
        suns: w ? w.suns : 0, combo: w ? w.combo : s ? s.combo : 0, lock: w ? w.lock : 0, over: w ? w.over : s ? s.over : false, won: w ? w.won : false,
        ending: !!ending, stars: result ? result.stars : 0, wait: w ? w.plan.wait : false,
        clouds: w ? w.clouds.map(c => ({ id: c.id, text: c.text, typed: c.typed, x: Math.round(c.x), y: Math.round(c.y), state: c.state })) : [],
        next: nextText().slice(0, 1), rest: nextText(), nextKey: k ? k.code : '', shift: k ? !!k.shift : false,
        test: s ? { lang: s.lang, dur: s.dur, kind: s.kind, started: s.started, t: s.t, wi: s.wi, ci: s.ci, word: TT.testWord(s), words: s.words.slice(0, 12) } : null,
        code: testCfg && testCfg.code ? testCfg.code : '', klass: screen === 'klass' ? klassMode : '', typedCode: code,
        result: testResult ? { wpm: testResult.r.wpm, acc: testResult.r.acc, best: testResult.isBest } : null,
        ghost: ghost.on, flowers: flowers.length, clock: Math.round(time * 100) / 100
      };
    },
    get save() { return JSON.parse(JSON.stringify(save)); },
    engine: TT,
    // Where a logical point or an on-screen key is on the page, for tests that use the real mouse.
    point: page,
    keyPoint: code => { const c = A.keyCenter(code); return c ? page(c.x, c.y) : null; }
  };

  buildMap();
  buildClass();
  // P is a letter, so pause is Esc and the on-screen button; M is a letter too.
  Kit.muteButton({ key: false });
  Kit.lifecycle({ pause: () => pause(false), reset: () => { for (const k in lit) delete lit[k]; } });
  toTitle();
  Kit.loop(update, render);
  Kit.ready();
})();
