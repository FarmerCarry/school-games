/* Toy Castle Clash (قلعة الألعاب): UI screens, 1P & 2P controls via Kit.keys and cards,
 * sky star-bubble popping, saves, shop, DDA, telemetry, and one-shot Juice SFX. */
(function () {
  'use strict';
  const A = TC.art, J = Kit.juice, W = TC.W, H = TC.H;
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
  const CELEBRATE = 1.35;
  const CONF_COLS = ['#ff5d73', '#ffd23f', '#38bdf8', '#34d399', '#a855f7', '#ffffff'];

  /* ---------------------------------------------------------------- save */
  const store = Kit.store('toy-castle');
  const saveStatus = Kit.saveStatus({ retry: persist });
  let save = TC.loadSave(store.get('save', null));
  function persist() {
    if (store.set('save', save) === false) { saveStatus.failed(); return false; }
    saveStatus.saved();
    return true;
  }
  const dda = Kit.dda('toy-castle', { id: 'main', start: 0.3 });

  /* --------------------------------------------------------------- state */
  let screen = 'title', cur = 0, humans = 1, world = null, uiClock = 0, tried = false, justStarted = false;
  let celebrate = 0, result = null, resultT = 0, resultLock = 0, intro = 0;
  let floats = [], rings = [], popQ = [];
  const ptr = { x: W / 2, y: H / 2, inside: false };

  const SHORT_NAMES = {
    duck: 'بطة',
    frog: 'ضفدع',
    bear: 'دبّ',
    plane: 'طائرة',
    train: 'قطار'
  };

  /* ------------------------------------------------------------ helpers */
  const SCREENS = { title: 'scrTitle', map: 'scrMap', pause: 'scrPause', result: 'scrResult', shop: 'scrShop' };
  function setScreen(next) {
    screen = next;
    for (const k in SCREENS) $(SCREENS[k]).hidden = k !== next;
    $('hud').hidden = next !== 'play';
    dirty = true;
    setCursor('');
    if (next === 'play') focusGame();
  }
  function focusGame() { try { canvas.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  function say(msg) { $('live').textContent = msg; }
  function chip(id, val) { $(id).querySelector('b').textContent = String(val); }
  let curClass = '';
  function setCursor(c) { if (c !== curClass) { curClass = c; canvas.className = c; } }
  function wiggle(el) {
    if (!el) return;
    el.classList.remove('wiggle');
    void el.offsetWidth;
    el.classList.add('wiggle');
    setTimeout(() => el.classList.remove('wiggle'), 460);
  }

  // Navigation buttons ignore accidental double-clicks; battle cards allow rapid clicks.
  function onNav(el, fn) {
    el.addEventListener('click', e => {
      e.stopPropagation();
      if (e.detail > 1) return;
      Kit.audio.unlock();
      if (e.detail > 0) { el.blur(); focusGame(); }
      fn(e);
    });
  }
  function onAct(el, fn) {
    el.addEventListener('click', e => {
      e.stopPropagation();
      Kit.audio.unlock();
      if (e.detail > 0) { el.blur(); focusGame(); }
      fn(e);
    });
  }

  /* ------------------------------------------------------------ build HUD */
  const hudRefs = { p1: null, two: [null, null] };

  function makeDeck(container, sideIdx, isTwo) {
    container.innerHTML = '';
    const prefix = isTwo ? (sideIdx === 0 ? 'p1-' : 'p2-') : 'card-';
    const unitKeys = isTwo
      ? (sideIdx === 0 ? ['1', '2', '3', '4', '5'] : ['6', '7', '8', '9', '0'])
      : ['1', '2', '3', '4', '5'];
    const upKey = isTwo ? (sideIdx === 0 ? 'F' : 'H') : '6';
    const canKey = isTwo ? (sideIdx === 0 ? 'Space' : 'Enter') : 'Space';

    const epod = document.createElement('div');
    epod.className = 'epod spin';
    epod.innerHTML = '<svg aria-hidden="true"><use href="#i-key"/></svg>' +
      '<div class="eval"><b>30</b><small>/100</small></div>' +
      '<span class="klv">مفتاح 1</span>';
    container.appendChild(epod);

    const cards = {};
    TC.UNIT_ORDER.forEach((uId, idx) => {
      const def = TC.UNITS[uId];
      const b = document.createElement('button');
      b.type = 'button';
      b.id = prefix + uId;
      b.className = 'ucard';
      b.setAttribute('aria-label', def.name + ' (' + def.cost + ')');
      b.innerHTML = '<span class="ukey">' + unitKeys[idx] + '</span>' +
        '<canvas width="96" height="84"></canvas>' +
        '<span class="uname">' + SHORT_NAMES[uId] + '</span>' +
        '<span class="ucost">' + def.cost + '</span>' +
        '<span class="cdbar"></span>';
      A.unitIcon(b.querySelector('canvas'), uId, sideIdx);
      onAct(b, () => actSummon(sideIdx, uId, b));
      container.appendChild(b);
      cards[uId] = b;
    });

    const upBtn = document.createElement('button');
    upBtn.type = 'button';
    upBtn.id = isTwo ? (sideIdx === 0 ? 'p1-upgrade' : 'p2-upgrade') : 'btnUpgrade';
    upBtn.className = 'ucard act-up';
    upBtn.setAttribute('aria-label', 'تطوير المفتاح');
    upBtn.innerHTML = '<span class="ukey">' + upKey + '</span>' +
      '<svg aria-hidden="true"><use href="#i-key"/></svg>' +
      '<span class="uname">تطوير المفتاح</span>' +
      '<span class="ucost">35</span>' +
      '<span class="cdbar"></span>';
    onAct(upBtn, () => actUpgrade(sideIdx, upBtn));
    container.appendChild(upBtn);

    const canBtn = document.createElement('button');
    canBtn.type = 'button';
    canBtn.id = isTwo ? (sideIdx === 0 ? 'p1-cannon' : 'p2-cannon') : 'btnCannon';
    canBtn.className = 'ucard act-can';
    canBtn.setAttribute('aria-label', 'مدفع القصاصات');
    canBtn.innerHTML = '<span class="ukey">' + canKey + '</span>' +
      '<svg aria-hidden="true"><use href="#i-cannon"/></svg>' +
      '<span class="uname">المدفع</span>' +
      '<span class="ucost">جاهز!</span>' +
      '<span class="cdbar"></span>';
    onAct(canBtn, () => actCannon(sideIdx, canBtn));
    container.appendChild(canBtn);

    return {
      epod: epod,
      eVal: epod.querySelector('.eval b'),
      eMax: epod.querySelector('.eval small'),
      kLv: epod.querySelector('.klv'),
      cards: cards,
      upBtn: upBtn,
      upCost: upBtn.querySelector('.ucost'),
      canBtn: canBtn,
      canCost: canBtn.querySelector('.ucost'),
      canCd: canBtn.querySelector('.cdbar')
    };
  }

  function buildHud() {
    hudRefs.p1 = makeDeck($('tray1p'), 0, false);
    hudRefs.two[0] = makeDeck($('trayP1'), 0, true);
    hudRefs.two[1] = makeDeck($('trayP2'), 1, true);
  }

  function syncDeck(ref, side) {
    const en = Math.floor(side.energy);
    ref.eVal.textContent = String(en);
    ref.eMax.textContent = '/' + side.energyMax;
    ref.kLv.textContent = 'مفتاح ' + (side.keyLv + 1);

    for (let i = 0; i < TC.UNIT_ORDER.length; i++) {
      const uId = TC.UNIT_ORDER[i], def = TC.UNITS[uId], b = ref.cards[uId];
      const cd = side.cds[uId];
      const canBuy = en >= def.cost && cd <= 0.001;
      b.classList.toggle('dim', !canBuy);
      b.querySelector('.cdbar').style.height = cd > 0 ? Math.round((cd / def.cd) * 100) + '%' : '0%';
    }

    const maxed = side.keyLv >= TC.KEY_LEVELS.length - 1;
    const nextCost = maxed ? 0 : TC.KEY_LEVELS[side.keyLv + 1].cost;
    ref.upCost.textContent = maxed ? 'أقصى' : String(nextCost);
    ref.upBtn.classList.toggle('dim', maxed || en < nextCost);

    const ccd = side.cannonCd;
    ref.canCost.textContent = ccd > 0.05 ? Math.ceil(ccd) + 's' : 'جاهز!';
    ref.canBtn.classList.toggle('dim', ccd > 0.05);
    ref.canCd.style.height = ccd > 0 ? Math.round((ccd / TC.CANNON_CD) * 100) + '%' : '0%';
  }

  function syncHud() {
    if (!world) return;
    if (humans === 1) syncDeck(hudRefs.p1, world.sides[0]);
    else {
      syncDeck(hudRefs.two[0], world.sides[0]);
      syncDeck(hudRefs.two[1], world.sides[1]);
    }
  }

  /* ---------------------------------------------------------------- map */
  const levelBtns = [], worldRows = [];
  function buildMap() {
    const box = $('worlds');
    TC.WORLDS.forEach((wd, wi) => {
      const row = document.createElement('div');
      row.className = 'wrow';
      row.style.setProperty('--wc', wd.color);
      row.innerHTML = '<div class="wname"><i>العالم ' + (wi + 1) + '</i><b>' + wd.name + '</b></div>';
      for (let k = 0; k < 3; k++) {
        const idx = wi * 3 + k;
        const R = TC.LEVELS[idx];
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'tc-btn lvl';
        b.innerHTML = '<b>' + R.id + '</b><em>' + R.name + '</em><span class="st">' +
          '<svg><use href="#i-star"/></svg>'.repeat(3) +
          '</span><svg class="lk" aria-hidden="true"><use href="#i-lock"/></svg>';
        onNav(b, () => pickLevel(idx, b));
        row.appendChild(b);
        levelBtns.push(b);
      }
      box.appendChild(row);
      worldRows.push(row);
    });
  }

  function refreshMap() {
    const next = TC.nextLevel(save);
    levelBtns.forEach((b, i) => {
      const open = TC.isOpen(save, i), st = save.lv[i].s, R = TC.LEVELS[i];
      b.classList.toggle('locked', !open);
      b.classList.toggle('next', open && i === next);
      b.querySelectorAll('.st svg').forEach((s, k) => s.classList.toggle('on', k < st));
      b.setAttribute('aria-label', R.id + ' ' + R.name + (open ? '، ' + st + ' من 3 نجوم' : ' (مقفلة)'));
    });
    worldRows.forEach((r, wi) => r.classList.toggle('locked', !TC.isOpen(save, wi * 3)));
    chip('mapStars', TC.totalStars(save) + '/' + (TC.LEVELS.length * 3));
  }

  /* --------------------------------------------------------------- shop */
  const shopTiles = { theme: [], topper: [] };
  function buildShop() {
    [['theme', TC.THEMES, 'shelfThemes'], ['topper', TC.TOPPERS, 'shelfToppers']].forEach(([kind, list, id]) => {
      list.forEach((item, k) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'tc-btn tile';
        b.innerHTML = '<canvas width="232" height="232"></canvas><b>' + item.name +
          '</b><span class="price"><i class="coin"></i><em>' + item.price + '</em></span>';
        onNav(b, () => buyItem(kind, k, b));
        $(id).appendChild(b);
        shopTiles[kind].push(b);
      });
    });
  }

  function refreshShop() {
    ['theme', 'topper'].forEach(kind => {
      const own = kind === 'topper' ? save.toppers : save.themes;
      const wear = kind === 'topper' ? save.topper : save.theme;
      const list = kind === 'topper' ? TC.TOPPERS : TC.THEMES;
      shopTiles[kind].forEach((b, k) => {
        A.shopTile(b.querySelector('canvas'), kind, k, save);
        b.classList.toggle('own', !!own[k]);
        b.classList.toggle('wear', wear === k);
        b.classList.toggle('poor', !own[k] && save.coins < list[k].price);
        b.setAttribute('aria-label', list[k].name + (wear === k ? ' (مُجهّز)' : own[k] ? '' : '، السعر ' + list[k].price));
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
    const did = TC.buy(save, kind, k);
    if (!did) { J.error(); wiggle(el); return; }
    persist();
    if (did === 'bought') {
      J.coin(3);
      J.levelUp();
      if (!calm()) {
        const r = el.getBoundingClientRect(), p = view.toLogical(r.left + r.width / 2, r.top + r.height / 3);
        fx.burst(p.x, p.y, { count: 26, colors: CONF_COLS, speed: 320, life: 0.75, size: 8, gravity: 320 });
      }
    } else J.tap();
    refreshShop();
  }

  /* --------------------------------------------------- navigation & match */
  function leaveMatch() {
    if (tried) {
      Kit.stats.end('quit');
      if (world && humans === 1 && !world.done && (world.t > 8 || world.spawned[0] > 0)) {
        dda.result(TC.outcome(world));
      }
      tried = false;
    }
  }

  function toTitle() {
    leaveMatch();
    chip('titleStars', TC.totalStars(save) + '/' + (TC.LEVELS.length * 3));
    chip('titleCoins', save.coins);
    setScreen('title');
  }

  function toMap() {
    leaveMatch();
    refreshMap();
    setScreen('map');
    J.whoosh(0.4);
  }

  function play() {
    J.select();
    if (!TC.totalStars(save)) startLevel(0);
    else toMap();
  }

  function pickLevel(i, el) {
    if (!TC.isOpen(save, i)) { J.error(); wiggle(el); return; }
    J.select();
    startLevel(i);
  }

  function ddaParams() {
    const E = TC.EASY, D = TC.HARD;
    return {
      aiEnergy: dda.value(E.aiEnergy, D.aiEnergy),
      aiHp: dda.value(E.aiHp, D.aiHp),
      aiThink: dda.value(E.aiThink, D.aiThink),
      p1Energy: dda.value(E.p1Energy, D.p1Energy)
    };
  }

  function startMatch(twoPlayer, levelIdx) {
    leaveMatch();
    humans = twoPlayer ? 2 : 1;
    if (!twoPlayer) cur = clamp(levelIdx | 0, 0, TC.LEVELS.length - 1);
    world = twoPlayer ? TC.createVersus() : TC.create(cur, ddaParams());
    tried = true;
    fx.clear();
    floats = [];
    rings = [];
    popQ = [];
    celebrate = 0;
    result = null;
    intro = 2.4;
    justStarted = true;
    $('tray1p').hidden = humans !== 1;
    $('tray2p').hidden = humans !== 2;
    syncHud();
    Kit.keys.reset();

    var rid = humans === 2 ? 'versus' : 'L' + (cur + 1);
    Kit.stats.round(rid);

    setScreen('play');
    J.whoosh(0.45);
    say(humans === 2 ? 'مواجهة اثنين' : world.L.id + ' ' + world.L.name);
  }

  function startLevel(i) { startMatch(false, i); }
  function startVersus() { J.select(); startMatch(true, 0); }

  function restart() {
    if (!world) return;
    J.select();
    startMatch(humans === 2, cur);
  }

  function pause(byUser) {
    if (screen !== 'play') return;
    popQ = [];
    setScreen('pause');
    if (byUser) J.back();
  }

  function resume() {
    if (screen !== 'pause') return;
    J.select();
    popQ = [];
    setScreen('play');
    Kit.keys.reset();
  }

  /* ------------------------------------------------------ battle actions */
  function cardElFor(sideIdx, kind) {
    if (humans === 1) {
      if (kind === 'key') return hudRefs.p1.upBtn;
      if (kind === 'cannon') return hudRefs.p1.canBtn;
      return hudRefs.p1.cards[kind];
    }
    const ref = hudRefs.two[sideIdx];
    if (kind === 'key') return ref.upBtn;
    if (kind === 'cannon') return ref.canBtn;
    return ref.cards[kind];
  }

  function actSummon(sideIdx, uId, btn) {
    if (screen !== 'play' || !world || world.done || celebrate > 0) return;
    const ok = TC.summon(world, sideIdx, uId);
    if (!ok) {
      wiggle(btn || cardElFor(sideIdx, uId));
    }
    handleEvents();
    syncHud();
    dirty = true;
  }

  function actUpgrade(sideIdx, btn) {
    if (screen !== 'play' || !world || world.done || celebrate > 0) return;
    const ok = TC.upgradeKey(world, sideIdx);
    if (!ok) {
      wiggle(btn || cardElFor(sideIdx, 'key'));
    }
    handleEvents();
    syncHud();
    dirty = true;
  }

  function actCannon(sideIdx, btn) {
    if (screen !== 'play' || !world || world.done || celebrate > 0) return;
    const ok = TC.fireCannon(world, sideIdx);
    if (!ok) {
      wiggle(btn || cardElFor(sideIdx, 'cannon'));
    }
    handleEvents();
    syncHud();
    dirty = true;
  }

  function addFloat(x, y, txt, color, size) {
    floats.push({ x: x, y: y, txt: txt, color: color || '#ffd23f', size: size || 30, t: 0 });
    if (floats.length > 14) floats.shift();
  }

  function burstFx(x, y, count, cols, spd) {
    if (calm()) return;
    fx.burst(x, y, { count: count, colors: cols || CONF_COLS, speed: spd || 260, life: 0.65, size: 7, gravity: 320 });
  }

  function addShake(pwr) {
    if (!calm()) shake.add(pwr);
  }

  /* --------------------------------------------------- result & victory */
  function finishMatch() {
    tried = false;
    if (humans === 2) {
      Kit.stats.end('end');
      const winLeft = world.winner === 1;
      result = {
        humans: 2,
        won: true,
        winner: world.winner,
        stars: 0,
        before: 0,
        res: { best: false, world: -1, coins: 0 },
        hpPct: Math.round((winLeft ? world.sides[0].hp / world.sides[0].hpMax : world.sides[1].hp / world.sides[1].hpMax) * 100),
        time: world.t,
        par: world.L.par
      };
      J.levelUp();
      const fallX = winLeft ? TC.GATE_R : TC.GATE_L;
      burstFx(fallX, TC.GROUND_Y - 80, 42, CONF_COLS, 400);
      addShake(6);
      celebrate = CELEBRATE;
      return;
    }

    const won = world.winner === 1;
    const stars = won ? TC.stars(world) : 0;
    const before = save.lv[cur].s;
    let res = { first: false, best: false, moreStars: false, coins: 0, opened: -1, world: -1 };
    if (won) {
      res = TC.applyResult(save, cur, stars, world.t, world.bubblesPopped * 2);
      persist();
      J.levelUp();
      burstFx(TC.GATE_R, TC.GROUND_Y - 80, 44, CONF_COLS, 400);
    } else {
      J.fail();
      burstFx(TC.GATE_L, TC.GROUND_Y - 80, 24, ['#ff5d73', '#fde047', '#ffffff'], 280);
    }
    dda.result(TC.outcome(world));
    Kit.stats.end(won ? 'win' : 'lose', stars);
    addShake(6);
    result = {
      humans: 1,
      won: won,
      winner: world.winner,
      stars: stars,
      before: before,
      res: res,
      hpPct: Math.round((world.sides[0].hp / world.sides[0].hpMax) * 100),
      time: world.t,
      par: world.L.par
    };
    celebrate = CELEBRATE;
  }

  function showResult() {
    const r = result;
    resultT = 0;
    resultLock = 0.45;
    if (r.humans === 2) {
      $('resTitle').textContent = r.winner === 1 ? 'فازت قلعة اليسار!' : 'فازت قلعة اليمين!';
      $('resStars').hidden = true;
      $('resCoins').hidden = true;
      $('resHp').querySelector('b').textContent = r.hpPct + '%';
      $('resHp').classList.toggle('good', r.hpPct >= 60);
      $('resTime').querySelector('b').textContent = r.time.toFixed(1) + 's';
      $('resTime').classList.remove('good');
      $('resBest').hidden = true;
      $('resWorld').hidden = true;
      $('resNext').hidden = true;
      say($('resTitle').textContent);
    } else {
      $('resTitle').textContent = !r.won ? 'حاول مجددًا!' : r.stars === 3 ? 'ممتاز!' : r.stars === 2 ? 'رائع!' : 'أحسنت!';
      $('resStars').hidden = false;
      $('resStars').querySelectorAll('svg').forEach((s, i) => {
        s.classList.toggle('on', r.won && i < Math.min(r.before, r.stars));
        s.classList.remove('pop');
      });
      $('resHp').querySelector('b').textContent = r.hpPct + '%';
      $('resHp').classList.toggle('good', r.won && r.hpPct >= 60);
      $('resTime').querySelector('b').textContent = r.time.toFixed(1) + ' / ' + r.par;
      $('resTime').classList.toggle('good', r.won && r.time <= r.par);
      $('resCoins').hidden = !r.res.coins;
      $('resCoins').querySelector('b').textContent = '+' + r.res.coins;
      $('resBest').hidden = true;
      $('resWorld').hidden = true;
      $('resNext').hidden = !r.won || cur + 1 >= TC.LEVELS.length;
      say(TC.LEVELS[cur].id + '، ' + r.stars + ' نجوم');
    }
    setScreen('result');
  }

  function resultStep(dt) {
    const r = result, before = resultT;
    resultT += dt;
    if (r.humans === 2 || !r.won) return;
    const at = t => before < t && resultT >= t;
    const base = Math.min(r.before, r.stars);
    for (let i = base; i < r.stars; i++) {
      if (at(0.32 + (i - base) * 0.36)) {
        const s = $('resStars').children[i];
        s.classList.add('on', 'pop');
        J.star(i + 1);
        burstFx(540 + i * 100, 260, 16, ['#ffd23f', '#ffffff'], 280);
      }
    }
    const late = 0.48 + Math.max(0, r.stars - base) * 0.36;
    if (at(late)) {
      if (r.res.best) { $('resBest').hidden = false; J.chime(2); }
      if (r.res.world >= 0) { $('resWorld').hidden = false; J.levelUp(); }
      if (r.res.coins) J.coin(Math.min(5, Math.ceil(r.res.coins / 10)));
    }
  }

  function resultNext() {
    if (!result || resultLock > 0) return;
    if (humans === 2 || !result.won) { resultAgain(); return; }
    if (cur + 1 >= TC.LEVELS.length) { J.back(); toMap(); return; }
    J.select();
    startLevel(cur + 1);
  }

  function resultAgain() {
    if (!result || resultLock > 0) return;
    J.select();
    startMatch(humans === 2, cur);
  }

  /* ------------------------------------------------------- engine events */
  function handleEvents() {
    if (!world) return;
    for (const e of world.ev) {
      const isHumanSide = humans === 2 || e.side === 0;
      switch (e.t) {
        case 'summon':
          if (!e.free && isHumanSide) {
            Kit.track.hit();
            J.pop(0.5);
          } else {
            J.pop(0.28);
          }
          burstFx(e.x, e.y - 20, 8, [e.side === 0 ? '#38bdf8' : '#fb7185', '#ffd23f', '#ffffff'], 180);
          break;
        case 'deny':
          if (isHumanSide) {
            Kit.track.miss();
            J.error();
          }
          break;
        case 'upgrade':
          if (isHumanSide) {
            Kit.track.hit();
            J.chime(e.lv);
            addFloat(e.side === 0 ? 150 : W - 150, TC.GROUND_Y - 170, 'مفتاح ' + e.lv + '!', '#ffd23f', 32);
          }
          break;
        case 'cannon':
          if (isHumanSide) Kit.track.hit();
          J.impact(0.75);
          J.whoosh(0.7);
          addShake(4.5);
          burstFx(e.x, e.y, 18, CONF_COLS, 300);
          break;
        case 'bubble':
          Kit.track.hit();
          J.coin(2);
          burstFx(e.x, e.y, 16, ['#ffd23f', '#ffffff', '#38bdf8'], 240);
          addFloat(e.x, e.y - 18, '+' + e.gain, '#ffd23f', 34);
          break;
        case 'drum':
          J.jump(0.55);
          rings.push({ x: e.x, y: e.y - 16, t: 0, col: '#ffd23f' });
          break;
        case 'whistle':
          J.chime(1);
          addFloat(e.x, e.y - 68, 'توت توت!', '#ffd23f', 26);
          break;
        case 'chargeHit':
          J.impact(0.85);
          addShake(5);
          burstFx(e.x, e.y, 20, ['#ffd23f', '#ff5d73', '#ffffff'], 310);
          addFloat(e.x, e.y - 36, 'بوووم!', '#ffd23f', 34);
          break;
        case 'bonk':
          J.tap();
          burstFx(e.x, e.y, 5, ['#ffffff', '#ffd23f'], 150);
          break;
        case 'burst':
          if (e.kind === 'cannon') {
            J.pop(0.6);
            burstFx(e.x, e.y, 14, CONF_COLS, 260);
          } else {
            burstFx(e.x, e.y, 8, [CONF_COLS[(e.colorIdx || 0) % CONF_COLS.length], '#ffffff'], 170);
          }
          break;
        case 'castleHit':
          J.land(0.5);
          addShake(2.8);
          break;
        case 'defeat':
          if (humans === 1) {
            if (e.by === 0) Kit.track.hit();
            else Kit.track.miss();
          } else {
            Kit.track.hit();
          }
          J.pop(0.45);
          burstFx(e.x, e.y - 20, 14, CONF_COLS, 240);
          break;
        case 'boss':
          J.impact(0.9);
          addShake(5.5);
          addFloat(W - 220, TC.GROUND_Y - 150, 'ملك الألعاب!', '#ff5d73', 40);
          break;
        case 'end':
          finishMatch();
          break;
      }
    }
    world.ev.length = 0;
  }

  /* --------------------------------------------------------------- input */
  onNav($('btnPlay'), play);
  onNav($('btnTwo'), startVersus);
  onNav($('btnLevels'), () => { J.select(); toMap(); });
  onNav($('btnShop'), openShop);
  onNav($('mapHome'), () => { J.back(); toTitle(); });
  onNav($('shopBack'), () => { J.back(); toTitle(); });
  onNav($('btnPause'), () => pause(true));
  onNav($('btnResume'), resume);
  onNav($('btnRestart'), restart);
  onNav($('btnMap'), () => { J.back(); if (humans === 2) toTitle(); else toMap(); });
  onNav($('resNext'), resultNext);
  onNav($('resAgain'), resultAgain);
  onNav($('resMap'), () => { if (resultLock <= 0) { J.back(); if (humans === 2) toTitle(); else toMap(); } });

  const toLogical = e => view.toLogical(e.clientX, e.clientY);
  const inFrame = p => p.x >= 0 && p.x <= W && p.y >= 0 && p.y <= H;

  window.addEventListener('pointermove', e => {
    const p = toLogical(e);
    ptr.x = p.x;
    ptr.y = p.y;
    ptr.inside = inFrame(p);
  });

  canvas.addEventListener('pointerdown', e => {
    focusGame();
    if (e.button !== 0) return;
    const p = toLogical(e);
    ptr.x = p.x;
    ptr.y = p.y;
    ptr.inside = inFrame(p);
    if (screen === 'play' && world && !celebrate && ptr.inside) {
      popQ.push({ x: p.x, y: p.y });
    }
  });

  function handleKeys() {
    const K = Kit.keys, go = K.anyPressed(KEYS_GO);
    if (screen === 'title') {
      if (go) play();
    } else if (screen === 'map') {
      if (go) { J.select(); startLevel(TC.nextLevel(save)); }
      else if (K.pressed('Escape')) { J.back(); toTitle(); }
    } else if (screen === 'shop') {
      if (go || K.pressed('Escape')) { J.back(); toTitle(); }
    } else if (screen === 'play') {
      // In 2P mode KeyP is P2's 4th toy (U I O P [) and KeyR is P1's 4th toy (Q W E R T).
      if (K.pressed('Escape') || (humans === 1 && K.pressed('KeyP'))) {
        pause(true);
        return;
      }
      if (humans === 1 && K.pressed('KeyR') && !celebrate) {
        restart();
        return;
      }
      if (celebrate > 0) return;

      if (humans === 1) {
        if (K.pressed('Digit1')) actSummon(0, 'duck');
        if (K.pressed('Digit2')) actSummon(0, 'frog');
        if (K.pressed('Digit3')) actSummon(0, 'bear');
        if (K.pressed('Digit4')) actSummon(0, 'plane');
        if (K.pressed('Digit5')) actSummon(0, 'train');
        if (K.anyPressed(['Digit6', 'KeyU'])) actUpgrade(0);
        if (K.pressed('Space')) actCannon(0);
      } else {
        // Left Castle (P1): Digit1-Digit5 or Q W E R T, KeyF upgrade, Space cannon
        if (K.anyPressed(['Digit1', 'KeyQ'])) actSummon(0, 'duck');
        if (K.anyPressed(['Digit2', 'KeyW'])) actSummon(0, 'frog');
        if (K.anyPressed(['Digit3', 'KeyE'])) actSummon(0, 'bear');
        if (K.anyPressed(['Digit4', 'KeyR'])) actSummon(0, 'plane');
        if (K.anyPressed(['Digit5', 'KeyT'])) actSummon(0, 'train');
        if (K.pressed('KeyF')) actUpgrade(0);
        if (K.pressed('Space')) actCannon(0);

        // Right Castle (P2): Digit6-Digit0 or U I O P BracketLeft or Numpad1-Numpad5, KeyH upgrade, Enter cannon
        if (K.anyPressed(['Digit6', 'KeyU', 'Numpad1'])) actSummon(1, 'duck');
        if (K.anyPressed(['Digit7', 'KeyI', 'Numpad2'])) actSummon(1, 'frog');
        if (K.anyPressed(['Digit8', 'KeyO', 'Numpad3'])) actSummon(1, 'bear');
        if (K.anyPressed(['Digit9', 'KeyP', 'Numpad4'])) actSummon(1, 'plane');
        if (K.anyPressed(['Digit0', 'BracketLeft', 'Numpad5'])) actSummon(1, 'train');
        if (K.pressed('KeyH')) actUpgrade(1);
        if (K.anyPressed(['Enter', 'NumpadEnter'])) actCannon(1);
      }
    } else if (screen === 'pause') {
      if (K.anyPressed(['KeyP', 'Escape', 'Enter', 'NumpadEnter', 'Space'])) resume();
      else if (K.pressed('KeyR')) restart();
    } else if (screen === 'result' && resultLock <= 0) {
      if (go) resultNext();
      else if (K.pressed('KeyR')) resultAgain();
      else if (K.pressed('Escape')) { J.back(); if (humans === 2) toTitle(); else toMap(); }
    }
  }

  /* ---------------------------------------------------------------- loop */
  function playStep(dt) {
    if (celebrate > 0) {
      popQ.length = 0;
      celebrate -= dt;
      if (celebrate <= 0) showResult();
      return;
    }

    while (popQ.length) {
      const p = popQ.shift();
      TC.popBubble(world, p.x, p.y);
    }

    TC.step(world, dt);
    handleEvents();
    syncHud();

    // Pointer hover cursor on sky star-bubbles
    let overBubble = false;
    if (ptr.inside && world.bubbles.length) {
      for (const b of world.bubbles) {
        if (Math.hypot(b.x - ptr.x, b.y - ptr.y) <= TC.BUBBLE_R) { overBubble = true; break; }
      }
    }
    setCursor(overBubble ? 'pop' : '');
    if (intro > 0) intro = Math.max(0, intro - dt);
  }

  function decay(dt) {
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i];
      f.t += dt;
      if (!calm()) f.y -= dt * 36;
      if (f.t > 1.15) floats.splice(i, 1);
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      rings[i].t += dt;
      if (rings[i].t > 0.45) rings.splice(i, 1);
    }
  }

  function update(dt) {
    uiClock += dt;
    handleKeys();
    if (screen === 'play' && world) {
      if (justStarted) { justStarted = false; dirty = true; }
      else playStep(dt);
    } else {
      justStarted = false;
      popQ.length = 0;
    }
    if (screen !== 'pause') {
      fx.update(dt);
      shake.update(dt);
      decay(dt);
      if (fx.list.length > 260) fx.list.splice(0, fx.list.length - 260);
      if (screen === 'result' && result) resultStep(dt);
      if (resultLock > 0) resultLock = Math.max(0, resultLock - dt);
    }
    Kit.keys.endFrame();
  }

  /* -------------------------------------------------------------- render */
  const RIVAL_TOPPERS = ['crown', 'windmill', 'rocket', 'dragon'];

  function drawHpBar(ctx, x, y, w, side, label, fillCol, isRight) {
    const pct = clamp(side.hp / side.hpMax, 0, 1);
    A.rr(ctx, x, y, w, 40, 20);
    ctx.fillStyle = 'rgba(30, 27, 75, 0.88)';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = A.INK;
    ctx.stroke();

    if (pct > 0) {
      const fw = Math.max(24, (w - 8) * pct);
      const fx0 = isRight ? x + w - 4 - fw : x + 4;
      A.rr(ctx, fx0, y + 4, fw, 32, 16);
      ctx.fillStyle = fillCol;
      ctx.fill();
    }

    const txt = Math.ceil(side.hp) + '/' + side.hpMax;
    A.text(ctx, txt, x + w / 2, y + 21, 22, '#ffffff', { lw: 4.5 });
    A.text(ctx, label, isRight ? x + w - 14 : x + 14, y + 56, 20, '#ffffff', { align: isRight ? 'right' : 'left', lw: 4 });
  }

  function drawTopHud(ctx, still) {
    const wd = TC.WORLDS[world.world] || TC.WORLDS[0];
    const leftLabel = humans === 2 ? 'اللاعب 1' : 'قلعتك';
    const rightLabel = humans === 2 ? 'اللاعب 2' : (world.L.bossWave ? 'ملك الألعاب' : 'قلعة الخصم');

    drawHpBar(ctx, 90, 14, 286, world.sides[0], leftLabel, '#38bdf8', false);
    drawHpBar(ctx, 904, 14, 286, world.sides[1], rightLabel, '#fb7185', true);

    // Center stage pill
    const cx = 446, cw = 388;
    A.rr(ctx, cx, 12, cw, 48, 24);
    ctx.fillStyle = 'rgba(30, 27, 75, 0.88)';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = wd.color;
    ctx.stroke();

    if (humans === 2) {
      A.text(ctx, 'مواجهة اثنين', 640, 37, 26, '#ffd23f', { stroke: false });
    } else {
      A.rr(ctx, cx + cw - 88, 17, 80, 38, 19);
      ctx.fillStyle = wd.color;
      ctx.fill();
      A.text(ctx, world.L.id, cx + cw - 48, 37, 24, A.INK, { stroke: false });
      A.text(ctx, world.L.name, cx + cw - 98, 37, 22, '#ffffff', { align: 'right', stroke: false });

      // Par clock on left end of center pill
      const late = world.t > world.L.par;
      const tStr = Math.floor(world.t) + '/' + world.L.par + 's';
      A.text(ctx, tStr, cx + 18, 37, 20, late ? '#cbd5e1' : '#34d399', { align: 'left', stroke: false });
    }

    if (intro > 0 && !world.done) {
      const a = clamp(Math.min(1, intro / 0.4, (2.4 - intro) / 0.25 + 0.2), 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      const by = 104 - (still ? 0 : Math.max(0, intro - 2.1) * 30);
      A.rr(ctx, 450, by - 26, 380, 52, 26);
      ctx.fillStyle = 'rgba(30, 27, 75, 0.88)';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#ffd23f';
      ctx.stroke();
      const sub = humans === 2 ? 'أرسل الألعاب واهزم قلعة صديقك!' : (world.L.id + ' · ' + world.L.name);
      A.text(ctx, sub, 640, by + 1, 25, '#ffd23f', { stroke: false });
      ctx.restore();
    }
  }

  function drawWorld(ctx) {
    const still = calm(), t = world.t;
    ctx.drawImage(A.backdrop(world.world, pixelScale()), 0, 0, W, H);

    // Bouncy drum pad in middle of lane
    A.drum(ctx, world.drum, t, still);

    // Left & Right Toy Castles
    const p1Theme = TC.THEMES[save.theme] || TC.THEMES[0];
    const p1Top = (TC.TOPPERS[save.topper] || TC.TOPPERS[0]).id;
    const p2Theme = humans === 2
      ? TC.THEMES[(save.theme + 1) % TC.THEMES.length]
      : (TC.RIVAL_THEMES[world.world] || TC.RIVAL_THEMES[0]);
    const p2Top = humans === 2 ? 'dragon' : RIVAL_TOPPERS[world.world % RIVAL_TOPPERS.length];

    A.castle(ctx, world.sides[0], p1Theme, p1Top, t, still);
    A.castle(ctx, world.sides[1], p2Theme, p2Top, t, still);

    // Ground toys first (sorted slightly by y/id), then flying paper gliders on top!
    for (const u of world.units) {
      if (!u.flying) A.unit(ctx, u, t, still);
    }
    for (const u of world.units) {
      if (u.flying) A.unit(ctx, u, t, still);
    }

    // Projectiles & cannon shells
    for (const sh of world.shots) A.shot(ctx, sh, t, still);

    // Floating sky star-bubbles
    for (const b of world.bubbles) A.bubble(ctx, b, t, still);

    // Visual rings, particles & floating labels
    for (const r of rings) {
      const k = r.t / 0.45;
      A.circle(ctx, r.x, r.y, still ? 26 : 16 + k * 42);
      ctx.lineWidth = 5 * (1 - k) + 1;
      ctx.strokeStyle = A.rgba(r.col, Math.max(0, 1 - k));
      ctx.stroke();
    }
    fx.draw(ctx);
    for (const f of floats) {
      ctx.globalAlpha = clamp(1 - Math.max(0, f.t - 0.65) / 0.5, 0, 1);
      A.text(ctx, f.txt, f.x, f.y, f.size, f.color);
    }
    ctx.globalAlpha = 1;

    drawTopHud(ctx, still);
  }

  function drawMenu(ctx) {
    const still = calm(), ps = pixelScale();
    const bgWorld = screen === 'map' ? Math.floor(TC.nextLevel(save) / 3) : screen === 'shop' ? 2 : 0;
    ctx.drawImage(A.backdrop(bgWorld, ps), 0, 0, W, H);

    if (screen === 'title') {
      // Silent cheerful toy parade marching along the bottom playroom floor!
      const p1Theme = TC.THEMES[save.theme] || TC.THEMES[0];
      const p1Top = (TC.TOPPERS[save.topper] || TC.TOPPERS[0]).id;
      A.castle(ctx, { idx: 0, dir: 1, keyLv: 1, hitT: 0, cannonAnim: 0 }, p1Theme, p1Top, uiClock, still);
      A.castle(ctx, { idx: 1, dir: -1, keyLv: 1, hitT: 0, cannonAnim: 0 }, TC.RIVAL_THEMES[0], 'dragon', uiClock, still);

      const parade = ['duck', 'frog', 'bear', 'train'];
      parade.forEach((type, idx) => {
        const span = 860;
        const px = still ? 260 + idx * 210 : 210 + ((uiClock * 75 + idx * 215) % span);
        A.unit(ctx, {
          type: type, side: 0, dir: 1, x: px, y: 668, r: TC.UNITS[type].r,
          hp: 100, hpMax: 100, flying: false, anim: 0, hurtT: 0, phase: idx * 1.4
        }, uiClock, still);
      });
      const planeX = still ? 880 : 1070 - ((uiClock * 95) % 860);
      A.unit(ctx, {
        type: 'plane', side: 1, dir: -1, x: planeX, y: 618, r: 22,
        hp: 100, hpMax: 100, flying: true, anim: 0, hurtT: 0, phase: 0.7
      }, uiClock, still);
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
    buildHud();
    if (world) syncHud();
    if (screen === 'shop') refreshShop();
    dirty = true;
  });

  if (document.fonts && document.fonts.load) {
    document.fonts.load('700 40px Fredoka', 'قلعة 5').then(() => {
      dirty = true;
      if (screen === 'shop') refreshShop();
    }, () => { /* fallback font */ });
  }

  /* --------------------------------------------------- test & debug hook */
  const pagePoint = (x, y) => {
    const r = canvas.getBoundingClientRect();
    return { x: r.left + x * view.scale, y: r.top + y * view.scale };
  };

  window.__game = {
    get state() {
      const w = world;
      return {
        screen: screen,
        paused: screen === 'pause',
        humans: humans,
        level: cur,
        id: w ? w.L.id : '',
        time: w ? Math.round(w.t * 1000) / 1000 : 0,
        energy: w ? Math.floor(w.sides[0].energy) : 0,
        energyRight: w ? Math.floor(w.sides[1].energy) : 0,
        keyLv: w ? w.sides[0].keyLv + 1 : 1,
        keyLvRight: w ? w.sides[1].keyLv + 1 : 1,
        p1Spawned: w ? w.spawned[0] : 0,
        p2Spawned: w ? w.spawned[1] : 0,
        units: w ? w.units.length : 0,
        bubbles: w ? w.bubbles.map(b => ({ x: Math.round(b.x), y: Math.round(b.y) })) : [],
        hpLeft: w ? w.sides[0].hp : 0,
        hpRight: w ? w.sides[1].hp : 0,
        done: !!(w && w.done),
        winner: w ? w.winner : 0,
        stars: result ? result.stars : 0,
        celebrate: celebrate > 0,
        tier: dda.tier,
        fx: fx.list.length,
        shake: shake.power
      };
    },
    get save() { return JSON.parse(JSON.stringify(save)); },
    point: pagePoint
  };

  buildHud();
  buildMap();
  buildShop();
  Kit.muteButton();
  Kit.lifecycle({
    pause: () => pause(false),
    reset: () => { popQ.length = 0; }
  });
  toTitle();
  Kit.loop(update, render);
  Kit.ready();
})();
