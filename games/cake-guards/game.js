/* Cake Guards: screens, mouse and keyboard, HUD, saving and play statistics. */
(function () {
  'use strict';
  const CG = window.CG, A = CG.art, S = CG.sfx;
  const $ = id => document.getElementById(id);
  const canvas = $('game'), ui = $('ui'), panel = $('panel'), bar = $('bar');
  let frameDirty = true; // the next render draws even if the game is not playing
  const view = Kit.fit(canvas, CG.W, CG.H, { onResize: v => { ui.style.left = canvas.style.left; ui.style.top = canvas.style.top; ui.style.transform = 'scale(' + v.scale + ')'; frameDirty = true; } });
  const fx = Kit.particles(), shake = Kit.shake();
  const calm = () => Kit.motion.reduced();

  /* ---------------------------------------------------------------- save */
  // Every field is checked on load: a damaged or hand-edited save must never stop the game.
  const store = Kit.store('cake-guards');
  const saveStatus = Kit.saveStatus({ retry: persist });
  const save = (function () {
    const raw = store.get('save', null), s = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const stars = CG.LEVELS.map((_, i) => { const v = Array.isArray(s.stars) ? s.stars[i] : 0; return Number.isInteger(v) && v >= 0 && v <= 3 ? v : 0; });
    const seen = {};
    if (s.seen && typeof s.seen === 'object') for (const k in CG.ENEMIES) if (s.seen[k] === 1) seen[k] = 1;
    const total = stars.reduce((a, b) => a + b, 0);
    let cake = Number.isInteger(s.cake) && s.cake >= 0 && s.cake < CG.CAKES.length ? s.cake : 0;
    if (CG.CAKES[cake].stars > total) cake = 0;
    return { v: 1, stars: stars, endless: Number.isInteger(s.endless) && s.endless > 0 ? s.endless : 0, seen: seen, cake: cake, upgraded: s.upgraded === 1 ? 1 : 0 };
  })();
  function persist() {
    if (store.set('save', save) === false) { saveStatus.failed(); return false; }
    saveStatus.saved();
    return true;
  }
  const totalStars = () => save.stars.reduce((a, b) => a + b, 0);
  const done = () => save.stars.filter(Boolean).length;
  const unlocked = i => i === 0 || save.stars[i - 1] > 0;
  const endlessOpen = () => done() >= CG.ENDLESS_AFTER;
  function nextLevel() {
    for (let i = 0; i < CG.LEVELS.length; i++) if (!save.stars[i]) return i;
    return CG.LEVELS.length - 1;
  }

  /* --------------------------------------------------------------- state */
  let screen = 'title', world = null, levelIdx = 0, endless = false, speed = 1;
  let placing = null, selected = -1, menuPad = -1, hoverPad = -1, mouse = { x: -100, y: -100 };
  let time = 0, ending = null, result = null, resultLock = 0, busyT = 0;
  let floats = [], zaps = [], rings = [], tutorial = 0, hud = {};
  let bg = null, bgKey = '';

  /* -------------------------------------------------------------- screens */
  const SCREENS = ['title', 'levels', 'cakes', 'pause', 'win', 'lose', 'over'];
  function setScreen(name) {
    screen = name;
    SCREENS.forEach(s => { $('scr-' + s).hidden = s !== name; });
    const inLevel = !!world && ['play', 'pause', 'win', 'lose', 'over'].indexOf(name) >= 0;
    $('hud').hidden = !inLevel;
    bar.hidden = !(name === 'play' || name === 'pause');
    if (name !== 'play') { closePanel(); placing = null; refreshBar(); hideHint(); }
    frameDirty = true;
  }
  function focusGame() { try { canvas.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }

  function begin(def) {
    world = CG.create(def);
    speed = 1; placing = null; selected = -1; menuPad = -1; hoverPad = -1;
    fx.clear(); floats = []; zaps = []; rings = []; time = 0; ending = null; result = null; busyT = 0;
    hud = {};
    buildBar();
    hideBanner();
    setScreen('play');
    updateHUD();
    Kit.keys.reset();
    focusGame();
  }
  function startLevel(i) {
    endless = false; levelIdx = i;
    // Play statistics: every start (play, retry, restart, next level) is a round.
    Kit.stats.round('L' + (i + 1));
    tutorial = i === 0 && !save.stars[0] ? 1 : 0;
    if (tutorial) Kit.stats.tutorial('start');
    begin(CG.LEVELS[i]);
    const fresh = CG.LEVELS[i].towers.filter(t => i > 0 && CG.LEVELS[i - 1].towers.indexOf(t) < 0);
    if (fresh.length && !save.stars[i]) banner('برج جديد: ' + CG.TOWERS[fresh[0]].name, CG.TOWERS[fresh[0]].tip, 'tip', 4500);
    else banner('المرحلة ' + (i + 1), CG.WORLDS[CG.LEVELS[i].w].name, '', 2200);
    showTutorial();
  }
  function startEndless() {
    endless = true; tutorial = 0;
    Kit.stats.round('endless');
    begin(CG.ENDLESS);
    banner('بلا نهاية', 'كم موجة تستطيع أن تصمد؟', '', 2500);
  }
  function restart() { if (endless) startEndless(); else startLevel(levelIdx); }
  function play() { S.click(); startLevel(nextLevel()); }

  function toTitle() {
    world = CG.create(CG.LEVELS[nextLevel()]);
    endless = false;
    hideBanner();
    setScreen('title');
    refreshTitle();
  }
  function refreshTitle() {
    $('playSub').textContent = done() >= CG.LEVELS.length ? 'أنهيت كل المراحل!' : 'المرحلة ' + (nextLevel() + 1);
    $('levelsSub').textContent = '★ ' + totalStars() + ' / ' + CG.LEVELS.length * 3;
    $('btnEndless').disabled = !endlessOpen();
    $('endlessSub').textContent = endlessOpen() ? (save.endless ? 'أفضل: ' + save.endless + ' موجة' : 'كم موجة ستصمد؟') : '🔒 أنهِ ' + CG.ENDLESS_AFTER + ' مراحل';
    $('cakesSub').textContent = CG.CAKES[save.cake].name;
  }

  function openLevels() {
    const box = $('worlds');
    box.textContent = '';
    CG.WORLDS.forEach((w, wi) => {
      const sec = document.createElement('div'), h = document.createElement('h3'), grid = document.createElement('div');
      sec.className = 'cg-world'; grid.className = 'cg-lvs';
      h.textContent = w.name;
      CG.LEVELS.forEach((lv, i) => {
        if (lv.w !== wi) return;
        const b = document.createElement('button'), stars = save.stars[i];
        b.type = 'button'; b.className = 'cg-lvbtn'; b.disabled = !unlocked(i);
        b.textContent = String(i + 1);
        const st = document.createElement('small');
        st.textContent = unlocked(i) ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : '🔒';
        b.appendChild(st);
        b.setAttribute('aria-label', 'المرحلة ' + (i + 1));
        on(b, () => { S.click(); startLevel(i); });
        grid.appendChild(b);
      });
      sec.appendChild(h); sec.appendChild(grid); box.appendChild(sec);
    });
    $('starsTotal').textContent = '★ ' + totalStars() + ' / ' + CG.LEVELS.length * 3;
    setScreen('levels');
  }
  function openCakes() {
    const grid = $('cakeGrid'), stars = totalStars();
    grid.textContent = '';
    CG.CAKES.forEach((c, i) => {
      const b = document.createElement('button'), cv = document.createElement('canvas'), name = document.createElement('div');
      b.type = 'button'; b.className = 'cg-cake' + (i === save.cake ? ' on' : '');
      b.disabled = c.stars > stars;
      cv.width = cv.height = 240;
      A.cakeIcon(cv, c);
      name.textContent = c.stars > stars ? '🔒 ★ ' + c.stars : c.name;
      b.appendChild(cv); b.appendChild(name);
      on(b, () => { save.cake = i; persist(); S.click(); A.resetCaches(); openCakes(); });
      grid.appendChild(b);
    });
    setScreen('cakes');
  }

  function pause() {
    if (screen !== 'play') return;
    $('pauseSub').textContent = endless ? 'بلا نهاية · الموجة ' + world.wave : 'المرحلة ' + (levelIdx + 1) + ' · ' + CG.WORLDS[world.def.w].name;
    setScreen('pause');
    S.click();
  }
  function resume() { if (screen !== 'pause') return; setScreen('play'); Kit.keys.reset(); focusGame(); }

  /* -------------------------------------------------------------- results */
  // A result is saved the moment the engine decides it, not when its screen opens:
  // a pause, Restart or leaving the page during the celebration must not lose it.
  function commitWin(stars) {
    const prev = save.stars[levelIdx], before = totalStars(), wasOpen = endlessOpen();
    if (stars > prev) save.stars[levelIdx] = stars;
    persist();
    Kit.stats.end('win', stars);
    if (tutorial) Kit.stats.tutorial('done');
    const cake = CG.CAKES.find(c => c.stars > before && c.stars <= totalStars());
    result = { stars: stars, prev: prev, hearts: world.hearts, cake: cake, endless: !wasOpen && endlessOpen() };
  }
  function commitLose() {
    const cleared = Math.max(0, world.wave - 1);
    if (endless) {
      const best = cleared > save.endless;
      if (best) { save.endless = cleared; persist(); }
      Kit.stats.end('end', cleared);
      result = { cleared: cleared, best: best };
    } else {
      Kit.stats.end('lose', cleared);
      result = { cleared: cleared };
    }
  }
  const LOSE_TIPS = ['انقر على برجك لتطويره، فيصبح أقوى!', 'الكب كيك يفرقع مجموعات الهلام دفعة واحدة.', 'الفقاعات تبطئ الهلام فتصيبه الأبراج أكثر.',
    'عصا السكر تخترق دروع الهلام المدرّع.', 'ضع الأبراج عند المنعطفات: هناك تصيب الطريق مرتين.'];
  function showResult() {
    resultLock = 0.6;
    if (ending.kind === 'win') {
      const r = result;
      $('winKicker').textContent = 'المرحلة ' + (levelIdx + 1) + ' · ' + CG.WORLDS[world.def.w].name;
      $('winSub').textContent = 'بقي ' + r.hearts + ' من ' + CG.HEARTS + ' قطعة من الكعكة';
      const news = [];
      if (r.prev && r.stars > r.prev) news.push('نجوم جديدة!');
      if (r.cake) news.push('كعكة جديدة: ' + r.cake.name + '!');
      if (r.endless) news.push('فتحت «بلا نهاية»!');
      $('winNew').hidden = !news.length;
      $('winNew').textContent = news.join(' · ');
      const last = levelIdx >= CG.LEVELS.length - 1;
      $('btnNext').textContent = last ? 'المراحل ◀' : 'المرحلة التالية ◀';
      const stars = $('winStars').children;
      for (let i = 0; i < 3; i++) stars[i].className = '';
      setScreen('win');
      S.win();
      for (let i = 0; i < r.stars; i++) setTimeout(() => { if (screen === 'win') { stars[i].className = 'on'; S.star(i); } }, 300 + i * 320);
    } else if (endless) {
      $('overWaves').textContent = String(result.cleared);
      $('overSub').textContent = (result.cleared === 1 ? 'صمدت موجة واحدة' : 'صمدت ' + result.cleared + ' موجات') + ' · الأفضل: ' + save.endless;
      $('overNew').hidden = !result.best || result.cleared < 1;
      setScreen('over');
      S.lose();
    } else {
      $('loseKicker').textContent = 'المرحلة ' + (levelIdx + 1) + ' · ' + CG.WORLDS[world.def.w].name;
      $('loseSub').textContent = 'صمدت ' + result.cleared + ' من ' + world.total + ' موجات. ' + LOSE_TIPS[(levelIdx + result.cleared) % LOSE_TIPS.length];
      setScreen('lose');
      S.lose();
    }
  }
  function nextAfterWin() { if (levelIdx >= CG.LEVELS.length - 1) openLevels(); else startLevel(levelIdx + 1); }

  /* ------------------------------------------------------------ tower bar */
  function iconCanvas(type, size) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = size * 2;
    cv.setAttribute('data-icon', type);
    A.towerIcon(cv, type);
    return cv;
  }
  function towerCard(type, key, onPick) {
    const spec = CG.TOWERS[type], b = document.createElement('button');
    b.type = 'button'; b.className = 'cg-card'; b.setAttribute('data-type', type);
    b.title = spec.name + ' — ' + spec.tip;
    b.appendChild(iconCanvas(type, 56));
    const txt = document.createElement('div'), name = document.createElement('div'), price = document.createElement('div');
    name.className = 'cg-name'; name.textContent = spec.short;
    price.className = 'cg-price';
    price.innerHTML = '<span class="cg-coin"></span>';
    price.appendChild(document.createTextNode(String(spec.lv[0].cost)));
    txt.appendChild(name); txt.appendChild(price); b.appendChild(txt);
    if (key) { const k = document.createElement('span'); k.className = 'sg-key'; k.textContent = key; b.appendChild(k); }
    on(b, onPick);
    return b;
  }
  function offered() { return CG.TOWER_ORDER.filter(t => world.def.towers.indexOf(t) >= 0); }
  function buildBar() {
    bar.textContent = '';
    offered().forEach((type, i) => {
      const card = towerCard(type, String(i + 1), () => togglePlacing(type));
      if (!endless && levelIdx > 0 && CG.LEVELS[levelIdx - 1].towers.indexOf(type) < 0 && !save.stars[levelIdx]) card.classList.add('new');
      bar.appendChild(card);
    });
    refreshBar();
  }
  function refreshBar() {
    if (!world) return;
    Array.prototype.forEach.call(bar.children, b => {
      const type = b.getAttribute('data-type');
      b.classList.toggle('sel', placing === type);
      b.classList.toggle('poor', world.coins < CG.TOWERS[type].lv[0].cost);
    });
  }
  function togglePlacing(type) {
    if (screen !== 'play' || ending) return;
    closePanel();
    placing = placing === type ? null : type;
    if (placing) S.click();
    refreshBar();
    showTutorial();
  }

  /* --------------------------------------------------------- tower menus */
  function placePanel(p) {
    panel.style.left = '0px'; panel.style.top = '0px';
    panel.hidden = false;
    const w = panel.offsetWidth, h = panel.offsetHeight;
    let y = p.y - CG.PAD - 12 - h;
    if (y < CG.TOP) y = p.y + CG.PAD + 12;
    panel.style.left = Math.max(8, Math.min(CG.W - w - 8, p.x - w / 2)) + 'px';
    panel.style.top = Math.min(CG.BAR - h, y) + 'px';
  }
  function openBuildMenu(pad) {
    selected = -1; menuPad = pad; placing = null;
    panel.className = 'build'; panel.textContent = '';
    offered().forEach(type => panel.appendChild(towerCard(type, '', () => tryBuild(pad, type))));
    refreshPanel();
    placePanel(world.pads[pad]);
    S.click();
  }
  function select(pad) {
    menuPad = -1; selected = pad; placing = null;
    panel.className = ''; panel.textContent = '';
    const h = document.createElement('h3'), lv = document.createElement('div'), up = document.createElement('button'), sell = document.createElement('button');
    lv.className = 'cg-lv';
    up.type = sell.type = 'button';
    up.className = 'cg-btn cg-pbtn cg-up'; sell.className = 'cg-btn cg-pbtn cg-sell';
    up.id = 'btnUpgrade'; sell.id = 'btnSell';
    on(up, () => upgrade(pad)); on(sell, () => sellTower(pad));
    panel.appendChild(h); panel.appendChild(lv); panel.appendChild(up); panel.appendChild(sell);
    refreshPanel();
    placePanel(world.pads[pad]);
    refreshBar();
    S.click();
  }
  function refreshPanel() {
    if (panel.hidden && menuPad < 0 && selected < 0) return;
    if (menuPad >= 0) {
      Array.prototype.forEach.call(panel.children, b => b.classList.toggle('poor', world.coins < CG.TOWERS[b.getAttribute('data-type')].lv[0].cost));
      return;
    }
    const tw = world.pads[selected] && world.pads[selected].tower;
    if (!tw) { closePanel(); return; }
    const cost = CG.upgradeCost(world, selected), up = $('btnUpgrade'), sell = $('btnSell');
    panel.firstChild.textContent = CG.TOWERS[tw.type].name;
    panel.children[1].textContent = '★'.repeat(tw.lv + 1) + '☆'.repeat(2 - tw.lv) + '  المستوى ' + (tw.lv + 1) + ' من 3';
    up.disabled = cost === null || world.coins < cost;
    up.innerHTML = cost === null ? '<span>أقصى قوة!</span>' : '<span>طوّر <span class="sg-key">U</span></span><span><span class="cg-coin"></span> ' + cost + '</span>';
    sell.innerHTML = '<span>بِع <span class="sg-key">X</span></span><span dir="ltr">+' + CG.sellValue(world, selected) + '</span>';
  }
  function closePanel() { panel.hidden = true; menuPad = -1; selected = -1; refreshBar(); }

  function tryBuild(pad, type) {
    if (!world || ending) return;
    const cost = CG.TOWERS[type].lv[0].cost;
    if (CG.build(world, pad, type)) {
      S.build();
      const p = world.pads[pad];
      fx.burst(p.x, p.y, { count: 18, colors: ['#fff', CG.TOWERS[type].color, '#ffcc00'], speed: 220, life: 0.5, size: 6, gravity: 300 });
      placing = null;
      closePanel();
      if (tutorial === 1) tutorial = 2;
      showTutorial();
    } else {
      S.deny();
      const p = world.pads[pad];
      float(p.x, p.y - 40, 'تحتاج ' + (cost - world.coins) + ' عملة', '#ffffff', 22);
      bump('coins', true);
    }
    updateHUD();
  }
  function upgrade(pad) {
    if (!world || ending || pad < 0) return;
    if (CG.upgrade(world, pad)) {
      S.upgrade();
      const p = world.pads[pad];
      fx.burst(p.x, p.y, { count: 24, colors: ['#ffcc00', '#fff', '#ff7eb6'], speed: 260, life: 0.6, size: 6, gravity: 200 });
      if (!save.upgraded) { save.upgraded = 1; persist(); }
      hideHint();
    } else S.deny();
    refreshPanel(); updateHUD();
  }
  function sellTower(pad) {
    if (!world || ending || pad < 0) return;
    const value = CG.sellValue(world, pad), p = world.pads[pad];
    if (CG.sell(world, pad)) { S.sell(); float(p.x, p.y - 30, '+' + value, '#ffcc00', 26); closePanel(); }
    updateHUD();
  }
  function callWave() {
    if (!world || screen !== 'play' || ending) return;
    if (CG.callWave(world)) { if (tutorial === 2) tutorial = 3; showTutorial(); }
    updateHUD();
  }
  function toggleSpeed() {
    speed = speed === 1 ? 2 : 1;
    S.click();
    updateHUD();
  }

  /* ---------------------------------------------------------- tutorial */
  // The first level teaches by doing: build on the glowing pad, then start the wave.
  function showTutorial() {
    if (!world || screen !== 'play') return;
    if (tutorial === 1) hint(placing ? 'انقر على دائرة بجانب الطريق لتضع البرج' : 'انقر على الدائرة المتوهجة لتبني برجًا');
    if (tutorial === 2) {
      if (world.phase === 'build') hint('رائع! الآن اضغط «ابدأ الموجة» أو مسافة');
      else tutorial = 3;
    }
    if (tutorial === 3) { tutorial = 4; hint('الأبراج ترمي الهلام وحدها. ابنِ المزيد بالعملات!', 3500); }
  }
  let hintTimer = 0;
  function hint(text, ms) {
    const el = $('hint');
    el.textContent = text; el.hidden = false;
    clearTimeout(hintTimer);
    if (ms) hintTimer = setTimeout(hideHint, ms);
  }
  function hideHint() { clearTimeout(hintTimer); $('hint').hidden = true; }
  const glowPad = () => {
    if (tutorial !== 1 || !world) return -1;
    // The pad covering most road among the free ones.
    let best = -1, cover = -1;
    world.pads.forEach((p, i) => {
      if (p.tower) return;
      let c = 0;
      for (const r of world.roads) for (let d = 0; d < r.len; d += 20) { const q = CG.pointAt(r, d); if (Math.hypot(q.x - p.x, q.y - p.y) < 130) c++; }
      if (c > cover) { cover = c; best = i; }
    });
    return best;
  };
  let glow = -1;

  /* -------------------------------------------------------------- banners */
  let bannerTimer = 0;
  function banner(title, sub, kind, ms) {
    const el = $('banner');
    el.textContent = title;
    if (sub) { const s = document.createElement('small'); s.textContent = sub; el.appendChild(s); }
    el.className = kind || '';
    el.hidden = false;
    clearTimeout(bannerTimer);
    // Removed by a timer (not animationend): reduced motion cuts the animation short.
    bannerTimer = setTimeout(hideBanner, ms || 2000);
  }
  function hideBanner() { clearTimeout(bannerTimer); $('banner').hidden = true; }
  const ENEMY_TIPS = {
    z: 'سريع جدًا! ضع الأبراج على طول الطريق.', c: 'قوي وبطيء. الكب كيك يفرقع المجموعات!', s: 'إذا فرقعته انقسم إلى هلامين صغيرين!',
    a: 'الفشار لا يؤثر فيه كثيرًا. جرّب عصا السكر!', k: 'قوي جدًا! أوقفه قبل أن يصل إلى الكعكة!', b: 'أكبر هلام على الإطلاق! طوّر أبراجك!'
  };

  /* ---------------------------------------------------------------- HUD */
  function bump(id, hurt) {
    const el = $(id).parentNode;
    el.classList.remove('bump', 'hurt'); void el.offsetWidth;
    el.classList.add('bump');
    if (hurt) { el.classList.add('hurt'); setTimeout(() => el.classList.remove('hurt'), 400); }
  }
  function setText(id, value) { if (hud[id] !== value) { hud[id] = value; $(id).textContent = value; return true; } return false; }
  function updateHUD() {
    if (!world) return;
    if (setText('coins', String(world.coins))) { refreshBar(); refreshPanel(); }
    setText('hearts', String(world.hearts));
    setText('wave', endless ? String(world.wave) : world.wave + '/' + world.total);
    const btn = $('btnWave'), phase = world.phase;
    let label;
    if (phase === 'build') label = world.wave ? 'الموجة التالية' : 'ابدأ الموجة';
    else if (phase === 'break') label = 'ابدأ الآن';
    else label = 'الهلام قادم!';
    setText('waveLabel', label);
    setText('waveBonus', phase === 'break' ? '+' + Math.ceil(world.breakT) * 2 : '');
    const disabled = !(phase === 'build' || phase === 'break') || !!ending;
    if (btn.disabled !== disabled) btn.disabled = disabled;
    btn.classList.toggle('soon', phase === 'break');
    setText('btnSpeed', '×' + speed);
    $('btnSpeed').classList.toggle('fast', speed > 1);
  }

  /* --------------------------------------------------------------- input */
  // A mouse click hands the keyboard back to the game; keyboard activation keeps focus.
  function on(target, fn) {
    const el = typeof target === 'string' ? $(target) : target;
    el.addEventListener('click', e => { e.stopPropagation(); Kit.audio.unlock(); if (e.detail > 0) { el.blur(); focusGame(); } fn(); });
  }
  on('btnPlay', play);
  on('btnLevels', () => { S.click(); openLevels(); });
  on('btnEndless', () => { if (endlessOpen()) { S.click(); startEndless(); } });
  on('btnCakes', () => { S.click(); openCakes(); });
  on('btnLevelsBack', () => { S.click(); toTitle(); });
  on('btnCakesBack', () => { S.click(); toTitle(); });
  on('btnPause', pause);
  on('btnSpeed', toggleSpeed);
  on('btnWave', callWave);
  on('btnResume', resume);
  on('btnRestart', () => { S.click(); restart(); });
  on('btnMenu', () => { S.click(); toTitle(); });
  on('btnNext', () => { if (resultLock <= 0) { S.click(); nextAfterWin(); } });
  on('btnReplay', () => { if (resultLock <= 0) { S.click(); restart(); } });
  on('btnWinLevels', () => { S.click(); openLevels(); });
  on('btnRetry', () => { if (resultLock <= 0) { S.click(); restart(); } });
  on('btnLoseLevels', () => { S.click(); openLevels(); });
  on('btnAgain', () => { if (resultLock <= 0) { S.click(); startEndless(); } });
  on('btnOverMenu', () => { S.click(); toTitle(); });
  panel.addEventListener('pointerdown', e => e.stopPropagation());

  function padAt(x, y) {
    if (!world) return -1;
    let best = -1, dist = CG.PAD + 8;
    world.pads.forEach((p, i) => { const d = Math.hypot(p.x - x, p.y - y); if (d < dist) { dist = d; best = i; } });
    return best;
  }
  canvas.addEventListener('pointermove', e => {
    const p = view.toLogical(e.clientX, e.clientY);
    mouse = p;
    hoverPad = padAt(p.x, p.y);
  });
  canvas.addEventListener('pointerleave', () => { hoverPad = -1; mouse = { x: -100, y: -100 }; });
  canvas.addEventListener('pointerdown', e => {
    focusGame();
    if (screen !== 'play' || !world || ending) return;
    if (e.button === 2) { placing = null; closePanel(); return; }
    if (e.button !== 0) return;
    const p = view.toLogical(e.clientX, e.clientY), pad = padAt(p.x, p.y);
    mouse = p; hoverPad = pad;
    if (pad >= 0 && world.pads[pad].tower) { select(pad); return; }
    if (pad >= 0 && placing) { tryBuild(pad, placing); return; }
    if (pad >= 0) { openBuildMenu(pad); return; }
    if (placing) { placing = null; refreshBar(); showTutorial(); }
    closePanel();
  });

  const DIGITS = [['Digit1', 'Numpad1'], ['Digit2', 'Numpad2'], ['Digit3', 'Numpad3'], ['Digit4', 'Numpad4']];
  function handleKeys() {
    const K = Kit.keys, go = K.anyPressed(['Enter', 'NumpadEnter', 'Space']);
    if (screen === 'title') { if (go) play(); }
    else if (screen === 'levels' || screen === 'cakes') { if (K.pressed('Escape')) toTitle(); }
    else if (screen === 'play') {
      if (K.pressed('Escape') && (placing || !panel.hidden)) { placing = null; closePanel(); showTutorial(); }
      else if (K.anyPressed(['KeyP', 'Escape'])) pause();
      else {
        const types = offered();
        DIGITS.forEach((codes, i) => { if (types[i] && K.anyPressed(codes)) togglePlacing(types[i]); });
        if (K.pressed('Space')) callWave();
        if (K.pressed('KeyF')) toggleSpeed();
        if (K.pressed('KeyU') && selected >= 0) upgrade(selected);
        if (K.anyPressed(['KeyX', 'Delete']) && selected >= 0) sellTower(selected);
      }
    } else if (screen === 'pause') {
      if (K.anyPressed(['KeyP', 'Escape', 'Enter', 'NumpadEnter'])) resume();
      else if (K.pressed('KeyR')) restart();
    } else if (resultLock <= 0) {
      if (screen === 'win') { if (go) nextAfterWin(); else if (K.pressed('KeyR')) restart(); else if (K.pressed('Escape')) openLevels(); }
      else if (screen === 'lose') { if (go || K.pressed('KeyR')) restart(); else if (K.pressed('Escape')) openLevels(); }
      else if (screen === 'over') { if (go || K.pressed('KeyR')) startEndless(); else if (K.pressed('Escape')) toTitle(); }
    }
  }

  /* -------------------------------------------------------------- effects */
  function float(x, y, text, color, size) { floats.push({ x: x, y: y, text: text, color: color, size: size || 24, t: 0 }); if (floats.length > 30) floats.shift(); }
  function handleEvents() {
    for (const e of world.ev) {
      switch (e.t) {
        case 'shoot': S[e.type](); break;
        case 'zap': zaps.push({ x: e.x, y: e.y - 18, tx: e.tx, ty: e.ty, t: 0 }); break;
        case 'hit':
          if (e.kind === 'bubble') rings.push({ x: e.x, y: e.y, r: e.r || 30, t: 0, color: '180,230,255' });
          break;
        case 'splash':
          S.splash();
          rings.push({ x: e.x, y: e.y, r: e.r, t: 0, color: '255,126,182' });
          fx.burst(e.x, e.y, { count: 14, colors: ['#ff7eb6', '#fff', '#b77745'], speed: 220, life: 0.45, size: 6, gravity: 300 });
          break;
        case 'pop': {
          const en = CG.ENEMIES[e.type];
          if (e.boss) { S.bossPop(); shake.add(10); } else S.blobPop();
          fx.burst(e.x, e.y, { count: e.boss ? 60 : 12, colors: [en.color, '#fff', '#ffcc00', '#ff7eb6'], speed: e.boss ? 380 : 230, life: 0.55, size: e.boss ? 9 : 6, gravity: 380 });
          float(e.x, e.y - 18, '+' + e.reward, '#ffcc00', e.boss ? 34 : 22);
          break;
        }
        case 'leak':
          S.chomp(); shake.add(7);
          float(e.x + 30, e.y - 70, 'نَم!', '#ff5d8f', 30);
          fx.burst(e.x + 30, e.y - 10, { count: 16, colors: ['#ff9ec8', '#fff1d6', '#fff'], speed: 200, life: 0.5, size: 6, gravity: 300 });
          bump('hearts', true);
          break;
        case 'spawn':
          if (!save.seen[e.type]) {
            save.seen[e.type] = 1; persist();
            if (ENEMY_TIPS[e.type]) banner('هلام جديد: ' + CG.ENEMIES[e.type].name, ENEMY_TIPS[e.type], 'tip', 4500);
          }
          break;
        case 'boss': S.boss(); if (!tipShowing()) banner(CG.ENEMIES[e.type].name + ' قادم!', '', '', 2200); break;
        case 'wave': S.wave(); if (world.wave > 1 || endless) banner('الموجة ' + world.wave, '', '', 1300); break;
        case 'clear': S.clear(); float(world.cake.x, world.cake.y - 90, '+' + e.bonus, '#ffcc00', 30); bump('coins'); break;
        case 'early': float(world.cake.x, world.cake.y - 120, '+' + e.bonus, '#3ddc84', 30); break;
        case 'win':
          commitWin(e.stars);
          ending = { kind: 'win', t: 1.6 };
          banner('الكعكة بأمان!', '', '', 1500);
          if (!calm()) for (let i = 0; i < 5; i++) fx.burst(200 + i * 220, 200, { count: 26, colors: ['#ff7eb6', '#ffcc00', '#6fd3ff', '#62d26f', '#fff'], speed: 380, life: 1.2, size: 8, gravity: 420 });
          break;
        case 'lose':
          commitLose();
          ending = { kind: 'lose', t: 1.4 };
          break;
      }
    }
    world.ev.length = 0;
  }
  // A boss announces itself unless the tip introducing it is on screen.
  function tipShowing() { return !$('banner').hidden && $('banner').classList.contains('tip'); }
  function updateFx(dt) {
    fx.update(dt);
    shake.update(dt);
    for (let i = floats.length - 1; i >= 0; i--) { const f = floats[i]; f.t += dt; f.y -= dt * 40; if (f.t > 1.1) floats.splice(i, 1); }
    for (let i = zaps.length - 1; i >= 0; i--) { zaps[i].t += dt; if (zaps[i].t > 0.16) zaps.splice(i, 1); }
    for (let i = rings.length - 1; i >= 0; i--) { rings[i].t += dt; if (rings[i].t > 0.35) rings.splice(i, 1); }
  }

  /* --------------------------------------------------------------- loop */
  function update(dt) {
    handleKeys();
    if (screen === 'play' && world) {
      time += dt;
      if (!ending) {
        for (let i = 0; i < speed && !ending; i++) { CG.step(world, dt); handleEvents(); }
        // A wave the child is watching is play time too (at most once a second).
        busyT += dt;
        if (busyT >= 1) { busyT = 0; if (world.phase === 'wave') Kit.stats.busy(); }
        if (tutorial === 2 && world.phase !== 'build') showTutorial();
      } else {
        // The board keeps its celebration going until the result screen opens.
        ending.t -= dt;
        if (ending.t <= 0) showResult();
      }
      updateFx(dt * (ending ? 1 : speed));
      updateHUD();
      glow = glowPad();
    } else if (resultLock > 0) resultLock -= dt;
    Kit.keys.endFrame();
  }

  function pixelScale() { return Math.min(2, Math.max(0.5, Math.round(view.scale * view.dpr * 4) / 4)); }
  function ensureBackground() {
    const k = pixelScale(), key = CG.LEVELS.indexOf(world.def) + '|' + world.def.w + '|' + k;
    if (bg && bgKey === key) return;
    bg = bg || document.createElement('canvas');
    bg.width = Math.round(CG.W * k); bg.height = Math.round(CG.H * k);
    const g = bg.getContext('2d');
    g.setTransform(k, 0, 0, k, 0, 0);
    A.background(g, world);
    bgKey = key;
  }
  function padState(i) {
    if (placing) return world.coins >= CG.TOWERS[placing].lv[0].cost ? 'ok' : 'no';
    return i === hoverPad || i === menuPad ? 'hover' : '';
  }
  function draw() {
    const ctx = view.ctx, w = world, still = calm();
    if (!w) return;
    ensureBackground();
    ctx.save();
    ctx.translate(shake.x, shake.y);
    ctx.drawImage(bg, 0, 0, CG.W, CG.H);
    w.pads.forEach((p, i) => { if (!p.tower) A.pad(ctx, p.x, p.y, padState(i), still ? 0 : time); });
    if (glow >= 0 && screen === 'play') {
      const p = w.pads[glow], pulse = still ? 0.5 : (Math.sin(time * 5) + 1) / 2;
      ctx.strokeStyle = 'rgba(255,204,0,' + (0.5 + pulse * 0.5) + ')'; ctx.lineWidth = 6;
      A.circle(ctx, p.x, p.y, CG.PAD + 8 + pulse * 6); ctx.stroke();
    }
    const showRange = selected >= 0 && w.pads[selected].tower ? selected : -1;
    if (showRange >= 0) { const p = w.pads[showRange]; A.range(ctx, p.x, p.y, CG.towerLevel(p.tower).range, true); }
    A.cake(ctx, w.cake.x, w.cake.y, CG.CAKES[save.cake], w.hearts, time, still, pixelScale());
    for (const b of w.enemies) A.blob(ctx, b, time, still);
    w.pads.forEach(p => { if (p.tower) A.tower(ctx, p.tower, p.x, p.y, time); });
    for (const s of w.shots) A.shot(ctx, s);
    // A ghost of the tower being placed, with its reach.
    if (placing && screen === 'play') {
      const at = hoverPad >= 0 && !w.pads[hoverPad].tower ? w.pads[hoverPad] : mouse;
      if (at.x > 0) {
        const ok = hoverPad >= 0 && !w.pads[hoverPad].tower && w.coins >= CG.TOWERS[placing].lv[0].cost;
        A.range(ctx, at.x, at.y, CG.TOWERS[placing].lv[0].range, ok);
        ctx.globalAlpha = 0.7; A.tower(ctx, { type: placing, lv: 0, angle: -Math.PI / 2, kick: 0 }, at.x, at.y, time); ctx.globalAlpha = 1;
      }
    }
    for (const r of rings) {
      ctx.strokeStyle = 'rgba(' + r.color + ',' + (1 - r.t / 0.35) + ')'; ctx.lineWidth = 4;
      A.circle(ctx, r.x, r.y, r.r * (0.4 + r.t / 0.35 * 0.6)); ctx.stroke();
    }
    for (const z of zaps) {
      ctx.strokeStyle = 'rgba(255,240,160,' + (1 - z.t / 0.16) + ')'; ctx.lineWidth = 6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(z.x, z.y); ctx.lineTo(z.tx, z.ty); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,90,110,' + (1 - z.t / 0.16) + ')'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(z.x, z.y); ctx.lineTo(z.tx, z.ty); ctx.stroke();
    }
    fx.draw(ctx);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    for (const f of floats) {
      ctx.globalAlpha = Math.max(0, 1 - Math.max(0, f.t - 0.6) / 0.5);
      ctx.font = '700 ' + f.size + 'px Fredoka';
      // Right to left only for Arabic: in an RTL run "+3" would come out as "3+".
      ctx.direction = /[\u0600-\u06FF]/.test(f.text) ? 'rtl' : 'ltr';
      ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(40,20,50,0.8)'; ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }
  // Paused and menu screens keep their last frame; only a change (resize, restored canvas,
  // late fonts, a new screen) draws again.
  function render() {
    if (screen !== 'play' && !frameDirty) return;
    frameDirty = false;
    draw();
  }

  canvas.addEventListener('contextrestored', () => { bgKey = ''; A.resetCaches(); frameDirty = true; Array.prototype.forEach.call(document.querySelectorAll('canvas[data-icon]'), c => A.towerIcon(c, c.getAttribute('data-icon'))); });
  if (document.fonts && document.fonts.load) {
    document.fonts.load('700 24px Fredoka', 'نَم+5').then(() => { frameDirty = true; }, () => { /* fallback fonts */ });
  }

  window.__game = {
    get state() {
      return { screen: screen, level: levelIdx, endless: endless, phase: world ? world.phase : null, wave: world ? world.wave : 0, total: world ? world.total : 0,
        coins: world ? world.coins : 0, hearts: world ? world.hearts : 0, towers: world ? world.pads.filter(p => p.tower).length : 0,
        enemies: world ? world.enemies.length : 0, time: world ? +world.time.toFixed(3) : 0, speed: speed, placing: placing, selected: selected, paused: screen === 'pause' };
    },
    get world() { return world; },
    save: save,
    // Where pad i is on the page, for tests that click it like a player.
    padPoint: function (i) { const p = world.pads[i], r = canvas.getBoundingClientRect(); return { x: r.left + p.x * view.scale, y: r.top + p.y * view.scale }; },
    start: function (i) { startLevel(i); },
    endless: function () { startEndless(); },
    give: function (n) { if (world) world.coins += n; },
    win: function () { if (screen === 'play' && world && !endless && !ending) { world.wave = world.total; world.queue = []; world.enemies = []; world.shots = []; world.phase = 'wave'; } },
    lose: function () { if (screen === 'play' && world && !ending) world.hearts = 0; }
  };

  Kit.muteButton();
  Kit.lifecycle({ pause: pause, reset: function () { hoverPad = -1; } });
  toTitle();
  Kit.loop(update, render);
  Kit.ready();
})();
