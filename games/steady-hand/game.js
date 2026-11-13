/* Steady Hand (سلك الشرارة): screens, the mouse and the keyboard, the wordless coach,
 * saves and sound. engine.js moves the spark and keeps the rules; art.js draws.
 * This is the UI layer: it reads Kit.dda at every level start (track width, speed of the
 * moving parts, checkpoint spacing, how long doors stay open) and reports each try. */
(function () {
  'use strict';
  const A = SH.art, J = Kit.juice, W = SH.W, H = SH.H;
  const $ = id => document.getElementById(id);
  const canvas = $('game'), ui = $('ui');
  const calm = () => Kit.motion.reduced();
  const clamp = Kit.clamp;
  let dirty = true;
  const view = Kit.fit(canvas, W, H, { maxDpr: 1.5, onResize: v => {
    ui.style.left = canvas.style.left; ui.style.top = canvas.style.top; ui.style.transform = 'scale(' + v.scale + ')'; dirty = true;
  } });
  const fx = Kit.particles(), shake = Kit.shake();
  const pixelScale = () => clamp(Math.round(view.scale * view.dpr * 4) / 4, 0.5, 2);
  const KEYS_GO = ['Enter', 'NumpadEnter', 'Space'];
  const FLY = 0.45, CELEBRATE = 1.7;

  /* ---------------------------------------------------------------- save */
  const store = Kit.store('steady-hand');
  const saveStatus = Kit.saveStatus({ retry: persist });
  let save = SH.loadSave(store.get('save', null));
  function persist() {
    if (store.set('save', save) === false) { saveStatus.failed(); return false; }
    saveStatus.saved();
    return true;
  }
  // One difficulty for every level (Kit keeps it on this PC). A new PC starts gentle.
  const dda = Kit.dda('steady-hand', { id: 'main', start: 0.25 });

  /* --------------------------------------------------------------- state */
  let screen = 'title', cur = 0, world = null, time = 0, tried = false;
  let celebrate = 0, result = null, resultT = 0, resultLock = 0, intro = 0;
  let trail = [], arcs = [], floats = [], flashes = [], cpPop = [], fly = null, hint = null, lastX = 0, lastY = 0, vx = 0, vy = 0, blink = 0, trailGap = 0;
  let timers = [];
  const coach = { idle: 0, on: false, t: 0 };
  const ptr = { x: W / 2, y: H / 2, inside: false, down: false };
  let ptrQ = [], pressQ = null, outQ = false;
  // The title's own little wire, with the spark running along it.
  const titleL = SH.build(-1, SH.params(0.3), { p: [[70, 640], [250, 600], [450, 650], [640, 610], [830, 650], [1030, 600], [1210, 640]], w: 64, world: 0, mode: 'drag' });

  /* ------------------------------------------------------------ screens */
  const SCREENS = { title: 'scrTitle', map: 'scrMap', pause: 'scrPause', result: 'scrResult', shop: 'scrShop' };
  function setScreen(name) {
    screen = name;
    for (const k in SCREENS) $(SCREENS[k]).hidden = k !== name;
    $('hud').hidden = name !== 'play';
    dirty = true;
    cursor('');
    if (name === 'play') focusGame();
  }
  function focusGame() { try { canvas.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  function say(text) { $('live').textContent = text; }
  function chip(id, n) { $(id).querySelector('b').textContent = String(n); }
  let cursorNow = '';
  function cursor(c) { if (c !== cursorNow) { cursorNow = c; canvas.className = c; } }
  function wiggle(el) { el.classList.remove('wiggle'); void el.offsetWidth; el.classList.add('wiggle'); setTimeout(() => el.classList.remove('wiggle'), 500); }

  function toTitle() {
    leaveLevel();
    chip('titleStars', SH.totalStars(save) + '/' + SH.LEVELS.length * 3);
    chip('titleCoins', save.coins);
    setScreen('title');
  }
  function play() {
    J.select();
    // A child who has never lit a lamp goes straight to the first wire.
    if (!SH.totalStars(save)) startLevel(0); else toMap();
  }

  /* ---------------------------------------------------------------- map */
  const levelBtns = [], rows = [];
  function buildMap() {
    const box = $('worlds');
    SH.WORLDS.forEach((wd, wi) => {
      const row = document.createElement('div');
      row.className = 'wrow'; row.style.setProperty('--wc', wd.color);
      row.innerHTML = '<div class="wname"><i>العالم ' + (wi + 1) + '</i><b>' + wd.name + '</b></div>';
      for (let k = 0; k < 6; k++) {
        const i = wi * 6 + k, b = document.createElement('button');
        b.type = 'button'; b.className = 'sh-btn lvl';
        b.innerHTML = '<b>' + (k + 1) + '</b><span class="st">' + '<svg><use href="#i-star"/></svg>'.repeat(3) + '</span><svg class="lk" aria-hidden="true"><use href="#i-lock"/></svg>';
        on(b, () => pickLevel(i, b));
        row.appendChild(b); levelBtns.push(b);
      }
      box.appendChild(row); rows.push(row);
    });
  }
  function refreshMap() {
    const next = SH.nextLevel(save);
    levelBtns.forEach((b, i) => {
      const open = SH.isOpen(save, i), st = save.lv[i].s, R = SH.LEVELS[i];
      b.classList.toggle('locked', !open);
      b.classList.toggle('next', open && i === next);
      b.querySelectorAll('.st svg').forEach((s, k) => s.classList.toggle('on', k < st));
      b.setAttribute('aria-label', R.id + ' ' + R.name + (open ? '، ' + st + ' من 3 نجوم' : ' (مقفلة)'));
    });
    rows.forEach((r, wi) => r.classList.toggle('locked', !SH.isOpen(save, wi * 6)));
    chip('mapStars', SH.totalStars(save) + '/' + SH.LEVELS.length * 3);
  }
  function toMap() {
    leaveLevel();
    refreshMap();
    setScreen('map');
    J.whoosh(0.4);
  }
  function pickLevel(i, el) {
    if (!SH.isOpen(save, i)) { J.error(); wiggle(el); return; }
    J.select(); startLevel(i);
  }

  /* ---------------------------------------------------------------- shop */
  const tiles = { color: [], trail: [] };
  function buildShop() {
    [['color', SH.COLORS, 'shelfColors'], ['trail', SH.TRAILS, 'shelfTrails']].forEach(([kind, list, id]) => {
      list.forEach((item, k) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'sh-btn tile';
        b.innerHTML = '<canvas width="232" height="232"></canvas><b>' + item.name + '</b><span class="price"><i class="coin"></i><em>' + item.price + '</em></span>';
        on(b, () => buy(kind, k, b));
        $(id).appendChild(b); tiles[kind].push(b);
      });
    });
  }
  function drawTile(kind, k, c) {
    const g = c.getContext('2d');
    g.setTransform(2, 0, 0, 2, 0, 0); g.clearRect(0, 0, 116, 116);
    const col = SH.COLORS[kind === 'color' ? k : save.color];
    if (kind === 'trail') for (let i = 0; i < 6; i++) {
      const x = 20 + i * 9, y = 70 - Math.sin(i * 0.8) * 10;
      A.trailBit(g, k, x, y, 3 + i * 0.6, trailColor(k, col, i * 40), i);
    }
    A.spark(g, kind === 'trail' ? 76 : 58, kind === 'trail' ? 56 : 62, { col: col, t: 0, still: true, scale: kind === 'trail' ? 1.3 : 1.7, face: 'happy' });
  }
  function refreshShop() {
    ['color', 'trail'].forEach(kind => {
      const own = kind === 'trail' ? save.trails : save.colors, wear = kind === 'trail' ? save.trail : save.color, list = kind === 'trail' ? SH.TRAILS : SH.COLORS;
      tiles[kind].forEach((b, k) => {
        drawTile(kind, k, b.querySelector('canvas'));
        b.classList.toggle('own', !!own[k]);
        b.classList.toggle('wear', wear === k);
        b.classList.toggle('poor', !own[k] && save.coins < list[k].price);
        b.setAttribute('aria-label', list[k].name + (wear === k ? ' (تلبسه الشرارة)' : own[k] ? '' : '، السعر ' + list[k].price));
      });
    });
    chip('shopCoins', save.coins);
  }
  function openShop() { J.select(); refreshShop(); setScreen('shop'); }
  function buy(kind, k, el) {
    const did = SH.buy(save, kind, k);
    if (!did) { J.error(); wiggle(el); return; }
    persist();
    if (did === 'bought') {
      J.coin(3); J.levelUp();
      const r = el.getBoundingClientRect(), p = view.toLogical(r.left + r.width / 2, r.top + r.height / 3);
      fx.burst(p.x, p.y, { count: 30, colors: ['#ffd23f', '#ffffff', '#3df0ff'], speed: 340, life: 0.8, size: 8, gravity: 300 });
    } else J.tap();
    refreshShop();
  }

  /* --------------------------------------------------------------- play */
  // The difficulty is read at every level start and handed to the engine as numbers.
  function params() {
    const E = SH.EASY, D = SH.HARD;
    return { width: dda.value(E.width, D.width), speed: dda.value(E.speed, D.speed), spacing: dda.value(E.spacing, D.spacing), open: dda.value(E.open, D.open) };
  }
  let doorIcons = [], carryIcons = [];
  function startLevel(i) {
    leaveLevel();
    cur = i;
    world = SH.create(i, params());
    tried = true;
    resetPlay();
    // Play stats: every level try is a round; the hand that shows how to carry the spark is the tutorial.
    Kit.stats.round('L' + (i + 1));
    if (!save.coach) Kit.stats.tutorial('start');
    const L = world.L;
    // Where the "how to open" picture of each door goes: beside the track, with room.
    doorIcons = L.gates.map(d => spotBeside(L, d, d.half + 46));
    carryIcons = L.carry.map(c => { const p = SH.at(L, c[0]); return spotBeside(L, p, p.hw + 44); });
    intro = 2.6;
    setScreen('play');
    J.whoosh(0.5);
    say(L.R.id + ' ' + L.R.name);
  }
  function spotBeside(L, p, off) {
    let best = null, room = -Infinity;
    [-1, 1].forEach(side => {
      const x = p.x + p.nx * side * off, y = p.y + p.ny * side * off;
      const m = x > 50 && x < W - 50 && y > 110 && y < H - 40 ? -SH.inside(L, x, y, 0) : -999 - Math.abs(x - W / 2) * 0.01;
      if (m > room) { room = m; best = { x: clamp(x, 50, W - 50), y: clamp(y, 110, H - 40) }; }
    });
    return best;
  }
  function resetPlay() {
    fx.clear(); trail = []; arcs = []; floats = []; flashes = []; cpPop = []; fly = null; hint = null;
    celebrate = 0; result = null; ptrQ = []; pressQ = null; outQ = false; timers = [];
    coach.idle = 0; coach.on = false; coach.t = 0;
    lastX = world.x; lastY = world.y; vx = vy = 0; trailGap = 0;
    Kit.keys.reset();
  }
  // Leaving a level half way is a try too, when the child really tried it.
  function leaveLevel() {
    Kit.stats.end('quit'); // a level left unfinished (nothing when it was finished)
    if (world && tried && !world.done && (world.touches > 0 || world.best - world.L.start.s > world.L.len * 0.25)) dda.result(SH.outcome(false, world.touches));
    tried = false;
  }
  function restart() {
    if (!world) return;
    J.select();
    startLevel(cur);
  }
  function dropSpark(why) { if (world) SH.drop(world, why); }
  function pause(own) {
    if (screen !== 'play') return;
    dropSpark('pause');
    ptr.down = false; ptrQ = []; pressQ = null;
    setScreen('pause');
    if (own) J.back();
  }
  function resume() {
    if (screen !== 'pause') return;
    J.select();
    ptrQ = []; pressQ = null; outQ = false;
    setScreen('play');
    Kit.keys.reset();
  }

  /* --------------------------------------------------------- the result */
  function onGoal() {
    const L = world.L, stars = SH.stars(L, world.touches, world.clock), before = save.lv[cur].s;
    const res = SH.applyResult(save, cur, stars, world.clock, world.coins);
    if (!save.coach) { save.coach = true; Kit.stats.tutorial('done'); }
    persist();
    dda.result(SH.outcome(true, world.touches));
    Kit.stats.end('win', stars);
    tried = false;
    result = { stars: stars, before: before, res: res, touches: world.touches, time: world.clock, par: L.par, got: world.got, all: L.coins.length };
    celebrate = CELEBRATE;
    J.levelUp();
    const e = L.end;
    if (!calm()) for (let k = 0; k < 4; k++) fx.burst(e.x, e.y, { count: 24, colors: ['#ffd23f', '#ffffff', '#ff7ab6', '#3df0ff', '#8dff5a'], speed: 420, life: 1.1, size: 9, gravity: 380 });
    shake.add(4);
  }
  function showResult() {
    const r = result, R = SH.LEVELS[cur];
    resultT = 0; resultLock = 0.6;
    $('resTitle').textContent = r.stars === 3 ? 'ممتاز!' : r.stars === 2 ? 'رائع!' : 'أحسنت!';
    $('resStars').querySelectorAll('svg').forEach((s, i) => { s.classList.toggle('on', i < Math.min(r.before, r.stars)); s.classList.remove('pop'); });
    $('resTouch').querySelector('b').textContent = String(r.touches);
    $('resTouch').classList.toggle('good', !r.touches);
    $('resTime').querySelector('b').textContent = r.time.toFixed(1) + ' / ' + r.par;
    $('resTime').classList.toggle('good', r.time <= r.par);
    $('resCoins').querySelector('b').textContent = r.got + '/' + r.all;
    $('resCoins').hidden = !r.all;
    $('resBest').hidden = true;
    $('resWorld').hidden = true;
    $('resNext').hidden = cur + 1 >= SH.LEVELS.length;
    say(R.id + '، ' + r.stars + ' نجوم');
    setScreen('result');
  }
  function resultStep(dt) {
    const r = result, before = resultT;
    resultT += dt;
    const at = t => before < t && resultT >= t;
    for (let i = Math.min(r.before, r.stars); i < r.stars; i++) {
      if (at(0.35 + (i - Math.min(r.before, r.stars)) * 0.4)) {
        const s = $('resStars').children[i]; s.classList.add('on', 'pop'); J.star(i + 1);
        fx.burst(560 + i * 106, 250, { count: 18, colors: ['#ffd23f', '#ffffff'], speed: 300, life: 0.7, size: 8, gravity: 300 });
      }
    }
    const late = 0.5 + Math.max(0, r.stars - r.before) * 0.4;
    if (at(late)) {
      if (r.res.best) { $('resBest').hidden = false; J.chime(2); }
      if (r.res.world >= 0) { $('resWorld').hidden = false; J.levelUp(); }
      if (r.res.coins) J.coin(r.res.coins);
    }
  }
  function resultNext() {
    if (!result || resultLock > 0) return;
    if (cur + 1 >= SH.LEVELS.length) { J.back(); toMap(); return; }
    J.select(); startLevel(cur + 1);
  }
  function resultAgain() { if (result && resultLock <= 0) { J.select(); startLevel(cur); } }

  /* --------------------------------------------------------------- input */
  // A mouse click hands the keyboard back to the game; keyboard activation keeps focus.
  // The second click of a double click (detail 2) is dropped: the first one already acted.
  function on(el, fn) {
    el.addEventListener('click', e => { e.stopPropagation(); if (e.detail > 1) return; Kit.audio.unlock(); if (e.detail > 0) { el.blur(); focusGame(); } fn(e); });
  }
  on($('btnPlay'), play);
  on($('btnLevels'), () => { J.select(); toMap(); });
  on($('btnShop'), openShop);
  on($('mapHome'), () => { J.back(); toTitle(); });
  on($('shopBack'), () => { J.back(); toTitle(); });
  on($('btnPause'), () => pause(true));
  on($('btnResume'), resume);
  on($('btnRestart'), restart);
  on($('btnMap'), () => { J.back(); toMap(); });
  on($('resNext'), resultNext);
  on($('resAgain'), resultAgain);
  on($('resMap'), () => { if (resultLock <= 0) { J.back(); toMap(); } });

  const toLogical = e => view.toLogical(e.clientX, e.clientY);
  const inFrame = p => p.x >= 0 && p.x <= W && p.y >= 0 && p.y <= H;
  // Every pointer position (the coalesced ones too) is queued: the spark follows the
  // hand's own path, not a straight line to wherever the pointer is at the next frame.
  window.addEventListener('pointermove', e => {
    const list = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
    for (const ev of list && list.length ? list : [e]) {
      const p = toLogical(ev);
      if (inFrame(p)) ptrQ.push([p.x, p.y]); else outQ = true;
    }
    if (ptrQ.length > 96) ptrQ.splice(0, ptrQ.length - 96);
    const p = toLogical(e);
    ptr.x = p.x; ptr.y = p.y; ptr.inside = inFrame(p);
    if (!ptr.inside) outQ = true;
    // A button let go outside the window.
    if (ptr.down && e.buttons === 0) ptr.down = false;
    coach.idle = Math.min(coach.idle, 0.5);
  });
  canvas.addEventListener('pointerdown', e => {
    focusGame();
    if (e.button !== 0) return;
    const p = toLogical(e);
    ptr.x = p.x; ptr.y = p.y; ptr.inside = inFrame(p); ptr.down = true;
    if (screen === 'play') pressQ = { x: p.x, y: p.y };
  });
  window.addEventListener('pointerup', e => { if (e.button === 0) ptr.down = false; });
  window.addEventListener('pointercancel', () => { ptr.down = false; outQ = true; });
  // Leaving the game's picture (or the window) drops the spark where it is: safe.
  canvas.addEventListener('pointerleave', () => { ptr.inside = false; outQ = true; });
  window.addEventListener('pointerout', e => { if (!e.relatedTarget) { ptr.inside = false; outQ = true; } });

  function handleKeys() {
    const K = Kit.keys, go = K.anyPressed(KEYS_GO);
    if (screen === 'title') { if (go) play(); }
    else if (screen === 'map') { if (go) { J.select(); startLevel(SH.nextLevel(save)); } else if (K.pressed('Escape')) { J.back(); toTitle(); } }
    else if (screen === 'shop') { if (go || K.pressed('Escape')) { J.back(); toTitle(); } }
    else if (screen === 'play') {
      if (K.anyPressed(['KeyP', 'Escape'])) pause(true);
      else if (K.pressed('KeyR') && !celebrate) restart();
    } else if (screen === 'pause') { if (K.anyPressed(['KeyP', 'Escape', 'Enter', 'NumpadEnter', 'Space'])) resume(); else if (K.pressed('KeyR')) restart(); }
    else if (screen === 'result' && resultLock <= 0) {
      if (go) resultNext(); else if (K.pressed('KeyR')) resultAgain();
      else if (K.pressed('Escape')) { J.back(); toMap(); }
    }
  }

  /* ------------------------------------------------------------ events */
  function bzzt() {
    const a = Kit.audio;
    if (!a.ctx || a.muted) return;
    a.tone({ freq: 150, to: 92, type: 'sawtooth', dur: 0.24, vol: 0.14 });
    a.tone({ freq: 74, to: 60, type: 'square', dur: 0.2, vol: 0.08, delay: 0.015 });
    a.noise({ dur: 0.16, vol: 0.12, filter: 3600, to: 900 });
  }
  function float(x, y, text, color, size) {
    floats.push({ x: x, y: y, text: text, color: color, size: size || 34, t: 0 });
    if (floats.length > 10) floats.shift();
  }
  const SILLY = ['بززز!', 'أوه!', 'زززت!'];
  function handleEvents() {
    const L = world.L;
    for (const e of world.ev) {
      switch (e.t) {
        case 'grab':
          J.pop(0.35); coach.on = false; coach.idle = 0; hint = null;
          break;
        case 'drop': if (e.why === 'release') J.tap(); break;
        case 'touch':
          Kit.track.miss();
          bzzt(); shake.add(9);
          arcs.push({ x: e.hx, y: e.hy, sx: e.x, sy: e.y, t: 0, seed: (Math.random() * 1e9) | 0 });
          if (arcs.length > 4) arcs.shift();
          fly = { fx: e.x, fy: e.y, tx: e.to.x, ty: e.to.y, t: 0 };
          fx.burst(e.hx, e.hy, { count: 16, colors: ['#ffffff', '#fff3a8', A.HOT], speed: 260, life: 0.45, size: 5, gravity: 0 });
          float(e.hx, e.hy - 40, SILLY[world.touches % SILLY.length], '#ffe3ea', 42);
          flashes.push({ x: e.hx, y: e.hy, t: 0 });
          trail = [];
          later(0.3, () => J.whoosh(0.35));
          break;
        case 'cp': {
          const cp = L.cps[e.i];
          Kit.track.hit();
          J.chime(1); cpPop[e.i] = 1;
          fx.burst(cp.lx, cp.ly - 6, { count: 14, colors: ['#ffd23f', '#ffffff'], speed: 200, life: 0.6, size: 6, gravity: 200 });
          break;
        }
        case 'coin':
          J.coin(world.got);
          fx.burst(e.x, e.y, { count: 18, colors: ['#ffd23f', '#ffffff', '#ffb800'], speed: 260, life: 0.6, size: 6, gravity: 250 });
          float(e.x, e.y - 30, '+1', '#ffd23f', 34);
          break;
        case 'open': J.toggle(true); break;
        case 'shut': J.toggle(false); break;
        case 'block': J.land(0.35); hint = { kind: 'door', t: 0, i: e.door }; break;
        case 'stuck': J.error(); hint = { kind: 'carry', t: 0, x: e.x, y: e.y }; break;
        case 'goal': onGoal(); break;
      }
    }
    world.ev.length = 0;
  }
  // Little delays on the game clock (a pause freezes them; a new level drops them).
  function later(t, fn) { timers.push({ t: t, fn: fn }); }

  /* ----------------------------------------------------------------- loop */
  function playStep(dt) {
    const K = Kit.keys, L = world.L;
    if (celebrate > 0) {
      SH.step(world, dt, {});
      world.ev.length = 0;
      ptrQ = []; pressQ = null; outQ = false;
      celebrate -= dt;
      if (celebrate <= 0) showResult();
      return;
    }
    // A click (or Space / Enter) opens the doors.
    const inp = { pts: ptrQ, down: ptr.down, press: pressQ, x: ptr.inside ? ptr.x : null, y: ptr.inside ? ptr.y : null,
      door: K.anyPressed(KEYS_GO) || !!pressQ, out: outQ };
    ptrQ = []; pressQ = null; outQ = false;
    SH.step(world, dt, inp);
    handleEvents();
    // The first real drag ends the first lesson's hand.
    if (!save.coach && world.dragged > 120) { save.coach = true; Kit.stats.tutorial('done'); }
    // Coach: after a few idle seconds without the spark, the hand shows what to do.
    if (world.held || world.done || world.stun > 0) { coach.idle = 0; coach.on = false; }
    else {
      coach.idle += dt;
      if (!coach.on && coach.idle > (save.coach ? 6 : 1.2)) { coach.on = true; coach.t = 0; }
    }
    if (coach.on) { coach.t += dt; if (coach.t > 3.2) { coach.on = false; coach.idle = save.coach ? 2 : 0.4; } }
    // The mouse pointer: hidden while the spark is the pointer, a hand over the spark.
    const over = ptr.inside && Math.hypot(ptr.x - world.x, ptr.y - world.y) <= SH.GRAB;
    cursor(world.held ? 'held' : over && L.mode === 'drag' && world.stun <= 0 ? 'grab' : '');
    if (intro > 0) intro -= dt;
  }
  function decay(dt) {
    for (let i = arcs.length - 1; i >= 0; i--) { arcs[i].t += dt; if (arcs[i].t > 0.45) arcs.splice(i, 1); }
    for (let i = flashes.length - 1; i >= 0; i--) { flashes[i].t += dt; if (flashes[i].t > 0.35) flashes.splice(i, 1); }
    for (let i = floats.length - 1; i >= 0; i--) { const f = floats[i]; f.t += dt; if (!calm()) f.y -= dt * 40; if (f.t > 1.2) floats.splice(i, 1); }
    for (let i = trail.length - 1; i >= 0; i--) { trail[i].t += dt; if (trail[i].t > trail[i].life) trail.splice(i, 1); }
    for (let i = 0; i < cpPop.length; i++) if (cpPop[i]) cpPop[i] = Math.max(0, cpPop[i] - dt * 3);
    for (let i = timers.length - 1; i >= 0; i--) { const q = timers[i]; q.t -= dt; if (q.t <= 0) { timers.splice(i, 1); if (screen === 'play') q.fn(); } }
    if (fly) { fly.t += dt; if (fly.t >= FLY) fly = null; }
    if (hint) { hint.t += dt; if (hint.t > 3) hint = null; }
    blink = blink > 0 ? blink - dt : (Math.random() < dt * 0.35 ? 0.14 : 0);
  }
  // The spark's trail: a few glowing bits left behind as it moves (none when motion is calm).
  function trailStep(dt) {
    const x = world.x, y = world.y, d = Math.hypot(x - lastX, y - lastY);
    vx += ((x - lastX) / dt - vx) * 0.25; vy += ((y - lastY) / dt - vy) * 0.25;
    if (d > 60) { lastX = x; lastY = y; return; }
    trailGap += d;
    if (!calm() && trailGap > 7 && !fly) {
      trailGap = 0;
      trail.push({ x: x - (x - lastX) * 0.5 + (Math.random() - 0.5) * 6, y: y - (y - lastY) * 0.5 + (Math.random() - 0.5) * 6, t: 0, life: 0.5, r: 3 + Math.random() * 2.5, rot: Math.random() * 6, hue: time * 300 });
      if (trail.length > 70) trail.shift();
    }
    lastX = x; lastY = y;
  }
  function update(dt) {
    time += dt;
    handleKeys();
    if (screen === 'play' && world) { playStep(dt); trailStep(dt); }
    else { ptrQ = []; pressQ = null; outQ = false; }
    if (screen !== 'pause') {
      fx.update(dt); shake.update(dt); decay(dt);
      if (fx.list.length > 300) fx.list.splice(0, fx.list.length - 300);
      if (screen === 'result' && result) resultStep(dt);
      if (resultLock > 0) resultLock -= dt;
    }
    Kit.keys.endFrame();
  }

  /* --------------------------------------------------------------- render */
  function trailColor(kind, col, hue) {
    if (kind === 4) return 'hsl(' + Math.round(hue % 360) + ',95%,65%)';
    if (kind === 1) return '#fff3a8';
    if (kind === 2) return '#ff7ab6';
    return col.body;
  }
  function drawTrail(ctx, col) {
    const kind = save.trail;
    for (const p of trail) {
      const k = 1 - p.t / p.life;
      ctx.globalAlpha = k;
      if (kind === 0) A.glow(ctx, p.x, p.y, p.r * 4 * k + 2, col.glow, 0.9);
      A.trailBit(ctx, kind, p.x, p.y, p.r * (0.5 + k * 0.5), trailColor(kind, col, p.hue), p.rot);
    }
    ctx.globalAlpha = 1;
  }
  function sparkPos() {
    if (fly) {
      const k = Math.min(1, fly.t / FLY), e = k * k * (3 - 2 * k);
      return { x: fly.fx + (fly.tx - fly.fx) * e, y: fly.fy + (fly.ty - fly.fy) * e - Math.sin(k * Math.PI) * 90, k: k };
    }
    return { x: world.x, y: world.y, k: 1 };
  }
  function drawSpark(ctx, still) {
    const col = SH.COLORS[save.color], p = sparkPos(), sp = Math.hypot(vx, vy);
    let face = '', hop = 0, scale = 1;
    if (world.stun > 0) face = 'dizzy';
    else if (world.done) { face = 'win'; hop = still ? 0 : Math.abs(Math.sin(time * 8)) * 12; }
    else if (world.held) face = 'happy';
    if (!still && world.held) scale = 1 + Math.min(0.12, sp / 4000);
    if (!still && !world.held && !world.done && !fly) hop = Math.sin(time * 3) * 2;
    if (world.held && !still) A.glow(ctx, p.x, p.y, 50, col.glow, 0.55);
    A.spark(ctx, p.x, p.y - hop, { col: col, face: face, lx: vx / 300, ly: vy / 300, t: time, still: still, blink: blink > 0 && !world.held, scale: scale });
  }
  function drawWorld(ctx) {
    const L = world.L, still = calm(), t = world.t;
    ctx.drawImage(A.track(L, pixelScale()), 0, 0, W, H);
    A.pulses(ctx, L, t);
    L.cps.forEach((cp, i) => A.lantern(ctx, cp, i <= world.cp, time, still, cpPop[i]));
    L.coins.forEach((c, i) => { if (!world.coins[i]) A.coin(ctx, c.x, c.y, time, still); });
    L.carry.forEach((c, i) => { const p = carryIcons[i]; if (p) A.mouseIcon(ctx, p.x, p.y, 0.75 + (still ? 0 : 0.05 * Math.sin(time * 5)), true, '#ffbe3c'); });
    L.gates.forEach((d, i) => {
      const a = world.gates[i].a;
      A.door(ctx, d, a, time, still);
      if (a < 0.5 && doorIcons[i]) doorHint(ctx, doorIcons[i], hint && hint.kind === 'door' && hint.i === i ? 1.25 : 1, still);
    });
    L.obs.forEach(o => { if (o.k === 'slide') A.slide(ctx, o, t); else A.spin(ctx, o, t); });
    A.bulb(ctx, L.end.x, L.end.y, Math.max(24, L.end.hw * 0.62), L.end.tx, L.end.ty, world.done, time, still);
    drawTrail(ctx, SH.COLORS[save.color]);
    if (coach.on) drawCoach(ctx, still);
    drawSpark(ctx, still);
    drawFx(ctx, still);
    drawHud(ctx, still);
  }
  function doorHint(ctx, p, k, still) {
    const b = still ? 0 : Math.sin(time * 5) * 3;
    ctx.save(); ctx.translate(p.x, p.y + b); ctx.scale(k, k);
    A.rr(ctx, -70, -34, 140, 68, 22); ctx.fillStyle = 'rgba(10,14,44,0.82)'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#ff9f1c'; ctx.stroke();
    A.mouseIcon(ctx, -40, 4, 0.5, true, '#ff9f1c');
    A.keycap(ctx, 24, 6, 'مسافة', 78);
    ctx.restore();
  }
  function drawFx(ctx, still) {
    fx.draw(ctx);
    // A ring of light where the spark touched the wall.
    for (const f of flashes) {
      const k = f.t / 0.35;
      A.circle(ctx, f.x, f.y, still ? 26 : 12 + k * 40); ctx.lineWidth = 6 * (1 - k) + 1; ctx.strokeStyle = 'rgba(255,77,122,' + (1 - k).toFixed(2) + ')'; ctx.stroke();
    }
    for (const a of arcs) {
      const k = 1 - a.t / 0.45;
      let s = still ? a.seed : a.seed + Math.floor(time * 30);
      const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
      ctx.globalAlpha = Math.max(0, k);
      A.glow(ctx, a.x, a.y, 46, '#ffffff', 0.8);
      A.arc(ctx, a.sx, a.sy, a.x, a.y, rnd, A.HOT, 4);
      for (let j = 0; j < 4; j++) { const an = rnd() * 6.28, r = 22 + rnd() * 26; A.arc(ctx, a.x, a.y, a.x + Math.cos(an) * r, a.y + Math.sin(an) * r, rnd, '#3df0ff', 2.5); }
      ctx.globalAlpha = 1;
    }
    for (const f of floats) {
      ctx.globalAlpha = Math.max(0, 1 - Math.max(0, f.t - 0.7) / 0.5);
      A.text(ctx, f.text, f.x, f.y, f.size, f.color);
    }
    ctx.globalAlpha = 1;
  }
  // The wordless coach: a hand glides to the spark, presses (or just touches it in
  // no-button levels) and shows the way along the wire. It never moves the spark.
  function drawCoach(ctx, still) {
    const L = world.L, ct = coach.t, hover = L.mode === 'hover' && !SH.inCarry(L, world.s);
    const from = { x: world.x + 130, y: world.y + 110 };
    let x, y, press = 0, ghost = null;
    const alpha = Math.min(1, ct * 4, (3.2 - ct) * 3);
    if (ct < 0.7 || still) {
      const k = still ? 1 : ct / 0.7, e = k * k * (3 - 2 * k);
      x = from.x + (world.x - from.x) * e; y = from.y + (world.y - from.y) * e;
    } else if (ct < 1.05) { x = world.x; y = world.y; press = hover ? 0 : Math.sin((ct - 0.7) / 0.35 * Math.PI / 2); }
    else {
      const k = Math.min(1, (ct - 1.05) / 1.6), p = SH.at(L, Math.min(L.len, world.s + k * 170));
      x = p.x; y = p.y; press = hover ? 0 : 1; ghost = p;
    }
    if (ghost) {
      ctx.globalAlpha = alpha * 0.55;
      A.spark(ctx, ghost.x, ghost.y, { col: SH.COLORS[save.color], t: time, still: true, face: 'happy' });
      ctx.globalAlpha = 1;
    }
    if (press && !hover) { A.circle(ctx, x, y, 24 + press * 6); ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(255,214,60,' + (0.8 * alpha).toFixed(2) + ')'; ctx.stroke(); }
    A.hand(ctx, x, y + 6, press, alpha * 0.95);
  }
  const hudFont = n => '700 ' + n + 'px Fredoka';
  function drawHud(ctx, still) {
    const L = world.L, wd = SH.WORLDS[L.world];
    // The pill at the top, read right to left: the level, the touches, the coins, the
    // clock (green while the time star can still be won). Each icon has its number on its left.
    const x0 = 404, w = 472, R = x0 + w;
    A.rr(ctx, x0, 10, w, 58, 29); ctx.fillStyle = 'rgba(10,14,44,0.82)'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = wd.color; ctx.stroke();
    A.rr(ctx, R - 92, 16, 84, 46, 23); ctx.fillStyle = wd.color; ctx.fill();
    A.text(ctx, L.R.id, R - 50, 40, 30, A.INK, { stroke: false });
    ctx.save(); ctx.translate(R - 116, 39); ctx.scale(0.55, 0.55);
    ctx.beginPath(); ctx.moveTo(6, -28); ctx.lineTo(-20, 4); ctx.lineTo(-3, 4); ctx.lineTo(-10, 28); ctx.lineTo(20, -8); ctx.lineTo(2, -8); ctx.closePath();
    ctx.fillStyle = world.touches ? A.HOT : '#ffd23f'; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = '#fff'; ctx.stroke();
    ctx.restore();
    A.text(ctx, String(world.touches), R - 134, 40, 30, world.touches ? '#ffb3c6' : '#ffffff', { align: 'right', stroke: false });
    if (L.coins.length) {
      A.coin(ctx, R - 214, 39, 0, true);
      A.text(ctx, world.got + '/' + L.coins.length, R - 236, 40, 28, '#ffe98a', { align: 'right', stroke: false });
    }
    const late = world.clock > L.par, tx = R - 330;
    A.circle(ctx, tx, 39, 15); ctx.fillStyle = late ? '#8a90b8' : '#3ddc84'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke();
    const ang = -Math.PI / 2 + Math.min(1, world.clock / L.par) * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(tx, 39); ctx.lineTo(tx + Math.cos(ang) * 10, 39 + Math.sin(ang) * 10); ctx.lineWidth = 3; ctx.strokeStyle = A.INK; ctx.stroke();
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.direction = 'ltr';
    ctx.font = hudFont(20); ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillText('/' + L.par, tx - 22, 44);
    const pw = ctx.measureText('/' + L.par).width;
    ctx.font = hudFont(28); ctx.fillStyle = late ? '#9aa0c8' : '#ffffff'; ctx.fillText(String(Math.floor(world.clock)), tx - 24 - pw, 41);
    // The level's name and how it is played, for a moment at the start.
    if (intro > 0 && !world.done) {
      const a = Math.min(1, intro / 0.5, (2.6 - intro) / 0.25 + 0.2);
      ctx.globalAlpha = clamp(a, 0, 1);
      const y = 112 + (still ? 0 : Math.max(0, intro - 2.3) * 60);
      const mode = L.mode === 'drag' ? 'اضغط واسحب' : 'بلا ضغط';
      ctx.font = hudFont(34); const nw = ctx.measureText(L.R.name).width;
      ctx.font = hudFont(26); const mw = ctx.measureText(mode).width;
      const bw = nw + mw + 130, bx = 640 - bw / 2;
      A.rr(ctx, bx, y - 34, bw, 68, 34); ctx.fillStyle = 'rgba(10,14,44,0.86)'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = wd.color; ctx.stroke();
      A.text(ctx, L.R.name, bx + bw - 32, y + 1, 34, '#ffffff', { stroke: false, align: 'right' });
      A.text(ctx, mode, bx + bw - 66 - nw, y + 1, 26, L.mode === 'drag' ? '#ffd23f' : '#8dff5a', { stroke: false, align: 'right' });
      A.mouseIcon(ctx, bx + 40, y + 4, 0.55, L.mode === 'drag', '#ffd23f');
      ctx.globalAlpha = 1;
    }
    // "Hold the button here", after the spark stopped at a carry stretch.
    if (hint && hint.kind === 'carry') {
      const k = Math.min(1, hint.t * 5), y = hint.y - 70;
      ctx.globalAlpha = Math.min(1, (3 - hint.t) * 2);
      A.rr(ctx, hint.x - 110, y - 36, 220, 72, 24); ctx.fillStyle = 'rgba(10,14,44,0.88)'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = '#ffbe3c'; ctx.stroke();
      A.mouseIcon(ctx, hint.x - 72, y + 6, 0.6 * k, !still && Math.sin(time * 8) > -0.3, '#ffbe3c');
      A.text(ctx, 'اضغط مطولًا', hint.x + 22, y + 2, 28, '#ffbe3c', { stroke: false });
      ctx.globalAlpha = 1;
    }
  }
  function drawMenu(ctx) {
    const still = calm(), ps = pixelScale();
    if (screen === 'title') {
      ctx.drawImage(A.track(titleL, ps), 0, 0, W, H);
      const s = still ? titleL.len * 0.45 : (time * 170) % (titleL.len + 300) - 150, p = SH.at(titleL, clamp(s, 20, titleL.len - 20));
      A.bulb(ctx, titleL.end.x, titleL.end.y, 22, titleL.end.tx, titleL.end.ty, s >= titleL.len - 25, time, still);
      A.spark(ctx, p.x, p.y, { col: SH.COLORS[save.color], t: time, still: still, face: 'happy', lx: 1 });
    } else {
      const wd = screen === 'map' ? Math.floor(SH.nextLevel(save) / 6) : 3;
      ctx.drawImage(A.backdrop(wd, ps), 0, 0, W, H);
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

  canvas.addEventListener('contextrestored', () => { A.reset(); dirty = true; if (screen === 'shop') refreshShop(); });
  if (document.fonts && document.fonts.load) {
    // Text drawn into cached pictures is drawn again once the font is there.
    document.fonts.load('700 40px Fredoka', 'سلك 5').then(() => { dirty = true; if (screen === 'shop') refreshShop(); }, () => { /* fallback fonts */ });
  }

  /* --------------------------------------------------- test and debug hook */
  const page = (x, y) => { const r = canvas.getBoundingClientRect(); return { x: r.left + x * view.scale, y: r.top + y * view.scale }; };
  const r1 = v => Math.round(v * 10) / 10;
  window.__game = {
    get state() {
      const w = world;
      return {
        screen: screen, paused: screen === 'pause', level: cur, id: w ? w.L.R.id : '', mode: w ? w.L.mode : '',
        held: !!(w && w.held), spark: w ? { x: r1(w.x), y: r1(w.y) } : null, touches: w ? w.touches : 0, cp: w ? w.cp : -1,
        best: w ? r1(w.best) : 0, progress: w ? Math.round(w.best / w.L.len * 1000) / 1000 : 0, coins: w ? w.got : 0,
        done: !!(w && w.done), time: w ? Math.round(w.t * 1000) / 1000 : 0, clock: w ? Math.round(w.clock * 100) / 100 : 0,
        dragged: w ? r1(w.dragged) : 0, grabs: w ? w.grabs : 0, stun: w ? w.stun : 0, doors: w ? w.gates.map(g => Math.round(g.a * 100) / 100) : [],
        width: w ? Math.round(w.L.P.width * 1000) / 1000 : 0, tier: dda.tier, trail: trail.length, fx: fx.list.length, shake: shake.power,
        stars: result ? result.stars : 0, celebrate: celebrate > 0, coach: coach.on,
        atStart: !!(w && !w.touches && !w.dragged && Math.hypot(w.x - w.L.start.x, w.y - w.L.start.y) < 0.5)
      };
    },
    get save() { return JSON.parse(JSON.stringify(save)); },
    // Where a logical point is on the page, for tests that move the real mouse there.
    point: page,
    // A point of the centre line at arc length s (logical px).
    at: s => { const p = SH.at(world.L, s); return { x: p.x, y: p.y, hw: p.hw }; },
    get track() {
      const L = world.L;
      return { len: L.len, par: L.par, start: { x: L.start.x, y: L.start.y, s: L.start.s }, end: { x: L.end.x, y: L.end.y },
        cps: L.cps.map(c => ({ s: c.s, x: c.x, y: c.y })), doors: L.gates.map(d => ({ s: d.s, x: d.x, y: d.y })),
        parts: L.obs.map(o => ({ k: o.k, s: o.s, zone: o.zone })), coins: L.coins.map(c => ({ x: c.x, y: c.y, s: c.s })), carry: L.carry };
    }
  };

  buildMap();
  buildShop();
  Kit.muteButton();
  Kit.lifecycle({ pause: () => pause(false), reset: () => { ptr.down = false; pressQ = null; ptrQ = []; dropSpark('focus'); } });
  toTitle();
  Kit.loop(update, render);
  Kit.ready();
})();
