/* Chaos Island (جزيرة الفوضى): screens, keyboard, the coach, saves, sound and play
 * statistics. engine.js simulates the islands; art.js draws them.
 * This is the UI layer: it reads Kit.dda at every match start and reports Kit.stats
 * rounds and Kit.track hits, misses and cues. */
(function () {
  'use strict';
  const CI = window.CI, A = CI.art, J = Kit.juice, W = CI.W, H = CI.H, G = CI.GROUND;
  const $ = id => document.getElementById(id);
  const canvas = $('game'), ui = $('ui'), handEl = $('hand'), cardEl = $('card'), cardPic = $('cardPic');
  const calm = () => Kit.motion.reduced();
  let dirty = true;
  const view = Kit.fit(canvas, W, H, { maxDpr: 1.5, onResize: v => {
    ui.style.left = canvas.style.left; ui.style.top = canvas.style.top; ui.style.transform = 'scale(' + v.scale + ')'; dirty = true;
  } });
  const shake = Kit.shake();
  const pixelScale = () => Math.min(2, Math.max(0.5, Math.round(view.scale * view.dpr * 4) / 4));

  /* ---------------------------------------------------------------- save */
  const store = Kit.store('chaos-island');
  const saveStatus = Kit.saveStatus({ retry: persist });
  let save = CI.loadSave(store.get('save', null));
  function persist() {
    if (store.set('save', save) === false) { saveStatus.failed(); return false; }
    saveStatus.saved();
    return true;
  }
  // One difficulty controller for a child alone, one for two children together.
  const ddaSolo = Kit.dda('chaos-island', { id: 'match' });
  const ddaDuo = Kit.dda('chaos-island', { id: 'duo' });

  /* --------------------------------------------------------------- words */
  const DIS_NAME = { flood: 'فيضان الجيلي', meteors: 'نيازك المارشملو', wind: 'الريح', ice: 'الأرض الجليدية', quake: 'الزلزال', clouds: 'غيوم البرق', balls: 'كرات الشاطئ', tornado: 'الإعصار الصغير' };
  const DIS_TIP = { flood: 'اصعد إلى مكان عالٍ!', meteors: 'ابتعد عن الظل!', wind: 'امشِ عكس الريح أو ادخل البيت!', ice: 'اقفز فوق كرات الثلج!', quake: 'ابتعد عن الشقوق!', clouds: 'اخرج من الضوء!', balls: 'ابتعد عن ظل الكرة!', tornado: 'ادخل البيت!' };
  const ISLE_NAME = ['جزيرة الشاطئ', 'جزيرة الثلج', 'جزيرة الحلوى', 'الجزيرة الطائرة'];
  const BOT_NAMES = ['فلفل', 'مشمش', 'بندق', 'فستق', 'ليمونة', 'كعكة', 'زعتر'];
  const PRAISE = ['رائع!', 'ممتاز!', 'مذهل!'];

  /* --------------------------------------------------------------- state */
  let screen = 'title', world = null, demo = null, duo = false, time = 0, matches = 0, ending = 0, result = null, resultT = 0, resultLock = 0;
  let isle = save.island, names = [], tutorial = false, cardT = 0, cardKinds = [], cardHide = 0, busyT = 0, lastCue = -9, streak = 0;
  let shownCoins = [0, 0], doorHintT = 0, goT = 0, keysShowT = 0;
  const coach = { mind: CI.mind(0, 0, 77), idle: 0, on: false, inp: null };
  const parts = [], floats = [], debris = [], flyers = [];
  let menuIdle = 0, menuNext = 4;

  /* ------------------------------------------------------------ screens */
  const SCREENS = { title: 'scrTitle', wardrobe: 'scrWardrobe', pause: 'scrPause', result: 'scrResult' };
  function setScreen(name) {
    screen = name;
    for (const k in SCREENS) $(SCREENS[k]).hidden = k !== name;
    $('hud').hidden = name !== 'play';
    if (name !== 'play' && name !== 'pause') cardEl.hidden = true;
    stopHand();
    menuIdle = 0; menuNext = 4;
    dirty = true;
    if (name === 'play') focusGame();
  }
  function focusGame() { try { canvas.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  function say(text) { $('live').textContent = text; }
  function setCoins(id, n) { $(id).querySelector('b').textContent = String(n); }

  /* --------------------------------------------------------------- title */
  const isleBtns = [];
  function buildIsles() {
    CI.ISLANDS.forEach((isl, i) => {
      const b = document.createElement('button'), c = document.createElement('canvas');
      b.type = 'button'; b.className = 'isle'; b.dataset.i = String(i);
      c.width = 244; c.height = 140;
      b.appendChild(c);
      b.insertAdjacentHTML('beforeend', '<span class="st" aria-hidden="true">' + '<svg><use href="#i-star"/></svg>'.repeat(3) + '</span><svg class="lockic" aria-hidden="true"><use href="#i-lock"/></svg>');
      on(b, () => pickIsle(i, true));
      $('isles').appendChild(b); isleBtns.push({ el: b, c: c });
      A.isleIcon(c, isl);
    });
  }
  function refreshIsles() {
    isleBtns.forEach((b, i) => {
      const open = CI.isOpen(save, i), stars = save.stars[i];
      b.el.classList.toggle('locked', !open);
      b.el.classList.toggle('on', i === isle);
      b.el.querySelectorAll('.st svg').forEach((s, k) => s.classList.toggle('on', k < stars));
      b.el.setAttribute('aria-label', ISLE_NAME[i] + (open ? (stars ? '، ' + starsText(stars) : '') : ' (مقفلة)'));
    });
    setCoins('titleCoins', save.coins);
  }
  function starsText(n) { return n === 1 ? 'نجمة واحدة' : n === 2 ? 'نجمتان' : n + ' نجوم'; }
  function pickIsle(i, click) {
    if (!CI.isOpen(save, i)) { J.tap(); wiggle(isleBtns[i].el); return; }
    if (i !== isle) { isle = i; save.island = i; persist(); makeDemo(); J.select(); }
    else if (click) J.tap();
    refreshIsles();
    say(ISLE_NAME[i]);
  }
  function makeDemo() {
    demo = CI.create(CI.plan(isle, 1, 5, { rounds: [] }), { demo: true, bots: 4, looks: [CI.look(save)], seed: 11 + isle });
  }
  function toTitle() {
    world = null; result = null;
    if (!demo || demo.plan.island !== isle) makeDemo();
    refreshIsles();
    setScreen('title');
  }
  function wiggle(el) { el.classList.remove('wiggle'); void el.offsetWidth; el.classList.add('wiggle'); setTimeout(() => el.classList.remove('wiggle'), 500); }

  /* ------------------------------------------------------------ wardrobe */
  const items = [];
  function buildWardrobe() {
    const shelf = { color: 'shelfColor', hat: 'shelfHat', extra: 'shelfExtra' };
    CI.ITEMS.forEach(it => {
      const b = document.createElement('button'), c = document.createElement('canvas');
      b.type = 'button'; b.className = 'ci-btn item';
      c.width = c.height = 96;
      b.appendChild(c);
      b.insertAdjacentHTML('beforeend', '<span class="price"><svg aria-hidden="true"><use href="#i-coin"/></svg>' + it.price + '</span><span class="tick" aria-hidden="true"><svg><use href="#i-check"/></svg></span>');
      on(b, () => wear(it, b));
      $(shelf[it.kind]).appendChild(b);
      items.push({ it: it, el: b, c: c });
    });
  }
  function refreshWardrobe() {
    const look = CI.look(save);
    items.forEach(x => {
      const owned = save.owned.indexOf(x.it.id) >= 0, worn = save[x.it.kind] === x.it.id;
      x.el.classList.toggle('owned', owned);
      x.el.classList.toggle('on', worn);
      x.el.classList.toggle('poor', !owned && x.it.price > save.coins);
      x.el.setAttribute('aria-label', (x.it.kind === 'color' ? 'لون' : x.it.kind === 'hat' ? 'قبعة' : 'زينة') + (owned ? '' : '، ' + x.it.price + ' عملة'));
      A.itemIcon(x.c, x.it, look);
    });
    setCoins('wardCoins', save.coins);
  }
  let happy = 0;
  function wear(it, el) {
    const owned = save.owned.indexOf(it.id) >= 0;
    if (!owned) {
      if (it.price > save.coins) { J.tap(); wiggle(el); return; }
      save.coins -= it.price; save.owned.push(it.id);
      J.coin(3); J.chime(2);
      burst(330, 420, 30, ['#ffd23f', '#ffffff', '#ff7eb6', '#4fc3ff'], 380, 0.9, 9, 300);
    } else J.select();
    save[it.kind] = it.id;
    persist();
    happy = 1;
    if (demo) demo.actors[0].look = CI.look(save);
    refreshWardrobe();
  }
  function openWardrobe() { J.select(); refreshWardrobe(); setScreen('wardrobe'); }
  function closeWardrobe() { J.back(); toTitle(); }

  /* --------------------------------------------------------------- match */
  function p2Look(p1) { return { color: p1.color === '#4fc3ff' ? '#ff6b6b' : '#4fc3ff', hat: 'cap', extra: '' }; }
  function startMatch(two) {
    duo = !!two;
    // Difficulty is read at every match start, before the round is reported.
    const d = duo ? ddaDuo : ddaSolo, tier = d.tier;
    const seed = (Math.random() * 2147483647) | 0, plan = CI.plan(isle, tier, seed), looks = [CI.look(save)];
    if (duo) looks.push(p2Look(looks[0]));
    world = CI.create(plan, { humans: duo ? 2 : 1, seed: seed, looks: looks });
    const pool = BOT_NAMES.slice().sort(() => Math.random() - 0.5);
    names = world.actors.map((a, i) => a.human ? (duo ? String(i + 1) : 'أنت') : pool[i % pool.length]);
    matches++;
    Kit.stats.round(CI.roundId(isle, duo));
    tutorial = !duo && !save.tut;
    if (tutorial) Kit.stats.tutorial('start');
    ending = 0; result = null; streak = 0; shownCoins = [0, 0]; lastCue = -9; goT = 0; doorHintT = 0; keysShowT = duo ? 7 : 5;
    parts.length = 0; floats.length = 0; debris.length = 0; flyers.length = 0;
    coach.mind = CI.mind(0, 0, 77); coach.idle = 0; coach.on = false;
    setScreen('play');
    Kit.keys.reset();
    J.whoosh(0.5);
    handleEvents();
  }
  function pause(own) {
    if (screen !== 'play') return;
    setScreen('pause');
    if (own) J.back();
  }
  function resume() {
    if (screen !== 'pause') return;
    J.select();
    setScreen('play');
    cardEl.hidden = !(world && world.phase === 'card' || cardHide > 0);
    Kit.keys.reset();
  }
  function restart() { J.select(); startMatch(duo); }
  function quitToMenu() {
    if (world && !result) {
      if (duo) Kit.stats.end('end', world.actors[0].coins + world.actors[1].coins);
      else Kit.stats.end('quit');
    }
    J.back();
    toTitle();
  }
  // A match is saved the moment it ends, before the celebration.
  function finishMatch() {
    const w = world, me = w.actors[0], rounds = w.rounds, rank = CI.ranking(w);
    if (!duo) {
      const stars = CI.stars(me.survived, rounds), prev = save.stars[isle], nextWasOpen = isle < 3 && CI.isOpen(save, isle + 1);
      const coins = me.coins, best = save.best[isle];
      if (stars > prev) save.stars[isle] = stars;
      if (coins > best) save.best[isle] = coins;
      save.coins += coins;
      if (tutorial) { save.tut = true; Kit.stats.tutorial('done'); tutorial = false; }
      persist();
      ddaSolo.result(CI.outcome(w, 0));
      Kit.stats.end(stars > 0 ? 'win' : 'lose', coins);
      result = { duo: false, stars: stars, prev: prev, coins: coins, best: coins > best && coins > 0, newIsle: isle < 3 && !nextWasOpen && CI.isOpen(save, isle + 1) ? isle + 1 : -1, rank: rank };
    } else {
      const a = w.actors[0], b = w.actors[1], coins = a.coins + b.coins, best = save.duo;
      save.coins += coins;
      if (coins > best) save.duo = coins;
      persist();
      ddaDuo.result((a.survived + b.survived) / (2 * rounds));
      Kit.stats.end('end', coins);
      result = { duo: true, coins: coins, best: coins > best && coins > 0, newIsle: -1, rank: rank };
    }
    ending = 1.3;
    const good = duo ? w.actors[0].survived + w.actors[1].survived > 0 : result.stars > 0;
    if (good) { J.levelUp(); confetti(); } else J.fail();
  }
  function showResult() {
    ending = 0; resultT = 0; resultLock = 0.6;
    const r = result, w = world;
    $('resTitle').textContent = r.duo ? 'انتهت الجولات!' : r.stars > 0 ? 'أحسنت!' : 'حاول مرة أخرى!';
    $('resStars').hidden = r.duo;
    $('resStars').querySelectorAll('svg').forEach(s => s.classList.remove('on'));
    const rows = (r.duo ? [0, 1] : [0]).map(i => {
      const a = w.actors[i], marks = a.results.map(ok => '<i class="' + (ok ? 'ok' : '') + '"></i>').join('');
      const tag = r.duo ? '<span class="tag" style="background:' + a.look.color + '">' + (i + 1) + '</span>' : '';
      return '<div class="who">' + tag + '<span class="rounds">' + marks + '</span><span class="coin"><svg aria-hidden="true"><use href="#i-coin"/></svg>' + a.coins + '</span></div>';
    });
    $('resSheet').innerHTML = rows.join('');
    $('resNew').hidden = true;
    $('resNext').hidden = r.duo || isle >= 3 || !CI.isOpen(save, isle + 1);
    say(r.duo ? 'العملات ' + r.coins : starsText(r.stars) + '، العملات ' + r.coins);
    setScreen('result');
  }
  function resultStep(dt) {
    const r = result, before = resultT;
    resultT += dt;
    const at = t => before < t && resultT >= t;
    if (!r.duo) for (let i = 0; i < r.stars; i++) if (at(0.3 + i * 0.38)) { $('resStars').children[i].classList.add('on'); J.star(i + 1); burst(570 + i * 70, 470, 16, ['#ffd23f', '#ffffff'], 300, 0.6, 8, 300); }
    const after = 0.4 + (r.duo ? 0 : r.stars * 0.38);
    if (at(after)) {
      if (r.newIsle >= 0) { $('resNewText').textContent = 'جزيرة جديدة!'; $('resNew').hidden = false; J.levelUp(); }
      else if (r.best) { $('resNewText').textContent = 'رقم جديد!'; $('resNew').hidden = false; J.star(3); }
    }
    busyT += dt;
    if (resultT < 3 && busyT >= 1) { busyT = 0; Kit.stats.busy(); }
  }
  function again() { if (!result) return; startMatch(result.duo); }
  function nextIsle() {
    if (!result || result.duo || isle >= 3 || !CI.isOpen(save, isle + 1)) return;
    isle++; save.island = isle; persist(); makeDemo();
    startMatch(false);
  }

  /* --------------------------------------------------------------- input */
  // A mouse click hands the keyboard back to the game; the second click of a double click
  // (detail 2) is dropped, since the first one already acted.
  function on(el, fn) {
    el.addEventListener('click', e => { e.stopPropagation(); if (e.detail > 1) return; Kit.audio.unlock(); if (e.detail > 0) { el.blur(); focusGame(); } fn(e); });
  }
  on($('btnPlay'), () => { J.select(); startMatch(false); });
  on($('btnDuo'), () => { J.select(); startMatch(true); });
  on($('btnWardrobe'), openWardrobe);
  on($('wardBack'), closeWardrobe);
  on($('btnPause'), () => pause(true));
  on($('btnResume'), resume);
  on($('btnRestart'), restart);
  on($('btnMenu'), quitToMenu);
  on($('resAgain'), () => { if (resultLock <= 0) { J.select(); again(); } });
  on($('resMenu'), () => { if (resultLock <= 0) { J.back(); toTitle(); } });
  on($('resNext'), () => { if (resultLock <= 0) { J.select(); nextIsle(); } });
  canvas.addEventListener('pointerdown', () => { focusGame(); menuIdle = 0; });
  window.addEventListener('keydown', e => { if (Kit.isGameKeyEvent(e)) menuIdle = 0; });

  const P1 = { l: ['KeyA'], r: ['KeyD'], up: ['KeyW', 'Space'], down: ['KeyS'] };
  const P2 = { l: ['ArrowLeft'], r: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'] };
  const SOLO = { l: ['KeyA', 'ArrowLeft'], r: ['KeyD', 'ArrowRight'], up: ['KeyW', 'ArrowUp', 'Space'], down: ['KeyS', 'ArrowDown'] };
  function keysOf(map) { const K = Kit.keys; return { l: K.anyDown(map.l), r: K.anyDown(map.r), up: K.anyDown(map.up), down: K.anyDown(map.down) }; }
  function inputs() { return duo ? [keysOf(P1), keysOf(P2)] : [keysOf(SOLO)]; }
  function handleKeys() {
    const K = Kit.keys, go = K.anyPressed(['Enter', 'NumpadEnter', 'Space']);
    if (screen === 'title') {
      if (go) { J.select(); startMatch(false); }
      else if (K.pressed('ArrowLeft')) cycleIsle(1);
      else if (K.pressed('ArrowRight')) cycleIsle(-1);
    } else if (screen === 'wardrobe') { if (K.pressed('Escape')) closeWardrobe(); }
    else if (screen === 'play') { if (K.anyPressed(['KeyP', 'Escape'])) pause(true); }
    else if (screen === 'pause') { if (K.anyPressed(['KeyP', 'Escape', 'Enter', 'NumpadEnter', 'Space'])) resume(); else if (K.pressed('KeyR')) restart(); }
    else if (screen === 'result' && resultLock <= 0) {
      if (go || K.pressed('KeyR')) { J.select(); again(); }
      else if (K.pressed('KeyN')) { J.select(); nextIsle(); }
      else if (K.pressed('Escape')) { J.back(); toTitle(); }
    }
  }
  function cycleIsle(d) {
    for (let k = 1; k <= 4; k++) { const i = (isle + d * k + 4) % 4; if (CI.isOpen(save, i)) { pickIsle(i, false); return; } }
  }

  /* ------------------------------------------------------------- effects */
  function burst(x, y, n, colors, speed, life, size, grav, shape) {
    if (calm()) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = speed * (0.35 + Math.random() * 0.65);
      parts.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - speed * 0.2, life: life * (0.6 + Math.random() * 0.4), max: life, size: size * (0.6 + Math.random() * 0.6), color: colors[i % colors.length], g: grav, shape: shape || 0 });
    }
    if (parts.length > 260) parts.splice(0, parts.length - 260);
  }
  function confetti() { for (let i = 0; i < 5; i++) burst(160 + i * 240, 140, 22, ['#ff7eb6', '#ffd23f', '#4fc3ff', '#5be38f', '#ffffff', '#b48cff'], 380, 1.2, 10, 420); }
  function float(x, y, text, color, size) {
    floats.push({ x: x, y: y, text: text, color: color, size: size || 34, t: 0, rtl: /[؀-ۿ]/.test(text) });
    if (floats.length > 14) floats.shift();
  }
  function squeak(v) { Kit.audio.tone({ freq: 620, to: 1450, type: 'sine', dur: 0.16, vol: 0.2 * v }); Kit.audio.tone({ freq: 900, to: 500, type: 'triangle', dur: 0.1, vol: 0.12 * v, delay: 0.12 }); }
  function splashSound() { Kit.audio.noise({ dur: 0.45, vol: 0.26, filter: 1800, to: 300 }); J.pop(0.2); }
  const isHuman = i => i >= 0 && world && world.actors[i] && world.actors[i].human;
  function cue() { if (time - lastCue > 0.7) { lastCue = time; Kit.track.cue(); } }
  // The world's events become pictures, sound and statistics.
  function handleEvents() {
    const w = world;
    for (const e of w.ev) {
      const human = isHuman(e.who), a = e.who >= 0 ? w.actors[e.who] : null;
      switch (e.t) {
        case 'card': showCard(e.kinds); break;
        case 'count':
          if (e.n > 0) { $('cardCount').textContent = String(e.n); tick($('cardCount')); J.countdown(e.n); }
          else { J.countdown(0); hideCard(); goT = 0.9; }
          break;
        case 'door': doorHintT = 6; J.select(); break;
        case 'warn':
          cue();
          if (e.kind === 'flood') J.chime(1);
          else if (e.kind === 'wind') J.whoosh(0.35);
          else if (e.kind === 'tornado') { J.whoosh(0.8); doorHintT = 4; }
          else if (e.kind === 'clouds') Kit.audio.tone({ freq: 220, to: 660, type: 'triangle', dur: 0.5, vol: 0.08 });
          else if (e.kind === 'ice' || e.kind === 'balls') J.tap();
          break;
        case 'rumble': shake.add(5); Kit.audio.noise({ dur: 0.7, vol: 0.22, filter: 240, to: 70 }); break;
        case 'rise': J.whoosh(0.2); break;
        case 'live': break;
        case 'bonk':
          if (human) {
            Kit.track.miss(); squeak(1); J.impact(0.35); shake.add(9); streak = 0;
            float(e.x, e.y - 50, 'أوه!', '#ffffff', 34);
          } else squeak(0.35);
          burst(e.x, e.y - 20, 12, ['#ffe14d', '#ffffff', '#ff9ad5'], 260, 0.6, 8, 200, 1);
          break;
        case 'ghost':
          if (human) J.fail();
          burst(e.x, e.y, 16, ['#ffffff', '#e6ecf8'], 200, 0.7, 12, -60);
          break;
        case 'popup': burst(e.x, e.y, 10, [A.THEMES[w.isl.id].jelly, '#ffffff'], 220, 0.5, 9, 400); break;
        case 'splash':
          if (e.who < 0) { burst(e.x, CI.SEA - 40, 10, ['#ffffff', '#bfeaff'], 220, 0.6, 8, 600); break; }
          if (human) { splashSound(); shake.add(6); }
          burst(e.x, CI.SEA - 44, 22, w.isl.id === 'sky' ? ['#ffffff', '#eaf5ff'] : ['#ffffff', '#bfeaff', '#7fd6ff'], 360, 0.8, 9, 700);
          break;
        case 'dodge':
          if (human) {
            Kit.track.hit();
            streak++;
            if (streak === 4 || streak === 8 || streak === 12) { float(a.x, a.y - 110, PRAISE[streak / 4 - 1], '#ffd23f', 44); J.streak(streak / 4 + 1); }
          }
          break;
        case 'coin':
          if (human) { flyers.push({ x: e.x, y: e.y, t: 0, v: e.v, who: e.who }); J.coin(Math.min(5, e.v + 1)); }
          else J.pop(0.15);
          burst(e.x, e.y, 10, ['#ffd23f', '#fff6c2'], 200, 0.5, 7, 200, 1);
          break;
        case 'coinSpawn': burst(e.x, e.y, 8, ['#fff6c2', '#ffffff'], 140, 0.5, 6, 0, 1); break;
        case 'jump': if (human) J.jump(0.5); break;
        case 'land':
          if (human) J.land(Math.min(1, e.power + 0.2));
          burst(e.x, e.y - 4, 6, ['#ffffff', A.THEMES[w.isl.id].soil], 120, 0.35, 7, 200);
          break;
        case 'impact':
          if (e.kind === 'meteor') { J.pop(0.6); burst(e.x, e.y - 10, 14, ['#ffd9ec', '#ffffff', '#b5f0ff'], 260, 0.6, 9, 500); shake.add(3); }
          else if (e.kind === 'coconut') { J.impact(0.2); burst(e.x, e.y - 8, 8, ['#8a5a2b', '#ffffff'], 200, 0.5, 7, 600); }
          else if (e.kind === 'ball') { J.pop(0.35); burst(e.x, e.y - 4, 6, ['#ffffff'], 140, 0.4, 7, 300); }
          else if (e.kind === 'snowpoof') { J.pop(0.4); burst(e.x, e.y, 18, ['#ffffff', '#cde6ff'], 260, 0.7, 10, 400); }
          break;
        case 'zap': J.impact(0.7); Kit.audio.noise({ dur: 0.25, vol: 0.22, filter: 6000, to: 900 }); shake.add(7); flash = 0.25; burst(e.x, G - 10, 16, ['#ffe14d', '#ffffff'], 380, 0.5, 8, 300, 1); break;
        case 'fall': {
          J.impact(0.3);
          const p = w.plats.find(q => q.id === e.id);
          if (p) debris.push({ p: p, x: p.x, y: p.y, vy: 0, rot: 0, t: 0 });
          burst(e.x, e.y + 8, 14, ['#c9874a', '#ffd27a', '#ffffff'], 240, 0.7, 9, 600);
          break;
        }
        case 'restore': burst(e.x, e.y, 10, ['#ffffff', '#ffd23f'], 160, 0.5, 7, 0, 1); break;
        case 'turn': J.whoosh(0.6); break;
        case 'clear': onClear(e); break;
        case 'done': break;
        case 'poof': burst(e.x, e.y, 8, ['#ffffff'], 160, 0.5, 9, 0); break;
      }
    }
    w.ev.length = 0;
  }
  let flash = 0;
  function onClear(e) {
    const w = world, humans = w.actors.filter(a => a.human);
    humans.forEach(a => {
      if (e.survivors.indexOf(a.i) >= 0) {
        Kit.track.hit();
        float(a.x, a.y - 120, 'نجوت!', '#5be38f', 50);
        flyers.push({ x: a.x, y: a.y - 40, t: 0, v: 2, who: a.i, bonus: true });
      }
    });
    const ok = humans.some(a => e.survivors.indexOf(a.i) >= 0);
    if (ok) { J.chime(2); burst(640, 200, 30, ['#ff7eb6', '#ffd23f', '#4fc3ff', '#5be38f', '#ffffff'], 400, 1, 9, 400); }
    else J.fail();
    if (tutorial && e.round === 0 && ok) { save.tut = true; persist(); Kit.stats.tutorial('done'); tutorial = false; }
  }
  function tick(el) { el.classList.remove('tick'); void el.offsetWidth; el.classList.add('tick'); }
  function showCard(kinds) {
    cardKinds = kinds; cardT = 0; cardHide = 0;
    $('cardName').textContent = kinds.map(k => DIS_NAME[k]).join(' + ');
    $('cardName').style.fontSize = kinds.length > 1 ? '34px' : '';
    $('cardTip').textContent = kinds.length > 1 ? DIS_TIP[kinds[0]] : DIS_TIP[kinds[0]];
    $('cardCount').textContent = '';
    cardEl.classList.remove('small'); cardEl.hidden = false; void cardEl.offsetWidth;
    say(kinds.map(k => DIS_NAME[k]).join(' و ') + '. ' + DIS_TIP[kinds[0]]);
    J.whoosh(0.7);
  }
  function hideCard() { cardEl.classList.add('small'); cardHide = 0.36; }

  /* -------------------------------------------------------------- coach */
  // After a few seconds without a key (and all through a child's very first round), the
  // keys to press light up and a bouncing arrow shows where to go.
  function coachStep(dt) {
    const w = world, me = w.actors[0];
    const keys = duo ? [] : ['KeyA', 'KeyD', 'KeyW', 'KeyS', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'];
    if (keys.some(k => Kit.keys.down(k))) coach.idle = 0; else coach.idle += dt;
    const active = (w.phase === 'card' || w.phase === 'live') && !me.ghost && !duo;
    coach.on = active && (coach.idle > 2.5 || (tutorial && w.round === 0));
    coach.inp = active ? CI.think(w, me, coach.mind) : null;
    if (!active) CI.resetMind(coach.mind);
  }

  /* ----------------------------------------------------------------- loop */
  function decay(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt; if (p.life <= 0) { parts.splice(i, 1); continue; }
      p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    }
    for (let i = floats.length - 1; i >= 0; i--) { const f = floats[i]; f.t += dt; f.y -= dt * 46; if (f.t > 1.2) floats.splice(i, 1); }
    for (let i = debris.length - 1; i >= 0; i--) { const d = debris[i]; d.t += dt; d.vy += 1800 * dt; d.y += d.vy * dt; d.rot += dt * 2; if (d.t > 1) debris.splice(i, 1); }
    for (let i = flyers.length - 1; i >= 0; i--) {
      const f = flyers[i]; f.t += dt;
      if (f.t >= 0.6) { flyers.splice(i, 1); const k = duo && f.who === 1 ? 1 : 0; shownCoins[k] += f.v; if (!f.bonus) burst(hudCoinX(k), 96, 6, ['#ffd23f'], 120, 0.3, 6, 0, 1); }
    }
    if (flash > 0) flash -= dt;
    // Leaves fly in a gust.
    const wd = world && screen === 'play' ? world.wind : null;
    if (wd && wd.prof > 0 && !calm() && Math.random() < wd.prof * 0.5 && parts.length < 220) {
      parts.push({ x: wd.dir > 0 ? -10 : W + 10, y: 140 + Math.random() * 420, vx: wd.dir * (500 + Math.random() * 300), vy: (Math.random() - 0.5) * 80, life: 2.8, max: 2.8, size: 14, color: A.THEMES[world.isl.id].leaf, g: 30, shape: 2 });
    }
    happy = Math.max(0, happy - dt * 1.5);
  }
  function playStep(dt) {
    if (ending > 0) {
      ending -= dt;
      busyT += dt;
      if (busyT >= 1) { busyT = 0; Kit.stats.busy(); }
      if (ending <= 0) showResult();
      return;
    }
    const inp = inputs();
    CI.step(world, dt, inp);
    handleEvents();
    coachStep(dt);
    cardT += dt;
    if (cardHide > 0) { cardHide -= dt; if (cardHide <= 0) cardEl.hidden = true; }
    if (doorHintT > 0) doorHintT -= dt;
    if (goT > 0) goT -= dt;
    if (keysShowT > 0) keysShowT -= dt;
    if (world.phase === 'done' && !ending && !result) finishMatch();
    // Keep the coin counters honest even if a flight was cut short.
    world.actors.forEach((a, i) => { if (a.human && i < 2 && !flyers.some(f => f.who === i)) shownCoins[i] = a.coins; });
  }
  function update(dt) {
    time += dt;
    handleKeys();
    if (screen === 'play') playStep(dt);
    else if (screen === 'title' || screen === 'wardrobe') { if (demo) { CI.step(demo, dt, null); demo.ev.length = 0; } }
    else if (screen === 'result') resultStep(dt);
    if (resultLock > 0) resultLock -= dt;
    if (screen === 'title' || screen === 'result') {
      menuIdle += dt;
      if (!hand.on && menuIdle >= menuNext) { menuNext = menuIdle + 7; menuHand(); }
    }
    if (screen !== 'pause') { handStep(dt); shake.update(dt); decay(dt); }
    Kit.keys.endFrame();
  }

  /* ------------------------------------------------------ the menu hand */
  const hand = { on: false, t: 0, from: null, to: null, press: 0 };
  function menuHand() {
    const el = screen === 'title' ? $('btnPlay') : screen === 'result' && resultT > 1.5 ? $('resAgain') : null;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (!r.width) return;
    const p = view.toLogical(r.left + r.width / 2, r.top + r.height / 2);
    hand.on = true; hand.t = 0; hand.to = p; hand.from = { x: p.x + 160, y: Math.min(H - 40, p.y + 140) };
    handEl.hidden = false;
  }
  function stopHand() { hand.on = false; handEl.hidden = true; }
  function handStep(dt) {
    if (!hand.on) return;
    hand.t += dt;
    const k = Math.min(1, hand.t / 0.9), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    const x = hand.from.x + (hand.to.x - hand.from.x) * e, press = hand.t > 0.9 && !calm() ? Math.max(0, Math.sin((hand.t - 0.9) * 9)) * 14 : 0;
    handEl.style.transform = 'translate(' + (x - 33).toFixed(1) + 'px,' + (hand.from.y + (hand.to.y - hand.from.y) * e + press - 5).toFixed(1) + 'px)';
    handEl.style.opacity = String(Math.min(1, hand.t * 4) * (hand.t > 2.6 ? Math.max(0, 1 - (hand.t - 2.6) * 3) : 1));
    if (hand.t > 3) stopHand();
  }

  /* --------------------------------------------------------------- render */
  const ctx = view.ctx;
  function hudCoinX(k) { return k ? 1032 : 116; }
  function lookOf(a, w) {
    return { color: a.look.color, hat: a.look.hat, extra: a.look.extra, face: a.face, vx: a.vx, vy: a.vy, ground: !!a.ground, land: a.land, bonk: a.bonk, inv: a.inv,
      ghost: a.ghost, time: time, still: calm(), scale: 1, seed: a.i * 1.7, mood: CI.has(w, 'flood') && !a.ground ? 'up' : '', lean: a.blown ? -Math.sign(a.push) * 0.18 : a.push ? -Math.sign(a.push) * 0.08 : 0 };
  }
  function drawWorld(w, play) {
    const still = calm(), isl = w.isl;
    ctx.drawImage(A.bg(isl, pixelScale()), 0, 0, W, H);
    if (isl.id === 'snow' && !still) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (let i = 0; i < 36; i++) { const x = (i * 97 + time * (20 + i % 5 * 6)) % W, y = (i * 53 + time * (40 + i % 7 * 8)) % 560; A.circle(ctx, x, y, 2 + i % 3); ctx.fill(); }
    }
    A.sea(ctx, isl, time, still);
    A.house(ctx, isl, w.door);
    const windK = w.wind.prof * w.wind.dir;
    for (const p of w.plats) A.plat(ctx, isl, p, time, still, windK);
    for (const d of debris) {
      ctx.save(); ctx.globalAlpha = Math.max(0, 1 - d.t); ctx.translate(d.x + d.p.w / 2, d.y + 8); ctx.rotate(d.rot * 0.3);
      A.rr(ctx, -d.p.w / 2, -8, d.p.w, 16, 6); ctx.fillStyle = '#c9874a'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = A.INK; ctx.stroke();
      ctx.restore();
    }
    // Warnings on the ground: shadows and rings where things will land, lit columns.
    for (const h of w.haz) {
      if (h.k === 'drop' && h.state !== 'land') A.target(ctx, h.x, h.surf, h.r * 1.25, (w.t - h.born) / (h.impact - h.born), time, still);
      else if (h.k === 'ball') {
        let n = 0;
        for (const L of h.lands) { if (L.t < w.t - 0.05 || n >= 2) continue; n++; if (L.t - w.t < 2.6) A.target(ctx, L.x, L.y, 50, 1 - (L.t - w.t) / 2.6, time, still); }
        if (w.t < h.enter) A.edgeSign(ctx, h.side < 0 ? 46 : W - 46, 300, -h.side, time, still, () => A.ballIcon(ctx, h.side < 0 ? 46 : W - 46, 366, 0.42));
      } else if (h.k === 'zap') A.zap(ctx, h, w.t, still);
      else if (h.k === 'snow' && w.t < h.enter) A.edgeSign(ctx, h.sx, G - 120, h.dir, time, still, () => A.snowIcon(ctx, h.sx, G - 52, 0.8));
    }
    if (w.ice) A.ice(ctx, w, time, still);
    if (w.jelly.line) A.jellyLine(ctx, isl, w.jelly.line, time, still);
    // Coins.
    for (const c of w.coins) {
      const blink = w.t - c.born > c.life - 2 && Math.floor(time * 8) % 2 === 0;
      if (!blink) A.coin(ctx, c.x, c.y + (still ? 0 : Math.sin(time * 4 + c.id) * 4), c.v > 1 ? 18 : 14, still ? 0 : time * 3 + c.id, c.v > 1);
    }
    // Islanders: computer ones first, the children on top.
    const order = w.actors.filter(a => !a.human).concat(w.actors.filter(a => a.human));
    for (const a of order) {
      const o = lookOf(a, w);
      if (a.human) o.marker = duo ? String(a.i + 1) : 'me';
      A.islander(ctx, a.x, a.y, o);
      if (!a.human && a.mind && a.mind.goofT > 0 && !a.ghost) A.label(ctx, a.mind.goof === 'nap' ? 'z z' : a.mind.goof === 'dance' ? '♪' : '!', a.x + 22, a.y - 76, 26, '#ffffff', false, 5);
    }
    // An open house frames whoever is inside; a child keeps the marker over the roof.
    if (w.door) {
      A.houseFront(ctx, isl);
      for (const a of w.actors) if (a.human && a.inside && !a.ghost) A.marker(ctx, a.x, a.y - 78 - (still ? 0 : Math.abs(Math.sin(time * 4)) * 5), duo ? String(a.i + 1) : 'me', a.look.color);
    }
    // Falling and bouncing things.
    for (const h of w.haz) {
      if (h.k === 'drop') A.drop(ctx, h, w.t, still);
      else if (h.k === 'ball') A.ball(ctx, h, w.t, still);
      else if (h.k === 'snow') A.snowball(ctx, h, w.t, still);
      else if (h.k === 'twister') A.twister(ctx, h, w.t, still, isl);
    }
    for (const c of w.clouds) A.stormCloud(ctx, c, w.t, still);
    A.jelly(ctx, isl, w.jelly, time, still);
    if (w.wind.dir) A.wind(ctx, w.wind, w.t, still);
    if (play && (doorHintT > 0 || CI.has(w, 'tornado')) && w.door && w.phase !== 'clear' && !coach.on) A.doorHint(ctx, isl, time, still);
    drawFx();
  }
  function drawFx() {
    for (const p of parts) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      if (p.shape === 2) { ctx.beginPath(); ctx.ellipse(p.x, p.y, p.size, p.size * 0.45, p.life * 6, 0, Math.PI * 2); ctx.fillStyle = p.color; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = A.INK; ctx.stroke(); }
      else if (p.shape) { A.starPath(ctx, p.x, p.y, p.size, p.size * 0.45, p.life * 4); ctx.fillStyle = p.color; ctx.fill(); }
      else { A.circle(ctx, p.x, p.y, p.size / 2); ctx.fillStyle = p.color; ctx.fill(); }
    }
    ctx.globalAlpha = 1;
    for (const f of floats) {
      ctx.globalAlpha = Math.max(0, 1 - Math.max(0, f.t - 0.7) / 0.5);
      A.label(ctx, f.text, f.x, f.y, f.size, f.color, f.rtl);
    }
    ctx.globalAlpha = 1;
  }
  // Hearts, coins, the rounds, the disaster badge, the coach's keys.
  function drawHud(w) {
    const still = calm(), humans = w.actors.filter(a => a.human);
    humans.forEach((a, k) => {
      const x0 = k ? 1100 : 30, dir = k ? -1 : 1;
      if (duo) { A.circle(ctx, x0 + dir * 4, 34, 20); ctx.fillStyle = a.look.color; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = A.INK; ctx.stroke(); A.label(ctx, String(k + 1), x0 + dir * 4, 35, 24, '#ffffff', false, 4); }
      for (let i = 0; i < 3; i++) A.heart(ctx, x0 + dir * ((duo ? 50 : 22) + i * 46), 34, 1.25, i < a.hearts && !a.ghost);
      const cx = hudCoinX(k);
      A.rr(ctx, cx - 46, 72, 104, 44, 22); ctx.fillStyle = 'rgba(28,34,80,0.8)'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = '#ffffff'; ctx.stroke();
      A.coin(ctx, cx - 24, 94, 15, 0, false);
      A.label(ctx, String(shownCoins[k]), cx + 18, 95, 28, '#ffffff', false, 0);
    });
    // One dot per round: green for survived, grey for lost, the current one pulses.
    const n = w.rounds, me = w.actors[0];
    for (let i = 0; i < n; i++) {
      const x = 640 + (i - (n - 1) / 2) * 40, cur = i === w.round && w.phase !== 'done', ok = me.results[i];
      A.circle(ctx, x, 30, cur && !still ? 13 + Math.sin(time * 6) * 2 : 12);
      ctx.fillStyle = ok === true ? '#5be38f' : ok === false ? '#9aa3c7' : cur ? '#ffd23f' : '#ffffff'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = A.INK; ctx.stroke();
    }
    // The disaster of this round, as a small badge (icons on the right, the name after them).
    if ((w.phase === 'live' || w.phase === 'clear') && cardEl.hidden) {
      const kinds = CI.current(w), label = kinds.map(k => DIS_NAME[k]).join(' + ');
      ctx.font = '700 26px Fredoka'; ctx.direction = 'rtl';
      const lw = ctx.measureText(label).width, iw = 50 * kinds.length, tw = lw + iw + 12, x0 = 640 - tw / 2;
      ctx.direction = 'ltr';
      A.rr(ctx, x0 - 16, 52, tw + 32, 48, 24); ctx.fillStyle = 'rgba(255,255,255,0.94)'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = A.INK; ctx.stroke();
      kinds.forEach((k, i) => A.icon(ctx, k, x0 + tw - 24 - i * 50, 76, 0.6, time, still));
      A.label(ctx, label, x0 + lw / 2, 77, 26, A.INK, true, 0);
    }
    if (goT > 0) {
      const k = 1 + (still ? 0 : (0.9 - goT) * 0.3);
      ctx.save(); ctx.globalAlpha = Math.min(1, goT * 3); ctx.translate(640, 360); ctx.scale(k, k);
      A.label(ctx, 'انطلق!', 0, 0, 96, '#ffd23f', true, 12);
      ctx.restore();
    }
    if (flash > 0) { ctx.fillStyle = 'rgba(255,255,230,' + (flash * 1.6) + ')'; ctx.fillRect(0, 0, W, H); }
    // The coach: the keys to press now, and where to go.
    if (coach.on && coach.inp) {
      const inp = coach.inp, g = coach.mind.goal, esc = coach.mind.esc, me2 = w.actors[0];
      const tx = esc ? esc.x : g ? g.x : null, ty = esc ? esc.p.y : g ? g.p.y : null;
      if (tx !== null && (Math.abs(tx - me2.x) > 36 || (g && !esc && g.p !== me2.ground))) {
        const by = ty - 96 - (still ? 0 : Math.abs(Math.sin(time * 5)) * 14);
        ctx.beginPath(); ctx.moveTo(tx - 22, by - 26); ctx.lineTo(tx + 22, by - 26); ctx.lineTo(tx + 22, by); ctx.lineTo(tx + 36, by); ctx.lineTo(tx, by + 34); ctx.lineTo(tx - 36, by); ctx.lineTo(tx - 22, by); ctx.closePath();
        ctx.fillStyle = '#5be38f'; ctx.fill(); ctx.lineWidth = 6; ctx.strokeStyle = A.INK; ctx.stroke();
        A.circle(ctx, tx, ty - 4, 26); ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(91,227,143,0.9)'; ctx.stroke();
      }
      const kx = 640, ky = 666;
      A.key(ctx, kx - 114, ky, '←', !!inp.l, time, still);
      A.key(ctx, kx - 38, ky, '↑', !!inp.up, time, still);
      A.key(ctx, kx + 38, ky, '↓', !!inp.down, time, still);
      A.key(ctx, kx + 114, ky, '→', !!inp.r, time, still);
    }
    // The keys at the start of a match (both children's in a two-player match).
    if (keysShowT > 0 && w.round === 0) {
      ctx.globalAlpha = Math.min(1, keysShowT);
      if (duo) {
        // Player 1's keys on the left of the sand, player 2's on the right, each with its badge.
        const pl = w.actors, K = Kit.keys;
        [[0, ['W', 'A', 'S', 'D'], ['KeyW', 'KeyA', 'KeyS', 'KeyD'], 236], [1, ['↑', '←', '↓', '→'], ['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'], 1044]].forEach(([k, L, C, cx]) => {
          const cy = 662;
          A.rr(ctx, cx - 150, cy - 56, 300, 112, 26); ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.fill(); ctx.lineWidth = 6; ctx.strokeStyle = A.INK; ctx.stroke();
          A.circle(ctx, cx - 118, cy, 24); ctx.fillStyle = pl[k].look.color; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = A.INK; ctx.stroke();
          A.label(ctx, String(k + 1), cx - 118, cy + 1, 28, '#ffffff', false, 4);
          ctx.save(); ctx.translate(cx + 26, cy); ctx.scale(0.8, 0.8);
          A.key(ctx, 0, -32, L[0], K.down(C[0]), time, true, 50);
          A.key(ctx, -62, 34, L[1], K.down(C[1]), time, true, 50); A.key(ctx, 0, 34, L[2], K.down(C[2]), time, true, 50); A.key(ctx, 62, 34, L[3], K.down(C[3]), time, true, 50);
          ctx.restore();
        });
      } else if (!coach.on && w.phase === 'card') {
        A.key(ctx, 526, 666, '←', false, time, still); A.key(ctx, 602, 666, '↑', false, time, still); A.key(ctx, 678, 666, '↓', false, time, still); A.key(ctx, 754, 666, '→', false, time, still);
      }
      ctx.globalAlpha = 1;
    }
    // Coins flying to the counter.
    for (const f of flyers) {
      const k = duo && f.who === 1 ? 1 : 0, e = f.t / 0.6, x = f.x + (hudCoinX(k) - 24 - f.x) * e, y = f.y + (94 - f.y) * e - Math.sin(e * Math.PI) * 120;
      A.coin(ctx, x, y, 15, time * 10, false);
      if (f.bonus) A.label(ctx, '+' + f.v, x + 24, y - 18, 24, '#ffd23f', false, 4);
    }
  }
  function drawWardrobe() {
    const still = calm(), w = demo;
    ctx.drawImage(A.bg(w.isl, pixelScale()), 0, 0, W, H);
    ctx.fillStyle = 'rgba(28,34,80,0.35)'; ctx.fillRect(0, 0, W, H);
    ctx.beginPath(); ctx.ellipse(300, 610, 170, 40, 0, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.lineWidth = 6; ctx.strokeStyle = A.INK; ctx.stroke();
    const look = CI.look(save), hop = still ? 0 : Math.abs(Math.sin(time * 4)) * -14 * (happy + 0.2);
    A.islander(ctx, 300, 600 + hop, { color: look.color, hat: look.hat, extra: look.extra, face: 1, vx: 0, vy: hop ? -200 : 0, ground: !hop, land: 0, bonk: 0, inv: 0, time: time, still: still, scale: 3.4, seed: 1 });
    drawFx();
  }
  function drawResult() {
    const w = world, still = calm(), r = result, isl = w.isl;
    ctx.drawImage(A.bg(isl, pixelScale()), 0, 0, W, H);
    A.sea(ctx, isl, time, still);
    A.house(ctx, isl, false);
    for (const p of w.plats) if (!p.gone) A.plat(ctx, isl, p, time, still, 0);
    ctx.fillStyle = 'rgba(28,34,80,0.35)'; ctx.fillRect(0, 0, W, H);
    const px = 640, py = 360;
    A.podium(ctx, px, py);
    r.rank.forEach((a, k) => {
      const o = lookOf(a, w);
      o.ghost = false; o.bonk = 0; o.inv = 0; o.ground = true; o.vx = 0; o.vy = 0; o.land = 0; o.face = 1;
      let x, y, s = 1.15;
      if (k < 3) { x = px + A.podiumX(k); y = py - A.podiumTop(k); }
      else { x = k === 3 ? 200 : 1080; y = G; s = 1; }
      const hop = still ? 0 : k === 0 ? Math.abs(Math.sin(time * 5)) * -18 : Math.abs(Math.sin(time * 3 + k)) * -5;
      o.scale = s; o.ground = !hop;
      if (a.human) o.marker = duo ? String(a.i + 1) : 'me';
      A.islander(ctx, x, y + hop, o);
      const label = a.human ? (duo ? '' : 'أنت') : names[a.i];
      if (label) A.label(ctx, label, x, y + 22, 24, '#ffffff', true, 5);
    });
    drawFx();
  }
  function render() {
    if (screen === 'pause' && !dirty) return;
    dirty = false;
    ctx.save();
    ctx.translate(shake.x, shake.y);
    if ((screen === 'play' || screen === 'pause') && world) drawWorld(world, true);
    else if (screen === 'title' && demo) drawWorld(demo, false);
    else if (screen === 'wardrobe' && demo) drawWardrobe();
    else if (screen === 'result' && world) drawResult();
    ctx.restore();
    if ((screen === 'play' || screen === 'pause') && world) drawHud(world);
    if (!cardEl.hidden && cardKinds.length) A.cardPic(cardPic, cardKinds, cardT, calm(), world ? world.isl.id : 'beach', world ? world.house.side : -1);
  }

  canvas.addEventListener('contextrestored', () => { A.reset(); dirty = true; isleBtns.forEach((b, i) => A.isleIcon(b.c, CI.ISLANDS[i])); if (screen === 'wardrobe') refreshWardrobe(); });
  // Text pictures made before the font arrived are made again with it.
  if (document.fonts && document.fonts.load) document.fonts.load('700 40px Fredoka', 'جزيرة 5').then(() => { A.resetText(); dirty = true; }, () => { /* fallback fonts */ });

  /* --------------------------------------------------- test and debug hook */
  const page = (x, y) => { const r = canvas.getBoundingClientRect(); return { x: r.left + x * view.scale, y: r.top + y * view.scale }; };
  window.__game = {
    get mode() { return screen; },
    get world() { return world; },
    get demo() { return demo; },
    get player() { return world ? world.actors[0] : null; },
    get players() { return world ? world.actors.filter(a => a.human) : []; },
    get save() { return JSON.parse(JSON.stringify(save)); },
    get matches() { return matches; },
    get duo() { return duo; },
    get island() { return isle; },
    get result() { return result ? { duo: result.duo, stars: result.stars, coins: result.coins, newIsle: result.newIsle } : null; },
    get coach() { return { on: coach.on, inp: coach.inp, goal: coach.mind.goal ? { plat: coach.mind.goal.p.id, x: coach.mind.goal.x } : null }; },
    get card() { return { shown: !cardEl.hidden, name: $('cardName').textContent, count: $('cardCount').textContent }; },
    get names() { return names.slice(); },
    // Where a logical point is on the page; and the HUD boxes drawn on the canvas.
    point: page,
    hudBox: k => { const a = page(k ? 1100 - 170 : 30 - 22, 10), b = page(k ? 1100 + 22 : 30 + 170, 118); return { left: Math.min(a.x, b.x), right: Math.max(a.x, b.x), top: a.y, bottom: b.y }; }
  };

  buildIsles();
  buildWardrobe();
  Kit.muteButton();
  Kit.lifecycle({ pause: () => pause(false), reset: () => { /* keys are held state only; Kit resets them */ } });
  toTitle();
  Kit.loop(update, render);
  Kit.ready();
})();
