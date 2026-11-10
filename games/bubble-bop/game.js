/* Bubble Bop (فقاعات بوب): screens, mouse and keyboard, the ghost-hand coach, saves
 * and sound. rules.js simulates the worlds; art.js draws them.
 * This is the UI layer: it reads Kit.dda at every level start. */
(function () {
  'use strict';
  const BB = window.BB, A = BB.art, J = Kit.juice, W = BB.W, H = BB.H, KEYS = BB.KEYS;
  const $ = id => document.getElementById(id);
  const canvas = $('game'), ui = $('ui'), ghostEl = $('ghost');
  const calm = () => Kit.motion.reduced();
  let dirty = true;
  const view = Kit.fit(canvas, W, H, { maxDpr: 1.5, onResize: v => {
    ui.style.left = canvas.style.left; ui.style.top = canvas.style.top; ui.style.transform = 'scale(' + v.scale + ')'; dirty = true;
  } });
  const fx = Kit.particles(), shake = Kit.shake();
  const pixelScale = () => Math.min(2, Math.max(0.5, Math.round(view.scale * view.dpr * 4) / 4));

  /* ---------------------------------------------------------------- save */
  const store = Kit.store('bubble-bop');
  const saveStatus = Kit.saveStatus({ retry: persist });
  let save = BB.loadSave(store.get('save', null));
  function persist() {
    if (store.set('save', save) === false) { saveStatus.failed(); return false; }
    saveStatus.saved();
    return true;
  }
  // One difficulty controller per world (Kit keeps it on this PC).
  const dda = BB.WORLDS.map((_, i) => Kit.dda('bubble-bop', { id: 'w' + (i + 1) }));

  /* --------------------------------------------------------------- state */
  let screen = 'title', world = null, cur = { w: 0, l: 0 }, time = 0, ending = null, result = null, resultT = 0, resultLock = 0;
  let closetFrom = 'title', gripCard = 0, gripThen = '', gripAt = 0, menuIdle = 0, menuNext = 4, unlockFx = null;
  const ptr = { x: W / 2, y: H / 2, known: false, travel: 0, movedAt: -9 };
  const menuBop = { x: 640, y: 364, vx: 0, vy: 0 };
  let clicks = [], jumpPress = false, holdDir = 0, keyDir = 0, anyKey = '';
  // Worlds 6-11: button presses and releases in order (drag), the button held (drag, hold),
  // letter keys pressed, the arrows held, an on-screen arrow held with the mouse (tiers 1-2),
  // and a quiet let-go after a pause.
  let mouseEvs = [], btnDown = false, letters = [], steerDx = 0, steerDy = 0, steerClick = '', cancelNext = false;
  const flash = { space: 0, left: 0, right: 0, click: 0, move: 0, wiggle: 0, spaceGlow: 0, keyGlow: 0, mouseHint: 0, held: 0, two: 0,
    up: 0, down: 0, west: 0, east: 0 };
  const keyFx = { wrong: {}, demo: {} };
  const coach = { hit: 0, input: 0, next: 4, said: false };
  const taught = {};
  let happy = 0, frogLand = 0, pipBump = 0, multBump = 0;
  let rings = [], floats = [], deco = [], ripples = 0, trailT = 0;
  let anims = [], poolPulse = [0, 0, 0], wallWig = [0, 0, 0, 0], growStep = 0, bandWas = false, bumpT = -9, demoTurn = 0, grabCursor = false;
  const PRAISE = ['رائع!', 'ممتاز!', 'مذهل!', 'خارق!'];
  const SAY = { touch: 'حرّك الفأرة إلى الفقاعة', tap: 'انقر على البالون', jump: 'اضغط مسافة', catch: 'حرّك السلة بالأسهم',
    drag: 'اسحب السلحفاة إلى بيتها', dbl: 'انقر مرتين على الصدفة', hold: 'اضغط مطولًا ثم اترك', steer: 'حرّك الغواصة بالأسهم', keys: 'اضغط الحرف نفسه' };
  const ARROWS = { up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'], west: ['ArrowLeft', 'KeyA'], east: ['ArrowRight', 'KeyD'] };
  const STEP = { up: [0, -1], down: [0, 1], west: [-1, 0], east: [1, 0] };

  /* ------------------------------------------------------------ screens */
  const SCREENS = { title: 'scrTitle', grip: 'scrGrip', map: 'scrMap', pause: 'scrPause', result: 'scrResult', closet: 'scrCloset' };
  function setScreen(name) {
    screen = name;
    for (const k in SCREENS) $(SCREENS[k]).hidden = k !== name;
    $('hud').hidden = name !== 'play';
    if (name !== 'play' && grabCursor) { grabCursor = false; canvas.classList.remove('grab'); }
    stopDemo();
    menuIdle = 0; menuNext = 4;
    dirty = true;
    if (name === 'play') focusGame();
  }
  function focusGame() { try { canvas.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  function say(text) { $('live').textContent = text; }
  function starsText(n) { return n === 1 ? 'نجمة واحدة' : n === 2 ? 'نجمتان' : n + ' نجوم'; }
  function setChip(id) { $(id).querySelector('b').textContent = String(BB.total(save)); }

  function toTitle() {
    world = null;
    setScreen('title');
    setChip('titleStars');
    $('btnCloset').classList.toggle('ring', BB.total(save) > 0 && hasNewItem());
  }
  function play() {
    J.select();
    if (!save.grip) showGrip('play');
    else afterGrip();
  }
  // A child who has never played goes straight into the first bubbles; others see the map.
  function afterGrip() {
    if (!BB.total(save)) startLevel(0, 0);
    else toMap(-1);
  }

  /* --------------------------------------------- how to hold: two cards */
  const HALOS = [[[45.6, 33.3]], [[35, 46], [64, 46]]];
  function showGrip(then) {
    gripThen = then; gripCard = 0;
    paintGrip();
    setScreen('grip');
    const warm = new Image(); warm.src = 'grip-keys.webp';
  }
  function paintGrip() {
    $('gripImg').src = gripCard ? 'grip-keys.webp' : 'grip-mouse.webp';
    ['halo1', 'halo2'].forEach((id, i) => {
      const p = HALOS[gripCard][i], el = $(id);
      el.hidden = !p;
      if (p) { el.style.left = p[0] + '%'; el.style.top = p[1] + '%'; }
    });
    const dots = document.querySelectorAll('.grip-dots i');
    dots.forEach((d, i) => d.classList.toggle('on', i === gripCard));
    menuIdle = 0; menuNext = 3; stopDemo();
    gripAt = time;
  }
  function gripNext() {
    if (screen !== 'grip') return;
    if (gripCard === 0) { J.tap(); gripCard = 1; paintGrip(); }
    else { J.select(); gripDone(); }
  }
  // The last card, the X or Esc: the cards are seen and not shown again.
  function gripDone() {
    if (screen !== 'grip') return;
    if (!save.grip) { save.grip = true; persist(); }
    const then = gripThen; gripThen = '';
    if (then === 'play') afterGrip(); else toTitle();
  }

  /* ---------------------------------------------------------------- map */
  // Two pages: worlds 1-5 and worlds 6-11, turned with the big arrows (or ← →).
  const isles = [], pebbles = [];
  let mapPage = 0;
  function starIcons() { return '<span class="st" aria-hidden="true">' + '<svg><use href="#i-star"/></svg>'.repeat(3) + '</span>'; }
  function buildMap() {
    const box = $('islands');
    A.ISLANDS.forEach((p, w) => {
      const isle = document.createElement('button');
      isle.type = 'button'; isle.className = 'bb-btn isle';
      isle.style.left = p.x + 'px'; isle.style.top = p.y + 'px';
      on(isle, () => openIsland(w));
      box.appendChild(isle); isles.push(isle);
      const row = [];
      [0, 1, 2, 'P'].forEach((l, j) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'pebble' + (l === 'P' ? ' party' : '');
        b.dataset.w = String(w); b.dataset.l = String(l);
        b.style.left = (p.x + [96, 32, -32, -96][j]) + 'px'; b.style.top = (p.y + 118) + 'px';
        b.innerHTML = l === 'P' ? '<svg class="ic" aria-hidden="true"><use href="#i-cup"/></svg><span class="best"></span>' : '<b>' + (l + 1) + '</b>' + starIcons();
        on(b, () => pickLevel(w, l, b));
        box.appendChild(b); row.push(b);
      });
      pebbles.push(row);
    });
  }
  function refreshMap() {
    const next = BB.nextLevel(save);
    $('mapNext').hidden = mapPage === 1;
    $('mapPrev').hidden = mapPage === 0;
    // The arrow rings when the next level waits on the other page.
    $('mapNext').classList.toggle('ring', A.pageOf(next.w) === 1);
    $('mapPrev').classList.toggle('ring', A.pageOf(next.w) === 0);
    pebbles.forEach((row, w) => {
      const open = BB.worldOpen(save, w), shown = A.pageOf(w) === mapPage;
      isles[w].hidden = !shown;
      row.forEach(b => { b.hidden = !shown; });
      isles[w].setAttribute('aria-label', 'العالم ' + (w + 1) + (open ? '' : ' (مقفل)'));
      row.forEach((b, j) => {
        const l = j === 3 ? 'P' : j, ok = BB.isOpen(save, w, l), stars = l === 'P' ? 0 : save.stars[w][l];
        b.classList.toggle('locked', !ok);
        b.classList.toggle('done', stars > 0);
        b.classList.toggle('next', next.w === w && next.l === l);
        if (l === 'P') {
          b.querySelector('.best').textContent = save.best[w] ? String(save.best[w]) : '';
          b.querySelector('.best').hidden = !save.best[w];
          b.setAttribute('aria-label', 'الحفلة' + (ok ? (save.best[w] ? '، الأفضل ' + save.best[w] : '') : ' (مقفلة)'));
        } else {
          b.querySelectorAll('.st svg').forEach((s, i) => s.classList.toggle('on', i < stars));
          b.setAttribute('aria-label', 'المرحلة ' + (l + 1) + (ok ? (stars ? '، ' + starsText(stars) : '') : ' (مقفلة)'));
        }
      });
    });
    setChip('mapStars');
  }
  // The map opens on the page of a world just unlocked, else of world w, else of the next level.
  function toMap(fresh, w) {
    world = null;
    mapPage = A.pageOf(fresh >= 0 ? fresh : w >= 0 ? w : BB.nextLevel(save).w);
    refreshMap();
    setScreen('map');
    J.whoosh(0.4);
    unlockFx = fresh >= 0 ? { w: fresh, t: 0 } : null;
    if (unlockFx) {
      J.levelUp();
      const p = A.ISLANDS[fresh];
      for (let i = 0; i < 4; i++) fx.burst(p.x, p.y - 20, { count: 22, colors: ['#ffd23f', '#ffffff', '#ff7eb6', '#4fd1ff'], speed: 340, life: 0.9, size: 8, gravity: 260 });
    }
  }
  function turnPage(p) {
    if (screen !== 'map' || p === mapPage) return;
    J.whoosh(0.6);
    mapPage = p;
    refreshMap();
    stopDemo(); menuIdle = 0; menuNext = 4; unlockFx = null;
    dirty = true;
  }
  function wiggle(el) { el.classList.remove('wiggle'); void el.offsetWidth; el.classList.add('wiggle'); setTimeout(() => el.classList.remove('wiggle'), 500); }
  function pickLevel(w, l, el) {
    if (!BB.isOpen(save, w, l)) { J.tap(); wiggle(el); return; }
    J.select(); startLevel(w, l);
  }
  // A click on an island opens its first level without stars (or its party when all have stars).
  function openIsland(w) {
    if (!BB.worldOpen(save, w)) { J.tap(); wiggle(isles[w]); return; }
    for (let l = 0; l < 3; l++) if (BB.isOpen(save, w, l) && !save.stars[w][l]) { J.select(); startLevel(w, l); return; }
    J.select(); startLevel(w, BB.isOpen(save, w, 'P') ? 'P' : 0);
  }
  function startNext() { const n = BB.nextLevel(save); J.select(); startLevel(n.w, n.l); }

  /* ------------------------------------------------------------- closet */
  const items = [];
  function hasNewItem() { return BB.unlocks(save.seenStars, BB.total(save)).length > 0; }
  function buildCloset() {
    [['color', BB.COLORS, 'colors'], ['hat', BB.HATS, 'hats']].forEach(([type, list, id]) => {
      list.forEach((it, i) => {
        const b = document.createElement('button'), c = document.createElement('canvas');
        b.type = 'button'; b.className = 'bb-btn item';
        c.width = c.height = 96;
        b.appendChild(c);
        b.insertAdjacentHTML('beforeend', '<svg class="lockic" aria-hidden="true"><use href="#i-lock"/></svg><span class="need"><svg aria-hidden="true"><use href="#i-star"/></svg>' + it.need + '</span>');
        on(b, () => equip(type, i, b));
        $(id).appendChild(b);
        items.push({ type: type, i: i, el: b, c: c });
      });
    });
  }
  function refreshCloset() {
    const total = BB.total(save);
    items.forEach(it => {
      const list = it.type === 'color' ? BB.COLORS : BB.HATS, locked = list[it.i].need > total;
      it.el.classList.toggle('locked', locked);
      it.el.classList.toggle('on', (it.type === 'color' ? save.color : save.hat) === it.i);
      it.el.setAttribute('aria-label', (it.type === 'color' ? 'لون ' : 'قبعة ') + (it.i + 1) + (locked ? ' (مقفل)' : ''));
      A.itemIcon(it.c, it, save);
    });
    setChip('closetStars');
  }
  function openCloset(from) {
    closetFrom = from;
    J.select();
    if (save.seenStars !== BB.total(save)) { save.seenStars = BB.total(save); persist(); }
    refreshCloset();
    $('closetBack').querySelector('use').setAttribute('href', from === 'title' ? '#i-home' : '#i-map');
    setScreen('closet');
  }
  function closeCloset() {
    J.back();
    if (closetFrom === 'title') toTitle(); else toMap(-1);
  }
  function equip(type, i, el) {
    const list = type === 'color' ? BB.COLORS : BB.HATS;
    if (list[i].need > BB.total(save)) { J.tap(); wiggle(el); return; }
    if (type === 'color') save.color = i; else save.hat = i;
    persist();
    J.select(); happy = 1;
    fx.burst(960, 400, { count: 26, colors: ['#ffd23f', '#ffffff', A.colorOf(save.color)], speed: 320, life: 0.7, size: 8, gravity: 240 });
    refreshCloset();
  }

  /* -------------------------------------------------------------- levels */
  function startLevel(w, l) {
    // Difficulty is read at every level start.
    const d = dda[w], tier = d.tier;
    const plan = BB.plan(w, l, tier);
    world = BB.create(plan, (Math.random() * 2147483647) | 0);
    if (ptr.known) { world.bop.x = BB.clamp(ptr.x, 0, W); world.bop.y = BB.clamp(ptr.y, 0, H); }
    cur = { w: w, l: l };
    ending = null; result = null;
    clicks = []; jumpPress = false; holdDir = 0; keyDir = 0;
    mouseEvs = []; btnDown = false; letters = []; steerDx = 0; steerDy = 0; steerClick = ''; cancelNext = false;
    anims = []; poolPulse = [0, 0, 0]; wallWig = [0, 0, 0, 0]; keyFx.wrong = {}; keyFx.demo = {}; growStep = 0; bandWas = false;
    fx.clear(); rings = []; floats = [];
    coach.hit = 0; coach.input = 0; coach.said = false; coach.next = taught[world.mode] ? 4 : 1.6;
    setScreen('play');
    Kit.keys.reset();
    J.whoosh(0.5);
  }
  function restart() { J.select(); startLevel(cur.w, cur.l); }
  // A held button or key is let go quietly: a carried turtle waits, a growing bubble is dropped.
  function letGo() {
    holdDir = 0; keyDir = 0; steerDx = 0; steerDy = 0; steerClick = '';
    btnDown = false; mouseEvs = []; letters = []; cancelNext = true;
  }
  function pause(own) {
    if (screen !== 'play') return;
    setScreen('pause');
    letGo();
    if (own) J.back();
  }
  function resume() {
    if (screen !== 'pause') return;
    J.select();
    setScreen('play');
    Kit.keys.reset();
  }
  function quitToMap() {
    J.back();
    toMap(-1, cur.w);
  }

  // A result is saved the moment the level is finished, before the celebration.
  function finishLevel() {
    const r = BB.result(world), stars = BB.stars(r), before = BB.total(save), prev = save.stars[cur.w][cur.l];
    const nextWasOpen = cur.w < BB.N - 1 && BB.worldOpen(save, cur.w + 1), partyWasOpen = BB.isOpen(save, cur.w, 'P');
    if (stars > prev) save.stars[cur.w][cur.l] = stars;
    persist();
    dda[cur.w].result(BB.outcome(r));
    result = { party: false, stars: stars, prev: prev, items: BB.unlocks(before, BB.total(save)),
      newWorld: cur.w < BB.N - 1 && !nextWasOpen && BB.worldOpen(save, cur.w + 1) ? cur.w + 1 : -1, newParty: !partyWasOpen && BB.isOpen(save, cur.w, 'P') };
    ending = { t: 1.5 };
    happy = 1.5;
    J.chime(stars);
    popLeftovers();
    if (!calm()) for (let i = 0; i < 5; i++) fx.burst(160 + i * 240, 160, { count: 24, colors: ['#ff7eb6', '#ffd23f', '#4fd1ff', '#5be38f', '#ffffff'], speed: 380, life: 1.1, size: 9, gravity: 420 });
    shake.add(5);
  }
  function finishParty() {
    const r = BB.result(world), best = save.best[cur.w], isBest = r.score > best;
    if (isBest) { save.best[cur.w] = r.score; persist(); }
    dda[cur.w].result(BB.outcome(r));
    result = { party: true, score: r.score, best: Math.max(best, r.score), isBest: isBest && r.score > 0, items: [] };
    ending = { t: 1.2 };
    happy = 1.2;
    J.chime(2);
    popLeftovers();
  }
  // What is still on screen when a level ends bursts into confetti (no sound, no score).
  function popLeftovers() {
    for (const t of world.targets) {
      if (t.dead) continue;
      t.dead = true;
      burstAt(t.x, t.y, '#ffffff');
      rings.push({ x: t.x, y: t.y, r0: t.r, r1: t.r * 1.5, t: 0, life: 0.3, color: '255,255,255', lw: 6 });
    }
  }
  function showResult() {
    ending = null; resultT = 0; resultLock = 0.6;
    const r = result;
    $('resStars').hidden = r.party;
    $('resScore').hidden = !r.party;
    $('resNewBest').hidden = true;
    $('resGift').hidden = true;
    $('resStars').querySelectorAll('svg').forEach(s => s.classList.remove('on'));
    if (r.party) { $('resNum').textContent = String(r.score); $('resBest').textContent = String(r.best); }
    $('resNext').setAttribute('aria-label', r.party ? 'مرة أخرى' : cur.l < 2 ? 'المرحلة التالية' : 'الخريطة');
    $('resAgain').hidden = r.party;
    say(r.party ? 'النقاط ' + r.score : starsText(r.stars));
    setScreen('result');
  }
  // Stars pop in one by one on the game clock, then the rewards.
  function resultStep(dt) {
    const r = result, before = resultT;
    resultT += dt;
    const at = t => before < t && resultT >= t;
    if (!r.party) {
      for (let i = 0; i < r.stars; i++) if (at(0.3 + i * 0.38)) { $('resStars').children[i].classList.add('on'); J.star(i + 1); burstAt(500 + i * 140, 400, '#ffd23f'); }
      const after = 0.4 + r.stars * 0.38;
      if (at(after)) {
        if (r.items.length) { const it = r.items[r.items.length - 1]; A.itemIcon($('giftCanvas'), it, save); $('resGift').hidden = false; J.chime(3); }
        if (r.newWorld >= 0 || r.newParty) J.levelUp();
      }
    } else if (at(0.35)) {
      if (r.isBest) { $('resNewBest').hidden = false; J.star(3); burstAt(640, 340, '#ffd23f'); }
      else J.star(1);
    }
  }
  function next() {
    if (!result) return;
    J.select();
    if (result.party) startLevel(cur.w, 'P');
    else if (cur.l < 2) startLevel(cur.w, cur.l + 1);
    else toMap(result.newWorld, cur.w);
  }
  function again() { J.select(); startLevel(cur.w, cur.l); }

  /* --------------------------------------------------------------- input */
  // A mouse click hands the keyboard back to the game; keyboard activation keeps focus.
  // Young children double-click everything: the second click of a double click (detail 2)
  // is dropped, since the first one already acted and it would land on the next screen.
  function on(el, fn) {
    el.addEventListener('click', e => { e.stopPropagation(); if (e.detail > 1) return; Kit.audio.unlock(); if (e.detail > 0) { el.blur(); focusGame(); } fn(e); });
  }
  on($('btnPlay'), play);
  on($('btnCloset'), () => openCloset('title'));
  on($('btnHow'), () => { J.select(); showGrip('title'); });
  on($('gripNext'), gripNext);
  on($('gripSkip'), () => { J.back(); gripDone(); });
  // A click anywhere on the cards' screen turns the card, but not in the first moment
  // after it appears: the second click of a double click on Play must not skip it.
  $('scrGrip').addEventListener('click', e => { e.stopPropagation(); if (e.detail < 2 && time - gripAt >= 0.4) gripNext(); });
  on($('mapHome'), () => { J.back(); toTitle(); });
  on($('mapCloset'), () => openCloset('map'));
  on($('btnPause'), () => pause(true));
  on($('btnResume'), resume);
  on($('btnRestart'), restart);
  on($('btnMap'), quitToMap);
  on($('resNext'), () => { if (resultLock <= 0) next(); });
  on($('resAgain'), () => { if (resultLock <= 0) again(); });
  on($('resMap'), () => { if (resultLock <= 0) { J.back(); toMap(result && !result.party && cur.l === 2 ? result.newWorld : -1, cur.w); } });
  on($('mapNext'), () => turnPage(1));
  on($('mapPrev'), () => turnPage(0));
  on($('resGift'), () => openCloset('map'));
  on($('closetBack'), closeCloset);

  window.addEventListener('pointermove', e => {
    const p = view.toLogical(e.clientX, e.clientY);
    if (ptr.known) ptr.travel += Math.min(400, Math.hypot(p.x - ptr.x, p.y - ptr.y));
    ptr.x = p.x; ptr.y = p.y; ptr.known = true; ptr.movedAt = time;
    menuIdle = 0;
    if (screen === 'play' && world && (world.mode === 'touch' || world.mode === 'tap' || btnDown)) { coach.input = 0; flash.move = 1; }
    // A button let go where the page could not see it (outside the frame) ends the drag here.
    if ((btnDown || steerClick) && e.buttons === 0) release(e, false);
  });
  const inRect = (p, k) => Math.abs(p.x - k.x) <= k.w / 2 + 14 && Math.abs(p.y - k.y) <= k.h / 2 + 16;
  canvas.addEventListener('pointerdown', e => {
    focusGame();
    if (e.button !== 0) return;
    const p = view.toLogical(e.clientX, e.clientY);
    ptr.x = p.x; ptr.y = p.y; ptr.known = true;
    menuIdle = 0;
    if (screen === 'play' && world && !ending) {
      // A drag or a hold keeps the pointer, so letting go anywhere (even outside the frame) is seen.
      if (world.mode === 'drag' || world.mode === 'hold' || world.mode === 'steer') { try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* old browsers */ } }
      playClick(p);
    }
    else if (screen === 'title' || screen === 'map' || screen === 'closet') boing(p);
  });
  // Letting go of the button: the end of a drag (where the pointer is now) or of a hold.
  function release(e, cancel) {
    holdDir = 0; steerClick = '';
    if (!btnDown) return;
    btnDown = false;
    if (screen === 'play' && world && world.mode === 'drag') {
      const p = view.toLogical(e.clientX, e.clientY);
      mouseEvs.push({ down: false, x: p.x, y: p.y, cancel: cancel });
    }
  }
  window.addEventListener('pointerup', e => release(e, false));
  window.addEventListener('pointercancel', e => release(e, true));
  window.addEventListener('keydown', e => {
    if (!Kit.isGameKeyEvent(e) || e.repeat) return;
    menuIdle = 0;
    if (e.code !== 'KeyP' && e.code !== 'Escape' && e.code !== 'KeyM' && e.code !== 'Tab') {
      anyKey = e.code;
      // Letters by the key's place (KeyboardEvent.code), so Arabic and English input both work.
      if (screen === 'play' && world && !ending && world.mode === 'keys' && letters.length < 8) letters.push(e.code);
    }
  });
  const keyUnder = p => { for (const code in BB.KEY_LABELS) { const k = BB.keyAt(code); if (k && Math.abs(p.x - k.x) <= BB.KB.u / 2 && Math.abs(p.y - k.y) <= BB.KB.u / 2) return code; } return ''; };
  // Every click in play shows something; nothing a click does ever costs anything.
  function playClick(p) {
    const mode = world.mode;
    flash.click = 1;
    if (mode === 'tap' || mode === 'dbl') { clicks.push({ x: p.x, y: p.y }); coach.input = 0; }
    else if (mode === 'drag') { mouseEvs.push({ down: true, x: p.x, y: p.y }); btnDown = true; coach.input = 0; }
    else if (mode === 'hold') { btnDown = true; coach.input = 0; }
    else if (mode === 'steer') {
      // Tiers 1-2: holding the mouse on an on-screen arrow steers too.
      const dir = Object.keys(STEP).find(d => inRect(p, KEYS[d]));
      if (dir && world.tier <= 2) { steerClick = dir; coach.input = 0; }
      else { flash.keyGlow = 1; ripple(p.x, p.y, true); }
    } else if (mode === 'keys') {
      // A click on the on-screen keyboard only shows the way: the real key pops the balloon.
      const code = keyUnder(p);
      if (code) keyFx.wrong[code] = 0.6;
      flash.keyGlow = 1; ripple(p.x, p.y, true);
    }
    else if (mode === 'jump') {
      const onKey = inRect(p, KEYS.space) || Math.abs(p.x - world.frog.x) < 110 && p.y > world.frog.y - 150;
      if (onKey && BB.knob(world, 'anyKey')) { jumpPress = true; flash.space = 1; coach.input = 0; }
      else { flash.spaceGlow = 1; flash.wiggle = onKey ? 1 : 0.5; ripple(p.x, p.y, true); }
    } else if (mode === 'catch') {
      const side = inRect(p, KEYS.left) ? -1 : inRect(p, KEYS.right) ? 1 : 0;
      if (side && world.tier <= 2) { holdDir = side; coach.input = 0; }
      else { flash.keyGlow = 1; ripple(p.x, p.y, true); }
    } else ripple(p.x, p.y, true);
  }
  // Bop giggles when clicked on the menus.
  function boing(p) {
    if (Math.hypot(p.x - menuBop.x, p.y - menuBop.y) < 90) { happy = 1; J.jump(0.6); menuBop.vy -= 600; }
    else ripple(p.x, p.y, true);
  }
  function handleKeys() {
    const K = Kit.keys, go = K.anyPressed(['Enter', 'NumpadEnter', 'Space']);
    if (screen === 'title') { if (go) play(); }
    else if (screen === 'grip') { if (K.pressed('Escape')) { J.back(); gripDone(); } else if (anyKey) gripNext(); }
    else if (screen === 'map') {
      if (go) startNext(); else if (K.pressed('Escape')) { J.back(); toTitle(); }
      // Right to left: the next page of worlds lies to the left.
      else if (K.anyPressed(['ArrowLeft', 'KeyA'])) turnPage(1); else if (K.anyPressed(['ArrowRight', 'KeyD'])) turnPage(0);
    }
    else if (screen === 'closet') { if (go || K.pressed('Escape')) closeCloset(); }
    else if (screen === 'play') { if (K.anyPressed(['KeyP', 'Escape'])) pause(true); else if (!ending) playKeys(K); }
    else if (screen === 'pause') { if (K.anyPressed(['KeyP', 'Escape', 'Enter', 'NumpadEnter', 'Space'])) resume(); else if (K.pressed('KeyR')) restart(); }
    else if (screen === 'result' && resultLock <= 0) {
      if (go) next(); else if (K.pressed('KeyR')) (result.party ? next() : again());
      else if (K.pressed('Escape')) { J.back(); toMap(-1, cur.w); }
    }
  }
  // Stray keys are never punished: the key or the mouse that is needed lights up instead.
  function playKeys(K) {
    const mode = world.mode;
    if (mode === 'jump') {
      if (K.pressed('Space')) { jumpPress = true; flash.space = 1; coach.input = 0; }
      else if (anyKey) {
        if (BB.knob(world, 'anyKey')) { jumpPress = true; flash.space = 1; coach.input = 0; }
        else { flash.wiggle = 1; flash.spaceGlow = 1; if (!ghost.on) playDemo(); }
      }
    } else if (mode === 'catch') {
      const l = K.anyDown(['ArrowLeft', 'KeyA']), r = K.anyDown(['ArrowRight', 'KeyD']);
      keyDir = (r ? 1 : 0) - (l ? 1 : 0);
      if (l) flash.left = 1;
      if (r) flash.right = 1;
      if (l || r) coach.input = 0;
      else if (anyKey) flash.keyGlow = 1;
    } else if (mode === 'steer') {
      const d = {};
      for (const k in ARROWS) { d[k] = K.anyDown(ARROWS[k]); if (d[k]) flash[k] = 1; }
      steerDx = (d.east ? 1 : 0) - (d.west ? 1 : 0); steerDy = (d.down ? 1 : 0) - (d.up ? 1 : 0);
      if (d.up || d.down || d.west || d.east) coach.input = 0;
      else if (anyKey) flash.keyGlow = 1;
    } else if (mode === 'hold') {
      if (K.down('Space')) { flash.space = 1; coach.input = 0; }
      else if (anyKey) { flash.spaceGlow = 1; flash.mouseHint = 1; }
    } else if (mode === 'keys') {
      if (letters.length) coach.input = 0;
    } else if (anyKey) flash.mouseHint = 1;
  }

  /* ----------------------------------------------------- the ghost hand */
  // A wordless coach: a hand that glides to the next target and presses, on the game
  // clock (it freezes with a pause). Steps: { at, down }, { to, s }, { press, track, onPress },
  // { hold, onHold }, { wait }. Targets may be functions, so the hand follows moving ones.
  // down: the hand reaches down from above, for the keys along the bottom edge.
  // A move step with held: true keeps the finger pressed (a drag) and may carry a see-through
  // copy of a turtle; a press step may set its own period (a quick double click); a hold step
  // may blow a see-through bubble (ghost.blow, its radius).
  const ghost = { on: false, steps: null, i: 0, t: 0, x: 0, y: 0, press: 0, alpha: 0, down: false, carry: null, blow: 0 };
  const pt = p => typeof p === 'function' ? p() : p;
  function demo(steps) {
    const p0 = steps && steps[0] && pt(steps[0].at);
    if (!p0) return false;
    ghost.steps = steps; ghost.i = 0; ghost.t = 0; ghost.on = true; ghost.alpha = 0; ghost.x = p0.x; ghost.y = p0.y; ghost.press = 0;
    ghost.down = !!steps[0].down;
    ghostEl.hidden = false;
    placeGhost();
    return true;
  }
  function stopDemo() { ghost.on = false; ghost.steps = null; ghost.carry = null; ghost.blow = 0; ghostEl.hidden = true; }
  function ghostStep(dt) {
    if (!ghost.on) return;
    const s = ghost.steps[ghost.i];
    if (!s) { stopDemo(); return; }
    ghost.t += dt;
    ghost.alpha = Math.min(1, ghost.alpha + dt * 5);
    ghost.press = 0; ghost.carry = null; ghost.blow = 0;
    let done = false;
    if (s.at) { const p = pt(s.at); if (!p) { stopDemo(); return; } ghost.x = p.x; ghost.y = p.y; done = true; }
    else if (s.to) {
      const p = pt(s.to);
      if (!p) { stopDemo(); return; }
      if (!s.from) s.from = { x: ghost.x, y: ghost.y };
      const k = calm() ? 1 : Math.min(1, ghost.t / s.s), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      ghost.x = s.from.x + (p.x - s.from.x) * e; ghost.y = s.from.y + (p.y - s.from.y) * e;
      if (s.held) { ghost.press = calm() ? 0 : 1; ghost.carry = s.carry || null; }
      if (s.onMove) s.onMove();
      done = k >= 1;
    } else if (s.press) {
      const per = s.period || 0.36, k = ghost.t / per, ph = k % 1;
      if (s.track) { const p = pt(s.track); if (p) { ghost.x = p.x; ghost.y = p.y; } }
      ghost.press = calm() ? 0 : Math.sin(Math.min(1, ph / 0.8) * Math.PI);
      if (s.onPress && ph > 0.35 && s.count !== Math.floor(k)) { s.count = Math.floor(k); s.onPress(); }
      done = ghost.t >= s.press * per;
    } else if (s.hold) { ghost.press = calm() ? 0 : 1; if (s.carry) ghost.carry = s.carry; if (s.onHold) s.onHold(); done = ghost.t >= s.hold; }
    else { if (s.track) { const p = pt(s.track); if (p) { ghost.x = p.x; ghost.y = p.y; } } done = ghost.t >= (s.wait || 0); }
    if (done) { ghost.i++; ghost.t = 0; }
    placeGhost();
  }
  // The fingertip sits at (33, 5) of the 84x105 hand, or at (51, 100) when it is turned over.
  function placeGhost() {
    const y = ghost.y + ghost.press * 16;
    ghostEl.style.transform = ghost.down ? 'translate(' + (ghost.x - 51).toFixed(1) + 'px,' + (y - 100).toFixed(1) + 'px) rotate(180deg)'
      : 'translate(' + (ghost.x - 33).toFixed(1) + 'px,' + (y - 5).toFixed(1) + 'px)';
    ghostEl.style.opacity = (0.92 * ghost.alpha).toFixed(2);
  }
  function centerOf(el) {
    const r = el.getBoundingClientRect();
    return r.width ? view.toLogical(r.left + r.width / 2, r.top + r.height / 2) : null;
  }
  const targetPos = id => () => { const t = world && world.targets.find(o => o.id === id && !o.dead); return t ? { x: t.x, y: t.y } : null; };
  const DEMOS = {
    touch: () => {
      const t = focusTarget();
      return t && [{ at: { x: world.bop.x, y: world.bop.y } }, { to: targetPos(t.id), s: 1.2, onMove: () => { flash.move = 1; } }, { wait: 0.5, track: targetPos(t.id) }];
    },
    tap: () => {
      const t = focusTarget();
      return t && [{ at: { x: world.bop.x, y: world.bop.y } }, { to: targetPos(t.id), s: 0.9 }, { press: 2, track: targetPos(t.id), onPress: () => { flash.click = 1; } }, { wait: 0.3 }];
    },
    // On the right half of the bar, clear of the frog.
    jump: () => [{ at: { x: KEYS.space.x + 150, y: KEYS.space.y - 8 }, down: true }, { press: 3, onPress: () => { flash.space = 1; flash.spaceGlow = 1; } }, { wait: 0.3 }],
    catch: () => {
      const f = focusTarget(), side = f && f.x < world.basket.x ? 'left' : 'right', k = KEYS[side];
      return [{ at: { x: k.x, y: k.y - 10 }, down: true }, { hold: 1.1, onHold: () => { flash[side] = 1; flash.keyGlow = 1; } }, { wait: 0.2 }];
    },
    // Press on the turtle, hold, carry a see-through turtle to its pool, let go.
    drag: () => {
      const t = focusTarget();
      if (!t || t.state !== 'idle') return null;
      const copy = { r: t.r, home: t.home, gold: t.gold, phase: t.phase, face: 1 };
      const home = () => { const p = world && world.pools.length ? BB.poolOf(world, t.home) : null; return p && { x: p.x, y: p.y }; };
      return [{ at: { x: t.x + 130, y: Math.min(H - 60, t.y + 110) } }, { to: targetPos(t.id), s: 0.8 },
        { hold: 0.35, carry: copy, onHold: () => { flash.held = 1; } },
        { to: home, s: 1.4, held: true, carry: copy, onMove: () => { flash.held = 1; flash.move = 1; } }, { wait: 0.5 }];
    },
    // Two quick taps on the clam, a pause, and two more.
    dbl: () => {
      const t = focusTarget();
      if (!t) return null;
      const tap = () => { flash.click = 1; flash.two = 1; };
      return [{ at: { x: t.x + 140, y: Math.min(H - 60, t.y + 120) } }, { to: targetPos(t.id), s: 0.9 },
        { press: 2, period: 0.2, track: targetPos(t.id), onPress: tap }, { wait: 0.7, track: targetPos(t.id) },
        { press: 2, period: 0.2, track: targetPos(t.id), onPress: tap }, { wait: 0.3 }];
    },
    // Hold (on the wand with the mouse, or on the Space bar) while a see-through bubble fills the ring.
    hold: () => {
      const t = world.targets.find(o => !o.dead && o.kind === 'wand');
      if (!t || t.state !== 'ready') return null;
      const dur = BB.holdTime(world.tier, t.r) / (world.party ? Math.pow(1.06, world.wave - 1) : 1), bar = demoTurn++ % 2 === 1;
      const at = bar ? { x: KEYS.space.x + 150, y: KEYS.space.y - 8 } : { x: t.x + 4, y: 580 };
      const grow = () => { ghost.blow = BB.BUBBLE0 + (t.ring - BB.BUBBLE0) * Math.min(1, ghost.t / dur); if (bar) { flash.space = 1; flash.spaceGlow = 1; } else flash.held = 1; };
      return [{ at: at, down: bar }, { wait: 0.3 }, { hold: dur, onHold: grow }, { wait: 0.5 }];
    },
    // Hold the arrow that points towards the starfish.
    steer: () => {
      const t = focusTarget();
      if (!t) return null;
      const vx = t.x - world.sub.x, vy = t.y - world.sub.y;
      const dir = Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? 'east' : 'west') : (vy > 0 ? 'down' : 'up'), k = KEYS[dir];
      return [{ at: { x: k.x, y: k.y - 8 }, down: true }, { hold: 1.1, onHold: () => { flash[dir] = 1; flash.keyGlow = 1; } }, { wait: 0.2 }];
    },
    // Press the key the balloon carries, on the on-screen keyboard.
    keys: () => {
      const b = focusTarget(), k = b && BB.keyAt(b.code);
      if (!k) return null;
      return [{ at: { x: k.x, y: k.y - 4 }, down: true }, { press: 2, onPress: () => { keyFx.demo[b.code] = 1; flash.keyGlow = 1; } }, { wait: 0.3 }];
    }
  };
  function playDemo() {
    const steps = DEMOS[world.mode]();
    if (!steps || !demo(steps)) return false;
    taught[world.mode] = 1;
    if (!coach.said) { coach.said = true; speak(SAY[world.mode]); }
    return true;
  }
  // After 4 s without a pop the hand shows the move, and again every 6 s.
  function coachStep(dt) {
    coach.hit += dt; coach.input += dt;
    if (ending || ghost.on || coach.hit < coach.next) return;
    if (coach.input < 0.6 && coach.hit < coach.next + 4) return;
    // Nothing to point at yet: try again in a moment.
    coach.next = coach.hit + (playDemo() ? 6 : 0.5);
  }
  // The menus get the same hand: Play on the title, the next pebble on the map, and so on.
  function menuDemo() {
    let el = null, press = 2;
    if (screen === 'title') el = $('btnPlay');
    else if (screen === 'map') {
      // The next level, or the arrow to its page.
      el = document.querySelector('.pebble.next:not([hidden])') || (mapPage ? $('mapPrev') : $('mapNext'));
    }
    else if (screen === 'result' && resultT > 1.5) el = $('resNext');
    else if (screen === 'grip') el = gripCard ? $('halo2') : $('halo1');
    if (!el) return;
    const p = centerOf(el);
    if (!p) return;
    const from = { x: p.x + 150, y: Math.min(H - 40, p.y + 120) };
    demo([{ at: from }, { to: p, s: 0.9 }, { press: press }, { wait: 0.3 }]);
  }

  /* -------------------------------------------------------------- speech */
  // Optional Arabic speech for the first hint of a level: only an Arabic voice installed
  // on the PC (an online voice, such as a browser's cloud voices, would send the words to
  // a server: games never use the network), never while muted, never needed to play.
  let voice;
  function findVoice() {
    voice = null;
    if (!window.speechSynthesis || !speechSynthesis.getVoices) return;
    let list = [];
    try { list = speechSynthesis.getVoices() || []; } catch (e) { return; }
    for (const v of list) {
      if (!v || v.localService === false || !/^ar([-_]|$)/i.test(v.lang || '')) continue;
      if (/^ar[-_]SA$/i.test(v.lang)) { voice = v; return; }
      if (!voice) voice = v;
    }
  }
  function hush() { try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) { /* speech is optional */ } }
  function speak(text) {
    if (!text || !window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
    if (Kit.audio.muted) { hush(); return; }
    if (voice === undefined) findVoice();
    if (!voice) return;
    try {
      hush();
      const u = new SpeechSynthesisUtterance(text);
      u.voice = voice; u.lang = voice.lang; u.rate = 0.9;
      speechSynthesis.speak(u);
    } catch (e) { /* never depend on speech */ }
  }
  if (window.speechSynthesis) { try { speechSynthesis.addEventListener('voiceschanged', findVoice); } catch (e) { /* older engines */ } }
  Kit.audio.onMuteChange(m => { if (m) hush(); });

  /* ------------------------------------------------------------- effects */
  function ripple(x, y, soft) {
    ripples++;
    rings.push({ x: x, y: y, r0: 8, r1: soft ? 46 : 70, t: 0, life: 0.4, color: soft ? '255,255,255' : '255,204,0', lw: 6 });
    if (rings.length > 24) rings.shift();
  }
  function burstAt(x, y, color) {
    fx.burst(x, y, { count: 16, colors: [color, '#ffffff', '#ffd23f'], speed: 300, life: 0.6, size: 8, gravity: 300 });
  }
  function float(x, y, text, color, size) {
    floats.push({ x: x, y: y, text: text, color: color, size: size || 34, t: 0, rtl: /[؀-ۿ]/.test(text) });
    if (floats.length > 16) floats.shift();
  }
  const POP_COLORS = { bubble: A.TINTS, balloon: A.BALLOONS, fly: ['#fff27a', '#ffd23f'], fruit: A.FRUIT,
    turtle: ['#9ef0ff', '#ffffff', '#5cc96b'], clam: ['#fff7fb', '#c58bff', '#ff8fc0'], wand: ['#9fe4ff', '#ff9ad5', '#fff27a'], star: A.STARS, kballoon: A.BALLOONS };
  function popColor(e) {
    if (e.gold) return '#ffc93c';
    if (e.kind === 'fruit') return POP_COLORS.fruit[e.type];
    if (e.kind === 'turtle') return A.HOMES[e.home % 3];
    const list = POP_COLORS[e.kind] || ['#ffffff'];
    return list[e.color % list.length] || '#ffffff';
  }
  // Short pictures that outlive a target: a bubble floating off with its critter, a turtle
  // swimming in its pool, a pearl flying up, a keycap falling from a popped balloon.
  function anim(a) { a.t = 0; anims.push(a); if (anims.length > 12) anims.shift(); }
  function onPop(e) {
    const col = popColor(e), k = e.kind, r = k === 'wand' ? e.br : e.r;
    if (k === 'bubble') { J.pop(Math.min(1, e.r / 70)); shake.add(2); }
    else if (k === 'balloon' || k === 'kballoon') { J.impact(0.3); J.pop(0.85); shake.add(4); }
    else if (k === 'fly' || k === 'star') { J.coin(Math.min(5, e.combo)); shake.add(2); }
    else if (k === 'turtle') { J.coin(Math.min(5, e.combo)); J.pop(0.45); shake.add(2); }
    else if (k === 'clam') { J.pop(0.6); J.coin(Math.min(5, e.combo)); shake.add(2); }
    else if (k === 'wand') { J.chime(1); J.pop(0.95); shake.add(2); }
    else { J.impact(0.22); shake.add(3); }
    if (e.combo >= 2) J.streak(e.combo);
    if (e.gold) J.coin(5);
    if (k === 'turtle') anim({ kind: 'swim', x: e.x, y: e.y, home: e.home, gold: e.gold, r: e.r });
    else if (k === 'clam') { anim({ kind: 'clam', x: e.x, y: e.y, r: e.r, color: e.color, gold: e.gold }); anim({ kind: 'pearl', x: e.x, y: e.y - e.r * 0.3, gold: e.gold }); }
    else if (k === 'wand') anim({ kind: 'float', x: e.x, y: e.y, r: e.br, critter: e.critter, sway: Math.random() * 6 });
    else if (k === 'kballoon') anim({ kind: 'cap', x: e.x, y: e.y + e.r * 1.4 + 26, code: e.code, size: e.cap || 70, vx: (Math.random() - 0.5) * 120, vy: -160, spin: (Math.random() - 0.5) * 6 });
    fx.burst(e.x, e.y, { count: k === 'balloon' || k === 'kballoon' || k === 'wand' ? 18 : 12, colors: [col, '#ffffff', col], speed: k === 'balloon' || k === 'kballoon' ? 340 : 260, life: 0.55, size: 8,
      gravity: k === 'bubble' || k === 'wand' ? 60 : k === 'turtle' ? 200 : 380 });
    rings.push({ x: e.x, y: e.y, r0: r * 0.8, r1: r * 1.6, t: 0, life: 0.3, color: '255,255,255', lw: 7 });
    if (world.party) float(e.x, e.y - r - 10, '+' + e.points, e.gold ? '#ffd23f' : '#ffffff', e.points > 1 ? 40 : 32);
    if (e.combo >= 5 && e.combo % 5 === 0) float(e.x, e.y - r - 54, PRAISE[Math.min(3, e.combo / 5 - 1)], '#ffd23f', 44);
    if (world.party && e.mult > 1 && e.combo % 5 === 0) multBump = 1;
    happy = Math.max(happy, 0.6); pipBump = 1;
    coach.hit = 0; coach.next = 4; stopDemo();
  }
  const byId = id => world.targets.find(o => o.id === id && !o.dead);
  function handleEvents() {
    for (const e of world.ev) {
      if (e.t === 'pop') onPop(e);
      else if (e.t === 'escape') {
        if (e.kind === 'fruit') { J.land(0.2); fx.burst(e.x, BB.BASKET.ground - 6, { count: 8, colors: ['#ffffff', '#c8f0a0'], speed: 160, life: 0.4, size: 6, gravity: 500 }); }
        else if (e.kind === 'clam') fx.burst(e.x, e.y + 30, { count: 8, colors: ['#ffe39a', '#ffffff'], speed: 120, life: 0.4, size: 6, gravity: 300 });
      } else if (e.t === 'missClick') {
        ripple(e.x, e.y, true); J.tap();
      } else if (e.t === 'jump') J.jump(0.7);
      else if (e.t === 'land') { J.land(0.3); frogLand = 1; }
      else if (e.t === 'vanish') rings.push({ x: e.x, y: e.y, r0: e.r, r1: e.r * 1.3, t: 0, life: 0.35, color: '255,255,255', lw: 5 });
      else if (e.t === 'segment') { J.whoosh(0.7); coach.hit = 0; coach.next = taught[world.mode] ? 4 : 1.6; coach.said = false; stopDemo(); keyDir = 0; holdDir = 0; steerClick = ''; cancelNext = true; }
      else if (e.t === 'wave') { J.whoosh(0.9); J.chime(1); multBump = 1; burstAt(W / 2, 60, '#ffd23f'); }
      else if (e.t === 'done') finishLevel();
      else if (e.t === 'timeup') finishParty();
      // worlds 6-11
      else if (e.t === 'grab' || e.t === 'pick') { J.toggle(true); stopDemo(); fx.burst(e.x, e.y + 30, { count: 6, colors: ['#ffe39a', '#ffffff'], speed: 120, life: 0.35, size: 6, gravity: 300 }); }
      else if (e.t === 'home') { J.whoosh(0.3); rings.push({ x: e.x, y: e.y, r0: e.r * 0.3, r1: e.r * 1.1, t: 0, life: 0.45, color: '159,228,255', lw: 8 }); }
      else if (e.t === 'drop') J.land(0.25);
      else if (e.t === 'wrong') { J.jump(0.45); poolPulse[e.home % 3] = 1.6; const t = byId(e.id); if (t) t.wig = 1; }
      else if (e.t === 'knock') { J.tap(); flash.two = 1; }
      else if (e.t === 'crack') { J.impact(0.3); shake.add(2); burstAt(e.x, e.y - e.r * 0.4, '#fff7fb'); }
      else if (e.t === 'blow') { J.whoosh(0.15); growStep = 0; bandWas = false; }
      else if (e.t === 'poof') { J.pop(0.1); anim({ kind: 'poof', x: e.x, y: e.y, r: e.br }); }
      else if (e.t === 'boing') {
        J.jump(1); J.land(0.6); shake.add(4);
        fx.burst(e.x, e.y, { count: 22, colors: ['#9fe4ff', '#ff9ad5', '#fff27a', '#ffffff'], speed: 420, life: 0.6, size: 8, gravity: 260 });
        rings.push({ x: e.x, y: e.y, r0: e.br, r1: e.br * 1.35, t: 0, life: 0.35, color: '255,255,255', lw: 8 });
      } else if (e.t === 'bump') {
        if (time - bumpT > 0.3) { J.land(0.3); bumpT = time; }
        wallWig[e.wall] = 1;
        fx.burst(e.x, e.y, { count: 5, colors: ['#ffffff', '#bff0ff'], speed: 90, life: 0.5, size: 6, gravity: -60 });
      } else if (e.t === 'wrongKey') {
        J.tap(); keyFx.wrong[e.code] = 1; flash.keyGlow = 1;
      }
    }
    world.ev.length = 0;
  }
  // The target the pulsing ring (and the coach) points at.
  function focusTarget() {
    if (!world) return null;
    const m = world.mode;
    if (m === 'drag' && (world.held || world.carry)) return byId(world.held || world.carry) || null;
    let best = null, d = Infinity;
    for (const t of world.targets) {
      if (t.dead || (m === 'drag' && t.state !== 'idle')) continue;
      const v = m === 'jump' ? Math.abs(t.x - world.frog.x) : m === 'catch' ? -t.y : m === 'keys' ? t.id
        : m === 'steer' ? Math.hypot(t.x - world.sub.x, t.y - world.sub.y) : Math.hypot(t.x - world.bop.x, t.y - world.bop.y);
      if (v < d) { d = v; best = t; }
    }
    return best;
  }

  /* ----------------------------------------------------------------- loop */
  function decay(dt) {
    for (const k in flash) flash[k] = Math.max(0, flash[k] - dt * 3);
    happy = Math.max(0, happy - dt * 1.5); frogLand = Math.max(0, frogLand - dt * 5);
    pipBump = Math.max(0, pipBump - dt * 4); multBump = Math.max(0, multBump - dt * 3);
    for (let i = rings.length - 1; i >= 0; i--) { rings[i].t += dt; if (rings[i].t > rings[i].life) rings.splice(i, 1); }
    for (let i = floats.length - 1; i >= 0; i--) { const f = floats[i]; f.t += dt; f.y -= dt * 46; if (f.t > 1.1) floats.splice(i, 1); }
    for (let i = 0; i < 3; i++) poolPulse[i] = Math.max(0, poolPulse[i] - dt);
    for (let i = 0; i < 4; i++) wallWig[i] = Math.max(0, wallWig[i] - dt * 2.5);
    for (const m of [keyFx.wrong, keyFx.demo]) for (const c in m) { m[c] -= dt * 1.6; if (m[c] <= 0) delete m[c]; }
    for (let i = anims.length - 1; i >= 0; i--) {
      const a = anims[i];
      a.t += dt;
      if (a.kind === 'float') { a.y -= dt * (120 + 160 * Math.min(1, a.t)); a.x += Math.sin(a.t * 3 + a.sway) * 40 * dt; if (a.t > 2.2) { burstAt(a.x, a.y, '#9fe4ff'); anims.splice(i, 1); } }
      else if (a.kind === 'poof') { a.y -= dt * 240; if (a.t > 0.5) { fx.burst(a.x, a.y, { count: 8, colors: ['#9fe4ff', '#ffffff'], speed: 140, life: 0.35, size: 5, gravity: 0 }); anims.splice(i, 1); } }
      else if (a.kind === 'cap') { a.vy += 1400 * dt; a.x += a.vx * dt; a.y += a.vy * dt; if (a.y > H + 80) anims.splice(i, 1); }
      else if (a.t > (a.kind === 'pearl' ? 0.7 : 1.1)) anims.splice(i, 1);
    }
  }
  // Worlds 6-11: the rising notes of a growing bubble, and a chime the moment it fills the ring.
  function holdSounds() {
    const t = world.mode === 'hold' && world.targets.find(o => !o.dead && o.state === 'grow');
    if (!t) { bandWas = false; return; }
    const n = Math.floor((t.br - BB.BUBBLE0) / Math.max(10, t.ring - BB.BUBBLE0) * 4);
    if (n > growStep && n <= 4) { growStep = n; J.streak(n); }
    if (t.inBand && !bandWas) { J.select(); flash.spaceGlow = 1; }
    bandWas = t.inBand;
  }
  function playStep(dt) {
    if (!ending) {
      if (world.party) { const left = Math.ceil(BB.left(world) - dt), was = Math.ceil(BB.left(world)); if (left !== was && left >= 1 && left <= 3) J.countdown(left); }
      const sc = steerClick ? STEP[steerClick] : null, hold = btnDown || (world.mode === 'hold' && Kit.keys.down('Space'));
      const input = { px: ptr.known ? ptr.x : null, py: ptr.known ? ptr.y : null, clicks: clicks, jump: jumpPress, dir: keyDir || holdDir,
        mouse: mouseEvs, hold: hold, dx: steerDx || (sc ? sc[0] : 0), dy: steerDy || (sc ? sc[1] : 0), keys: letters, cancel: cancelNext };
      clicks = []; jumpPress = false; mouseEvs = []; letters = []; cancelNext = false;
      if (hold) coach.input = 0;
      if (steerClick) flash[steerClick] = 1;
      BB.step(world, dt, input);
      handleEvents();
      holdSounds();
      coachStep(dt);
      for (const t of world.targets) if (t.wig) t.wig = Math.max(0, t.wig - dt * 2);
      // A hand pointer over a turtle that can be picked up, and while carrying one.
      const grab = world.mode === 'drag' && !!(world.held || world.carry || world.targets.some(t => t.hot && !t.dead));
      if (grab !== grabCursor) { grabCursor = grab; canvas.classList.toggle('grab', grab); }
      // A quick Bop leaves a short sparkle trail (none under reduced motion).
      const b = world.bop, sp = Math.hypot(b.vx, b.vy);
      trailT -= dt;
      if ((world.mode === 'touch' || world.mode === 'tap') && sp > 500 && trailT <= 0) {
        trailT = 0.05;
        fx.burst(b.x - b.vx * 0.03, b.y - b.vy * 0.03, { count: 2, colors: ['#ffffff', A.colorOf(save.color)], speed: 60, life: 0.35, size: 6, gravity: -40 });
      }
    } else {
      ending.t -= dt;
      if (ending.t <= 0) showResult();
    }
  }
  function decoStep(dt) {
    while (deco.length < 7) deco.push({ x: 120 + Math.random() * 1040, y: H + 40 + Math.random() * 400, r: 22 + Math.random() * 26, color: (Math.random() * 6) | 0, phase: Math.random() * 6, vy: 24 + Math.random() * 30 });
    const recent = time - ptr.movedAt < 1;
    for (let i = deco.length - 1; i >= 0; i--) {
      const b = deco[i];
      b.y -= b.vy * dt; b.x += Math.cos(time * 1.2 + b.phase) * 12 * dt;
      // A moving Bop pops title bubbles too; a resting one never does (silent while idle).
      if (recent && Math.hypot(b.x - menuBop.x, b.y - menuBop.y) < b.r + BB.BOP_R) {
        J.pop(b.r / 70); burstAt(b.x, b.y, A.TINTS[b.color]); happy = 0.6; deco.splice(i, 1);
      } else if (b.y < -b.r - 10) deco.splice(i, 1);
    }
  }
  function update(dt) {
    time += dt;
    handleKeys();
    if (screen === 'play') playStep(dt);
    else {
      const home = screen === 'closet' ? { x: 960, y: 400 } : { x: 640, y: 364 };
      const tx = (screen === 'title' || screen === 'map') && ptr.known ? ptr.x : home.x, ty = (screen === 'title' || screen === 'map') && ptr.known ? ptr.y : home.y;
      if (screen !== 'pause' && screen !== 'grip') BB.follow(menuBop, BB.clamp(tx, 40, W - 40), BB.clamp(ty, 40, H - 40), dt);
      if (screen === 'title') decoStep(dt);
      if (screen === 'result') resultStep(dt);
      if (resultLock > 0) resultLock -= dt;
      if (unlockFx) { unlockFx.t += dt; if (unlockFx.t > 1.4) unlockFx = null; }
      // Menus get the hand too after 4 idle seconds, then every 6 s.
      if (screen !== 'pause' && screen !== 'closet') {
        menuIdle += dt;
        if (!ghost.on && menuIdle >= menuNext) { menuNext = menuIdle + 6; menuDemo(); }
      }
    }
    if (screen !== 'pause') {
      ghostStep(dt);
      fx.update(dt); shake.update(dt); decay(dt);
      if (fx.list.length > 320) fx.list.splice(0, fx.list.length - 320);
    }
    Kit.keys.endFrame();
    anyKey = '';
  }

  /* --------------------------------------------------------------- render */
  function bopLook() { return ptr.known ? { x: ptr.x, y: ptr.y } : null; }
  function drawFxLayer(ctx) {
    fx.draw(ctx);
    const still = calm();
    for (const r of rings) {
      const k = r.t / r.life, rad = still ? r.r1 * 0.8 : r.r0 + (r.r1 - r.r0) * k;
      A.circle(ctx, r.x, r.y, rad); ctx.lineWidth = r.lw; ctx.strokeStyle = 'rgba(' + r.color + ',' + (1 - k).toFixed(2) + ')'; ctx.stroke();
    }
    for (const f of floats) {
      ctx.globalAlpha = Math.max(0, 1 - Math.max(0, f.t - 0.6) / 0.5);
      A.text(ctx, f.text, f.x, f.y, f.size, f.color, f.rtl);
    }
    ctx.globalAlpha = 1;
  }
  function drawTitle(ctx) {
    const still = calm();
    ctx.drawImage(A.bg('sea', pixelScale()), 0, 0, W, H);
    for (const b of deco) A.bubble(ctx, b, time, still);
    A.bop(ctx, menuBop.x, menuBop.y, { color: save.color, hat: save.hat, time: time, still: still, scale: 1.5, vx: menuBop.vx, vy: menuBop.vy, look: bopLook(), happy: happy });
    drawFxLayer(ctx);
  }
  function drawMap(ctx) {
    const still = calm();
    ctx.drawImage(A.bg(mapPage ? 'map2' : 'map', pixelScale()), 0, 0, W, H);
    A.ISLANDS.forEach((p, w) => {
      if (A.pageOf(w) !== mapPage) return;
      const fresh = unlockFx && unlockFx.w === w;
      if (!BB.worldOpen(save, w)) A.lock(ctx, p.x, p.y - 30, mapPage ? 0.86 : 1);
      else if (fresh && unlockFx.t < 0.8) { ctx.globalAlpha = 1 - unlockFx.t / 0.8; const s = 1 + unlockFx.t; ctx.save(); ctx.translate(p.x, p.y - 30); ctx.scale(s, s); A.lock(ctx, 0, 0); ctx.restore(); ctx.globalAlpha = 1; }
    });
    A.bop(ctx, menuBop.x, menuBop.y, { color: save.color, hat: save.hat, time: time, still: still, scale: 0.9, vx: menuBop.vx, vy: menuBop.vy, look: bopLook(), happy: happy });
    drawFxLayer(ctx);
  }
  function drawCloset(ctx) {
    const still = calm();
    ctx.drawImage(A.bg('sky', pixelScale()), 0, 0, W, H);
    ctx.beginPath(); ctx.ellipse(960, 606, 190, 44, 0, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.lineWidth = 6; ctx.strokeStyle = A.INK; ctx.stroke();
    A.bop(ctx, 960, 400, { color: save.color, hat: save.hat, time: time, still: still, scale: 3, look: bopLook(), happy: happy });
    drawFxLayer(ctx);
  }
  function drawResult(ctx) {
    const still = calm();
    ctx.drawImage(A.bg(BB.WORLDS[cur.w].scene, pixelScale()), 0, 0, W, H);
    ctx.fillStyle = 'rgba(28,34,80,0.25)'; ctx.fillRect(0, 0, W, H);
    // Room above for the tallest hat (the wizard's) while Bop hops.
    const hop = still ? 0 : Math.abs(Math.sin(time * 5)) * -20;
    A.bop(ctx, 640, 212 + hop, { color: save.color, hat: save.hat, time: time, still: still, scale: 1.75, look: bopLook(), happy: 1 });
    drawFxLayer(ctx);
  }
  function drawTargets(ctx, still) {
    for (const t of world.targets) {
      if (t.dead) continue;
      if (t.kind === 'bubble') A.bubble(ctx, t, time, still);
      else if (t.kind === 'balloon') A.balloon(ctx, t, time, still);
      else if (t.kind === 'fly') A.fly(ctx, t, time, still);
      else A.fruit(ctx, t, time, still);
    }
  }
  // Effects that outlive a target (see anim()).
  function drawAnims(ctx, still) {
    for (const a of anims) {
      const fade = a.kind === 'float' ? Math.max(0, 1 - Math.max(0, a.t - 1.6) / 0.6) : 1;
      ctx.globalAlpha = fade;
      if (a.kind === 'float') { A.soap(ctx, a.x, a.y, a.r); A.critter(ctx, a.critter, a.x, a.y + 4, 0.9); }
      else if (a.kind === 'poof') A.soap(ctx, a.x, a.y, Math.max(6, a.r * (1 - a.t)));
      else if (a.kind === 'clam') {
        ctx.globalAlpha = Math.max(0, 1 - Math.max(0, a.t - 0.6) / 0.5);
        A.clam(ctx, { x: a.x, y: a.y, r: a.r, color: a.color, phase: 0, knock: 0, dig: 0, gold: a.gold }, time, still, { open: Math.min(1, a.t / 0.12), empty: true });
      } else if (a.kind === 'swim') { ctx.globalAlpha = Math.max(0, 1 - a.t / 1.1); A.turtle(ctx, { x: a.x, y: a.y - (still ? 0 : Math.sin(a.t * 9) * 4), r: a.r * 0.75, home: a.home, gold: a.gold, face: 1, phase: 0 }, time, still, false); }
      else if (a.kind === 'pearl') { const k = Math.min(1, a.t / 0.7), e = k * k; A.pearl(ctx, a.x + (W / 2 - a.x) * e, a.y + (44 - a.y) * e - Math.sin(k * Math.PI) * 80, 20 * (1 - 0.5 * k), a.gold); }
      else if (a.kind === 'cap') { ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(still ? 0 : a.spin * a.t); A.keycap(ctx, a.code, 0, 0, a.size, 0); ctx.restore(); }
    }
    ctx.globalAlpha = 1;
  }
  // Worlds 6-11: the scene's moving parts, Bop, and the real input device lighting up with it.
  function drawNew(ctx, w, still, focus, look) {
    const mode = w.mode, scene = BB.WORLDS[cur.w].scene;
    const sit = (x, y, s) => A.bop(ctx, x, y, { color: save.color, hat: save.hat, time: time, still: still, scale: s, look: look, happy: happy });
    const ring = focus && !ending ? () => A.ring(ctx, focus.x, focus.y, focus.kind === 'star' ? focus.r + 10 : focus.kind === 'clam' ? focus.r * 1.05 : focus.r * 1.12, time, still) : () => {};
    if (mode === 'drag') {
      const hand = w.held || w.carry, carried = hand ? byId(hand) : null;
      for (const p of w.pools) A.pool(ctx, p, time, still, { glow: carried ? (carried.home === p.color ? 1 : 0) : focus && focus.home === p.color ? 0.35 : 0, pulse: poolPulse[p.color] });
      // The youngest see a dotted path from the next turtle to its pool.
      if (!carried && focus && w.tier <= 2) { const p = BB.poolOf(w, focus.home); A.guide(ctx, focus.x, focus.y, p.x, p.y, focus.r + 6, p.r + 10, time, still); }
      if (!carried) ring();
      sit(96, 640, 0.7);
      for (const t of w.targets) if (!t.dead && t.id !== hand) A.turtle(ctx, t, time, still, false);
      drawAnims(ctx, still);
      if (ghost.on && ghost.carry) { ctx.globalAlpha = 0.55 * ghost.alpha; A.turtle(ctx, Object.assign({}, ghost.carry, { x: ghost.x, y: ghost.y + 6 }), time, still, true); ctx.globalAlpha = 1; }
      if (carried) A.turtle(ctx, carried, time, still, true);
    } else if (mode === 'dbl') {
      ring();
      // Away from the reef, the clams up high stand on little podiums (drawn behind every clam).
      if (scene !== 'reef') for (const t of w.targets) if (!t.dead && t.rock) A.podium(ctx, t.x, t.y + t.r * 0.42, 630);
      for (const t of w.targets) if (!t.dead) { A.clam(ctx, t, time, still, { open: 0 }); A.clamDots(ctx, t, t.armed, time, still); }
      sit(70, 652, 0.65);
      drawAnims(ctx, still);
    } else if (mode === 'hold') {
      const t = w.targets.find(o => !o.dead) || { x: BB.WAND.x, y: BB.WAND.y, r: 0, ring: 0, state: 'gone', critter: 0 };
      A.wand(ctx, t, time, still, { tol: BB.knob(w, 'tol'), ghost: ghost.on ? ghost.blow : 0 });
      sit(330, 616, 0.8);
      drawAnims(ctx, still);
    } else if (mode === 'steer') {
      w.walls.forEach((wl, i) => A.coral(ctx, wl, wallWig[i] || 0, time, still));
      ring();
      for (const t of w.targets) if (!t.dead) A.starfish(ctx, t, time, still);
      A.sub(ctx, w.sub, { bop: { color: save.color }, time: time, still: still, happy: happy });
      drawAnims(ctx, still);
    } else if (mode === 'keys') {
      ring();
      for (const t of w.targets) if (!t.dead) A.kballoon(ctx, t, time, still, t === focus);
      sit(66, 572, 0.62);
      drawAnims(ctx, still);
    }
    drawFxLayer(ctx);
    // The input mirror.
    if (mode === 'drag' || mode === 'dbl') {
      const hot = w.targets.some(t => t.hot && !t.dead);
      A.mouseIcon(ctx, { move: flash.move, click: flash.click, held: mode === 'drag' && (btnDown || flash.held > 0.4) ? 1 : 0, two: mode === 'dbl' ? 1 : 0,
        hint: Math.max(flash.mouseHint, hot ? 1 : 0.25), time: time, still: still });
    } else if (mode === 'hold') {
      const t = w.targets.find(o => !o.dead), ready = t && t.state === 'ready';
      A.spaceBar(ctx, { down: Kit.keys.down('Space') || flash.space > 0.55, glow: Math.max(flash.spaceGlow, ready ? 0.45 + 0.35 * Math.sin(time * 6) : 0), wiggle: 0, time: time, still: still });
      A.mouseIcon(ctx, { move: 0, click: 0, held: btnDown || flash.held > 0.4 ? 1 : 0, hint: Math.max(flash.mouseHint, ready ? 0.6 : 0), time: time, still: still });
    } else if (mode === 'steer') {
      const vx = focus ? focus.x - w.sub.x : 0, vy = focus ? focus.y - w.sub.y : 0, pul = still ? 0.8 : 0.55 + 0.45 * Math.sin(time * 8);
      const want = { east: vx > 40, west: vx < -40, down: vy > 40, up: vy < -40 };
      for (const d of ['west', 'down', 'east', 'up']) {
        A.arrowCap(ctx, d, { down: Kit.keys.anyDown(ARROWS[d]) || flash[d] > 0.55 || steerClick === d, glow: Math.max(flash.keyGlow * 0.8, want[d] ? pul : 0) });
      }
    } else if (mode === 'keys') {
      // The keyboard is always there, and the key of every balloon glows at once (brightest:
      // the next one); a key pressed shows down, a wrong one flashes.
      const glow = {}, down = {};
      for (const t of w.targets) if (!t.dead) glow[t.code] = Math.max(t === focus ? 1 : 0.6, flash.keyGlow);
      for (const code in BB.KEY_LABELS) if (Kit.keys.down(code) || (keyFx.demo[code] || 0) > 0.5) down[code] = true;
      A.keyboard(ctx, { glow: glow, down: down, wrong: keyFx.wrong, time: time, still: still, k: pixelScale() });
    }
  }
  const NEW_MODES = { drag: 1, dbl: 1, hold: 1, steer: 1, keys: 1 };
  function drawPlay(ctx) {
    const w = world, still = calm(), mode = w.mode, focus = ending ? null : focusTarget();
    ctx.drawImage(A.bg(BB.WORLDS[cur.w].scene, pixelScale()), 0, 0, W, H);
    const look = focus ? { x: focus.x, y: focus.y } : bopLook();
    if (NEW_MODES[mode]) { drawNew(ctx, w, still, focus, look); drawHud(ctx, w, still); return; }
    if (mode === 'catch') for (const t of w.targets) if (!t.dead) A.fruitShadow(ctx, t);
    if (focus) A.ring(ctx, focus.x, focus.y, focus.kind === 'balloon' ? focus.r * 1.15 : focus.kind === 'fly' ? focus.r + 8 : focus.r, time, still);
    if (mode === 'jump') {
      drawTargets(ctx, still);
      A.frog(ctx, w.frog, time, still, frogLand, focus);
      A.bop(ctx, 1030, 612, { color: save.color, hat: save.hat, time: time, still: still, scale: 0.75, look: look, happy: happy });
    } else if (mode === 'catch') {
      drawTargets(ctx, still);
      A.basket(ctx, w.basket, c => {
        A.bop(c, w.basket.x, BB.BASKET.y - 4, { color: save.color, hat: save.hat, time: time, still: still, scale: 0.7, look: look, happy: happy });
      });
    } else {
      // Bop pops bubbles by touching them (Bop in front), but floats behind balloons so
      // the one under the pointer stays in sight for the click.
      const bop = () => A.bop(ctx, w.bop.x, w.bop.y, { color: save.color, hat: save.hat, time: time, still: still, vx: w.bop.vx, vy: w.bop.vy, look: look, happy: happy });
      if (mode === 'tap') { bop(); drawTargets(ctx, still); } else { drawTargets(ctx, still); bop(); }
    }
    drawFxLayer(ctx);
    // The input mirror: the real device the child should use, lighting up with it.
    if (mode === 'jump') {
      const near = w.targets.some(t => !t.dead && Math.abs(t.x - w.frog.x) < BB.knob(w, 'window') * BB.NEAR);
      A.spaceBar(ctx, { down: Kit.keys.down('Space') || flash.space > 0.55, glow: Math.max(flash.spaceGlow, near ? 0.6 + 0.4 * Math.sin(time * 9) : w.tier === 1 ? 0.3 : 0), wiggle: flash.wiggle, time: time, still: still });
    } else if (mode === 'catch') {
      const dx = focus ? focus.x - w.basket.x : 0, far = Math.abs(dx) > w.basket.hw * 0.5;
      ['left', 'right'].forEach(side => {
        const want = far && (side === 'left' ? dx < 0 : dx > 0);
        A.arrowKey(ctx, side, { down: Kit.keys.anyDown(side === 'left' ? ['ArrowLeft', 'KeyA'] : ['ArrowRight', 'KeyD']) || flash[side] > 0.55 || holdDir === (side === 'left' ? -1 : 1),
          glow: Math.max(flash.keyGlow * 0.8, want ? 0.55 + 0.45 * Math.sin(time * 8) : 0), wiggle: 0, time: time, still: still });
      });
    } else {
      const hot = mode === 'tap' && w.targets.some(t => t.hot && !t.dead);
      A.mouseIcon(ctx, { move: flash.move, click: flash.click, hint: Math.max(flash.mouseHint, hot ? 1 : mode === 'tap' ? 0.25 : 0), time: time, still: still });
    }
    drawHud(ctx, w, still);
  }
  function drawHud(ctx, w, still) {
    const mode = w.mode;
    if (w.party) A.partyHud(ctx, { score: w.score, mult: w.mult, multBump: multBump, left: BB.left(w), total: w.plan.duration, best: save.best[cur.w], wave: w.wave, still: still });
    else A.pips(ctx, mode, w.goal, w.segHits, time, still, pipBump);
    if (w.plan.segments.length > 1) A.parts(ctx, w.plan.segments.map(s => s.mode), w.seg, time);
    // A big picture of what comes next while a level part starts.
    const intro = w.seg > 0 || w.party && w.t > 1 ? 1.1 : 0.7;
    if (w.segT < intro && !ending && (!w.party || w.seg > 0 || w.t < 1)) A.intro(ctx, mode, w.segT / intro, time, still);
  }
  function render() {
    if ((screen === 'pause' || screen === 'grip') && !dirty) return;
    dirty = false;
    const ctx = view.ctx;
    ctx.save();
    ctx.translate(shake.x, shake.y);
    if (screen === 'title' || screen === 'grip') drawTitle(ctx);
    else if (screen === 'map') drawMap(ctx);
    else if (screen === 'closet') drawCloset(ctx);
    else if (screen === 'result') drawResult(ctx);
    else if (world) drawPlay(ctx);
    ctx.restore();
  }

  canvas.addEventListener('contextrestored', () => { A.reset(); dirty = true; if (screen === 'closet') refreshCloset(); });
  if (document.fonts && document.fonts.load) {
    document.fonts.load('700 40px Fredoka', 'رائع 5').then(() => { dirty = true; }, () => { /* fallback fonts */ });
  }

  /* --------------------------------------------------- test and debug hook */
  const page = (x, y) => { const r = canvas.getBoundingClientRect(); return { x: r.left + x * view.scale, y: r.top + y * view.scale }; };
  window.__game = {
    get state() {
      const w = world;
      return {
        screen: screen, paused: screen === 'pause', world: cur.w, level: cur.l, party: !!(w && w.party), mode: w ? w.mode : '',
        tier: w ? w.tier : 0, hits: w ? w.hits : 0, goal: w ? w.goal : 0, segHits: w ? w.segHits : 0, escapes: w ? w.escapes : 0,
        missClicks: w ? w.missClicks : 0, score: w ? w.score : 0, combo: w ? w.combo : 0, mult: w ? w.mult : 1,
        time: w ? Math.round(w.t * 1000) / 1000 : 0, left: w ? BB.left(w) : 0, ending: !!ending, stars: result && !result.party ? result.stars : 0,
        targets: w ? w.targets.filter(t => !t.dead).map(t => ({ id: t.id, kind: t.kind, x: Math.round(t.x * 10) / 10, y: Math.round(t.y * 10) / 10, r: t.r, gold: t.gold,
          state: t.state, home: t.home, code: t.code, armed: t.armed, br: t.br, ring: t.ring, inBand: t.inBand })) : [],
        bop: w ? { x: Math.round(w.bop.x), y: Math.round(w.bop.y) } : { x: Math.round(menuBop.x), y: Math.round(menuBop.y) },
        frog: w ? { x: w.frog.x, y: Math.round(w.frog.y), air: w.frog.air, jumps: w.frog.jumps } : null,
        basket: w ? { x: Math.round(w.basket.x), hw: w.basket.hw } : null,
        // worlds 6-11
        pools: w ? w.pools.map(p => ({ x: Math.round(p.x), y: Math.round(p.y), r: p.r, color: p.color })) : [],
        held: w ? w.held || w.carry : 0, slips: w ? w.escapes : 0,
        sub: w ? { x: Math.round(w.sub.x), y: Math.round(w.sub.y) } : null, walls: w ? w.walls.length : 0,
        mapPage: mapPage, button: btnDown,
        travel: Math.round(ptr.travel), shake: shake.power, ghost: ghost.on, grip: gripCard, ripples: ripples
      };
    },
    get save() { return JSON.parse(JSON.stringify(save)); },
    // Where a logical point is on the page, for tests that move the real mouse there.
    point: page,
    targetPoint: i => { const t = world && world.targets.filter(o => !o.dead)[i || 0]; return t ? page(t.x, t.y) : null; },
    keyPoint: name => page(KEYS[name].x, KEYS[name].y),
    // The on-screen keyboard's key for a code, and a turtle's pool.
    letterPoint: code => { const k = BB.keyAt(code); return k ? page(k.x, k.y) : null; },
    poolPoint: color => { const p = world && world.pools.find(o => o.color === color); return p ? page(p.x, p.y) : null; }
  };

  buildMap();
  buildCloset();
  Kit.muteButton();
  Kit.lifecycle({ pause: () => pause(false), reset: () => { clicks = []; jumpPress = false; letGo(); } });
  toTitle();
  Kit.loop(update, render);
  Kit.ready();
})();
