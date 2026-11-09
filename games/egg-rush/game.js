/* Egg Rush (سباق البيض): screens, keyboard and mouse, the wordless coach (a ghost kid
 * that shows the way and freezes when a guard wakes), parades of babies, saves, sound
 * and play statistics. engine.js simulates the yard; art.js draws it.
 * This is the UI layer: it reads Kit.dda at every round start and reports Kit.stats
 * rounds and Kit.track hits (eggs hatched), misses (catches) and cues (a guard stirs). */
(function () {
  'use strict';
  const ER = window.ER, A = ER.art, J = Kit.juice, W = ER.W, H = ER.H, TAU = Math.PI * 2;
  const $ = id => document.getElementById(id);
  const canvas = $('game'), ui = $('ui'), ghostEl = $('ghost');
  const calm = () => Kit.motion.reduced();
  let dirty = true;
  const view = Kit.fit(canvas, W, H, { maxDpr: 1.5, onResize: v => {
    ui.style.left = canvas.style.left; ui.style.top = canvas.style.top; ui.style.transform = 'scale(' + v.scale + ')'; dirty = true;
  } });
  const fx = Kit.particles(), shake = Kit.shake();
  const pixelScale = () => Math.min(2, Math.max(0.5, Math.round(view.scale * view.dpr * 4) / 4));
  const WORLD_NAMES = ['المزرعة', 'البركة', 'الثلج', 'الصحراء', 'وادي الديناصورات'];
  const PRAISE = ['رائع!', 'ممتاز!', 'مذهل!', 'خارق!'];
  // A picture lesson on the card before these levels (new mechanics), else just the goal.
  const LESSON = { 0: 'freeze', 1: 'freeze', 3: 'gold', 4: 'water', 7: 'gold', 8: 'ice', 11: 'gold', 12: 'sweep', 15: 'gold', 16: 'patrol', 19: 'giant' };
  const P_COLORS = ['#3f8cff', '#ff5a5f'];
  const MOVE_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD'];

  /* ---------------------------------------------------------------- save */
  const store = Kit.store('egg-rush');
  const saveStatus = Kit.saveStatus({ retry: persist });
  let save = ER.loadSave(store.get('save', null));
  function persist() {
    if (store.set('save', save) === false) { saveStatus.failed(); return false; }
    saveStatus.saved();
    return true;
  }
  // One difficulty controller: the freeze skill carries across the worlds.
  const dda = Kit.dda('egg-rush', { id: 'main' });

  /* --------------------------------------------------------------- state */
  let screen = 'title', world = null, cur = 0, duo = false, time = 0;
  let intro = null, countdown = 0, ending = null, result = null, resultT = 0, resultLock = 0, busyT = 0;
  let menuIdle = 0, menuNext = 5, closetFrom = 'title', tries = 0;
  let parades = [[], []], hatching = [], floats = [], rings = [], slots = [], streak = 0;
  // eggs flying from the home nest up into their slot in the HUD, and slots that pop
  let flyers = [], filled = 0, slotPop = [];
  let idle = 0, ghost = null, happy = [0, 0], squash = [0, 0], stepT = [0, 0], held = {}, stopHint = 0;
  const walk = [0, 0], coneBuf = [];
  const mouse = { x: W / 2, y: H / 2, down: false, known: false };
  const menuKid = { x: 640, y: 600, t: 0, walk: 0, face: 1, babies: [] };
  const roam = [];

  // Fill the current path (if c) and outline it (if lw).
  function paint(ctx, c, lw, ink) {
    if (c) { ctx.fillStyle = c; ctx.fill(); }
    if (lw) { ctx.lineWidth = lw; ctx.strokeStyle = ink; ctx.stroke(); }
  }

  /* ------------------------------------------------------------ screens */
  const SCREENS = { title: 'scrTitle', map: 'scrMap', pause: 'scrPause', result: 'scrResult', barn: 'scrBarn', closet: 'scrCloset' };
  function setScreen(name) {
    screen = name;
    for (const k in SCREENS) $(SCREENS[k]).hidden = k !== name;
    $('hud').hidden = name !== 'play';
    stopHand();
    menuIdle = 0; menuNext = 5;
    dirty = true;
    if (name === 'play') focusGame();
  }
  function focusGame() { try { canvas.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  function say(text) { $('live').textContent = text; }
  function starsText(n) { return n === 1 ? 'نجمة واحدة' : n === 2 ? 'نجمتان' : n + ' نجوم'; }
  function setChip(id) { $(id).querySelector('b').textContent = String(ER.total(save)); }
  function hasNewItem() { return ER.unlocks(save.seen, ER.total(save)).length > 0; }

  function toTitle() {
    world = null;
    setScreen('title');
    setChip('titleStars');
    $('btnCloset').classList.toggle('ring', hasNewItem());
    makeTitleParade();
  }
  // A child who has never played goes straight into the first yard; others see the map.
  function play() {
    J.select();
    if (!ER.total(save)) startLevel(0);
    else toMap();
  }

  /* ---------------------------------------------------------------- map */
  const cards = [], lvlButtons = [];
  function buildMap() {
    const box = $('cards');
    for (let w = 0; w < 5; w++) {
      const card = document.createElement('div');
      card.className = 'wcard';
      const pic = document.createElement('canvas');
      pic.width = 202 * 1.5; pic.height = 200 * 1.5;
      card.appendChild(pic);
      card.insertAdjacentHTML('beforeend', '<div class="wlock" aria-hidden="true"><svg><use href="#i-lock"/></svg></div><b class="wname">' + WORLD_NAMES[w] + '</b><span class="wstars"><svg aria-hidden="true"><use href="#i-star"/></svg><i>0</i>/12</span><div class="lvls"></div>');
      const grid = card.querySelector('.lvls');
      for (let l = 0; l < 4; l++) {
        const li = w * 4 + l, b = document.createElement('button');
        b.type = 'button'; b.className = 'lvl' + (l === 3 ? ' gold-lvl' : '');
        b.dataset.li = String(li);
        b.innerHTML = '<b>' + (l + 1) + '</b><span class="st" aria-hidden="true">' + '<svg><use href="#i-star"/></svg>'.repeat(3) + '</span><svg class="lk" aria-hidden="true"><use href="#i-lock"/></svg>';
        on(b, () => pickLevel(li, b));
        grid.appendChild(b); lvlButtons.push(b);
      }
      box.appendChild(card); cards.push({ el: card, pic: pic });
    }
  }
  function refreshMap() {
    const next = ER.nextLevel(save);
    cards.forEach((c, w) => {
      const open = ER.worldOpen(save, w);
      c.el.classList.toggle('locked', !open);
      c.el.querySelector('.wstars i').textContent = String(ER.worldStars(save, w));
      paintWorldPic(c.pic, w);
    });
    lvlButtons.forEach((b, li) => {
      const ok = ER.isOpen(save, li), stars = save.stars[li];
      b.classList.toggle('locked', !ok);
      b.classList.toggle('done', stars > 0);
      b.classList.toggle('next', ok && li === next && !stars);
      b.querySelectorAll('.st svg').forEach((s, i) => s.classList.toggle('on', i < stars));
      b.setAttribute('aria-label', WORLD_NAMES[Math.floor(li / 4)] + '، المرحلة ' + (li % 4 + 1) + (ok ? (stars ? '، ' + starsText(stars) : '') : ' (مقفلة)'));
    });
    setChip('mapStars');
  }
  function paintWorldPic(c, w) {
    const g = c.getContext('2d'), B = A.BIOME[ER.WORLDS[w].id];
    g.setTransform(c.width / 202, 0, 0, c.height / 200, 0, 0);
    const gr = g.createLinearGradient(0, 0, 0, 200); gr.addColorStop(0, B.g0); gr.addColorStop(1, B.g1);
    g.fillStyle = gr; g.fillRect(0, 0, 202, 200);
    for (let i = 0; i < 9; i++) { A.ell(g, (i * 53) % 202, 30 + (i * 71) % 170, 26, 12); g.fillStyle = A.alpha(B.light, 0.45); g.fill(); }
    if (w === 1) { A.rr(g, -20, 130, 120, 90, 36); g.fillStyle = '#4fc3f7'; g.fill(); }
    if (w === 2) { A.rr(g, 110, 120, 110, 90, 26); g.fillStyle = '#bfeaff'; g.fill(); }
    A.nest(g, 112, 132, 'n');
    A.egg(g, 100, 122, w, 0, -0.1);
    A.egg(g, 124, 124, w, w === 4 ? 2 : 1, 0.15, w === 4 ? 0.7 : 1);
    const scale = w === 4 ? 0.85 : w === 3 ? 1.05 : 1.3;
    g.save(); g.translate(150, w === 4 ? 116 : 100); g.scale(scale, scale);
    A.guard(g, { kind: ER.WORLDS[w].guard, x: 0, y: 0, dir: Math.PI, look: Math.PI, state: 'sleep', t: 1, dur: 1, air: 0 }, 0, true);
    g.restore();
    A.text(g, 'Z', 128, 30, 26, '#ffffff', { stroke: 6 });
    A.text(g, 'z', 150, 14, 18, '#ffffff', { stroke: 5 });
    A.baby(g, 50, 178, w, 0, 1, 0, 1.2);
    A.baby(g, 92, 184, w, w > 0 ? 1 : 0, -1, 0, 1);
  }
  function toMap() {
    world = null;
    refreshMap();
    setScreen('map');
    J.whoosh(0.4);
  }
  function wiggle(el) { el.classList.remove('wiggle'); void el.offsetWidth; el.classList.add('wiggle'); setTimeout(() => el.classList.remove('wiggle'), 500); }
  function pickLevel(li, el) {
    if (!ER.isOpen(save, li)) { J.tap(); wiggle(el); return; }
    J.select(); startLevel(li);
  }

  /* -------------------------------------------------------------- closet */
  const items = [];
  function buildCloset() {
    [['color', ER.COLORS, 'colors'], ['hat', ER.HATS, 'hats']].forEach(([type, list, id]) => {
      list.forEach((it, i) => {
        const b = document.createElement('button'), c = document.createElement('canvas');
        b.type = 'button'; b.className = 'er-btn item';
        c.width = c.height = 120;
        b.appendChild(c);
        b.insertAdjacentHTML('beforeend', '<svg class="lockic" aria-hidden="true"><use href="#i-lock"/></svg><span class="need"><svg aria-hidden="true"><use href="#i-star"/></svg>' + it.need + '</span>');
        on(b, () => equip(type, i, b));
        $(id).appendChild(b);
        items.push({ type: type, i: i, el: b, c: c });
      });
    });
  }
  function itemIcon(c, it) {
    const g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height);
    g.save(); g.scale(c.width / 120, c.height / 120);
    if (it.type === 'color') A.kid(g, 60, 76, { color: ER.COLORS[it.i].c, hat: save.hat, t: 0, scale: 1.25, still: true });
    else { g.translate(60, 124); g.scale(1.85, 1.85); A.kid(g, 0, 0, { color: ER.COLORS[save.color].c, hat: it.i, t: 0, still: true }); }
    g.restore();
  }
  function refreshCloset() {
    const total = ER.total(save);
    items.forEach(it => {
      const list = it.type === 'color' ? ER.COLORS : ER.HATS, locked = list[it.i].need > total;
      it.el.classList.toggle('locked', locked);
      it.el.classList.toggle('on', (it.type === 'color' ? save.color : save.hat) === it.i);
      it.el.setAttribute('aria-label', (it.type === 'color' ? 'لون ' : 'قبعة ') + (it.i + 1) + (locked ? ' (مقفل)' : ''));
      itemIcon(it.c, it);
    });
    setChip('closetStars');
  }
  function openCloset(from) {
    closetFrom = from;
    J.select();
    if (save.seen !== ER.total(save)) { save.seen = ER.total(save); persist(); }
    refreshCloset();
    setScreen('closet');
  }
  function closeCloset() { J.back(); if (closetFrom === 'map') toMap(); else toTitle(); }
  function equip(type, i, el) {
    const list = type === 'color' ? ER.COLORS : ER.HATS;
    if (list[i].need > ER.total(save)) { J.tap(); wiggle(el); return; }
    if (type === 'color') save.color = i; else save.hat = i;
    persist();
    J.select(); happy[0] = 1; squash[0] = 0.2;
    fx.burst(960, 420, { count: 26, colors: ['#ffd23f', '#ffffff', ER.COLORS[save.color].c], speed: 320, life: 0.7, size: 8, gravity: 240 });
    refreshCloset();
  }

  /* --------------------------------------------------------------- barn */
  const tiles = [];
  function buildBarn() {
    for (let gold = 0; gold < 2; gold++) for (let w = 0; w < 5; w++) {
      const d = document.createElement('div'), c = document.createElement('canvas');
      d.className = 'tile' + (gold ? ' gold' : '');
      c.width = c.height = 150;
      d.appendChild(c);
      d.insertAdjacentHTML('beforeend', '<b>0</b>');
      $('barnTiles').appendChild(d);
      tiles.push({ el: d, c: c, w: w, gold: gold });
    }
  }
  function openBarn() {
    J.select();
    tiles.forEach(t => {
      const n = t.gold ? save.golden[t.w] : save.babies[t.w] - save.golden[t.w];
      t.el.classList.toggle('none', n <= 0);
      t.el.querySelector('b').textContent = n > 0 ? '×' + n : '?';
      t.el.setAttribute('aria-label', String(Math.max(0, n)));
      A.babyIcon(t.c, t.w, t.gold, false);
    });
    roam.length = 0;
    for (let w = 0; w < 5; w++) {
      const n = Math.min(4, save.babies[w]);
      for (let i = 0; i < n; i++) roam.push({ w: w, gold: i < save.golden[w], x: 120 + Math.random() * 1040, y: 560 + Math.random() * 120, tx: 0, ty: 0, wait: Math.random() * 2, hop: 0, face: 1 });
    }
    setScreen('barn');
  }

  /* -------------------------------------------------------------- rounds */
  function resetRound() {
    parades = [[], []]; hatching = []; floats = []; rings = []; slots = []; streak = 0; flyers = []; filled = 0; slotPop = [];
    ghost = null; idle = 0; happy = [0, 0]; squash = [0, 0]; held = {}; stopHint = 0;
    fx.clear(); ending = null; result = null; countdown = 0; mouse.down = false;
  }
  function startLevel(li, quick) {
    // Difficulty is read at every round start, before the round is reported.
    const tier = dda.tier;
    const plan = ER.plan(li, tier);
    world = ER.create(plan, (Math.random() * 2147483647) | 0);
    cur = li; duo = false; tries++;
    Kit.stats.round(plan.id);
    if (li === 0 && !save.coached) Kit.stats.tutorial('start');
    resetRound();
    const lesson = LESSON[li] || '';
    intro = quick ? null : { t: 0, max: lesson ? 14 : 3.2, lesson: lesson, out: 0 };
    setScreen('play');
    Kit.keys.reset();
    J.whoosh(0.5);
    say(WORLD_NAMES[plan.w] + ' ' + (plan.l + 1));
  }
  function startDuo() {
    const tier = Math.min(3, dda.tier);
    const b = save.duo % (ER.topWorld(save) + 1);
    const plan = ER.duoPlan(b, tier);
    world = ER.create(plan, (Math.random() * 2147483647) | 0);
    cur = -1; duo = true; tries++;
    Kit.stats.round('duo');
    resetRound();
    intro = { t: 0, max: 14, lesson: 'duo', out: 0 };
    setScreen('play');
    Kit.keys.reset();
    J.whoosh(0.5);
    say('سباق اثنين');
  }
  function closeIntro() {
    if (!intro || intro.out) return;
    intro.out = 0.0001;
    J.whoosh(0.6);
    if (duo) countdown = 3.6;
    idle = 0;
  }
  function restart() { J.select(); if (duo) startDuo(); else startLevel(cur, true); }
  function pause(own) {
    if (screen !== 'play') return;
    $('btnMenu').querySelector('use').setAttribute('href', duo ? '#i-home' : '#i-map');
    setScreen('pause');
    mouse.down = false;
    if (own) J.back();
  }
  function resume() {
    if (screen !== 'pause') return;
    J.select();
    setScreen('play');
    Kit.keys.reset();
  }
  function quitToMenu() {
    // A solo level left from the pause is a quit; a two-player race reports only its end.
    if (!duo) Kit.stats.end('quit');
    J.back();
    if (duo) toTitle(); else toMap();
  }

  // A result is saved the moment the level is finished, before the celebration.
  function finishLevel() {
    const r = ER.result(world), stars = ER.stars(r), li = cur, prev = save.stars[li], before = ER.total(save);
    const tenths = Math.max(1, Math.round(r.time * 10)), prevBest = save.best[li];
    if (stars > prev) save.stars[li] = stars;
    if (!prevBest || tenths < prevBest) save.best[li] = tenths;
    const coach = li === 0 && !save.coached;
    if (coach) save.coached = true;
    const nextOpen = li < 19 && ER.isOpen(save, li + 1);
    persist();
    dda.result(ER.outcome(r));
    Kit.stats.end('win', r.eggs);
    if (coach) Kit.stats.tutorial('done');
    result = { duo: false, stars: stars, prev: prev, r: r, newBest: prev > 0 && (stars > prev || tenths < prevBest), items: ER.unlocks(before, ER.total(save)), nextOpen: nextOpen };
    ending = { t: 1.9 };
    happy[0] = 2;
    J.levelUp();
    confetti();
    shake.add(5);
  }
  function finishDuo() {
    const r = ER.result(world), win = ER.winner(world);
    save.duo = (save.duo + 1) % 100000;
    persist();
    Kit.stats.end(win < 0 ? 'draw' : 'end', r.eggs);
    result = { duo: true, win: win, r: r };
    ending = { t: 2.1 };
    if (win >= 0) happy[win] = 2.5; else happy = [2.5, 2.5];
    J.levelUp();
    confetti();
  }
  function confetti() {
    if (calm()) return;
    for (let i = 0; i < 6; i++) fx.burst(140 + i * 200, 150, { count: 22, colors: ['#ff7eb6', '#ffd23f', '#4fd1ff', '#5be38f', '#ffffff', '#ff9a2e'], speed: 420, life: 1.2, size: 9, gravity: 420 });
  }
  function showResult() {
    ending = null; resultT = 0; resultLock = 0.6;
    const r = result;
    $('resStars').hidden = r.duo;
    $('resDuo').hidden = !r.duo;
    $('resFacts').hidden = r.duo;
    $('resNewBest').hidden = true;
    $('resGift').hidden = true;
    $('resStars').querySelectorAll('svg').forEach(s => s.classList.remove('on'));
    $('resAgain').hidden = r.duo;
    $('resMenu').querySelector('use').setAttribute('href', r.duo ? '#i-home' : '#i-map');
    $('resMenu').setAttribute('aria-label', r.duo ? 'البداية' : 'الخريطة');
    if (r.duo) {
      $('resP1').textContent = String(r.r.scores[0]); $('resP2').textContent = String(r.r.scores[1]);
      $('resWinner').textContent = r.win < 0 ? 'تعادل!' : 'فاز ' + (r.win + 1) + '!';
      $('resNext').setAttribute('aria-label', 'مرة أخرى');
      say(r.win < 0 ? 'تعادل' : 'فاز اللاعب ' + (r.win + 1));
    } else {
      $('resTime').textContent = String(Math.round(r.r.time));
      $('resEggs').textContent = String(r.r.eggs);
      $('resNext').setAttribute('aria-label', r.nextOpen ? 'المرحلة التالية' : 'الخريطة');
      say(starsText(r.stars));
    }
    setScreen('result');
  }
  // Stars pop in one by one on the game clock, then the rewards.
  function resultStep(dt) {
    const r = result, before = resultT;
    resultT += dt;
    const at = t => before < t && resultT >= t;
    if (!r.duo) {
      for (let i = 0; i < r.stars; i++) if (at(0.3 + i * 0.38)) { $('resStars').children[i].classList.add('on'); J.star(i + 1); fx.burst(500 + i * 140, 380, { count: 16, colors: ['#ffd23f', '#ffffff'], speed: 300, life: 0.6, size: 8, gravity: 300 }); }
      if (at(0.45 + r.stars * 0.38)) {
        if (r.newBest) { $('resNewBest').hidden = false; J.chime(3); }
        if (r.items.length) { const it = r.items[r.items.length - 1]; itemIcon($('giftCanvas'), it); $('resGift').hidden = false; J.chime(3); }
      }
    } else if (at(0.35)) J.star(3);
    busyT += dt;
    if (resultT < 3 && busyT >= 1) { busyT = 0; Kit.stats.busy(); }
  }
  function next() {
    if (!result) return;
    J.select();
    if (result.duo) startDuo();
    else if (result.nextOpen) startLevel(cur + 1);
    else toMap();
  }
  function again() { if (!result) return; J.select(); if (result.duo) startDuo(); else startLevel(cur, true); }

  /* --------------------------------------------------------------- input */
  // A mouse click hands the keyboard back to the game; keyboard activation keeps focus.
  // The second click of a double click is dropped (it would land on the next screen).
  function on(el, fn) {
    el.addEventListener('click', e => { e.stopPropagation(); if (e.detail > 1) return; Kit.audio.unlock(); if (e.detail > 0) { el.blur(); focusGame(); } fn(e); });
  }
  on($('btnPlay'), play);
  on($('btnDuo'), () => { J.select(); startDuo(); });
  on($('btnBarn'), openBarn);
  on($('btnCloset'), () => openCloset('title'));
  on($('mapHome'), () => { J.back(); toTitle(); });
  on($('btnPause'), () => pause(true));
  on($('btnResume'), resume);
  on($('btnRestart'), restart);
  on($('btnMenu'), quitToMenu);
  on($('resNext'), () => { if (resultLock <= 0) next(); });
  on($('resAgain'), () => { if (resultLock <= 0) again(); });
  on($('resMenu'), () => { if (resultLock <= 0) { J.back(); if (result && result.duo) toTitle(); else toMap(); } });
  on($('resGift'), () => openCloset('map'));
  on($('closetBack'), closeCloset);
  on($('barnBack'), () => { J.back(); toTitle(); });

  window.addEventListener('pointermove', e => {
    const p = view.toLogical(e.clientX, e.clientY);
    mouse.x = p.x; mouse.y = p.y; mouse.known = true;
  });
  canvas.addEventListener('pointerdown', e => {
    focusGame();
    if (e.button !== 0) return;
    const p = view.toLogical(e.clientX, e.clientY);
    mouse.x = p.x; mouse.y = p.y; mouse.known = true; menuIdle = 0;
    if (screen !== 'play') return;
    if (intro && !intro.out) { closeIntro(); return; }
    if (!duo) mouse.down = true;
  });
  window.addEventListener('pointerup', () => { mouse.down = false; });
  window.addEventListener('keydown', e => { if (Kit.isGameKeyEvent(e) && !e.repeat) menuIdle = 0; });

  function handleKeys() {
    const K = Kit.keys, go = K.anyPressed(['Enter', 'NumpadEnter', 'Space']);
    if (screen === 'title') { if (go) play(); }
    else if (screen === 'map') { if (go) { const n = ER.nextLevel(save); J.select(); startLevel(n); } else if (K.pressed('Escape')) { J.back(); toTitle(); } }
    else if (screen === 'closet') { if (go || K.pressed('Escape')) closeCloset(); }
    else if (screen === 'barn') { if (go || K.pressed('Escape')) { J.back(); toTitle(); } }
    else if (screen === 'play') {
      if (K.anyPressed(['KeyP', 'Escape'])) pause(true);
      else if (intro && !intro.out && (go || K.anyPressed(MOVE_KEYS))) closeIntro();
    } else if (screen === 'pause') { if (K.anyPressed(['KeyP', 'Escape', 'Enter', 'NumpadEnter', 'Space'])) resume(); else if (K.pressed('KeyR')) restart(); }
    else if (screen === 'result' && resultLock <= 0) {
      if (go) next(); else if (K.pressed('KeyR')) again();
      else if (K.pressed('Escape')) { J.back(); if (result.duo) toTitle(); else toMap(); }
    }
  }
  const axis = (K, neg, pos) => (K.anyDown(pos) ? 1 : 0) - (K.anyDown(neg) ? 1 : 0);
  function readInput() {
    const K = Kit.keys;
    if (duo) {
      return [{ x: axis(K, ['KeyA'], ['KeyD']), y: axis(K, ['KeyW'], ['KeyS']) }, { x: axis(K, ['ArrowLeft'], ['ArrowRight']), y: axis(K, ['ArrowUp'], ['ArrowDown']) }];
    }
    let x = axis(K, ['ArrowLeft', 'KeyA'], ['ArrowRight', 'KeyD']), y = axis(K, ['ArrowUp', 'KeyW'], ['ArrowDown', 'KeyS']);
    // Holding the mouse button walks towards the pointer.
    if (!x && !y && mouse.down) {
      const p = world.players[0], dx = mouse.x - p.x, dy = mouse.y - p.y, d = Math.hypot(dx, dy);
      if (d > 18) { x = dx / d; y = dy / d; }
    }
    return [{ x: x, y: y }];
  }

  /* -------------------------------------------------- the ghost-hand on menus */
  const hand = { on: false, x: 0, y: 0, t: 0, tx: 0, ty: 0, alpha: 0 };
  function stopHand() { hand.on = false; ghostEl.hidden = true; }
  function handTarget() {
    let el = null;
    if (screen === 'title') el = $('btnPlay');
    else if (screen === 'map') el = document.querySelector('.lvl.next') || document.querySelector('.lvl:not(.locked)');
    else if (screen === 'result' && resultT > 1.5) el = $('resNext');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return r.width ? view.toLogical(r.left + r.width / 2, r.top + r.height / 2) : null;
  }
  function handStep(dt) {
    if (!hand.on) return;
    hand.t += dt;
    const k = Math.min(1, hand.t / 0.9), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    const x = hand.tx + 150 * (1 - e), y = hand.ty + 120 * (1 - e);
    const press = hand.t > 0.9 && hand.t < 1.8 && !calm() ? Math.max(0, Math.sin((hand.t - 0.9) / 0.45 * Math.PI)) : 0;
    hand.alpha = hand.t < 2.2 ? Math.min(1, hand.t * 4) : Math.max(0, 1 - (hand.t - 2.2) * 4);
    ghostEl.style.transform = 'translate(' + (x - 33).toFixed(1) + 'px,' + (y - 5 + press * 14).toFixed(1) + 'px)';
    ghostEl.style.opacity = (0.92 * hand.alpha).toFixed(2);
    if (hand.t > 2.5) stopHand();
  }
  function menuHand() {
    const p = handTarget();
    if (!p) return;
    hand.on = true; hand.t = 0; hand.tx = p.x; hand.ty = p.y;
    ghostEl.hidden = false;
    handStep(0);
  }

  /* ------------------------------------------------------------- sounds */
  const tone = o => Kit.audio.tone(o);
  const SFX = {
    hmm() { tone({ freq: 300, to: 470, type: 'sine', dur: 0.3, vol: 0.16 }); tone({ freq: 470, to: 640, type: 'sine', dur: 0.14, vol: 0.12, delay: 0.3 }); },
    blink() { tone({ freq: 880, to: 1250, type: 'triangle', dur: 0.06, vol: 0.08 }); },
    yawn() { tone({ freq: 430, to: 250, type: 'sine', dur: 0.42, vol: 0.06 }); },
    squawk() { tone({ freq: 980, to: 620, type: 'sawtooth', dur: 0.12, vol: 0.1 }); tone({ freq: 1180, to: 720, type: 'sawtooth', dur: 0.14, vol: 0.09, delay: 0.12 }); J.impact(0.2); },
    chirp() { tone({ freq: 1700, to: 2600, type: 'sine', dur: 0.07, vol: 0.12 }); tone({ freq: 1900, to: 2900, type: 'sine', dur: 0.08, vol: 0.11, delay: 0.11 }); },
    step(water) { if (water) Kit.audio.noise({ dur: 0.08, vol: 0.05, filter: 1400, to: 500 }); else tone({ freq: 170 + Math.random() * 30, to: 120, type: 'triangle', dur: 0.045, vol: 0.045 }); }
  };

  /* ------------------------------------------------------------- effects */
  function float(x, y, text, color, size) {
    floats.push({ x: x, y: y, text: text, color: color, size: size || 34, t: 0 });
    if (floats.length > 16) floats.shift();
  }
  function ring(x, y, r0, r1, color, life) {
    rings.push({ x: x, y: y, r0: r0, r1: r1, t: 0, life: life || 0.4, color: color || '255,255,255' });
    if (rings.length > 24) rings.shift();
  }
  const babyWorld = () => world.plan.w;
  function onHatch(e) {
    if (!duo) Kit.track.hit();
    const bw = babyWorld();
    save.babies[bw] = Math.min(999999, save.babies[bw] + 1);
    if (e.gold) save.golden[bw] = Math.min(save.babies[bw], save.golden[bw] + 1);
    persist();
    hatching.push({ x: e.x, y: e.y, p: e.p, w: bw, gold: e.gold, t: 0 });
    if (!duo) for (let i = 0; i < e.value; i++) { slots.push(e.gold ? 1 : 0); flyers.push({ i: slots.length - 1, x: e.x, y: e.y - 40, t: -i * 0.08, gold: e.gold }); }
    J.coin(2);
    happy[e.p] = 1.2; squash[e.p] = 0.25;
    idle = 0; ghost = null;
    streak++;
    float(e.x + (e.p ? -10 : 10), e.y - 90, '+' + e.value, e.gold ? '#ffd23f' : '#ffffff', e.gold ? 46 : 38);
    if (streak >= 2) { float(e.x + (e.p ? -60 : 120), e.y - 140, PRAISE[Math.min(3, streak - 2)], '#ffd23f', 44); J.streak(streak); }
  }
  function feathers(x, y, kind) {
    const col = kind === 'penguin' ? ['#2f3a56', '#ffffff'] : kind === 'ostrich' ? ['#3a2f3f', '#ffffff'] : kind === 'dino' ? ['#7ad85a', '#ffb347'] : ['#ffffff', '#fff2c8'];
    fx.burst(x, y - 20, { count: 16, colors: col, speed: 260, life: 0.8, size: 7, gravity: 160 });
  }
  function handleEvents() {
    for (const e of world.ev) {
      const g = e.g != null ? world.guards[e.g] : null;
      if (e.t === 'stir') { if (!duo) Kit.track.cue(); SFX.hmm(); if (cur <= 1 && !duo) stopHint = g.dur; }
      else if (e.t === 'wake') SFX.blink();
      else if (e.t === 'sleep') {
        SFX.yawn();
        // Stood still in its eyes and got away with it: praise.
        if (held[e.g]) { held[e.g] = false; const p = world.players[0]; float(p.x, p.y - 100, 'أحسنت!', '#7fffb0', 40); J.chime(1); ring(p.x, p.y - 20, 20, 70, '127,255,176', 0.5); }
      } else if (e.t === 'caught') {
        SFX.squawk(); shake.add(7);
        if (!duo) Kit.track.miss();
        streak = 0; held = {};
        feathers(e.gx, e.gy, g.kind);
        ring(e.x, e.y - 20, 20, 80, '255,90,90', 0.45);
      } else if (e.t === 'hop') J.jump(0.25);
      else if (e.t === 'bump') { J.impact(0.5); shake.add(5); feathers(e.x, e.y, g.kind); }
      else if (e.t === 'drop') J.whoosh(0.3);
      else if (e.t === 'back') { J.land(0.15); ring(e.x, e.y, 10, 40); }
      else if (e.t === 'pick') {
        J.pop(0.6); J.coin(1);
        squash[e.p] = 0.22; idle = 0; ghost = null;
        fx.burst(e.x, e.y - 10, { count: 14, colors: e.gold ? ['#ffd23f', '#ffffff', '#fff3b0'] : ['#ffffff', '#fff3b0', '#ffd23f'], speed: 240, life: 0.55, size: 7, gravity: 260 });
        ring(e.x, e.y, 12, 50, e.gold ? '255,210,63' : '255,255,255');
      } else if (e.t === 'lay') { J.pop(0.25); ring(e.x, e.y, 8, 44, '255,236,150'); }
      else if (e.t === 'hatch') onHatch(e);
      else if (e.t === 'steal') { J.impact(0.5); shake.add(4); float(e.x, e.y - 70, '!', '#ff5a5f', 54); ring(e.x, e.y, 16, 70, '255,90,90'); }
      else if (e.t === 'done' || e.t === 'timeup') { if (duo) finishDuo(); else finishLevel(); }
    }
    world.ev.length = 0;
  }

  /* ------------------------------------------------------- the ghost kid */
  // After a few idle seconds a see-through kid walks the way to the next egg and home,
  // freezing whenever a guard stirs or looks (with the stop hand), and lights the keys.
  function eyeOf(g, dir) { return { x: g.x + Math.cos(dir) * g.r * 0.55, y: g.y + Math.sin(dir) * g.r * 0.55 }; }
  // 2: in the eyes of a looking guard; 1: where a stirring guard may look.
  function threat(x, y) {
    let t = 0;
    for (const g of world.guards) {
      if (g.state === 'awake' && ER.inCone(world, g, x, y)) return 2;
      if (g.state === 'stir' || g.state === 'alert') {
        const e = eyeOf(g, g.look), d = Math.hypot(x - e.x, y - e.y);
        if (d <= g.len && Math.abs(ER.wrap(Math.atan2(y - e.y, x - e.x) - g.look)) <= g.half + g.sweep && ER.clear(world, e.x, e.y, x, y)) t = 1;
      }
    }
    return t;
  }
  function nearestEgg(x, y) {
    let best = null, bd = 1e9;
    for (const e of world.eggsList) if (e.state === 'nest') { const d = Math.hypot(e.x - x, e.y - y); if (d < bd) { bd = d; best = e; } }
    return best;
  }
  function startGhost() {
    const p = world.players[0];
    const egg = p.carry ? null : nearestEgg(p.x, p.y);
    const to = egg ? { x: egg.x, y: egg.y } : { x: p.home.x, y: p.home.y };
    const path = ER.path(world, p.x, p.y, to.x, to.y);
    if (!path.length) { idle = 0; return; }
    ghost = { x: p.x, y: p.y, path: path, carry: !!p.carry, gold: p.carry ? p.carry.gold : 0, home: !egg, a: 0, out: 0, walk: 0, face: p.face, hold: false, dx: 0, dy: 0 };
  }
  function ghostStep(dt) {
    if (!ghost) return;
    const gh = ghost;
    if (gh.out) { gh.out += dt; gh.a = Math.max(0, 1 - gh.out * 2); if (gh.out > 0.5) { ghost = null; idle = 0; } return; }
    gh.a = Math.min(1, gh.a + dt * 3);
    // In the farm the coach freezes whenever any hen opens an eye (the first lesson);
    // later it freezes only where a guard could see it, or one step ahead.
    const pt = gh.path[0];
    let ax = gh.x, ay = gh.y;
    if (pt) { const d0 = Math.hypot(pt.x - gh.x, pt.y - gh.y) || 1, k = Math.min(1, 40 / d0); ax += (pt.x - gh.x) * k; ay += (pt.y - gh.y) * k; }
    gh.hold = threat(gh.x, gh.y) > 0 || threat(ax, ay) > 0 || (cur < 4 && world.guards.some(g => g.state === 'stir' || g.state === 'awake' || g.state === 'alert'));
    gh.dx = gh.dy = 0;
    if (gh.hold) return;
    if (!pt) {
      if (!gh.home) {
        const p = world.players[0], path = ER.path(world, gh.x, gh.y, p.home.x, p.home.y);
        const egg = nearestEgg(gh.x, gh.y);
        gh.carry = true; gh.gold = egg ? egg.gold : 0; gh.home = true; gh.path = path;
        if (!path.length) gh.out = 0.0001;
      } else gh.out = 0.0001;
      return;
    }
    const dx = pt.x - gh.x, dy = pt.y - gh.y, d = Math.hypot(dx, dy), s = world.T.speed * 0.8 * dt;
    if (d <= s) { gh.x = pt.x; gh.y = pt.y; gh.path.shift(); }
    else { gh.x += dx / d * s; gh.y += dy / d * s; gh.dx = dx / d; gh.dy = dy / d; }
    if (Math.abs(gh.dx) > 0.2) gh.face = gh.dx > 0 ? 1 : -1;
    gh.walk += s * 0.09;
  }

  /* ---------------------------------------------------------------- loop */
  function paradeStep(dt) {
    if (!world) return;
    world.players.forEach((p, i) => {
      const list = parades[i];
      let lx = p.x, ly = p.y + 6;
      for (let j = 0; j < list.length; j++) {
        const b = list[j], dx = lx - b.x, dy = ly - b.y, d = Math.hypot(dx, dy), gap = j === 0 ? 34 : 27;
        if (d > gap) {
          const m = d - gap;
          b.x += dx / d * m; b.y += dy / d * m;
          b.hop = (b.hop + m / 34) % 1;
          if (Math.abs(dx) > 1) b.face = dx > 0 ? 1 : -1;
        } else if (b.hop > 0) b.hop = Math.min(1, b.hop + dt * 3) % 1;
        lx = b.x; ly = b.y;
      }
    });
    for (let i = hatching.length - 1; i >= 0; i--) {
      const h = hatching[i], before = h.t;
      h.t += dt;
      if (before < 0.55 && h.t >= 0.55) {
        SFX.chirp(); J.chime(h.gold ? 3 : 2);
        fx.burst(h.x, h.y - 16, { count: 12, colors: ['#ffffff', A.EGG[h.w].base, '#fff3b0'], speed: 260, life: 0.6, size: 7, gravity: 520 });
        fx.burst(h.x, h.y - 30, { count: 22, colors: ['#ff7eb6', '#ffd23f', '#4fd1ff', '#5be38f', '#ffffff'], speed: 360, life: 0.9, size: 8, gravity: 360 });
        ring(h.x, h.y - 10, 20, 90, '255,236,150', 0.5);
        shake.add(3);
      }
      if (h.t >= 1.15) {
        hatching.splice(i, 1);
        const list = parades[h.p];
        if (list.length < 30) list.push({ w: h.w, gold: h.gold, x: h.x, y: h.y, hop: 0, face: 1 });
      }
    }
  }
  function playStep(dt) {
    if (intro) {
      if (intro.out) { intro.out += dt; if (intro.out > 0.35) intro = null; }
      else {
        intro.t += dt;
        // the picture card is a moment the child looks at
        busyT += dt;
        if (busyT >= 1) { busyT = 0; Kit.stats.busy(); }
        if (intro.t > intro.max) closeIntro();
      }
      paradeStep(dt);
      return;
    }
    if (countdown > 0) {
      const before = Math.ceil(countdown - 0.6);
      countdown -= dt;
      const now = Math.ceil(countdown - 0.6);
      if (now !== before && now >= 0) J.countdown(now);
      paradeStep(dt);
      return;
    }
    if (!ending) {
      const inp = readInput();
      const moving = inp.some(i => i.x || i.y);
      // Idle only counts while it is safe to walk: standing still for a guard is right.
      const p0 = world.players[0], safe = !duo && !p0.carry && !p0.spotted && threat(p0.x, p0.y) === 0 && world.guards.every(g => g.state === 'sleep' || g.state === 'walk');
      if (moving) { idle = 0; if (ghost && !ghost.out) ghost.out = 0.0001; } else if (safe || (!duo && p0.carry && threat(p0.x, p0.y) === 0)) idle += dt; else idle = Math.min(idle, 1);
      ER.step(world, dt, inp);
      handleEvents();
      if (!ending) {
        world.players.forEach((p, i) => {
          walk[i] += p.speed * dt * 0.085;
          if (p.moving && !p.ice) { stepT[i] -= dt; if (stepT[i] <= 0) { stepT[i] = 0.28; SFX.step(p.water); } }
        });
        // Watch who stands still in a looking guard's eyes, for the praise when it sleeps.
        if (!duo) {
          const p = world.players[0];
          for (const g of world.guards) if (g.state === 'awake' && !p.moving && !p.spotted && ER.inCone(world, g, p.x, p.y)) held[g.id] = true;
        }
        if (!duo && !ghost && idle >= (cur === 0 ? 3 : 6) && world.t > 1) startGhost();
        ghostStep(dt);
      }
      if (stopHint > 0) stopHint -= dt;
    } else {
      ending.t -= dt;
      busyT += dt;
      if (busyT >= 1) { busyT = 0; Kit.stats.busy(); }
      if (ending.t <= 0) showResult();
    }
    paradeStep(dt);
  }
  function makeTitleParade() {
    const list = [];
    for (let w = 0; w < 5; w++) for (let i = 0; i < Math.min(3, save.babies[w]); i++) list.push({ w: w, gold: i < save.golden[w], x: 0, y: 0, hop: 0, face: 1 });
    while (list.length < 3) list.push({ w: 0, gold: 0, x: 0, y: 0, hop: 0, face: 1 });
    list.forEach(b => { b.x = menuKid.x - 40; b.y = menuKid.y; });
    menuKid.babies = list.slice(0, 12);
  }
  function menuStep(dt) {
    if (screen === 'title' || screen === 'closet') {
      const k = menuKid;
      k.t += dt * (calm() ? 0 : 1);
      const ox = k.x, oy = k.y;
      if (screen === 'title') { k.x = 620 + Math.sin(k.t * 0.32) * 430; k.y = 480 + Math.sin(k.t * 0.64) * 150; }
      const mv = Math.hypot(k.x - ox, k.y - oy);
      k.walk += mv * 0.085;
      if (Math.abs(k.x - ox) > 0.05) k.face = k.x > ox ? 1 : -1;
      k.moving = mv > 0.2;
      let lx = k.x, ly = k.y + 6;
      for (let j = 0; j < k.babies.length; j++) {
        const b = k.babies[j], dx = lx - b.x, dy = ly - b.y, d = Math.hypot(dx, dy), gap = j === 0 ? 34 : 27;
        if (d > gap) { const m = d - gap; b.x += dx / d * m; b.y += dy / d * m; b.hop = (b.hop + m / 34) % 1; if (Math.abs(dx) > 1) b.face = dx > 0 ? 1 : -1; }
        lx = b.x; ly = b.y;
      }
    }
    if (screen === 'barn') {
      for (const b of roam) {
        if (b.wait > 0) { b.wait -= dt; if (b.wait <= 0) { b.tx = Math.max(60, Math.min(1220, b.x + (Math.random() - 0.5) * 300)); b.ty = 520 + Math.random() * 170; } continue; }
        const dx = b.tx - b.x, dy = b.ty - b.y, d = Math.hypot(dx, dy), s = 70 * dt;
        if (d < s) { b.wait = 0.5 + Math.random() * 2.5; b.hop = 0; continue; }
        b.x += dx / d * s; b.y += dy / d * s; b.hop = (b.hop + s / 30) % 1; b.face = dx > 0 ? 1 : -1;
      }
    }
    if (screen === 'result') resultStep(dt);
    if (resultLock > 0) resultLock -= dt;
    if (screen === 'result' && world) paradeStep(dt);
    if (screen === 'title' || screen === 'map' || screen === 'result') {
      menuIdle += dt;
      if (!hand.on && menuIdle >= menuNext) { menuNext = menuIdle + 7; menuHand(); }
    }
  }
  function slotXY(i) {
    const n = world.goal, sw = 42, pw = Math.min(n * sw + 28, 760);
    return { x: 640 + pw / 2 - 14 - sw / 2 - i * sw, y: 45 };
  }
  function flyStep(dt) {
    for (let i = flyers.length - 1; i >= 0; i--) {
      const f = flyers[i];
      f.t += dt;
      if (f.t >= 0.6) { flyers.splice(i, 1); filled = Math.max(filled, f.i + 1); slotPop[f.i] = 1; J.coin(Math.min(5, f.i % 5 + 1)); }
    }
    for (let i = 0; i < slotPop.length; i++) if (slotPop[i]) slotPop[i] = Math.max(0, slotPop[i] - dt * 3);
  }
  function decay(dt) {
    if (world) flyStep(dt);
    for (let i = 0; i < 2; i++) { happy[i] = Math.max(0, happy[i] - dt); squash[i] = Math.max(0, squash[i] - dt * 1.4); }
    for (let i = rings.length - 1; i >= 0; i--) { rings[i].t += dt; if (rings[i].t > rings[i].life) rings.splice(i, 1); }
    for (let i = floats.length - 1; i >= 0; i--) { const f = floats[i]; f.t += dt; f.y -= dt * 46; if (f.t > 1.2) floats.splice(i, 1); }
  }
  function update(dt) {
    time += dt;
    handleKeys();
    if (screen === 'play') playStep(dt);
    else if (screen !== 'pause') menuStep(dt);
    if (screen !== 'pause') {
      handStep(dt);
      fx.update(dt); shake.update(dt); decay(dt);
      if (fx.list.length > 300) fx.list.splice(0, fx.list.length - 300);
    }
    Kit.keys.endFrame();
  }

  /* --------------------------------------------------------------- render */
  function drawFxLayer(ctx) {
    fx.draw(ctx);
    const still = calm();
    for (const r of rings) {
      const k = r.t / r.life, rad = still ? r.r1 * 0.8 : r.r0 + (r.r1 - r.r0) * k;
      A.circle(ctx, r.x, r.y, rad); paint(ctx, null, 6, 'rgba(' + r.color + ',' + (1 - k).toFixed(2) + ')');
    }
    for (const f of floats) {
      ctx.globalAlpha = Math.max(0, 1 - Math.max(0, f.t - 0.7) / 0.5);
      const pop = still ? 1 : Math.min(1, f.t * 6) * (1 + 0.2 * Math.max(0, 1 - f.t * 4));
      ctx.save(); ctx.translate(f.x, f.y); ctx.scale(pop, pop);
      A.text(ctx, f.text, 0, 0, f.size, f.color);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
  const kidLook = (i, p) => ({
    color: duo ? P_COLORS[i] : ER.COLORS[save.color].c, hat: duo ? (i ? 1 : 0) : save.hat
  });
  function drawKid(ctx, p, i, still) {
    const th = threat(p.x, p.y), look = kidLook(i, p);
    const mood = p.spotted ? 'spotted' : happy[i] > 0 ? 'happy' : th && !p.moving ? 'freeze' : '';
    const up = p.dy < -0.5 && Math.abs(p.inX) < 0.3 && (p.inX || p.inY);
    A.kid(ctx, p.x, p.y, { color: look.color, hat: look.hat, face: p.face, up: up && !mood, walk: walk[i], moving: p.moving, still: still,
      carry: p.carry ? { world: world.plan.w, gold: p.carry.gold } : null, mood: mood, t: time, squash: squash[i] * (still ? 0 : 1) });
  }
  // Everything that stands on the ground, sorted by where its feet are.
  const ents = [];
  function drawWorld(ctx, still) {
    const w = world, plan = w.plan;
    ctx.drawImage(A.ground(plan, pixelScale()), 0, 0, W, H);
    // home nests glow while their kid carries an egg
    plan.homes.forEach((h, i) => {
      const p = w.players[i], hot = p && p.carry;
      if (hot) { const k = still ? 0.6 : 0.5 + 0.5 * Math.sin(time * 6); A.ell(ctx, h.x, h.y + 8, h.r + 16 + k * 8, (h.r + 16 + k * 8) * 0.55); paint(ctx, 'rgba(255,236,120,' + (0.35 + 0.25 * k).toFixed(2) + ')'); }
      // in a race each home nest sits on a mat of its kid's colour, with the kid's number
      if (duo) { A.ell(ctx, h.x, h.y + 8, h.r + 40, (h.r + 40) * 0.56); paint(ctx, P_COLORS[i], 5, A.INK); }
      A.nest(ctx, h.x, h.y, 'home');
      if (duo) { const fx0 = h.x + (i ? -74 : 74), fy0 = h.y + 40; A.circle(ctx, fx0, fy0, 17); paint(ctx, P_COLORS[i], 4, A.INK); A.text(ctx, String(i + 1), fx0, fy0 + 1, 22, '#ffffff', { stroke: 0 }); }
    });
    w.nests.forEach(n => {
      A.nest(ctx, n.x, n.y, n.gold === 2 ? 'giant' : 'n');
      // a golden egg is on its way: a little clock counts down over its empty nest
      if (n.at && !n.egg) { const left = Math.max(0, n.at - w.t); A.clock(ctx, n.x, n.y - 24, 18, left / n.at, false); A.egg(ctx, n.x + 24, n.y - 34, plan.w, 1, 0, 0.6); }
    });
    // vision cones
    w.guards.forEach(g => {
      if (g.state !== 'stir' && g.state !== 'awake' && g.state !== 'alert') return;
      const pts = ER.cone(w, g, 22, coneBuf[g.id] || (coneBuf[g.id] = []));
      A.cone(ctx, pts, g.state, g.state === 'stir' ? 1 - g.t / g.dur : 1);
    });
    ents.length = 0;
    for (const o of w.obs) ents.push({ k: o.y + o.h, o: o, f: 0 });
    for (const g of w.guards) ents.push({ k: g.y + 8, o: g, f: 1 });
    w.players.forEach((p, i) => ents.push({ k: p.y + 18, o: p, f: 2, i: i }));
    for (const e of w.eggsList) if (e.state === 'nest' || e.state === 'roll') ents.push({ k: e.y + 6, o: e, f: 3 });
    parades.forEach(list => list.forEach(b => ents.push({ k: b.y, o: b, f: 4 })));

    if (ghost) ents.push({ k: ghost.y + 18, o: ghost, f: 6 });
    ents.sort((a, b) => a.k - b.k);
    for (const it of ents) {
      const o = it.o;
      if (it.f === 0) A.obstacle(ctx, o);
      else if (it.f === 1) A.guard(ctx, o, time, still, ER.zoneAt(w, o.x, o.y) === 'water');
      else if (it.f === 2) drawKid(ctx, o, it.i, still);
      else if (it.f === 3) {
        const wob = o.state === 'roll' ? (time * 14) % TAU : still ? 0 : Math.sin(time * 3 + o.id) * 0.06;
        A.egg(ctx, o.x, o.y - 10 - (o.state === 'roll' ? Math.abs(Math.sin(o.t * 14)) * 10 : 0), plan.w, o.gold, wob);
      } else if (it.f === 4) A.baby(ctx, o.x, o.y, o.w, o.gold, o.face, still ? 0 : o.hop, 0.9);
      else if (it.f === 5) drawHatch(ctx, o, still);
      else if (it.f === 6) drawGhost(ctx, o, still);
    }
    for (const h of hatching) drawHatch(ctx, h, still);
    // the next thing to touch: a bouncing arrow over an egg, or over home while carrying
    w.players.forEach((p, i) => {
      if (p.spotted) return;
      const t = p.carry ? p.home : nearestEgg(p.x, p.y);
      if (!t || (duo && !p.carry)) return;
      const b = still ? 0 : Math.abs(Math.sin(time * 4 + i)) * 10;
      arrow(ctx, t.x, t.y - (p.carry ? 70 : 52) - b, duo ? P_COLORS[i] : '#ffd23f');
    });
    w.guards.forEach(g => A.guardFx(ctx, g, time, still));
    // stop! a hand over a kid who moves where a guard is looking (or about to)
    w.players.forEach(p => {
      if (p.spotted || p.stun > 0) return;
      const th = threat(p.x, p.y);
      if (th && p.moving) { const k = still ? 1 : 1 + 0.12 * Math.sin(time * 14); ctx.save(); ctx.translate(p.x, p.y - 92); ctx.scale(k, k); A.hand(ctx, 0, 0, 24); ctx.restore(); }
      else if (th) { drops(ctx, p.x, p.y, still); }
    });
  }
  function drops(ctx, x, y, still) {
    const k = still ? 0.5 : (time * 1.6) % 1;
    ctx.globalAlpha = 1 - k;
    A.ell(ctx, x + 20, y - 52 + k * 14, 3.5, 5.5); paint(ctx, '#7fd4ff', 2, A.INK);
    ctx.globalAlpha = 1;
  }
  function arrow(ctx, x, y, color) {
    ctx.beginPath(); ctx.moveTo(x - 16, y - 20); ctx.lineTo(x + 16, y - 20); ctx.lineTo(x + 16, y - 4); ctx.lineTo(x + 26, y - 4); ctx.lineTo(x, y + 20); ctx.lineTo(x - 26, y - 4); ctx.lineTo(x - 16, y - 4); ctx.closePath();
    paint(ctx, color); ctx.lineWidth = 4; ctx.strokeStyle = A.INK; ctx.lineJoin = 'round'; ctx.stroke();
  }
  function drawHatch(ctx, h, still) {
    const t = h.t;
    if (t < 0.55) {
      // the egg wobbles harder and harder, then a crack runs across it
      const wob = still ? 0 : Math.sin(t * 40) * 0.25 * (t / 0.55);
      ctx.save(); ctx.translate(h.x, h.y - 20); ctx.scale(1.7, 1.7);
      A.egg(ctx, 0, 0, h.w, h.gold, wob, 1);
      if (t > 0.3) { ctx.rotate(wob); ctx.lineWidth = 2.5; ctx.strokeStyle = A.INK; ctx.beginPath(); ctx.moveTo(-11, -2); ctx.lineTo(-5, 3); ctx.lineTo(1, -4); ctx.lineTo(6, 2); ctx.lineTo(11, -3); ctx.stroke(); }
      ctx.restore();
    } else {
      const k = Math.min(1, (t - 0.55) / 0.3), pop = still ? 1.4 : 1.4 + Math.sin(k * Math.PI) * 0.6;
      // the two shell halves fall away, the baby pops up
      if (t < 0.95) { const f = (t - 0.55) / 0.4; ctx.globalAlpha = 1 - f; A.egg(ctx, h.x - 18 - f * 30, h.y - 10 + f * 20, h.w, h.gold, -0.8 - f, 0.9); A.egg(ctx, h.x + 18 + f * 30, h.y - 10 + f * 20, h.w, h.gold, 0.8 + f, 0.9); ctx.globalAlpha = 1; }
      A.baby(ctx, h.x, h.y - 6 - (still ? 0 : Math.sin(k * Math.PI) * 40), h.w, h.gold, 1, 0, pop);
    }
  }
  function drawGhost(ctx, gh, still) {
    A.kid(ctx, gh.x, gh.y, { color: '#ffffff', hat: save.hat, face: gh.face, walk: gh.walk, moving: !gh.hold, still: still, t: time,
      carry: gh.carry ? { world: world.plan.w, gold: gh.gold } : null, mood: gh.hold ? 'freeze' : '', alpha: 0.5 * gh.a });
    if (gh.hold) { ctx.globalAlpha = gh.a; A.hand(ctx, gh.x, gh.y - 90, 20); ctx.globalAlpha = 1; }
  }
  function drawHud(ctx, still) {
    const w = world;
    if (duo) {
      const left = Math.ceil(w.left), hurry = left <= 10;
      A.rr(ctx, 560, 12, 160, 64, 32); paint(ctx, hurry ? 'rgba(255,90,95,0.92)' : 'rgba(42,29,62,0.82)', 4, '#ffffff');
      A.clock(ctx, 600, 44, 20, w.left / w.plan.seconds, hurry);
      A.text(ctx, String(left), 668, 46, 38, '#ffffff', { stroke: 0 });
      [0, 1].forEach(i => {
        const p = w.players[i], x = i ? 990 : 110;
        A.rr(ctx, x, 12, 180, 64, 32); paint(ctx, P_COLORS[i], 4, A.INK);
        A.egg(ctx, x + 40, 44, w.plan.w, 0, 0, 1.15);
        A.text(ctx, String(p.hatched), x + 112, 46, 40, '#ffffff');
        A.text(ctx, String(i + 1), x + 160, 30, 18, '#ffffff', { stroke: 4 });
      });
      return;
    }
    // the eggs to hatch, filling right to left
    const n = w.goal, sw = 42, pw = Math.min(n * sw + 28, 760), x0 = 640 + pw / 2 - 14 - sw / 2;
    A.rr(ctx, 640 - pw / 2, 12, pw, 66, 33); paint(ctx, 'rgba(42,29,62,0.78)', 4, '#ffffff');
    for (let i = 0; i < n; i++) {
      const x = x0 - i * sw, y = 45;
      if (i < filled) A.egg(ctx, x, y, w.plan.w, slots[i] ? 1 : 0, 0, 0.95 * (1 + (still ? 0 : (slotPop[i] || 0) * 0.5)));
      else { A.eggPath(ctx, x, y + 2, 13); paint(ctx, 'rgba(255,255,255,0.18)', 3, 'rgba(255,255,255,0.6)'); }
    }
    // two star badges beside the eggs: few catches (hearts left), and the par clock
    const caught = w.catches > w.plan.allowed, late = w.t > w.plan.par;
    const bx = 640 + pw / 2 + 44, cx2 = bx + 72;
    A.circle(ctx, bx, 46, 30); paint(ctx, 'rgba(42,29,62,0.78)', 4, '#ffffff');
    A.star(ctx, bx, 44, 19, !caught);
    for (let i = 0; i < w.plan.allowed; i++) A.heart(ctx, bx + (i - (w.plan.allowed - 1) / 2) * 18, 84, 6.5, i < w.plan.allowed - w.catches ? '#ff5a7a' : '#8a8399');
    A.circle(ctx, cx2, 46, 30); paint(ctx, 'rgba(42,29,62,0.78)', 4, '#ffffff');
    if (!late) { ctx.beginPath(); ctx.arc(cx2, 46, 26, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - w.t / w.plan.par)); ctx.lineWidth = 6; ctx.strokeStyle = w.plan.par - w.t < 10 ? '#ff9f43' : '#7fe08a'; ctx.lineCap = 'round'; ctx.stroke(); }
    A.star(ctx, cx2, 44, 19, !late);
  }
  // The input mirror: the keys the child (or the ghost kid) presses light up.
  function drawKeys(ctx, still) {
    const K = Kit.keys;
    if (duo) {
      if (!intro && countdown <= 0 && world.t > 4) return;
      A.keys(ctx, 150, 620, 'wasd', { up: K.down('KeyW'), left: K.down('KeyA'), down: K.down('KeyS'), right: K.down('KeyD') }, { size: 40, color: '#d8e8ff' });
      A.keys(ctx, 1130, 620, 'arrows', { up: K.down('ArrowUp'), left: K.down('ArrowLeft'), down: K.down('ArrowDown'), right: K.down('ArrowRight') }, { size: 40, color: '#ffd8d8' });
      return;
    }
    if (cur > 1 && !ghost) return;
    const gh = ghost && !ghost.hold ? ghost : null, pulse = still ? 0.6 : 0.5 + 0.5 * Math.sin(time * 8);
    const lit = { up: K.anyDown(['ArrowUp', 'KeyW']), left: K.anyDown(['ArrowLeft', 'KeyA']), down: K.anyDown(['ArrowDown', 'KeyS']), right: K.anyDown(['ArrowRight', 'KeyD']) };
    const glow = gh ? { up: gh.dy < -0.4 ? pulse : 0, down: gh.dy > 0.4 ? pulse : 0, left: gh.dx < -0.4 ? pulse : 0, right: gh.dx > 0.4 ? pulse : 0 } : null;
    ctx.globalAlpha = 0.92;
    A.keys(ctx, 1160, 628, 'arrows', lit, { size: 40, glow: glow });
    ctx.globalAlpha = 1;
  }
  function drawStopHint(ctx, still) {
    if (stopHint <= 0 || duo) return;
    const k = still ? 1 : 1 + 0.1 * Math.sin(time * 10);
    ctx.save(); ctx.translate(640, 130); ctx.scale(k, k);
    A.rr(ctx, -110, -34, 220, 68, 34); paint(ctx, 'rgba(255,255,255,0.95)', 5, A.INK);
    A.hand(ctx, 70, 0, 26);
    A.text(ctx, 'قف!', -26, 2, 44, '#ff5a5f');
    ctx.restore();
  }
  function drawCountdown(ctx, still) {
    if (countdown <= 0) return;
    const n = Math.ceil(countdown - 0.6), k = 1 - (countdown - 0.6 - (n - 1));
    const s = still ? 1 : 0.7 + 0.5 * Math.min(1, k * 3);
    ctx.save(); ctx.translate(640, 360); ctx.scale(s, s);
    A.text(ctx, n > 0 ? String(n) : 'انطلق!', 0, 0, n > 0 ? 150 : 110, n > 0 ? '#ffffff' : '#ffd23f', { stroke: 18 });
    ctx.restore();
  }
  function drawPlay(ctx) {
    const still = calm();
    drawWorld(ctx, still);
    drawFxLayer(ctx);
    drawHud(ctx, still);
    for (const f of flyers) {
      if (f.t < 0) continue;
      const k = Math.min(1, f.t / 0.6), e = k * k * (3 - 2 * k), to = slotXY(f.i);
      A.egg(ctx, f.x + (to.x - f.x) * e, f.y + (to.y - f.y) * e - Math.sin(k * Math.PI) * 90, world.plan.w, f.gold ? 1 : 0, k * 6, 1.3 - 0.35 * k);
    }
    drawKeys(ctx, still);
    drawStopHint(ctx, still);
    if (intro) drawIntro(ctx, still);
    drawCountdown(ctx, still);
  }

  /* -------------------------------------------------------- the intro card */
  function panel(ctx, x, y, w, h, c) { A.rr(ctx, x, y + 6, w, h, 26); paint(ctx, A.INK); A.rr(ctx, x, y, w, h, 26); paint(ctx, c || '#ffffff', 5, A.INK); }
  function miniGuard(ctx, kind, x, y, state, s, dir) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    const g = { kind: kind, x: 0, y: 0, dir: dir == null ? Math.PI : dir, look: dir == null ? Math.PI : dir, state: state, t: 0.1, dur: 0.5, air: 0 };
    A.guard(ctx, g, time, calm());
    if (state === 'alert' || state === 'stir') A.guardFx(ctx, Object.assign(g, { t: state === 'stir' ? 0.3 : 0 }), time, calm());
    ctx.restore();
  }
  function wedge(ctx, x, y, dir, len, half, c) {
    ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, len, dir - half, dir + half); ctx.closePath();
    paint(ctx, c || 'rgba(255,238,110,0.5)', 3, 'rgba(230,160,30,0.9)');
  }
  function scene(ctx, x, y, w, h, biome) {
    const B = A.BIOME[biome];
    A.rr(ctx, x, y, w, h, 20); paint(ctx, B.g0);
    ctx.save(); A.rr(ctx, x, y, w, h, 20); ctx.clip();
  }
  function endScene(ctx, x, y, w, h) { ctx.restore(); A.rr(ctx, x, y, w, h, 20); paint(ctx, null, 5, A.INK); }
  const kidO = (o) => Object.assign({ color: ER.COLORS[save.color].c, hat: save.hat, t: time, face: 1, still: calm() }, o);
  function lessonFreeze(ctx, cx, cy) {
    const pw = 300, ph = 190;
    // right panel: freeze in its eyes = fine; left: moving in its eyes = «!»
    [[cx + 12, true], [cx - pw - 12, false]].forEach(([x, ok]) => {
      const y = cy - ph / 2;
      scene(ctx, x, y, pw, ph, 'farm');
      wedge(ctx, x + pw - 70, y + ph / 2 + 4, Math.PI, 230, 0.42, ok ? 'rgba(255,238,110,0.55)' : 'rgba(255,90,90,0.4)');
      miniGuard(ctx, 'hen', x + pw - 50, y + ph / 2 + 40, ok ? 'awake' : 'alert', 1);
      if (ok) A.kid(ctx, x + 96, y + ph / 2 + 30, kidO({ mood: 'freeze', still: true }));
      else { A.zoom(ctx, x + 96, y + ph / 2 + 10, 1); A.kid(ctx, x + 96, y + ph / 2 + 30, kidO({ moving: true, walk: time * 9, mood: 'spotted' })); }
      endScene(ctx, x, y, pw, ph);
      A.check(ctx, x + 30, y + 30, 24, ok);
    });
  }
  function lessonWater(ctx, cx, cy) {
    const pw = 300, ph = 190, y = cy - ph / 2;
    [[cx + 12, true], [cx - pw - 12, false]].forEach(([x, fast]) => {
      scene(ctx, x, y, pw, ph, 'pond');
      A.rr(ctx, x + 20, y + 40, pw - 40, ph - 70, 30); paint(ctx, '#4fc3f7');
      if (fast) { [[80, 120], [150, 104], [220, 122]].forEach(p => { A.ell(ctx, x + p[0], y + p[1] + 10, 30, 20); paint(ctx, '#4cb84a', 3, A.INK); }); }
      A.kid(ctx, x + 150, y + 112, kidO({ moving: true, walk: time * (fast ? 10 : 4) }));
      if (fast) { A.zoom(ctx, x + 150, y + 90, 1); A.zoom(ctx, x + 132, y + 90, 1); }
      else { ctx.lineWidth = 4; ctx.strokeStyle = '#ffffff'; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(x + 150, y + 132, 30 + i * 12, 9 + i * 4, 0, 0, Math.PI); ctx.stroke(); } }
      endScene(ctx, x, y, pw, ph);
      snailOrHare(ctx, x + 36, y + 34, fast);
    });
  }
  // Fast: three chevrons on green. Slow: a snail on orange.
  function snailOrHare(ctx, x, y, fast) {
    A.circle(ctx, x, y, 26); paint(ctx, fast ? '#3ddc84' : '#ffb347', 4, A.INK);
    ctx.lineCap = 'round';
    if (fast) {
      ctx.lineWidth = 5; ctx.strokeStyle = '#ffffff';
      for (let i = 0; i < 3; i++) { const ox = x - 10 + i * 9 - 4; ctx.beginPath(); ctx.moveTo(ox - 4, y - 9); ctx.lineTo(ox + 5, y); ctx.lineTo(ox - 4, y + 9); ctx.stroke(); }
      return;
    }
    A.rr(ctx, x - 17, y + 4, 32, 9, 4.5); paint(ctx, '#ffe08a', 2.5, A.INK);
    ctx.beginPath(); ctx.moveTo(x + 12, y + 6); ctx.lineTo(x + 16, y - 6); ctx.moveTo(x + 15, y + 6); ctx.lineTo(x + 21, y - 4); paint(ctx, null, 2.5, A.INK);
    A.circle(ctx, x - 3, y - 2, 11); paint(ctx, '#c0784a', 3, A.INK);
    ctx.beginPath(); ctx.arc(x - 3, y - 2, 5.5, 0, Math.PI * 1.6); paint(ctx, null, 2.5, A.INK);
  }
  function lessonIce(ctx, cx, cy) {
    const pw = 620, ph = 190, x = cx - pw / 2, y = cy - ph / 2;
    scene(ctx, x, y, pw, ph, 'snow');
    A.rr(ctx, x + 60, y + 40, pw - 120, ph - 70, 30); paint(ctx, '#bfeaff');
    ctx.lineWidth = 6; ctx.strokeStyle = '#ffffff';
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(x + 100 + i * 80, y + 150); ctx.lineTo(x + 140 + i * 80, y + 50); ctx.stroke(); }
    // keys let go, and the kid still slides on
    const k = calm() ? 0.6 : (time * 0.45) % 1, kx = x + 150 + k * 300;
    ctx.setLineDash([12, 10]); ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(42,29,62,0.5)';
    ctx.beginPath(); ctx.moveTo(x + 150, y + 136); ctx.lineTo(kx - 20, y + 136); ctx.stroke(); ctx.setLineDash([]);
    A.zoom(ctx, kx, y + 100, 1);
    A.kid(ctx, kx, y + 116, kidO({ mood: 'spotted', still: true }));
    A.keycap(ctx, x + 70, y + 60, '→', { down: k < 0.3, w: 52, h: 48 });
    endScene(ctx, x, y, pw, ph);
  }
  function lessonSweep(ctx, cx, cy) {
    const pw = 300, ph = 190, y = cy - ph / 2;
    [[cx + 12, true], [cx - pw - 12, false]].forEach(([x, hide]) => {
      scene(ctx, x, y, pw, ph, 'desert');
      const sw = calm() ? 0 : Math.sin(time * 1.6) * 0.45, dir = Math.PI + sw;
      ctx.save(); A.rr(ctx, x, y, pw, ph, 20); ctx.clip();
      wedge(ctx, x + pw - 60, y + 70, dir, 250, 0.36, hide ? 'rgba(255,238,110,0.5)' : 'rgba(255,90,90,0.4)');
      ctx.restore();
      miniGuard(ctx, 'ostrich', x + pw - 46, y + 160, hide ? 'awake' : 'alert', 0.95, dir);
      if (hide) {
        A.kid(ctx, x + 80, y + 128, kidO({ mood: 'freeze', still: true }));
        A.obstacle(ctx, { kind: 'cactus', x: x + 112, y: y + 120, w: 44, h: 44 });
      } else A.kid(ctx, x + 80, y + 128, kidO({ moving: true, walk: time * 9, mood: 'spotted' }));
      endScene(ctx, x, y, pw, ph);
      A.check(ctx, x + 30, y + 30, 24, hide);
    });
  }
  function lessonPatrol(ctx, cx, cy) {
    const pw = 620, ph = 190, x = cx - pw / 2, y = cy - ph / 2;
    scene(ctx, x, y, pw, ph, 'dino');
    ctx.fillStyle = 'rgba(60,40,20,0.35)';
    for (let i = 0; i < 6; i++) { A.ell(ctx, x + 70 + i * 48, y + 150 + (i % 2) * 14, 9, 6); ctx.fill(); }
    miniGuard(ctx, 'dino', x + 170, y + 130, 'walk', 0.7, 0);
    A.text(ctx, 'Z', x + 200, y + 40, 26, '#ffffff', { stroke: 6 });
    ctx.lineWidth = 7; ctx.strokeStyle = A.INK; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x + 280, y + 96); ctx.lineTo(x + 330, y + 96); ctx.moveTo(x + 316, y + 82); ctx.lineTo(x + 332, y + 96); ctx.lineTo(x + 316, y + 110); ctx.stroke();
    wedge(ctx, x + 470, y + 90, Math.PI * 0.95, 160, 0.4);
    miniGuard(ctx, 'dino', x + 450, y + 130, 'stir', 0.7, Math.PI);
    endScene(ctx, x, y, pw, ph);
  }
  function lessonGold(ctx, cx, cy, giant) {
    const pw = 620, ph = 190, x = cx - pw / 2, y = cy - ph / 2;
    scene(ctx, x, y, pw, ph, giant ? 'dino' : 'farm');
    A.egg(ctx, x + 480, y + 92, giant ? 4 : 0, giant ? 2 : 1, 0, giant ? 1.75 : 2.2);
    A.text(ctx, '=', x + 380, y + 92, 60, '#ffffff', { stroke: 10 });
    const n = giant ? 5 : 3;
    for (let i = 0; i < n; i++) A.egg(ctx, x + 330 - i * 46, y + 92, giant ? 4 : 0, 0, 0, 1.25);
    endScene(ctx, x, y, pw, ph);
    snailOrHare(ctx, x + 40, y + ph - 34, false);
  }
  function lessonDuo(ctx, cx, cy) {
    const pw = 300, ph = 200, y = cy - ph / 2;
    [[cx - pw - 12, 0], [cx + 12, 1]].forEach(([x, i]) => {
      scene(ctx, x, y, pw, ph, 'farm');
      A.nest(ctx, x + (i ? 230 : 70), y + 150, 'n');
      A.kid(ctx, x + (i ? 230 : 70), y + 120, { color: P_COLORS[i], hat: i, t: time, face: i ? -1 : 1, still: calm() });
      A.keys(ctx, x + (i ? 100 : 200), y + 100, i ? 'arrows' : 'wasd', null, { size: 38, color: i ? '#ffd8d8' : '#d8e8ff' });
      endScene(ctx, x, y, pw, ph);
    });
    A.circle(ctx, cx, cy - 4, 44); paint(ctx, '#ffffff', 5, A.INK);
    A.clock(ctx, cx, cy - 18, 20, 1, false);
    A.text(ctx, String(ER.DUO_SECONDS), cx, cy + 22, 26, A.INK, { stroke: 0 });
    // a bump knocks the other kid's egg loose
    const by = cy + ph / 2 + 58;
    A.kid(ctx, cx - 34, by, { color: P_COLORS[0], hat: 0, t: time, face: 1, moving: true, walk: time * 9, still: calm(), scale: 0.8 });
    A.zoom(ctx, cx - 34, by - 14, 1);
    A.kid(ctx, cx + 30, by, { color: P_COLORS[1], hat: 1, t: time, face: -1, mood: 'spotted', still: true, scale: 0.8 });
    A.egg(ctx, cx + 70, by - 62, 0, 0, 0.6, 0.9);
    ctx.lineWidth = 4; ctx.strokeStyle = A.INK; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx + 2, by - 40); ctx.lineTo(cx + 10, by - 50); ctx.moveTo(cx - 6, by - 44); ctx.lineTo(cx - 6, by - 56); ctx.moveTo(cx + 10, by - 34); ctx.lineTo(cx + 22, by - 38); ctx.stroke();
  }
  function drawIntro(ctx, still) {
    const k = intro.out ? Math.min(1, intro.out / 0.35) : 0, ease = k * k;
    const lesson = intro.lesson, big = !!lesson;
    const cw = big ? 820 : 560, ch = big ? 470 : 250, cx = 640, cy = big ? 395 : 360;
    ctx.save();
    ctx.globalAlpha = 1 - ease;
    ctx.fillStyle = 'rgba(42,29,62,' + (0.45 * (1 - ease)).toFixed(3) + ')'; ctx.fillRect(0, 0, W, H);
    ctx.translate(0, -ease * 120);
    const pop = still || intro.out ? 1 : Math.min(1, 0.8 + intro.t * 1.2);
    ctx.translate(cx, cy); ctx.scale(pop, pop); ctx.translate(-cx, -cy);
    panel(ctx, cx - cw / 2, cy - ch / 2, cw, ch, '#fff8e6');
    // the ribbon: the world's name and which of its 4 yards this is
    const ry = cy - ch / 2 - 6;
    A.rr(ctx, cx - 240, ry - 30, 480, 66, 33); paint(ctx, '#ff9a2e', 5, A.INK);
    if (duo) A.text(ctx, 'سباق اثنين', cx, ry + 2, 38, '#ffffff');
    else {
      const name = WORLD_NAMES[world.plan.w];
      A.text(ctx, name, cx + 56, ry + 2, name.length > 8 ? 28 : 38, '#ffffff');
      for (let i = 0; i < 4; i++) { A.circle(ctx, cx - 206 + (3 - i) * 26, ry + 2, i === world.plan.l ? 10 : 7); paint(ctx, i === world.plan.l ? '#ffd23f' : i < world.plan.l ? '#ffffff' : 'rgba(255,255,255,0.45)', 3, A.INK); }
    }
    // the goal: these eggs, into the home nest
    if (!duo) {
      const n = world.goal, gy = cy - ch / 2 + 78, sw = Math.min(46, 420 / n);
      const total = n * sw + 140, gx0 = cx + total / 2 - sw / 2;
      for (let i = 0; i < n; i++) A.egg(ctx, gx0 - i * sw, gy, world.plan.w, 0, 0, Math.min(1.25, sw / 38));
      const ax = gx0 - n * sw - 6;
      ctx.lineWidth = 7; ctx.strokeStyle = A.INK; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(ax + 18, gy); ctx.lineTo(ax - 18, gy); ctx.moveTo(ax - 4, gy - 13); ctx.lineTo(ax - 19, gy); ctx.lineTo(ax - 4, gy + 13); ctx.stroke();
      ctx.save(); ctx.translate(ax - 70, gy + 4); ctx.scale(0.55, 0.55); A.nest(ctx, 0, 0, 'home'); ctx.restore();
      A.heart(ctx, ax - 70, gy - 6, 9, '#ff5a7a');
    }
    const ly = big ? (duo ? cy - 10 : cy + 20) : cy + 40;
    if (lesson === 'freeze') lessonFreeze(ctx, cx, ly);
    else if (lesson === 'water') lessonWater(ctx, cx, ly);
    else if (lesson === 'ice') lessonIce(ctx, cx, ly);
    else if (lesson === 'sweep') lessonSweep(ctx, cx, ly);
    else if (lesson === 'patrol') lessonPatrol(ctx, cx, ly);
    else if (lesson === 'gold') lessonGold(ctx, cx, ly, false);
    else if (lesson === 'giant') lessonGold(ctx, cx, ly, true);
    else if (lesson === 'duo') lessonDuo(ctx, cx, ly);
    // press a key to go
    if (big && !duo) {
      const p = still ? 0.6 : 0.5 + 0.5 * Math.sin(time * 6);
      const ky = cy + ch / 2 - 46;
      A.keys(ctx, cx, ky - 6, 'arrows', null, { size: 34, glow: { up: p, left: p, down: p, right: p } });
    } else if (duo) {
      const p = still ? 0.6 : 0.5 + 0.5 * Math.sin(time * 6);
      A.rr(ctx, cx + 210, cy + ch / 2 - 72, 140, 50, 25); paint(ctx, 'rgba(255,210,63,' + (0.5 + 0.5 * p).toFixed(2) + ')', 4, A.INK);
      A.text(ctx, 'Enter', cx + 280, cy + ch / 2 - 46, 28, A.INK, { stroke: 0 });
    }
    ctx.restore();
  }

  /* --------------------------------------------------------- menu scenes */
  // The title yard: the house, a sleeping hen on her nest, and the kid strolling with
  // the babies hatched so far.
  let titlePlan = null;
  const TITLE_OBS = [['barrel', 1096, 178, 56, 56], ['bush', 1120, 520, 100, 76], ['bush', 334, 140, 86, 60]]
    .map(o => ({ kind: o[0], x: o[1], y: o[2], w: o[3], h: o[4] }));
  function drawTitle(ctx) {
    const still = calm();
    if (!titlePlan) titlePlan = ER.plan(0, 1);
    ctx.drawImage(A.ground(titlePlan, pixelScale()), 0, 0, W, H);
    A.nest(ctx, ER.HOME.x, ER.HOME.y, 'home');
    const k = menuKid;
    ents.length = 0;
    ents.push({ k: titlePlan.obs[0].y + titlePlan.obs[0].h, f: 0, o: titlePlan.obs[0] });
    for (const o of TITLE_OBS) ents.push({ k: o.y + o.h, f: 0, o: o });
    ents.push({ k: k.y + 18, f: 1 });
    ents.push({ k: 398, f: 2 });
    for (const b of k.babies) ents.push({ k: b.y, f: 3, o: b });
    ents.sort((a, b) => a.k - b.k);
    for (const it of ents) {
      if (it.f === 0) A.obstacle(ctx, it.o);
      else if (it.f === 1) A.kid(ctx, k.x, k.y, { color: ER.COLORS[save.color].c, hat: save.hat, face: k.face, walk: k.walk, moving: k.moving, t: time, still: still, squash: squash[0], mood: happy[0] > 0 ? 'happy' : '' });
      else if (it.f === 2) {
        A.nest(ctx, 930, 390, 'n'); A.egg(ctx, 930, 380, 0, 0, still ? 0 : Math.sin(time * 3) * 0.06);
        const hen = { kind: 'hen', x: 1006, y: 390, dir: Math.PI, look: Math.PI, state: 'sleep', t: 1, dur: 1, air: 0 };
        ctx.save(); ctx.translate(hen.x, hen.y); ctx.scale(1.35, 1.35); ctx.translate(-hen.x, -hen.y);
        A.guard(ctx, hen, time, still); A.guardFx(ctx, hen, time, still);
        ctx.restore();
      } else A.baby(ctx, it.o.x, it.o.y, it.o.w, it.o.gold, it.o.face, still ? 0 : it.o.hop, 0.9);
    }
    ctx.fillStyle = 'rgba(42,29,62,0.12)'; ctx.fillRect(0, 0, W, H);
    howTo(ctx, still);
    drawFxLayer(ctx);
  }
  // How to play, without words: the keys walk; when an eye opens, stand still.
  function howTo(ctx, still) {
    const x = 26, y = 560, w = 316, h = 140;
    A.rr(ctx, x, y + 6, w, h, 26); paint(ctx, A.INK);
    A.rr(ctx, x, y, w, h, 26); paint(ctx, 'rgba(255,248,230,0.96)', 5, A.INK);
    const p = still ? 0 : (time * 1.2) % 4, k = Math.floor(p);
    A.keys(ctx, x + 236, y + 62, 'arrows', { up: k === 0, right: k === 1, down: k === 2, left: k === 3 }, { size: 32 });
    A.text(ctx, 'W A S D', x + 236, y + 120, 18, A.INK, { stroke: 0 });
    // an open eye over a still kid, with a tick
    const ex = x + 64, ey = y + 34;
    A.ell(ctx, ex, ey, 22, 13); paint(ctx, '#ffffff', 4, A.INK);
    A.circle(ctx, ex + 3, ey, 7); paint(ctx, A.INK);
    A.kid(ctx, x + 64, y + 100, { color: ER.COLORS[save.color].c, hat: save.hat, mood: 'freeze', still: true, t: time, scale: 0.78 });
    A.check(ctx, x + 124, y + 108, 16, true);
  }
  let mapBg = null;
  function drawMap(ctx) {
    if (!mapBg) {
      mapBg = document.createElement('canvas'); mapBg.width = 640; mapBg.height = 360;
      const g = mapBg.getContext('2d'); g.scale(0.5, 0.5);
      const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#7fd3ff'); gr.addColorStop(0.55, '#c3f0ff'); gr.addColorStop(0.56, '#9be36a'); gr.addColorStop(1, '#6fbf4a');
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      [[160, 70, 1], [520, 46, 0.8], [900, 80, 1.1], [1180, 50, 0.7]].forEach(c => { for (let i = 0; i < 4; i++) { A.circle(g, c[0] + i * 34 * c[2], c[1] + (i % 2) * 8, 26 * c[2]); g.fillStyle = '#ffffff'; g.fill(); } });
    }
    ctx.drawImage(mapBg, 0, 0, W, H);
    drawFxLayer(ctx);
  }
  let barnBg = null;
  function drawBarn(ctx) {
    const still = calm();
    if (!barnBg) {
      barnBg = document.createElement('canvas'); barnBg.width = 960; barnBg.height = 540;
      const g = barnBg.getContext('2d'); g.scale(0.75, 0.75);
      g.fillStyle = '#b8743a'; g.fillRect(0, 0, W, H);
      for (let x = 0; x < W; x += 64) { g.fillStyle = x % 128 ? '#c98a46' : '#b07038'; g.fillRect(x, 0, 62, 470); g.strokeStyle = '#8a5428'; g.lineWidth = 3; g.strokeRect(x, 0, 62, 470); }
      g.fillStyle = '#e8c48a'; g.fillRect(0, 470, W, 250);
      for (let i = 0; i < 260; i++) { const x = (i * 97) % W, y = 480 + (i * 53) % 240; g.strokeStyle = i % 2 ? '#f6d47a' : '#d2a463'; g.lineWidth = 3; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 14, y - 4); g.stroke(); }
      [[90, 470], [1190, 470]].forEach(p => { A.ell(g, p[0], p[1], 120, 46); g.fillStyle = '#ffd45e'; g.fill(); g.lineWidth = 5; g.strokeStyle = A.INK; g.stroke(); });
    }
    ctx.drawImage(barnBg, 0, 0, W, H);
    const list = roam.slice().sort((a, b) => a.y - b.y);
    for (const b of list) A.baby(ctx, b.x, b.y, b.w, b.gold ? 1 : 0, b.face, still ? 0 : b.hop, 1.1);
    drawFxLayer(ctx);
  }
  function drawCloset(ctx) {
    const still = calm();
    if (!titlePlan) titlePlan = ER.plan(0, 1);
    ctx.drawImage(A.ground(titlePlan, pixelScale()), 0, 0, W, H);
    ctx.fillStyle = 'rgba(42,29,62,0.35)'; ctx.fillRect(0, 0, W, H);
    A.ell(ctx, 960, 610, 200, 52); paint(ctx, '#ff9a2e', 6, A.INK);
    A.ell(ctx, 960, 604, 160, 36); paint(ctx, '#ffd23f');
    A.kid(ctx, 960, 560, { color: ER.COLORS[save.color].c, hat: save.hat, face: -1, t: time, still: still, scale: 3.4, squash: squash[0], mood: happy[0] > 0 ? 'happy' : '' });
    drawFxLayer(ctx);
  }
  function drawResult(ctx) {
    const still = calm();
    if (!world) return;
    ctx.drawImage(A.ground(world.plan, pixelScale()), 0, 0, W, H);
    ctx.fillStyle = 'rgba(42,29,62,0.35)'; ctx.fillRect(0, 0, W, H);
    const hop = i => still ? 0 : -Math.abs(Math.sin(time * 5 + i)) * 18;
    if (result && result.duo) {
      [0, 1].forEach(i => {
        const x = i ? 900 : 380, won = result.win === i, y = 210 + hop(i) - (won ? 20 : 0);
        const list = parades[i];
        list.forEach((b, j) => { const a = (j / Math.max(1, list.length)) * TAU + time * (still ? 0 : 0.6); A.baby(ctx, x + Math.cos(a) * 130, 240 + Math.sin(a) * 50, b.w, b.gold, Math.cos(a) < 0 ? 1 : -1, still ? 0 : (time * 2 + j * 0.3) % 1, 0.9); });
        A.kid(ctx, x, y, { color: P_COLORS[i], hat: won ? 7 : i, face: i ? -1 : 1, t: time, still: still, scale: won ? 2.1 : 1.6, mood: won || result.win < 0 ? 'happy' : '' });
      });
    } else {
      const list = parades[0];
      list.forEach((b, j) => { const a = (j / Math.max(1, list.length)) * TAU + time * (still ? 0 : 0.6); A.baby(ctx, 640 + Math.cos(a) * 170, 238 + Math.sin(a) * 56, b.w, b.gold, Math.cos(a) < 0 ? 1 : -1, still ? 0 : (time * 2 + j * 0.3) % 1, 1); });
      A.kid(ctx, 640, 200 + hop(0), { color: ER.COLORS[save.color].c, hat: save.hat, t: time, still: still, scale: 2, mood: 'happy' });
    }
    drawFxLayer(ctx);
  }
  function render() {
    if (screen === 'pause' && !dirty) return;
    dirty = false;
    const ctx = view.ctx;
    ctx.save();
    ctx.translate(shake.x, shake.y);
    if (screen === 'title') drawTitle(ctx);
    else if (screen === 'map') drawMap(ctx);
    else if (screen === 'barn') drawBarn(ctx);
    else if (screen === 'closet') drawCloset(ctx);
    else if (screen === 'result') drawResult(ctx);
    else if (world) drawPlay(ctx);
    ctx.restore();
  }

  canvas.addEventListener('contextrestored', () => { A.reset(); mapBg = barnBg = null; dirty = true; if (screen === 'closet') refreshCloset(); if (screen === 'map') refreshMap(); });
  if (document.fonts && document.fonts.load) {
    // Sprites with letters (Z, «؟», «!») are drawn again once the font is in.
    document.fonts.load('700 40px Fredoka', 'سباق ؟ Z 5').then(() => { A.reset(); dirty = true; if (screen === 'map') refreshMap(); }, () => { /* fallback fonts */ });
  }

  /* --------------------------------------------------- test and debug hook */
  const page = (x, y) => { const r = canvas.getBoundingClientRect(); return { x: r.left + x * view.scale, y: r.top + y * view.scale }; };
  const round2 = v => Math.round(v * 100) / 100;
  window.__game = {
    get screen() { return screen; },
    get mode() { return duo ? 'duo' : 'solo'; },
    get px() { return world ? round2(world.players[0].x) : round2(menuKid.x); },
    get py() { return world ? round2(world.players[0].y) : round2(menuKid.y); },
    get p2x() { return world && world.players[1] ? round2(world.players[1].x) : 0; },
    get p2y() { return world && world.players[1] ? round2(world.players[1].y) : 0; },
    get atStart() { const p = world && world.players[0]; return !!p && Math.abs(p.x - p.sx) < 0.5 && Math.abs(p.y - p.sy) < 0.5; },
    get level() { return world ? world.plan.id : ''; },
    get tier() { return world ? world.plan.tier : 0; },
    get goal() { return world ? world.goal : 0; },
    get hatched() { return world ? world.hatched : 0; },
    get eggs() { return world ? world.eggs : 0; },
    get catches() { return world ? world.catches : 0; },
    get time() { return world ? round2(world.t) : 0; },
    get carrying() { return !!(world && world.players[0].carry); },
    get intro() { return !!intro; },
    get countdown() { return countdown > 0; },
    get ending() { return !!ending; },
    get ghost() { return !!ghost; },
    get tries() { return tries; },
    get stars() { return result && !result.duo ? result.stars : 0; },
    get winner() { return result && result.duo ? result.win : null; },
    get scores() { return world ? world.players.map(p => p.hatched) : []; },
    get guards() { return world ? world.guards.map(g => ({ state: g.state, x: round2(g.x), y: round2(g.y), kind: g.kind })) : []; },
    get eggList() { return world ? world.eggsList.map(e => ({ state: e.state, x: e.x, y: e.y, gold: e.gold })) : []; },
    get shake() { return shake.power; },
    get save() { return JSON.parse(JSON.stringify(save)); },
    // Where a logical point is on the page, for tests that move the real mouse there.
    point: page
  };

  buildMap();
  buildCloset();
  buildBarn();
  Kit.muteButton();
  Kit.lifecycle({ pause: () => pause(false), reset: () => { mouse.down = false; } });
  toTitle();
  Kit.loop(update, render);
  Kit.ready();
})();
