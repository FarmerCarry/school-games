/* Cake Guards — Active Frosting Cannon Defense: instant 1.5s waves, live cursor/Space frosting blaster,
 * magnetized coins, 1-click bottom turret bar, 1-tap pad build/upgrade, Kit.dda & Kit.juice. */
(function () {
  'use strict';
  const CG = window.CG, A = CG.art, J = Kit.juice;
  const $ = id => document.getElementById(id);
  const canvas = $('game'), ui = $('ui'), bar = $('bar');
  let frameDirty = true, bg = null, bgKey = '';

  Kit.art.init({ canvas, ctx: canvas.getContext('2d'), mode: '2d', theme: 'candy' });
  const view = Kit.fit(canvas, CG.W, CG.H, { maxDpr: 1.5, onResize: v => {
    ui.style.left = canvas.style.left; ui.style.top = canvas.style.top; ui.style.transform = 'scale(' + v.scale + ')';
    bgKey = ''; A.resetCaches(); frameDirty = true;
  } });
  A.warm();
  let fx = Kit.art.fx(220);
  const cakeSpring = Kit.art.spring(210, 12);
  const calm = () => Kit.motion.reduced();
  const poof = (x, y, color, n, shape, speed) => fx.burst(x, y, { n, color, speed: speed || 220, life: 0.48, size: 7, shape: shape || 'confetti' });
  Kit.art.quality.on(() => { bgKey = ''; A.resetCaches(); A.warm(); frameDirty = true; });

  // Compact candy SFX built on shared Kit.juice + subtle chomp noise (zero-BGM safe).
  const S = {
    click: () => J.tap(),
    deny: () => J.error(),
    build: () => J.select(),
    upgrade: () => J.levelUp(),
    sell: () => J.coin(2),
    blast: () => J.pop(0.35),
    splat: () => J.impact(0.35),
    shoot: () => J.pop(0.85),
    splash: () => J.impact(0.45),
    pop: c => { J.pop(0.5); if (c >= 3 && c % 2 === 1) J.streak(Math.min(12, c)); },
    bossPop: () => { J.impact(1); J.levelUp(); },
    chomp: () => { Kit.audio.noise({ dur: 0.1, vol: 0.22, filter: 900 }); J.error(); },
    wave: () => J.countdown(0),
    clear: () => J.chime(2),
    boss: () => J.impact(0.85),
    star: i => J.star(i + 1),
    win: () => J.levelUp(),
    lose: () => J.fail()
  };

  /* --------------------------------------------------------- save & DDA */
  const store = Kit.store('cake-guards');
  const saveStatus = Kit.saveStatus({ retry: persist });
  const dda = Kit.dda('cake-guards', { id: 'main', start: 0.35 });
  const save = (function () {
    const raw = store.get('save', null), s = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const stars = CG.LEVELS.map((_, i) => { const v = Array.isArray(s.stars) ? s.stars[i] : 0; return Number.isInteger(v) && v >= 0 && v <= 3 ? v : 0; });
    const total = stars.reduce((a, b) => a + b, 0);
    let cake = Number.isInteger(s.cake) && s.cake >= 0 && s.cake < CG.CAKES.length ? s.cake : 0;
    if (CG.CAKES[cake].stars > total) cake = 0;
    return { v: 1, stars, endless: Number.isInteger(s.endless) && s.endless > 0 ? s.endless : 0, cake };
  })();
  function persist() {
    if (store.set('save', save) === false) { saveStatus.failed(); return false; }
    saveStatus.saved(); return true;
  }
  const totalStars = () => save.stars.reduce((a, b) => a + b, 0);
  const done = () => save.stars.filter(Boolean).length;
  const unlocked = i => i === 0 || save.stars[i - 1] > 0;
  const endlessOpen = () => done() >= CG.ENDLESS_AFTER;
  function nextLevel() { for (let i = 0; i < CG.LEVELS.length; i++) if (!save.stars[i]) return i; return CG.LEVELS.length - 1; }

  /* -------------------------------------------------------------- state */
  let screen = 'title', world = null, levelIdx = 0, endless = false, endlessBest = 0, speed = 1;
  let activeType = 'pop', hoverPad = -1, mouse = { x: -100, y: -100, over: false }, firing = false;
  let time = 0, ending = null, result = null, resultLock = 0, busyT = 0, idleT = 0, acted = false;
  let floats = [], rings = [], magCoins = [], hud = {}, shownCoins = 0, demoT = 0;
  const PRAISE = ['رائع!', 'مطر كريمة!', 'فوق الممتاز!'];

  /* ------------------------------------------------------------ screens */
  const SCREENS = ['title', 'levels', 'cakes', 'pause', 'win', 'lose', 'over'];
  function setScreen(name) {
    screen = name;
    SCREENS.forEach(s => { $('scr-' + s).hidden = s !== name; });
    const inLevel = !!world && ['play', 'pause', 'win', 'lose', 'over'].indexOf(name) >= 0;
    $('hud').hidden = !inLevel;
    bar.hidden = !(name === 'play' || name === 'pause');
    if (name !== 'play') { firing = false; hideHint(); }
    frameDirty = true;
  }
  function focusGame() { try { canvas.focus({ preventScroll: true }); } catch (e) {} }

  function begin(def, isDemo) {
    world = CG.create(def, { hpMult: isDemo ? 1 : dda.value(0.86, 1.08) });
    speed = 1; hoverPad = -1; firing = false; activeType = 'pop';
    fx = Kit.art.fx(220); cakeSpring.sx = cakeSpring.sy = 1; cakeSpring.v = 0;
    floats = []; rings = []; magCoins = []; time = 0; ending = null; result = null; busyT = 0;
    idleT = 0; acted = false; hud = {}; shownCoins = world.coins;
    if (!isDemo) {
      buildBar(); hideBanner(); setScreen('play'); updateHUD(); Kit.keys.reset(); focusGame();
    } else {
      // Live attract world behind the title screen (silent — zero-BGM!).
      CG.callWave(world);
      const p2 = CG.bestPad(world); if (p2 >= 0) CG.build(world, p2, 'bubble');
      demoT = 0;
    }
  }
  function startLevel(i) {
    endless = false; levelIdx = i;
    Kit.stats.round('L' + (i + 1));
    begin(CG.LEVELS[i], false);
    banner('المرحلة ' + (i + 1), CG.WORLDS[CG.LEVELS[i].w].name, 1600);
  }
  function startEndless() {
    endless = true; endlessBest = save.endless;
    Kit.stats.round('endless');
    begin(CG.ENDLESS, false);
    banner('بلا نهاية', 'أطلق الكريمة واصمد!', 1800);
  }
  function restart() { if (endless) startEndless(); else startLevel(levelIdx); }
  function play() { S.click(); startLevel(nextLevel()); }

  function toTitle() {
    endless = false;
    begin(CG.LEVELS[nextLevel()], true);
    hideBanner(); setScreen('title'); refreshTitle();
  }
  function refreshTitle() {
    $('playSub').textContent = done() >= CG.LEVELS.length ? 'أنهيت كل المراحل!' : 'المرحلة ' + (nextLevel() + 1);
    $('levelsSub').textContent = '★ ' + totalStars() + ' / ' + CG.LEVELS.length * 3;
    $('btnEndless').disabled = !endlessOpen();
    $('endlessSub').textContent = endlessOpen() ? (save.endless ? 'أفضل: ' + save.endless + ' موجة' : 'كم موجة ستصمد؟') : '🔒 أنهِ مرحلتين';
    $('cakesSub').textContent = CG.CAKES[save.cake].name;
  }

  function openLevels() {
    const box = $('worlds'); box.textContent = '';
    CG.WORLDS.forEach((w, wi) => {
      const sec = document.createElement('div'), h = document.createElement('h3'), grid = document.createElement('div');
      sec.className = 'cg-world'; grid.className = 'cg-lvs'; h.textContent = w.name;
      CG.LEVELS.forEach((lv, i) => {
        if (lv.w !== wi) return;
        const b = document.createElement('button'), st = save.stars[i];
        b.type = 'button'; b.className = 'cg-lvbtn'; b.disabled = !unlocked(i); b.textContent = String(i + 1);
        const sm = document.createElement('small'); sm.textContent = unlocked(i) ? '★'.repeat(st) + '☆'.repeat(3 - st) : '🔒';
        b.appendChild(sm); b.setAttribute('aria-label', 'المرحلة ' + (i + 1));
        on(b, () => { S.click(); startLevel(i); }); grid.appendChild(b);
      });
      sec.appendChild(h); sec.appendChild(grid); box.appendChild(sec);
    });
    $('starsTotal').textContent = '★ ' + totalStars() + ' / ' + CG.LEVELS.length * 3;
    setScreen('levels');
  }
  function openCakes() {
    const grid = $('cakeGrid'), st = totalStars(); grid.textContent = '';
    CG.CAKES.forEach((c, i) => {
      const b = document.createElement('button'), cv = document.createElement('canvas'), nm = document.createElement('div');
      b.type = 'button'; b.className = 'cg-cake' + (i === save.cake ? ' on' : ''); b.disabled = c.stars > st;
      cv.width = cv.height = 240; A.cakeIcon(cv, c);
      nm.textContent = c.stars > st ? '🔒 ★ ' + c.stars : c.name;
      b.appendChild(cv); b.appendChild(nm);
      on(b, () => { save.cake = i; persist(); S.click(); A.resetCaches(); openCakes(); });
      grid.appendChild(b);
    });
    setScreen('cakes');
  }

  function pause() {
    if (screen !== 'play') return;
    $('pauseSub').textContent = endless ? 'بلا نهاية · الموجة ' + world.wave : 'المرحلة ' + (levelIdx + 1) + ' · ' + CG.WORLDS[world.def.w].name;
    setScreen('pause'); S.click();
  }
  function resume() { if (screen === 'pause') { setScreen('play'); Kit.keys.reset(); focusGame(); } }

  /* ------------------------------------------------------------ results */
  function commitWin(stars) {
    const prev = save.stars[levelIdx], before = totalStars(), wasOpen = endlessOpen();
    if (stars > prev) save.stars[levelIdx] = stars;
    persist();
    dda.result(stars / 3);
    Kit.stats.end('win', stars);
    const cake = CG.CAKES.find(c => c.stars > before && c.stars <= totalStars());
    result = { stars, prev, hearts: world.hearts, cake, endless: !wasOpen && endlessOpen() };
  }
  function commitLose() {
    const cleared = Math.max(0, world.wave - 1);
    if (endless) {
      const best = cleared > endlessBest;
      if (cleared > save.endless) { save.endless = cleared; persist(); }
      Kit.stats.end('end', cleared);
      result = { cleared, best };
    } else {
      dda.result(0);
      Kit.stats.end('lose', cleared);
      result = { cleared };
    }
  }
  function showResult() {
    resultLock = 0.45;
    if (ending.kind === 'win') {
      const r = result, news = [];
      $('winKicker').textContent = 'المرحلة ' + (levelIdx + 1) + ' · ' + CG.WORLDS[world.def.w].name;
      $('winSub').textContent = 'بقي ' + r.hearts + ' من ' + CG.HEARTS + ' قطعة من الكعكة';
      if (r.prev && r.stars > r.prev) news.push('نجوم جديدة!');
      if (r.cake) news.push('كعكة جديدة: ' + r.cake.name + '!');
      if (r.endless) news.push('فتحت «بلا نهاية»!');
      $('winNew').hidden = !news.length; $('winNew').textContent = news.join(' · ');
      $('btnNext').textContent = levelIdx >= CG.LEVELS.length - 1 ? 'المراحل ◀' : 'المرحلة التالية ◀';
      const st = $('winStars').children; for (let i = 0; i < 3; i++) st[i].className = '';
      setScreen('win'); S.win();
      for (let i = 0; i < r.stars; i++) setTimeout(() => { if (screen === 'win') { st[i].className = 'on'; S.star(i); } }, 240 + i * 260);
    } else if (endless) {
      $('overWaves').textContent = String(result.cleared);
      $('overSub').textContent = (result.cleared === 1 ? 'صمدت موجة واحدة' : 'صمدت ' + result.cleared + ' موجات') + ' · الأفضل: ' + save.endless;
      $('overNew').hidden = !result.best || result.cleared < 1;
      setScreen('over'); S.lose();
    } else {
      $('loseKicker').textContent = 'المرحلة ' + (levelIdx + 1) + ' · ' + CG.WORLDS[world.def.w].name;
      $('loseSub').textContent = 'صمدت ' + result.cleared + ' من ' + world.total + ' موجات · أطلق الكريمة وابنِ الأبراج!';
      setScreen('lose'); S.lose();
    }
  }
  function nextAfterWin() { if (levelIdx >= CG.LEVELS.length - 1) openLevels(); else startLevel(levelIdx + 1); }

  /* --------------------------------------------------- 1-click turret bar */
  function buildBar() {
    bar.textContent = '';
    CG.TOWER_ORDER.forEach((type, i) => {
      const spec = CG.TOWERS[type], b = document.createElement('button');
      b.type = 'button'; b.className = 'cg-card'; b.setAttribute('data-type', type);
      b.title = spec.name;
      const cv = document.createElement('canvas'); cv.width = cv.height = 116; cv.setAttribute('data-icon', type);
      A.towerIcon(cv, type); b.appendChild(cv);
      const txt = document.createElement('div'), nm = document.createElement('div'), pr = document.createElement('div');
      nm.className = 'cg-name'; nm.textContent = spec.short;
      pr.className = 'cg-price'; pr.innerHTML = '<span class="cg-coin"></span>'; pr.appendChild(document.createTextNode(String(spec.lv[0].cost)));
      txt.appendChild(nm); txt.appendChild(pr); b.appendChild(txt);
      const k = document.createElement('span'); k.className = 'sg-key'; k.textContent = String(i + 1); b.appendChild(k);
      on(b, () => quickBuild(type));
      bar.appendChild(b);
    });
    refreshBar();
  }
  function refreshBar() {
    if (!world) return;
    const anyFree = CG.bestPad(world) >= 0;
    Array.prototype.forEach.call(bar.children, b => {
      const type = b.getAttribute('data-type'), cost = CG.TOWERS[type].lv[0].cost;
      const ok = world.coins >= cost;
      b.classList.toggle('sel', activeType === type);
      b.classList.toggle('ready', ok && anyFree);
      b.classList.toggle('poor', !ok);
    });
  }
  function quickBuild(type) {
    if (screen !== 'play' || !world || ending) return;
    activeType = type; acted = true; hideHint();
    const res = CG.quickAct(world, type);
    if (res.ok) {
      const p = world.pads[res.pad];
      if (res.kind === 'build') { S.build(); poof(p.x, p.y, CG.TOWERS[type].color, 10, 'star', 210); }
      else { S.upgrade(); poof(p.x, p.y, '#ffcc00', 12, 'star', 240); Kit.art.pop('★', p.x, p.y - 30, { color: '#ffcc00', size: 28 }); }
      shownCoins = Math.min(shownCoins, world.coins);
    } else {
      S.deny();
      const p = res.pad >= 0 ? world.pads[res.pad] : { x: 640, y: 560 };
      if (res.need > 0) floatTxt(p.x, p.y - 36, 'تحتاج ' + res.need, '#fff', 22);
      bump('coins', true);
    }
    refreshBar(); updateHUD();
  }
  function tapPad(pad) {
    if (screen !== 'play' || !world || ending) return;
    acted = true; hideHint();
    const p = world.pads[pad];
    if (p.tower) {
      const cost = CG.upgradeCost(world, pad);
      if (cost === null) { S.click(); floatTxt(p.x, p.y - 36, 'أقصى قوة ★', '#ffd23f', 20); return; }
      if (CG.upgrade(world, pad)) { S.upgrade(); poof(p.x, p.y, '#ffcc00', 12, 'star', 240); shownCoins = Math.min(shownCoins, world.coins); }
      else { S.deny(); floatTxt(p.x, p.y - 36, 'تحتاج ' + (cost - world.coins), '#fff', 22); bump('coins', true); }
    } else {
      const pick = world.coins >= CG.TOWERS[activeType].lv[0].cost ? activeType : 'pop';
      if (CG.build(world, pad, pick)) { S.build(); poof(p.x, p.y, CG.TOWERS[pick].color, 10, 'star', 210); shownCoins = Math.min(shownCoins, world.coins); }
      else { S.deny(); floatTxt(p.x, p.y - 36, 'تحتاج ' + (CG.TOWERS[pick].lv[0].cost - world.coins), '#fff', 22); bump('coins', true); }
    }
    refreshBar(); updateHUD();
  }
  function sellPad(pad) {
    if (screen !== 'play' || !world || ending || !world.pads[pad] || !world.pads[pad].tower) return;
    const val = CG.sellValue(world, pad), p = world.pads[pad];
    if (CG.sell(world, pad)) { S.sell(); if (val) Kit.art.pop('+' + val, p.x, p.y - 26, { color: '#ffcc00', size: 24 }); shownCoins = world.coins; refreshBar(); updateHUD(); }
  }

  /* -------------------------------------------------- banners, HUD & IO */
  let bannerTimer = 0;
  function banner(title, sub, ms) {
    const el = $('banner'); el.textContent = title;
    if (sub) { const sm = document.createElement('small'); sm.textContent = sub; el.appendChild(sm); }
    el.hidden = false; clearTimeout(bannerTimer); bannerTimer = setTimeout(hideBanner, ms || 1600);
  }
  function hideBanner() { clearTimeout(bannerTimer); $('banner').hidden = true; }
  function showHint(text) { const el = $('hint'); el.textContent = text; el.hidden = false; }
  function hideHint() { $('hint').hidden = true; }

  function bump(id, hurt) {
    const el = $(id).parentNode; el.classList.remove('bump', 'hurt'); void el.offsetWidth;
    el.classList.add('bump'); if (hurt) { el.classList.add('hurt'); setTimeout(() => el.classList.remove('hurt'), 360); }
  }
  function setText(id, val) { if (hud[id] !== val) { hud[id] = val; $(id).textContent = val; return true; } return false; }
  function updateHUD() {
    if (!world) return;
    if (setText('coins', String(Math.round(shownCoins)))) refreshBar();
    setText('hearts', String(world.hearts));
    setText('wave', endless ? String(world.wave) : world.wave + '/' + world.total);
    $('comboStat').hidden = world.combo < 2;
    if (world.combo >= 2) setText('combo', '×' + world.combo);
    setText('btnSpeed', '×' + speed); $('btnSpeed').classList.toggle('fast', speed > 1);
  }

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
  on('btnSpeed', () => { speed = speed === 1 ? 2 : 1; S.click(); updateHUD(); });
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

  function padAt(x, y) {
    if (!world) return -1;
    let best = -1, dist = CG.PAD + 8;
    world.pads.forEach((p, i) => { const d = Math.hypot(p.x - x, p.y - y); if (d < dist) { dist = d; best = i; } });
    return best;
  }
  canvas.addEventListener('pointermove', e => {
    const p = view.toLogical(e.clientX, e.clientY);
    mouse.x = p.x; mouse.y = p.y; mouse.over = true; hoverPad = padAt(p.x, p.y);
  });
  canvas.addEventListener('pointerleave', () => { hoverPad = -1; mouse.over = false; firing = false; });
  canvas.addEventListener('pointerdown', e => {
    focusGame();
    if (screen !== 'play' || !world || ending) return;
    const p = view.toLogical(e.clientX, e.clientY), pad = padAt(p.x, p.y);
    mouse.x = p.x; mouse.y = p.y; mouse.over = true; hoverPad = pad;
    if (e.button === 2) { if (pad >= 0) sellPad(pad); return; }
    if (e.button !== 0) return;
    if (pad >= 0) { tapPad(pad); return; }
    firing = true; acted = true; hideHint();
    CG.blast(world, p.x, p.y);
  });
  window.addEventListener('pointerup', () => { firing = false; });

  const DIGITS = [['Digit1', 'Numpad1'], ['Digit2', 'Numpad2'], ['Digit3', 'Numpad3']];
  function handleKeys() {
    const K = Kit.keys, go = K.anyPressed(['Enter', 'NumpadEnter', 'Space']);
    if (screen === 'title') { if (go) play(); }
    else if (screen === 'levels' || screen === 'cakes') { if (K.pressed('Escape')) toTitle(); }
    else if (screen === 'play') {
      if (K.anyPressed(['KeyP', 'Escape'])) pause();
      else {
        DIGITS.forEach((codes, i) => { if (CG.TOWER_ORDER[i] && K.anyPressed(codes)) quickBuild(CG.TOWER_ORDER[i]); });
        if (K.pressed('KeyF')) { speed = speed === 1 ? 2 : 1; S.click(); updateHUD(); }
        if ((K.down('Space') || K.pressed('Space')) && !ending) { acted = true; hideHint(); CG.blast(world); }
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

  /* ------------------------------------------------------------- events */
  function floatTxt(x, y, text, color, size) { floats.push({ x, y, text, color, size: size || 24, t: 0 }); if (floats.length > 26) floats.shift(); }
  function handleEvents(silent) {
    for (const e of world.ev) {
      if (e.t === 'blast') {
        if (!silent) S.blast();
        cakeSpring.kick(0.28);
        poof(e.sx, e.sy, '#ff9ec8', 4, 'dot', 140);
      } else if (e.t === 'splat') {
        if (!silent) { S.splat(); Kit.art.shake.add(0.14); }
        rings.push({ x: e.x, y: e.y, r: e.r, t: 0, color: '255,158,200' });
        poof(e.x, e.y, '#ff9ec8', 8, 'confetti', 210);
        poof(e.x, e.y, '#fff5fa', 5, 'dot', 170);
      } else if (e.t === 'shoot') {
        if (!silent) S.shoot();
      } else if (e.t === 'hit') {
        if (e.kind === 'bubble') rings.push({ x: e.x, y: e.y, r: e.r || 36, t: 0, color: '150,225,255' });
      } else if (e.t === 'splash') {
        if (!silent) S.splash();
        rings.push({ x: e.x, y: e.y, r: e.r, t: 0, color: '255,126,182' });
        poof(e.x, e.y, '#ff7eb6', 8, 'confetti', 210);
      } else if (e.t === 'pop') {
        const en = CG.ENEMIES[e.type];
        if (!silent) {
          if (e.boss) { S.bossPop(); Kit.art.shake.add(0.5); Kit.art.hitstop(65); }
          else { S.pop(e.combo); if (e.combo >= 4) Kit.art.shake.add(0.18); }
          if (e.combo === 4 || e.combo === 8 || e.combo === 12) floatTxt(e.x, e.y - 34, PRAISE[Math.min(2, Math.floor(e.combo / 4) - 1)], '#ffd23f', 30);
        }
        poof(e.x, e.y, en.color, e.boss ? 16 : 8, 'confetti', e.boss ? 280 : 210);
        // Magnetized candy coins fly straight into the top coin bank!
        const cnt = Math.min(5, Math.max(1, Math.ceil(e.reward / 5)));
        for (let k = 0; k < cnt; k++) {
          const ang = (k / cnt) * Math.PI * 2 + e.x * 0.05;
          magCoins.push({ x: e.x, y: e.y, sx: e.x + Math.cos(ang) * 26, sy: e.y + Math.sin(ang) * 20, t: -k * 0.04, v: e.reward / cnt });
        }
        if (magCoins.length > 48) { const old = magCoins.shift(); shownCoins = Math.min(world.coins, shownCoins + old.v); }
      } else if (e.t === 'leak') {
        if (!silent) { S.chomp(); Kit.art.shake.add(0.35); bump('hearts', true); }
        cakeSpring.kick(-0.5);
        floatTxt(e.x + 26, e.y - 68, 'نَم!', '#ff5470', 30);
        poof(e.x + 26, e.y - 10, '#ff9ec8', 8, 'confetti', 180);
      } else if (e.t === 'boss' && !silent) { S.boss(); banner(CG.ENEMIES[e.type].name + ' قادم!', '', 1800); }
      else if (e.t === 'wave' && !silent) { S.wave(); if (world.wave > 1 || endless) banner('الموجة ' + world.wave, '', 1100); }
      else if (e.t === 'clear' && !silent) {
        S.clear(); shownCoins = world.coins;
        Kit.art.pop('+' + e.bonus, world.cake.x, world.cake.y - 86, { color: '#ffcc00', size: 28 }); bump('coins');
        if (endless && e.n > save.endless) { save.endless = e.n; persist(); }
      } else if (e.t === 'win' && !silent) {
        commitWin(e.stars); ending = { kind: 'win', t: 1.35 };
        banner('الكعكة بأمان!', '', 1300); Kit.art.flash('#fff4c2', 120);
        if (!calm()) for (let i = 0; i < 5; i++) poof(200 + i * 220, 180, ['#ff7eb6', '#ffcc00', '#6fd3ff', '#62d26f', '#fff'][i], 8, 'confetti', 260);
      } else if (e.t === 'lose' && !silent) {
        commitLose(); ending = { kind: 'lose', t: 1.15 };
      }
    }
    world.ev.length = 0;
  }

  /* --------------------------------------------------------------- loop */
  function updateFx(dt, silent) {
    fx.update(dt); Kit.art.shake.update(dt); Kit.art.pop.update(dt); cakeSpring.update(dt); Kit.art.flash.update(dt);
    for (let i = floats.length - 1; i >= 0; i--) { floats[i].t += dt; floats[i].y -= dt * 42; if (floats[i].t > 1) floats.splice(i, 1); }
    for (let i = rings.length - 1; i >= 0; i--) { rings[i].t += dt; if (rings[i].t > 0.34) rings.splice(i, 1); }
    for (let i = magCoins.length - 1; i >= 0; i--) {
      const m = magCoins[i]; m.t += dt * 2.2;
      if (m.t >= 1) {
        magCoins.splice(i, 1);
        shownCoins = Math.min(world.coins, shownCoins + m.v);
        if (!silent) { J.coin(1 + (magCoins.length % 5)); bump('coins'); }
      }
    }
    if (!magCoins.length && world) shownCoins = world.coins;
  }
  function update(dt) {
    handleKeys();
    if (screen === 'title' && world) {
      time += dt; demoT += dt;
      if (demoT > 0.7 && world.enemies.length) { demoT = 0; CG.blast(world); }
      CG.step(world, dt); handleEvents(true);
      if (world.phase === 'won' || world.phase === 'lost') begin(CG.LEVELS[nextLevel()], true);
      updateFx(dt, true); frameDirty = true;
    } else if (screen === 'play' && world) {
      time += dt;
      if (!ending) {
        if (firing && mouse.over && hoverPad < 0) CG.blast(world, mouse.x, mouse.y);
        for (let i = 0; i < speed && !ending; i++) { CG.step(world, dt); handleEvents(false); }
        busyT += dt; if (busyT >= 1) { busyT = 0; Kit.stats.busy(); }
        if (!acted && levelIdx === 0 && !endless) {
          idleT += dt;
          if (idleT > 3.5 && $('hint').hidden) showHint('انقر على الهلام لإطلاق الكريمة!');
        }
      } else if ((ending.t -= dt) <= 0) showResult();
      updateFx(dt * (ending ? 1 : speed), false);
      updateHUD();
    } else if (resultLock > 0) resultLock -= dt;
    Kit.keys.endFrame();
  }

  /* ------------------------------------------------------------- render */
  const pixelScale = () => Math.min(2, Math.max(0.5, Math.round(view.scale * view.dpr * 4) / 4));
  function ensureBg() {
    const tier = Kit.art.quality.tier, b = Math.round(view.scale * view.dpr * 4) / 4;
    const key = (endless ? 'e' : levelIdx) + '|' + world.def.w + '|' + world.roads[0].len + '|' + tier + '|' + b;
    if (bg && bgKey === key) return;
    const baked = Kit.art.bake(key, CG.W, CG.H, g => A.background(g, world)), src = baked && baked.canvas;
    bg = bg || document.createElement('canvas');
    const bw = src ? src.width : CG.W, bh = src ? src.height : CG.H;
    if (bg.width !== bw || bg.height !== bh) { bg.width = bw; bg.height = bh; }
    const g = bg.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, bw, bh);
    if (src) g.drawImage(src, 0, 0); bgKey = key;
  }
  function draw() {
    const ctx = view.ctx, w = world, still = calm();
    if (!w) return;
    ensureBg(); ctx.save(); Kit.art.shake.apply(ctx);
    ctx.drawImage(bg, 0, 0, CG.W, CG.H);
    const bestFree = screen === 'play' && w.coins >= CG.TOWERS.pop.lv[0].cost ? CG.bestPad(w) : -1;
    w.pads.forEach((p, i) => {
      if (p.tower) return;
      const st = i === hoverPad ? 'hover' : i === bestFree ? 'ok' : '';
      A.pad(ctx, p.x, p.y, st, still ? 0 : time);
    });
    if (hoverPad >= 0 && screen === 'play') {
      const p = w.pads[hoverPad];
      const rng = p.tower ? CG.towerLevel(p.tower).range : CG.TOWERS[activeType].lv[0].range;
      A.range(ctx, p.x, p.y, rng, true, still ? 0 : time);
    }
    A.cake(ctx, w.cake.x, w.cake.y, CG.CAKES[save.cake], w.hearts, time, still, pixelScale(), cakeSpring.sx, cakeSpring.sy);
    for (const b of w.enemies) A.blob(ctx, b, time, still);
    w.pads.forEach(p => { if (p.tower) A.tower(ctx, p.tower, p.x, p.y, time); });
    for (const s of w.shots) A.shot(ctx, s);
    for (const r of rings) {
      const a = 1 - r.t / 0.34, rad = r.r * (0.4 + r.t / 0.34 * 0.6);
      ctx.fillStyle = 'rgba(' + r.color + ',' + (0.18 * a) + ')'; ctx.strokeStyle = 'rgba(' + r.color + ',' + a + ')'; ctx.lineWidth = 4;
      A.circle(ctx, r.x, r.y, rad); ctx.fill(); ctx.stroke();
    }
    // Magnetized coins swooping to the top coin pill!
    for (const m of magCoins) {
      const k = Math.max(0, m.t);
      const x = k < 0.22 ? m.x + (m.sx - m.x) * (k / 0.22) : m.sx + (1080 - m.sx) * Math.pow((k - 0.22) / 0.78, 1.4);
      const y = k < 0.22 ? m.y + (m.sy - m.y) * (k / 0.22) : m.sy + (30 - m.sy) * Math.pow((k - 0.22) / 0.78, 1.4) - Math.sin(((k - 0.22) / 0.78) * Math.PI) * 60;
      A.coin(ctx, x, y, 10);
    }
    fx.draw(ctx);
    if (screen === 'play' && mouse.over && hoverPad < 0) A.reticle(ctx, mouse.x, mouse.y, time, w.blastCd <= 0, still);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    for (const f of floats) {
      ctx.globalAlpha = Math.max(0, 1 - Math.max(0, f.t - 0.55) / 0.45);
      ctx.font = '700 ' + f.size + 'px Fredoka';
      ctx.direction = /[\u0600-\u06FF]/.test(f.text) ? 'rtl' : 'ltr';
      ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(40,20,50,.8)'; ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1; ctx.direction = 'ltr';
    Kit.art.pop.draw(ctx); ctx.restore();
    if (Kit.art.quality.tier > 0) Kit.art.vignette(ctx, CG.W, CG.H, 0.18);
    Kit.art.flash.draw(ctx, CG.W, CG.H);
  }
  function render() {
    if (screen !== 'play' && screen !== 'title' && !frameDirty) return;
    frameDirty = false; draw();
  }

  canvas.addEventListener('contextrestored', () => { bgKey = ''; A.resetCaches(); A.warm(); frameDirty = true; });
  if (document.fonts && document.fonts.load) document.fonts.load('700 24px Fredoka', 'نَم+5').then(() => { frameDirty = true; }, () => {});

  window.__game = {
    get state() {
      return {
        screen, level: levelIdx, endless, phase: world ? world.phase : null,
        wave: world ? world.wave : 0, total: world ? world.total : 0,
        coins: world ? world.coins : 0, hearts: world ? world.hearts : 0,
        towers: world ? world.pads.filter(p => p.tower).length : 0,
        enemies: world ? world.enemies.length : 0, blasts: world ? world.blasts : 0,
        combo: world ? world.combo : 0, time: world ? +world.time.toFixed(3) : 0,
        speed, activeType, paused: screen === 'pause'
      };
    },
    get world() { return world; },
    save,
    get bestPad() { return world ? CG.bestPad(world) : -1; },
    padPoint: i => { const p = world.pads[i], r = canvas.getBoundingClientRect(); return { x: r.left + p.x * view.scale, y: r.top + p.y * view.scale }; },
    point: (lx, ly) => { const r = canvas.getBoundingClientRect(); return { x: r.left + lx * view.scale, y: r.top + ly * view.scale }; },
    start: i => startLevel(i),
    endless: () => startEndless(),
    give: n => { if (world) { world.coins += n; shownCoins = world.coins; refreshBar(); } },
    win: () => { if (screen === 'play' && world && !endless && !ending) { world.wave = world.total; world.queue = []; world.enemies = []; world.shots = []; world.phase = 'wave'; } },
    lose: () => { if (screen === 'play' && world && !ending) world.hearts = 0; }
  };

  Kit.muteButton();
  Kit.lifecycle({ pause, reset: () => { hoverPad = -1; firing = false; } });
  toTitle();
  Kit.art.loop(update, render);
  Kit.ready();
})();
