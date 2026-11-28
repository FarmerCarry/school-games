/* Steady Hand (سلك الشرارة): screens, the mouse and the keyboard, the wordless coach,
 * saves and sound. engine.js moves the spark and keeps the rules; art.js draws.
 * This is the UI layer: it reads Kit.dda at every level start (track width, speed of the
 * moving parts, checkpoint spacing, how long doors stay open) and reports each try. */
(function () {
  'use strict';
  const A = SH.art, J = Kit.juice, W = SH.W, H = SH.H;
  const $ = id => document.getElementById(id);
  const bg = $('bg'), bgCtx = bg.getContext('2d', { alpha: false }), canvas = $('game'), ui = $('ui');
  const calm = () => Kit.motion.reduced();
  const clamp = Kit.clamp;
  let dirty = true, bgSrc = null, shOn = false;
  const ptr = { x: W / 2, y: H / 2, inside: false, down: false, l: 0, t: 0, s: 1, r: [], h: 0 };
  const view = Kit.fit(canvas, W, H, { maxDpr: 1.5, onResize: v => {
    ptr.l = parseInt(canvas.style.left) || 0; ptr.t = parseInt(canvas.style.top) || 0; ptr.s = 1 / v.scale;
    bg.style.cssText = canvas.style.cssText; bg.width = canvas.width; bg.height = canvas.height; bgSrc = null;
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
  const trail = [], ptrQ = [];
  let trailN = 0, arcs = [], floats = [], flashes = [], cpPop = [], fly = null, hint = null, lastX = 0, lastY = 0, vx = 0, vy = 0, blink = 0, trailGap = 0;
  let timers = [], hudW = null, pressQ = null, outQ = false;
  const coach = { idle: 0, on: false, t: 0 };
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
  const focusGame = () => { try { canvas.focus({ preventScroll: true }); } catch (e) { /* ignore */ } };
  const say = t => { $('live').textContent = t; };
  const mk = t => document.createElement(t), cls = (el, c, v) => el.classList.toggle(c, v), aria = (el, s) => el.setAttribute('aria-label', s), qB = id => $(id).querySelector('b');
  const chip = (id, n) => { qB(id).textContent = String(n); };
  let cursorNow = '';
  const cursor = c => { if (c !== cursorNow) { cursorNow = c; canvas.className = c; } };
  const wiggle = el => { el.classList.remove('wiggle'); void el.offsetWidth; el.classList.add('wiggle'); setTimeout(() => el.classList.remove('wiggle'), 500); };

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
  const levelBtns = [], rows = [], PAGE_WORLDS = 5;
  let mapPage = 0;
  function buildMap() {
    const box = $('worlds');
    SH.WORLDS.forEach((wd, wi) => {
      const row = mk('div');
      row.className = 'wrow'; row.style.setProperty('--wc', wd.color);
      row.innerHTML = '<div class="wname"><i>العالم ' + (wi + 1) + '</i><b>' + wd.name + '</b></div>';
      for (let k = 0; k < 6; k++) {
        const i = wi * 6 + k, b = mk('button');
        b.type = 'button'; b.className = 'sh-btn lvl';
        b.innerHTML = '<b>' + (k + 1) + '</b><span class="st">' + '<svg><use href="#i-star"/></svg>'.repeat(3) + '</span><svg class="lk" aria-hidden="true"><use href="#i-lock"/></svg>';
        on(b, () => pickLevel(i, b));
        row.appendChild(b); levelBtns.push(b);
      }
      box.appendChild(row); rows.push(row);
    });
  }
  function setMapPage(p) {
    const pages = Math.max(1, Math.ceil(SH.WORLDS.length / PAGE_WORLDS));
    mapPage = clamp(p | 0, 0, pages - 1);
    rows.forEach((r, wi) => { r.hidden = Math.floor(wi / PAGE_WORLDS) !== mapPage; });
    for (let k = 0; k < 2; k++) {
      const tab = $('tabP' + k);
      if (!tab) continue;
      cls(tab, 'on', k === mapPage);
      tab.setAttribute('aria-selected', k === mapPage ? 'true' : 'false');
    }
    dirty = true;
  }
  function refreshMap() {
    if (!levelBtns.length) buildMap();
    const next = SH.nextLevel(save);
    levelBtns.forEach((b, i) => {
      const open = SH.isOpen(save, i), st = save.lv[i].s, R = SH.LEVELS[i];
      cls(b, 'locked', !open);
      cls(b, 'next', open && i === next);
      b.querySelectorAll('.st svg').forEach((s, k) => cls(s, 'on', k < st));
      aria(b, R.id + ' ' + R.name + (open ? '، ' + st + ' من 3 نجوم' : ' (مقفلة)'));
    });
    rows.forEach((r, wi) => cls(r, 'locked', !SH.isOpen(save, wi * 6)));
    if ($('tabP1')) cls($('tabP1'), 'locked', !SH.isOpen(save, PAGE_WORLDS * 6));
    setMapPage(mapPage);
    chip('mapStars', SH.totalStars(save) + '/' + SH.LEVELS.length * 3);
  }
  function toMap() {
    leaveLevel();
    mapPage = Math.floor(SH.nextLevel(save) / (PAGE_WORLDS * 6));
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
        const b = mk('button');
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
    if (!tiles.color.length) buildShop();
    ['color', 'trail'].forEach(kind => {
      const own = kind === 'trail' ? save.trails : save.colors, wear = kind === 'trail' ? save.trail : save.color, list = kind === 'trail' ? SH.TRAILS : SH.COLORS;
      tiles[kind].forEach((b, k) => {
        drawTile(kind, k, b.querySelector('canvas'));
        cls(b, 'own', !!own[k]);
        cls(b, 'wear', wear === k);
        cls(b, 'poor', !own[k] && save.coins < list[k].price);
        aria(b, list[k].name + (wear === k ? ' (تلبسه الشرارة)' : own[k] ? '' : '، السعر ' + list[k].price));
      });
    });
    chip('shopCoins', save.coins);
    dirty = true;
  }
  function openShop() { J.select(); refreshShop(); setScreen('shop'); }
  function buy(kind, k, el) {
    const did = SH.buy(save, kind, k);
    if (!did) { J.error(); wiggle(el); return; }
    persist();
    if (did === 'bought') {
      J.coin(3); J.levelUp();
      const r = el.getBoundingClientRect();
      fx.burst((r.left + r.width / 2 - ptr.l) * ptr.s, (r.top + r.height / 3 - ptr.t) * ptr.s, { count: 30, colors: ['#ffd23f', '#ffffff', '#3df0ff'], speed: 340, life: 0.8, size: 8, gravity: 300 });
    } else J.tap();
    refreshShop();
  }

  /* --------------------------------------------------------------- play */
  // The difficulty is read at every level start and handed to the engine as numbers.
  function params() {
    const E = SH.EASY, D = SH.HARD;
    return { width: dda.value(E.width, D.width), speed: dda.value(E.speed, D.speed), spacing: dda.value(E.spacing, D.spacing), open: dda.value(E.open, D.open) };
  }
  let doorIcons = [], carryIcons = [], swBadges = [];
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
    hudW = null;
    // Where the "how to open" picture of each door goes: beside the track, with room.
    doorIcons = L.gates.map(d => spotBeside(L, d, d.half + 46));
    carryIcons = L.carry.map(c => { const p = SH.at(L, c[0]); return spotBeside(L, p, p.hw + 44); });
    swBadges = L.switches.map(sw => sw.dur > 0 ? spotBeside(L, { x: sw.gx, y: sw.gy, nx: sw.gnx, ny: sw.gny }, sw.ghw + 30) : null);
    intro = 3.6;
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
    fx.clear(); trailN = 0; arcs = []; floats = []; flashes = []; cpPop = []; fly = null; hint = null;
    celebrate = 0; result = null; ptrQ.length = 0; pressQ = null; outQ = false; timers = [];
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
    ptr.down = false; ptrQ.length = 0; pressQ = null;
    setScreen('pause');
    if (own) J.back();
  }
  function resume() {
    if (screen !== 'pause') return;
    J.select();
    ptrQ.length = 0; pressQ = null; outQ = false;
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
    if (!calm()) for (let k = 0; k < 4; k++) fx.burst(e.x, e.y, { count: 24, colors: ['#ffd23f', '#fff', '#ff7ab6', '#3df0ff', '#8dff5a'], speed: 420, life: 1.1, size: 9, gravity: 380 });
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
        fx.burst(560 + i * 106, 250, { count: 18, colors: ['#ffd23f', '#fff'], speed: 300, life: 0.7, size: 8, gravity: 300 });
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
  on($('tabP0'), () => { if (mapPage !== 0) { J.tap(); setMapPage(0); } });
  on($('tabP1'), () => { if (mapPage !== 1) { J.tap(); setMapPage(1); } });
  on($('shopBack'), () => { J.back(); toTitle(); });
  on($('btnPause'), () => pause(true));
  on($('btnResume'), resume);
  on($('btnRestart'), restart);
  on($('btnMap'), () => { J.back(); toMap(); });
  on($('resNext'), resultNext);
  on($('resAgain'), resultAgain);
  on($('resMap'), () => { if (resultLock <= 0) { J.back(); toMap(); } });

  function setPtr(e, q) {
    const x = (e.clientX - ptr.l) * ptr.s, y = (e.clientY - ptr.t) * ptr.s, ok = x >= 0 && x <= W && y >= 0 && y <= H;
    if (q) {
      if (ok) { const s = ptrQ.length > 95 ? ptrQ.shift() : (ptr.r[ptr.h = (ptr.h + 1) & 255] || (ptr.r[ptr.h] = [0, 0])); s[0] = x; s[1] = y; ptrQ.push(s); }
      else outQ = true;
    } else { ptr.x = x; ptr.y = y; ptr.inside = ok; }
  }
  // Every pointer position (the coalesced ones too) is queued: the spark follows the
  // hand's own path, not a straight line to wherever the pointer is at the next frame.
  window.addEventListener('pointermove', e => {
    if (screen === 'play') {
      const list = e.getCoalescedEvents && e.getCoalescedEvents();
      if (list && list.length) for (let i = 0; i < list.length; i++) setPtr(list[i], 1);
      else setPtr(e, 1);
    }
    setPtr(e);
    if (!ptr.inside) outQ = true;
    // A button let go outside the window.
    if (ptr.down && e.buttons === 0) ptr.down = false;
    coach.idle = Math.min(coach.idle, 0.5);
  }, { passive: true });
  canvas.addEventListener('pointerdown', e => {
    focusGame();
    if (e.button !== 0) return;
    setPtr(e); ptr.down = true;
    if (screen === 'play') pressQ = { x: ptr.x, y: ptr.y };
  });
  window.addEventListener('pointerup', e => { if (e.button === 0) ptr.down = false; });
  window.addEventListener('pointercancel', () => { ptr.down = false; outQ = true; });
  // Leaving the game's picture (or the window) drops the spark where it is: safe.
  canvas.addEventListener('pointerleave', () => { ptr.inside = false; outQ = true; });
  window.addEventListener('pointerout', e => { if (!e.relatedTarget) { ptr.inside = false; outQ = true; } });

  function handleKeys() {
    const K = Kit.keys, go = K.anyPressed(KEYS_GO);
    if (screen === 'title') { if (go) play(); }
    else if (screen === 'map') {
      if (go) { J.select(); startLevel(SH.nextLevel(save)); }
      else if (K.anyPressed(['ArrowLeft', 'KeyA']) && mapPage === 0) { J.tap(); setMapPage(1); }
      else if (K.anyPressed(['ArrowRight', 'KeyD']) && mapPage === 1) { J.tap(); setMapPage(0); }
      else if (K.pressed('Escape')) { J.back(); toTitle(); }
    }
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
          fx.burst(e.hx, e.hy, { count: 16, colors: ['#fff', '#fff3a8', A.HOT], speed: 260, life: 0.45, size: 5, gravity: 0 });
          float(e.hx, e.hy - 40, SILLY[world.touches % SILLY.length], '#ffe3ea', 42);
          flashes.push({ x: e.hx, y: e.hy, t: 0 });
          trailN = 0;
          later(0.3, () => J.whoosh(0.35));
          break;
        case 'cp': {
          const cp = L.cps[e.i];
          Kit.track.hit();
          J.chime(1); cpPop[e.i] = 1;
          fx.burst(cp.lx, cp.ly - 6, { count: 14, colors: ['#ffd23f', '#fff'], speed: 200, life: 0.6, size: 6, gravity: 200 });
          break;
        }
        case 'coin':
          J.coin(world.got);
          fx.burst(e.x, e.y, { count: 18, colors: ['#ffd23f', '#fff', '#ffb800'], speed: 260, life: 0.6, size: 6, gravity: 250 });
          float(e.x, e.y - 30, '+1', '#ffd23f', 34);
          break;
        case 'switch':
          J.chime(2);
          fx.burst(e.x, e.y, { count: 16, colors: ['#2ee8a5', '#38c7ff', '#fff'], speed: 240, life: 0.55, size: 6, gravity: 160 });
          fx.burst(e.gx, e.gy, { count: 12, colors: ['#2ee8a5', '#fff'], speed: 200, life: 0.45, size: 5, gravity: 120 });
          if (hint && hint.kind === 'sw' && hint.i === e.i) hint = null;
          break;
        case 'swshut': J.toggle(false); break;
        case 'swblock': J.land(0.35); hint = { kind: 'sw', t: 0, i: e.sw }; break;
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
      ptrQ.length = 0; pressQ = null; outQ = false;
      celebrate -= dt;
      if (celebrate <= 0) showResult();
      return;
    }
    // A click (or Space / Enter) opens the doors.
    SH.step(world, dt, { pts: ptrQ, down: ptr.down, press: pressQ, x: ptr.inside ? ptr.x : null, y: ptr.inside ? ptr.y : null,
      door: K.anyPressed(KEYS_GO) || !!pressQ, out: outQ });
    ptrQ.length = 0; pressQ = null; outQ = false;
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
    let w = 0;
    for (let i = 0; i < trailN; i++) { const p = trail[i]; if ((p.t += dt) <= p.life) { trail[i] = trail[w]; trail[w++] = p; } }
    trailN = w;
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
      const p = trailN < 70 ? (trail[trailN++] || (trail[trailN - 1] = {})) : (trail.push(trail.shift()), trail[69]);
      p.x = x - (x - lastX) * 0.5 + (Math.random() - 0.5) * 6;
      p.y = y - (y - lastY) * 0.5 + (Math.random() - 0.5) * 6;
      p.t = 0; p.life = 0.5; p.r = 3 + Math.random() * 2.5; p.rot = Math.random() * 6; p.hue = time * 300;
    }
    lastX = x; lastY = y;
  }
  function update(dt) {
    time += dt;
    handleKeys();
    if (screen === 'play' && world) { playStep(dt); trailStep(dt); }
    else { ptrQ.length = 0; pressQ = null; outQ = false; }
    if (screen !== 'pause') {
      if (fx.list.length || shake.power) dirty = true;
      fx.update(dt); shake.update(dt); decay(dt);
      if (fx.list.length > 300) fx.list.splice(0, fx.list.length - 300);
      if (screen === 'result' && result) resultStep(dt);
      if (resultLock > 0) resultLock -= dt;
    }
    Kit.keys.endFrame();
  }

  /* --------------------------------------------------------------- render */
  const trailColor = (kind, col, hue) => kind === 4 ? 'hsl(' + Math.round(hue % 360) + ',95%,65%)' : kind === 1 ? '#fff3a8' : kind === 2 ? '#ff7ab6' : col.body;
  function drawTrail(ctx, col) {
    const kind = save.trail;
    if (!kind && trailN) {
      const gs = A.glowSprite(col.glow), op = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < trailN; i++) {
        const p = trail[i], k = 1 - p.t / p.life, r = p.r * 4 * k + 2;
        ctx.globalAlpha = k * 0.9; ctx.drawImage(gs, p.x - r, p.y - r, r * 2, r * 2);
      }
      ctx.globalCompositeOperation = op;
    }
    for (let i = 0; i < trailN; i++) {
      const p = trail[i], k = 1 - p.t / p.life;
      ctx.globalAlpha = k;
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
  const setBg = src => { if (bgSrc !== src) { bgSrc = src; bgCtx.drawImage(src, 0, 0, bg.width, bg.height); } }, pic = A.pic;
  let doorC = null, doorPs = 0, hudC = null, hudKey = '', introC = null, introKey = '';
  function drawWorld(ctx) {
    const L = world.L, still = calm(), t = world.t, ps = pixelScale();
    setBg(A.track(L, ps));
    A.pulses(ctx, L, t);
    L.cps.forEach((cp, i) => A.lantern(ctx, cp, i <= world.cp, time, still, cpPop[i]));
    L.coins.forEach((c, i) => { if (!world.coins[i]) A.coin(ctx, c.x, c.y, time, still); });
    L.carry.forEach((c, i) => { const p = carryIcons[i]; if (p) A.mouseIcon(ctx, p.x, p.y, 0.75 + (still ? 0 : 0.05 * Math.sin(time * 5)), true, '#ffbe3c'); });
    L.switches.forEach((sw, i) => A.swPad(ctx, sw, world.switches[i], i, time, still, hint && hint.kind === 'sw' && hint.i === i));
    L.gates.forEach((d, i) => {
      const a = world.gates[i].a;
      A.door(ctx, d, a, time, still);
      if (a < 0.5 && doorIcons[i]) doorHint(ctx, doorIcons[i], hint && hint.kind === 'door' && hint.i === i ? 1.25 : 1, still, ps);
    });
    L.switches.forEach((sw, i) => A.swDoor(ctx, sw, world.switches[i], i, time, still, swBadges[i]));
    L.obs.forEach(o => { if (o.k === 'slide') A.slide(ctx, o, t); else if (o.k === 'orb') A.orb(ctx, o, t, still); else A.spin(ctx, o, t); });
    A.bulb(ctx, L.end.x, L.end.y, Math.max(24, L.end.hw * 0.62), L.end.tx, L.end.ty, world.done, time, still);
    drawTrail(ctx, SH.COLORS[save.color]);
    if (coach.on) drawCoach(ctx, still);
    drawSpark(ctx, still);
    drawFx(ctx, still);
    drawHud(ctx, still, ps);
  }
  function doorHint(ctx, p, k, still, ps) {
    if (!doorC || doorPs !== ps) {
      let g; [doorC, g] = pic(doorC, 148, 76, doorPs = ps);
      g.translate(74, 38);
      A.rr(g, -70, -34, 140, 68, 22); g.fillStyle = 'rgba(10,14,44,0.82)'; g.fill(); g.lineWidth = 3; g.strokeStyle = '#ff9f1c'; g.stroke();
      A.mouseIcon(g, -40, 4, 0.5, true, '#ff9f1c');
      A.keycap(g, 24, 6, 'مسافة', 78);
    }
    const b = still ? 0 : Math.sin(time * 5) * 3;
    ctx.drawImage(doorC, p.x - 74 * k, p.y + b - 38 * k, 148 * k, 76 * k);
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
  function drawHud(ctx, still, ps) {
    const L = world.L, wd = SH.WORLDS[L.world], mode = L.mode === 'drag' ? 'اضغط واسحب' : 'بلا ضغط', par = '/' + L.par;
    const mW = (n, s) => (ctx.font = hudFont(n), ctx.measureText(s).width);
    if (!hudW) hudW = [mW(20, par), mW(34, L.R.name), mW(26, mode)];
    // The pill at the top, read right to left: the level, wall-touch misses (red hazard badge),
    // the coins, and the clock (green while the time star can still be won). Cached between ticks.
    const x0 = 374, w = 532, R = x0 + w, late = world.clock > L.par, tx = R - 384, sec = Math.floor(world.clock);
    const hk = ps + '|' + L.i + '|' + world.touches + '|' + world.got + '|' + sec + '|' + (late ? 1 : 0);
    if (hudKey !== hk) {
      let g; [hudC, g] = pic(hudC, 540, 66, ps); hudKey = hk;
      g.translate(-370, -6);
      A.rr(g, x0, 10, w, 58, 29); g.fillStyle = 'rgba(10,14,44,0.88)'; g.fill(); g.lineWidth = 4; g.strokeStyle = wd.color; g.stroke();
      A.rr(g, R - 92, 16, 84, 46, 23); g.fillStyle = wd.color; g.fill();
      A.text(g, L.R.id, R - 50, 40, L.R.id.length > 3 ? 25 : 30, A.INK, { stroke: false });
      // Red/coral hazard pill for wall touches so kids never mistake it for collectible energy.
      A.rr(g, R - 230, 18, 128, 42, 21);
      g.fillStyle = world.touches ? 'rgba(255,77,122,0.34)' : 'rgba(255,77,122,0.16)'; g.fill();
      g.lineWidth = 2.5; g.strokeStyle = A.HOT; g.stroke();
      A.circle(g, R - 122, 39, 13); g.fillStyle = A.HOT; g.fill(); g.lineWidth = 2.5; g.strokeStyle = '#fff'; g.stroke();
      g.beginPath(); g.moveTo(R - 127, 34); g.lineTo(R - 117, 44); g.moveTo(R - 117, 34); g.lineTo(R - 127, 44);
      g.lineWidth = 3.5; g.lineCap = 'round'; g.strokeStyle = '#fff'; g.stroke();
      A.text(g, String(world.touches), R - 142, 40, 26, world.touches ? '#ffd1dd' : '#fff', { align: 'right', stroke: false });
      A.text(g, 'أخطاء', R - 166, 40, 17, '#ffb3c6', { align: 'right', stroke: false });
      if (L.coins.length) {
        A.coin(g, R - 262, 39, 0, true);
        A.text(g, world.got + '/' + L.coins.length, R - 284, 40, 28, '#ffe98a', { align: 'right', stroke: false });
      }
      A.circle(g, tx, 39, 15); g.fillStyle = late ? '#8a90b8' : '#3ddc84'; g.fill(); g.lineWidth = 3; g.strokeStyle = '#fff'; g.stroke();
      g.textAlign = 'right'; g.textBaseline = 'middle'; g.direction = 'ltr';
      g.font = hudFont(20); g.fillStyle = 'rgba(255,255,255,0.62)'; g.fillText(par, tx - 22, 44);
      g.font = hudFont(28); g.fillStyle = late ? '#9aa0c8' : '#fff'; g.fillText(String(sec), tx - 24 - hudW[0], 41);
    }
    ctx.drawImage(hudC, 370, 6, 540, 66);
    const ang = -Math.PI / 2 + Math.min(1, world.clock / L.par) * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(tx, 39); ctx.lineTo(tx + Math.cos(ang) * 10, 39 + Math.sin(ang) * 10); ctx.lineWidth = 3; ctx.strokeStyle = A.INK; ctx.stroke();
    // The level's name and how it is played, crisp high-contrast before smoothly fading out.
    if (intro > 0 && !world.done) {
      const bw = Math.ceil(hudW[1] + hudW[2] + 148), bx = 640 - bw / 2, ik = ps + '|' + L.i + '|' + bw;
      if (introKey !== ik) {
        let g; [introC, g] = pic(introC, bw + 8, 76, ps); introKey = ik;
        g.translate(4 - bx, 38);
        A.rr(g, bx, -31, bw, 62, 31); g.fillStyle = 'rgba(12,18,58,0.95)'; g.fill(); g.lineWidth = 4; g.strokeStyle = wd.color; g.stroke();
        A.text(g, L.R.name, bx + bw - 30, 1, 32, '#fff', { stroke: false, align: 'right' });
        A.circle(g, bx + bw - 50 - hudW[1], 1, 3.5); g.fillStyle = 'rgba(255,255,255,0.5)'; g.fill();
        A.text(g, mode, bx + bw - 70 - hudW[1], 1, 26, L.mode === 'drag' ? '#ffe14d' : '#8dff5a', { stroke: false, align: 'right' });
        A.mouseIcon(g, bx + 42, 4, 0.55, L.mode === 'drag', '#ffe14d');
      }
      const a = Math.min(1, intro / 0.35, (3.6 - intro) / 0.2 + 0.2);
      ctx.globalAlpha = clamp(a, 0, 1);
      ctx.drawImage(introC, bx - 4, 74 + (still ? 0 : Math.max(0, intro - 3.35) * 60), bw + 8, 76);
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
      setBg(A.track(titleL, ps));
      const s = still ? titleL.len * 0.45 : (time * 170) % (titleL.len + 300) - 150, p = SH.at(titleL, clamp(s, 20, titleL.len - 20));
      A.bulb(ctx, titleL.end.x, titleL.end.y, 22, titleL.end.tx, titleL.end.ty, s >= titleL.len - 25, time, still);
      A.spark(ctx, p.x, p.y, { col: SH.COLORS[save.color], t: time, still: still, face: 'happy', lx: 1 });
    } else {
      const nextW = Math.floor(SH.nextLevel(save) / 6);
      const mapW = clamp(mapPage * PAGE_WORLDS + clamp(nextW - mapPage * PAGE_WORLDS, 0, PAGE_WORLDS - 1), 0, SH.WORLDS.length - 1);
      setBg(A.backdrop(screen === 'map' ? mapW : 3, ps));
    }
    fx.draw(ctx);
  }
  function render() {
    if (!dirty && (screen === 'pause' || screen === 'map' || screen === 'shop' || (screen === 'title' && calm()))) return;
    dirty = false;
    const ctx = view.ctx, sh = shake.power > 0;
    if (sh || shOn) { shOn = sh; bg.style.translate = sh ? (shake.x * view.scale).toFixed(1) + 'px ' + (shake.y * view.scale).toFixed(1) + 'px' : ''; }
    ctx.clearRect(0, 0, W, H);
    if (sh) { ctx.save(); ctx.translate(shake.x, shake.y); }
    if (world && (screen === 'play' || screen === 'pause' || screen === 'result')) drawWorld(ctx);
    else drawMenu(ctx);
    if (sh) ctx.restore();
  }

  const flushPics = () => { hudW = doorC = null; hudKey = introKey = ''; dirty = true; if (screen === 'shop') refreshShop(); };
  [canvas, bg].forEach(el => el.addEventListener('contextrestored', () => { A.reset(); bgSrc = null; flushPics(); }));
  if (document.fonts && document.fonts.load) {
    // Text drawn into cached pictures is drawn again once the font is there.
    document.fonts.load('700 40px Fredoka', 'سلك 5').then(flushPics, () => { /* fallback fonts */ });
  }

  /* --------------------------------------------------- test and debug hook */
  const page = (x, y) => { const r = canvas.getBoundingClientRect(); return { x: r.left + x * view.scale, y: r.top + y * view.scale }; };
  const r1 = v => Math.round(v * 10) / 10;
  window.__game = {
    get state() {
      const w = world;
      return {
        screen: screen, paused: screen === 'pause', mapPage: mapPage, level: cur, id: w ? w.L.R.id : '', mode: w ? w.L.mode : '',
        held: !!(w && w.held), spark: w ? { x: r1(w.x), y: r1(w.y) } : null, touches: w ? w.touches : 0, cp: w ? w.cp : -1,
        best: w ? r1(w.best) : 0, progress: w ? Math.round(w.best / w.L.len * 1000) / 1000 : 0, coins: w ? w.got : 0,
        done: !!(w && w.done), time: w ? Math.round(w.t * 1000) / 1000 : 0, clock: w ? Math.round(w.clock * 100) / 100 : 0,
        dragged: w ? r1(w.dragged) : 0, grabs: w ? w.grabs : 0, stun: w ? w.stun : 0, doors: w ? w.gates.map(g => Math.round(g.a * 100) / 100) : [],
        switches: w ? w.switches.map(sw => ({ on: sw.on, a: Math.round(sw.a * 100) / 100, left: Math.round(sw.left * 100) / 100 })) : [],
        width: w ? Math.round(w.L.P.width * 1000) / 1000 : 0, tier: dda.tier, trail: trailN, fx: fx.list.length, shake: shake.power,
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
        switches: L.switches.map(sw => ({ s: sw.s, x: sw.x, y: sw.y, gs: sw.gs, gx: sw.gx, gy: sw.gy, dur: sw.dur })),
        parts: L.obs.map(o => ({ k: o.k, s: o.s, zone: o.zone })), coins: L.coins.map(c => ({ x: c.x, y: c.y, s: c.s })), carry: L.carry };
    }
  };

  Kit.muteButton();
  Kit.lifecycle({ pause: () => pause(false), reset: () => { ptr.down = false; pressQ = null; ptrQ.length = 0; dropSpark('focus'); } });
  toTitle();
  Kit.loop(update, render);
  Kit.ready();
})();
