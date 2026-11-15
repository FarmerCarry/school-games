/* Juicy Drop (سلّة الفواكه): UI screens, pointer & keyboard aiming/dropping,
 * Combo Shake power, shop, saves, DDA, and anonymous play statistics.
 * engine.js owns pure 2D fruit physics & rules; art.js owns procedural canvas art. */
(function () {
  'use strict';

  const JD = window.JD, A = JD.art, J = Kit.juice, W = JD.W, H = JD.H;
  const $ = id => document.getElementById(id);
  const canvas = $('game'), ui = $('ui');
  const calm = () => Kit.motion.reduced();
  const clamp = Kit.clamp;

  let dirty = true;
  const view = Kit.fit(canvas, W, H, {
    maxDpr: 1.5,
    onResize: v => {
      ui.style.left = canvas.style.left;
      ui.style.top = canvas.style.top;
      ui.style.transform = 'scale(' + v.scale + ')';
      dirty = true;
    }
  });

  const fx = Kit.particles(), shake = Kit.shake();
  const pixelScale = () => clamp(Math.round(view.scale * view.dpr * 4) / 4, 0.5, 2);
  const KEYS_MENU_GO = ['Enter', 'NumpadEnter', 'Space'];
  const CELEBRATE_WIN = 1.25, CELEBRATE_OVER = 0.8;

  /* ---------------------------------------------------------------- Save */
  const store = Kit.store('juicy-drop');
  const saveStatus = Kit.saveStatus({ retry: persist });
  let save = JD.loadSave(store.get('save', null));

  function persist() {
    if (store.set('save', save) === false) { saveStatus.failed(); return false; }
    saveStatus.saved();
    return true;
  }

  const dda = Kit.dda('juicy-drop', { id: 'main', start: 0.3 });

  /* --------------------------------------------------------------- State */
  let screen = 'title', cur = 0, endless = false, world = null, time = 0, roundOpen = false;
  let celebrate = 0, result = null, resultT = 0, resultLock = 0, intro = 0;
  let rings = [], floats = [], aimX = null, dropReq = '', shakeReq = false, lastShakeKey = '';
  const ptr = { x: W / 2, y: H / 2, inside: false };

  const SCREENS = { title: 'scrTitle', map: 'scrMap', pause: 'scrPause', result: 'scrResult', shop: 'scrShop' };

  function setScreen(s) {
    screen = s;
    for (const k in SCREENS) $(SCREENS[k]).hidden = k !== s;
    $('hud').hidden = s !== 'play';
    dirty = true;
    if (s === 'play') focusGame();
  }

  function focusGame() {
    try { canvas.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }

  function say(msg) { $('live').textContent = msg; }
  function chip(id, val) { $(id).querySelector('b').textContent = String(val); }

  function wiggle(el) {
    el.classList.remove('wiggle');
    void el.offsetWidth;
    el.classList.add('wiggle');
    setTimeout(() => el.classList.remove('wiggle'), 480);
  }

  function refreshTitleChips() {
    chip('titleStars', JD.totalStars(save) + '/' + (JD.LEVELS.length * 3));
    chip('titleCoins', save.coins);
    chip('titleBest', save.bestEndless);
  }

  function toTitle() {
    leaveRound();
    refreshTitleChips();
    setScreen('title');
  }

  function playAdventure() {
    J.select();
    if (!JD.totalStars(save)) startStage(0);
    else toMap();
  }

  function playEndless() {
    J.select();
    startEndless();
  }

  /* ----------------------------------------------------------------- Map */
  const levelBtns = [], worldRows = [];
  function buildMap() {
    const box = $('worlds');
    JD.WORLDS.forEach((wd, wi) => {
      const row = document.createElement('div');
      row.className = 'wrow';
      row.style.setProperty('--wc', wd.color);
      row.innerHTML = '<div class="wname"><i>العالم ' + (wi + 1) + '</i><b>' + wd.name + '</b><small>' + wd.sub + '</small></div>';
      for (let k = 0; k < 4; k++) {
        const i = wi * 4 + k, L = JD.LEVELS[i];
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'jd-btn lvl';
        b.innerHTML = '<b>' + (k + 1) + '</b><em>' + L.name + '</em><span class="st">' + '<svg><use href="#i-star"/></svg>'.repeat(3) + '</span><svg class="lk" aria-hidden="true"><use href="#i-lock"/></svg>';
        on(b, () => pickLevel(i, b));
        row.appendChild(b);
        levelBtns.push(b);
      }
      box.appendChild(row);
      worldRows.push(row);
    });
  }

  function refreshMap() {
    const next = JD.nextLevel(save);
    levelBtns.forEach((b, i) => {
      const open = JD.isOpen(save, i), st = save.lv[i].s, L = JD.LEVELS[i];
      b.classList.toggle('locked', !open);
      b.classList.toggle('next', open && i === next);
      b.querySelectorAll('.st svg').forEach((s, k) => s.classList.toggle('on', k < st));
      b.setAttribute('aria-label', L.id + ' ' + L.name + (open ? '، ' + st + ' من 3 نجوم' : ' (مقفلة)'));
    });
    worldRows.forEach((r, wi) => r.classList.toggle('locked', !JD.isOpen(save, wi * 4)));
    chip('mapStars', JD.totalStars(save) + '/' + (JD.LEVELS.length * 3));
  }

  function toMap() {
    leaveRound();
    refreshMap();
    setScreen('map');
    J.whoosh(0.4);
  }

  function pickLevel(i, el) {
    if (!JD.isOpen(save, i)) { J.error(); wiggle(el); return; }
    J.select();
    startStage(i);
  }

  /* ---------------------------------------------------------------- Shop */
  const tiles = { jar: [], face: [] };
  function buildShop() {
    [['jar', JD.JARS, 'shelfJars'], ['face', JD.FACES, 'shelfFaces']].forEach(([kind, list, id]) => {
      list.forEach((item, k) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'jd-btn tile';
        b.innerHTML = '<canvas width="232" height="232"></canvas><b>' + item.name + '</b><span class="price"><i class="coin"></i><em>' + item.price + '</em></span>';
        on(b, () => buyItem(kind, k, b));
        $(id).appendChild(b);
        tiles[kind].push(b);
      });
    });
  }

  function drawTile(kind, k, c) {
    const g = c.getContext('2d');
    g.setTransform(2, 0, 0, 2, 0, 0);
    g.clearRect(0, 0, 116, 116);
    if (kind === 'jar') {
      const miniJar = { cx: 58, hw: 34, left: 24, right: 92, top: 26, bottom: 100 };
      A.jarBack(g, miniJar, k);
      A.fruit(g, 4, 43, 84, 15, { facePack: save.face, mood: 'happy' });
      A.fruit(g, 6, 72, 81, 18, { facePack: save.face, mood: 'happy' });
      A.fruit(g, 1, 56, 61, 12, { facePack: save.face });
      A.jarFront(g, miniJar, k, false, 0, 0, true);
    } else {
      const previewTiers = [5, 6, 7, 8, 9];
      A.glow(g, 58, 58, 52, JD.FRUITS[previewTiers[k]].glow, 0.48);
      A.fruit(g, previewTiers[k], 58, 60, 44, { facePack: k, mood: 'happy' });
    }
  }

  function refreshShop() {
    ['jar', 'face'].forEach(kind => {
      const own = kind === 'face' ? save.faces : save.jars;
      const wear = kind === 'face' ? save.face : save.jar;
      const list = kind === 'face' ? JD.FACES : JD.JARS;
      tiles[kind].forEach((b, k) => {
        drawTile(kind, k, b.querySelector('canvas'));
        b.classList.toggle('own', !!own[k]);
        b.classList.toggle('wear', wear === k);
        b.classList.toggle('poor', !own[k] && save.coins < list[k].price);
        b.setAttribute('aria-label', list[k].name + (wear === k ? ' (مُختار)' : own[k] ? '' : '، السعر ' + list[k].price));
      });
    });
    chip('shopCoins', save.coins);
  }

  function openShop() {
    leaveRound();
    J.select();
    refreshShop();
    setScreen('shop');
  }

  function buyItem(kind, k, el) {
    const did = JD.buy(save, kind, k);
    if (!did) { J.error(); wiggle(el); return; }
    persist();
    if (did === 'bought') {
      J.coin(3);
      J.levelUp();
      const r = el.getBoundingClientRect(), p = view.toLogical(r.left + r.width / 2, r.top + r.height / 3);
      fx.burst(p.x, p.y, { count: 28, colors: ['#ffd23f', '#ffffff', '#2ecc71', '#ff70a6'], speed: 320, life: 0.75, size: 8, gravity: 320 });
    } else {
      J.tap();
    }
    refreshShop();
    dirty = true;
  }

  /* --------------------------------------------------------------- Play */
  function params() {
    const E = JD.EASY, D = JD.HARD;
    return {
      jarWidthBonus: dda.value(E.jarWidthBonus, D.jarWidthBonus),
      mergeMagnet: dda.value(E.mergeMagnet, D.mergeMagnet),
      overflowGrace: dda.value(E.overflowGrace, D.overflowGrace),
      goalScale: dda.value(E.goalScale, D.goalScale)
    };
  }

  function beginWorld(modeOrLevel) {
    leaveRound();
    endless = modeOrLevel === 'endless';
    if (!endless) cur = modeOrLevel;
    const seed = ((Date.now() & 0x7fffffff) ^ ((cur + 1) * 2654435761)) >>> 0;
    world = JD.create(endless ? 'endless' : cur, params(), seed || 1337);
    roundOpen = true;
    resetPlayState();

    var rid = endless ? 'endless' : 'L' + (cur + 1);
    Kit.stats.round(rid);
    if (!save.coach) Kit.stats.tutorial('start');

    intro = 2.3;
    setScreen('play');
    syncShakeHud(true);
    J.whoosh(0.45);
    say(endless ? 'اللعب الحر' : (world.L.id + ' ' + world.L.name));
  }

  function startStage(i) { beginWorld(clamp(i | 0, 0, JD.LEVELS.length - 1)); }
  function startEndless() { beginWorld('endless'); }

  function resetPlayState() {
    fx.clear();
    rings = [];
    floats = [];
    celebrate = 0;
    result = null;
    aimX = null;
    dropReq = '';
    shakeReq = false;
    lastShakeKey = '';
    Kit.keys.reset();
  }

  function leaveRound() {
    if (roundOpen) {
      Kit.stats.end('quit');
      if (world && !world.done && world.mode === 'stage' && world.drops >= 5) {
        dda.result(JD.outcome(world));
      }
      roundOpen = false;
    }
  }

  function restartRound() {
    if (!world) return;
    J.select();
    if (endless) startEndless();
    else startStage(cur);
  }

  function pause(byUser) {
    if (screen !== 'play') return;
    aimX = null;
    dropReq = '';
    shakeReq = false;
    setScreen('pause');
    if (byUser) J.back();
  }

  function resume() {
    if (screen !== 'pause') return;
    J.select();
    aimX = null;
    dropReq = '';
    shakeReq = false;
    setScreen('play');
    Kit.keys.reset();
  }

  function requestShake() {
    if (screen !== 'play' || !world || world.done || celebrate > 0) return;
    if (world.shakeCharge < 100) {
      J.error();
      wiggle($('btnShake'));
      return;
    }
    shakeReq = true;
  }

  function syncShakeHud(force) {
    if (!world) return;
    const pct = Math.min(100, Math.floor(world.shakeCharge));
    const ready = pct >= 100 && !world.done;
    const key = pct + (ready ? ':R' : ':C');
    if (!force && key === lastShakeKey) return;
    lastShakeKey = key;
    const btn = $('btnShake'), em = $('shakePct');
    $('shakeFill').style.width = pct + '%';
    em.dir = ready ? 'rtl' : 'ltr';
    em.textContent = ready ? 'جاهز!' : pct + '%';
    btn.classList.toggle('ready', ready);
    btn.classList.toggle('ring', ready);
  }

  /* --------------------------------------------------- Round Completion */
  function finishStageWin() {
    const stars = JD.stars(world), before = save.lv[cur].s;
    const coins = JD.stageCoins(world, stars);
    const res = JD.applyStageResult(save, cur, stars, world.score, coins);
    if (!save.coach) { save.coach = true; Kit.stats.tutorial('done'); }
    persist();
    dda.result(JD.outcome(world));
    Kit.stats.end('win', world.score);
    roundOpen = false;

    result = {
      kind: 'win',
      stars: stars,
      before: before,
      score: world.score,
      drops: world.drops,
      parDrops: world.L.parDrops,
      coins: res.coins,
      best: res.best,
      world: res.world
    };
    celebrate = CELEBRATE_WIN;
    J.levelUp();
    if (!calm()) {
      for (let k = 0; k < 3; k++) {
        fx.burst(world.jar.cx + (k - 1) * 110, world.jar.top + 80, {
          count: 24,
          colors: ['#ffe033', '#2ecc71', '#ff3d6e', '#38bdf8', '#ffffff'],
          speed: 380,
          life: 1.0,
          size: 9,
          gravity: 360
        });
      }
    }
    shake.add(5);
  }

  function finishOverflow() {
    Kit.track.miss();
    J.fail();
    shake.add(10);

    if (world.mode === 'endless') {
      const coins = JD.endlessCoins(world);
      const res = JD.applyEndlessResult(save, world.score, world.drops, coins);
      if (!save.coach && world.drops > 0) { save.coach = true; Kit.stats.tutorial('done'); }
      if (res.best || res.coins > 0) persist();
      const eo = JD.endlessOutcome(world);
      if (eo !== null) dda.result(eo);
      Kit.stats.end('end', world.score);
      roundOpen = false;
      result = {
        kind: 'endless',
        stars: 0,
        before: 0,
        score: world.score,
        drops: world.drops,
        parDrops: 0,
        coins: res.coins,
        best: res.best,
        world: -1
      };
    } else {
      const coins = JD.stageCoins(world, 0);
      const res = JD.applyStageResult(save, cur, 0, world.score, coins);
      if (res.coins > 0 || res.best) persist();
      dda.result(JD.outcome(world));
      Kit.stats.end('lose', world.score);
      roundOpen = false;
      result = {
        kind: 'lose',
        stars: 0,
        before: save.lv[cur].s,
        score: world.score,
        drops: world.drops,
        parDrops: world.L.parDrops,
        coins: res.coins,
        best: false,
        world: -1
      };
    }
    celebrate = CELEBRATE_OVER;
  }

  function showResult() {
    const r = result;
    resultT = 0;
    resultLock = 0.45;

    if (r.kind === 'win') {
      $('resTitle').textContent = r.stars === 3 ? 'ممتاز!' : r.stars === 2 ? 'رائع!' : 'أحسنت!';
      $('resStars').hidden = false;
      $('resStars').querySelectorAll('svg').forEach((s, i) => {
        s.classList.toggle('on', i < Math.min(r.before, r.stars));
        s.classList.remove('pop');
      });
    } else if (r.kind === 'endless') {
      $('resTitle').textContent = r.best ? 'رقم قياسي جديد!' : 'انتهت الجولة!';
      $('resStars').hidden = true;
    } else {
      $('resTitle').textContent = 'فاضت السلّة! حاول مجدداً';
      $('resStars').hidden = true;
    }

    $('resScore').querySelector('b').textContent = String(r.score);
    if (r.kind === 'endless') {
      $('resDrops').querySelector('b').textContent = JD.FRUITS[world.highestTier].name;
      $('resDrops').classList.remove('good');
    } else {
      $('resDrops').querySelector('b').textContent = r.drops + ' / ' + r.parDrops;
      $('resDrops').classList.toggle('good', r.kind === 'win' && r.drops <= r.parDrops);
    }

    $('resCoins').querySelector('b').textContent = '+' + r.coins;
    $('resCoins').hidden = r.coins <= 0 && r.kind === 'lose';
    $('resBest').hidden = !r.best;
    $('resWorld').hidden = r.world < 0;

    const showNext = r.kind === 'win' && cur + 1 < JD.LEVELS.length;
    $('resNext').hidden = !showNext;
    $('resAgain').classList.toggle('ring', !showNext);
    $('resMap').hidden = r.kind === 'endless';

    say($('resTitle').textContent);
    setScreen('result');
  }

  function resultStep(dt) {
    const r = result, before = resultT;
    resultT += dt;
    const at = t => before < t && resultT >= t;
    if (r.kind === 'win') {
      const startIdx = Math.min(r.before, r.stars);
      for (let i = startIdx; i < r.stars; i++) {
        if (at(0.3 + (i - startIdx) * 0.36)) {
          const s = $('resStars').children[i];
          s.classList.add('on', 'pop');
          J.star(i + 1);
          fx.burst(552 + i * 102, 248, { count: 16, colors: ['#ffd23f', '#ffffff'], speed: 280, life: 0.65, size: 8, gravity: 300 });
        }
      }
      const late = 0.45 + Math.max(0, r.stars - startIdx) * 0.36;
      if (at(late)) {
        if (r.best) J.chime(2);
        if (r.world >= 0) J.levelUp();
        if (r.coins > 0) J.coin(Math.min(5, r.coins));
      }
    } else if (at(0.35) && r.coins > 0) {
      J.coin(Math.min(5, r.coins));
    }
  }

  function resultPrimary() {
    if (!result || resultLock > 0) return;
    if (result.kind === 'win' && cur + 1 < JD.LEVELS.length) {
      J.select();
      startStage(cur + 1);
    } else {
      restartRound();
    }
  }

  function resultAgain() {
    if (!result || resultLock > 0) return;
    restartRound();
  }

  /* --------------------------------------------------------------- Input */
  function on(el, fn) {
    el.addEventListener('pointerdown', e => e.stopPropagation());
    el.addEventListener('click', e => {
      e.stopPropagation();
      if (e.detail > 1) return;
      Kit.audio.unlock();
      if (e.detail > 0) { el.blur(); focusGame(); }
      fn(e);
    });
  }

  on($('btnPlay'), playAdventure);
  on($('btnEndless'), playEndless);
  on($('btnLevels'), () => { J.select(); toMap(); });
  on($('btnShop'), openShop);
  on($('mapHome'), () => { J.back(); toTitle(); });
  on($('shopBack'), () => { J.back(); toTitle(); });
  on($('btnPause'), () => pause(true));
  on($('btnShake'), requestShake);
  on($('btnResume'), resume);
  on($('btnRestart'), restartRound);
  on($('btnMap'), () => { J.back(); toMap(); });
  on($('btnPauseHome'), () => { J.back(); toTitle(); });
  on($('resNext'), resultPrimary);
  on($('resAgain'), resultAgain);
  on($('resMap'), () => { if (resultLock <= 0) { J.back(); toMap(); } });
  on($('resHome'), () => { if (resultLock <= 0) { J.back(); toTitle(); } });

  const toLogical = e => view.toLogical(e.clientX, e.clientY);
  const inFrame = p => p.x >= 0 && p.x <= W && p.y >= 0 && p.y <= H;

  window.addEventListener('pointermove', e => {
    const p = toLogical(e);
    ptr.x = p.x;
    ptr.y = p.y;
    ptr.inside = inFrame(p);
    if (screen === 'play' && world && !world.done && !celebrate && ptr.inside) {
      // Only track pointer horizontal aim when over/above the jar area so moving toward
      // side HUD buttons never yanks the cloud unexpectedly.
      if (p.x >= world.jar.left - 80 && p.x <= world.jar.right + 80 && p.y >= 40) {
        aimX = p.x;
      }
    }
  });

  canvas.addEventListener('pointerdown', e => {
    focusGame();
    if (e.button !== 0) return;
    const p = toLogical(e);
    ptr.x = p.x;
    ptr.y = p.y;
    ptr.inside = inFrame(p);
    if (screen === 'play' && world && !world.done && !celebrate && ptr.inside) {
      aimX = p.x;
      dropReq = 'pointer';
    }
  });

  function handleKeys() {
    const K = Kit.keys, menuGo = K.anyPressed(KEYS_MENU_GO);
    if (screen === 'title') {
      if (menuGo) playAdventure();
    } else if (screen === 'map') {
      if (menuGo) { J.select(); startStage(JD.nextLevel(save)); }
      else if (K.pressed('Escape')) { J.back(); toTitle(); }
    } else if (screen === 'shop') {
      if (K.pressed('Escape')) { J.back(); toTitle(); }
    } else if (screen === 'play') {
      if (K.anyPressed(['KeyP', 'Escape'])) { pause(true); return; }
      if (K.pressed('KeyR') && !celebrate) { restartRound(); return; }
      if (K.anyPressed(['KeyS', 'ArrowDown'])) requestShake();
      if (K.anyPressed(['Space', 'Enter', 'NumpadEnter']) && !celebrate) dropReq = 'key';
    } else if (screen === 'pause') {
      if (K.anyPressed(['KeyP', 'Escape', 'Enter', 'NumpadEnter', 'Space'])) resume();
      else if (K.pressed('KeyR')) restartRound();
    } else if (screen === 'result' && resultLock <= 0) {
      if (menuGo) resultPrimary();
      else if (K.pressed('KeyR')) resultAgain();
      else if (K.pressed('Escape')) { J.back(); if (endless) toTitle(); else toMap(); }
    }
  }

  /* -------------------------------------------------------------- Events */
  function addFloat(x, y, txt, color, size) {
    floats.push({ x: x, y: y, txt: txt, color: color || '#ffffff', size: size || 30, t: 0 });
    if (floats.length > 14) floats.shift();
  }

  function handleWorldEvents() {
    for (let i = 0; i < world.ev.length; i++) {
      const e = world.ev[i];
      switch (e.t) {
        case 'drop':
          J.pop(0.35);
          if (!save.coach) { save.coach = true; Kit.stats.tutorial('done'); }
          break;
        case 'land':
          if (e.power > 0.25) J.land(e.power * 0.42);
          break;
        case 'merge': {
          Kit.track.hit();
          J.streak(Math.min(12, e.combo || 1));
          const spec = JD.FRUITS[Math.min(JD.FRUITS.length - 1, e.toTier)];
          if (!calm()) {
            rings.push({ x: e.x, y: e.y, r: spec.r * 0.6, maxR: spec.r * 1.9, color: spec.glow, t: 0 });
            fx.burst(e.x, e.y, {
              count: 14 + Math.min(14, e.tier * 2),
              colors: [spec.color, spec.glow, '#ffffff', '#ffe033'],
              speed: 240 + e.tier * 18,
              life: 0.6,
              size: 7,
              gravity: 340
            });
            shake.add(Math.min(7.5, 2 + e.tier * 0.55));
          }
          addFloat(e.x, e.y - 18, '+' + e.points, '#fff3a8', 30);
          if (e.combo >= 2) {
            addFloat(e.x, e.y - 52, 'كومبو ×' + e.combo + '!', '#8dff7a', 34);
          }
          break;
        }
        case 'watermelon_boom':
          J.levelUp();
          J.coin(5);
          if (!calm()) {
            for (let b = 0; b < 3; b++) {
              fx.burst(e.x, e.y, {
                count: 32,
                colors: ['#2ecc71', '#ff3d6e', '#ffe033', '#ffffff'],
                speed: 440,
                life: 1.05,
                size: 10,
                gravity: 340
              });
            }
            rings.push({ x: e.x, y: e.y, r: 40, maxR: 230, color: '#2ecc71', t: 0 });
            shake.add(12);
          }
          addFloat(e.x, e.y - 36, 'بطيخة عملاقة! +' + e.bonus, '#ffe033', 40);
          break;
        case 'melt':
          J.chime(e.freed ? 2 : 1);
          if (!calm()) {
            fx.burst(e.x, e.y, { count: 16, colors: ['#e0f2fe', '#7dd3fc', '#ffffff'], speed: 250, life: 0.55, size: 7, gravity: 320 });
          }
          addFloat(e.x, e.y - 24, e.freed ? 'ذاب الثلج!' : 'تشقّق!', '#bae6fd', 28);
          break;
        case 'honey_pop':
          J.pop(0.75);
          J.coin(1);
          if (!calm()) {
            fx.burst(e.x, e.y, { count: 14, colors: ['#fef08a', '#fbbf24', '#ffffff'], speed: 210, life: 0.5, size: 6, gravity: 200 });
          }
          addFloat(e.x, e.y - 20, '+15', '#fde68a', 26);
          break;
        case 'shake':
          J.jump(0.85);
          J.whoosh(0.6);
          if (!calm()) {
            shake.add(9);
            fx.burst(world.jar.left + 20, world.jar.bottom - 80, { count: 14, colors: ['#ffe033', '#ffffff'], speed: 240, life: 0.5, size: 7, gravity: 240 });
            fx.burst(world.jar.right - 20, world.jar.bottom - 80, { count: 14, colors: ['#ffe033', '#ffffff'], speed: 240, life: 0.5, size: 7, gravity: 240 });
          }
          addFloat(world.jar.cx, world.jar.top + 40, 'هزّة مرحة!', '#ffe033', 34);
          break;
        case 'warn':
          J.countdown(2);
          break;
        case 'win':
          finishStageWin();
          break;
        case 'overflow':
          finishOverflow();
          break;
      }
    }
    world.ev.length = 0;
  }

  /* ---------------------------------------------------------------- Loop */
  function playStep(dt) {
    if (celebrate > 0) {
      JD.step(world, dt, {});
      world.ev.length = 0;
      aimX = null;
      dropReq = '';
      shakeReq = false;
      celebrate -= dt;
      if (celebrate <= 0) showResult();
      syncShakeHud(false);
      return;
    }

    const K = Kit.keys;
    const move = (K.anyDown(['ArrowRight', 'KeyD']) ? 1 : 0) - (K.anyDown(['ArrowLeft', 'KeyA']) ? 1 : 0);
    if (move !== 0) aimX = null;

    const inp = {
      x: aimX,
      move: move,
      drop: !!dropReq,
      dropKind: dropReq || 'pointer',
      shake: shakeReq
    };
    aimX = null;
    dropReq = '';
    shakeReq = false;

    JD.step(world, dt, inp);
    handleWorldEvents();
    syncShakeHud(false);
    if (intro > 0) intro = Math.max(0, intro - dt);
  }

  function decayFx(dt) {
    for (let i = rings.length - 1; i >= 0; i--) {
      rings[i].t += dt;
      if (rings[i].t >= 0.36) rings.splice(i, 1);
    }
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i];
      f.t += dt;
      if (!calm()) f.y -= dt * 42;
      if (f.t >= 1.1) floats.splice(i, 1);
    }
  }

  function update(dt) {
    handleKeys();
    if (screen !== 'pause') {
      time += dt;
      if (screen === 'play' && world) playStep(dt);
      fx.update(dt);
      shake.update(dt);
      decayFx(dt);
      if (screen === 'result' && result) resultStep(dt);
      if (resultLock > 0) resultLock = Math.max(0, resultLock - dt);
    }
    Kit.keys.endFrame();
  }

  /* -------------------------------------------------------------- Render */
  function drawHud(ctx, still) {
    const wd = JD.WORLDS[world.L.world];
    const x0 = 398, pw = 484, rx = x0 + pw;
    A.rr(ctx, x0, 6, pw, 48, 24);
    ctx.fillStyle = 'rgba(20, 14, 42, 0.84)';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = endless ? '#38bdf8' : wd.color;
    ctx.stroke();

    if (endless) {
      A.rr(ctx, rx - 144, 11, 136, 38, 19);
      ctx.fillStyle = '#38bdf8';
      ctx.fill();
      A.text(ctx, 'اللعب الحر', rx - 76, 30, 23, A.INK, { stroke: false });
      A.text(ctx, 'النقاط: ' + world.score, x0 + 258, 30, 25, '#ffffff', { stroke: false });
      A.text(ctx, 'رميات: ' + world.drops, x0 + 92, 30, 21, '#ffd166', { stroke: false });
    } else {
      A.rr(ctx, rx - 94, 11, 86, 38, 19);
      ctx.fillStyle = wd.color;
      ctx.fill();
      A.text(ctx, world.L.id, rx - 51, 30, 25, A.INK, { stroke: false, dir: 'ltr' });
      A.text(ctx, world.L.name, rx - 110, 30, 24, '#ffffff', { align: 'right', stroke: false });
      const parOk = world.drops <= world.L.parDrops;
      A.text(ctx, world.drops + '/' + world.L.parDrops, x0 + 78, 30, 24, parOk ? '#8dff7a' : '#ffd166', { dir: 'ltr', stroke: false });
    }

    if (intro > 0 && !world.done) {
      const alpha = clamp(Math.min(intro / 0.4, (2.3 - intro) / 0.25 + 0.2), 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      const by = 198 + (still ? 0 : Math.max(0, intro - 2.0) * 32);
      A.rr(ctx, 430, by - 28, 420, 56, 28);
      ctx.fillStyle = 'rgba(20, 14, 42, 0.88)';
      ctx.fill();
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = endless ? '#38bdf8' : wd.color;
      ctx.stroke();
      A.text(ctx, world.L.desc, 640, by, 26, '#ffe169', { stroke: false });
      ctx.restore();
    } else if (!save.coach && world.drops === 0 && !world.done && world.t > 0.6) {
      const bob = still ? 0 : Math.sin(time * 4.5) * 4;
      ctx.save();
      A.rr(ctx, 456, 220 + bob, 368, 52, 26);
      ctx.fillStyle = 'rgba(20, 14, 42, 0.85)';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#8dff7a';
      ctx.stroke();
      A.text(ctx, 'انقر أو اضغط مسافة لإفلات الفاكهة!', 640, 246 + bob, 23, '#ffffff', { stroke: false });
      ctx.restore();
    }
  }

  function drawWorld(ctx) {
    const still = calm(), ps = pixelScale();
    ctx.drawImage(A.backdrop(world.L.world, ps), 0, 0, W, H);

    A.evolutionRing(ctx, world.seen, save.face, time, still);
    A.rightPanels(ctx, world, save.bestEndless, save.face, time, still);

    // Cheerful Combo Shake jiggle around the jar & its fruits!
    ctx.save();
    if (world.shakeAnim > 0 && !still) {
      const p = world.shakeAnim / 0.55;
      const jx = Math.sin(time * 54) * 10 * p;
      const jy = -Math.abs(Math.cos(time * 42)) * 8 * p;
      ctx.translate(jx, jy);
    }

    A.jarBack(ctx, world.jar, save.jar);
    A.cloud(ctx, world, save.face, time, still);

    for (let i = 0; i < world.ices.length; i++) {
      A.iceCube(ctx, world.ices[i], save.face, time, still);
    }

    for (let i = 0; i < world.fruits.length; i++) {
      const f = world.fruits[i];
      let mood = 'normal';
      if (!f.landed && f.age < 0.45) mood = 'drop';
      else if (world.warning && f.y - f.r < world.jar.top + 48) mood = 'warn';
      else if (f.excited > 0 || f.popScale < 0.96 || world.won) mood = 'excited';
      else if (f.tier >= 7) mood = 'happy';

      let sqX = 1, sqY = 1;
      if (!still && f.popScale < 1) {
        const b = Math.sin(f.popScale * Math.PI);
        sqX = 1 + b * 0.14;
        sqY = 1 - b * 0.1;
      }
      const lx = (world.cloudX - f.x) / 260;
      const ly = f.landed ? -0.3 : 0.45;
      A.fruit(ctx, f.tier, f.x, f.y, f.r, {
        facePack: save.face,
        mood: mood,
        rot: f.rot,
        scale: still ? 1 : f.popScale,
        squashX: sqX,
        squashY: sqY,
        lx: lx,
        ly: ly
      });
    }

    for (let i = 0; i < world.bubbles.length; i++) {
      A.honeyBubble(ctx, world.bubbles[i], time, still);
    }

    for (let i = 0; i < rings.length; i++) {
      const rg = rings[i], k = rg.t / 0.36;
      A.circle(ctx, rg.x, rg.y, rg.r + (rg.maxR - rg.r) * k);
      ctx.lineWidth = 6 * (1 - k) + 1;
      ctx.strokeStyle = A.rgba(rg.color, Math.max(0, 1 - k));
      ctx.stroke();
    }

    A.jarFront(ctx, world.jar, save.jar, world.warning, world.overTime, time, still);
    ctx.restore();

    fx.draw(ctx);
    for (let i = 0; i < floats.length; i++) {
      const fl = floats[i];
      ctx.save();
      ctx.globalAlpha = clamp(1 - Math.max(0, fl.t - 0.65) / 0.45, 0, 1);
      A.text(ctx, fl.txt, fl.x, fl.y, fl.size, fl.color);
      ctx.restore();
    }

    drawHud(ctx, still);
  }

  const TITLE_PARADE = [
    { tier: 0, x: 96, r: 20 },
    { tier: 1, x: 158, r: 25 },
    { tier: 3, x: 234, r: 34 },
    { tier: 4, x: 332, r: 40 },
    { tier: 9, x: 1150, r: 70 },
    { tier: 7, x: 1022, r: 48 },
    { tier: 5, x: 924, r: 38 },
    { tier: 2, x: 846, r: 26 }
  ];

  function drawMenu(ctx) {
    const still = calm(), ps = pixelScale();
    const wdIdx = screen === 'map' ? Math.floor(JD.nextLevel(save) / 4) : 0;
    ctx.drawImage(A.backdrop(wdIdx, ps), 0, 0, W, H);
    if (screen === 'title') {
      for (let i = 0; i < TITLE_PARADE.length; i++) {
        const p = TITLE_PARADE[i];
        const hop = still ? 0 : Math.abs(Math.sin(time * 2.8 + i * 0.9)) * 10;
        A.fruit(ctx, p.tier, p.x, JD.FLOOR_Y + 4 - p.r - hop, p.r, {
          facePack: save.face,
          mood: i === 4 ? 'excited' : 'happy',
          lx: p.x < 640 ? 0.5 : -0.5,
          ly: -0.2
        });
      }
    }
    fx.draw(ctx);
  }

  function render() {
    if (screen === 'pause' && !dirty) return;
    dirty = false;
    const ctx = view.ctx;
    ctx.save();
    ctx.translate(shake.x, shake.y);
    if (world && (screen === 'play' || screen === 'pause' || screen === 'result')) drawWorld(ctx);
    else drawMenu(ctx);
    ctx.restore();
  }

  canvas.addEventListener('contextrestored', () => {
    A.reset();
    dirty = true;
    if (screen === 'shop') refreshShop();
  });

  if (document.fonts && document.fonts.load) {
    document.fonts.load('700 40px Fredoka', 'سلّة 5').then(() => {
      dirty = true;
      if (screen === 'shop') refreshShop();
    }, () => { /* fallback fonts */ });
  }

  /* --------------------------------------------------- Test & Debug Hook */
  const pagePoint = (x, y) => {
    const r = canvas.getBoundingClientRect();
    return { x: r.left + x * view.scale, y: r.top + y * view.scale };
  };
  const r1 = v => Math.round(v * 10) / 10;

  window.__game = {
    get state() {
      const w = world;
      return {
        screen: screen,
        paused: screen === 'pause',
        mode: w ? w.mode : (endless ? 'endless' : 'stage'),
        level: cur,
        id: w ? w.L.id : '',
        time: w ? Math.round(w.t * 1000) / 1000 : 0,
        cloudX: w ? r1(w.cloudX) : JD.CX,
        drops: w ? w.drops : 0,
        merges: w ? w.merges : 0,
        fruits: w ? w.fruits.length : 0,
        ices: w ? w.ices.length : 0,
        bubbles: w ? w.bubbles.length : 0,
        score: w ? w.score : 0,
        shakeCharge: w ? Math.round(w.shakeCharge) : 0,
        shakesUsed: w ? w.shakesUsed : 0,
        combo: w ? w.combo : 0,
        currentTier: w ? w.currentTier : 0,
        nextTier: w ? w.nextTier : 0,
        warning: !!(w && w.warning),
        done: !!(w && w.done),
        won: !!(w && w.won),
        over: !!(w && w.over),
        celebrate: celebrate > 0,
        stars: result ? result.stars : 0,
        fx: fx.list.length,
        shake: shake.power,
        tier: dda.tier
      };
    },
    get save() { return JSON.parse(JSON.stringify(save)); },
    get world() { return world; },
    point: pagePoint
  };

  buildMap();
  buildShop();
  Kit.muteButton();
  Kit.lifecycle({
    pause: () => pause(false),
    reset: () => { aimX = null; dropReq = ''; shakeReq = false; }
  });
  toTitle();
  Kit.loop(update, render);
  Kit.ready();
})();
