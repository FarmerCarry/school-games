/* Bubble Bop (فقاعات بوب): screens, mouse and keyboard, the ghost-hand coach, saves,
 * sound and play statistics. rules.js simulates the worlds; art.js draws them.
 * This is the UI layer: it reads Kit.dda at every level start and reports Kit.stats
 * rounds and Kit.track hits, misses and cues. */
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
  // One difficulty controller per world (Kit keeps it per player and age band).
  const dda = BB.WORLDS.map((_, i) => Kit.dda('bubble-bop', { id: 'w' + (i + 1) }));

  /* --------------------------------------------------------------- state */
  let screen = 'title', world = null, cur = { w: 0, l: 0 }, time = 0, ending = null, result = null, resultT = 0, resultLock = 0;
  let closetFrom = 'title', gripCard = 0, gripThen = '', gripAt = 0, menuIdle = 0, menuNext = 4, busyT = 0, lastMissT = -9, unlockFx = null;
  const ptr = { x: W / 2, y: H / 2, known: false, travel: 0, movedAt: -9 };
  const menuBop = { x: 640, y: 364, vx: 0, vy: 0 };
  let clicks = [], jumpPress = false, holdDir = 0, keyDir = 0, anyKey = '';
  const flash = { space: 0, left: 0, right: 0, click: 0, move: 0, wiggle: 0, spaceGlow: 0, keyGlow: 0, mouseHint: 0 };
  const coach = { hit: 0, input: 0, next: 4, said: false };
  const taught = {};
  let happy = 0, frogLand = 0, pipBump = 0, multBump = 0;
  let rings = [], floats = [], deco = [], ripples = 0, trailT = 0;
  const PRAISE = ['رائع!', 'ممتاز!', 'مذهل!', 'خارق!'];
  const SAY = { touch: 'حرّك الفأرة إلى الفقاعة', tap: 'انقر على البالون', jump: 'اضغط مسافة', catch: 'حرّك السلة بالأسهم' };

  /* ------------------------------------------------------------ screens */
  const SCREENS = { title: 'scrTitle', grip: 'scrGrip', map: 'scrMap', pause: 'scrPause', result: 'scrResult', closet: 'scrCloset' };
  function setScreen(name) {
    screen = name;
    for (const k in SCREENS) $(SCREENS[k]).hidden = k !== name;
    $('hud').hidden = name !== 'play';
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
    Kit.stats.tutorial('start');
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
    else { J.select(); gripDone(false); }
  }
  // Skipping the cards (the X or Esc) is not finishing them: only the last card reports done.
  function gripDone(skipped) {
    if (screen !== 'grip') return;
    if (!skipped) Kit.stats.tutorial('done');
    if (!save.grip) { save.grip = true; persist(); }
    const then = gripThen; gripThen = '';
    if (then === 'play') afterGrip(); else toTitle();
  }

  /* ---------------------------------------------------------------- map */
  const isles = [], pebbles = [];
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
    pebbles.forEach((row, w) => {
      const open = BB.worldOpen(save, w);
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
  function toMap(fresh) {
    world = null;
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
    // Difficulty is read at every level start, before the round is reported.
    const d = dda[w], tier = d.tier;
    const plan = BB.plan(w, l, tier);
    world = BB.create(plan, (Math.random() * 2147483647) | 0);
    if (ptr.known) { world.bop.x = BB.clamp(ptr.x, 0, W); world.bop.y = BB.clamp(ptr.y, 0, H); }
    cur = { w: w, l: l };
    Kit.stats.round(plan.id);
    ending = null; result = null;
    clicks = []; jumpPress = false; holdDir = 0; keyDir = 0;
    fx.clear(); rings = []; floats = [];
    coach.hit = 0; coach.input = 0; coach.said = false; coach.next = taught[world.mode] ? 4 : 1.6;
    setScreen('play');
    Kit.keys.reset();
    J.whoosh(0.5);
  }
  function restart() { J.select(); startLevel(cur.w, cur.l); }
  function pause(own) {
    if (screen !== 'play') return;
    setScreen('pause');
    holdDir = 0; keyDir = 0;
    if (own) J.back();
  }
  function resume() {
    if (screen !== 'pause') return;
    J.select();
    setScreen('play');
    Kit.keys.reset();
  }
  function quitToMap() {
    Kit.stats.end('quit');
    J.back();
    toMap(-1);
  }

  // A result is saved the moment the level is finished, before the celebration.
  function finishLevel() {
    const r = BB.result(world), stars = BB.stars(r), before = BB.total(save), prev = save.stars[cur.w][cur.l];
    const nextWasOpen = cur.w < 4 && BB.worldOpen(save, cur.w + 1), partyWasOpen = BB.isOpen(save, cur.w, 'P');
    if (stars > prev) save.stars[cur.w][cur.l] = stars;
    persist();
    dda[cur.w].result(BB.outcome(r));
    Kit.stats.end('win', stars);
    result = { party: false, stars: stars, prev: prev, items: BB.unlocks(before, BB.total(save)),
      newWorld: cur.w < 4 && !nextWasOpen && BB.worldOpen(save, cur.w + 1) ? cur.w + 1 : -1, newParty: !partyWasOpen && BB.isOpen(save, cur.w, 'P') };
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
    Kit.stats.end('end', r.score);
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
    busyT += dt;
    if (resultT < 3 && busyT >= 1) { busyT = 0; Kit.stats.busy(); }
  }
  function next() {
    if (!result) return;
    J.select();
    if (result.party) startLevel(cur.w, 'P');
    else if (cur.l < 2) startLevel(cur.w, cur.l + 1);
    else toMap(result.newWorld);
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
  on($('gripSkip'), () => { J.back(); gripDone(true); });
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
  on($('resMap'), () => { if (resultLock <= 0) { J.back(); toMap(result && !result.party && cur.l === 2 ? result.newWorld : -1); } });
  on($('resGift'), () => openCloset('map'));
  on($('closetBack'), closeCloset);

  window.addEventListener('pointermove', e => {
    const p = view.toLogical(e.clientX, e.clientY);
    if (ptr.known) ptr.travel += Math.min(400, Math.hypot(p.x - ptr.x, p.y - ptr.y));
    ptr.x = p.x; ptr.y = p.y; ptr.known = true; ptr.movedAt = time;
    menuIdle = 0;
    if (screen === 'play' && world && (world.mode === 'touch' || world.mode === 'tap')) { coach.input = 0; flash.move = 1; }
  });
  const inRect = (p, k) => Math.abs(p.x - k.x) <= k.w / 2 + 14 && Math.abs(p.y - k.y) <= k.h / 2 + 16;
  canvas.addEventListener('pointerdown', e => {
    focusGame();
    if (e.button !== 0) return;
    const p = view.toLogical(e.clientX, e.clientY);
    ptr.x = p.x; ptr.y = p.y; ptr.known = true;
    menuIdle = 0;
    if (screen === 'play' && world && !ending) playClick(p);
    else if (screen === 'title' || screen === 'map' || screen === 'closet') boing(p);
  });
  window.addEventListener('pointerup', () => { holdDir = 0; });
  window.addEventListener('keydown', e => {
    if (!Kit.isGameKeyEvent(e) || e.repeat) return;
    menuIdle = 0;
    if (e.code !== 'KeyP' && e.code !== 'Escape' && e.code !== 'KeyM' && e.code !== 'Tab') anyKey = e.code;
  });
  // Every click in play shows something; nothing a click does ever costs anything.
  function playClick(p) {
    const mode = world.mode;
    flash.click = 1;
    if (mode === 'tap') { clicks.push({ x: p.x, y: p.y }); coach.input = 0; }
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
    else if (screen === 'grip') { if (K.pressed('Escape')) { J.back(); gripDone(true); } else if (anyKey) gripNext(); }
    else if (screen === 'map') { if (go) startNext(); else if (K.pressed('Escape')) { J.back(); toTitle(); } }
    else if (screen === 'closet') { if (go || K.pressed('Escape')) closeCloset(); }
    else if (screen === 'play') { if (K.anyPressed(['KeyP', 'Escape'])) pause(true); else if (!ending) playKeys(K); }
    else if (screen === 'pause') { if (K.anyPressed(['KeyP', 'Escape', 'Enter', 'NumpadEnter', 'Space'])) resume(); else if (K.pressed('KeyR')) restart(); }
    else if (screen === 'result' && resultLock <= 0) {
      if (go) next(); else if (K.pressed('KeyR')) (result.party ? next() : again());
      else if (K.pressed('Escape')) { J.back(); toMap(-1); }
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
    } else if (anyKey) flash.mouseHint = 1;
  }

  /* ----------------------------------------------------- the ghost hand */
  // A wordless coach: a hand that glides to the next target and presses, on the game
  // clock (it freezes with a pause). Steps: { at, down }, { to, s }, { press, track, onPress },
  // { hold, onHold }, { wait }. Targets may be functions, so the hand follows moving ones.
  // down: the hand reaches down from above, for the keys along the bottom edge.
  const ghost = { on: false, steps: null, i: 0, t: 0, x: 0, y: 0, press: 0, alpha: 0, down: false };
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
  function stopDemo() { ghost.on = false; ghost.steps = null; ghostEl.hidden = true; }
  function ghostStep(dt) {
    if (!ghost.on) return;
    const s = ghost.steps[ghost.i];
    if (!s) { stopDemo(); return; }
    ghost.t += dt;
    ghost.alpha = Math.min(1, ghost.alpha + dt * 5);
    ghost.press = 0;
    let done = false;
    if (s.at) { const p = pt(s.at); if (!p) { stopDemo(); return; } ghost.x = p.x; ghost.y = p.y; done = true; }
    else if (s.to) {
      const p = pt(s.to);
      if (!p) { stopDemo(); return; }
      if (!s.from) s.from = { x: ghost.x, y: ghost.y };
      const k = calm() ? 1 : Math.min(1, ghost.t / s.s), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      ghost.x = s.from.x + (p.x - s.from.x) * e; ghost.y = s.from.y + (p.y - s.from.y) * e;
      if (s.onMove) s.onMove();
      done = k >= 1;
    } else if (s.press) {
      const k = ghost.t / 0.36, ph = k % 1;
      if (s.track) { const p = pt(s.track); if (p) { ghost.x = p.x; ghost.y = p.y; } }
      ghost.press = calm() ? 0 : Math.sin(Math.min(1, ph / 0.8) * Math.PI);
      if (s.onPress && ph > 0.35 && s.count !== Math.floor(k)) { s.count = Math.floor(k); s.onPress(); }
      done = ghost.t >= s.press * 0.36;
    } else if (s.hold) { ghost.press = calm() ? 0 : 1; if (s.onHold) s.onHold(); done = ghost.t >= s.hold; }
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
    else if (screen === 'map') el = document.querySelector('.pebble.next');
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
  const POP_COLORS = { bubble: A.TINTS, balloon: A.BALLOONS, fly: ['#fff27a', '#ffd23f'], fruit: A.FRUIT };
  function onPop(e) {
    Kit.track.hit();
    if (e.kind === 'bubble') Kit.track.react(Math.round(e.age * 1000));
    const col = e.gold ? '#ffc93c' : (POP_COLORS[e.kind][e.kind === 'fruit' ? e.type : e.color] || '#ffffff');
    if (e.kind === 'bubble') { J.pop(Math.min(1, e.r / 70)); shake.add(2); }
    else if (e.kind === 'balloon') { J.impact(0.3); J.pop(0.85); shake.add(4); }
    else if (e.kind === 'fly') { J.coin(Math.min(5, e.combo)); shake.add(2); }
    else { J.impact(0.22); shake.add(3); }
    if (e.combo >= 2) J.streak(e.combo);
    if (e.gold) J.coin(5);
    fx.burst(e.x, e.y, { count: e.kind === 'balloon' ? 18 : 12, colors: [col, '#ffffff', col], speed: e.kind === 'balloon' ? 340 : 260, life: 0.55, size: 8, gravity: e.kind === 'bubble' ? 60 : 380 });
    rings.push({ x: e.x, y: e.y, r0: e.r * 0.8, r1: e.r * 1.6, t: 0, life: 0.3, color: '255,255,255', lw: 7 });
    if (world.party) float(e.x, e.y - e.r - 10, '+' + e.points, e.gold ? '#ffd23f' : '#ffffff', e.points > 1 ? 40 : 32);
    if (e.combo >= 5 && e.combo % 5 === 0) float(e.x, e.y - e.r - 54, PRAISE[Math.min(3, e.combo / 5 - 1)], '#ffd23f', 44);
    if (world.party && e.mult > 1 && e.combo % 5 === 0) multBump = 1;
    happy = Math.max(happy, 0.6); pipBump = 1;
    coach.hit = 0; coach.next = 4; stopDemo();
  }
  function handleEvents() {
    for (const e of world.ev) {
      // A reaction time counts from the moment there is something to press: a balloon or a
      // fruit appears, or a firefly comes over the frog. Touching a bubble needs no press.
      if (e.t === 'spawn') { if (world.mode === 'tap' || world.mode === 'catch') Kit.track.cue(); }
      else if (e.t === 'near') Kit.track.cue();
      else if (e.t === 'pop') onPop(e);
      else if (e.t === 'escape') {
        Kit.track.miss();
        if (e.kind === 'fruit') { J.land(0.2); fx.burst(e.x, BB.BASKET.ground - 6, { count: 8, colors: ['#ffffff', '#c8f0a0'], speed: 160, life: 0.4, size: 6, gravity: 500 }); }
      } else if (e.t === 'missClick') {
        if (time - lastMissT > 0.3) Kit.track.miss();
        lastMissT = time;
        ripple(e.x, e.y, true); J.tap();
      } else if (e.t === 'jump') J.jump(0.7);
      else if (e.t === 'land') { J.land(0.3); frogLand = 1; }
      else if (e.t === 'vanish') rings.push({ x: e.x, y: e.y, r0: e.r, r1: e.r * 1.3, t: 0, life: 0.35, color: '255,255,255', lw: 5 });
      else if (e.t === 'segment') { J.whoosh(0.7); coach.hit = 0; coach.next = taught[world.mode] ? 4 : 1.6; coach.said = false; stopDemo(); keyDir = 0; holdDir = 0; }
      else if (e.t === 'wave') { J.whoosh(0.9); J.chime(1); multBump = 1; burstAt(W / 2, 60, '#ffd23f'); }
      else if (e.t === 'done') finishLevel();
      else if (e.t === 'timeup') finishParty();
    }
    world.ev.length = 0;
  }
  // The target the pulsing ring (and the coach) points at.
  function focusTarget() {
    if (!world) return null;
    let best = null, d = Infinity;
    for (const t of world.targets) {
      if (t.dead) continue;
      const v = world.mode === 'jump' ? Math.abs(t.x - world.frog.x) : world.mode === 'catch' ? -t.y : Math.hypot(t.x - world.bop.x, t.y - world.bop.y);
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
  }
  function playStep(dt) {
    if (!ending) {
      if (world.party) { const left = Math.ceil(BB.left(world) - dt), was = Math.ceil(BB.left(world)); if (left !== was && left >= 1 && left <= 3) J.countdown(left); }
      const input = { px: ptr.known ? ptr.x : null, py: ptr.known ? ptr.y : null, clicks: clicks, jump: jumpPress, dir: keyDir || holdDir };
      clicks = []; jumpPress = false;
      BB.step(world, dt, input);
      handleEvents();
      coachStep(dt);
      // A quick Bop leaves a short sparkle trail (none under reduced motion).
      const b = world.bop, sp = Math.hypot(b.vx, b.vy);
      trailT -= dt;
      if ((world.mode === 'touch' || world.mode === 'tap') && sp > 500 && trailT <= 0) {
        trailT = 0.05;
        fx.burst(b.x - b.vx * 0.03, b.y - b.vy * 0.03, { count: 2, colors: ['#ffffff', A.colorOf(save.color)], speed: 60, life: 0.35, size: 6, gravity: -40 });
      }
    } else {
      ending.t -= dt;
      // The celebration is a passive moment the child watches.
      busyT += dt;
      if (busyT >= 1) { busyT = 0; Kit.stats.busy(); }
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
    ctx.drawImage(A.bg('map', pixelScale()), 0, 0, W, H);
    A.ISLANDS.forEach((p, w) => {
      const fresh = unlockFx && unlockFx.w === w;
      if (!BB.worldOpen(save, w)) A.lock(ctx, p.x, p.y - 30);
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
  function drawPlay(ctx) {
    const w = world, still = calm(), mode = w.mode, focus = ending ? null : focusTarget();
    ctx.drawImage(A.bg(BB.WORLDS[cur.w].scene, pixelScale()), 0, 0, W, H);
    if (mode === 'catch') for (const t of w.targets) if (!t.dead) A.fruitShadow(ctx, t);
    if (focus) A.ring(ctx, focus.x, focus.y, focus.kind === 'balloon' ? focus.r * 1.15 : focus.kind === 'fly' ? focus.r + 8 : focus.r, time, still);
    const look = focus ? { x: focus.x, y: focus.y } : bopLook();
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
        targets: w ? w.targets.filter(t => !t.dead).map(t => ({ id: t.id, kind: t.kind, x: Math.round(t.x * 10) / 10, y: Math.round(t.y * 10) / 10, r: t.r, gold: t.gold })) : [],
        bop: w ? { x: Math.round(w.bop.x), y: Math.round(w.bop.y) } : { x: Math.round(menuBop.x), y: Math.round(menuBop.y) },
        frog: w ? { x: w.frog.x, y: Math.round(w.frog.y), air: w.frog.air, jumps: w.frog.jumps } : null,
        basket: w ? { x: Math.round(w.basket.x), hw: w.basket.hw } : null,
        travel: Math.round(ptr.travel), shake: shake.power, ghost: ghost.on, grip: gripCard, ripples: ripples
      };
    },
    get save() { return JSON.parse(JSON.stringify(save)); },
    // Where a logical point is on the page, for tests that move the real mouse there.
    point: page,
    targetPoint: i => { const t = world && world.targets.filter(o => !o.dead)[i || 0]; return t ? page(t.x, t.y) : null; },
    keyPoint: name => page(KEYS[name].x, KEYS[name].y)
  };

  buildMap();
  buildCloset();
  Kit.muteButton();
  Kit.lifecycle({ pause: () => pause(false), reset: () => { holdDir = 0; keyDir = 0; clicks = []; jumpPress = false; } });
  toTitle();
  Kit.loop(update, render);
  Kit.ready();
})();
