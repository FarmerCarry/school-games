/* Lucky Lake (بحيرة الحظ): screens, mouse and keyboard, the wordless coach, saves,
 * sound and play statistics. engine.js simulates the lake; art.js draws it.
 * This is the UI layer: it reads Kit.dda when a trip starts (and at every cast), and
 * reports Kit.stats rounds and Kit.track cues, hits and misses.
 * Rounds: a solo trip to a place is one round ('p1'..'p5'). It starts when the child
 * starts fishing there and ends when the child leaves the place (the basket button or
 * the pause menu's places button, or Restart, which starts a new trip):
 * Kit.stats.end('end', catches landed on the trip). A derby is one 'duo' round that
 * ends with Kit.stats.end('end', the heavier total in tenths of a kg). */
(function () {
  'use strict';
  const LL = window.LL, A = LL.art, J = Kit.juice, W = LL.W, H = LL.H;
  const $ = id => document.getElementById(id);
  const canvas = $('game'), ui = $('ui'), ghostEl = $('ghost');
  const calm = () => Kit.motion.reduced();
  let dirty = true;
  const view = Kit.fit(canvas, W, H, { maxDpr: 1.5, onResize: v => {
    ui.style.left = canvas.style.left; ui.style.top = canvas.style.top; ui.style.transform = 'scale(' + v.scale + ')'; dirty = true;
  } });
  const fx = Kit.particles(), shake = Kit.shake();
  const pixelScale = () => Math.min(2, Math.max(0.5, Math.round(view.scale * view.dpr * 4) / 4));
  const SPACE = ['Space', 'Enter', 'NumpadEnter'];
  const PRAISE = ['رائع!', 'ممتاز!', 'مذهل!'];
  const COLORS = [{ hat: '#ffd23f', band: '#ff5d6c', shirt: '#ff7a3d', pants: '#3f6fd8' }, { hat: '#ff7ae0', band: '#ffffff', shirt: '#9b5cff', pants: '#2a3a7a' }];

  /* ---------------------------------------------------------------- save */
  const store = Kit.store('lucky-lake');
  const saveStatus = Kit.saveStatus({ retry: persist });
  let save = LL.loadSave(store.get('save', null));
  function persist() {
    if (store.set('save', save) === false) { saveStatus.failed(); return false; }
    saveStatus.saved();
    return true;
  }
  // One difficulty controller for solo fishing (Kit keeps it per player and age band).
  const dda = Kit.dda('lucky-lake', { id: 'solo' });

  /* --------------------------------------------------------------- state */
  let screen = 'title', mode = 'solo', world = null, place = 0, time = 0, busyT = 0, menuIdle = 0, menuNext = 4;
  const menuWorld = LL.create({ place: 0, seed: 11 });
  let trip = { open: false, catches: [], coins: 0, before: 0, newPlace: -1, earned: [] };
  let card = null, result = null, resultT = 0, resultLock = 0, duo = null, duoEnd = null, banner = null;
  const ptr = { x: W / 2, y: H / 2, known: false, down: false, moved: false };
  let pressQ = false, keyLock = false;
  const coach = { idle: 0, next: 1.5, bites: 0, reels: 0, target: 0 };
  let rings = [], floats = [], flyers = [], flights = [null, null], castAnim = [0, 0], mood = [{ m: '', t: 0 }, { m: '', t: 0 }];
  let goalBump = [0, 0, 0], coinBump = 0, scoreBump = [0, 0], coinShown = save.coins, pendingGoals = [], timers = [];
  // Celebrations wait on the game clock, so a pause freezes them too; leaving play drops them.
  function later(t, fn) { timers.push({ t: t, fn: fn }); }

  /* ------------------------------------------------------------ screens */
  const SCREENS = { title: 'scrTitle', map: 'scrMap', pause: 'scrPause', result: 'scrResult', book: 'scrBook', rods: 'scrRods', duoEnd: 'scrDuoEnd' };
  function setScreen(name) {
    screen = name;
    for (const k in SCREENS) $(SCREENS[k]).hidden = k !== name;
    $('hud').hidden = name !== 'play';
    $('btnBasket').hidden = mode !== 'solo';
    stopDemo();
    menuIdle = 0; menuNext = 4;
    paintOverlays();
    dirty = true;
    if (name === 'play') focusGame();
  }
  // The catch card and the derby's controls card float over play.
  function paintOverlays() {
    $('scrCatch').hidden = !(screen === 'play' && card && card.open);
    $('scrDuo').hidden = !(screen === 'play' && mode === 'duo' && duo && duo.phase === 'intro');
  }
  function focusGame() { try { canvas.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  function say(text) { $('live').textContent = text; }
  function chip(id, n) { $(id).querySelector('b').textContent = String(n); }

  function toTitle() {
    world = null; mode = 'solo';
    chip('titleFish', LL.speciesCount(save) + '/' + LL.SPECIES.length);
    setScreen('title');
  }
  function play() {
    J.select();
    // A child who has never fished goes straight to the village pond.
    if (!save.coach && !LL.totalStars(save)) startSolo(0); else toMap();
  }

  /* ---------------------------------------------------------------- map */
  const cards = [];
  function buildMap() {
    const box = $('places');
    LL.PLACES.forEach((P, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'll-btn place';
      // Right to left like Arabic reading: the village pond is on the right.
      b.style.left = (1000 - i * 236) + 'px';
      b.innerHTML = '<i class="num">' + (i + 1) + '</i><canvas width="392" height="300"></canvas><b>' + P.name + '</b><span class="st">' + '<svg><use href="#i-star"/></svg>'.repeat(3) +
        '</span><span class="lock"><svg aria-hidden="true"><use href="#i-lock"/></svg></span><span class="need"><svg aria-hidden="true"><use href="#i-star"/></svg>2</span>';
      on(b, () => pickPlace(i, b));
      box.appendChild(b); cards.push(b);
    });
  }
  let thumbsDrawn = false;
  function refreshMap() {
    if (!thumbsDrawn) { cards.forEach((b, i) => A.placeThumb(b.querySelector('canvas'), i)); thumbsDrawn = true; }
    const next = LL.nextPlace(save);
    cards.forEach((b, i) => {
      const open = LL.isOpen(save, i), stars = LL.stars(save, i);
      b.classList.toggle('locked', !open);
      b.classList.toggle('next', open && i === next);
      b.querySelectorAll('.st svg').forEach((s, k) => s.classList.toggle('on', k < stars));
      b.setAttribute('aria-label', LL.PLACES[i].name + (open ? '، ' + stars + ' من 3 نجوم' : ' (مقفل)'));
    });
    chip('mapCoins', save.coins);
  }
  function toMap() {
    world = null; mode = 'solo';
    refreshMap();
    setScreen('map');
    J.whoosh(0.4);
  }
  function wiggle(el) { el.classList.remove('wiggle'); void el.offsetWidth; el.classList.add('wiggle'); setTimeout(() => el.classList.remove('wiggle'), 500); }
  function pickPlace(i, el) {
    if (!LL.isOpen(save, i)) { J.error(); wiggle(el); return; }
    J.select(); startSolo(i);
  }

  /* --------------------------------------------------------------- solo */
  function startSolo(i) {
    // Difficulty is read at every trip start, before the round is reported.
    const tier = dda.tier, G = LL.PLACES[i].goals;
    place = i; mode = 'solo';
    world = LL.create({ place: i, tier: tier, rods: save.rods, seed: (Math.random() * 2147483647) | 0, boost: save.places[i].g[1] ? '' : G.sp });
    Kit.stats.round(LL.roundId(i));
    if (!save.coach) Kit.stats.tutorial('start');
    trip = { open: true, catches: [], coins: 0, before: LL.stars(save, i), newPlace: -1, earned: [] };
    card = null; result = null; banner = null; duo = null;
    resetPlay();
    coach.idle = 0; coach.next = save.coach ? 5 : 1.4;
    $('basketNum').textContent = '0';
    setScreen('play');
    J.whoosh(0.5);
  }
  function resetPlay() {
    fx.clear(); rings = []; floats = []; flyers = []; flights = [null, null]; castAnim = [0, 0];
    mood = [{ m: '', t: 0 }, { m: '', t: 0 }]; goalBump = [0, 0, 0]; scoreBump = [0, 0]; pendingGoals = [];
    pressQ = false; ptr.down = false; coinShown = save.coins; timers = [];
    Kit.keys.reset();
  }
  // Leaving a place ends its trip (the round) with the number of catches landed.
  function endTrip() {
    if (!trip.open) return;
    trip.open = false;
    if (card) closeCard(true);
    Kit.stats.end('end', trip.catches.length);
  }
  function finishTrip() {
    if (mode !== 'solo' || !world) return;
    J.select();
    endTrip();
    showResult();
  }
  function restart() {
    J.select();
    if (mode === 'duo') { startDuo(); return; }
    endTrip();
    startSolo(place);
  }
  function pause(own) {
    if (screen !== 'play') return;
    ptr.down = false;
    $('btnMenu').querySelector('use').setAttribute('href', mode === 'duo' ? '#i-home' : '#i-map');
    $('btnMenu').setAttribute('aria-label', mode === 'duo' ? 'البداية' : 'الأماكن');
    setScreen('pause');
    if (own) J.back();
  }
  function resume() {
    if (screen !== 'pause') return;
    J.select();
    setScreen('play');
    Kit.keys.reset();
  }
  function leaveFromPause() {
    J.back();
    if (mode === 'duo') { duo = null; toTitle(); return; }
    endTrip();
    showResult();
  }

  /* ---------------------------------------------------------- catch card */
  function stars(n) { return '<svg><use href="#i-star"/></svg>'.repeat(n); }
  function openCard(c, res) {
    card = { c: c, res: res, t: 0, open: true };
    const junk = c.junk;
    $('catchName').textContent = junk ? LL.JUNK[c.id].name : LL.SPECIES[c.sp].name;
    $('catchWeight').textContent = LL.weightText(c.w10) + ' كغ';
    $('catchStars').innerHTML = junk ? '' : stars(LL.SPECIES[c.sp].rarity);
    $('catchStars').hidden = junk;
    $('catchCoins').textContent = '+' + c.coins;
    $('catchNew').hidden = !res.newSpecies;
    $('catchBest').hidden = !res.best;
    $('catchCard').style.background = junk ? '#fff3dc' : LL.SPECIES[c.sp].legend ? '#fff4b8' : LL.SPECIES[c.sp].rarity === 3 ? '#f4ecff' : '';
    drawCardArt();
    say((junk ? LL.JUNK[c.id].name : LL.SPECIES[c.sp].name) + '، ' + LL.weightText(c.w10) + ' كيلوغرام');
    paintOverlays();
  }
  function drawCardArt() { if (card) A.catchArt($('catchArt'), card.c.junk ? 'junk' : 'fish', card.c.junk ? card.c.id : card.c.sp, time, calm()); }
  // Closing the card pays out: coins fly to the counter, goal stars pop.
  function closeCard(quiet) {
    if (!card) return;
    const c = card.c;
    card = null;
    paintOverlays();
    stopDemo();
    if (quiet) { coinShown = save.coins; return; }
    J.tap();
    const n = Math.min(10, Math.max(1, Math.ceil(c.coins / 4)));
    for (let i = 0; i < n; i++) flyers.push({ x: 640 + (Math.random() - 0.5) * 120, y: 300 + (Math.random() - 0.5) * 60, t: -i * 0.06, v: c.coins / n });
    pendingGoals.forEach((k, i) => later(0.25 + i * 0.38, () => { goalBump[k] = 1; J.star(Math.min(3, i + 1)); goalBurst(k); }));
    if (pendingGoals.length && trip.newPlace >= 0 && !banner) {
      const np = trip.newPlace;
      later(0.3 + pendingGoals.length * 0.38, () => { banner = { t: 0, place: np }; J.levelUp(); confetti(); });
    }
    pendingGoals = [];
    coach.idle = 0;
  }
  function goalBurst(k) {
    const x = 640 - 300 + (2 - k) * 210 + 90 - 78;
    fx.burst(x, 22, { count: 26, colors: ['#ffd23f', '#ffffff', '#ff9a1f'], speed: 320, life: 0.8, size: 8, gravity: 300 });
  }
  function confetti() {
    if (calm()) return;
    for (let i = 0; i < 5; i++) fx.burst(160 + i * 240, 140, { count: 22, colors: ['#ff7eb6', '#ffd23f', '#4fd1ff', '#5be38f', '#ffffff'], speed: 380, life: 1.1, size: 9, gravity: 420 });
  }

  /* ------------------------------------------------------------- result */
  function showResult() {
    const st = LL.stars(save, place);
    result = { stars: st, before: trip.before, catches: trip.catches.slice(), coins: trip.coins, newPlace: trip.newPlace };
    resultT = 0; resultLock = 0.6;
    $('resPlace').textContent = LL.PLACES[place].name;
    $('resStars').querySelectorAll('svg').forEach((s, i) => { s.classList.toggle('on', i < result.before); s.classList.remove('pop'); });
    $('resCoins').textContent = '+' + result.coins;
    $('resCount').textContent = String(result.catches.length);
    $('resNewPlace').hidden = true;
    const fresh = result.newPlace >= 0;
    $('resNext').setAttribute('aria-label', fresh ? 'المكان الجديد' : 'صِد مرة أخرى');
    $('resAgain').hidden = !fresh;
    drawResultCatches();
    say(LL.PLACES[place].name + '، ' + result.catches.length + ' صيد');
    setScreen('result');
  }
  function drawResultCatches() {
    const c = $('resCatches'), g = c.getContext('2d'), list = result.catches, n = Math.min(list.length, 8);
    g.clearRect(0, 0, c.width, c.height);
    if (!list.length) {
      A.species(g, LL.SPECIES[LL.PLACES[place].species[0]], 300, 54, -1, 1.1, { still: true, sil: true });
      return;
    }
    // Right to left, centred: the first catch on the right.
    const step = 74, more = list.length > n ? 1 : 0, x0 = 300 + (n + more - 1) * step / 2;
    for (let i = 0; i < n; i++) {
      const it = list[i], x = x0 - i * step;
      if (it.junk) A.junkIcon(g, it.id, x, 48, 0.56);
      else { const s = LL.SPECIES[it.sp]; A.species(g, s, x, 44, -1, Math.min(1, 70 / (s.len * 1.25)), { still: true }); }
      A.text(g, LL.weightText(it.w10), x, 98, 19, A.INK, { stroke: false });
    }
    if (more) A.text(g, '+' + (list.length - n), x0 - n * step, 52, 30, A.INK, { stroke: false });
  }
  function resultStep(dt) {
    const r = result, before = resultT;
    resultT += dt;
    const at = t => before < t && resultT >= t;
    for (let i = r.before; i < r.stars; i++) {
      if (at(0.3 + (i - r.before) * 0.38)) {
        const s = $('resStars').children[i]; s.classList.add('on', 'pop'); J.star(i + 1);
        fx.burst(520 + i * 120, 170, { count: 18, colors: ['#ffd23f', '#ffffff'], speed: 300, life: 0.7, size: 8, gravity: 300 });
      }
    }
    if (r.newPlace >= 0 && at(0.4 + Math.max(0, r.stars - r.before) * 0.38)) { $('resNewPlace').hidden = false; J.levelUp(); confetti(); }
    busyT += dt;
    if (resultT < 3 && busyT >= 1) { busyT = 0; Kit.stats.busy(); }
  }
  function resultNext() {
    if (!result) return;
    J.select();
    startSolo(result.newPlace >= 0 ? result.newPlace : place);
  }
  function resultAgain() { if (result) { J.select(); startSolo(place); } }

  /* --------------------------------------------------------------- book */
  function openBook() {
    J.select();
    chip('bookCount', LL.speciesCount(save) + '/' + LL.SPECIES.length);
    setScreen('book');
  }

  /* --------------------------------------------------------------- rods */
  const RODS = { zone: 'منطقة أكبر', reel: 'بكرة قوية', lure: 'طُعم لامع', bait: 'دودة شهية' };
  const tiles = {};
  function buildRods() {
    const box = $('tiles');
    LL.RODS.forEach(kind => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'll-btn tile';
      b.innerHTML = '<canvas width="300" height="300"></canvas><b>' + RODS[kind] + '</b><span class="pips"><i></i><i></i><i></i></span><span class="price"><i class="coin"></i><em></em></span>';
      on(b, () => buyRod(kind, b));
      box.appendChild(b); tiles[kind] = b;
    });
  }
  function refreshRods() {
    LL.RODS.forEach(kind => {
      const b = tiles[kind], lv = save.rods[kind], cost = LL.rodCost(save, kind);
      A.rodIcon(b.querySelector('canvas'), kind);
      b.querySelectorAll('.pips i').forEach((p, i) => p.classList.toggle('on', i < lv));
      b.classList.toggle('max', !cost);
      b.classList.toggle('poor', !!cost && save.coins < cost);
      b.querySelector('em').textContent = cost ? String(cost) : '✓';
      b.setAttribute('aria-label', RODS[kind] + '، ' + lv + ' من 3' + (cost ? '، السعر ' + cost : ''));
    });
    chip('rodsCoins', save.coins);
  }
  function openRods() { J.select(); refreshRods(); setScreen('rods'); }
  function buyRod(kind, el) {
    if (!LL.rodCost(save, kind)) { J.tap(); wiggle(el); return; }
    if (!LL.buy(save, kind)) { J.error(); wiggle(el); return; }
    persist();
    J.coin(3); J.levelUp();
    const r = el.getBoundingClientRect(), p = view.toLogical(r.left + r.width / 2, r.top + r.height / 3);
    fx.burst(p.x, p.y, { count: 30, colors: ['#ffd23f', '#ffffff', '#5be38f'], speed: 340, life: 0.8, size: 8, gravity: 300 });
    refreshRods();
  }

  /* ---------------------------------------------------------------- duo */
  function startDuo() {
    J.select();
    mode = 'duo';
    world = LL.create({ place: 0, duo: true, seed: (Math.random() * 2147483647) | 0 });
    duo = { phase: 'intro', t: 0, ready: [false, false], count: 0, over: false };
    duoEnd = null; card = null; trip.open = false;
    resetPlay();
    $('duoP1').classList.remove('ready'); $('duoP2').classList.remove('ready');
    setScreen('play');
  }
  function duoReady(i) {
    if (!duo || duo.phase !== 'intro' || duo.ready[i]) return;
    duo.ready[i] = true; J.select();
    $(i ? 'duoP2' : 'duoP1').classList.add('ready');
    if (duo.ready[0] && duo.ready[1]) duoCount();
  }
  function duoCount() {
    if (!duo || duo.phase !== 'intro') return;
    duo.phase = 'count'; duo.t = 0; duo.count = 3;
    J.countdown(3);
    paintOverlays();
    focusGame();
  }
  function duoStep(dt) {
    duo.t += dt;
    if (duo.phase === 'intro') { if (duo.t > 12) duoCount(); }
    else if (duo.phase === 'count') {
      const n = 3 - Math.floor(duo.t);
      if (n !== duo.count) { duo.count = n; J.countdown(Math.max(0, n)); }
      if (duo.t >= 3) { duo.phase = 'go'; duo.t = 0; Kit.stats.round('duo'); }
    }
  }
  function finishDuo() {
    if (!duo || duo.over) return;
    duo.over = true;
    const win = LL.duoWinner(world);
    Kit.stats.end('end', LL.duoScore(world));
    duoEnd = { win: win, t: 0 };
    $('duoWinner').textContent = win ? 'فاز اللاعب ' + win + '!' : 'تعادل!';
    $('duoWinner').style.color = win === 1 ? '#e07800' : win === 2 ? '#b23fe0' : A.INK;
    drawDuoCatches();
    J.levelUp(); confetti();
    say(win ? 'فاز اللاعب ' + win : 'تعادل');
    setScreen('duoEnd');
  }
  function drawDuoCatches() {
    const c = $('duoCatches'), g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    world.players.forEach((p, i) => {
      // Player 1 on the left and player 2 on the right, as they sat at the lake.
      const x0 = i ? 340 : 20, col = i ? A.P2 : A.P1, win = duoEnd.win === i + 1;
      A.rr(g, x0, 6, 280, 196, 26); g.fillStyle = win ? '#fff4b8' : '#f4f6ff'; g.fill(); g.lineWidth = 5; g.strokeStyle = col; g.stroke();
      A.badge(g, x0 + 32, 38, String(i + 1), col, 22);
      if (win) { A.starPath(g, x0 + 248, 38, 22, 10); g.fillStyle = '#ffd23f'; g.fill(); g.lineWidth = 4; g.strokeStyle = A.INK; g.stroke(); }
      A.text(g, LL.weightText(p.total) + ' كغ', x0 + 140, 40, 34, A.INK, { stroke: false });
      const fish = p.catches.filter(k => !k.junk).sort((a, b) => b.w10 - a.w10).slice(0, 8);
      fish.forEach((k, j) => {
        const s = LL.SPECIES[k.sp], x = x0 + 46 + (j % 4) * 62, y = 100 + Math.floor(j / 4) * 62;
        A.species(g, s, x, y, 1, Math.min(0.8, 54 / (s.len * 1.3)), { still: true });
      });
      if (!fish.length) A.text(g, '0', x0 + 140, 120, 40, '#9aa3c7', { stroke: false });
    });
  }

  /* --------------------------------------------------------------- input */
  // A mouse click hands the keyboard back to the game; keyboard activation keeps focus.
  // The second click of a double click (detail 2) is dropped: the first one already acted.
  function on(el, fn) {
    el.addEventListener('click', e => { e.stopPropagation(); if (e.detail > 1) return; Kit.audio.unlock(); if (e.detail > 0) { el.blur(); focusGame(); } fn(e); });
  }
  on($('btnPlay'), play);
  on($('btnBook'), openBook);
  on($('btnDuo'), startDuo);
  on($('btnRods'), openRods);
  on($('mapHome'), () => { J.back(); toTitle(); });
  on($('bookBack'), () => { J.back(); toTitle(); });
  on($('rodsBack'), () => { J.back(); toTitle(); });
  on($('btnPause'), () => pause(true));
  on($('btnBasket'), finishTrip);
  on($('btnResume'), resume);
  on($('btnRestart'), restart);
  on($('btnMenu'), leaveFromPause);
  on($('catchOk'), () => { if (card && card.t >= 0.4) closeCard(false); });
  // A click anywhere while the card shows closes it (after a moment, so a double click does not).
  $('scrCatch').addEventListener('click', e => { e.stopPropagation(); if (e.detail < 2 && card && card.t >= 0.5) closeCard(false); });
  on($('resNext'), () => { if (resultLock <= 0) resultNext(); });
  on($('resAgain'), () => { if (resultLock <= 0) resultAgain(); });
  on($('resMap'), () => { if (resultLock <= 0) { J.back(); toMap(); } });
  on($('duoGo'), duoCount);
  on($('duoAgain'), () => { if (duoEnd && duoEnd.t > 0.6) startDuo(); });
  on($('duoHome'), () => { if (duoEnd && duoEnd.t > 0.6) { J.back(); toTitle(); } });

  window.addEventListener('pointermove', e => {
    const p = view.toLogical(e.clientX, e.clientY);
    ptr.x = p.x; ptr.y = p.y; ptr.known = true; ptr.moved = true;
    menuIdle = 0;
    if (screen === 'play') coach.idle = 0;
  });
  canvas.addEventListener('pointerdown', e => {
    focusGame();
    if (e.button !== 0) return;
    const p = view.toLogical(e.clientX, e.clientY);
    ptr.x = p.x; ptr.y = p.y; ptr.known = true; ptr.moved = true;
    menuIdle = 0;
    if (screen === 'play' && mode === 'solo' && world && !card) { pressQ = true; ptr.down = true; coach.idle = 0; }
  });
  window.addEventListener('pointerup', () => { ptr.down = false; });
  function keyDir(K, l, r, u, d) {
    return { mx: (K.anyDown(r) ? 1 : 0) - (K.anyDown(l) ? 1 : 0), my: (K.anyDown(d) ? 1 : 0) - (K.anyDown(u) ? 1 : 0) };
  }
  function handleKeys() {
    const K = Kit.keys, go = K.anyPressed(SPACE);
    keyLock = false;
    if (screen === 'title') { if (go) play(); }
    else if (screen === 'map') { if (go) { J.select(); startSolo(LL.nextPlace(save)); } else if (K.pressed('Escape')) { J.back(); toTitle(); } }
    else if (screen === 'book' || screen === 'rods') { if (go || K.pressed('Escape')) { J.back(); toTitle(); } }
    else if (screen === 'play') {
      if (K.anyPressed(['KeyP', 'Escape'])) { pause(true); keyLock = true; }
      else if (card) { if (go && card.t >= 0.4) closeCard(false); keyLock = true; }
      else if (mode === 'duo' && duo && duo.phase === 'intro') {
        if (K.pressed('Space')) duoReady(0);
        if (K.anyPressed(['Enter', 'NumpadEnter'])) duoReady(1);
        keyLock = true;
      }
    } else if (screen === 'pause') { if (K.anyPressed(['KeyP', 'Escape', 'Enter', 'NumpadEnter', 'Space'])) resume(); else if (K.pressed('KeyR')) restart(); }
    else if (screen === 'result' && resultLock <= 0) {
      if (go) resultNext(); else if (K.pressed('KeyR')) resultAgain();
      else if (K.pressed('Escape')) { J.back(); toMap(); }
    } else if (screen === 'duoEnd' && duoEnd && duoEnd.t > 0.6) {
      if (go || K.pressed('KeyR')) startDuo(); else if (K.pressed('Escape')) { J.back(); toTitle(); }
    }
  }
  // What each player does this step: the mouse (solo) or the keys.
  function inputs() {
    const K = Kit.keys;
    if (mode === 'duo') {
      if (!duo || duo.phase !== 'go' || keyLock) return [{}, {}];
      return [
        Object.assign(keyDir(K, ['KeyA'], ['KeyD'], ['KeyW'], ['KeyS']), { press: K.pressed('Space'), hold: K.down('Space') }),
        Object.assign(keyDir(K, ['ArrowLeft'], ['ArrowRight'], ['ArrowUp'], ['ArrowDown']), { press: K.anyPressed(['Enter', 'NumpadEnter']), hold: K.anyDown(['Enter', 'NumpadEnter']) })
      ];
    }
    if (card || keyLock) { pressQ = false; return [{}]; }
    const inp = keyDir(K, ['ArrowLeft', 'KeyA'], ['ArrowRight', 'KeyD'], ['ArrowUp', 'KeyW'], ['ArrowDown', 'KeyS']);
    inp.press = pressQ || K.anyPressed(SPACE);
    inp.hold = ptr.down || K.anyDown(SPACE);
    if (ptr.moved && ptr.known && !inp.mx && !inp.my) { inp.ax = ptr.x; inp.ay = ptr.y; }
    if (inp.press || inp.mx || inp.my || inp.ax != null) coach.idle = 0;
    pressQ = false;
    return [inp];
  }

  /* ------------------------------------------------------------ events */
  function surfaceY() { return world.P.surface; }
  function ripple(x, y, k, color) {
    rings.push({ x: x, y: y, t: 0, life: 0.7 + k * 0.4, r: 14 + 40 * k, color: color || '255,255,255' });
    if (rings.length > 24) rings.shift();
  }
  function splash(x, y, n) {
    fx.burst(x, y, { count: n, colors: ['#ffffff', '#bff4ff', '#7fe3ff'], speed: 260, life: 0.6, size: 7, gravity: 700, angle: -Math.PI / 2, spread: 1.6 });
  }
  function float(x, y, text, color, size) {
    floats.push({ x: x, y: y, text: text, color: color, size: size || 34, t: 0 });
    if (floats.length > 12) floats.shift();
  }
  function setMood(i, m, t) { mood[i] = { m: m, t: t }; }
  const solo = () => mode === 'solo';
  function handleEvents() {
    for (const e of world.ev) {
      const p = e.p != null ? world.players[e.p] : null;
      switch (e.t) {
        case 'cast':
          J.whoosh(0.55); castAnim[e.p] = 1;
          // Each new cast fishes at the current difficulty.
          if (solo()) world.tier = dda.tier;
          break;
        case 'splash': J.pop(0.4); ripple(e.x, e.y, 0.8); splash(e.x, e.y, 10); break;
        case 'sunk': fx.burst(e.x, e.y, { count: 5, colors: ['#ffffff'], speed: 60, life: 0.8, size: 5, gravity: -120 }); break;
        case 'notice': J.hover(); break;
        case 'nibble': J.pop(0.95); ripple(e.x, surfaceY(), 0.25); break;
        case 'bite':
          J.impact(0.6); J.pop(0.15); shake.add(3);
          ripple(e.x, surfaceY(), 1, '255,230,90'); splash(e.x, surfaceY(), 8);
          setMood(e.p, 'bite', 1.5);
          if (solo()) { Kit.track.cue(); coach.bites++; }
          break;
        case 'spook':
          J.back(); float(p.bob.x, surfaceY() - 60, 'انتظر !', '#ffffff', 30);
          fx.burst(e.x, e.y, { count: 8, colors: ['#ffffff'], speed: 90, life: 0.7, size: 6, gravity: -160 });
          if (solo()) { Kit.track.miss(); dda.result(0); }
          break;
        case 'late':
          J.error(); setMood(e.p, 'sad', 1);
          if (!e.junk) {
            float(e.x, e.y - 40, 'فاتتك!', '#ffffff', 30);
            if (solo()) { Kit.track.miss(); dda.result(0); }
          }
          break;
        case 'hooked':
          J.select(); J.impact(0.35); shake.add(4); ripple(e.x, surfaceY(), 0.9); splash(e.x, surfaceY(), 12);
          setMood(e.p, '', 0);
          if (solo()) coach.reels++;
          break;
        case 'landed': onLanded(e, p); break;
        case 'escape':
          J.back(); ripple(e.x, surfaceY(), 0.7); splash(e.x, surfaceY(), 8); setMood(e.p, 'sad', 1.2);
          float(e.x, surfaceY() - 50, e.junk ? 'أفلتت!' : 'هربت!', '#ffffff', 32);
          if (solo() && !e.junk) { Kit.track.miss(); dda.result(LL.outcome('escape', e.peak)); }
          break;
        case 'back': J.whoosh(0.2); break;
        case 'timeup': finishDuo(); break;
      }
    }
    world.ev.length = 0;
  }
  function onLanded(e, p) {
    const c = e.c, sx = p.hook.x;
    J.impact(0.4); shake.add(5); splash(sx, surfaceY(), 22); ripple(sx, surfaceY(), 1.2);
    flights[e.p] = { c: c, x: sx, y: surfaceY(), t: 0 };
    setMood(e.p, 'happy', 1.4);
    if (!solo()) {
      J.coin(3);
      scoreBump[e.p] = 1;
      float(e.p ? 1060 : 220, surfaceY() - 180, c.junk ? '0 كغ' : '+' + LL.weightText(c.w10) + ' كغ', e.p ? '#f3c4ff' : '#ffd8a8', 34);
      return;
    }
    Kit.track.hit();
    if (!c.junk) dda.result(1);
    const res = LL.applyCatch(save, place, c);
    trip.catches.push(c); trip.coins += c.coins;
    if (res.unlocked >= 0) trip.newPlace = res.unlocked;
    pendingGoals = pendingGoals.concat(res.goals);
    if (!c.junk && !save.coach) { save.coach = true; Kit.stats.tutorial('done'); }
    persist();
    $('basketNum').textContent = String(trip.catches.length);
    if (p.streak >= 2) {
      const k = p.streak >= 5 ? 2 : p.streak >= 3 ? 1 : 0;
      if (p.streak === 2 || p.streak === 3 || p.streak === 5 || p.streak % 5 === 0) { float(640, 170, PRAISE[k], '#ffd23f', 50); J.streak(p.streak); }
    }
    if (res.newSpecies && !c.junk) J.chime(Math.min(3, LL.SPECIES[c.sp].rarity));
    card = { pending: true, c: c, res: res, t: 0 };
  }

  /* ----------------------------------------------------- the ghost hand */
  // A wordless coach: a hand that glides to the next target and presses, on the game
  // clock (it freezes with a pause). It only shows: it never moves the aim or casts.
  const ghost = { on: false, steps: null, i: 0, t: 0, x: 0, y: 0, press: 0, alpha: 0, bite: false };
  const pt = p => typeof p === 'function' ? p() : p;
  function demo(steps) {
    const p0 = steps && steps[0] && pt(steps[0].at);
    if (!p0) return false;
    ghost.steps = steps; ghost.i = 0; ghost.t = 0; ghost.on = true; ghost.alpha = 0; ghost.x = p0.x; ghost.y = p0.y; ghost.press = 0; ghost.bite = false;
    ghostEl.hidden = false;
    placeGhost();
    return true;
  }
  function stopDemo() { ghost.on = false; ghost.steps = null; ghostEl.hidden = true; coach.target = 0; }
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
      done = k >= 1;
    } else if (s.press) {
      const k = ghost.t / 0.36, ph = k % 1;
      if (s.track) { const p = pt(s.track); if (p) { ghost.x = p.x; ghost.y = p.y; } }
      ghost.press = calm() ? 0 : Math.sin(Math.min(1, ph / 0.8) * Math.PI);
      done = ghost.t >= s.press * 0.36;
    } else { if (s.track) { const p = pt(s.track); if (p) { ghost.x = p.x; ghost.y = p.y; } } done = ghost.t >= (s.wait || 0); }
    if (done) { ghost.i++; ghost.t = 0; }
    placeGhost();
  }
  // The fingertip sits at (33, 5) of the 84x105 hand.
  function placeGhost() {
    ghostEl.style.transform = 'translate(' + (ghost.x - 33).toFixed(1) + 'px,' + (ghost.y + ghost.press * 16 - 5).toFixed(1) + 'px)';
    ghostEl.style.opacity = (0.92 * ghost.alpha).toFixed(2);
  }
  function centerOf(el) {
    const r = el.getBoundingClientRect();
    return r.width ? view.toLogical(r.left + r.width / 2, r.top + r.height / 2) : null;
  }
  // The fish the coach points at: one in reach, the place's goal fish first.
  function coachFish() {
    const p = world.players[0], G = world.P.goals;
    let best = null, score = -Infinity;
    for (const f of world.fish) {
      if (f.state !== 'swim' || f.x < p.x0 + 20 || f.x > p.x1 - 20) continue;
      const s = LL.spOf(f), v = (s.id === G.sp && !save.places[place].g[1] ? 400 : 0) - Math.abs(f.x - 760) * 0.5 - (s.move === 'bed' ? 40 : 0);
      if (v > score) { score = v; best = f; }
    }
    return best;
  }
  const fishPos = id => () => { const f = world && LL.fishById(world, id); return f && f.state === 'swim' ? { x: LL.mouth(f).x + f.dir * 30, y: LL.mouth(f).y } : null; };
  function coachStep(dt) {
    const p = world.players[0];
    if (ghost.on && ghost.bite && p.state !== 'bite') stopDemo();
    if (card || ghost.on) return;
    if (p.state === 'bite' && !save.coach && coach.bites <= 3) {
      // The first bites: the hand taps right at the bobber.
      if (demo([{ at: { x: p.bob.x + 90, y: surfaceY() + 80 } }, { to: { x: p.bob.x, y: surfaceY() - 6 }, s: 0.25 }, { press: 4 }])) ghost.bite = true;
      return;
    }
    if (p.state !== 'ready') { coach.idle = 0; return; }
    coach.idle += dt;
    if (coach.idle < coach.next) return;
    const f = coachFish();
    coach.idle = 0; coach.next = 6;
    if (!f) { coach.next = 1; return; }
    coach.target = f.id;
    const from = { x: 330, y: 140 };
    demo([{ at: from }, { to: fishPos(f.id), s: 1.1 }, { press: 2, track: fishPos(f.id) }, { wait: 0.4, track: fishPos(f.id) }]);
  }
  // The menus get the same hand: Play on the title, the next place on the map, and so on.
  function menuDemo() {
    let el = null;
    if (screen === 'title') el = $('btnPlay');
    else if (screen === 'map') el = document.querySelector('.place.next');
    else if (screen === 'result' && resultT > 1.5) el = $('resNext');
    else if (screen === 'play' && card && card.open && card.t > 3) el = $('catchOk');
    else if (screen === 'play' && mode === 'duo' && duo && duo.phase === 'intro') el = $('duoGo');
    if (!el) return;
    const p = centerOf(el);
    if (!p) return;
    demo([{ at: { x: p.x + 150, y: Math.min(H - 40, p.y + 120) } }, { to: p, s: 0.9 }, { press: 2 }, { wait: 0.3 }]);
  }

  /* ----------------------------------------------------------------- loop */
  function decay(dt) {
    for (let i = rings.length - 1; i >= 0; i--) { rings[i].t += dt; if (rings[i].t > rings[i].life) rings.splice(i, 1); }
    for (let i = floats.length - 1; i >= 0; i--) { const f = floats[i]; f.t += dt; f.y -= dt * 40; if (f.t > 1.3) floats.splice(i, 1); }
    for (let i = 0; i < 2; i++) { castAnim[i] = Math.max(0, castAnim[i] - dt * 3); scoreBump[i] = Math.max(0, scoreBump[i] - dt * 3); if (mood[i].t > 0) { mood[i].t -= dt; if (mood[i].t <= 0) mood[i].m = ''; } }
    for (let k = 0; k < 3; k++) goalBump[k] = Math.max(0, goalBump[k] - dt * 2.5);
    coinBump = Math.max(0, coinBump - dt * 4);
    for (let i = flyers.length - 1; i >= 0; i--) {
      const f = flyers[i];
      f.t += dt * 1.6;
      if (f.t >= 1) { flyers.splice(i, 1); coinShown = Math.min(save.coins, coinShown + f.v); coinBump = 1; J.coin(1 + (flyers.length % 5)); }
    }
    if (!flyers.length && !card) coinShown = save.coins;
    for (let i = timers.length - 1; i >= 0; i--) { const q = timers[i]; q.t -= dt; if (q.t <= 0) { timers.splice(i, 1); if (screen === 'play' && mode === 'solo') q.fn(); } }
    for (let i = 0; i < 2; i++) if (flights[i]) { flights[i].t += dt; if (flights[i].t > 0.9) flights[i] = null; }
    if (banner) { banner.t += dt; if (banner.t > 3.2) banner = null; }
  }
  function playStep(dt) {
    if (mode === 'duo') {
      duoStep(dt);
      // The derby's clock waits for the start.
      if (duo.phase !== 'go') world.left = LL.DUO_SECONDS + dt;
    }
    if (!world.over) LL.step(world, dt, inputs());
    handleEvents();
    if (mode === 'solo') {
      coachStep(dt);
      if (card && card.pending && world.players[0].state !== 'land') { card.pending = false; openCard(card.c, card.res); }
      if (card && card.open) {
        card.t += dt;
        busyT += dt;
        if (busyT >= 1) { busyT = 0; Kit.stats.busy(); }
        if (card.t > 9) closeCard(false);
      }
    }
  }
  function update(dt) {
    time += dt;
    handleKeys();
    if (screen === 'play' && world) playStep(dt);
    else if (screen !== 'pause') {
      LL.step(menuWorld, dt, null);
      menuWorld.ev.length = 0;
      if (screen === 'result') resultStep(dt);
      if (screen === 'duoEnd' && duoEnd) duoEnd.t += dt;
      if (resultLock > 0) resultLock -= dt;
    }
    if (screen !== 'pause') {
      menuIdle += dt;
      if (!ghost.on && menuIdle >= menuNext && screen !== 'book' && screen !== 'rods') { menuNext = menuIdle + 6; menuDemo(); }
      ghostStep(dt);
      fx.update(dt); shake.update(dt); decay(dt);
      if (fx.list.length > 300) fx.list.splice(0, fx.list.length - 300);
    }
    ptr.moved = false;
    Kit.keys.endFrame();
  }

  /* --------------------------------------------------------------- render */
  const BAR = [{ x: 66, y: 262, h: 390, w: 62 }, { x: 1214, y: 262, h: 390, w: 62 }];
  function fisherSpot(w, i) {
    const top = w.P.surface;
    return i ? { x: 1132, y: top - 10, sit: true } : { x: 196, y: top - 38, sit: false };
  }
  function drawPlayer(ctx, w, p, still) {
    const i = p.i, spot = fisherSpot(w, i), d = p.side, col = COLORS[i], top = w.P.surface;
    let hop = 0;
    if (mood[i].m === 'happy' && !still) hop = Math.abs(Math.sin(mood[i].t * 9)) * 16;
    if (i === 1) A.boat(ctx, 1150, top + 6, time, true);
    const hx = spot.x + d * 30, hy = spot.y - 60 - hop;
    // The rod tip: swung back while casting, pulled down by a fish on the line.
    let tx = p.rod.x, ty = p.rod.y - hop, bend = 0;
    if (castAnim[i] > 0) {
      const a = -d * Math.sin(castAnim[i] * Math.PI) * 1.1, dx = tx - hx, dy = ty - hy;
      tx = hx + dx * Math.cos(a) - dy * Math.sin(a); ty = hy + dx * Math.sin(a) + dy * Math.cos(a);
    }
    if (p.state === 'reel') {
      bend = 0.7 + (still ? 0 : 0.3 * Math.sin(time * 9));
      tx += (p.hook.x - tx) * 0.1 * bend; ty += 26 * bend;
    } else if (p.state === 'bite' && !still) ty += Math.sin(time * 40) * 3;
    const look = p.state === 'ready' ? LL.aimTarget(w, p) : p.state === 'cast' || p.state === 'back' ? p.bob : { x: p.bob.x, y: top };
    A.fisher(ctx, spot.x, spot.y, { side: d, hat: col.hat, band: col.band, shirt: col.shirt, pants: col.pants, time: time, still: still,
      mood: mood[i].m || (p.state === 'bite' ? 'bite' : ''), lean: p.state === 'reel' ? -1 : 0, look: look, sit: spot.sit, hop: hop });
    // Arms to the rod (one cranks the reel while reeling).
    const sx = spot.x, sy = spot.y - 74 - hop;
    const crank = p.state === 'reel' && !still ? { x: Math.cos(time * 14) * 8, y: Math.sin(time * 14) * 8 } : { x: 0, y: 0 };
    ctx.lineCap = 'round';
    [[sx - 16 * d, hx - 4 * d + crank.x, hy + 8 + crank.y], [sx + 16 * d, hx + 6 * d, hy - 4]].forEach(a => {
      ctx.beginPath(); ctx.moveTo(a[0], sy); ctx.quadraticCurveTo((a[0] + a[1]) / 2, sy + 22, a[1], a[2]);
      ctx.lineWidth = 15; ctx.strokeStyle = A.INK; ctx.stroke(); ctx.lineWidth = 9; ctx.strokeStyle = col.shirt; ctx.stroke();
    });
    A.rod(ctx, hx, hy, tx, ty, bend, i ? '#ff7ae0' : '#c98a4a');
    A.hand(ctx, hx - 4 * d + crank.x, hy + 8 + crank.y); A.hand(ctx, hx + 6 * d, hy - 4);
    if (i === 1) {
      // The boat's front side over the fisher's legs.
      ctx.save(); ctx.beginPath(); ctx.rect(980, top - 30, 300, 80); ctx.clip();
      A.boat(ctx, 1150, top + 6, time, true); ctx.restore();
    }
    // The line, the bobber and the hook.
    const st = p.state;
    if (st === 'reel') A.line(ctx, tx, ty, p.hook.x, p.hook.y, 0, true);
    else if (st === 'ready' || st === 'land') {
      A.line(ctx, tx, ty, tx, ty + 34, 0, true); A.bobber(ctx, tx, ty + 40, 0.8); A.hookArt(ctx, tx, ty + 60, time, still);
    } else if (st === 'cast' || st === 'back') {
      A.line(ctx, tx, ty, p.bob.x, p.bob.y, 20, false); A.bobber(ctx, p.bob.x, p.bob.y, 1);
    } else {
      let by = top - 2 + p.dip * 7;
      if (st === 'bite') by = top + 12 + (still ? 0 : Math.sin(time * 30) * 2);
      A.line(ctx, tx, ty, p.bob.x, by - 10, 30, false);
      A.bobber(ctx, p.bob.x, by, 1);
    }
  }
  function drawUnder(ctx, w, p, still) {
    const st = p.state, top = w.P.surface;
    if (st === 'sink' || st === 'wait' || st === 'bite') {
      ctx.beginPath(); ctx.moveTo(p.bob.x, top + 6); ctx.lineTo(p.hook.x, p.hook.y - 8);
      ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.stroke();
      A.hookArt(ctx, p.hook.x, p.hook.y, time, still);
    }
  }
  function drawWorld(ctx, w, menu) {
    const P = w.P, pi = w.place, still = calm();
    A.sceneBack(ctx, pi, pixelScale(), time, still);
    for (const j of w.junk) A.junk(ctx, j, time, still);
    const target = coach.target && ghost.on ? LL.fishById(w, coach.target) : null;
    if (target) {
      const r = LL.spOf(target).len * target.size * 0.75 + (still ? 0 : Math.sin(time * 6) * 5);
      A.ell(ctx, target.x, target.y, r, r * 0.7); ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(255,214,60,0.9)'; ctx.stroke();
    }
    for (const f of w.fish) A.fish(ctx, f, LL.spOf(f), time, still, P.night);
    for (const p of w.players) drawUnder(ctx, w, p, still);
    A.sceneFront(ctx, pi, time, still);
    for (const p of w.players) drawPlayer(ctx, w, p, still);
    // «؟» over a fish that noticed a hook, «!» over a bobber at the bite.
    for (const f of w.fish) if (f.state === 'notice') A.mark(ctx, f.x, f.y - LL.spOf(f).len * f.size * 0.45 - 30, '؟', 0.9);
    for (const p of w.players) {
      const f = p.fish && LL.fishById(w, p.fish), top = P.surface;
      if (p.state === 'bite') {
        const k = 1 + (still ? 0 : Math.max(0, 0.3 - p.t) * 2) + (still ? 0 : Math.sin(time * 14) * 0.05);
        A.mark(ctx, p.bob.x, top - 74, '!', k);
        if (mode === 'solo' && (w.tier <= 2 || coach.bites < 5)) { A.mouseIcon(ctx, p.bob.x + 70, top - 74, 0.8, !still && Math.sin(time * 10) > 0, '#ffd23f'); }
      } else if (f && f.state === 'nibble' && mode === 'solo' && (w.tier <= 2 || !save.coach)) thinking(ctx, p.bob.x, top - 58, still);
    }
    // Aims.
    for (const p of w.players) {
      if (menu || card || screen !== 'play' || (mode === 'duo' && (!duo || duo.phase !== 'go'))) continue;
      const tgt = LL.aimTarget(w, p), col = p.i ? A.P2 : A.P1, label = mode === 'duo' ? String(p.i + 1) : '';
      if (p.state === 'ready') A.aim(ctx, p.rod, tgt, P.surface, time, col, label, still, false);
      else if (p.state === 'wait' && Math.hypot(tgt.x - p.hook.x, tgt.y - p.hook.y) > 50) A.aim(ctx, p.rod, tgt, P.surface, time, col, label, still, true);
    }
    // A landed catch flies up to the fisher.
    flights.forEach((fl, i) => {
      if (!fl) return;
      const k = Math.min(1, fl.t / 0.8), spot = fisherSpot(w, i), x = fl.x + (spot.x + (i ? -40 : 40) - fl.x) * k, y = fl.y + (spot.y - 90 - fl.y) * k - Math.sin(k * Math.PI) * 150;
      if (fl.c.junk) A.junkIcon(ctx, fl.c.id, x, y, 0.8);
      else A.species(ctx, LL.SPECIES[fl.c.sp], x, y, i ? 1 : -1, 1, { time: time, still: still, rot: still ? 0 : k * 6.283, fast: 1 });
    });
    drawFx(ctx, still);
    // Reel bars.
    for (const p of w.players) {
      if (p.state !== 'reel' || !p.reel) continue;
      const f = p.fish && LL.fishById(w, p.fish), s = f ? LL.spOf(f) : null;
      const b = mode === 'duo' ? BAR[p.i] : BAR[0];
      A.reelBar(ctx, b, p.reel, s, p.reel.junk && p.junk ? p.junk.kind : (p.reel.junk ? 'boot' : ''), { color: p.i ? A.P2 : A.P1, label: mode === 'duo' ? String(p.i + 1) : '', time: time, still: still, meterSide: p.i ? -1 : 1 });
      if (mode === 'solo' && (w.tier <= 2 || coach.reels <= 3)) reelHint(ctx, b, p.reel, still);
    }
  }
  function thinking(ctx, x, y, still) {
    A.rr(ctx, x - 36, y - 20, 72, 40, 20); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = A.INK; ctx.stroke();
    for (let k = 0; k < 3; k++) {
      const up = still ? 0 : Math.max(0, Math.sin(time * 6 - k * 0.9)) * 5;
      A.circle(ctx, x - 16 + k * 16, y - up, 5.5); ctx.fillStyle = '#4f7bff'; ctx.fill();
    }
  }
  // Wordless: hold when the fish is above the green zone, let go when it is below.
  function reelHint(ctx, b, r, still) {
    const zc = r.z + r.h / 2, up = r.f > zc + 0.04, down = r.f < zc - 0.04 && !r.inZone;
    const x = b.x + 130, y = b.y + b.h * (1 - zc);
    if (up) { A.arrow(ctx, x, y - 50, 1, 0.9, '#5be38f'); A.mouseIcon(ctx, x, y + 20, 0.9, !still && Math.sin(time * 8) > -0.6, '#5be38f'); }
    else if (down) { A.arrow(ctx, x, y + 50, -1, 0.9, '#ffffff'); A.mouseIcon(ctx, x, y - 20, 0.9, false); }
  }
  function drawFx(ctx, still) {
    fx.draw(ctx);
    for (const r of rings) {
      const k = r.t / r.life, rad = still ? r.r * 0.8 : r.r * (0.3 + k);
      A.ell(ctx, r.x, r.y, rad, rad * 0.28); ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(' + r.color + ',' + (1 - k).toFixed(2) + ')'; ctx.stroke();
    }
    for (const f of floats) {
      ctx.globalAlpha = Math.max(0, 1 - Math.max(0, f.t - 0.8) / 0.5);
      A.text(ctx, f.text, f.x, f.y, f.size, f.color);
    }
    ctx.globalAlpha = 1;
  }
  function drawHud(ctx) {
    const still = calm();
    if (mode === 'solo') {
      A.goals(ctx, place, save, time, goalBump, still);
      A.coinChip(ctx, 1214, 104, Math.round(coinShown), coinBump);
      for (const f of flyers) {
        if (f.t < 0) continue;
        const k = f.t, e = 1 - Math.pow(1 - k, 2), x = f.x + (1150 - f.x) * e, y = f.y + (104 - f.y) * e - Math.sin(k * Math.PI) * 80;
        A.coin(ctx, x, y, 14);
      }
      if (banner) {
        const k = Math.min(1, banner.t / 0.3), y = 300 - (1 - k) * 40;
        ctx.globalAlpha = Math.min(1, (3.2 - banner.t) / 0.4);
        A.rr(ctx, 400, y - 50, 480, 100, 50); ctx.fillStyle = '#ff5d9e'; ctx.fill(); ctx.lineWidth = 6; ctx.strokeStyle = A.INK; ctx.stroke();
        A.text(ctx, 'مكان جديد!', 700, y + 2, 48, '#ffffff');
        A.badge(ctx, 470, y, String(banner.place + 1), '#4fd1ff', 30);
        ctx.globalAlpha = 1;
      }
    } else if (duo) {
      const w = world, left = Math.ceil(w.left), m = Math.floor(left / 60), s = left % 60, txt = m + ':' + (s < 10 ? '0' : '') + s;
      A.rr(ctx, 572, 12, 136, 64, 32); ctx.fillStyle = left <= 10 && duo.phase === 'go' ? '#ff5d6c' : '#ffffff'; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = A.INK; ctx.stroke();
      A.text(ctx, txt, 640, 46, 40, left <= 10 && duo.phase === 'go' ? '#ffffff' : A.INK, { stroke: false });
      w.players.forEach((p, i) => {
        const x = i ? 820 : 460, col = i ? A.P2 : A.P1, k = 1 + scoreBump[i] * 0.2;
        ctx.save(); ctx.translate(x, 44); ctx.scale(k, k);
        A.rr(ctx, -100, -30, 200, 60, 30); ctx.fillStyle = 'rgba(255,255,255,0.94)'; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = col; ctx.stroke();
        A.badge(ctx, -74, 0, String(i + 1), col, 22);
        A.text(ctx, LL.weightText(p.total) + ' كغ', 16, 2, 30, A.INK, { stroke: false });
        ctx.restore();
        if (w.left <= 0 && p.state === 'reel') A.text(ctx, 'آخر سمكة!', x, 104, 30, '#ffd23f');
      });
      if (duo.phase === 'count') {
        const n = Math.max(0, 3 - Math.floor(duo.t)), k = still ? 1 : 1.3 - (duo.t % 1) * 0.3;
        A.text(ctx, n ? String(n) : 'انطلق!', 640, 330, 140 * k, '#ffd23f', { lw: 18 });
      }
      if (duo.phase === 'go' && duo.t < 8) {
        // The controls stay on screen at the start, beside each fisher.
        ctx.globalAlpha = Math.min(1, (8 - duo.t) / 1.5);
        keysHint(ctx, 160, 300, ['W', 'A', 'S', 'D'], 'مسافة', A.P1);
        keysHint(ctx, 1120, 300, ['↑', '←', '↓', '→'], 'Enter', A.P2);
        ctx.globalAlpha = 1;
      }
    }
  }
  function keysHint(ctx, x, y, keys, act, col) {
    A.rr(ctx, x - 96, y - 66, 192, 168, 24); ctx.fillStyle = 'rgba(255,255,255,0.88)'; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = col; ctx.stroke();
    A.keycap(ctx, x, y - 34, keys[0]);
    A.keycap(ctx, x - 50, y + 14, keys[1]); A.keycap(ctx, x, y + 14, keys[2]); A.keycap(ctx, x + 50, y + 14, keys[3]);
    A.keycap(ctx, x, y + 66, act, 130);
  }
  function drawMenu(ctx) {
    const still = calm(), w = menuWorld;
    drawWorld(ctx, w, true);
    if (screen === 'book') A.book(ctx, save, time, still);
    else if (screen === 'map' || screen === 'rods') { ctx.fillStyle = 'rgba(16,30,70,0.35)'; ctx.fillRect(0, 0, W, H); }
    drawFx(ctx, still);
  }
  function render() {
    if (screen === 'pause' && !dirty) return;
    dirty = false;
    const ctx = view.ctx;
    ctx.save();
    ctx.translate(shake.x, shake.y);
    if ((screen === 'play' || screen === 'pause') && world) { drawWorld(ctx, world); drawHud(ctx); if (card && card.open && screen === 'play') drawCardArt(); }
    else if ((screen === 'result' || screen === 'duoEnd') && world) {
      drawWorld(ctx, world);
      ctx.fillStyle = 'rgba(28,34,80,0.35)'; ctx.fillRect(0, 0, W, H);
      drawFx(ctx, calm());
    } else drawMenu(ctx);
    ctx.restore();
  }

  canvas.addEventListener('contextrestored', () => { A.reset(); thumbsDrawn = false; dirty = true; });
  if (document.fonts && document.fonts.load) {
    document.fonts.load('700 40px Fredoka', 'بحيرة 5').then(() => { dirty = true; }, () => { /* fallback fonts */ });
  }

  /* --------------------------------------------------- test and debug hook */
  const page = (x, y) => { const r = canvas.getBoundingClientRect(); return { x: r.left + x * view.scale, y: r.top + y * view.scale }; };
  const round1 = v => Math.round(v * 10) / 10;
  function playerState(p) {
    if (!p) return null;
    const r = p.reel;
    return { state: p.state, casts: p.casts, aim: { x: round1(p.aim.x), y: round1(p.aim.y) }, hook: { x: round1(p.hook.x), y: round1(p.hook.y) },
      bob: { x: round1(p.bob.x), y: round1(p.bob.y) }, fish: p.fish, catches: p.catches.length, total: p.total,
      reel: r ? { z: round1(r.z * 100) / 100, h: r.h, f: round1(r.f * 100) / 100, meter: round1(r.meter * 100) / 100, inZone: r.inZone } : null };
  }
  window.__game = {
    get state() {
      const w = world;
      return {
        screen: screen, mode: mode, paused: screen === 'pause', place: place, tier: w ? w.tier : 0, time: w ? Math.round(w.t * 1000) / 1000 : 0,
        card: !!(card && card.open), p1: w ? playerState(w.players[0]) : null, p2: w ? playerState(w.players[1]) : null,
        fish: w ? w.fish.map(f => ({ id: f.id, sp: LL.SPECIES[f.sp].id, x: round1(f.x), y: round1(f.y), state: f.state })) : [],
        trip: trip.catches.length, tripOpen: trip.open, coins: save.coins, left: w && w.duo ? Math.round(w.left * 100) / 100 : 0,
        duo: duo ? duo.phase : '', winner: duoEnd ? duoEnd.win : -1, ghost: ghost.on, shake: shake.power, result: !!result && screen === 'result'
      };
    },
    get save() { return JSON.parse(JSON.stringify(save)); },
    // Where a logical point is on the page, for tests that move the real mouse there.
    point: page,
    fishPoint: i => { const f = world && world.fish[i || 0]; return f ? page(LL.mouth(f).x, LL.mouth(f).y) : null; },
    bobberPoint: () => world ? page(world.players[0].bob.x, world.P.surface) : null
  };

  buildMap();
  buildRods();
  Kit.muteButton();
  Kit.lifecycle({ pause: () => pause(false), reset: () => { ptr.down = false; pressQ = false; } });
  toTitle();
  Kit.loop(update, render);
  Kit.ready();
})();
