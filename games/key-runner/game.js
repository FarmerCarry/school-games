/* Key Runner (عدّاء المفاتيح): screens, the real keyboard, the ghost-hand coach, saves and
 * sound. engine.js runs the courses; art.js draws them.
 * This is the UI layer: it reads Kit.dda at every round start. Every key press is taken in
 * the order it was typed (KeyboardEvent.code, so an Arabic or an English Windows keyboard
 * both work). */
(function () {
  'use strict';
  const KR = window.KR, A = KR.art, J = Kit.juice, W = KR.W, H = KR.H;
  const $ = id => document.getElementById(id);
  const canvas = $('game'), ui = $('ui'), ghostEl = $('ghost');
  const calm = () => Kit.motion.reduced();
  let dirty = true;
  const view = Kit.fit(canvas, W, H, { maxDpr: 1.5, onResize: v => {
    ui.style.left = canvas.style.left; ui.style.top = canvas.style.top; ui.style.transform = 'scale(' + v.scale + ')'; dirty = true;
  } });
  const shake = Kit.shake();
  const pixelScale = () => Math.min(2, Math.max(0.5, Math.round(view.scale * view.dpr * 4) / 4));

  // Lanes: a solo course above the keyboard, the title's attract run, two duo lanes.
  const SOLO = { y: 0, h: 720, base: 318, runX: 380 };
  const TITLE = { y: 0, h: 720, base: 470, runX: 300 };
  const LANES = [{ y: 0, h: 360, base: 212, runX: 450, clip: true }, { y: 360, h: 360, base: 212, runX: 450, clip: true }];
  const KB = { u: 46, x: Math.round((W - KR.KB_UNITS * 46) / 2), y: 480 };
  const HALF_U = 34;
  const PRAISE = ['رائع!', 'ممتاز!', 'مذهل!', 'خارق!', 'أسطوري!'];
  const P_COLORS = [0, 1];

  /* ---------------------------------------------------------------- save */
  const store = Kit.store('key-runner');
  const saveStatus = Kit.saveStatus({ retry: persist });
  let save = KR.loadSave(store.get('save', null));
  function persist() {
    if (store.set('save', save) === false) { saveStatus.failed(); return false; }
    saveStatus.saved();
    return true;
  }
  // One difficulty for the levels, one for the endless run (Kit keeps them per player).
  const ddaLevels = Kit.dda('key-runner', { id: 'levels' });
  const ddaEndless = Kit.dda('key-runner', { id: 'endless' });

  /* --------------------------------------------------------------- state */
  let screen = 'title', mode = '', cur = { w: 0, l: 0 }, time = 0;
  let solo = null, lanes = null, demo = null, ending = null, result = null, resultT = 0, resultLock = 0;
  let queue = [], countdown = 0, winner = -1, duoScene = 3, intro = null, menuIdle = 0, menuNext = 5;
  let gaugeBump = 0, coinBump = 0, heartBump = 0, firstCoach = false, tutorialHits = 0, closetFrom = 'title', unlockFx = -1;
  const flash = {};
  const calls = [];
  const coach = { t: 0, next: 3 };

  /* -------------------------------------------------------------- lanes */
  function makeLane(plan, seed, geo, color, hat, scene) {
    const w = KR.create(plan, seed);
    return { w: w, geo: geo, scene: scene, cam: w.r.x - geo.runX, fx: Kit.particles(), floats: [], fxs: new Map(), run: 0, sq: 0, sqv: 0,
      trail: [], color: color, hat: hat, lines: [], demoT: 0 };
  }
  function stoneFx(L, s) { let f = L.fxs.get(s); if (!f) { f = { dip: 0, shake: 0, miss: 0 }; L.fxs.set(s, f); } return f; }
  function laneFloat(L, x, y, text, color, size) {
    L.floats.push({ x: x, y: y, text: text, color: color, size: size || 38, t: 0 });
    if (L.floats.length > 12) L.floats.shift();
  }
  function burst(L, x, y, colors, count, speed, gravity) {
    L.fx.burst(x, y, { count: count || 14, colors: colors, speed: speed || 300, life: 0.6, size: 8, gravity: gravity == null ? 500 : gravity });
    if (L.fx.list.length > 240) L.fx.list.splice(0, L.fx.list.length - 240);
  }
  // A big word of praise; in a race it shows on the lane of the player who earned it.
  function call(text, color, y) { calls.push({ text: text, t: 0, color: color || '#ffd23f', y: y }); if (calls.length > 4) calls.shift(); }
  const SPARK = ['#ffe14d', '#ffffff', '#7ef0a2', '#4fd1ff'];
  // Turns a lane's engine events into pictures and sound (`real`: a lane a child plays).
  function laneEvents(L, real, quiet) {
    const w = L.w;
    for (const e of w.ev) {
      if (e.t === 'hit') {
        const s = w.stones[e.i], cx = (e.x + e.x1) / 2;
        if (s) stoneFx(L, s).dip = 1;
        if (real) flash[e.code] = ['ok', 0.35];
        burst(L, cx, e.y - 8, SPARK, 12, 280, 380);
        laneFloat(L, cx, e.y - 30, '+1', '#ffffff', 40);
        if (!quiet) {
          J.streak(Math.min(13, e.combo));
          gaugeBump = 1;
          if (e.combo >= 5 && e.combo % 5 === 0) {
            call(PRAISE[Math.min(PRAISE.length - 1, e.combo / 5 - 1)], '', real === 'duo' ? L.geo.y + 120 : undefined);
            J.chime(e.combo >= 15 ? 3 : 2);
          }
          if (e.steps > 0 && e.steps % 5 === 0) J.whoosh(Math.min(1, e.steps / w.tune.maxSteps));
          wordDone(L, e);
        }
        if (real === 'solo') { coach.t = 0; coach.next = coachDelay(); hideHand(); Kit.track.hit(); }
        if (real === 'solo' && firstCoach && ++tutorialHits >= 3) {
          firstCoach = false;
          Kit.stats.tutorial('done');
          if (!save.coach) { save.coach = true; persist(); }
        }
      } else if (e.t === 'wrong') {
        const s = w.stones[e.i];
        if (s) { const f = stoneFx(L, s); f.shake = 1; f.miss = 0.4; }
        if (real) flash[e.code] = ['miss', 0.4];
        if (!quiet) { boop(); if (w.tune.wrongCost) gaugeBump = -1; }
        if (real === 'solo') { coach.next = Math.min(coach.next, coach.t + 1.2); Kit.track.miss(); }
      } else if (e.t === 'act') {
        L.sq = e.kind === 'slide' ? 0.6 : -0.45; L.sqv = 0;
        if (!quiet) { if (e.kind === 'slide') J.whoosh(0.5); else J.jump(e.kind === 'climb' ? 0.8 : 0.5); }
        burst(L, e.x - 6, e.y - 2, ['#ffffff', '#e8e8f8'], 6, 120, -40);
      } else if (e.t === 'land') {
        L.sq = 0.5; L.sqv = 0;
        if (!quiet) J.land(0.25);
        burst(L, e.x, e.y - 2, ['#ffffff', '#f2efe6'], 7, 140, -30);
      } else if (e.t === 'stop') {
        // The runner waits for the next key: the press that frees it is a reaction time.
        if (real === 'solo') Kit.track.cue();
        if (!quiet && e.lost >= 3) { gaugeBump = -1; J.land(0.15); }
        L.sq = 0.3;
      } else if (e.t === 'coin') {
        if (!quiet) { J.coin(Math.min(5, 1 + (e.coins % 5))); coinBump = 1; }
        burst(L, e.x, e.y, ['#ffc93c', '#fff3b0', '#ffffff'], 12, 260, 300);
      } else if (e.t === 'heart') {
        heartBump = 1; J.back();
        burst(L, e.x, e.y - 80, ['#ff5d6c', '#ffffff'], 14, 240, 400);
      } else if (e.t === 'finish') {
        if (real === 'solo') finishLevel();
      } else if (e.t === 'over') {
        if (real === 'solo') finishEndless();
      }
    }
    w.ev.length = 0;
  }
  // The last letter of a word: the whole word pops above its stones.
  function wordDone(L, e) {
    const plan = L.w.plan;
    if (e.word < 0 || !plan.words) return;
    const word = plan.words[e.word], i = e.i + (L.w.offset || 0) - 1;
    if (!word || i !== word.start + word.len - 1) return;
    laneFloat(L, e.x, e.y - 150, word.text, '#ffd23f', 56);
    J.chime(1);
  }
  function boop() {
    // A soft, low "boop": never a buzzer.
    Kit.audio.tone({ freq: 330, to: 230, type: 'sine', dur: 0.16, vol: 0.16 });
  }
  function laneStep(L, dt, real, quiet) {
    const w = L.w;
    KR.step(w, dt);
    laneEvents(L, real, quiet);
    const target = w.r.x - L.geo.runX;
    L.cam += (target - L.cam) * Math.min(1, dt * 7);
    if (Math.abs(target - L.cam) > 600) L.cam = target;
    animLane(L, dt);
  }
  function animLane(L, dt) {
    const w = L.w;
    L.run += dt * Math.max(0, w.r.vel) / 9;
    L.sqv += (-L.sq * 220 - L.sqv * 15) * dt; L.sq += L.sqv * dt;
    L.fx.update(dt);
    for (let i = L.floats.length - 1; i >= 0; i--) { const f = L.floats[i]; f.t += dt; f.y -= dt * 50; if (f.t > 1.1) L.floats.splice(i, 1); }
    L.fxs.forEach(f => { f.dip = Math.max(0, f.dip - dt * 4); f.shake = Math.max(0, f.shake - dt * 3); f.miss = Math.max(0, f.miss - dt); });
    // A short trail behind a fast runner.
    L.trail.unshift({ x: w.r.x, y: w.r.y });
    if (L.trail.length > 8) L.trail.pop();
    // Speed lines that grow with the "+1" steps.
    const k = w.steps / Math.max(1, w.tune.maxSteps);
    while (L.lines.length < 12) L.lines.push({ x: Math.random() * W, y: 40 + Math.random() * (L.geo.base + 40), len: 60 + Math.random() * 120 });
    for (const ln of L.lines) { ln.x -= (300 + w.r.vel * 2.2) * dt * (0.6 + k); if (ln.x + ln.len < 0) { ln.x = W + Math.random() * 200; ln.y = 40 + Math.random() * (L.geo.base + 40); } }
  }

  /* ------------------------------------------------------------ screens */
  const SCREENS = { title: 'scrTitle', map: 'scrMap', pause: 'scrPause', result: 'scrResult', closet: 'scrCloset', duo: 'scrDuo', duoEnd: 'scrDuoEnd' };
  function setScreen(name) {
    screen = name;
    for (const k in SCREENS) $(SCREENS[k]).hidden = k !== name;
    $('hud').hidden = name !== 'play';
    hideHand();
    menuIdle = 0; menuNext = 5;
    dirty = true;
    if (name === 'play') focusGame();
  }
  function focusGame() { try { canvas.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  function say(text) { $('live').textContent = text; }
  function setChip(id) { $(id).querySelector('b').textContent = String(KR.total(save)); }
  function starsText(n) { return n === 1 ? 'نجمة واحدة' : n === 2 ? 'نجمتان' : n + ' نجوم'; }

  function toTitle() {
    solo = null; lanes = null; mode = ''; ending = null;
    newDemo();
    setScreen('title');
    setChip('titleStars');
    paintLabels();
    $('btnCloset').classList.toggle('ring', hasNewItem());
  }
  function play() {
    J.select();
    // A child who has never played goes straight into the first run; others pick on the map.
    if (!KR.total(save)) startLevel(0, 0); else toMap(-1);
  }
  function newDemo() {
    const seed = (Math.random() * 1e9) | 0;
    demo = makeLane(KR.plan(1, 2, 3, seed), seed, TITLE, save.color, save.hat, 0);
  }

  /* --------------------------------------------------------- label mode */
  function paintLabels() {
    document.querySelectorAll('.lbl').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.label === save.label)));
  }
  document.querySelectorAll('.lbl').forEach(b => on(b, () => {
    if (save.label === b.dataset.label) return;
    save.label = b.dataset.label;
    persist();
    J.toggle(true);
    paintLabels();
    paintCards();
    dirty = true;
  }));

  /* ---------------------------------------------------------------- map */
  const cardEls = [];
  const CARD_KEYS = [['Space', 'ArrowUp', 'ArrowDown'], ['KeyF', 'KeyJ', 'KeyG'], ['KeyA', 'KeyS', 'KeyD'], ['KeyQ', 'KeyW', 'KeyE'],
    ['KeyZ', 'KeyX', 'KeyC'], ['Digit1', 'Digit2', 'Digit3'], ['KeyK', 'KeyL', 'Semicolon']];
  function starRow() { return '<span class="st" aria-hidden="true">' + '<svg><use href="#i-star"/></svg>'.repeat(3) + '</span>'; }
  function buildMap() {
    const box = $('cards');
    KR.WORLDS.forEach((wd, w) => {
      const card = document.createElement('div');
      card.className = 'wcard';
      card.innerHTML = '<button type="button" class="pic"><canvas width="560" height="320"></canvas></button>' +
        '<span class="num">' + (w + 1) + '</span><span class="wstars"><svg aria-hidden="true"><use href="#i-star"/></svg><b>0</b></span>' +
        '<svg class="lock" aria-hidden="true"><use href="#i-lock"/></svg><h2>' + wd.name + '</h2><div class="levels"></div>';
      const lv = card.querySelector('.levels'), btns = [];
      for (let l = 0; l < KR.LEVELS; l++) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'lvl'; b.dataset.w = String(w); b.dataset.l = String(l);
        b.innerHTML = '<b>' + (l + 1) + '</b>' + starRow();
        on(b, () => pickLevel(w, l, b));
        lv.appendChild(b); btns.push(b);
      }
      const pic = card.querySelector('.pic');
      on(pic, () => openWorld(w));
      box.appendChild(card);
      cardEls.push({ card: card, pic: pic, canvas: pic.querySelector('canvas'), btns: btns });
    });
    const card = document.createElement('div');
    card.className = 'wcard endless';
    card.innerHTML = '<button type="button" class="pic"><canvas width="560" height="320"></canvas></button>' +
      '<svg class="lock" aria-hidden="true"><use href="#i-lock"/></svg><h2>سباق بلا نهاية</h2>' +
      '<span class="best"><svg aria-hidden="true"><use href="#i-crown"/></svg><b>0</b></span>' +
      '<button type="button" class="kr-btn kr-go big-go" id="btnEndless" aria-label="سباق بلا نهاية"><svg aria-hidden="true"><use href="#i-inf"/></svg></button>';
    box.appendChild(card);
    on(card.querySelector('.pic'), () => openEndless(card));
    on(card.querySelector('#btnEndless'), () => openEndless(card));
    cardEls.push({ card: card, pic: card.querySelector('.pic'), canvas: card.querySelector('canvas'), btns: [], endless: true });
  }
  let painted = '';
  function paintCards(force) {
    const sig = save.label + KR.WORLDS.map((_, w) => KR.worldOpen(save, w) ? 1 : 0).join('') + (KR.endlessOpen(save) ? 1 : 0) + save.color + '.' + save.hat;
    if (sig === painted && !force) return;
    painted = sig;
    cardEls.forEach((c, w) => {
      if (c.endless) { paintEndlessCard(c); return; }
      A.card(c.canvas, w, CARD_KEYS[w], save.label, !KR.worldOpen(save, w));
    });
  }
  function paintEndlessCard(c) {
    const g = c.canvas.getContext('2d');
    A.card(c.canvas, 6, [], save.label, false);
    g.save(); g.scale(2, 2);
    A.runner(g, 140, 128, { color: save.color, hat: save.hat, pose: 'run', still: true, run: 1, scale: 1.1, speed: 1 });
    g.restore();
    if (!KR.endlessOpen(save)) { g.fillStyle = 'rgba(40,46,90,0.55)'; g.fillRect(0, 0, c.canvas.width, c.canvas.height); }
  }
  function refreshMap() {
    const next = KR.nextLevel(save);
    cardEls.forEach((c, w) => {
      if (c.endless) {
        const open = KR.endlessOpen(save);
        c.card.classList.toggle('locked', !open);
        c.card.querySelector('.best b').textContent = String(save.endless);
        c.card.querySelector('.best').hidden = !save.endless;
        c.pic.setAttribute('aria-label', 'سباق بلا نهاية' + (open ? '' : ' (مقفل)'));
        return;
      }
      const open = KR.worldOpen(save, w);
      c.card.classList.toggle('locked', !open);
      c.card.querySelector('.wstars b').textContent = KR.worldStars(save, w) + '/' + KR.LEVELS * 3;
      c.pic.setAttribute('aria-label', KR.WORLDS[w].name + (open ? '' : ' (مقفل)'));
      c.btns.forEach((b, l) => {
        const ok = KR.isOpen(save, w, l), stars = save.stars[w][l];
        b.classList.toggle('locked', !ok);
        b.classList.toggle('done', stars > 0);
        b.classList.toggle('next', next.w === w && next.l === l && !stars);
        b.querySelectorAll('.st svg').forEach((s, i) => s.classList.toggle('on', i < stars));
        b.setAttribute('aria-label', 'المرحلة ' + (l + 1) + (ok ? (stars ? '، ' + starsText(stars) : '') : ' (مقفلة)'));
      });
    });
    setChip('mapStars');
  }
  function toMap(fresh) {
    solo = null; lanes = null; mode = ''; ending = null;
    if (!demo) newDemo();
    refreshMap();
    paintCards();
    setScreen('map');
    J.whoosh(0.4);
    unlockFx = fresh;
    if (fresh >= 0) {
      J.levelUp();
      const c = cardEls[fresh];
      if (c) { wiggle(c.card); demoBurst(); }
    }
  }
  function demoBurst() { if (demo) for (let i = 0; i < 4; i++) burst(demo, demo.cam + 200 + i * 260, -200, ['#ffd23f', '#ffffff', '#ff7eb6', '#4fd1ff'], 22, 380, 300); }
  function wiggle(el) { el.classList.remove('wiggle'); void el.offsetWidth; el.classList.add('wiggle'); setTimeout(() => el.classList.remove('wiggle'), 500); }
  function pickLevel(w, l, el) {
    if (!KR.isOpen(save, w, l)) { J.tap(); wiggle(el); return; }
    J.select(); startLevel(w, l);
  }
  // A click on a world's picture opens its first level without stars (or its first level).
  function openWorld(w) {
    if (!KR.worldOpen(save, w)) { J.tap(); wiggle(cardEls[w].card); return; }
    for (let l = 0; l < KR.LEVELS; l++) if (KR.isOpen(save, w, l) && !save.stars[w][l]) { J.select(); startLevel(w, l); return; }
    J.select(); startLevel(w, 0);
  }
  function openEndless(card) {
    if (!KR.endlessOpen(save)) { J.tap(); wiggle(card); return; }
    J.select(); startEndless();
  }
  function startNext() { const n = KR.nextLevel(save); J.select(); startLevel(n.w, n.l); }

  /* ------------------------------------------------------------- closet */
  const items = [];
  function hasNewItem() { return KR.unlocks(save.seen, KR.total(save)).length > 0; }
  function buildCloset() {
    [['color', KR.COLORS, 'colors'], ['hat', KR.HATS, 'hats']].forEach(([type, list, id]) => {
      list.forEach((it, i) => {
        const b = document.createElement('button'), c = document.createElement('canvas');
        b.type = 'button'; b.className = 'kr-btn item';
        c.width = c.height = 192;
        b.appendChild(c);
        b.insertAdjacentHTML('beforeend', '<svg class="lockic" aria-hidden="true"><use href="#i-lock"/></svg><span class="need"><svg aria-hidden="true"><use href="#i-star"/></svg>' + it.need + '</span>');
        on(b, () => equip(type, i, b));
        $(id).appendChild(b);
        items.push({ type: type, i: i, el: b, c: c });
      });
    });
  }
  function refreshCloset() {
    const total = KR.total(save);
    items.forEach(it => {
      const list = it.type === 'color' ? KR.COLORS : KR.HATS, locked = list[it.i].need > total;
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
    if (save.seen !== KR.total(save)) { save.seen = KR.total(save); persist(); }
    refreshCloset();
    $('closetBack').querySelector('use').setAttribute('href', from === 'title' ? '#i-home' : '#i-map');
    setScreen('closet');
  }
  function closeCloset() { J.back(); if (closetFrom === 'title') toTitle(); else toMap(-1); }
  function equip(type, i, el) {
    const list = type === 'color' ? KR.COLORS : KR.HATS;
    if (list[i].need > KR.total(save)) { J.tap(); wiggle(el); return; }
    if (type === 'color') save.color = i; else save.hat = i;
    persist();
    J.select();
    if (demo) { demo.color = save.color; demo.hat = save.hat; burst(demo, demo.cam + 330, -150, ['#ffd23f', '#ffffff', A.COLOR_OF(save.color)], 26, 320, 240); }
    refreshCloset();
  }

  /* ------------------------------------------------------------- rounds */
  function resetPlay() {
    queue.length = 0; ending = null; result = null; calls.length = 0; intro = null;
    for (const k in flash) delete flash[k];
    gaugeBump = coinBump = heartBump = 0;
    coach.t = 0; coach.next = coachDelay();
    Kit.keys.reset();
  }
  function startLevel(w, l) {
    // Difficulty is read at every level start.
    const tier = ddaLevels.tier, seed = (Math.random() * 2147483647) | 0;
    const plan = KR.plan(w, l, tier, seed);
    mode = 'level'; cur = { w: w, l: l }; lanes = null;
    solo = makeLane(plan, seed, SOLO, save.color, save.hat, w);
    resetPlay();
    firstCoach = !save.coach && w === 0 && l === 0; tutorialHits = 0;
    // Play stats: every level try is a round (w1-1 .. w6-4); the first coached run is the tutorial.
    Kit.stats.round('w' + (w + 1) + '-' + (l + 1));
    if (firstCoach) Kit.stats.tutorial('start');
    // The first run ever is the coached one: the hand shows the key as soon as the runner waits.
    coach.next = coachDelay();
    intro = { t: 0, keys: plan.fresh, w: w, l: l };
    setScreen('play');
    J.whoosh(0.5);
  }
  function startEndless() {
    const tier = ddaEndless.tier, seed = (Math.random() * 2147483647) | 0;
    const plan = KR.endlessPlan(KR.topWorld(save), tier, seed);
    mode = 'endless'; lanes = null;
    solo = makeLane(plan, seed, SOLO, save.color, save.hat, 6);
    resetPlay();
    Kit.stats.round('endless');
    firstCoach = false;
    intro = { t: 0, keys: [], endless: true };
    setScreen('play');
    J.whoosh(0.6);
  }
  function openDuo() {
    J.select();
    mode = 'duo';
    duoScene = (duoScene + 1) % KR.WORLDS.length;
    buildLanes();
    solo = null;
    setScreen('duo');
  }
  function buildLanes() {
    const seed = (Math.random() * 2147483647) | 0;
    lanes = [0, 1].map(side => {
      const L = makeLane(KR.duoPlan(side, seed), seed, LANES[side], P_COLORS[side], 0, duoScene);
      L.side = side;
      return L;
    });
  }
  // Go: the race is the round; a 3-2-1 with both half keyboards on screen comes first.
  function startDuo() {
    if (!lanes || screen === 'play') buildLanes();
    mode = 'duo'; solo = null; winner = -1;
    resetPlay();
    // Two children on one PC: the race is a round with no winner reported.
    Kit.stats.round('duo');
    countdown = 3.6;
    setScreen('play');
    J.countdown(3);
  }
  function restart() {
    J.select();
    if (mode === 'duo') { duoScene = (duoScene + 1) % KR.WORLDS.length; buildLanes(); startDuo(); }
    else if (mode === 'endless') startEndless();
    else startLevel(cur.w, cur.l);
  }
  function pause(own) {
    if (screen !== 'play') return;
    setScreen('pause');
    queue.length = 0;
    if (own) J.back();
  }
  function resume() {
    if (screen !== 'pause') return;
    J.select();
    setScreen('play');
    Kit.keys.reset();
  }
  function quitToMenu() {
    Kit.stats.end('quit');
    J.back();
    if (mode === 'duo') toTitle(); else toMap(-1);
  }

  // A result is saved the moment the flag is reached, before the celebration.
  function finishLevel() {
    const w = solo.w, r = KR.result(w), stars = KR.stars(r), before = KR.total(save);
    const prev = save.stars[cur.w][cur.l], prevBest = save.best[cur.w][cur.l], tenths = Math.max(1, Math.round(r.time * 10));
    const nextWasOpen = cur.w + 1 < KR.WORLD_COUNT && KR.worldOpen(save, cur.w + 1), endlessWas = KR.endlessOpen(save);
    if (stars > prev) save.stars[cur.w][cur.l] = stars;
    if (!prevBest || tenths < prevBest) save.best[cur.w][cur.l] = tenths;
    persist();
    ddaLevels.result(KR.outcome(r));
    Kit.stats.end('win', stars);
    result = { kind: 'level', stars: stars, r: r, newBest: (prevBest > 0 && tenths < prevBest) || (prev > 0 && stars > prev), items: KR.unlocks(before, KR.total(save)),
      newWorld: cur.w + 1 < KR.WORLD_COUNT && !nextWasOpen && KR.worldOpen(save, cur.w + 1) ? cur.w + 1 : -1, newEndless: !endlessWas && KR.endlessOpen(save) };
    ending = { t: 1.7 };
    J.levelUp();
    hideHand();
    celebrate(solo);
  }
  function finishEndless() {
    const w = solo.w, r = KR.result(w), best = save.endless, keys = r.hits, isBest = keys > best;
    if (isBest) { save.endless = keys; persist(); }
    ddaEndless.result(KR.outcome(r));
    Kit.stats.end('end', keys);
    result = { kind: 'endless', keys: keys, best: Math.max(best, keys), isBest: isBest && best > 0, r: r };
    ending = { t: 1.5 };
    J.fail();
    hideHand();
  }
  function finishDuo(win) {
    winner = win;
    Kit.stats.end('end');
    ending = { t: 1.6 };
    J.levelUp();
    if (win >= 0) celebrate(lanes[win]);
  }
  function celebrate(L) {
    if (calm()) return;
    const x = L.w.r.x;
    for (let i = 0; i < 5; i++) burst(L, x - 300 + i * 150, -260 - (i % 2) * 40, ['#ff7eb6', '#ffd23f', '#4fd1ff', '#5be38f', '#ffffff'], 22, 380, 420);
    shake.add(5);
  }
  function showResult() {
    ending = null; resultT = 0; resultLock = 0.6;
    const r = result, level = r.kind === 'level';
    $('resStars').hidden = !level;
    $('resStats').hidden = !level;
    $('resScore').hidden = level;
    $('resNewBest').hidden = true;
    $('resGift').hidden = true;
    $('resStars').querySelectorAll('svg').forEach(s => s.classList.remove('on'));
    if (level) {
      $('resTime').textContent = r.r.time.toFixed(1);
      $('resAcc').textContent = Math.floor(r.r.acc * 100) + '%';
    } else { $('resNum').textContent = String(r.keys); $('resBest').textContent = String(r.best); }
    $('resNext').setAttribute('aria-label', level ? (cur.l < KR.LEVELS - 1 ? 'المرحلة التالية' : 'الخريطة') : 'مرة أخرى');
    $('resAgain').hidden = !level;
    say(level ? starsText(r.stars) : 'المفاتيح ' + r.keys);
    setScreen('result');
  }
  // Stars pop in one by one on the game clock, then the rewards.
  function resultStep(dt) {
    const r = result, before = resultT;
    resultT += dt;
    const at = t => before < t && resultT >= t;
    if (r.kind === 'level') {
      for (let i = 0; i < r.stars; i++) if (at(0.3 + i * 0.38)) { $('resStars').children[i].classList.add('on'); J.star(i + 1); if (solo) burst(solo, solo.cam + 520 + i * 120, -120, ['#ffd23f', '#ffffff'], 16, 300, 300); }
      if (at(0.4 + r.stars * 0.38)) {
        if (r.newBest) { $('resNewBest').hidden = false; J.chime(3); }
        if (r.items.length) { const it = r.items[r.items.length - 1]; A.itemIcon($('giftCanvas'), it, save); $('resGift').hidden = false; J.chime(3); }
        if (r.newWorld >= 0 || r.newEndless) J.levelUp();
      }
    } else if (at(0.35)) {
      if (r.isBest) { $('resNewBest').hidden = false; J.star(3); } else J.star(1);
    }
  }
  function next() {
    if (!result) return;
    J.select();
    if (result.kind === 'endless') startEndless();
    else if (cur.l < KR.LEVELS - 1) startLevel(cur.w, cur.l + 1);
    else toMap(result.newWorld);
  }
  function again() { if (!result) return; J.select(); if (result.kind === 'endless') startEndless(); else startLevel(cur.w, cur.l); }
  function resultToMap() { J.back(); toMap(result && result.kind === 'level' && cur.l === KR.LEVELS - 1 ? result.newWorld : -1); }

  /* --------------------------------------------------------------- input */
  // A mouse click hands the keyboard back to the game; keyboard activation keeps focus.
  // The second click of a double click is dropped (it would land on the next screen).
  function on(el, fn) {
    el.addEventListener('click', e => { e.stopPropagation(); if (e.detail > 1) return; Kit.audio.unlock(); if (e.detail > 0) { el.blur(); focusGame(); } fn(e); });
  }
  on($('btnPlay'), play);
  on($('btnCloset'), () => openCloset('title'));
  on($('btnDuo'), openDuo);
  on($('mapHome'), () => { J.back(); toTitle(); });
  on($('mapCloset'), () => openCloset('map'));
  on($('btnPause'), () => pause(true));
  on($('btnResume'), resume);
  on($('btnRestart'), restart);
  on($('btnMenu'), quitToMenu);
  on($('resNext'), () => { if (resultLock <= 0) next(); });
  on($('resAgain'), () => { if (resultLock <= 0) again(); });
  on($('resMap'), () => { if (resultLock <= 0) resultToMap(); });
  on($('resGift'), () => openCloset('map'));
  on($('closetBack'), closeCloset);
  on($('duoGo'), () => { J.select(); startDuo(); });
  on($('duoBack'), () => { J.back(); toTitle(); });
  on($('duoAgain'), () => { if (resultLock <= 0) restart(); });
  on($('duoMenu'), () => { if (resultLock <= 0) { J.back(); toTitle(); } });
  canvas.addEventListener('pointerdown', () => { focusGame(); menuIdle = 0; });
  window.addEventListener('pointermove', () => { menuIdle = 0; });
  // Typing keys are taken in the order they were pressed: key repeats, Ctrl/Alt shortcuts
  // and keys on focused buttons never type.
  window.addEventListener('keydown', e => {
    if (!Kit.isGameKeyEvent(e)) return;
    menuIdle = 0;
    if (screen !== 'play') return;
    const code = KR.norm(e.code);
    if (!KR.isGameKey(code)) return;
    e.preventDefault();
    if (!e.repeat && queue.length < 24) queue.push(code);
  });
  function handleKeys() {
    const K = Kit.keys, go = K.anyPressed(['Enter', 'NumpadEnter', 'Space']);
    if (screen === 'title') { if (go) play(); }
    else if (screen === 'map') { if (go) startNext(); else if (K.pressed('Escape')) { J.back(); toTitle(); } }
    else if (screen === 'closet') { if (go || K.pressed('Escape')) closeCloset(); }
    else if (screen === 'duo') { if (go) { J.select(); startDuo(); } else if (K.pressed('Escape')) { J.back(); toTitle(); } }
    else if (screen === 'play') { if (K.pressed('Escape')) pause(true); }
    else if (screen === 'pause') { if (K.anyPressed(['Escape', 'Enter', 'NumpadEnter', 'Space'])) resume(); else if (K.pressed('KeyR')) restart(); }
    else if (screen === 'result' && resultLock <= 0) {
      if (go) next(); else if (K.pressed('KeyR')) again();
      else if (K.pressed('Escape')) resultToMap();
    } else if (screen === 'duoEnd' && resultLock <= 0) {
      if (go || K.pressed('KeyR')) restart(); else if (K.pressed('Escape')) { J.back(); toTitle(); }
    }
  }
  // The child's keys, in order, for this step.
  function typeKeys() {
    if (!queue.length) return;
    const keys = queue.splice(0, queue.length);
    if (ending) return;
    if (mode === 'duo') {
      if (countdown > 0) return;
      for (const code of keys) {
        const side = KR.sideOf(code);
        if (side < 0) continue;
        const L = lanes[side];
        if (KR.press(L.w, code) === 'ignore') flash[code] = ['down', 0.2];
      }
      return;
    }
    for (const code of keys) {
      if (KR.press(solo.w, code) === 'ignore') flash[code] = ['down', 0.2];
    }
  }

  /* ----------------------------------------------------- the ghost hand */
  // A wordless coach: a hand that comes up from the bottom and presses the key to type.
  const ghost = { on: false, get: null, t: 0, dur: 0, x: 0, y: 0, sx: 0, sy: 0, press: 0 };
  function showHand(get, dur) {
    const p = get();
    if (!p) return false;
    ghost.on = true; ghost.get = get; ghost.t = 0; ghost.dur = dur || 2.6;
    ghost.sx = p.x + 120; ghost.sy = Math.min(H + 60, p.y + 220); ghost.x = ghost.sx; ghost.y = ghost.sy;
    ghostEl.hidden = false;
    placeGhost();
    return true;
  }
  function hideHand() { ghost.on = false; ghostEl.hidden = true; }
  function ghostStep(dt) {
    if (!ghost.on) return;
    ghost.t += dt;
    const p = ghost.get();
    if (!p || ghost.t > ghost.dur) { hideHand(); return; }
    const k = calm() ? 1 : Math.min(1, ghost.t / 0.6), e = 1 - Math.pow(1 - k, 3);
    ghost.x = ghost.sx + (p.x - ghost.sx) * e; ghost.y = ghost.sy + (p.y - ghost.sy) * e;
    ghost.press = k >= 1 && !calm() ? Math.max(0, Math.sin((ghost.t - 0.6) * 9)) : 0;
    placeGhost();
  }
  function placeGhost() {
    ghostEl.style.transform = 'translate(' + (ghost.x - 40).toFixed(1) + 'px,' + (ghost.y - 6 + ghost.press * 10).toFixed(1) + 'px) scale(' + (1 - ghost.press * 0.06).toFixed(3) + ')';
    ghostEl.style.opacity = Math.min(1, ghost.t * 4).toFixed(2);
  }
  function targetKeyPoint() {
    const t = solo && KR.target(solo.w);
    return t ? A.keyCenter(t.code, KB.x, KB.y, KB.u, '') : null;
  }
  function coachDelay() {
    if (firstCoach) return 0.9;
    const tier = solo ? solo.w.plan.tier : 3;
    return tier <= 2 ? 3 : 5;
  }
  // While the runner waits, the hand shows the key after a few seconds, then every 6 s.
  function coachStep(dt) {
    const w = solo.w;
    if (ending || w.r.phase !== 'wait') { coach.t = 0; coach.next = coachDelay(); return; }
    coach.t += dt;
    if (ghost.on || coach.t < coach.next) return;
    coach.next = coach.t + (showHand(targetKeyPoint, 2.8) ? 6 : 0.5);
  }
  function centerOf(el) {
    const r = el.getBoundingClientRect();
    return r.width ? view.toLogical(r.left + r.width / 2, r.top + r.height / 2) : null;
  }
  // The menus get the hand too: Play on the title, the next level on the map, and so on.
  function menuDemo() {
    let el = null;
    if (screen === 'title') el = $('btnPlay');
    else if (screen === 'map') el = document.querySelector('.lvl.next') || null;
    else if (screen === 'result' && resultT > 1.5) el = $('resNext');
    else if (screen === 'duo') el = $('duoGo');
    else if (screen === 'duoEnd') el = $('duoAgain');
    if (el) showHand(() => centerOf(el), 2.4);
  }

  /* --------------------------------------------------------------- loop */
  function decay(dt) {
    for (const k in flash) { flash[k][1] -= dt; if (flash[k][1] <= 0) delete flash[k]; }
    gaugeBump += (0 - gaugeBump) * Math.min(1, dt * 6);
    coinBump = Math.max(0, coinBump - dt * 3); heartBump = Math.max(0, heartBump - dt * 2);
    for (let i = calls.length - 1; i >= 0; i--) { calls[i].t += dt; if (calls[i].t > 1.3) calls.splice(i, 1); }
  }
  function soloStep(dt) {
    typeKeys();
    if (ending) {
      ending.t -= dt;
      animLane(solo, dt);
      if (ending.t <= 0) showResult();
      return;
    }
    laneStep(solo, dt, 'solo', false);
    if (screen === 'play' && !ending) coachStep(dt);
    if (intro) { intro.t += dt; if (intro.t > 2.2) intro = null; }
  }
  function duoStep(dt) {
    if (countdown > 0) {
      const was = Math.ceil(countdown - 0.6);
      countdown -= dt;
      const now = Math.ceil(countdown - 0.6);
      queue.length = 0;
      if (now !== was && now >= 0) J.countdown(now);
      if (countdown <= 0) { countdown = 0; call('انطلق!', '#5be38f'); }
      lanes.forEach(L => animLane(L, dt));
      return;
    }
    typeKeys();
    if (ending) {
      ending.t -= dt;
      lanes.forEach(L => animLane(L, dt));
      if (ending.t <= 0) { ending = null; resultLock = 0.6; $('duoWinner').textContent = winner < 0 ? 'تعادل!' : 'فاز اللاعب ' + (winner + 1) + '!'; say($('duoWinner').textContent); setScreen('duoEnd'); }
      return;
    }
    lanes.forEach(L => laneStep(L, dt, 'duo', false));
    const done = lanes.map(L => L.w.done);
    if (done[0] || done[1]) finishDuo(done[0] && done[1] ? -1 : done[0] ? 0 : 1);
  }
  function demoStep(dt) {
    if (!demo) return;
    const w = demo.w, t = KR.target(w);
    demo.demoT += dt;
    if (t && demo.demoT > 0.32) { KR.press(w, t.code); demo.demoT = 0; }
    laneStep(demo, dt, '', true);
    if (w.done) newDemo();
  }
  function update(dt) {
    time += dt;
    handleKeys();
    if (screen === 'play') {
      if (mode === 'duo') duoStep(dt); else if (solo) soloStep(dt);
    } else {
      queue.length = 0;
      if (screen === 'title') demoStep(dt);
      if (screen === 'duo' && lanes) lanes.forEach(L => animLane(L, dt));
      if (screen === 'duoEnd' && lanes) lanes.forEach(L => animLane(L, dt));
      if (screen === 'result') { resultStep(dt); if (solo) animLane(solo, dt); }
      if (resultLock > 0) resultLock -= dt;
      if (screen !== 'pause' && screen !== 'closet') {
        menuIdle += dt;
        if (!ghost.on && menuIdle >= menuNext) { menuNext = menuIdle + 6; menuDemo(); }
      }
    }
    if (screen !== 'pause') { ghostStep(dt); shake.update(dt); decay(dt); }
    Kit.keys.endFrame();
  }

  /* -------------------------------------------------------------- render */
  function pulse() { return calm() ? 1 : 0.5 + 0.5 * Math.sin(time * 8); }
  function geoOf(L) { return { h: L.geo.h, base: L.geo.base, ps: pixelScale() }; }
  // One lane of the world: sky, hills, posts, water, keycap stones, coins, the runner, effects.
  function drawLane(ctx, L, o) {
    o = o || {};
    const g = L.geo, w = L.w, still = calm(), cam = L.cam, base = g.base, si = L.scene, geo = geoOf(L), mode = save.label;
    ctx.save();
    ctx.translate(0, g.y);
    if (g.clip) { ctx.beginPath(); ctx.rect(0, 0, W, g.h); ctx.clip(); }
    A.backdrop(ctx, si, geo, cam, time, still);
    // Speed lines behind everything in front of the sky.
    const k = w.steps / Math.max(1, w.tune.maxSteps);
    if (!still && k > 0.12 && !w.done) {
      ctx.globalAlpha = Math.min(0.75, k);
      ctx.fillStyle = '#ffffff';
      for (const ln of L.lines) ctx.fillRect(ln.x, ln.y, ln.len * (0.6 + k), 4);
      ctx.globalAlpha = 1;
    }
    let first = -1, last = -1;
    for (let i = 0; i < w.stones.length; i++) { const s = w.stones[i]; if (s.x1 - cam < -90 || s.x0 - cam > W + 90) continue; if (first < 0) first = i; last = i; }
    for (let i = first; i >= 0 && i <= last; i++) {
      const s = w.stones[i], sx = s.x0 - cam, sy = base + s.y, wd = s.x1 - s.x0;
      if (wd > 300) { for (let p = 60; p < wd - 40; p += 160) A.post(ctx, si, sx + p - 60, sy, 120, base + 140); }
      else A.post(ctx, si, sx, sy, wd, base + 140);
    }
    A.water(ctx, si, geo, cam, time, still, o.floor);
    const pl = pulse();
    for (let i = first; i >= 0 && i <= last; i++) {
      const s = w.stones[i], sx = s.x0 - cam, sy = base + s.y, wd = s.x1 - s.x0;
      if (!KR.isKeyStone(s)) {
        A.stone(ctx, si, s, sx, sy, { state: 'idle', hidden: true, plain: true });
        if (s.kind === 'finish') A.flag(ctx, s.flag - cam, sy, time, still);
        continue;
      }
      const f = L.fxs.get(s);
      let state = 'idle', hidden = false, dim = false;
      if (i <= w.on) dim = true;
      else if (s.typed) state = 'typed';
      else if (i === w.next && KR.visible(w, i) && !w.done) state = 'target';
      else if (!KR.visible(w, i)) hidden = true;
      if (f && f.miss > 0 && state === 'target') state = 'miss';
      if (state === 'target' || state === 'miss') A.glow(ctx, sx + wd / 2, sy + 44, wd * 0.95 + 30, 100, '#ffe14d', (w.r.phase === 'wait' ? 0.75 : 0.45) + 0.35 * pl);
      const dip = (f ? f.dip * 12 : 0) + (state === 'typed' ? 6 : 0);
      const shk = f && f.shake > 0 && !still ? Math.sin(f.shake * 38) * f.shake * 11 : 0;
      A.stone(ctx, si, s, sx, sy, { state: state, hidden: hidden, dim: dim, mode: mode, dip: dip, shake: shk });
      if (s.kind === 'slide') A.bar(ctx, sx, sy, time);
      if (state === 'target' && !o.noPointer) A.pointer(ctx, sx + wd / 2, sy - (s.kind === 'slide' ? 64 : 4), time, still);
      if (s.coin && !s.coin.got) A.coin(ctx, s.coin.x - cam, base + s.coin.y + (still ? 0 : Math.sin(time * 3 + i) * 4), 15, time + i, still);
    }
    drawWords(ctx, L, first, last);
    // The runner, its trail and its effects.
    const r = w.r, rx = r.x - cam, ry = base + r.y;
    if (!still && k > 0.3) {
      for (let i = 2; i < L.trail.length; i += 2) {
        const p = L.trail[i];
        ctx.globalAlpha = 0.28 * (1 - i / L.trail.length) * k;
        A.circle(ctx, p.x - cam, base + p.y - 38, 26); ctx.fillStyle = A.COLOR_OF(L.color); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    A.runner(ctx, rx, ry, runnerLook(L));
    if (r.phase === 'wait' && !w.done && !o.noBubble) waitBubble(ctx, L, rx, ry);
    ctx.save(); ctx.translate(-cam, base);
    L.fx.draw(ctx);
    for (const f of L.floats) {
      ctx.globalAlpha = Math.max(0, 1 - Math.max(0, f.t - 0.6) / 0.5);
      A.text(ctx, f.text, f.x, f.y, f.size, f.color, { stroke: 7 });
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    ctx.restore();
  }
  function runnerLook(L) {
    const w = L.w, r = w.r, t = KR.target(w);
    let pose = r.phase === 'run' ? 'run' : r.phase === 'wait' ? 'wait' : r.phase === 'act' ? (r.act.kind === 'slide' ? 'slide' : 'hop') : 'idle';
    if (w.done) pose = w.over ? 'sad' : 'cheer';
    if (w.r.vel < 4 && pose === 'run') pose = 'idle';
    const look = t ? { x: Math.max(-1, Math.min(1, (t.x0 - r.x) / 160)), y: 0.6 } : { x: 1, y: 0 };
    return { color: L.color, hat: L.hat, pose: pose, t: time, run: L.run, squash: L.sq, speed: Math.min(1, w.steps / Math.max(1, w.tune.maxSteps)),
      still: calm(), long: r.waitT > 2.5, look: look, ground: r.phase !== 'act' };
  }
  // A thought bubble over a waiting runner with the key it needs.
  function waitBubble(ctx, L, x, y) {
    const t = KR.target(L.w);
    if (!t || L.w.r.waitT < 0.35) return;
    const bx = x + 44, by = y - 132, k = Math.min(1, (L.w.r.waitT - 0.35) * 5);
    ctx.save(); ctx.translate(bx, by); ctx.scale(k, k);
    A.circle(ctx, -30, 56, 7); ctx.fillStyle = '#fff'; ctx.fill(); A.ink(ctx, 3.5);
    A.circle(ctx, -18, 40, 10); ctx.fillStyle = '#fff'; ctx.fill(); A.ink(ctx, 3.5);
    A.rr(ctx, -10, -34, 92, 66, 22); ctx.fillStyle = '#fff'; ctx.fill(); A.ink(ctx, 4.5);
    const key = KR.KEY[t.code], wide = t.code === 'Space';
    A.rr(ctx, wide ? -4 : 10, -26, wide ? 80 : 52, 50, 10); ctx.fillStyle = '#ffe14d'; ctx.fill(); A.ink(ctx, 3.5);
    A.legends(ctx, key, wide ? -2 : 13, -24, wide ? 76 : 46, 44, 1, save.label, A.INK, false);
    ctx.restore();
  }
  // Words of the last level float above their stones with a dot per letter (right to left).
  function drawWords(ctx, L, first, last) {
    const w = L.w, words = w.plan.words;
    if (!words || !words.length || first < 0) return;
    const seen = new Set();
    for (let i = first; i <= last; i++) {
      const s = w.stones[i];
      if (!s || !(s.word >= 0) || seen.has(s.word) || !KR.visible(w, i)) continue;
      seen.add(s.word);
      const word = words[s.word], a = w.stones[word.start + 1], b = w.stones[word.start + word.len];
      if (!a || !b) continue;
      const cx = (a.x0 + b.x1) / 2 - L.cam, y = L.geo.base + Math.min(a.y, b.y) - 150, n = word.len;
      let typed = 0;
      for (let j = 0; j < n; j++) if (w.stones[word.start + 1 + j].typed) typed++;
      const wpx = Math.max(150, n * 46);
      A.rr(ctx, cx - wpx / 2, y - 40, wpx, 86, 26); ctx.fillStyle = typed === n ? '#d8ffe6' : '#ffffff'; ctx.fill(); A.ink(ctx, 5);
      A.text(ctx, word.text, cx, y - 2, 46, A.INK);
      for (let j = 0; j < n; j++) {
        A.circle(ctx, cx + (n - 1) * 11 - j * 22, y + 32, 6);
        ctx.fillStyle = j < typed ? '#3ddc84' : '#d8dcef'; ctx.fill(); A.ink(ctx, 2.5);
      }
    }
  }
  function keyboardFor(L) {
    const t = L && KR.target(L.w);
    return { mode: save.label, zone: levelKeys(), target: t ? t.code : '', pulse: pulse(), down: code => Kit.keys.down(code), flash: flash, ps: pixelScale() };
  }
  function levelKeys() {
    if (mode === 'endless' && solo) return solo.w.plan.pool;
    if (mode === 'level') { const lv = KR.WORLDS[cur.w].levels[cur.l]; return lv.k; }
    return [];
  }
  function drawHud(ctx) {
    const w = solo.w, still = calm();
    if (mode === 'level') {
      // The world's number and four level dots, then the way to the flag.
      A.circle(ctx, 128, 46, 26); ctx.fillStyle = A.SCENES[cur.w].glow; ctx.fill(); A.ink(ctx, 5);
      A.text(ctx, String(cur.w + 1), 128, 48, 32, '#ffffff', { stroke: 6 });
      // Level dots read right to left, like the level buttons on the map.
      for (let l = 0; l < KR.LEVELS; l++) { A.circle(ctx, 172 + (KR.LEVELS - 1 - l) * 24, 46, 9); ctx.fillStyle = l === cur.l ? '#ffd23f' : l < cur.l ? '#ffffff' : 'rgba(255,255,255,0.35)'; ctx.fill(); A.ink(ctx, 3.5); }
      A.progress(ctx, 290, 46, 560, KR.progress(w), A.COLOR_OF(save.color));
    } else {
      for (let i = 0; i < 3; i++) A.heart(ctx, 128 + i * 52, 46, 1.25 + (i === w.hearts && heartBump > 0 ? heartBump * 0.4 : 0), i < w.hearts);
      A.rr(ctx, 520, 14, 240, 64, 32); ctx.fillStyle = 'rgba(28,34,80,0.75)'; ctx.fill(); A.ink(ctx, 4, '#ffffff');
      A.text(ctx, String(w.hits), 640, 48, 44, '#ffffff', { stroke: 6 });
      if (save.endless) { A.text(ctx, '★ ' + save.endless, 830, 48, 28, '#ffd23f', { stroke: 6 }); }
    }
    A.coin(ctx, 920, 46, 18, time, true);
    A.text(ctx, String(w.coins), 948, 48, 32, '#ffffff', { stroke: 6, align: 'left' });
    A.gauge(ctx, 1146, 96, 56, w.steps, w.tune.maxSteps, gaugeBump, time, still);
    if (w.combo >= 3) {
      A.rr(ctx, 1096, 164, 100, 42, 21); ctx.fillStyle = '#ff5d6c'; ctx.fill(); A.ink(ctx, 4);
      A.text(ctx, '×' + w.combo, 1146, 186, 28, '#ffffff', { stroke: 5 });
    }
  }
  function drawCalls(ctx, y) {
    for (const c of calls) {
      if (!c.text) continue;
      const k = Math.min(1, c.t / 0.18), s = calm() ? 1 : 0.6 + 0.4 * k + (k >= 1 ? 0 : 0.2);
      ctx.save(); ctx.globalAlpha = Math.max(0, 1 - Math.max(0, c.t - 0.9) / 0.4);
      ctx.translate(640, (c.y == null ? y : c.y) - Math.min(30, c.t * 30)); ctx.scale(s, s);
      A.text(ctx, c.text, 0, 0, c.y == null ? 76 : 60, c.color || '#ffd23f', { stroke: 12 });
      ctx.restore();
    }
  }
  // At a level's start: the new keys of the lesson, big, as they look on the keyboard.
  function drawIntro(ctx) {
    if (!intro || !intro.keys || !intro.keys.length) return;
    const t = intro.t, a = Math.min(1, t * 4, (2.2 - t) * 3), n = intro.keys.length, size = 112, gap = 26;
    const total = n * size + (n - 1) * gap + (intro.keys.indexOf('Space') >= 0 ? 120 : 0), x0 = 640 - total / 2, y = 100;
    ctx.save(); ctx.globalAlpha = Math.max(0, a);
    A.rr(ctx, x0 - 34, y - 26, total + 68, size + 60, 34); ctx.fillStyle = 'rgba(28,34,80,0.82)'; ctx.fill(); A.ink(ctx, 5, '#ffffff');
    let x = x0;
    intro.keys.forEach((code, i) => {
      const wd = code === 'Space' ? size + 120 : size, bob = calm() ? 0 : Math.sin(t * 6 + i) * 5;
      A.glow(ctx, x + wd / 2, y + size / 2 + bob, wd, size, '#ffe14d', 0.6);
      A.rr(ctx, x, y + bob, wd, size, 22); ctx.fillStyle = '#d99a00'; ctx.fill(); A.ink(ctx, 5);
      A.rr(ctx, x + 7, y + 5 + bob, wd - 14, size - 22, 18); ctx.fillStyle = '#ffe14d'; ctx.fill();
      A.legends(ctx, KR.KEY[code], x + 8, y + 6 + bob, wd - 16, size - 24, 1, save.label, A.INK, false);
      x += wd + gap;
    });
    ctx.restore();
  }
  const DECK_TOP = KB.y - Math.round(KB.u * 0.32) - 8;
  function drawPlay(ctx) {
    drawLane(ctx, solo, { floor: DECK_TOP });
    const k = keyboardFor(screen === 'play' || screen === 'pause' ? solo : null);
    A.deck(ctx, KB.x, KB.y, KB.u, DECK_TOP, A.deepOf(solo.scene, geoOf(solo)), k.mode, k.zone, k.ps);
    k.panel = false; k.base = false;
    A.keyboard(ctx, KB.x, KB.y, KB.u, k);
    drawHud(ctx);
    drawIntro(ctx);
    drawCalls(ctx, 210);
  }
  function drawDuo(ctx) {
    const still = calm();
    lanes.forEach((L, side) => {
      drawLane(ctx, L, { noBubble: false });
      const y = L.geo.y, w = L.w;
      // The player's badge, the way to the flag and the speed.
      A.circle(ctx, 130, y + 40, 28); ctx.fillStyle = A.COLOR_OF(L.color); ctx.fill(); A.ink(ctx, 5);
      A.text(ctx, String(side + 1), 130, y + 42, 34, '#ffffff', { stroke: 6 });
      A.progress(ctx, 180, y + 40, 860, KR.progress(w), A.COLOR_OF(L.color));
      A.gauge(ctx, 1170, y + 64, 40, w.steps, w.tune.maxSteps, 0, time, still);
      // This player's half of the keyboard, always on, its next key glowing.
      const t = KR.target(w), sz = A.kbSize(HALF_U, side ? 'R' : 'L');
      A.keyboard(ctx, 26, y + L.geo.h - sz.h - 18, HALF_U, { mode: save.label, zone: side ? KR.RIGHT : KR.LEFT, target: t && !ending ? t.code : '',
        pulse: pulse(), down: code => Kit.keys.down(code), flash: flash, half: side ? 'R' : 'L', ps: pixelScale() });
    });
    ctx.fillStyle = '#1c2250'; ctx.fillRect(0, 356, W, 8);
    if (countdown > 0) {
      const n = Math.ceil(countdown - 0.6);
      ctx.fillStyle = 'rgba(28,34,80,0.25)'; ctx.fillRect(0, 0, W, H);
      A.text(ctx, n > 0 ? String(n) : '!', 640, 360, 190, '#ffd23f', { stroke: 18 });
    }
    drawCalls(ctx, 360);
  }
  function drawDuoIntro(ctx) {
    drawDuo(ctx);
    // Who types where: a big badge on each lane.
    lanes.forEach((L, side) => {
      const y = L.geo.y + 112, x = 930;
      A.rr(ctx, x - 110, y - 40, 220, 80, 30); ctx.fillStyle = A.COLOR_OF(L.color); ctx.fill(); A.ink(ctx, 5);
      A.text(ctx, 'اللاعب ' + (side + 1), x, y + 2, 40, '#ffffff', { stroke: 7 });
    });
  }
  function drawPodium(ctx) {
    const still = calm();
    A.backdrop(ctx, lanes[0].scene, { h: 720, base: 470, ps: pixelScale() }, time * 30, time, still);
    A.water(ctx, lanes[0].scene, { h: 720, base: 470, ps: pixelScale() }, time * 30, time, still);
    const blocks = [{ x: 470, h: winner === 0 ? 150 : winner < 0 ? 110 : 70 }, { x: 810, h: winner === 1 ? 150 : winner < 0 ? 110 : 70 }];
    blocks.forEach((b, side) => {
      const top = 690 - b.h;
      A.rr(ctx, b.x - 110, top, 220, b.h + 140, 22); ctx.fillStyle = side === winner ? '#ffd23f' : '#ffffff'; ctx.fill(); A.ink(ctx, 6);
      A.text(ctx, String(side + 1), b.x, top + 50, 58, A.INK);
      A.runner(ctx, b.x, top, { color: P_COLORS[side], hat: side === winner ? 5 : 0, pose: side === winner || winner < 0 ? 'cheer' : 'idle', t: time + side, still: still, scale: 1.6 });
    });
    for (const L of lanes) { ctx.save(); ctx.translate(-L.cam, L.geo.base); L.fx.draw(ctx); ctx.restore(); }
  }
  function drawTitleScene(ctx) { if (demo) drawLane(ctx, demo, { noPointer: false, noBubble: true }); }
  // The map and the closet: the meadow drifting by, without the attract run.
  function drawMenuBg(ctx) {
    const geo = { h: 720, base: TITLE.base, ps: pixelScale() }, cam = calm() ? 0 : time * 24;
    A.backdrop(ctx, 0, geo, cam, time, calm());
    A.water(ctx, 0, geo, cam, time, calm());
  }
  // The result: the runner cheers big on the left, the card stands on the right.
  function drawResultScene(ctx) {
    drawLane(ctx, solo, { noBubble: true, noPointer: true });
    ctx.fillStyle = 'rgba(28,34,80,0.3)'; ctx.fillRect(0, 0, W, H);
    const lost = result && result.kind === 'endless';
    A.glow(ctx, 250, 470, 230, 200, '#ffe14d', lost ? 0.3 : 0.7);
    A.runner(ctx, 250, 610, { color: save.color, hat: save.hat, pose: lost ? 'idle' : 'cheer', t: time, still: calm(), scale: 3 });
  }
  function drawCloset(ctx) {
    drawMenuBg(ctx);
    ctx.fillStyle = 'rgba(28,34,80,0.25)'; ctx.fillRect(0, 0, W, H);
    A.runner(ctx, 300, 560, { color: save.color, hat: save.hat, pose: 'idle', t: time, still: calm(), scale: 3.4 });
  }
  function render() {
    if ((screen === 'pause') && !dirty) return;
    dirty = false;
    const ctx = view.ctx;
    ctx.save();
    ctx.translate(shake.x, shake.y);
    if (screen === 'title') drawTitleScene(ctx);
    else if (screen === 'map') drawMenuBg(ctx);
    else if (screen === 'closet') drawCloset(ctx);
    else if (screen === 'result' && solo) drawResultScene(ctx);
    else if (screen === 'duo') drawDuoIntro(ctx);
    else if (screen === 'duoEnd') drawPodium(ctx);
    else if (mode === 'duo' && lanes) drawDuo(ctx);
    else if (solo) drawPlay(ctx);
    if (screen === 'map') { ctx.fillStyle = 'rgba(28,34,80,0.2)'; ctx.fillRect(0, 0, W, H); }
    ctx.restore();
  }

  canvas.addEventListener('contextrestored', () => { A.reset(); dirty = true; paintCards(true); if (screen === 'closet') refreshCloset(); });
  if (document.fonts && document.fonts.load) {
    Promise.all([document.fonts.load('700 40px Fredoka', 'ب'), document.fonts.load('700 40px Fredoka', 'F'), document.fonts.load('500 20px Fredoka', 'Tab ب')])
      .then(() => { A.reset(); dirty = true; painted = ''; if (screen === 'map') paintCards(); if (screen === 'closet') refreshCloset(); }, () => { /* fallback fonts */ });
  }

  /* --------------------------------------------------- test and debug hook */
  const page = (x, y) => { const r = canvas.getBoundingClientRect(); return { x: r.left + x * view.scale, y: r.top + y * view.scale }; };
  function laneState(L) {
    const w = L.w, t = KR.target(w);
    return { target: t ? t.code : '', next: w.next + w.offset, on: w.on + w.offset, x: Math.round(w.r.x * 10) / 10, y: Math.round(w.r.y * 10) / 10,
      phase: w.r.phase, steps: w.steps, speed: Math.round(w.r.vel), hits: w.hits, misses: w.misses, stops: w.stops, combo: w.combo,
      coins: w.coins, time: Math.round(w.t * 1000) / 1000, done: w.done, hearts: w.hearts, ahead: w.tune.ahead };
  }
  window.__game = {
    get state() {
      const s = solo && mode !== 'duo' ? laneState(solo) : { target: '', next: 0, on: 0, x: 0, y: 0, phase: '', steps: 0, speed: 0, hits: 0, misses: 0, stops: 0, combo: 0, coins: 0, time: 0, done: false, hearts: 0, ahead: 0 };
      return Object.assign(s, {
        screen: screen, mode: mode, paused: screen === 'pause', world: cur.w, level: cur.l, tier: solo && mode !== 'duo' ? solo.w.plan.tier : 0,
        id: solo && mode !== 'duo' ? solo.w.plan.id : mode === 'duo' ? 'duo' : '', keys: solo && solo.w.plan.keys ? solo.w.plan.keys.slice() : [],
        ending: !!ending, stars: result && result.kind === 'level' ? result.stars : 0, endlessKeys: result && result.kind === 'endless' ? result.keys : 0,
        label: save.label, ghost: ghost.on, countdown: Math.round(countdown * 100) / 100, winner: winner,
        lanes: lanes ? lanes.map(laneState) : []
      });
    },
    get save() { return JSON.parse(JSON.stringify(save)); },
    // Where a logical point or an on-screen key is on the page, for tests that use the real mouse.
    point: page,
    keyPoint: code => { const p = A.keyCenter(code, KB.x, KB.y, KB.u, ''); return p ? page(p.x, p.y) : null; }
  };

  buildMap();
  buildCloset();
  Kit.muteButton({ key: false });
  Kit.lifecycle({ pause: () => pause(false), reset: () => { queue.length = 0; } });
  toTitle();
  Kit.loop(update, render);
  Kit.ready();
})();
