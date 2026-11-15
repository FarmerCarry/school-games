/* Splat Catapult (مقلاع الألوان): UI screens, mouse slingshot drag & mid-air click,
 * full keyboard controls via Kit.keys, 2-player hotseat fort duel, shop, DDA, and SFX. */
(function () {
  'use strict';
  const A = SC.art, J = Kit.juice, W = SC.W, H = SC.H;
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
  const KEYS_GO = ['Enter', 'NumpadEnter', 'Space'];
  const CELEBRATE = 1.15;

  /* ---------------------------------------------------------------- save */
  const store = Kit.store('splat-catapult');
  const saveStatus = Kit.saveStatus({ retry: persist });
  let save = SC.loadSave(store.get('save', null));
  function persist() {
    if (store.set('save', save) === false) { saveStatus.failed(); return false; }
    saveStatus.saved();
    return true;
  }
  const dda = Kit.dda('splat-catapult', { id: 'main', start: 0.3 });

  /* --------------------------------------------------------------- state */
  let screen = 'title', mode = 'solo', cur = 0, world = null, time = 0, roundActive = false;
  let celebrate = 0, result = null, resultT = 0, resultLock = 0, intro = 0, turnBanner = 0;
  let dragging = false, pullDist = 0, kbCharging = false, kbChargeDir = 1;
  let trail = [], floats = [], rings = [], trailTick = 0;
  const coach = { idle: 0, on: false, t: 0 };
  const ptr = { x: W / 2, y: H / 2, inside: false, down: false };
  const titleWorld = SC.createLevel(0, SC.NEUTRAL);
  titleWorld.blocks.forEach(b => { b.x += 285; });
  titleWorld.bots.forEach(b => { b.x += 285; });

  /* ------------------------------------------------------------ screens */
  const SCREENS = { title: 'scrTitle', map: 'scrMap', pause: 'scrPause', result: 'scrResult', shop: 'scrShop' };
  function setScreen(name) {
    screen = name;
    for (const k in SCREENS) $(SCREENS[k]).hidden = k !== name;
    $('hud').hidden = name !== 'play';
    dirty = true;
    setCursor('');
    if (name === 'play') focusGame();
  }
  function focusGame() { try { canvas.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  function say(txt) { $('live').textContent = txt; }
  function chip(id, val) { $(id).querySelector('b').textContent = String(val); }
  let curClass = '';
  function setCursor(c) { if (c !== curClass) { curClass = c; canvas.className = c; } }
  function wiggle(el) {
    el.classList.remove('wiggle');
    void el.offsetWidth;
    el.classList.add('wiggle');
    setTimeout(() => el.classList.remove('wiggle'), 500);
  }

  function leaveRound() {
    if (roundActive) {
      Kit.stats.end('quit');
      if (mode === 'solo' && world && world.shots > 0) {
        dda.result(SC.outcome(false, 0, world.shots));
      }
      roundActive = false;
    }
    dragging = false;
    kbCharging = false;
  }

  function toTitle() {
    leaveRound();
    chip('titleStars', SC.totalStars(save) + '/' + (SC.LEVELS.length * 3));
    chip('titleCoins', save.coins);
    setScreen('title');
  }

  function play() {
    J.select();
    if (!SC.totalStars(save)) startSolo(0);
    else toMap();
  }

  /* ---------------------------------------------------------------- map */
  const levelBtns = [], rows = [];
  function buildMap() {
    const box = $('worlds');
    SC.WORLDS.forEach((wd, wi) => {
      const row = document.createElement('div');
      row.className = 'wrow';
      row.style.setProperty('--wc', wd.color);
      row.innerHTML = '<div class="wname"><i>العالم ' + (wi + 1) + '</i><b>' + wd.name + '</b></div>';
      for (let k = 0; k < 4; k++) {
        const i = wi * 4 + k, b = document.createElement('button');
        b.type = 'button';
        b.className = 'sc-btn lvl';
        b.innerHTML = '<b>' + (k + 1) + '</b><span class="st">' + '<svg><use href="#i-star"/></svg>'.repeat(3) + '</span><svg class="lk" aria-hidden="true"><use href="#i-lock"/></svg>';
        on(b, () => pickLevel(i, b));
        row.appendChild(b);
        levelBtns.push(b);
      }
      box.appendChild(row);
      rows.push(row);
    });
  }

  function refreshMap() {
    const next = SC.nextLevel(save);
    levelBtns.forEach((b, i) => {
      const open = SC.isOpen(save, i), st = save.lv[i].s, L = SC.LEVELS[i];
      b.classList.toggle('locked', !open);
      b.classList.toggle('next', open && i === next);
      b.querySelectorAll('.st svg').forEach((s, k) => s.classList.toggle('on', k < st));
      b.setAttribute('aria-label', L.id + ' ' + L.name + (open ? '، ' + st + ' من 3 نجوم' : ' (مقفلة)'));
    });
    rows.forEach((r, wi) => r.classList.toggle('locked', !SC.isOpen(save, wi * 4)));
    chip('mapStars', SC.totalStars(save) + '/' + (SC.LEVELS.length * 3));
  }

  function toMap() {
    leaveRound();
    refreshMap();
    setScreen('map');
    J.whoosh(0.4);
  }

  function pickLevel(i, el) {
    if (!SC.isOpen(save, i)) { J.error(); wiggle(el); return; }
    J.select();
    startSolo(i);
  }

  /* ---------------------------------------------------------------- shop */
  const tiles = { skin: [], frame: [] };
  function buildShop() {
    [['skin', SC.SKINS, 'shelfSkins'], ['frame', SC.FRAMES, 'shelfFrames']].forEach(([kind, list, id]) => {
      list.forEach((item, k) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'sc-btn tile';
        b.innerHTML = '<canvas width="236" height="236"></canvas><b>' + item.name + '</b><span class="price"><i class="coin"></i><em>' + item.price + '</em></span>';
        on(b, () => buyItem(kind, k, b));
        $(id).appendChild(b);
        tiles[kind].push(b);
      });
    });
  }

  function drawShopTile(kind, k, c) {
    const g = c.getContext('2d');
    g.setTransform(2, 0, 0, 2, 0, 0);
    g.clearRect(0, 0, 118, 118);
    if (kind === 'skin') {
      A.glow(g, 59, 58, 44, SC.SKINS[k].tint, 0.5);
      A.balloon(g, 'classic', 59, 56, 30, k, {});
    } else {
      const fr = SC.FRAMES[k];
      g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath(); g.moveTo(59, 102); g.lineTo(59, 64); g.lineTo(40, 32);
      g.moveTo(59, 64); g.lineTo(78, 32);
      g.lineWidth = 17; g.strokeStyle = A.INK; g.stroke();
      g.lineWidth = 10; g.strokeStyle = fr.c0; g.stroke();
      g.beginPath(); g.moveTo(40, 34); g.lineTo(59, 48); g.lineTo(78, 34);
      g.lineWidth = 6; g.strokeStyle = fr.band; g.stroke();
      A.balloon(g, 'classic', 59, 44, 15, save.skin, { noFace: true });
    }
  }

  function refreshShop() {
    ['skin', 'frame'].forEach(kind => {
      const own = kind === 'frame' ? save.frames : save.skins;
      const wear = kind === 'frame' ? save.frame : save.skin;
      const list = kind === 'frame' ? SC.FRAMES : SC.SKINS;
      tiles[kind].forEach((b, k) => {
        drawShopTile(kind, k, b.querySelector('canvas'));
        b.classList.toggle('own', !!own[k]);
        b.classList.toggle('wear', wear === k);
        b.classList.toggle('poor', !own[k] && save.coins < list[k].price);
        b.setAttribute('aria-label', list[k].name + (wear === k ? ' (مختار)' : own[k] ? '' : '، السعر ' + list[k].price));
      });
    });
    chip('shopCoins', save.coins);
  }

  function openShop() {
    J.select();
    refreshShop();
    setScreen('shop');
  }

  function buyItem(kind, k, el) {
    const did = SC.buy(save, kind, k);
    if (!did) { J.error(); wiggle(el); return; }
    persist();
    if (did === 'bought') {
      J.coin(3);
      J.levelUp();
      if (!calm()) {
        const r = el.getBoundingClientRect(), p = view.toLogical(r.left + r.width / 2, r.top + r.height / 3);
        fx.burst(p.x, p.y, { count: 26, colors: ['#ffd23f', '#ffffff', '#ff4d8d', '#24c8ff'], speed: 320, life: 0.75, size: 8, gravity: 300 });
      }
    } else {
      J.tap();
    }
    refreshShop();
    dirty = true;
  }

  /* --------------------------------------------------------- round start */
  function ddaParams() {
    const E = SC.EASY, D = SC.HARD;
    return {
      arcDots: Math.round(dda.value(E.arcDots, D.arcDots)),
      hitRadiusBonus: dda.value(E.hitRadiusBonus, D.hitRadiusBonus),
      botHpScale: dda.value(E.botHpScale, D.botHpScale),
      windScale: dda.value(E.windScale, D.windScale)
    };
  }

  function resetEffects() {
    fx.clear();
    trail = []; floats = []; rings = []; trailTick = 0;
    celebrate = 0; result = null;
    dragging = false; pullDist = 0; kbCharging = false; kbChargeDir = 1;
    coach.idle = 0; coach.on = false; coach.t = 0;
    Kit.keys.reset();
  }

  function startSolo(i) {
    leaveRound();
    mode = 'solo';
    cur = clamp(i | 0, 0, SC.LEVELS.length - 1);
    world = SC.createLevel(cur, ddaParams());
    resetEffects();
    var rid = mode === 'duel' ? 'duel' : 'L' + (cur + 1);
    Kit.stats.round(rid);
    roundActive = true;
    if (!save.coach) Kit.stats.tutorial('start');
    intro = 2.4;
    turnBanner = 0;
    setScreen('play');
    J.whoosh(0.45);
    say(world.id + ' ' + world.name);
  }

  function startDuel() {
    leaveRound();
    mode = 'duel';
    cur = 0;
    world = SC.createDuel();
    resetEffects();
    var rid = mode === 'duel' ? 'duel' : 'L' + (cur + 1);
    Kit.stats.round(rid);
    roundActive = true;
    intro = 2.2;
    turnBanner = 1.8;
    setScreen('play');
    J.whoosh(0.5);
    say('مواجهة اثنين، دور اللاعب 1');
  }

  function restart() {
    if (!world) return;
    J.select();
    if (mode === 'duel') startDuel();
    else startSolo(cur);
  }

  function pause(own) {
    if (screen !== 'play') return;
    dragging = false;
    kbCharging = false;
    ptr.down = false;
    setScreen('pause');
    if (own) J.back();
  }

  function resume() {
    if (screen !== 'pause') return;
    J.select();
    dragging = false;
    kbCharging = false;
    setScreen('play');
    Kit.keys.reset();
  }

  /* --------------------------------------------------------- round end */
  function finishSoloWin(e) {
    const stars = e.stars, before = save.lv[cur].s;
    const res = SC.applyResult(save, cur, stars, e.score, e.coins);
    if (!save.coach) { save.coach = true; Kit.stats.tutorial('done'); }
    persist();
    dda.result(SC.outcome(true, stars, world.shots));
    Kit.stats.end('win', stars);
    roundActive = false;
    result = { kind: 'win', stars: stars, before: before, res: res, score: e.score, left: e.left, coins: res.coins };
    celebrate = CELEBRATE;
    J.levelUp();
    if (!calm()) {
      for (let k = 0; k < 3; k++) {
        fx.burst(540 + k * 140, 260, { count: 24, colors: ['#ffd23f', '#ff4d8d', '#3ddc84', '#24c8ff', '#ffffff'], speed: 380, life: 1.0, size: 8, gravity: 340 });
      }
      shake.add(5);
    }
  }

  function finishSoloLose(e) {
    dda.result(SC.outcome(false, 0, world.shots));
    Kit.stats.end('lose', 0);
    roundActive = false;
    result = { kind: 'lose', stars: 0, before: save.lv[cur].s, res: { best: false, world: -1, coins: 0 }, score: e.score, left: 0, coins: 0 };
    celebrate = 0.65;
    J.fail();
  }

  function finishDuel(e) {
    Kit.stats.end('end');
    roundActive = false;
    result = { kind: 'duel', winner: e.winner, stars: 0, before: 0, res: { best: false, world: -1, coins: 0 } };
    celebrate = CELEBRATE;
    J.levelUp();
    if (!calm()) {
      const cx = e.winner === 1 ? 320 : 960;
      fx.burst(cx, 300, { count: 36, colors: ['#ffd23f', '#ff4d8d', '#38bdf8', '#ffffff'], speed: 420, life: 1.0, size: 9, gravity: 330 });
      shake.add(6);
    }
  }

  function showResult() {
    const r = result;
    resultT = 0;
    resultLock = 0.45;
    $('resBest').hidden = true;
    $('resWorld').hidden = true;

    if (r.kind === 'duel') {
      $('resTitle').textContent = 'انتهت المواجهة!';
      $('resStars').hidden = true;
      $('resFacts').hidden = true;
      $('resDuel').hidden = false;
      $('resDuel').className = 'duel-badge p' + r.winner;
      $('resDuelText').textContent = 'فاز اللاعب ' + r.winner + '!';
      $('resNext').hidden = true;
      $('resAgain').classList.add('ring');
      say('فاز اللاعب ' + r.winner);
    } else {
      $('resDuel').hidden = true;
      $('resStars').hidden = false;
      $('resFacts').hidden = false;
      $('resTitle').textContent = r.stars === 3 ? 'ممتاز!' : r.stars === 2 ? 'رائع!' : r.stars === 1 ? 'أحسنت!' : 'حاول مرة أخرى!';
      $('resStars').querySelectorAll('svg').forEach((s, i) => {
        s.classList.toggle('on', i < Math.min(r.before, r.stars));
        s.classList.remove('pop');
      });
      $('resScore').querySelector('b').textContent = String(r.score);
      $('resLeft').querySelector('b').textContent = String(r.left);
      $('resLeft').classList.toggle('good', r.left >= world.parLeft);
      $('resCoins').querySelector('b').textContent = '+' + r.coins;
      const canNext = r.stars > 0 && cur + 1 < SC.LEVELS.length;
      $('resNext').hidden = !canNext;
      $('resAgain').classList.toggle('ring', !canNext);
      say(r.stars > 0 ? (world.id + '، ' + r.stars + ' نجوم') : 'انتهت البالونات');
    }
    setScreen('result');
  }

  function resultStep(dt) {
    const r = result, prev = resultT;
    resultT += dt;
    if (r.kind !== 'win') return;
    const crossed = t => prev < t && resultT >= t;
    for (let i = Math.min(r.before, r.stars); i < r.stars; i++) {
      if (crossed(0.3 + (i - Math.min(r.before, r.stars)) * 0.35)) {
        const s = $('resStars').children[i];
        s.classList.add('on', 'pop');
        J.star(i + 1);
        if (!calm()) fx.burst(540 + i * 100, 260, { count: 16, colors: ['#ffd23f', '#ffffff'], speed: 280, life: 0.65, size: 7, gravity: 280 });
      }
    }
    const late = 0.45 + Math.max(0, r.stars - r.before) * 0.35;
    if (crossed(late)) {
      if (r.res.best) { $('resBest').hidden = false; J.chime(2); }
      if (r.res.world >= 0) { $('resWorld').hidden = false; J.levelUp(); }
      if (r.res.coins > 0) J.coin(Math.min(5, r.res.coins));
    }
  }

  function resultNext() {
    if (!result || resultLock > 0) return;
    if (mode === 'duel') { J.select(); startDuel(); return; }
    if (result.stars <= 0) { J.select(); startSolo(cur); return; }
    if (cur + 1 >= SC.LEVELS.length) { J.back(); toMap(); return; }
    J.select();
    startSolo(cur + 1);
  }

  function resultAgain() {
    if (!result || resultLock > 0) return;
    J.select();
    if (mode === 'duel') startDuel();
    else startSolo(cur);
  }

  /* --------------------------------------------------- UI & mouse input */
  function on(el, fn) {
    el.addEventListener('click', e => {
      e.stopPropagation();
      if (e.detail > 1) return;
      Kit.audio.unlock();
      if (e.detail > 0) { el.blur(); focusGame(); }
      fn(e);
    });
  }
  on($('btnPlay'), play);
  on($('btnDuel'), () => { J.select(); startDuel(); });
  on($('btnLevels'), () => { J.select(); toMap(); });
  on($('btnShop'), openShop);
  on($('mapHome'), () => { J.back(); toTitle(); });
  on($('shopBack'), () => { J.back(); toTitle(); });
  on($('btnPause'), () => pause(true));
  on($('btnResume'), resume);
  on($('btnRestart'), restart);
  on($('btnMap'), () => { J.back(); if (mode === 'duel') toTitle(); else toMap(); });
  on($('resNext'), resultNext);
  on($('resAgain'), resultAgain);
  on($('resMap'), () => { if (resultLock <= 0) { J.back(); if (mode === 'duel') toTitle(); else toMap(); } });

  const toLogical = e => view.toLogical(e.clientX, e.clientY);
  const inFrame = p => p.x >= 0 && p.x <= W && p.y >= 0 && p.y <= H;

  function canStartAimAt(p) {
    if (!world || world.phase !== 'aim') return false;
    const sl = SC.activeSling(world), pouch = SC.pouchPos(world, false);
    if (Math.hypot(p.x - sl.x, p.y - sl.y) <= 165 || Math.hypot(p.x - pouch.x, p.y - pouch.y) <= 165) return true;
    if (p.y < 84) return false;
    if (world.mode === 'solo') return p.x <= 580;
    return world.turn === 1 ? p.x <= 600 : p.x >= 680;
  }

  function triggerLaunch() {
    if (!world || world.phase !== 'aim') return false;
    if (!SC.fire(world)) return false;
    dragging = false;
    kbCharging = false;
    coach.on = false;
    coach.idle = 0;
    if (mode === 'solo' && !save.coach) {
      save.coach = true;
      Kit.stats.tutorial('done');
      persist();
    }
    return true;
  }

  function triggerSpecial() {
    if (!world || world.phase !== 'flight') return false;
    return SC.activateSpecial(world);
  }

  canvas.addEventListener('pointerdown', e => {
    focusGame();
    Kit.audio.unlock();
    if (e.button !== 0 || screen !== 'play' || !world || celebrate > 0) return;
    const p = toLogical(e);
    ptr.x = p.x; ptr.y = p.y; ptr.inside = inFrame(p); ptr.down = true;

    if (world.phase === 'flight') {
      triggerSpecial();
      return;
    }
    if (world.phase === 'aim' && canStartAimAt(p)) {
      dragging = true;
      kbCharging = false;
      const sl = SC.activeSling(world);
      if (Math.hypot(p.x - sl.x, p.y - sl.y) > 22) {
        pullDist = SC.aimFromDrag(world, p.x, p.y);
      } else {
        pullDist = 0;
      }
      J.tap();
      dirty = true;
    }
  });

  window.addEventListener('pointermove', e => {
    const p = toLogical(e);
    ptr.x = p.x; ptr.y = p.y; ptr.inside = inFrame(p);
    if (ptr.down && e.buttons === 0) ptr.down = false;
    if (dragging && screen === 'play' && world && world.phase === 'aim') {
      pullDist = SC.aimFromDrag(world, p.x, p.y);
      coach.idle = 0;
      coach.on = false;
    }
  });

  function finishPointerDrag() {
    ptr.down = false;
    if (!dragging) return;
    dragging = false;
    if (screen === 'play' && world && world.phase === 'aim' && pullDist >= SC.MIN_PULL) {
      triggerLaunch();
    }
    pullDist = 0;
  }
  window.addEventListener('pointerup', e => { if (e.button === 0) finishPointerDrag(); });
  window.addEventListener('pointercancel', () => { dragging = false; ptr.down = false; pullDist = 0; });

  /* --------------------------------------------------- keyboard via Kit */
  function handleKeys(dt) {
    const K = Kit.keys, go = K.anyPressed(KEYS_GO);
    if (screen === 'title') {
      if (go) play();
      return;
    }
    if (screen === 'map') {
      if (go) { J.select(); startSolo(SC.nextLevel(save)); }
      else if (K.pressed('Escape')) { J.back(); toTitle(); }
      return;
    }
    if (screen === 'shop') {
      if (K.pressed('Escape')) { J.back(); toTitle(); }
      return;
    }
    if (screen === 'pause') {
      if (K.anyPressed(['KeyP', 'Escape', 'Enter', 'NumpadEnter', 'Space'])) resume();
      else if (K.pressed('KeyR')) restart();
      return;
    }
    if (screen === 'result' && resultLock <= 0) {
      if (go) resultNext();
      else if (K.pressed('KeyR')) resultAgain();
      else if (K.pressed('Escape')) { J.back(); if (mode === 'duel') toTitle(); else toMap(); }
      return;
    }
    if (screen !== 'play' || !world) return;

    if (K.anyPressed(['KeyP', 'Escape'])) { pause(true); return; }
    if (K.pressed('KeyR') && celebrate <= 0) { restart(); return; }
    if (celebrate > 0) return;

    if (world.phase === 'aim') {
      const dir = SC.aimDir(world);
      // Angle control (Up / Down)
      let dAng = 0;
      if (K.anyPressed(['ArrowUp', 'KeyW'])) dAng += 0.06;
      if (K.anyPressed(['ArrowDown', 'KeyS'])) dAng -= 0.06;
      if (K.anyDown(['ArrowUp', 'KeyW'])) dAng += 1.15 * dt;
      if (K.anyDown(['ArrowDown', 'KeyS'])) dAng -= 1.15 * dt;
      if (dAng !== 0) {
        SC.setAim(world, world.aimAngle + dAng, world.aimPower);
        coach.idle = 0; coach.on = false;
      }

      // Power control (Left / Right: pulling away from rival increases power)
      let dPow = 0;
      const moreKey = dir === 1 ? ['ArrowLeft', 'KeyA'] : ['ArrowRight', 'KeyD'];
      const lessKey = dir === 1 ? ['ArrowRight', 'KeyD'] : ['ArrowLeft', 'KeyA'];
      if (K.anyPressed(moreKey)) dPow += 0.07;
      if (K.anyPressed(lessKey)) dPow -= 0.07;
      if (K.anyDown(moreKey)) dPow += 0.85 * dt;
      if (K.anyDown(lessKey)) dPow -= 0.85 * dt;
      if (dPow !== 0) {
        SC.setAim(world, world.aimAngle, world.aimPower + dPow);
        coach.idle = 0; coach.on = false;
      }

      // Launch via Enter or Space (supports quick tap AND hold-to-charge!)
      if (K.anyPressed(['Enter', 'NumpadEnter'])) {
        triggerLaunch();
      } else if (K.pressed('Space')) {
        if (!K.down('Space')) {
          triggerLaunch();
        } else {
          kbCharging = true;
          kbChargeDir = 1;
        }
      } else if (kbCharging) {
        if (K.down('Space')) {
          let nextP = world.aimPower + kbChargeDir * 0.95 * dt;
          if (nextP >= 1.0) { nextP = 1.0; kbChargeDir = -1; }
          else if (nextP <= 0.28) { nextP = 0.28; kbChargeDir = 1; }
          SC.setAim(world, world.aimAngle, nextP);
        } else {
          triggerLaunch();
        }
      }
    } else if (world.phase === 'flight') {
      const p = world.projectiles[0];
      if (p && p.flight >= 0.06 && K.anyPressed(['Space', 'Enter', 'NumpadEnter'])) {
        triggerSpecial();
      }
    }
  }

  /* ------------------------------------------------------------ events */
  function addFloat(x, y, txt, color, size) {
    floats.push({ x: x, y: y, txt: txt, color: color || '#ffffff', size: size || 32, t: 0 });
    if (floats.length > 12) floats.shift();
  }

  const POP_WORDS = ['بوم!', 'رائع!', 'طش!', 'يا سلام!'];
  function processEvents() {
    for (const e of world.ev) {
      switch (e.t) {
        case 'fire':
          J.whoosh(0.7);
          J.pop(0.5);
          break;
        case 'special':
          J.chime(2);
          J.jump(0.8);
          rings.push({ x: e.x, y: e.y, color: e.color, t: 0 });
          if (!calm()) {
            fx.burst(e.x, e.y, { count: 18, colors: [e.color, '#ffffff', '#ffd23f'], speed: 290, life: 0.55, size: 7, gravity: 180 });
            shake.add(3.5);
          }
          break;
        case 'splat':
          J.pop(e.big ? 1.0 : 0.75);
          rings.push({ x: e.x, y: e.y, color: e.color, t: 0 });
          if (!calm()) {
            fx.burst(e.x, e.y, { count: e.big ? 24 : 15, colors: [e.color, '#ffffff', '#ffd23f'], speed: e.big ? 330 : 230, life: 0.6, size: 7, gravity: 380 });
            if (e.big) shake.add(5);
          }
          break;
        case 'bounce':
          J.jump(0.65);
          if (!calm()) fx.burst(e.x, e.y, { count: 8, colors: [e.color, '#ffffff'], speed: 170, life: 0.4, size: 5, gravity: 240 });
          break;
        case 'jelly':
          J.jump(0.9);
          rings.push({ x: e.x, y: e.y, color: '#ff5db1', t: 0 });
          if (!calm()) fx.burst(e.x, e.y, { count: 12, colors: ['#ff5db1', '#ffd23f', '#ffffff'], speed: 220, life: 0.5, size: 6, gravity: 250 });
          break;
        case 'portal':
          J.chime(2);
          rings.push({ x: e.x, y: e.y, color: e.color, t: 0 });
          rings.push({ x: e.tx, y: e.ty, color: e.color, t: 0 });
          if (!calm()) fx.burst(e.tx, e.ty, { count: 16, colors: [e.color, '#ffffff'], speed: 250, life: 0.5, size: 6, gravity: 80 });
          break;
        case 'boom':
          J.impact(1.0);
          J.pop(1.0);
          addFloat(e.x, e.y - 36, 'قوس الألوان!', '#ffd23f', 38);
          if (!calm()) {
            fx.burst(e.x, e.y, { count: 34, colors: ['#ff4d8d', '#ffd23f', '#3ddc84', '#24c8ff', '#a855f7'], speed: 420, life: 0.85, size: 9, gravity: 360 });
            shake.add(9);
          }
          break;
        case 'blockHit':
          J.land(0.3);
          break;
        case 'blockBreak':
          J.pop(0.6);
          if (!calm()) fx.burst(e.x, e.y, { count: 10, colors: [e.color, '#f2b272', '#ffffff'], speed: 210, life: 0.5, size: 6, gravity: 420 });
          break;
        case 'botHit':
          J.tap();
          break;
        case 'botPop':
          Kit.track.hit();
          J.chime(e.boss ? 3 : 1);
          J.pop(1.0);
          addFloat(e.x, e.y - 32, POP_WORDS[world.botsPopped % POP_WORDS.length], '#ffd23f', 36);
          if (!calm()) {
            fx.burst(e.x, e.y, { count: e.boss ? 28 : 18, colors: [e.color, '#ffd23f', '#ffffff', '#3ddc84'], speed: 320, life: 0.75, size: 8, gravity: 340 });
            shake.add(e.boss ? 6 : 3.5);
          }
          break;
        case 'shotEnd':
          if (!e.hitAny) Kit.track.miss();
          break;
        case 'turn':
          turnBanner = 1.6;
          J.whoosh(0.35);
          say('دور اللاعب ' + e.turn);
          break;
        case 'win':
          finishSoloWin(e);
          break;
        case 'lose':
          finishSoloLose(e);
          break;
        case 'duelWin':
          finishDuel(e);
          break;
      }
    }
    world.ev.length = 0;
  }

  /* ---------------------------------------------------------------- loop */
  function updatePlay(dt) {
    if (celebrate > 0) {
      celebrate -= dt;
      if (celebrate <= 0 && result) showResult();
      return;
    }

    SC.step(world, dt);
    processEvents();

    // Projectile paint trail (skipped under reduced motion)
    if (!calm() && world.projectiles.length) {
      trailTick += dt;
      if (trailTick >= 0.028) {
        trailTick = 0;
        for (const p of world.projectiles) {
          if (p.alive) {
            trail.push({ x: p.x, y: p.y, r: p.r * 0.42, color: p.color, t: 0, life: 0.42 });
          }
        }
        if (trail.length > 90) trail.splice(0, trail.length - 90);
      }
    }

    // Wordless coach hand when child waits on first solo shots
    if (world.mode === 'solo' && world.phase === 'aim' && !dragging && !kbCharging) {
      coach.idle += dt;
      if (!coach.on && coach.idle > (save.coach ? 6.5 : 1.3)) { coach.on = true; coach.t = 0; }
    } else {
      coach.idle = 0;
      coach.on = false;
    }
    if (coach.on) {
      coach.t += dt;
      if (coach.t > 2.8) { coach.on = false; coach.idle = save.coach ? 2.5 : 0.4; }
    }

    // Pointer cursor hint
    if (dragging) setCursor('pull');
    else if (world.phase === 'flight' && world.projectiles.some(p => p.alive && !p.specialUsed && !p.mini)) setCursor('special');
    else if (world.phase === 'aim' && ptr.inside && canStartAimAt(ptr)) setCursor('grab');
    else setCursor('');

    if (intro > 0) intro -= dt;
    if (turnBanner > 0) turnBanner -= dt;
  }

  function decayVisuals(dt) {
    for (let i = trail.length - 1; i >= 0; i--) { trail[i].t += dt; if (trail[i].t >= trail[i].life) trail.splice(i, 1); }
    for (let i = rings.length - 1; i >= 0; i--) { rings[i].t += dt; if (rings[i].t >= 0.4) rings.splice(i, 1); }
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i];
      f.t += dt;
      if (!calm()) f.y -= 38 * dt;
      if (f.t >= 1.1) floats.splice(i, 1);
    }
  }

  function update(dt) {
    handleKeys(dt);
    if (screen === 'pause') {
      Kit.keys.endFrame();
      return;
    }
    time += dt;
    if (screen === 'play' && world) updatePlay(dt);
    fx.update(dt);
    shake.update(dt);
    decayVisuals(dt);
    if (fx.list.length > 280) fx.list.splice(0, fx.list.length - 280);
    if (screen === 'result' && result) resultStep(dt);
    if (resultLock > 0) resultLock -= dt;
    Kit.keys.endFrame();
  }

  /* -------------------------------------------------------------- render */
  function drawCoach(ctx, still) {
    const sl = SC.activeSling(world), ct = coach.t;
    const alpha = clamp(Math.min(ct * 4, (2.8 - ct) * 3), 0, 0.92);
    const pull = still ? 0.65 : clamp((ct - 0.35) / 1.5, 0, 1);
    const x = sl.x - pull * 86, y = sl.y + pull * 36;
    A.circle(ctx, x, y, 22);
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(255,210,63,' + (alpha * 0.85).toFixed(2) + ')';
    ctx.stroke();
    A.hand(ctx, x, y + 6, pull > 0 ? 1 : 0, alpha);
  }

  function drawHud(ctx, still) {
    const wd = SC.WORLDS[world.world] || SC.WORLDS[0];

    if (world.mode === 'solo') {
      // Top center HUD pill: Level ID & Name | Bots left | Score
      const bx = 330, bw = 620;
      A.rr(ctx, bx, 12, bw, 58, 29);
      ctx.fillStyle = 'rgba(24,22,58,0.85)'; ctx.fill();
      ctx.lineWidth = 4; ctx.strokeStyle = wd.color; ctx.stroke();

      A.rr(ctx, bx + bw - 104, 18, 96, 46, 23);
      ctx.fillStyle = wd.color; ctx.fill();
      A.text(ctx, world.id, bx + bw - 56, 42, 28, A.INK, { stroke: false, dir: 'ltr' });

      A.text(ctx, world.name, bx + bw - 122, 42, 26, '#ffffff', { align: 'right', stroke: false, dir: 'rtl' });

      // Bots remaining badge
      const botsNow = SC.botsLeft(world);
      A.circle(ctx, bx + 206, 41, 15);
      ctx.fillStyle = '#7ef29d'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = A.INK; ctx.stroke();
      A.circle(ctx, bx + 201, 39, 2.5); A.circle(ctx, bx + 211, 39, 2.5); ctx.fillStyle = A.INK; ctx.fill();
      A.text(ctx, String(botsNow), bx + 180, 42, 28, '#ffffff', { align: 'right', stroke: false, dir: 'ltr' });

      // Score
      A.star(ctx, bx + 114, 41, 15, 7, 0);
      ctx.fillStyle = '#ffd23f'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = A.INK; ctx.stroke();
      A.text(ctx, String(world.score), bx + 90, 42, 26, '#ffe98a', { align: 'right', stroke: false, dir: 'ltr' });

      // Upcoming Balloon Queue tray at bottom-left under slingshot
      const rem = world.queue.slice(world.queueIndex + (world.phase === 'aim' ? 1 : 0));
      const qx = 96, qy = 98;
      const curType = SC.currentBalloon(world);
      if (world.phase === 'aim' && curType) {
        const bSpec = SC.BALLOONS[curType];
        A.rr(ctx, qx, qy - 26, 214, 52, 26);
        ctx.fillStyle = 'rgba(24,22,58,0.82)'; ctx.fill();
        ctx.lineWidth = 3.5; ctx.strokeStyle = bSpec.color; ctx.stroke();
        A.balloon(ctx, curType, qx + 30, qy, 16, save.skin, { noFace: true });
        A.text(ctx, bSpec.name, qx + 196, qy + 1, 22, '#ffffff', { align: 'right', stroke: false, dir: 'rtl' });
      }
      if (rem.length > 0) {
        for (let i = 0; i < rem.length; i++) {
          const rx = 62 + i * 44, ry = SC.GROUND + 44;
          A.circle(ctx, rx, ry, 18);
          ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fill();
          A.balloon(ctx, rem[i], rx, ry - 2, 14, save.skin, { noFace: true });
        }
      }
    } else {
      // 2-Player Hotseat Duel HUD
      const bx = 290, bw = 700;
      A.rr(ctx, bx, 12, bw, 60, 30);
      ctx.fillStyle = 'rgba(24,22,58,0.88)'; ctx.fill();
      ctx.lineWidth = 4; ctx.strokeStyle = world.turn === 1 ? '#ff7ab6' : '#38bdf8'; ctx.stroke();

      // P1 (left fort) bots
      const p1 = SC.botsLeft(world, 1), p2 = SC.botsLeft(world, 2);
      A.text(ctx, 'اللاعب 1', bx + 115, 42, 24, '#ff9ec2', { align: 'center', stroke: false, dir: 'rtl' });
      for (let i = 0; i < 3; i++) {
        A.circle(ctx, bx + 190 + i * 28, 42, 10);
        ctx.fillStyle = i < p1 ? '#ff4d8d' : 'rgba(255,255,255,0.18)';
        ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = '#ffffff'; ctx.stroke();
      }

      // Active balloon in center
      const curB = SC.currentBalloon(world) || 'classic';
      A.balloon(ctx, curB, 640, 42, 18, save.skin, { noFace: true });

      // P2 (right fort) bots
      for (let i = 0; i < 3; i++) {
        A.circle(ctx, bx + bw - 190 - i * 28, 42, 10);
        ctx.fillStyle = i < p2 ? '#38bdf8' : 'rgba(255,255,255,0.18)';
        ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = '#ffffff'; ctx.stroke();
      }
      A.text(ctx, 'اللاعب 2', bx + bw - 115, 42, 24, '#9ee8ff', { align: 'center', stroke: false, dir: 'rtl' });

      if (turnBanner > 0) {
        const a = clamp(Math.min(1, turnBanner * 2.5), 0, 1);
        ctx.globalAlpha = a;
        const col = world.turn === 1 ? '#ff4d8d' : '#38bdf8';
        A.rr(ctx, 470, 92, 340, 56, 28);
        ctx.fillStyle = 'rgba(24,22,58,0.9)'; ctx.fill();
        ctx.lineWidth = 4; ctx.strokeStyle = col; ctx.stroke();
        A.text(ctx, 'دور اللاعب ' + world.turn, 640, 121, 30, '#ffffff', { stroke: false, dir: 'rtl' });
        ctx.globalAlpha = 1;
      }
    }

    // Mid-air special power prompt when balloon can still use trick power!
    const activeP = world.projectiles.find(p => p.alive && !p.specialUsed && !p.mini);
    if (world.phase === 'flight' && activeP) {
      const pulse = still ? 1 : 1 + Math.sin(time * 12) * 0.05;
      ctx.save();
      ctx.translate(640, H - 42);
      ctx.scale(pulse, pulse);
      A.rr(ctx, -155, -26, 310, 52, 26);
      ctx.fillStyle = 'rgba(24,22,58,0.9)'; ctx.fill();
      ctx.lineWidth = 4; ctx.strokeStyle = activeP.color; ctx.stroke();
      A.keycap(ctx, -92, 2, 'Space', 84, true);
      A.text(ctx, 'قوّة البالون!', 44, 1, 26, '#ffd23f', { stroke: false, dir: 'rtl' });
      ctx.restore();
    }
  }

  function drawScene(ctx, w, isTitle) {
    const still = calm(), ps = pixelScale();
    ctx.drawImage(A.backdrop(w.world, ps), 0, 0, W, H);

    // Paint splat decals
    for (const sp of w.splats) A.splat(ctx, sp);

    // Gadgets behind blocks
    for (const fn of w.fans) A.fan(ctx, fn, w.P.windScale, time, still);
    for (const po of w.portals) A.portal(ctx, po, time, still);
    for (const pl of w.plats) A.plat(ctx, pl);
    for (const je of w.jellies) A.jelly(ctx, je, time, still);

    // Slingshot(s) back layer
    const activeIdx = w.mode === 'duel' ? w.turn - 1 : 0;
    w.slings.forEach((sl, idx) => {
      const isAct = !isTitle && idx === activeIdx && w.phase === 'aim';
      const dir = w.mode === 'duel' && idx === 1 ? -1 : 1;
      const pouch = isAct ? SC.pouchPos(w, dragging || kbCharging || true) : { x: sl.x, y: sl.y };
      A.slingBack(ctx, sl, pouch, save.frame, dir);
    });

    // Trajectory guide arc while aiming
    if (!isTitle && w.phase === 'aim' && celebrate <= 0) {
      const bType = SC.currentBalloon(w);
      const col = bType ? SC.BALLOONS[bType].color : '#ff4d8d';
      A.arc(ctx, SC.trajectory(w), col);
    }

    // Balloon sitting in active slingshot pouch
    if (isTitle) {
      const sl = w.slings[0];
      const bob = still ? 0 : Math.sin(time * 3) * 4;
      A.balloon(ctx, 'classic', sl.x - 16, sl.y + 4 + bob, 19, save.skin, {});
    } else if (w.phase === 'aim') {
      const bType = SC.currentBalloon(w);
      if (bType) {
        const pouch = SC.pouchPos(w, true);
        A.balloon(ctx, bType, pouch.x, pouch.y, SC.BALLOONS[bType].r, save.skin, {});
      }
    }

    // Slingshot(s) front fork & elastic band
    w.slings.forEach((sl, idx) => {
      const isAct = !isTitle && idx === activeIdx && w.phase === 'aim';
      const dir = w.mode === 'duel' && idx === 1 ? -1 : 1;
      const pouch = isAct ? SC.pouchPos(w, true) : { x: sl.x, y: sl.y };
      A.slingFront(ctx, sl, pouch, save.frame, dir);
    });

    // Blocks, TNT barrels, and silly paint-bots
    const threat = w.projectiles.length ? w.projectiles[0] : null;
    for (const bl of w.blocks) A.block(ctx, bl);
    for (const ba of w.barrels) A.barrel(ctx, ba, time, still);
    for (const b of w.bots) A.bot(ctx, b, time, still, threat, w.mode === 'duel');

    // Magnetic vortexes & projectile trail & flying balloons
    for (const vx of w.vortexes) A.vortex(ctx, vx);
    if (!isTitle) {
      for (const tr of trail) {
        const k = 1 - tr.t / tr.life;
        ctx.globalAlpha = k * 0.65;
        A.circle(ctx, tr.x, tr.y, tr.r * k + 1.5);
        ctx.fillStyle = tr.color;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      for (const p of w.projectiles) {
        if (p.alive) {
          A.balloon(ctx, p.type, p.x, p.y, p.r, save.skin, { rot: p.rot, charged: p.charged, slammed: p.slammed });
        }
      }
      if (coach.on && w.phase === 'aim') drawCoach(ctx, still);
    }

    // Impact rings, particles, and floating Arabic praise words
    for (const rg of rings) {
      const k = rg.t / 0.4;
      A.circle(ctx, rg.x, rg.y, still ? 28 : 16 + k * 64);
      ctx.lineWidth = 6 * (1 - k) + 1;
      ctx.strokeStyle = A.rgba(rg.color, (1 - k).toFixed(2));
      ctx.stroke();
    }
    fx.draw(ctx);
    for (const f of floats) {
      ctx.globalAlpha = clamp(1 - Math.max(0, f.t - 0.6) / 0.5, 0, 1);
      A.text(ctx, f.txt, f.x, f.y, f.size, f.color, { dir: 'rtl' });
    }
    ctx.globalAlpha = 1;

    if (!isTitle) drawHud(ctx, still);
  }

  function render() {
    if (screen === 'pause' && !dirty) return;
    dirty = false;
    const ctx = view.ctx;
    ctx.save();
    if (!calm()) ctx.translate(shake.x, shake.y);
    if (world && (screen === 'play' || screen === 'pause' || screen === 'result')) {
      drawScene(ctx, world, false);
    } else if (screen === 'title') {
      drawScene(ctx, titleWorld, true);
    } else {
      const wd = screen === 'map' ? Math.floor(SC.nextLevel(save) / 4) : 1;
      ctx.drawImage(A.backdrop(wd, pixelScale()), 0, 0, W, H);
      fx.draw(ctx);
    }
    ctx.restore();
  }

  canvas.addEventListener('contextrestored', () => { A.reset(); dirty = true; if (screen === 'shop') refreshShop(); });
  if (document.fonts && document.fonts.load) {
    document.fonts.load('700 40px Fredoka', 'مقلاع 5').then(() => { dirty = true; if (screen === 'shop') refreshShop(); }, () => {});
  }

  /* --------------------------------------------------- test & debug hook */
  const pagePoint = (x, y) => {
    const r = canvas.getBoundingClientRect();
    return { x: r.left + x * view.scale, y: r.top + y * view.scale };
  };
  const r1 = v => Math.round(v * 10) / 10;

  window.__game = {
    get state() {
      const w = world;
      const p = w && w.projectiles.length ? w.projectiles[0] : null;
      return {
        screen: screen,
        paused: screen === 'pause',
        mode: mode,
        level: cur,
        id: w ? w.id : '',
        phase: w ? w.phase : '',
        time: w ? Math.round(w.t * 1000) / 1000 : 0,
        aimAngle: w ? Math.round(w.aimAngle * 1000) / 1000 : 0,
        aimPower: w ? Math.round(w.aimPower * 1000) / 1000 : 0,
        shots: w ? w.shots : 0,
        balloonsLeft: w ? SC.balloonsLeft(w) : 0,
        currentBalloon: w ? SC.currentBalloon(w) : null,
        activeProjectile: p ? { type: p.type, x: r1(p.x), y: r1(p.y), vx: r1(p.vx), vy: r1(p.vy), specialUsed: p.specialUsed, bouncesLeft: p.bouncesLeft } : null,
        projectileCount: w ? w.projectiles.length : 0,
        botsLeft: w ? SC.botsLeft(w) : 0,
        p1Bots: w && w.mode === 'duel' ? SC.botsLeft(w, 1) : 0,
        p2Bots: w && w.mode === 'duel' ? SC.botsLeft(w, 2) : 0,
        score: w ? w.score : 0,
        coins: save.coins,
        turn: w ? w.turn : 1,
        winner: w ? w.winner : 0,
        stars: result ? result.stars : 0,
        celebrate: celebrate > 0,
        coach: coach.on,
        dragging: dragging,
        trail: trail.length,
        fx: fx.list.length,
        shake: shake.power,
        tier: dda.tier
      };
    },
    get save() { return JSON.parse(JSON.stringify(save)); },
    point: pagePoint,
    get sling() {
      if (!world) return null;
      const sl = SC.activeSling(world);
      return { x: sl.x, y: sl.y, dir: SC.aimDir(world) };
    }
  };

  buildMap();
  buildShop();
  Kit.muteButton();
  Kit.lifecycle({
    pause: () => pause(false),
    reset: () => { dragging = false; kbCharging = false; ptr.down = false; pullDist = 0; }
  });
  toTitle();
  Kit.loop(update, render);
  Kit.ready();
})();
