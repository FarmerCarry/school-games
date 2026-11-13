/* Keyboard Obby (مغامرة الكيبورد): screens, the child's real key presses, the wordless
 * coach, saves, the shop and sound. engine.js runs the course; art.js draws the 3D world;
 * hud.js draws the keyboard helper and the prompt over it.
 * This is the UI layer: it reads Kit.dda when a level starts and reports each finished
 * level back to it (and a level left after falling again and again). */
(function () {
  'use strict';
  const J = Kit.juice, AU = Kit.audio, H = KO.hud, W = 1280, HH = 720;
  const $ = id => document.getElementById(id);
  const canvas = $('scene'), hudCanvas = $('hud'), ui = $('ui'), ghostEl = $('ghost');
  const calm = () => Kit.motion.reduced();
  let view = null, dirty = true, snap = true, contextLost = false, lastFrame = 0;
  const hudView = Kit.fit(hudCanvas, W, HH, { maxDpr: 1.5, onResize: () => { dirty = true; } });
  const fit = Kit.fit(canvas, W, HH, { webgl: true, maxDpr: 1.5, onResize: v => {
    ui.style.left = canvas.style.left; ui.style.top = canvas.style.top; ui.style.transform = 'scale(' + v.scale + ')';
    if (view) view.resize(Math.round(W * v.scale), Math.round(HH * v.scale));
    dirty = true;
  } });
  const pixelScale = () => Math.min(2, Math.max(1, Math.round(hudView.scale * hudView.dpr * 4) / 4));
  const PRAISE = ['رائع!', 'ممتاز!', 'مذهل!', 'بطل!'];
  // The little keyboard at the bottom of the screen.
  const KB = { u: 34, x: (W - KO.KB_W * 34) / 2, y: HH - KO.KB_ROWS * 34 - 16 };

  /* ---------------------------------------------------------------- save */
  const store = Kit.store('keyboard-obby');
  const saveStatus = Kit.saveStatus({ retry: persist });
  let save = KO.loadSave(store.get('save', null));
  function persist() {
    if (store.set('save', save) === false) { saveStatus.failed(); return false; }
    saveStatus.saved();
    return true;
  }
  // One difficulty for the whole game (Kit keeps it on this PC).
  // A PC that has never played starts gentle (tier 1): little ones find the keys one by one.
  const dda = Kit.dda('keyboard-obby', { id: 'main', start: 0.15 });

  /* --------------------------------------------------------------- state */
  let screen = 'title', world = null, cur = { w: 0, l: 0 }, time = 0, viewTime = 0;
  let queue = [], floats = [], hudFlash = {}, banner = null, ending = null, result = null, resultT = 0, resultLock = 0;
  let idle = 0, menuIdle = 0, menuNext = 5, coinBump = 0, bubbleBump = 0, reported = false;

  /* ------------------------------------------------------------ screens */
  const SCREENS = { title: 'scrTitle', map: 'scrMap', shop: 'scrShop', pause: 'scrPause', result: 'scrResult' };
  function setScreen(name) {
    screen = name;
    for (const k in SCREENS) $(SCREENS[k]).hidden = k !== name;
    $('hudBar').hidden = name !== 'play';
    hideGhost();
    menuIdle = 0; menuNext = 5;
    dirty = true;
    if (name === 'play') focusGame();
  }
  function focusGame() { try { canvas.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  function say(text) { $('live').textContent = text; }
  function chip(id, n) { $(id).querySelector('b').textContent = String(n); }
  function refreshChips() {
    const stars = KO.total(save) + '/' + KO.MAX_STARS;
    chip('titleStars', stars); chip('mapStars', stars);
    chip('titleCoins', save.coins); chip('mapCoins', save.coins); chip('shopCoins', save.coins);
  }
  function paintLangs() {
    document.querySelectorAll('.lang').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === save.lang)));
  }
  function toTitle() {
    leaveLevel();
    view.setTheme(0);
    refreshChips(); paintLangs();
    setScreen('title');
  }
  function play() {
    J.select();
    // A child who has never played goes straight to the first level.
    if (!KO.total(save)) startLevel(0, 0); else toMap();
  }
  function setLang(lang) {
    if (save.lang === lang || KO.LANGS.indexOf(lang) < 0) { J.tap(); return; }
    save.lang = lang;
    persist();
    J.toggle(lang === 'en');
    view.setLang(lang); H.reset();
    paintLangs(); refreshMap();
    say(lang === 'en' ? 'English' : 'عربي');
  }

  /* ---------------------------------------------------------------- map */
  const lvlButtons = [], worldKeys = [];
  const WORLD_KEYS = [KO.codes('A S D F'), KO.codes('Q W E R'), KO.codes('Z X C V'), KO.codes('1 2 3 4'), KO.codes('J ; 0 `')];
  function buildMap() {
    const box = $('worlds');
    KO.WORLDS.forEach((Wd, w) => {
      const col = document.createElement('div'), color = KO.THEMES[w].jelly[0];
      col.className = 'world';
      col.innerHTML = '<h3 style="background:' + color + '">' + Wd.name + '</h3><div class="keys"></div>';
      worldKeys.push(col.querySelector('.keys'));
      Wd.levels.forEach((spec, l) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'ko-btn lvl';
        b.innerHTML = '<span class="num" style="background:' + color + '">' + (l + 1) + '</span>' + (spec.words ? '<span class="word">كلمات</span>' : '') +
          '<span class="st">' + '<svg><use href="#i-star"/></svg>'.repeat(3) + '</span><svg class="lock" aria-hidden="true"><use href="#i-lock"/></svg>';
        on(b, () => pickLevel(w, l, b));
        col.appendChild(b);
        lvlButtons.push({ b: b, w: w, l: l });
      });
      box.appendChild(col);
    });
  }
  function refreshMap() {
    const nx = KO.nextLevel(save);
    lvlButtons.forEach(o => {
      const open = KO.isOpen(save, o.w, o.l), st = save.stars[o.w][o.l];
      o.b.classList.toggle('locked', !open);
      o.b.classList.toggle('next', open && nx.w === o.w && nx.l === o.l);
      o.b.querySelectorAll('.st svg').forEach((s, i) => s.classList.toggle('on', i < st));
      o.b.setAttribute('aria-label', KO.WORLDS[o.w].name + ' ' + (o.l + 1) + (open ? '، ' + st + ' من 3 نجوم' : ' (مقفلة)'));
    });
    worldKeys.forEach((el, w) => { el.innerHTML = WORLD_KEYS[w].map(c => '<span>' + KO.label(c, save.lang) + '</span>').join(''); });
    refreshChips(); paintLangs();
  }
  function toMap() {
    leaveLevel();
    view.setTheme(0);
    refreshMap();
    setScreen('map');
    J.whoosh(0.4);
  }
  function wiggle(el) { el.classList.remove('wiggle'); void el.offsetWidth; el.classList.add('wiggle'); setTimeout(() => el.classList.remove('wiggle'), 500); }
  function pickLevel(w, l, el) {
    if (!KO.isOpen(save, w, l)) { J.error(); wiggle(el); return; }
    J.select(); startLevel(w, l);
  }

  /* --------------------------------------------------------------- shop */
  const tiles = [];
  function buildShop() {
    [['color', KO.COLORS, 'colors'], ['hat', KO.HATS, 'hats']].forEach(([kind, list, id]) => {
      const box = $(id);
      list.forEach((it, i) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'ko-btn item';
        b.innerHTML = '<canvas width="180" height="180"></canvas><span class="price"><i class="coin"></i><em></em></span>';
        on(b, () => buy(kind, i, b));
        box.appendChild(b);
        tiles.push({ b: b, kind: kind, i: i });
      });
    });
  }
  function refreshShop() {
    tiles.forEach(t => {
      const list = KO.SHOP[t.kind], own = (t.kind === 'color' ? save.colors : save.hats)[t.i], worn = save[t.kind] === t.i;
      const color = t.kind === 'color' ? KO.COLORS[t.i].c : KO.COLORS[save.color].c, hat = t.kind === 'hat' ? KO.HATS[t.i].id : 'none';
      H.heroIcon(t.b.querySelector('canvas'), color, hat);
      t.b.classList.toggle('owned', own); t.b.classList.toggle('worn', worn);
      t.b.classList.toggle('poor', !own && save.coins < list[t.i].cost);
      t.b.querySelector('em').textContent = own ? '✓' : String(list[t.i].cost);
      t.b.setAttribute('aria-pressed', String(worn));
      t.b.setAttribute('aria-label', (t.kind === 'color' ? 'لون ' : 'قبعة ') + (t.i + 1) + (own ? '' : '، السعر ' + list[t.i].cost));
    });
    refreshChips();
  }
  function openShop() { J.select(); leaveLevel(); view.setTheme(0); refreshShop(); setScreen('shop'); }
  function closeShop() { J.back(); toTitle(); }
  function buy(kind, i, el) {
    const r = KO.buy(save, kind, i);
    if (r === 'poor') { J.error(); wiggle(el); return; }
    persist();
    if (r === 'buy') { J.coin(3); J.levelUp(); } else J.select();
    view.setOutfit(save.color, save.hat);
    const hk = view.keyWorld('Space');
    view.burst(hk.x, hk.y + 0.6, hk.z, { count: 30, colors: ['#ffd23f', '#ffffff', '#ff6fb5', '#4fd1ff'], speed: 2.4, up: 3, life: 0.8, size: 0.06 });
    refreshShop();
  }

  /* --------------------------------------------------------------- play */
  function startLevel(w, l) {
    leaveLevel();
    cur = { w: w, l: l };
    // Difficulty is read at every level start: the hazards' tier and the jelly's speed.
    const tier = dda.tier, rise = dda.value(KO.TUNE.rise[0], KO.TUNE.rise[KO.TIERS - 1]);
    const L = KO.level(w, l, save.lang);
    world = KO.create(L, { tier: tier, rise: rise });
    view.setTheme(w); view.setLevel(L);
    queue.length = 0; floats = []; hudFlash = {}; ending = null; result = null; idle = 0; reported = false;
    banner = { t: 0 };
    Kit.keys.reset();
    setScreen('play');
    J.whoosh(0.5);
    say(KO.WORLDS[w].name + ' ' + (l + 1) + '. اضغط ' + KO.label(KO.target(world), save.lang));
  }
  // Leaving a level the child kept falling in counts as a hard try for the difficulty.
  function leaveLevel() {
    if (world && world.started && !world.done && !reported && world.falls >= 2) { reported = true; dda.result(Math.min(0.25, KO.progress(world) * 0.3)); }
    world = null; ending = null; banner = null;
    view.setLevel(null);
  }
  function pause(own) {
    if (screen !== 'play') return;
    queue.length = 0;
    setScreen('pause');
    if (own) J.back();
  }
  function resume() {
    if (screen !== 'pause') return;
    J.select();
    setScreen('play');
    Kit.keys.reset();
  }
  function restart() { J.select(); startLevel(cur.w, cur.l); }
  function quitToMap() { J.back(); toMap(); }
  // P pauses too, in a level whose path never asks for the P key.
  function usesP() { return !!world && world.L.path.indexOf('KeyP') >= 0; }

  /* ------------------------------------------------------------- result */
  function finish() {
    const r = KO.result(world), out = KO.apply(save, cur.w, cur.l, r);
    save.coach = true;
    persist();
    dda.result(KO.outcome(r));
    reported = true;
    result = { r: r, out: out, w: cur.w, l: cur.l };
    ending = { t: 0 };
    J.levelUp();
    view.shake(0.4);
  }
  function showResult() {
    ending = null;
    const r = result.r, out = result.out;
    resultT = 0; resultLock = 0.7;
    $('resTitle').textContent = KO.WORLDS[result.w].name + ' ' + (result.l + 1);
    $('resStars').querySelectorAll('svg').forEach(s => s.classList.remove('on', 'pop'));
    $('resTime').textContent = String(Math.round(r.time)) + ' / ' + Math.round(r.par);
    $('resTimeBox').classList.toggle('good', r.time <= r.par);
    $('resOops').textContent = String(r.mistakes);
    $('resOopsBox').classList.toggle('good', r.mistakes <= KO.allowed(r.n));
    $('resCoins').textContent = '+' + out.coins;
    $('resBest').hidden = true; $('resOpen').hidden = true;
    const nx = KO.after(result.w, result.l);
    $('resNext').setAttribute('aria-label', nx ? 'المرحلة التالية' : 'الخريطة');
    refreshChips();
    say('أحسنت! ' + out.stars + ' من 3 نجوم');
    setScreen('result');
  }
  function resultStep(dt) {
    const before = resultT, r = result;
    resultT += dt;
    const at = t => before < t && resultT >= t;
    for (let i = 0; i < r.out.stars; i++) {
      if (at(0.35 + i * 0.4)) { const s = $('resStars').children[i]; s.classList.add('on', 'pop'); J.star(i + 1); }
    }
    const t2 = 0.45 + r.out.stars * 0.4;
    if (at(t2)) {
      if (r.out.best && r.out.prevBest) { $('resBest').hidden = false; J.chime(3); }
      if (r.out.opened && KO.after(r.w, r.l)) { $('resOpen').hidden = false; J.chime(2); }
    }
  }
  function next() {
    if (!result) return;
    const nx = KO.after(result.w, result.l);
    J.select();
    if (nx && KO.isOpen(save, nx.w, nx.l)) startLevel(nx.w, nx.l); else toMap();
  }
  function again() { if (result) { J.select(); startLevel(result.w, result.l); } }

  /* --------------------------------------------------------------- input */
  // A mouse click hands the keyboard back to the game; keyboard activation keeps focus.
  // The second click of a double click (detail 2) is dropped: the first one already acted.
  function on(el, fn) {
    el.addEventListener('click', e => { e.stopPropagation(); if (e.detail > 1) return; Kit.audio.unlock(); if (e.detail > 0) { el.blur(); focusGame(); } fn(e); });
  }
  on($('btnPlay'), play);
  on($('btnShop'), openShop);
  on($('mapHome'), () => { J.back(); toTitle(); });
  on($('shopBack'), closeShop);
  on($('btnPause'), () => pause(true));
  on($('btnResume'), resume);
  on($('btnRestart'), restart);
  on($('btnMenu'), quitToMap);
  on($('resNext'), () => { if (resultLock <= 0) next(); });
  on($('resAgain'), () => { if (resultLock <= 0) again(); });
  on($('resMap'), () => { if (resultLock <= 0) { J.back(); toMap(); } });
  document.querySelectorAll('.lang').forEach(b => on(b, () => setLang(b.dataset.lang)));
  canvas.addEventListener('pointerdown', () => { focusGame(); menuIdle = 0; });
  window.addEventListener('pointermove', () => { menuIdle = 0; });
  // The keys of the course are taken in the order they were pressed (by physical key, so it
  // works whichever language Windows types): key repeats, Ctrl/Alt shortcuts and keys on
  // focused buttons never count.
  window.addEventListener('keydown', e => {
    if (!Kit.isGameKeyEvent(e)) return;
    menuIdle = 0;
    if (screen !== 'play' || !world || ending) return;
    const code = KO.norm(e.code);
    if (!KO.isGameKey(code) || (code === 'KeyP' && !usesP())) return;
    // Keys like ' and / must not open the browser's quick find.
    e.preventDefault();
    if (!e.repeat && queue.length < 16) queue.push(code);
  });
  function handleKeys() {
    const K = Kit.keys, go = K.anyPressed(['Enter', 'NumpadEnter', 'Space']);
    if (screen === 'title') { if (go) play(); }
    else if (screen === 'map') {
      if (go) { J.select(); const n = KO.nextLevel(save); startLevel(n.w, n.l); } else if (K.pressed('Escape')) { J.back(); toTitle(); }
    } else if (screen === 'shop') { if (go || K.pressed('Escape')) closeShop(); }
    else if (screen === 'play') { if (K.pressed('Escape') || (K.pressed('KeyP') && !usesP())) pause(true); }
    else if (screen === 'pause') { if (K.anyPressed(['Escape', 'Enter', 'NumpadEnter', 'Space', 'KeyP'])) resume(); else if (K.pressed('KeyR')) restart(); }
    else if (screen === 'result' && resultLock <= 0) {
      if (go) next(); else if (K.pressed('KeyR')) again();
      else if (K.pressed('Escape')) { J.back(); toMap(); }
    }
  }
  function typeKeys() {
    if (!queue.length) return;
    const keys = queue.splice(0, queue.length);
    if (!world || ending) return;
    for (const code of keys) if (KO.press(world, code) !== 'ignore') { idle = 0; hideGhost(); }
  }

  /* ------------------------------------------------------------ events */
  function addFloat(text, p, color, size) {
    floats.push({ text: text, x: p.x, y: p.y, z: p.z, color: color, size: size || 40, t: 0 });
    if (floats.length > 8) floats.shift();
  }
  function heroAbove(e, up) { return KO.toWorld(e.x, e.y + (up || 1.2), e.z, {}); }
  function oops() {
    AU.tone({ freq: 640, to: 360, type: 'triangle', dur: 0.16, vol: 0.14 });
    AU.tone({ freq: 470, to: 250, type: 'triangle', dur: 0.2, vol: 0.12, delay: 0.13 });
  }
  function boing(k) { AU.tone({ freq: 170, to: 560 + 200 * k, type: 'sine', dur: 0.24, vol: 0.18 }); }
  function splash() { AU.noise({ dur: 0.38, vol: 0.26, filter: 2600, to: 280 }); J.pop(0.9); }
  function crumbleSound() { AU.noise({ dur: 0.32, vol: 0.18, filter: 1000, to: 160 }); }
  function handleEvents() {
    const w = world;
    for (const e of w.ev) {
      view.event(e, w);
      switch (e.t) {
        case 'ok':
          hudFlash[e.code] = ['ok', 0.22]; bubbleBump = 1;
          if (e.combo >= 5 && e.combo % 5 === 0) { J.streak(e.combo / 5); addFloat(PRAISE[Math.min(PRAISE.length - 1, e.combo / 5 - 1)], heroAbove(w.hero, 1.6), '#ffd23f', 46); }
          break;
        case 'wrong':
          hudFlash[e.code] = ['wrong', 0.45]; view.flash(e.code, 'wrong');
          J.error(); oops();
          addFloat('أوه!', heroAbove(e, 1.3), '#ff8fa3', 42);
          break;
        case 'hop': J.jump(Math.min(1, 0.25 + e.d / 8)); view.flash(e.code, 'ok'); break;
        case 'land': J.land(Math.min(1, 0.25 + e.d * 0.08)); break;
        case 'coin': J.coin(Math.min(5, e.n)); coinBump = 1; addFloat('+1', heroAbove(e, 1.1), '#ffd23f', 38); break;
        case 'gem': J.chime(2); coinBump = 1; addFloat('+5', heroAbove(e, 1.2), '#ff9cf0', 42); break;
        case 'checkpoint': J.chime(1); addFloat('نقطة حفظ!', heroAbove(e, 1.5), '#7dffb0', 40); say('نقطة حفظ'); break;
        case 'shake': J.pop(0.15); break;
        case 'crumble': crumbleSound(); break;
        case 'restore': J.pop(0.6); break;
        case 'wait': addFloat('انتظر…', heroAbove(e, 1.3), '#bff4ff', 34); break;
        case 'fall': J.whoosh(0.6); break;
        case 'splash': splash(); view.shake(0.8); addFloat('بلوب!', KO.toWorld(e.x, e.y + 1, e.z, {}), '#ffffff', 46); break;
        case 'respawn': boing(0.4); break;
        case 'bonk': J.impact(0.6); boing(1); view.shake(0.5); addFloat('بوينغ!', heroAbove(e, 1.5), '#ffd23f', 44); break;
        case 'finish': finish(); break;
      }
    }
    w.ev.length = 0;
  }

  /* ----------------------------------------------------- the wordless coach */
  // After a few idle seconds a hand taps the lit key on the little keyboard (it never types).
  const ghost = { on: false };
  function showGhost(p) {
    if (!p) return;
    ghost.on = true; ghostEl.hidden = false;
    ghostEl.style.transform = 'translate(' + (p.x - 40).toFixed(1) + 'px,' + (p.y - 6).toFixed(1) + 'px)';
  }
  function hideGhost() { ghost.on = false; ghostEl.hidden = true; }
  function coachStep(dt) {
    const h = world.hero;
    if (h.phase !== 'stand' || world.queue.length || banner) { idle = 0; return; }
    idle += dt;
    const wait = !save.coach && world.L.id === 'w1l1' ? 2.5 : 5;
    if (!ghost.on && idle >= wait) showGhost(H.keyCenter(KO.target(world), KB.x, KB.y, KB.u));
  }
  function centerOf(el) {
    const r = el.getBoundingClientRect(), s = fit.scale, c = canvas.getBoundingClientRect();
    return r.width ? { x: (r.left + r.width / 2 - c.left) / s, y: (r.top + r.height / 2 - c.top) / s } : null;
  }
  function menuGhost() {
    let el = null;
    if (screen === 'title') el = $('btnPlay');
    else if (screen === 'map') el = document.querySelector('.lvl.next');
    else if (screen === 'result' && resultT > 1.5) el = $('resNext');
    if (el) showGhost(centerOf(el));
  }

  /* ------------------------------------------------- the menus' attract run */
  // Behind the title and the map the hero hops round the keyboard by itself, silently, and
  // back to the space bar. It never touches the save or the difficulty.
  const DEMO = { w: 0, l: 0, id: 'demo', lang: 'ar', name: '', path: KO.codes('F J D K L S G H U R I E O W V M N C B _'), words: [], start: 'Space',
    kind: {}, sinkPhase: {}, cps: [], coins: [], gems: [], bumpers: [] };
  let demo = null, demoT = 0;
  function demoStep(dt) {
    if (calm()) { demo = null; return; }
    if (!demo || (demo.done && demo.hero.t > 1.2)) { demo = KO.create(DEMO, { tier: 1 }); demoT = 0.8; }
    demoT -= dt;
    if (demoT <= 0 && demo.hero.phase === 'stand' && !demo.done) { KO.press(demo, KO.target(demo)); demoT = 1.15; }
    KO.step(demo, dt);
    for (const e of demo.ev) if (e.t === 'land' || e.t === 'hop') view.event(e, demo);
    demo.ev.length = 0;
  }

  /* ----------------------------------------------------------------- loop */
  function decay(dt) {
    for (let i = floats.length - 1; i >= 0; i--) { floats[i].t += dt; if (floats[i].t > 1.3) floats.splice(i, 1); }
    for (const c in hudFlash) { hudFlash[c][1] -= dt; if (hudFlash[c][1] <= 0) delete hudFlash[c]; }
    coinBump = Math.max(0, coinBump - dt * 4); bubbleBump = Math.max(0, bubbleBump - dt * 5);
  }
  function playStep(dt) {
    typeKeys();
    KO.step(world, dt);
    handleEvents();
    if (!world) return;
    if (banner) { banner.t += dt; if (banner.t > 1.4) banner = null; }
    if (ending) { ending.t += dt; if (ending.t > 1.6) showResult(); }
    else coachStep(dt);
  }
  function update(dt) {
    if (screen !== 'pause') time += dt;
    handleKeys();
    if (screen === 'play' && world) playStep(dt);
    else if (screen === 'result' && result) { resultStep(dt); if (resultLock > 0) resultLock -= dt; }
    if (screen !== 'pause') {
      decay(dt);
      if (screen === 'title' || screen === 'map') demoStep(dt);
      if (screen !== 'play' && screen !== 'shop') {
        menuIdle += dt;
        if (menuIdle >= menuNext) { menuNext = menuIdle + 7; if (ghost.on) hideGhost(); else menuGhost(); }
      }
      dirty = true;
    }
    Kit.keys.endFrame();
  }

  /* --------------------------------------------------------------- render */
  function wordNow(w) {
    const step = w.next;
    for (const x of w.L.words) if (step >= x.start && step < x.start + x.len) return { text: x.text, at: step - x.start };
    return null;
  }
  function fmtTime(t) { return String(Math.floor(t)); }
  function drawHud() {
    const g = hudView.ctx;
    g.clearRect(0, 0, W, HH);
    if ((screen !== 'play' && screen !== 'pause') || !world) return;
    const w = world, still = calm(), target = KO.target(w), pulse = still ? 1 : 0.5 + 0.5 * Math.sin(time * 7);
    for (const f of floats) {
      const p = view.project(f.x, f.y + (still ? 0 : f.t * 0.7), f.z);
      if (!p.behind) H.float(g, f.text, p.x, p.y, f.size, f.color, f.t < 0.9 ? 1 : 1 - (f.t - 0.9) / 0.4);
    }
    H.chip(g, 96, 18, 150, 'coin', String(w.coins + w.gems * 5), coinBump);
    H.chip(g, 96, 84, 150, 'clock', fmtTime(w.t));
    if (w.mistakes) H.chip(g, 96, 150, 150, 'oops', String(w.mistakes));
    H.text(g, (cur.w + 1) + '-' + (cur.l + 1), 880, 44, 34, '#ffffff', { stroke: 8 });
    H.progress(g, 930, 44, 220, KO.progress(w), w.L.cps, w.n, KO.COLORS[save.color].c);
    H.jar(g, 1218, 130, 40, 300, w.jelly, KO.THEMES[cur.w].jelly, time, still);
    if (target && !ending) H.bubble(g, 640, 12, { code: target, lang: save.lang, word: wordNow(w), pulse: pulse, bump: still ? 0 : bubbleBump });
    H.keyboard(g, KB.x, KB.y, KB.u, { lang: save.lang, target: ending ? '' : target, ahead: w.L.path[w.next + 1] || '', pulse: still ? 0.5 : pulse, flash: hudFlash, ps: pixelScale() });
    if (banner) {
      const k = Math.min(1, banner.t / 0.25);
      g.globalAlpha = Math.max(0, Math.min(1, (1.4 - banner.t) / 0.3));
      H.banner(g, (cur.w + 1) + '-' + (cur.l + 1), KO.WORLDS[cur.w].name, still ? 1 : k, KO.THEMES[cur.w].jelly[0]);
      g.globalAlpha = 1;
    }
  }
  function render() {
    if (!view || contextLost) return;
    if (screen === 'pause' && !dirty) return;
    const now = performance.now();
    if (screen === 'play' && lastFrame && view.frameTime(now - lastFrame)) fit.resize();
    lastFrame = now;
    const dt = Math.max(0, Math.min(0.1, time - viewTime));
    viewTime = time;
    const mode = screen === 'play' || screen === 'pause' ? 'play' : screen === 'result' ? 'result' : screen === 'shop' ? 'shop' : 'menu';
    view.calm = calm();
    const w = world && (mode === 'play' || mode === 'result') ? world : mode === 'menu' && demo && !calm() ? demo : null;
    const target = w && mode === 'play' && !ending ? KO.target(w) : '';
    view.update({ mode: mode, dt: dt, t: time, w: w, next: target, ahead: w && !ending ? w.L.path[w.next + 1] || '' : '',
      queued: w ? w.queue.map(i => w.L.path[i]) : null, snap: snap });
    snap = false;
    view.render();
    drawHud();
    dirty = false;
  }

  /* --------------------------------------------------- test and debug hook */
  const page = (x, y) => { const r = canvas.getBoundingClientRect(); return { x: r.left + x * fit.scale, y: r.top + y * fit.scale }; };
  const r3 = v => Math.round(v * 1000) / 1000;
  function snapshot() {
    const w = world, h = w ? w.hero : null;
    return {
      screen: screen, paused: screen === 'pause', world: cur.w, level: cur.l, id: w ? w.L.id : '', lang: save.lang, tier: w ? w.tier : 0,
      target: w ? KO.target(w) : '', next: w ? w.next : 0, at: w ? w.at : -1, cp: w ? w.cp : -1, n: w ? w.n : 0, path: w ? w.L.path.slice() : [],
      hops: w ? w.hops : 0, presses: w ? w.presses : 0, mistakes: w ? w.mistakes : 0, falls: w ? w.falls : 0, bonks: w ? w.bonks : 0,
      coins: w ? w.coins : 0, gems: w ? w.gems : 0, time: w ? r3(w.t) : 0, jelly: w ? r3(w.jelly) : 0, done: !!(w && w.done), started: !!(w && w.started),
      hero: h ? { phase: h.phase, x: r3(h.x), y: r3(h.y), z: r3(h.z) } : null, queue: w ? w.queue.length : 0,
      ending: !!ending, stars: result ? result.out.stars : 0, ghost: ghost.on, banner: !!banner, calm: calm(), particles: view ? view.particleCount() : 0
    };
  }

  /* ---------------------------------------------------------------- init */
  Kit.muteButton({ key: false });
  Kit.lifecycle({ pause: () => pause(false), reset: () => { queue.length = 0; } });
  Kit.motion.onChange(r => { if (view) view.calm = r; dirty = true; });
  window.addEventListener('pageshow', () => { dirty = true; });
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); contextLost = true; pause(false); $('contextNotice').hidden = false; });
  canvas.addEventListener('webglcontextrestored', () => { contextLost = false; $('contextNotice').hidden = true; snap = true; dirty = true; if (view) view.rebake(); fit.resize(); });
  hudCanvas.addEventListener('contextrestored', () => { H.reset(); dirty = true; });
  if (document.fonts && document.fonts.load) {
    // The legends are printed into the key atlas: print them again once the font is there.
    Promise.all([document.fonts.load('700 40px Fredoka', 'ب'), document.fonts.load('700 40px Fredoka', 'F'), document.fonts.load('500 20px Fredoka', 'Tab ب')])
      .then(() => { if (view) view.rebake(); H.reset(); dirty = true; if (screen === 'shop') refreshShop(); }, () => { /* fallback fonts */ });
  }
  let loop = null;
  try {
    view = KO.createView(canvas);
    view.calm = calm();
    view.setLang(save.lang);
    view.setOutfit(save.color, save.hat);
    fit.resize();
    buildMap(); buildShop();
    toTitle();
    window.__game = {
      get state() { return snapshot(); },
      get save() { return JSON.parse(JSON.stringify(save)); },
      get world() { return world; },
      // Where a logical point, a key of the little keyboard or a key of the giant one is on the page.
      point: page,
      keyPoint: code => { const p = H.keyCenter(code, KB.x, KB.y, KB.u); return p ? page(p.x, p.y) : null; },
      worldPoint: code => { const k = view.keyWorld(code), p = view.project(k.x, k.y, k.z); return page(p.x, p.y); },
      drawCalls: () => view.info().calls
    };
    render();
    loop = Kit.loop(update, render);
    Kit.ready();
  } catch (error) {
    if (loop) loop.stop();
    for (const k in SCREENS) $(SCREENS[k]).hidden = true;
    $('scrError').hidden = false;
    Kit.fail(error);
  }
})();
