/* Desk Karts (سباق المكاتب): UI screens, 1P/2P keyboard & pointer controls, Kit.dda,
 * telemetry, saves, particles and one-shot event SFX. engine.js holds pure simulation;
 * art.js draws cached tabletop worlds and micro-karts. */
(function () {
  'use strict';
  const DK = window.DK, A = DK.art, J = Kit.juice, W = DK.W, H = DK.H;
  const $ = id => document.getElementById(id);
  const canvas = $('game'), ui = $('ui');
  const calm = () => Kit.motion.reduced();
  const clamp = Kit.clamp;

  let dirty = true, renders = 0;
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
  const CELEBRATE = 1.35;

  /* ------------------------------------------------------------------ save */
  const store = Kit.store('desk-karts');
  const saveStatus = Kit.saveStatus({ retry: persist });
  let save = DK.loadSave(store.get('save', null));

  function persist() {
    if (store.set('save', save) === false) {
      saveStatus.failed();
      return false;
    }
    saveStatus.saved();
    return true;
  }

  const dda = Kit.dda('desk-karts', { id: 'main', start: 0.3 });

  /* ----------------------------------------------------------------- state */
  let screen = 'title', cur = 0, humans = 1, mapHumans = 1;
  let world = null, tried = false, menuTime = 0;
  let celebrate = 0, result = null, resultT = 0, resultLock = 0, intro = 0;
  let trail = [], floats = [], flashes = [];
  const ptr = { x: W / 2, y: H / 2, inside: false, down: false };

  // Silent decorative track along the bottom of the title screen.
  const titleTrack = DK.build(-1, DK.params(0.3), {
    id: 'demo', world: 0, name: 'عرض', w: 72,
    p: [[160, 635], [640, 622], [1120, 635], [1155, 675], [640, 688], [125, 675]]
  });

  /* --------------------------------------------------------------- screens */
  const SCREENS = { title: 'scrTitle', map: 'scrMap', pause: 'scrPause', result: 'scrResult', shop: 'scrShop' };

  function setScreen(name) {
    screen = name;
    for (const k in SCREENS) $(SCREENS[k]).hidden = k !== name;
    $('hud').hidden = name !== 'play';
    dirty = true;
    if (name === 'play') focusGame();
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
    setTimeout(() => el.classList.remove('wiggle'), 460);
  }

  function toTitle() {
    leaveRace();
    chip('titleStars', DK.totalStars(save) + '/' + (DK.TRACKS.length * 3));
    chip('titleCoins', save.coins);
    setScreen('title');
  }

  function play1P() {
    J.select();
    if (!DK.totalStars(save)) startRace(0, 1);
    else toMap(1);
  }

  function play2P() {
    J.select();
    startRace(DK.nextTrack(save), 2);
  }

  /* ------------------------------------------------------------------- map */
  const trackBtns = [], worldCards = [];

  function buildMap() {
    const box = $('worlds');
    DK.WORLDS.forEach((wd, wi) => {
      const card = document.createElement('div');
      card.className = 'wcard';
      card.style.setProperty('--wc', wd.color);
      card.innerHTML = '<div class="whead"><b>' + wd.name + '</b><i>العالم ' + (wi + 1) + '</i></div><div class="wtracks"></div>';
      const row = card.querySelector('.wtracks');
      for (let k = 0; k < 2; k++) {
        const idx = wi * 2 + k;
        const R = DK.TRACKS[idx];
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'dk-btn lvl';
        b.innerHTML = '<b>' + R.id + '</b><em>' + R.name + '</em><span class="st">' + '<svg><use href="#i-star"/></svg>'.repeat(3) + '</span><svg class="lk" aria-hidden="true"><use href="#i-lock"/></svg>';
        on(b, () => pickTrack(idx, b));
        row.appendChild(b);
        trackBtns.push(b);
      }
      box.appendChild(card);
      worldCards.push(card);
    });
  }

  function refreshMap() {
    const next = DK.nextTrack(save);
    const duo = mapHumans === 2;
    trackBtns.forEach((b, i) => {
      const open = duo || DK.isOpen(save, i);
      const st = save.tracks[i].s;
      const R = DK.TRACKS[i];
      b.classList.toggle('locked', !open);
      b.classList.toggle('next', open && i === next);
      b.querySelectorAll('.st svg').forEach((s, k) => s.classList.toggle('on', k < st));
      b.setAttribute('aria-label', R.id + ' ' + R.name + (open ? '، ' + st + ' من 3 نجوم' : ' (مقفلة)'));
    });
    worldCards.forEach((c, wi) => c.classList.toggle('locked', !duo && !DK.isOpen(save, wi * 2)));
    chip('mapStars', DK.totalStars(save) + '/' + (DK.TRACKS.length * 3));
    chip('mapCoins', save.coins);
    const modeBtn = $('mapMode');
    modeBtn.textContent = duo ? 'سباق اثنين (2)' : 'لاعب واحد (1)';
    modeBtn.classList.toggle('duo', duo);
  }

  function toMap(mode) {
    leaveRace();
    if (mode === 1 || mode === 2) mapHumans = mode;
    refreshMap();
    setScreen('map');
    J.whoosh(0.4);
  }

  function pickTrack(i, el) {
    if (mapHumans === 1 && !DK.isOpen(save, i)) {
      J.error();
      wiggle(el);
      return;
    }
    J.select();
    startRace(i, mapHumans);
  }

  /* ------------------------------------------------------------------ shop */
  const tiles = { paint: [], topper: [] };

  function buildShop() {
    [['paint', DK.PAINTS, 'shelfPaints'], ['topper', DK.TOPPERS, 'shelfToppers']].forEach(([kind, list, id]) => {
      list.forEach((item, k) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'dk-btn tile';
        b.innerHTML = '<canvas width="244" height="244"></canvas><b>' + item.name + '</b><span class="price"><i class="coin"></i><em>' + item.price + '</em></span>';
        on(b, () => buyItem(kind, k, b));
        $(id).appendChild(b);
        tiles[kind].push(b);
      });
    });
  }

  function drawShopTile(kind, k, c) {
    const g = c.getContext('2d');
    g.setTransform(2, 0, 0, 2, 0, 0);
    g.clearRect(0, 0, 122, 122);
    const paintIdx = kind === 'paint' ? k : save.paint;
    const topperIdx = kind === 'topper' ? k : save.topper;
    A.glow(g, 61, 62, 46, DK.PAINTS[paintIdx].glow, 0.45);
    A.kart(g, {
      x: 61, y: 63, z: 0, ang: -0.35,
      paint: paintIdx, topper: topperIdx,
      human: true, playerNum: 1, turboT: kind === 'topper' && k === 0 ? 0.5 : 0
    }, { scale: 2.15, still: true, noBadge: true });
  }

  function refreshShop() {
    ['paint', 'topper'].forEach(kind => {
      const own = kind === 'topper' ? save.toppers : save.paints;
      const wear = kind === 'topper' ? save.topper : save.paint;
      const list = kind === 'topper' ? DK.TOPPERS : DK.PAINTS;
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
    const did = DK.buy(save, kind, k);
    if (!did) {
      J.error();
      wiggle(el);
      return;
    }
    persist();
    if (did === 'bought') {
      J.coin(3);
      J.levelUp();
      if (!calm()) {
        const r = el.getBoundingClientRect();
        const p = view.toLogical(r.left + r.width / 2, r.top + r.height / 3);
        fx.burst(p.x, p.y, { count: 26, colors: ['#ffd23f', '#ffffff', '#3df0ff', '#ff5d9e'], speed: 320, life: 0.75, size: 7, gravity: 280 });
      }
    } else {
      J.tap();
    }
    refreshShop();
  }

  /* ------------------------------------------------------------------ race */
  function currentParams() {
    const E = DK.EASY, D = DK.HARD;
    return {
      botSpeed: dda.value(E.botSpeed, D.botSpeed),
      catchup: dda.value(E.catchup, D.catchup),
      mercy: dda.value(E.mercy, D.mercy),
      roadWidth: dda.value(E.roadWidth, D.roadWidth),
      wallKeep: dda.value(E.wallKeep, D.wallKeep)
    };
  }

  function startRace(i, modeHumans) {
    leaveRace();
    cur = clamp(i | 0, 0, DK.TRACKS.length - 1);
    humans = modeHumans === 2 ? 2 : 1;
    mapHumans = humans;
    world = DK.create(cur, {
      humans: humans,
      params: currentParams(),
      paint: save.paint,
      topper: save.topper,
      seed: ((Date.now() & 0xffff) + cur * 977) >>> 0
    });
    tried = true;
    fx.clear();
    shake.clear ? shake.clear() : (shake.power = 0);
    trail = [];
    floats = [];
    flashes = [];
    celebrate = 0;
    result = null;
    intro = 2.0;
    ptr.down = false;
    Kit.keys.reset();

    const rid = humans === 2 ? 'duo-' + (cur + 1) : 'T' + (cur + 1);
    Kit.stats.round(rid);

    setScreen('play');
    J.whoosh(0.45);
    say(world.L.R.id + ' ' + world.L.R.name);
  }

  function leaveRace() {
    if (!tried) return;
    Kit.stats.end('quit');
    if (world && humans === 1 && !world.done && world.karts[0].dist > world.L.len * 0.35) {
      dda.result(DK.outcome(world.karts[0].rank, false));
    }
    tried = false;
  }

  function restart() {
    if (!world) return;
    J.select();
    startRace(cur, humans);
  }

  function pause(withSound) {
    if (screen !== 'play') return;
    ptr.down = false;
    setScreen('pause');
    if (withSound) J.back();
  }

  function resume() {
    if (screen !== 'pause') return;
    J.select();
    ptr.down = false;
    setScreen('play');
    Kit.keys.reset();
  }

  /* ---------------------------------------------------------------- result */
  const RANK_TITLES = ['المركز الأول!', 'المركز الثاني!', 'المركز الثالث!', 'حاول مجددًا!'];

  function onRaceFinish() {
    if (!tried) return;
    tried = false;
    const L = world.L;
    if (humans === 1) {
      const p1 = world.karts[0];
      const before = save.tracks[cur].s;
      const stars = DK.starsForRank(p1.rank);
      const res = DK.applyResult(save, cur, p1.rank, p1.finishTime || world.clock, world.coins);
      persist();
      dda.result(DK.outcome(p1.rank, p1.finished));
      Kit.stats.end(p1.rank <= 3 ? 'win' : 'lose', stars);
      result = {
        duo: false, rank: p1.rank, stars: stars, before: before,
        res: res, time: p1.finishTime || world.clock, coins: res.coins
      };
    } else {
      const p1 = world.karts[0], p2 = world.karts[1];
      if (world.coinsGot > 0) {
        save.coins = Math.min(99999, save.coins + world.coinsGot);
        persist();
      }
      Kit.stats.end('end');
      const bestHuman = p1.rank <= p2.rank ? p1 : p2;
      result = {
        duo: true,
        winnerText: p1.rank < p2.rank ? 'فاز اللاعب 1!' : p2.rank < p1.rank ? 'فاز اللاعب 2!' : 'تعادل رائع!',
        p1Rank: p1.rank, p2Rank: p2.rank,
        rank: bestHuman.rank, stars: 0, before: 0,
        res: { best: false, world: -1, coins: world.coinsGot },
        time: bestHuman.finishTime || world.clock, coins: world.coinsGot
      };
    }
    celebrate = CELEBRATE;
    J.levelUp();
    const st = L.cps[0];
    if (!calm()) {
      for (let k = 0; k < 3; k++) {
        fx.burst(st.x, st.y, { count: 24, colors: ['#ffd23f', '#ffffff', '#ff5d9e', '#3df0ff', '#8dff5a'], speed: 380, life: 1.0, size: 8, gravity: 320 });
      }
      shake.add(4);
    }
  }

  function showResult() {
    const r = result, R = DK.TRACKS[cur];
    resultT = 0;
    resultLock = 0.45;
    if (r.duo) {
      $('resTitle').textContent = r.winnerText;
      $('resStars').hidden = true;
      $('resDuo').hidden = false;
      $('resDuo').textContent = 'اللاعب 1: #' + r.p1Rank + '  •  اللاعب 2: #' + r.p2Rank;
    } else {
      $('resTitle').textContent = RANK_TITLES[clamp(r.rank - 1, 0, 3)];
      $('resStars').hidden = false;
      $('resDuo').hidden = true;
      $('resStars').querySelectorAll('svg').forEach((s, i) => {
        s.classList.toggle('on', i < Math.min(r.before, r.stars));
        s.classList.remove('pop');
      });
    }
    $('resRank').querySelector('b').textContent = '#' + r.rank;
    $('resRank').classList.toggle('good', r.rank <= 3);
    $('resTime').querySelector('b').textContent = r.time.toFixed(1) + 's';
    $('resCoins').querySelector('b').textContent = '+' + r.coins;
    $('resBest').hidden = true;
    $('resWorld').hidden = true;
    const canNext = cur + 1 < DK.TRACKS.length && (r.duo || DK.isOpen(save, cur + 1));
    $('resNext').hidden = !canNext;
    say(R.id + '، المركز ' + r.rank);
    setScreen('result');
  }

  function resultStep(dt) {
    const r = result, before = resultT;
    resultT += dt;
    const at = t => before < t && resultT >= t;
    if (!r.duo) {
      for (let i = Math.min(r.before, r.stars); i < r.stars; i++) {
        if (at(0.3 + (i - Math.min(r.before, r.stars)) * 0.35)) {
          const s = $('resStars').children[i];
          s.classList.add('on', 'pop');
          J.star(i + 1);
          if (!calm()) fx.burst(550 + i * 90, 260, { count: 16, colors: ['#ffd23f', '#ffffff'], speed: 280, life: 0.65, size: 7, gravity: 280 });
        }
      }
    }
    const late = 0.45 + Math.max(0, r.stars - r.before) * 0.35;
    if (at(late)) {
      if (r.res.best) { $('resBest').hidden = false; J.chime(2); }
      if (r.res.world >= 0) { $('resWorld').hidden = false; J.levelUp(); }
      if (r.coins > 0) J.coin(Math.min(4, r.coins));
    }
  }

  function resultNext() {
    if (!result || resultLock > 0) return;
    if (cur + 1 >= DK.TRACKS.length || (humans === 1 && !DK.isOpen(save, cur + 1))) {
      J.back();
      toMap(humans);
      return;
    }
    J.select();
    startRace(cur + 1, humans);
  }

  function resultAgain() {
    if (!result || resultLock > 0) return;
    J.select();
    startRace(cur, humans);
  }

  /* ----------------------------------------------------------------- input */
  function on(el, fn) {
    el.addEventListener('click', e => {
      e.stopPropagation();
      if (e.detail > 1) return;
      Kit.audio.unlock();
      if (e.detail > 0) {
        el.blur();
        focusGame();
      }
      fn(e);
    });
  }

  on($('btnPlay'), play1P);
  on($('btnTwo'), play2P);
  on($('btnLevels'), () => { J.select(); toMap(1); });
  on($('btnShop'), openShop);
  on($('mapHome'), () => { J.back(); toTitle(); });
  on($('mapMode'), () => {
    J.tap();
    mapHumans = mapHumans === 1 ? 2 : 1;
    refreshMap();
  });
  on($('shopBack'), () => { J.back(); toTitle(); });
  on($('btnPause'), () => pause(true));
  on($('btnResume'), resume);
  on($('btnRestart'), restart);
  on($('btnMap'), () => { J.back(); toMap(humans); });
  on($('resNext'), resultNext);
  on($('resAgain'), resultAgain);
  on($('resMap'), () => { if (resultLock <= 0) { J.back(); toMap(humans); } });

  const toLogical = e => view.toLogical(e.clientX, e.clientY);
  const inFrame = p => p.x >= 0 && p.x <= W && p.y >= 0 && p.y <= H;

  window.addEventListener('pointermove', e => {
    const p = toLogical(e);
    ptr.x = p.x;
    ptr.y = p.y;
    ptr.inside = inFrame(p);
    if (ptr.down && e.buttons === 0) ptr.down = false;
  });

  canvas.addEventListener('pointerdown', e => {
    focusGame();
    Kit.audio.unlock();
    if (e.button !== 0) return;
    const p = toLogical(e);
    ptr.x = p.x;
    ptr.y = p.y;
    ptr.inside = inFrame(p);
    ptr.down = true;
    // In 1P mode, tapping the HUD item pill while holding an item activates it too.
    if (screen === 'play' && world && humans === 1 && world.karts[0].item && p.y <= 74 && p.x >= 360 && p.x <= 530) {
      DK.useItem(world, 0);
      handleEvents();
    }
  });

  window.addEventListener('pointerup', e => { if (e.button === 0) ptr.down = false; });
  window.addEventListener('pointercancel', () => { ptr.down = false; });
  canvas.addEventListener('pointerleave', () => { ptr.inside = false; ptr.down = false; });

  function handleMenuKeys() {
    const K = Kit.keys, go = K.anyPressed(KEYS_GO);
    if (screen === 'title') {
      if (go) play1P();
    } else if (screen === 'map') {
      if (go) {
        J.select();
        startRace(DK.nextTrack(save), mapHumans);
      } else if (K.pressed('Escape')) {
        J.back();
        toTitle();
      }
    } else if (screen === 'shop') {
      if (K.pressed('Escape')) {
        J.back();
        toTitle();
      }
    } else if (screen === 'play') {
      if (K.anyPressed(['KeyP', 'Escape'])) pause(true);
      else if (K.pressed('KeyR') && !celebrate) restart();
    } else if (screen === 'pause') {
      if (K.anyPressed(['KeyP', 'Escape', 'Enter', 'NumpadEnter', 'Space'])) resume();
      else if (K.pressed('KeyR')) restart();
    } else if (screen === 'result' && resultLock <= 0) {
      if (go) resultNext();
      else if (K.pressed('KeyR')) resultAgain();
      else if (K.pressed('Escape')) { J.back(); toMap(humans); }
    }
  }

  function readRaceInputs() {
    const K = Kit.keys;
    if (humans === 1) {
      const p1 = world.karts[0];
      let gas = (K.down('ArrowUp') || K.down('KeyW')) ? 1 : 0;
      const brake = (K.down('ArrowDown') || K.down('KeyS')) ? 1 : 0;
      let steer = ((K.down('ArrowRight') || K.down('KeyD')) ? 1 : 0) - ((K.down('ArrowLeft') || K.down('KeyA')) ? 1 : 0);
      const item = K.anyPressed(['Space', 'KeyQ', 'KeyE', 'Enter', 'NumpadEnter']);
      let ptrActive = false;
      if (ptr.down && ptr.inside && !gas && !brake && !steer) {
        const dx = ptr.x - p1.x, dy = ptr.y - p1.y;
        if (Math.hypot(dx, dy) > 14) {
          gas = 1;
          const diff = DK.wrapAngle(Math.atan2(dy, dx) - p1.ang);
          steer = clamp(diff / 0.55, -1, 1);
          ptrActive = true;
        }
      }
      return [{ gas: gas, brake: brake, steer: steer, item: item, active: !!(gas || brake || steer || item || ptrActive) }];
    }
    // 2-Player shared screen: P1 = WASD + Q/E/Space; P2 = Arrows + Enter/Slash.
    const g1 = K.down('KeyW') ? 1 : 0;
    const b1 = K.down('KeyS') ? 1 : 0;
    const s1 = (K.down('KeyD') ? 1 : 0) - (K.down('KeyA') ? 1 : 0);
    const i1 = K.anyPressed(['KeyQ', 'KeyE', 'Space']);
    const g2 = K.down('ArrowUp') ? 1 : 0;
    const b2 = K.down('ArrowDown') ? 1 : 0;
    const s2 = (K.down('ArrowRight') ? 1 : 0) - (K.down('ArrowLeft') ? 1 : 0);
    const i2 = K.anyPressed(['Enter', 'NumpadEnter', 'Slash']);
    return [
      { gas: g1, brake: b1, steer: s1, item: i1, active: !!(g1 || b1 || s1 || i1) },
      { gas: g2, brake: b2, steer: s2, item: i2, active: !!(g2 || b2 || s2 || i2) }
    ];
  }

  /* ---------------------------------------------------------------- events */
  function addFloat(x, y, txt, color, size) {
    floats.push({ x: x, y: y, text: txt, color: color || '#ffd23f', size: size || 30, t: 0 });
    if (floats.length > 10) floats.shift();
  }

  function handleEvents() {
    for (const e of world.ev) {
      switch (e.t) {
        case 'coin':
          Kit.track.hit();
          J.coin(world.coinsGot);
          if (!calm()) fx.burst(e.x, e.y, { count: 14, colors: ['#ffd23f', '#ffffff', '#ff9f1c'], speed: 220, life: 0.5, size: 5, gravity: 200 });
          addFloat(e.x, e.y - 22, '+1', '#ffd23f', 28);
          break;
        case 'pickup':
          if (e.human) {
            Kit.track.hit();
            J.pop(0.5);
            if (!calm()) fx.burst(e.x, e.y, { count: 14, colors: ['#ff5d9e', '#ffd23f', '#3df0ff', '#8dff5a'], speed: 230, life: 0.5, size: 6, gravity: 180 });
          }
          break;
        case 'item':
          if (e.human) {
            if (e.item === 'turbo') J.whoosh(0.75);
            else if (e.item === 'spring') J.jump ? J.jump() : J.pop(0.7);
            else if (e.item === 'bubble') J.toggle(true);
            else J.pop(0.8);
            addFloat(e.x, e.y - 26, DK.ITEM_INFO[e.item].name, DK.ITEM_INFO[e.item].color, 26);
          }
          break;
        case 'boost':
        case 'driftBoost':
          if (e.human) {
            if (e.t === 'boost') Kit.track.hit();
            J.whoosh(e.t === 'boost' ? 0.55 : 0.35);
            if (!calm()) fx.burst(e.x, e.y, { count: 10, colors: ['#ff9f1c', '#ffd23f', '#ffffff'], speed: 190, life: 0.4, size: 5, gravity: 0 });
          }
          break;
        case 'portal':
          if (e.human) {
            Kit.track.hit();
            J.chime(2);
            if (!calm()) fx.burst(e.x, e.y, { count: 18, colors: [e.color || '#3df0ff', '#ffffff', '#c77dff'], speed: 260, life: 0.55, size: 6, gravity: 0 });
          }
          break;
        case 'bumper':
          if (e.human) {
            J.bounce ? J.bounce() : J.pop(0.55);
            if (!calm()) {
              shake.add(3.5);
              flashes.push({ x: e.x, y: e.y, t: 0, col: '#ff6b9d' });
            }
          }
          break;
        case 'wall':
          if (e.human) J.tap();
          break;
        case 'hazard':
          if (e.human) {
            Kit.track.miss();
            J.land(0.45);
            addFloat(e.x, e.y - 24, e.kind === 'butter' ? 'زلق!' : 'غراء!', '#fff3b0', 26);
          }
          break;
        case 'splat':
          if (e.human) Kit.track.miss();
          if (e.human || e.from < humans) J.pop(0.85);
          if (!calm()) {
            fx.burst(e.x, e.y, { count: 22, colors: ['#ff5d9e', '#ffd23f', '#3df0ff', '#8dff5a'], speed: 280, life: 0.65, size: 7, gravity: 200 });
            if (e.human) shake.add(5);
          }
          addFloat(e.x, e.y - 26, 'طش!', '#ff5d9e', 30);
          break;
        case 'shieldPop':
          if (e.human) J.toggle(false);
          if (!calm()) fx.burst(e.x, e.y, { count: 14, colors: ['#3df0ff', '#ffffff'], speed: 220, life: 0.45, size: 5, gravity: 0 });
          break;
        case 'lap':
          if (e.human) {
            Kit.track.hit();
            J.chime(e.lap);
            addFloat(world.karts[e.kart].x, world.karts[e.kart].y - 34, e.lap === DK.LAPS - 1 ? 'اللفة الأخيرة!' : 'اللفة ' + (e.lap + 1), '#8dff5a', 32);
          }
          break;
        case 'raceEnd':
          onRaceFinish();
          break;
      }
    }
    world.ev.length = 0;
  }

  /* ------------------------------------------------------------------ loop */
  function stepTrails() {
    if (calm() || !world) return;
    for (let i = 0; i < world.karts.length; i++) {
      const k = world.karts[i];
      if (!k.started || k.z > 2 || k.speed < 120) continue;
      const boosting = k.turboT > 0 || k.padBoostT > 0 || k.miniBoostT > 0;
      const drifting = Math.abs(k.driftT) > 0.12 || k.butterT > 0;
      if (!boosting && !drifting) continue;
      const col = k.turboT > 0
        ? 'hsl(' + Math.round((menuTime * 360 + i * 70) % 360) + ',95%,62%)'
        : boosting ? '#ff9f1c' : 'rgba(255,255,255,0.45)';
      trail.push({
        x: k.x - Math.cos(k.ang) * 14,
        y: k.y - Math.sin(k.ang) * 14,
        r: boosting ? 5.5 : 3.6,
        col: col,
        t: 0,
        life: boosting ? 0.42 : 0.28
      });
      if (trail.length > 110) trail.shift();
    }
  }

  function decayFx(dt) {
    for (let i = trail.length - 1; i >= 0; i--) {
      trail[i].t += dt;
      if (trail[i].t >= trail[i].life) trail.splice(i, 1);
    }
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i];
      f.t += dt;
      if (!calm()) f.y -= dt * 36;
      if (f.t > 1.1) floats.splice(i, 1);
    }
    for (let i = flashes.length - 1; i >= 0; i--) {
      flashes[i].t += dt;
      if (flashes[i].t > 0.32) flashes.splice(i, 1);
    }
  }

  function playStep(dt) {
    if (celebrate > 0) {
      DK.step(world, dt, []);
      world.ev.length = 0;
      celebrate -= dt;
      if (celebrate <= 0) showResult();
      return;
    }
    const inputs = readRaceInputs();
    DK.step(world, dt, inputs);
    handleEvents();
    stepTrails();
    if (intro > 0) intro = Math.max(0, intro - dt);
  }

  function update(dt) {
    handleMenuKeys();
    if (screen !== 'pause') {
      menuTime += dt;
      if (screen === 'play' && world) playStep(dt);
      fx.update(dt);
      shake.update(dt);
      decayFx(dt);
      if (fx.list.length > 260) fx.list.splice(0, fx.list.length - 260);
      if (screen === 'result' && result) resultStep(dt);
      if (resultLock > 0) resultLock = Math.max(0, resultLock - dt);
      dirty = true;
    }
    Kit.keys.endFrame();
  }

  /* ---------------------------------------------------------------- render */
  function drawHud(ctx, still) {
    const L = world.L, wd = DK.WORLDS[L.world];
    if (humans === 1) {
      const p1 = world.karts[0];
      const x0 = 356, w = 568, R = x0 + w;
      A.rr(ctx, x0, 10, w, 58, 29);
      ctx.fillStyle = 'rgba(14, 18, 48, 0.86)';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = wd.color;
      ctx.stroke();

      // Track ID pill on right
      A.rr(ctx, R - 90, 16, 82, 46, 23);
      ctx.fillStyle = wd.color;
      ctx.fill();
      A.text(ctx, L.R.id, R - 49, 40, 28, A.INK, { stroke: false });

      // Lap counter
      const lapShown = Math.min(DK.LAPS, p1.lap + 1);
      A.text(ctx, 'اللفة ' + lapShown + '/' + DK.LAPS, R - 170, 40, 25, '#ffffff', { stroke: false });

      // Live rank badge
      const rankCols = ['#ffd23f', '#e2e8f0', '#f4a261', '#9aa0c8'];
      A.circle(ctx, R - 275, 39, 19);
      ctx.fillStyle = rankCols[clamp(p1.rank - 1, 0, 3)];
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = A.INK;
      ctx.stroke();
      A.text(ctx, '#' + p1.rank, R - 275, 40, 22, A.INK, { stroke: false });

      // Track coins
      A.coin(ctx, R - 342, 39, 0, true);
      A.text(ctx, world.coinsGot + '/' + L.coins.length, R - 388, 40, 24, '#ffe98a', { stroke: false });

      // Held item slot on left
      A.rr(ctx, x0 + 10, 16, 122, 46, 23);
      ctx.fillStyle = p1.item ? 'rgba(255, 210, 63, 0.24)' : 'rgba(255, 255, 255, 0.08)';
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = p1.item ? '#ffd23f' : 'rgba(255, 255, 255, 0.25)';
      ctx.stroke();
      if (p1.item) {
        A.itemIcon(ctx, p1.item, x0 + 36, 39, 1.0);
        A.text(ctx, 'Space', x0 + 86, 40, 20, '#ffd23f', { stroke: false });
      } else {
        A.text(ctx, 'هدية', x0 + 71, 40, 21, 'rgba(255,255,255,0.55)', { stroke: false });
      }
    } else {
      // 2-Player HUD bar
      const p1 = world.karts[0], p2 = world.karts[1];
      const x0 = 290, w = 700, R = x0 + w;
      A.rr(ctx, x0, 10, w, 58, 29);
      ctx.fillStyle = 'rgba(14, 18, 48, 0.88)';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#8338ec';
      ctx.stroke();

      // Center track ID
      A.rr(ctx, 600, 16, 80, 46, 23);
      ctx.fillStyle = wd.color;
      ctx.fill();
      A.text(ctx, L.R.id, 640, 40, 26, A.INK, { stroke: false });

      // P1 right half (WASD + Q)
      A.circle(ctx, R - 32, 39, 17);
      ctx.fillStyle = '#ffd23f';
      ctx.fill();
      A.text(ctx, '1', R - 32, 40, 21, A.INK, { stroke: false });
      A.text(ctx, '#' + p1.rank + ' • ' + Math.min(DK.LAPS, p1.lap + 1) + '/' + DK.LAPS, R - 118, 40, 24, '#ffffff', { stroke: false });
      if (p1.item) {
        A.itemIcon(ctx, p1.item, R - 210, 39, 0.95);
        A.text(ctx, 'Q', R - 242, 40, 20, '#ffd23f', { stroke: false });
      }

      // P2 left half (Arrows + Enter)
      A.circle(ctx, x0 + 32, 39, 17);
      ctx.fillStyle = '#8dff5a';
      ctx.fill();
      A.text(ctx, '2', x0 + 32, 40, 21, A.INK, { stroke: false });
      A.text(ctx, '#' + p2.rank + ' • ' + Math.min(DK.LAPS, p2.lap + 1) + '/' + DK.LAPS, x0 + 118, 40, 24, '#ffffff', { stroke: false });
      if (p2.item) {
        A.itemIcon(ctx, p2.item, x0 + 212, 39, 0.95);
        A.text(ctx, '↵', x0 + 244, 40, 22, '#8dff5a', { stroke: false });
      }
    }

    // Non-blocking start flag banner
    if (intro > 0 && !world.done) {
      const a = clamp(Math.min(1, intro / 0.45), 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      const bw = 380, bx = 640 - bw / 2, by = 108;
      A.rr(ctx, bx, by - 28, bw, 56, 28);
      ctx.fillStyle = 'rgba(14, 20, 52, 0.88)';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#3ddc84';
      ctx.stroke();
      A.text(ctx, 'انطلق! • ' + L.R.name, 640, by + 1, 28, '#8dff5a', { stroke: false });
      ctx.restore();
    }
  }

  function drawWorld(ctx) {
    const L = world.L, still = calm(), t = world.t;
    ctx.drawImage(A.track(L, pixelScale()), 0, 0, W, H);

    L.portals.forEach(po => A.portal(ctx, po, t, still));
    L.coins.forEach((c, i) => { if (!world.coins[i]) A.coin(ctx, c.x, c.y, t, still); });
    L.boxes.forEach((b, i) => A.giftBox(ctx, b.x, b.y, world.boxes[i], t, still));
    L.bumpers.forEach((bm, i) => A.bumper(ctx, bm, world.bumpers[i], t, still));

    // Skid / boost trails beneath karts
    for (const p of trail) {
      const k = 1 - p.t / p.life;
      ctx.globalAlpha = k * 0.85;
      A.circle(ctx, p.x, p.y, p.r * (0.5 + 0.5 * k));
      ctx.fillStyle = p.col;
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Sort karts by hop height z so jumping karts draw cleanly above ground karts
    const order = world.karts.slice().sort((a, b) => a.z - b.z || a.y - b.y);
    for (const k of order) A.kart(ctx, k, { t: t, still: still });

    for (const sp of world.splats) A.splatRocket(ctx, sp, t, still);

    // Particle bursts, bumper rings & floating Arabic callouts
    fx.draw(ctx);
    for (const fl of flashes) {
      const k = fl.t / 0.32;
      A.circle(ctx, fl.x, fl.y, still ? 24 : 14 + k * 34);
      ctx.lineWidth = 5 * (1 - k) + 1;
      ctx.strokeStyle = A.rgba(fl.col || '#ff6b9d', 1 - k);
      ctx.stroke();
    }
    for (const f of floats) {
      ctx.globalAlpha = clamp(1 - Math.max(0, f.t - 0.65) / 0.45, 0, 1);
      A.text(ctx, f.text, f.x, f.y, f.size, f.color);
    }
    ctx.globalAlpha = 1;

    drawHud(ctx, still);
  }

  function drawMenu(ctx) {
    const still = calm(), ps = pixelScale();
    if (screen === 'title') {
      ctx.drawImage(A.track(titleTrack, ps), 0, 0, W, H);
      // Two cheerful silent karts cruising along the bottom demo oval
      for (let i = 0; i < 2; i++) {
        const s = still ? (180 + i * 220) : (menuTime * (210 - i * 25) + i * 260) % titleTrack.len;
        const c = DK.at(titleTrack, s);
        const off = i === 0 ? -12 : 14;
        A.kart(ctx, {
          x: c.x + c.nx * off,
          y: c.y + c.ny * off,
          z: 0,
          ang: Math.atan2(c.ty, c.tx),
          paint: i === 0 ? save.paint : (save.paint + 2) % DK.PAINTS.length,
          topper: i === 0 ? save.topper : 1,
          turboT: i === 0 && !still ? 0.5 : 0
        }, { t: menuTime, still: still, noBadge: true });
      }
    } else {
      const wd = screen === 'map' ? Math.floor(DK.nextTrack(save) / 2) : 0;
      ctx.drawImage(A.backdrop(wd, ps), 0, 0, W, H);
    }
    fx.draw(ctx);
  }

  function render() {
    if (screen === 'pause' && !dirty) return;
    dirty = false;
    renders++;
    const ctx = view.ctx;
    ctx.save();
    if (!calm()) ctx.translate(shake.x, shake.y);
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
    document.fonts.load('700 40px Fredoka', 'سباق 5').then(() => {
      dirty = true;
      if (screen === 'shop') refreshShop();
    }, () => { /* fallback font */ });
  }

  /* --------------------------------------------------- test and debug hook */
  const pagePoint = (x, y) => {
    const r = canvas.getBoundingClientRect();
    return { x: r.left + x * view.scale, y: r.top + y * view.scale };
  };
  const r1 = v => Math.round(v * 10) / 10;
  const r2 = v => Math.round(v * 100) / 100;
  const r3 = v => Math.round(v * 1000) / 1000;

  window.__game = {
    get state() {
      const w = world;
      const p1 = w ? w.karts[0] : null;
      const p2 = w && w.humans === 2 ? w.karts[1] : null;
      return {
        screen: screen,
        paused: screen === 'pause',
        humans: humans,
        track: cur,
        id: w ? w.L.R.id : '',
        world: w ? w.L.world : 0,
        time: w ? r3(w.clock) : 0,
        clock: w ? r2(w.clock) : 0,
        worldTime: w ? r3(w.t) : 0,
        p1Dist: p1 ? r1(p1.dist) : 0,
        p1GasTime: p1 ? r3(p1.gasTime) : 0,
        p1Inputs: p1 ? p1.inputs : 0,
        p1Lap: p1 ? p1.lap : 0,
        p1Rank: p1 ? p1.rank : 1,
        p1Item: p1 ? p1.item : '',
        p2Dist: p2 ? r1(p2.dist) : 0,
        p2GasTime: p2 ? r3(p2.gasTime) : 0,
        p2Lap: p2 ? p2.lap : 0,
        karts: w ? w.karts.map(k => ({
          id: k.id, human: k.human, x: r1(k.x), y: r1(k.y), z: r1(k.z),
          ang: r2(k.ang), speed: r1(k.speed), s: r1(k.s), off: r1(k.off),
          lap: k.lap, sector: k.sector, rank: k.rank, item: k.item,
          dist: r1(k.dist), finished: k.finished
        })) : [],
        coins: w ? w.coinsGot : 0,
        finished: !!(w && w.done),
        celebrate: celebrate > 0,
        winner: w ? w.winner : -1,
        stars: result ? result.stars : 0,
        tier: dda.tier,
        trail: trail.length,
        fx: fx.list.length,
        shake: calm() ? 0 : shake.power,
        renders: renders
      };
    },
    get save() { return JSON.parse(JSON.stringify(save)); },
    point: pagePoint,
    at: s => {
      const p = DK.at(world.L, s);
      return { x: p.x, y: p.y, tx: p.tx, ty: p.ty, nx: p.nx, ny: p.ny, hw: p.hw };
    },
    get trackInfo() {
      const L = world.L;
      return {
        len: L.len,
        w: L.R.w,
        hazards: L.hazards.map(h => ({ s: h.s, off: h.off, r: h.r, kind: h.kind })),
        bumpers: L.bumpers.map(b => ({ s: b.s, off: b.off, r: b.r, kind: b.kind })),
        boxes: L.boxes.map(b => ({ s: b.s, off: b.off, x: b.x, y: b.y }))
      };
    }
  };

  buildMap();
  buildShop();
  Kit.muteButton();
  Kit.lifecycle({
    pause: () => pause(false),
    reset: () => { ptr.down = false; }
  });
  toTitle();
  Kit.loop(update, render);
  Kit.ready();
})();
